//! Finding a project's own class-joining functions (#964).
//!
//! A `cn` that only wraps `clsx` is the common case:
//!
//! ```ts
//! export function cn(...inputs: ClassValue[]) { return clsx(inputs) }
//! ```
//!
//! shadcn/ui's wrapper is recognized as a merger separately: it hands the
//! result to `twMerge`, so it must resolve conflicts rather than join (#1676).
//!
//! The compiler reads one file at a time, so a caller of `cn` cannot see
//! this. Two halves make it visible without a type checker:
//!
//! - `class_helper_candidates`, on the caller: which imports it calls in a
//!   `className` that are not already recognized. Only these are worth
//!   resolving, which keeps a bundler from resolving every import of every
//!   file.
//! - `summarize_class_helpers`, on the file a candidate resolves to: which
//!   of its exports only hand their arguments to a recognized joiner.
//!
//! Both read one file, so the bundler decides how to connect them and when
//! to read again. A project's declaration overrides either way.

use std::collections::{BTreeMap, BTreeSet};

use oxc_allocator::Allocator;
use oxc_ast::ast::{
    Argument, ArrowFunctionBody, ArrowFunctionExpression, BindingPattern, Declaration, Expression,
    FormalParameters, FunctionBody, JSXAttribute, JSXAttributeName, Statement,
};
use oxc_ast_visit::{walk, Visit};
use oxc_parser::Parser;
use oxc_span::SourceType;
use oxc_syntax::module_record::{ExportExportName, ImportImportName, ModuleRecord};

/// The joiners a helper may hand its arguments to: the modules
/// `dynamic_class` already trusts, `cx`, and `tailwind-merge`'s default
/// `twMerge` / `twJoin` (#1676). Custom `extendTailwindMerge` or
/// `createTailwindMerge` configurations are refused so their runtime
/// behavior is preserved.
const JOIN_MODULES: [&str; 2] = ["clsx", "classnames"];
const HOZO_JOIN_MODULES: [&str; 2] = ["@hozo/core", "@hozo/engine"];
const TW_MERGE_MODULE: &str = "tailwind-merge";
const TW_MERGE_EXPORTS: [&str; 2] = ["twMerge", "twJoin"];
const TW_MERGE_CUSTOM_EXPORTS: [&str; 2] = ["extendTailwindMerge", "createTailwindMerge"];

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct ClassHelperCandidate {
    /// The specifier as the caller wrote it.
    pub specifier: String,
    /// The imported name, `default` for a default import.
    pub imported: String,
}

fn parse<'a>(allocator: &'a Allocator, source: &'a str) -> Option<oxc_parser::ParserReturn<'a>> {
    let source_type = SourceType::from_extension("tsx").expect("\"tsx\" is a known extension");
    let ret = Parser::new(allocator, source, source_type).parse();
    ret.diagnostics.is_empty().then_some(ret)
}

fn imported_name(name: &ImportImportName) -> Option<String> {
    match name {
        ImportImportName::Name(n) => Some(n.name.to_string()),
        ImportImportName::Default(_) => Some("default".to_string()),
        ImportImportName::NamespaceObject => None,
    }
}

fn is_builtin_joiner(module: &str, imported: &str) -> bool {
    JOIN_MODULES.contains(&module)
        || (HOZO_JOIN_MODULES.contains(&module) && imported == "cx")
        || (module == TW_MERGE_MODULE && TW_MERGE_EXPORTS.contains(&imported))
}

fn has_custom_tw_merge(module: &ModuleRecord, program: &oxc_ast::ast::Program<'_>) -> bool {
    let imported_custom = module.import_entries.iter().any(|entry| {
        !entry.is_type
            && entry.module_request.name.as_str() == TW_MERGE_MODULE
            && imported_name(&entry.import_name)
                .is_some_and(|name| TW_MERGE_CUSTOM_EXPORTS.contains(&name.as_str()))
    });
    if imported_custom {
        return true;
    }
    struct CustomCall {
        found: bool,
    }
    impl<'a> Visit<'a> for CustomCall {
        fn visit_call_expression(&mut self, it: &oxc_ast::ast::CallExpression<'a>) {
            if let Expression::Identifier(callee) = &it.callee {
                if TW_MERGE_CUSTOM_EXPORTS.contains(&callee.name.as_str()) {
                    self.found = true;
                }
            }
            walk::walk_call_expression(self, it);
        }
    }
    let mut finder = CustomCall { found: false };
    finder.visit_program(program);
    finder.found
}

