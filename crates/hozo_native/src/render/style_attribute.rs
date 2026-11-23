//! The element's `style` attribute: a pattern's class route, an interaction
//! callback over the state the host tracks, or the plain array -- recorded
//! for the owner and held where a spread could replace it.

use super::*;

/// What decides the attribute's form, worked out earlier in `render_node`.
pub(super) struct StyleAttribute<'a> {
    pub(super) pattern_classes: Option<&'a crate::class_route::PatternClasses>,
    pub(super) needs_pressed_fn: bool,
    pub(super) owner_view_callback: bool,
    pub(super) needs_focus_visible: bool,
    pub(super) needs_hover_or_focus: bool,
    pub(super) rendered_component: &'a str,
    pub(super) pattern_style_prop: Option<&'static str>,
}

pub(super) fn write_style_attribute(
    attribute: StyleAttribute<'_>,
    style_array_parts: &[String],
    node: &Node,
    base_name: &str,
    held: &mut crate::spread_style::HeldStyles<'_>,
    props_text: &mut String,
    cx: &mut NativeRenderContext<'_>,
) {
    let StyleAttribute {
        pattern_classes,
        needs_pressed_fn,
        owner_view_callback,
        needs_focus_visible,
        needs_hover_or_focus,
        rendered_component,
        pattern_style_prop,
    } = attribute;
    if let Some(route) = &pattern_classes {
        cx.owner_callbacks.push(crate::OwnerCallback {
            span: node.span,
            class_prop: "className",
        });
        held.emit(props_text, &route.prop(style_array_parts));
    } else if needs_pressed_fn {
        let callback = if crate::pattern::interaction_slot(node.primitive, "className").is_some() {
            cx.owner_callbacks.push(crate::OwnerCallback {
                span: node.span,
                class_prop: "className",
            });
            crate::class_route::static_callback(node.primitive, "className", style_array_parts)
        } else {
            let mut params: Vec<String> = if !cx.owner_inputs.events.is_empty() {
                cx.owner_inputs
                    .events
                    .iter()
                    .map(|event| event.key().to_string())
                    .collect()
            } else if owner_view_callback {
                Vec::new()
            } else {
                let fields = if needs_focus_visible {
                    "pressed, hovered, focused, focusVisible"
                } else if needs_hover_or_focus
                    || matches!(rendered_component, "HozoText" | "HozoInteractionView")
                {
                    "pressed, hovered, focused"
                } else {
                    "pressed"
                };
                vec![fields.to_string()]
            };
            params.extend(cx.owner_inputs.facts.iter().map(|fact| fact.parameter()));
            let state = format!("{{ {} }}", params.join(", "));
            format!("({state}) => [{}]", style_array_parts.join(", "))
        };
        let attribute = format!(" {}={{{callback}}}", pattern_style_prop.unwrap_or("style"));
        crate::owner_style::record(cx, base_name, &attribute, true);
        if owner_view_callback && needs_focus_visible {
            crate::owner_style::mark_focus_visible(cx, base_name);
        }
        held.emit(props_text, &attribute);
    } else if style_array_parts.len() == 1 && !style_array_parts[0].contains("&&") {
        let attribute = format!(" style={{{}}}", style_array_parts[0]);
        crate::owner_style::record(cx, base_name, &attribute, false);
        held.emit(props_text, &attribute);
    } else if !style_array_parts.is_empty() {
        let attribute = format!(" style={{[{}]}}", style_array_parts.join(", "));
        crate::owner_style::record(cx, base_name, &attribute, false);
        held.emit(props_text, &attribute);
    }
}
