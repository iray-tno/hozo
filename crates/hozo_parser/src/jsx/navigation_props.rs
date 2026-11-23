//! A destination's navigation flags, `replace` and `prefetch`, captured on
//! the primitives that navigate.

use hozo_ir::{Diagnostic, Primitive, PropSet, SourceSpan, SvgElement};
use oxc_ast::ast::JSXAttribute;

use super::props::capture_flag;
use super::scope::Scope;

/// Whether `name` is a navigation flag this primitive captures.
pub(super) fn reads(primitive: Primitive, name: &str) -> bool {
    matches!(name, "replace" | "prefetch")
        && matches!(
            primitive,
            Primitive::Link
                | Primitive::Button
                | Primitive::Pressable
                | Primitive::Svg(SvgElement::Link)
        )
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
        "replace" => capture_flag(
            attr,
            &mut props.navigation_replace,
            &mut props.passthrough,
            scope,
            diagnostics,
            consumed,
        ),
        "prefetch" => capture_flag(
            attr,
            &mut props.navigation_prefetch,
            &mut props.passthrough,
            scope,
            diagnostics,
            consumed,
        ),
        _ => unreachable!("only names `reads` accepted"),
    }
}
