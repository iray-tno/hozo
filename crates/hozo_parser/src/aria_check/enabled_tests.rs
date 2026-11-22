use hozo_ir::{Condition, DiagnosticCode, StyleDeclaration};

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
fn enabled_is_the_inverse_of_disabled_rather_than_a_second_opinion() {
    assert!(conditions("enabled:p-4").contains(&Condition::Enabled));
    assert!(conditions("disabled:p-4").contains(&Condition::Disabled));
}

#[test]
fn a_variant_whose_selector_could_never_match_is_still_reported() {
    // `checked:` compiles to `:checked`, which matches a checkbox, and
    // no primitive is one. It is emitted as Tailwind would emit it, so
    // that `peer-checked:` works, and reported here, where it can never
    // apply: the bug `disabled:` used to be, made visible (#1752).
    //
    // `open:` took this route first, once `@hozo/semantics`' `Details`
    // became a real `<details>` (#1692).
    let source =
        "import { View } from '@hozo/core'\nconst el = <View className=\"checked:p-4\">x</View>\n";
    let codes: Vec<_> = crate::parse_tsx(source)
        .diagnostics
        .into_iter()
        .map(|d| d.code)
        .collect();
    assert_eq!(codes, vec![DiagnosticCode::TailwindVariantCannotMatch]);
}
