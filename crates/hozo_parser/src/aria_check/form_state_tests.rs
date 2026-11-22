use hozo_ir::DiagnosticCode;

fn codes(element: &str, class_name: &str) -> Vec<DiagnosticCode> {
    // Only the field gets a name. A `<div>` is `generic`, which
    // *prohibits* one -- so labelling it would add a second, unrelated
    // report and hide what these tests are about.
    let name = if element == "TextInput" {
        " accessibilityLabel=\"N\""
    } else {
        ""
    };
    let source = format!(
        "import {{ View, Text, TextInput, Progress, Details }} from '@hozo/core'
             const el = <{element}{name} className=\"{class_name}\" />
"
    );
    crate::parse_tsx(&source)
        .diagnostics
        .into_iter()
        .map(|d| d.code)
        .collect()
}

#[test]
fn a_form_state_variant_is_reported_on_an_element_it_cannot_reach() {
    // Not the same report as an unimplemented variant, and the
    // difference is which thing is at fault. These are built, the CSS
    // is correct, and the rule will never apply because a `<div>`
    // cannot be required.
    for class_name in ["required:p-4", "invalid:p-4", "read-only:p-4"] {
        assert_eq!(
            codes("View", class_name),
            vec![DiagnosticCode::TailwindVariantCannotMatch],
            "{class_name}",
        );
    }
    // Including under a wrapper that doesn't change which element is
    // being talked about.
    assert_eq!(
        codes("View", "md:required:p-4"),
        vec![DiagnosticCode::TailwindVariantCannotMatch],
    );
    assert_eq!(
        codes("View", "not-invalid:p-4"),
        vec![DiagnosticCode::TailwindVariantCannotMatch],
    );
}

#[test]
fn a_visited_utility_the_browser_will_discard_is_reported() {
    // The third shape of "this will not do anything", and the only one
    // that is nobody's fault: the variant is built, the selector
    // matches the link it was written for, and the browser throws the
    // declaration away because keeping it would leak the user's
    // history.
    for class_name in ["visited:hidden", "visited:p-4", "visited:shadow-lg"] {
        assert_eq!(
            codes("View", class_name),
            vec![DiagnosticCode::VisitedStyleIgnored],
            "{class_name}",
        );
    }
    // The colours it does keep say nothing.
    for class_name in [
        "visited:text-red-500",
        "visited:bg-blue-500",
        "visited:border-red-500",
    ] {
        assert!(codes("View", class_name).is_empty(), "{class_name}");
    }
    // The restriction is on the *rule*, so it follows `:visited`
    // wherever in the selector it lands -- including onto an ancestor,
    // and including through a negation. If `not-visited:` were
    // unrestricted, the two halves could be compared and the history
    // read back out of the difference.
    for class_name in ["group-visited:p-4", "peer-visited:p-4", "not-visited:p-4"] {
        assert_eq!(
            codes("View", class_name),
            vec![DiagnosticCode::VisitedStyleIgnored],
            "{class_name}",
        );
    }
}

#[test]
fn a_relation_is_about_another_element_so_it_is_not_reported() {
    // `group-invalid:` and `has-[:invalid]:` ask about an ancestor and
    // a descendant. Whether *those* are form controls is not something
    // this element's primitive can answer, so saying anything would be
    // a guess.
    assert!(codes("View", "group-invalid:p-4").is_empty());
    assert!(codes("View", "has-[:invalid]:p-4").is_empty());
}

#[test]
fn on_the_one_primitive_that_is_a_form_control_nothing_is_said() {
    for class_name in ["required:p-4", "invalid:p-4", "placeholder-shown:p-4"] {
        assert!(codes("TextInput", class_name).is_empty(), "{class_name}");
    }
}

#[test]
fn the_three_that_need_a_control_cannot_match_on_a_field() {
    // Compiled since #1752, so `peer-checked:` can read a real
    // checkbox. On a primitive itself they still cannot match: a field
    // is not a checkbox, a radio or a form's default button.
    for class_name in ["checked:p-4", "indeterminate:p-4", "default:p-4"] {
        assert_eq!(
            codes("TextInput", class_name),
            vec![DiagnosticCode::TailwindVariantCannotMatch],
            "{class_name}",
        );
    }
}

#[test]
fn indeterminate_can_match_a_progress_without_a_value() {
    // A `Progress` is a real `<progress>`, which is `:indeterminate`
    // until it is given a `value`. `checked:` still cannot match it.
    let cannot = |class_name: &str| {
        codes("Progress", class_name).contains(&DiagnosticCode::TailwindVariantCannotMatch)
    };
    assert!(!cannot("indeterminate:opacity-50"));
    assert!(!cannot("md:indeterminate:opacity-50"));
    assert!(cannot("checked:opacity-50"));
}

#[test]
fn a_details_matches_open_and_its_own_details_content() {
    // #1777. `Details` is a real `<details>`, so `open:` on it is the
    // spelling that works rather than one that cannot, and
    // `::details-content` is the part of it that opens.
    let cannot = |element: &str, class_name: &str| {
        codes(element, class_name).contains(&DiagnosticCode::TailwindVariantCannotMatch)
    };
    assert!(!cannot("Details", "open:bg-blue-500"));
    assert!(!cannot("Details", "details-content:p-4"));
    assert!(!cannot("Details", "open:details-content:p-4"));
    assert!(cannot("View", "open:bg-blue-500"));
    assert!(cannot("View", "details-content:p-4"));
    assert!(cannot("View", "md:details-content:p-4"));
}
