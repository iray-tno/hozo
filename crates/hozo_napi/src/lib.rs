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

use hozo_ir::{Color, Diagnostic, DiagnosticCode, Severity, StyleProperty, Theme};
use napi_derive::napi;

#[napi(object)]
pub struct CompileDiagnostic {
    pub code: String,
    pub severity: String,
    pub message: String,
    pub span_start: u32,
    pub span_end: u32,
}

fn diagnostic_code_str(code: DiagnosticCode) -> &'static str {
    match code {
        DiagnosticCode::A11yInteractiveWithoutRole => "A11Y_INTERACTIVE_WITHOUT_ROLE",
        DiagnosticCode::RoleHasNoWebEquivalent => "ROLE_HAS_NO_WEB_EQUIVALENT",
        DiagnosticCode::AriaIncompletePattern => "ARIA_INCOMPLETE_PATTERN",
        DiagnosticCode::AriaPropNotAllowed => "ARIA_PROP_NOT_ALLOWED",
        DiagnosticCode::AriaNameProhibited => "ARIA_NAME_PROHIBITED",
        DiagnosticCode::FocusableDisabledUnsupported => "FOCUSABLE_DISABLED_UNSUPPORTED",
        DiagnosticCode::TailwindVariantNotSupported => "TAILWIND_VARIANT_NOT_SUPPORTED",
        DiagnosticCode::A11yMissingAccessibleName => "A11Y_MISSING_ACCESSIBLE_NAME",
        DiagnosticCode::A11yDialogWithoutDismiss => "A11Y_DIALOG_WITHOUT_DISMISS",
        DiagnosticCode::InvalidSemanticNesting => "INVALID_SEMANTIC_NESTING",
        DiagnosticCode::UnsafePropSpreadAfterStyle => "UNSAFE_PROP_SPREAD_AFTER_STYLE",
        DiagnosticCode::WebOnlyPropertyOnNative => "WEB_ONLY_PROPERTY_ON_NATIVE",
        DiagnosticCode::DynamicClassNameNotResolved => "DYNAMIC_CLASS_NAME_NOT_RESOLVED",
        DiagnosticCode::DynamicPropNotResolved => "DYNAMIC_PROP_NOT_RESOLVED",
        DiagnosticCode::TailwindVariantCannotMatch => "TAILWIND_VARIANT_CANNOT_MATCH",
        DiagnosticCode::VisitedStyleIgnored => "VISITED_STYLE_IGNORED",
        DiagnosticCode::A11yHiddenButFocusable => "A11Y_HIDDEN_BUT_FOCUSABLE",
        DiagnosticCode::A11yPositiveTabIndex => "A11Y_POSITIVE_TAB_INDEX",
        DiagnosticCode::A11yHeadingLevelSkipped => "A11Y_HEADING_LEVEL_SKIPPED",
        DiagnosticCode::NotWiredOnWeb => "NOT_WIRED_ON_WEB",
        DiagnosticCode::HozoAttributeIsPrivate => "HOZO_ATTRIBUTE_IS_PRIVATE",
        DiagnosticCode::A11yDuplicateId => "A11Y_DUPLICATE_ID",
        DiagnosticCode::A11yInteractiveNesting => "A11Y_INTERACTIVE_NESTING",
        DiagnosticCode::A11yPressWithoutKeyboard => "A11Y_PRESS_WITHOUT_KEYBOARD",
        DiagnosticCode::NotWiredOnNative => "NOT_WIRED_ON_NATIVE",
        DiagnosticCode::PrimitiveNotLowered => "PRIMITIVE_NOT_LOWERED",
        DiagnosticCode::UnreadableArbitraryValue => "UNREADABLE_ARBITRARY_VALUE",
        DiagnosticCode::StylexNotLowered => "STYLEX_NOT_LOWERED",
    }
}

fn to_js_diagnostic(diagnostic: Diagnostic) -> CompileDiagnostic {
    CompileDiagnostic {
        code: diagnostic_code_str(diagnostic.code).to_string(),
        severity: match diagnostic.severity {
            // Build-stopping; callers are expected to fail on this rather
            // than print it (see @hozo/metro).
            Severity::Error => "error".to_string(),
            Severity::Warning => "warning".to_string(),
            Severity::Info => "info".to_string(),
        },
        message: diagnostic.message,
        span_start: diagnostic.span.start,
        span_end: diagnostic.span.end,
    }
}

