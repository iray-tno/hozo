//! Negative utilities: which properties can be negated, and how.

use hozo_ir::{Angle, Dimension, Em, GridLine, Length, LetterSpacing, Scale, StyleProperty};

use super::base::expand_base_utility;
use super::transform::signed;

/// Handles Tailwind's leading `-` once, for every family, by expanding the
/// positive form and flipping the result.
///
/// Doing it here rather than in each parser is what keeps `-mt-4`, `-top-4`
/// and `-translate-x-1/2` from each needing their own sign handling -- the
/// families that take a negative are exactly the ones whose properties are
/// numeric, and `negated` decides that per property rather than per parser.
pub(super) fn expand_negatable(token: &str) -> Vec<StyleProperty> {
    match token.strip_prefix('-') {
        // A leading `-` on something that doesn't take one (`-p-4`) yields
        // nothing rather than an invented negative padding.
        Some(positive) => expand_base_utility(positive)
            .into_iter()
            .map(negated)
            .collect::<Option<Vec<_>>>(),
        None => Some(expand_base_utility(token)),
    }
    .unwrap_or_default()
}

/// Flips one property's sign, or `None` if it has no meaningful negative.
///
/// Tailwind only generates the `-` form where CSS accepts a negative value,
/// so refusing here keeps Hozo from accepting more than Tailwind does.
/// Flips a length's sign, keeping it in whatever unit it was written in.
///
/// A spacing step negates as a step: `-mt-4` is minus four steps, and
/// resolving it to pixels first would freeze the project's scale into the
/// sign flip. Without an arm for it the whole utility was dropped --
/// negation returned `None`, and the caller reads that as "this property
/// has no negative form".
/// Flips an angle's sign.
///
/// `None` for an angle carried as text: `-rotate-x-[1.5em]` would have to
/// negate a string, and prefixing a `-` would produce `--1.5em` for an
/// author who already wrote one. Tailwind refuses the same combination.
pub(super) fn negated_angle(angle: Angle) -> Option<Angle> {
    match angle {
        Angle::Deg(degrees) => Some(Angle::Deg(signed(degrees, true))),
        Angle::Css(_) => None,
    }
}

/// Flips a scale's sign. `None` for the text case, for the same reason
/// `negated_angle` gives.
pub(super) fn negated_scale(scale: Scale) -> Option<Scale> {
    match scale {
        Scale::Percent(value) => Some(Scale::Percent(signed(value, true))),
        Scale::Ratio(value) => Some(Scale::Ratio(signed(value, true))),
        Scale::Css(_) => None,
    }
}

pub(super) fn negated_length(length: Length) -> Option<Length> {
    Some(match length {
        Length::Px(v) => Length::Px(signed(v, true)),
        Length::Spacing(v) => Length::Spacing(signed(v, true)),
        // Negated in place, keeping the unit: `-mt-[2rem]` is `-2rem`, and
        // the unit is what makes it a length at all.
        Length::Unit(v, unit) => Length::Unit(signed(v, true), unit),
        // Wrapped rather than folded, because there is no number here to
        // put a sign on. This is what Tailwind writes for every negated
        // arbitrary value -- `-mt-[2rem]` is `calc(2rem * -1)` in its own
        // output -- so the shape is Tailwind's, not an invention.
        Length::Css(css) => Length::Css(format!("calc({css} * -1)")),
    })
}

