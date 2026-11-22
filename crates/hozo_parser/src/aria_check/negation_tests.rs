use hozo_ir::{Condition, DiagnosticCode, Environment, StyleDeclaration};

fn source(class_name: &str) -> String {
    format!("import {{ View }} from '@hozo/core'\nconst el = <View className=\"{class_name}\">x</View>\n")
}

fn conditions(class_name: &str) -> Vec<Condition> {
    crate::parse_tsx(&source(class_name)).roots[0]
        .node
        .style
        .iter()
        .map(|StyleDeclaration { condition, .. }| condition.clone())
        .collect()
}

#[test]
fn not_negates_whatever_follows_it() {
    for (class_name, inner) in [
        ("not-first:p-4", Condition::FirstChild),
        ("not-disabled:p-4", Condition::Disabled),
        ("not-dark:p-4", Condition::Dark),
        (
            "not-motion-reduce:p-4",
            Condition::Environment(Environment::MotionReduce),
        ),
        (
            "not-aria-checked:p-4",
            Condition::Aria("checked".to_string()),
        ),
    ] {
        assert!(
            conditions(class_name).contains(&Condition::Not(Box::new(inner))),
            "{class_name}",
        );
    }
}

#[test]
fn a_condition_with_both_forms_negates_into_two_rules() {
    // `hover:` is a media query *and* a pseudo-class -- a pointer that
    // can hover is an environment fact, being hovered is an element
    // fact. So `not-hover:` is two rules: the selector negated, and
    // a rule for a device where nothing is ever hovered.
    //
    // It was refused for a year of commits because `condition_shape`
    // returned one shape per condition. That was a limit of the
    // backend and not a fact about the variant, and `marker:` -- four
    // rules -- is what finally made it worth lifting.
    assert!(codes("not-hover:p-4").is_empty());
    // One condition, on each of the four declarations `p-4` writes.
    assert!(conditions("not-hover:p-4")
        .iter()
        .all(|c| *c == Condition::Not(Box::new(Condition::Hover))));
    assert!(!conditions("not-hover:p-4").is_empty());
}

fn codes(class_name: &str) -> Vec<DiagnosticCode> {
    crate::parse_tsx(&source(class_name))
        .diagnostics
        .into_iter()
        .map(|d| d.code)
        .collect()
}

#[test]
fn negation_follows_the_form_of_what_it_wraps() {
    // A negated selector is still a selector, so `group-not-first:`
    // relates; a negated query is still a query, so
    // `group-not-dark:` does not.
    assert!(Condition::Not(Box::new(Condition::FirstChild)).is_elemental());
    assert!(!Condition::Not(Box::new(Condition::Dark)).is_elemental());
}
