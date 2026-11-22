use hozo_ir::DiagnosticCode;

/// The not-supported messages for `class_name`, the attribute's text as
/// written: a string literal, or an expression in braces.
fn reports(class_name: &str) -> Vec<String> {
    let source = format!(
            "import {{ View, cx }} from '@hozo/core'\nconst el = <View className={class_name}>x</View>\n"
        );
    crate::parse_tsx(&source)
        .diagnostics
        .into_iter()
        .filter(|d| d.code == DiagnosticCode::TailwindVariantNotSupported)
        .map(|d| d.message)
        .collect()
}

fn one(class_name: &str) -> String {
    let reports = reports(class_name);
    assert_eq!(reports.len(), 1, "{class_name}: {reports:?}");
    reports.into_iter().next().unwrap()
}

#[test]
fn a_carried_variant_names_the_compiled_token_it_loses_to() {
    // #1752. `aria-[sort=ascending]:` is carried to Tailwind, whose rule is layered,
    // so the unlayered `bg-white` beside it always wins.
    for class_name in [
        "\"bg-white aria-[sort=ascending]:bg-blue-500\"",
        "\"aria-[sort=ascending]:bg-blue-500 bg-white\"",
    ] {
        let message = one(class_name);
        assert!(message.contains("loses to `bg-white`"), "{message}");
        assert!(message.contains("both set `background-color`"), "{message}");
    }
}

#[test]
fn a_property_hozo_cannot_name_is_still_a_conflict() {
    let message = one("\"p-2 aria-[sort=ascending]:p-4\"");
    assert!(message.contains("loses to `p-2`"), "{message}");
}

#[test]
fn a_carried_variant_that_conflicts_with_nothing_gets_the_plain_report() {
    let message = one("\"p-2 aria-[sort=ascending]:bg-blue-500\"");
    assert!(!message.contains("loses to"), "{message}");
    assert!(message.contains("will work"), "{message}");
}

#[test]
fn an_important_carried_utility_wins_from_its_layer() {
    // A layered `!important` beats an unlayered normal declaration.
    let message = one("\"bg-white aria-[sort=ascending]:!bg-blue-500\"");
    assert!(!message.contains("loses to"), "{message}");
}

#[test]
fn a_joined_class_list_is_compared_the_same_way() {
    let message = one("{cx('bg-white', 'aria-[sort=ascending]:bg-blue-500')}");
    assert!(message.contains("loses to `bg-white`"), "{message}");
    // The compiled base applies whenever the element renders, so a
    // guard on the carried half does not make it win.
    let message = one("{cx('bg-white', on && 'aria-[sort=ascending]:bg-blue-500')}");
    assert!(message.contains("loses to `bg-white`"), "{message}");
}

#[test]
fn two_branches_that_may_never_apply_together_are_not_called_a_conflict() {
    let message = one("{on ? 'bg-white' : 'aria-[sort=ascending]:bg-blue-500'}");
    assert!(!message.contains("loses to"), "{message}");
}
