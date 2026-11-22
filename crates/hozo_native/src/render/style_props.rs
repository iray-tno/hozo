//! Styles React Native takes as props rather than style -- SVG paint,
//! placeholder, caret and selection colours, line-break strategies and
//! truncation -- with the markup's own props and the captured ones, each
//! skipped when the author wrote it.

use super::*;

/// The props earlier steps of `render_node` lowered from the element's
/// styles and markup, waiting to be written.
pub(super) struct StyleProps {
    pub(super) extra_props: Vec<(&'static str, String)>,
    pub(super) svg_paint: Vec<(&'static str, String)>,
    pub(super) placeholder: Option<Vec<(&'static str, String)>>,
    pub(super) caret: Option<Vec<(&'static str, String)>>,
    pub(super) selection: Option<Vec<(&'static str, String)>>,
    pub(super) text_break: Option<&'static str>,
    pub(super) ios_line_break: Option<&'static str>,
    pub(super) truncation: Option<Vec<(&'static str, String)>>,
}

pub(super) fn write_style_props(
    node: &Node,
    lowered: StyleProps,
    props_text: &mut String,
    cx: &mut NativeRenderContext<'_>,
) {
    let source = cx.source;
    let StyleProps {
        extra_props,
        svg_paint,
        placeholder,
        caret,
        selection,
        text_break,
        ios_line_break,
        truncation,
    } = lowered;
    // Skipping the ones the author already wrote.
    //
    // These are re-emitted verbatim further down, after everything here,
    // so JSX's last-wins resolution already meant the author's value was
    // the one that applied -- emitting both was noise rather than a wrong
    // answer. It only started happening when the integrations stopped
    // requiring a rewrite to `@hozo/core`: a React Native file that sets
    // `accessibilityRole="list"` on its own `<FlatList>` is ordinary, and
    // Hozo adds the same role to every one.
    //
    // A `{...spread}` keeps the semantic prop, because its contents are
    // not knowable here -- and if it does carry the prop it still lands
    // last and still wins.
    let authored: Vec<&str> = node
        .props
        .passthrough
        .iter()
        .filter_map(|prop| prop.name.as_deref())
        .collect();
    for (key, value) in &extra_props {
        if authored.contains(key) {
            continue;
        }
        // An empty value is a bare attribute, which in JSX is `true`.
        // The alternative was `accessible="{true}"`, a string that is
        // truthy by accident rather than a boolean.
        if value.is_empty() {
            props_text.push_str(&format!(" {key}"));
        } else {
            props_text.push_str(&format!(r#" {key}="{value}""#));
        }
    }
    // The paint from `fill-*`/`stroke-*`, which is a prop here and a CSS
    // declaration on Web. A `fill` the author wrote themselves wins: they
    // said it later and more specifically than a class did.
    for (key, value) in &svg_paint {
        if authored.contains(key) {
            continue;
        }
        if value.starts_with('{') {
            props_text.push_str(&format!(" {key}={value}"));
        } else {
            props_text.push_str(&format!(r#" {key}="{value}""#));
        }
    }
    for (name, value) in [
        ("testID", node.props.test_id),
        ("nativeID", node.props.native_id),
        ("pointerEvents", node.props.pointer_events),
        ("accessibilityValue", node.props.accessibility_value),
        (
            "accessibilityLiveRegion",
            node.props.accessibility_live_region,
        ),
        ("onLayout", node.props.on_layout),
        ("onScroll", node.props.on_scroll),
        ("scrollEventThrottle", node.props.scroll_event_throttle),
    ] {
        if let Some(value) = value {
            props_text.push_str(&format!(" {name}={{{}}}", source_text(source, value)));
        }
    }
    // Styles that RN expresses as props (see `truncation_props`).
    // `numberOfLines` takes a number, so it's braced rather than quoted.
    for (key, value) in placeholder.into_iter().flatten() {
        if !authored.contains(&key) {
            props_text.push_str(&format!(" {key}={{{value}}}"));
        }
    }
    for (key, value) in caret.into_iter().flatten() {
        props_text.push_str(&format!(" {key}={{{value}}}"));
    }
    for (key, value) in selection.into_iter().flatten() {
        if !authored.contains(&key) {
            props_text.push_str(&format!(" {key}={{{value}}}"));
        }
    }
    // Android only: iOS has no balanced strategy, and the prop is ignored
    // there rather than refused, which is the same answer as the Web giving
    // `text-wrap: balance` to a browser that predates it.
    if let Some(strategy) = text_break {
        props_text.push_str(&format!(r#" textBreakStrategy="{strategy}""#));
    }
    // iOS only, the mirror of the above: Android ignores the prop.
    if let Some(strategy) = ios_line_break {
        props_text.push_str(&format!(r#" lineBreakStrategyIOS="{strategy}""#));
    }
    for (key, value) in truncation.into_iter().flatten() {
        if value.parse::<u32>().is_ok() {
            props_text.push_str(&format!(" {key}={{{value}}}"));
        } else {
            props_text.push_str(&format!(r#" {key}="{value}""#));
        }
    }
    if let Some(label) = node.props.accessibility_label {
        props_text.push_str(&format!(
            " accessibilityLabel={{{}}}",
            source_text(source, label)
        ));
    }
    if let Some(hint) = node.props.accessibility_hint {
        props_text.push_str(&format!(
            " accessibilityHint={{{}}}",
            source_text(source, hint)
        ));
    }
    if let Some(src) = node.props.image_src {
        let value = source_text(source, src);
        let static_uri = value.starts_with(['\"', '\'']);
        if static_uri {
            props_text.push_str(&format!(" source={{{{ uri: {value} }}}}"));
        } else {
            cx.runtime.need_component("hozoImageSource");
            props_text.push_str(&format!(" source={{hozoImageSource({value})}}"));
        }
    }
    // React Native's `Image` reads `srcSet` itself and picks a candidate by
    // the screen's density -- but only density descriptors. A width
    // descriptor (`800w`) is skipped with a runtime warning, and a `srcSet`
    // made only of them draws nothing, where the browser would choose by
    // `sizes`. Said here, for a `srcSet` written as a string, rather than
    // left to a warning on the device.
    if node.primitive == Primitive::Image {
        let literal = |name: &str| {
            node.props
                .passthrough
                .iter()
                .find(|p| p.name.as_deref() == Some(name))
                .and_then(|p| {
                    let text = &source[p.span.0.start as usize..p.span.0.end as usize];
                    let value = text.split_once('=')?.1.trim();
                    value
                        .strip_prefix('"')?
                        .strip_suffix('"')
                        .map(str::to_string)
                })
        };
        if let Some(set) = literal("srcSet") {
            let widths = set
                .split(',')
                .filter_map(|candidate| candidate.split_whitespace().nth(1))
                .any(|descriptor| {
                    descriptor
                        .strip_suffix('w')
                        .is_some_and(|n| n.parse::<u32>().is_ok())
                });
            if widths {
                cx.diagnostics.push(unwired_variant(
                    node,
                    "React Native's Image reads `srcSet` by density only (`1x`, `2x`, `3x`). Its width descriptors (`800w`) are skipped on device with a warning, and `sizes` is not read at all, so the image may draw nothing there. Give density descriptors, or a `src` it can fall back to. On Web the same `srcSet` is chosen by `sizes`.",
                    Severity::Warning,
                ));
            }
        }
    }
    if let Some(src) = node.props.image_default_source {
        let value = source_text(source, src);
        let static_uri = value.starts_with(['\"', '\'']);
        if static_uri {
            props_text.push_str(&format!(" defaultSource={{{{ uri: {value} }}}}"));
        } else {
            cx.runtime.need_component("hozoImageSource");
            props_text.push_str(&format!(" defaultSource={{hozoImageSource({value})}}"));
        }
    }
    // Given back exactly as written. These props are React Native's own;
    // they are modelled only because the DOM spells them differently, and
    // there is nothing to translate on the platform they came from.
    if !node.props.text_input.is_empty() {
        let text_input = &node.props.text_input;
        if let Some(handler) = text_input.on_change_text {
            props_text.push_str(&format!(
                " onChangeText={{{}}}",
                source_text(source, handler)
            ));
        }
        for (name, value) in [
            ("editable", &text_input.editable),
            ("readOnly", &text_input.read_only),
            ("autoCorrect", &text_input.auto_correct),
            ("multiline", &text_input.multiline),
            ("secureTextEntry", &text_input.secure_text_entry),
        ] {
            if let Some(value) = value {
                props_text.push_str(&native_flag(name, value, source));
            }
        }
        if let Some(rows) = text_input.number_of_lines {
            props_text.push_str(&format!(" numberOfLines={{{}}}", source_text(source, rows)));
        }
        for (name, value) in [
            ("keyboardType", &text_input.keyboard_type),
            ("inputMode", &text_input.input_mode),
        ] {
            if let Some(value) = value {
                props_text.push_str(&format!(" {name}=\"{value}\""));
            }
        }
    }
}
