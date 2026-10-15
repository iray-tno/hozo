//! Compiler-only style callbacks consumed by the pattern's actual owner.
//!
//! Do not mark a whole pattern as a Pressable: a row, its remove button and
//! its label can have different state, and none publishes a Text context.

use hozo_ir::{Condition, Primitive};

// These facts describe the Web class owner, not the Native accessibility
// announcement. In particular a composite Chip's className belongs to a
// span even though a checked toggle button lives inside it.
pub(super) fn semantic_binding(primitive: Primitive, class_prop: &str, condition: &Condition) -> Option<&'static str> {
    if primitive != Primitive::Chip || !matches!(class_prop, "className" | "removeClassName") {
        return None;
    }
    match condition {
        Condition::Disabled => Some("__hozoSlotDisabled"),
        Condition::Enabled => Some("__hozoSlotEnabled"),
        Condition::Aria(state) if state == "pressed" => Some("__hozoSlotAriaPressed"),
        // Neither Web owner writes these attributes, including when disabled.
        Condition::Aria(state) if matches!(state.as_str(), "checked" | "disabled") => Some("false"),
        _ => None,
    }
}

pub(super) fn semantic_parameters(primitive: Primitive) -> &'static str {
    if primitive == Primitive::Chip {
        ", disabled: __hozoSlotDisabled, enabled: __hozoSlotEnabled, 'aria-pressed': __hozoSlotAriaPressed"
    } else {
        ""
    }
}

pub(super) struct InteractionSlot {
    pub style_prop: &'static str,
    // Some Web slots are pointer targets while focus stays on an input.
    // Native button focus must not silently become that slot's CSS focus.
    pub focus: bool,
    pub pointer: bool,
    // A Stepper slot can become a descriptive row at runtime. Interaction
    // predicates (including negation) require the button to exist; base and
    // ambient styles still apply to the descriptive row.
    pub optional_owner: Option<&'static str>,
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
        (Primitive::Stepper, "stepClassName") => ("hozoStepStyle", true),
        (Primitive::Stepper, "completedStepClassName") => ("hozoCompletedStepStyle", true),
        (Primitive::Stepper, "currentStepClassName") => ("hozoCurrentStepStyle", true),
        (Primitive::Stepper, "errorStepClassName") => ("hozoErrorStepStyle", true),
        (Primitive::OtpInput, "inputClassName") => ("hozoInputStyle", true),
        _ => return None,
    };
    let optional_owner = (primitive == Primitive::Stepper).then_some("onStepPress");
    let pointer = primitive != Primitive::OtpInput;
    Some(InteractionSlot { style_prop, focus, pointer, optional_owner })
}

pub(super) fn interaction_style_prop(primitive: Primitive, class_prop: &str) -> Option<&'static str> {
    interaction_slot(primitive, class_prop).map(|slot| slot.style_prop)
}
