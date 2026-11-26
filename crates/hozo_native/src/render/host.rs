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

pub(super) fn supports_layout_measurement_host(rendered_component: &str) -> bool {
    matches!(
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
    )
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
    let measures_host = declares_container && supports_layout_measurement_host(rendered_component);
    if declares_container && !measures_host {
        diagnostics.push(unwired_variant(
            node,
            &format!("`@container` needs a single layout-reporting host on Native; `{rendered_component}` cannot publish that width through this adapter. Put the container on a View inside or around it instead."),
            Severity::Error,
        ));
    }
    measures_host
}

/// What the element's interaction states need from its host.
pub(super) struct InteractionNeeds {
    pub(super) needs_focus_visible: bool,
    pub(super) needs_hover_or_focus: bool,
    pub(super) needs_interaction_host: bool,
    pub(super) link_interaction: bool,
}

pub(super) fn interaction_needs(
    node: &Node,
    component: &str,
    own_declarations: &[StyleDeclaration],
    text_declarations: &[StyleDeclaration],
    runtime_states: bool,
    has_transition_or_label: bool,
    runtime: &mut RuntimeNeeds,
) -> InteractionNeeds {
    // The owner collects events for both inherited styles and child-authored
    // styles. A Text reads context; putting modality handlers on it does not
    // update the state its callback consumes.
    let needs_focus_visible = own_declarations
        .iter()
        .chain(text_declarations.iter())
        .any(|declaration| interaction::uses_focus_visible(&declaration.condition))
        || (interaction::owns_events(node)
            && interaction::descendant_uses(node, interaction::uses_focus_visible))
        || runtime_states;
    let needs_hover_or_focus =
        own_declarations
            .iter()
            .chain(text_declarations.iter())
            .any(|declaration| {
                condition_contains(&declaration.condition, |condition| {
                    uses_hover(condition) || focus_state(condition).is_some()
                })
            })
            || (interaction::owns_events(node)
                && interaction::descendant_uses(node, interaction::uses_interaction))
            || runtime_states;
    // Navigation stays in HozoLink; the compiler selects the existing state
    // provider underneath it. A plain link imports no animation machinery.
    // A host-only pressed style can stay in RN's cheap style callback. Text
    // needs a provider even for raw children, otherwise its emitted pressed
    // style is never referenced (or borrows an unrelated outer owner).
    let needs_interaction_host = needs_hover_or_focus
        || has_transition_or_label
        || text_declarations
            .iter()
            .any(|declaration| interaction::uses_interaction(&declaration.condition));
    let link_interaction = component == "HozoLink" && needs_interaction_host;
    if link_interaction {
        runtime.need_component("HozoPressable");
    }
    InteractionNeeds {
        needs_focus_visible,
        needs_hover_or_focus,
        needs_interaction_host,
        link_interaction,
    }
}

/// Whether the element declares a container, its name, and whether it (or
/// its raw text) asks about a container's width or container length units.
pub(super) struct ContainerUse {
    pub(super) container_name: Option<String>,
    pub(super) declares_container: bool,
    pub(super) uses_container_query: bool,
    pub(super) uses_container_size_query: bool,
}

pub(super) fn container_use(
    node: &Node,
    own_declarations: &[StyleDeclaration],
    descend: &[StyleDeclaration],
) -> ContainerUse {
    // `@container`, which on Web is a property and here is a component:
    // an element has to measure itself before anything below it can query
    // its width.
    let container_name =
        own_declarations
            .iter()
            .find_map(|declaration| match &declaration.property {
                StyleProperty::ContainerName(name) => Some(name.clone()),
                _ => None,
            });
    let declares_container = own_declarations.iter().any(|declaration| {
        matches!(&declaration.property, StyleProperty::Keyword("container-type", kind) if *kind != "normal")
    });
    // And the other half: an element whose styles ask about a container's
    // width has to read that width from a component boundary away, which
    // is what `HozoContainerQuery` is for.
    let raw_text_reads_container = node
        .children
        .iter()
        .any(|child| matches!(child, hozo_ir::Child::Text(_)))
        && descend
            .iter()
            .any(|declaration| condition_contains(&declaration.condition, uses_container_width));
    let uses_container_query = raw_text_reads_container
        || own_declarations
            .iter()
            .any(|declaration| condition_contains(&declaration.condition, uses_container_width));
    let uses_container_size_query = own_declarations
        .iter()
        .any(|declaration| crate::measured::uses_container_size(&declaration.property));
    ContainerUse {
        container_name,
        declares_container,
        uses_container_query,
        uses_container_size_query,
    }
}

/// The component the markup lowers to, before an interaction, size or
/// container need replaces it: a ruby's runtime parts, an ambient
/// transition's `HozoAnimated`, or an `Animated` host for keyframes.
/// Returns it with the props the markup adds.
pub(super) fn base_component(
    node: &Node,
    in_dynamic_ruby: bool,
    ambient_transition: bool,
    animated_style: bool,
    cx: &mut NativeRenderContext<'_>,
) -> (&'static str, Vec<(&'static str, String)>) {
    let (mut component, extra_props) = markup::native_component(node, cx.diagnostics);
    // A ruby whose word only React Native can read hands the label to a
    // component, and the reading has to be identifiable there -- a plain
    // `Text` is not, since `HozoRuby` compares by identity to decide what
    // the word is. Before `rendered_component`, which reads `component`.
    if node.primitive == Primitive::Ruby && component == "HozoRuby" {
        cx.runtime.need_component("HozoRuby");
    }
    if in_dynamic_ruby && node.primitive == Primitive::RubyText {
        component = "HozoRubyText";
        cx.runtime.need_component("HozoRubyText");
    }
    // Recorded here, where the tag is decided, and only for the primitives
    // Hozo lowered: a carried `Child::Verbatim` keeps whatever the author
    // imported and must not be imported over.
    if !matches!(node.primitive, Primitive::Svg(_)) {
        cx.runtime.need_native(component);
    }
    // A transition on something that is not a control. `Pressable` has its
    // own path above, driven by the four interaction booleans; this one is
    // driven by the style changing, which is the shape an ambient
    // condition arrives in -- `dark:bg-black` is already resolved to a
    // guarded array by the time it renders, and what the element sees is
    // the array becoming a different array.
    if ambient_transition && component == "View" {
        component = "HozoAnimated";
        cx.runtime.need_component("HozoAnimated");
    }
    if animated_style {
        let animated = match component {
            "View" => Some("Animated.View"),
            "Text" => Some("Animated.Text"),
            _ => None,
        };
        if let Some(animated) = animated {
            component = animated;
            cx.runtime.need_native("Animated");
        }
    }
    (component, extra_props)
}
