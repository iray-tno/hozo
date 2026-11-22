use hozo_ir::{Condition, DiagnosticCode};

#[test]
fn secondary_expressions_share_root_decomposition_and_residual_spans() {
    for expression in [
        "SLOT_CLASSES",
        "'p-2 not-focus:rounded-lg md:mt-2'",
        "cx('p-2 not-focus:rounded-lg md:mt-2', choose())",
        "`p-2 not-focus:rounded-lg md:mt-2 ${choose()}`",
    ] {
        let source = format!("import {{Chip, cx}} from '@hozo/core'; const SLOT_CLASSES = 'p-2 not-focus:rounded-lg md:mt-2'; const el = <Chip className={{{expression}}} removeClassName={{{expression}}} />");
        let parsed = crate::parse_tsx(&source);
        assert!(parsed.diagnostics.is_empty(), "{:?}", parsed.diagnostics);
        let node = &parsed.roots[0].node;
        let slot = &node.props.class_slots[0];
        assert_eq!(
            slot.style
                .iter()
                .map(|d| (&d.property, &d.condition))
                .collect::<Vec<_>>(),
            node.style
                .iter()
                .map(|d| (&d.property, &d.condition))
                .collect::<Vec<_>>()
        );
        assert_eq!(slot.fallback.len(), node.class_name_fallback.len());
        for (root, secondary) in node.class_name_fallback.iter().zip(&slot.fallback) {
            assert_eq!(
                &source[root.0.start as usize..root.0.end as usize],
                &source[secondary.0.start as usize..secondary.0.end as usize]
            );
        }
        assert!(!slot
            .style
            .iter()
            .any(|d| matches!(d.condition, Condition::Expr(_))));
    }
}

#[test]
fn unsafe_guard_splits_unknown_helpers_and_opaque_lists_keep_the_original_expression() {
    for expression in [
        "cx(first(), guard() && 'p-2 hover:opacity-50', last())",
        "guard() ? 'p-2' : unknown()",
        "cx(guard() && 'p-2', ...rest)",
        "`p-2 ${guard() && 'p-4'}`",
        "unknown('p-2', first())",
        "cx(first(), last())",
    ] {
        let source = format!("import {{Chip, cx}} from '@hozo/core'; const el = <Chip removeClassName={{{expression}}} />");
        let parsed = crate::parse_tsx(&source);
        let node = &parsed.roots[0].node;
        assert!(node.props.class_slots.is_empty(), "{expression}");
        assert_eq!(
            node.props
                .passthrough
                .iter()
                .filter(|p| p.name.as_deref() == Some("removeClassName"))
                .count(),
            1
        );
        assert!(
            parsed.consumed_class_spans.is_empty(),
            "fallback must remain scannable: {expression}"
        );
    }
    let source = "import {Chip,cx} from '@hozo/core'; const el = <Chip removeClassName={cx('p-2 aria-[sort=ascending]:p-4', other())} />";
    assert!(crate::parse_tsx(source)
        .diagnostics
        .iter()
        .any(|d| d.code == DiagnosticCode::TailwindVariantNotSupported));
}

#[test]
fn secondary_guards_capture_the_shared_decomposition_in_source_branch_order() {
    let source = "import {Chip,cx} from '@hozo/core'; const el = <Chip removeClassName={cx(first(), outer() ? inner() ? 'p-2' : 'p-4' : off() && 'p-6', last())} />";
    let parsed = crate::parse_tsx(source);
    assert!(parsed.diagnostics.is_empty(), "{:?}", parsed.diagnostics);
    let slot = &parsed.roots[0].node.props.class_slots[0];
    let evaluation = slot.evaluation.as_ref().unwrap();
    assert_eq!(
        evaluation
            .references()
            .iter()
            .map(|r| &source[r.0.start as usize..r.0.end as usize])
            .collect::<Vec<_>>(),
        ["first()", "outer()", "inner()", "off()", "last()"]
    );
    assert_eq!(evaluation.render(source), "[(first()), ...((outer()) ? [true, ...((inner()) ? [true] : [false]), void 0] : [false, void 0, ...((off()) ? [true] : [false])]), (last())]");
    assert_eq!(slot.fallback.len(), 2);
    assert!(slot
        .style
        .iter()
        .all(|declaration| matches!(declaration.condition, Condition::Expr(_))));
    assert_eq!(parsed.consumed_class_spans.len(), 3);
}
