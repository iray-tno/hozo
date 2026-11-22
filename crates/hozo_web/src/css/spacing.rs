//! Border spacing and the `space-*` sibling margins.

use hozo_ir::{Axis, Color, Dimension, StyleProperty, Theme};

use super::color::resolve_theme_color;
use super::values::{border_style_keyword, dimension_value};

pub(super) fn is_border_spacing(prop: &StyleProperty) -> bool {
    matches!(
        prop,
        StyleProperty::BorderSpacingX(_) | StyleProperty::BorderSpacingY(_)
    )
}

/// `border-spacing` takes a horizontal and a vertical value in one
/// declaration, so the two axes compose. An unset axis is `0`, matching
/// what Tailwind writes for `border-spacing-x-*`.
pub(super) fn border_spacing_value(props: &[&StyleProperty], theme: &Theme) -> Option<String> {
    if props.is_empty() {
        return None;
    }
    let axis = |f: fn(&StyleProperty) -> Option<&Dimension>| {
        props
            .iter()
            .find_map(|p| f(p))
            .map(|d| dimension_value(d, theme))
            .unwrap_or_else(|| "0".to_string())
    };
    Some(format!(
        "{} {}",
        axis(|p| match p {
            StyleProperty::BorderSpacingX(d) => Some(d),
            _ => None,
        }),
        axis(|p| match p {
            StyleProperty::BorderSpacingY(d) => Some(d),
            _ => None,
        }),
    ))
}

/// The declarations `space-x-*`/`space-y-*` put on each non-last child.
/// Both sides are written, not just the gap-bearing one, because Tailwind
/// does the same -- its reverse-direction support needs the zero side to
/// be explicit.
pub(super) fn space_declarations(
    prop: &StyleProperty,
    theme: &Theme,
    reversed: [bool; 2],
) -> Vec<(&'static str, String)> {
    let color_var = |color: &Color| resolve_theme_color(color, theme);
    // The gap and the zero, in the order the two edges are written. Both
    // are always written, which is the whole reason a separate `-reverse`
    // utility can work at all.
    let split = |axis: Axis, l: &Dimension| {
        let gap = dimension_value(l, theme);
        if reversed[axis as usize] {
            (gap, "0".to_string())
        } else {
            ("0".to_string(), gap)
        }
    };
    match prop {
        StyleProperty::SpaceX(l) => {
            let (start, end) = split(Axis::X, l);
            vec![("margin-inline-start", start), ("margin-inline-end", end)]
        }
        StyleProperty::SpaceY(l) => {
            let (start, end) = split(Axis::Y, l);
            vec![("margin-top", start), ("margin-bottom", end)]
        }
        // Tailwind writes both edges, zeroing the leading one, so that
        // `divide-x-reverse` can flip which edge carries the border without
        // a different rule. Matching that shape keeps the output identical.
        // A divider's style is not here: Tailwind's reads
        // `--tw-border-style`, so a written style beats it wherever it
        // applies; see `divider_default_styles`.
        StyleProperty::DivideX(l) => {
            let (start, end) = split(Axis::X, l);
            vec![
                ("border-inline-start-width", start),
                ("border-inline-end-width", end),
            ]
        }
        StyleProperty::DivideY(l) => {
            let (start, end) = split(Axis::Y, l);
            vec![("border-top-width", start), ("border-bottom-width", end)]
        }
        // The flip itself writes nothing: it is read by the width above,
        // which is the only thing that knows how big the gap is.
        StyleProperty::SpaceReverse(_) | StyleProperty::DivideReverse(_) => Vec::new(),
        StyleProperty::DivideColor(c) => vec![("border-color", color_var(c))],
        StyleProperty::DivideStyle(s) => {
            let keyword = border_style_keyword(s).to_string();
            vec![
                ("border-top-style", keyword.clone()),
                ("border-right-style", keyword.clone()),
                ("border-bottom-style", keyword.clone()),
                ("border-left-style", keyword),
            ]
        }
        _ => Vec::new(),
    }
}
