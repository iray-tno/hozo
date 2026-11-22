//! Module-level static variables, objects and keyframes a rule may refer to.

use std::collections::{HashMap, HashSet};

use hozo_ir::{Keyframe, Keyframes, SourceSpan};
use oxc_ast::ast::{
    Argument, BindingPattern, CallExpression, Expression, IdentifierReference, ObjectExpression,
    ObjectPropertyKind, Statement, StaticMemberExpression, VariableDeclarationKind,
};
use oxc_ast_visit::walk::{walk_object_expression, walk_static_member_expression};
use oxc_ast_visit::Visit;
use oxc_syntax::module_record::ModuleRecord;

use super::rule_object::lower_static_value;
use super::static_value::{
    resolved_static_value, source_span, static_key, static_value, StaticVariables,
};

#[derive(Default)]
pub(super) struct StaticVariableUses {
    references: HashMap<String, usize>,
    member_reads: HashMap<String, usize>,
}

impl<'a> Visit<'a> for StaticVariableUses {
    fn visit_identifier_reference(&mut self, identifier: &IdentifierReference<'a>) {
        *self
            .references
            .entry(identifier.name.to_string())
            .or_default() += 1;
    }

    fn visit_static_member_expression(&mut self, member: &StaticMemberExpression<'a>) {
        if let Expression::Identifier(identifier) = &member.object {
            *self
                .member_reads
                .entry(identifier.name.to_string())
                .or_default() += 1;
        }
        walk_static_member_expression(self, member);
    }
}

pub(super) fn define_vars_object<'a>(
    call: &'a CallExpression<'a>,
    namespaces: &HashSet<String>,
) -> Option<&'a ObjectExpression<'a>> {
    let Expression::StaticMemberExpression(member) = &call.callee else {
        return None;
    };
    let Expression::Identifier(object) = &member.object else {
        return None;
    };
    if member.property.name.as_str() != "defineVars" || !namespaces.contains(object.name.as_str()) {
        return None;
    }
    match call.arguments.first()? {
        Argument::ObjectExpression(object) => Some(object),
        _ => None,
    }
}

/// Collect only local token tables that cannot participate in a theme.
///
/// An exported table may be passed to `createTheme` in another module, and a
/// bare local reference may do the same in this one. In either case replacing
/// its CSS variable with the default would be observably wrong, so those stay
/// with the official StyleX transform. A non-exported table whose every use is
/// a static member read is immutable compile-time data and can safely join the
/// universal typed-property path without runtime variable resolution.
pub(super) fn module_static_variables(
    program: &oxc_ast::ast::Program,
    module: &ModuleRecord,
    namespaces: &HashSet<String>,
) -> (StaticVariables, Vec<SourceSpan>) {
    let mut variables = StaticVariables::new();
    let mut spans = HashMap::new();
    for statement in &program.body {
        let Statement::VariableDeclaration(declaration) = statement else {
            continue;
        };
        if declaration.kind != VariableDeclarationKind::Const {
            continue;
        }
        for declarator in &declaration.declarations {
            let BindingPattern::BindingIdentifier(identifier) = &declarator.id else {
                continue;
            };
            if module
                .exported_bindings
                .contains_key(identifier.name.as_str())
            {
                continue;
            }
            let Some(Expression::CallExpression(call)) = &declarator.init else {
                continue;
            };
            let Some(object) = define_vars_object(call, namespaces) else {
                continue;
            };
            let values = object
                .properties
                .iter()
                .map(|item| {
                    let ObjectPropertyKind::ObjectProperty(property) = item else {
                        return None;
                    };
                    if property.computed {
                        return None;
                    }
                    Some((static_key(&property.key)?, static_value(&property.value)?))
                })
                .collect::<Option<HashMap<_, _>>>();
            let Some(values) = values else {
                continue;
            };
            variables.insert(identifier.name.to_string(), values);
            spans.insert(identifier.name.to_string(), source_span(object.span));
        }
    }

    let mut uses = StaticVariableUses::default();
    uses.visit_program(program);
    variables.retain(|name, _| {
        uses.references.get(name).copied().unwrap_or_default()
            == uses.member_reads.get(name).copied().unwrap_or_default()
    });
    let scan_spans = variables
        .keys()
        .filter_map(|name| spans.get(name).copied())
        .collect();
    (variables, scan_spans)
}

#[derive(Default)]
pub(super) struct StaticObjectUses {
    references: HashMap<String, usize>,
    spreads: HashMap<String, usize>,
}

impl<'a> Visit<'a> for StaticObjectUses {
    fn visit_identifier_reference(&mut self, identifier: &IdentifierReference<'a>) {
        *self
            .references
            .entry(identifier.name.to_string())
            .or_default() += 1;
    }

    fn visit_object_expression(&mut self, object: &ObjectExpression<'a>) {
        for property in &object.properties {
            let ObjectPropertyKind::SpreadProperty(spread) = property else {
                continue;
            };
            let Expression::Identifier(identifier) = &spread.argument else {
                continue;
            };
            *self.spreads.entry(identifier.name.to_string()).or_default() += 1;
        }
        walk_object_expression(self, object);
    }
}

