//! Compiler-only style callbacks consumed by the pattern's actual owner.
//!
//! Do not mark a whole pattern as a Pressable: a row, its remove button and
//! its label can have different state, and none publishes a Text context.

use hozo_ir::Primitive;

pub(super) fn interaction_style_prop(primitive: Primitive, class_prop: &str) -> Option<&'static str> {
    match (primitive, class_prop) {
        // Chip supplies its toggle state, or ancestor hover/press with no
        // focus for a composite/plain row. Removal always has its own state.
        (Primitive::Chip, "className") => Some("hozoStyle"),
        (Primitive::Chip, "removeClassName") => Some("hozoRemoveStyle"),
        // The root, slider, thumb and hex input do not share this owner.
        (Primitive::ColorPicker, "swatchClassName") => Some("hozoSwatchStyle"),
        (Primitive::ColorPicker, "selectedSwatchClassName") => Some("hozoSelectedSwatchStyle"),
        (Primitive::Pagination, "itemClassName") => Some("hozoItemStyle"),
        (Primitive::Pagination, "currentItemClassName") => Some("hozoCurrentItemStyle"),
        (Primitive::Pagination, "disabledItemClassName") => Some("hozoDisabledItemStyle"),
        _ => None,
    }
}
