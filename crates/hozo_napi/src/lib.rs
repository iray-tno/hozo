//! napi-rs bindings exposing the Hozo compiler to Node-based build tooling.
//!
//! First pass: proves the Rust<->JS bridge itself works (the actual
//! foundational bet from the design discussion, untested until now) by
//! exposing the same `hozo_parser::parse_tsx` -> `hozo_web::lower`
//! pipeline already validated in `hozo_web`'s tests/example, as a
//! synchronous Node-callable function. This is not yet the shape
//! `@hozo/vite` will actually want (full rendered HTML rather than
//! source-rewrite instructions) -- that comes once the plugin itself is
//! being wired up and its real requirements are known.

use hozo_ir::{Theme, Utf16Offsets};
use napi_derive::napi;
use std::sync::Arc;
mod owner_slots;
mod static_imports;
mod tailwind_order;
pub use owner_slots::{
    inspect_owner_class_slots, OwnerSlotBinding, OwnerSlotInspection, OwnerSlotSite,
};
pub use static_imports::{inspect_static_module_imports, StaticModuleImports};
mod prepared_module;
pub use prepared_module::{
    prepare_authored_tailwind_context, prepare_builtin_tailwind_context,
    prepare_final_tailwind_context, prepare_tailwind_context, tailwind_classes_native_refusal,
    tailwind_classes_rankable, PreparedNativeModule, PreparedTailwindContext, PreparedWebModule,
    PreparedWebOptions,
};

mod bindings;
mod candidates;
mod canvas;
mod classes;
mod compiler;
mod config;
mod diagnostics;
mod native;
mod native_options;
mod react_native;
mod stylex;
mod text_forwarding;
mod theme;
mod web;

pub use bindings::{foreign_primitives, module_imports, top_level_bindings};
pub use candidates::{scan_tailwind_order_candidates, CandidateCache};
pub use canvas::{compile_canvas_paints, CompiledCanvasPaint};
pub use classes::{
    class_helper_candidates, native_class_report, native_class_verdicts,
    native_classes_drawn_statically, summarize_class_helper_merges, summarize_class_helpers,
    ClassHelper, ClassHelperCandidate, ComponentClassList, NativeClassFinding, NativeClassVerdict,
};
pub use compiler::{Compiler, UnfoldedModule};
pub use config::{config_shape, ConfigBinding, ConfigImport, ConfigNode, ConfigShape};
pub use diagnostics::CompileDiagnostic;
pub use native::{
    compile_native, CompiledNativeComponent, CompiledNativeModule, CompiledOwnerCallback,
    CompiledOwnerStyle,
};
pub use native_options::NativeCompileOptions;
pub use react_native::{
    analyze_react_native_usage, react_native_imports, ImportComment, ReactNativeBindingUsage,
    ReactNativeImportDeclaration, ReactNativeImportSpecifier, ReactNativeImports,
    ReactNativeReference, ReactNativeUsage, SourceImport,
};
pub use stylex::{
    summarize_stylex_module, StylexExternalBinding, StylexModuleContextSummary,
    StylexModuleExportSummary, StylexModuleMemberSummary, StylexModuleReexportSummary,
    StylexModuleSource, StylexModuleSummary,
};
pub use text_forwarding::{
    summarize_text_forwarding, ForwardingComponent, ForwardingProp, ForwardingReexport,
    ForwardingVariant, TextForwardingModule, TextForwardingSummary,
};
pub use theme::{
    JsTheme, JsThemeAnimation, JsThemeColor, JsThemeColorValue, JsThemeFontFamily,
    JsThemeFontWeight, JsThemeKeyframe, JsThemeRadius, JsThemeShadow, JsUtilityLeadingRegister,
    JsWebThemeColor, JsWebThemeVariable,
};
pub use web::{
    compile, CompiledComponent, CompiledOwnerClass, CompiledSourceCopy, CompiledTagDecision,
};

// Read by the older sibling modules through `super::`.
use native::{emit_native_module, parse_native_module, NativeModuleOptions};
use stylex::external_bindings;
use web::{emit_web, parse_web, TailwindPlanOptions, WebModuleOptions};
// Only `prepared_module`'s tests read this through `super::*`.
#[cfg(test)]
use hozo_ir::StyleProperty;

#[cfg(test)]
mod native_candidate_tests;

#[cfg(test)]
mod utf16_tests;
