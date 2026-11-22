//! Mask layers and their gradients.

use hozo_ir::{Angle, Color, MaskSlot, MaskStop, StyleProperty, Theme};

use super::color::resolve_theme_color;
use super::values::dimension_value;

/// Tailwind's unset-slot filler: opaque, so `mask-composite: intersect`
/// leaves whatever the other slots paint untouched.
pub(super) const MASK_OPAQUE: &str = "linear-gradient(#fff, #fff)";

pub(super) fn is_mask_gradient(prop: &StyleProperty) -> bool {
    matches!(
        prop,
        StyleProperty::MaskStopColor(..)
            | StyleProperty::MaskStopPosition(..)
            | StyleProperty::MaskSlotArgument(..)
            | StyleProperty::MaskRadialShape(_)
            | StyleProperty::MaskRadialSize(_)
            | StyleProperty::MaskRadialPosition(_)
            | StyleProperty::MaskComposite(_)
    )
}

/// One slot's stops, or `None` if no utility touched it.
pub(super) struct MaskGradient {
    from_color: Option<String>,
    from_position: Option<String>,
    to_color: Option<String>,
    to_position: Option<String>,
    angle: Option<Angle>,
}

/// A mask gradient's angle, defaulting to the `0deg` Tailwind's
/// `--tw-mask-*-position` register starts at.
pub(super) fn mask_angle(angle: &Option<Angle>) -> String {
    angle
        .as_ref()
        .map_or_else(|| "0deg".to_string(), Angle::css)
}

impl MaskGradient {
    /// Whether any utility contributed to this slot at all.
    fn is_set(&self) -> bool {
        self.from_color.is_some()
            || self.from_position.is_some()
            || self.to_color.is_some()
            || self.to_position.is_some()
            || self.angle.is_some()
    }

    /// Whether a stop list should be written. An angle alone produces
    /// `linear-gradient(45deg)` with no stops, matching Tailwind's
    /// `var(--tw-mask-linear-stops, var(--tw-mask-linear-position))`
    /// fallback.
    fn has_stops(&self) -> bool {
        self.from_color.is_some()
            || self.from_position.is_some()
            || self.to_color.is_some()
            || self.to_position.is_some()
    }

    /// The `<from> <pos>, <to> <pos>` half, with Tailwind's register
    /// defaults filled in.
    fn stops(&self) -> String {
        format!(
            "{} {}, {} {}",
            self.from_color.as_deref().unwrap_or("black"),
            self.from_position.as_deref().unwrap_or("0%"),
            self.to_color.as_deref().unwrap_or("transparent"),
            self.to_position.as_deref().unwrap_or("100%"),
        )
    }
}

