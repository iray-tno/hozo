use hozo_ir::{Condition, StyleDeclaration};

fn conditions(class_name: &str) -> Vec<Condition> {
    let source = format!(
            "import {{ View }} from '@hozo/core'\nconst el = <View className=\"{class_name}\">x</View>\n"
        );
    crate::parse_tsx(&source).roots[0]
        .node
        .style
        .iter()
        .map(|StyleDeclaration { condition, .. }| condition.clone())
        .collect()
}

#[test]
fn tailwinds_aria_states_are_recognised() {
    // The nine Tailwind names, read from Tailwind rather than
    // remembered. Each one used to compile to nothing and say nothing.
    for state in crate::tailwind_variants::ARIA_VARIANT_STATES {
        let conditions = conditions(&format!("aria-{state}:p-4"));
        assert!(
            conditions
                .iter()
                .any(|c| matches!(c, Condition::Aria(name) if name == state)),
            "aria-{state}: was not recognised",
        );
    }
}

#[test]
fn a_state_tailwind_does_not_name_is_not_invented() {
    // `aria-sort` takes four words and has no boolean form, so
    // Tailwind spells it `aria-[sort=ascending]:`. Accepting
    // `aria-sort:` would be Hozo inventing a variant.
    assert!(conditions("aria-sort:p-4").is_empty());
    assert!(conditions("aria-nonsense:p-4").is_empty());
}
