//! Static StyleX frontend.
//!
//! This reads one useful vertical slice rather than impersonating the full
//! StyleX compiler: same-file namespace imports, `stylex.create({ ... })`,
//! and `stylex.props(styles.base, condition && styles.active)`. Values become
//! the typed `StyleProperty` variants the Tailwind frontend already produces,
//! so the Web and Native lowerings remain shared.

use std::collections::{HashMap, HashSet};

use hozo_ir::{
    Angle, Color, Condition, ConditionExpr, Dimension, Edge, ExprRef, FontWeight, GridLine, GridSpan,
    GridTracks, Length, Origin, Overflow, Radius, SourceSpan, StyleDeclaration, StyleProperty,
    StylexResidual, StylexResidualArgument, TextOverflow, TransformFunction, WhiteSpace,
};
use oxc_ast::ast::{
    Argument, ArrayExpressionElement, ArrowFunctionExpression, BindingPattern, CallExpression,
    Expression, Function, IdentifierReference, LogicalOperator, ObjectExpression,
    ObjectPropertyKind, PropertyKey, Statement, VariableDeclarationKind, VariableDeclarator,
};
use oxc_ast_visit::{
    walk::{
        walk_arrow_function_expression, walk_function, walk_object_expression,
        walk_variable_declarator,
    },
    Visit,
};
use oxc_span::{GetSpan, Span};
use oxc_syntax::module_record::ModuleRecord;
use oxc_syntax::scope::ScopeFlags;

use crate::tailwind;

const STYLEX_MODULE: &str = "@stylexjs/stylex";

#[derive(Debug, Clone)]
pub(crate) struct Gap {
    pub(crate) message: String,
    pub(crate) span: SourceSpan,
}

#[derive(Debug, Clone)]
enum Rule {
    Ready {
        entries: Vec<Entry>,
        residual: Vec<ResidualProperty>,
        gaps: Vec<Gap>,
    },
    Gap(Gap),
}

#[derive(Debug, Clone)]
struct ResidualProperty {
    css_name: String,
    span: ExprRef,
}

#[derive(Debug, Clone)]
struct Entry {
    css_name: String,
    priority: u16,
    properties: Vec<StyleProperty>,
    span: SourceSpan,
}

struct ResolvedEntry {
    css_name: String,
    priority: u16,
    declaration: StyleDeclaration,
}

#[derive(Default)]
pub(crate) struct Frontend {
    namespaces: HashSet<String>,
    sheets: HashMap<String, HashMap<String, Rule>>,
    /// StyleX definitions are not Tailwind candidate strings. The fallback
    /// scanner is intentionally broad, so it needs these exact ranges to
    /// avoid turning values such as `display: 'flex'` into duplicate CSS.
    pub(crate) scan_spans: Vec<SourceSpan>,
}

pub(crate) enum Resolution {
    NotStylex,
    Ready(Vec<StyleDeclaration>),
    Partial {
        declarations: Vec<StyleDeclaration>,
        residual: StylexResidual,
        gaps: Vec<Gap>,
    },
    Gap { message: String, span: SourceSpan },
}

fn source_span(span: Span) -> SourceSpan {
    SourceSpan {
        start: span.start,
        end: span.end,
    }
}

fn static_key(key: &PropertyKey) -> Option<String> {
    match key {
        PropertyKey::StaticIdentifier(identifier) => Some(identifier.name.to_string()),
        PropertyKey::StringLiteral(literal) => Some(literal.value.to_string()),
        _ => None,
    }
}

fn numeric_text(value: f64) -> String {
    if value.fract() == 0.0 {
        format!("{value:.0}")
    } else {
        value.to_string()
    }
}

enum StaticValue {
    String(String),
    Number(f64),
}

fn static_value(expression: &Expression) -> Option<StaticValue> {
    match expression {
        Expression::StringLiteral(literal) => Some(StaticValue::String(literal.value.to_string())),
        Expression::NumericLiteral(literal) => Some(StaticValue::Number(literal.value)),
        Expression::UnaryExpression(unary)
            if unary.operator == oxc_syntax::operator::UnaryOperator::UnaryNegation =>
        {
            match &unary.argument {
                Expression::NumericLiteral(literal) => Some(StaticValue::Number(-literal.value)),
                _ => None,
            }
        }
        _ => None,
    }
}

fn raw_value(value: &StaticValue) -> String {
    match value {
        StaticValue::String(value) => value.clone(),
        StaticValue::Number(value) => numeric_text(*value),
    }
}

fn length_value(value: &StaticValue) -> String {
    match value {
        StaticValue::String(value) => value.clone(),
        StaticValue::Number(value) => format!("{}px", numeric_text(*value)),
    }
}

fn px_length(value: &StaticValue) -> Option<Length> {
    match value {
        StaticValue::Number(value) => Some(Length::Px(*value)),
        StaticValue::String(value) if value == "0" => Some(Length::Px(0.0)),
        StaticValue::String(value) => value
            .strip_suffix("px")
            .and_then(|value| value.parse::<f64>().ok())
            .map(Length::Px),
    }
}

fn dimension(value: &StaticValue) -> Option<Dimension> {
    match value {
        StaticValue::Number(value) => Some(Dimension::Length(Length::Px(*value))),
        StaticValue::String(value) if value == "auto" => Some(Dimension::Auto),
        StaticValue::String(value) => value
            .strip_suffix('%')
            .and_then(|value| value.parse::<f64>().ok())
            .map(Dimension::Percent)
            .or_else(|| {
                if value == "0" {
                    return Some(Dimension::Length(Length::Px(0.0)));
                }
                value
                    .strip_suffix("px")
                    .and_then(|value| value.parse::<f64>().ok())
                    .map(|value| Dimension::Length(Length::Px(value)))
            }),
    }
}

fn css_color(value: &StaticValue) -> Option<Color> {
    let StaticValue::String(value) = value else {
        return None;
    };
    (!value.is_empty() && !value.contains("var(") && !value.contains("env("))
        .then(|| Color::Css(value.clone()))
}

/// One container name the Native runtime can register under its context.
///
/// CSS accepts a whitespace-separated list of custom identifiers, but the
/// existing Hozo container runtime deliberately has one lookup key. Keep a
/// wider StyleX value with the official transform rather than registering a
/// string no Native query could faithfully address.
fn stylex_container_name(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else {
        return None;
    };
    let mut bytes = value.bytes();
    match bytes.next()? {
        first if first.is_ascii_alphabetic() || first == b'_' => {}
        b'-' => {
            let second = bytes.next()?;
            if !second.is_ascii_alphabetic() && !matches!(second, b'_' | b'-') {
                return None;
            }
        }
        _ => return None,
    }
    let reserved = value.to_ascii_lowercase();
    if !bytes.all(|character| character.is_ascii_alphanumeric() || matches!(character, b'_' | b'-'))
        || matches!(
            reserved.as_str(),
            "none" | "default" | "initial" | "inherit" | "unset" | "revert" | "revert-layer"
        )
    {
        return None;
    }
    Some(value.clone())
}

fn stylex_container_type(value: &StaticValue) -> Option<&'static str> {
    let StaticValue::String(value) = value else {
        return None;
    };
    match value.as_str() {
        "normal" => Some("normal"),
        "size" => Some("size"),
        "inline-size" => Some("inline-size"),
        _ => None,
    }
}

fn stylex_grid_tracks(value: &StaticValue) -> Option<GridTracks> {
    let StaticValue::String(value) = value else {
        return None;
    };
    let value = value.trim();
    let compact = value
        .chars()
        .filter(|character| !character.is_whitespace())
        .collect::<String>();
    if let Some(inner) = compact
        .strip_prefix("repeat(")
        .and_then(|value| value.strip_suffix(",minmax(0,1fr))"))
    {
        let count = inner.parse::<u32>().ok()?;
        return (count > 0)
            .then(|| GridTracks::Css(format!("repeat({count},minmax(0,1fr))")));
    }

    // StyleX removes whitespace around commas inside functions but keeps
    // whitespace between tracks. Match that CSS while accepting the usual
    // authored spelling (`minmax(120px, 2fr) 1fr`).
    let mut normalized = String::new();
    let characters = value.chars().collect::<Vec<_>>();
    let mut index = 0;
    while index < characters.len() {
        let character = characters[index];
        if character.is_whitespace() {
            let previous = normalized.chars().next_back();
            let next = characters[index + 1..]
                .iter()
                .copied()
                .find(|character| !character.is_whitespace());
            if !matches!(previous, Some('(' | ','))
                && !matches!(next, Some(')' | ','))
                && !normalized.ends_with(' ')
            {
                normalized.push(' ');
            }
            index += 1;
            continue;
        }
        normalized.push(character);
        index += 1;
    }
    let valid = normalized.split_whitespace().all(|track| {
        if let Some(inner) = track
            .strip_prefix("minmax(")
            .and_then(|value| value.strip_suffix(')'))
        {
            let Some((min, max)) = inner.split_once(',') else {
                return false;
            };
            let Some(min) = min
                .strip_suffix("px")
                .and_then(|value| value.parse::<f64>().ok())
            else {
                return false;
            };
            let Some(fr) = max
                .strip_suffix("fr")
                .and_then(|value| value.parse::<f64>().ok())
            else {
                return false;
            };
            return min.is_finite() && min >= 0.0 && fr.is_finite() && fr > 0.0;
        }
        if let Some(fr) = track
            .strip_suffix("fr")
            .and_then(|value| value.parse::<f64>().ok())
        {
            return fr.is_finite() && fr > 0.0;
        }
        if let Some(points) = track
            .strip_suffix("px")
            .and_then(|value| value.parse::<f64>().ok())
        {
            return points.is_finite() && points >= 0.0;
        }
        false
    });
    (valid && !normalized.is_empty()).then_some(GridTracks::Css(normalized))
}

fn stylex_grid_line(value: &StaticValue) -> Option<GridLine> {
    match value {
        StaticValue::String(value) if value.trim() == "auto" => Some(GridLine::Auto),
        StaticValue::String(value) => value
            .trim()
            .parse::<i32>()
            .ok()
            .filter(|line| *line != 0)
            .map(GridLine::Line),
        StaticValue::Number(value)
            if value.is_finite()
                && value.fract() == 0.0
                && *value >= i32::MIN as f64
                && *value <= i32::MAX as f64
                && *value != 0.0 =>
        {
            Some(GridLine::Line(*value as i32))
        }
        _ => None,
    }
}

fn stylex_grid_span(value: &StaticValue) -> Option<GridSpan> {
    let StaticValue::String(value) = value else {
        return None;
    };
    let value = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if value == "auto" {
        return Some(GridSpan::Auto);
    }
    if value == "1 / -1" {
        return Some(GridSpan::Full);
    }
    let (start, end) = value.split_once(" / ")?;
    let start = start.strip_prefix("span ")?.parse::<u32>().ok()?;
    let end = end.strip_prefix("span ")?.parse::<u32>().ok()?;
    (start > 0 && start == end).then_some(GridSpan::Span(start))
}

fn transform_angle(value: &str) -> Option<Angle> {
    if value == "0" {
        return Some(Angle::Deg(0.0));
    }
    value.strip_suffix("deg")
        .and_then(|value| value.parse::<f64>().ok())
        .filter(|value| value.is_finite())
        .map(Angle::Deg)
}

fn transform_dimension(value: &str) -> Option<Dimension> {
    match dimension(&StaticValue::String(value.to_string()))? {
        value @ (Dimension::Length(_) | Dimension::Percent(_)) => Some(value),
        _ => None,
    }
}

fn transform_arguments(value: &str) -> Vec<&str> {
    if value.contains(',') {
        value.split(',').map(str::trim).filter(|value| !value.is_empty()).collect()
    } else {
        value.split_whitespace().collect()
    }
}

