//! Scroll snap and scrollbar colors.

use hozo_ir::{Color, StyleProperty, Theme};

use super::color::resolve_theme_color;

pub(super) fn is_scroll_snap(prop: &StyleProperty) -> bool {
    matches!(
        prop,
        StyleProperty::ScrollSnapType(_) | StyleProperty::ScrollSnapStrictness(_)
    )
}

/// The `scroll-snap-type` an axis and a strictness make between them.
///
/// `proximity` is the strictness Tailwind declares as the register's
/// initial value, so an axis on its own still means something -- and a
/// strictness on its own means nothing, which is why the axis is what this
/// requires.
pub(super) fn scroll_snap_value(props: &[&StyleProperty]) -> Option<String> {
    let axis = props.iter().find_map(|p| match p {
        StyleProperty::ScrollSnapType(axis) => Some(*axis),
        _ => None,
    })?;
    if axis == "none" {
        return Some("none".to_string());
    }
    let strictness = props
        .iter()
        .find_map(|p| match p {
            StyleProperty::ScrollSnapStrictness(s) => Some(*s),
            _ => None,
        })
        .unwrap_or("proximity");
    Some(format!("{axis} {strictness}"))
}

pub(super) fn is_scrollbar_color(prop: &StyleProperty) -> bool {
    matches!(
        prop,
        StyleProperty::ScrollbarThumbColor(_) | StyleProperty::ScrollbarTrackColor(_)
    )
}

/// `scrollbar-color` takes both halves at once, so `scrollbar-thumb-*` and
/// `scrollbar-track-*` compose into one declaration. Tailwind's registers
/// default to `#0000`, so an unset half is transparent rather than the UA
/// default -- which is why writing only one still names both.
pub(super) fn scrollbar_color_value(props: &[&StyleProperty], theme: &Theme) -> Option<String> {
    let find = |f: fn(&StyleProperty) -> Option<&Color>| {
        props
            .iter()
            .find_map(|p| f(p))
            .map(|color| resolve_theme_color(color, theme))
            .unwrap_or_else(|| "#0000".to_string())
    };
    if props.is_empty() {
        return None;
    }
    Some(format!(
        "{} {}",
        find(|p| match p {
            StyleProperty::ScrollbarThumbColor(c) => Some(c),
            _ => None,
        }),
        find(|p| match p {
            StyleProperty::ScrollbarTrackColor(c) => Some(c),
            _ => None,
        }),
    ))
}
