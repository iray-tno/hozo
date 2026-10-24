//! Opt-in RFC 007 binding evidence. Ordinary emitters do not consume this
//! context yet; inspection must not become an adapter's extra parser pass.
use super::{external_bindings, CompileDiagnostic, Compiler, StylexExternalBinding};
use hozo_ir::{TailwindOrderContext, TailwindOrderSnapshot, TailwindRuleBinding, Utf16Offsets};
use napi_derive::napi;

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
