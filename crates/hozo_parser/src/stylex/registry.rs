//! What one module's exported StyleX bindings contribute across files, and the
//! registry that resolves them for a consumer.

use std::collections::{HashMap, HashSet};

use oxc_syntax::module_record::{ImportImportName, ModuleRecord};

use super::{Frontend, ModuleContextSummary, Rule};

/// The project-wide fact one exported StyleX binding contributes.
///
/// Deliberately owns names rather than AST nodes. A bundler can cache this
/// after the parser allocator is gone, then key the next slice's parsed-rule
/// cache by the defining source's content hash without retaining a source
/// tree per consumer.
#[derive(Debug, Clone, Eq, PartialEq)]
pub struct ModuleExportSummary {
    pub exported: String,
    pub local: String,
    pub kind: ModuleExportKind,
    pub members: Vec<ModuleMemberSummary>,
}

#[derive(Debug, Clone, Copy, Eq, PartialEq)]
pub enum ModuleExportKind {
    Sheet,
    Variables,
}

#[derive(Debug, Clone, Eq, PartialEq)]
pub struct ModuleMemberSummary {
    pub name: String,
    pub status: ModuleMemberStatus,
}

#[derive(Debug, Clone, Copy, Eq, PartialEq)]
pub enum ModuleMemberStatus {
    /// Fully represented by Hozo's typed Style IR.
    Static,
    /// Has both typed declarations and declarations the official transform owns.
    Partial,
    /// A one-argument static function style.
    Function,
    /// The definition was recognised, but cannot be lowered safely.
    Unsupported,
}

#[derive(Debug, Clone, Default, Eq, PartialEq)]
pub struct ModuleSummary {
    pub exports: Vec<ModuleExportSummary>,
    pub reexports: Vec<ModuleReexportSummary>,
    pub imports: Vec<String>,
    /// Absent for internal export-only scans; absence is not a complete analysis.
    pub context: Option<ModuleContextSummary>,
}

#[derive(Debug, Clone, Eq, PartialEq)]
pub struct ModuleReexportSummary {
    pub specifier: String,
    /// Export name in the target module, or `*` for star/namespace exports.
    pub imported: String,
    /// Name exposed by this module, or `*` only for a plain `export *`.
    pub exported: String,
}

/// One imported StyleX binding resolved by the bundler's project graph.
#[derive(Debug, Clone, Eq, PartialEq)]
pub struct ExternalBinding {
    pub specifier: String,
    pub module_id: String,
}

pub struct ModuleSource {
    pub id: String,
    pub content_hash: String,
    pub source: String,
    pub source_file: Option<String>,
    pub links: Vec<ExternalBinding>,
}

#[derive(Clone)]
pub(super) struct RegisteredReexport {
    module_id: String,
    imported: String,
    exported: String,
}

pub(super) struct RegisteredModule {
    content_hash: String,
    source_file: Option<String>,
    links: Vec<ExternalBinding>,
    own_sheets: HashMap<String, HashMap<String, Rule>>,
    sheets: HashMap<String, HashMap<String, Rule>>,
    reexports: Vec<RegisteredReexport>,
}

/// Parsed exported sheets shared by every compilation in one project.
///
/// The bundler remains responsible for filesystem resolution. This layer
/// owns the expensive source parse and the typed rules, keyed by the source
/// hash already maintained by the project scan.
#[derive(Default)]
pub struct ModuleRegistry {
    modules: HashMap<String, RegisteredModule>,
}

impl ModuleRegistry {
    pub fn replace(&mut self, modules: &[ModuleSource]) {
        let retained = modules
            .iter()
            .map(|module| module.id.clone())
            .collect::<HashSet<_>>();
        self.modules.retain(|id, _| retained.contains(id));
        for module in modules {
            if self.modules.get(&module.id).is_some_and(|registered| {
                registered.content_hash == module.content_hash
                    && registered.links == module.links
                    && registered.source_file == module.source_file
            }) {
                continue;
            }
            let allocator = oxc_allocator::Allocator::default();
            let source_type = crate::source_type_for_file(module.source_file.as_deref());
            let parsed = oxc_parser::Parser::new(&allocator, &module.source, source_type).parse();
            let frontend = Frontend::collect(&parsed.program, &parsed.module_record);
            let own_sheets = frontend.exported_static_sheets(&parsed.module_record);
            let reexports = frontend
                .module_summary(&parsed.program, &parsed.module_record)
                .reexports
                .into_iter()
                .filter_map(|reexport| {
                    let module_id = module
                        .links
                        .iter()
                        .find(|link| link.specifier == reexport.specifier)?
                        .module_id
                        .clone();
                    Some(RegisteredReexport {
                        module_id,
                        imported: reexport.imported,
                        exported: reexport.exported,
                    })
                })
                .collect();
            self.modules.insert(
                module.id.clone(),
                RegisteredModule {
                    content_hash: module.content_hash.clone(),
                    source_file: module.source_file.clone(),
                    links: module.links.clone(),
                    sheets: own_sheets.clone(),
                    own_sheets,
                    reexports,
                },
            );
        }
        self.resolve_reexports();
    }

