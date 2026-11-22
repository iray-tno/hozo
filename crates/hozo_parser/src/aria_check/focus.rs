//! Focusable elements hidden from assistive technology, and tab order.

use hozo_ir::{Child, ConditionExpr, Diagnostic, DiagnosticCode, Node, Severity};

use super::roles::literal;

/// Whether this element takes keyboard focus.
///
/// Only what the element itself says. A `Pressable` is focusable because
/// Hozo makes it a `<button>`; anything else needs `focusable` or a
/// `tabIndex` that is not `-1`.
pub(super) fn is_focusable(node: &Node) -> bool {
    if matches!(node.props.focusable, Some(ConditionExpr::Static(false))) {
        return false;
    }
    if node.props.focusable.is_some() || node.props.on_press.is_some() {
        return true;
    }
    matches!(literal(node, "tabIndex"), Some(value) if value != "-1")
}

/// Hidden from assistive technology, and still in the tab order.
///
/// The failure is that the two do not agree: `aria-hidden` takes a subtree
/// out of the accessibility tree, and it does not take anything out of the
/// tab order. A keyboard user tabs into a control a screen reader has been
/// told does not exist, and is told nothing about where they are -- WCAG
/// 4.1.2, and one of the most common ways a page becomes unusable while
/// looking correct.
///
/// Only when both halves are visible here. `aria-hidden` on something
/// whose children the compiler is merely carrying says nothing, the same
/// rule the rest of this file follows.
pub(super) fn check_hidden_focusable(node: &Node, diagnostics: &mut Vec<Diagnostic>) {
    let hidden = literal(node, "aria-hidden") == Some("true")
        || literal(node, "accessibilityElementsHidden") == Some("true")
        || literal(node, "importantForAccessibility") == Some("no-hide-descendants");
    if !hidden {
        return;
    }
    if !focusable_within(node) {
        return;
    }
    diagnostics.push(Diagnostic {
        code: DiagnosticCode::A11yHiddenButFocusable,
        severity: Severity::Warning,
        message: "This is hidden from assistive technology and still reachable by keyboard. \
                  `aria-hidden` takes the subtree out of the accessibility tree and leaves it \
                  in the tab order, so someone tabbing lands on a control a screen reader has \
                  been told is not there. Hide it from both -- `display: none`, or `hidden`, \
                  or `tabIndex={-1}` on what can be focused -- or from neither."
            .to_string(),
        span: node.span,
    });
}

/// Whether anything the compiler can see in this subtree takes focus.
pub(super) fn focusable_within(node: &Node) -> bool {
    if is_focusable(node) {
        return true;
    }
    node.children.iter().any(|child| match child {
        Child::Node(child_node) => focusable_within(child_node),
        // An expression the compiler is carrying may render anything,
        // including a button. Saying nothing is the answer everywhere else
        // in this file and it is the answer here.
        _ => false,
    })
}

/// A `tabIndex` above zero.
///
/// It does not order this element relative to its neighbours; it lifts it
/// in front of *every* element that has no positive one, on the whole
/// page. So one component's choice reorders documents it has never met,
/// and the order it produces depends on what else happens to be rendered.
/// `tabIndex={0}` joins the natural order and is what almost every use of
/// a positive value was reaching for.
pub(super) fn check_tab_order(node: &Node, diagnostics: &mut Vec<Diagnostic>) {
    let Some(value) = literal(node, "tabIndex") else {
        return;
    };
    let Ok(index) = value.parse::<i32>() else {
        return;
    };
    if index <= 0 {
        return;
    }
    diagnostics.push(Diagnostic {
        code: DiagnosticCode::A11yPositiveTabIndex,
        severity: Severity::Warning,
        message: format!(
            "`tabIndex={{{index}}}` puts this in front of every element on the page that has no \
             positive tabIndex, not just the ones around it -- so the tab order it produces \
             depends on what else is rendered, including from components this one has never \
             met. Use `tabIndex={{0}}` to join the natural order, and put the element where it \
             belongs in the markup."
        ),
        span: node.span,
    });
}
