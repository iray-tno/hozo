use hozo_ir::DiagnosticCode;

fn codes(element: &str) -> Vec<DiagnosticCode> {
    let source = format!(
        "import {{ View, Section, Nav, Text, Separator, ScrollView }} from '@hozo/core'\n\
             const el = {element}\n"
    );
    crate::parse_tsx(&source)
        .diagnostics
        .into_iter()
        .map(|d| d.code)
        .collect()
}

fn warns(element: &str) -> bool {
    codes(element).contains(&DiagnosticCode::FlexDirectionUnsaid)
}

#[test]
fn bare_flex_on_a_box_is_reported() {
    // The trap this exists for. `flex items-center justify-between` is
    // the Web idiom for a row, and on a Hozo box it is a column --
    // which is what React Native does and what the Web base follows.
    assert!(warns(
        r#"<View className="flex items-center justify-between">x</View>"#
    ));
    assert!(warns(r#"<View className="inline-flex">x</View>"#));
}

#[test]
fn and_on_every_other_box_too() {
    // The landmarks are `View`s on device and carry the same base on
    // the Web, so the same sentence is true of all of them. A check
    // that knew only `View` would be right about the primitive people
    // reach for first and silent about the ones they reach for next.
    assert!(warns(r#"<Section className="flex">x</Section>"#));
    assert!(warns(r#"<Nav className="flex">x</Nav>"#));
}

#[test]
fn a_direction_is_an_answer_however_it_is_written() {
    // Either direction silences it: one fixes the layout and the other
    // says the column was meant. A direction under a variant counts as
    // well -- `flex md:flex-row` is somebody who knows the difference.
    assert!(!warns(
        r#"<View className="flex flex-row items-center">x</View>"#
    ));
    assert!(!warns(r#"<View className="flex flex-col">x</View>"#));
    assert!(!warns(r#"<View className="flex md:flex-row">x</View>"#));
    assert!(!warns(
        r#"<View className="flex flex-row-reverse">x</View>"#
    ));
}

#[test]
fn and_a_conditional_flex_is_still_a_flex_with_no_direction() {
    assert!(warns(r#"<View className="md:flex">x</View>"#));
}

#[test]
fn nothing_is_said_about_what_is_not_a_box() {
    // `Text` is a React Native `Text`, not a `View`: it carries no base
    // and CSS's own default applies, so `flex` there means what a Web
    // developer expects. `Separator` is an `<hr>`, which cannot contain
    // anything at all.
    assert!(!warns(r#"<Text className="flex">x</Text>"#));
    assert!(!warns(r#"<Separator className="flex" />"#));
    assert!(!warns(r#"<ScrollView className="flex">x</ScrollView>"#));
}

#[test]
fn nor_about_a_box_that_never_said_flex() {
    // Every box is a flex container already, so silence here is the
    // whole point: the diagnostic is about the *word*, which is
    // redundant, and not about the layout, which was always this.
    assert!(!warns(r#"<View className="items-center">x</View>"#));
    assert!(!warns(r#"<View className="p-4">x</View>"#));
    // `flex-1` is `flex: 1 1 0%` -- a different property entirely, and
    // the one a reader is most likely to confuse with this.
    assert!(!warns(r#"<View className="flex-1">x</View>"#));
    assert!(!warns("<View>x</View>"));
}

#[test]
fn it_is_a_warning_rather_than_a_refusal() {
    // There is a correct output either way -- a column -- so the build
    // continues. `WEB_ONLY_PROPERTY_ON_NATIVE` stops it because there
    // is nothing correct to emit; this is not that.
    let source = "import { View } from '@hozo/core'\n\
                      const el = <View className=\"flex\">x</View>\n";
    let found = crate::parse_tsx(source)
        .diagnostics
        .into_iter()
        .find(|d| d.code == DiagnosticCode::FlexDirectionUnsaid)
        .expect("the diagnostic fires");
    assert_eq!(found.severity, hozo_ir::Severity::Warning);
    // The two words that fix it are both in the message, because a
    // warning that does not say what to write is a warning people
    // learn to scroll past.
    assert!(found.message.contains("flex-row"), "{}", found.message);
    assert!(found.message.contains("flex-col"), "{}", found.message);
}
