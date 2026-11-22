//! Shadow layers repainted through color registers.

use hozo_ir::{Color, Condition, StyleProperty, Theme};

use super::color::resolve_theme_color;
use super::gradient::split_register_writers;
use super::values::length_px;

/// Renders one CSS rule (optionally media-wrapped) for a class + condition
/// group's already-deduped properties.
pub(super) fn is_shadow_layer(prop: &StyleProperty) -> bool {
    matches!(
        prop,
        StyleProperty::BoxShadow(_)
            | StyleProperty::InsetShadow(_)
            | StyleProperty::RingWidth(_)
            | StyleProperty::RingColor(_)
            | StyleProperty::InsetRingWidth(_)
            | StyleProperty::RingOffsetWidth(_)
            | StyleProperty::RingOffsetColor(_)
            | StyleProperty::RingInset
            | StyleProperty::ShadowColor(_)
            | StyleProperty::InsetShadowColor(_)
            | StyleProperty::InsetRingColor(_)
    )
}

/// Joins whichever ring/shadow utilities are present into one `box-shadow`.
///
/// Tailwind does this at runtime with `--tw-*` registers spliced into a
/// fixed layer list; Hozo knows the whole set at compile time, so it
/// writes the resolved list directly and ships no custom properties. Layer
/// order follows Tailwind's: inset ring, then ring, then the shadow.
///
/// A ring colour with no width contributes nothing, which is correct --
/// `ring-blue-500` alone has nothing to paint, exactly as in Tailwind.
/// Repaints every layer of a shadow in `color`, or leaves it alone if no
/// `shadow-<colour>` was written.
///
/// The shadow's layers carry a default colour each (`rgb(0 0 0 / 0.1)` and
/// friends), and a colour utility replaces all of them at once -- which is
/// what makes `shadow-lg shadow-blue-500` one blue shadow rather than a
/// black one with a colour beside it. Tailwind does the same substitution
/// through `--tw-shadow-color`.
///
/// The colour is the tail of each layer, so it is cut at the last `rgb(`
/// rather than parsed. That holds because the table this reads from is in
/// this repository: every shadow Hozo knows is written with an `rgb()`
/// colour last. An arbitrary `shadow-[…]` has no default colour to
/// replace and is left as written.
pub(super) fn repaint_shadow(shadow: &str, color: Option<&Color>, theme: &Theme) -> String {
    let Some(color) = color else {
        return shadow.to_string();
    };
    let paint = resolve_theme_color(color, theme);
    split_layers(shadow)
        .into_iter()
        .map(|layer| match layer.rfind("rgb(") {
            // The colour's own extent, not everything after it. A
            // `box-shadow` layer ends at the colour so truncating worked;
            // a `drop-shadow(…)` layer has the wrapper's `)` behind it,
            // and dropping that produced a filter one bracket short of
            // parsing.
            Some(cut) => {
                let end = close_paren(layer, cut + "rgb(".len() - 1);
                format!("{}{paint}{}", &layer[..cut], &layer[end + 1..])
            }
            None => layer.to_string(),
        })
        .collect::<Vec<_>>()
        .join(", ")
}

/// The index of the `)` closing the `(` at `open`.
pub(super) fn close_paren(value: &str, open: usize) -> usize {
    let mut depth = 0usize;
    for (index, ch) in value.char_indices().skip(open) {
        match ch {
            '(' => depth += 1,
            ')' => {
                depth -= 1;
                if depth == 0 {
                    return index;
                }
            }
            _ => {}
        }
    }
    value.len() - 1
}

/// A comma-separated shadow list, split on the commas *between* layers --
/// `rgb(0 0 0 / 0.1)` has none, but `color-mix(in oklab, …)` does.
pub(super) fn split_layers(value: &str) -> Vec<&str> {
    let mut layers = Vec::new();
    let mut depth = 0usize;
    let mut start = 0usize;
    for (index, ch) in value.char_indices() {
        match ch {
            '(' => depth += 1,
            ')' => depth = depth.saturating_sub(1),
            ',' if depth == 0 => {
                layers.push(value[start..index].trim());
                start = index + 1;
            }
            _ => {}
        }
    }
    layers.push(value[start..].trim());
    layers
}

/// A shadow with each layer's default colour read through `register`, as
/// Tailwind writes `var(--tw-shadow-color, rgb(0 0 0 / 0.1))`.
pub(super) fn shadow_through(shadow: &str, register: &str) -> String {
    if shadow == "none" {
        return "0 0 #0000".to_string();
    }
    split_layers(shadow)
        .into_iter()
        .map(|layer| match layer.rfind("rgb(") {
            Some(cut) => {
                let end = close_paren(layer, cut + "rgb(".len() - 1);
                format!(
                    "{}var({register}, {}){}",
                    &layer[..cut],
                    &layer[cut..=end],
                    &layer[end + 1..]
                )
            }
            None => layer.to_string(),
        })
        .collect::<Vec<_>>()
        .join(", ")
}

