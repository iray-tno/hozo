//! Authored expressions and conditions written back out as JavaScript.

use hozo_ir::{ConditionExpr, ExprRef};

/// Byte-slices `source` at an `ExprRef`'s span. Spans come from oxc's own
/// tokenizer over this same `source`, so they're always on UTF-8 character
/// boundaries -- not re-validated here.
pub(super) fn source_text(source: &str, expr_ref: ExprRef) -> std::borrow::Cow<'_, str> {
    // Reads a captured attribute's plan slot while its element renders.
    hozo_ir::attribute_capture::text(source, expr_ref.0.start as usize, expr_ref.0.end as usize)
}

/// Re-emits a `ConditionExpr` as a JS boolean expression by splicing the
/// original source at each leaf `Ref`'s span, reconstructed with real
/// `&&`/`||`/`!` matching the combinator structure the compiler built
/// (see hozo_parser's `dynamic_class` module) -- never anything parsed
/// out of the leaves themselves.
pub(super) fn render_condition_expr(source: &str, expr: &ConditionExpr) -> String {
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

/// A boolean prop, in the shortest spelling its value allows.
///
/// `multiline` rather than `multiline={true}`, which is what the author
/// wrote and what React Native's own code reads like.
pub(super) fn native_flag(name: &str, value: &ConditionExpr, source: &str) -> String {
    match value {
        ConditionExpr::Static(true) => format!(" {name}"),
        ConditionExpr::Static(false) => format!(" {name}={{false}}"),
        other => format!(" {name}={{{}}}", render_condition_expr(source, other)),
    }
}

pub(super) fn escape_jsx_text(text: &str) -> String {
    text.replace('{', "&#123;").replace('}', "&#125;")
}

/// A style key for a guard, from its shape as well as its spans.
///
/// Spans alone named `selected` and `!selected` alike, so the two branches
/// of `selected ? 'a' : 'b'` became one duplicated key in the style object,
/// and the second branch won on both sides of the ternary.
pub(super) fn expr_key(expr: &ConditionExpr) -> String {
    match expr {
        ConditionExpr::Static(value) => value.to_string(),
        ConditionExpr::Ref(r) => format!("{}_{}", r.0.start, r.0.end),
        ConditionExpr::StateDisabled(r) => format!("state_disabled_{}_{}", r.0.start, r.0.end),
        ConditionExpr::Captured(capture) => {
            format!("{}_{}", capture.reference.0.start, capture.reference.0.end)
        }
        ConditionExpr::ClassConflict(conflict) => {
            let slug: String = conflict
                .group
                .chars()
                .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
                .collect();
            format!(
                "conflict_{}_{}_{}",
                conflict.reference.0.start, conflict.reference.0.end, slug
            )
        }
        ConditionExpr::Not(inner) => format!("not_{}", expr_key(inner)),
        ConditionExpr::And(a, b) => format!("{}_and_{}", expr_key(a), expr_key(b)),
        ConditionExpr::Or(a, b) => format!("{}_or_{}", expr_key(a), expr_key(b)),
    }
}
