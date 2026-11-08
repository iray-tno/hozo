//! CSS transform slots survive resets; RN's single array does not. Keep the
//! slot state only at boundaries that need it, without putting private keys
//! into StyleSheet objects or adding subscriptions to ordinary components.

use super::*;

pub(crate) fn is_reset(property: &StyleProperty) -> bool {
    matches!(
        property,
        StyleProperty::RotateNone
            | StyleProperty::ScaleNone
            | StyleProperty::TranslateNone
            | StyleProperty::TransformNone
    )
}

pub(crate) fn is_control(property: &StyleProperty) -> bool {
    is_reset(property) || matches!(property, StyleProperty::TransformEmpty)
}

/// The transform slots a write fills, as bits.
fn slots(property: &StyleProperty) -> u32 {
    match property {
        StyleProperty::TranslateX(_) => 1,
        StyleProperty::TranslateY(_) => 1 << 1,
        StyleProperty::TranslateZ(_) => 1 << 2,
        StyleProperty::Translate(_) => 0b111,
        StyleProperty::ScaleX(_) => 1 << 3,
        StyleProperty::ScaleY(_) => 1 << 4,
        StyleProperty::ScaleZ(_) | StyleProperty::Scale3d => 1 << 5,
        StyleProperty::Scale(_) => 0b111 << 3,
        StyleProperty::Rotate(_) => 1 << 6,
        StyleProperty::RotateX(_) => 1 << 7,
        StyleProperty::RotateY(_) => 1 << 8,
        StyleProperty::RotateZ(_) => 1 << 9,
        StyleProperty::SkewX(_) => 1 << 10,
        StyleProperty::SkewY(_) => 1 << 11,
        StyleProperty::Transform(_) => 0b11111 << 7,
        _ => 0,
    }
}

/// Whether two conditions write different transform slots.
///
/// Each condition's style object carries a whole `transform` array, and RN
/// lets the later array replace the earlier one. CSS keeps every slot in its
/// own property or register instead: `md:translate-x-8 translate-y-2` is
/// `32px 8px` at md, where the md array alone is `[{ translateX: 32 }]`, and
/// `md:rotate-45 translate-x-2` keeps the translate. Slots compose them at
/// runtime. Conditions that all write the same slots (`scale-100
/// active:scale-95`) replace each other exactly as CSS does, and keep the
/// plain array.
pub(crate) fn split_across_conditions<'a>(
    declarations: impl IntoIterator<Item = (&'a StyleProperty, &'a hozo_ir::Condition)>,
) -> bool {
    let mut written: Vec<(&hozo_ir::Condition, u32)> = Vec::new();
    for (property, condition) in declarations {
        let bits = slots(property);
        if bits == 0 {
            continue;
        }
        match written.iter_mut().find(|(seen, _)| *seen == condition) {
            Some((_, slots)) => *slots |= bits,
            None => written.push((condition, bits)),
        }
    }
    written.windows(2).any(|pair| pair[0].1 != pair[1].1)
}

fn array(props: Vec<StyleProperty>, theme: &Theme) -> String {
    style::transform_entry(&props, theme).map_or_else(|| "[]".into(), |(_, value)| value)
}

fn position(props: &[StyleProperty], predicate: impl Fn(&StyleProperty) -> bool) -> Option<usize> {
    props.iter().rposition(predicate)
}

pub(crate) fn metadata(props: &[StyleProperty], theme: &Theme) -> Option<String> {
    let mut fields = Vec::new();
    let translate_slots: Vec<_> = props
        .iter()
        .filter(|p| {
            matches!(
                p,
                StyleProperty::TranslateX(_)
                    | StyleProperty::TranslateY(_)
                    | StyleProperty::TranslateZ(_)
            )
        })
        .cloned()
        .collect();
    let scale_slots: Vec<_> = props
        .iter()
        .filter(|p| {
            matches!(
                p,
                StyleProperty::ScaleX(_)
                    | StyleProperty::ScaleY(_)
                    | StyleProperty::ScaleZ(_)
                    | StyleProperty::Scale3d
            )
        })
        .cloned()
        .collect();
    let function_slots: Vec<_> = props
        .iter()
        .filter(|p| {
            matches!(
                p,
                StyleProperty::RotateX(_)
                    | StyleProperty::RotateY(_)
                    | StyleProperty::RotateZ(_)
                    | StyleProperty::SkewX(_)
                    | StyleProperty::SkewY(_)
            )
        })
        .cloned()
        .collect();
    for (name, slots, authored, reset, control) in [
        (
            "translate",
            translate_slots,
            position(props, |p| matches!(p, StyleProperty::Translate(_))),
            position(props, |p| matches!(p, StyleProperty::TranslateNone)),
            None,
        ),
        (
            "scale",
            scale_slots,
            position(props, |p| matches!(p, StyleProperty::Scale(_))),
            position(props, |p| matches!(p, StyleProperty::ScaleNone)),
            None,
        ),
        (
            "functions",
            function_slots,
            position(props, |p| matches!(p, StyleProperty::Transform(_))),
            position(props, |p| matches!(p, StyleProperty::TransformNone)),
            position(props, |p| matches!(p, StyleProperty::TransformEmpty)),
        ),
    ] {
        let last_slot = position(props, |p| slots.iter().any(|slot| slot == p));
        if slots.is_empty() && authored.is_none() && reset.is_none() && control.is_none() {
            continue;
        }
        if !slots.is_empty() {
            if name == "scale" {
                fields.push(format!(
                    "scale3d: {}",
                    slots.iter().any(|p| matches!(p, StyleProperty::Scale3d))
                ));
            }
            fields.push(format!("{name}Slots: {}", array(slots, theme)));
        }
        if let Some(index) = authored {
            fields.push(format!(
                "{name}Authored: {}",
                array(vec![props[index].clone()], theme)
            ));
        }
        let mode = if reset > last_slot && reset > authored && reset > control {
            "none"
        } else if authored > last_slot && authored > control {
            "authored"
        } else {
            "slots"
        };
        fields.push(format!("{name}: '{mode}'"));
    }
    let rotation = position(props, |p| matches!(p, StyleProperty::Rotate(_)));
    let reset = position(props, |p| matches!(p, StyleProperty::RotateNone));
    if rotation.is_some() || reset.is_some() {
        let value = if reset > rotation {
            "[]".into()
        } else {
            array(vec![props[rotation.unwrap()].clone()], theme)
        };
        fields.push(format!("rotate: {value}"));
    }
    (!fields.is_empty()).then(|| format!("{{ {} }}", fields.join(", ")))
}

pub(super) fn specs(entries: &[StyleEntry], theme: &Theme) -> String {
    let dark = theme.dark();
    entries
        .iter()
        .filter_map(|(name, props, is_dark)| {
            let palette = if *is_dark {
                dark.as_ref().unwrap_or(theme)
            } else {
                theme
            };
            metadata(props, palette).map(|metadata| format!("[{STYLE_OBJECT}.{name}, {metadata}]"))
        })
        .collect::<Vec<_>>()
        .join(", ")
}
