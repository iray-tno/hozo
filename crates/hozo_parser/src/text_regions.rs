//! Opt-in identity/binding facts from the existing AST, not a style resolver.
//! A fixed memo render root can change its internal host implementation
//! without introducing a new alternate-site remount. The Native backend
//! must separately prove the complete style frame and adapter-free output.
use std::collections::HashSet;

use hozo_ir::SourceSpan;
use oxc_ast::{ast::*, AstKind};
use oxc_semantic::SemanticBuilder;
use oxc_span::GetSpan;

pub(crate) fn stable_roots(program: &Program<'_>) -> Vec<SourceSpan> {
    let built = SemanticBuilder::new().with_build_nodes(true).build(program);
    if !built.diagnostics.is_empty() {
        return Vec::new();
    }
    let semantic = built.semantic;
    let scoping = semantic.scoping();
    let mut memo_uses = HashSet::new();
    let mut text_uses = HashSet::new();
    for statement in &program.body {
        let Statement::ImportDeclaration(import) = statement else {
            continue;
        };
        if import.import_kind == ImportOrExportKind::Type {
            continue;
        }
        for specifier in import.specifiers.iter().flatten() {
            let ImportDeclarationSpecifier::ImportSpecifier(specifier) = specifier else {
                continue;
            };
            if specifier.import_kind == ImportOrExportKind::Type {
                continue;
            }
            let target = match (
                import.source.value.as_str(),
                specifier.imported.name().as_str(),
            ) {
                ("react", "memo") => &mut memo_uses,
                ("react-native" | "@hozo/core" | "@hozo/primitives", "Text") => &mut text_uses,
                _ => continue,
            };
            let Some(symbol) = specifier.local.symbol_id.get() else {
                continue;
            };
            if !scoping.symbol_redeclarations(symbol).is_empty()
                || scoping
                    .get_resolved_references(symbol)
                    .any(|r| r.is_write())
            {
                continue;
            }
            target.extend(
                scoping
                    .get_resolved_references(symbol)
                    .map(|r| semantic.nodes().get_node(r.node_id()).kind().span().start),
            );
        }
    }
    let mut roots = Vec::new();
    for node in semantic.nodes().iter() {
        let AstKind::CallExpression(call) = node.kind() else {
            continue;
        };
        let Expression::Identifier(callee) = &call.callee else {
            continue;
        };
        if call.optional || !memo_uses.contains(&callee.span.start) {
            continue;
        }
        let Some(render) = call.arguments.first().and_then(|a| a.as_expression()) else {
            continue;
        };
        let root = match render.without_parentheses() {
            Expression::ArrowFunctionExpression(render) if !render.r#async => match &render.body {
                ArrowFunctionBody::FunctionBody(body) => returned_root(body),
                body => body.as_expression().and_then(text_root),
            },
            Expression::FunctionExpression(render) if !render.r#async && !render.generator => {
                // A recursive/escaping render function could be called directly,
                // losing the memo component boundary that protects host identity.
                if render.id.as_ref().is_some_and(|id| {
                    id.symbol_id.get().is_none_or(|symbol| {
                        scoping.get_resolved_references(symbol).next().is_some()
                    })
                }) {
                    continue;
                }
                render.body.as_ref().and_then(|body| returned_root(body))
            }
            _ => None,
        };
        if let Some(root) = root.filter(|root| known_text(root, &text_uses)) {
            roots.push(SourceSpan {
                start: root.span.start,
                end: root.span.end,
            });
        }
    }
    roots
}

fn text_root<'a, 'b>(expression: &'b Expression<'a>) -> Option<&'b JSXElement<'a>> {
    match expression.without_parentheses() {
        Expression::JSXElement(root) => Some(root),
        _ => None,
    }
}

fn returned_root<'a, 'b>(body: &'b FunctionBody<'a>) -> Option<&'b JSXElement<'a>> {
    let (last, before) = body.statements.split_last()?;
    if !before
        .iter()
        .all(|statement| matches!(statement, Statement::VariableDeclaration(_)))
    {
        return None;
    }
    let Statement::ReturnStatement(last) = last else {
        return None;
    };
    last.argument.as_ref().and_then(text_root)
}

