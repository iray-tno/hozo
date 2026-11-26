//! Width, height and their min/max and logical families, and the size
//! suffixes they share.

use hozo_ir::{Dimension, Length, StyleProperty};

use super::spacing::parse_spacing_suffix;
use super::transform::parse_axis_transform;

/// The one-property spacing/sizing families that take a `Dimension`.
///
/// A flat prefix table because that is all they are -- each is one CSS
/// property fed by the same value parser everything else uses.
pub(super) fn expand_dimension_family(token: &str) -> Option<Vec<StyleProperty>> {
    /// Whether the family sits on the inline axis, and so also accepts the
    /// named container scale (`basis-md`). See `parse_inline_size_suffix`.
    const INLINE: bool = true;
    const BLOCK: bool = false;
    #[allow(clippy::type_complexity)]
    const FAMILIES: &[(&str, fn(Dimension) -> StyleProperty, bool)] = &[
        ("basis-", StyleProperty::FlexBasis, INLINE),
        ("block-", StyleProperty::BlockSize, BLOCK),
        ("inline-", StyleProperty::InlineSize, INLINE),
        ("max-block-", StyleProperty::MaxBlockSize, BLOCK),
        ("max-inline-", StyleProperty::MaxInlineSize, INLINE),
        ("min-block-", StyleProperty::MinBlockSize, BLOCK),
        ("min-inline-", StyleProperty::MinInlineSize, INLINE),
        ("indent-", StyleProperty::TextIndent, BLOCK),
        ("mbs-", StyleProperty::MarginBlockStart, BLOCK),
        ("mbe-", StyleProperty::MarginBlockEnd, BLOCK),
    ];
    // Longest prefix first: `max-block-` must beat `block-`.
    if let Some(&(prefix, make, inline_axis)) = FAMILIES
        .iter()
        .filter(|(p, _, _)| token.starts_with(*p))
        .max_by_key(|(p, _, _)| p.len())
    {
        let suffix = &token[prefix.len()..];
        if prefix.starts_with("max-") || prefix.starts_with("min-") {
            if let Some(value) = parse_extremum_suffix(suffix) {
                return Some(vec![make(value)]);
            }
        }
        let value = if inline_axis {
            parse_inline_size_suffix(suffix)
        } else {
            parse_dimension_suffix(suffix)
        };
        if let Some(value) = value {
            return Some(vec![make(value)]);
        }
    }
    // A plain pixel count, not the spacing scale: `underline-offset-4` is
    // 4px, where `p-4` is 16px. Tailwind uses the bare number here because
    // an underline offset is a typographic distance rather than a layout
    // step.
    if let Some(rest) = token.strip_prefix("underline-offset-") {
        if rest == "auto" {
            return Some(vec![StyleProperty::TextUnderlineOffset(Dimension::Auto)]);
        }
        if let Ok(px) = rest.parse::<f64>() {
            return Some(vec![StyleProperty::TextUnderlineOffset(Dimension::Length(
                Length::Px(px),
            ))]);
        }
    }
    if let Some(rest) = token.strip_prefix("pbs-") {
        return parse_spacing_suffix(rest)
            .map(|l| vec![StyleProperty::PaddingBlockStart(Dimension::Length(l))]);
    }
    if let Some(rest) = token.strip_prefix("pbe-") {
        return parse_spacing_suffix(rest)
            .map(|l| vec![StyleProperty::PaddingBlockEnd(Dimension::Length(l))]);
    }
    if let Some(rest) = token.strip_prefix("border-spacing-x-") {
        return parse_spacing_suffix(rest)
            .map(|l| vec![StyleProperty::BorderSpacingX(Dimension::Length(l))]);
    }
    if let Some(rest) = token.strip_prefix("border-spacing-y-") {
        return parse_spacing_suffix(rest)
            .map(|l| vec![StyleProperty::BorderSpacingY(Dimension::Length(l))]);
    }
    if let Some(rest) = token.strip_prefix("border-spacing-") {
        return parse_spacing_suffix(rest).map(|l| {
            vec![
                StyleProperty::BorderSpacingX(Dimension::Length(l.clone())),
                StyleProperty::BorderSpacingY(Dimension::Length(l)),
            ]
        });
    }
    // `*-screen` is a viewport size, which the block/inline families spell
    // on their own axis: `block-screen` is a height, `inline-screen` a
    // width. Handled before the table so it stays a `ViewportHeight`/
    // `ViewportWidth` the Native backend can answer, rather than text.
    for (prefix, make, vertical) in [
        (
            "max-block-",
            StyleProperty::MaxBlockSize as fn(Dimension) -> StyleProperty,
            true,
        ),
        (
            "min-block-",
            StyleProperty::MinBlockSize as fn(Dimension) -> StyleProperty,
            true,
        ),
        (
            "block-",
            StyleProperty::BlockSize as fn(Dimension) -> StyleProperty,
            true,
        ),
        (
            "max-inline-",
            StyleProperty::MaxInlineSize as fn(Dimension) -> StyleProperty,
            false,
        ),
        (
            "min-inline-",
            StyleProperty::MinInlineSize as fn(Dimension) -> StyleProperty,
            false,
        ),
        (
            "inline-",
            StyleProperty::InlineSize as fn(Dimension) -> StyleProperty,
            false,
        ),
    ] {
        if token == format!("{}screen", prefix) {
            return Some(vec![make(if vertical {
                Dimension::ViewportHeight(100.0)
            } else {
                Dimension::ViewportWidth(100.0)
            })]);
        }
    }
    // Bare `translate-*` sets both axes; `translate-z-*` the third.
    if let Some(rest) = token.strip_prefix("translate-z-") {
        return parse_spacing_suffix(rest)
            .map(|l| vec![StyleProperty::TranslateZ(Dimension::Length(l))]);
    }
    if let Some(rest) = token.strip_prefix("translate-") {
        return parse_dimension_suffix(rest).map(|d| {
            vec![
                StyleProperty::TranslateX(d.clone()),
                StyleProperty::TranslateY(d),
            ]
        });
    }
    parse_axis_transform(token)
}

