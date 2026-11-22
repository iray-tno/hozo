//! The props Hozo does not model, re-emitted last, and `<a>`'s
//! `external`, which decides the `target` and `rel` they must not undo.

use hozo_ir::{Node, Primitive, SourceCopy};

use crate::{
    attribute_value_slice, attribute_value_source, omit_later_names, render_verbatim,
    source_evidence, source_text, spread_argument, WebRenderContext,
};

/// What the passthrough loop needs to know about the element being rendered.
#[derive(Clone, Copy)]
pub(crate) struct Element<'n> {
    pub(crate) node: &'n Node,
    pub(crate) tag: &'n str,
    pub(crate) disabled_expr: &'n Option<String>,
    pub(crate) is_hozo_component: bool,
}

/// `target` and `rel` for an `<a>`'s `external` prop or a hand-written
/// `_blank`. True when `external` set `target`, so the authored one is dropped.
pub(crate) fn external_link(node: &Node, tag: &str, source: &str, attrs: &mut String) -> bool {
    let mut external_target_consumed = false;
    if tag == "a" {
        let named = |wanted: &str| {
            node.props
                .passthrough
                .iter()
                .find(|prop| prop.name.as_deref() == Some(wanted))
        };
        let authored_rel = named("rel").is_some();
        match named("external") {
            // `<Link external>` and `external={true}`. Known here, so it
            // becomes the attributes it means rather than a ternary over
            // a constant -- the shape `focusable` already uses above.
            Some(prop) if prop.literal.as_deref() == Some("true") => {
                external_target_consumed = true;
                attrs.push_str(" target=\"_blank\"");
                if !authored_rel {
                    attrs.push_str(" rel=\"noreferrer noopener\"");
                }
            }
            // `external={false}` says nothing beyond dropping the prop.
            Some(prop) if prop.literal.is_some() => {}
            Some(prop) => {
                // Carried as a ternary rather than decided, which is what
                // Hozo does with every expression it cannot read. The
                // expression is emitted twice; `data-hozo-disabled` above
                // already re-emits `disabled` the same way.
                external_target_consumed = true;
                let expr = attribute_value_source(source, prop.span);
                attrs.push_str(&format!(" target={{({expr}) ? '_blank' : undefined}}"));
                if !authored_rel {
                    attrs.push_str(&format!(
                        " rel={{({expr}) ? 'noreferrer noopener' : undefined}}"
                    ));
                }
            }
            None => {}
        }
        // A `_blank` written out by hand earns the same `rel`: the risk
        // belongs to the new browsing context, not to the spelling.
        if named("external").is_none() && !authored_rel {
            if let Some(prop) = named("target") {
                match prop.literal.as_deref() {
                    Some("_blank") => attrs.push_str(" rel=\"noreferrer noopener\""),
                    Some(_) => {}
                    None => {
                        let expr = attribute_value_source(source, prop.span);
                        attrs.push_str(&format!(
                            " rel={{(({expr}) === '_blank') ? 'noreferrer noopener' : undefined}}"
                        ));
                    }
                }
            }
        }
    }
    external_target_consumed
}

