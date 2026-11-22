//! Visitors that collect a module's style sheets and exported bindings.

use std::collections::{HashMap, HashSet};

use hozo_ir::{Keyframes, SourceSpan};
use oxc_ast::ast::{
    ArrowFunctionExpression, BindingPattern, Expression, Function, ObjectExpression,
    ObjectPropertyKind, VariableDeclarator,
};
use oxc_ast_visit::walk::{
    walk_arrow_function_expression, walk_function, walk_variable_declarator,
};
use oxc_ast_visit::Visit;
use oxc_syntax::module_record::{ExportExportName, ModuleRecord};
use oxc_syntax::scope::ScopeFlags;

use super::registry::{
    ModuleExportKind, ModuleExportSummary, ModuleMemberStatus, ModuleMemberSummary,
};
use super::rule::{parse_function_rule, parse_rule};
use super::static_value::{source_span, static_key, static_value, StaticVariables};
use super::statics::{create_object, define_vars_object};
use super::Rule;

pub(super) struct SheetCollector<'n, 'a> {
    pub(super) namespaces: &'n HashSet<String>,
    pub(super) static_objects: &'n HashMap<String, &'a ObjectExpression<'a>>,
    pub(super) variables: &'n StaticVariables,
    pub(super) keyframes: &'n HashMap<String, Keyframes>,
    pub(super) sheets: HashMap<String, HashMap<String, Rule>>,
    pub(super) scan_spans: Vec<SourceSpan>,
    pub(super) function_depth: usize,
}

pub(super) struct ExportedVariableCollector<'n> {
    pub(super) namespaces: &'n HashSet<String>,
    pub(super) aliases: &'n HashMap<String, Vec<String>>,
    pub(super) exports: Vec<ModuleExportSummary>,
    pub(super) function_depth: usize,
}

impl<'a> Visit<'a> for ExportedVariableCollector<'_> {
    fn visit_function(&mut self, function: &Function<'a>, flags: ScopeFlags) {
        self.function_depth += 1;
        walk_function(self, function, flags);
        self.function_depth -= 1;
    }

    fn visit_arrow_function_expression(&mut self, function: &ArrowFunctionExpression<'a>) {
        self.function_depth += 1;
        walk_arrow_function_expression(self, function);
        self.function_depth -= 1;
    }

    fn visit_variable_declarator(&mut self, declarator: &VariableDeclarator<'a>) {
        if self.function_depth > 0 {
            walk_variable_declarator(self, declarator);
            return;
        }
        let BindingPattern::BindingIdentifier(identifier) = &declarator.id else {
            walk_variable_declarator(self, declarator);
            return;
        };
        let local = identifier.name.as_str();
        let Some(exported_names) = self.aliases.get(local) else {
            walk_variable_declarator(self, declarator);
            return;
        };
        let Some(Expression::CallExpression(call)) = &declarator.init else {
            walk_variable_declarator(self, declarator);
            return;
        };
        let Some(object) = define_vars_object(call, self.namespaces) else {
            walk_variable_declarator(self, declarator);
            return;
        };
        let mut members = object
            .properties
            .iter()
            .filter_map(|item| {
                let ObjectPropertyKind::ObjectProperty(property) = item else {
                    return None;
                };
                let name = static_key(&property.key)?;
                Some(ModuleMemberSummary {
                    name,
                    status: if static_value(&property.value).is_some() {
                        ModuleMemberStatus::Static
                    } else {
                        ModuleMemberStatus::Unsupported
                    },
                })
            })
            .collect::<Vec<_>>();
        members.sort_by(|left, right| left.name.cmp(&right.name));
        for exported in exported_names {
            self.exports.push(ModuleExportSummary {
                exported: exported.clone(),
                local: local.to_string(),
                kind: ModuleExportKind::Variables,
                members: members.clone(),
            });
        }
        walk_variable_declarator(self, declarator);
    }
}

impl<'a> Visit<'a> for SheetCollector<'_, 'a> {
    // Module-scope only. Without semantic reference resolution, accepting a
    // local `const styles` would make two functions using that common name
    // overwrite each other in this map and silently apply the last sheet to
    // both. Cross-scope support waits for symbol IDs; declining is exact.
    fn visit_function(&mut self, function: &Function<'a>, flags: ScopeFlags) {
        self.function_depth += 1;
        walk_function(self, function, flags);
        self.function_depth -= 1;
    }

    fn visit_arrow_function_expression(&mut self, function: &ArrowFunctionExpression<'a>) {
        self.function_depth += 1;
        walk_arrow_function_expression(self, function);
        self.function_depth -= 1;
    }

    fn visit_variable_declarator(&mut self, declarator: &VariableDeclarator<'a>) {
        let BindingPattern::BindingIdentifier(identifier) = &declarator.id else {
            walk_variable_declarator(self, declarator);
            return;
        };
        let Some(Expression::CallExpression(call)) = &declarator.init else {
            walk_variable_declarator(self, declarator);
            return;
        };
        let Some(object) = create_object(call, self.namespaces) else {
            walk_variable_declarator(self, declarator);
            return;
        };
        self.scan_spans.push(source_span(object.span));
        if self.function_depth > 0 {
            walk_variable_declarator(self, declarator);
            return;
        }
        let mut rules = HashMap::new();
        for item in &object.properties {
            let ObjectPropertyKind::ObjectProperty(property) = item else {
                continue;
            };
            let Some(name) = static_key(&property.key) else {
                continue;
            };
            let rule = match &property.value {
                Expression::ArrowFunctionExpression(arrow) => {
                    match parse_function_rule(arrow, self.variables) {
                        Ok(entries) => Rule::Function { entries },
                        Err(gap) => Rule::Gap(gap),
                    }
                }
                expression => match parse_rule(
                    expression,
                    self.namespaces,
                    self.static_objects,
                    self.variables,
                    self.keyframes,
                ) {
                    Ok((entries, residual, gaps)) => Rule::Ready {
                        entries,
                        residual,
                        gaps,
                    },
                    Err(gap) => Rule::Gap(gap),
                },
            };
            rules.insert(name, rule);
        }
        self.sheets.insert(identifier.name.to_string(), rules);
        walk_variable_declarator(self, declarator);
    }
}

pub(super) fn export_aliases(module: &ModuleRecord) -> HashMap<String, Vec<String>> {
    let mut aliases: HashMap<String, Vec<String>> = HashMap::new();
    for entry in &module.local_export_entries {
        if entry.is_type {
            continue;
        }
        let Some(local) = entry.local_name.name() else {
            continue;
        };
        let exported = match &entry.export_name {
            ExportExportName::Name(name) => name.name.to_string(),
            ExportExportName::Default(_) => "default".to_string(),
            ExportExportName::Null => continue,
        };
        aliases.entry(local.to_string()).or_default().push(exported);
    }
    for names in aliases.values_mut() {
        names.sort();
        names.dedup();
    }
    aliases
}
