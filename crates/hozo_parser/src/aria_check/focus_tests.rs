use hozo_ir::DiagnosticCode;

fn codes(element: &str) -> Vec<DiagnosticCode> {
    let source = format!("import {{ Pressable }} from '@hozo/core'\nconst el = {element}\n");
    crate::parse_tsx(&source)
        .diagnostics
        .into_iter()
        .map(|d| d.code)
        .collect()
}

#[test]
fn focusable_on_a_disabled_element_is_reported() {
    // Someone reaching for the APG's "focusable disabled" pattern,
    // which Hozo does not offer because Android cannot produce it.
    // See docs/decisions/001.
    assert_eq!(
        codes(
            r#"<Pressable accessibilityRole="button" disabled={d} focusable onPress={go}>x</Pressable>"#
        ),
        vec![DiagnosticCode::FocusableDisabledUnsupported],
    );
}

#[test]
fn focusable_false_on_a_disabled_element_is_not() {
    // It agrees with what `disabled` already does, so there is nothing
    // to say. Only reachable because a boolean literal is read as the
    // constant it is rather than as an expression.
    assert!(
            codes(r#"<Pressable accessibilityRole="button" disabled={d} focusable={false} onPress={go}>x</Pressable>"#)
                .is_empty()
        );
}

#[test]
fn focusable_on_its_own_is_not_reported() {
    assert!(
        codes(r#"<Pressable accessibilityRole="button" focusable onPress={go}>x</Pressable>"#)
            .is_empty()
    );
}

#[test]
fn known_tab_stops_on_disabled_destinations_are_reported_without_warning_on_enabled_or_negative_cases(
) {
    for tab in ["0", "3"] {
        let expected = if tab == "0" {
            vec![DiagnosticCode::FocusableDisabledUnsupported]
        } else {
            vec![
                DiagnosticCode::FocusableDisabledUnsupported,
                DiagnosticCode::A11yPositiveTabIndex,
            ]
        };
        assert_eq!(
            codes(&format!(
                r#"<Link href="/docs" disabled tabIndex={{{tab}}}>Docs</Link>"#
            )),
            expected
        );
    }
    for props in [
        "disabled tabIndex={-1}",
        "disabled={false} focusable",
        "disabled={false} tabIndex={0}",
        "tabIndex={0}",
    ] {
        assert!(
            codes(&format!(r#"<Link href="/docs" {props}>Docs</Link>"#)).is_empty(),
            "{props}"
        );
    }
}
