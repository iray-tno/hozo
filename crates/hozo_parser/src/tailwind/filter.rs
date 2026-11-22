//! Shadows, blur, filter functions and drop shadows.

use hozo_ir::{FilterFunction, StyleProperty};

use super::color_family::register_color;

/// Tailwind's `--shadow-*` scale, verbatim. Emitted as a composed CSS
/// string because React Native's `boxShadow` accepts one too, so both
/// backends can carry the same text.
///
/// Tailwind's own `box-shadow` declaration also splices in its ring and
/// inset-ring registers, but those are `0 0 #0000` (fully transparent, a
/// no-op) unless a `ring-*` utility is present -- which Hozo doesn't
/// support -- so only the shadow itself is emitted.
pub(super) fn parse_shadow(token: &str) -> Option<&'static str> {
    Some(match token {
        "shadow-2xs" => "0 1px rgb(0 0 0 / 0.05)",
        "shadow-xs" => "0 1px 2px 0 rgb(0 0 0 / 0.05)",
        "shadow-sm" | "shadow" => "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
        "shadow-md" => "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
        "shadow-lg" => "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
        "shadow-xl" => "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
        "shadow-2xl" => "0 25px 50px -12px rgb(0 0 0 / 0.25)",
        "shadow-inner" => "inset 0 2px 4px 0 rgb(0 0 0 / 0.05)",
        "shadow-none" => "none",
        _ => return None,
    })
}

pub(super) fn parse_blur(token: &str) -> Option<f64> {
    Some(match token {
        "blur-xs" => 4.0,
        "blur-sm" | "blur" => 8.0,
        "blur-md" => 12.0,
        "blur-lg" => 16.0,
        "blur-xl" => 24.0,
        "blur-2xl" => 40.0,
        "blur-3xl" => 64.0,
        _ => return None,
    })
}

/// One function of a `filter` chain, from the utility that names it.
///
/// `Some((function, ""))` is the `-none` form, which clears that function's
/// slot rather than setting it -- Tailwind writes `--tw-blur: ;`, an empty
/// register, so the slot contributes nothing to the composed value.
pub(super) fn parse_filter_function(token: &str) -> Option<(FilterFunction, String)> {
    if token == "filter-none" {
        return Some((FilterFunction::None, String::new()));
    }
    if let Some(px) = parse_blur(token) {
        return Some((FilterFunction::Blur, format!("blur({px}px)")));
    }
    if token == "blur-none" {
        return Some((FilterFunction::Blur, String::new()));
    }

    // The percentage-valued functions. Each has a bare form meaning 100%
    // (`grayscale` is a full conversion) and a numbered form.
    const PERCENT: &[(&str, FilterFunction)] = &[
        ("brightness", FilterFunction::Brightness),
        ("contrast", FilterFunction::Contrast),
        ("grayscale", FilterFunction::Grayscale),
        ("invert", FilterFunction::Invert),
        ("saturate", FilterFunction::Saturate),
        ("sepia", FilterFunction::Sepia),
        ("opacity", FilterFunction::Opacity),
    ];
    for (name, function) in PERCENT {
        if token == *name {
            return Some((*function, format!("{name}(100%)")));
        }
        if let Some(rest) = token.strip_prefix(&format!("{name}-")) {
            if rest == "none" {
                return Some((*function, String::new()));
            }
            let pct: f64 = rest.parse().ok()?;
            return Some((*function, format!("{name}({pct}%)")));
        }
    }
    // Tailwind's drop-shadow scale. The colour is a register there
    // (`--tw-drop-shadow-color`) with these as its defaults; Hozo resolves
    // the composition, so the default is written in.
    if let Some(rest) = token.strip_prefix("drop-shadow") {
        let shadow = match rest.trim_start_matches('-') {
            "xs" => "drop-shadow(0 1px 1px rgb(0 0 0 / 0.05))",
            "sm" => "drop-shadow(0 1px 2px rgb(0 0 0 / 0.15))",
            "md" => "drop-shadow(0 3px 3px rgb(0 0 0 / 0.12))",
            "lg" => "drop-shadow(0 4px 4px rgb(0 0 0 / 0.15))",
            "xl" => "drop-shadow(0 9px 7px rgb(0 0 0 / 0.1))",
            "2xl" => "drop-shadow(0 25px 25px rgb(0 0 0 / 0.15))",
            "none" => "",
            _ => return None,
        };
        return Some((FilterFunction::DropShadow, shadow.to_string()));
    }
    if token == "hue-rotate" {
        return Some((FilterFunction::HueRotate, "hue-rotate(0deg)".to_string()));
    }
    if let Some(rest) = token.strip_prefix("hue-rotate-") {
        let degrees: f64 = rest.parse().ok()?;
        return Some((
            FilterFunction::HueRotate,
            format!("hue-rotate({degrees}deg)"),
        ));
    }
    None
}

/// `filter-*` and `backdrop-*`, which are the same chain applied to the
/// element and to what's behind it.
pub(super) fn expand_filter(token: &str) -> Option<Vec<StyleProperty>> {
    if let Some(rest) = token.strip_prefix("backdrop-") {
        // `backdrop-filter-none` reaches here as `filter-none`.
        let (function, value) = parse_filter_function(rest)?;
        return Some(vec![StyleProperty::BackdropFilter(function, value)]);
    }
    if let Some(props) = drop_shadow_color(token) {
        return Some(props);
    }
    let (function, value) = parse_filter_function(token)?;
    // Bare `opacity-*` is the CSS property, not a filter function -- only
    // its backdrop form exists as a filter.
    if function == FilterFunction::Opacity {
        return None;
    }
    Some(vec![StyleProperty::Filter(function, value)])
}

/// `drop-shadow-<colour>`, which is not a drop shadow.
///
/// The same split `shadow-*` and `inset-shadow-*` already make: a suffix
/// the size table declined is a colour for the shadow the *other* utility
/// draws. Written here rather than inside `parse_filter_function` because
/// that returns a filter function and this is not one -- and because there
/// is no `backdrop-drop-shadow-<colour>` for it to be reached through.
///
/// Only after the sizes, so `drop-shadow-lg` stays a size. And only for a
/// name that is not a filter function at all, so nothing else in the chain
/// is read as a colour by accident.
pub(super) fn drop_shadow_color(token: &str) -> Option<Vec<StyleProperty>> {
    let suffix = token.strip_prefix("drop-shadow-")?;
    if suffix.is_empty() || parse_filter_function(token).is_some() {
        return None;
    }
    Some(vec![StyleProperty::DropShadowColor(register_color(suffix))])
}
