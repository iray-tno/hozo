//! Static import inventory without invoking either lowering backend.
use super::*;

#[napi(object)]
pub struct StaticModuleImports {
    pub requests: Vec<String>,
    pub bindings: Vec<SourceImport>,
    pub diagnostics: Vec<CompileDiagnostic>,
}

#[napi]
pub fn inspect_static_module_imports(
    source: String,
    source_file: Option<String>,
) -> napi::Result<StaticModuleImports> {
    if source.len() > 4_194_304 {
        return Err(napi::Error::from_reason("MODULE_IMPORT_SOURCE_BUDGET"));
    }
    let result = hozo_parser::inspect_static_module_imports(&source, source_file.as_deref());
    if result.requests.len() > 512 || result.bindings.len() > 2048 {
        return Err(napi::Error::from_reason("MODULE_IMPORT_REQUEST_BUDGET"));
    }
    let offsets = Utf16Offsets::new(&source);
    Ok(StaticModuleImports {
        requests: result.requests,
        bindings: result
            .bindings
            .into_iter()
            .map(|binding| SourceImport {
                source: binding.source,
                imported: binding.imported,
                local: binding.local,
            })
            .collect(),
        diagnostics: result
            .diagnostics
            .into_iter()
            .map(|diagnostic| CompileDiagnostic {
                code: "MODULE_IMPORT_ANALYSIS_FAILED".into(),
                severity: "error".into(),
                message: diagnostic.message,
                span_start: offsets.at(diagnostic.span.start),
                span_end: offsets.at(diagnostic.span.end),
            })
            .collect(),
    })
}
