//! Identity retention tests, not a new cascade implementation.
use hozo_ir::{Child, Node, StyleDeclaration, TailwindUnits};

fn declarations<'a>(node: &'a Node, out: &mut Vec<&'a StyleDeclaration>) {
    out.extend(&node.style);
    for slot in &node.props.class_slots {
        out.extend(&slot.style);
    }
    for child in &node.children {
        match child {
            Child::Node(node) => declarations(node, out),
            Child::Verbatim { nested, .. } => {
                for entry in nested {
                    declarations(&entry.node, out);
                }
            }
            Child::Text(_) => {}
        }
    }
}

fn names(node: &Node, units: &TailwindUnits) -> Vec<String> {
    let mut styles = Vec::new();
    declarations(node, &mut styles);
    styles
        .into_iter()
        .filter_map(|declaration| {
            declaration.source.utility().map(|id| {
                units
                    .candidate(id)
                    .expect("root retains every referenced utility")
                    .to_string()
            })
        })
        .collect()
}

#[test]
fn expanded_literal_writes_share_one_candidate_and_repeated_names_reuse_it() {
    let parsed = crate::parse_tsx(r#"const el=<View className="p-2 p-10 p-2"/>"#);
    let root = &parsed.roots[0];
    let units = root.tailwind_units.as_ref().unwrap();
    assert_eq!(units.len(), 2);
    let ids: Vec<_> = root
        .node
        .style
        .iter()
        .map(|style| style.source.utility().unwrap())
        .collect();
    assert_eq!(ids.len(), 12);
    assert!(ids[..4].iter().all(|id| *id == ids[0]));
    assert!(ids[4..8].iter().all(|id| *id == ids[4]));
    assert_eq!(ids[..4], ids[8..]);
    assert_ne!(ids[0], ids[4]);
}

#[test]
fn roots_share_the_module_table_and_detached_clones_keep_nested_and_slot_ids_alive() {
    let source = r#"
import {cx, View, Text, Avatar} from '@hozo/core';
const base='p-2';
const first=<View className={cx(base, active && 'p-4', extra)}>
  {ready && <Text className="text-lg">Nested</Text>}
  <Avatar fallbackClassName={cx('text-lg', active && 'font-bold', extra)}/>
</View>;
const second=<Text className={`text-lg ${extra}`}>Other</Text>;
"#;
    let parsed = crate::parse_tsx(source);
    assert_eq!(parsed.roots.len(), 2);
    let first_table = parsed.roots[0].tailwind_units.as_ref().unwrap();
    let second_table = parsed.roots[1].tailwind_units.as_ref().unwrap();
    assert!(std::sync::Arc::ptr_eq(first_table, second_table));
    let detached = parsed.roots[0].clone();
    drop(parsed);
    let units = detached.tailwind_units.as_ref().unwrap();
    let names = names(&detached.node, units);
    for expected in ["p-2", "p-4", "text-lg", "font-bold"] {
        assert!(
            names.iter().any(|name| name == expected),
            "missing {expected}: {names:?}"
        );
    }
    assert_eq!(units.len(), 4);
    assert_eq!(detached.node.class_name_fallback.len(), 1);
    assert!(detached.node.root_class_evaluation().is_some());
}

#[test]
fn shorthands_keep_candidate_identity_without_inventing_an_upstream_rule_binding() {
    let parsed = crate::parse_tsx(r#"const el=<View className="container"/>"#);
    let root = &parsed.roots[0];
    let units = root.tailwind_units.as_ref().unwrap();
    assert_eq!(units.len(), 1);
    assert!(root.node.style.len() > 1);
    assert!(names(&root.node, units)
        .iter()
        .all(|name| name == "container"));
}

#[test]
fn unknown_carried_classes_and_class_free_modules_do_not_create_units() {
    for source in [
        r#"const el=<View/>"#,
        r#"const el=<View className="my-card"/>"#,
    ] {
        let parsed = crate::parse_tsx(source);
        assert!(parsed.roots[0].tailwind_units.is_none());
    }
}

#[test]
fn layout_receipt_keeps_ids_inline_and_the_context_pointer_on_roots_only() {
    use hozo_ir::{Condition, StyleProperty, StyleSource, TailwindUtilityId};
    use std::mem::size_of;
    #[allow(dead_code)]
    enum BeforeSource {
        Unspecified,
        Tailwind(u32),
        Stylex(u32),
    }
    #[allow(dead_code)]
    struct BeforeDeclaration {
        property: StyleProperty,
        condition: Condition,
        source: BeforeSource,
    }
    assert_eq!(size_of::<TailwindUtilityId>(), 4);
    assert_eq!(
        size_of::<Option<std::sync::Arc<TailwindUnits>>>(),
        size_of::<usize>()
    );
    eprintln!("layout bytes: source {} -> {}; declaration {} -> {}; node {}; root {}; per-root context {}",
        size_of::<BeforeSource>(), size_of::<StyleSource>(), size_of::<BeforeDeclaration>(), size_of::<StyleDeclaration>(),
        size_of::<Node>(), size_of::<crate::Root>(), size_of::<Option<std::sync::Arc<TailwindUnits>>>());
}
