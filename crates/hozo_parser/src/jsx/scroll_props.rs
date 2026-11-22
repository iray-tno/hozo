//! A scroll container's props -- `ScrollView` and `FlatList`, and a
//! `RefreshControl`'s two -- captured for each backend to write in its own
//! spelling instead of passed through.

use hozo_ir::{ConditionExpr, Diagnostic, Primitive, PropSet, SourceSpan};
use oxc_ast::ast::{JSXAttribute, JSXAttributeValue};
use oxc_span::GetSpan;

use super::props::{capture_prop_expr, passthrough_prop};
use super::scope::Scope;
use super::to_expr_ref;

/// Whether `name` is a scroll prop this primitive captures.
pub(super) fn reads(primitive: Primitive, name: &str) -> bool {
    match name {
        "refreshing" | "onRefresh" => matches!(
            primitive,
            Primitive::ScrollView | Primitive::FlatList | Primitive::RefreshControl
        ),
        "onScroll"
        | "scrollEventThrottle"
        | "horizontal"
        | "keyboardShouldPersistTaps"
        | "showsVerticalScrollIndicator"
        | "showsHorizontalScrollIndicator" => {
            matches!(primitive, Primitive::ScrollView | Primitive::FlatList)
        }
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
        "onScroll" => capture_prop_expr(
            attr,
            &mut props.on_scroll,
            &mut props.passthrough,
            scope,
            diagnostics,
            consumed,
        ),
        "scrollEventThrottle" => capture_prop_expr(
            attr,
            &mut props.scroll_event_throttle,
            &mut props.passthrough,
            scope,
            diagnostics,
            consumed,
        ),
        "horizontal" => match &attr.value {
            None => props.scroll_horizontal = Some(ConditionExpr::Static(true)),
            Some(JSXAttributeValue::ExpressionContainer(container)) => {
                props.scroll_horizontal =
                    Some(ConditionExpr::Ref(to_expr_ref(container.expression.span())));
            }
            _ => props
                .passthrough
                .push(passthrough_prop(attr, scope, diagnostics, consumed)),
        },
        "refreshing" => match &attr.value {
            None => props.refreshing = Some(ConditionExpr::Static(true)),
            Some(JSXAttributeValue::ExpressionContainer(container)) => {
                props.refreshing =
                    Some(ConditionExpr::Ref(to_expr_ref(container.expression.span())));
            }
            _ => props
                .passthrough
                .push(passthrough_prop(attr, scope, diagnostics, consumed)),
        },
        "onRefresh" => match &attr.value {
            Some(JSXAttributeValue::ExpressionContainer(container)) => {
                props.on_refresh = Some(to_expr_ref(container.expression.span()));
            }
            _ => props
                .passthrough
                .push(passthrough_prop(attr, scope, diagnostics, consumed)),
        },
        "keyboardShouldPersistTaps" => match &attr.value {
            Some(JSXAttributeValue::ExpressionContainer(container)) => {
                props.keyboard_should_persist_taps = Some(to_expr_ref(container.expression.span()));
            }
            Some(JSXAttributeValue::StringLiteral(literal)) => {
                props.keyboard_should_persist_taps = Some(to_expr_ref(literal.span));
            }
            _ => props
                .passthrough
                .push(passthrough_prop(attr, scope, diagnostics, consumed)),
        },
        "showsVerticalScrollIndicator" => match &attr.value {
            None => props.shows_vertical_scroll_indicator = Some(ConditionExpr::Static(true)),
            Some(JSXAttributeValue::ExpressionContainer(container)) => {
                props.shows_vertical_scroll_indicator =
                    Some(ConditionExpr::Ref(to_expr_ref(container.expression.span())));
            }
            _ => props
                .passthrough
                .push(passthrough_prop(attr, scope, diagnostics, consumed)),
        },
        "showsHorizontalScrollIndicator" => match &attr.value {
            None => props.shows_horizontal_scroll_indicator = Some(ConditionExpr::Static(true)),
            Some(JSXAttributeValue::ExpressionContainer(container)) => {
                props.shows_horizontal_scroll_indicator =
                    Some(ConditionExpr::Ref(to_expr_ref(container.expression.span())));
            }
            _ => props
                .passthrough
                .push(passthrough_prop(attr, scope, diagnostics, consumed)),
        },
        _ => unreachable!("checked by `reads`"),
    }
}