/// Parse only functions React Native's public transform array can represent.
fn transform_functions(value: &StaticValue) -> Option<Vec<TransformFunction>> {
    let StaticValue::String(value) = value else { return None };
    let mut rest = value.trim();
    if rest == "none" {
        return Some(Vec::new());
    }
    let mut functions = Vec::new();
    while !rest.is_empty() {
        let open = rest.find('(')?;
        let name = rest[..open].trim();
        if name.is_empty() || !name.chars().all(|character| character.is_ascii_alphanumeric()) {
            return None;
        }
        let tail = &rest[open + 1..];
        let close = tail.find(')')?;
        if tail[..close].contains('(') {
            return None;
        }
        let arguments = transform_arguments(tail[..close].trim());
        let number = |value: &str| value.parse::<f64>().ok().filter(|value| value.is_finite());
        let one = || (arguments.len() == 1).then_some(arguments[0]);
        match name {
            "perspective" => functions.push(TransformFunction::Perspective(px_length(
                &StaticValue::String(one()?.to_string()),
            )?)),
            "rotate" => functions.push(TransformFunction::Rotate(transform_angle(one()?)?)),
            "rotateX" => functions.push(TransformFunction::RotateX(transform_angle(one()?)?)),
            "rotateY" => functions.push(TransformFunction::RotateY(transform_angle(one()?)?)),
            "rotateZ" => functions.push(TransformFunction::RotateZ(transform_angle(one()?)?)),
            "scale" if arguments.len() == 1 => functions.push(TransformFunction::Scale(number(arguments[0])?)),
            "scale" if arguments.len() == 2 => {
                functions.push(TransformFunction::ScaleX(number(arguments[0])?));
                functions.push(TransformFunction::ScaleY(number(arguments[1])?));
            }
            "scaleX" => functions.push(TransformFunction::ScaleX(number(one()?)?)),
            "scaleY" => functions.push(TransformFunction::ScaleY(number(one()?)?)),
            "translate" if arguments.len() == 1 || arguments.len() == 2 => {
                functions.push(TransformFunction::TranslateX(transform_dimension(arguments[0])?));
                if arguments.len() == 2 {
                    functions.push(TransformFunction::TranslateY(transform_dimension(arguments[1])?));
                }
            }
            "translateX" => functions.push(TransformFunction::TranslateX(transform_dimension(one()?)?)),
            "translateY" => functions.push(TransformFunction::TranslateY(transform_dimension(one()?)?)),
            "skewX" => functions.push(TransformFunction::SkewX(transform_angle(one()?)?)),
            "skewY" => functions.push(TransformFunction::SkewY(transform_angle(one()?)?)),
            _ => return None,
        }
        rest = tail[close + 1..].trim_start();
    }
    (!functions.is_empty()).then_some(functions)
}

fn transform_origin(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else { return None };
    let parts: Vec<_> = value.split_whitespace().collect();
    if !(1..=3).contains(&parts.len()) {
        return None;
    }
    let valid = |part: &str| {
        matches!(part, "left" | "center" | "right" | "top" | "bottom")
            || transform_dimension(part).is_some()
    };
    parts.iter().all(|part| valid(part)).then(|| parts.join(" "))
}

/// Variables, fallbacks, and values needing escaping belong with the later
/// defineVars/theme slice. Refusing them is safer than lossy underscore
/// encoding that merely looks supported.
fn safe_arbitrary(value: String) -> Option<String> {
    (!value.is_empty()
        && !value.chars().any(char::is_whitespace)
        && !value.contains(['[', ']'])
        && !value.contains("var(")
        && !value.contains("env("))
    .then_some(value)
}

fn named(value: &StaticValue, choices: &[(&str, &str)]) -> Option<String> {
    let StaticValue::String(value) = value else {
        return None;
    };
    choices
        .iter()
        .find(|(name, _)| *name == value)
        .map(|(_, token)| (*token).to_string())
}

/// Closed-keyword declarations from StyleX's published CSSProperties that
/// have no React Native style key. Values outside this deliberately small
/// grammar remain with the official StyleX transform.
fn web_only_keyword(property: &str, value: &StaticValue) -> Option<StyleProperty> {
    let StaticValue::String(value) = value else {
        return None;
    };
    let (css_property, choices): (&str, &[&str]) = match property {
        "appearance" => ("appearance", &["auto", "none", "textfield"]),
        "WebkitAppearance" => ("-webkit-appearance", &["auto", "none", "textfield"]),
        "colorScheme" => (
            "color-scheme",
            &["normal", "light", "dark", "light dark", "only light", "only dark"],
        ),
        "forcedColorAdjust" => ("forced-color-adjust", &["auto", "none"]),
        "imageRendering" => (
            "image-rendering",
            &["auto", "crisp-edges", "pixelated", "optimizeSpeed", "optimizeQuality"],
        ),
        "overflowAnchor" => ("overflow-anchor", &["auto", "none"]),
        "overscrollBehavior" => ("overscroll-behavior", &["auto", "contain", "none"]),
        "overscrollBehaviorBlock" => {
            ("overscroll-behavior-block", &["auto", "contain", "none"])
        }
        "overscrollBehaviorInline" => {
            ("overscroll-behavior-inline", &["auto", "contain", "none"])
        }
        "overscrollBehaviorX" => ("overscroll-behavior-x", &["auto", "contain", "none"]),
        "overscrollBehaviorY" => ("overscroll-behavior-y", &["auto", "contain", "none"]),
        "printColorAdjust" => ("print-color-adjust", &["economy", "exact"]),
        "resize" => ("resize", &["none", "both", "horizontal", "vertical"]),
        "scrollSnapAlign" => ("scroll-snap-align", &["none", "start", "end", "center"]),
        "scrollSnapStop" => ("scroll-snap-stop", &["normal", "always"]),
        "scrollSnapType" => (
            "scroll-snap-type",
            &[
                "none", "block", "block mandatory", "block proximity", "both",
                "both mandatory", "both proximity", "inline", "inline mandatory",
                "inline proximity", "x", "x mandatory", "x proximity", "y",
                "y mandatory", "y proximity",
            ],
        ),
        "scrollbarGutter" => ("scrollbar-gutter", &["auto", "stable", "stable both-edges"]),
        "scrollbarWidth" => ("scrollbar-width", &["auto", "thin", "none"]),
        "textRendering" => (
            "text-rendering",
            &["auto", "optimizeSpeed", "optimizeLegibility", "geometricPrecision"],
        ),
        "touchAction" => ("touch-action", &["auto", "none", "manipulation"]),
        "wordBreak" => ("word-break", &["normal", "break-all", "keep-all", "break-word"]),
        "overflowWrap" => ("overflow-wrap", &["normal", "break-word", "anywhere"]),
        "visibility" => ("visibility", &["visible", "hidden", "collapse"]),
        "backgroundPosition" => (
            "background-position",
            &[
                "top", "right", "bottom", "left", "center", "left top", "left center",
                "left bottom", "right top", "right center", "right bottom", "center top",
                "center center", "center bottom",
            ],
        ),
        "backgroundRepeat" => ("background-repeat", &["repeat", "repeat-x", "repeat-y", "no-repeat", "space", "round"]),
        "backgroundSize" => ("background-size", &["auto", "cover", "contain"]),
        "objectPosition" => (
            "object-position",
            &[
                "top", "right", "bottom", "left", "center", "left top", "left center",
                "left bottom", "right top", "right center", "right bottom", "center top",
                "center center", "center bottom",
            ],
        ),
        "justifySelf" => (
            "justify-self",
            &["auto", "normal", "stretch", "center", "start", "end", "self-start", "self-end", "flex-start", "flex-end"],
        ),
        "placeItems" => (
            "place-items",
            &["normal", "stretch", "center", "start", "end", "baseline", "normal normal", "stretch stretch", "center center", "start start", "end end"],
        ),
        _ => return None,
    };
    choices
        .contains(&value.as_str())
        .then(|| StyleProperty::WebOnly(css_property.to_string(), value.clone()))
}

fn stylex_order(value: &StaticValue) -> Option<i32> {
    let value = match value {
        StaticValue::Number(value) if value.is_finite() && value.fract() == 0.0 => *value,
        StaticValue::String(value) => value.parse::<f64>().ok().filter(|value| value.fract() == 0.0)?,
        _ => return None,
    };
    (value >= i32::MIN as f64 && value <= i32::MAX as f64).then_some(value as i32)
}

fn stylex_overflow(value: &StaticValue) -> Option<Overflow> {
    let StaticValue::String(value) = value else { return None };
    Some(match value.as_str() {
        "visible" => Overflow::Visible,
        "hidden" => Overflow::Hidden,
        "clip" => Overflow::Css("clip"),
        "scroll" => Overflow::Scroll,
        "auto" => Overflow::Css("auto"),
        _ => return None,
    })
}

fn stylex_scroll_edge(property: &str) -> Option<Edge> {
    Some(match property {
        "scrollMarginTop" | "scrollPaddingTop" => Edge::Top,
        "scrollMarginRight" | "scrollPaddingRight" => Edge::Right,
        "scrollMarginBottom" | "scrollPaddingBottom" => Edge::Bottom,
        "scrollMarginLeft" | "scrollPaddingLeft" => Edge::Left,
        "scrollMarginBlockStart" => Edge::Top,
        "scrollMarginBlockEnd" => Edge::Bottom,
        "scrollPaddingBlockStart" => Edge::BlockStart,
        "scrollPaddingBlockEnd" => Edge::BlockEnd,
        "scrollMarginInlineStart" | "scrollPaddingInlineStart" => Edge::InlineStart,
        "scrollMarginInlineEnd" | "scrollPaddingInlineEnd" => Edge::InlineEnd,
        _ => return None,
    })
}

fn stylex_transition_property(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else { return None };
    let properties: Vec<_> = value.split(',').map(str::trim).collect();
    if properties.is_empty()
        || properties.iter().any(|property| {
            !matches!(
                *property,
                "all"
                    | "none"
                    | "opacity"
                    | "transform"
                    | "translate"
                    | "scale"
                    | "rotate"
                    | "color"
                    | "background-color"
            )
        })
        || (properties.len() > 1 && properties.iter().any(|property| matches!(*property, "all" | "none")))
    {
        return None;
    }
    Some(properties.join(","))
}

fn stylex_transition_duration(value: &StaticValue) -> Option<u32> {
    let StaticValue::String(value) = value else { return None };
    let milliseconds = if let Some(value) = value.strip_suffix("ms") {
        value.parse::<f64>().ok()?
    } else if let Some(value) = value.strip_suffix('s') {
        value.parse::<f64>().ok()? * 1000.0
    } else {
        return None;
    };
    (milliseconds.is_finite()
        && milliseconds >= 0.0
        && milliseconds.fract() == 0.0
        && milliseconds <= u32::MAX as f64)
        .then_some(milliseconds as u32)
}

fn stylex_font_weight(value: &StaticValue) -> Option<FontWeight> {
    let weight = match value {
        StaticValue::Number(value) if value.is_finite() && value.fract() == 0.0 => *value,
        StaticValue::String(value) => match value.as_str() {
            "normal" => 400.0,
            "bold" => 700.0,
            value => value.parse::<f64>().ok().filter(|value| value.fract() == 0.0)?,
        },
        _ => return None,
    };
    (weight >= 100.0 && weight <= 900.0 && weight as u16 % 100 == 0).then_some(FontWeight(weight as u16))
}

fn stylex_white_space(value: &StaticValue) -> Option<WhiteSpace> {
    let StaticValue::String(value) = value else { return None };
    Some(match value.as_str() {
        "normal" => WhiteSpace::Normal,
        "nowrap" => WhiteSpace::NoWrap,
        "pre" => WhiteSpace::Css("pre"),
        "pre-line" => WhiteSpace::Css("pre-line"),
        "pre-wrap" => WhiteSpace::Css("pre-wrap"),
        "break-spaces" => WhiteSpace::Css("break-spaces"),
        _ => return None,
    })
}

fn stylex_text_overflow(value: &StaticValue) -> Option<TextOverflow> {
    let StaticValue::String(value) = value else { return None };
    Some(match value.as_str() {
        "clip" => TextOverflow::Clip,
        "ellipsis" => TextOverflow::Ellipsis,
        _ => return None,
    })
}

fn stylex_web_only_duration(property: &'static str, value: &StaticValue) -> Option<StyleProperty> {
    let seconds = stylex_transition_duration(value)? as f64 / 1000.0;
    Some(StyleProperty::WebOnly(
        property.to_string(),
        format!("{seconds}s"),
    ))
}

fn stylex_transition_timing(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else { return None };
    matches!(value.as_str(), "linear" | "ease-in" | "ease-out" | "ease-in-out")
        .then(|| value.clone())
}

