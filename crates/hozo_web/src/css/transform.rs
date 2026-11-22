//! Translate, scale and the transform chain, from separate properties to one
//! declaration.

use hozo_ir::{Angle, Scale, StyleProperty, Theme, TransformFunction};

use super::values::{dimension_value, length_px};

pub(super) fn is_translate(prop: &StyleProperty) -> bool {
    matches!(
        prop,
        StyleProperty::Translate(_)
            | StyleProperty::TranslateX(_)
            | StyleProperty::TranslateY(_)
            | StyleProperty::TranslateZ(_)
    )
}

pub(super) fn is_scale_axis(prop: &StyleProperty) -> bool {
    matches!(
        prop,
        StyleProperty::Scale(_)
            | StyleProperty::ScaleX(_)
            | StyleProperty::ScaleY(_)
            | StyleProperty::ScaleZ(_)
            | StyleProperty::Scale3d
    )
}

pub(super) fn is_transform_function(prop: &StyleProperty) -> bool {
    matches!(
        prop,
        StyleProperty::Transform(_)
            | StyleProperty::RotateX(_)
            | StyleProperty::RotateY(_)
            | StyleProperty::RotateZ(_)
            | StyleProperty::SkewX(_)
            | StyleProperty::SkewY(_)
    )
}

/// The per-axis scales as one `scale` declaration.
///
/// An unwritten axis is `1`, not `100%` -- that is the literal
/// `initial-value` of Tailwind's `--tw-scale-*` registers, and since a
/// written axis is a percentage the two spellings sit side by side in the
/// same declaration (`scale-x-50` is `50% 1`). They mean the same thing to
/// CSS; a differential test compares strings.
///
/// The third component appears only when a z-form utility was written --
/// see `StyleProperty::Scale3d` for why that isn't the same question as
/// whether the z axis has a value.
pub(super) fn scale_value(props: &[&StyleProperty]) -> Option<String> {
    if props.is_empty() {
        return None;
    }
    // A whole value (`scale-[…]`, `scale-none`) written after every axis
    // replaces the declaration, as the later rule does in Tailwind.
    let whole = |property: &&StyleProperty| {
        matches!(property, StyleProperty::Scale(_) | StyleProperty::ScaleNone)
    };
    let last_authored = props.iter().rposition(whole);
    let last_axes = props.iter().rposition(|property| !whole(property));
    if last_authored > last_axes {
        return props.iter().rev().find_map(|property| match property {
            StyleProperty::ScaleNone => Some("none".to_string()),
            StyleProperty::Scale(values) => {
                Some(values.iter().map(Scale::css).collect::<Vec<_>>().join(" "))
            }
            _ => None,
        });
    }
    let axis = |f: fn(&StyleProperty) -> Option<&Scale>| {
        props
            .iter()
            .find_map(|p| f(p))
            .map_or_else(|| "1".to_string(), Scale::css)
    };
    let x = axis(|p| match p {
        StyleProperty::ScaleX(v) => Some(v),
        _ => None,
    });
    let y = axis(|p| match p {
        StyleProperty::ScaleY(v) => Some(v),
        _ => None,
    });
    // The three-value form is the last `scale` declaration's, as in
    // Tailwind: a later 2D utility (`scale-x-*`, `scale-*`, both of which
    // write an x or y axis) writes the two-value form back.
    let last_3d = props
        .iter()
        .rposition(|p| matches!(p, StyleProperty::Scale3d));
    let last_2d = props
        .iter()
        .rposition(|p| matches!(p, StyleProperty::ScaleX(_) | StyleProperty::ScaleY(_)));
    if last_3d.is_none() || last_3d < last_2d {
        return Some(format!("{x} {y}"));
    }
    let z = axis(|p| match p {
        StyleProperty::ScaleZ(v) => Some(v),
        _ => None,
    });
    Some(format!("{x} {y} {z}"))
}

/// The 3D rotations and skews as one `transform` declaration.
///
/// Order matters and is Tailwind's: `rotateX rotateY rotateZ skewX skewY`,
/// which is the order its `--tw-*` registers appear in the value. Transform
/// functions don't commute, so a different order is a different rendering
/// rather than a different spelling.
pub(super) fn transform_value(props: &[&StyleProperty], theme: &Theme) -> Option<String> {
    // `transform-none`, `transform`/`-cpu` and `transform-gpu` write the
    // declaration's form; every function rule writes the plain chain. The
    // last of them decides, as the later rule does in Tailwind.
    let control = |property: &&StyleProperty| {
        matches!(
            property,
            StyleProperty::Transform(_)
                | StyleProperty::TransformNone
                | StyleProperty::TransformEmpty
                | StyleProperty::TransformGpu
        )
    };
    let last_control = props.iter().rposition(control);
    let last_slots = props.iter().rposition(|property| !control(property));
    let gpu = if last_control > last_slots {
        match props[last_control?] {
            StyleProperty::Transform(functions) => {
                return Some(authored_transform_value(functions, theme))
            }
            StyleProperty::TransformNone => return Some("none".to_string()),
            StyleProperty::TransformGpu => true,
            _ => false,
        }
    } else {
        false
    };
    let chain = transform_chain(props);
    Some(match (gpu, chain) {
        (true, Some(chain)) => format!("translateZ(0) {chain}"),
        (true, None) => "translateZ(0)".to_string(),
        (false, Some(chain)) => chain,
        // Only a control with nothing after it: `transform` is the empty
        // chain, which is still a declaration a later utility overrides.
        (false, None) if last_control.is_some() => String::new(),
        (false, None) => return None,
    })
}

