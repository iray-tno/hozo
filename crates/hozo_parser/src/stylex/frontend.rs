//! Collecting a module's StyleX sheets and resolving `stylex.props` calls.

use std::collections::{HashMap, HashSet};

use hozo_ir::{
    Condition, ConditionExpr, ExprRef, StyleDeclaration, StylexResidual, StylexResidualArgument,
};
use oxc_ast::ast::{ArrayExpressionElement, CallExpression, Expression, LogicalOperator};
use oxc_ast_visit::Visit;
use oxc_span::GetSpan;
use oxc_syntax::module_record::{ExportExportName, ExportImportName, ModuleRecord};

use super::collect::{export_aliases, ExportedVariableCollector, SheetCollector};
use super::conditions::combine_conditions;
use super::overlap::property_names_overlap;
use super::priority::{needs_platform_priority, resolve_property_priority};
use super::registry::{
    ModuleExportKind, ModuleExportSummary, ModuleMemberStatus, ModuleMemberSummary,
    ModuleReexportSummary, ModuleSummary,
};
use super::rule_object::lower_static_value;
use super::static_value::{resolved_static_value, source_span, static_member_path};
use super::statics::{module_keyframes, module_static_objects, module_static_variables};
use super::{
    Entry, Frontend, FunctionValue, Gap, ResidualProperty, Resolution, ResolvedEntry, Rule,
    STYLEX_MODULE,
};