/// The imports a file calls inside a `className`, other than the joiners
/// the compiler already recognizes.
pub fn class_helper_candidates(source: &str) -> Vec<ClassHelperCandidate> {
    let allocator = Allocator::default();
    let Some(ret) = parse(&allocator, source) else {
        return Vec::new();
    };
    let mut callees = Callees {
        in_class_name: false,
        names: BTreeSet::new(),
    };
    callees.visit_program(&ret.program);
    let mut out = BTreeSet::new();
    for entry in &ret.module_record.import_entries {
        if entry.is_type || !callees.names.contains(entry.local_name.name.as_str()) {
            continue;
        }
        let Some(imported) = imported_name(&entry.import_name) else {
            continue;
        };
        let specifier = entry.module_request.name.to_string();
        if is_builtin_joiner(&specifier, &imported) {
            continue;
        }
        out.insert(ClassHelperCandidate {
            specifier,
            imported,
        });
    }
    out.into_iter().collect()
}

/// Identifiers called anywhere inside a `className` attribute.
struct Callees {
    in_class_name: bool,
    names: BTreeSet<String>,
}

impl<'a> Visit<'a> for Callees {
    fn visit_jsx_attribute(&mut self, it: &JSXAttribute<'a>) {
        let is_class_name =
            matches!(&it.name, JSXAttributeName::Identifier(name) if name.name == "className");
        let outer = self.in_class_name;
        self.in_class_name |= is_class_name;
        walk::walk_jsx_attribute(self, it);
        self.in_class_name = outer;
    }

    fn visit_call_expression(&mut self, it: &oxc_ast::ast::CallExpression<'a>) {
        if self.in_class_name {
            if let Expression::Identifier(callee) = &it.callee {
                self.names.insert(callee.name.to_string());
            }
        }
        walk::walk_call_expression(self, it);
    }
}

/// The names this file exports that only join their arguments as `clsx`
/// does: each takes a rest parameter and returns it handed to a recognized
/// joiner, possibly through another (`twMerge(clsx(inputs))`). `default`
/// for a default export.
pub fn summarize_class_helpers(source: &str) -> Vec<String> {
    summarize_helpers_internal(source, false)
}

/// Subset of [`summarize_class_helpers`] whose return expression calls
/// `twMerge` (and therefore needs `twMerge` conflict resolution rather than
/// a pure `clsx` join).
pub fn summarize_class_helper_merges(source: &str) -> Vec<String> {
    summarize_helpers_internal(source, true)
}

fn summarize_helpers_internal(source: &str, require_merge: bool) -> Vec<String> {
    let allocator = Allocator::default();
    let Some(ret) = parse(&allocator, source) else {
        return Vec::new();
    };
    let module = &ret.module_record;
    if has_custom_tw_merge(module, &ret.program) {
        return Vec::new();
    }
    let joiners = joiner_locals(module);
    if joiners.is_empty() {
        return Vec::new();
    }
    let mergers = merger_locals(module);
    if require_merge && mergers.is_empty() {
        return Vec::new();
    }

    // Local name to whether it is a joiner, for every top-level function.
    let mut helpers: BTreeSet<String> = BTreeSet::new();
    let mut default_is_helper = false;
    let consider = |name: Option<&str>, is_helper: bool, helpers: &mut BTreeSet<String>| {
        if let (Some(name), true) = (name, is_helper) {
            helpers.insert(name.to_string());
        }
    };
    for statement in &ret.program.body {
        match statement {
            Statement::FunctionDeclaration(function) => consider(
                function.id.as_ref().map(|id| id.name.as_str()),
                function.body.as_ref().is_some_and(|body| {
                    joins(&function.params, body, &joiners, &mergers, require_merge)
                }),
                &mut helpers,
            ),
            Statement::VariableDeclaration(declaration) => {
                for declarator in &declaration.declarations {
                    if let (BindingPattern::BindingIdentifier(id), Some(init)) =
                        (&declarator.id, &declarator.init)
                    {
                        consider(
                            Some(id.name.as_str()),
                            expression_joins(init, &joiners, &mergers, require_merge),
                            &mut helpers,
                        );
                    }
                }
            }
            Statement::ExportDeclaration(export) => match &export.declaration {
                Declaration::FunctionDeclaration(function) => consider(
                    function.id.as_ref().map(|id| id.name.as_str()),
                    function.body.as_ref().is_some_and(|body| {
                        joins(&function.params, body, &joiners, &mergers, require_merge)
                    }),
                    &mut helpers,
                ),
                Declaration::VariableDeclaration(declaration) => {
                    for declarator in &declaration.declarations {
                        if let (BindingPattern::BindingIdentifier(id), Some(init)) =
                            (&declarator.id, &declarator.init)
                        {
                            consider(
                                Some(id.name.as_str()),
                                expression_joins(init, &joiners, &mergers, require_merge),
                                &mut helpers,
                            );
                        }
                    }
                }
                _ => {}
            },
            Statement::ExportDefaultDeclaration(export) => {
                use oxc_ast::ast::ExportDefaultDeclarationKind as Kind;
                match &export.declaration {
                    Kind::FunctionDeclaration(function) => {
                        let is_helper = function.body.as_ref().is_some_and(|body| {
                            joins(&function.params, body, &joiners, &mergers, require_merge)
                        });
                        if let Some(id) = &function.id {
                            consider(Some(id.name.as_str()), is_helper, &mut helpers);
                        }
                        default_is_helper |= is_helper;
                    }
                    Kind::ArrowFunctionExpression(arrow) => {
                        default_is_helper |= arrow_joins(arrow, &joiners, &mergers, require_merge);
                    }
                    _ => {}
                }
            }
            _ => {}
        }
    }

    let mut exported: BTreeMap<String, ()> = BTreeMap::new();
    for entry in &module.local_export_entries {
        if entry.is_type {
            continue;
        }
        let Some(local) = entry.local_name.name() else {
            continue;
        };
        if !helpers.contains(local.as_str()) {
            continue;
        }
        match &entry.export_name {
            ExportExportName::Name(name) => exported.insert(name.name.to_string(), ()),
            ExportExportName::Default(_) => exported.insert("default".to_string(), ()),
            ExportExportName::Null => None,
        };
    }
    if default_is_helper {
        exported.insert("default".to_string(), ());
    }
    exported.into_keys().collect()
}

