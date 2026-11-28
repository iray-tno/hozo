//! The props Hozo does not model, rendered verbatim for re-emission last,
//! less the ones an earlier step already lowered or that mean nothing on
//! React Native. A Button's spread goes through `hozoButtonProps`.

use super::*;

/// Each passthrough prop that survives, in source order, with its rendering.
pub(super) fn render_passthrough<'n>(
    node: &'n Node,
    descend: &[StyleDeclaration],
    child_interaction_context: bool,
    group_ancestor: Option<GroupAncestor<'_>>,
    subtree_report: SubtreeReport,
    cx: &mut NativeRenderContext<'_>,
) -> Vec<(&'n hozo_ir::PassthroughProp, Rendered)> {
    let source = cx.source;
    let mut rendered: Vec<(&hozo_ir::PassthroughProp, Rendered)> = Vec::new();
    for prop in &node.props.passthrough {
        if node.primitive == Primitive::Button {
            if prop
                .name
                .as_deref()
                .is_some_and(|name| name.starts_with("data-"))
            {
                cx.diagnostics.push(Diagnostic {
                    code: DiagnosticCode::WebOnlyPropertyOnNative,
                    severity: Severity::Warning,
                    message: "Button `data-*` metadata requires a Web DOM dataset; React Native does not consume it. Use nativeID for a shared host identifier; metadata is not mapped to accessibility props.".to_string(),
                    span: prop.span.0,
                });
            }
            if prop.is_spread {
                let raw = &source[prop.span.0.start as usize..prop.span.0.end as usize];
                if let Some(expression) = raw
                    .trim()
                    .strip_prefix('{')
                    .and_then(|text| text.strip_suffix('}'))
                    .and_then(|text| text.trim().strip_prefix("..."))
                {
                    // Read off the source, so that the primitives written
                    // inside it lower and a captured argument reads its slot.
                    let expression = expression.trim();
                    let start = expression.as_ptr() as usize - source.as_ptr() as usize;
                    let argument = ExprRef(hozo_ir::SourceSpan {
                        start: start as u32,
                        end: (start + expression.len()) as u32,
                    });
                    let argument = render_verbatim(
                        argument,
                        &prop.nested,
                        descend,
                        child_interaction_context,
                        group_ancestor,
                        subtree_report,
                        &[],
                        None,
                        cx,
                    );
                    cx.runtime.need_component("hozoButtonProps");
                    rendered.push((
                        prop,
                        Rendered {
                            text: format!("{{...hozoButtonProps({})}}", argument.text),
                            copies: None,
                        },
                    ));
                    continue;
                }
            }
        }
        // Already in the style array above.
        if prop.name.as_deref() == Some("style") {
            continue;
        }
        // Already lowered into a style prop just above.
        if node.primitive.class_slots().iter().any(|slot| {
            prop.name.as_deref() == Some(slot.class_prop)
                || prop.name.as_deref() == Some(slot.style_prop)
        }) {
            continue;
        }
        // Already translated into `accessibilityValue` above, and a View
        // does nothing with either.
        if node.primitive == Primitive::Progress
            && matches!(prop.name.as_deref(), Some("value") | Some("max"))
        {
            continue;
        }

        // A link's browser-only props. React Native's Pressable ignores
        // them, so they were harmless -- but still claimed behavior the
        // platform does not have. `external` is deliberately retained:
        // HozoLink uses it to bypass an installed application router.
        // `download` is diagnosed where the component is chosen.
        if matches!(node.primitive, Primitive::Button | Primitive::Pressable)
            && matches!(
                prop.name.as_deref(),
                Some("target") | Some("rel") | Some("download")
            )
        {
            continue;
        }
        // A rule's own two props, which are Hozo's words rather than React
        // Native's. `decorative` picks the role in `markup.rs` and
        // `orientation` picks which side gets the one pixel; a `View` does
        // nothing with either, and passing them on was two props claiming
        // something the platform does not read.
        if node.primitive == Primitive::Separator
            && matches!(
                prop.name.as_deref(),
                Some("decorative") | Some("orientation")
            )
        {
            continue;
        }
        rendered.push((
            prop,
            render_verbatim(
                prop.span,
                &prop.nested,
                descend,
                child_interaction_context,
                group_ancestor,
                subtree_report,
                &[],
                None,
                cx,
            ),
        ));
    }
    rendered
}
