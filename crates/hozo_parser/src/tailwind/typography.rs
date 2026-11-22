//! Leading, tracking, font weight and font size.

use hozo_ir::{FontWeight, Length};

/// Tailwind's named `--leading-*` scale: unitless multipliers of the
/// element's own font size, unlike the numeric `leading-<n>` scale which is
/// the spacing scale in pixels.
pub(super) fn parse_named_leading(suffix: &str) -> Option<f64> {
    Some(match suffix {
        "none" => 1.0,
        "tight" => 1.25,
        "snug" => 1.375,
        "normal" => 1.5,
        "relaxed" => 1.625,
        "loose" => 2.0,
        _ => return None,
    })
}

/// Tailwind's `--tracking-*` scale, in em.
pub(super) fn parse_tracking(suffix: &str) -> Option<f64> {
    Some(match suffix {
        "tighter" => -0.05,
        "tight" => -0.025,
        "normal" => 0.0,
        "wide" => 0.025,
        "wider" => 0.05,
        "widest" => 0.1,
        _ => return None,
    })
}

pub(super) fn parse_font_weight(token: &str) -> Option<FontWeight> {
    let (name, fallback) = match token {
        "font-thin" => ("thin", 100),
        "font-extralight" => ("extralight", 200),
        "font-light" => ("light", 300),
        "font-normal" => ("normal", 400),
        "font-medium" => ("medium", 500),
        "font-semibold" => ("semibold", 600),
        "font-bold" => ("bold", 700),
        "font-extrabold" => ("extrabold", 800),
        "font-black" => ("black", 900),
        _ => return None,
    };
    Some(FontWeight::Theme { name, fallback })
}

/// `(font-size, line-height)` in px. Tailwind's `text-*` utilities set
/// **both** -- its theme pairs each size with a `--text-*--line-height`,
/// and the generated CSS emits a `line-height` declaration alongside the
/// `font-size` one. Emitting only the font-size (as this did originally)
/// silently drops half of what the utility means.
///
/// Unlike the standalone named `leading-*` scale (a bare ratio against an
/// unknown font size, so unresolvable -- see `parse_utility`), these
/// resolve fine: the ratio's font size is the one this very utility sets,
/// so e.g. `text-xl` is 1.25rem x calc(1.75/1.25) = 1.75rem = 28px.
pub(super) fn parse_font_size(token: &str) -> Option<(Length, Length)> {
    let (size, line_height) = match token {
        "text-xs" => (12.0, 16.0),
        "text-sm" => (14.0, 20.0),
        "text-base" => (16.0, 24.0),
        "text-lg" => (18.0, 28.0),
        "text-xl" => (20.0, 28.0),
        "text-2xl" => (24.0, 32.0),
        "text-3xl" => (30.0, 36.0),
        "text-4xl" => (36.0, 40.0),
        // From `text-5xl` up Tailwind's line-height ratio is a flat 1.
        "text-5xl" => (48.0, 48.0),
        "text-6xl" => (60.0, 60.0),
        "text-7xl" => (72.0, 72.0),
        "text-8xl" => (96.0, 96.0),
        "text-9xl" => (128.0, 128.0),
        _ => return None,
    };
    Some((Length::Px(size), Length::Px(line_height)))
}
