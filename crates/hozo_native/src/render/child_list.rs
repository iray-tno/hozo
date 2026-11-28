//! An element's children, rendered in source order with their sibling
//! positions and what this element hands down to them.

use super::*;

fn node_peer_interaction_needs(node: &Node, from_ancestor: FromAncestor<'_>) -> (bool, bool, bool) {
    let mut pointer = false;
    let mut focus = false;
    let mut focus_visible = false;
    let mut scan = |condition: &Condition| {
        if condition_contains(condition, |c| {
            matches!(peer_interaction_state(c), Some("hovered" | "pressed"))
        }) {
            pointer = true;
        }
        if condition_contains(condition, |c| {
            matches!(peer_interaction_state(c), Some("focused" | "focusVisible"))
        }) {
            focus = true;
        }
        if condition_contains(condition, |c| {
            peer_interaction_state(c) == Some("focusVisible")
        }) {
            focus_visible = true;
        }
    };
    let has_child_target = node
        .children
        .iter()
        .any(|c| matches!(c, hozo_ir::Child::Node(_) | hozo_ir::Child::Verbatim { .. }));
    for decl in from_ancestor
        .direct
        .iter()
        .chain(from_ancestor.all.iter())
        .chain(node.style.iter())
    {
        if decl.condition.split_subtree().is_some() && !has_child_target {
            continue;
        }
        scan(&decl.condition);
    }
    for slot in &node.props.class_slots {
        for decl in &slot.style {
            scan(&decl.condition);
        }
    }
    (pointer, focus, focus_visible)
}

