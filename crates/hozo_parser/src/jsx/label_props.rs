//! An element's accessible name and hint, in either platform's spelling, and
//! an image's source, default source and `alt`.

use hozo_ir::{Diagnostic, Primitive, PropSet, SourceSpan};
use oxc_ast::ast::{JSXAttribute, JSXAttributeValue};
use oxc_span::GetSpan;

use super::props::{capture_prop_expr, passthrough_prop};
use super::scope::Scope;
use super::to_expr_ref;

/// Whether `name` is a label, hint or image prop this primitive captures.
pub(super) fn reads(primitive: Primitive, name: &str) -> bool {
    match name {
        "accessibilityLabel" | "aria-label" | "accessibilityHint" | "aria-description" => true,
        "src" | "defaultSource" | "alt" => primitive == Primitive::Image,
        _ => false,
    }
}

/// Both spellings are accepted and neither is passed through:
/// the two platforms name this prop differently, so the value is
/// captured here and each backend writes it under its own name.
/// Re-emitting the source spelling verbatim would put
/// `accessibilityLabel` on a DOM `<input>`, where React drops it
/// and the field ends up with no accessible name at all -- the
/// exact failure the diagnostic exists to prevent.
///
/// The *value* is never touched. Hozo diagnoses the absence of
/// a name and never invents or rewrites one: a name guessed from
/// a placeholder or a nearby heading is how a field comes to be
/// announced as something it isn't, which is worse than being
/// announced as nothing.
pub(super) fn capture(
    name: &str,
    attr: &JSXAttribute,
    props: &mut PropSet,
    scope: &Scope,
    diagnostics: &mut Vec<Diagnostic>,
    consumed: &mut Vec<SourceSpan>,
) {
    match name {
        "accessibilityLabel" | "aria-label" => match &attr.value {
            Some(JSXAttributeValue::ExpressionContainer(container)) => {
                props.accessibility_label = Some(to_expr_ref(container.expression.span()));
            }
            Some(JSXAttributeValue::StringLiteral(literal)) => {
                props.accessibility_label = Some(to_expr_ref(literal.span));
            }
            _ => props
                .passthrough
                .push(passthrough_prop(attr, scope, diagnostics, consumed)),
        },
        "accessibilityHint" | "aria-description" => match &attr.value {
            Some(JSXAttributeValue::ExpressionContainer(container)) => {
                props.accessibility_hint = Some(to_expr_ref(container.expression.span()));
            }
            Some(JSXAttributeValue::StringLiteral(literal)) => {
                props.accessibility_hint = Some(to_expr_ref(literal.span));
            }
            _ => props
                .passthrough
                .push(passthrough_prop(attr, scope, diagnostics, consumed)),
        },
        "src" => match &attr.value {
            Some(JSXAttributeValue::ExpressionContainer(container)) => {
                props.image_src = Some(to_expr_ref(container.expression.span()));
            }
            Some(JSXAttributeValue::StringLiteral(literal)) => {
                props.image_src = Some(to_expr_ref(literal.span));
            }
            _ => props
                .passthrough
                .push(passthrough_prop(attr, scope, diagnostics, consumed)),
        },
        "defaultSource" => capture_prop_expr(
            attr,
            &mut props.image_default_source,
            &mut props.passthrough,
            scope,
            diagnostics,
            consumed,
        ),
        "alt" => match &attr.value {
            Some(JSXAttributeValue::ExpressionContainer(container)) => {
                props.accessibility_label = Some(to_expr_ref(container.expression.span()));
            }
            Some(JSXAttributeValue::StringLiteral(literal)) => {
                props.accessibility_label = Some(to_expr_ref(literal.span));
            }
            _ => props
                .passthrough
                .push(passthrough_prop(attr, scope, diagnostics, consumed)),
        },
        _ => unreachable!("only names `reads` accepted"),
    }
}
