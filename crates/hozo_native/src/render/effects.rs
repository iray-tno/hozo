//! The effects a late-bound class can change -- shadows, gradients,
//! filters, transforms and text metrics -- composed over the element's
//! style array by runtime helpers that read each family's slots.

use super::*;

/// The element's specs for each effect family, and whether each one has to
/// be composed with a late-bound class (`mixed`) or only with its own.
pub(super) struct Effects {
    pub(super) shadow_specs: String,
    pub(super) gradient_specs: String,
    pub(super) filter_specs: String,
    pub(super) transform_specs: String,
    pub(super) mixed_shadows: bool,
    pub(super) mixed_gradients: bool,
    pub(super) mixed_filters: bool,
    pub(super) mixed_transforms: bool,
    pub(super) metric_defaults: Option<(String, String)>,
    pub(super) mixed_registers: bool,
}

/// Which effect families this element composes, decided from its own
/// declarations before its style entries are built.
pub(super) struct Mixing {
    pub(super) mixed_shadows: bool,
    pub(super) mixed_gradients: bool,
    pub(super) mixed_transforms: bool,
    pub(super) mixed_filters: bool,
    pub(super) project_filter_slots: bool,
    pub(super) compose_gradients: bool,
    pub(super) compose_shadows: bool,
}

/// Reads each family's specs from the element's style entries, and narrows
/// `mixed` to the families that have any. Returns the effects and the
/// families the class map has to defer to this element.
pub(super) fn plan(
    mixing: Mixing,
    component: &str,
    node: &Node,
    own_declarations: &[StyleDeclaration],
    own_entry_start: usize,
    own_entry_end: usize,
    cx: &NativeRenderContext<'_>,
) -> (Effects, u8) {
    let Mixing {
        mixed_shadows,
        mixed_gradients,
        mixed_transforms,
        mixed_filters,
        project_filter_slots,
        compose_gradients,
        compose_shadows,
    } = mixing;
    let theme = cx.theme;
    let own_entries = &cx.style_entries[own_entry_start..own_entry_end];
    let mixed_metric_defaults = mixed_metric_defaults(component, node, own_entries);
    let mixed_registers = mixed_metric_defaults.is_some() && theme.has_utility_leading_registers();
    let transform_specs = if mixed_transforms
        || (own_declarations
            .iter()
            .any(|d| crate::transforms::is_control(&d.property))
            && own_declarations
                .iter()
                .any(|d| d.condition != Condition::Always))
        || crate::transforms::split_across_entries(own_entries)
    {
        crate::transforms::specs(own_entries, theme)
    } else {
        String::new()
    };
    let filter_specs = if mixed_filters
        || (project_filter_slots && crate::filters::split_across_entries(own_entries))
    {
        crate::filters::specs(own_entries)
    } else {
        String::new()
    };
    let gradient_specs = if compose_gradients {
        crate::gradients::specs(&cx.style_entries[own_entry_start..], theme)
    } else {
        String::new()
    };
    let shadow_specs = if compose_shadows {
        crate::shadows::specs(&cx.style_entries[own_entry_start..], theme)
    } else {
        String::new()
    };
    let mixed_shadows = mixed_shadows && !shadow_specs.is_empty();
    let mixed_gradients = mixed_gradients && !gradient_specs.is_empty();
    let mixed_transforms = mixed_transforms && !transform_specs.is_empty();
    let mixed_filters = mixed_filters && !filter_specs.is_empty();
    let deferred_effects = u8::from(mixed_shadows) * crate::candidate::DEFER_SHADOW
        + u8::from(mixed_gradients) * crate::candidate::DEFER_GRADIENT
        + u8::from(mixed_transforms) * crate::candidate::DEFER_TRANSFORM
        + u8::from(mixed_filters) * crate::candidate::DEFER_FILTER
        + u8::from(mixed_registers) * crate::candidate::DEFER_TEXT_METRICS;
    (
        Effects {
            shadow_specs,
            gradient_specs,
            filter_specs,
            transform_specs,
            mixed_shadows,
            mixed_gradients,
            mixed_filters,
            mixed_transforms,
            metric_defaults: mixed_metric_defaults,
            mixed_registers,
        },
        deferred_effects,
    )
}

