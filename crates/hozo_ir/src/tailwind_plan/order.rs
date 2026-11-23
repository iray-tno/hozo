//! How a write plan orders a block's writes: by Tailwind's rank where every
//! write has one, by index where only some do, and the owner-colour and
//! disjoint-family runs scalars may move beside.

use super::*;

pub(super) type WriteRank = (usize, usize, [u32; 3]);

#[derive(Clone, Copy)]
pub(super) enum RunOrder {
    Projected,
    GuardLocal,
}

pub(super) fn apply_ranked_order(region: &mut [StyleDeclaration], ranks: &mut [WriteRank]) {
    apply_indexed_order(region, ranks, |index| index, RunOrder::Projected);
}

pub(super) fn apply_indexed_order(
    region: &mut [StyleDeclaration],
    ranks: &mut [WriteRank],
    position: impl Fn(usize) -> usize,
    order: RunOrder,
) {
    if ranks.windows(2).any(|pair| pair[0].0 > pair[1].0) {
        ranks.sort_by_key(|(rank, _, _)| *rank);
        let mut destination = vec![0; ranks.len()];
        for (new, &(_, old, _)) in ranks.iter().enumerate() {
            destination[old] = new;
        }
        // Move declarations in place, without cloning expression payloads.
        for index in 0..ranks.len() {
            while destination[index] != index {
                let next = destination[index];
                region.swap(position(index), position(next));
                destination.swap(index, next);
            }
        }
    }
    if matches!(order, RunOrder::GuardLocal) {
        // Ordering inside one guard says nothing about its place among other
        // guards. Do not split the emitter's existing condition groups.
        return;
    }
    for index in 0..ranks.len() {
        let declaration = &mut region[position(index)];
        if let StyleSource::TailwindUtility { input, utility } = declaration.source {
            declaration.source = StyleSource::TailwindOrdered { input, utility };
        }
    }
}

/// Apply known ranks without assigning a priority to any of their holes.
/// Only closed guard channels can ignore an intervening different guard.
pub(super) fn order_partial_input(
    bindings: &TailwindUnitBindings<'_>,
    region: &mut [StyleDeclaration],
) {
    use crate::Environment::{Ltr, Rtl};

    let mut direction = false;
    let mut owner = Vec::new();
    let mut same_guard_only = false;
    for (index, declaration) in region.iter().enumerate() {
        if declaration.source.utility().is_none() {
            return;
        }
        match &declaration.condition {
            Condition::Always => {}
            Condition::Environment(Ltr | Rtl) => direction = true,
            guard if positive_owner_guard(guard) => owner.push(index),
            _ => same_guard_only = true,
        }
    }

    if same_guard_only {
        // An unknown relationship between guards does not invalidate assessed
        // order among adjacent writes of the very same guard. Different
        // guards (including a resting write) still delimit those runs.
        for run in region.chunk_by_mut(|a, b| a.condition == b.condition) {
            order_assessed_runs(
                bindings,
                run,
                run.len(),
                |index| index,
                RunOrder::GuardLocal,
            );
        }
        return;
    }

    if owner.is_empty() {
        let len = region.len();
        order_assessed_runs(bindings, region, len, |index| index, RunOrder::Projected);
        return;
    }

    let ranks = owner
        .iter()
        .enumerate()
        .map(|(index, &position)| write_rank(bindings, &region[position], index))
        .collect::<Option<Vec<_>>>();
    match ranks {
        Some(mut ranks) if ranks.len() > 1 => {
            apply_indexed_order(
                region,
                &mut ranks,
                |index| owner[index],
                RunOrder::Projected,
            );
        }
        Some(_) => {}
        None => order_partial_owner_runs(bindings, region, &owner),
    }
    if direction {
        // CSS direction selectors can tie with resting selectors. Preserve
        // their relative slots across any unassessed ambient write, even
        // if the write has a different guard. Do not join runs across live
        // owner guards in mixed-direction input without a separate proof.
        for run in region.chunk_by_mut(|a, b| {
            positive_owner_guard(&a.condition) == positive_owner_guard(&b.condition)
        }) {
            if !positive_owner_guard(&run[0].condition) {
                order_assessed_runs(bindings, run, run.len(), |index| index, RunOrder::Projected);
            }
        }
        return;
    }
    // Other guards cannot split the resting tier; their slots stay put.
    let resting: Vec<_> = region
        .iter()
        .enumerate()
        .filter_map(|(index, declaration)| {
            (declaration.condition == Condition::Always).then_some(index)
        })
        .collect();
    order_assessed_runs(
        bindings,
        region,
        resting.len(),
        |index| resting[index],
        RunOrder::Projected,
    );
}