/// Maps CSS-in-JS property spelling onto the already-tested Tailwind parser.
/// The tokens are internal only; no generated class string reaches output.
fn token_for(property: &str, value: &StaticValue) -> Option<String> {
    let arbitrary = |prefix: &str, value: String| {
        safe_arbitrary(value).map(|value| format!("{prefix}-[{value}]"))
    };
    let length = |prefix: &str| arbitrary(prefix, length_value(value));
    let raw = |prefix: &str| arbitrary(prefix, raw_value(value));

    match property {
        "display" => named(
            value,
            &[
                ("none", "hidden"),
                ("flex", "flex"),
                ("block", "block"),
                ("contents", "contents"),
                ("inline-flex", "inline-flex"),
                ("grid", "grid"),
            ],
        ),
        "position" => named(
            value,
            &[
                ("static", "static"),
                ("relative", "relative"),
                ("absolute", "absolute"),
                ("fixed", "fixed"),
                ("sticky", "sticky"),
            ],
        ),
        "flexDirection" => named(
            value,
            &[
                ("row", "flex-row"),
                ("row-reverse", "flex-row-reverse"),
                ("column", "flex-col"),
                ("column-reverse", "flex-col-reverse"),
            ],
        ),
        "flexWrap" => named(
            value,
            &[
                ("nowrap", "flex-nowrap"),
                ("wrap", "flex-wrap"),
                ("wrap-reverse", "flex-wrap-reverse"),
            ],
        ),
        "alignItems" => named(
            value,
            &[
                ("flex-start", "items-start"),
                ("flex-end", "items-end"),
                ("center", "items-center"),
                ("baseline", "items-baseline"),
                ("stretch", "items-stretch"),
            ],
        ),
        "alignSelf" => named(
            value,
            &[
                ("auto", "self-auto"),
                ("flex-start", "self-start"),
                ("flex-end", "self-end"),
                ("center", "self-center"),
                ("baseline", "self-baseline"),
                ("stretch", "self-stretch"),
            ],
        ),
        "alignContent" => named(
            value,
            &[
                ("flex-start", "content-start"),
                ("flex-end", "content-end"),
                ("center", "content-center"),
                ("space-between", "content-between"),
                ("space-around", "content-around"),
                ("space-evenly", "content-evenly"),
                ("stretch", "content-stretch"),
                ("baseline", "content-baseline"),
            ],
        ),
        "justifyContent" => named(
            value,
            &[
                ("flex-start", "justify-start"),
                ("flex-end", "justify-end"),
                ("center", "justify-center"),
                ("space-between", "justify-between"),
                ("space-around", "justify-around"),
                ("space-evenly", "justify-evenly"),
            ],
        ),
        "padding" => length("p"),
        "paddingTop" => length("pt"),
        "paddingRight" => length("pr"),
        "paddingBottom" => length("pb"),
        "paddingLeft" => length("pl"),
        "paddingInlineStart" => length("ps"),
        "paddingInlineEnd" => length("pe"),
        "margin" => length("m"),
        "marginTop" => length("mt"),
        "marginRight" => length("mr"),
        "marginBottom" => length("mb"),
        "marginLeft" => length("ml"),
        "marginInlineStart" => length("ms"),
        "marginInlineEnd" => length("me"),
        "gap" => length("gap"),
        "rowGap" => length("gap-y"),
        "columnGap" => length("gap-x"),
        "width" => length("w"),
        "height" => length("h"),
        "minWidth" => length("min-w"),
        "minHeight" => length("min-h"),
        "maxWidth" => length("max-w"),
        "maxHeight" => length("max-h"),
        "top" => length("top"),
        "right" => length("right"),
        "bottom" => length("bottom"),
        "left" => length("left"),
        "backgroundColor" => raw("bg"),
        "color" => raw("text"),
        "opacity" => raw("opacity"),
        "zIndex" => raw("z"),
        "flexGrow" => raw("grow"),
        "flexShrink" => raw("shrink"),
        "flexBasis" => length("basis"),
        "borderRadius" => length("rounded"),
        "borderTopLeftRadius" => length("rounded-tl"),
        "borderTopRightRadius" => length("rounded-tr"),
        "borderBottomRightRadius" => length("rounded-br"),
        "borderBottomLeftRadius" => length("rounded-bl"),
        "borderStartStartRadius" => length("rounded-ss"),
        "borderStartEndRadius" => length("rounded-se"),
        "borderEndStartRadius" => length("rounded-es"),
        "borderEndEndRadius" => length("rounded-ee"),
        "borderStyle" => named(
            value,
            &[
                ("solid", "border-solid"),
                ("dashed", "border-dashed"),
                ("dotted", "border-dotted"),
                ("double", "border-double"),
                ("hidden", "border-hidden"),
                ("none", "border-none"),
            ],
        ),
        "aspectRatio" => named(
            value,
            &[
                ("auto", "aspect-auto"),
                ("1 / 1", "aspect-square"),
                ("16 / 9", "aspect-video"),
            ],
        ),
        "backfaceVisibility" => named(
            value,
            &[
                ("hidden", "backface-hidden"),
                ("visible", "backface-visible"),
            ],
        ),
        "boxSizing" => named(
            value,
            &[("border-box", "box-border"), ("content-box", "box-content")],
        ),
        "flex" => named(
            value,
            &[
                ("auto", "flex-auto"),
                ("initial", "flex-initial"),
                ("none", "flex-none"),
                ("1", "flex-1"),
            ],
        ),
        "fontStyle" => named(value, &[("italic", "italic"), ("normal", "not-italic")]),
        "isolation" => named(value, &[("isolate", "isolate"), ("auto", "isolation-auto")]),
        "mixBlendMode" => {
            let StaticValue::String(value) = value else {
                return None;
            };
            [
                "normal",
                "multiply",
                "screen",
                "overlay",
                "darken",
                "lighten",
                "color-dodge",
                "color-burn",
                "hard-light",
                "soft-light",
                "difference",
                "exclusion",
                "hue",
                "saturation",
                "color",
                "luminosity",
                "plus-darker",
                "plus-lighter",
            ]
            .contains(&value.as_str())
            .then(|| format!("mix-blend-{value}"))
        }
        "pointerEvents" => named(
            value,
            &[
                ("auto", "pointer-events-auto"),
                ("none", "pointer-events-none"),
            ],
        ),
        "textDecorationColor" => raw("decoration"),
        "textDecorationLine" => named(
            value,
            &[
                ("underline", "underline"),
                ("overline", "overline"),
                ("line-through", "line-through"),
                ("none", "no-underline"),
            ],
        ),
        "textDecorationStyle" => named(
            value,
            &[
                ("solid", "decoration-solid"),
                ("double", "decoration-double"),
                ("dotted", "decoration-dotted"),
                ("dashed", "decoration-dashed"),
                ("wavy", "decoration-wavy"),
            ],
        ),
        "userSelect" => named(
            value,
            &[
                ("all", "select-all"),
                ("auto", "select-auto"),
                ("none", "select-none"),
                ("text", "select-text"),
            ],
        ),
        "verticalAlign" => named(
            value,
            &[
                ("baseline", "align-baseline"),
                ("bottom", "align-bottom"),
                ("middle", "align-middle"),
                ("sub", "align-sub"),
                ("super", "align-super"),
                ("text-bottom", "align-text-bottom"),
                ("text-top", "align-text-top"),
                ("top", "align-top"),
            ],
        ),
        "outlineColor" => raw("outline"),
        "outlineStyle" => named(
            value,
            &[
                ("solid", "outline-solid"),
                ("dashed", "outline-dashed"),
                ("dotted", "outline-dotted"),
                ("double", "outline-double"),
                ("none", "outline-none"),
            ],
        ),
        "fontSize" => length("text"),
        "lineHeight" => raw("leading"),
        "letterSpacing" => length("tracking"),
        "overflow" => named(
            value,
            &[
                ("visible", "overflow-visible"),
                ("hidden", "overflow-hidden"),
                ("clip", "overflow-clip"),
                ("scroll", "overflow-scroll"),
                ("auto", "overflow-auto"),
            ],
        ),
        "textAlign" => named(
            value,
            &[
                ("left", "text-left"),
                ("center", "text-center"),
                ("right", "text-right"),
                ("justify", "text-justify"),
                ("start", "text-start"),
                ("end", "text-end"),
            ],
        ),
        "textTransform" => named(
            value,
            &[
                ("uppercase", "uppercase"),
                ("lowercase", "lowercase"),
                ("capitalize", "capitalize"),
                ("none", "normal-case"),
            ],
        ),
        "objectFit" => named(
            value,
            &[
                ("contain", "object-contain"),
                ("cover", "object-cover"),
                ("fill", "object-fill"),
                ("none", "object-none"),
                ("scale-down", "object-scale-down"),
            ],
        ),
        "cursor" => named(
            value,
            &[("auto", "cursor-auto"), ("pointer", "cursor-pointer")],
        ),
        _ => None,
    }
}

