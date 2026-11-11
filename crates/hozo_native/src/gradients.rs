//! Selected Native gradient contributions share registers, not copied bases.
//! Slot values, defaults and constructor normalization stay compiler-owned.

use super::*;
use hozo_ir::{Dimension, GradientKind, GradientStop};

pub(super) struct Metadata {
    pub code: String,
    slots: u16,
}

impl Metadata {
    // Constructors already write backgroundImage. Only independently composed
    // fields need a second key space in the build-time conflict evidence.
    pub fn composition_keys(&self) -> Vec<String> {
        (1..7)
            .filter(|index| self.slots & (1 << index) != 0)
            .map(|index| format!("gradient:{index}"))
            .collect()
    }

    pub fn has_stops(&self) -> bool {
        self.slots & !1 != 0
    }
}

fn slot(property: &StyleProperty) -> u16 {
    match property {
        StyleProperty::Gradient(..)
        | StyleProperty::BackgroundImageNone
        | StyleProperty::BackgroundImage(_) => 1,
        StyleProperty::GradientStopColor(stop, _) => 1 << (1 + *stop as u16 * 2),
        StyleProperty::GradientStopPosition(stop, _) => 1 << (2 + *stop as u16 * 2),
        _ => 0,
    }
}

fn unassessed(property: &StyleProperty) -> bool {
    matches!(property, StyleProperty::Gradient(GradientKind::Conic, _))
        || matches!(property, StyleProperty::GradientStopPosition(_, value) if !matches!(value, Dimension::Percent(_)))
}

pub(super) fn split_across_conditions(declarations: &[StyleDeclaration]) -> bool {
    if declarations.iter().any(|d| unassessed(&d.property)) {
        return false;
    }
    let mut written: Vec<(&Condition, u16)> = Vec::new();
    for declaration in declarations {
        // Base + one conditional group is already correct through folding.
        // Composition is needed when independent conditional parts coexist.
        if declaration.condition == Condition::Always {
            continue;
        }
        let bits = slot(&declaration.property);
        if bits == 0 {
            continue;
        }
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

pub(super) fn metadata(props: &[StyleProperty], theme: &Theme) -> Option<Metadata> {
    if props.iter().any(unassessed) {
        return None;
    }
    let mut image = None;
    let mut colors = Vec::new();
    let mut positions = Vec::new();
    for property in props {
        match property {
            StyleProperty::BackgroundImageNone => image = Some("null".into()),
            StyleProperty::BackgroundImage(value) => image = Some(style::js_string(value)),
            StyleProperty::Gradient(kind, prelude) => {
                image = Some(format!(
                    "{{ kind: {}, prelude: {} }}",
                    style::js_string(kind.css()),
                    style::js_string(style::gradient_prelude(prelude))
                ))
            }
            StyleProperty::GradientStopColor(stop, color) => colors.push(format!(
                "[{}, {}]",
                *stop as u16,
                if color.is_initial() {
                    "null".into()
                } else {
                    style::resolve_theme_color(color, theme)
                }
            )),
            StyleProperty::GradientStopPosition(stop, Dimension::Percent(value)) => {
                positions.push(format!(
                    "[{}, {}]",
                    *stop as u16,
                    style::js_string(&format!("{value}%"))
                ));
            }
            _ => {}
        }
    }
    let mut fields = Vec::new();
    if let Some(image) = image {
        fields.push(format!("image: {image}"));
    }
    if !colors.is_empty() {
        fields.push(format!("colors: [{}]", colors.join(", ")));
    }
    if !positions.is_empty() {
        fields.push(format!("positions: [{}]", positions.join(", ")));
    }
    (!fields.is_empty()).then(|| Metadata {
        code: format!("{{ {} }}", fields.join(", ")),
        slots: props.iter().fold(0, |all, property| all | slot(property)),
    })
}

pub(super) fn defaults() -> String {
    let positions = [GradientStop::From, GradientStop::Via, GradientStop::To]
        .map(|stop| style::js_string(stop.default_position()));
    format!(
        "{{ color: {}, positions: [{}] }}",
        style::js_string(style::GRADIENT_EMPTY_COLOR),
        positions.join(", ")
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
            metadata(props, palette)
                .map(|metadata| format!("[{STYLE_OBJECT}.{name}, {}]", metadata.code))
        })
        .collect::<Vec<_>>()
        .join(", ")
}