fn known_text(element: &JSXElement<'_>, text_uses: &HashSet<u32>) -> bool {
    matches!(&element.opening_element.name, JSXElementName::IdentifierReference(id)
        if text_uses.contains(&id.span.start))
        && element.children.iter().all(|child| match child {
            JSXChild::Text(_) => true,
            JSXChild::Element(child) => known_text(child, text_uses),
            _ => false,
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use oxc_allocator::Allocator;
    use oxc_parser::Parser;
    use oxc_span::SourceType;

    fn roots(source: &str) -> Vec<SourceSpan> {
        let allocator = Allocator::default();
        let parsed = Parser::new(&allocator, source, SourceType::tsx()).parse();
        assert!(parsed.diagnostics.is_empty(), "{source}");
        stable_roots(&parsed.program)
    }

    #[test]
    fn proves_fixed_memo_roots_by_import_symbol_not_spelling() {
        for render in [
            "()=> <T>Hi<T>Nested</T></T>",
            "function Label(){const state=useState(0); return <T>Hi</T>}",
        ] {
            let source = format!("import {{memo as m}} from 'react'; import {{Text as T}} from '@hozo/core'; export const Label=m({render})");
            let result = roots(&source);
            assert_eq!(result.len(), 1, "{source}");
            assert!(source[result[0].start as usize..result[0].end as usize].starts_with("<T>"));
        }
    }

    #[test]
    fn ordinary_parsing_does_not_run_this_proof() {
        let source = "import {Text} from '@hozo/core'; import {memo} from 'react'; const Label=memo(()=> <Text>Hi</Text>)";
        let ordinary = crate::parse_tsx(source);
        assert!(ordinary.stable_text_roots.is_empty());
        let selected = crate::parse_module_with_text_regions(source, None, None, &[], None, &[]);
        assert_eq!(selected.stable_text_roots.len(), 1);
        assert_eq!(selected.roots[0].node, ordinary.roots[0].node);
        assert_eq!(selected.consumed_class_spans, ordinary.consumed_class_spans);
    }

    #[test]
    fn uncertain_identity_and_bindings_are_not_proofs() {
        for source in [
            "const Label=()=> <Text>Hi</Text>",
            "import {memo} from 'other'; import {Text} from '@hozo/core'; const Label=memo(()=> <Text>Hi</Text>)",
            "import {memo} from 'react'; import {Text} from 'other'; const Label=memo(()=> <Text>Hi</Text>)",
            "import {memo} from 'react'; import {Text} from '@hozo/core'; function Wrap(memo){return memo(()=> <Text>Hi</Text>)}",
            "import {memo} from 'react'; import {Text} from '@hozo/core'; const Label=memo((Text)=> <Text>Hi</Text>)",
            "import {memo} from 'react'; import {Text} from '@hozo/core'; const Label=memo(()=> flag ? <Text>A</Text> : <Text>B</Text>)",
            "import {memo} from 'react'; import {Text} from '@hozo/core'; const Label=memo(()=> {if(flag)return <Text>A</Text>;return <Text>B</Text>})",
            "import {memo} from 'react'; import {Text} from '@hozo/core'; const Label=memo(function Render(){const other=Render;return <Text>Hi</Text>})",
            "import {memo} from 'react'; import {Text} from '@hozo/core'; const Label=memo(async()=> <Text>Hi</Text>)",
            "import {memo} from 'react'; import {Text} from '@hozo/core'; const Label=memo(()=> <Text>{children}</Text>)",
            "import {memo} from 'react'; import {Text} from '@hozo/core'; const Label=memo(()=> <Text><Opaque/></Text>)",
            "import {memo} from 'react'; import {Text} from '@hozo/core'; const Label=memo(()=> <Text><View><Text>Hi</Text></View></Text>)",
            "import {memo} from 'react'; import {Text} from '@hozo/core'; Text=Other; const Label=memo(()=> <Text>Hi</Text>)",
            "import {memo} from 'react'; import {Text} from '@hozo/core'; memo=Other; const Label=memo(()=> <Text>Hi</Text>)",
            "import type {memo} from 'react'; import {Text} from '@hozo/core'; const Label=memo(()=> <Text>Hi</Text>)",
        ] { assert!(roots(source).is_empty(), "{source}"); }
    }
}