fn direct_properties(property: &str, value: &StaticValue) -> Option<Vec<StyleProperty>> {
    let width = || px_length(value);
    let dimension = || dimension(value);
    let color = || css_color(value);
    Some(match property {
        "appearance" => vec![web_only_keyword(property, value)?],
        "WebkitAppearance" => vec![web_only_keyword(property, value)?],
        "colorScheme" => vec![web_only_keyword(property, value)?],
        "forcedColorAdjust" => vec![web_only_keyword(property, value)?],
        "imageRendering" => vec![web_only_keyword(property, value)?],
        "overflowAnchor" => vec![web_only_keyword(property, value)?],
        "overscrollBehavior" => vec![web_only_keyword(property, value)?],
        "overscrollBehaviorBlock" => vec![web_only_keyword(property, value)?],
        "overscrollBehaviorInline" => vec![web_only_keyword(property, value)?],
        "overscrollBehaviorX" => vec![web_only_keyword(property, value)?],
        "overscrollBehaviorY" => vec![web_only_keyword(property, value)?],
        "printColorAdjust" => vec![web_only_keyword(property, value)?],
        "resize" => vec![web_only_keyword(property, value)?],
        "scrollSnapAlign" => vec![web_only_keyword(property, value)?],
        "scrollSnapStop" => vec![web_only_keyword(property, value)?],
        "scrollSnapType" => vec![web_only_keyword(property, value)?],
        "scrollbarGutter" => vec![web_only_keyword(property, value)?],
        "scrollbarWidth" => vec![web_only_keyword(property, value)?],
        "textRendering" => vec![web_only_keyword(property, value)?],
        "touchAction" => vec![web_only_keyword(property, value)?],
        "wordBreak" => vec![web_only_keyword(property, value)?],
        "overflowWrap" => vec![web_only_keyword(property, value)?],
        "visibility" => vec![web_only_keyword(property, value)?],
        "backgroundPosition" => vec![web_only_keyword(property, value)?],
        "backgroundRepeat" => vec![web_only_keyword(property, value)?],
        "backgroundSize" => vec![web_only_keyword(property, value)?],
        "objectPosition" => vec![web_only_keyword(property, value)?],
        "justifySelf" => vec![web_only_keyword(property, value)?],
        "placeItems" => vec![web_only_keyword(property, value)?],
        "transitionDelay" => vec![stylex_web_only_duration("transition-delay", value)?],
        "animationDuration" => vec![stylex_web_only_duration("animation-duration", value)?],
        "fontWeight" => vec![StyleProperty::FontWeight(stylex_font_weight(value)?)],
        "whiteSpace" => vec![StyleProperty::WhiteSpace(stylex_white_space(value)?)],
        "textOverflow" => vec![StyleProperty::TextOverflow(stylex_text_overflow(value)?)],
        "caretColor" => vec![StyleProperty::CaretColor(color()?)],
        "order" => vec![StyleProperty::Order(stylex_order(value)?)],
        "overflowX" => vec![StyleProperty::OverflowX(stylex_overflow(value)?)],
        "overflowY" => vec![StyleProperty::OverflowY(stylex_overflow(value)?)],
        "scrollBehavior" => {
            let StaticValue::String(value) = value else { return None };
            let value = match value.as_str() {
                "auto" => "auto",
                "smooth" => "smooth",
                _ => return None,
            };
            vec![StyleProperty::ScrollBehavior(value)]
        }
        "scrollMarginTop" => vec![StyleProperty::ScrollMargin(stylex_scroll_edge(property)?, width()?)],
        "scrollMarginRight" => vec![StyleProperty::ScrollMargin(stylex_scroll_edge(property)?, width()?)],
        "scrollMarginBottom" => vec![StyleProperty::ScrollMargin(stylex_scroll_edge(property)?, width()?)],
        "scrollMarginLeft" => vec![StyleProperty::ScrollMargin(stylex_scroll_edge(property)?, width()?)],
        "scrollMarginBlockStart" => vec![StyleProperty::ScrollMargin(stylex_scroll_edge(property)?, width()?)],
        "scrollMarginBlockEnd" => vec![StyleProperty::ScrollMargin(stylex_scroll_edge(property)?, width()?)],
        "scrollMarginInlineStart" => vec![StyleProperty::ScrollMargin(stylex_scroll_edge(property)?, width()?)],
        "scrollMarginInlineEnd" => vec![StyleProperty::ScrollMargin(stylex_scroll_edge(property)?, width()?)],
        "scrollPaddingTop" => vec![StyleProperty::ScrollPadding(stylex_scroll_edge(property)?, width()?)],
        "scrollPaddingRight" => vec![StyleProperty::ScrollPadding(stylex_scroll_edge(property)?, width()?)],
        "scrollPaddingBottom" => vec![StyleProperty::ScrollPadding(stylex_scroll_edge(property)?, width()?)],
        "scrollPaddingLeft" => vec![StyleProperty::ScrollPadding(stylex_scroll_edge(property)?, width()?)],
        "scrollPaddingBlockStart" => vec![StyleProperty::ScrollPadding(stylex_scroll_edge(property)?, width()?)],
        "scrollPaddingBlockEnd" => vec![StyleProperty::ScrollPadding(stylex_scroll_edge(property)?, width()?)],
        "scrollPaddingInlineStart" => vec![StyleProperty::ScrollPadding(stylex_scroll_edge(property)?, width()?)],
        "scrollPaddingInlineEnd" => vec![StyleProperty::ScrollPadding(stylex_scroll_edge(property)?, width()?)],
        "textIndent" => vec![StyleProperty::TextIndent(dimension()?)],
        "transitionProperty" => vec![StyleProperty::TransitionProperty(
            stylex_transition_property(value)?,
        )],
        "transitionDuration" => vec![StyleProperty::TransitionDuration(
            stylex_transition_duration(value)?,
            Origin::Written,
        )],
        "transitionTimingFunction" => vec![StyleProperty::TransitionTimingFunction(
            stylex_transition_timing(value)?,
            Origin::Written,
        )],
        "containerName" => vec![StyleProperty::ContainerName(stylex_container_name(value)?)],
        "containerType" => vec![StyleProperty::Keyword(
            "container-type",
            stylex_container_type(value)?,
        )],
        // StyleX emits these as CSS shorthands at a lower atomic priority
        // than their longhands. Split them into the typed final slots here
        // so the same priority resolution works on Web and Native.
        "gap" => {
            let value = width()?;
            vec![
                StyleProperty::RowGap(value.clone()),
                StyleProperty::ColumnGap(value),
            ]
        }
        "borderRadius" => {
            let value = Radius::Length(width()?);
            vec![
                StyleProperty::BorderTopLeftRadius(value.clone()),
                StyleProperty::BorderTopRightRadius(value.clone()),
                StyleProperty::BorderBottomRightRadius(value.clone()),
                StyleProperty::BorderBottomLeftRadius(value),
            ]
        }
        "flex" => {
            let StaticValue::String(value) = value else {
                return None;
            };
            let (grow, shrink, basis) = match value.as_str() {
                "auto" => (1.0, 1.0, Dimension::Auto),
                "initial" => (0.0, 1.0, Dimension::Auto),
                "none" => (0.0, 0.0, Dimension::Auto),
                "1" => (1.0, 1.0, Dimension::Percent(0.0)),
                _ => return None,
            };
            vec![
                StyleProperty::FlexGrow(grow),
                StyleProperty::FlexShrink(shrink),
                StyleProperty::FlexBasis(basis),
            ]
        }
        "gridTemplateColumns" => vec![StyleProperty::GridTemplateColumns(stylex_grid_tracks(
            value,
        )?)],
        "gridTemplateRows" => vec![StyleProperty::GridTemplateRows(stylex_grid_tracks(
            value,
        )?)],
        "gridColumnStart" => vec![StyleProperty::GridColumnStart(stylex_grid_line(value)?)],
        "gridColumnEnd" => vec![StyleProperty::GridColumnEnd(stylex_grid_line(value)?)],
        "gridRowStart" => vec![StyleProperty::GridRowStart(stylex_grid_line(value)?)],
        "gridRowEnd" => vec![StyleProperty::GridRowEnd(stylex_grid_line(value)?)],
        "gridColumn" => vec![StyleProperty::GridColumn(stylex_grid_span(value)?)],
        "gridRow" => vec![StyleProperty::GridRow(stylex_grid_span(value)?)],
        "transform" => vec![StyleProperty::Transform(transform_functions(value)?)],
        "transformOrigin" => vec![StyleProperty::TransformOrigin(transform_origin(value)?)],
        // The shared IR deliberately keeps the complete shadow list as CSS
        // text. That preserves authored layer order and also maps directly
        // to React Native's string-valued `boxShadow` support.
        "boxShadow" => {
            let StaticValue::String(value) = value else {
                return None;
            };
            let value = value
                .split(',')
                .map(str::trim)
                .collect::<Vec<_>>()
                .join(",");
            vec![StyleProperty::BoxShadow(value)]
        }
        "backgroundImage" => {
            let StaticValue::String(value) = value else { return None };
            let value = value.trim();
            if value == "none" {
                vec![StyleProperty::BackgroundImageNone]
            } else if (value.starts_with("linear-gradient(")
                || value.starts_with("radial-gradient("))
                && value.ends_with(')')
                && !value.contains("var(")
                && !value.contains("env(")
            {
                let value = value.split(',').map(str::trim).collect::<Vec<_>>().join(",");
                vec![StyleProperty::BackgroundImage(value)]
            } else {
                return None;
            }
        }
        "filter" => {
            let StaticValue::String(value) = value else { return None };
            let value = value.trim();
            if value != "none" && !supported_filter_list(value) {
                return None;
            }
            vec![StyleProperty::FilterRaw(value.to_string())]
        }
        "direction" => {
            let StaticValue::String(value) = value else { return None };
            let value = ["inherit", "ltr", "rtl"]
                .into_iter()
                .find(|candidate| *candidate == value)?;
            vec![StyleProperty::Keyword("direction", value)]
        }
        "fontFamily" => {
            let StaticValue::String(value) = value else { return None };
            let value = value.trim();
            if value.is_empty() || value.contains(',') || value.contains("var(") {
                return None;
            }
            vec![StyleProperty::FontFamily(value.to_string())]
        }
        "fontVariant" => {
            let StaticValue::String(value) = value else { return None };
            let variants = value
                .split_whitespace()
                .map(portable_font_variant)
                .collect::<Option<Vec<_>>>()?;
            if variants.is_empty() {
                return None;
            }
            vec![StyleProperty::FontVariant(variants)]
        }
        // Tailwind's border-width utilities intentionally add a solid
        // style so they paint without a reset. StyleX declares exactly the
        // requested property, so it must bypass that Tailwind-specific
        // expansion or `borderWidth: 2` would also change borderStyle.
        "borderWidth" => {
            let value = width()?;
            vec![
                StyleProperty::BorderTopWidth(value.clone()),
                StyleProperty::BorderRightWidth(value.clone()),
                StyleProperty::BorderBottomWidth(value.clone()),
                StyleProperty::BorderLeftWidth(value),
            ]
        }
        "borderTopWidth" => vec![StyleProperty::BorderTopWidth(width()?)],
        "borderRightWidth" => vec![StyleProperty::BorderRightWidth(width()?)],
        "borderBottomWidth" => vec![StyleProperty::BorderBottomWidth(width()?)],
        "borderLeftWidth" => vec![StyleProperty::BorderLeftWidth(width()?)],
        // Expanding the shorthand into the four typed slots makes its
        // overlap with a side longhand visible to `same_property_as`.
        "borderColor" => {
            let value = color()?;
            vec![
                StyleProperty::BorderTopColor(value.clone()),
                StyleProperty::BorderRightColor(value.clone()),
                StyleProperty::BorderBottomColor(value.clone()),
                StyleProperty::BorderLeftColor(value),
            ]
        }
        "borderTopColor" => vec![StyleProperty::BorderTopColor(color()?)],
        "borderRightColor" => vec![StyleProperty::BorderRightColor(color()?)],
        "borderBottomColor" => vec![StyleProperty::BorderBottomColor(color()?)],
        "borderLeftColor" => vec![StyleProperty::BorderLeftColor(color()?)],
        "borderBlockColor" => {
            let value = color()?;
            vec![
                StyleProperty::BorderTopColor(value.clone()),
                StyleProperty::BorderBottomColor(value),
            ]
        }
        // StyleX defines these aliases in terms of physical top/bottom,
        // which its official compiler confirms. Follow that contract even
        // though the CSS names themselves look writing-mode-relative.
        "borderBlockStartColor" => vec![StyleProperty::BorderTopColor(color()?)],
        "borderBlockEndColor" => vec![StyleProperty::BorderBottomColor(color()?)],
        // The arbitrary Tailwind outline-width form also adds `solid`;
        // StyleX does not. Keep width and offset independent here.
        "outlineWidth" => vec![StyleProperty::OutlineWidth(width()?)],
        "outlineOffset" => vec![StyleProperty::OutlineOffset(width()?)],
        // StyleX exposes both the modern inset names and React Native's
        // start/end aliases. Keep all of them logical in IR so RTL is
        // decided by the platform rather than baked into the compiler.
        "start" => vec![StyleProperty::InsetInlineStart(dimension()?)],
        "insetInlineStart" => vec![StyleProperty::InsetInlineStart(dimension()?)],
        "end" => vec![StyleProperty::InsetInlineEnd(dimension()?)],
        "insetInlineEnd" => vec![StyleProperty::InsetInlineEnd(dimension()?)],
        "insetInline" => {
            let value = dimension()?;
            vec![
                StyleProperty::InsetInlineStart(value.clone()),
                StyleProperty::InsetInlineEnd(value),
            ]
        }
        "insetBlockStart" => vec![StyleProperty::InsetTop(dimension()?)],
        "insetBlockEnd" => vec![StyleProperty::InsetBottom(dimension()?)],
        "insetBlock" => {
            let value = dimension()?;
            vec![
                StyleProperty::InsetTop(value.clone()),
                StyleProperty::InsetBottom(value),
            ]
        }
        "inset" => {
            let value = dimension()?;
            vec![
                StyleProperty::InsetTop(value.clone()),
                StyleProperty::InsetRight(value.clone()),
                StyleProperty::InsetBottom(value.clone()),
                StyleProperty::InsetLeft(value),
            ]
        }
        "marginInline" => {
            let value = dimension()?;
            vec![
                StyleProperty::MarginInlineStart(value.clone()),
                StyleProperty::MarginInlineEnd(value),
            ]
        }
        "marginBlockStart" => vec![StyleProperty::MarginTop(dimension()?)],
        "marginBlockEnd" => vec![StyleProperty::MarginBottom(dimension()?)],
        "marginBlock" => {
            let value = dimension()?;
            vec![
                StyleProperty::MarginTop(value.clone()),
                StyleProperty::MarginBottom(value),
            ]
        }
        "paddingInline" => {
            let value = width()?;
            vec![
                StyleProperty::PaddingInlineStart(value.clone()),
                StyleProperty::PaddingInlineEnd(value),
            ]
        }
        "paddingBlockStart" => vec![StyleProperty::PaddingTop(width()?)],
        "paddingBlockEnd" => vec![StyleProperty::PaddingBottom(width()?)],
        "paddingBlock" => {
            let value = width()?;
            vec![
                StyleProperty::PaddingTop(value.clone()),
                StyleProperty::PaddingBottom(value),
            ]
        }
        _ => return None,
    })
}

fn portable_font_variant(value: &str) -> Option<&'static str> {
    const VALUES: &[&str] = &[
        "small-caps", "oldstyle-nums", "lining-nums", "tabular-nums",
        "common-ligatures", "no-common-ligatures", "discretionary-ligatures",
        "no-discretionary-ligatures", "historical-ligatures", "no-historical-ligatures",
        "contextual", "no-contextual", "proportional-nums", "stylistic-one",
        "stylistic-two", "stylistic-three", "stylistic-four", "stylistic-five",
        "stylistic-six", "stylistic-seven", "stylistic-eight", "stylistic-nine",
        "stylistic-ten", "stylistic-eleven", "stylistic-twelve", "stylistic-thirteen",
        "stylistic-fourteen", "stylistic-fifteen", "stylistic-sixteen",
        "stylistic-seventeen", "stylistic-eighteen", "stylistic-nineteen",
        "stylistic-twenty",
    ];
    VALUES.iter().copied().find(|candidate| *candidate == value)
}

fn supported_filter_list(value: &str) -> bool {
    let mut rest = value.trim();
    while !rest.is_empty() {
        let Some(open) = rest.find('(') else { return false };
        let name = rest[..open].trim();
        if !matches!(
            name,
            "blur" | "brightness" | "contrast" | "drop-shadow" | "grayscale"
                | "hue-rotate" | "invert" | "opacity" | "saturate" | "sepia"
        ) {
            return false;
        }
        let mut depth = 0_u32;
        let mut close = None;
        for (index, character) in rest[open..].char_indices() {
            match character {
                '(' => depth += 1,
                ')' => {
                    depth -= 1;
                    if depth == 0 {
                        close = Some(open + index + 1);
                        break;
                    }
                }
                _ => {}
            }
        }
        let Some(close) = close else { return false };
        rest = rest[close..].trim_start();
    }
    true
}

/// The aliases StyleX's default `property-specificity` mode normalizes before
/// it gives a declaration a property key. Exact-key last-wins must therefore
/// see `paddingBlockStart` and `paddingTop` as the same namespace too.
fn canonical_property(property: &str) -> &str {
    match property {
        "borderBlockStartColor" => "borderTopColor",
        "borderBlockEndColor" => "borderBottomColor",
        "insetBlockStart" => "top",
        "insetBlockEnd" => "bottom",
        "marginBlockStart" => "marginTop",
        "marginBlockEnd" => "marginBottom",
        "paddingBlockStart" => "paddingTop",
        "paddingBlockEnd" => "paddingBottom",
        "scrollMarginBlockStart" => "scrollMarginTop",
        "scrollMarginBlockEnd" => "scrollMarginBottom",
        "start" => "insetInlineStart",
        "end" => "insetInlineEnd",
        _ => property,
    }
}

