//! React Native value literals: numbers from lengths and radii, keyword
//! strings, and the quoted JavaScript string every text value travels as.

use super::*;

pub(super) fn radius_number(radius: &Radius, theme: &Theme) -> Option<String> {
    Some(match radius {
        Radius::Length(l) => number(l, theme),
        Radius::Percent(pct) => format!("'{pct}%'"),
        Radius::Scale { name, fallback_px } => {
            number(&Length::Px(theme.radius_or(name, *fallback_px)), theme)
        }
        // RN has no infinity. Any radius past half the box's shorter side
        // already renders as a pill, so a large finite value is the
        // standard way to express this -- the approximation is forced here,
        // unlike on Web.
        Radius::Full => "9999".to_string(),
        Radius::Theme(name) => number(&Length::Px(theme.radius(name)?), theme),
    })
}

/// A radius style, or none when it names a token the theme does not
/// define -- the same answer the Web gives, which emits nothing for it.
pub(super) fn radius_pair(
    key: &'static str,
    radius: &Radius,
    theme: &Theme,
) -> Vec<(&'static str, String)> {
    radius_number(radius, theme)
        .map(|value| vec![(key, value)])
        .unwrap_or_default()
}

/// React Native's `aspectRatio` is a number, where CSS writes a ratio.
pub(super) fn aspect_number(value: &str) -> Option<String> {
    let (w, h) = value.split_once(" / ")?;
    let (w, h) = (w.parse::<f64>().ok()?, h.parse::<f64>().ok()?);
    Some(format!("{}", w / h))
}

/// A length as a React Native style number, against the project's spacing
/// scale. See `Length::Spacing`.
pub(super) fn number(length: &Length, theme: &Theme) -> String {
    format!("{}", length.px(theme))
}

pub(super) fn dimension_value(dim: &Dimension, theme: &Theme) -> String {
    match dim {
        Dimension::Length(length) => number(length, theme),
        Dimension::Percent(pct) => format!("'{pct}%'"),
        Dimension::Auto => "'auto'".to_string(),
        // Refused upstream by `StyleProperty::unsupported_on_native`, which
        // fails the build. Nothing is emitted here so a build that swallowed
        // that error still can't ship a value RN would reject.
        // Also refused upstream: an intrinsic size or a chrome-aware
        // viewport unit has no runtime equivalent to read on this platform.
        Dimension::ViewportWidth(_) | Dimension::ViewportHeight(_) | Dimension::Css(_) => {
            String::new()
        }
    }
}

pub(super) fn justify_literal(justify: &Justify) -> String {
    match justify {
        Justify::Start => "'flex-start'",
        Justify::Center => "'center'",
        Justify::End => "'flex-end'",
        Justify::Between => "'space-between'",
        Justify::Around => "'space-around'",
        Justify::Evenly => "'space-evenly'",
        Justify::Stretch => "'stretch'",
        Justify::Baseline => "'baseline'",
        // Refused upstream: none of these are in RN's alignment unions.
        Justify::Css(_) => "",
    }
    .to_string()
}

pub(super) fn border_style_literal(style: &BorderStyle) -> String {
    match style {
        // A width's implied style is written nowhere (see the per-side arm
        // below); here it is only for completeness.
        BorderStyle::Solid | BorderStyle::Default => "'solid'",
        BorderStyle::Dashed => "'dashed'",
        BorderStyle::Dotted => "'dotted'",
        // Refused upstream by `unsupported_on_native`; nothing valid to emit.
        BorderStyle::Double | BorderStyle::Hidden => "",
        // RN has no 'none' border style; a zero width is how you hide one.
        BorderStyle::None => "'solid'",
    }
    .to_string()
}

/// Whether a property styles the element's *children* rather than the
/// element itself. These don't belong in the element's own style entry; see
/// `child_property_and_value`.
/// A JavaScript string literal for `value`.
///
/// Not `js_string(value)`: a CSS value can contain the quote
/// character, and a font stack routinely does
/// (`-apple-system, 'Segoe UI', ...`). Wrapping that unescaped produced a
/// generated file that didn't parse -- 76 of them, found by type-checking
/// the output against React Native rather than by anything reading it.
pub fn js_string(value: &str) -> String {
    // A line terminator ends a single-quoted literal, and a theme value can
    // carry one: Tailwind writes its default `--font-sans` across lines.
    let escaped = value
        .replace('\\', "\\\\")
        .replace('\'', "\\'")
        .replace('\n', "\\n")
        .replace('\r', "\\r")
        .replace('\u{2028}', "\\u2028")
        .replace('\u{2029}', "\\u2029");
    format!("'{escaped}'")
}
