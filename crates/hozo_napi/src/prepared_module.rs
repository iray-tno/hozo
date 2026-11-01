//! An opt-in collect/prepare/emit boundary. Retain owned IR, never an AST
//! allocator or a token into a global compiler cache. Emit consumes it once.
use super::*;
use napi::bindgen_prelude::Either;

#[napi]
pub struct PreparedTailwindContext {
    pub(super) context: Box<hozo_ir::TailwindOrderContext>,
    // An immutable output capability, never a mutable compiler default.
    pub(super) ordered: bool,
}

pub(super) fn final_fingerprint(fingerprint: &str) -> String {
    format!("{}:{fingerprint}", hozo_ir::TAILWIND_SCALAR_ORDER_POLICY)
}

#[napi(object)]
pub struct TailwindRuleOrderEntry {
    pub candidate_id: u32,
    pub rule_id: u32,
}

#[napi(object)]
pub struct TailwindRuleOrder {
    pub fingerprint: String,
    pub rules: Vec<TailwindRuleOrderEntry>,
}

#[napi(object)]
pub struct TailwindRulePriorityEntry {
    pub candidate_id: u32,
    pub rule_id: u32,
    pub rank: Option<u32>,
    pub important: Option<bool>,
    pub specificity: Option<Vec<u32>>,
    pub reason: Option<String>,
}

#[napi(object)]
pub struct TailwindRulePriorities {
    pub fingerprint: String,
    pub rules: Vec<TailwindRulePriorityEntry>,
}

#[napi]
pub fn prepare_tailwind_context(snapshot: String) -> napi::Result<PreparedTailwindContext> {
    Ok(PreparedTailwindContext {
        context: tailwind_order::prepare(&snapshot)?,
        ordered: false,
    })
}

/// The finite publisher creates this only after collecting all its inputs.
/// Ordinary per-file sessions retain their pass-through output policy.
#[napi]
pub fn prepare_final_tailwind_context(snapshot: String) -> napi::Result<PreparedTailwindContext> {
    Ok(PreparedTailwindContext {
        context: tailwind_order::prepare(&snapshot)?,
        ordered: true,
    })
}

#[napi]
impl PreparedTailwindContext {
    #[napi(getter)]
    pub fn fingerprint(&self) -> String {
        if self.ordered {
            final_fingerprint(&self.context.snapshot().fingerprint)
        } else {
            self.context.snapshot().fingerprint.clone()
        }
    }

    /// Build-time namespace data, not a device sort or an assessment of which
    /// rules Hozo can lower. The native index is reused; JS receives a copy.
    #[napi]
    pub fn rule_order(&self) -> TailwindRuleOrder {
        TailwindRuleOrder {
            fingerprint: self.fingerprint(),
            rules: self
                .context
                .rules_in_emission_order()
                .map(|(candidate, rule)| TailwindRuleOrderEntry {
                    candidate_id: candidate.id,
                    rule_id: rule.id,
                })
                .collect(),
        }
    }

