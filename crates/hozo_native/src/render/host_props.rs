//! Props that follow from which host the element renders: the container
//! boundary, scroll and refresh props, Hozo's pattern components, the
//! accessibility state, and a link's destination.

use super::*;

pub(super) fn write_host_props(
    node: &Node,
    rendered_component: &str,
    measures_host: bool,
    container_name: &Option<String>,
    props_text: &mut String,
    cx: &mut NativeRenderContext<'_>,
) {
    let source = cx.source;
    // `@container/main`. The unnamed form needs nothing: the component
    // registers under the empty key either way, which is what an unnamed
    // `@sm:` reads.
    if measures_host {
        cx.runtime.need_component("HozoContainer");
        if rendered_component != "View" {
            props_text.push_str(&format!(" hozoContainerComponent={{{rendered_component}}}"));
        }
        if let Some(name) = &container_name {
            props_text.push_str(&format!(" hozoContainerName=\"{name}\""));
        }
    }

    if let Some(horizontal) = &node.props.scroll_horizontal {
        props_text.push_str(&format!(
            " horizontal={{{}}}",
            render_condition_expr(source, horizontal)
        ));
    }
    if let Some(value) = node.props.keyboard_should_persist_taps {
        props_text.push_str(&format!(
            " keyboardShouldPersistTaps={{{}}}",
            source_text(source, value)
        ));
    }
    if let Some(value) = &node.props.shows_vertical_scroll_indicator {
        props_text.push_str(&format!(
            " showsVerticalScrollIndicator={{{}}}",
            render_condition_expr(source, value)
        ));
    }
    if let Some(value) = &node.props.shows_horizontal_scroll_indicator {
        props_text.push_str(&format!(
            " showsHorizontalScrollIndicator={{{}}}",
            render_condition_expr(source, value)
        ));
    }
    if node.primitive == Primitive::ScrollView
        && (node.props.refreshing.is_some() || node.props.on_refresh.is_some())
    {
        let refreshing = node
            .props
            .refreshing
            .as_ref()
            .map(|value| render_condition_expr(source, value))
            .unwrap_or_else(|| "false".to_string());
        let on_refresh = node
            .props
            .on_refresh
            .map(|value| format!(" onRefresh={{{}}}", source_text(source, value)))
            .unwrap_or_default();
        // The one React Native component that reaches the output through a
        // prop rather than through `native_component`, so it has to be
        // recorded by hand here. Missing it means a bundle that builds and
        // dies on first render, which is exactly how `TextInput` was found
        // missing from Metro's list in the first place.
        cx.runtime.need_native("RefreshControl");
        props_text.push_str(&format!(
            " refreshControl={{<RefreshControl refreshing={{{refreshing}}}{on_refresh} />}}"
        ));
    } else {
        if let Some(refreshing) = &node.props.refreshing {
            props_text.push_str(&format!(
                " refreshing={{{}}}",
                render_condition_expr(source, refreshing)
            ));
        }
        if let Some(on_refresh) = node.props.on_refresh {
            props_text.push_str(&format!(
                " onRefresh={{{}}}",
                source_text(source, on_refresh)
            ));
        }
    }
    if let Some(open) = &node.props.open {
        props_text.push_str(&format!(
            " open={{{}}}",
            render_condition_expr(source, open)
        ));
    }
    if node.primitive == Primitive::Badge {
        cx.runtime.need_component("HozoBadge");
    }
    if node.primitive == Primitive::Meter {
        cx.runtime.need_component("HozoMeter");
    }
    if node.primitive == Primitive::Chip {
        cx.runtime.need_component("HozoChip");
    }
    if node.primitive == Primitive::Avatar {
        cx.runtime.need_component("HozoAvatar");
    }
    if node.primitive == Primitive::Pagination {
        cx.runtime.need_component("HozoPagination");
    }
    if node.primitive == Primitive::Stepper {
        cx.runtime.need_component("HozoStepper");
    }
    if node.primitive == Primitive::OtpInput {
        cx.runtime.need_component("HozoOtpInput");
    }
    if node.primitive == Primitive::CommandPalette {
        cx.runtime.need_component("HozoCommandPalette");
    }
    if node.primitive == Primitive::Combobox {
        cx.runtime.need_component("HozoCombobox");
    }
    if node.primitive == Primitive::Listbox {
        cx.runtime.need_component("HozoListbox");
    }
    if node.primitive == Primitive::Menu {
        cx.runtime.need_component("HozoMenu");
    }
    if node.primitive == Primitive::ColorPicker {
        cx.runtime.need_component("HozoColorPicker");
    }
    match node.primitive {
        Primitive::Table => cx.runtime.need_component("HozoTable"),
        Primitive::TableCaption => cx.runtime.need_component("HozoTableCaption"),
        Primitive::TableHeader | Primitive::TableBody | Primitive::TableFooter => {
            cx.runtime.need_component("HozoTableSection")
        }
        Primitive::TableRow => cx.runtime.need_component("HozoTableRow"),
        Primitive::TableHead | Primitive::TableCell => cx.runtime.need_component("HozoTableCell"),
        _ => {}
    }
    if matches!(node.primitive, Primitive::Details | Primitive::Summary) {
        cx.runtime
            .need_component(if node.primitive == Primitive::Details {
                "HozoDetails"
            } else {
                "HozoSummary"
            });
    }
    if node.primitive == Primitive::Dialog {
        // The behaviour lives in `@hozo/behaviors`; the compiler only lowers
        // the styles and checks the props.
        cx.runtime.need_component("HozoDialog");
    }
    if node.primitive == Primitive::FlatList {
        // The list itself is React Native's. What `@hozo/engine` adds is
        // the collection information Android needs and nothing computes on
        // its own -- see `markup.rs`.
        cx.runtime.need_component("HozoFlatList");
    }
    // Imported from the dedicated `@hozo/svg` owner rather than from
    // `react-native-svg` directly. The compiler keeps one import channel;
    // the integration sorts these names into the optional domain package.
    if let Primitive::Svg(element) = node.primitive {
        cx.runtime.need_component(element.runtime_name());
    }
    if node.primitive == Primitive::Link
        || (matches!(node.primitive, Primitive::Button | Primitive::Pressable)
            && node
                .props
                .passthrough
                .iter()
                .any(|p| p.name.as_deref() == Some("href")))
    {
        cx.runtime.need_component("HozoLink");
    }
    if let Some(on_press) = node.props.on_press {
        props_text.push_str(&format!(" onPress={{{}}}", source_text(source, on_press)));
    }
    for (name, value) in [
        (
            "onStartShouldSetResponder",
            node.props.on_start_should_set_responder,
        ),
        (
            "onStartShouldSetResponderCapture",
            node.props.on_start_should_set_responder_capture,
        ),
        (
            "onMoveShouldSetResponder",
            node.props.on_move_should_set_responder,
        ),
        (
            "onMoveShouldSetResponderCapture",
            node.props.on_move_should_set_responder_capture,
        ),
        ("onResponderGrant", node.props.on_responder_grant),
        ("onResponderStart", node.props.on_responder_start),
        ("onResponderMove", node.props.on_responder_move),
        ("onResponderEnd", node.props.on_responder_end),
        ("onResponderRelease", node.props.on_responder_release),
        ("onResponderReject", node.props.on_responder_reject),
        ("onResponderTerminate", node.props.on_responder_terminate),
        (
            "onResponderTerminationRequest",
            node.props.on_responder_termination_request,
        ),
    ] {
        if let Some(value) = value {
            props_text.push_str(&format!(" {name}={{{}}}", source_text(source, value)));
        }
    }
    // React Native's own name for it, unchanged. Modelling this prop was
    // about giving the Web backend something to translate; on Native there
    // is nothing to translate, and losing it here would be a regression
    // from when it was merely carried.
    if let Some(focusable) = &node.props.focusable {
        props_text.push_str(&format!(
            " focusable={{{}}}",
            render_condition_expr(source, focusable)
        ));
    }
    if let Some(disabled) = node
        .props
        .disabled
        .as_ref()
        .filter(|_| node.props.accessibility_state.is_none())
    {
        let disabled = render_condition_expr(source, disabled);
        props_text.push_str(&format!(" disabled={{{disabled}}}"));
    }
    match (node.props.accessibility_state, node.props.disabled.as_ref()) {
        (Some(state), flag)
            if flag.is_some()
                || (node.props.effective_disabled().is_some()
                    && matches!(
                        node.primitive,
                        Primitive::Button
                            | Primitive::Pressable
                            | Primitive::Link
                            | Primitive::TextInput
                    )) =>
        {
            cx.runtime.need_component("nativeDisabledProps");
            let flag = flag
                .map(|flag| format!(", disabled: {}", render_condition_expr(source, flag)))
                .unwrap_or_default();
            props_text.push_str(&format!(
                " {{...nativeDisabledProps({{ accessibilityState: {}{flag} }})}}",
                source_text(source, state)
            ));
        }
        (Some(state), None) => props_text.push_str(&format!(
            " accessibilityState={{{}}}",
            source_text(source, state)
        )),
        (None, Some(_))
            if matches!(
                node.primitive,
                Primitive::Button | Primitive::Pressable | Primitive::Link
            ) =>
        {
            let disabled = render_condition_expr(source, &node.props.effective_disabled().unwrap());
            props_text.push_str(&format!(
                " accessibilityState={{{{ disabled: Boolean({disabled}) }}}}"
            ));
        }
        _ => {}
    }
    let destination_primitive = node.primitive == Primitive::Link
        || node.primitive == Primitive::Svg(SvgElement::Link)
        || (matches!(node.primitive, Primitive::Button | Primitive::Pressable)
            && node
                .props
                .passthrough
                .iter()
                .any(|prop| prop.name.as_deref() == Some("href")));
    if destination_primitive {
        if let Some(replace) = &node.props.navigation_replace {
            props_text.push_str(&format!(
                " replace={{{}}}",
                render_condition_expr(source, replace)
            ));
        }
        if let Some(prefetch) = &node.props.navigation_prefetch {
            props_text.push_str(&format!(
                " prefetch={{{}}}",
                render_condition_expr(source, prefetch)
            ));
        }
    }
}

