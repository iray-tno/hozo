//! React Native's gesture-responder props: twelve callbacks, each captured
//! into its own field on a host that has a responder (View, Pressable and
//! the touchables), and passed through as written anywhere else.

use hozo_ir::{ExprRef, PassthroughProp, Primitive, PropSet};

/// The props, in the order the match used to list them.
pub(super) const NAMES: [&str; 12] = [
    "onStartShouldSetResponder",
    "onStartShouldSetResponderCapture",
    "onMoveShouldSetResponder",
    "onMoveShouldSetResponderCapture",
    "onResponderGrant",
    "onResponderStart",
    "onResponderMove",
    "onResponderEnd",
    "onResponderRelease",
    "onResponderReject",
    "onResponderTerminate",
    "onResponderTerminationRequest",
];

/// Whether `primitive` renders a host with React Native's responder system.
pub(super) fn has_responder(primitive: Primitive) -> bool {
    matches!(
        primitive,
        Primitive::View
            | Primitive::Pressable
            | Primitive::TouchableOpacity
            | Primitive::TouchableWithoutFeedback
    )
}

/// The field `name` is captured into, beside the passthrough list, or
/// `None` when `name` is not a responder prop.
pub(super) fn fields<'p>(
    props: &'p mut PropSet,
    name: &str,
) -> Option<(&'p mut Option<ExprRef>, &'p mut Vec<PassthroughProp>)> {
    let field = match name {
        "onStartShouldSetResponder" => &mut props.on_start_should_set_responder,
        "onStartShouldSetResponderCapture" => &mut props.on_start_should_set_responder_capture,
        "onMoveShouldSetResponder" => &mut props.on_move_should_set_responder,
        "onMoveShouldSetResponderCapture" => &mut props.on_move_should_set_responder_capture,
        "onResponderGrant" => &mut props.on_responder_grant,
        "onResponderStart" => &mut props.on_responder_start,
        "onResponderMove" => &mut props.on_responder_move,
        "onResponderEnd" => &mut props.on_responder_end,
        "onResponderRelease" => &mut props.on_responder_release,
        "onResponderReject" => &mut props.on_responder_reject,
        "onResponderTerminate" => &mut props.on_responder_terminate,
        "onResponderTerminationRequest" => &mut props.on_responder_termination_request,
        _ => return None,
    };
    Some((field, &mut props.passthrough))
}
