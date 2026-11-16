//! A write plan owns the declaration allocation. Scalar ordering moves IR
//! writes, never source expressions, and is shared by both platform emitters.
//! Explicit pass-through remains available as an unassessed-domain control.
use crate::{
    owner_colour_independent_scalar, Condition, StyleDeclaration, StyleProperty, StyleSource,
    TailwindRuleBinding, TailwindUnitBindings,
};
use std::ops::Range;

/// Output-cache identity changes when the eligible projection domain changes,
/// even if the underlying CSS descriptors and comparator are unchanged.
pub const TAILWIND_SCALAR_ORDER_POLICY: &str = "scalar-order-v68";

/// Shared platform-projection boundary, not a utility order table. Single-key
/// projections share their ownership definition; padding, margin, gap and
/// inset also admit their already-assessed shorthand expansion, and a border
/// width admits the style its rule writes beside it. Registers (a border
/// style utility's `--tw-border-style`) and compound text still need
/// separate evidence.
///
/// Logical and physical edges are both admitted. Yoga still gives
/// `paddingStart` priority over `paddingLeft` by key. Native projects both
/// gap shorthands and longhands to the axis keys, so their order decides
/// the same axes as in the Web cascade.
pub fn scalar_tailwind_property(property: &crate::StyleProperty) -> bool {
    use crate::StyleProperty::*;
    crate::tailwind_assessment::scalar_css_property(property).is_some()
        || crate::tailwind_assessment::border_edge_properties(property).is_some()
        || matches!(
            property,
            PaddingTop(_)
                | PaddingRight(_)
                | PaddingBottom(_)
                | PaddingLeft(_)
                | MarginTop(_)
                | MarginRight(_)
                | MarginBottom(_)
                | MarginLeft(_)
                | PaddingInlineStart(_)
                | PaddingInlineEnd(_)
                | MarginInlineStart(_)
                | MarginInlineEnd(_)
                | Gap(_)
                | RowGap(_)
                | ColumnGap(_)
                | InsetInline(_)
                | InsetInlineStart(_)
                | InsetInlineEnd(_)
                | InsetBlock(_)
                | InsetBlockStart(_)
                | InsetBlockEnd(_)
        )
}

pub struct TailwindWritePlan<'a> {
    declarations: Vec<StyleDeclaration>,
    bindings: &'a TailwindUnitBindings<'a>,
}

pub struct TailwindWriteBlock<'a> {
    pub range: Range<usize>,
    pub source: StyleSource,
    pub condition: &'a Condition,
    pub declarations: &'a [StyleDeclaration],
    /// None means no retained utility identity; not a default rule/rank.
    pub binding: Option<TailwindRuleBinding<'a>>,
}

impl<'a> TailwindWritePlan<'a> {
    pub fn passthrough(
        declarations: Vec<StyleDeclaration>,
        bindings: &'a TailwindUnitBindings<'a>,
    ) -> Self {
        Self {
            declarations,
            bindings,
        }
    }

