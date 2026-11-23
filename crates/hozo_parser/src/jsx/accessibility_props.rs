//! React Native's identity, accessibility and layout props -- IDs, pointer
//! events, state, value, live region, focusable, onLayout, a heading's level
//! and a list's order -- captured for each backend to write in its own
//! spelling instead of passed through.

use hozo_ir::{ConditionExpr, Diagnostic, HeadingLevel, Primitive, PropSet, SourceSpan};
use oxc_ast::ast::{JSXAttribute, JSXAttributeValue, JSXExpression};
use oxc_span::GetSpan;

use super::props::{attribute_literal, capture_prop_expr, object_literal_keys, passthrough_prop};
use super::scope::Scope;
use super::to_expr_ref;

/// Whether `name` is one of these props on this primitive.
pub(super) fn reads(primitive: Primitive, name: &str) -> bool {
    match name {
        "testID"
        | "nativeID"
        | "pointerEvents"
        | "accessibilityState"
        | "aria-invalid"
        | "accessibilityValue"
        | "accessibilityLiveRegion"
        | "focusable"
        | "onLayout" => true,
        "level" => primitive == Primitive::Heading,
        "ordered" => primitive == Primitive::List,
        _ => false,
    }
}

pub(super) fn capture(
    name: &str,
    attr: &JSXAttribute,
    props: &mut PropSet,
    scope: &Scope,
    diagnostics: &mut Vec<Diagnostic>,
    consumed: &mut Vec<SourceSpan>,
) {
    match name {
        "testID" => capture_prop_expr(
            attr,
            &mut props.test_id,
            &mut props.passthrough,
            scope,
            diagnostics,
            consumed,
        ),
        "nativeID" => {
            // Kept as text as well as as a span: two elements sharing
            // an id break every reference to either, and the check for
            // that needs the value rather than where it was written.
            props.native_id_literal = attribute_literal(&attr.value);
            capture_prop_expr(
                attr,
                &mut props.native_id,
                &mut props.passthrough,
                scope,
                diagnostics,
                consumed,
            )
        }
        "pointerEvents" => capture_prop_expr(
            attr,
            &mut props.pointer_events,
            &mut props.passthrough,
            scope,
            diagnostics,
            consumed,
        ),
        "accessibilityState" => {
            props.accessibility_state_keys = object_literal_keys(attr);
            capture_prop_expr(
                attr,
                &mut props.accessibility_state,
                &mut props.passthrough,
                scope,
                diagnostics,
                consumed,
            )
        }
        "aria-invalid" => {
            props.aria_invalid = match &attr.value {
                Some(JSXAttributeValue::ExpressionContainer(container)) => {
                    Some(to_expr_ref(container.expression.span()))
                }
                Some(JSXAttributeValue::StringLiteral(literal)) => Some(to_expr_ref(literal.span)),
                _ => None,
            };
            props
                .passthrough
                .push(passthrough_prop(attr, scope, diagnostics, consumed));
        }
        "accessibilityValue" => {
            props.accessibility_value_keys = object_literal_keys(attr);
            capture_prop_expr(
                attr,
                &mut props.accessibility_value,
                &mut props.passthrough,
                scope,
                diagnostics,
                consumed,
            )
        }
        "accessibilityLiveRegion" => capture_prop_expr(
            attr,
            &mut props.accessibility_live_region,
            &mut props.passthrough,
            scope,
            diagnostics,
            consumed,
        ),
        "focusable" => match &attr.value {
            None => props.focusable = Some(ConditionExpr::Static(true)),
            Some(JSXAttributeValue::ExpressionContainer(container)) => {
                props.focusable = Some(match &container.expression {
                    // Read as the constant it is, so `focusable={false}`
                    // becomes `tabIndex={-1}` rather than a ternary over
                    // a literal -- and so the disabled check can tell it
                    // from an expression it cannot see into.
                    JSXExpression::BooleanLiteral(literal) => ConditionExpr::Static(literal.value),
                    expression => ConditionExpr::Ref(to_expr_ref(expression.span())),
                });
            }
            _ => props
                .passthrough
                .push(passthrough_prop(attr, scope, diagnostics, consumed)),
        },
        "onLayout" => capture_prop_expr(
            attr,
            &mut props.on_layout,
            &mut props.passthrough,
            scope,
            diagnostics,
            consumed,
        ),
        "level" => match &attr.value {
            Some(JSXAttributeValue::StringLiteral(literal)) => {
                props.heading_level = literal
                    .value
                    .parse::<u8>()
                    .ok()
                    .filter(|level| (1..=6).contains(level))
                    .map(HeadingLevel::Static);
                if props.heading_level.is_none() {
                    props
                        .passthrough
                        .push(passthrough_prop(attr, scope, diagnostics, consumed));
                }
            }
            Some(JSXAttributeValue::ExpressionContainer(container)) => {
                props.heading_level = match &container.expression {
                    JSXExpression::NumericLiteral(literal)
                        if literal.value.fract() == 0.0 && (1.0..=6.0).contains(&literal.value) =>
                    {
                        Some(HeadingLevel::Static(literal.value as u8))
                    }
                    _ => Some(HeadingLevel::Dynamic(to_expr_ref(
                        container.expression.span(),
                    ))),
                };
            }
            _ => props
                .passthrough
                .push(passthrough_prop(attr, scope, diagnostics, consumed)),
        },
        "ordered" => match &attr.value {
            None => props.list_ordered = Some(ConditionExpr::Static(true)),
            Some(JSXAttributeValue::ExpressionContainer(container)) => {
                props.list_ordered =
                    Some(ConditionExpr::Ref(to_expr_ref(container.expression.span())));
            }
            _ => props
                .passthrough
                .push(passthrough_prop(attr, scope, diagnostics, consumed)),
        },
        _ => unreachable!("only names `reads` accepted"),
    }
}
