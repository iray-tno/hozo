use hozo_ir::{Color, ColumnCount, Dimension, Length, LengthUnit};

use super::*;

#[test]
fn a_prefix_and_a_bracketed_value() {
    let parsed = split("w-[32px]").unwrap();
    assert_eq!(parsed.prefix, "w");
    assert_eq!(parsed.value, "32px");
    assert_eq!(parsed.hint, None);
}

#[test]
fn the_var_shorthand_desugars_to_a_var_call() {
    let parsed = split("bg-(--brand)").unwrap();
    assert_eq!(parsed.prefix, "bg");
    assert_eq!(parsed.value, "var(--brand)");
}

#[test]
fn a_hint_is_read_only_when_it_is_one() {
    assert_eq!(split("text-[length:14px]").unwrap().hint, Some("length"));
    // The colon here belongs to a URL. Reading `url(https` as a hint
    // would leave `//x)` as the value -- a broken declaration that
    // still looks like it parsed.
    let parsed = split("bg-[url(https://x)]").unwrap();
    assert_eq!(parsed.hint, None);
    assert_eq!(parsed.value, "url(https://x)");
}

#[test]
fn a_whole_class_can_be_a_declaration() {
    assert_eq!(
        split_property("[color:red]"),
        Some(("color".to_string(), "red".to_string()))
    );
    assert_eq!(
        split_property("[--my-var:4px]"),
        Some(("--my-var".to_string(), "4px".to_string()))
    );
}

#[test]
fn a_variant_splits_on_its_own_bracket_not_the_first_colon() {
    assert_eq!(split_variant("[&>*]:p-4"), Some(("&>*".to_string(), "p-4")));
    // The failure this prevents: cutting at the first colon yields the
    // selector `[&` and the utility `hover]:p-4`, both nonsense, and
    // neither obviously so.
    assert_eq!(
        split_variant("[&:hover]:p-4"),
        Some(("&:hover".to_string(), "p-4"))
    );
}

#[test]
fn a_hint_decides_a_var_and_the_shorthand_takes_one_too() {
    // #1477. `text-[length:var(--s)]` was a colour: the hint was read for
    // colours and ignored for sizes. And the hinted shorthand had no
    // `(--` in it, so it was never treated as arbitrary at all.
    let size = Some(vec![StyleProperty::Arbitrary(
        "font-size".to_string(),
        "var(--s)".to_string(),
    )]);
    assert_eq!(properties("text-[length:var(--s)]"), size);
    assert_eq!(properties("text-(length:--s)"), size);
    assert_eq!(
        properties("bg-(color:--b)"),
        Some(vec![StyleProperty::BackgroundColor(Color::Css(
            "var(--b)".to_string()
        ))])
    );
    assert!(is_arbitrary("bg-(color:--b)"));
}

#[test]
fn a_size_and_a_colour_under_the_same_prefix_reach_different_properties() {
    // The bug this module was written for. Both are `text-[...]`, and
    // one of them used to compile to `color: var(--hozo-color-[14px])`.
    assert_eq!(
        properties("text-[14px]"),
        Some(vec![StyleProperty::FontSize(Length::Px(14.0))])
    );
    assert_eq!(
        properties("text-[#fff]"),
        Some(vec![StyleProperty::TextColor(Color::Css(
            "#fff".to_string()
        ))])
    );
}

#[test]
fn a_length_keeps_its_unit_through_the_ir() {
    // Not converted to pixels at parse time: Web has to print `2rem`
    // to match Tailwind, and a reader who scaled up their font size
    // gets a different element from `32px`.
    assert_eq!(
        properties("mt-[2rem]"),
        Some(vec![StyleProperty::MarginTop(Dimension::Length(
            Length::Unit(2.0, LengthUnit::Rem)
        ))])
    );
}

#[test]
fn readable_columns_keep_named_ownership_but_opaque_values_stay_raw() {
    assert_eq!(
        properties("columns-[10rem]"),
        Some(vec![StyleProperty::Columns(ColumnCount::Width(
            Dimension::Length(Length::Unit(10.0, LengthUnit::Rem))
        ))])
    );
    assert_eq!(
        properties("columns-[3]"),
        Some(vec![StyleProperty::Columns(ColumnCount::Count(3))])
    );
    assert_eq!(
        properties("columns-[auto]"),
        Some(vec![StyleProperty::Columns(ColumnCount::Auto)])
    );
    for token in ["columns-(--layout)", "columns-[10rem_3]", "columns-[0]"] {
        assert!(matches!(
            properties(token).as_deref(),
            Some([StyleProperty::Arbitrary(name, _)]) if name == "columns"
        ));
    }
}

#[test]
fn a_value_too_odd_to_model_still_reaches_the_output() {
    // Tailwind validates arbitrary values not at all, so refusing here
    // would generate less than the engine Hozo is measured against.
    assert_eq!(
        properties("p-[nonsense]"),
        Some(vec![StyleProperty::Arbitrary(
            "padding".to_string(),
            "nonsense".to_string()
        )])
    );
}

#[test]
fn an_unreadable_bracket_is_refused_rather_than_guessed() {
    // No prefix table entry, so nothing is invented. The caller turns
    // this into `UnreadableArbitraryValue`.
    assert_eq!(properties("notautility-[10px]"), None);
}

#[test]
fn an_underscore_in_a_variant_is_a_descendant_combinator() {
    assert_eq!(
        split_variant("[.dark_&]:text-white"),
        Some((".dark &".to_string(), "text-white"))
    );
}