/// What the element's props start with: the official StyleX residue, which
/// lands before Hozo's generated `style` so it cannot replace the
/// declarations that were lowered, then the props a layout adapter, a
/// backdrop, a link or a progress bar adds.
/// What the leading props are written from.
pub(super) struct Leading<'a> {
    pub(super) scroll_prop: Option<&'static str>,
    pub(super) backdrop_parts: &'a [String],
    pub(super) backdrop_blur: Option<&'a String>,
    pub(super) backdrop_filter: Option<&'a NativeBackdropFilter>,
    pub(super) link_interaction: bool,
}

pub(super) fn leading_props(
    node: &Node,
    leading: Leading<'_>,
    rendered_component: &str,
    source: &str,
) -> String {
    let Leading {
        scroll_prop,
        backdrop_parts,
        backdrop_blur,
        backdrop_filter,
        link_interaction,
    } = leading;
    let mut props_text = node
        .props
        .stylex_residuals
        .iter()
        .map(|residual| format!(" {{...({})}}", residual.render_expression(source)))
        .collect::<String>();
    if let Some(prop) = scroll_prop {
        props_text.push_str(&format!(" {prop}={{true}}"));
    }
    if !backdrop_parts.is_empty() {
        let prop = crate::pattern::backdrop_style_prop(node.primitive, "className")
            .expect("a backdrop style must have a catalogued owner");
        props_text.push_str(&format!(" {prop}={{[{}]}}", backdrop_parts.join(", ")));
    }
    if let Some(radius) = backdrop_blur {
        props_text.push_str(&format!(" hozoBackdropBlur={{{radius}}}"));
    }
    if link_interaction {
        props_text.push_str(" hozoLinkComponent={HozoPressable}");
    }
    if rendered_component == "HozoBackdropFilter" {
        if let Some(NativeBackdropFilter::Blur(radius)) = backdrop_filter {
            props_text.push_str(&format!(" hozoBlurRadius={{{radius}}}"));
        }
    }
    if node.primitive == Primitive::Progress {
        if let Some(value) = progress::accessibility_value(node, source) {
            props_text.push_str(&value);
        }
    }
    props_text
}
