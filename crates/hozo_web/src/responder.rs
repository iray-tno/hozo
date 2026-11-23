//! React Native's gesture-responder props, which react-native-web reads
//! under the same names, re-emitted from the expressions written.

use hozo_ir::{Node, SourceCopy};

use crate::*;

pub(crate) fn responder_attrs(
    node: &Node,
    source: &str,
    attrs: &mut String,
    attr_copies: &mut Option<Vec<SourceCopy>>,
) {
    for (name, value) in [
        (
            "onStartShouldSetResponder",
            node.props.on_start_should_set_responder,
        ),
        (
            "onStartShouldSetResponderCapture",
            node.props.on_start_should_set_responder_capture,
        ),
        (
            "onMoveShouldSetResponder",
            node.props.on_move_should_set_responder,
        ),
        (
            "onMoveShouldSetResponderCapture",
            node.props.on_move_should_set_responder_capture,
        ),
        ("onResponderGrant", node.props.on_responder_grant),
        ("onResponderStart", node.props.on_responder_start),
        ("onResponderMove", node.props.on_responder_move),
        ("onResponderEnd", node.props.on_responder_end),
        ("onResponderRelease", node.props.on_responder_release),
        ("onResponderReject", node.props.on_responder_reject),
        ("onResponderTerminate", node.props.on_responder_terminate),
        (
            "onResponderTerminationRequest",
            node.props.on_responder_termination_request,
        ),
    ] {
        if let Some(value) = value {
            source_evidence::expression(
                attrs,
                attr_copies,
                source,
                &source_text(source, value),
                &format!(" {name}={{"),
                "}",
            );
        }
    }
}
