//! A runtime component's other class lists (`ClassSlot`), compiled the way
//! the root `className` is and handed to it under the prop the author wrote.

use hozo_ir::Node;

use crate::*;

/// Writes each non-root class slot as its own attribute.
pub(crate) fn class_slot_attrs(node: &Node, attrs: &mut String, cx: &mut WebRenderContext<'_>) {
    let source = cx.source;
    let theme = cx.theme;
    // A component's other class lists, compiled the same way and handed to
    // it under the prop the author wrote (`removeClassName`).
    for slot in node
        .props
        .class_slots
        .iter()
        .filter(|slot| slot.slot != hozo_ir::ClassSlot::ROOT)
    {
        let slot_class = cx.allocator.alloc();
        let before = cx.rules.len();
        push_rules_using(
            &slot_class,
            &slot.style,
            slot.span,
            theme,
            cx.rules,
            cx.diagnostics,
            css::render_slot_rule,
        );
        let produced = (cx.rules.len() != before).then_some(slot_class);
        let classes: Vec<&str> = produced
            .iter()
            .map(String::as_str)
            .chain(slot.carried.iter().map(String::as_str))
            .collect();
        if !slot.fallback.is_empty() || slot.evaluation.is_some() {
            for expr in &slot.fallback {
                let code = hozo_parser::class_fallback_code(
                    &source_text(source, *expr),
                    slot.slot.class_prop,
                );
                cx.diagnostics.push(hozo_ir::Diagnostic {
                    code,
                    severity: hozo_ir::Severity::Warning,
                    message: format!("`{}` retains an opaque class expression; its CSS comes from the project-wide candidate stylesheet. Use a static string for build-time validation.{}", slot.slot.class_prop, hozo_parser::class_fallback_note(code)),
                    span: slot.span,
                });
            }
            // The fallback remains an authored value, not a condition
            // emitted onto the widget root instead of the slot owner.
            let compiled = std::iter::once(format!("{:?}", classes.join(" ")))
                .chain(class_guards(&slot.style, source))
                .collect::<Vec<_>>()
                .join(", ");
            // With no unconditional text, an inactive branch is an empty
            // class list. A guard/base marker must not turn it truthy and
            // suppress the component's empty-class defaults.
            let compiled = if slot.evaluation.is_some()
                && slot
                    .style
                    .iter()
                    .all(|d| matches!(d.condition, hozo_ir::Condition::Expr(_)))
            {
                let active = slot
                    .style
                    .iter()
                    .filter_map(|d| match &d.condition {
                        hozo_ir::Condition::Expr(expression) => {
                            Some(render_condition_expr(source, expression))
                        }
                        _ => None,
                    })
                    .collect::<std::collections::BTreeSet<_>>()
                    .into_iter()
                    .map(|expr| format!("({expr})"))
                    .collect::<Vec<_>>()
                    .join(" || ");
                format!("...(({active}) ? [{compiled}] : [])")
            } else {
                compiled
            };
            let parts = std::iter::once(compiled)
                .chain(slot.fallback.iter().map(|expr| {
                    slot.evaluation.as_ref().map_or_else(
                        || source_text(source, *expr).to_string(),
                        |evaluation| evaluation.value(source, *expr),
                    )
                }))
                .collect::<Vec<_>>()
                .join(", ");
            let mut value = format!("[{parts}].filter(Boolean).join(' ')");
            if !slot.fallback.is_empty() {
                value.push_str(
                    ".replace(/\\S/, 'hozo-candidate-owner hozo-candidate-slot-owner $&')",
                );
            }
            if let Some(evaluation) = &slot.evaluation {
                value = evaluation.wrap(source, &value);
            }
            attrs.push_str(&format!(" {}={{{value}}}", slot.slot.class_prop));
        } else if !classes.is_empty() {
            attrs.push_str(&format!(
                r#" {}="{}""#,
                slot.slot.class_prop,
                classes.join(" ")
            ));
        }
    }
}
