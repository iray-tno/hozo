//! An opt-in collect/prepare/emit boundary. Retain owned IR, never an AST
//! allocator or a token into a global compiler cache. Emit consumes it once.
use super::*;
use napi::bindgen_prelude::Either;

#[napi]
pub struct PreparedTailwindContext {
    context: Box<hozo_ir::TailwindOrderContext>,
}

#[napi]
pub fn prepare_tailwind_context(snapshot: String) -> napi::Result<PreparedTailwindContext> {
    Ok(PreparedTailwindContext {
        context: tailwind_order::prepare(&snapshot)?,
    })
}

#[napi]
impl PreparedTailwindContext {
    #[napi(getter)]
    pub fn fingerprint(&self) -> String {
        self.context.snapshot().fingerprint.clone()
    }

    /// Completeness is checked once before any module is consumed. A
    /// not-generated entry is collected; a missing one is not rank zero.
    #[napi]
    pub fn require_candidates(&self, candidates: Vec<String>) -> napi::Result<()> {
        for name in candidates {
            if self.context.lookup(&name).is_none() {
                return Err(napi::Error::from_reason(format!(
                    "Tailwind ordering context did not collect {name}"
                )));
            }
        }
        Ok(())
    }
}

struct ParsedModule {
    source: String,
    parsed: hozo_parser::ParseOutput,
    theme: Arc<Theme>,
}

fn candidates(state: &Option<ParsedModule>) -> napi::Result<Vec<String>> {
    let state = state.as_ref().ok_or_else(consumed)?;
    Ok(parsed_candidates(&state.parsed)
        .map(str::to_owned)
        .collect())
}

fn parsed_candidates(parsed: &hozo_parser::ParseOutput) -> impl Iterator<Item = &str> {
    parsed
        .roots
        .iter()
        .find_map(|root| root.tailwind_units.as_deref())
        .into_iter()
        .flat_map(|units| units.iter())
        .map(|(_, name)| name)
}

fn finish_web_attempt(
    mut prepared: PreparedWebModule,
    context: &PreparedTailwindContext,
) -> napi::Result<Either<Vec<CompiledComponent>, PreparedWebModule>> {
    let state = prepared.state.as_ref().ok_or_else(consumed)?;
    // Inspect the real parse, not the lexical universe supplied by an adapter.
    // A miss returns this very IR; emitting an incomplete context or parsing
    // again would respectively lose correctness or the intended fast path.
    if parsed_candidates(&state.parsed).all(|name| context.context.lookup(name).is_some()) {
        Ok(Either::A(prepared.emit(context)?))
    } else {
        Ok(Either::B(prepared))
    }
}

fn consumed() -> napi::Error {
    napi::Error::from_reason("Prepared module has already been emitted or disposed")
}

#[napi]
pub struct PreparedWebModule {
    state: Option<ParsedModule>,
    evidence: bool,
    capture: bool,
}

#[napi]
impl PreparedWebModule {
    #[napi(getter)]
    pub fn candidates(&self) -> napi::Result<Vec<String>> {
        candidates(&self.state)
    }

    #[napi]
    pub fn emit(
        &mut self,
        context: &PreparedTailwindContext,
    ) -> napi::Result<Vec<CompiledComponent>> {
        let mut state = self.state.take().ok_or_else(consumed)?;
        Ok(emit_web(
            &state.source,
            &state.theme,
            &mut state.parsed,
            WebModuleOptions {
                // Only a parsing choice; the already-owned parse is emitted.
                compat: hozo_parser::ReactNativeCompat::OnlyFromOwner,
                evidence: self.evidence,
                tailwind: TailwindPlanOptions {
                    context: Some(&context.context),
                    capture: self.capture,
                },
            },
        ))
    }

    #[napi]
    pub fn dispose(&mut self) {
        self.state = None;
    }
}

#[napi]
pub struct PreparedNativeModule {
    state: Option<ParsedModule>,
    options: NativeCompileOptions,
}

#[napi]
impl PreparedNativeModule {
    #[napi(getter)]
    pub fn candidates(&self) -> napi::Result<Vec<String>> {
        candidates(&self.state)
    }

    #[napi]
    pub fn emit(
        &mut self,
        context: &PreparedTailwindContext,
    ) -> napi::Result<CompiledNativeModule> {
        let mut state = self.state.take().ok_or_else(consumed)?;
        Ok(emit_native_module(
            &state.source,
            &state.theme,
            &mut state.parsed,
            NativeModuleOptions {
                text_reference: self.options.text_reference.unwrap_or(false),
                text_inheritance: self.options.text_inheritance.unwrap_or(false),
                text_static: self.options.text_static.unwrap_or(false),
                tailwind: TailwindPlanOptions {
                    context: Some(&context.context),
                    capture: self.options.tailwind_plan.unwrap_or(false),
                },
                ..Default::default()
            },
        ))
    }

    #[napi]
    pub fn dispose(&mut self) {
        self.state = None;
    }
}

#[napi(object)]
#[derive(Default)]
pub struct PreparedWebOptions {
    pub rehome_react_native: Option<bool>,
    pub tag_evidence: Option<bool>,
    pub tailwind_plan: Option<bool>,
}

#[napi]
impl Compiler {
    #[napi]
    pub fn compile_web_or_prepare(
        &self,
        source: String,
        context: &PreparedTailwindContext,
        bindings: Option<Vec<StylexExternalBinding>>,
        options: Option<PreparedWebOptions>,
    ) -> napi::Result<Either<Vec<CompiledComponent>, PreparedWebModule>> {
        // A local Rust owner is cheap; only a completeness miss crosses NAPI
        // as a retained handle with candidate marshalling and later emission.
        finish_web_attempt(self.prepare_web_module(source, bindings, options), context)
    }