/// Resolves the whole `mask-image` layer list at compile time.
///
/// Tailwind assembles it from `--tw-mask-*` registers, so the same
/// `mask-image: var(--tw-mask-linear), var(--tw-mask-radial),
/// var(--tw-mask-conic)` appears on every gradient utility and the
/// difference lives in which registers each one sets. Hozo has the whole
/// set in hand, so it writes the resolved list and ships no custom
/// properties.
///
/// The first slot is overloaded in Tailwind too: a side utility makes it a
/// four-layer list (left, right, bottom, top), a `mask-linear-*` makes it a
/// single gradient. Using both kinds together is therefore
/// order-dependent in Tailwind and resolved here as "sides win", which is
/// the only case where the two can disagree.
pub(super) fn mask_declarations(
    props: &[&StyleProperty],
    theme: &Theme,
) -> Vec<(&'static str, String)> {
    let color_var = |color: &Color| resolve_theme_color(color, theme);
    let slot_gradient = |slot: MaskSlot| {
        let mut g = MaskGradient {
            from_color: None,
            from_position: None,
            to_color: None,
            to_position: None,
            angle: None,
        };
        for prop in props {
            match prop {
                StyleProperty::MaskStopColor(s, stop, c) if *s == slot => match stop {
                    MaskStop::From => g.from_color = Some(color_var(c)),
                    MaskStop::To => g.to_color = Some(color_var(c)),
                },
                StyleProperty::MaskStopPosition(s, stop, d) if *s == slot => match stop {
                    MaskStop::From => g.from_position = Some(dimension_value(d, theme)),
                    MaskStop::To => g.to_position = Some(dimension_value(d, theme)),
                },
                StyleProperty::MaskSlotArgument(s, degrees) if *s == slot => {
                    g.angle = Some(degrees.clone())
                }
                _ => {}
            }
        }
        g
    };
    let keyword = |find: fn(&StyleProperty) -> Option<&'static str>, default: &'static str| {
        props.iter().find_map(|p| find(p)).unwrap_or(default)
    };

    let sides = [
        MaskSlot::Left,
        MaskSlot::Right,
        MaskSlot::Bottom,
        MaskSlot::Top,
    ];
    let side_gradients: Vec<(MaskSlot, MaskGradient)> =
        sides.iter().map(|s| (*s, slot_gradient(*s))).collect();
    let any_side = side_gradients.iter().any(|(_, g)| g.is_set());

    let linear = slot_gradient(MaskSlot::Linear);
    let radial = slot_gradient(MaskSlot::Radial);
    let conic = slot_gradient(MaskSlot::Conic);

    let composite = props.iter().find_map(|p| match p {
        StyleProperty::MaskComposite(c) => Some(*c),
        _ => None,
    });

    let paints = any_side || linear.is_set() || radial.is_set() || conic.is_set();
    if !paints {
        // `mask-add` on its own, or only radial shaping -- Tailwind emits
        // the composite alone and no `mask-image`.
        return composite.map_or_else(Vec::new, |c| vec![("mask-composite", c.to_string())]);
    }

    let mut layers: Vec<String> = Vec::new();
    if any_side {
        for (slot, g) in &side_gradients {
            layers.push(if g.is_set() {
                format!("linear-gradient(to {}, {})", side_keyword(*slot), g.stops())
            } else {
                MASK_OPAQUE.to_string()
            });
        }
    } else {
        layers.push(match (linear.is_set(), linear.has_stops()) {
            (false, _) => MASK_OPAQUE.to_string(),
            (true, false) => format!("linear-gradient({})", mask_angle(&linear.angle)),
            (true, true) => {
                format!(
                    "linear-gradient({}, {})",
                    mask_angle(&linear.angle),
                    linear.stops()
                )
            }
        });
    }

    layers.push(if radial.is_set() && !radial.has_stops() {
        // An arbitrary size with nothing to shape: the size *is* the
        // gradient, the same way an angle alone is for the other two
        // slots.
        format!("radial-gradient({})", mask_angle(&radial.angle))
    } else if radial.is_set() {
        format!(
            "radial-gradient({} {} at {}, {})",
            keyword(
                |p| match p {
                    StyleProperty::MaskRadialShape(v) => Some(*v),
                    _ => None,
                },
                "ellipse"
            ),
            // Not through `keyword`, which returns `&'static str`: this
            // one carries an arbitrary size (`mask-radial-[10px]`) and so
            // has to be owned.
            props
                .iter()
                .find_map(|p| match p {
                    StyleProperty::MaskRadialSize(v) => Some(v.clone()),
                    _ => None,
                })
                .unwrap_or_else(|| "farthest-corner".to_string()),
            keyword(
                |p| match p {
                    StyleProperty::MaskRadialPosition(v) => Some(*v),
                    _ => None,
                },
                "center"
            ),
            radial.stops(),
        )
    } else {
        MASK_OPAQUE.to_string()
    });

    layers.push(match (conic.is_set(), conic.has_stops()) {
        (false, _) => MASK_OPAQUE.to_string(),
        (true, false) => format!("conic-gradient({})", mask_angle(&conic.angle)),
        (true, true) => {
            format!(
                "conic-gradient(from {}, {})",
                mask_angle(&conic.angle),
                conic.stops()
            )
        }
    });

    vec![
        ("mask-image", layers.join(", ")),
        (
            "mask-composite",
            composite.unwrap_or("intersect").to_string(),
        ),
    ]
}

pub(super) fn side_keyword(slot: MaskSlot) -> &'static str {
    match slot {
        MaskSlot::Left => "left",
        MaskSlot::Right => "right",
        MaskSlot::Bottom => "bottom",
        MaskSlot::Top => "top",
        _ => "top",
    }
}
