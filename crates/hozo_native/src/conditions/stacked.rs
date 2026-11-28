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
                | Condition::DataAttribute(_)
                | Condition::Enabled
                | Condition::Group(_)
                | Condition::Peer(_)
                | Condition::Environment(_)
                | Condition::Pressed
                | Condition::Expr(_)
                | Condition::Hover
                | Condition::Focus
                | Condition::FocusVisible
                | Condition::FocusWithin
                | Condition::Has(_)
                | Condition::HasSelector(_)
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
        )
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
    let statically_false = atoms
        .iter()
        .any(|atom| structural::condition_statically_false(atom, node, target.position));
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
            | Condition::Group(_)
            | Condition::Peer(_)
            | Condition::Pressed
            | Condition::Hover
            | Condition::Focus
            | Condition::FocusVisible
            | Condition::FocusWithin
            | Condition::Has(_)
            | Condition::HasSelector(_)
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
                        // When a sibling-position atom already folds this rule
                        // to `false`, pre-render passes intentionally omit the
                        // unused `HozoPeerScope`/`HozoPressable` runtime channel
                        // on an otherwise-capable peer or `.group` owner; do not
                        // report that omitted channel as a missing owner.
                        let omitted_dead_channel = statically_false
                            && (peer_interaction_state(atom).is_some_and(|state| {
                                target.peers.iter().any(|peer| {
                                    interaction::owns_events(peer.node)
                                        || (matches!(state, "focused" | "focusVisible")
                                            && peer.node.primitive == Primitive::TextInput)
                                })
                            }) || (group_interaction_state(atom).is_some()
                                && target
                                    .group_ancestor
                                    .is_some_and(|group| interaction::owns_events(group.node))));
                        if !omitted_dead_channel {
                            diagnostics.push(unwired_variant(node, &reason, Severity::Error));
                        }
                        applies = false;
                    }
                }
            }
            Condition::Always => {}
            Condition::Expr(expr) => {
                guards.push(format!("({})", render_condition_expr(source, expr)));
            }
            Condition::StartingStyle => enters_from = true,
            Condition::DataAttribute(_)
                if presence_closed(atom) && !guards::has_authored_data_prop(node, atom) =>
            {
                leaves_to = true;
            }
            Condition::DataAttribute(_) => match guards::resolve(atom, target, source, runtime) {
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
            },
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

impl Stacked {
    /// Where the variant's parts land. A frame for `HozoAnimated` needs an
    /// element that animates, and cannot also wait on an interaction state.
    pub(super) fn lands(self, animates: bool, node: &Node) -> Result<lands::Lands, Diagnostic> {
        let Stacked {
            prefix,
            uses_interactive_state,
            enters_from,
            leaves_to,
        } = self;
        if enters_from && leaves_to {
            Err(unwired_variant(
                node,
                "`starting:` and `data-[state=closed]:` in one class are the first frame of an element that is already leaving. Nothing can be both, so it is not applied here.",
                Severity::Warning,
            ))
        } else if leaves_to {
            match (animates, uses_interactive_state) {
                (true, false) => Ok(lands::Lands::Exit(prefix)),
                (true, true) => Err(unwired_variant(
                    node,
                    "`data-[state=closed]:` stacked with an interaction state is not wired on React Native: the frame an element leaves to is chosen when `Presence` closes, not as it is pressed or hovered. On Web the same class works.",
                    Severity::Warning,
                )),
                (false, _) => Err(unwired_variant(
                    node,
                    EXIT_WITHOUT_TRANSITION,
                    Severity::Warning,
                )),
            }
        } else if enters_from {
            match (animates, uses_interactive_state) {
                (true, false) => Ok(lands::Lands::Starting(prefix)),
                // The first frame is read once, on mount, and
                // nothing has been pressed or hovered yet.
                (true, true) => Err(unwired_variant(
                    node,
                    "`starting:` stacked with an interaction state is the first frame of an element that is already being pressed, hovered or focused as it mounts. React Native reads the first frame once, before any of those can be true, so it is not applied here. On Web the same class works.",
                    Severity::Warning,
                )),
                (false, _) => Err(unwired_variant(
                    node,
                    STARTING_WITHOUT_TRANSITION,
                    Severity::Warning,
                )),
            }
        } else if uses_interactive_state {
            Ok(lands::Lands::Pressed(prefix))
        } else {
            Ok(lands::Lands::Conditional(prefix))
        }
    }
}
