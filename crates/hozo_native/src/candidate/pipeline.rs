//! The resolver's `compose` step: one pipeline over the selected style
//! objects, a stage per effect family this map needs.

use super::*;

/// The families whose registers this map composes after state selection.
#[derive(Clone, Copy)]
pub(super) struct Needs {
    pub(super) gradients: bool,
    pub(super) shadows: bool,
    pub(super) filters: bool,
    pub(super) text_metrics: bool,
    pub(super) leading_registers: bool,
    pub(super) transforms: bool,
}

/// The `compose` function's source, if any stage is needed, and the mask
/// of stages a JSX site may defer.
pub(super) fn compose(needs: Needs) -> (Option<String>, u8) {
    // One selected-object pipeline; every composer retains original identities
    // for the next family. No duplicate filter/text/transform decision tree.
    let mut pipeline = String::new();
    let mut input = "resolved";
    if needs.gradients {
        pipeline.push_str(&format!("const gradient = !(deferred & {DEFER_GRADIENT}) && resolved.some(style => gradients.has(style)) ? hozoGradientStyles(resolved, gradients, {}) : resolved; ", crate::gradients::defaults()));
        input = "gradient";
    }
    if needs.shadows {
        pipeline.push_str(&format!("const shadow = !(deferred & {DEFER_SHADOW}) && {input}.some(style => shadows.has(style)) ? hozoShadowStyles({input}, shadows, {}) : {input}; ", crate::shadows::defaults()));
        input = "shadow";
    }
    if needs.filters {
        pipeline.push_str(&format!("const filtered = (deferred & {DEFER_FILTER}) || {input}.some(style => 'filter' in style && !filters.has(style)) ? {input} : {input}.some(style => filters.has(style)) ? hozoFilterStyles({input}, filters) : {input}; "));
        input = "filtered";
    }
    if needs.text_metrics {
        let registers = if needs.leading_registers {
            ", leadingRegisters"
        } else {
            ""
        };
        if needs.leading_registers {
            pipeline.push_str(&format!(
                "const text = (deferred & {DEFER_TEXT_METRICS}) ? {input} : hozoTextMetricStyles({input}, fontDefaults{registers}); "
            ));
        } else {
            pipeline.push_str(&format!(
                "const text = hozoTextMetricStyles({input}, fontDefaults); "
            ));
        }
        input = "text";
    }
    if needs.transforms {
        pipeline.push_str(&format!("const transformed = !(deferred & {DEFER_TRANSFORM}) && {input}.some(style => transforms.has(style)) ? hozoTransformStyles({input}, transforms, undefined, Boolean(deferred)) : {input}; "));
        input = "transformed";
    }
    let effect_mask = u8::from(needs.shadows) * DEFER_SHADOW
        + u8::from(needs.gradients) * DEFER_GRADIENT
        + u8::from(needs.transforms) * DEFER_TRANSFORM
        + u8::from(needs.filters) * DEFER_FILTER
        + u8::from(needs.leading_registers && needs.text_metrics) * DEFER_TEXT_METRICS;
    let compose = if pipeline.is_empty() {
        None
    } else {
        let args = if effect_mask != 0 {
            "(resolved, deferred)"
        } else {
            "resolved"
        };
        Some(format!("{args} => {{ {pipeline}return {input} }}"))
    };
    (compose, effect_mask)
}
