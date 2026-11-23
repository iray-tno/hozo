//! The host component an element actually renders as, and whether that host
//! can publish its width to a container query below it.

use super::*;

/// What the choice of host reads, worked out earlier in `render_node`.
pub(super) struct HostChoice {
    pub(super) component: &'static str,
    pub(super) renders_backdrop_filter: bool,
    pub(super) has_pressed_parts: bool,
    pub(super) runtime_states: bool,
    pub(super) needs_interaction_host: bool,
    pub(super) interaction_context: bool,
    pub(super) relative_at_runtime: bool,
    pub(super) publishes_size: bool,
}

/// Choose the actual host before adding measurement. Replacing it with a
/// View loses Pressable events, Text semantics and ScrollView behavior;
/// container measurement is a provider around this very same host.
pub(super) fn rendered_component(
    choice: HostChoice,
    node: &Node,
    cx: &mut NativeRenderContext<'_>,
) -> &'static str {
    let HostChoice {
        component,
        renders_backdrop_filter,
        has_pressed_parts,
        runtime_states,
        needs_interaction_host,
        interaction_context,
        relative_at_runtime,
        publishes_size,
    } = choice;
    if renders_backdrop_filter {
        cx.runtime.need_component("HozoBackdropFilter");
        "HozoBackdropFilter"
    } else if component == "TextInput"
        && (has_pressed_parts
            || runtime_states
            || node.props.effective_disabled().is_some()
            || node.props.aria_invalid.is_some())
    {
        cx.runtime.need_component("HozoTextInput");
        "HozoTextInput"
    } else if component == "Pressable" && needs_interaction_host {
        cx.runtime.need_component("HozoPressable");
        "HozoPressable"
    } else if renders_text(component) && interaction_context && has_pressed_parts {
        cx.runtime.need_component("HozoText");
        "HozoText"
    } else if component == "View"
        && interaction_context
        && has_pressed_parts
        && cx.owner_inputs.events.is_empty()
        && cx.owner_inputs.facts.is_empty()
    {
        // `group-*:` on a View inside a Pressable: the same context HozoText
        // reads. A pattern's owner View keeps its own callback below.
        cx.runtime.need_component("HozoInteractionView");
        "HozoInteractionView"
    } else if relative_at_runtime {
        // The compiler could not see the size this scales against, so the
        // ratio travels to a component that can. Costs a context read, and
        // only here -- everything the compiler *can* resolve stays a plain
        // `Text` with a number in a stylesheet.
        cx.runtime.need_component("HozoRelativeText");
        "HozoRelativeText"
    } else if publishes_size {
        // The other half. This element holds the size the ratio above
        // needs and holds it in a form only React Native can evaluate, so
        // it says what it resolved to.
        cx.runtime.need_component("HozoTextSize");
        "HozoTextSize"
    } else {
        component
    }
}

/// Only a host with one forwarded layout event can publish its width.
/// Portals, non-layout SVG nodes, and identity-sensitive compound parts
/// need their own adapter; a provider must not invent a measurable box
/// for them or hide their identity from their owning component.
pub(super) fn measures_host(
    declares_container: bool,
    rendered_component: &str,
    node: &Node,
    diagnostics: &mut Vec<Diagnostic>,
) -> bool {
    let measures_host = declares_container
        && matches!(
            rendered_component,
            "View"
                | "Animated.View"
                | "Text"
                | "Animated.Text"
                | "TextInput"
                | "HozoTextInput"
                | "Image"
                | "ScrollView"
                | "Pressable"
                | "HozoPressable"
                | "HozoLink"
                | "HozoFlatList"
                | "HozoText"
                | "HozoInteractionView"
                | "HozoTextSize"
                | "HozoRelativeText"
                | "HozoAnimated"
                | "HozoRuby"
                | "HozoDetails"
                | "HozoBadge"
                | "Svg"
        );
    if declares_container && !measures_host {
        diagnostics.push(unwired_variant(
            node,
            &format!("`@container` needs a single layout-reporting host on Native; `{rendered_component}` cannot publish that width through this adapter. Put the container on a View inside or around it instead."),
            Severity::Error,
        ));
    }
    measures_host
}