/// StyleX 0.19's published property-priority table has four CSS tiers. The
/// frontend expands the supported shorthands into final typed slots, but keeps
/// this rank so a longhand still wins independently of `props()` argument
/// order on both backends.
fn property_priority(property: &str) -> u16 {
    let property = canonical_property(property);
    if matches!(property, "padding" | "margin" | "inset") {
        return 1000;
    }
    if matches!(
        property,
        "borderColor"
            | "borderStyle"
            | "borderWidth"
            | "borderRadius"
            | "flex"
            | "fontVariant"
            | "gap"
            | "gridColumn"
            | "gridRow"
            | "container"
            | "insetBlock"
            | "insetInline"
            | "marginBlock"
            | "marginInline"
            | "overflow"
            | "placeItems"
            | "paddingBlock"
            | "paddingInline"
    ) {
        return 2000;
    }
    if matches!(
        property,
        "borderTopColor"
            | "borderRightColor"
            | "borderBottomColor"
            | "borderLeftColor"
            | "borderTopWidth"
            | "borderRightWidth"
            | "borderBottomWidth"
            | "borderLeftWidth"
            | "borderTopLeftRadius"
            | "borderTopRightRadius"
            | "borderBottomRightRadius"
            | "borderBottomLeftRadius"
            | "bottom"
            | "height"
            | "left"
            | "marginTop"
            | "marginRight"
            | "marginBottom"
            | "marginLeft"
            | "maxHeight"
            | "maxWidth"
            | "minHeight"
            | "minWidth"
            | "paddingTop"
            | "paddingRight"
            | "paddingBottom"
            | "paddingLeft"
            | "right"
            | "top"
            | "width"
    ) {
        return 4000;
    }
    3000
}

fn directional_overlap_one_way(left: &StyleProperty, right: &StyleProperty) -> bool {
    matches!(
        (left, right),
        (StyleProperty::PaddingInlineStart(_), StyleProperty::PaddingLeft(_))
            | (StyleProperty::PaddingInlineStart(_), StyleProperty::PaddingRight(_))
            | (StyleProperty::PaddingInlineEnd(_), StyleProperty::PaddingLeft(_))
            | (StyleProperty::PaddingInlineEnd(_), StyleProperty::PaddingRight(_))
            | (StyleProperty::MarginInlineStart(_), StyleProperty::MarginLeft(_))
            | (StyleProperty::MarginInlineStart(_), StyleProperty::MarginRight(_))
            | (StyleProperty::MarginInlineEnd(_), StyleProperty::MarginLeft(_))
            | (StyleProperty::MarginInlineEnd(_), StyleProperty::MarginRight(_))
            | (StyleProperty::InsetInlineStart(_), StyleProperty::InsetLeft(_))
            | (StyleProperty::InsetInlineStart(_), StyleProperty::InsetRight(_))
            | (StyleProperty::InsetInlineEnd(_), StyleProperty::InsetLeft(_))
            | (StyleProperty::InsetInlineEnd(_), StyleProperty::InsetRight(_))
            | (StyleProperty::BorderStartStartRadius(_), StyleProperty::BorderTopLeftRadius(_))
            | (StyleProperty::BorderStartStartRadius(_), StyleProperty::BorderTopRightRadius(_))
            | (StyleProperty::BorderStartEndRadius(_), StyleProperty::BorderTopLeftRadius(_))
            | (StyleProperty::BorderStartEndRadius(_), StyleProperty::BorderTopRightRadius(_))
            | (StyleProperty::BorderEndStartRadius(_), StyleProperty::BorderBottomLeftRadius(_))
            | (StyleProperty::BorderEndStartRadius(_), StyleProperty::BorderBottomRightRadius(_))
            | (StyleProperty::BorderEndEndRadius(_), StyleProperty::BorderBottomLeftRadius(_))
            | (StyleProperty::BorderEndEndRadius(_), StyleProperty::BorderBottomRightRadius(_))
    )
}

fn needs_platform_priority(left: &Entry, right: &ResolvedEntry) -> bool {
    let grid_overlap = (left.css_name == "gridColumn" && right.css_name.starts_with("gridColumn"))
        || (right.css_name == "gridColumn" && left.css_name.starts_with("gridColumn"))
        || (left.css_name == "gridRow" && right.css_name.starts_with("gridRow"))
        || (right.css_name == "gridRow" && left.css_name.starts_with("gridRow"));
    grid_overlap
        || left.properties.iter().any(|left| {
            directional_overlap_one_way(left, &right.declaration.property)
                || directional_overlap_one_way(&right.declaration.property, left)
        })
}

fn property_name_family(property: &str) -> Option<&'static str> {
    let property = canonical_property(property);
    if property.starts_with("padding") {
        Some("padding")
    } else if property.starts_with("margin") {
        Some("margin")
    } else if matches!(property, "top" | "right" | "bottom" | "left")
        || property.starts_with("inset")
    {
        Some("inset")
    } else if matches!(property, "gap" | "rowGap" | "columnGap") {
        Some("gap")
    } else if property == "borderRadius" || property.ends_with("Radius") {
        Some("border-radius")
    } else if property == "borderColor"
        || property.ends_with("Color") && property.starts_with("border")
    {
        Some("border-color")
    } else if property == "borderWidth"
        || property.ends_with("Width") && property.starts_with("border")
    {
        Some("border-width")
    } else if property == "borderStyle"
        || property.ends_with("Style") && property.starts_with("border")
    {
        Some("border-style")
    } else if property == "flex" || matches!(property, "flexGrow" | "flexShrink" | "flexBasis") {
        Some("flex")
    } else if property.starts_with("gridColumn") {
        Some("grid-column")
    } else if property.starts_with("gridRow") {
        Some("grid-row")
    } else if property == "overflow" || matches!(property, "overflowX" | "overflowY") {
        Some("overflow")
    } else if property.starts_with("scrollMargin") {
        Some("scroll-margin")
    } else if property.starts_with("scrollPadding") {
        Some("scroll-padding")
    } else if property == "container" || property.starts_with("container") {
        Some("container")
    } else if property == "transition" || property.starts_with("transition") {
        Some("transition")
    } else if property == "background" || property.starts_with("background") {
        Some("background")
    } else if property == "animation" || property.starts_with("animation") {
        Some("animation")
    } else if property == "caret" || property.starts_with("caret") {
        Some("caret")
    } else if matches!(property, "placeItems" | "alignItems" | "justifyItems") {
        Some("place-items")
    } else {
        None
    }
}

fn property_names_overlap(left: &str, right: &str) -> bool {
    let left = canonical_property(left);
    let right = canonical_property(right);
    left == right
        || property_name_family(left)
            .is_some_and(|family| property_name_family(right) == Some(family))
}

fn resolve_property_priority(mut entries: Vec<ResolvedEntry>) -> Vec<StyleDeclaration> {
    // A higher-priority unconditional declaration makes a lower-priority
    // value for the same final slot unreachable, even when that lower value
    // has a runtime guard. Removing it is necessary on Web because Hozo's
    // guard selector is more specific than its base selector; leaving it in
    // would let selector specificity undo StyleX's property priority.
    let unconditional = entries
        .iter()
        .filter(|entry| entry.declaration.condition == Condition::Always)
        .map(|entry| (entry.priority, entry.declaration.property.clone()))
        .collect::<Vec<_>>();
    entries.retain(|entry| {
        !unconditional.iter().any(|(priority, property)| {
            *priority > entry.priority
                && property.same_property_as(&entry.declaration.property)
        })
    });

    // Stable sort: priority decides across different StyleX property keys;
    // source/argument order remains the tiebreaker within one tier. Both Web
    // declaration order and Native style-array order then inherit the same
    // already-resolved cascade without runtime work.
    entries.sort_by_key(|entry| entry.priority);
    entries
        .into_iter()
        .map(|entry| entry.declaration)
        .collect()
}

fn parse_rule_object(
    object: &ObjectExpression,
    static_objects: &HashMap<String, &ObjectExpression>,
    visiting: &mut HashSet<String>,
    out: &mut Vec<Entry>,
    residual: &mut Vec<ResidualProperty>,
    gaps: &mut Vec<Gap>,
) -> Result<(), Gap> {
    for item in &object.properties {
        let property = match item {
            ObjectPropertyKind::ObjectProperty(property) => property,
            ObjectPropertyKind::SpreadProperty(spread) => {
                let spread_object = match &spread.argument {
                    Expression::ObjectExpression(object) => object,
                    Expression::Identifier(identifier) => {
                        let name = identifier.name.to_string();
                        let Some(object) = static_objects.get(&name) else {
                            return Err(Gap {
                                message: format!(
                                    "StyleX object spread `{name}` must reference a module-scope const object literal."
                                ),
                                span: source_span(spread.span),
                            });
                        };
                        if object.span.end > spread.span.start {
                            return Err(Gap {
                                message: format!(
                                    "StyleX object spread `{name}` must be declared before it is used."
                                ),
                                span: source_span(spread.span),
                            });
                        }
                        if !visiting.insert(name.clone()) {
                            return Err(Gap {
                                message: format!("StyleX object spread `{name}` is recursive."),
                                span: source_span(spread.span),
                            });
                        }
                        parse_rule_object(
                            object,
                            static_objects,
                            visiting,
                            out,
                            residual,
                            gaps,
                        )?;
                        visiting.remove(&name);
                        continue;
                    }
                    other => {
                        return Err(Gap {
                            message: "StyleX object spreads must be inline object literals or module-scope const object literals."
                                .to_string(),
                            span: source_span(other.span()),
                        });
                    }
                };
                parse_rule_object(
                    spread_object,
                    static_objects,
                    visiting,
                    out,
                    residual,
                    gaps,
                )?;
                continue;
            }
        };
        if property.computed {
            return Err(Gap {
                message: "Computed StyleX property names are not statically lowerable.".to_string(),
                span: source_span(property.span),
            });
        }
        let Some(name) = static_key(&property.key) else {
            return Err(Gap {
                message: "StyleX property names must be identifiers or string literals."
                    .to_string(),
                span: source_span(property.key.span()),
            });
        };
        let Some(value) = static_value(&property.value) else {
            residual.push(ResidualProperty {
                css_name: canonical_property(&name).to_string(),
                span: ExprRef(source_span(property.span)),
            });
            gaps.push(Gap {
                message: format!(
                    "`{name}` has a dynamic or nested StyleX value; this frontend slice accepts static strings and numbers."
                ),
                span: source_span(property.value.span()),
            });
            continue;
        };
        let properties = match direct_properties(&name, &value) {
            Some(properties) => properties,
            None => {
                let Some(token) = token_for(&name, &value) else {
                    residual.push(ResidualProperty {
                        css_name: canonical_property(&name).to_string(),
                        span: ExprRef(source_span(property.span)),
                    });
                    gaps.push(Gap {
                        message: format!(
                            "StyleX property `{name}` or its value is not in Hozo's typed universal subset yet."
                        ),
                        span: source_span(property.span),
                    });
                    continue;
                };
                let (condition, properties) = tailwind::expand_utility(&token);
                if condition != Condition::Always || properties.is_empty() {
                    residual.push(ResidualProperty {
                        css_name: canonical_property(&name).to_string(),
                        span: ExprRef(source_span(property.span)),
                    });
                    gaps.push(Gap {
                        message: format!(
                            "StyleX property `{name}` could not become a typed Hozo style without losing meaning."
                        ),
                        span: source_span(property.span),
                    });
                    continue;
                }
                properties
            }
        };
        out.push(Entry {
            css_name: canonical_property(&name).to_string(),
            priority: property_priority(&name),
            properties,
            span: source_span(property.span),
        });
    }
    Ok(())
}

fn parse_rule(
    expression: &Expression,
    static_objects: &HashMap<String, &ObjectExpression>,
) -> Result<(Vec<Entry>, Vec<ResidualProperty>, Vec<Gap>), Gap> {
    let Expression::ObjectExpression(object) = expression else {
        return Err(Gap {
            message: "StyleX style entries must be static object literals.".to_string(),
            span: source_span(expression.span()),
        });
    };
    let mut out = Vec::new();
    let mut residual = Vec::new();
    let mut gaps = Vec::new();
    parse_rule_object(
        object,
        static_objects,
        &mut HashSet::new(),
        &mut out,
        &mut residual,
        &mut gaps,
    )?;
    Ok((out, residual, gaps))
}

#[derive(Default)]
struct StaticObjectUses {
    references: HashMap<String, usize>,
    spreads: HashMap<String, usize>,
}

impl<'a> Visit<'a> for StaticObjectUses {
    fn visit_identifier_reference(&mut self, identifier: &IdentifierReference<'a>) {
        *self.references.entry(identifier.name.to_string()).or_default() += 1;
    }

    fn visit_object_expression(&mut self, object: &ObjectExpression<'a>) {
        for property in &object.properties {
            let ObjectPropertyKind::SpreadProperty(spread) = property else {
                continue;
            };
            let Expression::Identifier(identifier) = &spread.argument else {
                continue;
            };
            *self.spreads.entry(identifier.name.to_string()).or_default() += 1;
        }
        walk_object_expression(self, object);
    }
}