#[napi(object)]
pub struct CompiledComponent {
    /// Compiled JSX to splice into the original source in place of the
    /// text at `[span_start, span_end)` -- callers (the Vite plugin) own
    /// the actual splicing, since this binding doesn't touch source text.
    pub jsx: String,
    pub css: String,
    /// Named imports `jsx` needs from `@hozo/runtime`, which the caller
    /// splices at the top of the module. Same contract as the Native
    /// backend's field of this name.
    pub runtime_imports: Vec<String>,
    pub diagnostics: Vec<CompileDiagnostic>,
    pub span_start: u32,
    pub span_end: u32,
}

#[napi(object)]
pub struct CompiledCanvasPaint {
    /// Complete replacement for the source attribute at this span.
    pub replacement: String,
    pub diagnostics: Vec<CompileDiagnostic>,
    pub span_start: u32,
    pub span_end: u32,
}

fn canvas_color(color: &Color, theme: &Theme, native: bool) -> String {
    match color {
        Color::Keyword(keyword) => keyword.to_string(),
        Color::Css(value) => value.clone(),
        Color::Token(token) => theme.color(token).map_or_else(
            || {
                if native {
                    format!("hozo-unresolved:{token}")
                } else {
                    format!("var(--hozo-color-{token})")
                }
            },
            |resolved| if native { resolved.hex } else { resolved.oklch },
        ),
    }
}

fn js_string(value: &str) -> String {
    // Rust's debug string escaping is valid JavaScript for the ASCII paint
    // values and class tokens emitted here (quotes, slashes and newlines are
    // escaped rather than pasted into the generated JSX).
    format!("{value:?}")
}

/// Compiles Canvas shape paint utilities without routing Canvas through the
/// semantic/SVG node tree. Each result is one source attribute edit.
#[napi]
pub fn compile_canvas_paints(source: String, native: bool) -> Vec<CompiledCanvasPaint> {
    lower_canvas_paints(&source, &hozo_ir::Theme::default(), native)
}

fn lower_canvas_paints(
    source: &str,
    theme: &hozo_ir::Theme,
    native: bool,
) -> Vec<CompiledCanvasPaint> {
    hozo_parser::parse_canvas_paints(source)
        .into_iter()
        .map(|paint| {
            let original = source
                .get(paint.span.start as usize..paint.span.end as usize)
                .unwrap_or("className")
                .to_string();
            let mut diagnostics = Vec::new();
            let replacement = match paint.static_classes {
                None => {
                    diagnostics.push(CompileDiagnostic {
                        code: "CANVAS_CLASS_NOT_LOWERED".to_string(),
                        severity: "warning".to_string(),
                        message: "A dynamic Canvas shape `className` cannot be converted to paint props. Use dynamic `fill`, `stroke`, `strokeWidth` or `opacity` props instead."
                            .to_string(),
                        span_start: paint.span.start,
                        span_end: paint.span.end,
                    });
                    original
                }
                Some(_) => {
                    if !paint.remaining.is_empty() {
                        diagnostics.push(CompileDiagnostic {
                            code: "CANVAS_CLASS_NOT_LOWERED".to_string(),
                            severity: "warning".to_string(),
                            message: format!(
                                "These Canvas shape classes do not map to paint props and have no pixel target: {}. Canvas shapes currently accept fill, stroke, stroke width and opacity utilities.",
                                paint.remaining.join(", ")
                            ),
                            span_start: paint.span.start,
                            span_end: paint.span.end,
                        });
                    }
                    if paint.paint.is_empty() {
                        original
                    } else {
                        let mut attributes = Vec::new();
                        if !paint.remaining.is_empty() {
                            attributes.push(format!(
                                "className={}",
                                js_string(&paint.remaining.join(" "))
                            ));
                        }
                        for property in paint.paint {
                            match property {
                                StyleProperty::Fill(color) => attributes.push(format!(
                                    "fill={}",
                                    js_string(&canvas_color(&color, &theme, native))
                                )),
                                StyleProperty::Stroke(color) => attributes.push(format!(
                                    "stroke={}",
                                    js_string(&canvas_color(&color, &theme, native))
                                )),
                                StyleProperty::StrokeWidth(width) => {
                                    attributes.push(format!("strokeWidth={{{width}}}"))
                                }
                                StyleProperty::Opacity(opacity) => {
                                    attributes.push(format!("opacity={{{opacity}}}"))
                                }
                                _ => {}
                            }
                        }
                        attributes.join(" ")
                    }
                }
            };
            CompiledCanvasPaint {
                replacement,
                diagnostics,
                span_start: paint.span.start,
                span_end: paint.span.end,
            }
        })
        .collect()
}