/// A Text (or editable field) can combine its own font metrics with
/// late-bound classes. A conditional font default must not erase the
/// explicit leading from that other input. Static-only owners already
/// project this at build time and need no helper.
/// Returns the font-default entries and leading registers to compose.
pub(super) fn mixed_metric_defaults(
    component: &str,
    node: &Node,
    own_entries: &[StyleEntry],
) -> Option<(String, String)> {
    (matches!(component, "Text" | "TextInput") && !node.class_name_fallback.is_empty())
        .then(|| {
            let mut has_metrics = false;
            let mut registers = Vec::new();
            let defaults = own_entries
                .iter()
                .filter_map(|(name, props, _)| {
                    if let Some(px) = props.iter().find_map(|property| match property {
                        StyleProperty::LeadingRegister(px) => Some(px),
                        _ => None,
                    }) {
                        has_metrics = true;
                        registers.push(format!("[{STYLE_OBJECT}.{name}, {px}]"));
                    }
                    props.iter().find_map(|property| match property {
                        StyleProperty::LineHeight(hozo_ir::LineHeight::FontDefault(_)) => {
                            has_metrics = true;
                            Some(format!("{STYLE_OBJECT}.{name}"))
                        }
                        StyleProperty::LineHeight(hozo_ir::LineHeight::Length(_)) => {
                            has_metrics = true;
                            None
                        }
                        _ => None,
                    })
                })
                .collect::<Vec<_>>();
            has_metrics.then(|| (defaults.join(", "), registers.join(", ")))
        })
        .flatten()
}

/// Composes the effects a late-bound class shares, before the author's
/// style joins the array.
pub(super) fn compose_mixed(
    mut parts: Vec<String>,
    effects: &Effects,
    runtime: &mut RuntimeNeeds,
) -> Vec<String> {
    if effects.mixed_shadows && !effects.shadow_specs.is_empty() {
        // Resolve class contributions before authored styles; even an opaque
        // registered RN style ID remains last and can override the result.
        runtime.need_component("hozoShadowStyles");
        parts = vec![format!(
            "hozoShadowStyles([{}], [{}], {}, hozoClasses.shadowSlots)",
            parts.join(", "),
            effects.shadow_specs,
            crate::shadows::defaults()
        )];
    }
    if effects.mixed_gradients {
        runtime.need_component("hozoGradientStyles");
        parts = vec![format!(
            "hozoGradientStyles([{}], [{}], {}, hozoClasses.gradientSlots)",
            parts.join(", "),
            effects.gradient_specs,
            crate::gradients::defaults()
        )];
    }
    if effects.mixed_filters {
        runtime.need_component("hozoFilterStyles");
        parts = vec![format!(
            "hozoFilterStyles([{}], [{}], hozoClasses.filterSlots ?? null)",
            parts.join(", "),
            effects.filter_specs
        )];
    }
    if effects.mixed_transforms {
        runtime.need_component("hozoTransformStyles");
        parts = vec![format!(
            "hozoTransformStyles([{}], [{}], hozoClasses.transformSlots)",
            parts.join(", "),
            effects.transform_specs
        )];
    }
    if let Some((defaults, registers)) = &effects.metric_defaults {
        // Before the author's style array: its values (including an opaque
        // registered style) retain their last word without being inspected.
        runtime.need_component("hozoMixedTextMetricStyles");
        let register_args = if effects.mixed_registers {
            format!(", hozoClasses.leadingRegisters, [{registers}]")
        } else {
            String::new()
        };
        parts = vec![format!(
            "hozoMixedTextMetricStyles([{}], [{}], hozoClasses.fontDefaults{register_args})",
            parts.join(", "),
            defaults
        )];
    }
    parts
}

/// Composes the element's own effects over the whole array, the author's
/// style included.
pub(super) fn compose_unmixed(
    mut parts: Vec<String>,
    effects: &Effects,
    runtime: &mut RuntimeNeeds,
) -> Vec<String> {
    if !effects.mixed_shadows && !effects.shadow_specs.is_empty() {
        runtime.need_component("hozoShadowStyles");
        parts = vec![format!(
            "hozoShadowStyles([{}], [{}], {})",
            parts.join(", "),
            effects.shadow_specs,
            crate::shadows::defaults()
        )];
    }
    if !effects.mixed_gradients && !effects.gradient_specs.is_empty() {
        runtime.need_component("hozoGradientStyles");
        parts = vec![format!(
            "hozoGradientStyles([{}], [{}], {})",
            parts.join(", "),
            effects.gradient_specs,
            crate::gradients::defaults()
        )];
    }
    if !effects.mixed_filters && !effects.filter_specs.is_empty() {
        runtime.need_component("hozoFilterStyles");
        parts = vec![format!(
            "hozoFilterStyles([{}], [{}])",
            parts.join(", "),
            effects.filter_specs
        )];
    }
    if !effects.mixed_transforms && !effects.transform_specs.is_empty() {
        runtime.need_component("hozoTransformStyles");
        parts = vec![format!(
            "hozoTransformStyles([{}], [{}])",
            parts.join(", "),
            effects.transform_specs
        )];
    }
    parts
}
