//! The shape of a config file, read without running it.

use hozo_ir::Utf16Offsets;
use napi_derive::napi;

use super::diagnostics::CompileDiagnostic;

#[napi(object)]
pub struct ConfigImport {
    pub source: String,
    pub kind: String,
    pub span_start: u32,
    pub span_end: u32,
    pub locals: Vec<String>,
}

#[napi(object)]
pub struct ConfigNode {
    pub kind: String,
    pub span_start: u32,
    pub span_end: u32,
    /// The index of the enclosing node; -1 for a root.
    pub parent: i32,
    pub key: Option<String>,
    /// In an object: where the whole property starts, key included.
    pub property_start: Option<u32>,
    pub name: Option<String>,
}

#[napi(object)]
pub struct ConfigBinding {
    pub name: String,
    pub node: u32,
}

#[napi(object)]
pub struct ConfigShape {
    pub diagnostics: Vec<CompileDiagnostic>,
    pub imports: Vec<ConfigImport>,
    pub export_kind: Option<String>,
    pub export_start: Option<u32>,
    pub export_end: Option<u32>,
    pub export_node: Option<u32>,
    pub bindings: Vec<ConfigBinding>,
    pub nodes: Vec<ConfigNode>,
}

/// A bundler config's imports, export and the nodes inside it, for
/// `hozo init`'s span edits (RFC 013 §4). Offsets are UTF-16, as JS slices.
#[napi]
pub fn config_shape(source: String, source_file: Option<String>) -> ConfigShape {
    let shape = hozo_parser::config_shape(&source, source_file.as_deref());
    let offsets = Utf16Offsets::new(&source);
    ConfigShape {
        diagnostics: shape
            .diagnostics
            .into_iter()
            .map(|error| CompileDiagnostic {
                code: "CONFIG_PARSE_FAILED".into(),
                severity: "error".into(),
                message: error.message,
                span_start: offsets.at(error.span.start),
                span_end: offsets.at(error.span.end),
            })
            .collect(),
        imports: shape
            .imports
            .into_iter()
            .map(|import| ConfigImport {
                source: import.source,
                kind: import.kind.into(),
                span_start: offsets.at(import.span.start),
                span_end: offsets.at(import.span.end),
                locals: import.locals,
            })
            .collect(),
        export_kind: shape.export_kind.map(Into::into),
        export_start: shape.export_span.map(|span| offsets.at(span.start)),
        export_end: shape.export_span.map(|span| offsets.at(span.end)),
        export_node: shape.export_node.map(|node| node as u32),
        bindings: shape
            .bindings
            .into_iter()
            .map(|binding| ConfigBinding {
                name: binding.name,
                node: binding.node as u32,
            })
            .collect(),
        nodes: shape
            .nodes
            .into_iter()
            .map(|node| ConfigNode {
                kind: node.kind.into(),
                span_start: offsets.at(node.span.start),
                span_end: offsets.at(node.span.end),
                parent: node.parent.map_or(-1, |parent| parent as i32),
                key: node.key,
                property_start: node.property_start.map(|start| offsets.at(start)),
                name: node.name,
            })
            .collect(),
    }
}
