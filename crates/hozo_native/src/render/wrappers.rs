//! The components `render_node` wraps around an element and its children:
//! the grid or spacing placer, an inherited text scope, the host tag a
//! container or a file-boundary Text needs, a container query, a grid item.

use super::*;
use crate::grid::{NativeGrid, NativeGridItem};

/// The children placed by `HozoGrid`, or spaced by `space-*`/`divide-*`.
pub(super) fn place_children(
    inner: Rendered,
    grid: Option<NativeGrid>,
    child_declarations: &[StyleDeclaration],
    base_name: &str,
    node: &Node,
    position: SiblingPosition,
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
        let text = format!(
            "<HozoGrid tracks={{{}}}{row_tracks} columnGap={{{}}} rowGap={{{}}}>{}</HozoGrid>",
            grid.tracks_js, grid.column_gap, grid.row_gap, inner.text
        );
        inner.wrap(text, "</HozoGrid>".len())
    } else {
        spaced_children(inner, child_declarations, base_name, node, position, cx)
    }
}

/// The children inside a `HozoInheritedScope` carrying a Decision 013 scope.
pub(super) fn inherited_scope(
    inner: Rendered,
    unified_scope: &[StyleDeclaration],
    base_name: &str,
    node: &Node,
    position: SiblingPosition,
    interaction_context: bool,
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
pub(super) fn host_tag(
    rendered_component: &'static str,
    measures_host: bool,
    outermost_text: bool,
    inherited: &[StyleDeclaration],
    node: &Node,
    props_text: &mut String,
    cx: &mut NativeRenderContext<'_>,
) -> &'static str {
    let theme = cx.theme;
    if measures_host {
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
