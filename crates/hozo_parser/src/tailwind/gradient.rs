//! Background gradients, mask gradients and masks.

use hozo_ir::{
    Angle, Color, Dimension, GradientKind, GradientStop, MaskSlot, MaskStop, StyleProperty,
};

use super::spacing::parse_spacing_suffix;
use super::transform::signed;

/// The gradient half of `mask-*`: stops, angles, and the radial shaping
/// utilities.
///
/// `mask-x-*`/`mask-y-*` are the only ones that produce two properties --
/// they set both edges of an axis, exactly as Tailwind does.
pub(super) fn expand_mask_gradient(token: &str) -> Option<Vec<StyleProperty>> {
    let (negative, token) = match token.strip_prefix('-') {
        Some(rest) => (true, rest),
        None => (false, token),
    };
    let rest = token.strip_prefix("mask-")?;

    // Radial shaping. These paint nothing on their own; they only change
    // how a radial gradient from some other utility is drawn.
    if let Some(position) = rest.strip_prefix("radial-at-") {
        return radial_position(position).map(|p| vec![StyleProperty::MaskRadialPosition(p)]);
    }
    match rest {
        "circle" => return Some(vec![StyleProperty::MaskRadialShape("circle")]),
        "ellipse" => return Some(vec![StyleProperty::MaskRadialShape("ellipse")]),
        "add" => return Some(vec![StyleProperty::MaskComposite("add")]),
        "subtract" => return Some(vec![StyleProperty::MaskComposite("subtract")]),
        "intersect" => return Some(vec![StyleProperty::MaskComposite("intersect")]),
        "exclude" => return Some(vec![StyleProperty::MaskComposite("exclude")]),
        _ => {}
    }
    if let Some(size) = rest.strip_prefix("radial-") {
        if matches!(
            size,
            "closest-side" | "closest-corner" | "farthest-side" | "farthest-corner"
        ) {
            return Some(vec![StyleProperty::MaskRadialSize(
                leak_size(size).to_string(),
            )]);
        }
    }

    let (axis, tail) = rest.split_once('-')?;
    let slots = mask_slots(axis)?;

    // `mask-linear-45` / `mask-conic-45`: the whole tail is an angle.
    if let Ok(degrees) = tail.parse::<f64>() {
        if matches!(axis, "linear" | "conic") {
            return Some(vec![StyleProperty::MaskSlotArgument(
                slots[0],
                Angle::Deg(signed(degrees, negative)),
            )]);
        }
        return None;
    }

    let (stop, value) = match tail.split_once('-') {
        Some(("from", value)) => (MaskStop::From, value),
        Some(("to", value)) => (MaskStop::To, value),
        _ => return None,
    };

    // A stop is either a position on the spacing scale / a percentage, or
    // a colour. Positions are tried first because a bare number is never a
    // colour token.
    let property: Box<dyn Fn(MaskSlot) -> StyleProperty> = if let Some(pct) =
        value.strip_suffix('%').and_then(|n| n.parse::<f64>().ok())
    {
        Box::new(move |slot| StyleProperty::MaskStopPosition(slot, stop, Dimension::Percent(pct)))
    } else if let Some(length) = parse_spacing_suffix(value) {
        Box::new(move |slot| {
            StyleProperty::MaskStopPosition(slot, stop, Dimension::Length(length.clone()))
        })
    } else {
        let token = value.to_string();
        Box::new(move |slot| StyleProperty::MaskStopColor(slot, stop, Color::Token(token.clone())))
    };
    Some(slots.iter().map(|slot| property(*slot)).collect())
}

/// Background gradients: the `bg-linear-*`/`bg-radial*`/`bg-conic-*`
/// constructors and the `from-*`/`via-*`/`to-*` stops that fill them.
///
/// The family is split across four utility names because that is how
/// Tailwind splits it -- a constructor paints nothing without stops and
/// stops paint nothing without a constructor -- so each contributes its
/// own property and `hozo_web::css::gradient_value` joins them. Which
/// also means a one-utility conformance check can say nothing about any
/// of it: every one of these 971 catalogue entries is composition-only.
pub(super) fn expand_gradient(token: &str) -> Option<Vec<StyleProperty>> {
    if token == "bg-none" {
        return Some(vec![StyleProperty::BackgroundImageNone]);
    }
    if let Some(props) = gradient_stop(token) {
        return Some(props);
    }
    // The leading `-` never reaches here: `expand_negatable` strips it for
    // every family and flips the result, which is where a gradient's angle
    // is negated too. See `negated`.
    let negative = false;
    // The interpolation space is a *modifier* on the constructor, not a
    // utility of its own: `bg-linear-to-r/srgb`.
    let (name, modifier) = match token.split_once('/') {
        Some((name, modifier)) => (name, Some(modifier)),
        None => (token, None),
    };
    // Tailwind's default, and not sRGB: v4 interpolates gradients in
    // Oklab, which is why a red-to-blue ramp doesn't go through grey.
    let interpolation = match modifier {
        None => "in oklab".to_string(),
        Some(m) => interpolation_space(m)?,
    };

    let (kind, position) = if let Some(rest) = name.strip_prefix("bg-linear-") {
        (GradientKind::Linear, linear_position(rest, negative)?)
    } else if let Some(rest) = name.strip_prefix("bg-gradient-") {
        // v3's spelling of the same utility, still generated by v4.
        (GradientKind::Linear, linear_position(rest, negative)?)
    } else if name == "bg-radial" && !negative {
        (GradientKind::Radial, String::new())
    } else if let Some(rest) = name.strip_prefix("bg-conic-") {
        (
            GradientKind::Conic,
            format!("from {}deg", signed(rest.parse::<f64>().ok()?, negative)),
        )
    } else if name == "bg-conic" && !negative {
        (GradientKind::Conic, String::new())
    } else {
        return None;
    };

    let prelude = if position.is_empty() {
        interpolation
    } else {
        format!("{position} {interpolation}")
    };
    Some(vec![StyleProperty::Gradient(kind, prelude)])
}