/// The sizes CSS states as a keyword or a unit Hozo can't resolve:
/// intrinsic sizing, the chrome-aware viewport units, and `lh`. Shared by
/// every size family, since Tailwind offers them on all of them.
pub(super) fn parse_css_size_suffix(suffix: &str) -> Option<Dimension> {
    Some(Dimension::Css(String::from(match suffix {
        "fit" => "fit-content",
        "max" => "max-content",
        "min" => "min-content",
        "dvh" => "100dvh",
        "dvw" => "100dvw",
        "lvh" => "100lvh",
        "lvw" => "100lvw",
        "svh" => "100svh",
        "svw" => "100svw",
        "lh" => "1lh",
        _ => return None,
    })))
}

/// The values only the *max* and *min* size families take.
///
/// Kept out of the shared suffix table because they are not dimensions in
/// general: putting `none` there made `translate-none` parse as a
/// translation of "none none" rather than as switching the property off.
pub(super) fn parse_extremum_suffix(suffix: &str) -> Option<Dimension> {
    Some(Dimension::Css(String::from(match suffix {
        "none" => "none",
        // Tailwind's measure-of-text width, and the one place `ch` appears.
        "prose" => "65ch",
        _ => return None,
    })))
}

pub(super) fn parse_inline_size_suffix(suffix: &str) -> Option<Dimension> {
    let rem = match suffix {
        "3xs" => 16.0,
        "2xs" => 18.0,
        "xs" => 20.0,
        "sm" => 24.0,
        "md" => 28.0,
        "lg" => 32.0,
        "xl" => 36.0,
        "2xl" => 42.0,
        "3xl" => 48.0,
        "4xl" => 56.0,
        "5xl" => 64.0,
        "6xl" => 72.0,
        "7xl" => 80.0,
        _ => return parse_css_size_suffix(suffix).or_else(|| parse_dimension_suffix(suffix)),
    };
    Some(Dimension::Length(Length::Px(rem * 16.0)))
}

/// Width/height accept more than the spacing scale: `w-1/2` fractions and
/// `w-full`/`w-auto` keywords (the latter handled by the exact-match table).
pub(super) fn parse_dimension_suffix(suffix: &str) -> Option<Dimension> {
    if let Some(css) = parse_css_size_suffix(suffix) {
        return Some(css);
    }
    match suffix {
        "auto" => return Some(Dimension::Auto),
        "full" => return Some(Dimension::Percent(100.0)),
        _ => {}
    }
    if let Some((num, denom)) = suffix.split_once('/') {
        let num: f64 = num.parse().ok()?;
        let denom: f64 = denom.parse().ok()?;
        if denom == 0.0 {
            return None;
        }
        return Some(Dimension::Percent(num / denom * 100.0));
    }
    parse_spacing_suffix(suffix).map(Dimension::Length)
}
