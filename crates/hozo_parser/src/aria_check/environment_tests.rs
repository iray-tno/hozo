use hozo_ir::{Condition, Environment, StyleDeclaration};

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
fn every_environment_variant_is_recognised() {
    for (class_name, query) in [
        ("motion-safe:p-4", Environment::MotionSafe),
        ("motion-reduce:p-4", Environment::MotionReduce),
        ("portrait:p-4", Environment::Portrait),
        ("landscape:p-4", Environment::Landscape),
        ("inverted-colors:p-4", Environment::InvertedColors),
        ("ltr:p-4", Environment::Ltr),
        ("rtl:p-4", Environment::Rtl),
        ("contrast-more:p-4", Environment::ContrastMore),
        ("contrast-less:p-4", Environment::ContrastLess),
        ("forced-colors:p-4", Environment::ForcedColors),
        ("print:p-4", Environment::Print),
        ("noscript:p-4", Environment::Noscript),
        ("pointer-fine:p-4", Environment::PointerFine),
        ("pointer-coarse:p-4", Environment::PointerCoarse),
        ("pointer-none:p-4", Environment::PointerNone),
        ("any-pointer-fine:p-4", Environment::AnyPointerFine),
        ("any-pointer-coarse:p-4", Environment::AnyPointerCoarse),
        ("any-pointer-none:p-4", Environment::AnyPointerNone),
    ] {
        assert!(
            conditions(class_name).contains(&Condition::Environment(query)),
            "{class_name}",
        );
    }
}

#[test]
fn an_environment_query_cannot_be_related_to_another_element() {
    // Same rule `group-dark:` falls under: a preference is true of the
    // page, so asking it of an ancestor says nothing new. Tailwind
    // refuses these too.
    assert!(conditions("group-motion-reduce:p-4").is_empty());
    assert!(conditions("peer-print:p-4").is_empty());
    assert!(conditions("in-pointer-coarse:p-4").is_empty());
    // Except direction, which is inherited and therefore has a subject
    // an ancestor can differ on. Tailwind allows this one too.
    assert!(
        conditions("group-rtl:p-4").contains(&Condition::Group(Box::new(Condition::Environment(
            Environment::Rtl
        ))))
    );
}