pub(super) fn module_static_objects<'a>(
    program: &'a oxc_ast::ast::Program<'a>,
    module: &ModuleRecord<'a>,
) -> HashMap<String, &'a ObjectExpression<'a>> {
    let mut objects = HashMap::new();
    for statement in &program.body {
        let Statement::VariableDeclaration(declaration) = statement else {
            continue;
        };
        if declaration.kind != VariableDeclarationKind::Const {
            continue;
        }
        for declarator in &declaration.declarations {
            let BindingPattern::BindingIdentifier(identifier) = &declarator.id else {
                continue;
            };
            let Some(Expression::ObjectExpression(object)) = &declarator.init else {
                continue;
            };
            objects.insert(identifier.name.to_string(), object.as_ref());
        }
    }
    let mut uses = StaticObjectUses::default();
    uses.visit_program(program);
    objects.retain(|name, _| {
        uses.references.get(name).copied().unwrap_or_default()
            == uses.spreads.get(name).copied().unwrap_or_default()
            && !module.exported_bindings.contains_key(name.as_str())
    });
    objects
}

pub(super) fn create_object<'a>(
    call: &'a CallExpression<'a>,
    namespaces: &HashSet<String>,
) -> Option<&'a ObjectExpression<'a>> {
    let Expression::StaticMemberExpression(member) = &call.callee else {
        return None;
    };
    let Expression::Identifier(object) = &member.object else {
        return None;
    };
    if member.property.name.as_str() != "create" || !namespaces.contains(object.name.as_str()) {
        return None;
    }
    match call.arguments.first()? {
        Argument::ObjectExpression(object) => Some(object),
        _ => None,
    }
}

pub(super) fn keyframes_object<'a>(
    call: &'a CallExpression<'a>,
    namespaces: &HashSet<String>,
) -> Option<&'a ObjectExpression<'a>> {
    let Expression::StaticMemberExpression(member) = &call.callee else {
        return None;
    };
    let Expression::Identifier(object) = &member.object else {
        return None;
    };
    if member.property.name.as_str() != "keyframes" || !namespaces.contains(object.name.as_str()) {
        return None;
    }
    match call.arguments.first()? {
        Argument::ObjectExpression(object) if call.arguments.len() == 1 => Some(object),
        _ => None,
    }
}

pub(super) fn valid_keyframe_selector(selector: &str) -> bool {
    selector.split(',').all(|part| {
        let part = part.trim();
        matches!(part, "from" | "to")
            || part
                .strip_suffix('%')
                .and_then(|number| number.parse::<f64>().ok())
                .is_some_and(|number| (0.0..=100.0).contains(&number))
    })
}

pub(super) fn keyframes_name(frames: &[Keyframe]) -> String {
    // FNV-1a is deliberately tiny and stable. This is an identifier, not a
    // security boundary; hashing the canonical typed representation makes
    // formatting-only source edits retain the same animation name.
    let mut hash = 0xcbf29ce484222325u64;
    for byte in format!("{frames:?}").bytes() {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("hozo-kf-{hash:016x}")
}

pub(super) fn module_keyframes(
    program: &oxc_ast::ast::Program,
    namespaces: &HashSet<String>,
    variables: &StaticVariables,
) -> (HashMap<String, Keyframes>, Vec<SourceSpan>) {
    let mut keyframes = HashMap::new();
    let mut spans = Vec::new();
    for statement in &program.body {
        let Statement::VariableDeclaration(declaration) = statement else {
            continue;
        };
        if declaration.kind != VariableDeclarationKind::Const {
            continue;
        }
        for declarator in &declaration.declarations {
            let BindingPattern::BindingIdentifier(identifier) = &declarator.id else {
                continue;
            };
            let Some(Expression::CallExpression(call)) = &declarator.init else {
                continue;
            };
            let Some(object) = keyframes_object(call, namespaces) else {
                continue;
            };
            let frames = object
                .properties
                .iter()
                .map(|item| {
                    let ObjectPropertyKind::ObjectProperty(frame) = item else {
                        return None;
                    };
                    if frame.computed {
                        return None;
                    }
                    let selector = static_key(&frame.key)?;
                    if !valid_keyframe_selector(&selector) {
                        return None;
                    }
                    let Expression::ObjectExpression(declarations) = &frame.value else {
                        return None;
                    };
                    let properties = declarations
                        .properties
                        .iter()
                        .map(|item| {
                            let ObjectPropertyKind::ObjectProperty(property) = item else {
                                return None;
                            };
                            if property.computed {
                                return None;
                            }
                            let name = static_key(&property.key)?;
                            if name.starts_with(':') || name.starts_with('@') {
                                return None;
                            }
                            let value = resolved_static_value(&property.value, variables)?;
                            lower_static_value(&name, &value)
                        })
                        .collect::<Option<Vec<_>>>()?
                        .into_iter()
                        .flatten()
                        .collect::<Vec<_>>();
                    (!properties.is_empty()).then_some(Keyframe {
                        selector,
                        properties,
                    })
                })
                .collect::<Option<Vec<_>>>();
            let Some(frames) = frames.filter(|frames| !frames.is_empty()) else {
                continue;
            };
            spans.push(source_span(object.span));
            keyframes.insert(
                identifier.name.to_string(),
                Keyframes {
                    name: keyframes_name(&frames),
                    frames,
                },
            );
        }
    }
    (keyframes, spans)
}
