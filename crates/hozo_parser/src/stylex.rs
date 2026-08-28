//! Static StyleX frontend.
//!
//! This reads one useful vertical slice rather than impersonating the full
//! StyleX compiler: same-file namespace imports, `stylex.create({ ... })`,
//! and `stylex.props(styles.base, condition && styles.active)`. Values become
//! the typed `StyleProperty` variants the Tailwind frontend already produces,
//! so the Web and Native lowerings remain shared.

use std::collections::{HashMap, HashSet};

use hozo_ir::{
    Angle, Color, Condition, ConditionExpr, Dimension, ExprRef, GridLine, GridSpan, GridTracks,
    Length, Radius, SourceSpan, StyleDeclaration, StyleProperty, TransformFunction,
};
use oxc_ast::ast::{
    Argument, ArrowFunctionExpression, BindingPattern, CallExpression, Expression, Function,
    LogicalOperator, ObjectExpression, ObjectPropertyKind, PropertyKey, VariableDeclarator,
};
use oxc_ast_visit::{
    walk::{walk_arrow_function_expression, walk_function, walk_variable_declarator},
    Visit,
};
use oxc_span::{GetSpan, Span};
use oxc_syntax::module_record::ModuleRecord;
use oxc_syntax::scope::ScopeFlags;

use crate::tailwind;

const STYLEX_MODULE: &str = "@stylexjs/stylex";

#[derive(Debug, Clone)]
struct Gap {
    message: String,
    span: SourceSpan,
}

#[derive(Debug, Clone)]
enum Rule {
    Ready(Vec<Entry>),
    Gap(Gap),
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
        "fontWeight" => raw("font"),
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
            | "insetBlock"
            | "insetInline"
            | "marginBlock"
            | "marginInline"
            | "overflow"
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

fn parse_rule(expression: &Expression) -> Result<Vec<Entry>, Gap> {
    let Expression::ObjectExpression(object) = expression else {
        return Err(Gap {
            message: "StyleX style entries must be static object literals.".to_string(),
            span: source_span(expression.span()),
        });
    };
    let mut out = Vec::new();
    for item in &object.properties {
        let ObjectPropertyKind::ObjectProperty(property) = item else {
            return Err(Gap {
                message: "StyleX object spreads are not in Hozo's static subset yet.".to_string(),
                span: source_span(item.span()),
            });
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
            return Err(Gap {
                message: format!(
                    "`{name}` has a dynamic or nested StyleX value; this frontend slice accepts static strings and numbers."
                ),
                span: source_span(property.value.span()),
            });
        };
        let properties = match direct_properties(&name, &value) {
            Some(properties) => properties,
            None => {
                let Some(token) = token_for(&name, &value) else {
                    return Err(Gap {
                        message: format!(
                            "StyleX property `{name}` or its value is not in Hozo's typed universal subset yet."
                        ),
                        span: source_span(property.span),
                    });
                };
                let (condition, properties) = tailwind::expand_utility(&token);
                if condition != Condition::Always || properties.is_empty() {
                    return Err(Gap {
                        message: format!(
                            "StyleX property `{name}` could not become a typed Hozo style without losing meaning."
                        ),
                        span: source_span(property.span),
                    });
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
    Ok(out)
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

struct SheetCollector<'n> {
    namespaces: &'n HashSet<String>,
    sheets: HashMap<String, HashMap<String, Rule>>,
    scan_spans: Vec<SourceSpan>,
    function_depth: usize,
}

impl<'a> Visit<'a> for SheetCollector<'_> {
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
            let rule = match parse_rule(&property.value) {
                Ok(properties) => Rule::Ready(properties),
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
        let (sheets, scan_spans) = {
            let mut collector = SheetCollector {
                namespaces: &namespaces,
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

    fn is_props_call(&self, call: &CallExpression) -> bool {
        let Expression::StaticMemberExpression(member) = &call.callee else {
            return false;
        };
        let Expression::Identifier(object) = &member.object else {
            return false;
        };
        member.property.name.as_str() == "props" && self.namespaces.contains(object.name.as_str())
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

    fn append_rule(
        &self,
        rule: &Rule,
        condition: Condition,
        out: &mut Vec<ResolvedEntry>,
    ) -> Result<(), Gap> {
        let Rule::Ready(entries) = rule else {
            let Rule::Gap(gap) = rule else { unreachable!() };
            return Err(gap.clone());
        };
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

    pub(crate) fn resolve_props(&self, expression: &Expression) -> Resolution {
        let Expression::CallExpression(call) = expression else {
            return Resolution::NotStylex;
        };
        if !self.is_props_call(call) {
            return Resolution::NotStylex;
        }
        let mut declarations = Vec::new();
        for argument in &call.arguments {
            let result = match argument {
                Argument::StaticMemberExpression(member) => self
                    .rule_from_member(member)
                    .and_then(|rule| self.append_rule(rule, Condition::Always, &mut declarations))
                    .map_err(|gap| Gap { span: source_span(member.span), ..gap }),
                Argument::LogicalExpression(logical) if logical.operator == LogicalOperator::And => {
                    let Expression::StaticMemberExpression(member) = &logical.right else {
                        return Resolution::Gap {
                            message: "The right side of a conditional StyleX argument must be `styles.rule`.".to_string(),
                            span: source_span(logical.right.span()),
                        };
                    };
                    let condition = Condition::Expr(ConditionExpr::Ref(ExprRef(source_span(logical.left.span()))));
                    self.rule_from_member(member)
                        .and_then(|rule| self.append_rule(rule, condition, &mut declarations))
                        .map_err(|gap| Gap { span: source_span(member.span), ..gap })
                }
                Argument::BooleanLiteral(literal) if !literal.value => Ok(()),
                Argument::NullLiteral(_) => Ok(()),
                other => Err(Gap {
                    message: "Hozo currently accepts `styles.rule`, falsy values, and `condition && styles.rule` in `stylex.props`.".to_string(),
                    span: source_span(other.span()),
                }),
            };
            if let Err(gap) = result {
                return Resolution::Gap {
                    message: gap.message,
                    span: gap.span,
                };
            }
        }
        Resolution::Ready(resolve_property_priority(declarations))
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
        let Rule::Ready(entries) = &frontend.sheets["styles"]["root"] else {
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
        assert!(matches!(frontend.sheets["styles"]["root"], Rule::Gap(_)));
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
        let Rule::Ready(entries) = &frontend.sheets["styles"]["root"] else {
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
        let Rule::Ready(grid) = &frontend.sheets["styles"]["grid"] else {
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
        let Rule::Ready(span) = &frontend.sheets["styles"]["span"] else {
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
        let Rule::Ready(lines) = &frontend.sheets["styles"]["lines"] else {
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
        assert!(matches!(
            frontend.sheets["styles"]["autoTrack"],
            Rule::Gap(_)
        ));
        assert!(matches!(
            frontend.sheets["styles"]["namedLine"],
            Rule::Gap(_)
        ));
        assert!(matches!(
            frontend.sheets["styles"]["unequalSpan"],
            Rule::Gap(_)
        ));
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
