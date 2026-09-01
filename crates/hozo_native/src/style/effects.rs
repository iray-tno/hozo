//! Composite visual effects for React Native `StyleSheet` output.
//!
//! Transforms, gradients, filters, rings, and shadows each collapse several
//! IR properties into one ordered React Native style value.

use super::*;

/// Builds React Native's combined `transform` array from whichever
/// standalone transform properties a rule carries, or `None` if it carries
/// none. Ordered translate -> rotate -> scale, matching how CSS applies its
/// standalone properties, so the two platforms compose identically.
pub(crate) fn transform_entry(props: &[StyleProperty], theme: &Theme) -> Option<(&'static str, String)> {
    let mut parts: Vec<String> = Vec::new();
    let last_authored = props.iter().rposition(|property| matches!(property, StyleProperty::Transform(_)));
    let last_function_slots = props.iter().rposition(|property| matches!(
        property,
        StyleProperty::RotateX(_) | StyleProperty::RotateY(_) | StyleProperty::RotateZ(_)
            | StyleProperty::SkewX(_) | StyleProperty::SkewY(_)
    ));
    for prop in props {
        if let StyleProperty::TranslateX(d) = prop {
            parts.push(format!("{{ translateX: {} }}", dimension_value(d, theme)));
        }
    }
    for prop in props {
        if let StyleProperty::TranslateY(d) = prop {
            parts.push(format!("{{ translateY: {} }}", dimension_value(d, theme)));
        }
    }
    for prop in props {
        // An angle that stayed CSS text has no degrees to give. It is
        // refused by name in `StyleProperty::native_gap` rather than
        // dropped here, so leaving it out of the array is the second half
        // of a reported gap, not a silent one.
        if let StyleProperty::Rotate(a) = prop {
            if let Some(degrees) = a.degrees() {
                parts.push(format!("{{ rotate: '{degrees}deg' }}"));
            }
        }
    }
    // React Native has the 3D rotations and the skews as transform entries
    // of their own, in the same order CSS applies them.
    if last_function_slots > last_authored {
        for (name, angle) in [
            ("rotateX", props.iter().find_map(rotate_x)),
            ("rotateY", props.iter().find_map(rotate_y)),
            ("rotateZ", props.iter().find_map(rotate_z)),
            ("skewX", props.iter().find_map(skew_x)),
            ("skewY", props.iter().find_map(skew_y)),
        ] {
            if let Some(degrees) = angle {
                parts.push(format!("{{ {name}: '{degrees}deg' }}"));
            }
        }
    }
    // Scale is a ratio here, not a percentage. RN's public transform type
    // has no scaleZ entry, but its supported 4x4 matrix does. An explicit
    // Z-axis utility carries Scale3d, so split all axes in that case and
    // put Z on the matrix diagonal. Keeping ordinary uniform scale as one
    // `scale` entry avoids applying its Z component twice.
    let axis = |f: fn(&StyleProperty) -> Option<f64>| props.iter().find_map(f);
    let x = axis(scale_x);
    let y = axis(scale_y);
    let z = axis(scale_z);
    let explicit_z = props.iter().any(|p| matches!(p, StyleProperty::Scale3d));
    match (x, y, explicit_z) {
        (Some(x), Some(y), false) if x == y => parts.push(format!("{{ scale: {x} }}")),
        _ => {
            if let Some(x) = x {
                parts.push(format!("{{ scaleX: {x} }}"));
            }
            if let Some(y) = y {
                parts.push(format!("{{ scaleY: {y} }}"));
            }
        }
    }
    if explicit_z {
        if let Some(z) = z {
            parts.push(format!(
                "{{ matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, {z}, 0, 0, 0, 0, 1] }}"
            ));
        }
    }
    // CSS applies the authored transform list after its standalone
    // translate/rotate/scale properties. Preserve the list's own order.
    if last_authored > last_function_slots {
        let functions = props.iter().rev().find_map(|property| match property {
            StyleProperty::Transform(functions) => Some(functions),
            _ => None,
        }).expect("last authored transform index came from a transform");
        for function in functions {
            let entry = match function {
                TransformFunction::Perspective(value) => format!("{{ perspective: {} }}", number(value, theme)),
                TransformFunction::Rotate(value) => format!("{{ rotate: '{}' }}", value.css()),
                TransformFunction::RotateX(value) => format!("{{ rotateX: '{}' }}", value.css()),
                TransformFunction::RotateY(value) => format!("{{ rotateY: '{}' }}", value.css()),
                TransformFunction::RotateZ(value) => format!("{{ rotateZ: '{}' }}", value.css()),
                TransformFunction::Scale(value) => format!("{{ scale: {value} }}"),
                TransformFunction::ScaleX(value) => format!("{{ scaleX: {value} }}"),
                TransformFunction::ScaleY(value) => format!("{{ scaleY: {value} }}"),
                TransformFunction::TranslateX(value) => format!("{{ translateX: {} }}", dimension_value(value, theme)),
                TransformFunction::TranslateY(value) => format!("{{ translateY: {} }}", dimension_value(value, theme)),
                TransformFunction::SkewX(value) => format!("{{ skewX: '{}' }}", value.css()),
                TransformFunction::SkewY(value) => format!("{{ skewY: '{}' }}", value.css()),
            };
            parts.push(entry);
        }
    }
    if parts.is_empty() {
        return None;
    }
    Some(("transform", format!("[{}]", parts.join(", "))))
}

