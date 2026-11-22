//! Static StyleX frontend.
//!
//! This reads one useful vertical slice rather than impersonating the full
//! StyleX compiler: project-registered and same-file `stylex.create({ ... })`,
//! local unthemeable `stylex.defineVars`, statically called function styles,
//! and `stylex.props(styles.base, condition && styles.active)`. Values become the
//! typed `StyleProperty` variants the Tailwind frontend already produces, so
//! the Web and Native lowerings remain shared.

use std::collections::{HashMap, HashSet};

use hozo_ir::{Condition, ExprRef, SourceSpan, StyleDeclaration, StyleProperty, StylexResidual};

use static_value::{StaticValue, StaticVariables};

mod border_image;
mod collect;
mod conditions;
mod context;
mod css_tokens;
mod direct;
mod filters;
mod frontend;
mod grid;
mod keywords;
mod mask;
mod offset;
mod overlap;
mod priority;
mod registry;
mod rule;
mod rule_object;
mod shorthands;
mod speech;
mod static_value;
mod statics;
mod tailwind_token;
mod text;
mod timeline;
mod transform;
mod values;
mod web_functions;
mod web_grammar;
mod web_grid;
mod web_keywords;
mod web_length;
mod web_only;
mod web_specs;
mod web_values;

pub(crate) use context::summarize as context_summary;
pub use context::ModuleContextSummary;
pub use registry::{
    ExternalBinding, ModuleExportKind, ModuleExportSummary, ModuleMemberStatus,
    ModuleMemberSummary, ModuleReexportSummary, ModuleRegistry, ModuleSource, ModuleSummary,
};
pub use rule_object::css_declaration;

const STYLEX_MODULE: &str = "@stylexjs/stylex";

#[derive(Debug, Clone)]
pub(crate) struct Gap {
    pub(crate) message: String,
    pub(crate) span: SourceSpan,
}

#[derive(Debug, Clone)]
enum Rule {
    Ready {
        entries: Vec<Entry>,
        residual: Vec<ResidualProperty>,
        gaps: Vec<Gap>,
    },
    Function {
        entries: Vec<FunctionEntry>,
    },
    Gap(Gap),
}

#[derive(Debug, Clone)]
struct FunctionEntry {
    name: String,
    css_name: String,
    priority: u16,
    value: FunctionValue,
    span: SourceSpan,
}

#[derive(Debug, Clone)]
enum FunctionValue {
    Argument,
    Static(StaticValue),
}

#[derive(Debug, Clone)]
struct ResidualProperty {
    css_name: String,
    span: ExprRef,
}

#[derive(Debug, Clone)]
struct Entry {
    css_name: String,
    priority: u16,
    properties: Vec<StyleProperty>,
    condition: Condition,
    span: SourceSpan,
}

struct ResolvedEntry {
    css_name: String,
    priority: u16,
    declaration: StyleDeclaration,
}

#[derive(Default)]
pub(crate) struct Frontend {
    namespaces: HashSet<String>,
    sheets: HashMap<String, HashMap<String, Rule>>,
    variables: StaticVariables,
    /// StyleX definitions are not Tailwind candidate strings. The fallback
    /// scanner is intentionally broad, so it needs these exact ranges to
    /// avoid turning values such as `display: 'flex'` into duplicate CSS.
    pub(crate) scan_spans: Vec<SourceSpan>,
}

pub(crate) enum Resolution {
    NotStylex,
    Ready(Vec<StyleDeclaration>),
    Partial {
        declarations: Vec<StyleDeclaration>,
        residual: StylexResidual,
        gaps: Vec<Gap>,
    },
    Gap {
        message: String,
        span: SourceSpan,
    },
}

#[cfg(test)]
mod tests;
