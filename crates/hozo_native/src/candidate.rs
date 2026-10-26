//! Runtime candidate-map generation for dynamic Native class names.
//!
//! Static classes never use this path; it is the deliberately small fallback
//! for class strings the compiler cannot resolve ahead of time.

use super::*;
mod plan;
use plan::CandidatePlanBuilder;
pub use plan::{
    CandidateModulePlan, CandidateOrdering, CandidatePriorityEntry, CandidatePriorityGroup,
};

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
    for name in class_names {
        let Some(utility) = hozo_parser::resolve_class_name(name) else {
            if let Some(plan) = plan.as_deref_mut() {
                plan.refused(name, "unrecognized");
            }
            continue;
        };
        if utility.important {
            if let Some(plan) = plan.as_deref_mut() {
                plan.refused(name, "important-not-lowered");
            }
            unsupported.push((name, hozo_parser::IMPORTANT_NOT_LOWERED.into()));
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
            .find_map(StyleProperty::unsupported_on_native)
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
        if pairs.is_empty() {
            if let Some(plan) = plan.as_deref_mut() {
                plan.refused(name, "no-native-output");
            }
            continue;
        }
        if let Some(plan) = plan.as_deref_mut() {
            plan.style(name, &properties, &pairs);
        }
        if let Some(metadata) = crate::transforms::metadata(&properties, theme) {
            transforms.push((name, metadata));
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
    let mut out = String::from(
        "// Generated by Hozo. Do not edit.\n\
         import { createClassResolver } from '@hozo/core/generated/class-resolver'\n",
    );
    let ambient = states.iter().any(|(_, groups)| {
        groups
            .iter()
            .any(|group| group.keys.iter().any(|key| key == "rtl" || key == "ltr"))
    });
    if ambient {
        out.push_str("import { I18nManager } from 'react-native'\n");
    }
    if needs_transform_slots {
        out.push_str(
            "import { hozoTransformStyles } from '@hozo/core/generated/transform-slots'\n",
        );
    }
    out.push_str("\nconst styles = {\n");
    for (name, pairs) in &supported {
        out.push_str(&format!("  {}: {{\n", quote(name)));
        for (key, value) in pairs {
            out.push_str(&format!("    {key}: {value},\n"));
        }
        out.push_str("  },\n");
    }
    out.push_str("}\n\nconst unsupported = {\n");
    for (name, reason) in &unsupported {
        out.push_str(&format!("  {}: {},\n", quote(name), quote(reason)));
    }
    out.push_str("}\n\n");
    // Only when there are any, so a project without state classes keeps the
    // module it had.
    let states_argument = if states.is_empty() {
        ""
    } else {
        out.push_str("const states = {\n");
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
                        .map(|key| format!(", {key}"))
                        .unwrap_or_default();
                    format!("[[{}], {{ {} }}{order}]", keys.join(", "), pairs.join(", "))
                })
                .collect();
            out.push_str(&format!("  {}: [{}],\n", quote(name), groups.join(", ")));
        }
        out.push_str("}\n\n");
        if ambient {
            ", states, { rtl: I18nManager.isRTL, ltr: !I18nManager.isRTL }"
        } else {
            ", states"
        }
    };
    if needs_transform_slots {
        out.push_str("const transforms = new Map([\n");
        for (name, metadata) in transforms {
            out.push_str(&format!("  [styles[{}], {metadata}],\n", quote(name)));
        }
        // The key is the same object the resolver merges, not a copy or a
        // class name. A conditional scale then replaces only scale slots,
        // rather than being mistaken for an authored whole-array override.
        for (name, groups) in &states {
            for (index, group) in groups.iter().enumerate() {
                if let Some(metadata) = &group.transform {
                    out.push_str(&format!(
                        "  [states[{}][{index}][1], {metadata}],\n",
                        quote(name)
                    ));
                }
            }
        }
        // A transform-bearing project can still resolve thousands of plain
        // class strings. Skip composition unless this particular list needs
        // it; the resolver continues to cache its unconditional result.
        out.push_str("])\n\n");
    }
    let ordering = plan.and_then(|plan| {
        if plan.finalized {
            plan.prepare_ordering()
        } else {
            None
        }
    });
    if let Some(ordering) = ordering {
        out.push_str(
            "export const hozoClasses = createClassResolver({ schema: 1, styles, unsupported,",
        );
        if !states.is_empty() {
            out.push_str(" states,");
        }
        if ambient {
            out.push_str(" ambient: { rtl: I18nManager.isRTL, ltr: !I18nManager.isRTL },");
        }
        if needs_transform_slots {
            out.push_str(" compose: resolved => resolved.some(style => transforms.has(style)) ? hozoTransformStyles(resolved, transforms) : resolved,");
        }
        out.push_str(" ordering: { schema: 1, ranks: {");
        for (name, ranks) in &ordering.ranks {
            let ranks: Vec<_> = ranks.iter().map(u32::to_string).collect();
            out.push_str(&format!(" {}: [{}],", quote(name), ranks.join(",")));
        }
        out.push_str(" } } })\n");
    } else if needs_transform_slots {
        out.push_str(&format!("export const hozoClasses = createClassResolver(styles, unsupported, resolved => resolved.some(style => transforms.has(style)) ? hozoTransformStyles(resolved, transforms) : resolved{states_argument})\n"));
    } else if states.is_empty() {
        out.push_str("export const hozoClasses = createClassResolver(styles, unsupported)\n");
    } else {
        out.push_str(&format!("export const hozoClasses = createClassResolver(styles, unsupported, undefined{states_argument})\n"));
    }
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

