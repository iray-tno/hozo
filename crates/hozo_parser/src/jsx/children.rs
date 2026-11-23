//! An element's children, built in source order.

use hozo_ir::{Child, Diagnostic, SourceSpan};
use oxc_ast::ast::{JSXChild, JSXElement};
use oxc_span::GetSpan;

use super::build::build_node;
use super::props::carry_verbatim;
use super::scope::Scope;
use super::text::{clean_jsx_text, decode_jsx_entities};

/// Every child, in source order. Anything the compiler doesn't model
/// becomes `Child::Verbatim` and is re-emitted from source rather than
/// dropped -- an unmodeled component, an expression container, a
/// fragment, a child spread.
pub(super) fn build_children(
    el: &JSXElement,
    scope: &Scope,
    diagnostics: &mut Vec<Diagnostic>,
    consumed: &mut Vec<SourceSpan>,
) -> Vec<Child> {
    let mut children: Vec<Child> = Vec::new();
    for child in &el.children {
        match child {
            JSXChild::Element(child_el) => {
                match build_node(child_el, scope, diagnostics, consumed, true) {
                    Some(child_node) => children.push(Child::Node(child_node)),
                    // A component Hozo doesn't model still renders, and
                    // still occupies a position among its siblings.
                    None => children.push(carry_verbatim(
                        child,
                        child_el.span(),
                        scope,
                        diagnostics,
                        consumed,
                    )),
                }
            }
            JSXChild::Text(t) => {
                let cleaned = decode_jsx_entities(&clean_jsx_text(t.value.as_str()));
                if !cleaned.is_empty() {
                    children.push(Child::Text(cleaned));
                }
            }
            other => children.push(carry_verbatim(
                other,
                other.span(),
                scope,
                diagnostics,
                consumed,
            )),
        }
    }
    children
}
