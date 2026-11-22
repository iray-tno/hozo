//! The single state a condition tests, when it tests only one.

/// The Tailwind variant in `token` that Hozo does not compile, if that is
/// why nothing was produced for it.
///
/// The form-state condition inside `condition`, if there is one.
///
/// Looks through the wrappers rather than only at the top, because
/// `md:required:` and `not-invalid:` are the same claim about the same
/// element. `group-` and `peer-` are *not* looked through: those move the
/// condition onto a different element, and whether that one is a form
/// control is not something this element's primitive can answer.
pub(super) fn form_state_atom(condition: &hozo_ir::Condition) -> Option<hozo_ir::FormState> {
    match condition {
        hozo_ir::Condition::FormState(state) => Some(*state),
        hozo_ir::Condition::Not(inner) => form_state_atom(inner),
        hozo_ir::Condition::All(conditions) => conditions.iter().find_map(form_state_atom),
        _ => None,
    }
}

/// Whether `condition` asks this element itself to be open. Looks through
/// `md:open:` but not `not-open:`, which on an element that is never open
/// always applies rather than never.
pub(super) fn open_atom(condition: &hozo_ir::Condition) -> bool {
    match condition {
        hozo_ir::Condition::Open => true,
        hozo_ir::Condition::All(conditions) => conditions.iter().any(open_atom),
        _ => false,
    }
}

/// The checkbox, radio or default-button state `condition` asks this
/// element itself to be in, the way `open_atom` reads `open:`: through
/// `md:checked:`, not through `not-checked:`, which on an element that is
/// never checked always applies.
pub(super) fn control_atom(condition: &hozo_ir::Condition) -> Option<hozo_ir::ControlState> {
    match condition {
        hozo_ir::Condition::Control(state) => Some(*state),
        hozo_ir::Condition::All(conditions) => conditions.iter().find_map(control_atom),
        _ => None,
    }
}