pub(super) fn negated(prop: StyleProperty) -> Option<StyleProperty> {
    fn flip(d: Dimension) -> Option<Dimension> {
        Some(match d {
            Dimension::Length(l) => Dimension::Length(negated_length(l)?),
            Dimension::Percent(v) => Dimension::Percent(signed(v, true)),
            // `auto` and the viewport units have no negative form.
            _ => return None,
        })
    }
    Some(match prop {
        StyleProperty::MarginTop(d) => StyleProperty::MarginTop(flip(d)?),
        StyleProperty::MarginRight(d) => StyleProperty::MarginRight(flip(d)?),
        StyleProperty::MarginBottom(d) => StyleProperty::MarginBottom(flip(d)?),
        StyleProperty::MarginLeft(d) => StyleProperty::MarginLeft(flip(d)?),
        StyleProperty::MarginInlineStart(d) => StyleProperty::MarginInlineStart(flip(d)?),
        StyleProperty::MarginInlineEnd(d) => StyleProperty::MarginInlineEnd(flip(d)?),
        StyleProperty::MarginBlockStart(d) => StyleProperty::MarginBlockStart(flip(d)?),
        StyleProperty::MarginBlockEnd(d) => StyleProperty::MarginBlockEnd(flip(d)?),
        StyleProperty::TextIndent(d) => StyleProperty::TextIndent(flip(d)?),
        // Only the em form negates: an absolute tracking is already folded
        // against a font size, and Tailwind has no negative form of it.
        StyleProperty::LetterSpacing(LetterSpacing::Em(Em(v))) => {
            StyleProperty::LetterSpacing(LetterSpacing::Em(Em(signed(v, true))))
        }
        StyleProperty::TextUnderlineOffset(d) => StyleProperty::TextUnderlineOffset(flip(d)?),
        StyleProperty::InsetTop(d) => StyleProperty::InsetTop(flip(d)?),
        StyleProperty::InsetRight(d) => StyleProperty::InsetRight(flip(d)?),
        StyleProperty::InsetBottom(d) => StyleProperty::InsetBottom(flip(d)?),
        StyleProperty::InsetLeft(d) => StyleProperty::InsetLeft(flip(d)?),
        StyleProperty::InsetInlineStart(d) => StyleProperty::InsetInlineStart(flip(d)?),
        StyleProperty::InsetInlineEnd(d) => StyleProperty::InsetInlineEnd(flip(d)?),
        StyleProperty::InsetInline(d) => StyleProperty::InsetInline(flip(d)?),
        StyleProperty::InsetBlock(d) => StyleProperty::InsetBlock(flip(d)?),
        StyleProperty::InsetBlockStart(d) => StyleProperty::InsetBlockStart(flip(d)?),
        StyleProperty::InsetBlockEnd(d) => StyleProperty::InsetBlockEnd(flip(d)?),
        StyleProperty::TranslateX(d) => StyleProperty::TranslateX(flip(d)?),
        StyleProperty::TranslateY(d) => StyleProperty::TranslateY(flip(d)?),
        StyleProperty::TranslateZ(d) => StyleProperty::TranslateZ(flip(d)?),
        StyleProperty::OutlineOffset(l) => StyleProperty::OutlineOffset(negated_length(l)?),
        StyleProperty::ZIndex(Some(z)) => StyleProperty::ZIndex(Some(-z)),
        // A marker rather than a value: negating `scale-z-50` must keep the
        // three-value form, so this negates to itself. Without an arm here
        // `negated` returned None and dropped the whole utility.
        StyleProperty::Scale3d => StyleProperty::Scale3d,
        StyleProperty::Order(n) => StyleProperty::Order(-n),
        // A negative grid line counts back from the end of the explicit
        // grid, so these negate rather than being rejected.
        StyleProperty::GridColumnStart(GridLine::Line(n)) => {
            StyleProperty::GridColumnStart(GridLine::Line(-n))
        }
        StyleProperty::GridColumnEnd(GridLine::Line(n)) => {
            StyleProperty::GridColumnEnd(GridLine::Line(-n))
        }
        StyleProperty::GridRowStart(GridLine::Line(n)) => {
            StyleProperty::GridRowStart(GridLine::Line(-n))
        }
        StyleProperty::GridRowEnd(GridLine::Line(n)) => {
            StyleProperty::GridRowEnd(GridLine::Line(-n))
        }
        StyleProperty::SpaceX(d) => StyleProperty::SpaceX(flip(d)?),
        StyleProperty::SpaceY(d) => StyleProperty::SpaceY(flip(d)?),
        StyleProperty::ScrollMargin(edge, l) => {
            StyleProperty::ScrollMargin(edge, negated_length(l)?)
        }
        StyleProperty::Rotate(a) => StyleProperty::Rotate(negated_angle(a)?),
        StyleProperty::ScaleX(s) => StyleProperty::ScaleX(negated_scale(s)?),
        StyleProperty::ScaleY(s) => StyleProperty::ScaleY(negated_scale(s)?),
        StyleProperty::ScaleZ(s) => StyleProperty::ScaleZ(negated_scale(s)?),
        StyleProperty::RotateX(a) => StyleProperty::RotateX(negated_angle(a)?),
        StyleProperty::RotateY(a) => StyleProperty::RotateY(negated_angle(a)?),
        StyleProperty::RotateZ(a) => StyleProperty::RotateZ(negated_angle(a)?),
        StyleProperty::SkewX(a) => StyleProperty::SkewX(negated_angle(a)?),
        StyleProperty::SkewY(a) => StyleProperty::SkewY(negated_angle(a)?),
        StyleProperty::MaskSlotArgument(slot, a) => {
            StyleProperty::MaskSlotArgument(slot, negated_angle(a)?)
        }
        StyleProperty::Gradient(kind, prelude) => {
            StyleProperty::Gradient(kind, negated_prelude(&prelude)?)
        }
        _ => return None,
    })
}

/// Flips the angle in a gradient constructor's prelude.
///
/// Text rather than a number because that is how `Gradient` carries it --
/// the prelude is `45deg in oklab`, `from 45deg in oklab`, `to right in
/// oklab` or just `in oklab`, and only the first two have an angle to
/// flip. A side has no negative and neither does a bare interpolation
/// space, so those decline and `-bg-linear-to-r` stays unparsed, which is
/// what Tailwind does with it.
pub(super) fn negated_prelude(prelude: &str) -> Option<String> {
    let (prefix, rest) = match prelude.strip_prefix("from ") {
        Some(rest) => ("from ", rest),
        None => ("", prelude),
    };
    let (angle, tail) = rest.split_once("deg")?;
    let degrees: f64 = angle.parse().ok()?;
    Some(format!("{prefix}{}deg{tail}", signed(degrees, true)))
}
