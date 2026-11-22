//! Diagnostics as JS sees them, with UTF-16 spans.

use hozo_ir::{Diagnostic, Utf16Offsets};
use napi_derive::napi;

#[napi(object)]
pub struct CompileDiagnostic {
    pub code: String,
    pub severity: String,
    pub message: String,
    pub span_start: u32,
    pub span_end: u32,
}

pub(super) fn to_js_diagnostic(
    diagnostic: Diagnostic,
    offsets: &Utf16Offsets,
) -> CompileDiagnostic {
    CompileDiagnostic {
        code: diagnostic.code.as_str().to_string(),
        severity: diagnostic.severity.as_str().to_string(),
        message: diagnostic.message,
        span_start: offsets.at(diagnostic.span.start),
        span_end: offsets.at(diagnostic.span.end),
    }
}

/// Parser diagnostics are file-level (they're about the source as written,
/// not about any one lowering), but this binding reports per-component --
/// so each is attributed to whichever root's span contains it.
pub(super) fn parser_diagnostics_for(
    parsed: &hozo_parser::ParseOutput,
    root: &hozo_ir::Node,
    offsets: &Utf16Offsets,
) -> Vec<CompileDiagnostic> {
    // Filtered on the *byte* spans, which is what both sides of the
    // comparison are, and translated only on the way out.
    parsed
        .diagnostics
        .iter()
        .filter(|d| d.span.start >= root.span.start && d.span.end <= root.span.end)
        .cloned()
        .map(|d| to_js_diagnostic(d, offsets))
        .collect()
}