/// Parser diagnostics are file-level (they're about the source as written,
/// not about any one lowering), but this binding reports per-component --
/// so each is attributed to whichever root's span contains it.
fn parser_diagnostics_for(
    parsed: &hozo_parser::ParseOutput,
    root: &hozo_ir::Node,
) -> Vec<CompileDiagnostic> {
    parsed
        .diagnostics
        .iter()
        .filter(|d| d.span.start >= root.span.start && d.span.end <= root.span.end)
        .cloned()
        .map(to_js_diagnostic)
        .collect()
}

/// Parses `source` as TSX and lowers every top-level JSX element found (one
/// per component's returned JSX, see `hozo_parser::parse_tsx`) to Web
/// output. Returns one `CompiledComponent` per root found, in source order.
#[napi]
pub fn compile(source: String) -> Vec<CompiledComponent> {
    lower_web(&source, &hozo_ir::Theme::default(), None)
}

fn lower_web(
    source: &str,
    theme: &hozo_ir::Theme,
    sources: Option<&[String]>,
) -> Vec<CompiledComponent> {
    let parsed = hozo_parser::parse_tsx_with(source, sources);
    parsed
        .roots
        .iter()
        .map(|root| {
            let output = hozo_web::lower(&root.node, source, theme);
            let mut diagnostics = parser_diagnostics_for(&parsed, &root.node);
            diagnostics.extend(output.diagnostics.into_iter().map(to_js_diagnostic));
            CompiledComponent {
                jsx: output.jsx,
                css: output.css,
                runtime_imports: output
                    .runtime_imports
                    .into_iter()
                    .map(str::to_string)
                    .collect(),
                diagnostics,
                span_start: root.node.span.start,
                span_end: root.node.span.end,
            }
        })
        .collect()
}

/// A compiler holding what a project decided once: its theme and which
/// modules its primitives may come from.
///
/// The free functions above take neither, and that is the point. They used
/// to take both as optional arguments, so every caller marshalled 288
/// colours across this boundary on every file -- 0.134ms against the 0.003ms
/// it takes to compile a one-element file, a fixed cost with nothing to do
/// with the file. Worse, a theme is easy to leave out, and leaving it out
/// does not fail: the compiler quietly uses the default palette and spacing
/// scale, and the output looks entirely reasonable. `packages/compiler`
/// still carries a note about a declaration that "said `compile(source)`
/// while every caller passed three arguments".
///
/// So the argument is gone rather than defaulted. Compiling against a
/// project's theme now requires holding one of these, and there is nothing
/// left to forget.
#[napi]
pub struct Compiler {
    theme: hozo_ir::Theme,
    /// Modules whose primitive-named exports may be lowered. `None` trusts
    /// every module, which is what a caller with no project configuration
    /// wants; it is per-project, not per-file, which is the other reason it
    /// belongs here.
    sources: Option<Vec<String>>,
}

#[napi]
impl Compiler {
    #[napi(constructor)]
    pub fn new(theme: Option<JsTheme>, sources: Option<Vec<String>>) -> Self {
        Compiler { theme: to_theme(theme), sources }
    }

    #[napi]
    pub fn compile(&self, source: String) -> Vec<CompiledComponent> {
        lower_web(&source, &self.theme, self.sources.as_deref())
    }

    #[napi]
    pub fn compile_native(&self, source: String) -> Vec<CompiledNativeComponent> {
        lower_native(&source, &self.theme, self.sources.as_deref())
    }

    /// Native output plus module metadata collected by the same TSX parse.
    /// Metro needs both to rewrite imports without reparsing the file.
    #[napi]
    pub fn compile_native_module(&self, source: String) -> CompiledNativeModule {
        lower_native_module(&source, &self.theme, self.sources.as_deref())
    }

    #[napi]
    pub fn compile_canvas_paints(&self, source: String, native: bool) -> Vec<CompiledCanvasPaint> {
        lower_canvas_paints(&source, &self.theme, native)
    }
}

/// The build-side half of proposal §7's third tier.
///
/// A `className` the compiler couldn't read is passed through to runtime,
/// so something has to have already emitted CSS for whatever string it
/// evaluates to. That set can't come from the file being transformed --
/// a class written in one module can be produced by an expression in
/// another -- so it's accumulated across the whole project here, and the
/// stylesheet is generated once from the union.
///
/// Lives on the JS side rather than inside `compile()` because the
/// bundler owns the project walk and knows about file deletions; this
/// only owns the scanning, the staleness rule, and persistence.
#[napi]
pub struct CandidateCache {
    inner: hozo_cache::CandidateCache,
}