pub(super) fn order_partial_owner_runs(
    bindings: &TailwindUnitBindings<'_>,
    region: &mut [StyleDeclaration],
    owner: &[usize],
) {
    // Use a stable view of the same selector weights Native projects.
    // Sort only within a weight and never across an unassessed write in
    // that view. Only the positions of *ranked* writes can change.
    let Some(mut by_weight) = owner
        .iter()
        .map(|&index| {
            region[index]
                .condition
                .owner_interaction_specificity()
                .map(|weight| (weight, index))
        })
        .collect::<Option<Vec<_>>>()
    else {
        return;
    };
    by_weight.sort_by_key(|&(weight, _)| weight);
    for tier in by_weight.chunk_by(|a, b| a.0 == b.0) {
        order_assessed_runs(
            bindings,
            region,
            tier.len(),
            |index| tier[index].1,
            RunOrder::Projected,
        );
    }
}

pub(super) fn order_assessed_runs(
    bindings: &TailwindUnitBindings<'_>,
    region: &mut [StyleDeclaration],
    len: usize,
    position: impl Fn(usize) -> usize,
    order: RunOrder,
) {
    let mut start = 0;
    while start + 1 < len {
        let mut ranks: Vec<_> = (start..len)
            .enumerate()
            .map_while(|(index, place)| write_rank(bindings, &region[position(place)], index))
            .collect();
        let end = start + ranks.len();
        if ranks.len() > 1 {
            apply_indexed_order(region, &mut ranks, |index| position(start + index), order);
        }
        start = end + 1;
    }
}

pub(super) fn positive_owner_guard(guard: &Condition) -> bool {
    match guard {
        Condition::Hover | Condition::Pressed | Condition::Focus | Condition::FocusVisible => true,
        Condition::All(parts) => !parts.is_empty() && parts.iter().all(positive_owner_guard),
        _ => false,
    }
}

pub(super) fn write_rank(
    bindings: &TailwindUnitBindings<'_>,
    declaration: &StyleDeclaration,
    index: usize,
) -> Option<WriteRank> {
    let name = bindings.units().candidate(declaration.source.utility()?)?;
    bindings
        .context()
        .scalar_write_priority(name, &declaration.condition, &declaration.property)
        .map(|priority| (priority.rank, index, priority.specificity))
}

/// A single unranked background-colour write has no other colour to
/// compete with. Prove the full CSS footprints too: a project utility
/// with the same name could write another slot or target another element.
pub(super) fn scalars_beside_owner_background(
    bindings: &TailwindUnitBindings<'_>,
    region: &[StyleDeclaration],
) -> Option<Vec<WriteRank>> {
    // Do not re-assess unrelated fallback inputs or allocate a rank vector
    // for them. Both namespaces have to be closed and disjoint.
    let mut backgrounds = 0;
    let (mut direction, mut interaction) = (false, false);
    for declaration in region {
        match declaration.condition {
            Condition::Always => {}
            Condition::Environment(crate::Environment::Ltr | crate::Environment::Rtl)
                if !matches!(declaration.property, StyleProperty::BackgroundColor(_)) =>
            {
                direction = true;
            }
            ref guard if guard.owner_interaction_specificity().is_some() => interaction = true,
            _ => return None,
        }
        // A fixed direction and an owner event are different selection
        // channels on Native; this proof does not order them against each
        // other when both can write the same slot.
        if direction && interaction {
            return None;
        }
        match declaration.property {
            StyleProperty::BackgroundColor(_) => {
                backgrounds += 1;
                if backgrounds > 1 {
                    return None;
                }
            }
            _ if scalar_tailwind_property(&declaration.property) => {}
            _ => return None,
        }
    }
    if backgrounds != 1 {
        return None;
    }
    region
        .iter()
        .enumerate()
        .map(|(index, declaration)| {
            let TailwindRuleBinding::Described(candidate) =
                bindings.get(declaration.source.utility()?)?
            else {
                return None;
            };
            if matches!(declaration.property, StyleProperty::BackgroundColor(_)) {
                // Placement of this independent write is not a Tailwind
                // priority. It cannot participate in any scalar comparison.
                return candidate
                    .writes_only_on_owner(declaration.condition == Condition::Always, |property| {
                        property == "background-color"
                    })
                    .then_some((usize::MAX, index, [0; 3]));
            }
            if !candidate.writes_only_on_owner(false, owner_colour_independent_scalar) {
                return None;
            }
            write_rank(bindings, declaration, index)
        })
        .collect()
}

