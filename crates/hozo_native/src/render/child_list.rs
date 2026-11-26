//! An element's children, rendered in source order with their sibling
//! positions and what this element hands down to them.

use super::*;

/// Every child, in source order. A `Verbatim` is re-emitted from source
/// rather than dropped; a bare string on a non-Text element gets the
/// wrapper described above.
#[allow(clippy::too_many_arguments)]
pub(super) fn render_child_list(
    node: &Node,
    component: &str,
    for_children: AncestorContext<'_>,
    child_interaction_context: bool,
    base_name: &str,
    position: SiblingPosition,
    parent_group_ancestor: Option<GroupAncestor<'_>>,
    cx: &mut NativeRenderContext<'_>,
) -> Rendered {
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
    for (index, child) in node.children.iter().enumerate() {
        match child {
            hozo_ir::Child::Node(child_node) => {
                let child_position = positions[index];
                inner.append(render_node(
                    child_node,
                    child_position,
                    child_interaction_context,
                    for_children,
                    cx,
                ));
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
                        parent_group_ancestor,
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
                    cx,
                ));
            }
        }
    }
    inner
}
