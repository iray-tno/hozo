//! Box and text shadows as CSS values.

use hozo_ir::{Color, Length, StyleProperty, Theme};

use super::color::resolve_theme_color;
use super::shadow::repaint_shadow;
use super::values::length_px;

/// `text-shadow` and the colour utility that repaints it.
pub(super) fn is_text_shadow(prop: &StyleProperty) -> bool {
    matches!(
        prop,
        StyleProperty::TextShadow(_) | StyleProperty::TextShadowColor(_)
    )
}

/// The `text-shadow` a size and a colour make between them.
pub(super) fn text_shadow_value(props: &[&StyleProperty], theme: &Theme) -> Option<String> {
    let shadow = props.iter().find_map(|p| match p {
        StyleProperty::TextShadow(value) => Some(value.css()),
        _ => None,
    })?;
    // `text-shadow-none` is the property off, and there is nothing in it
    // to paint.
    if shadow == "none" {
        return Some(shadow.to_string());
    }
    let color = props
        .iter()
        .find_map(|p| match p {
            StyleProperty::TextShadowColor(c) => Some(c),
            _ => None,
        })
        .filter(|color| !color.is_initial());
    Some(repaint_shadow(shadow, color, theme))
}

pub(super) fn box_shadow_value(props: &[&StyleProperty], theme: &Theme) -> Option<String> {
    let find_length = |f: fn(&StyleProperty) -> Option<&Length>| props.iter().find_map(|p| f(p));
    // `shadow-initial` and its siblings *unset* the register, so the
    // layer keeps its own default. Found and then discarded rather than
    // never parsed, because it has to beat a `shadow-red-500` written
    // before it.
    let find_color = |f: fn(&StyleProperty) -> Option<&Color>| {
        props
            .iter()
            .find_map(|p| f(p))
            .filter(|color| !color.is_initial())
    };

    let ring = find_length(|p| match p {
        StyleProperty::RingWidth(l) => Some(l),
        _ => None,
    });
    let inset_ring = find_length(|p| match p {
        StyleProperty::InsetRingWidth(l) => Some(l),
        _ => None,
    });
    let ring_color = find_color(|p| match p {
        StyleProperty::RingColor(c) => Some(c),
        _ => None,
    });
    let inset_ring_color = find_color(|p| match p {
        StyleProperty::InsetRingColor(c) => Some(c),
        _ => None,
    });
    let shadow = props.iter().find_map(|p| match p {
        StyleProperty::BoxShadow(s) => Some(s.clone()),
        _ => None,
    });

    // Tailwind's default ring colour is `currentcolor`.
    let paint = |c: Option<&Color>| {
        c.map_or_else(
            || "currentcolor".to_string(),
            |color| resolve_theme_color(color, theme),
        )
    };

    let inset_shadow = props.iter().find_map(|p| match p {
        StyleProperty::InsetShadow(s) => Some(s.clone()),
        _ => None,
    });

    let ring_offset = find_length(|p| match p {
        StyleProperty::RingOffsetWidth(l) => Some(l),
        _ => None,
    });
    let ring_offset_color = find_color(|p| match p {
        StyleProperty::RingOffsetColor(c) => Some(c),
        _ => None,
    });
    let shadow_color = find_color(|p| match p {
        StyleProperty::ShadowColor(c) => Some(c),
        _ => None,
    });
    let inset_shadow_color = find_color(|p| match p {
        StyleProperty::InsetShadowColor(c) => Some(c),
        _ => None,
    });

    let mut layers: Vec<String> = Vec::new();
    // Innermost first, matching the order Tailwind splices its registers:
    // inset shadow, inset ring, ring offset, ring, outer shadow.
    if let Some(shadow) = inset_shadow {
        layers.push(repaint_shadow(&shadow, inset_shadow_color, theme));
    }
    if let Some(width) = inset_ring {
        layers.push(format!(
            "inset 0 0 0 {} {}",
            length_px(width, theme),
            paint(inset_ring_color)
        ));
    }
    // The offset is drawn *under* the ring, in the page's own colour, and
    // pushes the ring outwards by its own width. Tailwind's register
    // default is white, which is the assumption that the element sits on
    // a white page -- inherited here rather than second-guessed.
    // `ring-inset` moves the ring inside the box, and the offset with it:
    // Tailwind puts `var(--tw-ring-inset,)` at the head of *both* layers,
    // which are concentric and would come apart otherwise.
    let ring_inset = props.iter().any(|p| matches!(p, StyleProperty::RingInset));
    let inset = if ring_inset { "inset " } else { "" };
    if let Some(width) = ring_offset {
        layers.push(format!(
            "{inset}0 0 0 {} {}",
            length_px(width, theme),
            ring_offset_color.map_or_else(
                || "#fff".to_string(),
                |color| resolve_theme_color(color, theme)
            ),
        ));
    }
    if let Some(width) = ring {
        // The ring's spread includes the offset: the two layers are
        // concentric, so the outer one has to clear the inner.
        let spread = match ring_offset {
            // An expression cannot be added to a number, so the sum has to
            // stay an expression -- which is what Tailwind writes for every
            // ring anyway (`calc(2px + var(--tw-ring-offset-width))`). The
            // folded form is kept for the case where both sides are known,
            // because that is the one Hozo can state exactly and Tailwind's
            // own output normalises to.
            Some(offset)
                if width.css_expression().is_some() || offset.css_expression().is_some() =>
            {
                format!(
                    "calc({} + {})",
                    length_px(width, theme),
                    length_px(offset, theme)
                )
            }
            Some(offset) => length_px(&Length::Px(width.px(theme) + offset.px(theme)), theme),
            None => length_px(width, theme),
        };
        layers.push(format!("{inset}0 0 0 {spread} {}", paint(ring_color)));
    }
    if let Some(shadow) = shadow {
        // `shadow-none` removes the *shadow* layer, not the whole
        // declaration -- `shadow-none ring-2` still draws the ring, which is
        // what Tailwind does by clearing only its `--tw-shadow` register.
        if shadow != "none" {
            layers.push(repaint_shadow(&shadow, shadow_color, theme));
        } else if layers.is_empty() {
            return Some("none".to_string());
        }
    }
    (!layers.is_empty()).then(|| layers.join(", "))
}