#[napi]
impl CandidateCache {
    /// Opens the cache at `path` (JSON on disk today -- the format is the
    /// Rust side's business). Pass no path for a build that has nothing to
    /// resume from, e.g. a one-shot production build.
    #[napi(constructor)]
    pub fn new(path: Option<String>) -> Self {
        let store: Box<dyn hozo_cache::SnapshotStore> = match path {
            Some(path) => Box::new(hozo_cache::JsonFileStore::new(path)),
            None => Box::new(hozo_cache::MemoryStore::new()),
        };
        CandidateCache { inner: hozo_cache::CandidateCache::open(store) }
    }

    /// Whether `path` was already scanned at this exact `modifiedMs`, i.e.
    /// the caller can skip reading and scanning it entirely.
    #[napi]
    pub fn is_current(&self, path: String, modified_ms: f64) -> bool {
        self.inner.is_current(&path, modified_ms as u64)
    }

    /// Scans `source` and records the result under `path`.
    ///
    /// Returns whether the candidate set changed -- saving a file without
    /// touching its classes returns `false`, so callers can leave the
    /// generated stylesheet alone instead of rewriting identical bytes and
    /// triggering a pointless HMR round.
    #[napi]
    pub fn scan_file(&mut self, path: String, source: String, modified_ms: f64) -> bool {
        let class_names = hozo_parser::scan_class_candidates(&source);
        let uses_tailwind = hozo_parser::source_uses_tailwind(&source);
        self.inner.record(&path, modified_ms as u64, class_names, uses_tailwind)
    }

    /// Drops a deleted file's contribution. Returns whether it was tracked.
    #[napi]
    pub fn forget(&mut self, path: String) -> bool {
        self.inner.forget(&path)
    }

    /// Reconciles the persistent cache with one complete project walk and
    /// returns how many files disappeared since the previous walk.
    #[napi]
    pub fn retain_files(&mut self, paths: Vec<String>) -> u32 {
        self.inner.retain_files(paths) as u32
    }

    /// The stylesheet for every candidate in the project, written under the
    /// classes' real Tailwind names so a runtime-produced string matches by
    /// itself -- no runtime resolution code involved.
    #[napi]
    pub fn render_css(&self, theme: Option<JsTheme>) -> String {
        hozo_web::render_candidate_stylesheet(&self.inner.union(), &to_theme(theme))
    }

    /// The React Native counterpart of `renderCss`: a JS module holding a
    /// class-name -> style-object map plus a resolver bound to it.
    ///
    /// A separate call rather than a second field on one result because a
    /// project builds for one platform at a time -- generating the module
    /// a Web build will never import would be wasted work.
    #[napi]
    pub fn render_native_module(&self, theme: Option<JsTheme>) -> String {
        hozo_native::render_candidate_module(&self.inner.union(), &to_theme(theme))
    }

    /// Whether any scanned file names a Tailwind utility.
    ///
    /// Not the same as the candidate stylesheet being non-empty: that
    /// holds only what the compiler *couldn't* read, and an ordinary
    /// project's Tailwind is all static `className` the compiler reads
    /// exactly. See `source_uses_tailwind`.
    #[napi(getter)]
    pub fn uses_tailwind(&self) -> bool {
        self.inner.uses_tailwind()
    }

    /// Number of files tracked.
    #[napi(getter)]
    pub fn size(&self) -> u32 {
        self.inner.len() as u32
    }

    /// Writes the cache back, if anything changed since it was opened.
    #[napi]
    pub fn persist(&mut self) -> napi::Result<()> {
        self.inner.persist().map_err(|err| napi::Error::from_reason(err.to_string()))
    }
}

