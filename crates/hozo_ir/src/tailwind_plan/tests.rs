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
        assert_eq!(after[index], before[prior]);
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
