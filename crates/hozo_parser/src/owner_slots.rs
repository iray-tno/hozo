//! Explicit RFC010 caller inspection, never an ordinary parse pass or a style
//! resolver. Sites are tied to import symbols, not tag spelling or regexes.
use std::collections::HashMap;

use crate::{source_type_for_file, ParseSyntaxError};
use hozo_ir::SourceSpan;
use oxc_allocator::Allocator;
use oxc_ast::{ast::*, AstKind};
use oxc_parser::Parser;
use oxc_semantic::SemanticBuilder;
use oxc_span::GetSpan;

pub struct OwnerSlotBinding {
    pub source: String,
    pub imported: String,
    pub class_prop: String,
    pub prepared_prop: String,
}

pub struct OwnerSlotSite {
    pub target: usize,
    pub span: SourceSpan,
    pub classes: Option<String>,
    pub reason: Option<&'static str>,
}

pub struct OwnerSlotInspection {
    pub insertion_offset: u32,
    pub sites: Vec<OwnerSlotSite>,
    pub diagnostics: Vec<ParseSyntaxError>,
}

pub fn inspect_owner_class_slots(
    source: &str,
    targets: &[OwnerSlotBinding],
    file: Option<&str>,
) -> OwnerSlotInspection {
    let allocator = Allocator::default();
    let parsed = Parser::new(&allocator, source, source_type_for_file(file)).parse();
    let mut out = OwnerSlotInspection {
        insertion_offset: parsed
            .program
            .directives
            .last()
            .map(|directive| directive.span.end)
            .or_else(|| {
                parsed
                    .program
                    .hashbang
                    .as_ref()
                    .map(|hashbang| hashbang.span.end)
            })
            .unwrap_or(0),
        sites: Vec::new(),
        diagnostics: Vec::new(),
    };
    let built = SemanticBuilder::new_compiler()
        .with_build_nodes(true)
        .build(&parsed.program);
    for error in parsed.diagnostics.iter().chain(built.diagnostics.iter()) {
        out.diagnostics.push(ParseSyntaxError {
            message: error.message.to_string(),
            span: error
                .labels
                .first()
                .map_or(SourceSpan { start: 0, end: 0 }, |label| SourceSpan {
                    start: label.offset(),
                    end: label.offset() + label.len(),
                }),
        });
    }
    if !out.diagnostics.is_empty() {
        return out;
    }
    let semantic = built.semantic;
    let scoping = semantic.scoping();
    let mut uses: HashMap<u32, Vec<(usize, bool)>> = HashMap::new();
    for statement in &parsed.program.body {
        let Statement::ImportDeclaration(import) = statement else {
            continue;
        };
        if import.import_kind == ImportOrExportKind::Type {
            continue;
        }
        for specifier in import.specifiers.iter().flatten() {
            let (local, named) = match specifier {
                ImportDeclarationSpecifier::ImportSpecifier(specifier)
                    if specifier.import_kind != ImportOrExportKind::Type =>
                {
                    (&specifier.local, Some(specifier.imported.name()))
                }
                ImportDeclarationSpecifier::ImportNamespaceSpecifier(specifier) => {
                    (&specifier.local, None)
                }
                _ => continue,
            };
            for (index, target) in targets.iter().enumerate() {
                if import.source.value != target.source
                    || named
                        .as_ref()
                        .is_some_and(|name| name.as_str() != target.imported)
                {
                    continue;
                }
                let symbol = local.symbol_id.get().filter(|symbol| {
                    scoping.symbol_redeclarations(*symbol).is_empty()
                        && !scoping
                            .get_resolved_references(*symbol)
                            .any(|r| r.is_write())
                });
                let Some(symbol) = symbol else {
                    out.sites.clear();
                    out.diagnostics.push(ParseSyntaxError {
                        message: format!("Owner import `{}` is unresolved, redeclared or reassigned; caller sites are not assessed.", local.name),
                        span: SourceSpan { start: local.span.start, end: local.span.end },
                    });
                    return out;
                };
                for reference in scoping.get_resolved_references(symbol) {
                    let start = semantic.nodes().get_node(reference.node_id()).span().start;
                    uses.entry(start)
                        .or_default()
                        .push((index, named.is_none()));
                }
            }
        }
    }
    for node in semantic.nodes().iter() {
        let AstKind::JSXOpeningElement(opening) = node.kind() else {
            continue;
        };
        let (start, member) = match &opening.name {
            JSXElementName::IdentifierReference(id) => (id.span.start, None),
            JSXElementName::MemberExpression(member) => {
                let Some(object) = member.object.get_identifier() else {
                    continue;
                };
                (object.span.start, Some(member.property.name.as_str()))
            }
            _ => continue,
        };
        let Some(bindings) = uses.get(&start) else {
            continue;
        };
        for &(index, namespace) in bindings {
            let binding = &targets[index];
            if namespace != member.is_some() || member.is_some_and(|name| name != binding.imported)
            {
                continue;
            }
            let attributes: Vec<_> = opening
                .attributes
                .iter()
                .filter_map(|item| match item {
                    JSXAttributeItem::Attribute(attribute) => Some(attribute),
                    _ => None,
                })
                .collect();
            let named = |attribute: &&oxc_allocator::Box<'_, JSXAttribute<'_>>, name: &str| matches!(&attribute.name, JSXAttributeName::Identifier(id) if id.name == name);
            let classes: Vec<_> = attributes
                .iter()
                .filter(|attr| named(attr, &binding.class_prop))
                .collect();
            if classes.is_empty() {
                continue;
            }
            let reason = if namespace {
                Some("namespace-import")
            } else if opening
                .attributes
                .iter()
                .any(|item| matches!(item, JSXAttributeItem::SpreadAttribute(_)))
            {
                Some("spread")
            } else if classes.len() != 1 {
                Some("duplicate-class")
            } else if attributes
                .iter()
                .any(|attr| named(attr, &binding.prepared_prop))
            {
                Some("prepared-present")
            } else {
                None
            };
            for attribute in classes {
                let literal = match &attribute.value {
                    Some(JSXAttributeValue::StringLiteral(literal)) => {
                        Some(literal.value.to_string())
                    }
                    Some(JSXAttributeValue::ExpressionContainer(container)) => match &container
                        .expression
                    {
                        JSXExpression::StringLiteral(literal) => Some(literal.value.to_string()),
                        _ => None,
                    },
                    _ => None,
                };
                let reason = reason.or_else(|| literal.is_none().then_some("nonliteral"));
                let span = attribute.span();
                out.sites.push(OwnerSlotSite {
                    target: index,
                    span: SourceSpan {
                        start: span.start,
                        end: span.end,
                    },
                    classes: reason.is_none().then_some(literal).flatten(),
                    reason,
                });
            }
        }
    }
    out.sites.sort_by_key(|site| (site.span.start, site.target));
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    fn inspect(source: &str) -> OwnerSlotInspection {
        inspect_owner_class_slots(
            source,
            &[OwnerSlotBinding {
                source: "@hozo/patterns".into(),
                imported: "BottomSheet".into(),
                class_prop: "handleClassName".into(),
                prepared_prop: "hozoHandleStyle".into(),
            }],
            None,
        )
    }
    #[test]
    fn import_symbols_distinguish_aliases_shadowing_foreign_modules_and_type_imports() {
        let source = r#"import {BottomSheet as Sheet} from '@hozo/patterns';
          import {BottomSheet} from 'other'; import type {BottomSheet as Type} from '@hozo/patterns';
          const a=<Sheet handleClassName="p-2"/>;
          function X(Sheet){return <Sheet handleClassName="p-3"/>}
          const b=<BottomSheet handleClassName="p-4"/>; const c=<Type handleClassName="p-5"/>;"#;
        let result = inspect(source);
        assert!(result.diagnostics.is_empty());
        assert_eq!(result.sites.len(), 1);
        let site = &result.sites[0];
        assert_eq!(site.classes.as_deref(), Some("p-2"));
        assert_eq!(
            &source[site.span.start as usize..site.span.end as usize],
            "handleClassName=\"p-2\""
        );
    }
    #[test]
    fn unsafe_attribute_shapes_and_namespace_imports_remain_explicit() {
        for (props, reason) in [
            ("{...props} handleClassName=\"p-2\"", "spread"),
            ("handleClassName=\"p-2\" {...props}", "spread"),
            (
                "handleClassName=\"p-2\" handleClassName=\"p-3\"",
                "duplicate-class",
            ),
            (
                "handleClassName=\"p-2\" hozoHandleStyle={mine}",
                "prepared-present",
            ),
            ("handleClassName={input.value}", "nonliteral"),
        ] {
            let result = inspect(&format!(
                "import {{BottomSheet}} from '@hozo/patterns'; const a=<BottomSheet {props}/>"
            ));
            assert!(!result.sites.is_empty());
            assert!(result
                .sites
                .iter()
                .all(|site| site.reason == Some(reason) && site.classes.is_none()));
        }
        let result = inspect("import * as UI from '@hozo/patterns'; const a=<UI.BottomSheet handleClassName=\"p-2\"/>");
        assert_eq!(result.sites[0].reason, Some("namespace-import"));
        let reassigned = inspect("import {BottomSheet} from '@hozo/patterns'; BottomSheet=Other; const a=<BottomSheet handleClassName=\"p-2\"/>");
        assert!(reassigned.sites.is_empty());
        assert!(!reassigned.diagnostics.is_empty());
        assert!(
            !inspect("import {BottomSheet} from '@hozo/patterns'; const broken = ;")
                .diagnostics
                .is_empty()
        );
    }
}
