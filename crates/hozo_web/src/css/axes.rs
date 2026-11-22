//! Writing translate, scale, rotate and filter values through per-axis registers.

use hozo_ir::{Condition, FilterFunction, StyleProperty, Theme};

use super::filter::filter_slot;
use super::gradient::{register_gradients, split_register_writers};
use super::registers::{GRADIENT_REGISTERS, SHADOW_REGISTERS};
use super::shadow::register_shadows;
use super::values::dimension_value;

/// Turn transform axes into registers when an element writes them under
/// more than one condition. Returns whether it did.
///
/// One condition's rule carries the whole joined declaration, so
/// `md:translate-x-8 translate-y-2` was `translate: 32px 0` at md, dropping
/// the y axis the base rule wrote, where Tailwind gives `32px 8px`; and
/// `md:skew-x-12 skew-y-6` lost the base `skewY` from `transform`. Tailwind
/// keeps each axis in its own register and reads them all in one
/// declaration; this does the same, but only where conditions write
/// different axes, so an element whose axes share one condition keeps its
/// literal `translate: 16px 8px`, and `scale-100 hover:scale-95` its two. A family with an authored whole value or a reset
/// (`translate-[…]`, `translate-none`) is left as it was.
pub fn register_split_axes(groups: &mut [(Condition, Vec<StyleProperty>)], theme: &Theme) -> bool {
    register_axes(groups, theme, false, None)
}

/// Separate runtime classes cannot be inspected together at build time.
/// Transforms, ordinary filter/backdrop functions and gradients use the same
/// registers as split static nodes. Whole-value/drop-shadow boundaries stay
/// unchanged. This adds no Native syntax admission.
pub fn register_candidate_slots(
    groups: &mut [(Condition, Vec<StyleProperty>)],
    theme: &Theme,
    required: &mut std::collections::BTreeSet<&'static str>,
) -> bool {
    let axes = register_axes(groups, theme, true, Some(required));
    let gradients = register_gradients(groups, theme, true);
    if gradients {
        required.extend(GRADIENT_REGISTERS.iter().map(|(name, _)| *name));
    }
    let shadows = register_shadows(groups, theme, true);
    if shadows {
        required.extend(SHADOW_REGISTERS.iter().map(|(name, _)| *name));
    }
    axes || gradients || shadows
}

