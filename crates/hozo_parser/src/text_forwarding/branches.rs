//! The host each branch of a component renders, summarized into the classes
//! each prop combination forwards.

use std::collections::{BTreeMap, BTreeSet};

use oxc_ast::ast::{
    Expression, JSXAttributeItem, JSXAttributeName, JSXAttributeValue, JSXChild, JSXElement,
    JSXElementName, JSXExpression, Statement,
};
use oxc_syntax::module_record::ImportImportName;

use super::classes::{read_class_name, Scope};
use super::component::{Branch, Host};
use super::params::{is_presence_test, Comparison, Params};
use super::{ForwardingComponent, ForwardingProp, ForwardingVariant};

// Pattern components that render their children inside a `View`, generated
// from the style-slot catalog's `textHosts`.
use crate::pattern_hosts::PATTERN_HOSTS;

/// Hosts whose text styles a Text inside them does not inherit, since React
/// Native inherits text styles only from a Text: the pressables, the ones
/// the Native backend forwards through `hozoTextStyle` (#876), and `View`,
/// which `@hozo/ui`'s Alert became in #983. A `Text` host is left out:
/// inheritance already reaches whatever is nested in it.
const FORWARDING_HOSTS: [&str; 3] = ["Pressable", "Button", "View"];
const HOST_MODULES: [&str; 2] = ["@hozo/core", "@hozo/primitives"];

pub(super) fn read_switch(
    switch: &oxc_ast::ast::SwitchStatement,
    following: Option<&Statement>,
    scope: &Scope,
) -> Option<Vec<Branch>> {
    let Expression::Identifier(id) = switch.discriminant.without_parentheses() else {
        return None;
    };
    let prop = scope.params.prop_name(id.name.as_str())?;
    let mut seen = BTreeSet::new();
    let mut default_seen = false;
    let mut labels = Vec::new();
    let mut branches = Vec::new();
    let mut default = None;
    for case in &switch.cases {
        let value = match &case.test {
            Some(test) => {
                let Expression::StringLiteral(value) = test.without_parentheses() else {
                    return None;
                };
                if !seen.insert(value.value.to_string()) {
                    return None;
                }
                Some(value.value.to_string())
            }
            None => {
                if default_seen {
                    return None;
                }
                default_seen = true;
                None
            }
        };
        labels.push(value);
        if case.consequent.is_empty() {
            continue;
        }
        let [only] = case.consequent.as_slice() else {
            return None;
        };
        let host = read_return(only, scope)?;
        // Empty labels may share one return. No executable statement may
        // fall through, so this does not simulate arbitrary JS control flow.
        for value in labels.drain(..) {
            match value {
                Some(value) => branches.push(Branch {
                    guard: Some(Comparison {
                        prop: prop.to_string(),
                        value,
                    }),
                    host: host.clone(),
                }),
                None => default = Some(host.clone()),
            }
        }
    }
    if !labels.is_empty() {
        return None;
    }
    // A default in the middle is still the fallback, not the first branch.
    // Require exactly one fallback form rather than guessing through an
    // extra unreachable return or a switch that can render nothing.
    let host = match (default, following) {
        (Some(host), None) => host,
        (None, Some(statement)) => read_return(statement, scope)?,
        _ => return None,
    };
    branches.push(Branch { guard: None, host });
    Some(branches)
}

pub(super) fn summarize_branches(
    params: &Params,
    branches: &[Branch],
) -> Option<ForwardingComponent> {
    // Absence is a real source choice, not "not initialized yet". Every
    // branch must agree because the manifest has only one disabledProp.
    let disabled_prop = branches.first()?.host.disabled_prop.clone();
    if branches
        .iter()
        .any(|branch| branch.host.disabled_prop != disabled_prop)
    {
        return None;
    }
    // Every value a prop is compared against, plus its default: the values
    // a caller can write that change the classes.
    let mut domain: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    for branch in branches {
        let mut seen = Vec::new();
        if let Some(guard) = &branch.guard {
            seen.push(guard);
        }
        branch.host.classes.comparisons(&mut seen);
        for c in seen {
            domain
                .entry(c.prop.clone())
                .or_default()
                .insert(c.value.clone());
        }
    }
    let mut props = Vec::new();
    for (name, values) in &mut domain {
        let default = params.props.get(name).cloned().flatten();
        if let Some(default) = &default {
            values.insert(default.clone());
        }
        props.push(ForwardingProp {
            name: name.clone(),
            default,
            values: values.iter().cloned().collect(),
        });
    }

    let mut variants = Vec::new();
    let mut host_states = true;
    for when in combinations(&props) {
        let value_of = |prop: &str| {
            let index = props.iter().position(|p| p.name == prop)?;
            Some(when[index].as_str())
        };
        let holds = |c: &Comparison| value_of(&c.prop) == Some(c.value.as_str());
        let branch = branches
            .iter()
            .find(|b| b.guard.as_ref().is_none_or(holds))?;
        let mut classes = Vec::new();
        branch.host.classes.resolve(&holds, &mut classes);
        let classes = classes
            .join(" ")
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ");
        variants.push(ForwardingVariant { when, classes });
        // A caller cannot tell which host it is in either.
        host_states &= branch.host.states;
    }
    Some(ForwardingComponent {
        name: String::new(),
        props,
        variants,
        disabled_prop,
        host_states,
    })
}