/// The 3D rotations and skews, in Tailwind's register order.
pub(super) fn transform_chain(props: &[&StyleProperty]) -> Option<String> {
    let mut parts: Vec<String> = Vec::new();
    let mut push = |name: &str, angle: Option<&Angle>| {
        if let Some(a) = angle {
            parts.push(format!("{name}({})", a.css()));
        }
    };
    let find = |f: fn(&StyleProperty) -> Option<&Angle>| props.iter().find_map(|p| f(p));
    push(
        "rotateX",
        find(|p| match p {
            StyleProperty::RotateX(a) => Some(a),
            _ => None,
        }),
    );
    push(
        "rotateY",
        find(|p| match p {
            StyleProperty::RotateY(a) => Some(a),
            _ => None,
        }),
    );
    push(
        "rotateZ",
        find(|p| match p {
            StyleProperty::RotateZ(a) => Some(a),
            _ => None,
        }),
    );
    push(
        "skewX",
        find(|p| match p {
            StyleProperty::SkewX(a) => Some(a),
            _ => None,
        }),
    );
    push(
        "skewY",
        find(|p| match p {
            StyleProperty::SkewY(a) => Some(a),
            _ => None,
        }),
    );
    (!parts.is_empty()).then(|| parts.join(" "))
}

pub(super) fn authored_transform_value(functions: &[TransformFunction], theme: &Theme) -> String {
    if functions.is_empty() {
        return "none".to_string();
    }
    functions
        .iter()
        .map(|function| match function {
            TransformFunction::Perspective(value) => {
                format!("perspective({})", length_px(value, theme))
            }
            TransformFunction::Rotate(value) => format!("rotate({})", value.css()),
            TransformFunction::RotateX(value) => format!("rotateX({})", value.css()),
            TransformFunction::RotateY(value) => format!("rotateY({})", value.css()),
            TransformFunction::RotateZ(value) => format!("rotateZ({})", value.css()),
            TransformFunction::Scale(value) => format!("scale({})", compact_number(*value)),
            TransformFunction::ScaleX(value) => format!("scaleX({})", compact_number(*value)),
            TransformFunction::ScaleY(value) => format!("scaleY({})", compact_number(*value)),
            TransformFunction::TranslateX(value) => {
                format!("translateX({})", dimension_value(value, theme))
            }
            TransformFunction::TranslateY(value) => {
                format!("translateY({})", dimension_value(value, theme))
            }
            TransformFunction::SkewX(value) => format!("skewX({})", value.css()),
            TransformFunction::SkewY(value) => format!("skewY({})", value.css()),
        })
        .collect::<Vec<_>>()
        .join(" ")
}

pub(super) fn compact_number(value: f64) -> String {
    let value = value.to_string();
    value
        .strip_prefix("0.")
        .map(|rest| format!(".{rest}"))
        .or_else(|| value.strip_prefix("-0.").map(|rest| format!("-.{rest}")))
        .unwrap_or(value)
}

/// CSS's `translate` is one property taking up to three values, so the
/// three axes have to become one declaration. Emitting them separately --
/// which this did until 2026-08-15 -- made `translate-x-4 translate-y-8`
/// write two `translate:` declarations, and last-wins threw the x away.
///
/// The z value is only written when present, matching Tailwind: the
/// two-value form is what `translate-x-*`/`translate-y-*` produce.
pub(super) fn translate_value(props: &[&StyleProperty], theme: &Theme) -> Option<String> {
    if props.is_empty() {
        return None;
    }
    // A whole value (`translate-[…]`, `translate-none`) written after every
    // axis replaces the declaration, as the later rule does in Tailwind.
    let whole = |property: &&StyleProperty| {
        matches!(
            property,
            StyleProperty::Translate(_) | StyleProperty::TranslateNone
        )
    };
    let last_authored = props.iter().rposition(whole);
    let last_axes = props.iter().rposition(|property| !whole(property));
    if last_authored > last_axes {
        return props.iter().rev().find_map(|property| match property {
            StyleProperty::TranslateNone => Some("none".to_string()),
            StyleProperty::Translate(values) => Some(
                values
                    .iter()
                    .map(|value| dimension_value(value, theme))
                    .collect::<Vec<_>>()
                    .join(" "),
            ),
            _ => None,
        });
    }
    // A trait object rather than a fn pointer: the closures below capture
    // `theme` now, so they aren't plain functions any more.
    let axis = |f: &dyn Fn(&StyleProperty) -> Option<String>| {
        props
            .iter()
            .find_map(|p| f(p))
            .unwrap_or_else(|| "0".to_string())
    };
    let x = axis(&|p: &StyleProperty| match p {
        StyleProperty::TranslateX(d) => Some(dimension_value(d, theme)),
        _ => None,
    });
    let y = axis(&|p: &StyleProperty| match p {
        StyleProperty::TranslateY(d) => Some(dimension_value(d, theme)),
        _ => None,
    });
    let z = props.iter().find_map(|p| match p {
        StyleProperty::TranslateZ(d) => Some(dimension_value(d, theme)),
        _ => None,
    });
    Some(match z {
        Some(z) => format!("{x} {y} {z}"),
        None => format!("{x} {y}"),
    })
}
