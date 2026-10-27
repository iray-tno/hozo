//! A write plan owns the declaration allocation. Scalar ordering moves IR
//! writes, never source expressions, and is shared by both platform emitters.
//! Explicit pass-through remains available as an unassessed-domain control.
use crate::{Condition, StyleDeclaration, StyleSource, TailwindRuleBinding, TailwindUnitBindings};
use std::ops::Range;

/// Output-cache identity changes when the eligible projection domain changes,
/// even if the underlying CSS descriptors and comparator are unchanged.
pub const TAILWIND_SCALAR_ORDER_POLICY: &str = "scalar-order-v3";

/// Shared platform-projection boundary, not a utility order table. Single-key
/// projections share their ownership definition; physical padding/margin also
/// admit their already-assessed shorthand expansion. Registers, logical
/// aliases, gap expansion and compound text still need separate evidence.
pub fn scalar_tailwind_property(property: &crate::StyleProperty) -> bool {
    use crate::StyleProperty::*;
    crate::tailwind_assessment::scalar_css_property(property).is_some()
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

    /// All-or-nothing per contiguous frontend input. Unassessed writes are
    /// barriers for that input, not holes that known writes can leap across.
    /// The caller must opt in only with a compatible complete namespace.
    pub fn order_scalars(mut self) -> Self {
        for region in self
            .declarations
            .chunk_by_mut(|a, b| a.source.input() == b.source.input())
        {
            if region.len() < 2 {
                continue;
            }
            let ranks: Option<Vec<_>> = region
                .iter()
                .enumerate()
                .map(|(index, decl)| {
                    let utility = match decl.source {
                        StyleSource::TailwindUtility { utility, .. }
                        | StyleSource::TailwindOrdered { utility, .. } => utility,
                        _ => return None,
                    };
                    let name = self.bindings.units().candidate(utility)?;
                    self.bindings
                        .context()
                        .scalar_write_priority(name, &decl.condition, &decl.property)
                        .map(|priority| (priority.rank, index))
                })
                .collect();
            let Some(mut ranks) = ranks else {
                continue;
            };
            if ranks.windows(2).any(|pair| pair[0].0 > pair[1].0) {
                ranks.sort_by_key(|(rank, _)| *rank);
                let mut destination = vec![0; ranks.len()];
                for (new, &(_, old)) in ranks.iter().enumerate() {
                    destination[old] = new;
                }
                // Move declarations in place: no cloned expression/condition
                // payloads and no replacement of the original Vec allocation.
                for index in 0..region.len() {
                    while destination[index] != index {
                        let next = destination[index];
                        region.swap(index, next);
                        destination.swap(index, next);
                    }
                }
            }
            for declaration in region {
                if let StyleSource::TailwindUtility { input, utility } = declaration.source {
                    declaration.source = StyleSource::TailwindOrdered { input, utility };
                }
            }
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
    fn one_unknown_guard_or_candidate_preserves_the_whole_input_but_not_its_neighbor() {
        let context = TailwindOrderContext::new(crate::portable_tailwind_snapshot()).unwrap();
        for (unknown, guard) in [
            ("p-3", Condition::Always),
            ("p-2", Condition::Focus),
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
        assert_eq!(
            crate::group_by_condition(&declarations).len(),
            2,
            "legacy control"
        );
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
