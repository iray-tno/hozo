use hozo_ir::DiagnosticCode;

fn codes(class_name: &str) -> Vec<DiagnosticCode> {
    let source = format!(
            "import {{ View }} from '@hozo/core'\nconst el = <View className=\"{class_name}\">x</View>\n"
        );
    crate::parse_tsx(&source)
        .diagnostics
        .into_iter()
        .map(|d| d.code)
        .collect()
}

#[test]
fn a_tailwind_variant_hozo_does_not_compile_is_named() {
    // These produced no CSS, reached the DOM as nothing, and said
    // nothing. `group-hover:` is not an exotic class.
    for class_name in [
        "aria-[sort=ascending]:bg-blue-500",
        "group-aria-[sort=ascending]:bg-blue-500",
    ] {
        assert_eq!(
            codes(class_name),
            vec![DiagnosticCode::TailwindVariantNotSupported],
            "{class_name}",
        );
    }
}

#[test]
fn implementing_a_variant_is_what_removes_its_diagnostic() {
    // `aria-expanded:` was in the list above until it was
    // implemented. That is the whole shape of this: the diagnostic
    // names a gap, and closing the gap closes the diagnostic, rather
    // than someone remembering to edit a list.
    assert!(codes("aria-expanded:bg-blue-500").is_empty());
    assert!(codes("aria-checked:bg-blue-500").is_empty());
    assert!(codes("enabled:bg-blue-500").is_empty());
    assert!(codes("group-hover:bg-blue-500").is_empty());
    assert!(codes("peer-hover:bg-blue-500").is_empty());
    // `visited:` was in that list until the browser's own restriction
    // became something Hozo could report rather than a reason not to
    // compile the variant at all. A background colour is one of the
    // few properties `:visited` keeps, so this one is silent.
    assert!(codes("visited:bg-blue-500").is_empty());
    assert!(codes("starting:opacity-0").is_empty());
    // `empty:`, `odd:` and `nth-[2n+1]:` were in that list until the
    // structural family landed.
    assert!(codes("empty:bg-blue-500").is_empty());
    assert!(codes("odd:bg-blue-500").is_empty());
    assert!(codes("nth-[2n+1]:bg-blue-500").is_empty());
    // `open:` was in that list until a compiled `hidden` beside
    // `group-open:inline` hid a `<details>` body for good (#1692).
    // On a `View` itself it compiles and can never match, which is
    // its own report.
    assert_eq!(
        codes("open:bg-blue-500"),
        vec![DiagnosticCode::TailwindVariantCannotMatch]
    );
    assert!(codes("not-open:bg-blue-500").is_empty());
    assert!(codes("group-open:inline").is_empty());
    assert!(codes("peer-open:inline").is_empty());
    // `checked:`, `indeterminate:` and `default:` followed for the same
    // reason: `group-checked:` beside a compiled base always lost (#1752).
    for state in ["checked", "indeterminate", "default"] {
        assert_eq!(
            codes(&format!("{state}:bg-blue-500")),
            vec![DiagnosticCode::TailwindVariantCannotMatch],
            "{state}",
        );
        assert!(
            codes(&format!("not-{state}:bg-blue-500")).is_empty(),
            "{state}"
        );
        assert!(
            codes(&format!("group-{state}:bg-blue-500")).is_empty(),
            "{state}"
        );
        assert!(
            codes(&format!("peer-{state}:bg-blue-500")).is_empty(),
            "{state}"
        );
    }
}

#[test]
fn a_class_that_was_never_tailwinds_is_not_mentioned() {
    // The whole value of asking Tailwind for its own variant list:
    // a project's own class is not a gap in Hozo.
    for class_name in [
        "my-card",
        "group",
        "peer",
        "p-4",
        "hover:bg-blue-500",
        "md:hover:p-4",
    ] {
        assert!(codes(class_name).is_empty(), "{class_name}");
    }
}

#[test]
fn one_problem_gets_one_report() {
    // A token with brackets *and* a variant Hozo lacks would otherwise
    // draw two reports -- the unreadable-arbitrary one and the
    // unsupported-variant one. The variant is the accurate half.
    assert_eq!(
        codes("in-range-[2]:bg-blue-500"),
        vec![DiagnosticCode::TailwindVariantNotSupported],
    );
}
