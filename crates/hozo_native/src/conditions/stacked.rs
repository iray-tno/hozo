//! A stacked variant (`md:hover:`, `motion-safe:starting:`): its atoms
//! resolved to one guard, or refused when React Native cannot hold one.

use super::*;

/// The guard a stacked variant's parts are written under, and where they go.
pub(super) struct Stacked {
    pub(super) prefix: String,
    pub(super) uses_interactive_state: bool,
    pub(super) enters_from: bool,
    pub(super) leaves_to: bool,
}

/// `None` when the variant is reported instead, or can never apply.
pub(super) fn stacked_guard(
    conditions: &[Condition],
    target: &StyleTarget<'_>,
    source: &str,
    runtime: &mut RuntimeNeeds,
    diagnostics: &mut Vec<Diagnostic>,
) -> Option<Stacked> {
    let node = target.node;
    let interaction_context = target.interaction_context;
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
            || (matches!(atom, Condition::DataAttribute(_)) && !target.owner_facts.is_empty())
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
        return None;
    }
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
                match guards::resolve(atom, target, source, runtime) {
                    Ok(guards::Guard::Known(true)) => {}
                    Ok(guards::Guard::Known(false)) => applies = false,
                    Ok(guards::Guard::Dynamic(guard)) => guards.push(guard),
                    Ok(guards::Guard::Interactive(guard)) => {
                        guards.push(guard);
                        uses_interactive_state = true;
                    }
                    Ok(guards::Guard::InteractiveScoped {
                        available,
                        predicate,
                    }) => {
                        guards.push(format!("({available} && {predicate})"));
                        uses_interactive_state = true;
                    }
                    Ok(guards::Guard::Scoped {
                        available,
                        predicate,
                    }) => {
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
                        diagnostics.push(unwired_variant(node, &reason, Severity::Error));
                        applies = false;
                    }
                }
            }
            Condition::DataAttribute(_) => leaves_to = true,
            _ => unreachable!("unsupported atoms were rejected above"),
        }
    }
    if !applies {
        return None;
    }
    let prefix = if guards.is_empty() {
        String::new()
    } else {
        format!("{} && ", guards.join(" && "))
    };
    Some(Stacked {
        prefix,
        uses_interactive_state,
        enters_from,
        leaves_to,
    })
}