pub(super) fn combinations(props: &[ForwardingProp]) -> Vec<Vec<String>> {
    let mut out = vec![Vec::new()];
    for prop in props {
        out = out
            .into_iter()
            .flat_map(|prefix| {
                prop.values.iter().map(move |value| {
                    let mut next = prefix.clone();
                    next.push(value.clone());
                    next
                })
            })
            .collect();
    }
    out
}

pub(super) fn is_presence_branch(branch: &oxc_ast::ast::IfStatement, params: &Params) -> bool {
    branch.alternate.is_none() && is_presence_test(&branch.test, params)
}

/// `if (href !== undefined) return <A …/>` and the return after it: two
/// elements for one look, read as one when their classes agree.
pub(super) fn read_pair(
    branch: &oxc_ast::ast::IfStatement,
    last: &Statement,
    scope: &Scope,
) -> Option<Host> {
    let with = read_return(&branch.consequent, scope)?;
    let without = read_return(last, scope)?;
    let same = with.disabled_prop == without.disabled_prop
        && with.states == without.states
        && with.classes.normalized() == without.classes.clone().normalized();
    same.then_some(without)
}

pub(super) fn read_return(statement: &Statement, scope: &Scope) -> Option<Host> {
    let statement = match statement {
        Statement::BlockStatement(block) => match block.body.as_slice() {
            [only] => only,
            // `{ if (href !== undefined) return <A …/>; return <B …/> }`: two
            // elements for one look, read as one when their classes agree.
            [Statement::IfStatement(branch), last] if is_presence_branch(branch, scope.params) => {
                return read_pair(branch, last, scope);
            }
            _ => return None,
        },
        other => other,
    };
    let Statement::ReturnStatement(ret) = statement else {
        return None;
    };
    let Expression::JSXElement(element) = ret.argument.as_ref()?.without_parentheses() else {
        return None;
    };
    read_host(element, scope)
}

pub(super) fn read_host(element: &JSXElement, scope: &Scope) -> Option<Host> {
    let (params, module) = (scope.params, scope.module);
    let JSXElementName::IdentifierReference(tag) = &element.opening_element.name else {
        return None;
    };
    if params.is_local(tag.name.as_str()) {
        return None;
    }
    let host = module.import_entries.iter().find_map(|entry| {
        let ImportImportName::Name(imported) = &entry.import_name else {
            return None;
        };
        let (from, name) = (entry.module_request.name.as_str(), imported.name.as_str());
        if entry.local_name.name != tag.name.as_str() {
            return None;
        }
        if HOST_MODULES.contains(&from) && FORWARDING_HOSTS.contains(&name) {
            // The pressable primitives share their state; a View has none.
            return Some(matches!(name, "Pressable" | "Button"));
        }
        PATTERN_HOSTS
            .iter()
            .find(|(module, pattern, _)| *module == from && *pattern == name)
            .map(|(_, _, states)| *states)
    });
    let states = host?;

    // The caller's children have to reach the host: through the rest spread
    // when `children` was not destructured, or as `{children}` when it was.
    let children_destructured = params.props.contains_key("children");
    let mut forwards_children = false;
    let mut spreads_rest = false;
    let mut classes = None;
    let mut disabled_prop = None;
    for attribute in &element.opening_element.attributes {
        match attribute {
            JSXAttributeItem::SpreadAttribute(spread) => {
                let Expression::Identifier(id) = &spread.argument else {
                    return None;
                };
                if params.rest.as_deref() != Some(id.name.as_str()) {
                    return None;
                }
                forwards_children |= !children_destructured;
                spreads_rest = true;
            }
            JSXAttributeItem::Attribute(attribute) => {
                let JSXAttributeName::Identifier(name) = &attribute.name else {
                    continue;
                };
                match name.name.as_str() {
                    "className" => {
                        classes = Some(read_class_name(attribute.value.as_ref()?, scope)?)
                    }
                    "disabled" => {
                        let Some(JSXAttributeValue::ExpressionContainer(container)) =
                            &attribute.value
                        else {
                            return None;
                        };
                        let JSXExpression::Identifier(id) = &container.expression else {
                            return None;
                        };
                        disabled_prop = Some(params.prop_name(id.name.as_str())?.to_string());
                    }
                    _ => {}
                }
            }
        }
    }
    // A formatter puts `{children}` on its own line; the whitespace around it
    // is not a child React renders.
    let children: Vec<&JSXChild> = element
        .children
        .iter()
        .filter(|child| !matches!(child, JSXChild::Text(text) if text.value.trim().is_empty() && text.value.contains('\n')))
        .collect();
    match children.as_slice() {
        [] => {}
        [JSXChild::ExpressionContainer(container)] if children_destructured => {
            let JSXExpression::Identifier(id) = &container.expression else {
                return None;
            };
            forwards_children = params.prop_name(id.name.as_str()) == Some("children");
        }
        _ => return None,
    }
    if !forwards_children {
        return None;
    }
    // A `disabled` left in the rest reaches the host through the spread, so
    // the caller's own `disabled` decides `disabled:` as if it were named.
    // `@hozo/ui`'s Checkbox and Switch take it this way (#974).
    if disabled_prop.is_none() && spreads_rest && !params.props.contains_key("disabled") {
        disabled_prop = Some("disabled".to_string());
    }
    Some(Host {
        classes: classes?,
        disabled_prop,
        states,
    })
}
