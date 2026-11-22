use hozo_ir::DiagnosticCode;

fn codes(element: &str) -> Vec<DiagnosticCode> {
    let source = format!(
        "import {{ View, Heading, Section, Text }} from '@hozo/core'\nconst el = {element}\n"
    );
    crate::parse_tsx(&source)
        .diagnostics
        .into_iter()
        .map(|d| d.code)
        .collect()
}

#[test]
fn a_skipped_level_is_reported() {
    assert!(
        codes(r#"<View><Heading level={1}>A</Heading><Heading level={3}>B</Heading></View>"#)
            .contains(&DiagnosticCode::A11yHeadingLevelSkipped)
    );
    // Nesting does not change document order, so the jump is the same
    // jump when the second heading is deeper in the tree.
    assert!(codes(
            r#"<View><Heading level={1}>A</Heading><Section><Heading level={4}>B</Heading></Section></View>"#
        )
        .contains(&DiagnosticCode::A11yHeadingLevelSkipped));
}

#[test]
fn descending_or_stepping_by_one_is_not() {
    for element in [
        r#"<View><Heading level={1}>A</Heading><Heading level={2}>B</Heading></View>"#,
        r#"<View><Heading level={2}>A</Heading><Heading level={2}>B</Heading></View>"#,
        // Coming back up is how a document leaves a subsection.
        r#"<View><Heading level={3}>A</Heading><Heading level={1}>B</Heading></View>"#,
        // Starting deep says nothing: only the caller knows what came
        // before a component that renders a subsection.
        r#"<View><Heading level={4}>A</Heading><Heading level={5}>B</Heading></View>"#,
    ] {
        assert!(
            !codes(element).contains(&DiagnosticCode::A11yHeadingLevelSkipped),
            "{element}"
        );
    }
}

#[test]
fn something_the_compiler_only_carries_ends_the_comparison() {
    // `{sections.map(...)}` may render any number of headings at any
    // level, so the two on either side of it are not adjacent and the
    // pair says nothing -- the same rule the rest of this file follows
    // wherever the tree stops being knowable.
    assert!(!codes(
        r#"<View><Heading level={1}>A</Heading>{rest}<Heading level={3}>B</Heading></View>"#
    )
    .contains(&DiagnosticCode::A11yHeadingLevelSkipped));
    // And a level only the runtime knows is a level nobody here knows.
    assert!(!codes(
            r#"<View><Heading level={1}>A</Heading><Heading level={n}>B</Heading><Heading level={6}>C</Heading></View>"#
        )
        .contains(&DiagnosticCode::A11yHeadingLevelSkipped));
}
