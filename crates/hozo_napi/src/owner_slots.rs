//! Opt-in caller facts, with JS-facing UTF-16 coordinates. Not a rewrite API.
use super::*;

#[napi(object)]
pub struct OwnerSlotBinding {
    pub source: String,
    pub imported: String,
    pub class_prop: String,
    pub prepared_prop: String,
}
#[napi(object)]
pub struct OwnerSlotSite {
    pub target: u32,
    pub span_start: u32,
    pub span_end: u32,
    pub classes: Option<String>,
    pub reason: Option<String>,
}
#[napi(object)]
pub struct OwnerSlotInspection {
    pub insertion_offset: u32,
    pub sites: Vec<OwnerSlotSite>,
    pub diagnostics: Vec<CompileDiagnostic>,
}

#[napi]
pub fn inspect_owner_class_slots(
    source: String,
    targets: Vec<OwnerSlotBinding>,
    source_file: Option<String>,
) -> napi::Result<OwnerSlotInspection> {
    let identifier = |value: &str| {
        !value.is_empty()
            && value.chars().enumerate().all(|(i, c)| {
                c.is_ascii_alphabetic() || c == '_' || c == '$' || (i > 0 && c.is_ascii_digit())
            })
    };
    let mut unique = std::collections::HashSet::new();
    if targets.len() > 64
        || targets.iter().any(|target| {
            target.source.is_empty()
                || !identifier(&target.imported)
                || !identifier(&target.class_prop)
                || !identifier(&target.prepared_prop)
                || target.class_prop == target.prepared_prop
                || !unique.insert((&target.source, &target.imported, &target.class_prop))
        })
    {
        return Err(napi::Error::from_reason(
            "Invalid or duplicate owner slot binding",
        ));
    }
    let bindings = targets
        .into_iter()
        .map(|t| hozo_parser::OwnerSlotBinding {
            source: t.source,
            imported: t.imported,
            class_prop: t.class_prop,
            prepared_prop: t.prepared_prop,
        })
        .collect::<Vec<_>>();
    let result = hozo_parser::inspect_owner_class_slots(&source, &bindings, source_file.as_deref());
    let offsets = Utf16Offsets::new(&source);
    Ok(OwnerSlotInspection {
        insertion_offset: offsets.at(result.insertion_offset),
        sites: result
            .sites
            .into_iter()
            .map(|site| OwnerSlotSite {
                target: site.target as u32,
                span_start: offsets.at(site.span.start),
                span_end: offsets.at(site.span.end),
                classes: site.classes,
                reason: site.reason.map(str::to_string),
            })
            .collect(),
        diagnostics: result
            .diagnostics
            .into_iter()
            .map(|d| CompileDiagnostic {
                code: "OWNER_SLOT_ANALYSIS_FAILED".into(),
                severity: "error".into(),
                message: d.message,
                span_start: offsets.at(d.span.start),
                span_end: offsets.at(d.span.end),
            })
            .collect(),
    })
}
