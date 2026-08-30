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

/// Translates UTF-8 byte offsets into UTF-16 code unit offsets.
///
/// oxc reports byte offsets and every backend here uses them; JavaScript
/// indexes a string by UTF-16 code unit. This binding is the one place the
/// representation changes, so it is the one place the translation belongs:
/// a consumer that splices with an untranslated offset cuts in the wrong
/// place, and the error grows with every non-ASCII character before it.
/// Two code units per em dash, ten for `こんにちは` -- enough to delete the
/// rest of the file, which is how this was found.
///
/// Marks only where the two counts diverge. An all-ASCII source -- every
/// fixture in this repository, which is why nothing caught this -- costs
/// one scan and no memory, and `at` returns its argument. Between two
/// marks every character is one byte and one code unit, and that is what
/// makes the interpolation exact rather than approximate.
struct Utf16Offsets {
    /// `(byte, utf16)` immediately after each character where they differ.
    marks: Vec<(u32, u32)>,
}

impl Utf16Offsets {
    fn new(source: &str) -> Self {
        let mut marks = Vec::new();
        let mut utf16: u32 = 0;
        for (byte, ch) in source.char_indices() {
            let bytes = ch.len_utf8() as u32;
            let units = ch.len_utf16() as u32;
            utf16 += units;
            if bytes != units {
                marks.push((byte as u32 + bytes, utf16));
            }
        }
        Utf16Offsets { marks }
    }

    fn at(&self, byte: u32) -> u32 {
        if self.marks.is_empty() {
            return byte;
        }
        match self.marks.binary_search_by_key(&byte, |&(mark, _)| mark) {
            Ok(index) => self.marks[index].1,
            Err(0) => byte,
            Err(index) => {
                let (mark, utf16) = self.marks[index - 1];
                utf16 + (byte - mark)
            }
        }
    }
}

fn to_js_diagnostic(diagnostic: Diagnostic, offsets: &Utf16Offsets) -> CompileDiagnostic {
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
        span_start: offsets.at(diagnostic.span.start),
        span_end: offsets.at(diagnostic.span.end),
    }
}

#[napi(object)]
pub struct StylexModuleMemberSummary {
    pub name: String,
    /// `static`, `partial`, `function`, or `unsupported`.
    pub status: String,
}

#[napi(object)]
pub struct StylexModuleExportSummary {
    pub exported: String,
    pub local: String,
    /// `sheet` or `variables`.
    pub kind: String,
    pub members: Vec<StylexModuleMemberSummary>,
}

#[napi(object)]
pub struct StylexModuleSummary {
    pub exports: Vec<StylexModuleExportSummary>,
}

#[napi(object)]
pub struct StylexModuleSource {
    pub id: String,
    pub content_hash: String,
    pub source: String,
}

#[napi(object)]
pub struct StylexExternalBinding {
    pub specifier: String,
    pub module_id: String,
}

fn external_bindings(
    bindings: Option<Vec<StylexExternalBinding>>,
) -> Vec<hozo_parser::StylexExternalBinding> {
    bindings
        .unwrap_or_default()
        .into_iter()
        .map(|binding| hozo_parser::StylexExternalBinding {
            specifier: binding.specifier,
            module_id: binding.module_id,
        })
        .collect()
}

/// Cacheable exported StyleX facts from one source module.
///
/// Analysis is separate from lowering so every bundler can build the same
/// project graph once. The summary contains no AST-backed data and is safe
/// to persist between processes.
#[napi]
pub fn summarize_stylex_module(source: String) -> StylexModuleSummary {
    let summary = hozo_parser::summarize_stylex_module(&source);
    StylexModuleSummary {
        exports: summary
            .exports
            .into_iter()
            .map(|export| StylexModuleExportSummary {
                exported: export.exported,
                local: export.local,
                kind: match export.kind {
                    hozo_parser::StylexModuleExportKind::Sheet => "sheet",
                    hozo_parser::StylexModuleExportKind::Variables => "variables",
                }
                .to_string(),
                members: export
                    .members
                    .into_iter()
                    .map(|member| StylexModuleMemberSummary {
                        name: member.name,
                        status: match member.status {
                            hozo_parser::StylexModuleMemberStatus::Static => "static",
                            hozo_parser::StylexModuleMemberStatus::Partial => "partial",
                            hozo_parser::StylexModuleMemberStatus::Function => "function",
                            hozo_parser::StylexModuleMemberStatus::Unsupported => "unsupported",
                        }
                        .to_string(),
                    })
                    .collect(),
            })
            .collect(),
    }
}

