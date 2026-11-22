use hozo_ir::{Condition, Environment};

use super::*;

#[test]
fn the_one_setting_the_web_can_ask_becomes_a_media_query() {
    // Tailwind has no variant for it, so it was uncovered on this
    // platform too -- the query is real and nothing was reaching it.
    let (at_rules, selector) =
        condition_shape(&Condition::Environment(Environment::ReduceTransparency));
    assert_eq!(
        at_rules,
        vec!["@media (prefers-reduced-transparency: reduce)"]
    );
    assert_eq!(selector, "&");
}

#[test]
fn the_three_it_cannot_ask_are_refused_rather_than_guessed() {
    // An empty prelude would be a rule with no condition, which
    // applies to *everyone* -- worse than one that never applies.
    for query in [
        Environment::BoldText,
        Environment::Grayscale,
        Environment::ScreenReader,
    ] {
        assert_eq!(
            inexpressible_on_web(&Condition::Environment(query)),
            Some(query),
            "{query:?}",
        );
    }
    assert_eq!(
        inexpressible_on_web(&Condition::Environment(Environment::ReduceTransparency)),
        None,
    );
}

#[test]
fn a_stacked_variant_is_inexpressible_the_moment_any_part_is() {
    // `dark:screen-reader:flex` has no rule to emit either, and
    // emitting the dark half alone would apply it to everyone in dark
    // mode.
    assert_eq!(
        inexpressible_on_web(&Condition::All(vec![
            Condition::Dark,
            Condition::Environment(Environment::ScreenReader),
        ])),
        Some(Environment::ScreenReader),
    );
    assert_eq!(
        inexpressible_on_web(&Condition::Not(Box::new(Condition::Environment(
            Environment::BoldText
        )))),
        Some(Environment::BoldText),
    );
}

#[test]
fn the_refusal_says_refuses_rather_than_lacks_where_that_is_the_fact() {
    // Two different facts, and only one of them might change.
    assert!(Environment::ScreenReader
        .web_gap_message()
        .contains("declines"));
    assert!(Environment::BoldText.web_gap_message().contains("no query"));
}
