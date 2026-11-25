//! The at-rules a Tailwind rule can sit in: breakpoints, `@property`
//! registrations, `@supports` refinements and forced-colours fallbacks.

use super::*;

/// An unprefixed rule whose other branches are each a `(width >= …)` query
/// holding only declarations, as Tailwind writes `container`: the rule's
/// own declarations apply everywhere and each branch from its width. Returns
/// each branch's width in pixels with its declarations, or nothing for any
/// other shape.
pub(crate) fn breakpoint_branches(
    nodes: &[OrderRuleShape],
) -> Option<Vec<(f64, &[OrderRuleShape])>> {
    let mut branches = Vec::new();
    let mut declared = false;
    for node in nodes {
        match node {
            OrderRuleShape::Declaration { .. } => declared = true,
            OrderRuleShape::Comment => {}
            node if property_registration(node) => {}
            OrderRuleShape::AtRule {
                name,
                params,
                nodes,
            } if name == "@media" => {
                let width = params
                    .strip_prefix("(width >= ")
                    .and_then(|rest| rest.strip_suffix(')'))
                    .and_then(|value| {
                        if let Some(rem) = value.strip_suffix("rem") {
                            rem.parse::<f64>().ok().map(|rem| rem * 16.0)
                        } else {
                            value.strip_suffix("px")?.parse::<f64>().ok()
                        }
                    })?;
                if !nodes
                    .iter()
                    .all(|node| matches!(node, OrderRuleShape::Declaration { .. }))
                {
                    return None;
                }
                branches.push((width, nodes.as_slice()));
            }
            _ => return None,
        }
    }
    (declared && !branches.is_empty()).then_some(branches)
}

/// A hoisted CSS property definition has no selector-owned style writes.
/// Only the closed registration shape is ignored, never arbitrary @root CSS.
pub(crate) fn property_registration(node: &OrderRuleShape) -> bool {
    let OrderRuleShape::AtRoot { nodes } = node else {
        return false;
    };
    !nodes.is_empty()
        && nodes.iter().all(|node| {
            let OrderRuleShape::AtRule {
                name,
                params,
                nodes,
            } = node
            else {
                return false;
            };
            if name != "@property"
                || !params.starts_with("--")
                || params.len() <= 2
                || !params
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
            {
                return false;
            }
            let mut syntax = false;
            let mut inherits = false;
            let mut initial = false;
            for node in nodes {
                let OrderRuleShape::Declaration {
                    property,
                    important: false,
                } = node
                else {
                    if matches!(node, OrderRuleShape::Comment) {
                        continue;
                    }
                    return false;
                };
                let seen = match property.as_str() {
                    "syntax" => &mut syntax,
                    "inherits" => &mut inherits,
                    "initial-value" => &mut initial,
                    _ => return false,
                };
                if *seen {
                    return false;
                }
                *seen = true;
            }
            syntax && inherits
        })
}

/// An `@supports` among `siblings` that only re-declares, with the same
/// importance, properties the siblings already declare -- as
/// `bg-linear-to-r` re-declares `--tw-gradient-position` for browsers with
/// `in oklab`. It picks which value a browser uses, not which properties the
/// rule writes, under which condition, or how much it weighs, so ownership
/// and order are the same with or without it.
pub(crate) fn supports_refinement(siblings: &[OrderRuleShape], node: &OrderRuleShape) -> bool {
    let OrderRuleShape::AtRule { name, nodes, .. } = node else {
        return false;
    };
    let declared = |property: &str, important: bool| {
        siblings.iter().any(|sibling| {
            matches!(sibling, OrderRuleShape::Declaration { property: p, important: i }
                if p == property && *i == important)
        })
    };
    name == "@supports"
        && nodes
            .iter()
            .any(|node| matches!(node, OrderRuleShape::Declaration { .. }))
        && nodes.iter().all(|node| match node {
            OrderRuleShape::Declaration {
                property,
                important,
            } => declared(property, *important),
            OrderRuleShape::Comment => true,
            _ => false,
        })
}

/// `outline-hidden`'s `@media (forced-colors: active)` branch: a transparent
/// outline for a mode where the system repaints outlines. The branch refines
/// the originating rule rather than owning a second position in the order.
/// Only beside declarations of the rule's own: alone, it is the
/// `forced-colors:` variant.
pub(crate) fn forced_colors_fallback(siblings: &[OrderRuleShape], node: &OrderRuleShape) -> bool {
    if !siblings
        .iter()
        .any(|sibling| matches!(sibling, OrderRuleShape::Declaration { .. }))
    {
        return false;
    }
    let OrderRuleShape::AtRule {
        name,
        params,
        nodes,
    } = node
    else {
        return false;
    };
    name == "@media"
        && params == "(forced-colors: active)"
        && nodes.iter().all(|node| {
            matches!(
                node,
                OrderRuleShape::Declaration { .. } | OrderRuleShape::Comment
            )
        })
}
