//! The classes the source could not decompose, handed to the generated
//! resolver: through a pattern's class route, or as `hozoClasses` calls with
//! the state a pressable tracks and the effect families it defers.

use super::*;

/// Splices the runtime-resolved classes into the style array at
/// `state_start`. Returns whether the element hands the resolver its tracked
/// state, and the pattern's class route when it has one.
pub(super) fn class_fallback(
    node: &Node,
    component: &str,
    has_compiled_parts: bool,
    deferred_effects: u8,
    style_array_parts: &mut Vec<String>,
    state_start: usize,
    cx: &mut NativeRenderContext<'_>,
) -> (bool, Option<crate::class_route::PatternClasses>) {
    let source = cx.source;
    // After the compiled resting styles, so it wins the same way it would in
    // the source: `cn('p-4', getDynamic())` puts the opaque part last, and RN
    // resolves a style array last-wins just like JSX's own duplicate-prop
    // rule. Before the element's state styles, which a caller's class does
    // not beat on Web either: a disabled button looks disabled whatever
    // colour it was given (#881).
    //
    // A pressable hands the resolver the state it tracks, so a runtime
    // `active:` or `hover:` class applies as a compiled one does (#886).
    let runtime_states = !node.class_name_fallback.is_empty()
        && matches!(component, "Pressable" | "HozoLink" | "TextInput");
    if runtime_states {
        cx.runtime_states.push(crate::OwnerCallback {
            span: node.span,
            class_prop: "className",
        });
    }
    let class_state = runtime_class_state(node, source, runtime_states);
    let pattern_classes = if crate::pattern::interaction_slot(node.primitive, "className").is_some()
    {
        crate::class_route::PatternClasses::new(
            node.primitive,
            "className",
            node.class_name_fallback
                .iter()
                .map(|expr| {
                    node.root_class_evaluation().map_or_else(
                        || source_text(source, *expr).to_string(),
                        |evaluation| evaluation.value(source, *expr),
                    )
                })
                .collect(),
            has_compiled_parts,
            source,
            None,
        )
    } else {
        None
    };
    let fallback: Vec<String> = if let Some(route) = &pattern_classes {
        route.residuals()
    } else {
        node.class_name_fallback
            .iter()
            .map(|expr_ref| {
                let captured = node
                    .root_class_evaluation()
                    .map(|evaluation| evaluation.value(source, *expr_ref));
                let value = captured.unwrap_or_else(|| source_text(source, *expr_ref).into_owned());
                match (&class_state, deferred_effects) {
                    (Some(state), 0) => format!("hozoClasses({value}, {state})"),
                    (None, 0) => format!("hozoClasses({value})"),
                    (state, effects) => format!(
                        "hozoClasses({value}, {}, {effects})",
                        state.as_deref().unwrap_or("undefined")
                    ),
                }
            })
            .collect()
    };
    style_array_parts.splice(state_start..state_start, fallback);
    (runtime_states, pattern_classes)
}