/// Every passthrough prop, in source order, after the modeled ones.
pub(crate) fn emit(
    element: Element<'_>,
    external_target_consumed: bool,
    attrs: &mut String,
    attr_copies: &mut Option<Vec<SourceCopy>>,
    cx: &mut WebRenderContext<'_>,
) {
    let Element {
        node,
        tag,
        disabled_expr,
        is_hozo_component,
    } = element;
    let source = cx.source;
    for prop in &node.props.passthrough {
        if tag == "a" {
            if let Some(disabled) = &disabled_expr {
                if prop.name.as_deref() == Some("tabIndex") {
                    continue; // Emitted once above, guarded by disabled.
                }
                if let Some(name @ ("onClick" | "onAuxClick")) = prop.name.as_deref() {
                    let value = attribute_value_slice(source, prop.span)
                        .unwrap_or(std::borrow::Cow::Borrowed("true"));
                    let value = value.as_ref();
                    source_evidence::expression(
                        attrs,
                        attr_copies,
                        source,
                        value,
                        &format!(" {name}={{({disabled}) ? (event) => event.preventDefault() : "),
                        "}",
                    );
                    continue;
                }
            }
        }
        if let Some(slot) = node
            .primitive
            .class_slots()
            .iter()
            .find(|slot| prop.name.as_deref() == Some(slot.class_prop))
        {
            let text = source_text(source, prop.span);
            if let Some(expression) = text
                .split_once('=')
                .map(|(_, value)| value.trim())
                .and_then(|value| {
                    value
                        .strip_prefix('{')
                        .and_then(|value| value.strip_suffix('}'))
                })
            {
                // Slot classes land on a child, not the widget's root.
                // Mark that exact target, evaluate once and preserve absent
                // values so component defaults and descendant raw HTML stay
                // untouched. Native resolves this same dynamic slot last.
                source_evidence::expression(attrs, attr_copies, source, expression,
                        &format!(" {}={{((value) => typeof value === 'string' ? value.replace(/\\S/, 'hozo-candidate-owner hozo-candidate-slot-owner $&') : value)(", slot.class_prop), ")}");
                continue;
            }
        }
        // React Native accepts a recursively nested StyleProp array; React
        // DOM accepts one object. Passing the array through does not throw:
        // React serializes its numeric indices as CSS property names and
        // the browser ignores them, which is a quiet total style loss.
        // Keep the native-shaped value and normalize it only on a host DOM
        // element. A fallback component owns the same conversion itself.
        if !is_hozo_component && prop.name.as_deref() == Some("style") {
            if let Some(value) = attribute_value_slice(source, prop.span) {
                let value = value.as_ref();
                source_evidence::expression(
                    attrs,
                    attr_copies,
                    source,
                    value,
                    " style={hozoDomStyle(",
                    ")}",
                );
            } else {
                attrs.push_str(" style={hozoDomStyle(true)}");
            }
            continue;
        }
        // A spread can carry the same style without naming it in source.
        // The helper returns an ordinary spread unchanged when it has no
        // style key, so allocation is paid only by the dynamic path that
        // actually needs normalization.
        if !is_hozo_component && prop.is_spread {
            let text = source_text(source, prop.span);
            let text: &str = &text;
            let value = text
                .strip_prefix("{...")
                .and_then(|rest| rest.strip_suffix('}'))
                .unwrap_or(text)
                .trim();
            // A Button decided at build time still receives its spread in
            // the primitive's vocabulary (`onPress`, `accessibilityLabel`),
            // which means nothing to a DOM element (#1096). Translate it the
            // way the uncompiled Button translates its named props.
            let (open, close) = match (node.primitive, tag) {
                (Primitive::Button, "button") => {
                    (" {...hozoButtonDomProps(".to_string(), ")}".to_string())
                }
                (Primitive::Button, "a") => (
                    " {...hozoLinkDomProps(".to_string(),
                    match &disabled_expr {
                        Some(disabled) => format!(", ({disabled}))}}"),
                        None => ")}".to_string(),
                    },
                ),
                // The same for a TextInput: `onChangeText`, `editable` and the
                // rest are the primitive's words, not the DOM's (#1118).
                (Primitive::TextInput, "input") => {
                    (" {...hozoTextInputDomProps(".to_string(), ")}".to_string())
                }
                (Primitive::TextInput, "textarea") => (
                    " {...hozoTextInputDomProps(".to_string(),
                    ", true)}".to_string(),
                ),
                // And for everything else that shares the universal props:
                // `accessibilityLabel`, `testID`, `accessibilityState` (#1122).
                (Primitive::Image, "img") => {
                    (" {...hozoImageDomProps(".to_string(), ")}".to_string())
                }
                (Primitive::Svg(_), _) => (" {...hozoDomProps(".to_string(), ")}".to_string()),
                _ => (" {...hozoViewDomProps(".to_string(), ")}".to_string()),
            };
            // A prop written after the spread overrides it in JSX, but the
            // modeled props were emitted above, before it. Take those keys
            // out of the spread so the author's later value still wins
            // (#1127). Only when there are any: the common case stays a
            // plain spread with no allocation.
            let (open, close) = match omit_later_names(prop, &node.props.passthrough) {
                Some(destructure) => (
                    format!("{open}(({destructure}) => _hozoRest)(("),
                    format!(") ?? {{}}){close}"),
                ),
                None => (open, close),
            };
            spread_argument(prop, value, &open, &close, attrs, attr_copies, cx);
            continue;
        }
        // `external` is not an attribute the DOM has; it was lowered into
        // `target` and `rel` above. The authored `target` goes with it
        // when it did, because `external` means `_blank` and passthrough
        // props are emitted last -- left in place it would win, and
        // `@hozo/engine`'s half resolves the contradiction the other way.
        if tag == "a" {
            let name = prop.name.as_deref();
            if name == Some("external") || (external_target_consumed && name == Some("target")) {
                continue;
            }
        }
        // `decorative` and `orientation` are Hozo's words for a rule, not
        // the DOM's. They were reaching `<hr>` as attributes nothing reads,
        // while `markup::separator_attrs` says what they actually mean.
        if node.primitive == Primitive::Separator
            && matches!(
                prop.name.as_deref(),
                Some("decorative") | Some("orientation")
            )
        {
            continue;
        }
        // The same as a translated spread above, for one kept as written
        // (a component such as `HozoView`): its modeled props were emitted
        // first, so the keys the author wrote after it come out of it.
        if prop.is_spread {
            if let Some(destructure) = omit_later_names(prop, &node.props.passthrough) {
                let text = source_text(source, prop.span);
                let text: &str = &text;
                let value = text
                    .strip_prefix("{...")
                    .and_then(|rest| rest.strip_suffix('}'))
                    .unwrap_or(text)
                    .trim();
                spread_argument(
                    prop,
                    value,
                    &format!(" {{...(({destructure}) => _hozoRest)(("),
                    ") ?? {})}",
                    attrs,
                    attr_copies,
                    cx,
                );
                continue;
            }
        }
        attrs.push(' ');
        source_evidence::append(
            attrs,
            attr_copies,
            render_verbatim(prop.span, &prop.nested, cx),
        );
    }
}
