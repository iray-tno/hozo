//! Conservative import-reference facts, not a second StyleX evaluator.
//!
//! A JSX tag alone does not supply a StyleX value. An identifier used anywhere
//! as an expression might: keep that wider set rather than trying to prove
//! data flow through aliases, closures, mutation or user functions here. The
//! project analysis can use these facts to bound its static context, but they
//! say nothing about runtime dependency resolution or side effects.

use std::collections::HashSet;

use oxc_ast::ast::{IdentifierReference, JSXElementName, Program};
use oxc_ast_visit::Visit;
use oxc_syntax::module_record::ModuleRecord;

use super::STYLEX_MODULE;

#[derive(Debug, Clone, Eq, PartialEq)]
pub struct ModuleContextSummary {
    /// Recovery can still inventory references, but cannot prove their absence.
    pub parse_complete: bool,
    pub has_stylex_import: bool,
    /// Sorted unique non-intrinsic specifiers with a possible value reference.
    /// This deliberately over-approximates StyleX inputs, including shadowed
    /// names and references in types. It is not a minimal dependency set.
    pub value_imports: Vec<String>,
}

#[derive(Default)]
struct References {
    names: HashSet<String>,
}

impl<'a> Visit<'a> for References {
    fn visit_identifier_reference(&mut self, identifier: &IdentifierReference<'a>) {
        self.names.insert(identifier.name.to_string());
    }

    fn visit_jsx_element_name(&mut self, _name: &JSXElementName<'a>) {
        // Oxc also represents component tag names as identifier references.
        // Skip only the tag; attributes, spreads and children still get walked.
    }
}

pub(crate) fn summarize(
    program: &Program,
    module: &ModuleRecord,
    parse_complete: bool,
) -> ModuleContextSummary {
    let mut references = References::default();
    references.visit_program(program);
    // `export { imported as alias }` carries a value even though its local
    // name is not represented as an IdentifierReference in the AST.
    for entry in &module.local_export_entries {
        if !entry.is_type {
            if let Some(local) = entry.local_name.name() {
                references.names.insert(local.to_string());
            }
        }
    }
    let has_stylex_import = module.import_entries.iter().any(|entry| {
        !entry.is_type && entry.module_request.name.as_str() == STYLEX_MODULE
    });
    let mut value_imports = module
        .import_entries
        .iter()
        .filter(|entry| {
            !entry.is_type
                && entry.module_request.name.as_str() != STYLEX_MODULE
                && references.names.contains(entry.local_name.name.as_str())
        })
        .map(|entry| entry.module_request.name.to_string())
        .collect::<Vec<_>>();
    value_imports.sort();
    value_imports.dedup();
    ModuleContextSummary { parse_complete, has_stylex_import, value_imports }
}

#[cfg(test)]
mod tests {
    use crate::summarize_stylex_module;

    #[test]
    fn keeps_expression_imports_but_not_intrinsics_unused_or_jsx_only_bindings() {
        let summary = summarize_stylex_module(
            r#"
            import * as sx from '@stylexjs/stylex'
            import { View } from '@hozo/core'
            import * as UI from 'components'
            import { styles as card, other } from './styles'
            import tokens from './tokens'
            import { unused } from './unused'
            import type { Shape } from './types'
            import './side-effects'
            const alias = card.root
            const defs = sx.create({ root: { color: tokens.accent } })
            export const App = () => <View><UI.Box {...sx.props(alias, other.active, defs.root)} /></View>
            "#,
        );
        let context = summary.context.unwrap();
        assert!(context.parse_complete);
        assert!(context.has_stylex_import);
        assert_eq!(context.value_imports, ["./styles", "./tokens"]);
        // Reference classification must not prune the existing graph inventory.
        assert!(summary.imports.contains(&"@hozo/core".to_string()));
        assert!(summary.imports.contains(&"./unused".to_string()));
    }

    #[test]
    fn conservatively_keeps_closures_mutation_unrelated_values_and_shadowed_names() {
        let context = summarize_stylex_module(
            r#"
            import sx from '@stylexjs/stylex'
            import { styles } from './sheet'
            import value from './mutable'
            import log from './logger'
            import shadowed from './shadowed'
            function select() { return styles.root }
            let chosen; chosen = value
            log('not a StyleX input')
            function local(shadowed) { return shadowed }
            export const App = () => <div {...sx.props(select(), chosen)} />
            "#,
        ).context.unwrap();
        assert_eq!(context.value_imports, ["./logger", "./mutable", "./shadowed", "./sheet"]);
    }

    #[test]
    fn exported_imports_are_values_but_type_only_imports_are_not() {
        let context = summarize_stylex_module(
            r#"
            import { styles } from './sheet'
            import type { Token } from './types'
            export { styles as card }
            export type { Token }
            "#,
        ).context.unwrap();
        assert!(!context.has_stylex_import);
        assert_eq!(context.value_imports, ["./sheet"]);
    }

    #[test]
    fn comments_strings_and_property_names_do_not_create_value_references() {
        let context = summarize_stylex_module(
            r#"
            import sx from '@stylexjs/stylex'
            import { unused } from './unused'
            // unused in a comment
            const words = 'unused'
            const obj = { unused: 1 }
            export const styles = sx.create({ root: { opacity: obj.unused } })
            "#,
        ).context.unwrap();
        assert!(context.parse_complete);
        assert!(context.value_imports.is_empty());
    }

    #[test]
    fn parse_recovery_cannot_certify_an_empty_context() {
        let context = summarize_stylex_module("import sx from '@stylexjs/stylex'; const broken = (")
            .context.unwrap();
        assert!(!context.parse_complete);
    }

    #[test]
    fn using_a_tag_binding_in_an_attribute_is_still_a_value_reference() {
        let context = summarize_stylex_module(
            r#"
            import sx from '@stylexjs/stylex'
            import { View } from '@hozo/core'
            import * as UI from './ui'
            export const App = () => <View render={View}><UI.Box value={UI.token} /></View>
            "#,
        ).context.unwrap();
        assert_eq!(context.value_imports, ["./ui", "@hozo/core"]);
    }
}
