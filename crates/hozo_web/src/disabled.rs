//! What `disabled` and `focusable` become in the DOM: an anchor kept out of
//! activation and the tab order, the attribute a real form control has, ARIA
//! on everything else, `tabIndex` for `focusable`, and the
//! `data-hozo-disabled` hook `disabled:` styles select on.

use hozo_ir::SourceCopy;

use crate::*;

/// A disabled anchor: activation and middle-click prevented, `aria-disabled`,
/// and out of the tab order while unavailable.
pub(crate) fn link_attrs(
    element: Element<'_>,
    source: &str,
    attrs: &mut String,
    attr_copies: &mut Option<Vec<SourceCopy>>,
) {
    let Element {
        node,
        tag,
        disabled_expr,
        ..
    } = element;
    if tag == "a"
        && node.props.on_press.is_none()
        && !node
            .props
            .passthrough
            .iter()
            .any(|prop| prop.name.as_deref() == Some("onClick"))
    {
        if let Some(disabled) = disabled_expr {
            attrs.push_str(&format!(
                " onClick={{({disabled}) ? (event) => event.preventDefault() : undefined}}"
            ));
        }
    }
    if tag == "a" {
        if let Some(disabled) = disabled_expr {
            attrs.push_str(&format!(" aria-disabled={{{disabled}}}"));
            // Keep href available to copying/context menus, but not in the
            // sequential keyboard order while unavailable (decision 001).
            // An authored tabindex is restored only in the enabled branch.
            let authored_tab = node
                .props
                .passthrough
                .iter()
                .find(|prop| prop.name.as_deref() == Some("tabIndex"));
            if let Some(prop) = authored_tab {
                let value = attribute_value_slice(source, prop.span)
                    .unwrap_or(std::borrow::Cow::Borrowed("true"));
                let value = value.as_ref();
                source_evidence::expression(
                    attrs,
                    attr_copies,
                    source,
                    value,
                    &format!(" tabIndex={{({disabled}) ? -1 : ("),
                    ")}",
                );
            } else {
                let enabled = node
                    .props
                    .focusable
                    .as_ref()
                    .map(|value| format!("({}) ? 0 : -1", render_condition_expr(source, value)))
                    .unwrap_or_else(|| "undefined".to_string());
                attrs.push_str(&format!(" tabIndex={{({disabled}) ? -1 : {enabled}}}"));
            }
            if !node
                .props
                .passthrough
                .iter()
                .any(|prop| prop.name.as_deref() == Some("onAuxClick"))
            {
                attrs.push_str(&format!(
                    " onAuxClick={{({disabled}) ? (event) => event.preventDefault() : undefined}}"
                ));
            }
        }
    }
}

/// `disabled` on a form control or a Hozo component, ARIA elsewhere,
/// `focusable` as `tabIndex`, and the styling hook.
pub(crate) fn control_attrs(
    element: Element<'_>,
    synthesized_control: bool,
    source: &str,
    attrs: &mut String,
) {
    let Element {
        node,
        tag,
        disabled_expr,
        is_hozo_component,
    } = element;
    if !synthesized_control && tag != "a" {
        // `disabled` is a real, React-boolean-aware HTML attribute only on
        // actual form controls (<button> here) -- react omits it entirely
        // when the value is falsy. Everything else Hozo maps to a <div>
        // (Pressable, View, Text), where the native attribute has no
        // effect at all, so ARIA is the honest choice there instead.
        // The actual rendered tag decides, not Primitive::Button, which
        // may be an anchor. Retained component aliases keep the portable
        // prop because they choose their host at runtime (#943).
        if is_hozo_component {
            if let Some(disabled) = &node.props.disabled {
                attrs.push_str(&format!(
                    " disabled={{{}}}",
                    render_condition_expr(source, disabled)
                ));
            }
        } else if matches!(tag, "button" | "input" | "textarea" | "select") {
            if let Some(disabled) = disabled_expr {
                attrs.push_str(&format!(" disabled={{{disabled}}}"));
            }
        }
    }

    // React Native's `focusable`, in the spelling the DOM has.
    //
    // Carried verbatim before this, which meant it reached a `<div>` as an
    // attribute nothing reads -- so a prop that works on Native did
    // nothing at all on Web, silently. React Native's own `tabIndex: 0 |
    // -1` needs no translation and stays a passthrough, which is also why
    // an author who wrote both gets theirs: passthrough props are emitted
    // last.
    if let Some(value) = node
        .props
        .focusable
        .as_ref()
        .filter(|_| !(tag == "a" && disabled_expr.is_some()))
    {
        if is_hozo_component {
            attrs.push_str(&boolean_attribute("focusable", value, source));
        } else {
            attrs.push_str(&match value {
                // `<View focusable />` and `focusable={false}` are both known
                // at compile time, so they become the attribute they mean
                // rather than a ternary over a constant.
                hozo_ir::ConditionExpr::Static(true) => " tabIndex={0}".to_string(),
                hozo_ir::ConditionExpr::Static(false) => " tabIndex={-1}".to_string(),
                other => format!(
                    " tabIndex={{({}) ? 0 : -1}}",
                    render_condition_expr(source, other)
                ),
            });
        }
    }

    // The styling hook, on every element Hozo marks disabled and by
    // whichever spelling. `disabled:` compiles to `[data-hozo-disabled]`
    // (see `css.rs`), so a `<button>`, a `<div aria-disabled>` and a
    // dimmed region all have to carry it or the rule matches nothing --
    // which is what `disabled:opacity-50` on a Pressable used to do.
    //
    // `{expr ? '' : undefined}` is the presence form the rest of Hozo's
    // `data-hozo-*` attributes already use: React renders `data-x={false}`
    // as the string "false", and an attribute selector matches that.
    //
    // Skipped when `hozoInteractive` is supplying it, which is the same
    // rule the state attributes above follow.
    if let Some(expr) = disabled_expr.as_ref().filter(|_| !synthesized_control) {
        if !is_hozo_component && tag != "a" {
            attrs.push_str(&format!(" aria-disabled={{{expr}}}"));
        }
        attrs.push_str(&format!(
            " data-hozo-disabled={{({expr}) ? '' : undefined}}"
        ));
    }
}
