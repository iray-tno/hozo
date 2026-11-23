//! Runtime candidate-map generation for dynamic Native class names.
//!
//! Static classes never use this path; it is the deliberately small fallback
//! for class strings the compiler cannot resolve ahead of time.

use super::*;

// Shared by generated resolver pipelines and the JSX sites that defer them.
pub(super) const DEFER_SHADOW: u8 = 1;
pub(super) const DEFER_GRADIENT: u8 = 2;
pub(super) const DEFER_TRANSFORM: u8 = 4;
pub(super) const DEFER_FILTER: u8 = 8;
pub(super) const DEFER_TEXT_METRICS: u8 = 16;
mod classify;
mod edges;
mod pairs;
mod pipeline;
mod plan;
mod states;
mod tables;
mod transitions;
mod unresolved;
use edges::edge_projection;
pub(crate) use pairs::style_pairs;
use plan::CandidatePlanBuilder;
pub use plan::{
    CandidateModulePlan, CandidateOrdering, CandidatePriorityEntry, CandidatePriorityGroup,
};
pub(crate) use states::data_fact_key;
use states::{has_font_default, state_groups, write_composition_table, StateGroup};
use transitions::transition_part;
use unresolved::{unresolved_colour, unresolved_reason};

/// Build-time sidecar from the actual generation pass. No keys are embedded
/// in device output until the static and fallback winners can switch together.
pub fn render_candidate_module_plan(
    class_names: &[String],
    theme: &Theme,
    context: &hozo_ir::TailwindOrderContext,
) -> Result<CandidateModulePlan, String> {
    candidate_plan(class_names, theme, context, false)
}

/// A completed context uses the exact scalar eligibility of static planning.
/// Only compact ranks enter the factory call; descriptors stay at build time.
pub fn render_final_candidate_module_plan(
    class_names: &[String],
    theme: &Theme,
    context: &hozo_ir::TailwindOrderContext,
) -> Result<CandidateModulePlan, String> {
    candidate_plan(class_names, theme, context, true)
}

fn candidate_plan(
    class_names: &[String],
    theme: &Theme,
    context: &hozo_ir::TailwindOrderContext,
    finalized: bool,
) -> Result<CandidateModulePlan, String> {
    for name in class_names {
        if context.lookup(name).is_none() {
            return Err(format!("Tailwind ordering context did not collect {name}"));
        }
    }
    let mut plan = CandidatePlanBuilder::new(context);
    plan.finalized = finalized;
    let code = render_candidate_module_impl(class_names, theme, Some(&mut plan));
    Ok(plan.finish(code))
}

/// The Native counterpart of `hozo_web::render_candidate_stylesheet`:
/// the module that lets a `className` the compiler couldn't read still
/// produce styles (proposal §7's third tier).
///
/// The two platforms need very different amounts of machinery here, and
/// the reason is worth stating. On Web the candidate stylesheet is free --
/// the browser already *has* a CSS engine, so emitting rules costs bytes
/// and no code. React Native has no such engine, so something must turn a
/// class string into a style object on device.
///
/// This is deliberately the smallest thing that can: a flat
/// name -> style-object map plus a split-and-look-up resolver
/// (`@hozo/engine`'s `createClassResolver`). What makes that enough,
/// where `react-native-css` needs a full reactive engine with specificity
/// sorting, is that Hozo only ever puts *single utility classes* in here.
/// The legacy positional call follows authored-string order. A completed
/// shared context instead emits the bounded common scalar ordering ABI; it
/// does not infer Tailwind precedence from that string order or from this map.
///
/// Conditional utilities under a breakpoint or `dark:` are the price. A
/// style object can't express them, and making it able to would mean
/// subscribing to the window and the colour scheme -- i.e. rebuilding the
/// engine this design is choosing not to ship. They go into `unsupported`
/// instead of being dropped, so the resolver can say so at the moment one
/// is actually used rather than rendering silently wrong.
///
/// The element's own state is different (#886). `hover:`, `active:`,
/// `focus-visible:`, `disabled:`, `aria-*:` and simple data conditions need no tracking here: the
/// pressable rendering the element already tracks them, and the compiler
/// hands them to `hozoClasses` beside the class string. They go into
/// `states`, keyed by the state they need. `rtl:` and `ltr:` join them
/// under an ambient key the module supplies itself: React Native reads the
/// direction once, from `I18nManager.isRTL`, and needs a reload to change
/// it, so the resolver decides those once instead of asking the element.
/// A candidate merely *appearing* in
/// the scan proves nothing (it may only ever be used on Web, or in a
/// static `className` that compiled fine), which is why this is a runtime
/// warning and not a build error.
pub fn render_candidate_module(class_names: &[String], theme: &Theme) -> String {
    render_candidate_module_impl(class_names, theme, None)
}

