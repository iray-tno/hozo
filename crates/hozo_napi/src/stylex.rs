//! Summaries of a StyleX module's exports, for resolving them across files.

use napi_derive::napi;

#[napi(object)]
pub struct StylexModuleMemberSummary {
    pub name: String,
    /// `static`, `partial`, `function`, or `unsupported`.
    pub status: String,
}

#[napi(object)]
pub struct StylexModuleExportSummary {
    pub exported: String,
    pub local: String,
    /// `sheet` or `variables`.
    pub kind: String,
    pub members: Vec<StylexModuleMemberSummary>,
}

#[napi(object)]
pub struct StylexModuleSummary {
    pub exports: Vec<StylexModuleExportSummary>,
    pub reexports: Vec<StylexModuleReexportSummary>,
    pub imports: Vec<String>,
    pub context: Option<StylexModuleContextSummary>,
}

#[napi(object)]
pub struct StylexModuleContextSummary {
    pub parse_complete: bool,
    pub has_stylex_import: bool,
    pub value_imports: Vec<String>,
}

#[napi(object)]
pub struct StylexModuleReexportSummary {
    pub specifier: String,
    pub imported: String,
    pub exported: String,
}

#[napi(object)]
pub struct StylexModuleSource {
    pub id: String,
    pub content_hash: String,
    pub source: String,
    pub source_file: Option<String>,
    pub links: Vec<StylexExternalBinding>,
}

#[napi(object)]
pub struct StylexExternalBinding {
    pub specifier: String,
    pub module_id: String,
}

pub(super) fn external_bindings(
    bindings: Option<Vec<StylexExternalBinding>>,
) -> Vec<hozo_parser::StylexExternalBinding> {
    bindings
        .unwrap_or_default()
        .into_iter()
        .map(|binding| hozo_parser::StylexExternalBinding {
            specifier: binding.specifier,
            module_id: binding.module_id,
        })
        .collect()
}

/// Cacheable exported StyleX facts from one source module.
///
/// Analysis is separate from lowering so every bundler can build the same
/// project graph once. The summary contains no AST-backed data and is safe
/// to persist between processes.
#[napi]
pub fn summarize_stylex_module(source: String, source_file: Option<String>) -> StylexModuleSummary {
    let summary = hozo_parser::summarize_stylex_module_for_file(&source, source_file.as_deref());
    StylexModuleSummary {
        exports: summary
            .exports
            .into_iter()
            .map(|export| StylexModuleExportSummary {
                exported: export.exported,
                local: export.local,
                kind: match export.kind {
                    hozo_parser::StylexModuleExportKind::Sheet => "sheet",
                    hozo_parser::StylexModuleExportKind::Variables => "variables",
                }
                .to_string(),
                members: export
                    .members
                    .into_iter()
                    .map(|member| StylexModuleMemberSummary {
                        name: member.name,
                        status: match member.status {
                            hozo_parser::StylexModuleMemberStatus::Static => "static",
                            hozo_parser::StylexModuleMemberStatus::Partial => "partial",
                            hozo_parser::StylexModuleMemberStatus::Function => "function",
                            hozo_parser::StylexModuleMemberStatus::Unsupported => "unsupported",
                        }
                        .to_string(),
                    })
                    .collect(),
            })
            .collect(),
        reexports: summary
            .reexports
            .into_iter()
            .map(|reexport| StylexModuleReexportSummary {
                specifier: reexport.specifier,
                imported: reexport.imported,
                exported: reexport.exported,
            })
            .collect(),
        imports: summary.imports,
        context: summary.context.map(|context| StylexModuleContextSummary {
            parse_complete: context.parse_complete,
            has_stylex_import: context.has_stylex_import,
            value_imports: context.value_imports,
        }),
    }
}
