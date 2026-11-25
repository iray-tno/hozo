//! Outline, divide, ring and inset utilities, border side colors and logical borders.

use hozo_ir::{Axis, BorderStyle, Color, DecorationStyle, Dimension, Edge, Length, StyleProperty};

use super::border_width::parse_border_width_px;
use super::color_family::register_color;
use super::dimension::parse_dimension_suffix;

/// `outline*`: width (which also implies a style, as Tailwind does), an
/// explicit style, a colour, or an offset.
pub(super) fn expand_outline(token: &str) -> Option<Vec<StyleProperty>> {
    let rest = token.strip_prefix("outline")?;
    if rest.is_empty() {
        // Bare `outline` is 1px solid.
        return Some(vec![
            StyleProperty::OutlineStyle(BorderStyle::Default),
            StyleProperty::OutlineWidth(Length::Px(1.0)),
        ]);
    }
    let suffix = rest.strip_prefix('-')?;

    if let Some(offset) = suffix.strip_prefix("offset-") {
        return offset
            .parse::<f64>()
            .ok()
            .map(|px| vec![StyleProperty::OutlineOffset(Length::Px(px))]);
    }
    // Before the style keywords, which would read `hidden` as
    // `BorderStyle::Hidden`. `outline-style: hidden` is not valid CSS --
    // an outline takes `auto | none | <border-style except hidden>` --
    // and Tailwind writes `none` here. The forced-colors fallback stays
    // separate so the browser can restore a visible system outline.
    //
    // This arm existed before and sat *after* the keyword match, so it
    // never ran. Nothing caught it because the rule Tailwind writes for
    // `outline-hidden` contains a nested at-rule, and the harness's rule
    // extractor used to drop any rule shaped like that -- the candidate
    // read as "Tailwind emits nothing for this" and left the denominator.
    if suffix == "hidden" {
        return Some(vec![
            StyleProperty::OutlineStyle(BorderStyle::None),
            StyleProperty::OutlineHiddenForcedColors,
        ]);
    }
    if let Some(style) = border_style_keyword(suffix) {
        return Some(vec![StyleProperty::OutlineStyle(style)]);
    }
    if let Ok(px) = suffix.parse::<f64>() {
        return Some(vec![
            StyleProperty::OutlineStyle(BorderStyle::Default),
            StyleProperty::OutlineWidth(Length::Px(px)),
        ]);
    }
    Some(vec![StyleProperty::OutlineColor(Color::Token(
        suffix.to_string(),
    ))])
}

/// `divide-*`: the border between an element's children. Shares the
/// child-scoped rule mechanism with `space-*`.
pub(super) fn expand_divide(token: &str) -> Option<Vec<StyleProperty>> {
    let suffix = token.strip_prefix("divide-")?;

    // Before the widths, because `divide-x-reverse` would otherwise reach
    // `divide_width("-reverse")` and be declined there as a malformed
    // width rather than recognised as what it is.
    match suffix {
        "x-reverse" => return Some(vec![StyleProperty::DivideReverse(Axis::X)]),
        "y-reverse" => return Some(vec![StyleProperty::DivideReverse(Axis::Y)]),
        _ => {}
    }
    if let Some(width) = suffix.strip_prefix("x") {
        if let Some(length) = divide_width(width) {
            return Some(vec![StyleProperty::DivideX(Dimension::Length(length))]);
        }
    }
    if let Some(width) = suffix.strip_prefix("y") {
        if let Some(length) = divide_width(width) {
            return Some(vec![StyleProperty::DivideY(Dimension::Length(length))]);
        }
    }
    if let Some(style) = border_style_keyword(suffix) {
        return Some(vec![StyleProperty::DivideStyle(style)]);
    }
    Some(vec![StyleProperty::DivideColor(Color::Token(
        suffix.to_string(),
    ))])
}

/// The width half of `divide-x*`/`divide-y*`: empty means 1px.
pub(super) fn divide_width(suffix: &str) -> Option<Length> {
    match suffix {
        "" => Some(Length::Px(1.0)),
        rest => rest.strip_prefix('-')?.parse::<f64>().ok().map(Length::Px),
    }
}

