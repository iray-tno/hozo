//! Compiler-only style callbacks consumed by the pattern's actual owner.
//!
//! Do not mark a whole pattern as a Pressable: a row, its remove button and
//! its label can have different state, and none publishes a Text context.

use hozo_ir::{Condition, FormState, Primitive};

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

// The root/slider/thumb/hex input do not share the swatch's owner. Removal
// never borrows a Chip row's focus, and OTP observes only real input focus.
// The build-time catalog supplies these capabilities and the semantic ABI;
// no metadata is loaded or traversed by the application's render path.
include!("pattern_contracts.rs");

pub(super) fn interaction_style_prop(
    primitive: Primitive,
    class_prop: &str,
) -> Option<&'static str> {
    interaction_slot(primitive, class_prop).map(|slot| slot.style_prop)
}
