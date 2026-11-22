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
fn selecting_on_hozos_own_state_is_reported() {
    // It works today, which is why this is a warning and not silence.
    for class_name in [
        "data-[hozo-disabled]:opacity-50",
        "data-[hozo-cond-10-20]:flex",
        "data-[hozo-pointer-events=box-none]:flex",
        // Through a relation as well: the attribute is Hozo's wherever
        // in the selector it lands.
        "group-data-[hozo-disabled]:opacity-50",
        "not-data-[hozo-disabled]:opacity-50",
    ] {
        assert!(
            codes(class_name).contains(&DiagnosticCode::HozoAttributeIsPrivate),
            "{class_name}",
        );
    }
}

#[test]
fn a_projects_own_data_attribute_is_not() {
    // `data-…:` is a real Tailwind variant and most of what it selects
    // on belongs to the project. Only the `hozo-` prefix is claimed.
    for class_name in [
        "data-[state=open]:flex",
        "data-open:flex",
        // Not a prefix match on the word: `data-hozolike` is someone
        // else's attribute that happens to start with the same
        // letters, and taking it would be claiming a namespace wider
        // than the one Hozo writes.
        "data-[hozolike]:flex",
    ] {
        assert!(
            !codes(class_name).contains(&DiagnosticCode::HozoAttributeIsPrivate),
            "{class_name}",
        );
    }
}

#[test]
fn the_variant_that_replaces_it_is_silent_and_identical() {
    // The migration this diagnostic points at: `disabled:` compiles to
    // the same `.hozo-0[data-hozo-disabled]` selector, so nobody loses
    // anything by taking the advice.
    assert!(!codes("disabled:opacity-50").contains(&DiagnosticCode::HozoAttributeIsPrivate));
}