    /// The same assessed priorities the actual module plan consumes. Unknown
    /// shapes stay explicit; these IDs/ranks cannot cross context namespaces.
    #[napi]
    pub fn rule_priorities(&self) -> TailwindRulePriorities {
        TailwindRulePriorities {
            fingerprint: self.fingerprint(),
            rules: self
                .context
                .rules_in_emission_order()
                .map(|(candidate, rule)| {
                    let mut entry = TailwindRulePriorityEntry {
                        candidate_id: candidate.id,
                        rule_id: rule.id,
                        rank: None,
                        important: None,
                        specificity: None,
                        reason: None,
                    };
                    match self.context.rule_priority(candidate, rule.id) {
                        Some(Ok(priority)) => {
                            entry.rank = Some(priority.rank as u32);
                            entry.important = Some(priority.important);
                            entry.specificity = Some(priority.specificity.to_vec());
                        }
                        Some(Err(reason)) => entry.reason = Some(reason.reason().into()),
                        None => entry.reason = Some("uncollected-rule-priority".into()),
                    }
                    entry
                })
                .collect(),
        }
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
    if complete_in_context(state, context) {
        Ok(Either::A(prepared.emit(context)?))
    } else {
        Ok(Either::B(prepared))
    }
}

fn complete_in_context(state: &ParsedModule, context: &PreparedTailwindContext) -> bool {
    parsed_candidates(&state.parsed).all(|name| context.context.lookup(name).is_some())
}

fn finish_native_attempt(
    mut prepared: PreparedNativeModule,
    context: &PreparedTailwindContext,
) -> napi::Result<Either<CompiledNativeModule, PreparedNativeModule>> {
    let state = prepared.state.as_ref().ok_or_else(consumed)?;
    if complete_in_context(state, context) {
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

    /// Bundlers must discover imports before their graph is complete. Borrow
    /// the owned parse for the existing output; keep the final emit one-shot.
    /// No allocator/AST clone or second source parse is retained here.
    #[napi]
    pub fn preview(&mut self) -> napi::Result<Vec<CompiledComponent>> {
        let state = self.state.as_mut().ok_or_else(consumed)?;
        Ok(emit_web(
            &state.source,
            &state.theme,
            &mut state.parsed,
            WebModuleOptions {
                compat: hozo_parser::ReactNativeCompat::OnlyFromOwner,
                evidence: self.evidence,
                tailwind: TailwindPlanOptions::default(),
            },
        ))
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
                    ordered: context.ordered,
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
                owner_style: self.options.owner_style.unwrap_or(false),
                owner_facts: self.options.owner_facts()?,
                text_reference: self.options.text_reference.unwrap_or(false),
                text_inheritance: self.options.text_inheritance.unwrap_or(false),
                text_static: self.options.text_static.unwrap_or(false),
                tailwind: TailwindPlanOptions {
                    context: Some(&context.context),
                    capture: self.options.tailwind_plan.unwrap_or(false),
                    ordered: context.ordered,
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
    pub fn compile_native_or_prepare(
        &self,
        source: String,
        context: &PreparedTailwindContext,
        bindings: Option<Vec<StylexExternalBinding>>,
        source_file: Option<String>,
        options: Option<NativeCompileOptions>,
    ) -> napi::Result<Either<CompiledNativeModule, PreparedNativeModule>> {
        finish_native_attempt(
            self.prepare_native_module(source, bindings, source_file, options)?,
            context,
        )
    }

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
        options.validate_owner_style()?;
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
            ordered: false,
        }
    }

    #[test]
    fn web_preview_borrows_the_same_ir_until_final_emit_or_disposal() {
        let compiler = Compiler::new(None, None);
        let source = "import {Pressable} from '@hozo/core';const A=()=> <Pressable className=\"p-4 p-2 focus:bg-blue-500\"/>";
        let mut module = compiler.prepare_web_module(source.into(), None, None);
        let before = module.state.as_ref().unwrap().parsed.roots[0]
            .node
            .style
            .as_ptr();
        let first = module.preview().unwrap();
        let second = module.preview().unwrap();
        assert_eq!(first[0].jsx, second[0].jsx);
        assert_eq!(first[0].css, second[0].css);
        assert_eq!(
            module.state.as_ref().unwrap().parsed.roots[0]
                .node
                .style
                .as_ptr(),
            before
        );
        let mut final_context = context();
        final_context.ordered = true;
        let output = module.emit(&final_context).unwrap();
        assert_eq!(first[0].jsx, output[0].jsx);
        assert_ne!(first[0].css, output[0].css);
        assert!(module.preview().is_err());
        assert!(module.emit(&final_context).is_err());
        module.dispose();
        let mut discarded = compiler.prepare_web_module(source.into(), None, None);
        discarded.preview().unwrap();
        discarded.dispose();
        assert!(discarded.preview().is_err());
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
    fn ready_native_context_returns_the_complete_module_and_validates_options() {
        let compiler = Compiler::new(None, None);
        let Either::A(output) = compiler
            .compile_native_or_prepare(
                "const el=<View className=\"p-2\"/>".into(),
                &context(),
                None,
                None,
                None,
            )
            .unwrap()
        else {
            panic!("a complete Native parse must not return a retained handle");
        };
        assert!(output.components[0].styles.contains("8"));
        assert!(compiler
            .compile_native_or_prepare(
                "".into(),
                &context(),
                None,
                None,
                Some(NativeCompileOptions {
                    text_reference: Some(true),
                    text_inheritance: Some(true),
                    ..Default::default()
                }),
            )
            .is_err());
    }

    #[test]
    fn incomplete_native_context_retains_ir_and_text_options() {
        let compiler = Compiler::new(None, None);
        let mut prepared = compiler
            .prepare_native_module(
                "const el=<View className=\"p-3\"/>".into(),
                None,
                Some("Label.tsx".into()),
                Some(NativeCompileOptions {
                    text_inheritance: Some(true),
                    ..Default::default()
                }),
            )
            .unwrap();
        let state = prepared.state.as_mut().unwrap();
        let roots = state.parsed.roots.as_ptr();
        state.parsed.roots[0].node.style[0].property =
            StyleProperty::PaddingTop(hozo_ir::Length::Px(123.0));
        let Either::B(mut retained) = finish_native_attempt(prepared, &context()).unwrap() else {
            panic!("missing Native candidates must retain the original parse");
        };
        assert_eq!(
            retained.state.as_ref().unwrap().parsed.roots.as_ptr(),
            roots
        );
        assert!(matches!(
            retained.state.as_ref().unwrap().parsed.roots[0].node.style[0].property,
            StyleProperty::PaddingTop(hozo_ir::Length::Px(123.0))
        ));
        assert_eq!(retained.options.text_inheritance, Some(true));
        assert_eq!(retained.candidates().unwrap(), ["p-3"]);
        retained.dispose();
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

    #[test]
    fn common_scalar_ir_reaches_the_real_web_and_native_emitters_without_a_new_compile_flag() {
        let context = context();
        let compiler = Compiler::new(None, None);
        let outputs = |classes: &str, ordered: bool| {
            let source = format!("import {{Pressable}} from '@hozo/core'; const el=<Pressable className=\"{classes}\"/>;");
            let mut web = compiler.prepare_web_module(source.clone(), None, None);
            let mut native = compiler
                .prepare_native_module(source, None, None, None)
                .unwrap();
            if ordered {
                for parsed in [
                    &mut web.state.as_mut().unwrap().parsed,
                    &mut native.state.as_mut().unwrap().parsed,
                ] {
                    hozo_parser::order_module_tailwind(parsed, &context.context);
                    assert!(
                        parsed.roots[0].node.style.iter().any(|decl| matches!(
                            decl.source,
                            hozo_ir::StyleSource::TailwindOrdered { .. }
                        )),
                        "{:?}",
                        parsed.roots[0].node.style
                    );
                }
            }
            (web.emit(&context).unwrap(), native.emit(&context).unwrap())
        };
        let ascending = "p-2 p-4 focus:bg-blue-500 active:p-4";
        let reversed = "active:p-4 focus:bg-blue-500 p-4 p-2";
        let (expected_web, expected_native) = outputs(ascending, false);
        for classes in [ascending, reversed] {
            let (web, native) = outputs(classes, true);
            assert_eq!(web[0].css, expected_web[0].css, "{classes}");
            assert_eq!(
                native.components[0].styles, expected_native.components[0].styles,
                "{classes}"
            );
            assert!(web[0].diagnostics.is_empty());
            assert!(native.components[0].diagnostics.is_empty());
        }
        let (old_web, old_native) = outputs(reversed, false);
        assert_ne!(
            old_web[0].css, expected_web[0].css,
            "ordinary adapter output remains the control"
        );
        assert_ne!(
            old_native.components[0].styles,
            expected_native.components[0].styles
        );
    }
}
