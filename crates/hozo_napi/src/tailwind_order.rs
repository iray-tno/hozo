//! RFC 007 binding/compile-plan evidence. Compilation plans its existing IR;
//! separate inspection must not become an adapter's extra parser pass.
use super::{external_bindings, CompileDiagnostic, Compiler, StylexExternalBinding};
use hozo_ir::{TailwindOrderContext, TailwindOrderSnapshot, TailwindRuleBinding, Utf16Offsets};
use napi_derive::napi;

#[napi(object)]
pub struct TailwindCompilePlan {
    pub fingerprint: String,
    pub mode: String,
    pub sites: Vec<TailwindCompileSite>,
}

#[napi(object)]
pub struct TailwindCompileSite {
    pub span_start: u32,
    pub span_end: u32,
    pub class_prop: String,
    pub write_count: u32,
    pub blocks: Vec<TailwindCompileBlock>,
}

#[napi(object)]
pub struct TailwindCompileBlock {
    pub start: u32,
    pub end: u32,
    pub source: String,
    pub input_start: Option<u32>,
    pub utility_id: Option<u32>,
    pub guarded: bool,
    pub status: String,
    pub candidate: Option<String>,
    pub candidate_id: Option<u32>,
    pub rule_ids: Vec<u32>,
    pub writes: Vec<TailwindCompileWrite>,
}

#[napi(object)]
pub struct TailwindCompileWrite {
    pub index: u32,
    pub rule_id: Option<u32>,
    pub css_property: Option<String>,
    pub specificity: Option<Vec<u32>>,
    pub priority_rank: Option<u32>,
    pub important: Option<bool>,
    pub reason: Option<String>,
}

pub fn compile_plan(
    plan: hozo_parser::TailwindRootPlan,
    offsets: &Utf16Offsets,
) -> TailwindCompilePlan {
    TailwindCompilePlan {
        fingerprint: plan.fingerprint,
        mode: "passthrough".into(),
        sites: plan
            .sites
            .into_iter()
            .map(|site| TailwindCompileSite {
                span_start: offsets.at(site.span.start),
                span_end: offsets.at(site.span.end),
                class_prop: site.class_prop.into(),
                write_count: site.write_count as u32,
                blocks: site
                    .blocks
                    .into_iter()
                    .map(|block| {
                        let (source, input) = match block.source.input() {
                            hozo_ir::StyleSource::Tailwind(input) => ("tailwind", Some(input)),
                            hozo_ir::StyleSource::Stylex(input) => ("stylex", Some(input)),
                            _ => ("unspecified", None),
                        };
                        TailwindCompileBlock {
                            start: block.start as u32,
                            end: block.end as u32,
                            source: source.into(),
                            input_start: input.map(|input| offsets.at(input)),
                            utility_id: block.source.utility().map(|id| id.index() as u32),
                            guarded: block.guarded,
                            status: block.status.into(),
                            candidate: block.candidate,
                            candidate_id: block.candidate_id,
                            rule_ids: block.rule_ids,
                            writes: block
                                .writes
                                .into_iter()
                                .map(|write| TailwindCompileWrite {
                                    index: write.index as u32,
                                    rule_id: write.rule_id,
                                    css_property: write.css_property,
                                    specificity: write.specificity.map(|value| value.to_vec()),
                                    priority_rank: write.priority_rank.map(|rank| rank as u32),
                                    important: write.important,
                                    reason: write.reason.map(str::to_owned),
                                })
                                .collect(),
                        }
                    })
                    .collect(),
            })
            .collect(),
    }
}

#[napi(object)]
pub struct TailwindOrderCandidateBinding {
    pub utility_id: u32,
    pub candidate: String,
    pub status: String,
    pub candidate_id: Option<u32>,
    pub rule_ids: Vec<u32>,
}

#[napi(object)]
pub struct TailwindOrderInspection {
    pub fingerprint: Option<String>,
    pub syntax_diagnostics: Vec<CompileDiagnostic>,
    pub candidates: Vec<TailwindOrderCandidateBinding>,
}

pub fn prepare(json: &str) -> napi::Result<Box<TailwindOrderContext>> {
    let snapshot: TailwindOrderSnapshot = serde_json::from_str(json).map_err(|error| {
        napi::Error::from_reason(format!("Invalid Tailwind ordering snapshot: {error}"))
    })?;
    TailwindOrderContext::new(snapshot)
        .map(Box::new)
        .map_err(napi::Error::from_reason)
}

pub fn inspect(
    compiler: &Compiler,
    source: &str,
    bindings: Option<Vec<StylexExternalBinding>>,
    file: Option<&str>,
) -> TailwindOrderInspection {
    let bindings = external_bindings(bindings);
    let parsed = hozo_parser::parse_module_for_file_with_helpers(
        source,
        compiler.sources.as_deref(),
        Some(&compiler.stylex),
        &bindings,
        file,
        &compiler.class_helpers,
    );
    let offsets = Utf16Offsets::new(source);
    let syntax_diagnostics = parsed
        .syntax_errors
        .into_iter()
        .map(|error| CompileDiagnostic {
            code: "SOURCE_SYNTAX_ERROR".into(),
            severity: "error".into(),
            message: error.message,
            span_start: offsets.at(error.span.start),
            span_end: offsets.at(error.span.end),
        })
        .collect();
    // All roots from this parse share one frozen table. Empty roots do not
    // require an empty allocation, nor does each secondary slot rebind it.
    let units = parsed
        .roots
        .iter()
        .find_map(|root| root.tailwind_units.as_deref());
    let bound = compiler
        .tailwind_order
        .as_ref()
        .zip(units)
        .map(|(context, units)| context.bind(units));
    let candidates = units
        .into_iter()
        .flat_map(|units| units.iter())
        .map(|(id, name)| {
            let binding = bound.as_ref().and_then(|bound| bound.get(id));
            let (status, descriptor) = match binding {
                Some(TailwindRuleBinding::Described(candidate)) => ("described", Some(candidate)),
                Some(TailwindRuleBinding::NotGenerated(candidate)) => {
                    ("not-generated", Some(candidate))
                }
                Some(TailwindRuleBinding::Uncollected) => ("uncollected", None),
                None => ("no-context", None),
            };
            TailwindOrderCandidateBinding {
                utility_id: id.index() as u32,
                candidate: name.into(),
                status: status.into(),
                candidate_id: descriptor.map(|candidate| candidate.id),
                rule_ids: descriptor.map_or_else(Vec::new, |candidate| {
                    candidate.rules.iter().map(|rule| rule.id).collect()
                }),
            }
        })
        .collect();
    TailwindOrderInspection {
        fingerprint: compiler
            .tailwind_order
            .as_ref()
            .map(|context| context.snapshot().fingerprint.clone()),
        syntax_diagnostics,
        candidates,
    }
}
