//! The components `render_node` wraps around an element and its children:
//! the grid or spacing placer, an inherited text scope, the host tag a
//! container or a file-boundary Text needs, a container query, a grid item.

use super::*;
use crate::grid::{NativeGrid, NativeGridItem};

/// The children placed by `HozoGrid`, or spaced by `space-*`/`divide-*`.
#[allow(clippy::too_many_arguments)]
pub(super) fn place_children(
    inner: Rendered,
    grid: Option<NativeGrid>,
    child_declarations: &[StyleDeclaration],
    base_name: &str,
    node: &Node,
    position: SiblingPosition,
    parent_measured: bool,
    group_interaction_query: bool,
    group_ancestor: Option<GroupAncestor<'_>>,
    peers: &[PeerSibling<'_>],
    cx: &mut NativeRenderContext<'_>,
) -> Rendered {
    if let Some(grid) = grid {
        if !child_declarations.is_empty() {
            cx.diagnostics.push(unwired_variant(
                node,
                "grid combined with `space-*`/`divide-*` needs the grid placer to merge those child styles; use `gap-*` for grid spacing",
                Severity::Error,
            ));
        }
        cx.runtime.need_component("HozoGrid");
        let row_tracks = grid
            .row_tracks_js
            .as_ref()
            .map(|tracks| format!(" rowTracks={{{tracks}}}"))
            .unwrap_or_default();
        let container_height = if grid.uses_measured_height {
            " containerHeight={__hozoParent?.height}"
        } else {
            ""
        };
        let text = format!(
            "<HozoGrid tracks={{{}}}{row_tracks}{container_height} columnGap={{{}}} rowGap={{{}}}>{}</HozoGrid>",
            grid.tracks_js, grid.column_gap, grid.row_gap, inner.text
        );
        let mut rendered = inner.wrap(text, "</HozoGrid>".len());
        if grid.uses_measured_height {
            cx.runtime.need_component("HozoParentSizeQuery");
            let wrapped = format!(
                "<HozoParentSizeQuery>{{(__hozoParent) => ({})}}</HozoParentSizeQuery>",
                rendered.text
            );
            rendered = rendered.wrap(wrapped, ")}</HozoParentSizeQuery>".len());
            rendered.forget_scope();
        }
        rendered
    } else {
        spaced_children(
            inner,
            child_declarations,
            base_name,
            node,
            position,
            parent_measured,
            group_interaction_query,
            group_ancestor,
            peers,
            cx,
        )
    }
}

/// The children inside a `HozoInheritedScope` carrying a Decision 013 scope.
#[allow(clippy::too_many_arguments)]
pub(super) fn inherited_scope(
    inner: Rendered,
    unified_scope: &[StyleDeclaration],
    base_name: &str,
    node: &Node,
    position: SiblingPosition,
    interaction_context: bool,
    group_interaction_query: bool,
    group_ancestor: Option<GroupAncestor<'_>>,
    peers: &[PeerSibling<'_>],
    cx: &mut NativeRenderContext<'_>,
) -> Rendered {
    if unified_scope.is_empty() {
        inner
    } else {
        // Outside any grid or spacing wrapper, which must keep the authored
        // children as their direct children. The scope renders no host.
        let target = crate::conditions::StyleTarget {
            owner_facts: &[],
            owner_events: &[],
            node,
            position,
            interaction_context,
            group_interaction_query,
            group_ancestor,
            peers,
            pattern_slot: None,
            composition: Default::default(),
        };
        let mut parts = Vec::new();
        let mut pressed = Vec::new();
        build_style_entries(
            unified_scope,
            &format!("{base_name}_scope"),
            &target,
            &mut parts,
            &mut pressed,
            None,
            cx,
        );
        let style = if parts.len() == 1 {
            parts.remove(0)
        } else {
            format!("[{}]", parts.join(", "))
        };
        cx.runtime.need_component("HozoInheritedScope");
        let close = "</HozoInheritedScope>";
        let text = format!(
            "<HozoInheritedScope style={{{style}}}>{}{close}",
            inner.text
        );
        inner.wrap(text, close.len())
    }
}

/// The tag the host renders under: a measuring `HozoContainer`, a Text at
/// the file's boundary that reads what an outside ancestor supplies, or the
/// chosen component. React Native's TextInput takes no children either.
#[allow(clippy::too_many_arguments)]
pub(super) fn host_tag(
    rendered_component: &'static str,
    measures_host: bool,
    measures_parent: bool,
    self_style_parts: &[String],
    outermost_text: bool,
    inherited: &[StyleDeclaration],
    node: &Node,
    props_text: &mut String,
    cx: &mut NativeRenderContext<'_>,
) -> &'static str {
    let theme = cx.theme;
    let mut tag = if measures_host {
        "HozoContainer"
    } else if cx.text_unified && rendered_component == "Text" && outermost_text {
        // Decision 013. Everything that reaches this Text from the file is
        // already in its own style; it reads only what an ancestor outside
        // the file could still supply. Its own style is applied last.
        let handed_down = inherited.iter().chain(node.style.iter());
        let opaque = crate::text_region::has_opaque(node);
        if !opaque && crate::text_region::covers_protocol(handed_down, theme) {
            "Text"
        } else {
            if opaque {
                // A Text rendered in there inherits natively from this host.
                props_text.push_str(" hozoOpaque");
            }
            cx.runtime.need_component("HozoInheritedLeafText");
            "HozoInheritedLeafText"
        }
    } else {
        rendered_component
    };
    if !self_style_parts.is_empty() {
        cx.runtime.need_component("HozoSelfMeasured");
        if tag != "View" {
            props_text.push_str(&format!(" hozoMeasuredComponent={{{tag}}}"));
        }
        let body = if self_style_parts.len() == 1 && !self_style_parts[0].contains("&&") {
            format!("({})", self_style_parts[0])
        } else {
            format!("[{}]", self_style_parts.join(", "))
        };
        props_text.push_str(&format!(" hozoSelfStyle={{(__hozoSelf) => {body}}}"));
        tag = "HozoSelfMeasured";
    }
    if measures_parent {
        cx.runtime.need_component("HozoMeasuredParent");
        if tag != "View" {
            props_text.push_str(&format!(" hozoParentComponent={{{tag}}}"));
        }
        tag = "HozoMeasuredParent";
    }
    tag
}

/// Provides the descendant reporting context strictly inside the host's
/// children so a host's own interaction never feeds into `:has(...)`.
pub(super) fn subtree_boundary(
    inner: Rendered,
    uses_subtree_scope: bool,
    cx: &mut NativeRenderContext<'_>,
) -> Rendered {
    if uses_subtree_scope {
        cx.runtime.need_component("HozoSubtreeBoundary");
        let close = "</HozoSubtreeBoundary>";
        let text = format!(
            "<HozoSubtreeBoundary scope={{__hozoSubtree}}>{}{close}",
            inner.text
        );
        inner.wrap(text, close.len())
    } else {
        inner
    }
}

/// Supplies descendant interaction state (`__hozoSubtree`) to a host using
/// `focus-within:`, `has-[:focus]:`, or `has-hover:`. Renders no native View.
pub(super) fn subtree_scope(
    rendered: Rendered,
    uses_subtree_scope: bool,
    cx: &mut NativeRenderContext<'_>,
) -> Rendered {
    if uses_subtree_scope {
        cx.runtime.need_component("HozoSubtreeScope");
        let text = format!(
            "<HozoSubtreeScope>{{(__hozoSubtree) => ({})}}</HozoSubtreeScope>",
            rendered.text
        );
        let mut rendered = rendered.wrap(text, ")}</HozoSubtreeScope>".len());
        rendered.forget_scope();
        rendered
    } else {
        rendered
    }
}

/// Supplies interactive state from the enclosing `.group` `HozoPressable`
/// (`__hozoGroup`) without replacing the child host. Renders no native View.
pub(super) fn interaction_query(
    rendered: Rendered,
    uses_group_interaction_query: bool,
    cx: &mut NativeRenderContext<'_>,
) -> Rendered {
    if uses_group_interaction_query {
        cx.runtime.need_component("HozoInteractionQuery");
        let text = format!(
            "<HozoInteractionQuery>{{(__hozoGroup) => ({})}}</HozoInteractionQuery>",
            rendered.text
        );
        let mut rendered = rendered.wrap(text, ")}</HozoInteractionQuery>".len());
        rendered.forget_scope();
        rendered
    } else {
        rendered
    }
}

/// Supplies interactive state from preceding `.peer` siblings inside the same
/// parent's `HozoPeerScope`. Renders no native host View.
pub(super) fn peer_query(
    rendered: Rendered,
    peer_ids: &[usize],
    cx: &mut NativeRenderContext<'_>,
) -> Rendered {
    if peer_ids.is_empty() {
        rendered
    } else {
        cx.runtime.need_component("HozoPeerQuery");
        let ids = peer_ids
            .iter()
            .map(usize::to_string)
            .collect::<Vec<_>>()
            .join(", ");
        let text = format!(
            "<HozoPeerQuery peerIds={{[{ids}]}}>{{(__hozoPeer) => ({})}}</HozoPeerQuery>",
            rendered.text
        );
        let mut rendered = rendered.wrap(text, ")}</HozoPeerQuery>".len());
        rendered.forget_scope();
        rendered
    }
}

/// Provides a sibling-scoped store so `.peer` siblings can publish hover/focus/press
/// state to following siblings without re-rendering the parent container.
pub(super) fn peer_scope(
    inner: Rendered,
    needs_peer_scope: bool,
    cx: &mut NativeRenderContext<'_>,
) -> Rendered {
    if needs_peer_scope {
        cx.runtime.need_component("HozoPeerScope");
        let close = "</HozoPeerScope>";
        let text = format!("<HozoPeerScope>{}{close}", inner.text);
        inner.wrap(text, close.len())
    } else {
        inner
    }
}

/// Supplies derived containing-block sizes from the enclosing same-component
/// `HozoMeasuredParent` to children using parent-relative `%`-mixed `calc()`.
pub(super) fn parent_size_query(
    rendered: Rendered,
    uses_parent_size_query: bool,
    cx: &mut NativeRenderContext<'_>,
) -> Rendered {
    if uses_parent_size_query {
        cx.runtime.need_component("HozoParentSizeQuery");
        let text = format!(
            "<HozoParentSizeQuery>{{(__hozoParent) => ({})}}</HozoParentSizeQuery>",
            rendered.text
        );
        let mut rendered = rendered.wrap(text, ")}</HozoParentSizeQuery>".len());
        rendered.forget_scope();
        rendered
    } else {
        rendered
    }
}

/// Inside the grid item rather than outside it: `HozoGrid` reads its
/// children's types to place them, so anything between the two would
/// make a grid item stop looking like one.
pub(super) fn container_query(
    rendered: Rendered,
    uses_container_query: bool,
    cx: &mut NativeRenderContext<'_>,
) -> Rendered {
    if uses_container_query {
        cx.runtime.need_component("HozoContainerQuery");
        let text = format!(
            "<HozoContainerQuery>{{(__hozoCq) => ({})}}</HozoContainerQuery>",
            rendered.text
        );
        let mut rendered = rendered.wrap(text, ")}</HozoContainerQuery>".len());
        rendered.forget_scope();
        rendered
    } else {
        rendered
    }
}

/// Supplies `{ width, height }` from the enclosing `HozoContainer` to elements
/// using `cqw`/`cqh`/`cqi`/`cqb`/`cqmin`/`cqmax` units.
pub(super) fn container_size_query(
    rendered: Rendered,
    uses_container_size_query: bool,
    cx: &mut NativeRenderContext<'_>,
) -> Rendered {
    if uses_container_size_query {
        cx.runtime.need_component("HozoContainerSizeQuery");
        let text = format!(
            "<HozoContainerSizeQuery>{{(__hozoCqs) => ({})}}</HozoContainerSizeQuery>",
            rendered.text
        );
        let mut rendered = rendered.wrap(text, ")}</HozoContainerSizeQuery>".len());
        rendered.forget_scope();
        rendered
    } else {
        rendered
    }
}

/// The element placed in its parent's grid by `HozoGridItem`.
pub(super) fn grid_item(
    rendered: Rendered,
    grid_item: Option<NativeGridItem>,
    cx: &mut NativeRenderContext<'_>,
) -> Rendered {
    if let Some(item) = grid_item {
        cx.runtime.need_component("HozoGridItem");
        let start = item
            .column_start
            .map(|start| format!(" columnStart={{{start}}}"))
            .unwrap_or_default();
        let row_span = if item.row_span > 1 {
            format!(" rowSpan={{{}}}", item.row_span)
        } else {
            String::new()
        };
        let row_start = item
            .row_start
            .map(|start| format!(" rowStart={{{start}}}"))
            .unwrap_or_default();
        let text = format!(
            "<HozoGridItem columnSpan={{{}}}{start}{row_span}{row_start}>{}</HozoGridItem>",
            item.span, rendered.text
        );
        rendered.wrap(text, "</HozoGridItem>".len())
    } else {
        rendered
    }
}
