use hozo_ir::{
    Clamp, Color, Dimension, Edge, FilterFunction, Length, LengthUnit, LineHeight, MaskStop,
    Radius, Scale,
};

use super::color::{is_color, looks_like_color};
use super::length::parse_length;
use super::*;

#[test]
fn underscores_become_spaces() {
    assert_eq!(normalize("1fr_auto"), "1fr auto");
    assert_eq!(normalize("0_0_4px_red"), "0 0 4px red");
}

#[test]
fn an_escaped_underscore_stays_one() {
    assert_eq!(normalize("a\\_b"), "a_b");
}

#[test]
fn a_url_keeps_its_underscores() {
    // The failure this prevents is a broken image path that looks like
    // a typo in the source rather than a compiler bug.
    assert_eq!(normalize("url(/a_b.png)"), "url(/a_b.png)");
}

#[test]
fn math_operators_get_spaced() {
    assert_eq!(normalize("calc(100%-2rem)"), "calc(100% - 2rem)");
    assert_eq!(normalize("calc(100%*2)"), "calc(100% * 2)");
    assert_eq!(normalize("calc(100%/3)"), "calc(100% / 3)");
    assert_eq!(normalize("calc(1px+2px)"), "calc(1px + 2px)");
    assert_eq!(
        normalize("calc(var(--a)-var(--b))"),
        "calc(var(--a) - var(--b))"
    );
}

#[test]
fn already_spaced_math_is_left_alone() {
    assert_eq!(normalize("calc(100%_-_2rem)"), "calc(100% - 2rem)");
}

#[test]
fn commas_space_out_inside_math_functions_only() {
    assert_eq!(normalize("min(100%,32rem)"), "min(100%, 32rem)");
    // `repeat` isn't a math function, so its commas stay tight -- and
    // Tailwind's output does too, which is the only reason this is a
    // rule rather than a preference.
    assert_eq!(
        normalize("repeat(3,minmax(0,1fr))"),
        "repeat(3,minmax(0,1fr))"
    );
}

#[test]
fn a_negative_number_is_not_a_subtraction() {
    assert_eq!(normalize("-4px"), "-4px");
    assert_eq!(normalize("calc(-4px)"), "calc(-4px)");
}

#[test]
fn an_exponent_sign_is_not_an_operator() {
    assert_eq!(normalize("calc(1e-3px)"), "calc(1e-3px)");
}

#[test]
fn lengths_keep_the_unit_they_were_written_in() {
    assert_eq!(parse_length("32px"), Some(Length::Px(32.0)));
    assert_eq!(
        parse_length("2rem"),
        Some(Length::Unit(2.0, LengthUnit::Rem))
    );
    assert_eq!(
        parse_length("1.5em"),
        Some(Length::Unit(1.5, LengthUnit::Em))
    );
    assert_eq!(parse_length("0"), Some(Length::Px(0.0)));
}

#[test]
fn a_unitless_nonzero_is_not_a_length() {
    // `w-[32]` is not something Tailwind accepts, and accepting it here
    // would mean Hozo compiled a class the real engine drops.
    assert_eq!(parse_length("32"), None);
}

#[test]
fn a_value_is_a_colour_unless_it_is_a_length() {
    // Tailwind's polarity, which is the opposite of the intuitive one:
    // the test is "is this a length?", and everything else -- including
    // outright nonsense -- is a colour. `text-[nonsense]` really does
    // compile to `color: nonsense` in Tailwind, and matching that is
    // the requirement.
    assert!(!is_color("14px", None));
    assert!(!is_color("2rem", None));
    assert!(is_color("#fff", None));
    assert!(is_color("rgb(0 0 0)", None));
    assert!(is_color("nonsense", None));
    // Not a math function, though. Tailwind resolves those to the size
    // side of every slot that has one, and treating them as colours is
    // what made `ring-[calc(…)]` compile to nothing.
    assert!(!is_color("calc(100% - 2rem)", None));
    assert!(!is_color("min(1px, 2px)", None));
    // `var()` stays a colour: nothing about it says which type it is.
    assert!(is_color("var(--x)", None));
}

