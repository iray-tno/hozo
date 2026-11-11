//! Compiler-owned box shadow registers. The generated helper joins selected
//! layers; it does not parse class names, CSS, conditions or precedence.
use super::*;

const FIELDS: &[&str] = &[
    "outer",
    "outerColor",
    "insetShadow",
    "insetColor",
    "ringWidth",
    "ringColor",
    "insetRingWidth",
    "insetRingColor",
    "offsetWidth",
    "offsetColor",
    "ringInset",
];

fn index(property: &StyleProperty) -> Option<usize> {
    Some(match property {
        StyleProperty::BoxShadow(_) => 0,
        StyleProperty::ShadowColor(_) => 1,
        StyleProperty::InsetShadow(_) => 2,
        StyleProperty::InsetShadowColor(_) => 3,
        StyleProperty::RingWidth(_) => 4,
        StyleProperty::RingColor(_) => 5,
        StyleProperty::InsetRingWidth(_) => 6,
        StyleProperty::InsetRingColor(_) => 7,
        StyleProperty::RingOffsetWidth(_) => 8,
        StyleProperty::RingOffsetColor(_) => 9,
        StyleProperty::RingInset => 10,
        _ => return None,
    })
}

pub(super) fn is_slot(property: &StyleProperty) -> bool {
    index(property).is_some()
}

pub(super) fn split_across_conditions(declarations: &[StyleDeclaration]) -> bool {
    let mut written: Vec<(&Condition, u16)> = Vec::new();
    for declaration in declarations {
        if matches!(&declaration.property, StyleProperty::Arbitrary(name, _)
            if name == "box-shadow" || name == "boxShadow")
        {
            return false;
        }
        // Folding is sufficient for the base plus one conditional set, or
        // when conditional groups replace exactly the same fields.
        if declaration.condition == Condition::Always {
            continue;
        }
        let Some(index) = index(&declaration.property) else {
            continue;
        };
        if let Some((_, slots)) = written
            .iter_mut()
            .find(|(condition, _)| **condition == declaration.condition)
        {
            *slots |= 1 << index;
        } else {
            written.push((&declaration.condition, 1 << index));
        }
    }
    written.windows(2).any(|pair| pair[0].1 != pair[1].1)
}

fn shadow(value: &str) -> String {
    if value == "none" {
        return "null".to_string();
    }
    let layers: Vec<_> = style::split_shadow_layers(value).collect();
    if !layers
        .iter()
        .any(|layer| style::shadow_paint_parts(layer).is_some())
    {
        return style::js_string(value);
    }
    let parts = layers
        .iter()
        .map(|layer| match style::shadow_paint_parts(layer) {
            Some((head, tail)) => {
                format!("[{}, {}]", style::js_string(head), style::js_string(tail))
            }
            None => style::js_string(layer.trim()),
        })
        .collect::<Vec<_>>()
        .join(", ");
    format!("{{ value: {}, parts: [{parts}] }}", style::js_string(value))
}

pub(super) fn metadata(props: &[StyleProperty], theme: &Theme) -> Option<String> {
    let mut seen = 0u16;
    let fields: Vec<_> = props
        .iter()
        .filter_map(|property| {
            let index = index(property)?;
            let bit = 1 << index;
            // The AOT literal writer takes the first of each normalized field.
            if seen & bit != 0 {
                return None;
            }
            seen |= bit;
            let value = match property {
                StyleProperty::BoxShadow(value) | StyleProperty::InsetShadow(value) => {
                    shadow(value)
                }
                StyleProperty::RingWidth(value)
                | StyleProperty::InsetRingWidth(value)
                | StyleProperty::RingOffsetWidth(value) => value.px(theme).to_string(),
                StyleProperty::ShadowColor(value)
                | StyleProperty::InsetShadowColor(value)
                | StyleProperty::RingColor(value)
                | StyleProperty::InsetRingColor(value)
                | StyleProperty::RingOffsetColor(value) => {
                    if value.is_initial() {
                        "null".to_string()
                    } else {
                        style::resolve_theme_color(value, theme)
                    }
                }
                StyleProperty::RingInset => "true".to_string(),
                _ => unreachable!(),
            };
            Some(format!("{}: {value}", FIELDS[index]))
        })
        .collect();
    (!fields.is_empty()).then(|| format!("{{ {} }}", fields.join(", ")))
}

pub(super) fn defaults() -> String {
    format!(
        "{{ ring: {}, offset: {} }}",
        style::js_string(style::RING_COLOR),
        style::js_string(style::RING_OFFSET_COLOR)
    )
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
