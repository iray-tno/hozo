//! Structural input for the real import rewrite, without a semantic usage pass.
//! Regexes cannot distinguish declarations from comments or template strings.

use crate::{source_type_for_file, ParseSyntaxError};
use oxc_allocator::Allocator;
use oxc_ast::ast::*;
use oxc_parser::Parser;
use oxc_span::Span;

pub struct ReactNativeImportSpecifier {
    pub imported: String,
    pub local: String,
    pub kind: String,
    pub type_only: bool,
    pub span: Span,
}

pub struct ReactNativeImportDeclaration {
    pub span: Span,
    pub source_span: Span,
    pub has_attributes: bool,
    pub specifiers: Vec<ReactNativeImportSpecifier>,
    /// Trivia outside specifiers must survive when a declaration is split.
    pub comments: Vec<Span>,
}

pub struct ReactNativeImports {
    pub diagnostics: Vec<ParseSyntaxError>,
    pub declarations: Vec<ReactNativeImportDeclaration>,
}

pub fn react_native_imports(source: &str, file: Option<&str>) -> ReactNativeImports {
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
        return ReactNativeImports {
            diagnostics,
            declarations: Vec::new(),
        };
    }
    let mut declarations = Vec::new();
    for statement in &parsed.program.body {
        let Statement::ImportDeclaration(import) = statement else {
            continue;
        };
        if import.source.value != "react-native" {
            continue;
        }
        let specifiers = import
            .specifiers
            .iter()
            .flatten()
            .map(|specifier| {
                let (imported, local, kind, type_only, span) = match specifier {
                    ImportDeclarationSpecifier::ImportSpecifier(named) => (
                        named.imported.name().to_string(),
                        named.local.name.to_string(),
                        "named",
                        import.import_kind == ImportOrExportKind::Type
                            || named.import_kind == ImportOrExportKind::Type,
                        named.span,
                    ),
                    ImportDeclarationSpecifier::ImportDefaultSpecifier(default) => (
                        "default".into(),
                        default.local.name.to_string(),
                        "default",
                        import.import_kind == ImportOrExportKind::Type,
                        default.span,
                    ),
                    ImportDeclarationSpecifier::ImportNamespaceSpecifier(namespace) => (
                        "*".into(),
                        namespace.local.name.to_string(),
                        "namespace",
                        import.import_kind == ImportOrExportKind::Type,
                        namespace.span,
                    ),
                };
                ReactNativeImportSpecifier {
                    imported,
                    local,
                    kind: kind.into(),
                    type_only,
                    span,
                }
            })
            .collect::<Vec<_>>();
        let comments = parsed
            .program
            .comments
            .iter()
            .filter_map(|comment| {
                let span = comment.span;
                (span.start >= import.span.start
                    && span.end <= import.span.end
                    && !specifiers.iter().any(|specifier| {
                        span.start >= specifier.span.start && span.end <= specifier.span.end
                    }))
                .then_some(span)
            })
            .collect();
        declarations.push(ReactNativeImportDeclaration {
            span: import.span,
            source_span: import.source.span,
            has_attributes: import.with_clause.is_some(),
            specifiers,
            comments,
        });
    }
    ReactNativeImports {
        diagnostics,
        declarations,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn imports_are_declarations_not_spelling_matches() {
        let source = "// import { Platform } from 'react-native'\n\
            const note = `import { Keyboard } from 'react-native'`;\n\
            import RN, { /* keep */ Platform as プラットフォーム, type ViewStyle } from 'react-native';\n\
            import * as Native from 'react-native';";
        let result = react_native_imports(source, Some("app.ts"));
        assert!(result.diagnostics.is_empty());
        assert_eq!(result.declarations.len(), 2);
        assert_eq!(result.declarations[0].specifiers[0].kind, "default");
        assert_eq!(
            result.declarations[0].specifiers[1].local,
            "プラットフォーム"
        );
        assert!(result.declarations[0].specifiers[2].type_only);
        assert_eq!(result.declarations[0].comments.len(), 1);
        assert_eq!(result.declarations[1].specifiers[0].kind, "namespace");
    }

    #[test]
    fn grammar_errors_are_not_an_empty_success() {
        let result = react_native_imports("const x = <", Some("app.tsx"));
        assert!(!result.diagnostics.is_empty());
        assert!(result.declarations.is_empty());
        assert!(
            react_native_imports("const id = <T>(x: T) => x", Some("app.ts"))
                .diagnostics
                .is_empty()
        );
    }
}