/// Every child, in source order. A `Verbatim` is re-emitted from source
/// rather than dropped; a bare string on a non-Text element gets the
/// wrapper described above. Returns `(rendered, needs_peer_scope)`.
#[allow(clippy::too_many_arguments)]
pub(super) fn render_child_list(
    node: &Node,
    component: &str,
    for_children: AncestorContext<'_>,
    child_interaction_context: bool,
    raw_text_group_query: bool,
    base_name: &str,
    position: SiblingPosition,
    parent_group_ancestor: Option<GroupAncestor<'_>>,
    parent_peers: &[PeerSibling<'_>],
    cx: &mut NativeRenderContext<'_>,
) -> (Rendered, bool) {
    let mut inner = Rendered::new(cx.source_evidence);
    // Tracks whether any earlier sibling could occupy an element position.
    // A `Verbatim` may render nothing, one element, or a hundred
    // (`{items.map(..)}`), so everything after one has no compile-time
    // position at all.
    // Both ends are decided up front, because "is anything after this one"
    // can't be answered while walking forwards.
    let is_verbatim = |c: &hozo_ir::Child| matches!(c, hozo_ir::Child::Verbatim { .. });
    let is_element = |c: &hozo_ir::Child| matches!(c, hozo_ir::Child::Node(_));
    let positions: Vec<SiblingPosition> = node
        .children
        .iter()
        .enumerate()
        .map(|(index, _)| {
            let before = &node.children[..index];
            let after = &node.children[index + 1..];
            SiblingPosition {
                first: (!before.iter().any(is_verbatim)).then(|| !before.iter().any(is_element)),
                last: (!after.iter().any(is_verbatim)).then(|| !after.iter().any(is_element)),
                ordinal: (!before.iter().any(is_verbatim))
                    .then(|| before.iter().filter(|c| is_element(c)).count() + 1),
                count: (!node.children.iter().any(is_verbatim))
                    .then(|| node.children.iter().filter(|c| is_element(c)).count()),
            }
        })
        .collect();

    let has_any_peer = node.children.iter().any(|child| {
        matches!(
            child,
            hozo_ir::Child::Node(child_node)
                if child_node.carried_classes.iter().any(|cls| cls == "peer")
        )
    });
    let has_peer_with_follower = has_any_peer
        && node.children.iter().enumerate().any(|(i, child)| {
            matches!(
                child,
                hozo_ir::Child::Node(child_node)
                    if child_node.carried_classes.iter().any(|cls| cls == "peer")
            ) && node.children[i + 1..]
                .iter()
                .any(|later| matches!(later, hozo_ir::Child::Node(_)))
        });
    let mut publish_ids: Vec<Option<usize>> = Vec::new();
    let mut publish_focus_visible: Vec<bool> = Vec::new();
    let mut needs_peer_scope = false;
    if has_any_peer {
        let child_needs: Vec<(bool, bool, bool)> = node
            .children
            .iter()
            .map(|child| match child {
                hozo_ir::Child::Node(child_node) => {
                    node_peer_interaction_needs(child_node, for_children.from_ancestor)
                }
                _ => (false, false, false),
            })
            .collect();
        publish_ids = vec![None; node.children.len()];
        publish_focus_visible = vec![false; node.children.len()];
        let mut next_peer_id = 0usize;
        for (index, child) in node.children.iter().enumerate() {
            let hozo_ir::Child::Node(child_node) = child else {
                continue;
            };
            if !child_node.carried_classes.iter().any(|cls| cls == "peer") {
                continue;
            }
            let can_pointer = interaction::owns_events(child_node);
            let can_focus = can_pointer || child_node.primitive == Primitive::TextInput;
            if !can_focus {
                continue;
            }
            let later = &child_needs[index + 1..];
            let wants_pointer = can_pointer && later.iter().any(|&(p, _, _)| p);
            let wants_focus = later.iter().any(|&(_, f, _)| f);
            let wants_fv = later.iter().any(|&(_, _, fv)| fv);
            if wants_pointer || wants_focus {
                publish_ids[index] = Some(next_peer_id);
                publish_focus_visible[index] = wants_fv;
                next_peer_id += 1;
                needs_peer_scope = true;
            }
        }
    }

    let mut preceding_peers: Vec<PeerSibling<'_>> = Vec::new();
    for (index, child) in node.children.iter().enumerate() {
        match child {
            hozo_ir::Child::Node(child_node) => {
                let child_position = positions[index];
                let peer_ctx = if has_any_peer {
                    PeerContext {
                        preceding: &preceding_peers,
                        publish_id: publish_ids[index],
                        publish_focus_visible: publish_focus_visible[index],
                        parent_has_later_peer_target: has_peer_with_follower,
                    }
                } else {
                    PeerContext::default()
                };
                inner.append(render_node(
                    child_node,
                    child_position,
                    child_interaction_context,
                    for_children,
                    peer_ctx,
                    cx,
                ));
                if has_any_peer && child_node.carried_classes.iter().any(|cls| cls == "peer") {
                    preceding_peers.push(PeerSibling {
                        node: child_node,
                        position: child_position,
                        interactive_id: publish_ids[index],
                    });
                }
            }
            hozo_ir::Child::Text(text) => {
                let text = if node.primitive == Primitive::NoBreak {
                    text.replace(' ', "\u{00A0}")
                } else {
                    text.clone()
                };
                let escaped = escape_jsx_text(&text);
                // `SvgText` holds a string itself, so wrapping one in React
                // Native's `Text` puts a text node where an SVG element
                // belongs -- the string vanishes rather than rendering.
                // The wrapper exists because a bare string inside a `View`
                // crashes; inside `<Svg.Text>` there is nothing to fix.
                let holds_text = renders_text(component) || component == "SvgText";
                inner.text.push_str(&if !holds_text {
                    wrap_in_text(
                        &escaped,
                        for_children.inherited,
                        base_name,
                        node,
                        position,
                        child_interaction_context,
                        raw_text_group_query,
                        parent_group_ancestor,
                        parent_peers,
                        cx,
                    )
                } else {
                    escaped
                });
            }
            hozo_ir::Child::Verbatim {
                source: expr_ref,
                nested,
            } => {
                inner.append(render_verbatim(
                    *expr_ref,
                    nested,
                    for_children.inherited,
                    child_interaction_context,
                    for_children.group_ancestor,
                    for_children.subtree_report,
                    cx,
                ));
            }
        }
    }
    (inner, needs_peer_scope)
}