#[test]
fn a_math_function_is_a_length_that_only_a_browser_can_work_out() {
    assert_eq!(
        parse_length("calc(100% - 2rem)"),
        Some(Length::Css("calc(100% - 2rem)".to_string()))
    );
    // Named because the alternative is a wrong number rather than a
    // refusal: `Length::px` ends in a zero default, so anything that
    // reaches Native unrefused is a layout that looks deliberate.
    let ring = StyleProperty::RingWidth(Length::Css("calc(100% - 2rem)".to_string()));
    assert_eq!(ring.css_expression_length(), Some("calc(100% - 2rem)"));
    assert!(ring
        .unsupported_on_native()
        .is_some_and(|m| m.contains("calc(100% - 2rem)")));
    // And the unit question is left unanswered rather than answered
    // wrongly -- there may be no unit here, or several.
    assert_eq!(ring.unresolved_length_unit(), None);
}

#[test]
fn a_length_inside_a_wrapper_is_still_asked_about() {
    // Found by this change rather than caused by it: a radius, a line
    // height and a letter spacing each wrap a `Length` next to
    // something that is not one, and none of the three was ever asked.
    // So `rounded-[1.5em]` compiled to `borderRadius: 0` on React
    // Native with no diagnostic, exactly the way `p-[1.5em]` used to.
    let radius = StyleProperty::BorderRadius(Radius::Length(Length::Unit(1.5, LengthUnit::Em)));
    assert_eq!(radius.unresolved_length_unit(), Some(LengthUnit::Em));
    assert!(radius.unsupported_on_native().is_some());

    let radius = StyleProperty::BorderTopLeftRadius(Radius::Length(Length::Css(
        "calc(100% - 2rem)".to_string(),
    )));
    assert_eq!(radius.css_expression_length(), Some("calc(100% - 2rem)"));

    let ch = Length::Unit(2.0, LengthUnit::Ch);
    let leading = StyleProperty::LineHeight(LineHeight::Length(ch));
    assert_eq!(leading.unresolved_length_unit(), Some(LengthUnit::Ch));

    // `Full` and `Ratio` carry no length, and asking must stay quiet
    // rather than guess one.
    assert_eq!(
        StyleProperty::BorderRadius(Radius::Full).unresolved_length_unit(),
        None
    );
    let ratio = StyleProperty::LineHeight(LineHeight::Ratio(1.5));
    assert_eq!(ratio.unresolved_length_unit(), None);
}

#[test]
fn a_hint_overrides_the_shape() {
    // The one case shape cannot decide: identical text, two meanings.
    assert!(is_color("var(--c)", Some("color")));
    assert!(!is_color("var(--c)", Some("length")));
}

#[test]
fn a_gradient_stop_asks_the_opposite_question() {
    // `is_color` above says "not a length, so a colour". A stop can't
    // work that way: a position is the *default*, so the colour test
    // has to be a real one. `mask-t-from-[nonsense]` is a stop at
    // `nonsense`, not a nonsense-coloured gradient.
    assert!(!looks_like_color("nonsense", None));
    assert!(!looks_like_color("var(--x)", None));
    assert!(!looks_like_color("50%", None));
    assert!(looks_like_color("#abc", None));
    assert!(looks_like_color("rgb(0 0 0)", None));
    // The reason the named list has to be the full one.
    assert!(looks_like_color("rebeccapurple", None));
    assert!(looks_like_color("currentColor", None));
    // And why the system colours are in it: they look like any other
    // identifier.
    assert!(looks_like_color("Canvas", None));
}

#[test]
fn a_mask_stop_lands_in_the_slot_its_value_names() {
    assert_eq!(
        properties("mask-t-from-[50%]"),
        Some(vec![StyleProperty::MaskStopPosition(
            hozo_ir::MaskSlot::Top,
            MaskStop::From,
            Dimension::Percent(50.0),
        )])
    );
    assert_eq!(
        properties("mask-t-from-[red]"),
        Some(vec![StyleProperty::MaskStopColor(
            hozo_ir::MaskSlot::Top,
            MaskStop::From,
            Color::Css("red".to_string()),
        )])
    );
    // An axis names two slots, and both get the stop.
    assert_eq!(properties("mask-x-to-[10px]").unwrap().len(), 2);
}