#[napi(object)]
pub struct CompiledComponent {
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
    // Built once for the file. The `source.get(..)` below keeps the byte
    // offsets, because it indexes a Rust string; only what crosses into
    // JavaScript is translated.
    let offsets = Utf16Offsets::new(source);
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
                        span_start: offsets.at(paint.span.start),
                        span_end: offsets.at(paint.span.end),
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
                            span_start: offsets.at(paint.span.start),
                            span_end: offsets.at(paint.span.end),
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
                span_start: offsets.at(paint.span.start),
                span_end: offsets.at(paint.span.end),
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

/// Parses `source` as TSX and lowers every top-level JSX element found (one
/// per component's returned JSX, see `hozo_parser::parse_tsx`) to Web
/// output. Returns one `CompiledComponent` per root found, in source order.
#[napi]
pub fn compile(source: String) -> Vec<CompiledComponent> {
    lower_web(&source, &hozo_ir::Theme::default(), None, None)
}

fn lower_web(
    source: &str,
    theme: &hozo_ir::Theme,
    sources: Option<&[String]>,
    stylex: Option<(&hozo_parser::StylexModuleRegistry, &[hozo_parser::StylexExternalBinding])>,
) -> Vec<CompiledComponent> {
    let parsed = match stylex {
        Some((registry, bindings)) => {
            hozo_parser::parse_tsx_with_stylex(source, sources, Some(registry), bindings)
        }
        None => hozo_parser::parse_tsx_with(source, sources),
    };
    let offsets = Utf16Offsets::new(source);
    parsed
        .roots
        .iter()
        .map(|root| {
            let output = hozo_web::lower(&root.node, source, theme);
            let mut diagnostics = parser_diagnostics_for(&parsed, &root.node, &offsets);
            diagnostics.extend(
                output.diagnostics.into_iter().map(|d| to_js_diagnostic(d, &offsets)),
            );
            CompiledComponent {
                jsx: output.jsx,
                css: output.css,
                runtime_imports: output
                    .runtime_imports
                    .into_iter()
                    .map(str::to_string)
                    .collect(),
                diagnostics,
                span_start: offsets.at(root.node.span.start),
                span_end: offsets.at(root.node.span.end),
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
    stylex: hozo_parser::StylexModuleRegistry,
}

#[napi]
impl Compiler {
    #[napi(constructor)]
    pub fn new(theme: Option<JsTheme>, sources: Option<Vec<String>>) -> Self {
        Compiler { theme: to_theme(theme), sources, stylex: Default::default() }
    }

    #[napi]
    pub fn compile(
        &self,
        source: String,
        bindings: Option<Vec<StylexExternalBinding>>,
    ) -> Vec<CompiledComponent> {
        let bindings = external_bindings(bindings);
        lower_web(
            &source,
            &self.theme,
            self.sources.as_deref(),
            Some((&self.stylex, &bindings)),
        )
    }

    #[napi]
    pub fn compile_native(
        &self,
        source: String,
        bindings: Option<Vec<StylexExternalBinding>>,
    ) -> Vec<CompiledNativeComponent> {
        let bindings = external_bindings(bindings);
        lower_native(&source, &self.theme, self.sources.as_deref(), Some((&self.stylex, &bindings)))
    }

    /// Native output plus module metadata collected by the same TSX parse.
    /// Metro needs both to rewrite imports without reparsing the file.
    #[napi]
    pub fn compile_native_module(
        &self,
        source: String,
        bindings: Option<Vec<StylexExternalBinding>>,
    ) -> CompiledNativeModule {
        let bindings = external_bindings(bindings);
        lower_native_module(
            &source,
            &self.theme,
            self.sources.as_deref(),
            Some((&self.stylex, &bindings)),
        )
    }

    #[napi]
    pub fn set_stylex_modules(&mut self, modules: Vec<StylexModuleSource>) {
        let modules = modules
            .into_iter()
            .map(|module| (module.id, module.content_hash, module.source))
            .collect::<Vec<_>>();
        self.stylex.replace(&modules);
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
    ///
    /// `order` is the same candidates in the order Tailwind would write
    /// them, from `@hozo/tailwind`'s `loadClassOrder`.
    ///
    /// Every utility here is a single class, so they all carry the same
    /// specificity and the order they are written in *is* the cascade.
    /// `union` is alphabetical -- for byte-identical output between builds,
    /// which is still wanted -- and alphabetical puts `2xl:` first and
    /// `sm:` after `md:`, so `hidden sm:block md:hidden` stayed visible
    /// past `md`.
    ///
    /// Taken as a hint rather than as the list to render: what is rendered
    /// is still this cache's own union, sorted by position in `order`, so
    /// a caller that passes a stale or partial list gets a complete
    /// stylesheet in a worse order rather than a missing rule. Omitted --
    /// which `@hozo/next` does while the config is still being evaluated,
    /// for the same reason it passes no theme there -- keeps the
    /// alphabetical order.
    #[napi]
    pub fn render_css(&self, theme: Option<JsTheme>, order: Option<Vec<String>>) -> String {
        let mut names = self.inner.union();
        if let Some(order) = order {
            let rank: std::collections::HashMap<&str, usize> =
                order.iter().enumerate().map(|(index, name)| (name.as_str(), index)).collect();
            // Unranked names keep their alphabetical order among themselves
            // and go last, which is where Tailwind puts what it does not
            // recognise.
            names.sort_by_key(|name| rank.get(name.as_str()).copied().unwrap_or(usize::MAX));
        }
        hozo_web::render_candidate_stylesheet(&names, &to_theme(theme))
    }

    /// Every candidate this cache holds, so a caller can ask Tailwind what
    /// order to write them in and hand it back to `render_css`.
    #[napi]
    pub fn candidates(&self) -> Vec<String> {
        self.inner.union()
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
    lower_native(&source, &hozo_ir::Theme::default(), None, None)
}

fn lower_native(
    source: &str,
    theme: &hozo_ir::Theme,
    sources: Option<&[String]>,
    stylex: Option<(&hozo_parser::StylexModuleRegistry, &[hozo_parser::StylexExternalBinding])>,
) -> Vec<CompiledNativeComponent> {
    let parsed = match stylex {
        Some((registry, bindings)) => {
            hozo_parser::parse_tsx_with_stylex(source, sources, Some(registry), bindings)
        }
        None => hozo_parser::parse_tsx_with(source, sources),
    };
    lower_native_components(source, theme, &parsed)
}

fn lower_native_module(
    source: &str,
    theme: &hozo_ir::Theme,
    sources: Option<&[String]>,
    stylex: Option<(&hozo_parser::StylexModuleRegistry, &[hozo_parser::StylexExternalBinding])>,
) -> CompiledNativeModule {
    let parsed = match stylex {
        Some((registry, bindings)) => {
            hozo_parser::parse_tsx_with_stylex(source, sources, Some(registry), bindings)
        }
        None => hozo_parser::parse_tsx_with(source, sources),
    };
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
    let offsets = Utf16Offsets::new(source);
    parsed
        .roots
        .iter()
        .map(|root| {
            let output = hozo_native::lower(&root.node, source, theme);
            let mut diagnostics = parser_diagnostics_for(&parsed, &root.node, &offsets);
            diagnostics.extend(
                output.diagnostics.into_iter().map(|d| to_js_diagnostic(d, &offsets)),
            );
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


#[cfg(test)]
mod utf16_tests {
    use super::*;

    /// What JavaScript would say, so the expectation is not a second
    /// implementation of the thing under test.
    fn js_index_of(source: &str, byte: u32) -> u32 {
        source[..byte as usize].encode_utf16().count() as u32
    }

    #[test]
    fn an_ascii_source_translates_to_itself() {
        let source = "const a = 1;\nconst b = 2;\n";
        let offsets = Utf16Offsets::new(source);
        for byte in 0..=source.len() as u32 {
            assert_eq!(offsets.at(byte), byte);
        }
    }

    #[test]
    fn every_offset_matches_what_javascript_would_index() {
        // One character from each width that differs: two bytes and one
        // unit, three and one, four and two.
        let source = "a é b 日 c 🚀 d";
        let offsets = Utf16Offsets::new(source);
        for (byte, _) in source.char_indices().chain(std::iter::once((source.len(), ' '))) {
            let byte = byte as u32;
            assert_eq!(offsets.at(byte), js_index_of(source, byte), "at byte {byte}");
        }
    }

    #[test]
    fn a_span_after_non_ascii_text_lands_where_javascript_cuts() {
        // The failure this exists for: the component's span ended past the
        // JSX and the splice deleted the `)` and `}` that closed the
        // function. Three em dashes were worth six characters.
        let source = "\
import { View, Text } from '@hozo/core';
function App() {
  return (
    <View className=\"p-4\"><Text className=\"text-sm\">a — b — c —</Text></View>
  )
}
";
        let components = compile(source.to_string());
        assert_eq!(components.len(), 1);
        let end = components[0].span_end as usize;
        let utf16: Vec<u16> = source.encode_utf16().collect();
        let remainder = String::from_utf16(&utf16[end..]).unwrap();
        assert_eq!(remainder, "\n  )\n}\n", "the span ran past the JSX element");
    }

    #[test]
    fn a_japanese_string_does_not_swallow_the_file() {
        // Ten code units of difference in one word, which was enough to
        // put the span at the end of the source. A compiler for React
        // Native that cannot compile this is not portable.
        let source = "\
import { View, Text } from '@hozo/core';
function App() {
  return (
    <View className=\"p-4\"><Text className=\"text-sm\">こんにちは</Text></View>
  )
}
";
        let components = compile(source.to_string());
        let end = components[0].span_end as usize;
        let utf16: Vec<u16> = source.encode_utf16().collect();
        assert!(end < utf16.len(), "the span reached the end of the file");
        assert_eq!(String::from_utf16(&utf16[end..]).unwrap(), "\n  )\n}\n");
    }

    #[test]
    fn a_diagnostic_points_at_the_text_it_is_about() {
        // Diagnostics carry spans too, and a bundler resolves them to a
        // line and column. Off by the same amount, silently.
        let source = "\
import { View } from '@hozo/core';
const label = '— — —';
function App() {
  return <View className={label} />;
}
";
        let components = compile(source.to_string());
        let diagnostics: Vec<_> =
            components.iter().flat_map(|c| c.diagnostics.iter()).collect();
        assert!(!diagnostics.is_empty(), "expected a dynamic-class diagnostic");
        let utf16: Vec<u16> = source.encode_utf16().collect();
        for diagnostic in diagnostics {
            let start = diagnostic.span_start as usize;
            let end = diagnostic.span_end as usize;
            assert!(end <= utf16.len(), "diagnostic span past the end of the source");
            let text = String::from_utf16(&utf16[start..end]).unwrap();
            assert!(
                source.contains(&text),
                "diagnostic span {start}..{end} cut {text:?}, which is not in the source"
            );
        }
    }
}
