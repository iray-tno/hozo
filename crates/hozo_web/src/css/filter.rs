//! Filter and backdrop-filter functions, each in its fixed slot.

use hozo_ir::{FilterFunction, StyleProperty, Theme};

use super::shadow::repaint_shadow;

/// The `filter`/`backdrop-filter` chain, in the same order as its registers.
///
/// Sorted by the function rather than by the order the utilities were
/// written, because filter functions don't commute -- `grayscale invert`
/// and `invert grayscale` render differently -- and Tailwind's own order is
/// fixed by the order its registers appear in the value. A slot cleared by
/// a `-none` utility contributes an empty register there and so nothing
/// here.
pub(super) fn filter_value(
    props: &[&StyleProperty],
    backdrop: bool,
    theme: &Theme,
) -> Option<String> {
    if !backdrop {
        let last_raw = props
            .iter()
            .rposition(|p| matches!(p, StyleProperty::FilterRaw(_)));
        let last_slots = props
            .iter()
            .rposition(|p| matches!(p, StyleProperty::Filter(..)));
        if last_raw > last_slots {
            return props.iter().rev().find_map(|p| match p {
                StyleProperty::FilterRaw(value) => Some(value.clone()),
                _ => None,
            });
        }
    }
    let mut functions: Vec<(FilterFunction, String)> = Vec::new();
    // The colour `drop-shadow-<colour>` set, if a second utility set one.
    // Only for the element's own filter: Tailwind has no
    // `backdrop-drop-shadow-<colour>`, so there is nothing to repaint on
    // that side.
    let drop_shadow_color = (!backdrop)
        .then(|| {
            props.iter().find_map(|p| match p {
                StyleProperty::DropShadowColor(c) => Some(c),
                _ => None,
            })
        })
        .flatten()
        .filter(|color| !color.is_initial());
    let drop_none = !backdrop
        && props.iter().any(|p| {
            matches!(p, StyleProperty::Filter(FilterFunction::DropShadow, value) if value.is_empty())
        });
    for prop in props {
        let (function, value) = match (prop, backdrop) {
            (StyleProperty::Filter(f, v), false) | (StyleProperty::BackdropFilter(f, v), true) => {
                (*f, v.as_str())
            }
            _ => continue,
        };
        // `filter-none` is the whole chain off, not one slot cleared.
        if function == FilterFunction::None {
            return Some("none".to_string());
        }
        // Tailwind's fixed order is size, then `drop-shadow-none`, then
        // colour, and a colour rule rebuilds the shadow from the size
        // register. So a colour keeps the size's shadow, `none` without one
        // turns it off, and `none` itself draws nothing.
        let value = if function == FilterFunction::DropShadow {
            if value.is_empty() || (drop_none && drop_shadow_color.is_none()) {
                String::new()
            } else {
                repaint_shadow(value, drop_shadow_color, theme)
            }
        } else {
            value.to_string()
        };
        functions.push((function, value));
    }
    if functions.is_empty() {
        return None;
    }
    // Backdrop opacity precedes saturation, unlike the enum's shared order.
    // Read the same slots used by conditional register emission; drop-shadow
    // is outside that register form and remains the final own-filter function.
    functions.sort_by_key(|(function, _)| filter_slot(*function, backdrop).unwrap_or(usize::MAX));
    let chain: Vec<&str> = functions
        .iter()
        .map(|(_, v)| v.as_str())
        .filter(|v| !v.is_empty())
        .collect();
    // Every slot cleared still leaves a declaration. Tailwind's is a chain
    // of empty registers, which computes to `none`; a literal empty value
    // would be an invalid declaration and leave an earlier filter standing
    // (`md:drop-shadow-none drop-shadow-lg` at md).
    Some(if chain.is_empty() {
        "none".to_string()
    } else {
        chain.join(" ")
    })
}

pub(super) fn is_filter(prop: &StyleProperty) -> bool {
    matches!(
        prop,
        StyleProperty::Filter(..)
            | StyleProperty::FilterRaw(..)
            | StyleProperty::BackdropFilter(..)
            // Partitioned with the chain because it is composed into one
            // of its functions rather than emitted: `drop-shadow-blue-500`
            // is a colour for whatever `drop-shadow-lg` drew.
            | StyleProperty::DropShadowColor(_)
    )
}

/// A filter function's place in Tailwind's `filter`/`backdrop-filter` value.
pub(super) fn filter_slot(function: FilterFunction, backdrop: bool) -> Option<usize> {
    use FilterFunction::*;
    Some(match (function, backdrop) {
        (Blur, _) => 0,
        (Brightness, _) => 1,
        (Contrast, _) => 2,
        (Grayscale, _) => 3,
        (HueRotate, _) => 4,
        (Invert, _) => 5,
        (Saturate, false) => 6,
        (Sepia, false) => 7,
        (Opacity, true) => 6,
        (Saturate, true) => 7,
        (Sepia, true) => 8,
        (Opacity, false) | (DropShadow | None, _) => return Option::None,
    })
}
