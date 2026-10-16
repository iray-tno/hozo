//! Compiler-only style callbacks consumed by the pattern's actual owner.
//!
//! Do not mark a whole pattern as a Pressable: a row, its remove button and
//! its label can have different state, and none publishes a Text context.

use hozo_ir::{Condition, FormState, Primitive};

// These facts describe the Web class owner, not the Native accessibility
// announcement. In particular a composite Chip's className belongs to a
// span even though a checked toggle button lives inside it.
pub(super) fn semantic_binding(primitive: Primitive, class_prop: &str, condition: &Condition) -> Option<&'static str> {
    if primitive == Primitive::Chip && matches!(class_prop, "className" | "removeClassName") {
        return match condition {
            Condition::Disabled => Some("__hozoSlotDisabled"),
            Condition::Enabled => Some("__hozoSlotEnabled"),
            Condition::Aria(state) if state == "pressed" => Some("__hozoSlotAriaPressed"),
            // Neither Web owner writes these attributes, including when disabled.
            Condition::Aria(state) if matches!(state.as_str(), "checked" | "disabled") => Some("false"),
            _ => None,
        };
    }
    if primitive == Primitive::Pagination && matches!(class_prop, "itemClassName" | "currentItemClassName" | "disabledItemClassName") {
        return match condition {
            Condition::Disabled => Some("__hozoSlotDisabled"),
            Condition::Enabled => Some("__hozoSlotEnabled"),
            Condition::Aria(state) if state == "disabled" => Some("__hozoSlotAriaDisabled"),
            // Web marks the current page with aria-current, not aria-selected.
            Condition::Aria(state) if state == "selected" => Some("false"),
            _ => None,
        };
    }
    if primitive == Primitive::Stepper && matches!(class_prop, "stepClassName" | "completedStepClassName" | "currentStepClassName" | "errorStepClassName") {
        return match condition {
            Condition::Disabled => Some("__hozoSlotDisabled"),
            Condition::Enabled => Some("__hozoSlotEnabled"),
            // Web uses aria-current on the li, not either of these attributes
            // on the button or descriptive row that owns the classes.
            Condition::Aria(state) if matches!(state.as_str(), "selected" | "disabled") => Some("false"),
            _ => None,
        };
    }
    if primitive == Primitive::ColorPicker && matches!(class_prop, "swatchClassName" | "selectedSwatchClassName") {
        return match condition {
            Condition::Disabled => Some("__hozoSlotDisabled"),
            Condition::Enabled => Some("__hozoSlotEnabled"),
            Condition::Aria(state) if state == "checked" => Some("__hozoSlotAriaChecked"),
            // The Web radio uses disabled and aria-checked, not these
            // attributes. Native announcements are a separate contract.
            Condition::Aria(state) if matches!(state.as_str(), "disabled" | "selected") => Some("false"),
            _ => None,
        };
    }
    if primitive == Primitive::CommandPalette && matches!(class_prop, "itemClassName" | "activeItemClassName") {
        return match condition {
            // Web options are divs, not disabled/enabled form controls.
            Condition::Disabled | Condition::Enabled => Some("false"),
            Condition::Aria(state) if state == "disabled" => Some("__hozoSlotAriaDisabled"),
            Condition::Aria(state) if state == "selected" => Some("__hozoSlotAriaSelected"),
            Condition::Aria(state) if state == "checked" => Some("false"),
            _ => None,
        };
    }
    if primitive == Primitive::OtpInput && class_prop == "inputClassName" {
        return match condition {
            Condition::Disabled => Some("__hozoSlotDisabled"),
            Condition::Enabled => Some("__hozoSlotEnabled"),
            Condition::FormState(FormState::ReadOnly) => Some("__hozoSlotReadOnly"),
            Condition::Aria(state) if matches!(state.as_str(), "disabled" | "selected" | "checked") => Some("false"),
            _ => None,
        };
    }
    if primitive == Primitive::OtpInput && matches!(class_prop, "className" | "cellClassName" | "activeCellClassName" | "filledCellClassName") {
        return match condition {
            Condition::Disabled | Condition::Enabled => Some("false"),
            // Non-editable divs and spans match :read-only, independently
            // of whether the separate input is disabled or readonly.
            Condition::FormState(FormState::ReadOnly) => Some("true"),
            Condition::Aria(state) if matches!(state.as_str(), "disabled" | "selected" | "checked") => Some("false"),
            _ => None,
        };
    }
    None
}

pub(super) fn semantic_parameters(primitive: Primitive) -> &'static str {
    if primitive == Primitive::Chip {
        ", disabled: __hozoSlotDisabled, enabled: __hozoSlotEnabled, 'aria-pressed': __hozoSlotAriaPressed"
    } else if primitive == Primitive::Pagination {
        ", disabled: __hozoSlotDisabled, enabled: __hozoSlotEnabled, 'aria-disabled': __hozoSlotAriaDisabled"
    } else if primitive == Primitive::Stepper {
        ", disabled: __hozoSlotDisabled, enabled: __hozoSlotEnabled"
    } else if primitive == Primitive::ColorPicker {
        ", disabled: __hozoSlotDisabled, enabled: __hozoSlotEnabled, 'aria-checked': __hozoSlotAriaChecked"
    } else if primitive == Primitive::CommandPalette {
        ", 'aria-disabled': __hozoSlotAriaDisabled, 'aria-selected': __hozoSlotAriaSelected"
    } else if primitive == Primitive::OtpInput {
        ", disabled: __hozoSlotDisabled, enabled: __hozoSlotEnabled, readOnly: __hozoSlotReadOnly"
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
