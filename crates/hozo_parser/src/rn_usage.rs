//! Opt-in migration evidence, not another lowering policy. Resolve references
//! to import symbols so a parameter called `Platform` is not RN API usage.
//! Ordinary compilation never pays for this semantic pass.

use crate::{source_type_for_file, ParseSyntaxError};
use oxc_allocator::Allocator;
use oxc_ast::{ast::*, AstKind};
use oxc_parser::Parser;
use oxc_semantic::{Semantic, SemanticBuilder};
use oxc_span::{GetSpan, Span};

pub struct ReactNativeReference {
    pub kind: String,
    pub access: String,
    pub member: Option<String>,
    pub span: Span,
}

pub struct ReactNativeBindingUsage {
    pub imported: String,
    pub local: Option<String>,
    pub exported: Option<String>,
    pub kind: String,
    pub type_only: bool,
    pub span: Span,
    pub references: Vec<ReactNativeReference>,
}

pub struct ReactNativeUsage {
    pub diagnostics: Vec<ParseSyntaxError>,
    pub bindings: Vec<ReactNativeBindingUsage>,
}

pub fn analyze_react_native_usage(source: &str, file: Option<&str>) -> ReactNativeUsage {
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
        return ReactNativeUsage {
            diagnostics,
            bindings: Vec::new(),
        };
    }
    let built = SemanticBuilder::new_compiler()
        .with_build_nodes(true)
        .build(&parsed.program);
    // Binding failures are not permission to return a convincing empty census.
    if !built.diagnostics.is_empty() {
        return ReactNativeUsage {
            diagnostics: built
                .diagnostics
                .iter()
                .map(|error| ParseSyntaxError {
                    message: error.message.to_string(),
                    span: hozo_ir::SourceSpan { start: 0, end: 0 },
                })
                .collect(),
            bindings: Vec::new(),
        };
    }
    let semantic = built.semantic;
    let mut bindings = Vec::new();
    for statement in &parsed.program.body {
        match statement {
            Statement::ImportDeclaration(import) if import.source.value == "react-native" => {
                if import
                    .specifiers
                    .as_ref()
                    .is_none_or(|specifiers| specifiers.is_empty())
                    && import.import_kind == ImportOrExportKind::Value
                {
                    bindings.push(ReactNativeBindingUsage {
                        imported: "*".into(),
                        local: None,
                        exported: None,
                        kind: "side-effect".into(),
                        type_only: false,
                        span: import.span,
                        references: Vec::new(),
                    });
                }
                for specifier in import.specifiers.iter().flatten() {
                    let (imported, local, type_only, span) = match specifier {
                        ImportDeclarationSpecifier::ImportSpecifier(named) => (
                            named.imported.name().to_string(),
                            &named.local,
                            import.import_kind == ImportOrExportKind::Type
                                || named.import_kind == ImportOrExportKind::Type,
                            named.span,
                        ),
                        ImportDeclarationSpecifier::ImportDefaultSpecifier(default) => (
                            "default".into(),
                            &default.local,
                            import.import_kind == ImportOrExportKind::Type,
                            default.span,
                        ),
                        ImportDeclarationSpecifier::ImportNamespaceSpecifier(namespace) => (
                            "*".into(),
                            &namespace.local,
                            import.import_kind == ImportOrExportKind::Type,
                            namespace.span,
                        ),
                    };
                    // Oxc permits some TS declaration merges without an early
                    // error. A merged RN import is not an unambiguous origin;
                    // do not attribute the combined symbol's uses to RN.
                    let Some(symbol) = local.symbol_id.get().filter(|symbol| {
                        semantic.scoping().symbol_redeclarations(*symbol).is_empty()
                    }) else {
                        return ReactNativeUsage {
                            diagnostics: vec![ParseSyntaxError {
                                message: format!("React Native import binding `{}` has an unresolved or merged declaration; usage is not assessed.", local.name),
                                span: hozo_ir::SourceSpan { start: local.span.start, end: local.span.end },
                            }],
                            bindings: Vec::new(),
                        };
                    };
                    let references = semantic
                        .scoping()
                        .get_resolved_references(symbol)
                        .map(|reference| describe_reference(&semantic, reference, type_only))
                        .collect();
                    bindings.push(ReactNativeBindingUsage {
                        imported,
                        local: Some(local.name.to_string()),
                        exported: None,
                        kind: "import".into(),
                        type_only,
                        span,
                        references,
                    });
                }
            }
            Statement::ExportFromDeclaration(export) if export.source.value == "react-native" => {
                for specifier in &export.specifiers {
                    bindings.push(ReactNativeBindingUsage {
                        imported: specifier.local.name().to_string(),
                        local: None,
                        exported: Some(specifier.exported.name().to_string()),
                        kind: "reexport".into(),
                        type_only: export.export_kind == ImportOrExportKind::Type
                            || specifier.export_kind == ImportOrExportKind::Type,
                        span: specifier.span,
                        references: Vec::new(),
                    });
                }
            }
            Statement::ExportAllDeclaration(export) if export.source.value == "react-native" => {
                bindings.push(ReactNativeBindingUsage {
                    imported: "*".into(),
                    local: None,
                    exported: export.exported.as_ref().map(|name| name.name().to_string()),
                    kind: "reexport".into(),
                    type_only: export.export_kind == ImportOrExportKind::Type,
                    span: export.span,
                    references: Vec::new(),
                });
            }
            _ => {}
        }
    }
    for binding in &mut bindings {
        binding
            .references
            .sort_by_key(|reference| (reference.span.start, reference.span.end));
    }
    ReactNativeUsage {
        diagnostics: Vec::new(),
        bindings,
    }
}

