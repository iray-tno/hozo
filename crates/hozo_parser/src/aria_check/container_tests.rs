use hozo_ir::{Condition, StyleDeclaration, StyleProperty};

fn conditions(class_name: &str) -> Vec<Condition> {
    let source = format!(
        "import {{ View }} from '@hozo/core'
const el = <View className=\"{class_name}\">x</View>
"
    );
    crate::parse_tsx(&source).roots[0]
        .node
        .style
        .iter()
        .map(|StyleDeclaration { condition, .. }| condition.clone())
        .collect()
}

fn container(name: Option<&str>, at_least: bool, value: &str) -> Condition {
    Condition::Container {
        name: name.map(str::to_string),
        at_least,
        value: value.to_string(),
    }
}

#[test]
fn the_container_scale_is_not_the_viewport_scale() {
    // Five names are shared and none of them mean the same width.
    // `@sm` is 24rem where `sm` is 40rem, which is the whole reason
    // this is a separate table rather than a reuse of the other one.
    assert_eq!(conditions("@sm:flex"), vec![container(None, true, "384px")]);
    assert_eq!(
        conditions("sm:flex"),
        vec![Condition::Responsive(hozo_ir::Breakpoint::Sm)]
    );
    assert_eq!(conditions("@md:flex"), vec![container(None, true, "448px")]);
    // The two-character names have to be tried before the
    // one-character ones they end with.
    assert_eq!(
        conditions("@2xl:flex"),
        vec![container(None, true, "672px")]
    );
    assert_eq!(
        conditions("@3xs:flex"),
        vec![container(None, true, "256px")]
    );
}

#[test]
fn min_and_max_read_the_same_way_they_do_on_the_viewport() {
    assert_eq!(conditions("@min-md:flex"), conditions("@md:flex"));
    assert_eq!(
        conditions("@max-md:flex"),
        vec![container(None, false, "448px")]
    );
    assert_eq!(
        conditions("@min-[400px]:flex"),
        vec![container(None, true, "400px")]
    );
    assert_eq!(
        conditions("@[400px]:flex"),
        vec![container(None, true, "400px")]
    );
}

#[test]
fn a_name_says_which_ancestor_answers() {
    assert_eq!(
        conditions("@sm/main:flex"),
        vec![container(Some("main"), true, "384px")]
    );
    assert_eq!(
        conditions("@max-md/sidebar:flex"),
        vec![container(Some("sidebar"), false, "448px")],
    );
    // Including on the bracketed form, where the name sits between the
    // bracket and the colon -- which is why the bracket is split here
    // rather than by the arbitrary-value helper that eats the colon.
    assert_eq!(
        conditions("@min-[400px]/main:flex"),
        vec![container(Some("main"), true, "400px")],
    );
}

#[test]
fn declaring_a_container_is_a_utility_and_naming_it_is_two_declarations() {
    let props = |class_name: &str| -> Vec<StyleProperty> {
        let source = format!(
            "import {{ View }} from '@hozo/core'
const el = <View className=\"{class_name}\">x</View>
"
        );
        crate::parse_tsx(&source).roots[0]
            .node
            .style
            .iter()
            .map(|StyleDeclaration { property, .. }| property.clone())
            .collect()
    };
    assert_eq!(
        props("@container"),
        vec![StyleProperty::Keyword("container-type", "inline-size")],
    );
    assert_eq!(
        props("@container/main"),
        vec![
            StyleProperty::Keyword("container-type", "inline-size"),
            StyleProperty::ContainerName("main".to_string()),
        ],
    );
}

#[test]
fn a_container_query_is_a_query_and_relates_to_nothing() {
    // Same rule that refuses `group-dark:` and `group-max-md:`: an
    // at-rule wraps the rule and names nobody, so there is no subject
    // to move onto an ancestor.
    assert!(!container(None, true, "384px").is_elemental());
    assert!(container(None, true, "384px").is_ambient());
}
