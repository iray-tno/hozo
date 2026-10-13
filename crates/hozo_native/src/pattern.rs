//! Compiler-only style callbacks consumed by the pattern's actual owner.
//!
//! Do not mark a whole pattern as a Pressable: a row, its remove button and
//! its label can have different state, and none publishes a Text context.

use hozo_ir::Primitive;

pub(super) struct InteractionSlot {
    pub style_prop: &'static str,
    // Some Web slots are pointer targets while focus stays on an input.
    // Native button focus must not silently become that slot's CSS focus.
    pub focus: bool,
}

pub(super) fn interaction_slot(primitive: Primitive, class_prop: &str) -> Option<InteractionSlot> {
    let (style_prop, focus) = match (primitive, class_prop) {
        // Chip supplies its toggle state, or ancestor hover/press with no
        // focus for a composite/plain row. Removal always has its own state.
        (Primitive::Chip, "className") => ("hozoStyle", true),
        (Primitive::Chip, "removeClassName") => ("hozoRemoveStyle", true),
        // The root, slider, thumb and hex input do not share this owner.
        (Primitive::ColorPicker, "swatchClassName") => ("hozoSwatchStyle", true),
        (Primitive::ColorPicker, "selectedSwatchClassName") => ("hozoSelectedSwatchStyle", true),
        (Primitive::Pagination, "itemClassName") => ("hozoItemStyle", true),
        (Primitive::Pagination, "currentItemClassName") => ("hozoCurrentItemStyle", true),
        (Primitive::Pagination, "disabledItemClassName") => ("hozoDisabledItemStyle", true),
        (Primitive::CommandPalette, "itemClassName") => ("hozoItemStyle", false),
        (Primitive::CommandPalette, "activeItemClassName") => ("hozoActiveItemStyle", false),
        _ => return None,
    };
    Some(InteractionSlot { style_prop, focus })
}

pub(super) fn interaction_style_prop(primitive: Primitive, class_prop: &str) -> Option<&'static str> {
    interaction_slot(primitive, class_prop).map(|slot| slot.style_prop)
}