fn joiner_locals(module: &ModuleRecord) -> BTreeSet<String> {
    module
        .import_entries
        .iter()
        .filter(|entry| !entry.is_type)
        // The helper summary distinguishes merging from clsx-style joining,
        // but cannot represent twJoin's array-only, non-dictionary semantics.
        // Keep these wrappers opaque until that contract can be carried too.
        .filter(|entry| {
            !(entry.module_request.name.as_str() == TW_MERGE_MODULE
                && imported_name(&entry.import_name).as_deref() == Some("twJoin"))
        })
        .filter(|entry| {
            imported_name(&entry.import_name).is_some_and(|imported| {
                is_builtin_joiner(entry.module_request.name.as_str(), &imported)
            })
        })
        .map(|entry| entry.local_name.name.to_string())
        .collect()
}

fn merger_locals(module: &ModuleRecord) -> BTreeSet<String> {
    module
        .import_entries
        .iter()
        .filter(|entry| !entry.is_type)
        .filter(|entry| {
            entry.module_request.name.as_str() == TW_MERGE_MODULE
                && imported_name(&entry.import_name).is_some_and(|imported| imported == "twMerge")
        })
        .map(|entry| entry.local_name.name.to_string())
        .collect()
}

fn rest_name(params: &FormalParameters) -> Option<String> {
    if !params.items.is_empty() {
        return None;
    }
    match &params.rest.as_ref()?.rest.argument {
        BindingPattern::BindingIdentifier(id) => Some(id.name.to_string()),
        _ => None,
    }
}

fn joins(
    params: &FormalParameters,
    body: &FunctionBody,
    joiners: &BTreeSet<String>,
    mergers: &BTreeSet<String>,
    require_merge: bool,
) -> bool {
    let Some(rest) = rest_name(params) else {
        return false;
    };
    let [Statement::ReturnStatement(ret)] = body.statements.as_slice() else {
        return false;
    };
    ret.argument.as_ref().is_some_and(|argument| {
        hands_on(argument, &rest, joiners) && (!require_merge || calls_any(argument, mergers))
    })
}

fn arrow_joins(
    arrow: &ArrowFunctionExpression,
    joiners: &BTreeSet<String>,
    mergers: &BTreeSet<String>,
    require_merge: bool,
) -> bool {
    let Some(rest) = rest_name(&arrow.params) else {
        return false;
    };
    match &arrow.body {
        ArrowFunctionBody::FunctionBody(body) => {
            joins(&arrow.params, body, joiners, mergers, require_merge)
        }
        concise => concise.as_expression().is_some_and(|e| {
            hands_on(e, &rest, joiners) && (!require_merge || calls_any(e, mergers))
        }),
    }
}

fn expression_joins(
    expression: &Expression,
    joiners: &BTreeSet<String>,
    mergers: &BTreeSet<String>,
    require_merge: bool,
) -> bool {
    match expression.without_parentheses() {
        Expression::ArrowFunctionExpression(arrow) => {
            arrow_joins(arrow, joiners, mergers, require_merge)
        }
        Expression::FunctionExpression(function) => function
            .body
            .as_ref()
            .is_some_and(|body| joins(&function.params, body, joiners, mergers, require_merge)),
        _ => false,
    }
}

