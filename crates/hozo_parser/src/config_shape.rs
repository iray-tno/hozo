//! The shape of a bundler config, for `hozo init` (RFC 013 §4).
//!
//! `init` edits a config by inserting text at offsets, never by printing a
//! tree, so everything it does not insert stays as the project wrote it.
//! This pass supplies the offsets: the module's imports and requires, what
//! it exports, and the objects, arrays and calls inside that export, as a
//! flat list of nodes. Deciding whether a shape is one `init` knows is the
//! caller's: the pass reports what is there and recognises nothing.
//!
//! The parser rather than the text, because a config is where a commented-out
//! `plugins: [` line or a `defineConfig` inside a string would otherwise be
//! edited.

use crate::{source_type_for_file, ParseSyntaxError};
use oxc_allocator::Allocator;
use oxc_ast::ast::*;
use oxc_parser::Parser;
use oxc_span::{GetSpan, Span};

/// How deep under the export the pass follows objects, arrays and calls.
/// `export default defineConfig({ vite: { plugins: [hozo()] } })` is five
/// levels; nothing `init` edits is deeper.
const MAX_DEPTH: usize = 6;

pub struct ConfigImport {
    /// The module specifier, as its value.
    pub source: String,
    /// `import` for a declaration, `require` for `const … = require(…)`.
    pub kind: &'static str,
    pub span: Span,
    /// The local names it binds.
    pub locals: Vec<String>,
}

pub struct ConfigNode {
    /// `object`, `array`, `call`, `identifier`, `string`, `spread` or `other`.
    pub kind: &'static str,
    /// The node's span, after any parentheses, `as` and `satisfies` around it.
    pub span: Span,
    /// The index of the node it is inside, or `None` for a root.
    pub parent: Option<usize>,
    /// In an object: the property's static key. In an array or a call's
    /// arguments: `None`.
    pub key: Option<String>,
    /// In an object: where the whole property starts, key included.
    pub property_start: Option<u32>,
    /// A call's callee (`defineConfig`, or `withHozo` in `x.withHozo`), an
    /// identifier's name, or a string's value.
    pub name: Option<String>,
}

pub struct ConfigBinding {
    /// A top-level `const`/`let`/`var` name bound to a single identifier.
    pub name: String,
    /// The node its initialiser is.
    pub node: usize,
}

pub struct ConfigShape {
    pub diagnostics: Vec<ParseSyntaxError>,
    pub imports: Vec<ConfigImport>,
    /// `esm` for `export default`, `cjs` for `module.exports =`, or `None`.
    pub export_kind: Option<&'static str>,
    /// The whole exporting statement.
    pub export_span: Option<Span>,
    /// The node the module exports.
    pub export_node: Option<usize>,
    pub bindings: Vec<ConfigBinding>,
    pub nodes: Vec<ConfigNode>,
}

pub fn config_shape(source: &str, file: Option<&str>) -> ConfigShape {
    let allocator = Allocator::default();
    let parsed = Parser::new(&allocator, source, source_type_for_file(file)).parse();
    let mut shape = ConfigShape {
        diagnostics: parsed
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
            .collect(),
        imports: Vec::new(),
        export_kind: None,
        export_span: None,
        export_node: None,
        bindings: Vec::new(),
        nodes: Vec::new(),
    };
    if !shape.diagnostics.is_empty() {
        return shape;
    }
    for statement in &parsed.program.body {
        match statement {
            Statement::ImportDeclaration(import) => {
                let locals = import
                    .specifiers
                    .iter()
                    .flatten()
                    .map(|specifier| specifier.local().name.to_string())
                    .collect();
                shape.imports.push(ConfigImport {
                    source: import.source.value.to_string(),
                    kind: "import",
                    span: import.span,
                    locals,
                });
            }
            Statement::VariableDeclaration(variables) => {
                for declarator in &variables.declarations {
                    let Some(init) = &declarator.init else {
                        continue;
                    };
                    if let Some(source) = required(init) {
                        shape.imports.push(ConfigImport {
                            source,
                            kind: "require",
                            span: variables.span,
                            locals: declarator
                                .id
                                .get_binding_identifiers()
                                .iter()
                                .map(|id| id.name.to_string())
                                .collect(),
                        });
                        continue;
                    }
                    if let Some(id) = declarator.id.get_binding_identifier() {
                        let node = walk(init, None, None, 0, &mut shape.nodes);
                        shape.bindings.push(ConfigBinding {
                            name: id.name.to_string(),
                            node,
                        });
                    }
                }
            }
            Statement::ExportDefaultDeclaration(export) => {
                if let Some(expression) = export.declaration.as_expression() {
                    shape.export_kind = Some("esm");
                    shape.export_span = Some(export.span);
                    shape.export_node = Some(walk(expression, None, None, 0, &mut shape.nodes));
                }
            }
            Statement::ExpressionStatement(statement) => {
                let Expression::AssignmentExpression(assignment) = &statement.expression else {
                    continue;
                };
                if is_module_exports(&assignment.left) {
                    shape.export_kind = Some("cjs");
                    shape.export_span = Some(statement.span);
                    shape.export_node =
                        Some(walk(&assignment.right, None, None, 0, &mut shape.nodes));
                }
            }
            _ => {}
        }
    }
    shape
}

