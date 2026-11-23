//! Held styles composed through the element's spreads (#1054): the props
//! from the first spread to the last become one helper call, so a style a
//! spread carries composes after the compiled one instead of replacing it.

use super::*;

/// Appends the passthrough props to `props_text`, grouping the spreads with
/// the held styles when they can be taken apart. Returns the source copies
/// recorded for them, when the context collects source evidence.
pub(super) fn append_passthrough(
    node: &Node,
    rendered: Vec<(&hozo_ir::PassthroughProp, Rendered)>,
    held: &crate::spread_style::HeldStyles<'_>,
    project_spread_gap: bool,
    props_text: &mut String,
    cx: &mut NativeRenderContext<'_>,
) -> Option<Vec<hozo_ir::SourceCopy>> {
    // Held styles go through the spreads, with whatever sits between them,
    // in source order. A shape between the spreads that cannot be taken
    // apart keeps the old emission rather than a guessed one -- and says
    // so, because that emission lets a spread's style replace the compiled
    // one, which is the bug composing exists to fix (#1054).
    let spreads: Vec<usize> = (0..rendered.len())
        .filter(|&index| rendered[index].0.is_spread)
        .collect();
    let group = match (held.held.is_empty(), spreads.first(), spreads.last()) {
        (false, Some(&first), Some(&last)) => {
            let mut args = Vec::new();
            let mut refused = None;
            for (prop, text) in &rendered[first..=last] {
                let arg = if prop.is_spread {
                    crate::spread_style::spread_argument(text)
                } else {
                    crate::spread_style::attribute_object(text)
                };
                match arg {
                    Some(arg) => args.push(arg),
                    None => {
                        refused = Some(*prop);
                        break;
                    }
                }
            }
            if let Some(prop) = refused {
                let names = held
                    .held
                    .iter()
                    .map(|(name, _)| format!("`{name}`"))
                    .collect::<Vec<_>>()
                    .join(", ");
                cx.diagnostics.push(Diagnostic {
                    code: DiagnosticCode::UnsafePropSpreadAfterStyle,
                    severity: Severity::Warning,
                    message: format!(
                        "A prop between this element's spreads is written in a form Hozo does not \
                         take apart (an entity in a string, or an element as the value), so on \
                         Native a {names} the spreads carry replaces the compiled one instead of \
                         composing after it. Write the value in braces, or move the prop outside \
                         the spreads."
                    ),
                    span: prop.span.0,
                });
                None
            } else {
                Some((first, last, args))
            }
        }
        _ => None,
    };
    let mut prop_copies = cx.source_evidence.then(Vec::new);
    match group {
        Some((first, last, args)) => {
            let after = rendered[last].0.span.0.start;
            let written_last: Vec<String> = held
                .held
                .iter()
                .map(|(name, _)| name.clone())
                .filter(|name| {
                    node.props.passthrough.iter().any(|prop| {
                        !prop.is_spread
                            && prop.name.as_deref() == Some(name.as_str())
                            && prop.span.0.start > after
                    })
                })
                .collect();
            // A caller's style through a spread loses its inline edges to a
            // class's start/end exactly as a named `style` would (#2050), so
            // the same elements compose it through the edge-aware boundary.
            let edges = !node.class_name_fallback.is_empty()
                || crate::edge_projection::writes_logical_inline(&node.style);
            let helper_text;
            let helper = if edges {
                cx.runtime.need_component("hozoEdgeSpreadStyles");
                cx.runtime.need_native("I18nManager");
                helper_text = format!(
                    "hozoEdgeSpreadStyles(I18nManager.isRTL, I18nManager.doLeftAndRightSwapInRTL, {project_spread_gap})"
                );
                helper_text.as_str()
            } else if project_spread_gap {
                cx.runtime.need_component("hozoGapSpreadStyles");
                "hozoGapSpreadStyles"
            } else {
                cx.runtime.need_component("hozoSpreadStyles");
                "hozoSpreadStyles"
            };
            let mut group = Some(crate::spread_style::helper_call(
                &held.held,
                &written_last,
                args,
                helper,
                cx.source_evidence,
            ));
            for (index, (_, text)) in rendered.into_iter().enumerate() {
                if index == first {
                    group
                        .take()
                        .expect("one first spread")
                        .append_into(props_text, &mut prop_copies);
                }
                if index < first || index > last {
                    props_text.push(' ');
                    text.append_into(props_text, &mut prop_copies);
                }
                // Grouped props retain only their actual surviving argument
                // fragments, never the generated keys/braces/helper prefix.
            }
        }
        None => {
            for (name, value) in &held.held {
                props_text.push_str(&format!(" {name}={{{value}}}"));
            }
            for (_, text) in rendered {
                props_text.push(' ');
                text.append_into(props_text, &mut prop_copies);
            }
        }
    }
    prop_copies
}