fn render_candidate_module_impl(
    class_names: &[String],
    theme: &Theme,
    mut plan: Option<&mut CandidatePlanBuilder<'_>>,
) -> String {
    let classify::Classified {
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
        explicit_leading,
    } = classify::classify_candidates(class_names, theme, &mut plan);

    // Ordinary rotate/scale candidates need composition too: RN's last
    // transform array wins, unlike CSS's independently cascading families.
    // State-only transforms must trigger it even with no unconditional or
    // reset candidate. Projects without transforms retain the tiny resolver.
    let needs_transform_slots = !transforms.is_empty()
        || states
            .iter()
            .any(|(_, groups)| groups.iter().any(|group| group.transform.is_some()));
    let has_font_defaults = !font_defaults.is_empty()
        || states
            .iter()
            .any(|(_, groups)| groups.iter().any(|group| group.font_default));
    let composes_text_metrics =
        (explicit_leading || !leading_registers.is_empty()) && has_font_defaults;
    // One function, even in many states/values, already obeys whole-property
    // replacement. Only namespaces able to combine distinct functions need
    // the extra leaf, table and per-resolution composition.
    let functions = filters
        .iter()
        .map(|(_, metadata)| metadata.functions)
        .chain(states.iter().flat_map(|(_, groups)| {
            groups
                .iter()
                .filter_map(|group| group.filter.as_ref().map(|metadata| metadata.functions))
        }))
        .fold(0u32, |all, functions| all | functions);
    let needs_filter_slots = functions.count_ones() > 1;
    let has_filter_slots = !filters.is_empty()
        || states
            .iter()
            .any(|(_, groups)| groups.iter().any(|group| group.filter.is_some()));
    // Constructor-only namespaces already replace the complete image correctly.
    // Stop-only writers must survive as metadata, not a fake image reset.
    let needs_gradient_slots = gradients.iter().any(|(_, metadata)| metadata.has_stops())
        || states.iter().any(|(_, groups)| {
            groups.iter().any(|group| {
                group
                    .gradient
                    .as_ref()
                    .is_some_and(|metadata| metadata.has_stops())
            })
        });
    let shadow_slots = shadows
        .iter()
        .map(|(_, metadata)| metadata.slots)
        .chain(states.iter().flat_map(|(_, groups)| {
            groups
                .iter()
                .filter_map(|group| group.shadow.as_ref().map(|metadata| metadata.slots))
        }))
        .fold(0, |slots, next| slots | next);
    let needs_shadow_slots = crate::shadows::needs_composition(shadow_slots);
    let ambient = states.iter().any(|(_, groups)| {
        groups
            .iter()
            .any(|group| group.keys.iter().any(|key| key == "rtl" || key == "ltr"))
    });
    let (edge_mix, edge_uneven) = edge_projection(&supported, &states);
    let mut out = String::new();
    let mut body = String::from("\nconst styles = {\n");
    for (name, pairs) in &supported {
        body.push_str(&format!("  {}: {{\n", quote(name)));
        for (key, value) in pairs {
            body.push_str(&format!("    {key}: {value},\n"));
        }
        body.push_str("  },\n");
    }
    body.push_str("}\n\nconst unsupported = {\n");
    for (name, reason) in &unsupported {
        body.push_str(&format!("  {}: {},\n", quote(name), quote(reason)));
    }
    body.push_str("}\n\n");
    let mut state_colors = None;
    let ordering = plan.and_then(|plan| {
        if plan.finalized {
            let (barriers, independent) = plan.independent_colors("style");
            let covers_every_drawable =
                barriers.len() + independent.len() == supported.len() + states.len();
            let partial = (!barriers.is_empty() && independent.len() > 1)
                .then(|| (barriers.join(" "), independent.join(" ")));
            if !states.is_empty() {
                let (colors, independent) = plan.independent_colors("state");
                // Colour writes keep authored order only when their Native
                // specificity ties. A mixed-weight colour tier still needs
                // its usual specificity projection, not a guessed rank.
                let mut weights = states
                    .iter()
                    .filter(|(name, _)| colors.contains(&name.as_str()))
                    .flat_map(|(_, groups)| groups.iter().map(|group| group.order));
                let uniform = weights
                    .next()
                    .is_some_and(|first| first.is_some() && weights.all(|weight| weight == first));
                if !colors.is_empty()
                    && uniform
                    && states.iter().all(|(name, groups)| {
                        (colors.contains(&name.as_str()) || independent.contains(&name.as_str()))
                            && groups.iter().all(|group| group.order.is_some())
                    })
                {
                    state_colors = Some(colors.join(" "));
                }
            }
            plan.prepare_ordering().map(|order| {
                let complete = order.ranks.len() == supported.len() + states.len()
                    || (partial.is_some() && covers_every_drawable);
                (order, partial, complete)
            })
        } else {
            None
        }
    });
    // Compact ranks are emitted only for drawable entries, and only when
    // every group in that entry is ranked. When they cover every emitted
    // entry, or ranked entries and independent colours cover every
    // drawable entry together, no string can reach the legacy state order.
    // Refused and unknown tokens never enter the resolver's rank lookup.
    let complete = ordering.as_ref().is_some_and(|(_, _, complete)| *complete);
    // No request needs Native specificity when every state group has a
    // shared rank. The resolver can read that fact from the ranks themselves;
    // this namespace-wide check only avoids shipping unused tuples.
    let all_states_assessed = ordering.as_ref().is_some_and(|(ordering, _, _)| {
        states
            .iter()
            .all(|(name, _)| ordering.ranks.contains_key(name.as_str()))
    });
    // The resolver reads the direction to rewrite physical inline edges as
    // logical ones: a ranked map's mixed families (#2018), and any map's
    // uneven physical writes (#2050).
    let edge_direction = (ordering.is_some() && edge_mix) || edge_uneven;
    // Only when there are any, so a project without state classes keeps the
    // module it had.
    let states_argument = if states.is_empty() && edge_direction {
        ", {}, { rtl: I18nManager.isRTL, ltr: !I18nManager.isRTL }"
    } else if states.is_empty() {
        ""
    } else {
        // Tied owner groups always keep the authored string order in the
        // fallback. Don't ship rank data if no pair could change that order.
        // The separate captured/built-in plan still carries its full ranks.
        let mut owner_ranks = states
            .iter()
            .flat_map(|(_, groups)| groups.iter().filter_map(|group| group.order));
        let emit_owner_ranks = !complete
            && !all_states_assessed
            && state_colors.is_none()
            && owner_ranks
                .next()
                .is_some_and(|first| owner_ranks.any(|rank| rank != first));
        body.push_str("const states = {\n");
        for (name, groups) in &states {
            let groups: Vec<String> = groups
                .iter()
                .map(|group| {
                    let keys: Vec<String> = group.keys.iter().map(|key| quote(key)).collect();
                    let pairs: Vec<String> = group
                        .pairs
                        .iter()
                        .map(|(key, value)| format!("{key}: {value}"))
                        .collect();
                    let order = group
                        .order
                        .filter(|_| emit_owner_ranks)
                        .map(|key| format!(", {key}"))
                        .unwrap_or_default();
                    format!("[[{}], {{ {} }}{order}]", keys.join(", "), pairs.join(", "))
                })
                .collect();
            body.push_str(&format!("  {}: [{}],\n", quote(name), groups.join(", ")));
        }
        body.push_str("}\n\n");
        if ambient || edge_direction {
            ", states, { rtl: I18nManager.isRTL, ltr: !I18nManager.isRTL }"
        } else {
            ", states"
        }
    };
    let (uses_leading_registers, has_gradient_slots) = tables::write_tables(
        &mut body,
        tables::TableFlags {
            transforms: needs_transform_slots,
            filters: has_filter_slots,
            font_defaults: has_font_defaults,
            text_metrics: composes_text_metrics,
            shadow_slots,
        },
        tables::Tables {
            transforms,
            filters,
            font_defaults,
            leading_registers,
            gradients,
            shadows,
        },
        &states,
    );
    let (compose, effect_mask) = pipeline::compose(pipeline::Needs {
        gradients: needs_gradient_slots,
        shadows: needs_shadow_slots,
        filters: needs_filter_slots,
        text_metrics: composes_text_metrics,
        leading_registers: uses_leading_registers,
        transforms: needs_transform_slots,
    });
    let needs_direction_ambient = ambient || edge_direction;
    out.push_str(
        "// Generated by Hozo. Do not edit.\n\
         import { createClassResolver } from '@hozo/core/generated/class-resolver'\n",
    );
    if composes_text_metrics {
        out.push_str(
            "import { hozoTextMetricStyles } from '@hozo/core/generated/class-resolver'\n",
        );
    }
    if needs_direction_ambient {
        out.push_str("import { I18nManager } from 'react-native'\n");
    }
    if needs_transform_slots {
        out.push_str(
            "import { hozoTransformStyles } from '@hozo/core/generated/transform-slots'\n",
        );
    }
    if needs_filter_slots {
        out.push_str("import { hozoFilterStyles } from '@hozo/core/generated/filter-slots'\n");
    }
    if needs_gradient_slots {
        out.push_str("import { hozoGradientStyles } from '@hozo/core/generated/gradient-slots'\n");
    }
    if needs_shadow_slots {
        out.push_str("import { hozoShadowStyles } from '@hozo/core/generated/shadow-slots'\n");
    }
    out.push_str(&body);
    if let Some((ordering, partial, _)) = ordering {
        out.push_str(
            "export const hozoClasses = createClassResolver({ schema: 1, styles, unsupported,",
        );
        if !states.is_empty() {
            out.push_str(" states,");
        }
        if needs_direction_ambient {
            out.push_str(" ambient: { rtl: I18nManager.isRTL, ltr: !I18nManager.isRTL },");
        }
        if let Some(compose) = compose {
            out.push_str(&format!(" compose: {compose},"));
        }
        out.push_str(" ordering: { schema: 1, ranks: {");
        for (name, ranks) in &ordering.ranks {
            let ranks: Vec<_> = ranks.iter().map(u32::to_string).collect();
            out.push_str(&format!(" {}: [{}],", quote(name), ranks.join(",")));
        }
        out.push_str(" }");
        if let Some(colors) = state_colors {
            out.push_str(&format!(", rankedStates: {}", quote(&colors)));
        }
        if let Some((barriers, independent)) = partial {
            out.push_str(&format!(
                ", independentColors: [{}, {}]",
                quote(&barriers),
                quote(&independent)
            ));
        }
        out.push_str(" } })\n");
    } else if let Some(compose) = compose {
        out.push_str(&format!("export const hozoClasses = createClassResolver(styles, unsupported, {compose}{states_argument})\n"));
    } else if states.is_empty() && !edge_direction {
        out.push_str("export const hozoClasses = createClassResolver(styles, unsupported)\n");
    } else {
        out.push_str(&format!("export const hozoClasses = createClassResolver(styles, unsupported, undefined{states_argument})\n"));
    }
    if shadow_slots != 0 {
        out.push_str("hozoClasses.shadowSlots = shadows\n");
    }
    if has_gradient_slots {
        out.push_str("hozoClasses.gradientSlots = gradients\n");
    }
    if needs_transform_slots {
        out.push_str("hozoClasses.transformSlots = transforms\n");
    }
    if has_filter_slots {
        out.push_str("hozoClasses.filterSlots = filters\n");
    }
    if has_font_defaults {
        out.push_str("hozoClasses.fontDefaults = fontDefaults\n");
    }
    if uses_leading_registers {
        out.push_str("hozoClasses.leadingRegisters = leadingRegisters\n");
    }
    if effect_mask != 0 {
        out.push_str(&format!("hozoClasses.effectMask = {effect_mask}\n"));
    }
    // Always, empty or not: this module stands in for `@hozo/engine/project`,
    // and a component importing the name from there would get `undefined`
    // from a module that left it out. Data only, read by the engine's
    // `createClassTransitions`, so the module imports nothing new.
    out.push_str("export const hozoClassTransitions = {");
    for (name, condition, spec) in &transitions {
        let condition = condition.map_or("null".to_string(), quote);
        out.push_str(&format!("\n  {}: [{condition}, {spec}],", quote(name)));
    }
    out.push_str(if transitions.is_empty() {
        "}\n"
    } else {
        "\n}\n"
    });
    // This module is already the one project-specific value Metro carries
    // onto the device. Keep the resolved reset choice beside the candidate
    // map so uncompiled fallback components use the same browser defaults
    // as the compiler (#336).
    out.push_str(&format!(
        "export const hozoPreflight = {}\n",
        theme.preflight()
    ));
    out
}

/// A JS string literal. Class names carry `:` `/` `[` `]` and reasons carry
/// backticks and apostrophes, so both are quoted rather than emitted bare.
fn quote(text: &str) -> String {
    let escaped = text
        .replace('\\', r"\\")
        .replace('"', "\\\"")
        .replace('\n', "\\n");
    format!("\"{escaped}\"")
}

#[cfg(test)]
mod tests;
