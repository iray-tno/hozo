use super::*;

#[test]
fn a_functional_variant_with_a_bracketed_argument_is_named() {
    // `aria-[sort=ascending]:` is Tailwind's spelling for the ARIA states
    // that are not booleans, and Hozo implements only the booleans. Read
    // whole, `aria-[sort=ascending]` matched nothing in the variant list,
    // so the class was neither compiled nor reported -- the one outcome
    // decision 003 rules out. The name is the part in front of the
    // bracket.
    assert_eq!(
        unsupported_variant_name("aria-[sort=ascending]:underline"),
        Some("aria")
    );
}

#[test]
fn a_class_that_was_never_tailwinds_is_still_not_reported() {
    // The whole value of this function is telling the two apart. A
    // project's own marker class is not a gap in Hozo, with or without a
    // bracket in it.
    assert_eq!(unsupported_variant_name("my-card"), None);
    assert_eq!(unsupported_variant_name("my-[thing]:p-4"), None);
}

#[test]
fn an_arbitrary_variant_is_somebody_elses_report() {
    // `[&:hover]:p-4` is not a name Tailwind defines, so `is_arbitrary`
    // covers it and this says nothing.
    assert_eq!(unsupported_variant_name("[&:hover]:p-4"), None);
}

#[test]
fn a_variant_hozo_does_compile_is_stripped_before_it_gets_here() {
    // `data-[hozo-state=checked]:` is implemented, so the prefix is gone
    // by the time this function sees the token and there is nothing left
    // to report.
    assert_eq!(
        unsupported_variant_name("data-[hozo-state=checked]:p-4"),
        None
    );
    assert_eq!(unsupported_variant_name("aria-checked:p-4"), None);
}