/// Turn shadow and ring writes into Tailwind's registers when conditions
/// write different ones. Returns whether it did.
///
/// `box_shadow_value` joins the layers per condition, so `focus:ring-2
/// shadow-sm` was `box-shadow: 0 0 0 2px currentcolor` while focused: the
/// focus rule replaced the whole declaration and the shadow went with it.
/// Tailwind keeps every layer, colour, the offset width and the inset flag
/// in a register and reads the five layers in one `box-shadow`; this writes
/// the same structure under `--hozo-*` names. Conditions that write the same
/// slots (`shadow-sm md:shadow-lg`) keep their literal declarations.
pub fn register_split_shadows(
    groups: &mut [(Condition, Vec<StyleProperty>)],
    theme: &Theme,
) -> bool {
    register_shadows(groups, theme, false)
}

pub(super) fn register_shadows(
    groups: &mut [(Condition, Vec<StyleProperty>)],
    theme: &Theme,
    candidate: bool,
) -> bool {
    fn slot(p: &StyleProperty) -> u16 {
        match p {
            StyleProperty::BoxShadow(_) => 1,
            StyleProperty::ShadowColor(_) => 1 << 1,
            StyleProperty::InsetShadow(_) => 1 << 2,
            StyleProperty::InsetShadowColor(_) => 1 << 3,
            StyleProperty::RingWidth(_) => 1 << 4,
            StyleProperty::RingColor(_) => 1 << 5,
            StyleProperty::InsetRingWidth(_) => 1 << 6,
            StyleProperty::InsetRingColor(_) => 1 << 7,
            StyleProperty::RingOffsetWidth(_) => 1 << 8,
            StyleProperty::RingOffsetColor(_) => 1 << 9,
            StyleProperty::RingInset => 1 << 10,
            _ => 0,
        }
    }
    let masks = groups
        .iter()
        .map(|(_, props)| props.iter().fold(0, |slots, p| slots | slot(p)));
    if !split_register_writers(masks, candidate) {
        return false;
    }
    let color = |c: &Color| {
        if c.is_initial() {
            // Guaranteed-invalid, so the reader falls back to its default.
            "initial".to_string()
        } else {
            resolve_theme_color(c, theme)
        }
    };
    let set = |name: &str, value: String| StyleProperty::Arbitrary(format!("--hozo-{name}"), value);
    for (_, props) in groups.iter_mut() {
        if !props.iter().any(|p| slot(p) != 0) {
            continue;
        }
        // In the candidate cascade colour, offset and inset modifiers are
        // writers only. In particular a ring offset cannot create a shadow
        // on its own or take precedence over a caller's box-shadow.
        let reads = !candidate
            || props.iter().any(|p| {
                matches!(
                    p,
                    StyleProperty::BoxShadow(_)
                        | StyleProperty::InsetShadow(_)
                        | StyleProperty::RingWidth(_)
                        | StyleProperty::InsetRingWidth(_)
                )
            });
        let mut rewritten = Vec::with_capacity(props.len() + 2);
        for property in props.drain(..) {
            match &property {
                StyleProperty::BoxShadow(s) => {
                    rewritten.push(set("shadow", shadow_through(s, "--hozo-shadow-color")))
                }
                StyleProperty::ShadowColor(c) => rewritten.push(set("shadow-color", color(c))),
                StyleProperty::InsetShadow(s) => rewritten.push(set(
                    "inset-shadow",
                    shadow_through(s, "--hozo-inset-shadow-color"),
                )),
                StyleProperty::InsetShadowColor(c) => {
                    rewritten.push(set("inset-shadow-color", color(c)))
                }
                StyleProperty::RingWidth(width) => rewritten.push(set(
                    "ring-shadow",
                    format!(
                        "var(--hozo-ring-inset,) 0 0 0 calc({} + var(--hozo-ring-offset-width)) \
                         var(--hozo-ring-color, currentcolor)",
                        length_px(width, theme)
                    ),
                )),
                StyleProperty::RingColor(c) => rewritten.push(set("ring-color", color(c))),
                StyleProperty::InsetRingWidth(width) => rewritten.push(set(
                    "inset-ring-shadow",
                    format!(
                        "inset 0 0 0 {} var(--hozo-inset-ring-color, currentcolor)",
                        length_px(width, theme)
                    ),
                )),
                StyleProperty::InsetRingColor(c) => {
                    rewritten.push(set("inset-ring-color", color(c)))
                }
                StyleProperty::RingOffsetWidth(width) => {
                    rewritten.push(set("ring-offset-width", length_px(width, theme)));
                    rewritten.push(set(
                        "ring-offset-shadow",
                        "var(--hozo-ring-inset,) 0 0 0 var(--hozo-ring-offset-width) \
                         var(--hozo-ring-offset-color)"
                            .to_string(),
                    ));
                }
                StyleProperty::RingOffsetColor(c) => {
                    rewritten.push(set("ring-offset-color", color(c)))
                }
                StyleProperty::RingInset => rewritten.push(set("ring-inset", "inset".to_string())),
                _ => rewritten.push(property),
            }
        }
        if reads {
            rewritten.push(StyleProperty::Arbitrary(
                "box-shadow".to_string(),
                "var(--hozo-inset-shadow), var(--hozo-inset-ring-shadow), \
                 var(--hozo-ring-offset-shadow), var(--hozo-ring-shadow), var(--hozo-shadow)"
                    .to_string(),
            ));
        }
        *props = rewritten;
    }
    true
}
