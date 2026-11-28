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
mod lands;
mod presence;
mod stacked;
pub(crate) mod supports;
mod unwired;

use dark::with_dark_copies;
pub(super) use hooks::RuntimeHook;
pub(crate) use inline_parts::MeasuredOptions;
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
    pub group_interaction_query: bool,
    pub group_ancestor: Option<GroupAncestor<'a>>,
    pub peers: &'a [PeerSibling<'a>],
    pub pattern_slot: Option<&'a str>,
    pub composition: hozo_ir::OwnerSlotComposition,
}

/// Outcome of resolving a standalone or stacked condition into a plain JS
/// boolean expression (used by TextInput field colour props and parent-to-child
/// subtree guards).
pub(crate) enum ResolvedCondition {
    Always,
    Never,
    Guarded {
        expr: String,
        uses_interactive: bool,
    },
}

/// Evaluates `condition` against `target` without emitting diagnostics or
/// leaking hooks when resolution fails.
pub(crate) fn resolve_condition_guard(
    condition: &Condition,
    target: &StyleTarget<'_>,
    source: &str,
    runtime: &mut RuntimeNeeds,
    allow_interactive: bool,
) -> Result<ResolvedCondition, String> {
    let mut atoms = Vec::new();
    let mut pending = vec![condition];
    while let Some(atom) = pending.pop() {
        if let Condition::All(nested) = atom {
            pending.extend(nested.iter().rev());
        } else {
            atoms.push(atom);
        }
    }
    let mut scratch = RuntimeNeeds::default();
    let mut parts = Vec::new();
    let mut uses_interactive = false;
    let mut applies = true;
    for atom in atoms {
        match atom {
            Condition::Always => {}
            Condition::Expr(expr) => {
                parts.push(format!("({})", render_condition_expr(source, expr)));
            }
            Condition::StartingStyle => {
                return Err("`starting:` cannot drive this prop on React Native.".into());
            }
            Condition::DataAttribute(_)
                if presence_closed(atom) && !guards::has_authored_data_prop(target.node, atom) =>
            {
                return Err(
                    "`data-[state=closed]:` is a Presence exit frame and cannot drive this prop without an authored `data-state` prop."
                        .into(),
                );
            }
            _ => match guards::resolve(atom, target, source, &mut scratch)? {
                guards::Guard::Known(true) => {}
                guards::Guard::Known(false) => applies = false,
                guards::Guard::Dynamic(expr) => parts.push(expr),
                guards::Guard::Interactive(expr) => {
                    if !allow_interactive {
                        return Err(format!(
                            "`{}:` requires an interactive callback that this prop does not support.",
                            variant_spelling(atom).unwrap_or_default()
                        ));
                    }
                    parts.push(expr);
                    uses_interactive = true;
                }
                guards::Guard::InteractiveScoped {
                    available,
                    predicate,
                } => {
                    if !allow_interactive {
                        return Err(format!(
                            "`{}:` requires an interactive callback that this prop does not support.",
                            variant_spelling(atom).unwrap_or_default()
                        ));
                    }
                    parts.push(format!("({available} && {predicate})"));
                    uses_interactive = true;
                }
                guards::Guard::Scoped {
                    available,
                    predicate,
                } => parts.push(format!("({available} && {predicate})")),
            },
        }
    }
    if !applies {
        return Ok(ResolvedCondition::Never);
    }
    runtime.hooks.extend(scratch.hooks);
    if parts.is_empty() {
        Ok(ResolvedCondition::Always)
    } else {
        Ok(ResolvedCondition::Guarded {
            expr: parts.join(" && "),
            uses_interactive,
        })
    }
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
    frames: Option<&mut AnimatedFrames>,
    cx: &mut crate::NativeRenderContext<'_>,
) -> usize {
    build_style_entries_with_measured(
        declarations,
        base_name,
        target,
        style_array_parts,
        pressed_parts,
        None,
        inline_parts::MeasuredOptions::default(),
        frames,
        cx,
    )
}

