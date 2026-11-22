//! Translate, rotate, scale and skew, per axis and as one transform.

use hozo_ir::{Angle, Scale, StyleProperty};

use super::dimension::parse_dimension_suffix;

/// The per-axis scales, the 3D rotations and the skews.
///
/// All of these are compositions in Tailwind -- several utilities writing
/// `--tw-*` registers that one declaration reads -- so Hozo resolves them
/// the same way it resolves rings, masks and translates: hold each axis as
/// its own property and join them at emit time. Bare `scale-*` sets all
/// three axes here rather than staying a fourth property, which is what
/// makes `scale-50 scale-x-75` resolve as Tailwind does: `dedupe_last_wins`
/// keys on the property, so the axes have to be separate properties to
/// override one another.
pub(super) fn parse_axis_transform(token: &str) -> Option<Vec<StyleProperty>> {
    if token == "scale-3d" {
        return Some(vec![StyleProperty::Scale3d]);
    }
    let percent = |rest: &str| rest.parse::<f64>().ok().map(Scale::Percent);
    let degrees = |rest: &str| rest.parse::<f64>().ok().map(Angle::Deg);

    if let Some(rest) = token.strip_prefix("scale-x-") {
        return percent(rest).map(|p| vec![StyleProperty::ScaleX(p)]);
    }
    if let Some(rest) = token.strip_prefix("scale-y-") {
        return percent(rest).map(|p| vec![StyleProperty::ScaleY(p)]);
    }
    // Writing the z axis also switches the declaration to its three-value
    // form -- see `StyleProperty::Scale3d`.
    if let Some(rest) = token.strip_prefix("scale-z-") {
        return percent(rest).map(|p| vec![StyleProperty::ScaleZ(p), StyleProperty::Scale3d]);
    }
    if let Some(rest) = token.strip_prefix("scale-") {
        return percent(rest).map(|p| {
            vec![
                StyleProperty::ScaleX(p.clone()),
                StyleProperty::ScaleY(p.clone()),
                StyleProperty::ScaleZ(p),
            ]
        });
    }
    if let Some(rest) = token.strip_prefix("rotate-x-") {
        return degrees(rest).map(|a| vec![StyleProperty::RotateX(a)]);
    }
    if let Some(rest) = token.strip_prefix("rotate-y-") {
        return degrees(rest).map(|a| vec![StyleProperty::RotateY(a)]);
    }
    if let Some(rest) = token.strip_prefix("rotate-z-") {
        return degrees(rest).map(|a| vec![StyleProperty::RotateZ(a)]);
    }
    if let Some(rest) = token.strip_prefix("skew-x-") {
        return degrees(rest).map(|a| vec![StyleProperty::SkewX(a)]);
    }
    if let Some(rest) = token.strip_prefix("skew-y-") {
        return degrees(rest).map(|a| vec![StyleProperty::SkewY(a)]);
    }
    // Bare `skew-*` is both axes, the same way bare `scale-*` is all three.
    if let Some(rest) = token.strip_prefix("skew-") {
        return degrees(rest)
            .map(|a| vec![StyleProperty::SkewX(a.clone()), StyleProperty::SkewY(a)]);
    }
    None
}

/// `rotate-<deg>`, `scale-<pct>`, `translate-x-<n>`, `translate-y-<n>`,
/// each optionally negated with a leading `-`.
pub(super) fn parse_transform(token: &str) -> Option<StyleProperty> {
    let (negative, token) = match token.strip_prefix('-') {
        Some(rest) => (true, rest),
        None => (false, token),
    };
    if let Some(rest) = token.strip_prefix("rotate-") {
        let degrees: f64 = rest.parse().ok()?;
        return Some(StyleProperty::Rotate(Angle::Deg(signed(degrees, negative))));
    }
    // `translate-x-1/2` is the centring idiom, so these take the wider
    // `Dimension` rather than a pixel length.
    if let Some(rest) = token.strip_prefix("translate-x-") {
        return parse_dimension_suffix(rest).map(StyleProperty::TranslateX);
    }
    if let Some(rest) = token.strip_prefix("translate-y-") {
        return parse_dimension_suffix(rest).map(StyleProperty::TranslateY);
    }
    None
}

/// Applies a `-` prefix, keeping zero unsigned.
///
/// IEEE negation of `0.0` gives `-0.0`, which Rust prints as `-0` -- so
/// `-scale-0` emitted `scale: -0% -0%` where Tailwind emits `0 0`. The
/// values behave identically in CSS; the strings don't, and a differential
/// test compares strings.
pub(super) fn signed(value: f64, negative: bool) -> f64 {
    let result = if negative { -value } else { value };
    if result == 0.0 {
        0.0
    } else {
        result
    }
}