/// `module.exports` as an assignment target.
fn is_module_exports(target: &AssignmentTarget<'_>) -> bool {
    let AssignmentTarget::StaticMemberExpression(member) = target else {
        return false;
    };
    member.property.name == "exports"
        && matches!(&member.object, Expression::Identifier(object) if object.name == "module")
}

/// The specifier of `require('x')`, or of `require('x').y`.
fn required(expression: &Expression<'_>) -> Option<String> {
    match expression.without_parentheses() {
        Expression::CallExpression(call) => {
            let Expression::Identifier(callee) = &call.callee else {
                return None;
            };
            if callee.name != "require" || call.arguments.len() != 1 {
                return None;
            }
            match call.arguments[0].as_expression()? {
                Expression::StringLiteral(literal) => Some(literal.value.to_string()),
                _ => None,
            }
        }
        Expression::StaticMemberExpression(member) => required(&member.object),
        _ => None,
    }
}

/// The expression under parentheses, `as`, `satisfies` and `!`, which
/// change nothing about the value a config exports.
fn unwrapped<'a, 'b>(expression: &'b Expression<'a>) -> &'b Expression<'a> {
    match expression {
        Expression::ParenthesizedExpression(inner) => unwrapped(&inner.expression),
        Expression::TSAsExpression(inner) => unwrapped(&inner.expression),
        Expression::TSSatisfiesExpression(inner) => unwrapped(&inner.expression),
        Expression::TSNonNullExpression(inner) => unwrapped(&inner.expression),
        other => other,
    }
}

fn push(
    nodes: &mut Vec<ConfigNode>,
    kind: &'static str,
    span: Span,
    parent: Option<usize>,
    key: Option<String>,
    name: Option<String>,
) -> usize {
    nodes.push(ConfigNode {
        kind,
        span,
        parent,
        key,
        property_start: None,
        name,
    });
    nodes.len() - 1
}

