use super::*;
use crate::{lower_forwarded, lower_forwarded_with_evidence, LowerOutput};
use hozo_ir::Theme;

fn output(source: &str, evidence: bool) -> LowerOutput {
    let parsed = hozo_parser::parse_tsx(source);
    assert_eq!(parsed.roots.len(), 1);
    let root = &parsed.roots[0];
    let lower = if evidence {
        lower_forwarded_with_evidence
    } else {
        lower_forwarded
    };
    lower(&root.node, &root.forwarded, source, &Theme::default())
}

fn checked_copies(source: &str) -> (String, Vec<SourceCopy>) {
    let plain = output(source, false);
    let traced = output(source, true);
    assert!(plain.source_copies.is_none());
    assert_eq!(plain.jsx, traced.jsx);
    assert_eq!(plain.styles, traced.styles);
    assert_eq!(plain.prelude, traced.prelude);
    assert_eq!(plain.native_imports, traced.native_imports);
    assert_eq!(plain.runtime_imports, traced.runtime_imports);
    assert_eq!(plain.diagnostics, traced.diagnostics);
    let copies = traced.source_copies.unwrap();
    let mut previous_end = 0;
    for copy in &copies {
        assert!(copy.emitted_start >= previous_end);
        assert_eq!(
            &source[copy.span.start as usize..copy.span.end as usize],
            &traced.jsx[copy.emitted_start..copy.emitted_end]
        );
        previous_end = copy.emitted_end;
    }
    (traced.jsx, copies)
}

#[test]
fn carried_children_are_exact_emissions_not_equal_substring_matches() {
    let source = "// 😀 日本語\r\nimport { View, Text } from '@hozo/core'; const x = <View className=\"p-2\"><Tools title=\"同じ😀\" />{ok && <Text className=\"font-bold\"><Tools title=\"同じ😀\" /></Text>}<Tools title=\"同じ😀\" /></View>";
    let (jsx, copies) = checked_copies(source);
    assert!(!copies.is_empty());
    let carried = copies
        .iter()
        .map(|copy| &source[copy.span.start as usize..copy.span.end as usize])
        .collect::<String>();
    assert_eq!(carried.matches("<Tools title=\"同じ😀\" />").count(), 3);
    assert!(carried.contains("{ok && "));
    assert!(!carried.contains("<Text className="));
    assert!(!carried.contains("p-2"));
    assert!(jsx.contains("hozoStyles"));
}

#[test]
fn layout_wrappers_shift_children_but_do_not_certify_their_generated_props() {
    for class in ["space-x-2", "grid grid-cols-2 gap-2", "@container"] {
        let source = format!("import {{ View }} from '@hozo/core'; const x = <View className=\"{class}\"><View className=\"col-span-2\"><Tools /></View></View>");
        let (_, copies) = checked_copies(&source);
        assert_eq!(copies.len(), 1, "{class}");
        assert_eq!(
            &source[copies[0].span.start as usize..copies[0].span.end as usize],
            "<Tools />"
        );
    }
}

#[test]
fn discarded_children_and_new_scopes_are_not_rewrite_permission() {
    for host in ["Image", "TextInput"] {
        let source =
            format!("import {{ {host} }} from '@hozo/core'; const x = <{host}><Tools /></{host}>");
        let (jsx, copies) = checked_copies(&source);
        assert!(!jsx.contains("<Tools"));
        assert!(copies.is_empty());
    }
    let source =
        "import { View } from '@hozo/core'; const x = <View className=\"@sm:p-2\"><Tools /></View>";
    let (jsx, copies) = checked_copies(source);
    assert!(jsx.contains("(__hozoCq) =>"));
    assert!(copies.is_empty());
    let source = "import { View } from '@hozo/core'; import { cn } from 'clsx'; const x = <View className={cn('p-4', active && 'p-8')}><Tools /></View>";
    let (jsx, copies) = checked_copies(source);
    assert!(jsx.contains("__hozoClassPlan"), "{jsx}");
    assert!(copies.is_empty());
}

#[test]
fn forgetting_a_scope_keeps_the_requested_empty_evidence_and_ordinary_bytes() {
    let mut rendered = Rendered::new(true);
    rendered.copy("abc", 0, 3);
    rendered = rendered.wrap("(abc)".to_string(), 1);
    assert_eq!(rendered.copies.as_ref().unwrap()[0].emitted_start, 1);
    rendered.forget_scope();
    assert_eq!(rendered.text, "(abc)");
    assert_eq!(rendered.copies, Some(Vec::new()));
}
