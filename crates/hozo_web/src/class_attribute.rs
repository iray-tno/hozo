//! The element's `className`: its generated class when a rule was written for
//! it, the base classes of a view box or scroll view, the classes Hozo put
//! back, and at runtime whatever the source could not decompose -- with the
//! warning each runtime-resolved class list earns.

use hozo_ir::{Node, Primitive};

use crate::*;

/// The `className` attribute, then the class-slot attributes, as the start of
/// the element's attribute text.
pub(crate) fn class_attribute(
    node: &Node,
    class_name: String,
    rules_before: usize,
    cx: &mut WebRenderContext<'_>,
) -> String {
    let source = cx.source;
    // The generated class is dropped when no rule was written for it. It
    // matched nothing, so it was a class attribute on every unstyled
    // element and bytes in every render -- found by rendering the output
    // and comparing the classes in the DOM against the ones the stylesheet
    // defines, which is a comparison nothing had made before.
    let mut classes = if cx.rules.len() == rules_before {
        String::new()
    } else {
        class_name
    };
    // Capture only the root's authored class rule. The synthetic View's base
    // class is preparation scaffolding, not part of the existing destination.
    if let Some(target) = cx.owner_class.as_deref_mut() {
        if target.is_none() {
            *target = Some(classes.clone());
        }
    }
    if node.primitive.is_view_box() {
        *cx.uses_view_base = true;
        classes = if classes.is_empty() {
            "hozo-view".to_string()
        } else {
            format!("hozo-view {classes}")
        };
    }
    if node.primitive == Primitive::ScrollView {
        classes = if classes.is_empty() {
            "hozo-scroll-view".to_string()
        } else {
            format!("hozo-scroll-view {classes}")
        };
    }
    // The classes Hozo produced no style for, put back.
    //
    // They used to be dropped, which deleted a project's own `my-card`
    // from the element and, worse, Tailwind's `group` and `peer` -- marker
    // classes with no styles of their own, whose entire purpose is to be
    // selected against by a descendant. Not understanding a thing is not a
    // reason to delete it; the same rule the props and children already
    // follow.
    for carried in &node.carried_classes {
        if classes.is_empty() {
            classes = carried.clone();
        } else {
            classes.push(' ');
            classes.push_str(carried);
        }
    }

    // `className`, not `class` -- Hozo's Web output is consumed as JSX
    // (the Vite plugin splices it back into React source), not raw HTML.
    //
    // Anything the parser couldn't decompose statically (proposal §7's
    // third tier) is concatenated back on at runtime. What it evaluates to
    // is matched by the project-wide candidate stylesheet
    // (`render_candidate_stylesheet`) -- the browser's own CSS engine does
    // the resolution, with no runtime code involved.
    // A className branch's guard, as the class its rules select on: present
    // when the source's condition holds. See `css::expr_ref_class`.
    let guards = class_guards(&node.style, source);
    let mut attrs =
        if node.class_name_fallback.is_empty()
            && node.props.stylex_residuals.is_empty()
            && guards.is_empty()
        {
            if classes.is_empty() {
                String::new()
            } else {
                format!(r#" className="{classes}""#)
            }
        } else {
            for expr_ref in &node.class_name_fallback {
                let code =
                    hozo_parser::class_fallback_code(&source_text(source, *expr_ref), "className");
                cx.diagnostics.push(hozo_ir::Diagnostic {
                    code,
                    severity: hozo_ir::Severity::Warning,
                    message: format!(
                        "`{}` can't be resolved at build time, so it's passed through and its CSS \
                     comes from the project-wide candidate stylesheet instead. Only classes \
                     whose text appears literally somewhere in the project are covered -- one \
                     assembled at runtime (`` `bg-${{color}}-500` ``) still won't be.",
                        source_text(source, *expr_ref)
                    ) + hozo_parser::class_fallback_note(code),
                    span: node.span,
                });
            }
            let parts: Vec<String> =
                std::iter::once(format!(r#""{classes}""#))
                    .chain(guards)
                    .chain(node.props.stylex_residuals.iter().map(|residual| {
                        format!("({}).className", residual.render_expression(source))
                    }))
                    .chain(node.class_name_fallback.iter().map(|r| {
                        node.root_class_evaluation().map_or_else(
                            || source_text(source, *r).to_string(),
                            |evaluation| evaluation.value(source, *r),
                        )
                    }))
                    .collect();
            let mut value = format!("[{}].filter(Boolean).join(' ')", parts.join(", "));
            if !node.class_name_fallback.is_empty() {
                // Do not turn an empty class list into a truthy one: a runtime
                // component can use emptiness to select its own defaults.
                value.push_str(if node.primitive.root_owner_has_constant_facts() {
                    ".replace(/\\S/, 'hozo-candidate-owner hozo-candidate-slot-owner $&')"
                } else {
                    ".replace(/\\S/, 'hozo-candidate-owner $&')"
                });
            }
            format!(" className={{{value}}}")
        };
    class_slots::class_slot_attrs(node, &mut attrs, cx);
    // A secondary list the compiler carries whole reaches the component as
    // written and its CSS comes from the candidate stylesheet, as an opaque
    // root `className` does. Said the same way, at the attribute, so the
    // report names the list it means.
    for prop in node.props.passthrough.iter().filter(|prop| {
        !prop.is_spread
            && prop.literal.is_none()
            && prop.name.as_deref().is_some_and(|name| {
                node.primitive
                    .class_slots()
                    .iter()
                    .any(|slot| slot.class_prop == name)
            })
    }) {
        let name = prop.name.as_deref().unwrap_or_default();
        // The value as written: the attribute's span covers `name={value}`.
        let attribute = &source[prop.span.0.start as usize..prop.span.0.end as usize];
        let value = attribute
            .split_once('=')
            .map(|(_, value)| value.trim())
            .and_then(|value| value.strip_prefix('{')?.strip_suffix('}'))
            .unwrap_or_default();
        let code = hozo_parser::class_fallback_code(value, name);
        cx.diagnostics.push(hozo_ir::Diagnostic {
            code,
            severity: hozo_ir::Severity::Warning,
            message: format!(
                "`{}` can't be resolved at build time, so it's passed through and its CSS comes                  from the project-wide candidate stylesheet instead. Only classes whose text                  appears literally somewhere in the project are covered.",
                name
            ) + hozo_parser::class_fallback_note(code),
            span: prop.span.0,
        });
    }
    attrs
}
