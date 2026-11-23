//! `onPress` on Web: `onClick` on a DOM element, a guarded handler on a
//! disabled anchor, or the one `hozoInteractive` call for a control Hozo
//! made focusable itself.

use hozo_ir::{Primitive, SourceCopy};

use crate::{source_evidence, source_text, Element, WebRenderContext};

/// `synthesized_control` is whether Hozo put this element in the tab order
/// (its `tabIndex` is in the emitted attributes).
pub(crate) fn on_press_attrs(
    element: Element<'_>,
    synthesized_control: bool,
    attrs: &mut String,
    attr_copies: &mut Option<Vec<SourceCopy>>,
    cx: &mut WebRenderContext<'_>,
) {
    let Element {
        node,
        tag,
        disabled_expr,
        is_hozo_component,
    } = element;
    let source = cx.source;
    if let Some(on_press) = node.props.on_press {
        let name = if is_hozo_component {
            "onPress"
        } else {
            "onClick"
        };
        // Not when the author already wrote the name this maps onto.
        //
        // `onPress` is React Native's spelling and becomes `onClick` here,
        // so an element carrying both got `onClick` twice. JSX resolves a
        // duplicate last-wins and the passthrough is emitted last, so the
        // author's `onClick` won and their `onPress` was dropped in
        // silence -- the prop the compiler models losing to the one it
        // carries, which is backwards.
        //
        // The Native backend already guards its semantic props this way,
        // for the same reason and with the same treatment of a spread: its
        // contents are unknowable here, so the mapping stays, and if the
        // spread does carry the prop it lands last and still wins.
        let authored_target = node
            .props
            .passthrough
            .iter()
            .filter(|prop| !prop.is_spread)
            .filter_map(|prop| prop.name.as_deref())
            .any(|prop| prop == name);
        // Keyed off `tabIndex` being in the emitted attributes rather than
        // off the primitive: that attribute *is* the statement that Hozo
        // made this element focusable itself, so "Hozo put it in the tab
        // order" and "Hozo owes it the rest of being a control" cannot
        // drift apart.
        if tag == "a" && disabled_expr.is_some() && !authored_target {
            // Anchors have no native disabled state. Keep the real href
            // for copying, SEO, and browser menus, but suppress ordinary
            // activation while disabled. The uncompiled HozoLink uses the
            // same conditional handler shape.
            // `event` binds only the disabled arm, not the authored handler
            // in the other arm. Trace that value, not the generated callback.
            let prefix = format!(
                " onClick={{({}) ? (event) => event.preventDefault() : ",
                disabled_expr.as_deref().unwrap_or("false"),
            );
            source_evidence::expression(
                attrs,
                attr_copies,
                source,
                &source_text(source, on_press),
                &prefix,
                "}",
            );
        } else if synthesized_control {
            // One call, not five expressions. `disabled` means five things
            // at once (see docs/decisions/001) and emitting them
            // separately is how they came apart: this announced
            // `aria-disabled` and then ran the handler anyway, and once
            // keyboard activation existed it ran on Enter and Space too.
            //
            // It also means the guard expression is evaluated once rather
            // than once per thing it decides.
            // The authored function is created in its original scope and
            // passed as a value. The helper does not wrap its source body.
            let suffix = format!(
                "{})}}",
                disabled_expr
                    .as_ref()
                    .map(|expr| format!(", {expr}"))
                    .unwrap_or_default(),
            );
            source_evidence::expression(
                attrs,
                attr_copies,
                source,
                &source_text(source, on_press),
                " {...hozoInteractive(",
                &suffix,
            );
            *cx.uses_key_activation = true;
            // `hozoInteractive` marks the element `data-hozo-pressable`,
            // and the rule that gives it a pointer lives with the view base.
            *cx.uses_view_base = true;
        } else if authored_target {
            cx.diagnostics.push(hozo_ir::Diagnostic {
                code: hozo_ir::DiagnosticCode::PropCollidesWithPlatformName,
                severity: hozo_ir::Severity::Warning,
                message: format!(
                    "`onPress` compiles to `{name}` on Web and this element already has one,                      so the `onPress` handler is not used. Keep whichever you meant."
                ),
                span: node.span,
            });
        } else {
            source_evidence::expression(
                attrs,
                attr_copies,
                source,
                &source_text(source, on_press),
                &format!(" {name}={{"),
                "}",
            );
            // A real `<button>` is a control already, but since Tailwind
            // v4's Preflight its cursor is `default`. The same marker as a
            // synthesized control; the rule itself skips `:disabled`.
            if node.primitive == Primitive::Button && tag == "button" {
                attrs.push_str(" data-hozo-pressable=\"\"");
                *cx.uses_view_base = true;
            }
        }
    }
}
