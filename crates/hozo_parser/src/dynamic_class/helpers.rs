//! Which calls are trusted class joiners: `clsx`/`classnames`, `tailwind-merge`,
//! and Hozo's own `cx`, recognised only through a verified import.

use super::*;

/// Import sources whose default export/named exports are trusted to behave
/// like `clsx` (join truthy string arguments with a space) when recognized
/// as a call through the imported binding.
///
/// `tailwind-merge` has separate contracts below. Known merger inputs use
/// right-to-left conflict elimination; an opaque input keeps the whole call
/// at runtime. Treating it as a join would give compiled base rules priority
/// over the caller's conflicting utility (#1668, #1878).
pub(super) const RECOGNIZED_CX_MODULES: [&str; 2] = ["clsx", "classnames"];
pub(super) const TW_MERGE_MODULE: &str = "tailwind-merge";

/// Hozo's own helper (#873), so merging a caller's `className` needs no
/// dependency. Engine owns it and core re-exports it, so both are read.
/// Only the `cx` export is: anything else imported from them, such as a
/// component, is not a class joiner.
pub(super) const HOZO_CX_MODULES: [&str; 2] = ["@hozo/core", "@hozo/engine"];
pub(super) const HOZO_CX_NAME: &str = "cx";

pub(super) fn is_recognized_cx_call(
    callee: &Expression,
    module_record: &Joiners,
) -> Option<HelperKind> {
    let Expression::Identifier(ident) = callee else {
        return None;
    };
    is_recognized_cx_identifier(ident, module_record)
}

pub(super) fn is_recognized_cx_identifier(
    ident: &IdentifierReference,
    joiners: &Joiners,
) -> Option<HelperKind> {
    let import = joiners.import_refs.get(&ident.span.start)?;
    let entry = joiners
        .module_record
        .import_entries
        .iter()
        .find(|entry| entry.local_name.span.start == *import)?;
    helper_import(entry, joiners.helpers)
}

pub(crate) fn helper_import(
    entry: &ImportEntry<'_>,
    helpers: &[ClassHelper],
) -> Option<HelperKind> {
    if entry.is_type {
        return None;
    }
    let module = entry.module_request.name.as_str();
    let imported = match &entry.import_name {
        ImportImportName::Name(n) => n.name.as_str(),
        ImportImportName::Default(_) => "default",
        ImportImportName::NamespaceObject => return None,
    };
    if let Some(helper) = helpers
        .iter()
        .find(|helper| helper.module == module && helper.name == imported)
    {
        if module == TW_MERGE_MODULE && imported == "twMerge" && !helper.merge {
            return None;
        }
        return Some(if helper.merge {
            HelperKind::Merge
        } else {
            HelperKind::Join
        });
    }
    if module == TW_MERGE_MODULE {
        return match imported {
            "twJoin" => Some(HelperKind::StrictJoin),
            _ => None,
        };
    }
    let is_hozo_cx = HOZO_CX_MODULES.contains(&module) && imported == HOZO_CX_NAME;
    (RECOGNIZED_CX_MODULES.contains(&module) || is_hozo_cx).then_some(HelperKind::Join)
}

pub(crate) fn helper_import_offsets(
    module: &ModuleRecord<'_>,
    helpers: &[ClassHelper],
) -> Vec<u32> {
    module
        .import_entries
        .iter()
        .filter(|entry| helper_import(entry, helpers).is_some())
        .map(|entry| entry.local_name.span.start)
        .collect()
}
