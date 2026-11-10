//! RN has one filter string; CSS conditions write independent function slots.
//! Keep the compiler's function order and only compose split boundaries.

use super::*;
use hozo_ir::FilterFunction;

fn opaque_register(property: &StyleProperty) -> bool {
    matches!(
        property,
        StyleProperty::DropShadowColor(_) | StyleProperty::Filter(FilterFunction::DropShadow, _)
    )
}

pub(super) fn split_across_conditions(declarations: &[hozo_ir::StyleDeclaration]) -> bool {
    // Drop-shadow colour/size registers and animation endpoints need their
    // own composition proof. Keep their existing lowering rather than partly
    // adopting a chain whose colour or frame we cannot yet reconstruct.
    if declarations.iter().any(|d| opaque_register(&d.property)) {
        return false;
    }
    let mut written: Vec<(&Condition, u32)> = Vec::new();
    for declaration in declarations {
        let bits = match &declaration.property {
            StyleProperty::Filter(function, _) => 1 << (*function as u32),
            StyleProperty::FilterRaw(_) => 1 << 31,
            _ => continue,
        };
        match written
            .iter_mut()
            .find(|(seen, _)| *seen == &declaration.condition)
        {
            Some((_, slots)) => *slots |= bits,
            None => written.push((&declaration.condition, bits)),
        }
    }
    written.windows(2).any(|pair| pair[0].1 != pair[1].1)
}

pub(super) fn metadata(props: &[StyleProperty]) -> Option<String> {
    if props.iter().any(opaque_register) {
        return None;
    }
    let mut slots = Vec::new();
    let mut mode = None;
    let mut authored = None;
    for property in props {
        match property {
            StyleProperty::Filter(FilterFunction::None, _) => mode = Some("none"),
            StyleProperty::Filter(function, value) => {
                slots.push(format!(
                    "[{}, {}]",
                    *function as u32,
                    style::js_string(value)
                ));
                mode = Some("slots");
            }
            StyleProperty::FilterRaw(value) => {
                authored = Some(style::js_string(value));
                mode = Some("authored");
            }
            _ => {}
        }
    }
    let mode = mode?;
    let authored = authored.map_or_else(String::new, |value| format!(", authored: {value}"));
    Some(format!(
        "{{ mode: '{mode}', slots: [{}]{authored} }}",
        slots.join(", ")
    ))
}

pub(super) fn specs(entries: &[StyleEntry]) -> String {
    entries
        .iter()
        .filter_map(|(name, props, _)| {
            metadata(props).map(|metadata| format!("[{STYLE_OBJECT}.{name}, {metadata}]"))
        })
        .collect::<Vec<_>>()
        .join(", ")
}
