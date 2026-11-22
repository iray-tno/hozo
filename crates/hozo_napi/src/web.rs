//! Compiling a module for the Web: components, owner classes and the CSS they need.

use hozo_ir::Utf16Offsets;
use napi_derive::napi;

use super::diagnostics::{parser_diagnostics_for, to_js_diagnostic, CompileDiagnostic};
use super::tailwind_order::TailwindCompilePlan;
use super::{prepared_module, tailwind_order};

#[napi(object)]
pub struct CompiledComponent {
    /// RFC010 explicit Web class-only preparation, absent from ordinary output.
    pub owner_class: Option<CompiledOwnerClass>,
    /// Internal RFC 007 evidence from the parse actually lowered. Requires
    /// a prepared context and per-call capture; never application code.
    pub tailwind_plan: Option<TailwindCompilePlan>,
    /// Compiled JSX to splice into the original source in place of the
    /// text at `[span_start, span_end)` -- callers (the Vite plugin) own
    /// the actual splicing, since this binding doesn't touch source text.
    ///
    /// Those two are **UTF-16 code unit** offsets, which is what
    /// `String.prototype.slice` takes. They are byte offsets everywhere
    /// inside Rust and are translated on the way out; see
    /// `Utf16Offsets` for what happens when they are not.
    pub jsx: String,
    pub css: String,
    /// Named imports `jsx` needs from `@hozo/engine`, which the caller
    /// splices at the top of the module. Same contract as the Native
    /// backend's field of this name.
    pub runtime_imports: Vec<String>,
    pub diagnostics: Vec<CompileDiagnostic>,
    pub tag_decisions: Option<Vec<CompiledTagDecision>>,
    pub source_copies: Option<Vec<CompiledSourceCopy>>,
    pub span_start: u32,
    pub span_end: u32,
}

#[napi(object)]
pub struct CompiledOwnerClass {
    pub class_name: String,
    pub css: String,
}

#[napi(object)]
pub struct CompiledTagDecision {
    pub span_start: u32,
    pub span_end: u32,
    pub replacement: Option<String>,
}

#[napi(object)]
pub struct CompiledSourceCopy {
    pub span_start: u32,
    pub span_end: u32,
    pub emitted_start: u32,
    pub emitted_end: u32,
}

/// Parses `source` as TSX and lowers every top-level JSX element found (one
/// per component's returned JSX, see `hozo_parser::parse_tsx`) to Web
/// output. Returns one `CompiledComponent` per root found, in source order.
#[napi]
pub fn compile(source: String) -> Vec<CompiledComponent> {
    // Trusts every module, and every compatibility component with it: this
    // entry point is for tests and one-off inspection, not a project build.
    lower_web(
        &source,
        &hozo_ir::Theme::default(),
        None,
        None,
        WebModuleOptions {
            compat: hozo_parser::ReactNativeCompat::Lower,
            evidence: false,
            owner_class: false,
            tailwind: TailwindPlanOptions::default(),
        },
        &[],
    )
}

pub(super) struct WebModuleOptions<'a> {
    pub(crate) compat: hozo_parser::ReactNativeCompat,
    pub(crate) evidence: bool,
    pub(crate) owner_class: bool,
    pub(crate) tailwind: TailwindPlanOptions<'a>,
}

#[derive(Default)]
pub(super) struct TailwindPlanOptions<'a> {
    pub(crate) context: Option<&'a hozo_ir::TailwindOrderContext>,
    pub(crate) capture: bool,
    pub(crate) ordered: bool,
    pub(crate) authored: bool,
}

impl TailwindPlanOptions<'_> {
    pub(crate) fn apply(
        &self,
        parsed: &mut hozo_parser::ParseOutput,
    ) -> Vec<hozo_parser::TailwindRootPlan> {
        // Without an ordered project context -- the standalone API, WASM, a
        // test, or a pass-through context that only reports -- the module is
        // ordered with descriptors built from the Tailwind facts compiled into
        // Hozo, so Tailwind's order is the default everywhere rather than only
        // where a project's CSS was captured (#1230). A pass-through context
        // still reports its own evidence, over that order, and setting one
        // never changes output.
        if !self.ordered && !self.authored {
            hozo_parser::order_module_tailwind_builtin(parsed);
        }
        self.context
            .map(|context| {
                if self.ordered {
                    hozo_parser::order_module_tailwind(parsed, context);
                    if !self.capture {
                        return Vec::new();
                    }
                }
                let mut plans = hozo_parser::plan_module_tailwind(parsed, context, self.capture);
                if self.ordered {
                    for plan in &mut plans {
                        plan.ordered = true;
                        plan.fingerprint = prepared_module::final_fingerprint(&plan.fingerprint);
                    }
                }
                plans
            })
            .unwrap_or_default()
    }
}