    /// Plan within a contiguous frontend input. Unassessed writes are
    /// barriers unless their entire captured footprint proves independence.
    /// The caller must use a compatible complete namespace.
    pub fn order_scalars(mut self) -> Self {
        let mut dominated = vec![false; self.declarations.len()];
        let mut offset = 0;
        for region in self
            .declarations
            .chunk_by_mut(|a, b| a.source.input() == b.source.input())
        {
            let start = offset;
            offset += region.len();
            if region.len() < 2 {
                continue;
            }
            // A supplemental register and its resting colour do not
            // compete with font-size priority. Only keep this exception
            // for a region of default readers, not other register writers
            // or a second colour rule with unproven ownership.
            let supplemental = region.iter().find_map(|declaration| {
                matches!(
                    declaration.property,
                    crate::StyleProperty::LeadingRegister(_)
                )
                .then_some(declaration.source)
            });
            let can_keep_metric_order = supplemental.is_some_and(|source| {
                region.iter().all(|declaration| {
                    use crate::StyleProperty::*;
                    match declaration.property {
                        LeadingRegister(_) | TextColor(_) => {
                            declaration.source == source
                                && declaration.condition == Condition::Always
                        }
                        FontSize(_) | LineHeight(crate::LineHeight::FontDefault(_)) => true,
                        _ => false,
                    }
                })
            });
            let ranks: Option<Vec<_>> = region
                .iter()
                .enumerate()
                .map(|(index, decl)| {
                    if can_keep_metric_order && Some(decl.source) == supplemental {
                        // Neither write participates in the metric race.
                        // Sort them last rather than assigning Tailwind rank zero.
                        return Some((usize::MAX, index, [0; 3]));
                    }
                    write_rank(self.bindings, decl, index)
                })
                .collect();
            let Some(mut ranks) =
                ranks.or_else(|| scalars_beside_owner_background(self.bindings, region))
            else {
                order_partial_input(self.bindings, region);
                continue;
            };
            apply_ranked_order(region, &mut ranks);
            // A breakpoint branch of an unprefixed rule (`container`'s
            // `max-width` at each width) sits at that rule's place in the
            // order, which can be before an unprefixed write of the same
            // property (`max-w-5xl`). Tailwind's cascade then never lets the
            // branch win: same weight, earlier. Both backends apply a
            // conditional style after the unconditional ones whatever its
            // place, so such a branch is dropped here instead. A variant's
            // rule always sorts after every unprefixed one, so this never
            // touches `md:` and the like.
            let specificity: Vec<[u32; 3]> = {
                let mut by_position = vec![[0; 3]; ranks.len()];
                for (new, &(_, _, weight)) in ranks.iter().enumerate() {
                    by_position[new] = weight;
                }
                by_position
            };
            for (index, declaration) in region.iter().enumerate() {
                if !matches!(declaration.condition, Condition::Responsive(_)) {
                    continue;
                }
                dominated[start + index] = region[index + 1..]
                    .iter()
                    .zip(&specificity[index + 1..])
                    .any(|(later, weight)| {
                        later.condition == Condition::Always
                            && later.property.same_property_as(&declaration.property)
                            && *weight >= specificity[index]
                    });
            }
        }
        if dominated.contains(&true) {
            let mut keep = dominated.into_iter().map(|dropped| !dropped);
            self.declarations.retain(|_| keep.next().unwrap_or(true));
        }
        self
    }

    /// Adjacent writes only. A repeated input/utility/guard after another
    /// block must not be merged backwards across that intervening write.
    pub fn blocks(&self) -> impl Iterator<Item = TailwindWriteBlock<'_>> {
        let mut start = 0;
        self.declarations
            .chunk_by(|a, b| a.source == b.source && a.condition == b.condition)
            .map(move |declarations| {
                let source = declarations[0].source;
                let range = start..start + declarations.len();
                start = range.end;
                TailwindWriteBlock {
                    range,
                    source,
                    condition: &declarations[0].condition,
                    declarations,
                    binding: source.utility().and_then(|id| self.bindings.get(id)),
                }
            })
    }

    /// Moving out returns the exact allocation and predicates, not expanded
    /// copies rebuilt from a report. No dedupe or folding is performed here.
    pub fn into_declarations(self) -> Vec<StyleDeclaration> {
        self.declarations
    }
}

type WriteRank = (usize, usize, [u32; 3]);

fn apply_ranked_order(region: &mut [StyleDeclaration], ranks: &mut [WriteRank]) {
    apply_indexed_order(region, ranks, |index| index);
}

fn apply_indexed_order(
    region: &mut [StyleDeclaration],
    ranks: &mut [WriteRank],
    position: impl Fn(usize) -> usize,
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
    for index in 0..ranks.len() {
        let declaration = &mut region[position(index)];
        if let StyleSource::TailwindUtility { input, utility } = declaration.source {
            declaration.source = StyleSource::TailwindOrdered { input, utility };
        }
    }
}

