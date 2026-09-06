//! WebAssembly binding exposing the Hozo compiler to a browser.
//!
//! The second binding, beside `hozo_napi`. They answer the same question
//! for different callers: napi-rs for the build tools that run in Node,
//! this for a page where somebody types TSX and wants to see what it
//! becomes without installing a Rust toolchain first.
//!
//! What is deliberately *not* here is a second copy of anything the other
//! binding decided. The diagnostic codes and the UTF-16 offset table live
//! in `hozo_ir` because two bindings needed them, and a code that reached
//! a build tool as `A11Y_INTERACTIVE_WITHOUT_ROLE` and a browser as
//! something else would be two names for one rule.
//!
//! The theme is the default one. A project's theme is 288 colours and a
//! spacing scale read from its configuration, and a page has no project
//! -- so this compiles against what Hozo ships with, and says so, rather
//! than accepting a theme it would have no way to validate.

use hozo_ir::{Theme, Utf16Offsets};
use serde::Serialize;
use wasm_bindgen::prelude::wasm_bindgen;

#[derive(Serialize)]
struct Diagnostic {
    code: String,
    severity: String,
    message: String,
    /// UTF-16, because that is what a JavaScript string is indexed by and
    /// an editor's selection is measured in.
    span_start: u32,
    span_end: u32,
}

#[derive(Serialize)]
struct WebComponent {
    jsx: String,
    css: String,
    runtime_imports: Vec<&'static str>,
    diagnostics: Vec<Diagnostic>,
}

#[derive(Serialize)]
struct NativeComponent {
    jsx: String,
    styles: String,
    prelude: Vec<String>,
    runtime_imports: Vec<&'static str>,
    native_imports: Vec<&'static str>,
    diagnostics: Vec<Diagnostic>,
}

fn diagnostics(
    source: &[hozo_ir::Diagnostic],
    offsets: &Utf16Offsets,
) -> Vec<Diagnostic> {
    source
        .iter()
        .map(|diagnostic| Diagnostic {
            code: diagnostic.code.as_str().to_string(),
            severity: diagnostic.severity.as_str().to_string(),
            message: diagnostic.message.clone(),
            span_start: offsets.at(diagnostic.span.start),
            span_end: offsets.at(diagnostic.span.end),
        })
        .collect()
}

/// Every top-level JSX element in `source`, lowered for the Web.
///
/// JSON rather than a structured return: a page parses it in one call,
/// and the alternative is `serde-wasm-bindgen` and a shape that has to be
/// declared twice. The size of this module is the thing being spent
/// carefully -- see the profile in `Cargo.toml`.
#[wasm_bindgen(js_name = compileWeb)]
pub fn compile_web(source: &str) -> String {
    let parsed = hozo_parser::parse_tsx(source);
    let offsets = Utf16Offsets::new(source);
    let theme = Theme::default();
    let components: Vec<WebComponent> = parsed
        .roots
        .iter()
        .map(|root| {
            let output = hozo_web::lower(&root.node, source, &theme);
            WebComponent {
                jsx: output.jsx,
                css: output.css,
                runtime_imports: output.runtime_imports,
                diagnostics: diagnostics(&output.diagnostics, &offsets),
            }
        })
        .collect();
    serde_json::to_string(&components).unwrap_or_else(|_| "[]".to_string())
}

/// The same source, lowered for React Native.
#[wasm_bindgen(js_name = compileNative)]
pub fn compile_native(source: &str) -> String {
    let parsed = hozo_parser::parse_tsx(source);
    let offsets = Utf16Offsets::new(source);
    let theme = Theme::default();
    let components: Vec<NativeComponent> = parsed
        .roots
        .iter()
        .map(|root| {
            let output = hozo_native::lower(&root.node, source, &theme);
            NativeComponent {
                jsx: output.jsx,
                styles: output.styles,
                prelude: output.prelude,
                runtime_imports: output.runtime_imports,
                native_imports: output.native_imports,
                diagnostics: diagnostics(&output.diagnostics, &offsets),
            }
        })
        .collect();
    serde_json::to_string(&components).unwrap_or_else(|_| "[]".to_string())
}