fn rotate_x(prop: &StyleProperty) -> Option<f64> {
    match prop {
        StyleProperty::RotateX(a) => a.degrees(),
        _ => None,
    }
}
fn rotate_y(prop: &StyleProperty) -> Option<f64> {
    match prop {
        StyleProperty::RotateY(a) => a.degrees(),
        _ => None,
    }
}
fn rotate_z(prop: &StyleProperty) -> Option<f64> {
    match prop {
        StyleProperty::RotateZ(a) => a.degrees(),
        _ => None,
    }
}
fn skew_x(prop: &StyleProperty) -> Option<f64> {
    match prop {
        StyleProperty::SkewX(a) => a.degrees(),
        _ => None,
    }
}
fn skew_y(prop: &StyleProperty) -> Option<f64> {
    match prop {
        StyleProperty::SkewY(a) => a.degrees(),
        _ => None,
    }
}
fn scale_x(prop: &StyleProperty) -> Option<f64> {
    match prop {
        StyleProperty::ScaleX(v) => v.ratio(),
        _ => None,
    }
}
fn scale_y(prop: &StyleProperty) -> Option<f64> {
    match prop {
        StyleProperty::ScaleY(v) => v.ratio(),
        _ => None,
    }
}
fn scale_z(prop: &StyleProperty) -> Option<f64> {
    match prop {
        StyleProperty::ScaleZ(v) => v.ratio(),
        _ => None,
    }
}

