//! Compiling a module for Native: components, owner callbacks and styles.

use hozo_ir::Utf16Offsets;
use napi_derive::napi;

use super::diagnostics::{parser_diagnostics_for, to_js_diagnostic, CompileDiagnostic};
use super::react_native::SourceImport;
use super::tailwind_order;
use super::tailwind_order::TailwindCompilePlan;
use super::web::{CompiledSourceCopy, TailwindPlanOptions};

#[napi(object)]
pub struct CompiledNativeComponent {
    /// Authored UTF-16 ranges, with emitted UTF-16 offsets relative to `jsx`.
    pub source_copies: Option<Vec<CompiledSourceCopy>>,
    /// Explicit RFC010 preparation only, never inferred from a package claim.
    pub owner_style: Option<CompiledOwnerStyle>,
    pub tailwind_plan: Option<TailwindCompilePlan>,
    /// Compiled JSX to splice into the original source, same convention as
    /// `CompiledComponent.jsx`.
    pub jsx: String,
    /// `StyleSheet.create({ ... })`-ready object literal text (without the
    /// wrapper -- see `hozo_native::LowerOutput`).
    pub styles: String,
    /// Statements to splice at `hook_slot` for `jsx` to work. Empty unless
    /// a condition needed a React hook.
    pub prelude: Vec<String>,
    /// Named imports `prelude` needs from `@hozo/engine`.
    pub runtime_imports: Vec<String>,
    pub native_imports: Vec<String>,
    /// Byte offset just inside the enclosing function's `{`, the only safe
    /// place for `prelude`. `None` when this JSX isn't inside a function
    /// body a statement can go in -- module scope, or a concise arrow.
    pub hook_slot: Option<u32>,
    pub diagnostics: Vec<CompileDiagnostic>,
    pub span_start: u32,
    pub span_end: u32,
}

#[napi(object)]
pub struct CompiledOwnerCallback {
    /// The element, or for a static slot list the slot attribute; UTF-16.
    pub span_start: u32,
    pub span_end: u32,
    pub class_prop: String,
}

#[napi(object)]
pub struct CompiledOwnerStyle {
    /// Only an existing split-box/label receiver may consume this carrier.
    pub split_text: Option<bool>,
    /// Declared callback inputs, not owner identity or an audit verdict.
    pub facts: Option<Vec<String>>,
    pub events: Option<Vec<String>>,
    pub literal_resting: bool,
    pub expression: String,
    pub callback: bool,
    pub focus_visible: bool,
}

/// Per-module Native output. The import and foreign-binding metadata comes
/// from the exact parser pass that produced `components`; bundler adapters
/// must not parse the source again to recover it from text.
#[napi(object)]
pub struct CompiledNativeModule {
    /// Source parser errors, even when no lowerable JSX root was recovered.
    pub syntax_diagnostics: Vec<CompileDiagnostic>,
    /// About the module rather than one component: a class React Native
    /// cannot draw in a class prop no component lowered (#1166).
    pub diagnostics: Vec<CompileDiagnostic>,
    pub components: Vec<CompiledNativeComponent>,
    pub imports: Vec<SourceImport>,
    pub jsx_bindings: Vec<String>,
    pub foreign_primitives: Vec<String>,
}

/// Same shape as `compile`, but lowers to React Native (Pressable/View/Text
/// + a StyleSheet object) instead of DOM/CSS. See `hozo_native`'s module
/// docs for the current Phase 0 scope/limitations (non-Always conditions
/// aren't wired into the rendered `style` prop yet).
#[napi]
pub fn compile_native(source: String) -> Vec<CompiledNativeComponent> {
    lower_native(
        &source,
        &hozo_ir::Theme::default(),
        None,
        None,
        &Default::default(),
        &[],
        TailwindPlanOptions::default(),
    )
}

pub(super) fn lower_native(
    source: &str,
    theme: &hozo_ir::Theme,
    sources: Option<&[String]>,
    stylex: Option<(
        &hozo_parser::StylexModuleRegistry,
        &[hozo_parser::StylexExternalBinding],
    )>,
    text_forwarding: &hozo_parser::ForwardingTable,
    class_helpers: &[hozo_parser::ClassHelper],
    tailwind: TailwindPlanOptions<'_>,
) -> Vec<CompiledNativeComponent> {
    let mut parsed = parse_native_module(
        source,
        sources,
        stylex,
        None,
        text_forwarding,
        class_helpers,
    );
    hozo_parser::capture_utility_leading(&mut parsed, theme);
    let plans = tailwind.apply(&mut parsed);
    lower_native_components(
        source,
        theme,
        &parsed,
        &NativeModuleOptions::default(),
        plans,
    )
}

