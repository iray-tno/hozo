//! Lengths, dimensions and the CSS value types a bracket can hold.

use hozo_ir::{Dimension, Length, LengthUnit};

use super::normalize::is_math;

pub fn parse_length(css: &str) -> Option<Length> {
    if is_math(css) {
        return Some(Length::Css(css.to_string()));
    }
    if let Ok(zero) = css.parse::<f64>() {
        // Only zero: CSS requires a unit on every other length, and
        // accepting `w-[32]` would be accepting more than Tailwind does.
        return (zero == 0.0).then_some(Length::Px(0.0));
    }
    let split = css.find(|c: char| c.is_ascii_alphabetic() || c == '%')?;
    let (number, unit) = css.split_at(split);
    let value: f64 = number.parse().ok()?;
    if unit.eq_ignore_ascii_case("px") {
        return Some(Length::Px(value));
    }
    LengthUnit::parse(unit).map(|unit| Length::Unit(value, unit))
}

/// A value in a position that accepts a size.
///
/// Anything that isn't a length, a percentage or `auto` is kept as CSS
/// text. That is not a fallback so much as the honest answer: `calc()`,
/// `min()` and `fit-content` are resolved against layout state that only a
/// browser has, and `Dimension::Css` is exactly the variant that says so --
/// Web prints it, Native refuses it by name.
pub fn parse_dimension(css: &str) -> Dimension {
    if css == "auto" {
        return Dimension::Auto;
    }
    if let Some(percent) = css.strip_suffix('%') {
        if let Ok(value) = percent.parse::<f64>() {
            return Dimension::Percent(value);
        }
    }
    // Asked before `parse_length`, which now answers for math functions
    // too. A `Dimension` has carried its own `Css` variant since long
    // before `Length` did, and both refuse identically on Native -- so
    // routing `w-[calc(…)]` through the newer one would change nothing
    // except which arm the refusal comes out of. Left where it was.
    if is_math(css) {
        return Dimension::Css(css.to_string());
    }
    match parse_length(css) {
        Some(length) => Dimension::Length(length),
        None => Dimension::Css(css.to_string()),
    }
}

// ---------------------------------------------------------------------------
// Splitting a token
// ---------------------------------------------------------------------------

pub(super) fn is_percentage(value: &str) -> bool {
    value
        .strip_suffix('%')
        .is_some_and(|n| n.parse::<f64>().is_ok())
}

/// Whether a value is CSS's `line-width`: what a border or outline width
/// accepts.
///
/// Length or bare number, and **not** a percentage -- `border-[50%]` is a
/// border *colour* in Tailwind. Each of these families draws its type
/// boundary somewhere slightly different, and the differences are not
/// guessable: a decoration thickness takes a percentage and refuses a bare
/// number, a stroke width takes both, and this takes the other one. Every
/// boundary here was set by disagreeing with the oracle first.
pub(super) fn is_line_width(value: &str) -> bool {
    parse_length(value).is_some() || value.parse::<f64>().is_ok()
}

/// `<length-percentage>`: what a font size or a decoration thickness takes.
pub(super) fn is_length_percentage(value: &str) -> bool {
    parse_length(value).is_some() || is_percentage(value)
}
