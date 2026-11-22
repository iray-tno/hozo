use hozo_ir::{Condition, StyleDeclaration};

fn conditions(class_name: &str) -> Vec<Condition> {
    let source = format!(
            "import {{ View }} from '@hozo/core'\nconst el = <View className={{'{class_name}'}}>x</View>\n"
        );
    crate::parse_tsx(&source).roots[0]
        .node
        .style
        .iter()
        .map(|StyleDeclaration { condition, .. }| condition.clone())
        .collect()
}

#[test]
fn data_takes_the_three_shapes_tailwind_writes() {
    // Presence bare, presence bracketed, and an equality that is
    // quoted unless the author quoted it. Read out of Tailwind's
    // output rather than guessed, because the quoting is the part
    // that would have been guessed wrongly.
    for (class_name, selector) in [
        ("data-open:p-4", "[data-open]"),
        ("data-[foo]:p-4", "[data-foo]"),
        ("data-[state=open]:p-4", "[data-state=\"open\"]"),
    ] {
        assert!(
            conditions(class_name).contains(&Condition::DataAttribute(selector.to_string())),
            "{class_name}",
        );
    }
}

#[test]
fn has_is_the_third_relation_and_composes_like_the_other_two() {
    // A descendant, after an ancestor (`group-`) and a sibling
    // (`peer-`). Wrapping a variant rather than only a selector is
    // what makes `has-hover:` carry the media query hover has.
    assert!(conditions("has-hover:p-4").contains(&Condition::Has(Box::new(Condition::Hover))));
    assert!(conditions("has-[:focus]:p-4").contains(&Condition::HasSelector(":focus".to_string())));
    assert!(Condition::Has(Box::new(Condition::Hover)).is_ambient());
}

#[test]
fn supports_is_a_query_and_therefore_relates_to_nothing() {
    assert!(conditions("supports-[display:grid]:p-4")
        .contains(&Condition::Supports("display:grid".to_string())));
    // A feature query is true of the browser, so an ancestor cannot
    // differ on it -- the same rule that refuses `group-dark:`.
    assert!(!Condition::Supports("display:grid".to_string()).is_elemental());
    assert!(conditions("group-supports-[display:grid]:p-4").is_empty());
}
