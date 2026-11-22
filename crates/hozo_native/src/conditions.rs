//! Runtime condition evaluation and conditional style entry construction.
//!
//! This module owns the bridge from IR conditions to React Native runtime
//! hooks, diagnostics, and guarded `style` array entries.

use super::*;

mod dark;
mod guards;
mod hooks;
mod presence;

use dark::with_dark_copies;
pub(super) use hooks::RuntimeHook;
pub(super) use presence::{presence_closed, AnimatedFrames};
use presence::{EXIT_WITHOUT_TRANSITION, STARTING_WITHOUT_TRANSITION};

pub(super) fn unwired_variant(node: &Node, message: &str, severity: Severity) -> Diagnostic {
    Diagnostic {
        code: DiagnosticCode::NotWiredOnNative,
        severity,
        message: message.to_string(),
        span: node.span,
    }
}

pub(crate) struct StyleTarget<'a> {
    pub owner_facts: &'a [OwnerFact],
    pub owner_events: &'a [OwnerEvent],
    pub node: &'a Node,
    pub position: SiblingPosition,
    pub interaction_context: bool,
    pub pattern_slot: Option<&'a str>,
    pub composition: hozo_ir::OwnerSlotComposition,
}

/// Groups `declarations` by condition, registers a named style entry for
/// each group, and records how each should be referenced from the rendered
/// `style` prop. Shared by a node and any `Text` wrapper inserted inside
/// it, so both get identical condition handling.
///
/// Every condition that can't reach the rendered `style` prop reports
/// itself. Until 2026-08-15 they were computed into the StyleSheet and then
/// dropped in silence -- all eight variant-prefixed utilities in the
/// conformance suite, scored as covered because the entry existed.
pub(super) fn build_style_entries(
    declarations: &[StyleDeclaration],
    base_name: &str,
    target: &StyleTarget<'_>,
    style_array_parts: &mut Vec<String>,
    pressed_parts: &mut Vec<String>,
    mut frames: Option<&mut AnimatedFrames>,
    cx: &mut crate::NativeRenderContext<'_>,
) -> usize {
    let source = cx.source;
    let theme = cx.theme;
    let diagnostics = &mut *cx.diagnostics;
    let runtime = &mut *cx.runtime;
    let style_entries = &mut *cx.style_entries;
    let node = target.node;
    let interaction_context = target.interaction_context;

    // Before anything reads them: a paired token becomes a second
    // declaration, so everything below treats it as an ordinary condition.
    let with_dark = with_dark_copies(declarations, theme);
    // Then an element that writes an inline edge both logically and
    // physically gets only logical edges, which mean the same thing to Yoga
    // with and without React Native's RTL left/right swap (#2018). After the
    // dark copies, so a dark physical colour is projected with its light one.
    let (prepared, edge_conflicts) =
        crate::edge_projection::prepare_declarations(with_dark.as_deref().unwrap_or(declarations));
    let declarations: &[StyleDeclaration] = &prepared;
    // A conditional style must land after every unconditional one,
    // whatever order they were written in. On Web the cascade settles this
    // by specificity -- `.hozo-0:disabled` (0,2,0) beats `.hozo-0`
    // (0,1,0) no matter which rule comes first -- but a React Native style
    // array resolves purely last-wins, so position has to stand in for
    // specificity. Writing `disabled:p-8 p-4` used to render p-8 on Web and
    // p-4 on device.
    //
    // Within each half, source order is preserved: two conditions are the
    // same specificity on Web, so there it is source order that decides.
    let mut base_parts: Vec<String> = Vec::new();
    let mut conditional_parts: Vec<String> = Vec::new();
    // Styles under a condition on the element itself -- `disabled:`,
    // `aria-checked:`, `first:` -- kept apart so a caller's runtime
    // `className` can go between them and the rest (#881). On Web these are
    // (0,2,0) and beat the caller's (0,1,1) copy; the resting look -- no
    // condition, a breakpoint, `dark:`, a className branch -- is (0,1,0) and
    // loses to it.
    let mut state_parts: Vec<String> = Vec::new();
    // Mixed text owners must still order the raw register against the
    // caller's writes. Only fold it into defaults on the static path.
    let mixed_text = matches!(
        node.primitive,
        hozo_ir::Primitive::Text | hozo_ir::Primitive::TextInput
    ) && !node.class_name_fallback.is_empty();
    let register = declarations
        .iter()
        .rev()
        .find_map(|declaration| match declaration.property {
            StyleProperty::LeadingRegister(px)
                if !mixed_text && declaration.condition == Condition::Always =>
            {
                Some(px)
            }
            _ => None,
        });
    let hozo_ir::NativeConditionGroupPlan {
        mut groups,
        canonical_input,
    } = hozo_ir::plan_native_condition_groups(declarations, target.composition);
    let mut ordered_states = Vec::new();
    let mut has_interactive = false;
    for (_, props) in &mut groups {
        *props = hozo_ir::dedupe_last_wins(theme.resolve_shadow_tokens(std::mem::take(props)));
        if let Some(px) = register {
            for property in props.iter_mut() {
                if let StyleProperty::LineHeight(hozo_ir::LineHeight::FontDefault(length)) =
                    property
                {
                    *length = hozo_ir::Length::Px(px);
                }
            }
        }
    }
    let is_default = |property: &StyleProperty| {
        matches!(
            property,
            StyleProperty::LineHeight(hozo_ir::LineHeight::FontDefault(_))
        )
    };
    let projects_metrics = groups.iter().any(|(_, props)| props.iter().any(is_default))
        && groups.iter().any(|(_, props)| {
            props.iter().any(|property| {
                matches!(
                    property,
                    StyleProperty::LineHeight(hozo_ir::LineHeight::Length(_))
                )
            })
        });
    if projects_metrics {
        // This is CSS register projection, after authored input precedence
        // has been decided: a font default reads an explicit --tw-leading
        // even from a less-specific rule or another frontend input. Keep
        // normal writes in their established order and move only fallbacks.
        let mut defaults = Vec::new();
        let mut writes = Vec::new();
        for (condition, props) in groups {
            let (fallback, rest): (Vec<_>, Vec<_>) = props.into_iter().partition(is_default);
            if !fallback.is_empty() {
                defaults.push((condition.clone(), fallback));
            }
            if !rest.is_empty() {
                writes.push((condition, rest));
            }
        }
        defaults.extend(writes);
        groups = defaults;
    }
    let expanded_groups: Vec<(Condition, Vec<StyleProperty>, bool)> = if edge_conflicts.is_empty() {
        groups
            .into_iter()
            .map(|(condition, props)| (condition, props, false))
            .collect()
    } else {
        groups
            .iter()
            .flat_map(|(condition, props)| {
                crate::edge_projection::expand_group(condition, props, &edge_conflicts)
            })
            .collect()
    };
    let groups = expanded_groups;
    // A ranked input can revisit a condition after another one -- Tailwind's
    // order put `text-[20px]`, then the other branch's classes, then
    // `text-red-500` -- and each visit is its own group. Named by condition
    // alone, the second StyleSheet entry replaced the first and the 20px was
    // lost, so repeated conditions are named apart as repeated inputs are.
    let repeats = groups.iter().enumerate().any(|(index, (condition, _, _))| {
        groups[..index].iter().any(|(seen, _, _)| seen == condition)
    });
    let mut used_names = (projects_metrics
        || repeats
        || !edge_conflicts.is_empty()
        || declarations
            .windows(2)
            .any(|pair| pair[0].source.input() != pair[1].source.input()))
    .then(std::collections::HashSet::new);

    for (condition, props, resting_direction) in groups {
        let state_start = state_parts.len();
        let interactive_start = pressed_parts.len();
        // Read before the match below moves parts of `condition` out.
        let is_dark_only = condition.mentions_dark();
        let conditional = if resting_direction {
            &mut base_parts
        } else if is_element_state(&condition) {
            &mut state_parts
        } else {
            &mut conditional_parts
        };
        if props.is_empty() {
            continue;
        }
        // A viewport-relative size can't live in the StyleSheet: its value
        // is a number that changes when the device rotates. It becomes an
        // inline object read from a hook instead, so it stays in the same
        // style array -- and therefore in the same last-wins order -- as the
        // static entry it sits beside.
        let (viewport_props, props): (Vec<_>, Vec<_>) =
            props.into_iter().partition(is_viewport_sized);
        let viewport = viewport_object(&viewport_props);
        if viewport.is_some() {
            runtime.hooks.push(RuntimeHook::Viewport);
        }
        // A safe-area inset is the same kind of value: the device knows it
        // and the build does not, and it moves when the device rotates.
        let (safe_area_props, props): (Vec<_>, Vec<_>) =
            props.into_iter().partition(is_safe_area_inset);
        let safe_area = safe_area_object(&safe_area_props);
        if safe_area.is_some() {
            runtime.hooks.push(RuntimeHook::SafeArea);
        }
        let (animation_props, props): (Vec<_>, Vec<_>) = props
            .into_iter()
            .partition(|property| matches!(property, StyleProperty::Animation(_)));
        // `animate-none` asks for no hook: it turns an animation off
        // rather than being one. The last one under this condition wins, as
        // the later `animation` declaration does in CSS.
        let animation_hook = match animation_props.last() {
            Some(StyleProperty::Animation(name)) if *name != hozo_ir::Animation::None => {
                Some(RuntimeHook::Animation(*name))
            }
            _ => None,
        };
        let animation = animation_hook.as_ref().map(RuntimeHook::binding);
        if let Some(hook) = animation_hook {
            runtime.hooks.push(hook);
        }
        // A project's own `@keyframes` (decision 007, slice 3), timed by the
        // `animation-*` longhands written beside it: those under this same
        // condition, over the unconditional ones. The longhands themselves
        // never reach the style array -- they are the hook's argument.
        let (keyframe_props, props): (Vec<_>, Vec<_>) = props
            .into_iter()
            .filter(|property| !crate::keyframes::is_timing(property))
            .partition(|property| {
                matches!(
                    property,
                    StyleProperty::AnimationName(_) | StyleProperty::ThemeAnimation(_)
                )
            });
        let keyframes = keyframe_props.last().and_then(|property| {
            // One of the project's own Tailwind animations: the theme holds
            // both the keyframes and the timing, as `--animate-<name>`.
            if let StyleProperty::ThemeAnimation(name) = property {
                let Some(keyframes) = theme.animation(name).and_then(|animation| animation.keyframes.as_ref())
                else {
                    diagnostics.push(unwired_variant(
                        node,
                        &format!(
                            "`animate-{name}` names an animation the project's Tailwind theme does not define \
                             with `--animate-{name}` and its `@keyframes`, so there is nothing to run here. \
                             On Web the class reaches the page, where the project's own CSS can still run it."
                        ),
                        Severity::Warning,
                    ));
                    return None;
                };
                let unread = theme.animation(name).map(|animation| animation.unread.as_slice()).unwrap_or_default();
                if !unread.is_empty() {
                    diagnostics.push(unwired_variant(
                        node,
                        &format!(
                            "`animate-{name}`: {} in its `@keyframes` could not be read on React Native, so \
                             the frames run without {}. On Web the keyframes apply as written.",
                            unread.iter().map(|declaration| format!("`{declaration}`")).collect::<Vec<_>>().join(", "),
                            if unread.len() == 1 { "it" } else { "them" },
                        ),
                        Severity::Warning,
                    ));
                }
                let shorthand = theme.animation(name).map(|animation| animation.shorthand.as_str()).unwrap_or_default();
                let timing = crate::keyframes::shorthand_timing(shorthand);
                let timing: Vec<&StyleProperty> = timing.iter().collect();
                let spec = crate::keyframes::spec(keyframes, &timing, theme, node, diagnostics);
                let hook = runtime.keyframes_hook(spec);
                let binding = hook.binding();
                runtime.hooks.push(hook);
                return Some(binding);
            }
            let StyleProperty::AnimationName(keyframes) = property else { return None };
            let timing: Vec<&StyleProperty> = declarations
                .iter()
                .filter(|declaration| declaration.condition == Condition::Always)
                .chain(declarations.iter().filter(|declaration| {
                    condition != Condition::Always && declaration.condition == condition
                }))
                .map(|declaration| &declaration.property)
                .filter(|property| crate::keyframes::is_timing(property))
                .collect();
            let spec = crate::keyframes::spec(keyframes, &timing, theme, node, diagnostics);
            let hook = runtime.keyframes_hook(spec);
            let binding = hook.binding();
            runtime.hooks.push(hook);
            Some(binding)
        });
        if props.is_empty()
            && viewport.is_none()
            && safe_area.is_none()
            && animation.is_none()
            && keyframes.is_none()
        {
            continue;
        }
        let mut name = match condition_suffix(&condition) {
            None => base_name.to_string(),
            Some(suffix) => format!("{base_name}_{suffix}"),
        };
        // Provenance can keep two rules for the same predicate apart. The
        // later one must not overwrite the earlier StyleSheet entry itself.
        if let Some(used_names) = &mut used_names {
            let original_name = name.clone();
            let mut occurrence = 1;
            while !used_names.insert(name.clone()) {
                occurrence += 1;
                name = format!("{original_name}_cascade{occurrence}");
            }
        }
        // The static entry and the inline object are separate array
        // elements rather than one combined string: a single part is emitted
        // as `style={part}` without the brackets, and `styles.a, {…}` there
        // would be a comma expression rather than two styles.
        let parts: Vec<String> = props
            .is_empty()
            .then(Vec::new)
            .unwrap_or_else(|| vec![format!("{STYLE_OBJECT}.{name}")])
            .into_iter()
            .chain(viewport.clone())
            .chain(safe_area.clone())
            .chain(animation.clone())
            .chain(keyframes.clone())
            .collect();
        // Each part carries the condition's guard. There may be two of them
        // (a StyleSheet entry and an inline viewport object), and both have
        // to be guarded, or `md:h-screen` would apply its height at every
        // width.
        let guarded = |prefix: &str| -> Vec<String> {
            parts.iter().map(|part| format!("{prefix}{part}")).collect()
        };
        match &condition {
            Condition::Disabled | Condition::Enabled | Condition::Aria(_)
            | Condition::Environment(_) | Condition::FirstChild | Condition::LastChild
            | Condition::Structural(_) | Condition::Not(_) | Condition::Pressed | Condition::Hover | Condition::Focus | Condition::FocusVisible
            | Condition::Responsive(_) | Condition::Width { .. } | Condition::Dark
            | Condition::Container { .. } | Condition::FormState(FormState::ReadOnly | FormState::PlaceholderShown) => {
                match guards::resolve(&condition, target, source, runtime) {
                    Ok(guards::Guard::Known(true)) if condition == Condition::Enabled => base_parts.extend(parts.clone()),
                    Ok(guards::Guard::Known(true)) => conditional.extend(guarded("")),
                    Ok(guards::Guard::Known(false)) => {}
                    Ok(guards::Guard::Dynamic(guard)) => conditional.extend(guarded(&format!("{guard} && "))),
                    Ok(guards::Guard::Interactive(guard)) => pressed_parts.extend(guarded(&format!("{guard} && "))),
                    Ok(guards::Guard::InteractiveScoped { available, predicate }) => pressed_parts.extend(guarded(&format!("({available} && {predicate}) && "))),
                    Ok(guards::Guard::Scoped { available, predicate }) => conditional.extend(guarded(&format!("({available} && {predicate}) && "))),
                    Err(reason) => diagnostics.push(unwired_variant(node, &reason, Severity::Error)),
                }
            }
            Condition::Always => base_parts.extend(parts.clone()),
            Condition::All(conditions) => {
                let mut atoms = Vec::new();
                let mut pending: Vec<_> = conditions.iter().rev().collect();
                while let Some(atom) = pending.pop() {
                    if let Condition::All(nested) = atom {
                        pending.extend(nested.iter().rev());
                    } else {
                        atoms.push(atom);
                    }
                }
                let supported = atoms.iter().all(|atom| {
                    matches!(
                        atom,
                        Condition::Always
                            | Condition::Disabled
                            | Condition::Aria(_)
                            | Condition::Enabled
                            | Condition::Group(_)
                            | Condition::Environment(_)
                            | Condition::Pressed
                            | Condition::Expr(_)
                            | Condition::Hover
                            | Condition::Focus
                            | Condition::FocusVisible
                            | Condition::Responsive(_)
                            | Condition::Width { .. }
                            | Condition::Container { .. }
                            | Condition::Dark
                            | Condition::FirstChild
                            | Condition::LastChild
                            | Condition::Structural(_)
                            | Condition::StartingStyle
                            | Condition::Not(_)
                            | Condition::FormState(FormState::ReadOnly | FormState::PlaceholderShown)
                    ) || presence_closed(atom)
                        || (matches!(atom, Condition::DataAttribute(_))
                            && !target.owner_facts.is_empty())
                });
                if !supported {
                    diagnostics.push(unwired_variant(
                        node,
                        &format!(
                            "`{}`: this stacked variant contains a condition React Native \
                             doesn't have wired up yet, so the style is not applied.",
                            atoms
                                .iter()
                                .filter_map(|condition| variant_spelling(condition))
                                .collect::<Vec<_>>()
                                .join(":")
                        ),
                        Severity::Warning,
                    ));
                } else {
                    let mut guards = Vec::new();
                    let mut uses_interactive_state = false;
                    let mut applies = true;
                    // `motion-safe:starting:`, `md:starting:`: the first
                    // frame, under the other atoms' guards. It goes where an
                    // unstacked `starting:` goes, guarded.
                    let mut enters_from = false;
                    // `motion-safe:data-[state=closed]:`: the same, for the
                    // frame an element leaves to inside `Presence`.
                    let mut leaves_to = false;
                    for atom in atoms {
                        match atom {
                            Condition::Disabled | Condition::Enabled | Condition::Aria(_)
                            | Condition::Environment(_) | Condition::FirstChild
                            | Condition::LastChild | Condition::Structural(_) | Condition::Not(_)
                            | Condition::Pressed | Condition::Hover | Condition::Focus | Condition::FocusVisible | Condition::Responsive(_)
                            | Condition::Width { .. } | Condition::Dark | Condition::Container { .. }
                            | Condition::FormState(FormState::ReadOnly | FormState::PlaceholderShown) => {
                                match guards::resolve(atom, target, source, runtime) {
                                    Ok(guards::Guard::Known(true)) => {}
                                    Ok(guards::Guard::Known(false)) => applies = false,
                                    Ok(guards::Guard::Dynamic(guard)) => guards.push(guard),
                                    Ok(guards::Guard::Interactive(guard)) => {
                                        guards.push(guard);
                                        uses_interactive_state = true;
                                    }
                                    Ok(guards::Guard::InteractiveScoped { available, predicate }) => {
                                        guards.push(format!("({available} && {predicate})"));
                                        uses_interactive_state = true;
                                    }
                                    Ok(guards::Guard::Scoped { available, predicate }) => {
                                        guards.push(format!("({available} && {predicate})"));
                                    }
                                    Err(reason) => {
                                        diagnostics.push(unwired_variant(node, &reason, Severity::Error));
                                        applies = false;
                                    }
                                }
                            }
                            Condition::Always => {}
                            Condition::Group(inner) => match group_state(inner, interaction_context) {
                                Some(state) => {
                                    guards.push(state.to_string());
                                    uses_interactive_state = true;
                                }
                                None => {
                                    diagnostics.push(unwired_variant(
                                        node,
                                        &group_unwired_message(inner, interaction_context),
                                        Severity::Error,
                                    ));
                                    applies = false;
                                }
                            },
                            Condition::Expr(expr) => {
                                guards.push(format!("({})", render_condition_expr(source, expr)));
                            }
                            Condition::StartingStyle => enters_from = true,
                            Condition::DataAttribute(_)
                                if !presence_closed(atom) && !target.owner_facts.is_empty() =>
                            {
                                match guards::resolve(atom, target, source, runtime) {
                                    Ok(guards::Guard::InteractiveScoped {
                                        available,
                                        predicate,
                                    }) => {
                                        guards.push(format!("({available} && {predicate})"));
                                        uses_interactive_state = true;
                                    }
                                    Ok(guards::Guard::Known(true)) => {}
                                    Ok(guards::Guard::Known(false)) => applies = false,
                                    Ok(guards::Guard::Dynamic(guard)) => guards.push(guard),
                                    Ok(guards::Guard::Interactive(guard)) => {
                                        guards.push(guard);
                                        uses_interactive_state = true;
                                    }
                                    Ok(guards::Guard::Scoped {
                                        available,
                                        predicate,
                                    }) => guards.push(format!("({available} && {predicate})")),
                                    Err(reason) => {
                                        diagnostics.push(unwired_variant(
                                            node,
                                            &reason,
                                            Severity::Error,
                                        ));
                                        applies = false;
                                    }
                                }
                            }
                            Condition::DataAttribute(_) => leaves_to = true,
                            _ => unreachable!("unsupported atoms were rejected above"),
                        }
                    }
                    if applies {
                        let prefix = if guards.is_empty() {
                            String::new()
                        } else {
                            format!("{} && ", guards.join(" && "))
                        };
                        if enters_from && leaves_to {
                            diagnostics.push(unwired_variant(
                                node,
                                "`starting:` and `data-[state=closed]:` in one class are the first frame of an element that is already leaving. Nothing can be both, so it is not applied here.",
                                Severity::Warning,
                            ));
                        } else if leaves_to {
                            match (frames.as_deref_mut(), uses_interactive_state) {
                                (Some(frames), false) => frames.exit.extend(guarded(&prefix)),
                                (Some(_), true) => diagnostics.push(unwired_variant(
                                    node,
                                    "`data-[state=closed]:` stacked with an interaction state is not wired on React Native: the frame an element leaves to is chosen when `Presence` closes, not as it is pressed or hovered. On Web the same class works.",
                                    Severity::Warning,
                                )),
                                (None, _) => diagnostics.push(unwired_variant(
                                    node,
                                    EXIT_WITHOUT_TRANSITION,
                                    Severity::Warning,
                                )),
                            }
                        } else if enters_from {
                            match (frames.as_deref_mut(), uses_interactive_state) {
                                (Some(frames), false) => frames.starting.extend(guarded(&prefix)),
                                // The first frame is read once, on mount, and
                                // nothing has been pressed or hovered yet.
                                (Some(_), true) => diagnostics.push(unwired_variant(
                                    node,
                                    "`starting:` stacked with an interaction state is the first frame of an element that is already being pressed, hovered or focused as it mounts. React Native reads the first frame once, before any of those can be true, so it is not applied here. On Web the same class works.",
                                    Severity::Warning,
                                )),
                                (None, _) => diagnostics.push(unwired_variant(
                                    node,
                                    STARTING_WITHOUT_TRANSITION,
                                    Severity::Warning,
                                )),
                            }
                        } else if uses_interactive_state {
                            pressed_parts.extend(guarded(&prefix));
                        } else {
                            conditional.extend(guarded(&prefix));
                        }
                    }
                }
            }
            Condition::Group(inner) => match group_state(inner, interaction_context) {
                // `pressed_parts`, not `conditional_parts`: these names
                // come from the render-prop the interaction context hands
                // down, and only that list makes the component take the
                // form where they are in scope. Putting them in the other
                // one emitted `hovered && …` against an identifier that
                // does not exist there.
                Some(state) => pressed_parts.extend(guarded(&format!("{state} && "))),
                None => diagnostics.push(unwired_variant(
                    node,
                    &group_unwired_message(inner, interaction_context),
                    Severity::Error,
                )),
            },
            // The frame an element leaves to inside `Presence` (decision
            // 007, amendment 1). On Web it is the attribute `Presence` sets;
            // here it is the state `HozoAnimated` reads from `Presence`, so
            // the entry is handed over as `hozoExit` rather than joining the
            // style array.
            Condition::DataAttribute(_)
                if !presence_closed(&condition) && !target.owner_facts.is_empty() =>
            {
                match guards::resolve(&condition, target, source, runtime) {
                    Ok(guards::Guard::InteractiveScoped {
                        available,
                        predicate,
                    }) => pressed_parts.extend(guarded(&format!("({available} && {predicate}) && "))),
                    Ok(guards::Guard::Known(true)) => conditional.extend(guarded("")),
                    Ok(guards::Guard::Known(false)) => {}
                    Ok(guards::Guard::Dynamic(guard)) => {
                        conditional.extend(guarded(&format!("{guard} && ")))
                    }
                    Ok(guards::Guard::Interactive(guard)) => {
                        pressed_parts.extend(guarded(&format!("{guard} && ")))
                    }
                    Ok(guards::Guard::Scoped {
                        available,
                        predicate,
                    }) => conditional.extend(guarded(&format!("({available} && {predicate}) && "))),
                    Err(reason) => {
                        diagnostics.push(unwired_variant(node, &reason, Severity::Error))
                    }
                }
            }
            Condition::DataAttribute(_) if presence_closed(&condition) => match frames.as_deref_mut() {
                Some(frames) => frames.exit.extend(guarded("")),
                None => diagnostics.push(unwired_variant(
                    node,
                    EXIT_WITHOUT_TRANSITION,
                    Severity::Warning,
                )),
            },
            // `data-…:` selects on an attribute, and React Native views
            // have none: what the DOM keeps in an attribute a React Native
            // component keeps in a prop, and Hozo cannot read a prop it
            // does not model. `has-…:` and `supports-…:` are a descendant
            // selector and a CSS feature query, neither of which exists
            // here at all.
            Condition::DataAttribute(_)
            | Condition::Supports(_)
            | Condition::Has(_)
            | Condition::HasSelector(_) => diagnostics.push(unwired_variant(
                node,
                &format!(
                    "`{}:` has no React Native equivalent -- it selects on an attribute, a descendant or a CSS feature, and there are no selectors here. On Web the same class works.",
                    variant_spelling(&condition).unwrap_or_default()
                ),
                Severity::Error,
            )),
            // Focus on a *descendant*, which is a relation, and relations
            // on Native are the one thing this backend keeps having to
            // refuse -- see `peer-` below. `focus:` works because an
            // element knows its own focus; nothing here knows a subtree's.
            Condition::FocusWithin => diagnostics.push(unwired_variant(
                node,
                "`focus-within:` asks whether anything *inside* this element has focus, and React Native gives an element no way to know that. `focus:` on the element that actually takes focus is the version that works on both platforms.",
                Severity::Error,
            )),
            // Not a gap in this backend so much as a question the platform
            // cannot be asked: a link the user has been to needs links and
            // a history to have been in them, and neither is a thing React
            // Native has.
            Condition::Visited => diagnostics.push(unwired_variant(
                node,
                "`visited:` styles a link the user has already been to. React Native has no browsing history and no links to have been in one, so there is nothing here for this to be true of. On Web the same class works -- for colours; the browser discards the rest.",
                Severity::Error,
            )),
            // The first frame of an enter animation (decision 007).
            // `HozoAnimated` starts from these values and transitions to
            // the element's style, which is what `@starting-style` does on
            // Web -- so the entry is handed over as `hozoStarting` rather
            // than joining the style array, where it would win and never
            // leave.
            Condition::StartingStyle => match frames.as_deref_mut() {
                Some(frames) => frames.starting.extend(guarded("")),
                None => diagnostics.push(unwired_variant(
                    node,
                    STARTING_WITHOUT_TRANSITION,
                    Severity::Warning,
                )),
            },
            Condition::Open => diagnostics.push(unwired_variant(
                node,
                "`open:` matches an open `<details>`, `<dialog>` or popover by its `open` attribute. React Native has no attribute to read, and `Details` keeps its open state to itself, so nothing here can tell this element is open. On Web the same class works.",
                Severity::Error,
            )),
            Condition::Control(state) => diagnostics.push(unwired_variant(
                node,
                &format!(
                    "`{}:` matches a checkbox, a radio or a form's default button by the DOM's own state. React Native has none of those elements and no selector to ask with. Style from the state you already hold instead -- `aria-checked:` reads `accessibilityState`, which works on both platforms. On Web the same class works.",
                    state.variant_name(),
                ),
                Severity::Error,
            )),
            Condition::Target => diagnostics.push(unwired_variant(
                node,
                "`target:` matches the element the document's URL fragment points at. React Native has no document and no URL to point with, so there is nothing for this to be true of. On Web the same class works.",
                Severity::Error,
            )),
            // Not a gap that could be closed. React Native's styles are
            // objects handed to components, and a pseudo-element is a box
            // the browser makes that has no component to hand one to.
            // `placeholder:` is the near miss: React Native carries a
            // placeholder's colour on `TextInput`'s own
            // `placeholderTextColor` prop, which is a colour and not a
            // style object, so it cannot take the rest of what
            // `placeholder:` is allowed to set.
            Condition::PseudoElement(pseudo) => diagnostics.push(unwired_variant(
                node,
                &format!(
                    "`{}:` styles a pseudo-element, which React Native does not have -- its styles go to components, and there is no component here to give one to. Render the content as a real element instead. On Web the same class works.",
                    pseudo.variant_name(),
                ),
                Severity::Error,
            )),
            Condition::FormState(state) => diagnostics.push(unwired_variant(
                node,
                &format!(
                    "`{}:` is the DOM's constraint validation, which React Native does not have -- there is no `required`, no `pattern`, and nothing for `:invalid` to be true of. Validate in your own code and drive the style from a `className` guard. On Web the same class works.",
                    state.variant_name(),
                ),
                Severity::Error,
            )),
            // A subtree marker that survived the partition above, which
            // means it is wrapped in something -- `not-*:` and the like.
            // Handing a style down is the answer to `*:`; there is no
            // answer to the negation of one, because the set it names is
            // "everything that is not a child of this", which React Native
            // has no way to enumerate.
            Condition::Subtree { .. } => diagnostics.push(unwired_variant(
                node,
                "`*:`/`**:` is handed to this element's children at build time, and this one is wrapped in a variant that cannot be. On Web the same class works from the selector.",
                Severity::Error,
            )),
            Condition::Peer(_) => diagnostics.push(unwired_variant(
                node,
                "`peer-…:` has no React Native equivalent. A sibling relationship is a selector, \
                 and there are none here -- a parent can hand its state down through context, and \
                 a sibling has nowhere to hand it. On Web the same class works.",
                Severity::Error,
            )),
            Condition::In(_) => diagnostics.push(unwired_variant(
                node,
                "`in-…:` asks whether any ancestor is in a state, through a selector. React \
                 Native has no selectors, and with no `group` marker there is no ancestor to hand \
                 the state down from. Put `group` on the ancestor and write `group-…:`. On Web \
                 the same class works.",
                Severity::Error,
            )),
            Condition::Inert => diagnostics.push(unwired_variant(
                node,
                "`inert:` matches an element under the `inert` attribute, which React Native \
                 does not have. On Web the same class works.",
                Severity::Error,
            )),
            Condition::Expr(expr) => {
                let guard = render_condition_expr(source, expr);
                // A JS guard decides whether its classes are present, and
                // weighs nothing on Web (`:where()`). In a ranked input the
                // plan has already placed it among the unconditional writes,
                // as Tailwind's order places the class, so it stays there:
                // `cx('p-4', on && 'p-2')` keeps 16px when `on` holds. An
                // unranked input keeps the old base-then-guards layout.
                let parts = guarded(&format!("({guard}) && "));
                if canonical_input {
                    base_parts.extend(parts);
                } else {
                    conditional.extend(parts);
                }
            }
            // Refused rather than shelved. React Native has no selector
            // engine at all -- not a missing feature but a different
            // architecture, since styles there are objects handed to
            // elements rather than rules matched against a tree. `[&>*]`
            // asks which elements match a pattern, and there is nothing on
            // that side of the compiler that could ever answer it.
            //
            // An error, not a warning: the author wrote a selector, and a
            // build that quietly rendered without it would look like it
            // worked.
            Condition::ArbitrarySelector(selector) => diagnostics.push(Diagnostic {
                code: DiagnosticCode::WebOnlyPropertyOnNative,
                severity: Severity::Error,
                message: format!(
                    "`[{selector}]:` is a CSS selector, and React Native has no selector engine \
                     to match it with -- styles there are objects attached to elements, not \
                     rules matched against a tree. Move the condition into JSX, or apply the \
                     style to the elements directly."
                ),
                span: node.span,
            }),
            // `@media` and `@supports` both ask the browser a question
            // about itself. The nearest Native equivalents are real but
            // unrelated -- `useWindowDimensions` for width, `Platform` for
            // capability -- and neither is a translation of the at-rule
            // the author wrote.
            Condition::ArbitraryAtRule(rule) => diagnostics.push(Diagnostic {
                code: DiagnosticCode::WebOnlyPropertyOnNative,
                severity: Severity::Error,
                message: format!(
                    "`[{rule}]:` is a CSS at-rule, which only a browser can evaluate. Hozo's \
                     own breakpoint variants do work on React Native -- they read \
                     `useWindowDimensions` -- so a width query is better written as `md:` than \
                     as a raw `@media`."
                ),
                span: node.span,
            }),
        }
        if canonical_input {
            // These two buckets describe where a guard gets its value, not
            // its CSS priority. Keep the common order when props-only ARIA
            // and interaction guards overlap. Only use a callback if an
            // actually resolved guard already requires one; unavailable
            // events must not move otherwise valid ARIA styles into it.
            ordered_states.extend(state_parts.drain(state_start..));
            has_interactive |= pressed_parts.len() > interactive_start;
            ordered_states.extend(pressed_parts.drain(interactive_start..));
        }
        // No catch-all arm above, deliberately: a new `Condition` variant
        // must fail to compile here rather than quietly joining the set
        // that gets computed and dropped. That is exactly how the eight
        // variants this function now reports went unnoticed.
        if !props.is_empty() {
            // A rule that applies only in dark mode resolves its colours
            // against the dark palette -- whether it got here from a paired
            // token or from a `dark:` somebody wrote. Those two producing
            // different colours for the same class would be the worse bug.
            style_entries.push((name, props, is_dark_only));
        }
    }

    if has_interactive {
        pressed_parts.append(&mut ordered_states);
    } else {
        state_parts.append(&mut ordered_states);
    }
    style_array_parts.append(&mut base_parts);
    style_array_parts.append(&mut conditional_parts);
    let state_start = style_array_parts.len();
    style_array_parts.append(&mut state_parts);
    // For legacy/mixed inputs, `pressed_parts` is appended by the caller,
    // after these, because only there is it known whether the element can
    // carry press state at all.
    // That puts `pressed:` last among the conditions rather than in source
    // order relative to them -- a divergence from Web only when a
    // `pressed:` utility and another conditional set the same property.
    state_start
}

/// Whether a condition is about the element itself rather than its
/// surroundings: its state, its ARIA attributes, its place among siblings.
/// A breakpoint, `dark:`, an environment query and a className branch are
/// not. See `state_parts`.
fn is_element_state(condition: &Condition) -> bool {
    match condition {
        Condition::Disabled
        | Condition::Enabled
        | Condition::Aria(_)
        | Condition::FirstChild
        | Condition::LastChild
        | Condition::Structural(_)
        | Condition::FormState(_)
        | Condition::Hover
        | Condition::Focus
        | Condition::FocusVisible
        | Condition::Pressed => true,
        Condition::Not(inner) => is_element_state(inner),
        Condition::All(conditions) => conditions.iter().any(is_element_state),
        _ => false,
    }
}
