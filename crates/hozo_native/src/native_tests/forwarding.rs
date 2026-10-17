//! A component from a package hands its text styles to a Text the caller
//! nests inside it, from the package's manifest (#950).

use super::*;

fn button_table() -> hozo_parser::ForwardingTable {
    table_with(false)
}

/// `host_states`: whether the Button's host shares its pressed, hovered and
/// focused state with a Text inside it, as `@hozo/ui`'s does (#974).
fn table_with(host_states: bool) -> hozo_parser::ForwardingTable {
    // What `@hozo/ui`'s manifest says about `Button`, trimmed to two tones.
    let mut table = hozo_parser::ForwardingTable::default();
    table.insert(
        "@hozo/ui",
        hozo_parser::ForwardingComponent {
            name: "Button".to_string(),
            props: vec![hozo_parser::ForwardingProp {
                name: "tone".to_string(),
                default: Some("neutral".to_string()),
                values: vec!["accent".to_string(), "neutral".to_string()],
            }],
            variants: vec![
                hozo_parser::ForwardingVariant {
                    when: vec!["accent".to_string()],
                    classes: "font-semibold text-white bg-blue-600 hover:text-red-500 disabled:text-gray-500 px-4"
                        .to_string(),
                },
                hozo_parser::ForwardingVariant {
                    when: vec!["neutral".to_string()],
                    classes: "text-black".to_string(),
                },
            ],
            disabled_prop: Some("disabled".to_string()),
            host_states,
        },
    );
    table
}

fn compile(source: &str) -> Vec<LowerOutput> {
    compile_with(source, &button_table())
}

fn compile_with(source: &str, table: &hozo_parser::ForwardingTable) -> Vec<LowerOutput> {
    // A project's trusted modules, as the integrations default them. With
    // every module trusted, `@hozo/ui`'s `Button` would be read as Hozo's
    // own primitive of that name.
    let sources = ["@hozo/core".to_string(), "react-native".to_string()];
    let mut parsed = hozo_parser::parse_tsx_with(source, Some(&sources));
    hozo_parser::apply_text_forwarding(&mut parsed, table);
    parsed
        .roots
        .iter()
        .map(|root| lower_forwarded(&root.node, &root.forwarded, source, &Theme::default()))
        .collect()
}

#[test]
fn a_text_nested_inside_a_package_component_gets_its_text_styles() {
    // Inside a View inside the Button: deeper than #876's direct child.
    let source = r#"
        import { View, Text } from '@hozo/core'
        import { Button } from '@hozo/ui'
        const el = <Button tone="accent" disabled={off}><View><Text>Save</Text></View></Button>
        "#;
    let [output] = compile(source)
        .try_into()
        .unwrap_or_else(|o: Vec<_>| panic!("{} roots", o.len()));
    // The colour and weight, and the disabled colour under the caller's own
    // expression for the prop the Button hands to its host.
    assert!(output.styles.contains("color: '#fff'"), "{}", output.styles);
    assert!(
        output.styles.contains("fontWeight: '600'"),
        "{}",
        output.styles
    );
    assert!(
        output.jsx.contains("(off) && hozoStyles."),
        "{}",
        output.jsx
    );
    assert!(
        output.styles.contains("color: '#6a7282'"),
        "{}",
        output.styles
    );
    // Not the Button's box, and not a state only its own pressable knows.
    assert!(
        !output.styles.contains("backgroundColor"),
        "{}",
        output.styles
    );
    assert!(!output.styles.contains("paddingLeft"), "{}", output.styles);
    assert!(!output.styles.contains("#fb2c36"), "{}", output.styles);
}

#[test]
fn the_texts_own_classes_still_win() {
    let source = r#"
        import { Text } from '@hozo/core'
        import { Button } from '@hozo/ui'
        const el = <Button tone="accent"><Text className="text-red-500">Delete</Text></Button>
        "#;
    let output = &compile(source)[0];
    // Its own colour replaces the one handed down; the weight it did not
    // set is kept.
    assert!(
        output.styles.contains("color: '#fb2c36'"),
        "{}",
        output.styles
    );
    assert!(!output.styles.contains("'#fff'"), "{}", output.styles);
    assert!(
        output.styles.contains("fontWeight: '600'"),
        "{}",
        output.styles
    );
}

#[test]
fn inside_a_callers_own_view_too() {
    // The Button is carried inside a View the caller wrote, so the Text is
    // found inside a carried expression rather than collected as a root.
    let source = r#"
        import { View, Text } from '@hozo/core'
        import { Button } from '@hozo/ui'
        const el = <View className="flex-row"><Button><Text>Cancel</Text></Button></View>
        "#;
    let output = &compile(source)[0];
    assert!(output.styles.contains("color: '#000'"), "{}", output.styles);
}

#[test]
fn a_tone_the_compiler_cannot_read_hands_down_nothing() {
    for button in [
        "<Button tone={tone}>",
        "<Button {...props}>",
        "<Button tone=\"loud\">",
    ] {
        let source = format!(
            "import {{ Text }} from '@hozo/core'
import {{ Button }} from '@hozo/ui'
const el = {button}<Text>Go</Text></Button>"
        );
        let output = &compile(&source)[0];
        assert!(
            !output.styles.contains("color"),
            "{button}: {}",
            output.styles
        );
    }
}

#[test]
fn a_component_of_the_same_name_from_elsewhere_hands_down_nothing() {
    let source = r#"
        import { Text } from '@hozo/core'
        import { Button } from './button'
        const el = <Button tone="accent"><Text>Go</Text></Button>
        "#;
    let output = &compile(source)[0];
    assert!(!output.styles.contains("color"), "{}", output.styles);
}

#[test]
fn a_host_that_shares_its_state_hands_its_hover_look_down_too() {
    // `@hozo/ui`'s Button compiles to a `HozoPressable`, whose state a
    // `HozoText` anywhere inside it reads (#974).
    let source = r#"
        import { View, Text } from '@hozo/core'
        import { Button } from '@hozo/ui'
        const el = <Button tone="accent"><View><Text>Save</Text></View></Button>
        "#;
    let [output] = compile_with(source, &table_with(true))
        .try_into()
        .unwrap_or_else(|o: Vec<_>| panic!("{} roots", o.len()));
    assert!(output.jsx.contains("<HozoText style={("), "{}", output.jsx);
    assert!(
        output.jsx.contains("hovered && hozoStyles."),
        "{}",
        output.jsx
    );
    assert!(
        output.styles.contains("color: '#fb2c36'"),
        "{}",
        output.styles
    );
    // Still not the Button's box.
    assert!(
        !output.styles.contains("backgroundColor"),
        "{}",
        output.styles
    );
}
