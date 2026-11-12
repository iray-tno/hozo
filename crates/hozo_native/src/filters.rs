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

pub(super) fn can_mix(declarations: &[hozo_ir::StyleDeclaration]) -> bool {
    declarations.iter().any(|d| slot(&d.property) != 0)
}

pub(super) fn can_compose(declarations: &[hozo_ir::StyleDeclaration]) -> bool {
    // Drop-shadow's colour and size registers cannot yet be reconstructed.
    !declarations.iter().any(|d| opaque_register(&d.property))
}

fn slot(property: &StyleProperty) -> u32 {
    match property {
        StyleProperty::Filter(function, _) => 1 << (*function as u32),
        StyleProperty::FilterRaw(_) => 1 << 31,
        _ => 0,
    }
}

pub(super) fn split_across_entries(entries: &[StyleEntry]) -> bool {
    let mut writers = entries
        .iter()
        .map(|(_, props, _)| props.iter().fold(0, |mask, property| mask | slot(property)))
        .filter(|&mask| mask != 0);
    writers
        .next()
        .is_some_and(|first| writers.any(|mask| mask != first))
}

pub(super) struct Metadata {
    pub code: String,
    /// Function identities, collected by the same pass that writes the slots.
    pub functions: u32,
}

pub(super) fn metadata(props: &[StyleProperty]) -> Option<Metadata> {
    if props.iter().any(opaque_register) {
        return None;
    }
    let mut slots = Vec::new();
    let mut mode = None;
    let mut authored = None;
    let mut functions = 0u32;
    for property in props {
        match property {
            StyleProperty::Filter(FilterFunction::None, _) => mode = Some("none"),
            StyleProperty::Filter(function, value) => {
                functions |= 1 << (*function as u32);
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
    Some(Metadata {
        code: format!(
            "{{ mode: '{mode}', slots: [{}]{authored} }}",
            slots.join(", ")
        ),
        functions,
    })
}

pub(super) fn specs(entries: &[StyleEntry]) -> String {
    entries
        .iter()
        .filter_map(|(name, props, _)| {
            metadata(props).map(|metadata| format!("[{STYLE_OBJECT}.{name}, {}]", metadata.code))
        })
        .collect::<Vec<_>>()
        .join(", ")
}
