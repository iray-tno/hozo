use crate::{lower, LowerOutput};
use hozo_ir::Theme;

fn lower_source(source: &str) -> LowerOutput {
    let parsed = hozo_parser::parse_tsx(source);
    lower(&parsed.roots[0].node, source, &Theme::default())
}

#[test]
fn a_lowered_scroll_view_asks_the_runtime_for_its_tab_stop() {
    // A `div` with `overflow: auto` scrolls under a pointer and is
    // unreachable from a keyboard unless something in it is focusable.
    // Whether it overflows at all is a runtime fact, so the compiler
    // hands the question over rather than guessing at it. See #99.
    let output = lower_source(
        r#"
        import { ScrollView, Text } from '@hozo/core'
        export const A = () => <ScrollView role="region"><Text>a</Text></ScrollView>
        "#,
    );
    assert!(
        output.jsx.contains("{...hozoScrollable()}"),
        "no runtime spread: {}",
        output.jsx
    );
    assert!(
        output.runtime_imports.contains(&"hozoScrollable"),
        "the spread was written without its import: {:?}",
        output.runtime_imports
    );
}

#[test]
fn an_authored_tab_index_wins_and_nothing_is_emitted_beside_it() {
    // The whole of the precedence rule, and it is settled here rather
    // than in the runtime: a spread that is never emitted cannot argue
    // with the author. `-1` especially -- "focusable, but not a tab
    // stop" is a deliberate thing to say.
    for attribute in ["tabIndex={0}", "tabIndex={-1}"] {
        let source = format!(
            r#"
        import {{ ScrollView, Text }} from '@hozo/core'
        export const A = () => <ScrollView role="region" {attribute}><Text>a</Text></ScrollView>
        "#
        );
        let output = lower_source(&source);
        assert!(
            !output.jsx.contains("hozoScrollable"),
            "{attribute} was overruled: {}",
            output.jsx
        );
        assert!(
            !output.runtime_imports.contains(&"hozoScrollable"),
            "{attribute} left an import nothing calls: {:?}",
            output.runtime_imports
        );
        assert!(
            output.jsx.contains(attribute),
            "the author's value was dropped"
        );
    }
}

#[test]
fn a_scroll_view_carried_verbatim_keeps_its_own_component() {
    // A tag Hozo does not claim keeps `@hozo/core`'s real component,
    // which supplies its own behaviour. Importing the helper for it
    // would be an import nothing calls.
    // Parsed with an explicit trust list, because that is where the
    // decision lives: `lower` sees a node that has already been marked
    // foreign or not.
    let source = r#"
        import { ScrollView } from '@some/ui'
        import { View } from '@hozo/core'
        export const A = () => <View className="p-4"><ScrollView>a</ScrollView></View>
        "#;
    let sources = vec!["@hozo/core".to_string()];
    let parsed = hozo_parser::parse_tsx_with(source, Some(&sources));
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(!output.jsx.contains("hozoScrollable"), "{}", output.jsx);
    assert!(!output.runtime_imports.contains(&"hozoScrollable"));
}
