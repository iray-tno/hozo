//! Text reads interaction state from its nearest Pressable, not from itself.
//! Discover that requirement before choosing the owner's runtime component.

use super::*;
use hozo_ir::Child;

pub(super) fn uses_focus_visible(condition: &Condition) -> bool {
    condition_contains(condition, |condition| {
        focus_state(condition) == Some("focusVisible")
            || matches!(condition, Condition::Group(inner) if group_state(inner, true) == Some("focusVisible"))
    })
}

pub(super) fn uses_interaction(condition: &Condition) -> bool {
    condition_contains(condition, |condition| {
        matches!(condition, Condition::Hover | Condition::Pressed)
            || focus_state(condition).is_some()
            || matches!(condition, Condition::Group(inner) if group_state(inner, true).is_some())
    })
}

/// Scan only when choosing an interaction owner. Nested owners stop the
/// search: their Text consumes a different context. Opaque JSX has no modeled
/// declarations to invent a requirement from, but modeled expression/prop
/// children use the same context as ordinary JSX children.
pub(super) fn descendant_uses(node: &Node, predicate: fn(&Condition) -> bool) -> bool {
    fn visit(node: &Node, predicate: fn(&Condition) -> bool) -> bool {
        if matches!(node.primitive, Primitive::Pressable | Primitive::Button) {
            return false;
        }
        node.style.iter().any(|declaration| {
            (text::is_text_primitive(node.primitive)
                || text::is_text_property(&declaration.property))
                && predicate(&declaration.condition)
        }) || descendant_uses(node, predicate)
    }

    node.children.iter().any(|child| match child {
        Child::Node(child) => visit(child, predicate),
        Child::Verbatim { nested, .. } => nested.iter().any(|child| visit(&child.node, predicate)),
        Child::Text(_) => false,
    }) || node.props.passthrough.iter().any(|prop| {
        prop.nested.iter().any(|child| visit(&child.node, predicate))
    })
}