/// Apply known ranks without assigning a priority to any of their holes.
/// Only closed guard channels can ignore an intervening different guard.
fn order_partial_input(bindings: &TailwindUnitBindings<'_>, region: &mut [StyleDeclaration]) {
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
            order_assessed_runs(bindings, run, run.len(), |index| index);
        }
        return;
    }

    if owner.is_empty() {
        let len = region.len();
        order_assessed_runs(bindings, region, len, |index| index);
        return;
    }

    let ranks = owner
        .iter()
        .enumerate()
        .map(|(index, &position)| write_rank(bindings, &region[position], index))
        .collect::<Option<Vec<_>>>();
    match ranks {
        Some(mut ranks) if ranks.len() > 1 => {
            apply_indexed_order(region, &mut ranks, |index| owner[index]);
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
                order_assessed_runs(bindings, run, run.len(), |index| index);
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
    order_assessed_runs(bindings, region, resting.len(), |index| resting[index]);
}

fn order_partial_owner_runs(
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
        order_assessed_runs(bindings, region, tier.len(), |index| tier[index].1);
    }
}

fn order_assessed_runs(
    bindings: &TailwindUnitBindings<'_>,
    region: &mut [StyleDeclaration],
    len: usize,
    position: impl Fn(usize) -> usize,
) {
    let mut start = 0;
    while start + 1 < len {
        let mut ranks: Vec<_> = (start..len)
            .enumerate()
            .map_while(|(index, place)| write_rank(bindings, &region[position(place)], index))
            .collect();
        let end = start + ranks.len();
        if ranks.len() > 1 {
            apply_indexed_order(region, &mut ranks, |index| position(start + index));
        }
        start = end + 1;
    }
}

fn positive_owner_guard(guard: &Condition) -> bool {
    match guard {
        Condition::Hover | Condition::Pressed | Condition::Focus | Condition::FocusVisible => true,
        Condition::All(parts) => !parts.is_empty() && parts.iter().all(positive_owner_guard),
        _ => false,
    }
}