#[test]
fn a_filter_keeps_its_argument_verbatim() {
    // Tailwind validates none of this, so neither can Hozo: the
    // argument is whatever was written, wrapped in the function the
    // prefix names.
    assert_eq!(
        properties("blur-[10px]"),
        Some(vec![StyleProperty::Filter(
            FilterFunction::Blur,
            "blur(10px)".to_string()
        )])
    );
    assert_eq!(
        properties("backdrop-grayscale-[nonsense]"),
        Some(vec![StyleProperty::BackdropFilter(
            FilterFunction::Grayscale,
            "grayscale(nonsense)".to_string(),
        )])
    );
}

#[test]
fn a_scroll_offset_types_a_length_and_carries_anything_else() {
    assert_eq!(
        properties("scroll-mt-[10px]"),
        Some(vec![StyleProperty::ScrollMargin(
            Edge::Top,
            Length::Px(10.0)
        )])
    );
    assert_eq!(
        properties("scroll-px-[50%]"),
        Some(vec![StyleProperty::Arbitrary(
            "scroll-padding-inline".to_string(),
            "50%".to_string(),
        )])
    );
}

#[test]
fn a_percentage_radius_is_still_a_radius() {
    // Non-negative percentages now resolve into `Radius::Percent`, so both
    // Web and React Native receive typed radius properties.
    assert_eq!(
        properties("rounded-b-[50%]"),
        Some(vec![
            StyleProperty::BorderBottomLeftRadius(Radius::Percent(50.0)),
            StyleProperty::BorderBottomRightRadius(Radius::Percent(50.0)),
        ])
    );
    // The logical corners follow writing direction; `rounded-s` is the
    // two on the inline-start side.
    assert_eq!(
        properties("rounded-s-[10px]"),
        Some(vec![
            StyleProperty::BorderStartStartRadius(Radius::Length(Length::Px(10.0))),
            StyleProperty::BorderEndStartRadius(Radius::Length(Length::Px(10.0))),
        ])
    );
}

#[test]
fn an_arbitrary_scale_is_a_ratio_and_a_named_one_is_a_percentage() {
    // `scale-x-[1.5]` is `scale: 1.5`. Reading it as the percentage
    // `scale-x-150` means would print `1.5%`, a scale of one
    // sixty-sixth that renders as nothing.
    assert_eq!(
        properties("scale-x-[1.5]"),
        Some(vec![StyleProperty::ScaleX(Scale::Ratio(1.5))])
    );
    assert_eq!(
        properties("scale-x-[50%]"),
        Some(vec![StyleProperty::ScaleX(Scale::Percent(50.0))])
    );
    assert_eq!(
        properties("scale-[1.5]"),
        Some(vec![StyleProperty::Scale(vec![Scale::Ratio(1.5)])])
    );
    assert_eq!(
        properties("translate-[10px]"),
        Some(vec![StyleProperty::Translate(vec![
            Dimension::Length(Length::Px(10.0)),
            Dimension::Length(Length::Px(10.0)),
        ])])
    );
}

#[test]
fn a_clamp_that_is_not_a_count_stays_text() {
    assert_eq!(
        properties("line-clamp-[3]"),
        Some(vec![StyleProperty::LineClamp(Some(Clamp::Lines(3)))])
    );
    // Not a clamp of one, which is what `as u32` used to make of it.
    assert_eq!(
        properties("line-clamp-[1.5]"),
        Some(vec![StyleProperty::LineClamp(Some(Clamp::Css(
            "1.5".to_string()
        )))])
    );
}

