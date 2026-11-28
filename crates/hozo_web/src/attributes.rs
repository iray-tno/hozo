//! Attribute values in the source and in the output: source text, written
//! tags, condition expressions, boolean props and a meter's value text.

use crate::*;

/// Byte-slices `source` at an `ExprRef`'s span. Spans come from oxc's own
/// tokenizer over this same `source`, so they're always on UTF-8 character
/// boundaries -- not re-validated here.
/// A boolean DOM attribute, written the shortest way the value allows.
///
/// `readOnly` and nothing at all, rather than `readOnly={true}` and
/// `readOnly={false}` -- a constant known at compile time should read like
/// one in the output.
pub(super) fn boolean_attribute(
    name: &str,
    value: &hozo_ir::ConditionExpr,
    source: &str,
) -> String {
    match value {
        hozo_ir::ConditionExpr::Static(true) => format!(" {name}"),
        hozo_ir::ConditionExpr::Static(false) => String::new(),
        other => format!(" {name}={{{}}}", render_condition_expr(source, other)),
    }
}

/// Whether this `TextInput` becomes a `<textarea>` rather than an
/// `<input>`.
///
/// React Native switches on a prop; the DOM switches on the element, and
/// there is no `multiline` attribute to fall back to. So a `multiline`
/// whose value isn't known until runtime cannot be answered here -- one
/// element has to be written into the file -- and `markup.rs` reports it
/// rather than picking the one that happens to be right half the time.
pub(super) fn is_textarea(node: &Node) -> bool {
    matches!(
        node.props.text_input.multiline,
        Some(hozo_ir::ConditionExpr::Static(true))
    )
}

pub(super) fn source_text(source: &str, expr_ref: hozo_ir::ExprRef) -> std::borrow::Cow<'_, str> {
    // Reads a captured attribute's plan slot while its element renders.
    hozo_ir::attribute_capture::text(source, expr_ref.0.start as usize, expr_ref.0.end as usize)
}

/// The tag name as the author wrote it, read off the element's own span.
///
/// `<ButtonPrimitive ...>` is `ButtonPrimitive`, not `Button`. A lowering
/// that keeps the component has to name the binding that is in scope, and an
/// import alias is ordinary in any file that wraps a primitive -- which is
/// every file in a styled component library. Emitting the canonical name
/// there produces a free identifier, and a free identifier in a component
/// position renders nothing and says nothing (#653).
pub(super) fn written_tag(source: &str, span: hozo_ir::SourceSpan) -> Option<&str> {
    let text = source.get(span.start as usize..span.end as usize)?;
    let rest = text.strip_prefix('<')?;
    let end = rest.find(|c: char| !(c.is_alphanumeric() || c == '_' || c == '$' || c == '.'))?;
    let name = &rest[..end];
    if name.is_empty() {
        None
    } else {
        Some(name)
    }
}

/// Re-emits a `ConditionExpr` as a JS boolean expression by splicing the
/// original source at each leaf `Ref`'s span -- the compiler never
/// evaluates these, only reconstructs them with real `&&`/`||`/`!`
/// wrapping the *combinator structure* it built (see hozo_parser's
/// `dynamic_class` module), not anything it parsed out of the leaves
/// themselves.
/// The value half of a JSX attribute, as written.
///
/// `PassthroughProp::span` covers the whole attribute, and a prop whose
/// value is an expression has to be re-emitted inside one -- so the name
/// and the `=` have to come off. The first `=` is always the separator,
/// since an attribute name cannot contain one, and the braces come off
/// because what is wanted is an expression rather than a JSX value.
///
/// A boolean shorthand (`<Link external>`) has no `=` at all and reads as
/// `true`, which is what JSX means by it.
pub(super) fn attribute_value_source(source: &str, span: hozo_ir::ExprRef) -> String {
    attribute_value_slice(source, span)
        .map_or_else(|| "true".to_string(), std::borrow::Cow::into_owned)
}