/// A gradient as React Native's `backgroundImage`, which takes CSS
/// gradient syntax as a string.
///
/// One approximation, and it is visible rather than structural: the
/// interpolation clause is dropped. Tailwind v4 ramps colours through
/// Oklab, so a red-to-blue gradient stays saturated in the middle;
/// React Native's parser doesn't accept `in oklab` and would reject the
/// whole value, so the string it gets interpolates in sRGB and passes
/// through grey. Endpoints are identical, the middle is not.
///
/// Conic gradients are refused by name in
/// `StyleProperty::native_gap` rather than approximated here --
/// `BackgroundImageValue` is `LinearGradientValue | RadialGradientValue`
/// and there is no third one to fall back to.
pub(crate) fn background_image_entry(
    props: &[StyleProperty],
    theme: &Theme,
) -> Option<(&'static str, String)> {
    enum Image<'a> {
        None,
        Raw(&'a str),
        Gradient(GradientKind, &'a str),
    }
    // Last wins between a gradient and `bg-none`, the same scan the Web
    // backend does for the same reason.
    let latest = props.iter().rev().find_map(|p| match p {
        StyleProperty::Gradient(kind, prelude) => Some(Image::Gradient(*kind, prelude)),
        StyleProperty::BackgroundImageNone => Some(Image::None),
        StyleProperty::BackgroundImage(value) => Some(Image::Raw(value)),
        _ => None,
    })?;
    let (kind, prelude) = match latest {
        Image::None => return Some(("backgroundImage", "'none'".to_string())),
        Image::Raw(value) => return Some(("backgroundImage", js_string(value))),
        Image::Gradient(kind, prelude) => (kind, prelude),
    };
    if kind == GradientKind::Conic {
        return None;
    }
    // Everything up to the interpolation clause: `to right in oklab` is a
    // direction React Native understands followed by one it doesn't.
    let direction = match prelude.find(" in ") {
        Some(cut) => &prelude[..cut],
        None if prelude.starts_with("in ") => "",
        None => prelude,
    };

    let color = |stop: GradientStop| {
        props.iter().find_map(|p| match p {
            StyleProperty::GradientStopColor(s, c) if *s == stop && !c.is_initial() => Some(resolve_theme_color(c, theme)),
            _ => None,
        })
    };
    let position = |stop: GradientStop| {
        props
            .iter()
            .find_map(|p| match p {
                StyleProperty::GradientStopPosition(s, Dimension::Percent(pct)) if *s == stop => {
                    Some(format!("{pct}%"))
                }
                _ => None,
            })
            .unwrap_or_else(|| stop.default_position().to_string())
    };
    let stop = |s: GradientStop| {
        // `resolve_theme_color` returns a quoted JS string; this one goes
        // inside a larger string, so the quotes come off.
        let color = color(s).unwrap_or_else(|| "'#0000'".to_string());
        format!("{} {}", color.trim_matches('\''), position(s))
    };

    let mut stops = vec![stop(GradientStop::From)];
    if color(GradientStop::Via).is_some() {
        stops.push(stop(GradientStop::Via));
    }
    stops.push(stop(GradientStop::To));

    let args = if direction.is_empty() {
        stops.join(", ")
    } else {
        format!("{direction}, {}", stops.join(", "))
    };
    Some(("backgroundImage", js_string(&format!("{}({args})", kind.css()))))
}

/// Joins whichever filter utilities a rule carries into one `filter`
/// string, in `FilterFunction` order -- the same order the Web backend
/// uses, so the two platforms compose identically. React Native 0.76+
/// accepts the CSS syntax here, so the value text is shared.
pub(crate) fn filter_entry(props: &[StyleProperty], theme: &Theme) -> Option<(&'static str, String)> {
    let last_raw = props.iter().rposition(|p| matches!(p, StyleProperty::FilterRaw(_)));
    let last_slots = props.iter().rposition(|p| matches!(p, StyleProperty::Filter(..)));
    if last_raw > last_slots {
        return props.iter().rev().find_map(|p| match p {
            StyleProperty::FilterRaw(value) => Some(("filter", js_string(value))),
            _ => None,
        });
    }
    let mut functions: Vec<(FilterFunction, String)> = Vec::new();
    // `drop-shadow-<colour>` repaints the shadow the other utility drew,
    // the same composition the Web backend does -- React Native takes the
    // whole chain as a string, so the two sides can share the shape.
    let drop_shadow_color = props
        .iter()
        .find_map(|p| match p {
            StyleProperty::DropShadowColor(c) if !c.is_initial() => Some(resolve_theme_color(c, theme)),
            _ => None,
        });
    for prop in props {
        let StyleProperty::Filter(function, value) = prop else { continue };
        if *function == FilterFunction::None {
            return Some(("filter", "'none'".to_string()));
        }
        let value = if *function == FilterFunction::DropShadow {
            repaint_shadow(value, drop_shadow_color.as_deref())
        } else {
            value.clone()
        };
        functions.push((*function, value));
    }
    if functions.is_empty() {
        return None;
    }
    functions.sort_by_key(|(function, _)| *function);
    let chain: Vec<&str> =
        functions.iter().map(|(_, v)| v.as_str()).filter(|v| !v.is_empty()).collect();
    Some(("filter", format!("'{}'", chain.join(" "))))
}

/// Joins whichever ring/shadow utilities a rule carries into one
/// `boxShadow` string, in the same layer order the Web backend uses so both
/// platforms stack them identically.
///
/// React Native 0.81 accepts a CSS-like string for `boxShadow`, so the
/// composed value is the same shape as the Web one -- only the quoting and
/// the unitless-number convention differ.
pub(crate) fn box_shadow_entry(props: &[StyleProperty], theme: &Theme) -> Option<(&'static str, String)> {
    let resolve_color = |color: &Color| resolve_theme_color(color, theme);
    let ring = props.iter().find_map(|p| match p {
        // Any length, not only pixels: `ring-[2rem]` resolves to 32 the
        // same way `p-[2rem]` does, and matching `Px` alone dropped it
        // into an empty style with no diagnostic.
        StyleProperty::RingWidth(l) => Some(l.px(theme)),
        _ => None,
    });
    let inset_ring = props.iter().find_map(|p| match p {
        StyleProperty::InsetRingWidth(l) => Some(l.px(theme)),
        _ => None,
    });
    let ring_color = props.iter().find_map(|p| match p {
        StyleProperty::RingColor(c) => Some(c),
        _ => None,
    });
    let inset_ring_color = props.iter().find_map(|p| match p {
        StyleProperty::InsetRingColor(c) => Some(c),
        _ => None,
    });
    let shadow = props.iter().find_map(|p| match p {
        StyleProperty::BoxShadow(s) => Some(s.clone()),
        _ => None,
    });

    // Tailwind's default ring colour. Unquoted here because the whole
    // `boxShadow` value is one string.
    let paint = |c: Option<&Color>| {
        c.map_or("currentcolor".to_string(), |c| resolve_color(c).trim_matches('\'').to_string())
    };

    let ring_offset = props.iter().find_map(|p| match p {
        StyleProperty::RingOffsetWidth(l) => Some(l.px(theme)),
        _ => None,
    });
    // `shadow-initial` and its siblings unset the register, so the layer
    // keeps its own default -- found and then discarded rather than never
    // parsed, since it has to beat a `shadow-red-500` written before it.
    let color_of = |find: fn(&StyleProperty) -> Option<&Color>| {
        props
            .iter()
            .find_map(find)
            .filter(|c| !c.is_initial())
            .map(|c| resolve_color(c).trim_matches('\'').to_string())
    };
    let shadow_color = color_of(|p| match p {
        StyleProperty::ShadowColor(c) => Some(c),
        _ => None,
    });
    let inset_shadow_color = color_of(|p| match p {
        StyleProperty::InsetShadowColor(c) => Some(c),
        _ => None,
    });

    let mut layers: Vec<String> = Vec::new();
    if let Some(shadow) = props.iter().find_map(|p| match p {
        StyleProperty::InsetShadow(s) => Some(s.clone()),
        _ => None,
    }) {
        layers.push(repaint_shadow(&shadow, inset_shadow_color.as_deref()));
    }
    if let Some(width) = inset_ring {
        layers.push(format!("inset 0 0 0 {width}px {}", paint(inset_ring_color)));
    }
    // Under the ring and pushing it outwards, the same as on Web. The
    // register default is white.
    //
    // `ring-inset` moves the ring inside the box and the offset with it:
    // the two layers are concentric and would come apart otherwise.
    let inset = if props.iter().any(|p| matches!(p, StyleProperty::RingInset)) { "inset " } else { "" };
    if let Some(width) = ring_offset {
        layers.push(format!(
            "{inset}0 0 0 {width}px {}",
            color_of(|p| match p {
                StyleProperty::RingOffsetColor(c) => Some(c),
                _ => None,
            })
            .unwrap_or_else(|| "#fff".to_string()),
        ));
    }
    if let Some(width) = ring {
        layers.push(format!(
            "{inset}0 0 0 {}px {}",
            width + ring_offset.unwrap_or(0.0),
            paint(ring_color)
        ));
    }
    if let Some(shadow) = shadow {
        // See the Web backend: `shadow-none` clears the shadow layer, not
        // the ring beside it.
        if shadow != "none" {
            layers.push(repaint_shadow(&shadow, shadow_color.as_deref()));
        } else if layers.is_empty() {
            return Some(("boxShadow", "'none'".to_string()));
        }
    }
    (!layers.is_empty()).then(|| ("boxShadow", format!("'{}'", layers.join(", "))))
}


/// Repaints a shadow's layers in `color`. The Web backend's `repaint_shadow`
/// with the same reasoning and the same cut: the colour is the tail of each
/// layer, and the shadow table it reads from is in this repository.
fn repaint_shadow(shadow: &str, color: Option<&str>) -> String {
    let Some(paint) = color else { return shadow.to_string() };
    shadow
        .split(',')
        .map(|layer| match layer.rfind("rgb(") {
            // The colour's extent, not everything after it -- a
            // `drop-shadow(...)` layer has the wrapper's closing bracket
            // behind the colour, and truncating there left the filter one
            // bracket short of parsing.
            Some(cut) => {
                let end = close_paren(layer, cut + "rgb(".len() - 1);
                format!("{}{paint}{}", &layer[..cut], &layer[end + 1..])
            }
            None => layer.trim().to_string(),
        })
        .collect::<Vec<_>>()
        .join(", ")
}

/// The index of the `)` closing the `(` at `open`.
fn close_paren(value: &str, open: usize) -> usize {
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
