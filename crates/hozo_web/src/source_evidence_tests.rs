use super::*;

fn output(source: &str, evidence: bool) -> LowerOutput {
    let parsed = hozo_parser::parse_tsx_for_web(
        source,
        None,
        None,
        &[],
        hozo_parser::ReactNativeCompat::Lower,
    );
    lower_with_evidence(&parsed.roots[0].node, source, &Theme::default(), evidence)
}

#[test]
fn copies_are_actual_emission_ranges_across_nested_props_children_and_normalizers() {
    let source = "// 😀 日本語\r\nimport { View, Text } from 'react-native'; const x = <View style={{ padding: P.OS }} {...{x: P.select}} custom={<Text>{P.Version}</Text>}><Other onPress={() => P.OS}>{ok && <View />}{P.OS}</Other></View>";
    let plain = output(source, false);
    let traced = output(source, true);
    assert!(plain.source_copies.is_none());
    assert_eq!(plain.jsx, traced.jsx);
    assert_eq!(plain.css, traced.css);
    assert_eq!(plain.runtime_imports, traced.runtime_imports);
    let copies = traced.source_copies.unwrap();
    assert!(!copies.is_empty());
    let mut previous_end = 0;
    for copy in &copies {
        assert!(copy.emitted_start >= previous_end);
        assert_eq!(
            &source[copy.span.start as usize..copy.span.end as usize],
            &traced.jsx[copy.emitted_start..copy.emitted_end]
        );
        previous_end = copy.emitted_end;
    }
    let carried = copies
        .iter()
        .map(|copy| &source[copy.span.start as usize..copy.span.end as usize])
        .collect::<String>();
    assert!(carried.contains("padding: P.OS"));
    assert!(carried.contains("x: P.select"));
    assert!(carried.contains("onPress={() => P.OS}"));
    assert!(carried.contains("{P.Version}"));
    assert!(!carried.contains("<Text>"));
}

#[test]
fn discarded_children_stay_unmapped_but_interactive_arguments_are_actual_copies() {
    let void = output(
        "import { TextInput, Text } from 'react-native'; const x = <TextInput><Text>{P.OS}</Text></TextInput>",
        true,
    );
    assert!(!void.jsx.contains("P.OS"));
    assert!(void.source_copies.unwrap().is_empty());
    let source = "import { View } from 'react-native'; const x = <View onPress={() => P.OS} custom={P.OS}>{P.OS}</View>";
    let traced = output(source, true);
    let copies = traced.source_copies.unwrap();
    let carried = copies
        .iter()
        .map(|copy| &source[copy.span.start as usize..copy.span.end as usize])
        .collect::<String>();
    assert!(carried.contains("custom={P.OS}"));
    assert!(carried.contains("{P.OS}"));
    assert!(!carried.contains("onPress"));
    assert!(carried.contains("() => P.OS"));
    assert!(traced.jsx.contains("onClick={() => P.OS}"));
}

#[test]
fn handler_copies_cover_arguments_not_generated_syntax_or_dropped_handlers() {
    for (source, expected, absent) in [
        (
            "import { Pressable } from '@hozo/core'; const x = <Pressable accessibilityRole=\"button\" disabled={P.OS} onPress={() => P.select()} />",
            "{...hozoInteractive(() => P.select(), P.OS)}",
            "P.OS",
        ),
        (
            "import { Link } from '@hozo/core'; const x = <Link href=\"/\" disabled={P.OS} onPress={() => event.OS} />",
            "onClick={(P.OS) ? (event) => event.preventDefault() : () => event.OS}",
            "event.preventDefault()",
        ),
        (
            "import { Button } from '@hozo/core'; const x = <Button onPress={() => P.select()} />",
            "onClick={() => P.select()}",
            "onClick",
        ),
        (
            "import { View } from '@hozo/core'; const x = <View onResponderGrant={() => P.select()} />",
            "onResponderGrant={() => P.select()}",
            "onResponderGrant",
        ),
    ] {
        let plain = output(source, false);
        let traced = output(source, true);
        assert_eq!(plain.jsx, traced.jsx);
        assert_eq!(plain.css, traced.css);
        assert_eq!(plain.runtime_imports, traced.runtime_imports);
        assert!(plain.source_copies.is_none());
        assert!(traced.jsx.contains(expected), "{}", traced.jsx);
        let copies = traced.source_copies.unwrap();
        for copy in &copies {
            assert_eq!(
                &source[copy.span.start as usize..copy.span.end as usize],
                &traced.jsx[copy.emitted_start..copy.emitted_end]
            );
        }
        let handlers: Vec<_> = copies
            .iter()
            .filter(|copy| {
                source[copy.span.start as usize..copy.span.end as usize].starts_with("() => ")
            })
            .collect();
        assert_eq!(handlers.len(), 1);
        let copy = handlers[0];
        let authored = &source[copy.span.start as usize..copy.span.end as usize];
        assert_eq!(authored, &traced.jsx[copy.emitted_start..copy.emitted_end]);
        assert!(authored.starts_with("() => "));
        assert!(!authored.contains(absent));
    }
    let source = "import { Button } from '@hozo/core'; const x = <Button onPress={() => P.OS} onClick={() => A.timing()} />";
    let traced = output(source, true);
    assert!(!traced.jsx.contains("P.OS"));
    let copies = traced.source_copies.unwrap();
    assert!(
        !copies
            .iter()
            .any(|copy| source[copy.span.start as usize..copy.span.end as usize].contains("P.OS"))
    );
}