/// Read off the source itself, then substituted: the value's range is the
/// source's, and a captured value (#1879) is replaced only as a whole.
pub(super) fn attribute_value_slice(
    source: &str,
    span: hozo_ir::ExprRef,
) -> Option<std::borrow::Cow<'_, str>> {
    let text = &source[span.0.start as usize..span.0.end as usize];
    let (_, value) = text.split_once('=')?;
    let value = value.trim();
    let value = value
        .strip_prefix('{')
        .and_then(|rest| rest.strip_suffix('}'))
        .unwrap_or(value)
        .trim();
    let start = value.as_ptr() as usize - source.as_ptr() as usize;
    Some(hozo_ir::attribute_capture::text(
        source,
        start,
        start + value.len(),
    ))
}
pub(super) fn render_condition_expr(source: &str, expr: &hozo_ir::ConditionExpr) -> String {
    use hozo_ir::ConditionExpr;
    match expr {
        ConditionExpr::Static(value) => value.to_string(),
        ConditionExpr::Ref(r) => source_text(source, *r).to_string(),
        ConditionExpr::StateDisabled(r) => {
            format!("({})?.disabled === true", source_text(source, *r))
        }
        ConditionExpr::Captured(capture) => format!(
            "{}[{}]",
            hozo_ir::ClassEvaluation::binding(source, capture.plan),
            capture.index
        ),
        ConditionExpr::ClassConflict(conflict) => {
            let value = match &conflict.capture {
                Some(capture) => format!(
                    "{}[{}]",
                    hozo_ir::ClassEvaluation::binding(source, capture.plan),
                    capture.index
                ),
                None => format!("({})", source_text(source, conflict.reference)),
            };
            format!("/{}/.test({})", conflict.pattern, value)
        }
        ConditionExpr::RawJs(expr) => expr.clone(),
        ConditionExpr::Not(inner) => format!("!({})", render_condition_expr(source, inner)),
        ConditionExpr::And(a, b) => {
            format!(
                "({}) && ({})",
                render_condition_expr(source, a),
                render_condition_expr(source, b)
            )
        }
        ConditionExpr::Or(a, b) => {
            format!(
                "({}) || ({})",
                render_condition_expr(source, a),
                render_condition_expr(source, b)
            )
        }
    }
}

/// `aria-valuetext` for a `<meter>`: its amount as a percentage of its range,
/// which is 0 to 1 when left out, clamped the way the element clamps it.
pub(super) fn meter_value_text(node: &Node, source: &str) -> Option<String> {
    let authored = |name: &str| -> Option<String> {
        node.props
            .passthrough
            .iter()
            .filter(|prop| prop.name.as_deref() == Some(name))
            .find_map(|prop| {
                let text = &source[prop.span.0.start as usize..prop.span.0.end as usize];
                let value = text.split_once('=')?.1.trim();
                value
                    .strip_prefix('{')
                    .and_then(|inner| inner.strip_suffix('}'))
                    .map(|inner| {
                        hozo_ir::attribute_capture::slice(source, inner.trim()).into_owned()
                    })
                    .or_else(|| {
                        value
                            .strip_prefix('"')?
                            .strip_suffix('"')
                            .map(str::to_string)
                    })
            })
    };
    let now = authored("value")?;
    let min = authored("min").unwrap_or_else(|| "0".to_string());
    let max = authored("max").unwrap_or_else(|| "1".to_string());
    let literal = |text: &str| text.parse::<f64>().ok();
    Some(match (literal(&now), literal(&min), literal(&max)) {
        (Some(now), Some(min), Some(max)) => {
            let fraction = if max > min { ((now - min) / (max - min)).clamp(0.0, 1.0) } else { 0.0 };
            format!("'{}%'", (fraction * 100.0).round() as i64)
        }
        _ => format!(
            "`${{Math.round(Math.min(Math.max((({now}) - ({min})) / (({max}) - ({min})), 0), 1) * 100)}}%`"
        ),
    })
}
