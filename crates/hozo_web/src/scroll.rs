//! Scroll containers on Web: keyboard access for one that lowered to a DOM
//! element, and the refresh, keyboard, indicator and scroll-event props a
//! `ScrollView`, `FlatList` or `RefreshControl` carries.

use hozo_ir::{Node, Primitive};

use crate::{render_condition_expr, scrolls_by_style, source_text};

pub(crate) fn scroll_attrs(node: &Node, tag: &str, source: &str, attrs: &mut String) {
    // A tag that lowered to a DOM element, rather than one carried
    // verbatim: a foreign component supplies its own behaviour and a spread
    // aimed at a `div` would be props it never asked for. Lowercase is the
    // whole test -- JSX reserves it for host elements.
    let lowered_to_dom = tag.chars().next().is_some_and(char::is_lowercase);
    if lowered_to_dom && (node.primitive == Primitive::ScrollView || scrolls_by_style(node)) {
        // Keyboard access for the scroll container, decided at runtime
        // because nothing that decides it is a compile-time fact:
        // whether it overflows depends on CSS, content and viewport,
        // and whether it holds anything focusable depends on what a
        // runtime expression rendered. See `hozoScrollable` and #99.
        //
        // Skipped entirely when the author wrote `tabIndex`. That is the
        // whole of the precedence rule, and settling it here rather than
        // in the runtime means there is no branch to get wrong: an
        // author saying `tabIndex={-1}` means it, and a spread that is
        // never emitted cannot argue.
        let authored_tab_index = node.props.passthrough.iter().any(|prop| {
            !prop.is_spread
                && source_text(source, prop.span)
                    .trim_start()
                    .starts_with("tabIndex")
        });
        if !authored_tab_index {
            attrs.push_str(" {...hozoScrollable()}");
        }
    }
    if node.primitive == Primitive::ScrollView {
        if tag == "HozoScrollView" {
            if let Some(refreshing) = &node.props.refreshing {
                attrs.push_str(&format!(
                    " refreshing={{{}}}",
                    render_condition_expr(source, refreshing)
                ));
            }
            if let Some(on_refresh) = node.props.on_refresh {
                attrs.push_str(&format!(
                    " onRefresh={{{}}}",
                    source_text(source, on_refresh)
                ));
            }
            if let Some(value) = node.props.keyboard_should_persist_taps {
                attrs.push_str(&format!(
                    " keyboardShouldPersistTaps={{{}}}",
                    source_text(source, value)
                ));
            }
            if let Some(value) = &node.props.shows_vertical_scroll_indicator {
                attrs.push_str(&format!(
                    " showsVerticalScrollIndicator={{{}}}",
                    render_condition_expr(source, value)
                ));
            }
            if let Some(value) = &node.props.shows_horizontal_scroll_indicator {
                attrs.push_str(&format!(
                    " showsHorizontalScrollIndicator={{{}}}",
                    render_condition_expr(source, value)
                ));
            }
        } else if node.props.shows_vertical_scroll_indicator.is_some()
            || node.props.shows_horizontal_scroll_indicator.is_some()
        {
            let horizontal = node
                .props
                .scroll_horizontal
                .as_ref()
                .map(|value| render_condition_expr(source, value))
                .unwrap_or_else(|| "false".to_string());
            let vertical = node
                .props
                .shows_vertical_scroll_indicator
                .as_ref()
                .map(|value| render_condition_expr(source, value))
                .unwrap_or_else(|| "true".to_string());
            let horizontal_indicator = node
                .props
                .shows_horizontal_scroll_indicator
                .as_ref()
                .map(|value| render_condition_expr(source, value))
                .unwrap_or_else(|| "true".to_string());
            attrs.push_str(&format!(
                " data-hozo-hide-scrollbar={{({horizontal} ? !({horizontal_indicator}) : !({vertical})) ? '' : undefined}}"
            ));
        }
    } else if node.primitive == Primitive::FlatList {
        if let Some(refreshing) = &node.props.refreshing {
            attrs.push_str(&format!(
                " refreshing={{{}}}",
                render_condition_expr(source, refreshing)
            ));
        }
        if let Some(on_refresh) = node.props.on_refresh {
            attrs.push_str(&format!(
                " onRefresh={{{}}}",
                source_text(source, on_refresh)
            ));
        }
        if let Some(value) = node.props.keyboard_should_persist_taps {
            attrs.push_str(&format!(
                " keyboardShouldPersistTaps={{{}}}",
                source_text(source, value)
            ));
        }
        if let Some(value) = &node.props.shows_vertical_scroll_indicator {
            attrs.push_str(&format!(
                " showsVerticalScrollIndicator={{{}}}",
                render_condition_expr(source, value)
            ));
        }
        if let Some(value) = &node.props.shows_horizontal_scroll_indicator {
            attrs.push_str(&format!(
                " showsHorizontalScrollIndicator={{{}}}",
                render_condition_expr(source, value)
            ));
        }
    } else if node.primitive == Primitive::RefreshControl {
        if let Some(refreshing) = &node.props.refreshing {
            attrs.push_str(&format!(
                " refreshing={{{}}}",
                render_condition_expr(source, refreshing)
            ));
        }
        if let Some(on_refresh) = node.props.on_refresh {
            attrs.push_str(&format!(
                " onRefresh={{{}}}",
                source_text(source, on_refresh)
            ));
        }
    }
    if matches!(node.primitive, Primitive::ScrollView | Primitive::FlatList) {
        if let Some(value) = node.props.on_scroll {
            attrs.push_str(&format!(" onScroll={{{}}}", source_text(source, value)));
        }
        if let Some(value) = node.props.scroll_event_throttle {
            attrs.push_str(&format!(
                " scrollEventThrottle={{{}}}",
                source_text(source, value)
            ));
        }
    }
}