/// The property family a CSS write belongs to, for proving that two
/// utilities cannot write the same thing. Shorthands, longhands and logical
/// aliases share a family (`padding`, `padding-inline`, `padding-left`), and
/// the text metrics share one with their registers. Closed: any other
/// property proves nothing.
pub(super) fn disjoint_family(property: &str) -> Option<&'static str> {
    Some(match property {
        _ if property == "padding" || property.starts_with("padding-") => "padding",
        _ if property == "margin" || property.starts_with("margin-") => "margin",
        "inset" | "top" | "right" | "bottom" | "left" => "inset",
        _ if property.starts_with("inset-") => "inset",
        "gap" | "row-gap" | "column-gap" => "gap",
        "opacity" => "opacity",
        "color" => "color",
        "background-color" => "background-color",
        _ if property.starts_with("border") && property.ends_with("radius") => "border-radius",
        _ if property == "border" || property.starts_with("border-") => "border",
        "font-size"
        | "line-height"
        | "letter-spacing"
        | "font-weight"
        | "font-family"
        | "font-feature-settings"
        | "font-variation-settings"
        | "--tw-font-weight"
        | "--tw-leading"
        | "--tw-tracking" => "text-metric",
        _ => return None,
    })
}

/// Unranked writes whose utilities cannot write anything a ranked write in
/// the region writes (#2027). Their place then decides nothing, so they do
/// not split the ranked writes into runs: `bg-brand` between `rtl:p-4` and
/// `rtl:p-2` must not keep the two in written order. Proven on each
/// utility's entire captured CSS footprint, not on the subset a backend
/// lowered, so a project utility that also writes padding stays a barrier.
pub(super) fn scalars_beside_disjoint_writes(
    bindings: &TailwindUnitBindings<'_>,
    region: &[StyleDeclaration],
) -> Option<Vec<WriteRank>> {
    use std::cell::RefCell;

    let (mut direction, mut interaction) = (false, false);
    for declaration in region {
        match declaration.condition {
            Condition::Always => {}
            Condition::Environment(crate::Environment::Ltr | crate::Environment::Rtl) => {
                direction = true;
            }
            ref guard if guard.owner_interaction_specificity().is_some() => interaction = true,
            _ => return None,
        }
        // As in `scalars_beside_owner_background`: a fixed direction and an
        // owner event are different selection channels on Native.
        if direction && interaction {
            return None;
        }
    }
    let described =
        |declaration: &StyleDeclaration| match bindings.get(declaration.source.utility()?)? {
            TailwindRuleBinding::Described(candidate) => Some(candidate),
            _ => None,
        };
    let ranks: Vec<_> = region
        .iter()
        .enumerate()
        .map(|(index, declaration)| write_rank(bindings, declaration, index))
        .collect();
    // Each unranked utility's families, and the families every other
    // unranked utility claims, so two holes cannot write the same thing.
    let mut holes: Vec<(crate::TailwindUtilityId, Vec<&'static str>)> = Vec::new();
    for (declaration, rank) in region.iter().zip(&ranks) {
        if rank.is_some() {
            continue;
        }
        let utility = declaration.source.utility()?;
        if holes.iter().any(|(seen, _)| *seen == utility) {
            continue;
        }
        let families = RefCell::new(Vec::new());
        let closed = described(declaration)?.writes_only_on_owner(
            declaration.condition == Condition::Always,
            |property| {
                disjoint_family(property).is_some_and(|family| {
                    families.borrow_mut().push(family);
                    true
                })
            },
        );
        if !closed {
            return None;
        }
        let families = families.into_inner();
        if holes
            .iter()
            .any(|(_, other)| other.iter().any(|family| families.contains(family)))
        {
            return None;
        }
        holes.push((utility, families));
    }
    if holes.is_empty() {
        return None;
    }
    let taken = |family: &str| holes.iter().any(|(_, families)| families.contains(&family));
    for (declaration, rank) in region.iter().zip(&ranks) {
        if rank.is_none() {
            continue;
        }
        if !scalar_tailwind_property(&declaration.property)
            || !described(declaration)?.writes_only_on_owner(false, |property| {
                disjoint_family(property).is_some_and(|family| !taken(family))
            })
            || region.iter().zip(&ranks).any(|(hole, rank)| {
                rank.is_none() && writes_same_slot(&hole.property, &declaration.property)
            })
        {
            return None;
        }
    }
    Some(
        ranks
            .into_iter()
            .enumerate()
            // An unranked write takes no Tailwind priority; it sorts last.
            .map(|(index, rank)| rank.unwrap_or((usize::MAX, index, [0; 3])))
            .collect(),
    )
}
