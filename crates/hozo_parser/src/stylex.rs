//! Static StyleX frontend.
//!
//! This reads one useful vertical slice rather than impersonating the full
//! StyleX compiler: same-file namespace imports, `stylex.create({ ... })`,
//! and `stylex.props(styles.base, condition && styles.active)`. Values become
//! the typed `StyleProperty` variants the Tailwind frontend already produces,
//! so the Web and Native lowerings remain shared.

use std::collections::{HashMap, HashSet};

use hozo_ir::{
    Color, Condition, ConditionExpr, Dimension, ExprRef, Length, SourceSpan, StyleDeclaration,
    StyleProperty,
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
    properties: Vec<StyleProperty>,
    span: SourceSpan,
}

struct ResolvedEntry {
    css_name: String,
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

/// CSS shorthands and longhands StyleX assigns different atomic priorities.
/// Typed Hozo properties make most physical overlaps visible through
/// `same_property_as`; logical/physical pairs and `gap` need the family too.
fn priority_family(property: &str) -> Option<&'static str> {
    if property.starts_with("padding") {
        Some("padding")
    } else if property.starts_with("margin") {
        Some("margin")
    } else if matches!(property, "gap" | "rowGap" | "columnGap") {
        Some("gap")
    } else if property == "borderRadius" || property.ends_with("Radius") {
        Some("border-radius")
    } else {
        None
    }
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
            css_name: name,
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
            // StyleX gives shorthands and longhands different atomic
            // priorities. Hozo can preserve either, but must not pretend its
            // ordinary condition specificity is the same priority system.
            // Refuse only the overlapping combination until the IR carries
            // that priority explicitly.
            if out.iter().any(|existing| {
                existing.css_name != entry.css_name
                    && (entry
                        .properties
                        .iter()
                        .any(|property| property.same_property_as(&existing.declaration.property))
                        || priority_family(&entry.css_name).is_some_and(|family| {
                            priority_family(&existing.css_name) == Some(family)
                        }))
            }) {
                return Err(Gap {
                    message: format!(
                        "StyleX `{}` overlaps a shorthand or longhand in the same `props` call; preserving StyleX's atomic priority needs the planned priority-aware IR.",
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
        Resolution::Ready(
            declarations
                .into_iter()
                .map(|entry| entry.declaration)
                .collect(),
        )
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
            const styles = stylex.create({ root: { transform: 'rotate(10deg)' } })
        "#,
        );
        assert!(matches!(frontend.sheets["styles"]["root"], Rule::Gap(_)));
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
            const styles = stylex.create({ root: { transform: 'rotate(10deg)' } })
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
    fn shorthand_longhand_overlap_is_refused_instead_of_changing_stylex_priority() {
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
        assert!(parsed.roots[0].node.style.is_empty());
        assert_eq!(
            parsed.diagnostics[0].code,
            hozo_ir::DiagnosticCode::StylexNotLowered
        );
        assert!(parsed.diagnostics[0].message.contains("atomic priority"));
    }

    #[test]
    fn logical_and_axis_longhands_are_part_of_the_same_priority_families() {
        for (shorthand, longhand) in [
            ("padding", "paddingInlineStart"),
            ("margin", "marginInlineEnd"),
            ("gap", "rowGap"),
            ("borderRadius", "borderTopLeftRadius"),
        ] {
            assert_eq!(priority_family(shorthand), priority_family(longhand));
        }
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
