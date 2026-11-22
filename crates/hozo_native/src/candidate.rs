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
mod edges;
mod pairs;
mod plan;
mod states;
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
        if pairs.is_empty() && gradient.is_none() && shadow.is_none() {
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
            );
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
    if needs_transform_slots {
        body.push_str("const transforms = new Map([\n");
        for (name, metadata) in transforms {
            body.push_str(&format!("  [styles[{}], {metadata}],\n", quote(name)));
        }
        // The key is the same object the resolver merges, not a copy or a
        // class name. A conditional scale then replaces only scale slots,
        // rather than being mistaken for an authored whole-array override.
        for (name, groups) in &states {
            for (index, group) in groups.iter().enumerate() {
                if let Some(metadata) = &group.transform {
                    body.push_str(&format!(
                        "  [states[{}][{index}][1], {metadata}],\n",
                        quote(name)
                    ));
                }
            }
        }
        // A transform-bearing project can still resolve thousands of plain
        // class strings. Skip composition unless this particular list needs
        // it; the resolver continues to cache its unconditional result.
        body.push_str("])\n\n");
    }
    if has_filter_slots {
        // Index actual style identities once. A selected drop-shadow or any
        // other unassessed whole-filter entry keeps the entire filter chain
        // on its old path, never a partly composed approximation.
        body.push_str("const filters = new Map([\n");
        for (name, metadata) in filters {
            body.push_str(&format!(
                "  [styles[{}], {}],\n",
                quote(name),
                metadata.code
            ));
        }
        for (name, groups) in &states {
            for (index, group) in groups.iter().enumerate() {
                if let Some(metadata) = &group.filter {
                    body.push_str(&format!(
                        "  [states[{}][{index}][1], {}],\n",
                        quote(name),
                        metadata.code
                    ));
                }
            }
        }
        body.push_str("])\n\n");
    }
    if has_font_defaults {
        if composes_text_metrics {
            body.push_str("const fontDefaults = new Map([\n");
        } else {
            // Mixed JSX can supply explicit leading even when the generated
            // map only contains font defaults. Keep identity, not copies.
            body.push_str("const fontDefaults = new Set([\n");
        }
        for name in font_defaults {
            body.push_str(&format!("  styles[{}],\n", quote(name)));
        }
        for (name, groups) in &states {
            for (index, group) in groups.iter().enumerate() {
                if group.font_default {
                    body.push_str(&format!("  states[{}][{index}][1],\n", quote(name)));
                }
            }
        }
        if composes_text_metrics {
            body.push_str(
                "].map(style => { const {lineHeight, ...rest} = style; return [style, rest] }))\n\n",
            );
        } else {
            body.push_str("])\n\n");
        }
    }
    let uses_leading_registers = !leading_registers.is_empty();
    if uses_leading_registers {
        body.push_str("const leadingRegisters = new Map([\n");
        for (name, px) in leading_registers {
            body.push_str(&format!(
                "  [styles[{}], {{ lineHeight: {px} }}],\n",
                quote(name)
            ));
        }
        body.push_str("])\n\n");
    }
    let has_gradient_slots = !gradients.is_empty()
        || states
            .iter()
            .any(|(_, groups)| groups.iter().any(|group| group.gradient.is_some()));
    if has_gradient_slots {
        write_composition_table(
            &mut body,
            "gradients",
            gradients
                .iter()
                .map(|(name, metadata)| (*name, metadata.code.as_str())),
            &states,
            |group| {
                group
                    .gradient
                    .as_ref()
                    .map(|metadata| metadata.code.as_str())
            },
        );
    }
    if shadow_slots != 0 {
        write_composition_table(
            &mut body,
            "shadows",
            shadows
                .iter()
                .map(|(name, metadata)| (*name, metadata.code.as_str())),
            &states,
            |group| group.shadow.as_ref().map(|metadata| metadata.code.as_str()),
        );
    }
    // One selected-object pipeline; every composer retains original identities
    // for the next family. No duplicate filter/text/transform decision tree.
    let mut pipeline = String::new();
    let mut input = "resolved";
    if needs_gradient_slots {
        pipeline.push_str(&format!("const gradient = !(deferred & {DEFER_GRADIENT}) && resolved.some(style => gradients.has(style)) ? hozoGradientStyles(resolved, gradients, {}) : resolved; ", crate::gradients::defaults()));
        input = "gradient";
    }
    if needs_shadow_slots {
        pipeline.push_str(&format!("const shadow = !(deferred & {DEFER_SHADOW}) && {input}.some(style => shadows.has(style)) ? hozoShadowStyles({input}, shadows, {}) : {input}; ", crate::shadows::defaults()));
        input = "shadow";
    }
    if needs_filter_slots {
        pipeline.push_str(&format!("const filtered = (deferred & {DEFER_FILTER}) || {input}.some(style => 'filter' in style && !filters.has(style)) ? {input} : {input}.some(style => filters.has(style)) ? hozoFilterStyles({input}, filters) : {input}; "));
        input = "filtered";
    }
    if composes_text_metrics {
        let registers = if uses_leading_registers {
            ", leadingRegisters"
        } else {
            ""
        };
        if uses_leading_registers {
            pipeline.push_str(&format!(
                "const text = (deferred & {DEFER_TEXT_METRICS}) ? {input} : hozoTextMetricStyles({input}, fontDefaults{registers}); "
            ));
        } else {
            pipeline.push_str(&format!(
                "const text = hozoTextMetricStyles({input}, fontDefaults); "
            ));
        }
        input = "text";
    }
    if needs_transform_slots {
        pipeline.push_str(&format!("const transformed = !(deferred & {DEFER_TRANSFORM}) && {input}.some(style => transforms.has(style)) ? hozoTransformStyles({input}, transforms, undefined, Boolean(deferred)) : {input}; "));
        input = "transformed";
    }
    let effect_mask = u8::from(needs_shadow_slots) * DEFER_SHADOW
        + u8::from(needs_gradient_slots) * DEFER_GRADIENT
        + u8::from(needs_transform_slots) * DEFER_TRANSFORM
        + u8::from(needs_filter_slots) * DEFER_FILTER
        + u8::from(uses_leading_registers && composes_text_metrics) * DEFER_TEXT_METRICS;
    let compose = if pipeline.is_empty() {
        None
    } else {
        let args = if effect_mask != 0 {
            "(resolved, deferred)"
        } else {
            "resolved"
        };
        Some(format!("{args} => {{ {pipeline}return {input} }}"))
    };
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