    #[napi]
    pub fn prepare_web_module(
        &self,
        source: String,
        bindings: Option<Vec<StylexExternalBinding>>,
        options: Option<PreparedWebOptions>,
    ) -> PreparedWebModule {
        let options = options.unwrap_or_default();
        let bindings = external_bindings(bindings);
        let compat = if options.rehome_react_native.unwrap_or(false) {
            hozo_parser::ReactNativeCompat::Lower
        } else {
            hozo_parser::ReactNativeCompat::OnlyFromOwner
        };
        let parsed = parse_web(
            &source,
            self.sources.as_deref(),
            Some((&self.stylex, &bindings)),
            compat,
            &self.class_helpers,
        );
        PreparedWebModule {
            state: Some(ParsedModule {
                source,
                parsed,
                theme: self.theme.clone(),
            }),
            evidence: options.tag_evidence.unwrap_or(false),
            capture: options.tailwind_plan.unwrap_or(false),
        }
    }

    #[napi]
    pub fn prepare_native_module(
        &self,
        source: String,
        bindings: Option<Vec<StylexExternalBinding>>,
        source_file: Option<String>,
        options: Option<NativeCompileOptions>,
    ) -> napi::Result<PreparedNativeModule> {
        let options = options.unwrap_or_default();
        if options.text_reference.unwrap_or(false) && options.text_inheritance.unwrap_or(false) {
            return Err(napi::Error::from_reason(
                "Select one internal text experiment per compile call",
            ));
        }
        if options.text_static.unwrap_or(false) && !options.text_inheritance.unwrap_or(false) {
            return Err(napi::Error::from_reason(
                "Internal textStatic requires textInheritance",
            ));
        }
        let bindings = external_bindings(bindings);
        let parsed = parse_native_module(
            &source,
            self.sources.as_deref(),
            Some((&self.stylex, &bindings)),
            source_file.as_deref(),
            options.text_static.unwrap_or(false),
            &self.text_forwarding,
            &self.class_helpers,
        );
        Ok(PreparedNativeModule {
            state: Some(ParsedModule {
                source,
                parsed,
                theme: self.theme.clone(),
            }),
            options,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn context() -> PreparedTailwindContext {
        PreparedTailwindContext {
            context: Box::new(
                hozo_ir::TailwindOrderContext::new(hozo_ir::portable_tailwind_snapshot()).unwrap(),
            ),
        }
    }

    #[test]
    fn ready_web_context_emits_without_returning_a_retained_handle() {
        let compiler = Compiler::new(None, None);
        let result = compiler
            .compile_web_or_prepare(
                "const el=<View className=\"p-2\"/>".into(),
                &context(),
                None,
                None,
            )
            .unwrap();
        let Either::A(output) = result else {
            panic!("a complete context must return emitted components");
        };
        assert!(output[0].css.contains("8px"));
    }

    #[test]
    fn incomplete_ready_context_returns_the_exact_owned_parse() {
        let compiler = Compiler::new(None, None);
        let mut prepared =
            compiler.prepare_web_module("const el=<View className=\"p-3\"/>".into(), None, None);
        let state = prepared.state.as_mut().unwrap();
        let roots = state.parsed.roots.as_ptr();
        state.parsed.roots[0].node.style[0].property =
            StyleProperty::PaddingTop(hozo_ir::Length::Px(123.0));
        let Either::B(mut retained) = finish_web_attempt(prepared, &context()).unwrap() else {
            panic!("a missing candidate must preserve the parse, not emit or reparse");
        };
        assert_eq!(
            retained.state.as_ref().unwrap().parsed.roots.as_ptr(),
            roots
        );
        assert!(matches!(
            retained.state.as_ref().unwrap().parsed.roots[0].node.style[0].property,
            StyleProperty::PaddingTop(hozo_ir::Length::Px(123.0))
        ));
        assert_eq!(retained.candidates().unwrap(), ["p-3"]);
        retained.dispose();
    }

    #[test]
    fn emitted_web_uses_the_retained_ir_and_consumes_it_not_a_reparse() {
        let compiler = Compiler::new(None, None);
        let mut prepared =
            compiler.prepare_web_module("const el=<View className=\"p-2\"/>".into(), None, None);
        let state = prepared.state.as_mut().unwrap();
        assert!(Arc::ptr_eq(&compiler.theme, &state.theme));
        state.parsed.roots[0].node.style[0].property =
            StyleProperty::PaddingTop(hozo_ir::Length::Px(123.0));
        drop(compiler);
        let output = prepared.emit(&context()).unwrap();
        assert!(output[0].css.contains("123px"));
        assert!(prepared.state.is_none());
        assert!(prepared.emit(&context()).is_err());
        prepared.dispose();
        assert!(prepared.candidates().is_err());
    }

    #[test]
    fn native_disposal_is_idempotent_and_has_no_global_entry_to_leak() {
        let compiler = Compiler::new(None, None);
        let mut prepared = compiler
            .prepare_native_module(
                "const el=<View className=\"p-2\"/>".into(),
                None,
                None,
                None,
            )
            .unwrap();
        assert_eq!(prepared.candidates().unwrap(), ["p-2"]);
        prepared.dispose();
        prepared.dispose();
        assert!(prepared.state.is_none());
        assert!(prepared.emit(&context()).is_err());
        assert!(context().require_candidates(vec!["p-3".into()]).is_err());
        assert!(context()
            .require_candidates(vec!["notautility".into()])
            .is_ok());
    }
}
