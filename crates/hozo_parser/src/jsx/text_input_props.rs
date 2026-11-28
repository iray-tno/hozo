//! A `TextInput`'s React Native props, captured for each backend to write in
//! its own spelling instead of passed through.

use hozo_ir::{Diagnostic, Primitive, PropSet, SourceSpan};
use oxc_ast::ast::JSXAttribute;

use super::props::{capture_flag, capture_literal, capture_prop_expr};
use super::scope::Scope;

/// Whether `name` is a `TextInput` prop this primitive captures.
pub(super) fn reads(primitive: Primitive, name: &str) -> bool {
    primitive == Primitive::TextInput
        && matches!(
            name,
            "onChangeText"
                | "editable"
                | "readOnly"
                | "required"
                | "autoCorrect"
                | "multiline"
                | "secureTextEntry"
                | "numberOfLines"
                | "keyboardType"
                | "inputMode"
        )
}

pub(super) fn capture(
    name: &str,
    attr: &JSXAttribute,
    props: &mut PropSet,
    scope: &Scope,
    diagnostics: &mut Vec<Diagnostic>,
    consumed: &mut Vec<SourceSpan>,
) {
    match name {
        "onChangeText" => capture_prop_expr(
            attr,
            &mut props.text_input.on_change_text,
            &mut props.passthrough,
            scope,
            diagnostics,
            consumed,
        ),
        "editable" => capture_flag(
            attr,
            &mut props.text_input.editable,
            &mut props.passthrough,
            scope,
            diagnostics,
            consumed,
        ),
        "readOnly" => capture_flag(
            attr,
            &mut props.text_input.read_only,
            &mut props.passthrough,
            scope,
            diagnostics,
            consumed,
        ),
        "required" => capture_flag(
            attr,
            &mut props.text_input.required,
            &mut props.passthrough,
            scope,
            diagnostics,
            consumed,
        ),
        "autoCorrect" => capture_flag(
            attr,
            &mut props.text_input.auto_correct,
            &mut props.passthrough,
            scope,
            diagnostics,
            consumed,
        ),
        "multiline" => capture_flag(
            attr,
            &mut props.text_input.multiline,
            &mut props.passthrough,
            scope,
            diagnostics,
            consumed,
        ),
        "secureTextEntry" => capture_flag(
            attr,
            &mut props.text_input.secure_text_entry,
            &mut props.passthrough,
            scope,
            diagnostics,
            consumed,
        ),
        "numberOfLines" => capture_prop_expr(
            attr,
            &mut props.text_input.number_of_lines,
            &mut props.passthrough,
            scope,
            diagnostics,
            consumed,
        ),
        "keyboardType" => capture_literal(
            attr,
            &mut props.text_input.keyboard_type,
            &mut props.passthrough,
            scope,
            diagnostics,
            consumed,
        ),
        "inputMode" => capture_literal(
            attr,
            &mut props.text_input.input_mode,
            &mut props.passthrough,
            scope,
            diagnostics,
            consumed,
        ),
        _ => unreachable!("only names `reads` accepted"),
    }
}