/// `to-r`, `to-tl`, or a bare angle in degrees.
///
/// A side cannot be negated -- there is no `-bg-linear-to-r` in Tailwind
/// and no sensible reading of one -- so the negative form declines here
/// rather than being read as the positive one.
pub(super) fn linear_position(rest: &str, negative: bool) -> Option<String> {
    if let Some(side) = rest.strip_prefix("to-") {
        if negative {
            return None;
        }
        return Some(
            match side {
                "t" => "to top",
                "tr" => "to top right",
                "r" => "to right",
                "br" => "to bottom right",
                "b" => "to bottom",
                "bl" => "to bottom left",
                "l" => "to left",
                "tl" => "to top left",
                _ => return None,
            }
            .to_string(),
        );
    }
    Some(format!(
        "{}deg",
        signed(rest.parse::<f64>().ok()?, negative)
    ))
}

/// The `/…` modifier, as the CSS interpolation clause it names.
///
/// Two shapes in one list: a colour space, and a hue-interpolation method
/// that implies one. `bg-linear-to-r/longer` is `in oklch longer hue` --
/// the space comes along with the method, because interpolating hue the
/// long way round is only defined in a polar space.
pub(super) fn interpolation_space(modifier: &str) -> Option<String> {
    Some(match modifier {
        "srgb" | "srgb-linear" | "hsl" | "hwb" | "lab" | "lch" | "oklab" | "oklch"
        | "display-p3" | "xyz" | "xyz-d50" | "xyz-d65" => format!("in {modifier}"),
        "shorter" | "longer" | "increasing" | "decreasing" => {
            format!("in oklch {modifier} hue")
        }
        _ => return None,
    })
}

/// `from-*` / `via-*` / `to-*`: a colour or a position on one stop.
pub(super) fn gradient_stop(token: &str) -> Option<Vec<StyleProperty>> {
    let (stop, rest) = if let Some(rest) = token.strip_prefix("from-") {
        (GradientStop::From, rest)
    } else if let Some(rest) = token.strip_prefix("via-") {
        (GradientStop::Via, rest)
    } else {
        let rest = token.strip_prefix("to-")?;
        (GradientStop::To, rest)
    };
    // A percentage is a position and everything else is a colour, which is
    // the same polarity the mask stops use -- `from-nonsense` is a
    // palette token that resolves to nothing, not a stop at `nonsense`.
    if let Some(percent) = rest.strip_suffix('%').and_then(|n| n.parse::<f64>().ok()) {
        return Some(vec![StyleProperty::GradientStopPosition(
            stop,
            Dimension::Percent(percent),
        )]);
    }
    // `via-none` is the exception, and it is not a colour called `none`:
    // Tailwind sets `--tw-gradient-via-stops: initial`, which takes the
    // middle stop back out of the list. Reading it as a palette token gave
    // a stop painted `var(--hozo-color-none)`, which the theme has never
    // heard of.
    if stop == GradientStop::Via && rest == "none" {
        return Some(vec![StyleProperty::GradientStopColor(
            stop,
            Color::Keyword("initial"),
        )]);
    }
    Some(vec![StyleProperty::GradientStopColor(
        stop,
        Color::Token(rest.to_string()),
    )])
}

/// Tailwind's axis abbreviations. `x`/`y` name two slots each.
pub(crate) fn mask_slots(axis: &str) -> Option<Vec<MaskSlot>> {
    Some(match axis {
        "t" => vec![MaskSlot::Top],
        "r" => vec![MaskSlot::Right],
        "b" => vec![MaskSlot::Bottom],
        "l" => vec![MaskSlot::Left],
        "x" => vec![MaskSlot::Left, MaskSlot::Right],
        "y" => vec![MaskSlot::Bottom, MaskSlot::Top],
        "linear" => vec![MaskSlot::Linear],
        "radial" => vec![MaskSlot::Radial],
        "conic" => vec![MaskSlot::Conic],
        _ => return None,
    })
}