pub(super) fn lower_web(
    source: &str,
    theme: &hozo_ir::Theme,
    sources: Option<&[String]>,
    stylex: Option<(
        &hozo_parser::StylexModuleRegistry,
        &[hozo_parser::StylexExternalBinding],
    )>,
    options: WebModuleOptions<'_>,
    class_helpers: &[hozo_parser::ClassHelper],
) -> Vec<CompiledComponent> {
    let mut parsed = parse_web(source, sources, stylex, options.compat, class_helpers);
    emit_web(source, theme, &mut parsed, options)
}

pub(super) fn parse_web(
    source: &str,
    sources: Option<&[String]>,
    stylex: Option<(
        &hozo_parser::StylexModuleRegistry,
        &[hozo_parser::StylexExternalBinding],
    )>,
    compat: hozo_parser::ReactNativeCompat,
    class_helpers: &[hozo_parser::ClassHelper],
) -> hozo_parser::ParseOutput {
    hozo_parser::parse_tsx_for_web_with_helpers(
        source,
        sources,
        stylex.map(|(registry, _)| registry),
        stylex.map_or(&[][..], |(_, bindings)| bindings),
        compat,
        class_helpers,
    )
}

pub(super) fn emit_web(
    source: &str,
    theme: &hozo_ir::Theme,
    parsed: &mut hozo_parser::ParseOutput,
    options: WebModuleOptions<'_>,
) -> Vec<CompiledComponent> {
    hozo_parser::capture_utility_leading(parsed, theme);
    let mut plans = options.tailwind.apply(parsed).into_iter();
    let evidence = options.evidence;
    let offsets = Utf16Offsets::new(source);
    parsed
        .roots
        .iter()
        .map(|root| {
            let output = if options.owner_class {
                hozo_web::lower_owner_class(&root.node, source, theme, evidence)
            } else {
                hozo_web::lower_with_evidence(&root.node, source, theme, evidence)
            };
            let emitted_offsets = evidence.then(|| Utf16Offsets::new(&output.jsx));
            let mut diagnostics = parser_diagnostics_for(parsed, &root.node, &offsets);
            diagnostics.extend(
                output
                    .diagnostics
                    .into_iter()
                    .map(|d| to_js_diagnostic(d, &offsets)),
            );
            CompiledComponent {
                owner_class: output.owner_class.map(|class| CompiledOwnerClass {
                    class_name: class.class_name,
                    css: class.css,
                }),
                tailwind_plan: plans
                    .next()
                    .map(|plan| tailwind_order::compile_plan(plan, &offsets)),
                jsx: output.jsx,
                css: output.css,
                runtime_imports: output
                    .runtime_imports
                    .into_iter()
                    .map(str::to_string)
                    .collect(),
                diagnostics,
                tag_decisions: output.tag_decisions.map(|decisions| {
                    decisions
                        .into_iter()
                        .map(|decision| CompiledTagDecision {
                            span_start: offsets.at(decision.span.start),
                            span_end: offsets.at(decision.span.end),
                            replacement: decision.replacement,
                        })
                        .collect()
                }),
                source_copies: output.source_copies.map(|copies| {
                    copies
                        .into_iter()
                        .map(|copy| CompiledSourceCopy {
                            span_start: offsets.at(copy.span.start),
                            span_end: offsets.at(copy.span.end),
                            emitted_start: emitted_offsets
                                .as_ref()
                                .unwrap()
                                .at(copy.emitted_start as u32),
                            emitted_end: emitted_offsets
                                .as_ref()
                                .unwrap()
                                .at(copy.emitted_end as u32),
                        })
                        .collect()
                }),
                span_start: offsets.at(root.node.span.start),
                span_end: offsets.at(root.node.span.end),
            }
        })
        .collect()
}
