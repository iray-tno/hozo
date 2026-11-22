//! A `TextInput`'s React Native props in the DOM's spelling: `onChangeText`
//! through the fallback's wrapper, `editable`/`readOnly`, `secureTextEntry`,
//! `autoCorrect`, the input mode, and a textarea's rows.

use hozo_ir::Node;

use crate::*;

pub(crate) fn text_input_attrs(node: &Node, source: &str, attrs: &mut String) {
    // Every one of these was passed through before, which is the right
    // default for a prop only React Native has and the wrong one for a
    // prop the DOM has and spells differently. `onChangeText` reached
    // `<input onChangeText={…}>`: the field rendered, React warned, and
    // typing in it did nothing.
    if !node.props.text_input.is_empty() {
        let text_input = &node.props.text_input;
        if let Some(handler) = text_input.on_change_text {
            // The wrapper the fallback `TextInput` in `@hozo/core` has
            // always written, generated here instead. Parenthesised
            // because the handler is an arbitrary expression and
            // `a || b` beside a call would bind the wrong way. Optional,
            // because a wrapper passing its own optional prop on hands
            // over `undefined`, and typing must not throw (#1118).
            attrs.push_str(&format!(
                " onChange={{(event) => ({})?.(event.target.value)}}",
                source_text(source, handler),
            ));
        }
        // Two spellings of one attribute. React Native 0.87 has both, so
        // an author may write either, and `editable` is the negative of
        // the two -- `editable={false}` is `readOnly`.
        if let Some(editable) = text_input.editable.as_ref() {
            attrs.push_str(&match editable {
                hozo_ir::ConditionExpr::Static(true) => String::new(),
                hozo_ir::ConditionExpr::Static(false) => " readOnly".to_string(),
                other => format!(" readOnly={{!({})}}", render_condition_expr(source, other)),
            });
        }
        if let Some(read_only) = text_input.read_only.as_ref() {
            attrs.push_str(&boolean_attribute("readOnly", read_only, source));
        }
        if let Some(auto_correct) = text_input.auto_correct.as_ref() {
            attrs.push_str(&match auto_correct {
                hozo_ir::ConditionExpr::Static(true) => " autoCorrect=\"on\"".to_string(),
                hozo_ir::ConditionExpr::Static(false) => " autoCorrect=\"off\"".to_string(),
                other => format!(
                    // Evaluate an arbitrary author expression once, preserving
                    // `undefined` (the platform default) rather than disabling it.
                    " autoCorrect={{((value) => value === undefined ? undefined : value ? 'on' : 'off')({})}}",
                    render_condition_expr(source, other),
                ),
            });
        }
        if let Some(secure) = text_input.secure_text_entry.as_ref() {
            attrs.push_str(&match secure {
                hozo_ir::ConditionExpr::Static(true) => " type=\"password\"".to_string(),
                hozo_ir::ConditionExpr::Static(false) => String::new(),
                other => format!(
                    " type={{({}) ? 'password' : 'text'}}",
                    render_condition_expr(source, other),
                ),
            });
        }
        if let Some(mode) = text_input.dom_input_mode() {
            attrs.push_str(&format!(" inputMode=\"{mode}\""));
        }
        // `numberOfLines` is only `rows` on the element `multiline`
        // produces. On an `<input>` there are no rows to set.
        if let Some(rows) = text_input.number_of_lines.filter(|_| is_textarea(node)) {
            attrs.push_str(&format!(" rows={{{}}}", source_text(source, rows)));
        }
    }
}
