//! Runtime condition evaluation and conditional style entry construction.
//!
//! This module owns the bridge from IR conditions to React Native runtime
//! hooks, diagnostics, and guarded `style` array entries.

use super::*;

mod dark;
mod groups;
mod guards;
mod hooks;
mod inline_parts;
mod presence;
mod stacked;
mod unwired;

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
    let groups::Groups {
        groups,
        canonical_input,
        projects_metrics,
    } = groups::plan_groups(declarations, &edge_conflicts, target, theme);
    let mut ordered_states = Vec::new();
    let mut has_interactive = false;
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
        let (
            props,
            inline_parts::InlineParts {
                viewport,
                safe_area,
                animation,
                keyframes,
            },
        ) = inline_parts::inline_parts(
            props,
            &condition,
            declarations,
            node,
            theme,
            runtime,
            diagnostics,
        );
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
            Condition::Disabled
            | Condition::Enabled
            | Condition::Aria(_)
            | Condition::Environment(_)
            | Condition::FirstChild
            | Condition::LastChild
            | Condition::Structural(_)
            | Condition::Not(_)
            | Condition::Pressed
            | Condition::Hover
            | Condition::Focus
            | Condition::FocusVisible
            | Condition::Responsive(_)
            | Condition::Width { .. }
            | Condition::Dark
            | Condition::Container { .. }
            | Condition::FormState(FormState::ReadOnly | FormState::PlaceholderShown) => {
                match guards::resolve(&condition, target, source, runtime) {
                    Ok(guards::Guard::Known(true)) if condition == Condition::Enabled => {
                        base_parts.extend(parts.clone())
                    }
                    Ok(guards::Guard::Known(true)) => conditional.extend(guarded("")),
                    Ok(guards::Guard::Known(false)) => {}
                    Ok(guards::Guard::Dynamic(guard)) => {
                        conditional.extend(guarded(&format!("{guard} && ")))
                    }
                    Ok(guards::Guard::Interactive(guard)) => {
                        pressed_parts.extend(guarded(&format!("{guard} && ")))
                    }
                    Ok(guards::Guard::InteractiveScoped {
                        available,
                        predicate,
                    }) => {
                        pressed_parts.extend(guarded(&format!("({available} && {predicate}) && ")))
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
            Condition::Always => base_parts.extend(parts.clone()),
            Condition::All(conditions) => {
                if let Some(stacked::Stacked {
                    prefix,
                    uses_interactive_state,
                    enters_from,
                    leaves_to,
                }) = stacked::stacked_guard(conditions, target, source, runtime, diagnostics)
                {
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
                    }) => {
                        pressed_parts.extend(guarded(&format!("({available} && {predicate}) && ")))
                    }
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
            Condition::DataAttribute(_) if presence_closed(&condition) => {
                match frames.as_deref_mut() {
                    Some(frames) => frames.exit.extend(guarded("")),
                    None => diagnostics.push(unwired_variant(
                        node,
                        EXIT_WITHOUT_TRANSITION,
                        Severity::Warning,
                    )),
                }
            }
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
            other => diagnostics.push(unwired::unwired_diagnostic(other, node)),
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