fn describe_reference(
    semantic: &Semantic<'_>,
    reference: &oxc_semantic::Reference,
    type_only: bool,
) -> ReactNativeReference {
    let nodes = semantic.nodes();
    let mut node_id = reference.node_id();
    let mut span = nodes.get_node(node_id).span();
    let mut members = Vec::new();
    let mut access = "value";
    loop {
        let parent = nodes.parent_kind(node_id);
        match parent {
            AstKind::StaticMemberExpression(member) if member.object.span() == span => {
                members.push(member.property.name.to_string());
                access = "static-member";
                span = member.span;
            }
            AstKind::ComputedMemberExpression(member) if member.object.span() == span => {
                span = member.span;
                if let Expression::StringLiteral(property) = &member.expression {
                    members.push(property.value.to_string());
                    access = "static-member";
                } else {
                    access = "dynamic-member";
                    break;
                }
            }
            AstKind::JSXMemberExpression(member) => {
                members.push(member.property.name.to_string());
                access = "jsx";
                span = member.span;
            }
            AstKind::JSXOpeningElement(_) | AstKind::JSXClosingElement(_) => {
                access = "jsx";
                break;
            }
            AstKind::ExportSpecifier(_) => {
                access = "reexport";
                break;
            }
            _ => break,
        }
        node_id = nodes.parent_id(node_id);
    }
    ReactNativeReference {
        kind: if type_only || reference.is_type() {
            "type"
        } else {
            "runtime"
        }
        .into(),
        access: access.into(),
        member: if members.is_empty() {
            None
        } else {
            Some(members.join("."))
        },
        span,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn references_resolve_aliases_and_shadowing_not_text() {
        let source = "import { Platform as P, View, Keyboard } from 'react-native';\n\
            const a = P.OS; const b = P['select']({}); const c = P[key];\n\
            function f(P) { return P.OS }\n\
            const Factory = View; const tree = <View />; // Keyboard.dismiss()";
        let result = analyze_react_native_usage(source, Some("app.tsx"));
        assert!(result.diagnostics.is_empty());
        assert_eq!(result.bindings[0].references.len(), 3);
        assert_eq!(
            result.bindings[0].references[0].member.as_deref(),
            Some("OS")
        );
        assert_eq!(result.bindings[0].references[2].access, "dynamic-member");
        assert_eq!(result.bindings[1].references.len(), 2);
        assert_eq!(result.bindings[1].references[1].access, "jsx");
        assert!(result.bindings[2].references.is_empty());
    }

    #[test]
    fn types_namespace_members_and_reexports_are_separate() {
        let source = "import type { ViewStyle } from 'react-native';\n\
            import { Platform, type TextStyle } from 'react-native';\n\
            import * as RN from 'react-native';\n\
            type T = typeof Platform; let style: ViewStyle; let text: TextStyle;\n\
            const x = RN.Animated.timing; const y = <RN.Animated.View />;\n\
            export { Platform as P }; export { Keyboard as K, type ViewProps } from 'react-native';\n\
            export * from 'react-native'; import 'react-native';";
        let result = analyze_react_native_usage(source, None);
        assert!(result.diagnostics.is_empty());
        assert!(result.bindings[0].type_only);
        assert_eq!(result.bindings[1].references[0].kind, "type");
        assert_eq!(result.bindings[1].references[1].access, "reexport");
        assert!(result.bindings[2].type_only);
        assert_eq!(
            result.bindings[3].references[0].member.as_deref(),
            Some("Animated.timing")
        );
        assert_eq!(
            result.bindings[3].references[1].member.as_deref(),
            Some("Animated.View")
        );
        assert_eq!(result.bindings[4].exported.as_deref(), Some("K"));
        assert!(result.bindings[5].type_only);
        assert_eq!(result.bindings[6].kind, "reexport");
        assert_eq!(result.bindings[7].kind, "side-effect");
    }

    #[test]
    fn invalid_source_is_not_an_empty_success() {
        let result = analyze_react_native_usage(
            "import { Platform } from 'react-native'; const x = <",
            Some("app.tsx"),
        );
        assert!(!result.diagnostics.is_empty());
        assert!(result.bindings.is_empty());
        let merged = analyze_react_native_usage(
            "import { Platform } from 'react-native'; const Platform = 1; Platform.OS",
            Some("app.ts"),
        );
        assert!(!merged.diagnostics.is_empty());
        assert!(merged.bindings.is_empty());
    }

    #[test]
    fn empty_type_import_has_no_binding_or_runtime_side_effect_edge() {
        let result = analyze_react_native_usage(
            "import type {} from 'react-native'; import {} from 'react-native';",
            Some("app.ts"),
        );
        assert!(result.diagnostics.is_empty());
        assert_eq!(result.bindings.len(), 1);
        assert_eq!(result.bindings[0].kind, "side-effect");
        assert!(!result.bindings[0].type_only);
    }
}