/// Metadata stays beside the emitted style object, never inside RN styles.
struct StateGroup {
    keys: Vec<String>,
    pairs: Vec<(String, String)>,
    transform: Option<String>,
    order: Option<u32>,
}

/// A utility's groups as state groups, if every one is conditioned on the
/// element's own state and nothing else, and every property has a Native
/// form. `None` sends it to `unsupported` as before.
fn state_groups(
    groups: &[(Condition, Vec<StyleProperty>)],
    theme: &Theme,
) -> Option<Vec<StateGroup>> {
    groups
        .iter()
        .map(|(condition, properties)| {
            let keys = state_keys(condition)?;
            if properties
                .iter()
                .any(|property| property.unsupported_on_native().is_some())
            {
                return None;
            }
            let pairs: Vec<(String, String)> = style_pairs(properties, theme)
                .into_iter()
                .map(|(key, value)| (key.to_string(), value))
                .collect();
            Some(StateGroup {
                keys,
                pairs,
                transform: crate::transforms::metadata(properties, theme),
                order: hozo_parser::interaction_cascade_key(condition),
            })
        })
        .collect()
}

/// The keys an element's state is handed to the resolver under. ARIA states
/// keep their attribute names, so `aria-pressed` cannot be read as the
/// pointer's `pressed`.
fn state_keys(condition: &Condition) -> Option<Vec<String>> {
    Some(match condition {
        Condition::Hover => vec!["hovered".to_string()],
        Condition::Pressed => vec!["pressed".to_string()],
        Condition::Focus => vec!["focused".to_string()],
        Condition::FocusVisible => vec!["focusVisible".to_string()],
        Condition::Disabled => vec!["disabled".to_string()],
        Condition::FormState(FormState::ReadOnly) => vec!["readOnly".to_string()],
        Condition::Aria(state) => vec![format!("aria-{state}")],
        Condition::DataAttribute(selector) => {
            vec![data_fact_key(selector)?]
        }
        Condition::Environment(Environment::Rtl) => vec!["rtl".to_string()],
        Condition::Environment(Environment::Ltr) => vec!["ltr".to_string()],
        Condition::All(conditions) => {
            let mut keys = Vec::new();
            for condition in conditions {
                keys.extend(state_keys(condition)?);
            }
            keys
        }
        _ => return None,
    })
}