pub(super) fn radial_position(suffix: &str) -> Option<&'static str> {
    Some(match suffix {
        "center" => "center",
        "top" => "top",
        "bottom" => "bottom",
        "left" => "left",
        "right" => "right",
        // As written, not reordered to x-then-y. CSS accepts either order
        // for a two-keyword position and renders them identically, so the
        // swap was invisible until the composed denominator compared the
        // text: Tailwind emits `bottom left` for `mask-radial-at-bottom-left`
        // and reordering it made two identical masks read as a mismatch.
        "top-left" => "top left",
        "top-right" => "top right",
        "bottom-left" => "bottom left",
        "bottom-right" => "bottom right",
        _ => return None,
    })
}

pub(super) fn leak_size(size: &str) -> &'static str {
    match size {
        "closest-side" => "closest-side",
        "closest-corner" => "closest-corner",
        "farthest-side" => "farthest-side",
        _ => "farthest-corner",
    }
}

/// The `mask-*` utilities that are one property set to one keyword.
///
/// Deliberately a table rather than nested prefix matching: the family has
/// no structure to exploit -- `mask-center` is a position, `mask-cover` a
/// size, `mask-alpha` a mode -- so anything cleverer would just be a table
/// in disguise with more room for the wrong arm to win.
///
/// The gradient half of `mask-*` (`mask-t-from-*`, `mask-linear-*`, ~5,900
/// candidates) is not here: those compose into a slot-based `mask-image`
/// list and are a separate piece of work.
pub(super) fn expand_mask(token: &str) -> Option<StyleProperty> {
    Some(match token {
        "mask-none" => StyleProperty::MaskImageNone,
        "mask-clip-border" => StyleProperty::MaskClip("border-box"),
        "mask-clip-content" => StyleProperty::MaskClip("content-box"),
        "mask-clip-fill" => StyleProperty::MaskClip("fill-box"),
        "mask-clip-padding" => StyleProperty::MaskClip("padding-box"),
        "mask-clip-stroke" => StyleProperty::MaskClip("stroke-box"),
        "mask-clip-view" => StyleProperty::MaskClip("view-box"),
        "mask-no-clip" => StyleProperty::MaskClip("no-clip"),
        "mask-origin-border" => StyleProperty::MaskOrigin("border-box"),
        "mask-origin-content" => StyleProperty::MaskOrigin("content-box"),
        "mask-origin-fill" => StyleProperty::MaskOrigin("fill-box"),
        "mask-origin-padding" => StyleProperty::MaskOrigin("padding-box"),
        "mask-origin-stroke" => StyleProperty::MaskOrigin("stroke-box"),
        "mask-origin-view" => StyleProperty::MaskOrigin("view-box"),
        "mask-alpha" => StyleProperty::MaskMode("alpha"),
        "mask-luminance" => StyleProperty::MaskMode("luminance"),
        "mask-match" => StyleProperty::MaskMode("match-source"),
        "mask-type-alpha" => StyleProperty::MaskType("alpha"),
        "mask-type-luminance" => StyleProperty::MaskType("luminance"),
        "mask-auto" => StyleProperty::MaskSize("auto"),
        "mask-contain" => StyleProperty::MaskSize("contain"),
        "mask-cover" => StyleProperty::MaskSize("cover"),
        "mask-center" => StyleProperty::MaskPosition("center"),
        "mask-top" => StyleProperty::MaskPosition("top"),
        "mask-bottom" => StyleProperty::MaskPosition("bottom"),
        "mask-left" => StyleProperty::MaskPosition("left"),
        "mask-right" => StyleProperty::MaskPosition("right"),
        "mask-top-left" => StyleProperty::MaskPosition("left top"),
        "mask-top-right" => StyleProperty::MaskPosition("right top"),
        "mask-bottom-left" => StyleProperty::MaskPosition("left bottom"),
        "mask-bottom-right" => StyleProperty::MaskPosition("right bottom"),
        "mask-repeat" => StyleProperty::MaskRepeat("repeat"),
        "mask-no-repeat" => StyleProperty::MaskRepeat("no-repeat"),
        "mask-repeat-x" => StyleProperty::MaskRepeat("repeat-x"),
        "mask-repeat-y" => StyleProperty::MaskRepeat("repeat-y"),
        "mask-repeat-round" => StyleProperty::MaskRepeat("round"),
        "mask-repeat-space" => StyleProperty::MaskRepeat("space"),
        _ => return None,
    })
}