pub(super) fn decoration_style_keyword(suffix: &str) -> Option<DecorationStyle> {
    Some(match suffix {
        "solid" => DecorationStyle::Solid,
        "double" => DecorationStyle::Double,
        "dotted" => DecorationStyle::Dotted,
        "dashed" => DecorationStyle::Dashed,
        "wavy" => DecorationStyle::Wavy,
        _ => return None,
    })
}

pub(super) fn border_style_keyword(suffix: &str) -> Option<BorderStyle> {
    Some(match suffix {
        "solid" => BorderStyle::Solid,
        "dashed" => BorderStyle::Dashed,
        "dotted" => BorderStyle::Dotted,
        "double" => BorderStyle::Double,
        "hidden" => BorderStyle::Hidden,
        "none" => BorderStyle::None,
        _ => return None,
    })
}

/// `ring*` / `inset-ring*`: a width, or the colour that width renders in.
///
/// A colour on its own emits nothing, which is correct rather than a gap --
/// it only means something once a width is present, and the two compose in
/// the backend (see `StyleProperty::RingWidth`). Tailwind behaves the same
/// way; standalone `ring-red-500` produces no declarations either, only a
/// custom property.
pub(super) fn parse_ring(token: &str) -> Option<StyleProperty> {
    let (inset, rest) = match token.strip_prefix("inset-ring") {
        Some(rest) => (true, rest),
        None => (false, token.strip_prefix("ring")?),
    };
    // `ring-offset-*` is a layer of its own with its own colour and width,
    // not a spelling of the ring -- reading it as one would give a ring
    // colour called `offset-red-500`. There is no inset form.
    if let Some(suffix) = rest.strip_prefix("-offset-") {
        if inset {
            return None;
        }
        return Some(match suffix.parse::<f64>() {
            Ok(px) => StyleProperty::RingOffsetWidth(Length::Px(px)),
            Err(_) => StyleProperty::RingOffsetColor(register_color(suffix)),
        });
    }
    let suffix = match rest {
        // Bare `ring` / `inset-ring` is 1px.
        "" => return Some(width_prop(inset, Length::Px(1.0))),
        rest => rest.strip_prefix('-')?,
    };
    // Not a colour called `inset`. Tailwind writes it into the ring's own
    // layer as `var(--tw-ring-inset,)` -- an empty fallback, so the layer
    // reads `inset 0 0 0 …` when the utility is present and `0 0 0 …` when
    // it is not. Named before the colour catch-all, which would otherwise
    // paint the ring in `var(--hozo-color-inset)`.
    if suffix == "inset" && !inset {
        return Some(StyleProperty::RingInset);
    }
    match suffix.parse::<f64>() {
        Ok(px) => Some(width_prop(inset, Length::Px(px))),
        Err(_) => Some(if inset {
            StyleProperty::InsetRingColor(register_color(suffix))
        } else {
            StyleProperty::RingColor(register_color(suffix))
        }),
    }
}

pub(super) fn width_prop(inset: bool, width: Length) -> StyleProperty {
    if inset {
        StyleProperty::InsetRingWidth(width)
    } else {
        StyleProperty::RingWidth(width)
    }
}

/// `inset-<value>` and `inset-<side>-<value>`, each optionally negated.
///
/// Bare `inset-*` sets all four sides, so it stays four physical
/// properties; the axis and logical forms map to the single CSS property
/// Tailwind emits for each.
pub(super) fn expand_inset(token: &str) -> Option<Vec<StyleProperty>> {
    let rest = token.strip_prefix("inset-")?;

    let (side, value) = match rest.split_once('-') {
        Some((side, value)) if matches!(side, "x" | "y" | "s" | "e" | "bs" | "be") => {
            (Some(side), value)
        }
        _ => (None, rest),
    };
    let length = parse_dimension_suffix(value)?;

    Some(match side {
        Some("x") => vec![StyleProperty::InsetInline(length)],
        Some("y") => vec![StyleProperty::InsetBlock(length)],
        Some("s") => vec![StyleProperty::InsetInlineStart(length)],
        Some("e") => vec![StyleProperty::InsetInlineEnd(length)],
        Some("bs") => vec![StyleProperty::InsetBlockStart(length)],
        Some("be") => vec![StyleProperty::InsetBlockEnd(length)],
        _ => vec![
            StyleProperty::InsetTop(length.clone()),
            StyleProperty::InsetRight(length.clone()),
            StyleProperty::InsetBottom(length.clone()),
            StyleProperty::InsetLeft(length),
        ],
    })
}

