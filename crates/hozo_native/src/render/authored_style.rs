//! An authored `style` attribute, read so it can join the style array last
//! instead of becoming a second `style` that drops every compiled class.

use super::*;

/// Each authored `style={expr}`, wrapped in `hozoAuthoredStyle` when its
/// gap has to be resolved before it meets the class styles.
pub(super) fn authored_style(
    node: &Node,
    project_authored_gap: bool,
    source: &str,
    runtime: &mut RuntimeNeeds,
) -> Vec<String> {
    node.props
        .passthrough
        .iter()
        .filter(|prop| prop.name.as_deref() == Some("style"))
        .filter_map(|prop| {
            let text = &source[prop.span.0.start as usize..prop.span.0.end as usize];
            let value = text.split_once('=')?.1.trim();
            // `style={expr}`. A string is not a style React Native accepts,
            // so anything else is left where it was.
            let inner = value.strip_prefix('{')?.strip_suffix('}')?;
            Some(if project_authored_gap {
                runtime.need_component("hozoAuthoredStyle");
                format!(
                    "hozoAuthoredStyle({})",
                    hozo_ir::attribute_capture::slice(source, inner.trim())
                )
            } else {
                hozo_ir::attribute_capture::slice(source, inner.trim()).into_owned()
            })
        })
        .collect()
}

/// Joins the authored style to the class styles: kept as its own `style`
/// beside a pattern's or callback's routed style, through
/// `hozoAuthoredEdges` when an edge it writes competes with a class's, or
/// last in the array.
pub(super) fn compose(
    mut style_array_parts: Vec<String>,
    authored_style: Vec<String>,
    routed_style: bool,
    node: &Node,
    held: &mut crate::spread_style::HeldStyles<'_>,
    props_text: &mut String,
    runtime: &mut RuntimeNeeds,
) -> Vec<String> {
    if routed_style {
        if !authored_style.is_empty() {
            held.emit(
                props_text,
                &format!(" style={{[{}]}}", authored_style.join(", ")),
            );
        }
    } else if !authored_style.is_empty()
        && !style_array_parts.is_empty()
        && (!node.class_name_fallback.is_empty()
            || crate::edge_projection::writes_logical_inline(&node.style))
    {
        // Yoga prefers a class's `paddingEnd` to the author's `paddingRight`
        // whatever the order; the helper lets the author's edge win, on the
        // side React Native would give it alone (#2050). An opaque class may
        // write any edge, so it takes the same boundary.
        runtime.need_component("hozoAuthoredEdges");
        runtime.need_native("I18nManager");
        style_array_parts = vec![format!(
            "hozoAuthoredEdges([{}], [{}], I18nManager.isRTL, I18nManager.doLeftAndRightSwapInRTL)",
            style_array_parts.join(", "),
            authored_style.join(", ")
        )];
    } else {
        style_array_parts.extend(authored_style);
    }
    style_array_parts
}