impl Frontend {
    pub(crate) fn collect<'a>(
        program: &oxc_ast::ast::Program<'a>,
        module: &ModuleRecord<'a>,
    ) -> Self {
        let namespaces: HashSet<String> = module
            .import_entries
            .iter()
            .filter(|entry| !entry.is_type && entry.module_request.name.as_str() == STYLEX_MODULE)
            .map(|entry| entry.local_name.name.to_string())
            .collect();
        if namespaces.is_empty() {
            return Self::default();
        }
        let static_objects = module_static_objects(program, module);
        let (variables, variable_spans) = module_static_variables(program, module, &namespaces);
        let (keyframes, keyframe_spans) = module_keyframes(program, &namespaces, &variables);
        let (sheets, scan_spans) = {
            let mut collector = SheetCollector {
                namespaces: &namespaces,
                static_objects: &static_objects,
                variables: &variables,
                keyframes: &keyframes,
                sheets: HashMap::new(),
                scan_spans: Vec::new(),
                function_depth: 0,
            };
            collector.visit_program(program);
            (collector.sheets, collector.scan_spans)
        };
        let mut scan_spans = scan_spans;
        scan_spans.extend(variable_spans);
        scan_spans.extend(keyframe_spans);
        Self {
            namespaces,
            sheets,
            variables,
            scan_spans,
        }
    }

    pub(crate) fn module_summary(
        &self,
        program: &oxc_ast::ast::Program,
        module: &ModuleRecord,
    ) -> ModuleSummary {
        let aliases = export_aliases(module);

        let mut exports = Vec::new();
        for (local, rules) in &self.sheets {
            let Some(exported_names) = aliases.get(local) else {
                continue;
            };
            let mut members = rules
                .iter()
                .map(|(name, rule)| ModuleMemberSummary {
                    name: name.clone(),
                    status: match rule {
                        Rule::Ready { residual, .. } if residual.is_empty() => {
                            ModuleMemberStatus::Static
                        }
                        Rule::Ready { entries, .. } if entries.is_empty() => {
                            ModuleMemberStatus::Unsupported
                        }
                        Rule::Ready { .. } => ModuleMemberStatus::Partial,
                        Rule::Function { .. } => ModuleMemberStatus::Function,
                        Rule::Gap(_) => ModuleMemberStatus::Unsupported,
                    },
                })
                .collect::<Vec<_>>();
            members.sort_by(|left, right| left.name.cmp(&right.name));
            for exported in exported_names {
                exports.push(ModuleExportSummary {
                    exported: exported.clone(),
                    local: local.clone(),
                    kind: ModuleExportKind::Sheet,
                    members: members.clone(),
                });
            }
        }

        // Exported defineVars tables deliberately do not enter
        // `self.variables`: another module may pass one to createTheme, so
        // flattening its defaults would be wrong. They still belong in the
        // graph summary, which is what lets the theme slice resolve them
        // later without weakening that safety rule now.
        let mut variable_collector = ExportedVariableCollector {
            namespaces: &self.namespaces,
            aliases: &aliases,
            exports: Vec::new(),
            function_depth: 0,
        };
        variable_collector.visit_program(program);
        exports.extend(variable_collector.exports);
        exports.sort_by(|left, right| {
            left.exported
                .cmp(&right.exported)
                .then_with(|| left.local.cmp(&right.local))
        });
        let mut reexports = module
            .indirect_export_entries
            .iter()
            .chain(module.star_export_entries.iter())
            .filter(|entry| !entry.is_type)
            .filter_map(|entry| {
                let specifier = entry.module_request.as_ref()?.name.to_string();
                let imported = match &entry.import_name {
                    ExportImportName::Name(name) => name.name.to_string(),
                    ExportImportName::AllButDefault => "*".to_string(),
                    ExportImportName::All => "*".to_string(),
                    ExportImportName::Null => return None,
                };
                let exported = match &entry.export_name {
                    ExportExportName::Name(name) => name.name.to_string(),
                    ExportExportName::Default(_) => "default".to_string(),
                    ExportExportName::Null if imported == "*" => "*".to_string(),
                    ExportExportName::Null => return None,
                };
                Some(ModuleReexportSummary {
                    specifier,
                    imported,
                    exported,
                })
            })
            .collect::<Vec<_>>();
        reexports.sort_by(|left, right| {
            left.specifier
                .cmp(&right.specifier)
                .then_with(|| left.exported.cmp(&right.exported))
                .then_with(|| left.imported.cmp(&right.imported))
        });
        let mut imports = module
            .import_entries
            .iter()
            .filter(|entry| !entry.is_type)
            .map(|entry| entry.module_request.name.to_string())
            .collect::<Vec<_>>();
        imports.sort();
        imports.dedup();
        ModuleSummary {
            exports,
            reexports,
            imports,
            context: None,
        }
    }

    pub(super) fn exported_static_sheets(
        &self,
        module: &ModuleRecord,
    ) -> HashMap<String, HashMap<String, Rule>> {
        let aliases = export_aliases(module);
        let mut exports = HashMap::new();
        for (local, rules) in &self.sheets {
            let Some(exported_names) = aliases.get(local) else {
                continue;
            };
            let static_rules = rules
                .iter()
                .filter_map(|(name, rule)| match rule {
                    Rule::Ready { residual, gaps, .. }
                        if residual.is_empty() && gaps.is_empty() =>
                    {
                        Some((name.clone(), rule.clone()))
                    }
                    Rule::Function { .. } => Some((name.clone(), rule.clone())),
                    _ => None,
                })
                .collect::<HashMap<_, _>>();
            if static_rules.is_empty() {
                continue;
            }
            for exported in exported_names {
                exports.insert(exported.clone(), static_rules.clone());
            }
        }
        exports
    }

    fn props_namespace<'a>(&self, call: &'a CallExpression) -> Option<&'a str> {
        let Expression::StaticMemberExpression(member) = &call.callee else {
            return None;
        };
        let Expression::Identifier(object) = &member.object else {
            return None;
        };
        (member.property.name.as_str() == "props" && self.namespaces.contains(object.name.as_str()))
            .then_some(object.name.as_str())
    }

    fn rule_from_member(
        &self,
        member: &oxc_ast::ast::StaticMemberExpression,
    ) -> Result<&Rule, Gap> {
        let Some(sheet) = static_member_path(&member.object) else {
            return Err(Gap {
                message: "StyleX styles must be referenced through a static member chain such as `styles.rule` or `namespace.styles.rule`.".to_string(),
                span: source_span(member.span),
            });
        };
        let Some(rules) = self.sheets.get(&sheet) else {
            return Err(Gap {
                message: format!(
                    "StyleX sheet `{}` is not a registered or same-file module-scope static `stylex.create` binding.",
                    sheet
                ),
                span: source_span(member.span),
            });
        };
        rules.get(member.property.name.as_str()).ok_or_else(|| Gap {
            message: format!(
                "StyleX rule `{}.{}` was not found in its static definition.",
                sheet, member.property.name
            ),
            span: source_span(member.span),
        })
    }

    fn append_entries(
        &self,
        entries: &[Entry],
        argument_condition: Condition,
        out: &mut Vec<ResolvedEntry>,
    ) -> Result<(), Gap> {
        let mut previous_arguments = std::mem::take(out);
        let mut current_argument: Vec<ResolvedEntry> = Vec::new();
        for entry in entries {
            let condition = combine_conditions(&entry.condition, argument_condition.clone());
            // Logical/physical edge conflicts need the element's resolved
            // writing direction on Native, and grid shorthands cannot be
            // split into independent lines without changing placement.
            // Keep those two genuinely platform-dependent cases explicit;
            // ordinary shorthand/longhand priority is resolved below.
            if previous_arguments
                .iter()
                .chain(current_argument.iter())
                .any(|existing| needs_platform_priority(entry, existing))
            {
                return Err(Gap {
                    message: format!(
                        "StyleX `{}` overlaps a logical/physical edge or grid shorthand whose Native priority needs runtime context.",
                        entry.css_name
                    ),
                    span: entry.span,
                });
            }
            // For the same StyleX property namespace, later unconditional
            // arguments remove an earlier conditional value exactly as
            // styleq does. A later conditional stays beside the base and
            // overrides only while its guard is true.
            if argument_condition == Condition::Always && entry.condition == Condition::Always {
                previous_arguments.retain(|existing| {
                    existing.css_name != entry.css_name
                        || !entry.properties.iter().any(|property| {
                            property.same_property_as(&existing.declaration.property)
                        })
                });
            }
            // Duplicate keys within one object are last-wins only in the
            // same condition. A base declaration and a media declaration
            // in that object must coexist regardless of their source order.
            current_argument.retain(|existing| {
                existing.declaration.condition != condition
                    || existing.css_name != entry.css_name
                    || !entry
                        .properties
                        .iter()
                        .any(|property| property.same_property_as(&existing.declaration.property))
            });
            current_argument.extend(entry.properties.iter().cloned().map(|property| {
                ResolvedEntry {
                    css_name: entry.css_name.clone(),
                    priority: entry.priority,
                    declaration: StyleDeclaration {
                        source: Default::default(),
                        property,
                        condition: condition.clone(),
                    },
                }
            }));
        }
        out.extend(previous_arguments);
        out.extend(current_argument);
        Ok(())
    }

    fn resolve_function_call(
        &self,
        call: &CallExpression,
        condition: Option<ConditionExpr>,
        declarations: &mut Vec<ResolvedEntry>,
    ) -> Result<(), Gap> {
        let Expression::StaticMemberExpression(member) = &call.callee else {
            return Err(Gap {
                message: "StyleX function styles must be called as `styles.rule(value)`."
                    .to_string(),
                span: source_span(call.span),
            });
        };
        let entries = match self.rule_from_member(member)? {
            Rule::Function { entries } => entries,
            Rule::Gap(gap) => {
                return Err(Gap {
                    message: gap.message.clone(),
                    span: source_span(call.span),
                });
            }
            Rule::Ready { .. } => {
                return Err(Gap {
                    message: "Only a function-style StyleX rule can be called.".to_string(),
                    span: source_span(call.span),
                });
            }
        };
        if call.arguments.len() != 1 {
            return Err(Gap {
                message: "Static StyleX function styles require exactly one call argument."
                    .to_string(),
                span: source_span(call.span),
            });
        }
        let Some(argument) = call.arguments[0].as_expression() else {
            return Err(Gap {
                message: "Spread arguments in StyleX function styles are not statically evaluated."
                    .to_string(),
                span: source_span(call.arguments[0].span()),
            });
        };
        let Some(argument) = resolved_static_value(argument, &self.variables) else {
            return Err(Gap {
                message: "This StyleX function style has a runtime argument; Hozo currently lowers only static calls and leaves runtime values with the official transform."
                    .to_string(),
                span: source_span(argument.span()),
            });
        };
        let entries = entries
            .iter()
            .map(|entry| {
                let value = match &entry.value {
                    FunctionValue::Argument => &argument,
                    FunctionValue::Static(value) => value,
                };
                let Some(properties) = lower_static_value(&entry.name, value) else {
                    return Err(Gap {
                        message: format!(
                            "StyleX function-style property `{}` or its called value is not in Hozo's typed universal subset yet.",
                            entry.name
                        ),
                        span: source_span(call.span),
                    });
                };
                Ok(Entry {
                    css_name: entry.css_name.clone(),
                    priority: entry.priority,
                    properties,
                    condition: Condition::Always,
                    span: entry.span,
                })
            })
            .collect::<Result<Vec<_>, _>>()?;
        let declaration_condition = condition.map_or(Condition::Always, Condition::Expr);
        self.append_entries(&entries, declaration_condition, declarations)
    }

    fn resolve_props_expression(
        &self,
        expression: &Expression,
        condition: Option<ConditionExpr>,
        declarations: &mut Vec<ResolvedEntry>,
        residual_arguments: &mut Vec<StylexResidualArgument>,
        residual_properties: &mut Vec<ResidualProperty>,
        gaps: &mut Vec<Gap>,
    ) -> Result<(), Gap> {
        if let Expression::CallExpression(call) = expression {
            return self.resolve_function_call(call, condition, declarations);
        }
        let member = match expression {
            Expression::StaticMemberExpression(member) => member,
            Expression::LogicalExpression(logical) if logical.operator == LogicalOperator::And => {
                let guard = ConditionExpr::Ref(ExprRef(source_span(logical.left.span())));
                let condition = Some(match condition {
                    Some(existing) => ConditionExpr::And(Box::new(existing), Box::new(guard)),
                    None => guard,
                });
                return self.resolve_props_expression(
                    &logical.right,
                    condition,
                    declarations,
                    residual_arguments,
                    residual_properties,
                    gaps,
                );
            }
            Expression::ConditionalExpression(conditional) => {
                let guard = ConditionExpr::Ref(ExprRef(source_span(conditional.test.span())));
                let when_true = Some(match condition.clone() {
                    Some(existing) => {
                        ConditionExpr::And(Box::new(existing), Box::new(guard.clone()))
                    }
                    None => guard.clone(),
                });
                self.resolve_props_expression(
                    &conditional.consequent,
                    when_true,
                    declarations,
                    residual_arguments,
                    residual_properties,
                    gaps,
                )?;
                let negated = ConditionExpr::Not(Box::new(guard));
                let when_false = Some(match condition {
                    Some(existing) => ConditionExpr::And(Box::new(existing), Box::new(negated)),
                    None => negated,
                });
                return self.resolve_props_expression(
                    &conditional.alternate,
                    when_false,
                    declarations,
                    residual_arguments,
                    residual_properties,
                    gaps,
                );
            }
            Expression::ArrayExpression(array) => {
                for element in &array.elements {
                    match element {
                        ArrayExpressionElement::Elision(_) => continue,
                        ArrayExpressionElement::SpreadElement(spread) => {
                            return Err(Gap {
                                message: "Spread elements inside StyleX argument arrays are not statically lowerable."
                                    .to_string(),
                                span: source_span(spread.span),
                            });
                        }
                        element => self.resolve_props_expression(
                            element
                                .as_expression()
                                .expect("non-spread array element is an expression"),
                            condition.clone(),
                            declarations,
                            residual_arguments,
                            residual_properties,
                            gaps,
                        )?,
                    }
                }
                return Ok(());
            }
            Expression::BooleanLiteral(literal) if !literal.value => return Ok(()),
            Expression::NullLiteral(_) => return Ok(()),
            other => {
                return Err(Gap {
                    message: "Hozo accepts StyleX rule references, falsy values, recursive arrays, logical guards, and ternary branches in `stylex.props`."
                        .to_string(),
                    span: source_span(other.span()),
                });
            }
        };

        let rule = self.rule_from_member(member)?;
        let (entries, residual, rule_gaps) = match rule {
            Rule::Ready {
                entries,
                residual,
                gaps,
            } => (entries, residual, gaps),
            Rule::Gap(gap) => {
                return Err(Gap {
                    message: gap.message.clone(),
                    span: source_span(member.span),
                });
            }
            Rule::Function { .. } => {
                return Err(Gap {
                    message: "A StyleX function-style rule must be called with one value."
                        .to_string(),
                    span: source_span(member.span),
                });
            }
        };
        let declaration_condition = condition.clone().map_or(Condition::Always, Condition::Expr);
        self.append_entries(entries, declaration_condition, declarations)?;
        if !residual.is_empty() {
            let mut properties = Vec::new();
            for property in residual {
                if !properties.contains(&property.span) {
                    properties.push(property.span);
                }
            }
            residual_arguments.push(StylexResidualArgument {
                properties,
                condition,
            });
            residual_properties.extend(residual.iter().cloned());
            gaps.extend(rule_gaps.iter().cloned().map(|gap| Gap {
                span: source_span(member.span),
                ..gap
            }));
        }
        Ok(())
    }

    pub(crate) fn resolve_props(&self, expression: &Expression) -> Resolution {
        let Expression::CallExpression(call) = expression else {
            return Resolution::NotStylex;
        };
        let Some(namespace) = self.props_namespace(call) else {
            return Resolution::NotStylex;
        };
        let mut declarations = Vec::new();
        let mut residual_arguments = Vec::new();
        let mut residual_properties = Vec::new();
        let mut gaps = Vec::new();
        for argument in &call.arguments {
            let Some(argument) = argument.as_expression() else {
                return Resolution::Gap {
                    message: "Spread arguments in `stylex.props` are not statically lowerable."
                        .to_string(),
                    span: source_span(argument.span()),
                };
            };
            if let Err(gap) = self.resolve_props_expression(
                argument,
                None,
                &mut declarations,
                &mut residual_arguments,
                &mut residual_properties,
                &mut gaps,
            ) {
                return Resolution::Gap {
                    message: gap.message,
                    span: gap.span,
                };
            }
        }
        if residual_arguments.is_empty() {
            return Resolution::Ready(resolve_property_priority(declarations));
        }
        if declarations.is_empty() {
            let gap = gaps
                .into_iter()
                .next()
                .expect("a residual property has a gap");
            return Resolution::Gap {
                message: gap.message,
                span: source_span(call.span),
            };
        }
        if let Some((residual, declaration)) = residual_properties.iter().find_map(|residual| {
            declarations
                .iter()
                .find(|declaration| {
                    property_names_overlap(&residual.css_name, &declaration.css_name)
                })
                .map(|declaration| (residual, declaration))
        }) {
            return Resolution::Gap {
                message: format!(
                    "StyleX residual `{}` overlaps lowered `{}`; the rule stays with StyleX so its cascade is not approximated.",
                    residual.css_name, declaration.css_name
                ),
                span: source_span(call.span),
            };
        }
        Resolution::Partial {
            declarations: resolve_property_priority(declarations),
            residual: StylexResidual {
                namespace: namespace.to_string(),
                arguments: residual_arguments,
            },
            gaps,
        }
    }
}
