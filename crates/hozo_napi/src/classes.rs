//! Reports on class strings: helpers, and what Native draws from them.

use hozo_ir::Utf16Offsets;
use napi_derive::napi;

/// A class-joining function, by the specifier callers import it from and
/// the name they import (`default` for a default import).
#[napi(object)]
pub struct ClassHelper {
    pub module: String,
    pub name: String,
    pub merge: Option<bool>,
    pub merge_config: Option<String>,
}

/// An import a file calls inside a `className` that is not a joiner the
/// compiler already recognizes: worth resolving to see if it is one (#964).
#[napi(object)]
pub struct ClassHelperCandidate {
    pub specifier: String,
    pub imported: String,
}

/// A class React Native cannot draw (#1165). `kind` is `missing` (something
/// the Web draws and Native does not) or `cosmetic` (a cursor shape or a CSS
/// transition, which nobody would see as broken).
#[napi(object)]
pub struct NativeClassVerdict {
    pub kind: String,
    pub reason: String,
}

/// One such class in a module's class prop.
#[napi(object)]
pub struct NativeClassFinding {
    pub element: String,
    pub prop: String,
    pub class_name: String,
    pub kind: String,
    pub reason: String,
    pub span_start: u32,
    pub span_end: u32,
}

pub(super) fn native_class_kind(kind: hozo_native::NativeClassKind) -> String {
    match kind {
        hozo_native::NativeClassKind::Missing => "missing",
        hozo_native::NativeClassKind::Cosmetic => "cosmetic",
    }
    .to_string()
}

/// Every class in the module's `className` and `*ClassName` props, on any
/// element, that React Native cannot draw.
#[napi]
pub fn native_class_report(source: String) -> Vec<NativeClassFinding> {
    hozo_native::native_class_report(&source)
        .into_iter()
        .map(|finding| NativeClassFinding {
            element: finding.element,
            prop: finding.prop,
            class_name: finding.class_name,
            kind: native_class_kind(finding.kind),
            reason: finding.reason,
            span_start: finding.span.start,
            span_end: finding.span.end,
        })
        .collect()
}

#[napi(object)]
pub struct ComponentClassList {
    /// The element as written: `Button`, `Tabs.Trigger`.
    pub element: String,
    pub prop: String,
    /// The attribute, in UTF-16 offsets.
    pub span_start: u32,
    pub span_end: u32,
    /// The element's name, in UTF-16 offsets.
    pub element_start: u32,
}

pub(super) fn component_class_lists(
    source: &str,
    parsed: &hozo_parser::ParseOutput,
) -> Vec<ComponentClassList> {
    let offsets = Utf16Offsets::new(source);
    hozo_native::component_class_lists(parsed)
        .into_iter()
        .map(|list| ComponentClassList {
            element: list.element.clone(),
            prop: list.prop.clone(),
            span_start: offsets.at(list.span.start),
            span_end: offsets.at(list.span.end),
            element_start: offsets.at(list.element_span.start),
        })
        .collect()
}

/// The classes the verdict calls missing that the static backend draws on
/// the element they are written on, which `native_class_report` leaves out.
#[napi]
pub fn native_classes_drawn_statically(source: String) -> Vec<String> {
    hozo_native::native_classes_drawn_statically(&source)
}

/// The same verdict for loose class names, such as a look module's
/// constants, in order; `null` for a class React Native can draw.
#[napi]
pub fn native_class_verdicts(class_names: Vec<String>) -> Vec<Option<NativeClassVerdict>> {
    class_names
        .iter()
        .map(|name| {
            hozo_native::native_class_verdict(name).map(|verdict| NativeClassVerdict {
                kind: native_class_kind(verdict.kind),
                reason: verdict.reason,
            })
        })
        .collect()
}

#[napi]
pub fn class_helper_candidates(source: String) -> Vec<ClassHelperCandidate> {
    hozo_parser::class_helper_candidates(&source)
        .into_iter()
        .map(|c| ClassHelperCandidate {
            specifier: c.specifier,
            imported: c.imported,
        })
        .collect()
}

/// The names a file exports that only join their arguments as `clsx` does
/// (#964). `default` for a default export.
#[napi]
pub fn summarize_class_helpers(source: String) -> Vec<String> {
    hozo_parser::summarize_class_helpers(&source)
}

/// Subset of [`summarize_class_helpers`] that call `twMerge` (#1676).
#[napi]
pub fn summarize_class_helper_merges(source: String) -> Vec<String> {
    hozo_parser::summarize_class_helper_merges(&source)
}