fn walk(
    expression: &Expression<'_>,
    parent: Option<usize>,
    key: Option<String>,
    depth: usize,
    nodes: &mut Vec<ConfigNode>,
) -> usize {
    let expression = unwrapped(expression);
    let span = expression.span();
    let deeper = depth < MAX_DEPTH;
    match expression {
        Expression::ObjectExpression(object) => {
            let index = push(nodes, "object", span, parent, key, None);
            if deeper {
                for property in &object.properties {
                    match property {
                        ObjectPropertyKind::ObjectProperty(property) => {
                            let name = if property.computed {
                                None
                            } else {
                                property.key.static_name().map(|name| name.to_string())
                            };
                            let child = walk(&property.value, Some(index), name, depth + 1, nodes);
                            nodes[child].property_start = Some(property.span.start);
                        }
                        ObjectPropertyKind::SpreadProperty(spread) => {
                            let child = push(nodes, "spread", spread.span, Some(index), None, None);
                            nodes[child].property_start = Some(spread.span.start);
                        }
                    }
                }
            }
            index
        }
        Expression::ArrayExpression(array) => {
            let index = push(nodes, "array", span, parent, key, None);
            if deeper {
                for element in &array.elements {
                    if let Some(element) = element.as_expression() {
                        walk(element, Some(index), None, depth + 1, nodes);
                    } else {
                        push(nodes, "spread", element.span(), Some(index), None, None);
                    }
                }
            }
            index
        }
        Expression::CallExpression(call) => {
            let callee = match unwrapped(&call.callee) {
                Expression::Identifier(id) => Some(id.name.to_string()),
                Expression::StaticMemberExpression(member) => {
                    Some(member.property.name.to_string())
                }
                _ => None,
            };
            let index = push(nodes, "call", span, parent, key, callee);
            if deeper {
                for argument in &call.arguments {
                    if let Some(argument) = argument.as_expression() {
                        walk(argument, Some(index), None, depth + 1, nodes);
                    } else {
                        push(nodes, "spread", argument.span(), Some(index), None, None);
                    }
                }
            }
            index
        }
        Expression::Identifier(id) => push(
            nodes,
            "identifier",
            span,
            parent,
            key,
            Some(id.name.to_string()),
        ),
        Expression::StringLiteral(literal) => push(
            nodes,
            "string",
            span,
            parent,
            key,
            Some(literal.value.to_string()),
        ),
        _ => push(nodes, "other", span, parent, key, None),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn text(source: &str, span: Span) -> &str {
        &source[span.start as usize..span.end as usize]
    }

    #[test]
    fn a_vite_config_reports_its_plugins_array_and_the_calls_in_it() {
        let source = "import react from '@vitejs/plugin-react'\nimport { defineConfig } from 'vite'\n\n// plugins: [old()]\nexport default defineConfig({\n  plugins: [react()],\n})\n";
        let shape = config_shape(source, Some("vite.config.ts"));
        assert_eq!(shape.imports.len(), 2);
        assert_eq!(shape.imports[0].locals, ["react"]);
        assert_eq!(shape.export_kind, Some("esm"));
        let root = &shape.nodes[shape.export_node.unwrap()];
        assert_eq!(
            (root.kind, root.name.as_deref()),
            ("call", Some("defineConfig"))
        );
        let plugins = shape
            .nodes
            .iter()
            .find(|node| node.key.as_deref() == Some("plugins"))
            .unwrap();
        assert_eq!(text(source, plugins.span), "[react()]");
        let react = shape.nodes.last().unwrap();
        assert_eq!((react.kind, react.name.as_deref()), ("call", Some("react")));
    }

    #[test]
    fn module_exports_requires_and_a_bound_config_are_reported() {
        let source = "const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');\nconst config = {};\nmodule.exports = mergeConfig(getDefaultConfig(__dirname), config);\n";
        let shape = config_shape(source, Some("metro.config.js"));
        assert_eq!(shape.imports[0].kind, "require");
        assert_eq!(shape.imports[0].locals, ["getDefaultConfig", "mergeConfig"]);
        assert_eq!(shape.export_kind, Some("cjs"));
        let root = &shape.nodes[shape.export_node.unwrap()];
        assert_eq!(
            text(source, root.span),
            "mergeConfig(getDefaultConfig(__dirname), config)"
        );
        assert_eq!(shape.bindings[0].name, "config");
        assert_eq!(shape.nodes[shape.bindings[0].node].kind, "object");
    }

    #[test]
    fn satisfies_and_parentheses_are_looked_through() {
        let source =
            "const config = ({ addons: ['a'] }) satisfies StorybookConfig\nexport default config\n";
        let shape = config_shape(source, Some("main.ts"));
        let bound = &shape.nodes[shape.bindings[0].node];
        assert_eq!(text(source, bound.span), "{ addons: ['a'] }");
        let root = &shape.nodes[shape.export_node.unwrap()];
        assert_eq!(
            (root.kind, root.name.as_deref()),
            ("identifier", Some("config"))
        );
    }

    #[test]
    fn a_syntax_error_reports_nothing_but_the_error() {
        let shape = config_shape("export default {", Some("vite.config.ts"));
        assert!(!shape.diagnostics.is_empty());
        assert!(shape.export_node.is_none());
    }
}
