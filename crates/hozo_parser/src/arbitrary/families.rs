//! Utility families whose arbitrary values share one reading: sizing,
//! spacing, radii, scroll offsets, filters and mask stops.

use hozo_ir::{Color, Dimension, Edge, FilterFunction, MaskStop, Radius, StyleProperty};

use super::color::looks_like_color;
use super::length::{parse_dimension, parse_length};

/// A typed property where the value fits one, and the raw declaration
/// where it doesn't.
///
/// The fallback is not a concession -- it is what matching Tailwind
/// requires. Tailwind validates arbitrary values not at all: `w-[nonsense]`
/// emits `width: nonsense` and lets the browser discard it. Refusing here
/// would mean Hozo generated *less* than the engine it is checked
/// against, and the class would look broken for the wrong reason.
/// A border width for one side, typed where the value is a length.
///
/// The untyped case is a real one: `border-[1.5]` is a valid width in CSS
/// and not a length, so it goes through as the declaration it is.
pub(super) fn border_width(property: &str, value: &str) -> StyleProperty {
    match parse_length(value) {
        Some(l) => match property {
            "border-top-width" => StyleProperty::BorderTopWidth(l),
            "border-right-width" => StyleProperty::BorderRightWidth(l),
            "border-bottom-width" => StyleProperty::BorderBottomWidth(l),
            _ => StyleProperty::BorderLeftWidth(l),
        },
        None => StyleProperty::Arbitrary(property.to_string(), value.to_string()),
    }
}

pub(super) fn or_raw(
    property: &str,
    value: &str,
    typed: Option<StyleProperty>,
) -> Vec<StyleProperty> {
    match typed {
        Some(property) => vec![property],
        None => vec![StyleProperty::Arbitrary(
            property.to_string(),
            value.to_string(),
        )],
    }
}

/// The CSS longhand family a logical edge names, without its suffix.
pub(super) fn logical_side(edge: Edge) -> &'static str {
    match edge {
        Edge::InlineStart => "border-inline-start",
        Edge::InlineEnd => "border-inline-end",
        Edge::BlockStart => "border-block-start",
        _ => "border-block-end",
    }
}

/// `scroll-m*` and `scroll-p*`: eleven edges each, all mechanical.
///
/// Written as a table rather than match arms because the only thing that
/// varies is the edge, and the CSS property name is derived from it in
/// `hozo_web` rather than repeated here.
pub(super) fn scroll_offset(prefix: &str, value: &str) -> Option<Vec<StyleProperty>> {
    let (family, rest) = if let Some(rest) = prefix.strip_prefix("scroll-m") {
        ("scroll-margin", rest)
    } else {
        let rest = prefix.strip_prefix("scroll-p")?;
        ("scroll-padding", rest)
    };
    let edge = match rest {
        "" => Edge::All,
        "t" => Edge::Top,
        "r" => Edge::Right,
        "b" => Edge::Bottom,
        "l" => Edge::Left,
        "x" => Edge::Inline,
        "y" => Edge::Block,
        "s" => Edge::InlineStart,
        "e" => Edge::InlineEnd,
        "bs" => Edge::BlockStart,
        "be" => Edge::BlockEnd,
        _ => return None,
    };
    let Some(length) = parse_length(value) else {
        // The property name has to be spelled out for the untyped case,
        // since `Length` has no text variant to carry it.
        let suffix = match edge {
            Edge::All => "",
            Edge::Top => "-top",
            Edge::Right => "-right",
            Edge::Bottom => "-bottom",
            Edge::Left => "-left",
            Edge::Inline => "-inline",
            Edge::Block => "-block",
            Edge::InlineStart => "-inline-start",
            Edge::InlineEnd => "-inline-end",
            Edge::BlockStart => "-block-start",
            Edge::BlockEnd => "-block-end",
        };
        return Some(vec![StyleProperty::Arbitrary(
            format!("{family}{suffix}"),
            value.to_string(),
        )]);
    };
    Some(vec![if family == "scroll-margin" {
        StyleProperty::ScrollMargin(edge, length)
    } else {
        StyleProperty::ScrollPadding(edge, length)
    }])
}

