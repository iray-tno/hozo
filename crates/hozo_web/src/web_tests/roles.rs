use crate::{lower, LowerOutput};

fn lower_source(source: &str) -> LowerOutput {
    let parsed = hozo_parser::parse_tsx(source);
    lower(&parsed.roots[0].node, source, &hozo_ir::Theme::default())
}

#[test]
fn an_authored_role_wins_over_the_primitives_own() {
    // A menu built on a list. Announcing both roles announces neither.
    let output = lower_source(
        "import { List } from '@hozo/core'\nexport const C = () => <List role=\"menu\">x</List>\n",
    );
    assert!(output.jsx.starts_with("<ul "), "{}", output.jsx);
    assert!(output.jsx.contains(r#"role="menu""#), "{}", output.jsx);
}

#[test]
fn a_role_the_element_already_has_is_kept() {
    // `<ul role="list">` looks redundant and is a documented
    // workaround: Safari drops list semantics from a `<ul>` styled
    // `list-style: none`, and the explicit role is what restores them.
    // Deciding it was redundant would break that.
    let output = lower_source(
        "import { List } from '@hozo/core'\nexport const C = () => <List role=\"list\">x</List>\n",
    );
    assert!(output.jsx.starts_with("<ul "), "{}", output.jsx);
    assert!(output.jsx.contains(r#"role="list""#), "{}", output.jsx);
}

#[test]
fn react_natives_spelling_is_normalised_to_aria() {
    // `header` is React Native's word; ARIA's is `heading`. The two
    // vocabularies overlap for most names and not this one.
    let output = lower_source(
        "import { View } from '@hozo/core'\nexport const C = () => <View accessibilityRole=\"header\">x</View>\n",
    );
    assert!(output.jsx.contains(r#"role="heading""#), "{}", output.jsx);
    assert!(!output.jsx.contains("accessibilityRole"), "{}", output.jsx);
}

#[test]
fn a_role_only_react_native_has_is_dropped_and_named() {
    // Guessing the nearest ARIA role would announce something the
    // author never wrote.
    let output = lower_source(
        "import { View } from '@hozo/core'\nexport const C = () => <View accessibilityRole=\"drawerlayout\">x</View>\n",
    );
    assert!(!output.jsx.contains("drawerlayout"), "{}", output.jsx);
    assert!(
        output
            .diagnostics
            .iter()
            .any(|d| d.code == hozo_ir::DiagnosticCode::RoleHasNoWebEquivalent),
        "{:?}",
        output.diagnostics
    );
}

#[test]
fn a_role_aria_does_not_define_is_not_invented() {
    // The vocabulary is a closed list, and a name outside it is not a
    // role -- on either platform.
    let output = lower_source(
        "import { View } from '@hozo/core'\nexport const C = () => <View role=\"widget\">x</View>\n",
    );
    assert!(!output.jsx.contains(r#"role="widget""#), "{}", output.jsx);
}

#[test]
fn a_dialog_lowers_to_hozo_dialog_and_imports_from_runtime() {
    let output = lower_source(
        "import { Dialog } from '@hozo/core'\nexport const C = () => <Dialog open={true} onClose={() => {}} accessibilityLabel=\"Modal\">x</Dialog>\n",
    );
    assert!(output.jsx.contains("<HozoDialog"), "{}", output.jsx);
    assert!(
        output.runtime_imports.contains(&"HozoDialog"),
        "{:?}",
        output.runtime_imports
    );
}