    fn resolve_reexports(&mut self) {
        // One pass can move a sheet across one edge. Repeating once per
        // module settles every acyclic chain; cycles remain bounded and
        // contribute only facts that enter them from a real definition.
        for _ in 0..self.modules.len() {
            let previous = self
                .modules
                .iter()
                .map(|(id, module)| (id.clone(), module.sheets.clone()))
                .collect::<HashMap<_, _>>();
            for module in self.modules.values_mut() {
                let mut sheets = module.own_sheets.clone();
                // Stars are the weakest edge: a local or explicit export
                // with the same name wins regardless of traversal order.
                // Two stars supplying the same name are ambiguous in ESM;
                // decline them instead of picking whichever HashMap entry
                // happened to be visited first.
                let mut star_sheets: HashMap<String, (String, HashMap<String, Rule>)> =
                    HashMap::new();
                let mut ambiguous = HashSet::new();
                for reexport in module
                    .reexports
                    .iter()
                    .filter(|edge| edge.imported == "*" && edge.exported == "*")
                {
                    let Some(target) = previous.get(&reexport.module_id) else {
                        continue;
                    };
                    for (name, rules) in target {
                        if name == "default" || sheets.contains_key(name) {
                            continue;
                        }
                        if let Some((first_module, _)) = star_sheets.get(name) {
                            if first_module != &reexport.module_id {
                                ambiguous.insert(name.clone());
                            }
                        } else {
                            star_sheets
                                .insert(name.clone(), (reexport.module_id.clone(), rules.clone()));
                        }
                    }
                }
                for (name, (_, rules)) in star_sheets {
                    if !ambiguous.contains(&name) {
                        sheets.insert(name, rules);
                    }
                }
                for reexport in module
                    .reexports
                    .iter()
                    .filter(|edge| edge.imported == "*" && edge.exported != "*")
                {
                    let Some(target) = previous.get(&reexport.module_id) else {
                        continue;
                    };
                    for (name, rules) in target {
                        sheets.insert(format!("{}.{}", reexport.exported, name), rules.clone());
                    }
                }
                for reexport in module.reexports.iter().filter(|edge| edge.imported != "*") {
                    let Some(target) = previous.get(&reexport.module_id) else {
                        continue;
                    };
                    if let Some(rules) = target.get(&reexport.imported) {
                        sheets.insert(reexport.exported.clone(), rules.clone());
                        continue;
                    }
                    let prefix = format!("{}.", reexport.imported);
                    for (name, rules) in target.iter().filter(|(name, _)| name.starts_with(&prefix))
                    {
                        sheets.insert(
                            format!("{}.{}", reexport.exported, &name[prefix.len()..]),
                            rules.clone(),
                        );
                    }
                }
                module.sheets = sheets;
            }
        }
    }

    pub(crate) fn attach(
        &self,
        frontend: &mut Frontend,
        module_record: &ModuleRecord,
        bindings: &[ExternalBinding],
    ) {
        for binding in bindings {
            let Some(module) = self.modules.get(&binding.module_id) else {
                continue;
            };
            for entry in module_record.import_entries.iter().filter(|entry| {
                !entry.is_type && entry.module_request.name.as_str() == binding.specifier
            }) {
                if matches!(entry.import_name, ImportImportName::NamespaceObject) {
                    for (exported, rules) in &module.sheets {
                        frontend.sheets.insert(
                            format!("{}.{}", entry.local_name.name, exported),
                            rules.clone(),
                        );
                    }
                    continue;
                }
                let imported = match &entry.import_name {
                    ImportImportName::Name(name) => name.name.as_str(),
                    ImportImportName::Default(_) => "default",
                    ImportImportName::NamespaceObject => unreachable!(),
                };
                let Some(rules) = module.sheets.get(imported) else {
                    let prefix = format!("{imported}.");
                    for (exported, rules) in module
                        .sheets
                        .iter()
                        .filter(|(exported, _)| exported.starts_with(&prefix))
                    {
                        frontend.sheets.insert(
                            format!("{}.{}", entry.local_name.name, &exported[prefix.len()..]),
                            rules.clone(),
                        );
                    }
                    continue;
                };
                frontend
                    .sheets
                    .insert(entry.local_name.name.to_string(), rules.clone());
            }
        }
    }
}
