//! What a component hands its children as text styles, read from its source
//! so another file can use it (#950).
//!
//! React Native does not inherit text styles from a View. Within one file
//! the compiler hands a pressable's `text-*` down to the Text inside it;
//! across files it cannot, because the caller never sees the component's
//! classes. This summary is that missing fact, for one file, computed from
//! that file alone so it can be shipped in a package's manifest and read by
//! a caller's build (see the direction recorded on #656).
//!
//! Only a narrow, common shape is read, and anything else yields no entry,
//! which leaves the caller exactly where it was:
//!
//! ```tsx
//! export function Button({ tone = 'neutral', size = 'md', className, disabled, ...rest }) {
//!   if (tone === 'accent') return <Host {...rest} disabled={disabled} className={cx('…', size === 'sm' ? '…' : '…', className)} />
//!   return <Host {...rest} … />
//! }
//! ```
//!
//! Exported `const` arrows, with either the same block or a concise JSX
//! body, use the same reader. React's imported `memo` and `forwardRef` may
//! wrap an inline render function without changing that contract. Mutable
//! bindings, unknown wrappers and indirect renderers are not unwrapped.
//!
//! The classes are recorded as written, not as styles. The caller resolves
//! them against its own theme, so `text-hozo-on-accent` means what the
//! application's theme says it means.

use std::collections::BTreeMap;

use oxc_allocator::Allocator;
use oxc_ast::ast::{BindingPattern, Declaration, Statement, VariableDeclarationKind};
use oxc_parser::Parser;
use oxc_span::SourceType;
use oxc_syntax::module_record::{ExportExportName, ExportImportName};

use classes::{read_constants, Scope};
use component::{read_component, read_initializer};
use params::{read_params, Params};

mod apply;
mod branches;
mod classes;
mod component;
mod params;

pub use apply::{apply_text_forwarding, ForwardingTable};

/// The `cx`-shaped helpers whose arguments are read one by one, as
/// `dynamic_class` reads them. Not `tailwind-merge`, for the reason given
/// there.

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct TextForwardingSummary {
    /// One entry per exported component whose shape was read.
    pub components: Vec<ForwardingComponent>,
    /// `export { A as B } from './x'`, so a package's entry can be followed
    /// to the file that defines each component.
    pub reexports: Vec<ForwardingReexport>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ForwardingComponent {
    /// The exported name, not the local one.
    pub name: String,
    /// The props the classes depend on, each with every value it is
    /// compared against.
    pub props: Vec<ForwardingProp>,
    /// The host's classes for every combination of `props`.
    pub variants: Vec<ForwardingVariant>,
    /// The component prop the host's `disabled` comes from, so a caller's
    /// `disabled={off}` can drive the `disabled:` classes it hands down.
    pub disabled_prop: Option<String>,
    /// Whether the host shares its pressed, hovered and focused state with
    /// a Text inside it, so a caller's Text can take the `hover:`,
    /// `active:` and `focus-visible:` classes it hands down. True for a
    /// pressable primitive: whenever its classes carry such a variant it is
    /// compiled to `HozoPressable`, which provides that state.
    pub host_states: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ForwardingProp {
    pub name: String,
    pub default: Option<String>,
    pub values: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ForwardingVariant {
    /// One value per prop in `props`, in the same order.
    pub when: Vec<String>,
    pub classes: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ForwardingReexport {
    pub specifier: String,
    pub imported: String,
    pub exported: String,
}

pub fn summarize_text_forwarding(source: &str) -> TextForwardingSummary {
    let allocator = Allocator::default();
    let source_type = SourceType::from_extension("tsx").expect("\"tsx\" is a known extension");
    let ret = Parser::new(&allocator, source, source_type).parse();
    if !ret.diagnostics.is_empty() {
        return TextForwardingSummary::default();
    }
    let module = &ret.module_record;
    let helper_imports = crate::dynamic_class::helper_import_offsets(module, &[]);
    let helper_refs = if helper_imports.is_empty() {
        Default::default()
    } else {
        crate::rest::analyze_with_imports(&ret.program, &helper_imports).imports
    };
    let import_refs = &helper_refs;

    let mut exported_as: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for entry in &module.local_export_entries {
        if entry.is_type {
            continue;
        }
        let (Some(local), ExportExportName::Name(name)) =
            (entry.local_name.name(), &entry.export_name)
        else {
            continue;
        };
        exported_as
            .entry(local.to_string())
            .or_default()
            .push(name.name.to_string());
    }

    // Class lists a component names rather than writes (`alertAccent`), read
    // with no props in scope: a module constant cannot depend on one.
    let no_props = Params {
        props: BTreeMap::new(),
        locals: BTreeMap::new(),
        rest: None,
    };
    let mut module_constants = BTreeMap::new();
    for statement in &ret.program.body {
        if let Statement::VariableDeclaration(declaration) = statement {
            let mut found = BTreeMap::new();
            read_constants(
                declaration,
                &Scope {
                    params: &no_props,
                    module,
                    import_refs,
                    constants: &module_constants,
                },
                &mut found,
            );
            module_constants.extend(found);
        }
    }

    let mut components = Vec::new();
    for statement in &ret.program.body {
        let declaration = match statement {
            Statement::ExportDeclaration(export) => Some(&export.declaration),
            other => other.as_declaration(),
        };
        let mut record = |local: &str, shape: ForwardingComponent| {
            for name in &exported_as[local] {
                components.push(ForwardingComponent {
                    name: name.clone(),
                    ..shape.clone()
                });
            }
        };
        match declaration {
            Some(Declaration::FunctionDeclaration(function)) => {
                let (Some(id), Some(body)) = (&function.id, &function.body) else {
                    continue;
                };
                if !exported_as.contains_key(id.name.as_str()) {
                    continue;
                }
                let Some(params) = read_params(&function.params) else {
                    continue;
                };
                if let Some(shape) = read_component(
                    &params,
                    &body.statements,
                    module,
                    import_refs,
                    &module_constants,
                ) {
                    record(id.name.as_str(), shape);
                }
            }
            Some(Declaration::VariableDeclaration(declaration))
                if declaration.kind == VariableDeclarationKind::Const =>
            {
                for binding in &declaration.declarations {
                    let BindingPattern::BindingIdentifier(id) = &binding.id else {
                        continue;
                    };
                    if !exported_as.contains_key(id.name.as_str()) {
                        continue;
                    }
                    let Some(init) = &binding.init else {
                        continue;
                    };
                    if let Some(shape) =
                        read_initializer(init, module, import_refs, &module_constants, None, 0)
                    {
                        record(id.name.as_str(), shape);
                    }
                }
            }
            _ => {}
        }
    }
    components.sort_by(|a, b| a.name.cmp(&b.name));

    let mut reexports: Vec<ForwardingReexport> = module
        .indirect_export_entries
        .iter()
        .filter(|entry| !entry.is_type)
        .filter_map(|entry| {
            let specifier = entry.module_request.as_ref()?.name.to_string();
            let ExportImportName::Name(imported) = &entry.import_name else {
                return None;
            };
            let ExportExportName::Name(exported) = &entry.export_name else {
                return None;
            };
            Some(ForwardingReexport {
                specifier,
                imported: imported.name.to_string(),
                exported: exported.name.to_string(),
            })
        })
        .collect();
    reexports.sort_by(|a, b| a.exported.cmp(&b.exported));

    TextForwardingSummary {
        components,
        reexports,
    }
}

#[cfg(test)]
mod tests;
