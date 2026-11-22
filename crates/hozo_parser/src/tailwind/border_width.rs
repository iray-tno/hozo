//! Border widths and styles on all sides or one.

use hozo_ir::{BorderStyle, Length, StyleProperty};

/// `border`, `border-<n>`, `border-{t,r,b,l}`, `border-{t,r,b,l}-<n>`.
///
/// Every border-width utility also emits `BorderStyle::Default`, mirroring
/// Tailwind (which pairs each width with a style read from a register) --
/// without it CSS's default `border-style: none` means the width renders
/// nothing. A written style (`border-dashed`) beats it wherever it applies.
///
/// Ordered after the color check would be ambiguous (`border-2` vs
/// `border-red-500`), so width parsing is tried first and only falls
/// through to color when the suffix isn't numeric.
pub(super) fn expand_border_width(token: &str) -> Option<Vec<StyleProperty>> {
    let rest = token.strip_prefix("border")?;

    // Bare `border` == 1px on every side.
    if rest.is_empty() {
        return Some(all_sides_border(Length::Px(1.0)));
    }

    let rest = rest.strip_prefix('-')?;
    let (side, width) = match rest.split_once('-') {
        // e.g. `border-t-2`
        Some((side, width)) if matches!(side, "t" | "r" | "b" | "l") => {
            (Some(side), parse_border_width_px(width)?)
        }
        // e.g. `border-t` -- a side with no width means 1px.
        None if matches!(rest, "t" | "r" | "b" | "l") => (Some(rest), Length::Px(1.0)),
        // e.g. `border-2`. Anything non-numeric here (`border-red-500`)
        // isn't a width at all, so this bails out and lets the color path
        // in `parse_utility` handle it.
        _ => (None, parse_border_width_px(rest)?),
    };

    // The style is scoped to the same side as the width. Setting it on all
    // four would make the other sides fall back to `border-width: medium`
    // and render, turning `border-t` into a full box.
    Some(match side {
        Some("t") => vec![
            StyleProperty::BorderTopWidth(width),
            StyleProperty::BorderTopStyle(BorderStyle::Default),
        ],
        Some("r") => vec![
            StyleProperty::BorderRightWidth(width),
            StyleProperty::BorderRightStyle(BorderStyle::Default),
        ],
        Some("b") => vec![
            StyleProperty::BorderBottomWidth(width),
            StyleProperty::BorderBottomStyle(BorderStyle::Default),
        ],
        Some("l") => vec![
            StyleProperty::BorderLeftWidth(width),
            StyleProperty::BorderLeftStyle(BorderStyle::Default),
        ],
        _ => all_sides_border(width),
    })
}

pub(super) fn all_sides_border(width: Length) -> Vec<StyleProperty> {
    vec![
        StyleProperty::BorderTopWidth(width.clone()),
        StyleProperty::BorderRightWidth(width.clone()),
        StyleProperty::BorderBottomWidth(width.clone()),
        StyleProperty::BorderLeftWidth(width),
        StyleProperty::BorderTopStyle(BorderStyle::Default),
        StyleProperty::BorderRightStyle(BorderStyle::Default),
        StyleProperty::BorderBottomStyle(BorderStyle::Default),
        StyleProperty::BorderLeftStyle(BorderStyle::Default),
    ]
}

pub(super) fn all_sides_border_style(style: BorderStyle) -> Vec<StyleProperty> {
    vec![
        StyleProperty::BorderTopStyle(style),
        StyleProperty::BorderRightStyle(style),
        StyleProperty::BorderBottomStyle(style),
        StyleProperty::BorderLeftStyle(style),
    ]
}

/// Border widths are plain pixel counts, not multiples of the spacing
/// scale -- `border-2` is 2px, not 8px.
pub(super) fn parse_border_width_px(suffix: &str) -> Option<Length> {
    suffix.parse::<f64>().ok().map(Length::Px)
}
