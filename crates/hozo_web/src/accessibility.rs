//! React Native's identity and accessibility props -- test and native IDs,
//! pointer events, state, value, live region, label and hint -- in the DOM's
//! spelling, or as written when the element is a Hozo component that maps
//! them itself; and a meter's amount, a heading's level and a list's order.

use hozo_ir::{Node, Primitive};

use crate::*;

pub(crate) fn accessibility_attrs(
    node: &Node,
    tag: &str,
    is_hozo_component: bool,
    source: &str,
    attrs: &mut String,
) {
    // A meter's amount as a percentage, which is what a reader is given on
    // Native. Without it NVDA reads `<meter value={0.6}>` as "progress bar,
    // 0.6" and VoiceOver as "0.6" (screen-readers run 37790021610): the
    // fraction, not the amount. Worked out at build time when the three
    // numbers are written; otherwise the same sum runs on the page. An
    // author's own `aria-valuetext` wins.
    if tag == "meter"
        && !node
            .props
            .passthrough
            .iter()
            .any(|prop| prop.name.as_deref() == Some("aria-valuetext"))
    {
        if let Some(text) = meter_value_text(node, source) {
            attrs.push_str(&format!(" aria-valuetext={{{text}}}"));
        }
    }
    if let Some(value) = node.props.test_id {
        let name = if is_hozo_component {
            "testID"
        } else {
            "data-testid"
        };
        attrs.push_str(&format!(" {name}={{{}}}", source_text(source, value)));
    }
    if let Some(value) = node.props.native_id {
        let name = if is_hozo_component { "nativeID" } else { "id" };
        attrs.push_str(&format!(" {name}={{{}}}", source_text(source, value)));
    }
    if let Some(value) = node.props.pointer_events {
        let name = if is_hozo_component {
            "pointerEvents"
        } else {
            "data-hozo-pointer-events"
        };
        attrs.push_str(&format!(" {name}={{{}}}", source_text(source, value)));
    }
    if let Some(value) = node.props.accessibility_state {
        let value = source_text(source, value);
        if is_hozo_component {
            attrs.push_str(&format!(" accessibilityState={{{value}}}"));
        } else {
            // Only the keys the author actually wrote.
            //
            // This used to emit all five unconditionally, which is a type
            // error the moment the value is an object literal with fewer:
            // `accessibilityState={{ expanded: open }}` produced
            // `aria-disabled={({ expanded: open }).disabled}`, and
            // `Property 'disabled' does not exist` -- four times, in the
            // author's own build. A partial state object is the normal way
            // to write one.
            //
            // `None` keys means the expression is opaque (a variable, a
            // spread). Reading any of the five off that is fine: React
            // Native's `AccessibilityState` declares all of them optional.
            for (attr_name, key) in ARIA_STATE_ATTRS {
                // `disabled` folds into `hozoInteractive` when there is
                // one; emitting it here too put `aria-disabled` on the
                // element twice and let the later win by accident.
                if *key == "disabled" {
                    continue;
                }
                let written = node
                    .props
                    .accessibility_state_keys
                    .as_ref()
                    .is_none_or(|keys| keys.iter().any(|written| written == key));
                if written {
                    let member = if node.props.accessibility_state_keys.is_none() {
                        "?."
                    } else {
                        "."
                    };
                    attrs.push_str(&format!(" {attr_name}={{({value}){member}{key}}}"));
                }
            }
        }
    }
    if let Some(value) = node.props.accessibility_value {
        let value = source_text(source, value);
        if is_hozo_component {
            attrs.push_str(&format!(" accessibilityValue={{{value}}}"));
        } else {
            // Only the keys the literal has, for the reason the state
            // above does the same: reading `.text` off `{ min, max, now }`
            // is a type error in the author's own project, and `next
            // build` type-checks by default. `None` keys means the
            // expression is opaque, and reading any of the four off that
            // is fine -- React Native declares all of them optional.
            for (attr_name, key) in [
                ("aria-valuemin", "min"),
                ("aria-valuemax", "max"),
                ("aria-valuenow", "now"),
                ("aria-valuetext", "text"),
            ] {
                let written = node
                    .props
                    .accessibility_value_keys
                    .as_ref()
                    .is_none_or(|keys| keys.iter().any(|written| written == key));
                if written {
                    attrs.push_str(&format!(" {attr_name}={{({value}).{key}}}"));
                }
            }
        }
    }
    if let Some(value) = node.props.accessibility_live_region {
        let value = source_text(source, value);
        if is_hozo_component {
            attrs.push_str(&format!(" accessibilityLiveRegion={{{value}}}"));
        } else {
            attrs.push_str(&format!(
                " aria-live={{{value} === 'none' ? undefined : {value}}}"
            ));
        }
    }
    if let Some(value) = node.props.on_layout {
        attrs.push_str(&format!(" onLayout={{{}}}", source_text(source, value)));
    }
    if tag == "Heading" {
        if let Some(level) = &node.props.heading_level {
            let value = match level {
                hozo_ir::HeadingLevel::Static(level) => level.to_string(),
                hozo_ir::HeadingLevel::Dynamic(expr) => source_text(source, *expr).to_string(),
            };
            attrs.push_str(&format!(" level={{{value}}}"));
        }
    }
    if tag == "List" {
        if let Some(ordered) = &node.props.list_ordered {
            attrs.push_str(&format!(
                " ordered={{{}}}",
                render_condition_expr(source, ordered)
            ));
        }
    }

    // Written under the DOM's name for it. See the parser: the source may
    // spell this either way, and re-emitting `accessibilityLabel` here
    // would leave the field with no accessible name at all.
    if node.primitive != Primitive::Image {
        if let Some(label) = node.props.accessibility_label {
            // `aria-label` for a real DOM element; `accessibilityLabel` for a
            // Hozo component, which maps it to `aria-label` itself. Writing
            // the DOM spelling on a component would make it an unknown prop
            // that React drops.
            let name = if is_hozo_component {
                "accessibilityLabel"
            } else {
                "aria-label"
            };
            attrs.push_str(&format!(" {name}={{{}}}", source_text(source, label)));
        }
    }
    if let Some(hint) = node.props.accessibility_hint {
        let name = if is_hozo_component {
            "accessibilityHint"
        } else {
            "aria-description"
        };
        attrs.push_str(&format!(" {name}={{{}}}", source_text(source, hint)));
    }
}
