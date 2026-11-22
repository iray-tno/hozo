//! The React Native `key: value` pairs a set of IR properties becomes.

use super::*;

/// The React Native `key: value` pairs a set of IR properties becomes.
///
/// Distinct IR properties can collapse onto one RN key (all four per-side
/// border styles map to `borderStyle`), which would emit a duplicate object
/// key. Keep the last, matching how JS itself would resolve it -- but
/// written once.
pub(crate) fn style_pairs<'a>(props: &'a [StyleProperty], theme: &Theme) -> Vec<(&'a str, String)> {
    let mut emitted: Vec<(&'a str, String)> = Vec::new();
    // Which axes a `-reverse` utility flipped, read across the whole set
    // because it is a second utility describing the first.
    let flipped = |axis: Axis| {
        props.iter().any(|p| {
            matches!(
                p,
                StyleProperty::SpaceReverse(a) | StyleProperty::DivideReverse(a) if *a == axis
            )
        })
    };
    let reversed = [flipped(Axis::X), flipped(Axis::Y)];
    for prop in props {
        // A child-scoped property (`space-*`/`divide-*`) means something
        // different from a property of the same name on the element itself,
        // and only ever reaches here inside an entry built for the
        // children, so the dispatch is on the property rather than on which
        // entry is being built.
        let pairs = if style::is_child_scoped(prop) {
            style::child_property_and_value(prop, theme, reversed)
        } else {
            style::property_and_value(prop, theme)
        };
        for (key, value) in pairs {
            // A property refused for Native (see
            // `StyleProperty::unsupported_on_native`) yields no value;
            // writing the key anyway would emit `height: ,`, which isn't
            // even parseable JS.
            if value.is_empty() {
                continue;
            }
            match emitted.iter_mut().find(|(existing, _)| *existing == key) {
                Some(slot) => slot.1 = value,
                None => emitted.push((key, value)),
            }
        }
    }
    uniform_border_width(&mut emitted);
    if let Some(transform) = style::transform_entry(props, theme) {
        emitted.push(transform);
    }
    if let Some(filter) = style::filter_entry(props, theme) {
        emitted.push(filter);
    }
    if let Some(shadow) = style::box_shadow_entry(props, theme) {
        emitted.push(shadow);
    }
    if let Some(gradient) = style::background_image_entry(props, theme) {
        emitted.push(gradient);
    }
    emitted
}

/// Adds `borderWidth` beside four equal side widths.
///
/// Android draws a rounded border dashed or dotted only when the view has
/// one `borderWidth` for all sides; four side widths, even equal ones, take
/// its per-side path, which fills each side solid. So `rounded-xl border-2
/// border-dashed` came out solid there (#1205). The side widths stay, so
/// what overrides what is unchanged: React Native lets a side width beat
/// `borderWidth` wherever either is written, and every style that sets this
/// one also sets all four sides.
pub(super) fn uniform_border_width(emitted: &mut Vec<(&str, String)>) {
    const SIDES: [&str; 4] = [
        "borderTopWidth",
        "borderRightWidth",
        "borderBottomWidth",
        "borderLeftWidth",
    ];
    let width = |side: &str| {
        emitted
            .iter()
            .find(|(key, _)| *key == side)
            .map(|(_, value)| value)
    };
    let Some(top) = width(SIDES[0]) else { return };
    if SIDES[1..].iter().all(|side| width(side) == Some(top))
        && !emitted.iter().any(|(key, _)| *key == "borderWidth")
    {
        let top = top.clone();
        emitted.push(("borderWidth", top));
    }
}