/// The corners each `rounded-*` prefix writes.
///
/// Typed where `Radius` can hold the value and the plain declaration
/// otherwise, which is not a rare case here: `rounded-b-[50%]` is a
/// percentage radius -- valid CSS, and not a `Length`. Before this, every
/// one of those compiled to nothing.
pub(super) fn corner_radius(prefix: &str, value: &str) -> Option<Vec<StyleProperty>> {
    type Corner = (fn(Radius) -> StyleProperty, &'static str);
    const TL: Corner = (StyleProperty::BorderTopLeftRadius, "border-top-left-radius");
    const TR: Corner = (
        StyleProperty::BorderTopRightRadius,
        "border-top-right-radius",
    );
    const BL: Corner = (
        StyleProperty::BorderBottomLeftRadius,
        "border-bottom-left-radius",
    );
    const BR: Corner = (
        StyleProperty::BorderBottomRightRadius,
        "border-bottom-right-radius",
    );
    const SS: Corner = (
        StyleProperty::BorderStartStartRadius,
        "border-start-start-radius",
    );
    const SE: Corner = (
        StyleProperty::BorderStartEndRadius,
        "border-start-end-radius",
    );
    const ES: Corner = (
        StyleProperty::BorderEndStartRadius,
        "border-end-start-radius",
    );
    const EE: Corner = (StyleProperty::BorderEndEndRadius, "border-end-end-radius");

    let corners: &[Corner] = match prefix {
        "rounded-t" => &[TL, TR],
        "rounded-b" => &[BL, BR],
        "rounded-l" => &[TL, BL],
        "rounded-r" => &[TR, BR],
        "rounded-tl" => &[TL],
        "rounded-tr" => &[TR],
        "rounded-bl" => &[BL],
        "rounded-br" => &[BR],
        // The logical corners, which follow writing direction: `rounded-s`
        // is the two on the inline-start side, whichever those are.
        "rounded-s" => &[SS, ES],
        "rounded-e" => &[SE, EE],
        "rounded-ss" => &[SS],
        "rounded-se" => &[SE],
        "rounded-es" => &[ES],
        "rounded-ee" => &[EE],
        _ => return None,
    };
    let length = parse_length(value);
    Some(
        corners
            .iter()
            .map(|(variant, property)| match &length {
                Some(l) => variant(Radius::Length(l.clone())),
                None => StyleProperty::Arbitrary(property.to_string(), value.to_string()),
            })
            .collect(),
    )
}

/// One function of the `filter`/`backdrop-filter` chain.
///
/// The argument goes through untouched because Tailwind's does:
/// `grayscale-[nonsense]` is `grayscale(nonsense)` there, not a refusal.
/// `Filter` already carries its argument as text, so nothing needed
/// widening for this -- the whole family was simply unrouted.
pub(super) fn filter(prefix: &str, value: &str) -> Option<Vec<StyleProperty>> {
    let (backdrop, name) = match prefix.strip_prefix("backdrop-") {
        Some(rest) => (true, rest),
        None => (false, prefix),
    };
    let function = match name {
        "blur" => FilterFunction::Blur,
        "brightness" => FilterFunction::Brightness,
        "contrast" => FilterFunction::Contrast,
        "grayscale" => FilterFunction::Grayscale,
        "hue-rotate" => FilterFunction::HueRotate,
        "invert" => FilterFunction::Invert,
        "saturate" => FilterFunction::Saturate,
        "sepia" => FilterFunction::Sepia,
        "drop-shadow" => FilterFunction::DropShadow,
        // `opacity-[…]` is the opacity *property*; the filter register of
        // the same name is only reachable through `backdrop-opacity-*`.
        "opacity" if backdrop => FilterFunction::Opacity,
        _ => return None,
    };
    let css = format!("{name}({value})");
    Some(vec![if backdrop {
        StyleProperty::BackdropFilter(function, css)
    } else {
        StyleProperty::Filter(function, css)
    }])
}

/// `mask-t-from-[…]` and the seventeen other slot/stop combinations.
///
/// The colour-or-position decision is `text-`'s again, and so is its
/// polarity: a value that reads as a size is a position, and everything
/// else -- including text neither side can resolve -- is a colour.
pub(super) fn mask_stop(
    prefix: &str,
    value: &str,
    hint: Option<&str>,
) -> Option<Vec<StyleProperty>> {
    let rest = prefix.strip_prefix("mask-")?;
    let (axis, stop) = rest.rsplit_once('-')?;
    let stop = match stop {
        "from" => MaskStop::From,
        "to" => MaskStop::To,
        _ => return None,
    };
    let slots = crate::tailwind::mask_slots(axis)?;
    Some(
        slots
            .iter()
            .map(|slot| {
                if looks_like_color(value, hint) {
                    StyleProperty::MaskStopColor(*slot, stop, Color::Css(value.to_string()))
                } else {
                    StyleProperty::MaskStopPosition(*slot, stop, parse_dimension(value))
                }
            })
            .collect(),
    )
}

/// The size families: one prefix, one property, a `Dimension` value.
pub(super) fn sizing(prefix: &str, value: &str) -> Option<Vec<StyleProperty>> {
    let d = parse_dimension(value);
    let property = match prefix {
        "w" => StyleProperty::Width(d),
        "h" => StyleProperty::Height(d),
        "min-w" => StyleProperty::MinWidth(d),
        "min-h" => StyleProperty::MinHeight(d),
        "max-w" => StyleProperty::MaxWidth(d),
        "max-h" => StyleProperty::MaxHeight(d),
        // Leave auto to Web: Yoga does not resolve the browser's automatic
        // minimum size, and auto isn't a CSS maximum size at all.
        "min-block" if d != Dimension::Auto => StyleProperty::MinBlockSize(d),
        "min-inline" if d != Dimension::Auto => StyleProperty::MinInlineSize(d),
        "max-block" if d != Dimension::Auto => StyleProperty::MaxBlockSize(d),
        "max-inline" if d != Dimension::Auto => StyleProperty::MaxInlineSize(d),
        "basis" => StyleProperty::FlexBasis(d),
        "top" => StyleProperty::InsetTop(d),
        "right" => StyleProperty::InsetRight(d),
        "bottom" => StyleProperty::InsetBottom(d),
        "left" => StyleProperty::InsetLeft(d),
        "start" | "inset-s" => StyleProperty::InsetInlineStart(d),
        "end" | "inset-e" => StyleProperty::InsetInlineEnd(d),
        "inset-bs" => StyleProperty::InsetBlockStart(d),
        "inset-be" => StyleProperty::InsetBlockEnd(d),
        "translate-x" => StyleProperty::TranslateX(d),
        "translate-y" => StyleProperty::TranslateY(d),
        "size" => {
            return Some(vec![
                StyleProperty::Width(d.clone()),
                StyleProperty::Height(d),
            ]);
        }
        // The axis forms are single logical properties, not pairs of
        // physical ones. Emitting `left`+`right` for `inset-x-*` rendered
        // identically and still disagreed with Tailwind on every candidate
        // -- and the disagreement is real, not cosmetic: `inset-inline`
        // follows writing direction and `left`/`right` don't.
        "inset-x" => return Some(vec![StyleProperty::InsetInline(d)]),
        "inset-y" => return Some(vec![StyleProperty::InsetBlock(d)]),
        "inset" => {
            // A value with a space in it is several values -- `inset` is a
            // shorthand and takes up to four. Splitting it across the four
            // longhands would give each edge the whole list.
            if value.contains(' ') {
                return Some(vec![StyleProperty::Arbitrary(
                    "inset".to_string(),
                    value.to_string(),
                )]);
            }
            return Some(vec![
                StyleProperty::InsetTop(d.clone()),
                StyleProperty::InsetRight(d.clone()),
                StyleProperty::InsetBottom(d.clone()),
                StyleProperty::InsetLeft(d),
            ]);
        }
        _ => return None,
    };
    Some(vec![property])
}

/// The padding/margin/gap families, which take a bare `Length`.
pub(super) fn spacing(prefix: &str, value: &str) -> Option<Vec<StyleProperty>> {
    // Margins take `auto`, so they are dimensions; paddings and gaps are
    // lengths. The split follows CSS rather than convenience.
    // A margin shorthand takes up to four values, so a value with a space
    // in it cannot be distributed across the longhands -- each edge would
    // get the whole list.
    if value.contains(' ') {
        let shorthand = match prefix {
            "m" => "margin",
            "mx" => "margin-inline",
            "my" => "margin-block",
            "p" => "padding",
            "px" => "padding-inline",
            "py" => "padding-block",
            _ => "",
        };
        if !shorthand.is_empty() {
            return Some(vec![StyleProperty::Arbitrary(
                shorthand.to_string(),
                value.to_string(),
            )]);
        }
    }

    let margin = |d: Dimension| -> Option<Vec<StyleProperty>> {
        Some(match prefix {
            "m" => vec![
                StyleProperty::MarginTop(d.clone()),
                StyleProperty::MarginRight(d.clone()),
                StyleProperty::MarginBottom(d.clone()),
                StyleProperty::MarginLeft(d),
            ],
            "mx" => vec![
                StyleProperty::MarginInlineStart(d.clone()),
                StyleProperty::MarginInlineEnd(d),
            ],
            "my" => vec![
                StyleProperty::MarginTop(d.clone()),
                StyleProperty::MarginBottom(d),
            ],
            "mt" => vec![StyleProperty::MarginTop(d)],
            "mr" => vec![StyleProperty::MarginRight(d)],
            "mb" => vec![StyleProperty::MarginBottom(d)],
            "ml" => vec![StyleProperty::MarginLeft(d)],
            "ms" => vec![StyleProperty::MarginInlineStart(d)],
            "me" => vec![StyleProperty::MarginInlineEnd(d)],
            "mbs" => vec![StyleProperty::MarginBlockStart(d)],
            "mbe" => vec![StyleProperty::MarginBlockEnd(d)],
            _ => return None,
        })
    };
    if let Some(properties) = margin(parse_dimension(value)) {
        return Some(properties);
    }

    // The CSS property each prefix writes, so that a value too odd for
    // `Length` can still be emitted as the declaration Tailwind emits.
    // `Length` has no text variant on purpose -- it is `Copy` and sits in
    // dozens of properties -- so the escape lives here instead.
    let css_property = match prefix {
        "p" => "padding",
        "px" => "padding-inline",
        "py" => "padding-block",
        "pt" => "padding-top",
        "pr" => "padding-right",
        "pb" => "padding-bottom",
        "pl" => "padding-left",
        "ps" => "padding-inline-start",
        "pe" => "padding-inline-end",
        "pbs" => "padding-block-start",
        "pbe" => "padding-block-end",
        "gap" => "gap",
        "gap-x" => "column-gap",
        "gap-y" => "row-gap",
        // `space-*`/`divide-*` style the element's *children* through a
        // separate rule, so there is no single declaration to fall back
        // to. They don't need one: they carry a `Dimension`, which has a
        // text case of its own, so the escape happens one level down.
        "space-x" => return Some(vec![StyleProperty::SpaceX(parse_dimension(value))]),
        "space-y" => return Some(vec![StyleProperty::SpaceY(parse_dimension(value))]),
        "divide-x" => return Some(vec![StyleProperty::DivideX(parse_dimension(value))]),
        "divide-y" => return Some(vec![StyleProperty::DivideY(parse_dimension(value))]),
        _ => return None,
    };

    let Some(l) = parse_length(value) else {
        return Some(vec![StyleProperty::Arbitrary(
            css_property.to_string(),
            value.to_string(),
        )]);
    };

    Some(match prefix {
        "p" => vec![
            StyleProperty::PaddingTop(l.clone()),
            StyleProperty::PaddingRight(l.clone()),
            StyleProperty::PaddingBottom(l.clone()),
            StyleProperty::PaddingLeft(l),
        ],
        "px" => {
            vec![
                StyleProperty::PaddingInlineStart(l.clone()),
                StyleProperty::PaddingInlineEnd(l),
            ]
        }
        "py" => vec![
            StyleProperty::PaddingTop(l.clone()),
            StyleProperty::PaddingBottom(l),
        ],
        "pt" => vec![StyleProperty::PaddingTop(l)],
        "pr" => vec![StyleProperty::PaddingRight(l)],
        "pb" => vec![StyleProperty::PaddingBottom(l)],
        "pl" => vec![StyleProperty::PaddingLeft(l)],
        "ps" => vec![StyleProperty::PaddingInlineStart(l)],
        "pe" => vec![StyleProperty::PaddingInlineEnd(l)],
        "pbs" => vec![StyleProperty::PaddingBlockStart(l)],
        "pbe" => vec![StyleProperty::PaddingBlockEnd(l)],
        "gap" => vec![StyleProperty::Gap(l)],
        "gap-x" => vec![StyleProperty::ColumnGap(l)],
        "gap-y" => vec![StyleProperty::RowGap(l)],
        "space-x" => vec![StyleProperty::SpaceX(Dimension::Length(l))],
        "space-y" => vec![StyleProperty::SpaceY(Dimension::Length(l))],
        "divide-x" => vec![StyleProperty::DivideX(Dimension::Length(l))],
        "divide-y" => vec![StyleProperty::DivideY(Dimension::Length(l))],
        _ => return None,
    })
}
