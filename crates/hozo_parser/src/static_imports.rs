//! Structural static ESM input for resolver observation, not a graph or a
//! lowering pass. Dynamic/CommonJS/transformed dependencies remain outside it.
use crate::{import_bindings, source_type_for_file, ImportBinding, ParseSyntaxError};
use oxc_allocator::Allocator;
use oxc_ast::ast::{ImportDeclarationSpecifier, ImportOrExportKind, Statement};
use oxc_parser::Parser;

pub struct StaticModuleImports {
    pub requests: Vec<String>,
    pub bindings: Vec<ImportBinding>,
    pub diagnostics: Vec<ParseSyntaxError>,
}

pub fn inspect_static_module_imports(source: &str, file: Option<&str>) -> StaticModuleImports {
    let allocator = Allocator::default();
    let parsed = Parser::new(&allocator, source, source_type_for_file(file)).parse();
    let diagnostics =
        parsed
            .diagnostics
            .iter()
            .map(|error| ParseSyntaxError {
                message: error.message.to_string(),
                span: error.labels.first().map_or(
                    hozo_ir::SourceSpan { start: 0, end: 0 },
                    |label| hozo_ir::SourceSpan {
                        start: label.offset(),
                        end: label.offset() + label.len(),
                    },
                ),
            })
            .collect::<Vec<_>>();
    if !diagnostics.is_empty() {
        return StaticModuleImports {
            requests: Vec::new(),
            bindings: Vec::new(),
            diagnostics,
        };
    }
    let mut requests = Vec::new();
    for statement in &parsed.program.body {
        match statement {
            Statement::ImportDeclaration(import)
                if import.import_kind != ImportOrExportKind::Type =>
            {
                let runtime = import.specifiers.as_ref().is_none_or(|specifiers| {
                    specifiers.is_empty()
                        || specifiers.iter().any(|specifier| match specifier {
                            ImportDeclarationSpecifier::ImportSpecifier(named) => {
                                named.import_kind != ImportOrExportKind::Type
                            }
                            _ => true,
                        })
                });
                if runtime {
                    requests.push(import.source.value.to_string());
                }
            }
            Statement::ExportFromDeclaration(export)
                if export.export_kind != ImportOrExportKind::Type =>
            {
                if export.specifiers.is_empty()
                    || export
                        .specifiers
                        .iter()
                        .any(|specifier| specifier.export_kind != ImportOrExportKind::Type)
                {
                    requests.push(export.source.value.to_string());
                }
            }
            Statement::ExportAllDeclaration(export)
                if export.export_kind != ImportOrExportKind::Type =>
            {
                requests.push(export.source.value.to_string())
            }
            _ => {}
        }
    }
    requests.sort();
    requests.dedup();
    StaticModuleImports {
        requests,
        bindings: import_bindings(&parsed.module_record),
        diagnostics,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn static_requests_and_value_bindings_have_distinct_denominators() {
        let result = inspect_static_module_imports("import D, {Value as Local, type T} from 'kit';import * as NS from 'space';import 'effect';import {} from 'empty';export {X} from 'reexport';export * from 'all';export type {Q} from 'types';import type {Z} from 'only-type';import {type U} from 'also-type';const lazy=()=>import('dynamic');const text=\"import 'fiction'\";", Some("App.tsx"));
        assert!(result.diagnostics.is_empty());
        assert_eq!(
            result.requests,
            ["all", "effect", "empty", "kit", "reexport", "space"]
        );
        assert_eq!(
            result
                .bindings
                .iter()
                .map(|binding| (
                    binding.source.as_str(),
                    binding.imported.as_str(),
                    binding.local.as_str()
                ))
                .collect::<Vec<_>>(),
            [
                ("kit", "default", "D"),
                ("kit", "Value", "Local"),
                ("space", "*", "NS")
            ]
        );
    }

    #[test]
    fn syntax_failures_never_return_partial_resolver_requests() {
        let result = inspect_static_module_imports(
            "import {Value} from 'kit'; export const =",
            Some("App.tsx"),
        );
        assert!(!result.diagnostics.is_empty());
        assert!(result.bindings.is_empty() && result.requests.is_empty());
    }

    #[test]
    fn source_grammar_matches_the_existing_compiler_boundary() {
        assert!(inspect_static_module_imports(
            "import {X} from 'kit';export const App=()=> <X/>",
            Some("App.js")
        )
        .diagnostics
        .is_empty());
        assert!(inspect_static_module_imports(
            "import {X} from 'kit';export const id=<T>(value:T)=>value",
            Some("types.ts")
        )
        .diagnostics
        .is_empty());
        assert!(
            !inspect_static_module_imports("export const App=()=> <X/>", Some("types.ts"))
                .diagnostics
                .is_empty()
        );
    }
}
