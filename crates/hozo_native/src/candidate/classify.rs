//! Every candidate class sorted into the tables the generated module is
//! written from: plain styles, element states, transitions and refusals,
//! with the effect and text-metric metadata the resolver composes.

use super::*;

/// The tables `render_candidate_module_impl` writes the module from.
pub(super) struct Classified<'n> {
    pub(super) supported: Vec<(&'n String, Vec<(String, String)>)>,
    pub(super) unsupported: Vec<(&'n String, String)>,
    pub(super) states: Vec<(&'n String, Vec<StateGroup>)>,
    pub(super) transforms: Vec<(&'n String, String)>,
    pub(super) filters: Vec<(&'n String, crate::filters::Metadata)>,
    pub(super) gradients: Vec<(&'n String, crate::gradients::Metadata)>,
    pub(super) shadows: Vec<(&'n String, crate::shadows::Metadata)>,
    pub(super) transitions: Vec<(&'n String, Option<&'static str>, String)>,
    pub(super) font_defaults: Vec<&'n String>,
    pub(super) leading_registers: Vec<(&'n String, f64)>,
    pub(super) relative_text_metrics: Vec<(&'n String, &'static str, f64)>,
    pub(super) explicit_leading: bool,
}

/// Resolves each class and files it in one table, telling `plan` (when
/// building one) what became of it.
pub(super) fn classify_candidates<'n>(
    class_names: &'n [String],
    theme: &Theme,
    plan: &mut Option<&mut CandidatePlanBuilder<'_>>,
) -> Classified<'n> {
    let mut supported: Vec<(&String, Vec<(String, String)>)> = Vec::new();
    let mut unsupported: Vec<(&String, String)> = Vec::new();
    let mut states: Vec<(&String, Vec<StateGroup>)> = Vec::new();
    let mut transforms = Vec::new();
    let mut filters = Vec::new();
    let mut gradients = Vec::new();
    let mut shadows = Vec::new();
    let mut transitions: Vec<(&String, Option<&'static str>, String)> = Vec::new();
    let mut font_defaults = Vec::new();
    let mut leading_registers = Vec::new();
    let mut relative_text_metrics = Vec::new();
    let mut explicit_leading = false;
    for name in class_names {
        let Some(mut utility) = hozo_parser::resolve_class_name(name) else {
            if let Some(plan) = plan.as_deref_mut() {
                plan.refused(name, "unrecognized");
            }
            continue;
        };
        for (_, props) in &mut utility.groups {
            *props = theme.resolve_shadow_tokens(std::mem::take(props));
        }
        if utility.important {
            if let Some(plan) = plan.as_deref_mut() {
                plan.refused(name, "important-not-lowered");
            }
            unsupported.push((name, hozo_parser::IMPORTANT_NOT_LOWERED.into()));
            continue;
        }
        // A transition utility draws nothing; it says how a change in what
        // is drawn should arrive. React Native cannot be told that through
        // a style object, so these go in a table of their own that the
        // engine reads into `HozoAnimated`'s spec (#1450), including under
        // `motion-reduce:` / `motion-safe:`, which the reader decides.
        if let Some((condition, spec)) = transition_part(&utility.groups) {
            if let Some(plan) = plan.as_deref_mut() {
                plan.refused(name, "transition");
            }
            transitions.push((name, condition, spec));
            continue;
        }
        // Any conditional group disqualifies the class, which is what
        // makes `container` land here: its max-widths are per-breakpoint.
        if utility
            .groups
            .iter()
            .any(|(condition, _)| *condition != Condition::Always)
        {
            // A state of the element itself is the exception (#886): the
            // pressable rendering it already tracks that state and hands it
            // to the resolver, so nothing here has to.
            if let Some(groups) = state_groups(&utility.groups, theme) {
                if let Some(token) = groups
                    .iter()
                    .find_map(|group| unresolved_colour(&group.pairs))
                {
                    if let Some(plan) = plan.as_deref_mut() {
                        plan.refused(name, "unresolved-theme-color");
                    }
                    unsupported.push((name, unresolved_reason(name, token)));
                    continue;
                }
                explicit_leading |= groups.iter().any(|group| {
                    !group.font_default && group.pairs.iter().any(|(key, _)| key == "lineHeight")
                });
                if let Some(plan) = plan.as_deref_mut() {
                    plan.states(name, &utility.groups, &groups);
                }
                states.push((name, groups));
                continue;
            }
            if let Some(plan) = plan.as_deref_mut() {
                plan.refused(name, "unsupported-condition-or-property");
            }
            unsupported.push((name, format!("`{name}` is conditional, and a runtime-resolved class can only carry unconditional styles on React Native. Write it as a static className so it compiles to a real style variant.")));
            continue;
        }
        let properties: Vec<StyleProperty> = utility
            .groups
            .iter()
            .flat_map(|(_, properties)| properties.clone())
            .collect();
        if let Some(reason) = properties
            .iter()
            .find_map(|property| property.unsupported_on_native_with_theme(theme))
        {
            if let Some(plan) = plan.as_deref_mut() {
                plan.refused(name, "unsupported-property");
            }
            unsupported.push((name, format!("{reason} -- this utility is Web-only.")));
            continue;
        }
        // Owned, because the properties are a local that ends with this
        // iteration -- a style key can now borrow from the property it
        // came from (an arbitrary property's name is the author's text,
        // not a literal in this binary).
        let pairs: Vec<(String, String)> = style_pairs(&properties, theme)
            .into_iter()
            .map(|(key, value)| (key.to_string(), value))
            .collect();
        if let Some(token) = unresolved_colour(&pairs) {
            if let Some(plan) = plan.as_deref_mut() {
                plan.refused(name, "unresolved-theme-color");
            }
            unsupported.push((name, unresolved_reason(name, token)));
            continue;
        }
        let gradient = crate::gradients::metadata(&properties, theme);
        let shadow = crate::shadows::metadata(&properties, theme);
        // Neither ratio can be written into a React Native style. Carry
        // the number to Text, which can read the size of the selected styles.
        let relative_metric = match properties.as_slice() {
            [StyleProperty::LineHeight(hozo_ir::LineHeight::Ratio(ratio))] if ratio.is_finite() => {
                Some(("lineHeight", *ratio))
            }
            [StyleProperty::LetterSpacing(hozo_ir::LetterSpacing::Em(em))] if em.0.is_finite() => {
                Some(("letterSpacing", em.0))
            }
            _ => None,
        };
        if pairs.is_empty() && gradient.is_none() && shadow.is_none() && relative_metric.is_none() {
            if let Some(plan) = plan.as_deref_mut() {
                plan.refused(name, "no-native-output");
            }
            continue;
        }
        explicit_leading |= properties.iter().any(|property| {
            matches!(
                property,
                StyleProperty::LineHeight(hozo_ir::LineHeight::Length(_))
            )
        });
        if let Some(plan) = plan.as_deref_mut() {
            plan.style(
                name,
                &properties,
                &pairs,
                gradient.as_ref(),
                shadow.as_ref(),
                relative_metric.map(|(key, _)| key),
            );
        }
        if let Some((key, scale)) = relative_metric {
            relative_text_metrics.push((name, key, scale));
        }
        if let Some(metadata) = crate::transforms::metadata(&properties, theme) {
            transforms.push((name, metadata));
        }
        if let Some(metadata) = crate::filters::metadata(&properties) {
            filters.push((name, metadata));
        }
        if let Some(metadata) = gradient {
            gradients.push((name, metadata));
        }
        if let Some(metadata) = shadow {
            shadows.push((name, metadata));
        }
        if has_font_default(&properties) {
            font_defaults.push(name);
        }
        if matches!(properties.as_slice(), [StyleProperty::TextColor(_)]) {
            if let Some(px) = theme.utility_leading_register(name) {
                leading_registers.push((name, px));
            }
        }
        supported.push((name, pairs));
    }
    Classified {
        supported,
        unsupported,
        states,
        transforms,
        filters,
        gradients,
        shadows,
        transitions,
        font_defaults,
        leading_registers,
        relative_text_metrics,
        explicit_leading,
    }
}
