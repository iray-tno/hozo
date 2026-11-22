//! Conditional values, and static and function rules.

use std::collections::{HashMap, HashSet};

use hozo_ir::{Condition, Keyframes, SourceSpan};
use oxc_ast::ast::{
    ArrowFunctionExpression, BindingPattern, Expression, ObjectExpression, ObjectPropertyKind,
};
use oxc_span::GetSpan;

use super::conditions::combine_conditions;
use super::priority::{canonical_property, property_priority};
use super::rule_object::{condition_key, lower_static_value, parse_rule_object};
use super::static_value::{resolved_static_value, source_span, static_key, StaticVariables};
use super::{Entry, FunctionEntry, FunctionValue, Gap, ResidualProperty};

/// `name: { default: …, ':hover': …, '@media …': { default: …, … } }`,
/// as entries. `default` is the value under the conditions already
/// around it; every other key is a condition added to them, and may nest
/// again. `null` is StyleX's "no value here".
pub(super) fn conditional_value(
    name: &str,
    values: &ObjectExpression,
    variables: &StaticVariables,
    condition: &Condition,
    nesting_priority: u16,
    span: SourceSpan,
    out: &mut Vec<Entry>,
) -> Result<(), String> {
    for item in &values.properties {
        let ObjectPropertyKind::ObjectProperty(branch) = item else {
            return Err(format!(
                "`{name}`: a spread inside a conditional value is not read statically."
            ));
        };
        if branch.computed {
            return Err(format!(
                "`{name}`: a computed condition key is not read statically."
            ));
        }
        let Some(key) = static_key(&branch.key) else {
            return Err(format!(
                "`{name}`: condition keys must be identifiers or string literals."
            ));
        };
        let (branch_condition, branch_priority) = if key == "default" {
            (condition.clone(), nesting_priority)
        } else {
            match condition_key(&key) {
                Some(Some((atom, priority))) => {
                    (combine_conditions(&atom, condition.clone()), nesting_priority.saturating_add(priority))
                }
                Some(None) => {
                    return Err(format!(
                        "StyleX condition `{key}` in `{name}` is outside Hozo's cross-platform condition subset."
                    ))
                }
                None => return Err(format!("`{key}` in `{name}` is not a StyleX condition.")),
            }
        };
        match &branch.value {
            Expression::NullLiteral(_) => {}
            Expression::ObjectExpression(nested) => conditional_value(
                name,
                nested,
                variables,
                &branch_condition,
                branch_priority,
                span,
                out,
            )?,
            value => {
                let Some(value) = resolved_static_value(value, variables) else {
                    return Err(format!(
                        "`{name}` under `{key}` has a dynamic value; this frontend slice accepts static strings, numbers, and safe local `defineVars` members."
                    ));
                };
                let Some(properties) = lower_static_value(name, &value) else {
                    return Err(format!(
                        "StyleX property `{name}` or its value is not in Hozo's typed universal subset yet."
                    ));
                };
                out.push(Entry {
                    css_name: canonical_property(name).to_string(),
                    priority: property_priority(name).saturating_add(branch_priority),
                    properties,
                    condition: branch_condition,
                    span,
                });
            }
        }
    }
    Ok(())
}

#[allow(clippy::type_complexity)]
pub(super) fn parse_rule(
    expression: &Expression,
    namespaces: &HashSet<String>,
    static_objects: &HashMap<String, &ObjectExpression>,
    variables: &StaticVariables,
    keyframes: &HashMap<String, Keyframes>,
) -> Result<(Vec<Entry>, Vec<ResidualProperty>, Vec<Gap>), Gap> {
    let Expression::ObjectExpression(object) = expression else {
        return Err(Gap {
            message: "StyleX style entries must be static object literals.".to_string(),
            span: source_span(expression.span()),
        });
    };
    let mut out = Vec::new();
    let mut residual = Vec::new();
    let mut gaps = Vec::new();
    parse_rule_object(
        object,
        namespaces,
        static_objects,
        variables,
        keyframes,
        &mut HashSet::new(),
        &mut out,
        &mut residual,
        &mut gaps,
        &Condition::Always,
        0,
    )?;
    Ok((out, residual, gaps))
}

pub(super) fn parse_function_rule(
    arrow: &ArrowFunctionExpression,
    variables: &StaticVariables,
) -> Result<Vec<FunctionEntry>, Gap> {
    if arrow.r#async || arrow.params.items.len() != 1 || arrow.params.rest.is_some() {
        return Err(Gap {
            message: "Static StyleX function styles require one synchronous positional parameter."
                .to_string(),
            span: source_span(arrow.span),
        });
    }
    let parameter = &arrow.params.items[0];
    if parameter.initializer.is_some() {
        return Err(Gap {
            message: "Default parameters in StyleX function styles are not statically evaluated."
                .to_string(),
            span: source_span(parameter.span),
        });
    }
    let BindingPattern::BindingIdentifier(parameter) = &parameter.pattern else {
        return Err(Gap {
            message: "Destructured StyleX function-style parameters are not statically evaluated."
                .to_string(),
            span: source_span(parameter.span),
        });
    };
    let Some(Expression::ObjectExpression(object)) =
        arrow.get_expression().map(Expression::without_parentheses)
    else {
        return Err(Gap {
            message: "Static StyleX function styles require a concise object-expression body."
                .to_string(),
            span: source_span(arrow.body.span()),
        });
    };

    object
        .properties
        .iter()
        .map(|item| {
            let ObjectPropertyKind::ObjectProperty(property) = item else {
                return Err(Gap {
                    message: "Object spreads in StyleX function styles are not statically evaluated."
                        .to_string(),
                    span: source_span(item.span()),
                });
            };
            if property.computed {
                return Err(Gap {
                    message: "Computed properties in StyleX function styles are not statically evaluated."
                        .to_string(),
                    span: source_span(property.span),
                });
            }
            let Some(name) = static_key(&property.key) else {
                return Err(Gap {
                    message: "StyleX function-style property names must be static.".to_string(),
                    span: source_span(property.key.span()),
                });
            };
            if name.starts_with(':') || name.starts_with('@') {
                return Err(Gap {
                    message: "Nested conditions in StyleX function styles remain with the official transform."
                        .to_string(),
                    span: source_span(property.span),
                });
            }
            let value = match &property.value {
                Expression::Identifier(identifier)
                    if identifier.name.as_str() == parameter.name.as_str() =>
                {
                    FunctionValue::Argument
                }
                expression => resolved_static_value(expression, variables)
                    .map(FunctionValue::Static)
                    .ok_or_else(|| Gap {
                        message: "A static StyleX function-style body may use its parameter or static values."
                            .to_string(),
                        span: source_span(expression.span()),
                    })?,
            };
            Ok(FunctionEntry {
                name: name.clone(),
                css_name: canonical_property(&name).to_string(),
                priority: property_priority(&name),
                value,
                span: source_span(property.span),
            })
        })
        .collect()
}
