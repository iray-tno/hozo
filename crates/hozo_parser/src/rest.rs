//! Facts about bindings that let a lowering decide more, read from syntax
//! and scopes, never from types.
//!
//! **What a `{...rest}` cannot carry: the keys its object pattern took
//! out.** A wrapper is written `function Button({ href, ...rest })`, and
//! `rest` is every prop the caller passed *except* `href` -- that is the
//! language, not a guess about types. So a spread of `rest` cannot be what
//! supplies `href`, and a lowering that only waited for a spread to rule out
//! `href` can decide (#656). Only a binding used for nothing but JSX spreads
//! counts: one that is reassigned, mutated (`rest.href = …`), passed to a
//! function or read any other way could have gained the key back.
//!
//! **What a module-level string constant holds.** `const ACCENT = 'bg-…'`
//! read in a `className` is the literal, as long as the reference really
//! is that constant and not a local of the same name -- which is what the
//! scope analysis answers. So a class list kept in a constant compiles as
//! it would written in place.

use std::collections::HashMap;

use oxc_ast::AstKind;
use oxc_ast::ast::{
    BindingPattern, Declaration, Expression, Program, Statement, VariableDeclaration,
    VariableDeclarationKind,
};
use oxc_ast_visit::Visit;
use oxc_semantic::SemanticBuilder;
use oxc_span::{GetSpan, Span};

/// Identifier-reference start offset -> the keys its rest binding excludes.
pub type RestExclusions = HashMap<u32, Vec<String>>;

/// Identifier-reference start offset -> the string a module-level constant
/// holds, and the span of that literal in its declaration.
pub type ConstantStrings = HashMap<u32, (String, Span)>;

#[derive(Default)]
pub struct Bindings {
    pub rest: RestExclusions,
    pub constants: ConstantStrings,
}

/// A module-level `const` declarator whose value is a string with no
/// interpolation, by its binding.
fn string_constants<'p, 'a>(program: &'p Program<'a>) -> Vec<(&'p oxc_ast::ast::BindingIdentifier<'a>, String, Span)> {
    let declarations = program.body.iter().filter_map(|statement| match statement {
        Statement::VariableDeclaration(declaration) => Some(&**declaration),
        Statement::ExportDeclaration(export) => match &export.declaration {
            Declaration::VariableDeclaration(declaration) => Some(&**declaration),
            _ => None,
        },
        _ => None,
    });
    let mut out = Vec::new();
    for declaration in declarations {
        let VariableDeclaration { kind: VariableDeclarationKind::Const, declarations, .. } = declaration
        else {
            continue;
        };
        for declarator in declarations {
            let (BindingPattern::BindingIdentifier(id), Some(init)) = (&declarator.id, &declarator.init)
            else {
                continue;
            };
            let value = match init.without_parentheses() {
                Expression::StringLiteral(literal) => (literal.value.to_string(), literal.span),
                Expression::TemplateLiteral(template) if template.expressions.is_empty() => {
                    let Some(cooked) = &template.quasis[0].value.cooked else { continue };
                    (cooked.to_string(), template.span)
                }
                _ => continue,
            };
            out.push((&**id, value.0, value.1));
        }
    }
    out
}

pub fn analyze(program: &Program<'_>) -> Bindings {
    let mut probe = Probe { found: false };
    probe.visit_program(program);
    let constants = string_constants(program);
    // Most files have neither; they pay for no binding pass.
    if !probe.found && constants.is_empty() {
        return Bindings::default();
    }
    let built = SemanticBuilder::new().with_build_nodes(true).build(program);
    if !built.diagnostics.is_empty() {
        return Bindings::default();
    }
    let semantic = built.semantic;
    let nodes = semantic.nodes();
    let scoping = semantic.scoping();
    let mut out = Bindings::default();

    for (id, value, span) in constants {
        let Some(symbol) = id.symbol_id.get() else { continue };
        if !scoping.symbol_redeclarations(symbol).is_empty() {
            continue;
        }
        for reference in scoping.get_resolved_references(symbol) {
            if reference.is_read() && !reference.is_write() {
                let start = nodes.get_node(reference.node_id()).kind().span().start;
                out.constants.insert(start, (value.clone(), span));
            }
        }
    }

    if !probe.found {
        return out;
    }
    for node in nodes.iter() {
        let AstKind::ObjectPattern(pattern) = node.kind() else {
            continue;
        };
        let Some(rest) = &pattern.rest else { continue };
        let BindingPattern::BindingIdentifier(id) = &rest.argument else {
            continue;
        };
        // A computed key could be anything; then nothing is known excluded.
        let Some(keys) = pattern
            .properties
            .iter()
            .map(|property| (!property.computed).then(|| property.key.static_name()).flatten())
            .map(|name| name.map(|name| name.to_string()))
            .collect::<Option<Vec<_>>>()
        else {
            continue;
        };
        let Some(symbol) = id.symbol_id.get() else { continue };
        if !scoping.symbol_redeclarations(symbol).is_empty() {
            continue;
        }
        let mut starts = Vec::new();
        let only_spread = scoping.get_resolved_references(symbol).all(|reference| {
            let at = reference.node_id();
            let spread = matches!(nodes.parent_kind(at), AstKind::JSXSpreadAttribute(_));
            if spread && reference.is_read() && !reference.is_write() {
                starts.push(nodes.get_node(at).kind().span().start);
                true
            } else {
                false
            }
        });
        if only_spread {
            for start in starts {
                out.rest.insert(start, keys.clone());
            }
        }
    }
    out
}

struct Probe {
    found: bool,
}

impl<'a> Visit<'a> for Probe {
    fn visit_object_pattern(&mut self, pattern: &oxc_ast::ast::ObjectPattern<'a>) {
        if pattern.rest.is_some() {
            self.found = true;
        }
        oxc_ast_visit::walk::walk_object_pattern(self, pattern);
    }
}
