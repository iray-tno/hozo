//! A component's other class lists (`ClassSlot`), which on this platform
//! are style props: `removeClassName="p-2"` is `removeStyle={…}`. The same
//! lowering as `className`, so a breakpoint or `dark:` works here as it
//! does there and an interaction state is reported the same way. Written
//! as an expression, it is resolved on device from the candidate map,
//! as `className` is. Registered pattern slots must keep the expression
//! until their actual owner supplies its facts: resolving here would lose
//! that owner's hover/focus/semantic state. Other slots retain the plain
//! style fallback. An authored slot style still follows its class styles.

use super::*;

/// Writes each of the primitive's class slots as its style prop. True when
/// a slot written by the author projects a gap, so the spread must too.
#[allow(clippy::too_many_arguments)]
pub(super) fn class_slot_props<'n>(
    node: &'n Node,
    position: SiblingPosition,
    group_ancestor: Option<GroupAncestor<'_>>,
    peers: &[PeerSibling<'_>],
    held: &mut crate::spread_style::HeldStyles<'n>,
    props_text: &mut String,
    cx: &mut NativeRenderContext<'_>,
) -> bool {
    let source = cx.source;
    let mut project_spread_gap = false;
    let prop_expr = |prop: &hozo_ir::PassthroughProp| -> Option<String> {
        let text = &source[prop.span.0.start as usize..prop.span.0.end as usize];
        let value = text.split_once('=')?.1.trim();
        value
            .strip_prefix('{')
            .and_then(|inner| inner.strip_suffix('}'))
            .map(|inner| hozo_ir::attribute_capture::slice(source, inner.trim()).into_owned())
    };
    for slot in node.primitive.class_slots() {
        let mut parts: Vec<String> = Vec::new();
        // Project the author while it is still separate from compiled axes.
        // Once both are in a slot array the owner cannot tell whose axis it is.
        let project_slot_gap = node.props.class_slots.iter().any(|written| {
            written.slot == *slot && (has_gap(&written.style) || !written.fallback.is_empty())
        }) || node
            .props
            .passthrough
            .iter()
            .any(|prop| prop.name.as_deref() == Some(slot.class_prop));
        if let Some(written) = node
            .props
            .class_slots
            .iter()
            .find(|written| written.slot == *slot)
        {
            let mut pressed = Vec::new();
            let slot_layout =
                crate::pattern_layout::applies(node.primitive, slot.class_prop).then(|| {
                    crate::pattern_layout::adapt(
                        node.primitive,
                        slot.class_prop,
                        written.style.clone(),
                    )
                });
            if let Some(prop) = slot_layout.as_ref().and_then(|layout| layout.scroll_prop) {
                props_text.push_str(&format!(" {prop}={{true}}"));
            }
            let slot_style = slot_layout
                .as_ref()
                .map_or(&written.style, |layout| &layout.style);
            // Only a catalogued real input can consume placeholder colour.
            // All other pseudo-element declarations still reach diagnostics;
            // this is a prop adaptation, not a general pseudo-style escape.
            // Not `Option::zip`, which clippy suggests: zip evaluates both
            // sides, and `placeholder_value` registers runtime needs (the
            // dark-scheme hook), which a slot with no placeholder prop must
            // not import.
            let (placeholder, placeholder_consumed) = if let Some(prop) =
                crate::pattern::placeholder_color_prop(node.primitive, slot.class_prop)
            {
                let slot_target = crate::conditions::StyleTarget {
                    owner_facts: cx.owner_inputs.facts,
                    owner_events: cx.owner_inputs.events,
                    node,
                    position,
                    interaction_context: false,
                    group_ancestor,
                    peers,
                    pattern_slot: Some(slot.class_prop),
                    composition: Default::default(),
                };
                let (value, consumed) = crate::text::placeholder_value_for_slot(
                    slot_style,
                    &slot_target,
                    cx.source,
                    cx.theme,
                    cx.runtime,
                );
                (value.map(|value| (prop, value)), Some(consumed))
            } else {
                (None, None)
            };
            let field_style: Option<Vec<_>> = placeholder_consumed.as_ref().map(|consumed| {
                slot_style
                    .iter()
                    .enumerate()
                    .filter(|(index, _)| !consumed[*index])
                    .map(|(_, declaration)| declaration.clone())
                    .collect()
            });
            for declaration in field_style.as_deref().unwrap_or(slot_style) {
                if matches!(declaration.property, StyleProperty::FontWeight(_)) {
                    if let Some(reason) = declaration
                        .property
                        .unsupported_on_native_with_theme(cx.theme)
                    {
                        cx.diagnostics.push(Diagnostic {
                            code: DiagnosticCode::WebOnlyPropertyOnNative,
                            severity: Severity::Error,
                            message: reason,
                            span: written.span,
                        });
                    }
                }
                // A rejected layout cannot become an empty secondary style.
                // Keep this owner adaptation scoped: other property families
                // retain their existing validation/adapter policy.
                if matches!(
                    declaration.property,
                    StyleProperty::OverflowX(_)
                        | StyleProperty::OverflowY(_)
                        | StyleProperty::Position(hozo_ir::Position::Css(_))
                ) {
                    if let Some(reason) = declaration.property.unsupported_on_native() {
                        cx.diagnostics.push(Diagnostic {
                            code: DiagnosticCode::WebOnlyPropertyOnNative,
                            severity: Severity::Error,
                            message: format!("{}: {reason}", slot.class_prop),
                            span: written.span,
                        });
                    }
                }
            }
            if let Some((prop, value)) = placeholder {
                props_text.push_str(&format!(" {prop}={{{value}}}"));
            }
            let target = crate::conditions::StyleTarget {
                owner_facts: &[],
                owner_events: &[],
                node,
                position,
                interaction_context: false,
                group_ancestor,
                peers,
                pattern_slot: Some(slot.class_prop),
                composition: Default::default(),
            };
            let state_start = build_style_entries(
                field_style.as_deref().unwrap_or(slot_style),
                &cx.allocator.alloc(),
                &target,
                &mut parts,
                &mut pressed,
                None,
                cx,
            );
            let expressions = written
                .fallback
                .iter()
                .map(|expr| {
                    written.evaluation.as_ref().map_or_else(
                        || source_text(source, *expr).to_string(),
                        |evaluation| evaluation.value(source, *expr),
                    )
                })
                .collect::<Vec<_>>();
            let route = crate::class_route::PatternClasses::new(
                node.primitive,
                slot.class_prop,
                expressions.clone(),
                !parts.is_empty() || !pressed.is_empty(),
                source,
                written.evaluation.as_deref(),
            );
            for expr in &written.fallback {
                let code =
                    hozo_parser::class_fallback_code(&source_text(source, *expr), slot.class_prop);
                cx.diagnostics.push(Diagnostic {
                    code,
                    severity: Severity::Warning,
                    message: format!("`{}` retains an opaque class expression resolved from the project-wide candidate map{}; use a static string for build-time validation.{}", slot.class_prop, if route.is_some() { " with its owner's available state" } else { "" }, hozo_parser::class_fallback_note(code)),
                    span: written.span,
                });
            }
            let residuals = route.as_ref().map_or_else(
                || {
                    expressions
                        .iter()
                        .map(|expr| {
                            crate::class_route::residual(node.primitive, slot.class_prop, expr)
                        })
                        .collect()
                },
                |route| route.residuals(),
            );
            parts.splice(state_start..state_start, residuals);
            if route.is_some() || !pressed.is_empty() {
                cx.owner_callbacks.push(crate::OwnerCallback {
                    span: written.span,
                    class_prop: slot.class_prop,
                });
            }
            if let Some(route) = route {
                parts.extend(pressed);
                held.emit(props_text, &route.prop(&parts));
                parts.clear();
            } else if !pressed.is_empty() {
                parts.extend(pressed);
                let style_prop =
                    crate::pattern::interaction_style_prop(node.primitive, slot.class_prop)
                        .expect("a pattern interaction guard requires a consuming slot");
                let callback =
                    crate::class_route::static_callback(node.primitive, slot.class_prop, &parts);
                held.emit(props_text, &format!(" {style_prop}={{{callback}}}"));
                parts.clear();
            }
            if let Some(evaluation) = written.evaluation.as_ref().filter(|_| {
                crate::pattern::interaction_slot(node.primitive, slot.class_prop).is_none()
            }) {
                // No interactive owner: compute the slot's style now,
                // keeping authored predicates outside later callbacks.
                let result = evaluation.wrap(source, &format!("[{}]", parts.join(", ")));
                parts.clear();
                parts.push(result);
            }
        }
        for prop in node
            .props
            .passthrough
            .iter()
            .filter(|prop| prop.name.as_deref() == Some(slot.class_prop))
        {
            let Some(expr) = prop_expr(prop) else {
                continue;
            };
            let owned = crate::pattern::interaction_slot(node.primitive, slot.class_prop).is_some();
            let has_facts =
                crate::pattern::constant_facts(node.primitive, slot.class_prop).is_some();
            let code = hozo_parser::class_fallback_code(&expr, slot.class_prop);
            cx.diagnostics.push(Diagnostic {
                code,
                severity: Severity::Warning,
                message: if owned || has_facts {
                    format!(
                        "`{}` can't be resolved at build time. Its pattern slot resolves it on device \
                         from the project-wide candidate map with that owner's available state. \
                         Unscanned candidates and unsupported conditions still warn at runtime; \
                         use a static string for build-time validation.",
                        slot.class_prop
                    )
                } else {
                    format!(
                        "`{}` can't be resolved at build time, so it's resolved on device from the \
                         project-wide candidate map. Conditional utilities can't be carried that way \
                         and will warn at runtime -- write those as a static string so they compile.",
                        slot.class_prop
                    )
                } + hozo_parser::class_fallback_note(code),
                // The attribute, not the element: an element has several
                // class lists, and the report names the one it means.
                span: prop.span.0,
            });
            if owned {
                let route = crate::class_route::PatternClasses::new(
                    node.primitive,
                    slot.class_prop,
                    vec![expr],
                    false,
                    source,
                    None,
                )
                .expect("registered above");
                cx.owner_callbacks.push(crate::OwnerCallback {
                    span: node.span,
                    class_prop: slot.class_prop,
                });
                held.emit(props_text, &route.prop(&[]));
            } else {
                parts.push(crate::class_route::residual(
                    node.primitive,
                    slot.class_prop,
                    &expr,
                ));
            }
        }
        // A private owner callback keeps classes separate already. Only a
        // plain slot style array needs a compiler-side authored boundary.
        let project_slot_gap = project_slot_gap && !parts.is_empty();
        project_spread_gap |= project_slot_gap;
        parts.extend(
            node.props
                .passthrough
                .iter()
                .filter(|prop| prop.name.as_deref() == Some(slot.style_prop))
                .filter_map(prop_expr)
                .map(|expr| {
                    if project_slot_gap {
                        cx.runtime.need_component("hozoAuthoredStyle");
                        format!("hozoAuthoredStyle({expr})")
                    } else {
                        expr
                    }
                }),
        );
        match parts.len() {
            0 => {}
            1 => held.emit(
                props_text,
                &format!(" {}={{{}}}", slot.style_prop, parts[0]),
            ),
            _ => held.emit(
                props_text,
                &format!(" {}={{[{}]}}", slot.style_prop, parts.join(", ")),
            ),
        }
    }
    project_spread_gap
}