/// Module-only choices stay together; the reference experiment must not
/// become mutable Compiler state or change later ordinary compilations.
#[derive(Default)]
pub(super) struct NativeModuleOptions<'a> {
    pub(crate) source_evidence: bool,
    pub(crate) owner_style: bool,
    pub(crate) owner_facts: Vec<hozo_native::OwnerFact>,
    pub(crate) owner_events: Vec<hozo_native::OwnerEvent>,
    pub(crate) owner_split_text: bool,
    pub(crate) source_file: Option<&'a str>,
    pub(crate) text_reference: bool,
    pub(crate) text_unified: bool,
    pub(crate) tailwind: TailwindPlanOptions<'a>,
}

pub(super) fn lower_native_module(
    source: &str,
    theme: &hozo_ir::Theme,
    sources: Option<&[String]>,
    stylex: Option<(
        &hozo_parser::StylexModuleRegistry,
        &[hozo_parser::StylexExternalBinding],
    )>,
    options: NativeModuleOptions<'_>,
    text_forwarding: &hozo_parser::ForwardingTable,
    class_helpers: &[hozo_parser::ClassHelper],
) -> CompiledNativeModule {
    let mut parsed = parse_native_module(
        source,
        sources,
        stylex,
        options.source_file,
        text_forwarding,
        class_helpers,
    );
    emit_native_module(source, theme, &mut parsed, options)
}

pub(super) fn parse_native_module(
    source: &str,
    sources: Option<&[String]>,
    stylex: Option<(
        &hozo_parser::StylexModuleRegistry,
        &[hozo_parser::StylexExternalBinding],
    )>,
    source_file: Option<&str>,
    text_forwarding: &hozo_parser::ForwardingTable,
    class_helpers: &[hozo_parser::ClassHelper],
) -> hozo_parser::ParseOutput {
    let (registry, bindings) = match stylex {
        Some((registry, bindings)) => (Some(registry), bindings),
        None => (None, &[][..]),
    };
    let mut parsed = hozo_parser::parse_module_for_file_with_helpers(
        source,
        sources,
        registry,
        bindings,
        source_file,
        class_helpers,
    );
    hozo_parser::apply_text_forwarding(&mut parsed, text_forwarding);
    parsed
}

pub(super) fn emit_native_module(
    source: &str,
    theme: &hozo_ir::Theme,
    parsed: &mut hozo_parser::ParseOutput,
    options: NativeModuleOptions<'_>,
) -> CompiledNativeModule {
    hozo_parser::capture_utility_leading(parsed, theme);
    let plans = options.tailwind.apply(parsed);
    let mut components = lower_native_components(source, theme, parsed, &options, plans);
    let imports = parsed
        .imports
        .iter()
        .map(|entry| SourceImport {
            source: entry.source.clone(),
            imported: entry.imported.clone(),
            local: entry.local.clone(),
        })
        .collect();
    let mut foreign_primitives: Vec<String> = parsed.foreign_primitives.iter().cloned().collect();
    foreign_primitives.sort();
    let mut jsx_bindings: Vec<String> = parsed.jsx_bindings.iter().cloned().collect();
    jsx_bindings.sort();

    let class_diagnostics = hozo_native::native_class_diagnostics(parsed, source);
    // Valid modules already built their offset table during component lowering.
    // Do not walk/allocate it a second time just to return an empty list.
    let offsets = (!parsed.syntax_errors.is_empty() || !class_diagnostics.is_empty())
        .then(|| Utf16Offsets::new(source));
    let diagnostics: Vec<CompileDiagnostic> = class_diagnostics
        .into_iter()
        .map(|diagnostic| to_js_diagnostic(diagnostic, offsets.as_ref().expect("built above")))
        .collect();
    let syntax_diagnostics: Vec<CompileDiagnostic> = if parsed.syntax_errors.is_empty() {
        Vec::new()
    } else {
        let offsets = offsets.as_ref().expect("built above");
        parsed
            .syntax_errors
            .iter()
            .map(|error| CompileDiagnostic {
                code: "SOURCE_SYNTAX_ERROR".to_string(),
                severity: "error".to_string(),
                message: error.message.clone(),
                span_start: offsets.at(error.span.start),
                span_end: offsets.at(error.span.end),
            })
            .collect()
    };
    if options.owner_style
        && (!syntax_diagnostics.is_empty() || diagnostics.iter().any(|d| d.severity == "error"))
    {
        for component in &mut components {
            component.owner_style = None;
        }
    }
    CompiledNativeModule {
        components,
        imports,
        jsx_bindings,
        foreign_primitives,
        syntax_diagnostics,
        diagnostics,
    }
}

