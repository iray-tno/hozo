use hozo_ir::DiagnosticCode;

fn codes(element: &str) -> Vec<DiagnosticCode> {
    let source = format!(
        "import {{ View, Text, Pressable, TextInput }} from '@hozo/core'\nconst el = {element}\n"
    );
    crate::parse_tsx(&source)
        .diagnostics
        .into_iter()
        .map(|d| d.code)
        .collect()
}

#[test]
fn hidden_from_screen_readers_and_still_tabbable_is_reported() {
    // The two halves disagree: `aria-hidden` takes the subtree out of
    // the accessibility tree and takes nothing out of the tab order.
    assert!(codes(
            r#"<View aria-hidden="true"><Pressable accessibilityRole="button" onPress={go}>Tap</Pressable></View>"#
        )
        .contains(&DiagnosticCode::A11yHiddenButFocusable));
    // React Native spells it two other ways, and both mean the same
    // thing to the platform they are for.
    assert!(codes(
            r#"<View accessibilityElementsHidden={true}><Pressable accessibilityRole="button" onPress={go}>Tap</Pressable></View>"#
        )
        .contains(&DiagnosticCode::A11yHiddenButFocusable));
    assert!(codes(
            r#"<View importantForAccessibility="no-hide-descendants"><Pressable accessibilityRole="button" onPress={go}>Tap</Pressable></View>"#
        )
        .contains(&DiagnosticCode::A11yHiddenButFocusable));
}

#[test]
fn hidden_with_nothing_focusable_under_it_is_not() {
    // The usual and correct use: a decorative subtree with no
    // controls in it.
    assert!(
        !codes(r#"<View aria-hidden="true"><Text>decorative</Text></View>"#)
            .contains(&DiagnosticCode::A11yHiddenButFocusable)
    );
    // `aria-hidden="false"` is not hiding anything, and reading the
    // name without the value could not tell the two apart.
    assert!(!codes(
            r#"<View aria-hidden="false"><Pressable accessibilityRole="button" onPress={go}>Tap</Pressable></View>"#
        )
        .contains(&DiagnosticCode::A11yHiddenButFocusable));
    // Taken out of the tab order as well, which is the fix.
    assert!(!codes(
            r#"<View aria-hidden="true"><Pressable accessibilityRole="button" focusable={false}>Tap</Pressable></View>"#
        )
        .contains(&DiagnosticCode::A11yHiddenButFocusable));
}

#[test]
fn a_positive_tab_index_is_reported_and_zero_is_not() {
    assert!(codes(
        r#"<Pressable accessibilityRole="button" tabIndex={3} onPress={go}>x</Pressable>"#
    )
    .contains(&DiagnosticCode::A11yPositiveTabIndex));
    // The two values that are ordinary: join the natural order, and
    // leave it while staying focusable from script.
    for element in [
        r#"<Pressable accessibilityRole="button" tabIndex={0} onPress={go}>x</Pressable>"#,
        r#"<Pressable accessibilityRole="button" tabIndex={-1} onPress={go}>x</Pressable>"#,
    ] {
        assert!(
            !codes(element).contains(&DiagnosticCode::A11yPositiveTabIndex),
            "{element}"
        );
    }
    // A value only the runtime knows says nothing.
    assert!(!codes(
        r#"<Pressable accessibilityRole="button" tabIndex={n} onPress={go}>x</Pressable>"#
    )
    .contains(&DiagnosticCode::A11yPositiveTabIndex));
}