#[allow(clippy::too_many_arguments)]
pub(super) fn build_style_entries_with_measured(
    declarations: &[StyleDeclaration],
    base_name: &str,
    target: &StyleTarget<'_>,
    style_array_parts: &mut Vec<String>,
    pressed_parts: &mut Vec<String>,
    mut self_style_parts: Option<&mut Vec<String>>,
    measured: inline_parts::MeasuredOptions,
    mut frames: Option<&mut AnimatedFrames>,
    cx: &mut crate::NativeRenderContext<'_>,
) -> usize {
    let source = cx.source;
    let theme = cx.theme;
    let diagnostics = &mut *cx.diagnostics;
    let runtime = &mut *cx.runtime;
    let style_entries = &mut *cx.style_entries;
    let node = target.node;

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
                container,
                parent_measured,
                self_measured,
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
            inline_parts::MeasuredOptions {
                allow_self_measured: self_style_parts.is_some() && measured.allow_self_measured,
                allow_parent_measured: measured.allow_parent_measured,
                parent_inset_absolute: measured.parent_inset_absolute,
            },
            runtime,
            diagnostics,
        );
        if props.is_empty()
            && viewport.is_none()
            && container.is_none()
            && parent_measured.is_none()
            && self_measured.is_none()
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
            .chain(container.clone())
            .chain(parent_measured.clone())
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
        let lands = match &condition {
            Condition::Disabled
            | Condition::Enabled
            | Condition::Aria(_)
            | Condition::Environment(_)
            | Condition::FirstChild
            | Condition::LastChild
            | Condition::Structural(_)
            | Condition::Not(_)
            | Condition::Group(_)
            | Condition::Peer(_)
            | Condition::FocusWithin
            | Condition::Has(_)
            | Condition::HasSelector(_)
            | Condition::Pressed
            | Condition::Hover
            | Condition::Focus
            | Condition::FocusVisible
            | Condition::Responsive(_)
            | Condition::Width { .. }
            | Condition::Dark
            | Condition::Container { .. }
            | Condition::Supports(_)
            | Condition::FormState(
                FormState::ReadOnly
                | FormState::PlaceholderShown
                | FormState::Required
                | FormState::Optional
                | FormState::Invalid
                | FormState::Valid
                | FormState::UserInvalid
                | FormState::UserValid,
            ) => lands::from_guard(
                guards::resolve(&condition, target, source, runtime),
                condition == Condition::Enabled,
                node,
            ),
            Condition::Always => Ok(lands::Lands::Base(String::new())),
            Condition::All(conditions) => {
                match stacked::stacked_guard(conditions, target, source, runtime, diagnostics) {
                    Some(stacked) => stacked.lands(frames.is_some(), node),
                    None => Ok(lands::Lands::Nowhere),
                }
            }
            // The frame an element leaves to inside `Presence` (decision
            // 007, amendment 1). On Web it is the attribute `Presence` sets;
            // here it is the state `HozoAnimated` reads from `Presence`, so
            // the entry is handed over as `hozoExit` rather than joining the
            // style array.
            Condition::DataAttribute(_)
                if presence_closed(&condition)
                    && !guards::has_authored_data_prop(node, &condition) =>
            {
                lands::frame(
                    lands::Lands::Exit(String::new()),
                    frames.is_some(),
                    EXIT_WITHOUT_TRANSITION,
                    node,
                )
            }
            Condition::DataAttribute(_) => lands::from_guard(
                guards::resolve(&condition, target, source, runtime),
                false,
                node,
            ),
            // The first frame of an enter animation (decision 007).
            // `HozoAnimated` starts from these values and transitions to
            // the element's style, which is what `@starting-style` does on
            // Web -- so the entry is handed over as `hozoStarting` rather
            // than joining the style array, where it would win and never
            // leave.
            Condition::StartingStyle => lands::frame(
                lands::Lands::Starting(String::new()),
                frames.is_some(),
                STARTING_WITHOUT_TRANSITION,
                node,
            ),
            Condition::Expr(expr) => {
                let guard = render_condition_expr(source, expr);
                // A JS guard decides whether its classes are present, and
                // weighs nothing on Web (`:where()`). In a ranked input the
                // plan has already placed it among the unconditional writes,
                // as Tailwind's order places the class, so it stays there:
                // `cx('p-4', on && 'p-2')` keeps 16px when `on` holds. An
                // unranked input keeps the old base-then-guards layout.
                let prefix = format!("({guard}) && ");
                Ok(if canonical_input {
                    lands::Lands::Base(prefix)
                } else {
                    lands::Lands::Conditional(prefix)
                })
            }
            other => Err(unwired::unwired_diagnostic(other, node)),
        };
        let omitted_supports =
            matches!(lands, Ok(lands::Lands::Nowhere)) && supports::mentions_supports(&condition);
        match lands {
            Ok(lands::Lands::Base(prefix)) => {
                base_parts.extend(guarded(&prefix));
                if let (Some(expr), Some(self_parts)) =
                    (self_measured.as_ref(), self_style_parts.as_deref_mut())
                {
                    self_parts.push(format!("{prefix}{expr}"));
                }
            }
            Ok(lands::Lands::Conditional(prefix)) => {
                conditional.extend(guarded(&prefix));
                if let (Some(expr), Some(self_parts)) =
                    (self_measured.as_ref(), self_style_parts.as_deref_mut())
                {
                    self_parts.push(format!("{prefix}{expr}"));
                }
            }
            Ok(lands::Lands::Pressed(prefix)) => {
                pressed_parts.extend(guarded(&prefix));
                if self_measured.is_some() {
                    diagnostics.push(unwired_variant(
                        node,
                        "self-measured `%`-mixed `calc()` cannot yet run inside an interactive press/hover style callback on Native",
                        Severity::Error,
                    ));
                }
            }
            Ok(lands::Lands::Exit(prefix)) => {
                if let Some(frames) = frames.as_deref_mut() {
                    frames.exit.extend(guarded(&prefix));
                }
                if self_measured.is_some() {
                    diagnostics.push(unwired_variant(
                        node,
                        "self-measured `%`-mixed `calc()` cannot yet run inside an exit transition frame on Native",
                        Severity::Error,
                    ));
                }
            }
            Ok(lands::Lands::Starting(prefix)) => {
                if let Some(frames) = frames.as_deref_mut() {
                    frames.starting.extend(guarded(&prefix));
                }
                if self_measured.is_some() {
                    diagnostics.push(unwired_variant(
                        node,
                        "self-measured `%`-mixed `calc()` cannot yet run inside a starting transition frame on Native",
                        Severity::Error,
                    ));
                }
            }
            Ok(lands::Lands::Nowhere) => {
                if supports::mentions_supports(&condition)
                    && !matches!(condition, Condition::All(_))
                {
                    let written =
                        variant_spelling(&condition).unwrap_or_else(|| "supports-[…]".to_string());
                    diagnostics.push(unwired_variant(
                        node,
                        &format!(
                            "`{written}:` evaluates to false on React Native, so this progressive-enhancement style is omitted on Native. On Web the `@supports` query evaluates in the browser."
                        ),
                        Severity::Warning,
                    ));
                }
            }
            Err(diagnostic) => diagnostics.push(diagnostic),
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
        // `unwired_diagnostic` lists every variant this match routes, so a
        // new `Condition` fails to compile there rather than quietly joining
        // the set that gets computed and dropped. That is exactly how the
        // eight variants it now reports went unnoticed.
        if !props.is_empty() && !omitted_supports {
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
        | Condition::DataAttribute(_)
        | Condition::FirstChild
        | Condition::LastChild
        | Condition::Structural(_)
        | Condition::FormState(_)
        | Condition::Hover
        | Condition::Focus
        | Condition::FocusVisible
        | Condition::FocusWithin
        | Condition::Has(_)
        | Condition::HasSelector(_)
        | Condition::Pressed => true,
        Condition::Group(inner) | Condition::Peer(inner) | Condition::Not(inner) => {
            is_element_state(inner)
        }
        Condition::All(conditions) => conditions.iter().any(is_element_state),
        _ => false,
    }
}