fn module_static_objects<'a>(
    program: &'a oxc_ast::ast::Program<'a>,
    module: &ModuleRecord<'a>,
) -> HashMap<String, &'a ObjectExpression<'a>> {
    let mut objects = HashMap::new();
    for statement in &program.body {
        let Statement::VariableDeclaration(declaration) = statement else {
            continue;
        };
        if declaration.kind != VariableDeclarationKind::Const {
            continue;
        }
        for declarator in &declaration.declarations {
            let BindingPattern::BindingIdentifier(identifier) = &declarator.id else {
                continue;
            };
            let Some(Expression::ObjectExpression(object)) = &declarator.init else {
                continue;
            };
            objects.insert(identifier.name.to_string(), object.as_ref());
        }
    }
    let mut uses = StaticObjectUses::default();
    uses.visit_program(program);
    objects.retain(|name, _| {
        uses.references.get(name).copied().unwrap_or_default()
            == uses.spreads.get(name).copied().unwrap_or_default()
            && !module.exported_bindings.contains_key(name.as_str())
    });
    objects
}

fn create_object<'a>(
    call: &'a CallExpression<'a>,
    namespaces: &HashSet<String>,
) -> Option<&'a ObjectExpression<'a>> {
    let Expression::StaticMemberExpression(member) = &call.callee else {
        return None;
    };
    let Expression::Identifier(object) = &member.object else {
        return None;
    };
    if member.property.name.as_str() != "create" || !namespaces.contains(object.name.as_str()) {
        return None;
    }
    match call.arguments.first()? {
        Argument::ObjectExpression(object) => Some(object),
        _ => None,
    }
}

struct SheetCollector<'n, 'a> {
    namespaces: &'n HashSet<String>,
    static_objects: &'n HashMap<String, &'a ObjectExpression<'a>>,
    sheets: HashMap<String, HashMap<String, Rule>>,
    scan_spans: Vec<SourceSpan>,
    function_depth: usize,
}

impl<'a> Visit<'a> for SheetCollector<'_, 'a> {
    // Module-scope only. Without semantic reference resolution, accepting a
    // local `const styles` would make two functions using that common name
    // overwrite each other in this map and silently apply the last sheet to
    // both. Cross-scope support waits for symbol IDs; declining is exact.
    fn visit_function(&mut self, function: &Function<'a>, flags: ScopeFlags) {
        self.function_depth += 1;
        walk_function(self, function, flags);
        self.function_depth -= 1;
    }

    fn visit_arrow_function_expression(&mut self, function: &ArrowFunctionExpression<'a>) {
        self.function_depth += 1;
        walk_arrow_function_expression(self, function);
        self.function_depth -= 1;
    }

    fn visit_variable_declarator(&mut self, declarator: &VariableDeclarator<'a>) {
        let BindingPattern::BindingIdentifier(identifier) = &declarator.id else {
            walk_variable_declarator(self, declarator);
            return;
        };
        let Some(Expression::CallExpression(call)) = &declarator.init else {
            walk_variable_declarator(self, declarator);
            return;
        };
        let Some(object) = create_object(call, self.namespaces) else {
            walk_variable_declarator(self, declarator);
            return;
        };
        self.scan_spans.push(source_span(object.span));
        if self.function_depth > 0 {
            walk_variable_declarator(self, declarator);
            return;
        }
        let mut rules = HashMap::new();
        for item in &object.properties {
            let ObjectPropertyKind::ObjectProperty(property) = item else {
                continue;
            };
            let Some(name) = static_key(&property.key) else {
                continue;
            };
            let rule = match parse_rule(&property.value, self.static_objects) {
                Ok((entries, residual, gaps)) => Rule::Ready {
                    entries,
                    residual,
                    gaps,
                },
                Err(gap) => Rule::Gap(gap),
            };
            rules.insert(name, rule);
        }
        self.sheets.insert(identifier.name.to_string(), rules);
        walk_variable_declarator(self, declarator);
    }
}