pub(super) fn lower_native_components(
    source: &str,
    theme: &hozo_ir::Theme,
    parsed: &hozo_parser::ParseOutput,
    options: &NativeModuleOptions<'_>,
    plans: Vec<hozo_parser::TailwindRootPlan>,
) -> Vec<CompiledNativeComponent> {
    let offsets = Utf16Offsets::new(source);
    let mut plans = plans.into_iter();
    parsed
        .roots
        .iter()
        .map(|root| {
            let mut carrier = None;
            let output = if options.owner_style {
                let (output, style) = hozo_native::lower_owner_style_with_inputs(
                    &root.node,
                    &root.forwarded,
                    source,
                    theme,
                    hozo_native::OwnerStyleInputs {
                        facts: &options.owner_facts,
                        events: &options.owner_events,
                        split_text: options.owner_split_text,
                    },
                );
                carrier = style.map(|style| CompiledOwnerStyle {
                    split_text: style.split_text.then_some(true),
                    facts: (!style.facts.is_empty()).then(|| {
                        style
                            .facts
                            .iter()
                            .map(|fact| fact.key().to_string())
                            .collect()
                    }),
                    events: (!style.events.is_empty()).then(|| {
                        style
                            .events
                            .iter()
                            .map(|event| event.key().to_string())
                            .collect()
                    }),
                    literal_resting: style.literal_resting,
                    expression: style.expression,
                    callback: style.callback,
                    focus_visible: style.focus_visible,
                });
                output
            } else if options.text_reference {
                hozo_native::lower_text_reference(&root.node, &root.forwarded, source, theme)
            } else if options.text_unified {
                hozo_native::lower_text_unified(
                    &root.node,
                    &root.forwarded,
                    source,
                    theme,
                    options.source_evidence,
                )
            } else if options.source_evidence {
                hozo_native::lower_forwarded_with_evidence(
                    &root.node,
                    &root.forwarded,
                    source,
                    theme,
                )
            } else {
                hozo_native::lower_forwarded(&root.node, &root.forwarded, source, theme)
            };
            let mut diagnostics = parser_diagnostics_for(parsed, &root.node, &offsets);
            diagnostics.extend(
                output
                    .diagnostics
                    .into_iter()
                    .map(|d| to_js_diagnostic(d, &offsets)),
            );
            if options.owner_style && diagnostics.iter().any(|d| d.severity == "error") {
                carrier = None;
            }
            // Only the explicit request pays for emitted-coordinate conversion.
            // The backend's byte spans must not leak into JavaScript offsets.
            let source_copies = output.source_copies.map(|copies| {
                let emitted_offsets = Utf16Offsets::new(&output.jsx);
                copies
                    .into_iter()
                    .map(|copy| CompiledSourceCopy {
                        span_start: offsets.at(copy.span.start),
                        span_end: offsets.at(copy.span.end),
                        emitted_start: emitted_offsets.at(copy.emitted_start as u32),
                        emitted_end: emitted_offsets.at(copy.emitted_end as u32),
                    })
                    .collect()
            });
            let tailwind_plan = plans.next().map(|plan| {
                let mut plan = tailwind_order::compile_plan(plan, &offsets);
                // Native's own evidence rides with the plan, asked for with it;
                // absent when empty, so a plan without one reads as the Web's.
                let evidence = |lists: &[hozo_native::OwnerCallback]| {
                    (!lists.is_empty()).then(|| {
                        lists
                            .iter()
                            .map(|callback| CompiledOwnerCallback {
                                span_start: offsets.at(callback.span.start),
                                span_end: offsets.at(callback.span.end),
                                class_prop: callback.class_prop.to_string(),
                            })
                            .collect()
                    })
                };
                plan.owner_callbacks = evidence(&output.owner_callbacks);
                plan.runtime_states = evidence(&output.runtime_states);
                plan
            });
            CompiledNativeComponent {
                source_copies,
                owner_style: carrier,
                tailwind_plan,
                jsx: output.jsx,
                styles: output.styles,
                prelude: output.prelude,
                runtime_imports: output
                    .runtime_imports
                    .into_iter()
                    .map(str::to_string)
                    .collect(),
                native_imports: output
                    .native_imports
                    .into_iter()
                    .map(str::to_string)
                    .collect(),
                // A splice position like any other: `@hozo/metro` writes
                // the hook statements at it.
                hook_slot: root.hook_slot.map(|slot| offsets.at(slot)),
                diagnostics,
                span_start: offsets.at(root.node.span.start),
                span_end: offsets.at(root.node.span.end),
            }
        })
        .collect()
}