pub(super) fn register_axes(
    groups: &mut [(Condition, Vec<StyleProperty>)],
    theme: &Theme,
    candidate: bool,
    mut required: Option<&mut std::collections::BTreeSet<&'static str>>,
) -> bool {
    struct Family {
        name: &'static str,
        axes: &'static [&'static str],
        axis: fn(&StyleProperty) -> Option<usize>,
        value: fn(&StyleProperty, &Theme) -> String,
        blocks: fn(&StyleProperty) -> bool,
        /// A z-form marker that adds the third axis to the declaration.
        three: fn(&StyleProperty) -> bool,
        /// Every register is read, an unset one as nothing (`var(--r,)`),
        /// as Tailwind's `transform` reads its function registers.
        optional: bool,
    }
    let families = [
        Family {
            name: "translate",
            axes: &[
                "--hozo-translate-x",
                "--hozo-translate-y",
                "--hozo-translate-z",
            ],
            axis: |p| match p {
                StyleProperty::TranslateX(_) => Some(0),
                StyleProperty::TranslateY(_) => Some(1),
                StyleProperty::TranslateZ(_) => Some(2),
                _ => None,
            },
            value: |p, theme| match p {
                StyleProperty::TranslateX(d)
                | StyleProperty::TranslateY(d)
                | StyleProperty::TranslateZ(d) => dimension_value(d, theme),
                _ => unreachable!(),
            },
            blocks: |p| {
                matches!(
                    p,
                    StyleProperty::Translate(_) | StyleProperty::TranslateNone
                )
            },
            three: |p| matches!(p, StyleProperty::TranslateZ(_)),
            optional: false,
        },
        Family {
            name: "scale",
            axes: &["--hozo-scale-x", "--hozo-scale-y", "--hozo-scale-z"],
            axis: |p| match p {
                StyleProperty::ScaleX(_) => Some(0),
                StyleProperty::ScaleY(_) => Some(1),
                StyleProperty::ScaleZ(_) => Some(2),
                _ => None,
            },
            value: |p, _| match p {
                StyleProperty::ScaleX(s) | StyleProperty::ScaleY(s) | StyleProperty::ScaleZ(s) => {
                    s.css()
                }
                _ => unreachable!(),
            },
            blocks: |p| matches!(p, StyleProperty::Scale(_) | StyleProperty::ScaleNone),
            three: |p| matches!(p, StyleProperty::Scale3d),
            optional: false,
        },
        Family {
            name: "transform",
            axes: &[
                "--hozo-rotate-x",
                "--hozo-rotate-y",
                "--hozo-rotate-z",
                "--hozo-skew-x",
                "--hozo-skew-y",
            ],
            axis: |p| match p {
                StyleProperty::RotateX(_) => Some(0),
                StyleProperty::RotateY(_) => Some(1),
                StyleProperty::RotateZ(_) => Some(2),
                StyleProperty::SkewX(_) => Some(3),
                StyleProperty::SkewY(_) => Some(4),
                _ => None,
            },
            value: |p, _| match p {
                StyleProperty::RotateX(a) => format!("rotateX({})", a.css()),
                StyleProperty::RotateY(a) => format!("rotateY({})", a.css()),
                StyleProperty::RotateZ(a) => format!("rotateZ({})", a.css()),
                StyleProperty::SkewX(a) => format!("skewX({})", a.css()),
                StyleProperty::SkewY(a) => format!("skewY({})", a.css()),
                _ => unreachable!(),
            },
            blocks: |p| {
                matches!(
                    p,
                    StyleProperty::Transform(_)
                        | StyleProperty::TransformNone
                        | StyleProperty::TransformEmpty
                        | StyleProperty::TransformGpu
                )
            },
            three: |_| false,
            optional: true,
        },
        // Tailwind's `filter` reads its function registers in this order.
        Family {
            name: "filter",
            axes: &[
                "--hozo-blur",
                "--hozo-brightness",
                "--hozo-contrast",
                "--hozo-grayscale",
                "--hozo-hue-rotate",
                "--hozo-invert",
                "--hozo-saturate",
                "--hozo-sepia",
            ],
            axis: |p| match p {
                StyleProperty::Filter(function, _) => filter_slot(*function, false),
                _ => None,
            },
            value: |p, _| match p {
                StyleProperty::Filter(_, value) => value.clone(),
                _ => unreachable!(),
            },
            // A drop shadow repaints with its own colour register. Raw
            // values do not participate in the ordinary register family.
            blocks: |p| {
                matches!(
                    p,
                    StyleProperty::FilterRaw(_)
                        | StyleProperty::DropShadowColor(_)
                        | StyleProperty::Filter(FilterFunction::DropShadow, _)
                )
            },
            three: |_| false,
            optional: true,
        },
        // And `backdrop-filter` in this one, with opacity before saturate.
        Family {
            name: "backdrop-filter",
            axes: &[
                "--hozo-backdrop-blur",
                "--hozo-backdrop-brightness",
                "--hozo-backdrop-contrast",
                "--hozo-backdrop-grayscale",
                "--hozo-backdrop-hue-rotate",
                "--hozo-backdrop-invert",
                "--hozo-backdrop-opacity",
                "--hozo-backdrop-saturate",
                "--hozo-backdrop-sepia",
            ],
            axis: |p| match p {
                StyleProperty::BackdropFilter(function, _) => filter_slot(*function, true),
                _ => None,
            },
            value: |p, _| match p {
                StyleProperty::BackdropFilter(_, value) => value.clone(),
                _ => unreachable!(),
            },
            blocks: |p| {
                matches!(p, StyleProperty::BackdropFilter(FilterFunction::DropShadow, _))
                    // StyleX's literal `none` is an authored CSS value, not
                    // Tailwind's empty-sentinel whole-property reset.
                    || matches!(p, StyleProperty::BackdropFilter(FilterFunction::None, value) if !value.is_empty())
            },
            three: |_| false,
            optional: true,
        },
    ];
    let mut used = false;
    for family in &families {
        let touches = |props: &[StyleProperty]| {
            props
                .iter()
                .any(|p| (family.axis)(p).is_some() || (family.three)(p))
        };
        let masks = groups.iter().map(|(_, props)| {
            props.iter().fold(0u16, |axes, p| {
                axes | (family.axis)(p).map_or(0, |index| 1 << index)
                    | if (family.three)(p) { 1 << 2 } else { 0 }
            })
        });
        if !split_register_writers(masks, candidate)
            || groups
                .iter()
                .any(|(_, props)| props.iter().any(|p| (family.blocks)(p)))
        {
            continue;
        }
        if let Some(required) = required.as_deref_mut() {
            // Record the whole reader family, not only today's writers: an
            // unwritten register must stay non-inheriting on a child too.
            required.extend(family.axes.iter().map(|name| {
                name.strip_prefix("--hozo-")
                    .expect("internal family register prefix")
            }));
        }
        let reader = if family.optional {
            family
                .axes
                .iter()
                .map(|register| format!("var({register},)"))
                .collect::<Vec<_>>()
                .join(" ")
        } else {
            let three = groups
                .iter()
                .any(|(_, props)| props.iter().any(|p| (family.three)(p)));
            family.axes[..if three { 3 } else { 2 }]
                .iter()
                .map(|register| format!("var({register})"))
                .collect::<Vec<_>>()
                .join(" ")
        };
        for (_, props) in groups.iter_mut() {
            if !touches(props) {
                continue;
            }
            // A Tailwind reset replaces the filter declaration, not the
            // variables. Keep writes in the same condition, but do not add
            // a reader over the reset. A later rule can read them again.
            let resets_filter = props.iter().any(|p| {
                matches!(
                    (family.name, p),
                    ("filter", StyleProperty::Filter(FilterFunction::None, _))
                        | (
                            "backdrop-filter",
                            StyleProperty::BackdropFilter(FilterFunction::None, _)
                        )
                )
            });
            let mut rewritten = Vec::with_capacity(props.len() + 1);
            for property in props.drain(..) {
                match (family.axis)(&property) {
                    Some(index) => rewritten.push(StyleProperty::Arbitrary(
                        family.axes[index].to_string(),
                        (family.value)(&property, theme),
                    )),
                    None if (family.three)(&property) => {}
                    None => rewritten.push(property),
                }
            }
            if resets_filter {
                *props = rewritten;
                continue;
            }
            if family.name == "backdrop-filter" {
                rewritten.push(StyleProperty::Arbitrary(
                    "-webkit-backdrop-filter".to_string(),
                    reader.clone(),
                ));
            }
            rewritten.push(StyleProperty::Arbitrary(
                family.name.to_string(),
                reader.clone(),
            ));
            *props = rewritten;
        }
        used = true;
    }
    used
}
