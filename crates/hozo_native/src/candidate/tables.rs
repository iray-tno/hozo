//! The composition tables the resolver reads after state selection: each
//! keyed by the very style object it applies to, so a composer replaces only
//! its own family's slots.

use super::*;

/// Which tables this map needs, decided from the classified candidates.
#[derive(Clone, Copy)]
pub(super) struct TableFlags {
    pub(super) transforms: bool,
    pub(super) filters: bool,
    pub(super) font_defaults: bool,
    pub(super) text_metrics: bool,
    pub(super) shadow_slots: u16,
}

/// The classified metadata the tables are written from.
pub(super) struct Tables<'n> {
    pub(super) transforms: Vec<(&'n String, String)>,
    pub(super) filters: Vec<(&'n String, crate::filters::Metadata)>,
    pub(super) font_defaults: Vec<&'n String>,
    pub(super) leading_registers: Vec<(&'n String, f64)>,
    pub(super) gradients: Vec<(&'n String, crate::gradients::Metadata)>,
    pub(super) shadows: Vec<(&'n String, crate::shadows::Metadata)>,
}

/// Writes the tables into `body`. Returns whether it wrote the leading
/// registers and the gradient table, which the exports below also need.
pub(super) fn write_tables(
    body: &mut String,
    flags: TableFlags,
    tables: Tables<'_>,
    states: &[(&String, Vec<StateGroup>)],
) -> (bool, bool) {
    let Tables {
        transforms,
        filters,
        font_defaults,
        leading_registers,
        gradients,
        shadows,
    } = tables;
    if flags.transforms {
        body.push_str("const transforms = new Map([\n");
        for (name, metadata) in transforms {
            body.push_str(&format!("  [styles[{}], {metadata}],\n", quote(name)));
        }
        // The key is the same object the resolver merges, not a copy or a
        // class name. A conditional scale then replaces only scale slots,
        // rather than being mistaken for an authored whole-array override.
        for (name, groups) in states {
            for (index, group) in groups.iter().enumerate() {
                if let Some(metadata) = &group.transform {
                    body.push_str(&format!(
                        "  [states[{}][{index}][1], {metadata}],\n",
                        quote(name)
                    ));
                }
            }
        }
        // A transform-bearing project can still resolve thousands of plain
        // class strings. Skip composition unless this particular list needs
        // it; the resolver continues to cache its unconditional result.
        body.push_str("])\n\n");
    }
    if flags.filters {
        // Index actual style identities once. A selected drop-shadow or any
        // other unassessed whole-filter entry keeps the entire filter chain
        // on its old path, never a partly composed approximation.
        body.push_str("const filters = new Map([\n");
        for (name, metadata) in filters {
            body.push_str(&format!(
                "  [styles[{}], {}],\n",
                quote(name),
                metadata.code
            ));
        }
        for (name, groups) in states {
            for (index, group) in groups.iter().enumerate() {
                if let Some(metadata) = &group.filter {
                    body.push_str(&format!(
                        "  [states[{}][{index}][1], {}],\n",
                        quote(name),
                        metadata.code
                    ));
                }
            }
        }
        body.push_str("])\n\n");
    }
    if flags.font_defaults {
        if flags.text_metrics {
            body.push_str("const fontDefaults = new Map([\n");
        } else {
            // Mixed JSX can supply explicit leading even when the generated
            // map only contains font defaults. Keep identity, not copies.
            body.push_str("const fontDefaults = new Set([\n");
        }
        for name in font_defaults {
            body.push_str(&format!("  styles[{}],\n", quote(name)));
        }
        for (name, groups) in states {
            for (index, group) in groups.iter().enumerate() {
                if group.font_default {
                    body.push_str(&format!("  states[{}][{index}][1],\n", quote(name)));
                }
            }
        }
        if flags.text_metrics {
            body.push_str(
                "].map(style => { const {lineHeight, ...rest} = style; return [style, rest] }))\n\n",
            );
        } else {
            body.push_str("])\n\n");
        }
    }
    let uses_leading_registers = !leading_registers.is_empty();
    if uses_leading_registers {
        body.push_str("const leadingRegisters = new Map([\n");
        for (name, px) in leading_registers {
            body.push_str(&format!(
                "  [styles[{}], {{ lineHeight: {px} }}],\n",
                quote(name)
            ));
        }
        body.push_str("])\n\n");
    }
    let has_gradient_slots = !gradients.is_empty()
        || states
            .iter()
            .any(|(_, groups)| groups.iter().any(|group| group.gradient.is_some()));
    if has_gradient_slots {
        write_composition_table(
            body,
            "gradients",
            gradients
                .iter()
                .map(|(name, metadata)| (*name, metadata.code.as_str())),
            states,
            |group| {
                group
                    .gradient
                    .as_ref()
                    .map(|metadata| metadata.code.as_str())
            },
        );
    }
    if flags.shadow_slots != 0 {
        write_composition_table(
            body,
            "shadows",
            shadows
                .iter()
                .map(|(name, metadata)| (*name, metadata.code.as_str())),
            states,
            |group| group.shadow.as_ref().map(|metadata| metadata.code.as_str()),
        );
    }
    (uses_leading_registers, has_gradient_slots)
}
