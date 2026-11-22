//! Static JavaScript values a StyleX rule may read: literals, local
//! constants and `firstThatWorks`.

use std::collections::{HashMap, HashSet};

use hozo_ir::SourceSpan;
use oxc_ast::ast::{CallExpression, Expression, PropertyKey};
use oxc_span::Span;

pub(super) fn source_span(span: Span) -> SourceSpan {
    SourceSpan {
        start: span.start,
        end: span.end,
    }
}

pub(super) fn static_key(key: &PropertyKey) -> Option<String> {
    match key {
        PropertyKey::StaticIdentifier(identifier) => Some(identifier.name.to_string()),
        PropertyKey::StringLiteral(literal) => Some(literal.value.to_string()),
        _ => None,
    }
}

pub(super) fn static_member_path(expression: &Expression) -> Option<String> {
    match expression {
        Expression::Identifier(identifier) => Some(identifier.name.to_string()),
        Expression::StaticMemberExpression(member) => {
            let mut path = static_member_path(&member.object)?;
            path.push('.');
            path.push_str(member.property.name.as_str());
            Some(path)
        }
        _ => None,
    }
}

pub(super) fn numeric_text(value: f64) -> String {
    if value.fract() == 0.0 {
        format!("{value:.0}")
    } else {
        value.to_string()
    }
}

#[derive(Debug, Clone)]
pub(super) enum StaticValue {
    String(String),
    Number(f64),
}

pub(super) type StaticVariables = HashMap<String, HashMap<String, StaticValue>>;

pub(super) fn resolved_static_value(
    expression: &Expression,
    variables: &StaticVariables,
) -> Option<StaticValue> {
    if let Some(value) = static_value(expression) {
        return Some(value);
    }
    let Expression::StaticMemberExpression(member) = expression else {
        return None;
    };
    let Expression::Identifier(object) = &member.object else {
        return None;
    };
    variables
        .get(object.name.as_str())?
        .get(member.property.name.as_str())
        .cloned()
}

pub(super) fn static_value(expression: &Expression) -> Option<StaticValue> {
    match expression {
        Expression::StringLiteral(literal) => Some(StaticValue::String(literal.value.to_string())),
        Expression::NumericLiteral(literal) => Some(StaticValue::Number(literal.value)),
        Expression::UnaryExpression(unary)
            if unary.operator == oxc_syntax::operator::UnaryOperator::UnaryNegation =>
        {
            match &unary.argument {
                Expression::NumericLiteral(literal) => Some(StaticValue::Number(-literal.value)),
                _ => None,
            }
        }
        _ => None,
    }
}

pub(super) fn first_that_works_call<'a>(
    expression: &'a Expression<'a>,
    namespaces: &HashSet<String>,
) -> Option<&'a CallExpression<'a>> {
    let Expression::CallExpression(call) = expression else {
        return None;
    };
    let Expression::StaticMemberExpression(member) = &call.callee else {
        return None;
    };
    let Expression::Identifier(object) = &member.object else {
        return None;
    };
    (member.property.name.as_str() == "firstThatWorks" && namespaces.contains(object.name.as_str()))
        .then_some(call)
}

pub(super) fn raw_value(value: &StaticValue) -> String {
    match value {
        StaticValue::String(value) => value.clone(),
        StaticValue::Number(value) => numeric_text(*value),
    }
}