#[napi(object)]
pub struct CompiledNativeComponent {
    /// Compiled JSX to splice into the original source, same convention as
    /// `CompiledComponent.jsx`.
    pub jsx: String,
    /// `StyleSheet.create({ ... })`-ready object literal text (without the
    /// wrapper -- see `hozo_native::LowerOutput`).
    pub styles: String,
    /// Statements to splice at `hook_slot` for `jsx` to work. Empty unless
    /// a condition needed a React hook.
    pub prelude: Vec<String>,
    /// Named imports `prelude` needs from `@hozo/runtime`.
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
pub struct SourceImport {
    pub source: String,
    pub imported: String,
    pub local: String,
}

/// Per-module Native output. The import and foreign-binding metadata comes
/// from the exact parser pass that produced `components`; bundler adapters
/// must not parse the source again to recover it from text.
#[napi(object)]
pub struct CompiledNativeModule {
    pub components: Vec<CompiledNativeComponent>,
    pub imports: Vec<SourceImport>,
    pub foreign_primitives: Vec<String>,
}

/// Same shape as `compile`, but lowers to React Native (Pressable/View/Text
/// + a StyleSheet object) instead of DOM/CSS. See `hozo_native`'s module
/// docs for the current Phase 0 scope/limitations (non-Always conditions
/// aren't wired into the rendered `style` prop yet).
#[napi]
pub fn compile_native(source: String) -> Vec<CompiledNativeComponent> {
    lower_native(&source, &hozo_ir::Theme::default(), None)
}

fn lower_native(
    source: &str,
    theme: &hozo_ir::Theme,
    sources: Option<&[String]>,
) -> Vec<CompiledNativeComponent> {
    let parsed = hozo_parser::parse_tsx_with(source, sources);
    lower_native_components(source, theme, &parsed)
}

fn lower_native_module(
    source: &str,
    theme: &hozo_ir::Theme,
    sources: Option<&[String]>,
) -> CompiledNativeModule {
    let parsed = hozo_parser::parse_tsx_with(source, sources);
    let components = lower_native_components(source, theme, &parsed);
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

    CompiledNativeModule { components, imports, foreign_primitives }
}

fn lower_native_components(
    source: &str,
    theme: &hozo_ir::Theme,
    parsed: &hozo_parser::ParseOutput,
) -> Vec<CompiledNativeComponent> {
    parsed
        .roots
        .iter()
        .map(|root| {
            let output = hozo_native::lower(&root.node, source, theme);
            let mut diagnostics = parser_diagnostics_for(&parsed, &root.node);
            diagnostics.extend(output.diagnostics.into_iter().map(to_js_diagnostic));
            CompiledNativeComponent {
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
                hook_slot: root.hook_slot,
                diagnostics,
                span_start: root.node.span.start,
                span_end: root.node.span.end,
            }
        })
        .collect()
}

/// A project's design tokens, as `@hozo/tailwind` extracts them.
///
/// Colours only for now. The rest of the scales -- spacing, containers,
/// fonts, breakpoints -- are resolved at parse time rather than at
/// lowering, so they need the theme threaded through a different path and
/// are a separate piece of work. Colours are the one that actually breaks
/// a project today: a `--color-brand` in a `@theme` compiled to a CSS
/// variable nothing defined.
#[napi(object)]
pub struct JsTheme {
    /// One spacing step in pixels (Tailwind's `--spacing`, 0.25rem by
    /// default). Absent means the default, which is what every project
    /// that does not change it has.
    pub spacing_px: Option<f64>,
    /// Token name (`"brand"`, `"blue-500"`) to its two spellings. Web takes
    /// the `oklch`, React Native the `hex`, which is why both are carried
    /// rather than converting at the boundary.
    pub colors: Vec<JsThemeColor>,
}

#[napi(object)]
pub struct JsThemeColor {
    pub token: String,
    pub oklch: String,
    pub hex: String,
}

fn to_theme(theme: Option<JsTheme>) -> hozo_ir::Theme {
    let Some(theme) = theme else {
        return hozo_ir::Theme::default();
    };
    let spacing_px = theme.spacing_px;
    hozo_ir::Theme::new(
        theme
            .colors
            .into_iter()
            .map(|color| {
                (color.token, hozo_ir::ThemeColor { oklch: color.oklch, hex: color.hex })
            })
            .collect(),
        spacing_px,
    )
}

/// Every binding a source file imports from one module, by local name.
///
/// The Native backend prepends `import { View, StyleSheet } from
/// 'react-native'`, and a React Native file already has its own -- so it
/// needs to know which names are taken before adding to them.
#[napi]
pub fn module_imports(source: String, module: String) -> Vec<String> {
    hozo_parser::module_imports(&source, &module)
}

/// Primitive-named bindings a file must not have lowered.
///
/// One implementation of the rule, shared with the backends: the Native
/// transform has its own guards that need to tell a component Hozo
/// declined from one it failed to lower.
#[napi]
pub fn foreign_primitives(source: String, sources: Vec<String>) -> Vec<String> {
    let mut names: Vec<String> = hozo_parser::foreign_primitives(&source, &sources).into_iter().collect();
    names.sort();
    names
}