fn write_rank(
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
fn scalars_beside_owner_background(
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        OrderCandidateDescriptor, OrderCandidateStatus, StyleProperty, TailwindOrderContext,
        TailwindOrderSnapshot, TailwindUnitsBuilder,
    };

    fn fixture(
        names: &[(&str, u32, Condition)],
    ) -> (Vec<StyleDeclaration>, std::sync::Arc<crate::TailwindUnits>) {
        let mut units = TailwindUnitsBuilder::default();
        let declarations = names
            .iter()
            .enumerate()
            .map(|(index, (name, input, condition))| StyleDeclaration {
                source: StyleSource::TailwindUtility {
                    input: *input,
                    utility: units.intern(name),
                },
                condition: condition.clone(),
                property: StyleProperty::PaddingTop(crate::Length::Px(index as f64)),
            })
            .collect();
        (declarations, units.finish().unwrap())
    }

    #[test]
    fn scalar_plan_moves_actual_writes_stably_in_place_and_is_idempotent() {
        let context = TailwindOrderContext::new(crate::portable_tailwind_snapshot()).unwrap();
        let (declarations, units) = fixture(&[
            ("p-4", 10, Condition::Always),
            ("p-2", 10, Condition::Always),
            ("p-0.5", 10, Condition::Always),
            ("p-2", 10, Condition::Always),
        ]);
        let pointer = declarations.as_ptr();
        let capacity = declarations.capacity();
        let bindings = context.bind(&units);
        let plan = TailwindWritePlan::passthrough(declarations, &bindings).order_scalars();
        let after = plan.into_declarations();
        assert_eq!(after.as_ptr(), pointer);
        assert_eq!(after.capacity(), capacity);
        let values = after
            .iter()
            .map(|decl| match decl.property {
                StyleProperty::PaddingTop(crate::Length::Px(value)) => value,
                _ => panic!(),
            })
            .collect::<Vec<_>>();
        assert_eq!(
            values,
            [2.0, 1.0, 3.0, 0.0],
            "stable ties and a nontrivial permutation"
        );
        assert!(after
            .iter()
            .all(|decl| matches!(decl.source, StyleSource::TailwindOrdered { .. })));
        let again = TailwindWritePlan::passthrough(after.clone(), &bindings)
            .order_scalars()
            .into_declarations();
        assert_eq!(again, after);
    }

    #[test]
    fn unknown_resting_write_or_foreign_guard_does_not_freeze_the_next_input() {
        let context = TailwindOrderContext::new(crate::portable_tailwind_snapshot()).unwrap();
        for (unknown, guard) in [
            ("p-3", Condition::Always),
            ("p-2", Condition::Disabled),
            ("sm:p-2", Condition::Always),
            ("p-2!", Condition::Always),
        ] {
            let (declarations, units) = fixture(&[
                ("p-4", 10, Condition::Always),
                (unknown, 10, guard),
                ("p-2", 10, Condition::Always),
                ("p-4", 20, Condition::Always),
                ("p-2", 20, Condition::Always),
            ]);
            let before = declarations.clone();
            let bindings = context.bind(&units);
            let after = TailwindWritePlan::passthrough(declarations, &bindings)
                .order_scalars()
                .into_declarations();
            assert_eq!(&after[..3], &before[..3], "{unknown}");
            assert_eq!(after[3].property, before[4].property);
            assert_eq!(after[4].property, before[3].property);
        }
    }

    #[test]
    fn unknown_resting_write_pins_its_position_between_independently_ranked_runs() {
        let context = TailwindOrderContext::new(crate::portable_tailwind_snapshot()).unwrap();
        let (declarations, units) = fixture(&[
            ("p-4", 10, Condition::Always),
            ("p-2", 10, Condition::Always),
            ("unknown", 10, Condition::Always),
            ("p-4", 10, Condition::Always),
            ("p-2", 10, Condition::Always),
        ]);
        let before = declarations.clone();
        let bindings = context.bind(&units);
        let after = TailwindWritePlan::passthrough(declarations, &bindings)
            .order_scalars()
            .into_declarations();
        assert_eq!(after[2], before[2]);
        for (index, previous) in [(0, 1), (1, 0), (3, 4), (4, 3)] {
            assert_eq!(after[index].property, before[previous].property);
            assert!(matches!(
                after[index].source,
                StyleSource::TailwindOrdered { .. }
            ));
        }
    }

    #[test]
    fn unknown_owner_write_does_not_pin_unrelated_resting_ranks() {
        let context = TailwindOrderContext::new(crate::portable_tailwind_snapshot()).unwrap();
        let (declarations, units) = fixture(&[
            ("p-4", 10, Condition::Always),
            ("p-2", 10, Condition::Pressed),
            ("p-2", 10, Condition::Always),
        ]);
        let before = declarations.clone();
        let bindings = context.bind(&units);
        let after = TailwindWritePlan::passthrough(declarations, &bindings)
            .order_scalars()
            .into_declarations();
        assert_eq!(after[1], before[1]);
        assert_eq!(after[0].property, before[2].property);
        assert_eq!(after[2].property, before[0].property);
    }

    #[test]
    fn unknown_owner_write_pins_only_its_own_selector_weight() {
        let context = TailwindOrderContext::new(crate::portable_tailwind_snapshot()).unwrap();
        let conjunction = Condition::all(vec![Condition::Hover, Condition::Focus]);
        for (middle, expected) in [(false, [2, 1, 0, 3]), (true, [0, 1, 2, 3])] {
            let unknown = ("opaque-focus", 10, Condition::Focus);
            let hover = ("hover:p-4", 10, Condition::Hover);
            let (declarations, units) = fixture(&[
                ("active:p-4", 10, Condition::Pressed),
                ("hover:focus:p-4", 10, conjunction.clone()),
                if middle {
                    unknown.clone()
                } else {
                    hover.clone()
                },
                if middle { hover } else { unknown },
            ]);
            let before = declarations.clone();
            let bindings = context.bind(&units);
            let after = TailwindWritePlan::passthrough(declarations, &bindings)
                .order_scalars()
                .into_declarations();
            for (index, prior) in expected.into_iter().enumerate() {
                assert_eq!(after[index].property, before[prior].property);
                assert_eq!(after[index].condition, before[prior].condition);
            }
            let unknown_index = if middle { 2 } else { 3 };
            assert_eq!(after[unknown_index], before[unknown_index]);
        }
    }

    #[test]
    fn unranked_ambient_writes_pin_both_resting_and_direction_groups() {
        let rtl = Condition::Environment(crate::Environment::Rtl);
        let context = TailwindOrderContext::new(crate::builtin_tailwind_snapshot(
            ["p-2", "p-4", "rtl:p-2", "rtl:p-4"].map(|name| {
                (
                    name,
                    vec![StyleProperty::PaddingTop(crate::Length::Px(8.0))],
                )
            }),
        ))
        .unwrap();
        let (declarations, units) = fixture(&[
            ("rtl:p-4", 10, rtl.clone()),
            ("p-4", 10, Condition::Always),
            ("opaque-resting", 10, Condition::Always),
            ("rtl:p-2", 10, rtl),
            ("p-2", 10, Condition::Always),
        ]);
        let before = declarations.clone();
        let bindings = context.bind(&units);
        let after = TailwindWritePlan::passthrough(declarations, &bindings)
            .order_scalars()
            .into_declarations();
        for (index, prior) in [1, 0, 2, 4, 3].into_iter().enumerate() {
            assert_eq!(after[index].property, before[prior].property);
            assert_eq!(after[index].condition, before[prior].condition);
        }
        assert_eq!(after[2], before[2]);
    }

    #[test]
    fn partial_breakpoint_ranks_never_cross_opaque_writes_or_other_guards() {
        let md = Condition::Responsive(crate::Breakpoint::Md);
        let context = TailwindOrderContext::new(crate::builtin_tailwind_snapshot(
            ["md:p-2", "md:p-4"].map(|name| {
                (
                    name,
                    vec![StyleProperty::PaddingTop(crate::Length::Px(8.0))],
                )
            }),
        ))
        .unwrap();
        let (declarations, units) = fixture(&[
            ("md:p-4", 10, md.clone()),
            ("md:p-2", 10, md.clone()),
            ("opaque-md", 10, md.clone()),
            ("md:p-4", 10, md.clone()),
            ("md:p-2", 10, md.clone()),
            ("p-1", 10, Condition::Always),
            ("md:p-4", 10, md.clone()),
            ("md:p-2", 10, md),
        ]);
        let before = declarations.clone();
        let bindings = context.bind(&units);
        let after = TailwindWritePlan::passthrough(declarations, &bindings)
            .order_scalars()
            .into_declarations();
        for (index, prior) in [1, 0, 2, 4, 3, 5, 7, 6].into_iter().enumerate() {
            assert_eq!(after[index].property, before[prior].property);
            assert_eq!(after[index].condition, before[prior].condition);
        }
        assert_eq!(after[2], before[2]);
        assert_eq!(after[5], before[5]);
    }

    #[test]
    fn stylex_unproven_identity_and_nonadjacent_inputs_never_join_one_sort() {
        let context = TailwindOrderContext::new(crate::portable_tailwind_snapshot()).unwrap();
        let (mut declarations, units) = fixture(&[
            ("p-4", 10, Condition::Always),
            ("p-2", 10, Condition::Always),
            ("p-4", 30, Condition::Always),
            ("p-4", 10, Condition::Always),
            ("p-2", 10, Condition::Always),
        ]);
        declarations[2].source = StyleSource::Stylex(30);
        let before = declarations.clone();
        let bindings = context.bind(&units);
        let after = TailwindWritePlan::passthrough(declarations, &bindings)
            .order_scalars()
            .into_declarations();
        for (new, old) in [1, 0, 2, 4, 3].into_iter().enumerate() {
            assert_eq!(after[new].property, before[old].property);
        }
        assert_eq!(after[2], before[2]);
        let mut unproven = before.clone();
        unproven[1].source = StyleSource::Unspecified;
        let after = TailwindWritePlan::passthrough(unproven.clone(), &bindings)
            .order_scalars()
            .into_declarations();
        assert_eq!(&after[..3], &unproven[..3]);
    }

    #[test]
    fn grouped_planned_writes_do_not_merge_a_later_guard_back_across_another_guard() {
        let (mut declarations, _) = fixture(&[
            ("focus:p-4", 10, Condition::Focus),
            ("active:p-4", 10, Condition::Pressed),
            ("focus:p-4", 10, Condition::Focus),
            ("focus:p-4", 10, Condition::Focus),
        ]);
        assert_eq!(crate::group_by_condition(&declarations).len(), 3);
        for decl in &mut declarations {
            let StyleSource::TailwindUtility { input, utility } = decl.source else {
                panic!()
            };
            decl.source = StyleSource::TailwindOrdered { input, utility };
        }
        let groups = crate::group_by_condition(&declarations);
        assert_eq!(
            groups
                .iter()
                .map(|(condition, props)| (condition, props.len()))
                .collect::<Vec<_>>(),
            [
                (&Condition::Focus, 1),
                (&Condition::Pressed, 1),
                (&Condition::Focus, 2)
            ]
        );
    }

    #[test]
    fn grouping_never_reweights_a_projected_canonical_guard_sequence() {
        let conjunction = Condition::all(vec![Condition::Hover, Condition::Focus]);
        let (mut declarations, _) = fixture(&[
            ("hover:focus:text-lg", 10, conjunction.clone()),
            ("focus:leading-6", 10, Condition::Focus),
            ("hover:focus:text-lg", 10, conjunction.clone()),
        ]);
        for declaration in &mut declarations {
            let StyleSource::TailwindUtility { input, utility } = declaration.source else {
                panic!()
            };
            declaration.source = StyleSource::TailwindOrdered { input, utility };
        }
        let groups = crate::group_by_condition(&declarations);
        assert_eq!(
            groups
                .iter()
                .map(|(condition, _)| condition.clone())
                .collect::<Vec<_>>(),
            [conjunction.clone(), Condition::Focus, conjunction]
        );
        // Across authored inputs ADR011 still requires selector specificity.
        let mut semantic = declarations.clone();
        semantic.insert(
            0,
            StyleDeclaration {
                source: StyleSource::Unspecified,
                condition: Condition::Always,
                property: crate::StyleProperty::FontWeight(crate::FontWeight::Absolute(700)),
            },
        );
        let with_default = crate::group_by_condition(&semantic);
        assert!(crate::has_canonical_tailwind_input(&semantic));
        assert_eq!(with_default[1].0, groups[0].0);
        assert_eq!(with_default[2].0, Condition::Focus);
        assert_eq!(with_default[3].0, groups[2].0);
        declarations[1].source = declarations[1].source.with_tailwind_input(20);
        assert!(!crate::has_canonical_tailwind_input(&declarations));
        let mixed = crate::group_by_condition(&declarations);
        assert_eq!(mixed[0].0, Condition::Focus);
    }

    #[test]
    fn source_marker_does_not_grow_the_source_layout() {
        #[allow(dead_code)]
        enum Before {
            Unspecified,
            Tailwind(u32),
            Utility { input: u32, utility: u32 },
            Stylex(u32),
        }
        assert_eq!(
            std::mem::size_of::<StyleSource>(),
            std::mem::size_of::<Before>()
        );
    }

    /// Run explicitly with --ignored --nocapture. No timing threshold in CI.
    #[test]
    #[ignore = "bounded scalar-plan cost probe, not a correctness or device gate"]
    fn scalar_plan_cost_probe() {
        let context = TailwindOrderContext::new(crate::portable_tailwind_snapshot()).unwrap();
        for count in [1, 16, 128] {
            let names = (0..count)
                .map(|index| {
                    (
                        if index % 2 == 0 { "p-4" } else { "p-2" },
                        10,
                        Condition::Always,
                    )
                })
                .collect::<Vec<_>>();
            let (original, units) = fixture(&names);
            let bindings = context.bind(&units);
            let mut samples = [Vec::new(), Vec::new()];
            for round in 0..9 {
                for offset in 0..2 {
                    let ordered = (round + offset) % 2;
                    let start = std::time::Instant::now();
                    for _ in 0..200 {
                        let plan = TailwindWritePlan::passthrough(original.clone(), &bindings);
                        let plan = if ordered == 1 {
                            plan.order_scalars()
                        } else {
                            plan
                        };
                        std::hint::black_box(plan.into_declarations());
                    }
                    samples[ordered].push(start.elapsed().as_secs_f64() * 1e6 / 200.0);
                }
            }
            println!(
                "scalar-plan count={count} source_bytes={} decl_bytes={} samples_us={samples:?}",
                std::mem::size_of::<StyleSource>(),
                std::mem::size_of::<StyleDeclaration>()
            );
        }
    }

    #[test]
    fn plan_preserves_allocation_guard_identity_and_nonadjacent_input_boundaries() {
        let mut names = TailwindUnitsBuilder::default();
        let utility = names.intern("p-2");
        let units = names.finish().unwrap();
        let context = TailwindOrderContext::new(TailwindOrderSnapshot {
            schema: 1,
            policy: "tailwind-rule-signatures-v1".into(),
            tailwind_version: "test".into(),
            fingerprint: "a".repeat(64),
            stylesheets: vec![],
            candidates: vec![OrderCandidateDescriptor {
                id: 0,
                candidate: "p-2".into(),
                status: OrderCandidateStatus::NotGenerated,
                first_rule_rank: None,
                rules: vec![],
            }],
        })
        .unwrap();
        let bindings = context.bind(&units);
        let tw = StyleSource::TailwindUtility { input: 10, utility };
        let original = vec![
            (tw, Condition::Always),
            (tw, Condition::Always),
            (StyleSource::Stylex(20), Condition::Focus),
            (tw, Condition::Always),
            (tw, Condition::Hover),
            (StyleSource::Unspecified, Condition::Always),
        ]
        .into_iter()
        .map(|(source, condition)| StyleDeclaration {
            source,
            condition,
            property: StyleProperty::Opacity(0.5),
        })
        .collect::<Vec<_>>();
        let expected = original.clone();
        let pointer = original.as_ptr();
        let capacity = original.capacity();
        let plan = TailwindWritePlan::passthrough(original, &bindings);
        let blocks = plan.blocks().collect::<Vec<_>>();
        assert_eq!(
            blocks
                .iter()
                .map(|block| block.range.clone())
                .collect::<Vec<_>>(),
            [0..2, 2..3, 3..4, 4..5, 5..6]
        );
        assert!(matches!(
            blocks[0].binding,
            Some(TailwindRuleBinding::NotGenerated(_))
        ));
        assert!(blocks[1].binding.is_none());
        assert!(blocks[4].binding.is_none());
        assert!(std::ptr::eq(
            blocks[3].condition,
            &plan.declarations[4].condition
        ));
        assert_eq!(blocks[0].declarations.as_ptr(), pointer);
        let after = plan.into_declarations();
        assert_eq!(after.as_ptr(), pointer);
        assert_eq!(after.capacity(), capacity);
        assert_eq!(after, expected);
    }
}
