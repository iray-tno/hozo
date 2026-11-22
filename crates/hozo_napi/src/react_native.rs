//! What a module imports and uses from React Native.

use hozo_ir::Utf16Offsets;
use napi_derive::napi;

use super::diagnostics::CompileDiagnostic;

#[napi(object)]
pub struct SourceImport {
    pub source: String,
    pub imported: String,
    pub local: String,
}

#[napi(object)]
pub struct ReactNativeReference {
    pub kind: String,
    pub access: String,
    pub member: Option<String>,
    pub span_start: u32,
    pub span_end: u32,
}

#[napi(object)]
pub struct ReactNativeBindingUsage {
    pub imported: String,
    pub local: Option<String>,
    pub exported: Option<String>,
    pub kind: String,
    pub type_only: bool,
    pub span_start: u32,
    pub span_end: u32,
    pub references: Vec<ReactNativeReference>,
}

#[napi(object)]
pub struct ReactNativeUsage {
    pub diagnostics: Vec<CompileDiagnostic>,
    pub bindings: Vec<ReactNativeBindingUsage>,
}

#[napi(object)]
pub struct ReactNativeImportSpecifier {
    pub imported: String,
    pub local: String,
    pub kind: String,
    pub type_only: bool,
    pub span_start: u32,
    pub span_end: u32,
}

#[napi(object)]
pub struct ReactNativeImportDeclaration {
    pub span_start: u32,
    pub span_end: u32,
    pub source_start: u32,
    pub source_end: u32,
    pub has_attributes: bool,
    pub specifiers: Vec<ReactNativeImportSpecifier>,
    pub comments: Vec<ImportComment>,
}

#[napi(object)]
pub struct ImportComment {
    pub span_start: u32,
    pub span_end: u32,
}

#[napi(object)]
pub struct ReactNativeImports {
    pub diagnostics: Vec<CompileDiagnostic>,
    pub declarations: Vec<ReactNativeImportDeclaration>,
}

/// The same parsed declarations drive rewriting and its decision journal.
#[napi]
pub fn react_native_imports(source: String, source_file: Option<String>) -> ReactNativeImports {
    let parsed = hozo_parser::react_native_imports(&source, source_file.as_deref());
    let offsets = Utf16Offsets::new(&source);
    ReactNativeImports {
        diagnostics: parsed
            .diagnostics
            .into_iter()
            .map(|error| CompileDiagnostic {
                code: "RN_IMPORT_PARSE_FAILED".into(),
                severity: "error".into(),
                message: error.message,
                span_start: offsets.at(error.span.start),
                span_end: offsets.at(error.span.end),
            })
            .collect(),
        declarations: parsed
            .declarations
            .into_iter()
            .map(|declaration| ReactNativeImportDeclaration {
                span_start: offsets.at(declaration.span.start),
                span_end: offsets.at(declaration.span.end),
                source_start: offsets.at(declaration.source_span.start),
                source_end: offsets.at(declaration.source_span.end),
                has_attributes: declaration.has_attributes,
                specifiers: declaration
                    .specifiers
                    .into_iter()
                    .map(|specifier| ReactNativeImportSpecifier {
                        imported: specifier.imported,
                        local: specifier.local,
                        kind: specifier.kind,
                        type_only: specifier.type_only,
                        span_start: offsets.at(specifier.span.start),
                        span_end: offsets.at(specifier.span.end),
                    })
                    .collect(),
                comments: declaration
                    .comments
                    .into_iter()
                    .map(|span| ImportComment {
                        span_start: offsets.at(span.start),
                        span_end: offsets.at(span.end),
                    })
                    .collect(),
            })
            .collect(),
    }
}

/// Explicit analysis API: do not add a scope-building pass to ordinary builds.
#[napi]
pub fn analyze_react_native_usage(source: String, source_file: Option<String>) -> ReactNativeUsage {
    let usage = hozo_parser::analyze_react_native_usage(&source, source_file.as_deref());
    let offsets = Utf16Offsets::new(&source);
    ReactNativeUsage {
        diagnostics: usage
            .diagnostics
            .into_iter()
            .map(|error| CompileDiagnostic {
                code: "RN_USAGE_ANALYSIS_FAILED".into(),
                severity: "error".into(),
                message: error.message,
                span_start: offsets.at(error.span.start),
                span_end: offsets.at(error.span.end),
            })
            .collect(),
        bindings: usage
            .bindings
            .into_iter()
            .map(|binding| ReactNativeBindingUsage {
                imported: binding.imported,
                local: binding.local,
                exported: binding.exported,
                kind: binding.kind,
                type_only: binding.type_only,
                span_start: offsets.at(binding.span.start),
                span_end: offsets.at(binding.span.end),
                references: binding
                    .references
                    .into_iter()
                    .map(|reference| ReactNativeReference {
                        kind: reference.kind,
                        access: reference.access,
                        member: reference.member,
                        span_start: offsets.at(reference.span.start),
                        span_end: offsets.at(reference.span.end),
                    })
                    .collect(),
            })
            .collect(),
    }
}
