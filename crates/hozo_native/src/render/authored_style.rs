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
