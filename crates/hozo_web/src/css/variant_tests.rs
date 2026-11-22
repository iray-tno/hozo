use hozo_ir::Condition;

use super::shape::fill_selector;
use super::*;

#[test]
fn stacked_variants_nest_their_at_rules_and_join_their_selectors() {
    let (at_rules, selector) = condition_shape(&Condition::All(vec![
        Condition::Responsive(hozo_ir::Breakpoint::Md),
        Condition::FirstChild,
        Condition::Hover,
    ]));
    // Written order, outermost first, and `hover:` brings its own.
    assert_eq!(
        at_rules,
        vec!["@media (width >= 768px)", "@media (hover: hover)"]
    );
    // Suffixes append in written order: `:first-child:hover`, not the
    // reverse. Which is why the fold substitutes the accumulated
    // selector *into* each new template.
    assert_eq!(
        fill_selector(&selector, "hozo-0"),
        ".hozo-0:first-child:hover"
    );
}

#[test]
fn starting_style_nests_in_written_order_like_a_query() {
    // The only at-rule here that is not a query, and it still has to
    // nest where it was written: Tailwind puts `@media` outside for
    // `md:starting:` and inside for `starting:md:`, and the two mean
    // different things to a browser resolving the first frame.
    let md = Condition::Responsive(hozo_ir::Breakpoint::Md);
    let (outer, _) = condition_shape(&Condition::All(vec![md.clone(), Condition::StartingStyle]));
    assert_eq!(outer, vec!["@media (width >= 768px)", "@starting-style"]);
    let (inner, selector) = condition_shape(&Condition::All(vec![Condition::StartingStyle, md]));
    assert_eq!(inner, vec!["@starting-style", "@media (width >= 768px)"]);
    // It qualifies the rule rather than the element, so the selector
    // is untouched.
    assert_eq!(fill_selector(&selector, "hozo-0"), ".hozo-0");
}

#[test]
fn hover_carries_the_capability_query() {
    // Not decoration: without it a `:hover` style sticks on a touch
    // device after a tap.
    let (at_rules, selector) = condition_shape(&Condition::Hover);
    assert_eq!(at_rules, vec!["@media (hover: hover)"]);
    assert_eq!(selector, "&:hover");
}
