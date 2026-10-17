use super::*;

#[test]
fn evidence_comes_from_emitted_tags_including_verbatim_props_and_children() {
    let source = "import { View, Text } from 'react-native'; const x = <View custom={<Text />}><Other>{ok && <View><Text>hi</Text></View>}</Other></View>";
    let parsed = hozo_parser::parse_tsx_for_web(
        source,
        None,
        None,
        &[],
        hozo_parser::ReactNativeCompat::Lower,
    );
    let root = &parsed.roots[0].node;
    let plain = lower(root, source, &Theme::default());
    let traced = lower_with_evidence(root, source, &Theme::default(), true);
    assert!(plain.tag_decisions.is_none());
    assert_eq!(plain.jsx, traced.jsx);
    assert_eq!(plain.css, traced.css);
    let decisions = traced.tag_decisions.unwrap();
    assert_eq!(decisions.len(), 7);
    for decision in decisions {
        let authored = &source[decision.span.start as usize..decision.span.end as usize];
        assert!(matches!(authored, "View" | "Text"));
        assert!(traced
            .jsx
            .contains(&format!("<{}", decision.replacement.unwrap())));
    }
}

#[test]
fn void_element_does_not_report_children_it_did_not_emit() {
    let source = "import { TextInput, Text } from 'react-native'; const x = <TextInput><Text>discarded</Text></TextInput>";
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower_with_evidence(&parsed.roots[0].node, source, &Theme::default(), true);
    assert!(!output.jsx.contains("discarded"));
    let decisions = output.tag_decisions.unwrap();
    assert_eq!(decisions.len(), 2);
    assert_eq!(decisions[0].replacement.as_deref(), Some("input"));
    assert!(decisions[1].replacement.is_none());
    assert!(decisions.iter().all(|decision| &source
        [decision.span.start as usize..decision.span.end as usize]
        == "TextInput"));
}
