//! The names a module binds at its top level, as values.
//!
//! Lowering prepends imports of runtime components -- `HozoDialog`,
//! `HozoView`, ... -- to the module it compiled. A module that already binds
//! one of those names then declares it twice, and the bundler rejects the
//! *generated* line with a parse error about code the author never wrote
//! (#670). Asking the parser, rather than searching the text, is what keeps a
//! comment or a string that mentions `function HozoDialog` from counting.

use oxc_allocator::Allocator;
use oxc_ast::ast::{
    Declaration, ExportDefaultDeclarationKind, ImportDeclarationSpecifier, ImportOrExportKind,
    Statement,
};
use oxc_parser::Parser;
use oxc_span::SourceType;

/// Every name the module binds at its top level as a runtime value, in
/// source order.
///
/// Counted: imports (default, namespace and named, unless type-only),
/// function, class and enum declarations, and every name a `var`, `let` or
/// `const` pattern binds -- exported or not, including a named
/// `export default function` or `class`.
///
/// Not counted, because none of them is a runtime binding a second import
/// would collide with: type aliases, interfaces, `declare` forms, and export
/// aliases (`export { A as HozoDialog }` binds nothing called `HozoDialog`,
/// which is why it is the workaround).
pub fn top_level_bindings(source_text: &str) -> Vec<String> {
    let allocator = Allocator::default();
    let source_type = SourceType::from_extension("tsx").expect("\"tsx\" is a known extension");
    let ret = Parser::new(&allocator, source_text, source_type).parse();
    let mut names = Vec::new();
    for statement in &ret.program.body {
        match statement {
            Statement::ImportDeclaration(import) => {
                if import.import_kind == ImportOrExportKind::Type {
                    continue;
                }
                for specifier in import.specifiers.iter().flatten() {
                    match specifier {
                        ImportDeclarationSpecifier::ImportSpecifier(named) => {
                            if named.import_kind != ImportOrExportKind::Type {
                                names.push(named.local.name.to_string());
                            }
                        }
                        ImportDeclarationSpecifier::ImportDefaultSpecifier(default) => {
                            names.push(default.local.name.to_string());
                        }
                        ImportDeclarationSpecifier::ImportNamespaceSpecifier(namespace) => {
                            names.push(namespace.local.name.to_string());
                        }
                    }
                }
            }
            Statement::ExportDeclaration(export) => {
                declaration_bindings(&export.declaration, &mut names);
            }
            Statement::ExportDefaultDeclaration(export) => match &export.declaration {
                ExportDefaultDeclarationKind::FunctionDeclaration(function) => {
                    if let Some(id) = &function.id {
                        names.push(id.name.to_string());
                    }
                }
                ExportDefaultDeclarationKind::ClassDeclaration(class) => {
                    if let Some(id) = &class.id {
                        names.push(id.name.to_string());
                    }
                }
                _ => {}
            },
            other => {
                if let Some(declaration) = other.as_declaration() {
                    declaration_bindings(declaration, &mut names);
                }
            }
        }
    }
    names
}

fn declaration_bindings(declaration: &Declaration<'_>, names: &mut Vec<String>) {
    match declaration {
        Declaration::VariableDeclaration(variables) if !variables.declare => {
            for declarator in &variables.declarations {
                for id in declarator.id.get_binding_identifiers() {
                    names.push(id.name.to_string());
                }
            }
        }
        Declaration::FunctionDeclaration(function) if !function.declare => {
            if let Some(id) = &function.id {
                names.push(id.name.to_string());
            }
        }
        Declaration::ClassDeclaration(class) if !class.declare => {
            if let Some(id) = &class.id {
                names.push(id.name.to_string());
            }
        }
        Declaration::TSEnumDeclaration(enumeration) if !enumeration.declare => {
            names.push(enumeration.id.name.to_string());
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::top_level_bindings;

    #[test]
    fn the_issue_repro_binds_the_name_lowering_injects() {
        let source = "import { Dialog } from '@hozo/patterns'\n\
            export function HozoDialog({ children }) {\n\
              return <Dialog open>{children}</Dialog>\n\
            }\n";
        assert_eq!(top_level_bindings(source), ["Dialog", "HozoDialog"]);
    }

    #[test]
    fn every_value_declaration_counts_exported_or_not() {
        let source = "import Def, * as Ns from 'a'\n\
            import { a, b as c } from 'b'\n\
            function f() {}\n\
            class K {}\n\
            const { d, e: [g] } = x, h = 1\n\
            let i\n\
            var j\n\
            enum E { A }\n\
            export const k = 1\n\
            export class L {}\n\
            export default function M() {}\n";
        assert_eq!(
            top_level_bindings(source),
            ["Def", "Ns", "a", "c", "f", "K", "d", "g", "h", "i", "j", "E", "k", "L", "M"]
        );
    }

    #[test]
    fn types_ambient_forms_aliases_and_text_do_not_count() {
        let source = "import type { HozoView } from 'a'\n\
            import { type HozoText } from 'b'\n\
            type HozoDialog = {}\n\
            interface HozoScrollView {}\n\
            declare const HozoFlatList: unknown\n\
            // function HozoActivityIndicator() {}\n\
            const note = 'class HozoTouchableOpacity {}'\n\
            function Styled() {}\n\
            export { Styled as HozoRefreshControl }\n\
            export default function () {}\n\
            function outer() { const HozoImage = 1 }\n";
        assert_eq!(top_level_bindings(source), ["note", "Styled", "outer"]);
    }
}