fn calls_any(expression: &Expression, targets: &BTreeSet<String>) -> bool {
    let Expression::CallExpression(call) = expression.without_parentheses() else {
        return false;
    };
    let Expression::Identifier(callee) = &call.callee else {
        return false;
    };
    if targets.contains(callee.name.as_str()) {
        return true;
    }
    match call.arguments.as_slice() {
        [argument] => argument
            .as_expression()
            .is_some_and(|inner| calls_any(inner, targets)),
        _ => false,
    }
}

/// `J(...rest)`, `J(rest)` or `J(<another such call>)`, with `J` a joiner.
fn hands_on(expression: &Expression, rest: &str, joiners: &BTreeSet<String>) -> bool {
    let Expression::CallExpression(call) = expression.without_parentheses() else {
        return false;
    };
    let Expression::Identifier(callee) = &call.callee else {
        return false;
    };
    if !joiners.contains(callee.name.as_str()) {
        return false;
    }
    match call.arguments.as_slice() {
        [Argument::SpreadElement(spread)] => {
            matches!(&spread.argument, Expression::Identifier(id) if id.name == rest)
        }
        [argument] => match argument.as_expression() {
            Some(Expression::Identifier(id)) => id.name == rest,
            Some(inner) => hands_on(inner, rest, joiners),
            None => false,
        },
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_cn_that_wraps_clsx_is_a_helper() {
        let source = "import { clsx, type ClassValue } from 'clsx'
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}";
        assert_eq!(summarize_class_helpers(source), ["cn"]);
    }

    #[test]
    fn shadcns_cn_is_recognized_as_a_merging_helper() {
        // #1676: `twMerge(clsx(inputs))` is recognized and marked as a
        // conflict-merging helper (`summarize_class_helper_merges`), while
        // custom `extendTailwindMerge` / `createTailwindMerge` helpers stay at
        // runtime.
        let source = "import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}";
        assert_eq!(summarize_class_helpers(source), ["cn"]);
        assert_eq!(summarize_class_helper_merges(source), ["cn"]);

        let custom = "import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'
const customTwMerge = extendTailwindMerge({ extend: {} })
export function cn(...inputs: ClassValue[]) {
  return customTwMerge(clsx(inputs))
}";
        assert!(summarize_class_helpers(custom).is_empty());
        assert!(summarize_class_helper_merges(custom).is_empty());
    }

    #[test]
    fn the_other_spellings_of_one_are_too() {
        let source = "import clsx from 'clsx'
import { cx } from '@hozo/core'
export const a = (...c) => clsx(...c)
const b = function (...c) { return cx(...c) }
export { b as join }
export default (...c) => clsx(c)";
        assert_eq!(summarize_class_helpers(source), ["a", "default", "join"]);
    }

    #[test]
    fn a_function_that_does_anything_else_is_not() {
        for body in [
            // An extra class, a fixed first argument, a second statement.
            "export const cn = (...c) => clsx('p-4', ...c)",
            "export const cn = (base, ...c) => clsx(base, c)",
            "export function cn(...c) { log(c); return clsx(c) }",
            // A joiner the file defines itself.
            "const clsx2 = (...a) => a.join(' ')\nexport const cn = (...c) => clsx2(c)",
            // Not exported.
            "const cn = (...c) => clsx(c)",
        ] {
            let source = format!("import clsx from 'clsx'\n{body}");
            assert!(summarize_class_helpers(&source).is_empty(), "{body}");
        }
    }

    #[test]
    fn tw_join_wrappers_do_not_claim_clsx_dictionary_semantics() {
        let source = "import { twJoin } from 'tailwind-merge'; export const cn = (...inputs) => twJoin(inputs)";
        assert!(summarize_class_helpers(source).is_empty());
    }

    #[test]
    fn candidates_are_the_unrecognized_imports_called_in_a_class_name() {
        let source = "import { View } from '@hozo/core'
import { cn } from '@/lib/utils'
import clsx from 'clsx'
import { format } from './format'
import join from './join'
const el = <View className={cn('p-4', ok && join('m-2'), clsx('a'))} title={format(x)} />";
        let found: Vec<_> = class_helper_candidates(source)
            .into_iter()
            .map(|c| (c.specifier, c.imported))
            .collect();
        assert_eq!(
            found,
            [
                ("./join".to_string(), "default".to_string()),
                ("@/lib/utils".to_string(), "cn".to_string()),
            ]
        );
    }
}
