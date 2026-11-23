//! What a finalized plan can order in the class map: its compact ranks,
//! whether they cover every drawable entry, and the colour families whose
//! authored order needs no rank at all.

use super::*;

/// The ranks, the barrier and independent colour strings when only some
/// colours are independent, and whether the ranks leave no entry to the
/// legacy state order.
pub(super) type Ordered<'p> = (&'p CandidateOrdering, Option<(String, String)>, bool);

/// The plan's ordering, if it is finalized and has one, and beside it the
/// state colours that keep authored order without a rank.
pub(super) fn plan_ordering<'p>(
    plan: Option<&'p mut CandidatePlanBuilder<'_>>,
    supported_len: usize,
    states: &[(&String, Vec<StateGroup>)],
) -> (Option<Ordered<'p>>, Option<String>) {
    let mut state_colors = None;
    let ordering = plan.and_then(|plan| {
        if plan.finalized {
            let (barriers, independent) = plan.independent_colors("style");
            let covers_every_drawable =
                barriers.len() + independent.len() == supported_len + states.len();
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
                let complete = order.ranks.len() == supported_len + states.len()
                    || (partial.is_some() && covers_every_drawable);
                (order, partial, complete)
            })
        } else {
            None
        }
    });
    (ordering, state_colors)
}
