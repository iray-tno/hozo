use super::*;

#[test]
fn the_settings_tailwind_has_no_name_for_parse() {
    for (token, query) in [
        ("reduce-transparency:p-4", Environment::ReduceTransparency),
        ("bold-text:p-4", Environment::BoldText),
        ("grayscale:p-4", Environment::Grayscale),
        ("screen-reader:p-4", Environment::ScreenReader),
    ] {
        assert_eq!(
            expand_utility(token).0,
            Condition::Environment(query),
            "{token}"
        );
    }
}

#[test]
fn the_grayscale_utility_still_exists() {
    // The variant shares a name with the filter, which is the
    // arrangement `contrast-more:contrast-125` already has: a variant
    // is what comes before the colon, so the two never meet.
    assert_eq!(expand_utility("grayscale").0, Condition::Always);
    assert!(!expand_utility("grayscale").1.is_empty());
    assert_eq!(
        expand_utility("grayscale:grayscale").0,
        Condition::Environment(Environment::Grayscale),
    );
}

#[test]
fn they_compose_like_any_other_environment() {
    // Nothing about them is special to the fold, which is the point of
    // adding them as environments rather than as a new kind.
    assert_eq!(
        expand_utility("dark:screen-reader:p-4").0,
        Condition::All(vec![
            Condition::Dark,
            Condition::Environment(Environment::ScreenReader),
        ]),
    );
    assert_eq!(
        expand_utility("not-bold-text:p-4").0,
        Condition::Not(Box::new(Condition::Environment(Environment::BoldText))),
    );
}

#[test]
fn the_memo_survives_being_full() {
    // The only path that clears it, and otherwise never run: a project
    // whose class vocabulary is bounded never reaches the limit, so
    // without this the branch would ship unexecuted.
    let known = expand_utility("hover:p-4");
    for n in 0..(MEMO_LIMIT + 16) {
        let _ = expand_utility(&format!("p-[{n}px]"));
    }
    assert_eq!(expand_utility("hover:p-4"), known);
}

#[test]
fn a_remembered_token_expands_to_what_it_did_the_first_time() {
    // Cheap, but it is the whole contract: the memo is only sound
    // because this is a pure function of the token, and nothing else in
    // the crate has state to make it otherwise.
    for token in [
        "flex",
        "dark:bg-slate-900",
        "-mt-4",
        "container",
        "p-[1.5em]",
    ] {
        assert_eq!(expand_utility(token), expand_utility(token));
    }
}