/// Encode a narrow, case-sensitive attribute predicate once at build time.
/// The owner supplies its boolean result, not a raw attribute for JS to parse.
/// Presence and equality have disjoint keys; quoted and unquoted safe tokens
/// normalize alike. Escapes, whitespace, flags and other CSS operators stay
/// unsupported rather than receiving an approximate selector interpretation.
fn data_fact_key(selector: &str) -> Option<String> {
    let query = selector.strip_prefix("[data-")?.strip_suffix(']')?;
    let (name, value) = match query.split_once('=') {
        Some((name, value)) => (name, Some(value)),
        None => (query, None),
    };
    if name.is_empty()
        || !name
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-' || b == b'_')
    {
        return None;
    }
    let Some(raw_value) = value else {
        return Some(format!("data-{name}"));
    };
    let quoted = raw_value.starts_with(['\'', '"']);
    let value = if quoted {
        let quote = raw_value.chars().next()?;
        raw_value.strip_prefix(quote)?.strip_suffix(quote)?
    } else {
        raw_value
    };
    if value.is_empty()
        || !value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
    {
        return None;
    }
    // CSS's unquoted attribute values are identifiers, not arbitrary strings.
    // A quoted numeric token is safe, but an unquoted number is not one.
    let ident = value.strip_prefix('-').unwrap_or(value);
    if !quoted
        && !ident
            .bytes()
            .next()
            .is_some_and(|b| b.is_ascii_alphabetic() || b == b'_' || b == b'-')
    {
        return None;
    }
    Some(format!("data-{name}={value}"))
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

/// The React Native `key: value` pairs a set of IR properties becomes.
///
/// Distinct IR properties can collapse onto one RN key (all four per-side
/// border styles map to `borderStyle`), which would emit a duplicate object
/// key. Keep the last, matching how JS itself would resolve it -- but
/// written once.
pub(crate) fn style_pairs<'a>(props: &'a [StyleProperty], theme: &Theme) -> Vec<(&'a str, String)> {
    let mut emitted: Vec<(&'a str, String)> = Vec::new();
    // Which axes a `-reverse` utility flipped, read across the whole set
    // because it is a second utility describing the first.
    let flipped = |axis: Axis| {
        props.iter().any(|p| {
            matches!(
                p,
                StyleProperty::SpaceReverse(a) | StyleProperty::DivideReverse(a) if *a == axis
            )
        })
    };
    let reversed = [flipped(Axis::X), flipped(Axis::Y)];
    for prop in props {
        // A child-scoped property (`space-*`/`divide-*`) means something
        // different from a property of the same name on the element itself,
        // and only ever reaches here inside an entry built for the
        // children, so the dispatch is on the property rather than on which
        // entry is being built.
        let pairs = if style::is_child_scoped(prop) {
            style::child_property_and_value(prop, theme, reversed)
        } else {
            style::property_and_value(prop, theme)
        };
        for (key, value) in pairs {
            // A property refused for Native (see
            // `StyleProperty::unsupported_on_native`) yields no value;
            // writing the key anyway would emit `height: ,`, which isn't
            // even parseable JS.
            if value.is_empty() {
                continue;
            }
            match emitted.iter_mut().find(|(existing, _)| *existing == key) {
                Some(slot) => slot.1 = value,
                None => emitted.push((key, value)),
            }
        }
    }
    uniform_border_width(&mut emitted);
    if let Some(transform) = style::transform_entry(props, theme) {
        emitted.push(transform);
    }
    if let Some(filter) = style::filter_entry(props, theme) {
        emitted.push(filter);
    }
    if let Some(shadow) = style::box_shadow_entry(props, theme) {
        emitted.push(shadow);
    }
    if let Some(gradient) = style::background_image_entry(props, theme) {
        emitted.push(gradient);
    }
    emitted
}

/// Adds `borderWidth` beside four equal side widths.
///
/// Android draws a rounded border dashed or dotted only when the view has
/// one `borderWidth` for all sides; four side widths, even equal ones, take
/// its per-side path, which fills each side solid. So `rounded-xl border-2
/// border-dashed` came out solid there (#1205). The side widths stay, so
/// what overrides what is unchanged: React Native lets a side width beat
/// `borderWidth` wherever either is written, and every style that sets this
/// one also sets all four sides.
fn uniform_border_width(emitted: &mut Vec<(&str, String)>) {
    const SIDES: [&str; 4] = [
        "borderTopWidth",
        "borderRightWidth",
        "borderBottomWidth",
        "borderLeftWidth",
    ];
    let width = |side: &str| {
        emitted
            .iter()
            .find(|(key, _)| *key == side)
            .map(|(_, value)| value)
    };
    let Some(top) = width(SIDES[0]) else { return };
    if SIDES[1..].iter().all(|side| width(side) == Some(top))
        && !emitted.iter().any(|(key, _)| *key == "borderWidth")
    {
        let top = top.clone();
        emitted.push(("borderWidth", top));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn four_equal_side_widths_also_say_border_width_for_android_dashes() {
        let theme = Theme::default();
        let props = [
            StyleProperty::BorderTopWidth(Length::Px(2.0)),
            StyleProperty::BorderRightWidth(Length::Px(2.0)),
            StyleProperty::BorderBottomWidth(Length::Px(2.0)),
            StyleProperty::BorderLeftWidth(Length::Px(2.0)),
        ];
        let pairs = style_pairs(&props, &theme);
        assert!(
            pairs.contains(&("borderWidth", "2".to_string())),
            "{pairs:?}"
        );
        assert!(
            pairs.contains(&("borderTopWidth", "2".to_string())),
            "{pairs:?}"
        );

        // One side apart: no claim that the border is uniform.
        let uneven = [
            StyleProperty::BorderTopWidth(Length::Px(4.0)),
            StyleProperty::BorderRightWidth(Length::Px(2.0)),
            StyleProperty::BorderBottomWidth(Length::Px(2.0)),
            StyleProperty::BorderLeftWidth(Length::Px(2.0)),
        ];
        assert!(!style_pairs(&uneven, &theme)
            .iter()
            .any(|(key, _)| *key == "borderWidth"));
    }

    #[test]
    fn data_presence_candidates_use_boolean_owner_facts_not_a_selector_interpreter() {
        let module = render_candidate_module(
            &[
                "data-[hozo-range-start]:p-4",
                "data-[hozo-disabled]:hover:opacity-50",
                "rtl:data-open:aria-selected:border-2",
            ]
            .map(String::from),
            &Theme::default(),
        );
        assert!(
            module.contains(r#""data-[hozo-range-start]:p-4": [[["data-hozo-range-start"], "#),
            "{module}"
        );
        assert!(
            module.contains(
                r#""data-[hozo-disabled]:hover:opacity-50": [[["data-hozo-disabled", "hovered"], "#
            ),
            "{module}"
        );
        assert!(module.contains(r#""rtl:data-open:aria-selected:border-2": [[["rtl", "data-open", "aria-selected"], "#), "{module}");
        assert!(!module.contains("is conditional"), "{module}");
    }

    #[test]
    fn data_equality_normalizes_safe_tokens_into_boolean_predicate_keys() {
        for selector in [
            "[data-state=Closed]",
            "[data-state=\"Closed\"]",
            "[data-state='Closed']",
        ] {
            assert_eq!(
                data_fact_key(selector).as_deref(),
                Some("data-state=Closed")
            );
        }
        assert_eq!(
            data_fact_key("[data-state='123']").as_deref(),
            Some("data-state=123")
        );
        let module = render_candidate_module(
            &[
                "data-[hozo-step=increase]:top-0",
                "hover:data-[state=open]:p-4",
            ]
            .map(String::from),
            &Theme::default(),
        );
        assert!(
            module.contains(r#"[[["data-hozo-step=increase"], { top: 0 }]]"#),
            "{module}"
        );
        assert!(
            module.contains(r#"[[["hovered", "data-state=open"], "#),
            "{module}"
        );
        assert!(!module.contains("is conditional"), "{module}");
    }

    #[test]
    fn complex_data_queries_relations_negation_and_unsafe_names_remain_unsupported() {
        for condition in [
            Condition::DataAttribute("[data-state~=closed]".into()),
            Condition::DataAttribute("[data-state|=closed]".into()),
            Condition::DataAttribute("[data-state^=closed]".into()),
            Condition::DataAttribute("[data-state$=closed]".into()),
            Condition::DataAttribute("[data-state*=closed]".into()),
            Condition::DataAttribute("[data-state=\"closed\" i]".into()),
            Condition::DataAttribute("[data-state=\"two words\"]".into()),
            Condition::DataAttribute("[data-state=\"two\\77ords\"]".into()),
            Condition::DataAttribute("[data-state=\"\"]".into()),
            Condition::DataAttribute("[data-state=1]".into()),
            Condition::DataAttribute("[data-state=-1]".into()),
            Condition::DataAttribute("[data-state='open\"]".into()),
            Condition::DataAttribute("[data-state=open=other]".into()),
            Condition::DataAttribute("[data-]".into()),
            Condition::DataAttribute("[data-foo bar]".into()),
            Condition::DataAttribute("[data-foo][data-bar]".into()),
            Condition::DataAttribute("[data-Foo]".into()),
            Condition::Not(Box::new(Condition::DataAttribute("[data-open]".into()))),
            Condition::Group(Box::new(Condition::DataAttribute("[data-open]".into()))),
        ] {
            assert!(state_keys(&condition).is_none(), "{condition:?}");
        }
    }

    #[test]
    fn reset_candidates_carry_slots_without_private_stylesheet_keys() {
        let module = render_candidate_module(
            &["rotate-45", "scale-95", "rotate-none", "transform-cpu"].map(String::from),
            &Theme::default(),
        );
        assert!(
            module.contains("? hozoTransformStyles(resolved, transforms) : resolved"),
            "{module}"
        );
        assert!(
            module.contains("[styles[\"rotate-none\"], { rotate: [] }]"),
            "{module}"
        );
        assert!(module.contains("[styles[\"scale-95\"], { scale3d: false, scaleSlots: [{ scale: 0.95 }], scale: 'slots' }]"), "{module}");
        assert!(
            module.contains("[styles[\"transform-cpu\"], { functions: 'slots' }]"),
            "{module}"
        );
        assert!(!module.contains("Web-only"), "{module}");
    }

    #[test]
    fn maps_class_names_to_style_objects() {
        let module = render_candidate_module(
            &["p-4".to_string(), "bg-blue-500".to_string()],
            &Theme::default(),
        );
        assert!(module.contains(r#""p-4": {"#), "{module}");
        assert!(module.contains("paddingTop: 16,"), "{module}");
        assert!(module.contains(r#""bg-blue-500": {"#), "{module}");
        assert!(
            module.contains("createClassResolver(styles, unsupported)"),
            "{module}"
        );
        assert!(
            module.contains("export const hozoPreflight = false"),
            "{module}"
        );
    }

    #[test]
    fn state_transform_metadata_indexes_the_actual_state_objects() {
        let module = render_candidate_module(
            &[
                "rotate-3",
                "active:scale-95",
                "hover:scale-none",
                "hover:active:rotate-6",
            ]
            .map(String::from),
            &Theme::default(),
        );
        assert!(module.contains("const transforms = new Map(["), "{module}");
        for expected in [
            r#"[styles["rotate-3"], { rotate: [{ rotate: '3deg' }] }]"#,
            r#"[states["active:scale-95"][0][1], { scale3d: false, scaleSlots: [{ scale: 0.95 }], scale: 'slots' }]"#,
            r#"[states["hover:scale-none"][0][1], { scale: 'none' }]"#,
            r#"[states["hover:active:rotate-6"][0][1], { rotate: [{ rotate: '6deg' }] }]"#,
        ] {
            assert!(
                module.contains(expected),
                "{expected} missing from {module}"
            );
        }
        assert!(
            module.contains("resolved.some(style => transforms.has(style))"),
            "{module}"
        );
    }

    #[test]
    fn a_state_only_transform_imports_composition_but_colour_state_does_not() {
        let module = render_candidate_module(&["active:scale-95".to_string()], &Theme::default());
        assert!(module.contains("hozoTransformStyles"), "{module}");
        assert!(
            module.contains(r#"states["active:scale-95"][0][1]"#),
            "{module}"
        );
        let module = render_candidate_module(&["hover:bg-blue-500".to_string()], &Theme::default());
        assert!(!module.contains("hozoTransformStyles"), "{module}");
    }

    #[test]
    fn carries_the_resolved_preflight_choice() {
        let module = render_candidate_module(&[], &Theme::new(Default::default(), None, true));
        assert!(
            module.contains("export const hozoPreflight = true"),
            "{module}"
        );
    }

    #[test]
    fn conditional_candidates_are_named_rather_than_silently_missing() {
        // A style object can't carry `md:` or `dark:`, and making it able to
        // means subscribing to the window and the colour scheme -- the engine
        // this design is choosing not to ship. Reported when used, not at
        // build time: appearing in the scan doesn't prove anything produces it.
        let module = render_candidate_module(&["md:bg-blue-500".to_string()], &Theme::default());
        assert!(!module.contains("styles = { \"md"), "{module}");
        assert!(
            module.contains(r#""md:bg-blue-500": "`md:bg-blue-500` is conditional"#),
            "{module}"
        );
    }

    /// The element's own state is the exception (#886): the pressable that
    /// renders it already tracks it, so the class is kept with the state it
    /// needs and the resolver applies it when handed that state.
    #[test]
    fn state_candidates_are_kept_with_the_state_they_need() {
        let module = render_candidate_module(
            &[
                "active:opacity-80".to_string(),
                "hover:active:p-8".to_string(),
                "aria-pressed:p-4".to_string(),
                "disabled:cursor-not-allowed".to_string(),
            ],
            &Theme::default(),
        );
        assert!(
            module.contains(r#""active:opacity-80": [[["pressed"], { opacity: 0.8 }, 264]],"#),
            "{module}"
        );
        assert!(
            module.contains(r#""hover:active:p-8": [[["hovered", "pressed"], "#),
            "{module}"
        );
        assert!(
            module.contains(r#""aria-pressed:p-4": [[["aria-pressed"], "#),
            "{module}"
        );
        // A state does not make a Web-only property portable.
        assert!(
            module.contains(r#""disabled:cursor-not-allowed": ""#),
            "{module}"
        );
        assert!(
            module.contains("createClassResolver(styles, unsupported, undefined, states)"),
            "{module}"
        );
    }

    /// A direction is fixed for the run, so the module reads it once and the
    /// resolver decides `rtl:` without any element supplying it.
    #[test]
    fn direction_candidates_are_kept_under_a_key_the_module_supplies() {
        let module = render_candidate_module(
            &["rtl:rotate-45".to_string(), "ltr:ps-2".to_string()],
            &Theme::default(),
        );
        assert!(
            module.contains(r#""rtl:rotate-45": [[["rtl"], { transform: "#),
            "{module}"
        );
        assert!(module.contains(r#""ltr:ps-2": [[["ltr"], "#), "{module}");
        assert!(
            module.contains("import { I18nManager } from 'react-native'"),
            "{module}"
        );
        assert!(
            module.contains("states, { rtl: I18nManager.isRTL, ltr: !I18nManager.isRTL })"),
            "{module}"
        );
        assert!(!module.contains("is conditional"), "{module}");

        // Without one, the module has no reason to import React Native.
        let module = render_candidate_module(&["hover:p-4".to_string()], &Theme::default());
        assert!(!module.contains("I18nManager"), "{module}");
    }

    #[test]
    fn web_only_candidates_are_named_too() {
        let module = render_candidate_module(&["grid".to_string()], &Theme::default());
        assert!(module.contains(r#""grid": ""#), "{module}");
        assert!(module.contains("Web-only"), "{module}");
    }

    #[test]
    fn unrecognized_candidates_are_skipped_entirely() {
        // Scanning is imprecise by design; a token that only looked like a
        // class is neither a style nor a problem to report.
        let module = render_candidate_module(&["useState".to_string()], &Theme::default());
        assert!(!module.contains("useState"), "{module}");
    }
}
