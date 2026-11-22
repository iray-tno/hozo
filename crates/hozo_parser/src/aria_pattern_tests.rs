use super::*;

fn diagnostics_for(jsx: &str) -> Vec<String> {
    let source = format!("import {{ View }} from '@hozo/core'\nexport const C = () => ({jsx})\n");
    parse_tsx(&source)
        .diagnostics
        .into_iter()
        .map(|d| d.message)
        .collect()
}

#[test]
fn a_role_missing_what_it_requires_is_reported() {
    let messages = diagnostics_for(r#"<View role="combobox">x</View>"#);
    assert!(
        messages.iter().any(|m| m.contains("aria-expanded")),
        "{messages:?}"
    );
}

#[test]
fn a_complete_pattern_says_nothing() {
    assert!(diagnostics_for(
        r#"<View role="combobox" aria-expanded={open} aria-controls="list">x</View>"#
    )
    .is_empty());
}

#[test]
fn accessibility_state_could_be_supplying_it() {
    // One opaque expression whose keys are never read -- the Web
    // backend emits `({expr}).expanded` and lets the value decide. So
    // it may or may not carry the state, and "cannot tell" is the
    // honest answer rather than a warning the author cannot act on.
    assert!(diagnostics_for(
            r#"<View role="combobox" aria-controls="l" accessibilityState={{ expanded: open }}>x</View>"#
        )
        .is_empty());
}

#[test]
fn a_role_outside_its_container_is_reported() {
    let messages = diagnostics_for(r#"<View role="tab">x</View>"#);
    assert!(
        messages.iter().any(|m| m.contains("tablist")),
        "{messages:?}"
    );
    assert!(diagnostics_for(r#"<View role="tablist"><View role="tab">x</View></View>"#).is_empty());
}

#[test]
fn a_container_without_what_it_must_hold_is_reported() {
    let messages = diagnostics_for(r#"<View role="listbox"><View>x</View></View>"#);
    assert!(
        messages.iter().any(|m| m.contains("option")),
        "{messages:?}"
    );
}

#[test]
fn an_unreadable_child_makes_the_answer_unknowable() {
    // `{items.map(render)}` may produce a hundred options or none.
    // Warning here would be a warning nobody can act on, and the rest
    // of the compiler already treats a carried expression this way.
    assert!(diagnostics_for(r#"<View role="listbox">{items.map(render)}</View>"#).is_empty());
}

#[test]
fn a_spread_could_be_supplying_it() {
    assert!(diagnostics_for(r#"<View role="combobox" {...rest}>x</View>"#).is_empty());
}