/// `border-<side>-<color>`, for every side Tailwind offers.
///
/// The width forms (`border-t-2`) matched an earlier arm, so a side here is
/// always followed by a colour token. Until 2026-08-15 this fell through to
/// the plain colour path and compiled `border-b-red-500` to
/// `border-color: var(--hozo-color-b-red-500)` -- the wrong property, on
/// all four sides, from a token that isn't a colour name.
pub(super) fn parse_border_side_color(suffix: &str) -> Option<StyleProperty> {
    let (side, token) = suffix.split_once('-')?;
    // A number is a *width* on that side (`border-x-2`), not a colour. The
    // physical sides' widths matched an earlier arm; the logical and axis
    // ones aren't lowered yet, so declining here lets the guard below
    // refuse them by name instead of inventing a colour called "2".
    if token.parse::<f64>().is_ok() {
        return None;
    }
    let color = Color::Token(token.to_string());
    Some(match side {
        "t" => StyleProperty::BorderTopColor(color),
        "r" => StyleProperty::BorderRightColor(color),
        "b" => StyleProperty::BorderBottomColor(color),
        "l" => StyleProperty::BorderLeftColor(color),
        "x" => StyleProperty::BorderInlineColor(color),
        "y" => StyleProperty::BorderBlockColor(color),
        "s" => StyleProperty::BorderInlineStartColor(color),
        "e" => StyleProperty::BorderInlineEndColor(color),
        "bs" => StyleProperty::BorderBlockStartColor(color),
        "be" => StyleProperty::BorderBlockEndColor(color),
        _ => return None,
    })
}

/// A size suffix that may also name Tailwind's container scale (`w-md` is
/// `--container-md`, 28rem), falling back to the ordinary dimension parser.
///
/// The scale is **inline-axis only**: `w-*`, `min-w-*`, `max-w-*`,
/// `basis-*` and the `inline-*` logical family take it, and nothing on the
/// block axis does. Tailwind emits no rule at all for `max-h-md` or
/// `h-2xl` -- containers are a measure of line length, so a named one on
/// the block axis has no meaning.
///
/// Applying it to `max-h-*` (as this did until 2026-08-16) was invisible to
/// the conformance report rather than caught by it: a candidate Tailwind
/// produces no rule for leaves the denominator, so Hozo accepting a class
/// Tailwind rejects is exactly the shape of error that report can't see.
/// `border-s/e/x/y/bs/be`, the logical-edge border widths.
///
/// Each writes the style alongside the width for the same reason the
/// physical sides do: CSS defaults `border-style` to `none`, so a width
/// alone renders nothing, and scoping the style to the same edge stops the
/// untouched edges falling back to `border-width: medium` and appearing.
pub(super) fn parse_logical_border(token: &str) -> Option<Vec<StyleProperty>> {
    let rest = token.strip_prefix("border-")?;
    let (name, width) = match rest.split_once('-') {
        Some((name, value)) => (name, parse_border_width_px(value)?),
        // `border-s` with no width means 1px, as for the physical sides.
        None => (rest, Length::Px(1.0)),
    };
    let edge = match name {
        "s" => Edge::InlineStart,
        "e" => Edge::InlineEnd,
        "x" => Edge::Inline,
        "y" => Edge::Block,
        "bs" => Edge::BlockStart,
        "be" => Edge::BlockEnd,
        _ => return None,
    };
    Some(vec![
        StyleProperty::BorderLogicalWidth(edge, width),
        StyleProperty::BorderLogicalStyle(edge, BorderStyle::Default),
    ])
}
