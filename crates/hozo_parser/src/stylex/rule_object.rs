//! Parsing one `stylex.create` rule object into entries.

use std::collections::{HashMap, HashSet};

use hozo_ir::{Condition, ExprRef, Keyframes, StyleProperty};
use oxc_ast::ast::{Expression, ObjectExpression, ObjectPropertyKind};
use oxc_span::GetSpan;

use super::conditions::{
    combine_conditions, stylex_attribute_condition, stylex_media_condition, stylex_pseudo_condition,
};
use super::direct::direct_properties;
use super::priority::{canonical_property, property_priority, stylex_animation_name};
use super::rule::conditional_value;
use super::static_value::{
    first_that_works_call, resolved_static_value, source_span, static_key, StaticValue,
    StaticVariables,
};
use super::tailwind_token::token_for;
use super::{Entry, Gap, ResidualProperty};
use crate::tailwind;

/// One CSS declaration as typed properties, the way a StyleX static value
/// is read: `transform: rotate(3deg)` from a Tailwind theme's `@keyframes`
/// lands on the same `StyleProperty` as `transform: 'rotate(3deg)'` in a
/// `stylex.keyframes`. `None` for a declaration with no typed form.
pub fn css_declaration(property: &str, value: &str) -> Option<Vec<StyleProperty>> {
    let mut camel = String::new();
    let mut upper = false;
    for character in property.trim().chars() {
        if character == '-' {
            upper = true;
        } else if upper {
            camel.extend(character.to_uppercase());
            upper = false;
        } else {
            camel.push(character);
        }
    }
    let value = value.trim();
    let value = match value.parse::<f64>() {
        Ok(number) => StaticValue::Number(number),
        Err(_) => StaticValue::String(value.to_string()),
    };
    lower_static_value(&camel, &value)
}

pub(super) fn lower_static_value(name: &str, value: &StaticValue) -> Option<Vec<StyleProperty>> {
    direct_properties(name, value).or_else(|| {
        let token = token_for(name, value)?;
        let (condition, properties) = tailwind::expand_utility(&token);
        (condition == Condition::Always && !properties.is_empty()).then_some(properties)
    })
}