#[test]
fn a_math_function_is_a_length_and_not_a_colour() {
    // The bug this is here for: `parse_length` refused `calc(…)`, and
    // `is_color` reads any refusal as "then it is a colour". So a ring
    // width became a ring *colour*, a colour alone paints nothing, and
    // the class compiled to nothing while reporting nothing.
    assert_eq!(
        properties("ring-[calc(100%-2rem)]"),
        Some(vec![StyleProperty::RingWidth(Length::Css(
            "calc(100% - 2rem)".to_string()
        ))])
    );
    assert_eq!(
        properties("inset-ring-[min(1px,2px)]"),
        Some(vec![StyleProperty::InsetRingWidth(Length::Css(
            "min(1px, 2px)".to_string()
        ))])
    );
    // Every slot with a size side goes the same way, which is what
    // Tailwind's own engine does with these.
    assert_eq!(
        properties("text-[clamp(1px,2vw,3px)]"),
        Some(vec![StyleProperty::FontSize(Length::Css(
            "clamp(1px, 2vw, 3px)".to_string()
        ))])
    );
}

#[test]
fn a_var_is_still_a_colour() {
    // The other half of the same rule, and the reason it is not "any
    // function is a length": nothing about `var(--x)` says what type it
    // holds, so Tailwind puts it on the colour side and so does this.
    assert_eq!(
        properties("ring-[var(--x)]"),
        Some(vec![StyleProperty::RingColor(Color::Css(
            "var(--x)".to_string()
        ))])
    );
}

#[test]
fn a_bare_var_in_a_font_is_a_weight() {
    // Nothing about `font-[var(--x)]` says which of the two it holds,
    // and Tailwind resolves the ambiguity towards the weight --
    // `font-[family-name:var(--x)]` is how it expects a family to be
    // asked for. Reading it the other way produced a `font-family` for
    // a variable holding `600`.
    assert_eq!(
        properties("font-[var(--x)]"),
        Some(vec![StyleProperty::Arbitrary(
            "font-weight".to_string(),
            "var(--x)".to_string()
        )])
    );
    assert_eq!(
        properties("font-[family-name:var(--x)]"),
        Some(vec![StyleProperty::Arbitrary(
            "font-family".to_string(),
            "var(--x)".to_string()
        )])
    );
    // A name is still a name.
    assert_eq!(
        properties("font-[Inter]"),
        Some(vec![StyleProperty::Arbitrary(
            "font-family".to_string(),
            "Inter".to_string()
        )])
    );
}

#[test]
fn an_arbitrary_transition_expands_like_the_named_ones() {
    // The whole family sets three declarations, and the arbitrary form
    // was the only member that set none -- it reported
    // `UNREADABLE_ARBITRARY_VALUE` and compiled to nothing. The report
    // could not see it: Tailwind writes the timing and duration through
    // registers this suite cannot reduce, so the candidate was skipped
    // before anyone asked whether Hozo had emitted anything.
    //
    // Its correctness is inherited rather than asserted twice: this is
    // the same triple `transition-colors` produces, and that one is
    // compared against Tailwind's own output on every run.
    assert_eq!(
        properties("transition-[opacity]"),
        Some(vec![
            StyleProperty::TransitionProperty("opacity".to_string()),
            StyleProperty::TransitionTimingFunction(
                crate::tailwind::DEFAULT_TRANSITION_TIMING.to_string(),
                hozo_ir::Origin::Default,
            ),
            StyleProperty::TransitionDuration(
                crate::tailwind::DEFAULT_TRANSITION_DURATION_MS,
                hozo_ir::Origin::Default,
            ),
        ])
    );
    // A list stays a list. Tailwind writes `opacity,transform` without
    // the space, and matching its text is the requirement.
    assert!(matches!(
        properties("transition-[opacity,transform]").as_deref(),
        Some([StyleProperty::TransitionProperty(list), ..]) if list == "opacity,transform"
    ));
}

#[test]
fn a_size_keeps_taking_the_dimension_route() {
    // `Dimension` has carried its own `Css` since long before `Length`
    // did. Both refuse identically on Native, so sending `w-[calc(…)]`
    // through the newer one would change nothing except which arm the
    // refusal comes from -- and this asserts it did not move.
    assert_eq!(
        properties("w-[calc(100%-2rem)]"),
        Some(vec![StyleProperty::Width(Dimension::Css(
            "calc(100% - 2rem)".to_string()
        ))])
    );
}
