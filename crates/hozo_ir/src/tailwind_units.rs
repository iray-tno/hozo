//! Compilation-owned utility names, before expansion erases their identity.
//! IDs name candidates, not upstream rules: binding a multi-rule candidate to
//! a prepared descriptor remains separate work, never an assumed rule zero.
use std::collections::HashMap;
use std::sync::Arc;

/// Local to the owning root's `TailwindUnits`, never a global ordering rank.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct TailwindUtilityId(u32);

#[derive(Debug, Default, PartialEq, Eq)]
pub struct TailwindUnits {
    candidates: Box<[Box<str>]>,
}

impl TailwindUnits {
    pub fn candidate(&self, id: TailwindUtilityId) -> Option<&str> {
        self.candidates.get(id.0 as usize).map(AsRef::as_ref)
    }

    pub fn len(&self) -> usize {
        self.candidates.len()
    }

    pub fn is_empty(&self) -> bool {
        self.candidates.is_empty()
    }
}

/// One interner per parse, not one string/Arc per expanded declaration. The
/// lookup map is discarded at freeze; roots retain only one shared name table.
#[derive(Default)]
pub struct TailwindUnitsBuilder {
    ids: HashMap<Box<str>, TailwindUtilityId>,
}

impl TailwindUnitsBuilder {
    pub fn intern(&mut self, candidate: &str) -> TailwindUtilityId {
        if let Some(id) = self.ids.get(candidate) {
            return *id;
        }
        let id = TailwindUtilityId(u32::try_from(self.ids.len()).expect("utility ID capacity"));
        self.ids.insert(candidate.into(), id);
        id
    }

    /// Class-free modules allocate no shared table. A detached/cloned parser
    /// root retains this Arc even after the rest of the parsed module is gone.
    pub fn finish(self) -> Option<Arc<TailwindUnits>> {
        if self.ids.is_empty() {
            return None;
        }
        let mut candidates = vec![Box::<str>::from(""); self.ids.len()];
        for (name, id) in self.ids {
            candidates[id.0 as usize] = name;
        }
        Some(Arc::new(TailwindUnits {
            candidates: candidates.into_boxed_slice(),
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_are_interned_once_in_observed_order_and_empty_modules_allocate_nothing() {
        assert!(TailwindUnitsBuilder::default().finish().is_none());
        let mut builder = TailwindUnitsBuilder::default();
        let first = builder.intern("p-2");
        let second = builder.intern("hover:p-2");
        assert_eq!(builder.intern("p-2"), first);
        assert_ne!(first, second);
        let units = builder.finish().unwrap();
        assert_eq!(units.len(), 2);
        assert_eq!(units.candidate(first), Some("p-2"));
        assert_eq!(units.candidate(second), Some("hover:p-2"));
        assert_eq!(units.candidate(TailwindUtilityId(2)), None);
    }

    #[test]
    fn utility_identity_does_not_change_the_existing_input_grouping() {
        use crate::{group_by_condition, Condition, StyleDeclaration, StyleProperty, StyleSource};
        let mut builder = TailwindUnitsBuilder::default();
        let first = builder.intern("hover:opacity-25");
        let second = builder.intern("hover:opacity-50");
        let declarations = [first, second].map(|utility| StyleDeclaration {
            source: StyleSource::TailwindUtility { input: 10, utility },
            condition: Condition::Hover,
            property: StyleProperty::Opacity(0.5),
        });
        let mut legacy = declarations.clone();
        for declaration in &mut legacy {
            declaration.source = declaration.source.input();
        }
        assert_eq!(
            group_by_condition(&declarations),
            group_by_condition(&legacy)
        );
        assert_eq!(group_by_condition(&declarations).len(), 1);
        assert_ne!(declarations[0].source, declarations[1].source);
        let changed = declarations[0].source.with_tailwind_input(20);
        assert_eq!(changed.utility(), Some(first));
        assert_eq!(changed.input(), StyleSource::Tailwind(20));
    }
}
