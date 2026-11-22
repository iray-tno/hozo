//! `@hozo/navigation`'s `replace` and `prefetch` on a link: inert data on a
//! real anchor for the router's delegated click handler, props on a component.

use hozo_ir::Node;

use crate::*;

pub(crate) fn navigation_attrs(node: &Node, tag: &str, source: &str, attrs: &mut String) {
    // `replace` belongs to an application router, not to HTML. Preserve
    // it on the real anchor as inert data so @hozo/navigation's delegated
    // click handler can reconstruct the request for compiled output too.
    if let Some(replace) = &node.props.navigation_replace {
        if tag == "a" {
            match replace {
                hozo_ir::ConditionExpr::Static(true) => {
                    attrs.push_str(" data-hozo-navigation-replace=\"\"");
                }
                hozo_ir::ConditionExpr::Static(false) => {}
                other => attrs.push_str(&format!(
                    " data-hozo-navigation-replace={{({}) ? '' : undefined}}",
                    render_condition_expr(source, other)
                )),
            }
        } else if tag == "Pressable" {
            attrs.push_str(&boolean_attribute("replace", replace, source));
        }
    }

    // Like `replace`, prefetch intent belongs to the router rather than
    // HTML. The provider observes this inert marker on hover or focus.
    if let Some(prefetch) = &node.props.navigation_prefetch {
        if tag == "a" {
            match prefetch {
                hozo_ir::ConditionExpr::Static(true) => {
                    attrs.push_str(" data-hozo-navigation-prefetch=\"\"");
                }
                hozo_ir::ConditionExpr::Static(false) => {}
                other => attrs.push_str(&format!(
                    " data-hozo-navigation-prefetch={{({}) ? '' : undefined}}",
                    render_condition_expr(source, other)
                )),
            }
        } else if tag == "Pressable" {
            attrs.push_str(&boolean_attribute("prefetch", prefetch, source));
        }
    }
}
