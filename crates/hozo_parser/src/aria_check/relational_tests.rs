use hozo_ir::{Condition, DiagnosticCode, StyleDeclaration};

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

fn codes(class_name: &str) -> Vec<DiagnosticCode> {
    crate::parse_tsx(&source(class_name))
        .diagnostics
        .into_iter()
        .map(|d| d.code)
        .collect()
}

#[test]
fn group_and_peer_wrap_whatever_variant_follows() {
    // Parsed by recursion rather than by a list of combinations, so a
    // variant added later is groupable the day it lands. These four
    // needed no entry of their own anywhere.
    assert!(conditions("group-hover:p-4").contains(&Condition::Group(Box::new(Condition::Hover))));
    assert!(
        conditions("group-aria-checked:p-4").contains(&Condition::Group(Box::new(
            Condition::Aria("checked".to_string())
        )))
    );
    assert!(conditions("peer-hover:p-4").contains(&Condition::Peer(Box::new(Condition::Hover))));
    assert!(
        conditions("group-first:p-4").contains(&Condition::Group(Box::new(Condition::FirstChild)))
    );
}

#[test]
fn in_is_group_without_the_marker() {
    // #1777. The same recursion, so `in-focus:` and `in-aria-checked:`
    // need nothing of their own.
    assert!(conditions("in-focus:p-4").contains(&Condition::In(Box::new(Condition::Focus))));
    assert!(
        conditions("in-aria-checked:p-4").contains(&Condition::In(Box::new(Condition::Aria(
            "checked".to_string()
        ))))
    );
    assert!(codes("in-focus:p-4").is_empty());
    // `in-range:` is a form state of its own, not `in-` around `range:`.
    assert!(conditions("in-range:p-4").contains(&Condition::FormState(hozo_ir::FormState::InRange)));
    // Like `group-dark:`, a query has no subject to move.
    assert!(conditions("in-dark:p-4").is_empty());
    assert!(codes("inert:p-4").is_empty());
    assert!(conditions("group-inert:p-4").contains(&Condition::Group(Box::new(Condition::Inert))));
}

#[test]
fn a_condition_about_the_environment_cannot_be_related() {
    // Tailwind refuses `group-dark:` too: a colour-scheme preference
    // or a viewport width is true of the page, so asking it of an
    // *ancestor* says nothing the element does not already know.
    //
    // Refused at parse time rather than dropped later, so the class
    // falls through whole to the unsupported-variant diagnostic
    // instead of compiling to nothing in silence.
    assert!(conditions("group-dark:p-4").is_empty());
    assert_eq!(
        codes("group-dark:p-4"),
        vec![DiagnosticCode::TailwindVariantNotSupported]
    );
    assert!(conditions("group-md:p-4").is_empty());
}

#[test]
fn an_inner_variant_hozo_lacks_is_reported_rather_than_swallowed() {
    // Only Tailwind's boolean ARIA states are compiled, so `peer-` around
    // `aria-[sort=ascending]:` is not either -- and says so. (`peer-checked:`
    // until #1752, then `peer-inert:` until #1777.)
    assert_eq!(
        codes("peer-aria-[sort=ascending]:p-4"),
        vec![DiagnosticCode::TailwindVariantNotSupported]
    );
}
