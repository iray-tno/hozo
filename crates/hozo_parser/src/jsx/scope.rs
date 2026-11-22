//! What an element's conversion can see: the source, imports and allocator.

use hozo_ir::Primitive;
use oxc_syntax::module_record::ModuleRecord;

use super::primitives::primitive_for_name;
use crate::dynamic_class;

/// What the walk needs to know about the module it is reading.
///
/// `module_record` was threaded through every builder already;
/// `foreign` rides with it because it answers the same kind of question --
/// which bindings this file actually has and where they came from.
pub(crate) struct Scope<'r, 'a> {
    pub module_record: &'r ModuleRecord<'a>,
    /// What each `{...rest}` cannot carry, by reference offset (#656).
    pub rest_exclusions: &'r crate::rest::RestExclusions,
    /// Module-level string constants, by reference offset.
    pub constants: &'r crate::rest::ConstantStrings,
    pub helper_import_refs: &'r crate::rest::ImportReferences,
    /// Functions the project declares join classes as `clsx` does (#964).
    pub class_helpers: &'r [dynamic_class::ClassHelper],
    pub tailwind_units: std::cell::RefCell<hozo_ir::TailwindUnitsBuilder>,
    /// Primitive-named locals imported from a module the project does not
    /// trust.
    ///
    /// A tag naming one of these is carried verbatim rather than lowered,
    /// which is the whole of `@expo/ui` support: that package exports
    /// `Text`, `Button`, `List`, `ListItem`, `ScrollView` and
    /// `TextInput`, and every one of them is a native platform component
    /// with nothing in common with the Hozo primitive of the same name
    /// beyond the spelling.
    pub foreign: &'r std::collections::HashSet<String>,
    /// Local import binding to the canonical primitive export it names.
    /// `Text as RNText` therefore builds the same IR as `Text`, while the
    /// source-facing local name remains available for import bookkeeping.
    pub primitive_aliases: &'r std::collections::HashMap<String, String>,
    /// Whether a primitive-shaped local may lower without a trusted import.
    ///
    /// The unconstrained parser keeps this for low-level callers and compact
    /// fixtures. A project compiler always supplies its trusted source list;
    /// there, a same-file `function Text()` is application code rather than
    /// evidence that the author meant Hozo's `Text`.
    pub allow_unbound_primitives: bool,
    /// Trusted local bindings for React Native's `Animated` namespace.
    pub animated_namespaces: &'r std::collections::HashSet<String>,
    /// Static same-file StyleX definitions available to JSX spreads.
    pub stylex: crate::stylex::Frontend,
}

impl Scope<'_, '_> {
    pub(super) fn utility_source(&self, token: &str, input: u32) -> hozo_ir::StyleSource {
        hozo_ir::StyleSource::TailwindUtility {
            input,
            utility: self.tailwind_units.borrow_mut().intern(token),
        }
    }

    pub(super) fn primitive_for_local(&self, local: &str) -> Option<Primitive> {
        if self.foreign.contains(local) {
            return None;
        }
        let canonical = match self.primitive_aliases.get(local) {
            Some(canonical) => canonical.as_str(),
            None if self.allow_unbound_primitives => local,
            None => return None,
        };
        primitive_for_name(canonical)
    }
}