impl Frontend {
    pub(crate) fn collect<'a>(
        program: &oxc_ast::ast::Program<'a>,
        module: &ModuleRecord<'a>,
    ) -> Self {
        let namespaces: HashSet<String> = module
            .import_entries
            .iter()
            .filter(|entry| !entry.is_type && entry.module_request.name.as_str() == STYLEX_MODULE)
            .map(|entry| entry.local_name.name.to_string())
            .collect();
        if namespaces.is_empty() {
            return Self::default();
        }
        let static_objects = module_static_objects(program, module);
        let (sheets, scan_spans) = {
            let mut collector = SheetCollector {
                namespaces: &namespaces,
                static_objects: &static_objects,
                sheets: HashMap::new(),
                scan_spans: Vec::new(),
                function_depth: 0,
            };
            collector.visit_program(program);
            (collector.sheets, collector.scan_spans)
        };
        Self {
            namespaces,
            sheets,
            scan_spans,
        }
    }

    fn props_namespace<'a>(&self, call: &'a CallExpression) -> Option<&'a str> {
        let Expression::StaticMemberExpression(member) = &call.callee else {
            return None;
        };
        let Expression::Identifier(object) = &member.object else {
            return None;
        };
        (member.property.name.as_str() == "props" && self.namespaces.contains(object.name.as_str()))
            .then_some(object.name.as_str())
    }

    fn rule_from_member(
        &self,
        member: &oxc_ast::ast::StaticMemberExpression,
    ) -> Result<&Rule, Gap> {
        let Expression::Identifier(sheet) = &member.object else {
            return Err(Gap {
                message: "StyleX styles must be referenced as `styles.rule`.".to_string(),
                span: source_span(member.span),
            });
        };
        let Some(rules) = self.sheets.get(sheet.name.as_str()) else {
            return Err(Gap {
                message: format!(
                    "StyleX sheet `{}` is not a same-file module-scope static `stylex.create` binding.",
                    sheet.name
                ),
                span: source_span(member.span),
            });
        };
        rules.get(member.property.name.as_str()).ok_or_else(|| Gap {
            message: format!(
                "StyleX rule `{}.{}` was not found in its static definition.",
                sheet.name, member.property.name
            ),
            span: source_span(member.span),
        })
    }

    fn append_entries(
        &self,
        entries: &[Entry],
        condition: Condition,
        out: &mut Vec<ResolvedEntry>,
    ) -> Result<(), Gap> {
        for entry in entries {
            // Logical/physical edge conflicts need the element's resolved
            // writing direction on Native, and grid shorthands cannot be
            // split into independent lines without changing placement.
            // Keep those two genuinely platform-dependent cases explicit;
            // ordinary shorthand/longhand priority is resolved below.
            if out
                .iter()
                .any(|existing| needs_platform_priority(entry, existing))
            {
                return Err(Gap {
                    message: format!(
                        "StyleX `{}` overlaps a logical/physical edge or grid shorthand whose Native priority needs runtime context.",
                        entry.css_name
                    ),
                    span: entry.span,
                });
            }
            // For the same StyleX property namespace, later unconditional
            // arguments remove an earlier conditional value exactly as
            // styleq does. A later conditional stays beside the base and
            // overrides only while its guard is true.
            if condition == Condition::Always {
                out.retain(|existing| {
                    existing.css_name != entry.css_name
                        || !entry.properties.iter().any(|property| {
                            property.same_property_as(&existing.declaration.property)
                        })
                });
            }
            out.extend(
                entry
                    .properties
                    .iter()
                    .cloned()
                    .map(|property| ResolvedEntry {
                        css_name: entry.css_name.clone(),
                        priority: entry.priority,
                        declaration: StyleDeclaration {
                            property,
                            condition: condition.clone(),
                        },
                    }),
            );
        }
        Ok(())
    }

    fn resolve_props_expression(
        &self,
        expression: &Expression,
        condition: Option<ConditionExpr>,
        declarations: &mut Vec<ResolvedEntry>,
        residual_arguments: &mut Vec<StylexResidualArgument>,
        residual_properties: &mut Vec<ResidualProperty>,
        gaps: &mut Vec<Gap>,
    ) -> Result<(), Gap> {
        let member = match expression {
            Expression::StaticMemberExpression(member) => member,
            Expression::LogicalExpression(logical)
                if logical.operator == LogicalOperator::And =>
            {
                let guard = ConditionExpr::Ref(ExprRef(source_span(logical.left.span())));
                let condition = Some(match condition {
                    Some(existing) => ConditionExpr::And(Box::new(existing), Box::new(guard)),
                    None => guard,
                });
                return self.resolve_props_expression(
                    &logical.right,
                    condition,
                    declarations,
                    residual_arguments,
                    residual_properties,
                    gaps,
                );
            }
            Expression::ConditionalExpression(conditional) => {
                let guard = ConditionExpr::Ref(ExprRef(source_span(conditional.test.span())));
                let when_true = Some(match condition.clone() {
                    Some(existing) => {
                        ConditionExpr::And(Box::new(existing), Box::new(guard.clone()))
                    }
                    None => guard.clone(),
                });
                self.resolve_props_expression(
                    &conditional.consequent,
                    when_true,
                    declarations,
                    residual_arguments,
                    residual_properties,
                    gaps,
                )?;
                let negated = ConditionExpr::Not(Box::new(guard));
                let when_false = Some(match condition {
                    Some(existing) => {
                        ConditionExpr::And(Box::new(existing), Box::new(negated))
                    }
                    None => negated,
                });
                return self.resolve_props_expression(
                    &conditional.alternate,
                    when_false,
                    declarations,
                    residual_arguments,
                    residual_properties,
                    gaps,
                );
            }
            Expression::ArrayExpression(array) => {
                for element in &array.elements {
                    match element {
                        ArrayExpressionElement::Elision(_) => continue,
                        ArrayExpressionElement::SpreadElement(spread) => {
                            return Err(Gap {
                                message: "Spread elements inside StyleX argument arrays are not statically lowerable."
                                    .to_string(),
                                span: source_span(spread.span),
                            });
                        }
                        element => self.resolve_props_expression(
                            element.as_expression().expect("non-spread array element is an expression"),
                            condition.clone(),
                            declarations,
                            residual_arguments,
                            residual_properties,
                            gaps,
                        )?,
                    }
                }
                return Ok(());
            }
            Expression::BooleanLiteral(literal) if !literal.value => return Ok(()),
            Expression::NullLiteral(_) => return Ok(()),
            other => {
                return Err(Gap {
                    message: "Hozo accepts StyleX rule references, falsy values, recursive arrays, logical guards, and ternary branches in `stylex.props`."
                        .to_string(),
                    span: source_span(other.span()),
                });
            }
        };

        let rule = self.rule_from_member(member)?;
        let Rule::Ready {
            entries,
            residual,
            gaps: rule_gaps,
        } = rule
        else {
            let Rule::Gap(gap) = rule else { unreachable!() };
            return Err(Gap {
                message: gap.message.clone(),
                span: source_span(member.span),
            });
        };
        let declaration_condition = condition
            .clone()
            .map_or(Condition::Always, Condition::Expr);
        self.append_entries(entries, declaration_condition, declarations)?;
        if !residual.is_empty() {
            residual_arguments.push(StylexResidualArgument {
                properties: residual.iter().map(|property| property.span).collect(),
                condition,
            });
            residual_properties.extend(residual.iter().cloned());
            gaps.extend(rule_gaps.iter().cloned().map(|gap| Gap {
                span: source_span(member.span),
                ..gap
            }));
        }
        Ok(())
    }

    pub(crate) fn resolve_props(&self, expression: &Expression) -> Resolution {
        let Expression::CallExpression(call) = expression else {
            return Resolution::NotStylex;
        };
        let Some(namespace) = self.props_namespace(call) else {
            return Resolution::NotStylex;
        };
        let mut declarations = Vec::new();
        let mut residual_arguments = Vec::new();
        let mut residual_properties = Vec::new();
        let mut gaps = Vec::new();
        for argument in &call.arguments {
            let Some(argument) = argument.as_expression() else {
                return Resolution::Gap {
                    message: "Spread arguments in `stylex.props` are not statically lowerable."
                        .to_string(),
                    span: source_span(argument.span()),
                };
            };
            if let Err(gap) = self.resolve_props_expression(
                argument,
                None,
                &mut declarations,
                &mut residual_arguments,
                &mut residual_properties,
                &mut gaps,
            ) {
                return Resolution::Gap {
                    message: gap.message,
                    span: gap.span,
                };
            }
        }
        if residual_arguments.is_empty() {
            return Resolution::Ready(resolve_property_priority(declarations));
        }
        if declarations.is_empty() {
            let gap = gaps.into_iter().next().expect("a residual property has a gap");
            return Resolution::Gap {
                message: gap.message,
                span: source_span(call.span),
            };
        }
        if let Some((residual, declaration)) = residual_properties.iter().find_map(|residual| {
            declarations
                .iter()
                .find(|declaration| property_names_overlap(&residual.css_name, &declaration.css_name))
                .map(|declaration| (residual, declaration))
        }) {
            return Resolution::Gap {
                message: format!(
                    "StyleX residual `{}` overlaps lowered `{}`; the rule stays with StyleX so its cascade is not approximated.",
                    residual.css_name, declaration.css_name
                ),
                span: source_span(call.span),
            };
        }
        Resolution::Partial {
            declarations: resolve_property_priority(declarations),
            residual: StylexResidual {
                namespace: namespace.to_string(),
                arguments: residual_arguments,
            },
            gaps,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use oxc_allocator::Allocator;
    use oxc_parser::Parser;
    use oxc_span::SourceType;

    fn frontend(source: &str) -> Frontend {
        let allocator = Allocator::default();
        let parsed = Parser::new(
            &allocator,
            source,
            SourceType::from_extension("tsx").unwrap(),
        )
        .parse();
        Frontend::collect(&parsed.program, &parsed.module_record)
    }

    #[test]
    fn collects_static_universal_properties() {
        let frontend = frontend(
            r#"
            import * as stylex from '@stylexjs/stylex'
            const styles = stylex.create({
              root: { padding: 16, backgroundColor: '#f00', flexDirection: 'row' }
            })
        "#,
        );
        let Rule::Ready { entries, .. } = &frontend.sheets["styles"]["root"] else {
            panic!("rule was not lowerable")
        };
        assert_eq!(
            entries
                .iter()
                .map(|entry| entry.properties.len())
                .sum::<usize>(),
            6
        ); // four padding sides, colour, direction
    }

    #[test]
    fn unsupported_properties_are_named_gaps() {
        let frontend = frontend(
            r#"
            import * as stylex from '@stylexjs/stylex'
            const styles = stylex.create({ root: { transform: 'translateX(calc(100% - 2px))' } })
        "#,
        );
        let Rule::Ready {
            entries,
            residual,
            gaps,
        } = &frontend.sheets["styles"]["root"]
        else {
            panic!("static unsupported property should remain as a residual")
        };
        assert!(entries.is_empty());
        assert_eq!(residual.len(), 1);
        assert_eq!(gaps.len(), 1);
    }

    #[test]
    fn ordered_static_transforms_and_origin_become_typed_ir() {
        let frontend = frontend(
            r#"
            import * as stylex from '@stylexjs/stylex'
            const styles = stylex.create({
              root: {
                transform: 'translateX(12px) rotate(10deg) scale(0.9)',
                transformOrigin: 'left top'
              }
            })
        "#,
        );
        let Rule::Ready { entries, .. } = &frontend.sheets["styles"]["root"] else {
            panic!("rule was not lowerable")
        };
        assert_eq!(
            entries[0].properties,
            vec![StyleProperty::Transform(vec![
                TransformFunction::TranslateX(Dimension::Length(Length::Px(12.0))),
                TransformFunction::Rotate(Angle::Deg(10.0)),
                TransformFunction::Scale(0.9),
            ])]
        );
        assert_eq!(
            entries[1].properties,
            vec![StyleProperty::TransformOrigin("left top".to_string())]
        );
    }

    #[test]
    fn static_grid_values_become_the_existing_contextual_ir() {
        let frontend = frontend(
            r#"
            import * as stylex from '@stylexjs/stylex'
            const styles = stylex.create({
              grid: {
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                gridTemplateRows: '80px minmax(120px, 2fr) 1fr'
              },
              span: { gridColumn: 'span 2 / span 2', gridRow: '1 / -1' },
              lines: {
                gridColumnStart: 2,
                gridColumnEnd: -1,
                gridRowStart: '2',
                gridRowEnd: 'auto'
              }
            })
        "#,
        );
        let Rule::Ready { entries: grid, .. } = &frontend.sheets["styles"]["grid"] else {
            panic!("grid rule was not lowerable")
        };
        assert_eq!(
            grid[0].properties,
            vec![StyleProperty::GridTemplateColumns(GridTracks::Css(
                "repeat(3,minmax(0,1fr))".to_string()
            ))]
        );
        assert_eq!(
            grid[1].properties,
            vec![StyleProperty::GridTemplateRows(GridTracks::Css(
                "80px minmax(120px,2fr) 1fr".to_string()
            ))]
        );
        let Rule::Ready { entries: span, .. } = &frontend.sheets["styles"]["span"] else {
            panic!("span rule was not lowerable")
        };
        assert_eq!(
            span[0].properties,
            vec![StyleProperty::GridColumn(GridSpan::Span(2))]
        );
        assert_eq!(
            span[1].properties,
            vec![StyleProperty::GridRow(GridSpan::Full)]
        );
        let Rule::Ready { entries: lines, .. } = &frontend.sheets["styles"]["lines"] else {
            panic!("line rule was not lowerable")
        };
        assert_eq!(
            lines[0].properties,
            vec![StyleProperty::GridColumnStart(GridLine::Line(2))]
        );
        assert_eq!(
            lines[1].properties,
            vec![StyleProperty::GridColumnEnd(GridLine::Line(-1))]
        );
        assert_eq!(
            lines[2].properties,
            vec![StyleProperty::GridRowStart(GridLine::Line(2))]
        );
        assert_eq!(
            lines[3].properties,
            vec![StyleProperty::GridRowEnd(GridLine::Auto)]
        );
    }

    #[test]
    fn static_transition_configuration_becomes_the_existing_contextual_ir() {
        let frontend = frontend(
            r#"
            import * as stylex from '@stylexjs/stylex'
            const styles = stylex.create({
              motion: {
                transitionProperty: 'opacity, transform',
                transitionDuration: '.2s',
                transitionTimingFunction: 'ease-in-out'
              }
            })
        "#,
        );
        let Rule::Ready {
            entries,
            residual,
            gaps,
        } = &frontend.sheets["styles"]["motion"]
        else {
            panic!("rule was not lowerable")
        };
        assert!(residual.is_empty());
        assert!(gaps.is_empty());
        assert_eq!(
            entries
                .iter()
                .flat_map(|entry| entry.properties.clone())
                .collect::<Vec<_>>(),
            vec![
                StyleProperty::TransitionProperty("opacity,transform".to_string()),
                StyleProperty::TransitionDuration(200, Origin::Written),
                StyleProperty::TransitionTimingFunction(
                    "ease-in-out".to_string(),
                    Origin::Written
                ),
            ]
        );
    }

    #[test]
    fn practical_text_values_become_typed_ir() {
        let frontend = frontend(
            r#"
            import * as stylex from '@stylexjs/stylex'
            const styles = stylex.create({
              text: { fontWeight: 700, whiteSpace: 'nowrap', textOverflow: 'ellipsis' },
              input: { caretColor: '#123456' }
            })
        "#,
        );
        let Rule::Ready { entries: text, .. } = &frontend.sheets["styles"]["text"] else {
            panic!("text values were not lowerable")
        };
        assert_eq!(
            text.iter().flat_map(|entry| entry.properties.clone()).collect::<Vec<_>>(),
            vec![
                StyleProperty::FontWeight(FontWeight(700)),
                StyleProperty::WhiteSpace(WhiteSpace::NoWrap),
                StyleProperty::TextOverflow(TextOverflow::Ellipsis),
            ]
        );
        let Rule::Ready { entries: input, .. } = &frontend.sheets["styles"]["input"] else {
            panic!("input values were not lowerable")
        };
        assert_eq!(
            input[0].properties,
            vec![StyleProperty::CaretColor(Color::Css("#123456".to_string()))]
        );
    }

    #[test]
    fn practical_web_only_values_are_exact_and_wider_values_remain_residual() {
        let frontend = frontend(
            r#"
            import * as stylex from '@stylexjs/stylex'
            const styles = stylex.create({
              exact: {
                wordBreak: 'break-word', overflowWrap: 'anywhere', visibility: 'hidden',
                backgroundPosition: 'center', backgroundRepeat: 'no-repeat', backgroundSize: 'cover',
                objectPosition: 'center', justifySelf: 'center', placeItems: 'center',
                transitionDelay: '100ms', animationDuration: '.2s'
              },
              wider: { backgroundSize: 'calc(100% - 1px)', transitionDelay: '0.5ms' }
            })
        "#,
        );
        let Rule::Ready { entries, residual, gaps } = &frontend.sheets["styles"]["exact"] else {
            panic!("exact Web values were not lowerable")
        };
        assert_eq!(entries.len(), 11);
        assert!(residual.is_empty());
        assert!(gaps.is_empty());

        let Rule::Ready { entries, residual, gaps } = &frontend.sheets["styles"]["wider"] else {
            panic!("wider values should remain residual")
        };
        assert!(entries.is_empty());
        assert_eq!(residual.len(), 2);
        assert_eq!(gaps.len(), 2);
    }

    #[test]
    fn transition_values_the_native_runtime_cannot_preserve_remain_residual() {
        let frontend = frontend(
            r#"
            import * as stylex from '@stylexjs/stylex'
            const styles = stylex.create({
              motion: {
                transitionProperty: 'filter',
                transitionDuration: '0.5ms',
                transitionTimingFunction: 'steps(2, jump-none)'
              }
            })
        "#,
        );
        let Rule::Ready {
            entries,
            residual,
            gaps,
        } = &frontend.sheets["styles"]["motion"]
        else {
            panic!("static unsupported values should remain residual")
        };
        assert!(entries.is_empty());
        assert_eq!(residual.len(), 3);
        assert_eq!(gaps.len(), 3);
    }

    #[test]
    fn transition_shorthand_overlap_keeps_the_original_stylex_rule() {
        let parsed = crate::parse_tsx(
            r#"
            import * as stylex from '@stylexjs/stylex'
            import { Pressable } from '@hozo/core'
            const styles = stylex.create({
              motion: { transition: 'opacity 100ms linear', transitionDuration: '200ms' }
            })
            const card = <Pressable {...stylex.props(styles.motion)} />
        "#,
        );
        let node = &parsed.roots[0].node;
        assert!(node.style.is_empty());
        assert_eq!(node.props.passthrough.len(), 1);
        assert!(node.props.stylex_residuals.is_empty());
        assert!(parsed.diagnostics[0].message.contains("cascade is not approximated"));
    }

    #[test]
    fn static_container_metadata_becomes_the_existing_contextual_ir() {
        let frontend = frontend(
            r#"
            import * as stylex from '@stylexjs/stylex'
            const styles = stylex.create({
              container: { containerName: 'card-shell', containerType: 'inline-size' },
              normal: { containerType: 'normal' }
            })
        "#,
        );
        let Rule::Ready {
            entries,
            residual,
            gaps,
        } = &frontend.sheets["styles"]["container"]
        else {
            panic!("container metadata was not lowerable")
        };
        assert!(residual.is_empty());
        assert!(gaps.is_empty());
        assert_eq!(
            entries
                .iter()
                .flat_map(|entry| entry.properties.clone())
                .collect::<Vec<_>>(),
            vec![
                StyleProperty::ContainerName("card-shell".to_string()),
                StyleProperty::Keyword("container-type", "inline-size"),
            ]
        );
        let Rule::Ready { entries, .. } = &frontend.sheets["styles"]["normal"] else {
            panic!("normal container type was not lowerable")
        };
        assert_eq!(
            entries[0].properties,
            vec![StyleProperty::Keyword("container-type", "normal")]
        );
    }

    #[test]
    fn wider_container_values_and_shorthand_overlap_remain_official_stylex() {
        let frontend = frontend(
            r#"
            import * as stylex from '@stylexjs/stylex'
            const styles = stylex.create({
              names: { containerName: 'main secondary' },
              digit: { containerName: '-9invalid' },
              overlap: { container: 'card / inline-size', containerType: 'size' }
            })
        "#,
        );
        for name in ["names", "digit"] {
            let Rule::Ready {
                entries,
                residual,
                gaps,
            } = &frontend.sheets["styles"][name]
            else {
                panic!("unsupported static value should remain residual")
            };
            assert!(entries.is_empty());
            assert_eq!(residual.len(), 1);
            assert_eq!(gaps.len(), 1);
        }
        let Rule::Ready {
            entries,
            residual,
            gaps,
        } = &frontend.sheets["styles"]["overlap"]
        else {
            panic!("overlap should remain representable as residual")
        };
        assert_eq!(entries.len(), 1);
        assert_eq!(residual.len(), 1);
        assert_eq!(gaps.len(), 1);
    }

    #[test]
    fn grid_values_outside_the_native_solver_subset_remain_stylex_gaps() {
        let frontend = frontend(
            r#"
            import * as stylex from '@stylexjs/stylex'
            const styles = stylex.create({
              autoTrack: { gridTemplateColumns: 'auto 1fr' },
              namedLine: { gridColumnStart: 'content' },
              unequalSpan: { gridColumn: 'span 2 / span 3' }
            })
        "#,
        );
        for name in ["autoTrack", "namedLine", "unequalSpan"] {
            let Rule::Ready {
                entries,
                residual,
                gaps,
            } = &frontend.sheets["styles"][name]
            else {
                panic!("static unsupported Grid value should remain as a residual")
            };
            assert!(entries.is_empty());
            assert_eq!(residual.len(), 1);
            assert_eq!(gaps.len(), 1);
        }
    }

    #[test]
    fn props_spreads_become_ir_and_keep_dynamic_guards() {
        let parsed = crate::parse_tsx(
            r#"
            import * as stylex from '@stylexjs/stylex'
            import { View } from '@hozo/core'
            const styles = stylex.create({
              root: { padding: 16, backgroundColor: '#f00' },
              active: { opacity: 0.5 }
            })
            const card = <View {...stylex.props(styles.root, active && styles.active)} />
        "#,
        );
        let node = &parsed.roots[0].node;
        assert_eq!(node.style.len(), 6);
        assert!(node.props.passthrough.is_empty());
        assert_eq!(
            node.style
                .iter()
                .filter(|declaration| { matches!(declaration.condition, Condition::Expr(_)) })
                .count(),
            1
        );
    }

    #[test]
    fn recursive_arrays_and_ternaries_keep_their_guards() {
        let parsed = crate::parse_tsx(
            r#"
            import * as stylex from '@stylexjs/stylex'
            import { View } from '@hozo/core'
            const styles = stylex.create({
              root: { padding: 16 },
              active: { opacity: 0.5 },
              inactive: { opacity: 1 }
            })
            const first = <View {...stylex.props([styles.root, [active && styles.active]])} />
            const second = <View {...stylex.props(active ? styles.active : styles.inactive)} />
        "#,
        );
        assert!(parsed.diagnostics.is_empty(), "{:?}", parsed.diagnostics);
        let array_style = &parsed.roots[0].node.style;
        assert_eq!(array_style.len(), 5);
        assert_eq!(
            array_style
                .iter()
                .filter(|declaration| matches!(declaration.condition, Condition::Expr(_)))
                .count(),
            1
        );
        let ternary_style = &parsed.roots[1].node.style;
        assert_eq!(ternary_style.len(), 2);
        assert!(ternary_style.iter().any(|declaration| {
            matches!(declaration.condition, Condition::Expr(ConditionExpr::Ref(_)))
        }));
        assert!(ternary_style.iter().any(|declaration| {
            matches!(declaration.condition, Condition::Expr(ConditionExpr::Not(_)))
        }));
    }

    #[test]
    fn ternary_partial_residuals_rebuild_both_conditions() {
        let source = r#"
            import * as stylex from '@stylexjs/stylex'
            import { View } from '@hozo/core'
            const styles = stylex.create({
              active: { opacity: 0.5, scrollbarColor: 'red blue' },
              inactive: { padding: 8, tabSize: 4 }
            })
            const card = <View {...stylex.props(active ? styles.active : styles.inactive)} />
        "#;
        let parsed = crate::parse_tsx(source);
        let node = &parsed.roots[0].node;
        assert_eq!(node.style.len(), 5);
        assert!(node.props.passthrough.is_empty());
        assert_eq!(node.props.stylex_residuals.len(), 1);
        let residual = node.props.stylex_residuals[0].render_expression(source);
        assert!(residual.contains("(active)"), "{residual}");
        assert!(residual.contains("!(active)"), "{residual}");
        assert!(residual.contains("scrollbarColor: 'red blue'"), "{residual}");
        assert!(residual.contains("tabSize: 4"), "{residual}");
        assert!(!residual.contains("opacity: 0.5"), "{residual}");
        assert!(!residual.contains("padding: 8"), "{residual}");
    }

    #[test]
    fn module_const_object_spreads_flatten_in_source_order() {
        let source = r#"
            import * as stylex from '@stylexjs/stylex'
            import { View } from '@hozo/core'
            const inset = { padding: 8 }
            const shared = { ...inset, opacity: 0.5, scrollbarColor: 'red blue' }
            const styles = stylex.create({
              root: { ...shared, ...{ marginTop: 4 }, opacity: 0.75 }
            })
            const card = <View {...stylex.props(styles.root)} />
        "#;
        let parsed = crate::parse_tsx(source);
        let node = &parsed.roots[0].node;
        assert_eq!(node.style.len(), 6);
        assert!(node.style.iter().any(|declaration| {
            matches!(declaration.property, StyleProperty::Opacity(0.75))
        }));
        assert!(!node.style.iter().any(|declaration| {
            matches!(declaration.property, StyleProperty::Opacity(0.5))
        }));
        assert_eq!(node.props.stylex_residuals.len(), 1);
        let residual = node.props.stylex_residuals[0].render_expression(source);
        assert!(residual.contains("scrollbarColor: 'red blue'"), "{residual}");
        assert!(!residual.contains("opacity"), "{residual}");
        assert!(!residual.contains("padding"), "{residual}");
    }

    #[test]
    fn mutable_escaped_late_and_dynamic_object_spreads_remain_official_stylex() {
        let parsed = crate::parse_tsx(
            r#"
            import * as stylex from '@stylexjs/stylex'
            import { View } from '@hozo/core'
            let mutable = { opacity: 0.5 }
            const escaped = { opacity: 0.5 }
            escaped.opacity = 0.75
            const mutableStyles = stylex.create({ root: { ...mutable, padding: 8 } })
            const escapedStyles = stylex.create({ root: { ...escaped, padding: 8 } })
            const lateStyles = stylex.create({ root: { ...late, padding: 8 } })
            const late = { opacity: 0.5 }
            const dynamicStyles = stylex.create({ root: { ...makeStyles(), padding: 8 } })
            const one = <View {...stylex.props(mutableStyles.root)} />
            const two = <View {...stylex.props(escapedStyles.root)} />
            const three = <View {...stylex.props(lateStyles.root)} />
            const four = <View {...stylex.props(dynamicStyles.root)} />
        "#,
        );
        assert_eq!(parsed.roots.len(), 4);
        for root in &parsed.roots {
            assert!(root.node.style.is_empty());
            assert_eq!(root.node.props.passthrough.len(), 1);
        }
        assert_eq!(parsed.diagnostics.len(), 4);
        assert!(parsed.diagnostics.iter().all(|diagnostic| {
            diagnostic.code == hozo_ir::DiagnosticCode::StylexNotLowered
        }));
    }

    #[test]
    fn a_later_unconditional_style_removes_an_earlier_conditional_property() {
        let parsed = crate::parse_tsx(
            r#"
            import * as stylex from '@stylexjs/stylex'
            import { View } from '@hozo/core'
            const styles = stylex.create({
              active: { opacity: 0.5 },
              base: { opacity: 1 }
            })
            const card = <View {...stylex.props(active && styles.active, styles.base)} />
        "#,
        );
        let style = &parsed.roots[0].node.style;
        assert_eq!(style.len(), 1);
        assert_eq!(style[0].condition, Condition::Always);
    }

    #[test]
    fn unsupported_stylex_is_carried_and_diagnosed_at_the_jsx_use() {
        let parsed = crate::parse_tsx(
            r#"
            import * as stylex from '@stylexjs/stylex'
            import { View } from '@hozo/core'
            const styles = stylex.create({ root: { transform: 'translateX(calc(100% - 2px))' } })
            const card = <View {...stylex.props(styles.root)} />
        "#,
        );
        let node = &parsed.roots[0].node;
        assert_eq!(node.style.len(), 0);
        assert_eq!(node.props.passthrough.len(), 1);
        assert_eq!(parsed.diagnostics.len(), 1);
        assert_eq!(
            parsed.diagnostics[0].code,
            hozo_ir::DiagnosticCode::StylexNotLowered
        );
        assert!(parsed.diagnostics[0].span.start >= node.span.start);
    }

    #[test]
    fn supported_declarations_survive_beside_a_static_stylex_residual() {
        let source = r#"
            import * as stylex from '@stylexjs/stylex'
            import { View } from '@hozo/core'
            const styles = stylex.create({
              root: { padding: 16, scrollbarColor: 'red blue' }
            })
            const card = <View {...stylex.props(styles.root)} />
        "#;
        let parsed = crate::parse_tsx(source);
        let node = &parsed.roots[0].node;
        assert_eq!(node.style.len(), 4);
        assert!(node.props.passthrough.is_empty());
        assert_eq!(node.props.stylex_residuals.len(), 1);
        let residual = node.props.stylex_residuals[0].render_expression(source);
        assert!(residual.contains("scrollbarColor: 'red blue'"));
        assert!(!residual.contains("padding: 16"));
        assert_eq!(parsed.diagnostics.len(), 1);
        assert!(parsed.diagnostics[0].span.start >= node.span.start);
    }

    #[test]
    fn an_overlapping_residual_keeps_the_original_stylex_call_intact() {
        let parsed = crate::parse_tsx(
            r#"
            import * as stylex from '@stylexjs/stylex'
            import { View } from '@hozo/core'
            const styles = stylex.create({
              root: {
                transform: 'rotate(10deg)',
                transform: 'translateX(calc(100% - 2px))'
              }
            })
            const card = <View {...stylex.props(styles.root)} />
        "#,
        );
        let node = &parsed.roots[0].node;
        assert!(node.style.is_empty());
        assert_eq!(node.props.passthrough.len(), 1);
        assert!(node.props.stylex_residuals.is_empty());
        assert!(parsed.diagnostics[0].message.contains("cascade is not approximated"));
    }

    #[test]
    fn physical_longhand_beats_a_later_shorthand_by_stylex_priority() {
        let parsed = crate::parse_tsx(
            r#"
            import * as stylex from '@stylexjs/stylex'
            import { View } from '@hozo/core'
            const styles = stylex.create({
              all: { padding: 16 },
              top: { paddingTop: 8 }
            })
            const card = <View {...stylex.props(styles.top, styles.all)} />
        "#,
        );
        assert!(parsed.diagnostics.is_empty(), "{:?}", parsed.diagnostics);
        let style = &parsed.roots[0].node.style;
        assert!(matches!(
            style.last().map(|declaration| &declaration.property),
            Some(StyleProperty::PaddingTop(Length::Px(8.0)))
        ));
        let flattened = hozo_ir::dedupe_last_wins(
            style
                .iter()
                .map(|declaration| declaration.property.clone())
                .collect(),
        );
        assert_eq!(flattened.len(), 4);
        assert!(flattened.contains(&StyleProperty::PaddingTop(Length::Px(8.0))));
    }

    #[test]
    fn unconditional_longhand_removes_an_unreachable_conditional_shorthand_slot() {
        let parsed = crate::parse_tsx(
            r#"
            import * as stylex from '@stylexjs/stylex'
            import { View } from '@hozo/core'
            const styles = stylex.create({
              all: { padding: 16 },
              top: { paddingTop: 8 }
            })
            const card = <View {...stylex.props(styles.top, active && styles.all)} />
        "#,
        );
        assert!(parsed.diagnostics.is_empty(), "{:?}", parsed.diagnostics);
        let style = &parsed.roots[0].node.style;
        assert_eq!(style.len(), 4);
        assert_eq!(
            style
                .iter()
                .filter(|declaration| matches!(declaration.condition, Condition::Expr(_)))
                .count(),
            3
        );
        assert!(!style.iter().any(|declaration| {
            matches!(declaration.condition, Condition::Expr(_))
                && matches!(declaration.property, StyleProperty::PaddingTop(_))
        }));
    }

    #[test]
    fn the_official_four_property_priority_tiers_are_explicit() {
        assert_eq!(property_priority("padding"), 1000);
        assert_eq!(property_priority("paddingInline"), 2000);
        assert_eq!(property_priority("paddingInlineStart"), 3000);
        assert_eq!(property_priority("paddingTop"), 4000);
        assert_eq!(property_priority("paddingBlockStart"), 4000);
        assert_eq!(canonical_property("paddingBlockStart"), "paddingTop");
    }

    #[test]
    fn direction_dependent_physical_and_logical_priority_remains_explicit() {
        let parsed = crate::parse_tsx(
            r#"
            import * as stylex from '@stylexjs/stylex'
            import { View } from '@hozo/core'
            const styles = stylex.create({
              logical: { paddingInlineStart: 16 },
              physical: { paddingLeft: 8 }
            })
            const card = <View {...stylex.props(styles.logical, styles.physical)} />
        "#,
        );
        assert!(parsed.roots[0].node.style.is_empty());
        assert_eq!(
            parsed.diagnostics[0].code,
            hozo_ir::DiagnosticCode::StylexNotLowered
        );
        assert!(parsed.diagnostics[0].message.contains("runtime context"));
    }

    #[test]
    fn function_local_sheets_are_declined_until_bindings_are_scope_resolved() {
        let parsed = crate::parse_tsx(
            r#"
            import * as stylex from '@stylexjs/stylex'
            import { View } from '@hozo/core'
            function Card() {
              const styles = stylex.create({ root: { padding: 16 } })
              return <View {...stylex.props(styles.root)} />
            }
        "#,
        );
        assert!(parsed.roots[0].node.style.is_empty());
        assert_eq!(
            parsed.diagnostics[0].code,
            hozo_ir::DiagnosticCode::StylexNotLowered
        );
        assert!(parsed.diagnostics[0].message.contains("module-scope"));
    }
}