#[allow(clippy::too_many_arguments)]
pub(super) fn parse_rule_object(
    object: &ObjectExpression,
    namespaces: &HashSet<String>,
    static_objects: &HashMap<String, &ObjectExpression>,
    variables: &StaticVariables,
    keyframes: &HashMap<String, Keyframes>,
    visiting: &mut HashSet<String>,
    out: &mut Vec<Entry>,
    residual: &mut Vec<ResidualProperty>,
    gaps: &mut Vec<Gap>,
    condition: &Condition,
    nesting_priority: u16,
) -> Result<(), Gap> {
    for item in &object.properties {
        let property = match item {
            ObjectPropertyKind::ObjectProperty(property) => property,
            ObjectPropertyKind::SpreadProperty(spread) => {
                let spread_object = match &spread.argument {
                    Expression::ObjectExpression(object) => object,
                    Expression::Identifier(identifier) => {
                        let name = identifier.name.to_string();
                        let Some(object) = static_objects.get(&name) else {
                            return Err(Gap {
                                message: format!(
                                    "StyleX object spread `{name}` must reference a module-scope const object literal."
                                ),
                                span: source_span(spread.span),
                            });
                        };
                        if object.span.end > spread.span.start {
                            return Err(Gap {
                                message: format!(
                                    "StyleX object spread `{name}` must be declared before it is used."
                                ),
                                span: source_span(spread.span),
                            });
                        }
                        if !visiting.insert(name.clone()) {
                            return Err(Gap {
                                message: format!("StyleX object spread `{name}` is recursive."),
                                span: source_span(spread.span),
                            });
                        }
                        parse_rule_object(
                            object,
                            namespaces,
                            static_objects,
                            variables,
                            keyframes,
                            visiting,
                            out,
                            residual,
                            gaps,
                            condition,
                            nesting_priority,
                        )?;
                        visiting.remove(&name);
                        continue;
                    }
                    other => {
                        return Err(Gap {
                            message: "StyleX object spreads must be inline object literals or module-scope const object literals."
                                .to_string(),
                            span: source_span(other.span()),
                        });
                    }
                };
                parse_rule_object(
                    spread_object,
                    namespaces,
                    static_objects,
                    variables,
                    keyframes,
                    visiting,
                    out,
                    residual,
                    gaps,
                    condition,
                    nesting_priority,
                )?;
                continue;
            }
        };
        if property.computed {
            return Err(Gap {
                message: "Computed StyleX property names are not statically lowerable.".to_string(),
                span: source_span(property.span),
            });
        }
        let Some(name) = static_key(&property.key) else {
            return Err(Gap {
                message: "StyleX property names must be identifiers or string literals."
                    .to_string(),
                span: source_span(property.key.span()),
            });
        };
        let nested = condition_key(&name);
        if let Some(nested) = nested {
            let Some((nested_condition_atom, priority)) = nested else {
                residual.push(ResidualProperty {
                    css_name: name.clone(),
                    span: ExprRef(source_span(property.span)),
                });
                gaps.push(Gap {
                    message: format!("StyleX nested condition `{name}` is outside Hozo's cross-platform condition subset."),
                    span: source_span(property.key.span()),
                });
                continue;
            };
            let Expression::ObjectExpression(nested_object) = &property.value else {
                residual.push(ResidualProperty {
                    css_name: name.clone(),
                    span: ExprRef(source_span(property.span)),
                });
                gaps.push(Gap {
                    message: "StyleX nested-condition values must be static object literals."
                        .to_string(),
                    span: source_span(property.value.span()),
                });
                continue;
            };

            // A residual child cannot be copied out of its media wrapper.
            // Parse transactionally: either the whole nested object becomes
            // typed IR, or the original outer property stays intact for the
            // official transform. This prevents supported siblings from
            // being emitted twice when one child is unsupported.
            // StyleX reverses nested at-rule wrappers: an inner query is
            // emitted around the outer one. Prepending here preserves that
            // observable order when the Web backend renders `Condition::All`.
            let nested_condition = combine_conditions(&nested_condition_atom, condition.clone());
            let mut nested_entries = Vec::new();
            let mut nested_residual = Vec::new();
            let mut nested_gaps = Vec::new();
            parse_rule_object(
                nested_object,
                namespaces,
                static_objects,
                variables,
                keyframes,
                visiting,
                &mut nested_entries,
                &mut nested_residual,
                &mut nested_gaps,
                &nested_condition,
                nesting_priority.saturating_add(priority),
            )?;
            if nested_residual.is_empty() {
                out.extend(nested_entries);
            } else {
                for child in nested_residual {
                    residual.push(ResidualProperty {
                        css_name: child.css_name,
                        span: ExprRef(source_span(property.span)),
                    });
                }
                gaps.extend(nested_gaps);
            }
            continue;
        }
        // StyleX's other way to say the same thing, and the one its own
        // documentation leads with: the conditions inside the value,
        // `opacity: { default: 1, ':hover': 0.5 }`. Read into the same
        // entries the nested-object form makes. All of it or none of it, as
        // there: one unreadable branch keeps the whole property for the
        // official transform rather than splitting it between the two.
        if let Expression::ObjectExpression(values) = &property.value {
            let mut entries = Vec::new();
            match conditional_value(
                &name,
                values,
                variables,
                condition,
                nesting_priority,
                source_span(property.span),
                &mut entries,
            ) {
                Ok(()) => out.extend(entries),
                Err(message) => {
                    residual.push(ResidualProperty {
                        css_name: canonical_property(&name).to_string(),
                        span: ExprRef(source_span(property.span)),
                    });
                    gaps.push(Gap {
                        message,
                        span: source_span(property.value.span()),
                    });
                }
            }
            continue;
        }
        let properties = if name == "animationName" {
            let Some(properties) = stylex_animation_name(&property.value, namespaces, keyframes)
            else {
                residual.push(ResidualProperty {
                    css_name: canonical_property(&name).to_string(),
                    span: ExprRef(source_span(property.span)),
                });
                gaps.push(Gap {
                    message: "StyleX `animationName` lowers local static `stylex.keyframes` bindings, including static `firstThatWorks` and array fallbacks."
                        .to_string(),
                    span: source_span(property.value.span()),
                });
                continue;
            };
            properties
        } else if let Some(call) = first_that_works_call(&property.value, namespaces) {
            let candidates = call
                .arguments
                .iter()
                .map(|argument| {
                    argument
                        .as_expression()
                        .and_then(|expression| resolved_static_value(expression, variables))
                })
                .collect::<Option<Vec<_>>>()
                .and_then(|values| (!values.is_empty()).then_some(values))
                .and_then(|values| {
                    values
                        .iter()
                        .map(|value| lower_static_value(&name, value))
                        .collect::<Option<Vec<_>>>()
                })
                .and_then(|groups| {
                    groups
                        .into_iter()
                        .map(|mut group| (group.len() == 1).then(|| group.pop().unwrap()))
                        .collect::<Option<Vec<_>>>()
                })
                .filter(|candidates| {
                    candidates.first().is_some_and(|first| {
                        candidates
                            .iter()
                            .skip(1)
                            .all(|candidate| first.same_property_as(candidate))
                    })
                });
            let Some(candidates) = candidates else {
                residual.push(ResidualProperty {
                    css_name: canonical_property(&name).to_string(),
                    span: ExprRef(source_span(property.span)),
                });
                gaps.push(Gap {
                    message: format!(
                        "StyleX `firstThatWorks` for `{name}` needs one or more static candidates that lower to the same typed property."
                    ),
                    span: source_span(property.value.span()),
                });
                continue;
            };
            vec![StyleProperty::FirstThatWorks(candidates)]
        } else {
            let Some(value) = resolved_static_value(&property.value, variables) else {
                residual.push(ResidualProperty {
                    css_name: canonical_property(&name).to_string(),
                    span: ExprRef(source_span(property.span)),
                });
                gaps.push(Gap {
                    message: format!(
                        "`{name}` has a dynamic or nested StyleX value; this frontend slice accepts static strings, numbers, and safe local `defineVars` members."
                    ),
                    span: source_span(property.value.span()),
                });
                continue;
            };
            match lower_static_value(&name, &value) {
                Some(properties) => properties,
                None => {
                    residual.push(ResidualProperty {
                        css_name: canonical_property(&name).to_string(),
                        span: ExprRef(source_span(property.span)),
                    });
                    gaps.push(Gap {
                        message: format!(
                            "StyleX property `{name}` or its value is not in Hozo's typed universal subset yet."
                        ),
                        span: source_span(property.span),
                    });
                    continue;
                }
            }
        };
        out.push(Entry {
            css_name: canonical_property(&name).to_string(),
            // StyleX assigns each nested condition a published offset.
            // Carrying their sum makes a conditional declaration sort after
            // its base even when the author wrote the nested object first.
            priority: property_priority(&name).saturating_add(nesting_priority),
            properties,
            condition: condition.clone(),
            span: source_span(property.span),
        });
    }
    Ok(())
}

/// Whether a key is a condition, and which: `None` for a property name,
/// `Some(None)` for a condition Hozo does not read, and the condition with
/// StyleX's priority offset for one it does. One answer for both places a
/// condition can be written -- as a nested object's key and inside a value.
pub(super) fn condition_key(name: &str) -> Option<Option<(Condition, u16)>> {
    if name.starts_with("@media ") {
        Some(stylex_media_condition(name).map(|condition| (condition, 200)))
    } else if name.starts_with(':') {
        Some(stylex_pseudo_condition(name))
    } else if name == "@starting-style" {
        // StyleX 0.19 has no priority entry for either of these keys, so
        // they take its default of 3000 -- which is what its own output
        // shows: `opacity` under either is priority 6000.
        Some(Some((Condition::StartingStyle, 3000)))
    } else if name.starts_with('[') {
        Some(stylex_attribute_condition(name).map(|condition| (condition, 3000)))
    } else {
        None
    }
}
