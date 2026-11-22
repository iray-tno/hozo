//! A component's props as its parameters name them, and the conditions it
//! tests them with.

use std::collections::BTreeMap;

use oxc_ast::ast::{BindingPattern, Expression, FormalParameters};
use oxc_syntax::operator::BinaryOperator;

/// Defaults belong to public prop names; expressions refer to local names.
/// Keep that distinction until the summary, including children/className and
/// the prop that reaches the host's disabled attribute.
pub(super) struct Params {
    pub(super) props: BTreeMap<String, Option<String>>,
    pub(super) locals: BTreeMap<String, String>,
    pub(super) rest: Option<String>,
}

impl Params {
    pub(super) fn prop_name(&self, local: &str) -> Option<&str> {
        self.locals.get(local).map(String::as_str)
    }

    pub(super) fn is_local(&self, name: &str) -> bool {
        self.locals.contains_key(name) || self.rest.as_deref() == Some(name)
    }
}

pub(super) fn read_params(params: &FormalParameters) -> Option<Params> {
    let [first] = params.items.as_slice() else {
        return None;
    };
    read_props(&first.pattern)
}

pub(super) fn read_props(pattern: &BindingPattern) -> Option<Params> {
    let BindingPattern::ObjectPattern(object) = pattern else {
        return None;
    };
    let mut props = BTreeMap::new();
    let mut locals = BTreeMap::new();
    for property in &object.properties {
        if property.computed {
            return None;
        }
        let key = property.key.static_name()?.to_string();
        let (local, default) = match &property.value {
            BindingPattern::BindingIdentifier(local) => (local.name.to_string(), None),
            BindingPattern::AssignmentPattern(assign) => {
                let BindingPattern::BindingIdentifier(local) = &assign.left else {
                    return None;
                };
                // A default that is not a string (`live = false`) is kept as
                // none. If the classes compare the prop, a caller who leaves
                // it out then gets nothing handed down, which is the safe
                // side; if they do not, it never mattered.
                let default = match &assign.right {
                    Expression::StringLiteral(value) => Some(value.value.to_string()),
                    _ => None,
                };
                (local.name.to_string(), default)
            }
            _ => return None,
        };
        // Repeated public keys can have different local defaults. One
        // manifest prop cannot describe those, even if the JS is legal.
        if props.insert(key.clone(), default).is_some() || locals.insert(local, key).is_some() {
            return None;
        }
    }
    let rest = match &object.rest {
        None => None,
        Some(rest) => match &rest.argument {
            BindingPattern::BindingIdentifier(id) => Some(id.name.to_string()),
            _ => return None,
        },
    };
    if rest.as_ref().is_some_and(|name| locals.contains_key(name)) {
        return None;
    }
    Some(Params {
        props,
        locals,
        rest,
    })
}

/// A choice between two class lists, made by comparing a prop with a
/// literal.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct Comparison {
    pub(super) prop: String,
    pub(super) value: String,
}

pub(super) fn read_comparison(expr: &Expression, params: &Params) -> Option<Comparison> {
    let Expression::BinaryExpression(binary) = expr.without_parentheses() else {
        return None;
    };
    if binary.operator != BinaryOperator::StrictEquality {
        return None;
    }
    let pair = match (&binary.left, &binary.right) {
        (Expression::Identifier(id), Expression::StringLiteral(lit))
        | (Expression::StringLiteral(lit), Expression::Identifier(id)) => (id, lit),
        _ => return None,
    };
    Some(Comparison {
        prop: params.prop_name(pair.0.name.as_str())?.to_string(),
        value: pair.1.value.to_string(),
    })
}

/// `prop !== undefined`, `prop != null` or a bare `prop`, on a destructured
/// prop: a question about whether it was passed, not about its value.
pub(super) fn is_presence_test(expr: &Expression, params: &Params) -> bool {
    let is_prop = |expr: &Expression| matches!(expr.without_parentheses(), Expression::Identifier(id) if params.prop_name(id.name.as_str()).is_some());
    match expr.without_parentheses() {
        Expression::BinaryExpression(binary) => {
            let nothing = |expr: &Expression| match expr.without_parentheses() {
                Expression::Identifier(id) => id.name == "undefined",
                Expression::NullLiteral(_) => true,
                _ => false,
            };
            matches!(
                binary.operator,
                BinaryOperator::StrictInequality | BinaryOperator::Inequality
            ) && (is_prop(&binary.left) && nothing(&binary.right)
                || nothing(&binary.left) && is_prop(&binary.right))
        }
        other => is_prop(other),
    }
}
