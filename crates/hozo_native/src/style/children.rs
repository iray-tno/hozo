//! `space-*` and `divide-*`: the style written on each spaced child.

use super::*;

pub fn is_child_scoped(prop: &StyleProperty) -> bool {
    matches!(
        prop,
        StyleProperty::SpaceX(_)
            | StyleProperty::SpaceY(_)
            | StyleProperty::SpaceReverse(_)
            | StyleProperty::DivideX(_)
            | StyleProperty::DivideY(_)
            | StyleProperty::DivideReverse(_)
            | StyleProperty::DivideColor(_)
            | StyleProperty::DivideStyle(_)
    )
}

/// The style `space-*`/`divide-*` put on each spaced child.
///
/// The Web counterpart is `hozo_web::css::space_declarations`, and the two
/// differ in one place worth naming: Tailwind writes `border-top-style` and
/// `border-bottom-style` as separate longhands so `divide-*-reverse` can
/// flip which edge carries the border. React Native has no per-side border
/// style at all -- only `borderStyle` -- so the style is written once. That
/// is not a loss here: only one edge is given a width, so which edges the
/// style nominally applies to makes no visible difference.
pub fn child_property_and_value(
    prop: &StyleProperty,
    theme: &Theme,
    reversed: [bool; 2],
) -> Vec<(&'static str, String)> {
    let resolve_color = |color: &Color| resolve_theme_color(color, theme);
    // Which edge carries the gap. Both are always written, which is what
    // lets a separate `-reverse` utility flip them.
    let split = |axis: Axis, l: &Dimension| {
        let gap = dimension_value(l, theme);
        if reversed[axis as usize] {
            (gap, "0".to_string())
        } else {
            ("0".to_string(), gap)
        }
    };
    match prop {
        // Both edges are written, zeroing the leading one, matching what
        // Web emits -- a child with its own margin utility still overrides
        // this, since `HozoSpaced` merges the parent's style behind the
        // child's.
        StyleProperty::SpaceX(l) => {
            let (start, end) = split(Axis::X, l);
            vec![("marginInlineStart", start), ("marginInlineEnd", end)]
        }
        StyleProperty::SpaceY(l) => {
            let (start, end) = split(Axis::Y, l);
            vec![("marginTop", start), ("marginBottom", end)]
        }
        // A divider width's implied `solid` is React Native's default, and
        // writing it would override a written divider style.
        StyleProperty::DivideX(l) => {
            if matches!(l, Dimension::Percent(_) | Dimension::Auto) {
                return Vec::new();
            }
            let (start, end) = split(Axis::X, l);
            vec![
                // RN spells the logical border widths `borderStartWidth`/
                // `borderEndWidth`; it has no `borderInline*Width`, unlike
                // the margins just above, which do take the CSS logical
                // names.
                ("borderStartWidth", start),
                ("borderEndWidth", end),
            ]
        }
        StyleProperty::DivideY(l) => {
            if matches!(l, Dimension::Percent(_) | Dimension::Auto) {
                return Vec::new();
            }
            let (start, end) = split(Axis::Y, l);
            vec![("borderTopWidth", start), ("borderBottomWidth", end)]
        }
        StyleProperty::DivideColor(c) => vec![("borderColor", resolve_color(c))],
        StyleProperty::DivideStyle(s) => vec![("borderStyle", border_style_literal(s))],
        // Read by the widths above, which are the only things that know
        // how big the gap is.
        StyleProperty::SpaceReverse(_) | StyleProperty::DivideReverse(_) => Vec::new(),
        _ => Vec::new(),
    }
}
