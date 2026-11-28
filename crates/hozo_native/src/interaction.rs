//! Text reads interaction state from its nearest Pressable, not from itself.
//! Discover that requirement before choosing the owner's runtime component.

use super::*;
use hozo_ir::Child;

/// All canonical controls can carry the same event owner. HozoLink keeps
/// navigation and receives HozoPressable as its host only when needed.
pub(super) fn owns_events(node: &Node) -> bool {
    matches!(
        node.primitive,
        Primitive::Pressable | Primitive::Button | Primitive::Link
    )
}

pub(super) fn uses_focus_visible(condition: &Condition) -> bool {
    condition_contains(condition, |condition| {
        focus_state(condition) == Some("focusVisible")
            || group_interaction_state(condition) == Some("focusVisible")
    })
}

pub(super) fn uses_interaction(condition: &Condition) -> bool {
    condition_contains(condition, |condition| {
        uses_pressed(condition)
            || uses_hover(condition)
            || focus_state(condition).is_some()
            || group_interaction_state(condition).is_some()
    })
}

/// A `group-*:` the owner's context can answer: what makes a View, not only
/// a Text, read that context. A plain `hover:` on a View child asks about
/// the child, so it alone does not.
pub(super) fn uses_group_state(condition: &Condition) -> bool {
    condition_contains(condition, |condition| {
        group_interaction_state(condition).is_some()
    })
}

/// Scan only when choosing an interaction owner. Nested owners stop the
/// search: their Text consumes a different context. Opaque JSX has no modeled
/// declarations to invent a requirement from, but modeled expression/prop
/// children use the same context as ordinary JSX children.
pub(super) fn descendant_uses(node: &Node, predicate: fn(&Condition) -> bool) -> bool {
    fn visit(node: &Node, predicate: fn(&Condition) -> bool) -> bool {
        if owns_events(node) {
            return false;
        }
        let has_child_target = node
            .children
            .iter()
            .any(|c| matches!(c, Child::Node(_) | Child::Verbatim { .. }));
        node.style.iter().any(|declaration| {
            if declaration.condition.split_subtree().is_some() && !has_child_target {
                return false;
            }
            (text::is_text_primitive(node.primitive)
                || text::is_text_property(&declaration.property)
                || (node.primitive == Primitive::View && uses_group_state(&declaration.condition)))
                && predicate(&declaration.condition)
        }) || descendant_uses(node, predicate)
    }

    node.children.iter().any(|child| match child {
        Child::Node(child) => visit(child, predicate),
        Child::Verbatim { nested, .. } => nested.iter().any(|child| visit(&child.node, predicate)),
        Child::Text(_) => false,
    }) || node.props.passthrough.iter().any(|prop| {
        prop.nested
            .iter()
            .any(|child| visit(&child.node, predicate))
    })
}

/// Whether `node` contains a focusable descendant (`Pressable`, `Button`, `Link`,
/// `TextInput`) or an opaque expression/component child that may render one.
pub(super) fn has_focusable_descendant(node: &Node) -> bool {
    if matches!(node.primitive, Primitive::TextInput | Primitive::Image) {
        return false;
    }
    fn visit(node: &Node) -> bool {
        owns_events(node)
            || node.primitive == Primitive::TextInput
            || has_focusable_descendant(node)
    }
    node.children.iter().any(|child| match child {
        Child::Node(child) => visit(child),
        Child::Verbatim { .. } => true,
        Child::Text(_) => false,
    }) || node
        .props
        .passthrough
        .iter()
        .any(|prop| prop.nested.iter().any(|child| visit(&child.node)))
}

/// Whether `node` contains a hoverable/pressable descendant (`Pressable`, `Button`,
/// `Link`) or an opaque expression/component child that may render one.
pub(super) fn has_hoverable_descendant(node: &Node) -> bool {
    if matches!(node.primitive, Primitive::TextInput | Primitive::Image) {
        return false;
    }
    fn visit(node: &Node) -> bool {
        owns_events(node) || has_hoverable_descendant(node)
    }
    node.children.iter().any(|child| match child {
        Child::Node(child) => visit(child),
        Child::Verbatim { .. } => true,
        Child::Text(_) => false,
    }) || node
        .props
        .passthrough
        .iter()
        .any(|prop| prop.nested.iter().any(|child| visit(&child.node)))
}
