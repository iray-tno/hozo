//! A write plan owns the existing declaration allocation. This first stage
//! is pass-through: rule assessment/comparison may later reorder writes here,
//! never expressions or independently in a platform emitter.
use crate::{Condition, StyleDeclaration, StyleSource, TailwindRuleBinding, TailwindUnitBindings};
use std::ops::Range;

pub struct TailwindWritePlan<'a> {
    declarations: Vec<StyleDeclaration>,
    bindings: &'a TailwindUnitBindings<'a>,
}

pub struct TailwindWriteBlock<'a> {
    pub range: Range<usize>,
    pub source: StyleSource,
    pub condition: &'a Condition,
    pub declarations: &'a [StyleDeclaration],
    /// None means no retained utility identity; not a default rule/rank.
    pub binding: Option<TailwindRuleBinding<'a>>,
}

impl<'a> TailwindWritePlan<'a> {
    pub fn passthrough(
        declarations: Vec<StyleDeclaration>,
        bindings: &'a TailwindUnitBindings<'a>,
    ) -> Self {
        Self {
            declarations,
            bindings,
        }
    }

    /// Adjacent writes only. A repeated input/utility/guard after another
    /// block must not be merged backwards across that intervening write.
    pub fn blocks(&self) -> impl Iterator<Item = TailwindWriteBlock<'_>> {
        let mut start = 0;
        self.declarations
            .chunk_by(|a, b| a.source == b.source && a.condition == b.condition)
            .map(move |declarations| {
                let source = declarations[0].source;
                let range = start..start + declarations.len();
                start = range.end;
                TailwindWriteBlock {
                    range,
                    source,
                    condition: &declarations[0].condition,
                    declarations,
                    binding: source.utility().and_then(|id| self.bindings.get(id)),
                }
            })
    }

    /// Moving out returns the exact allocation and predicates, not expanded
    /// copies rebuilt from a report. No dedupe, folding or sorting yet.
    pub fn into_declarations(self) -> Vec<StyleDeclaration> {
        self.declarations
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        OrderCandidateDescriptor, OrderCandidateStatus, StyleProperty, TailwindOrderContext,
        TailwindOrderSnapshot, TailwindUnitsBuilder,
    };

    #[test]
    fn plan_preserves_allocation_guard_identity_and_nonadjacent_input_boundaries() {
        let mut names = TailwindUnitsBuilder::default();
        let utility = names.intern("p-2");
        let units = names.finish().unwrap();
        let context = TailwindOrderContext::new(TailwindOrderSnapshot {
            schema: 1,
            policy: "tailwind-rule-signatures-v1".into(),
            tailwind_version: "test".into(),
            fingerprint: "a".repeat(64),
            stylesheets: vec![],
            candidates: vec![OrderCandidateDescriptor {
                id: 0,
                candidate: "p-2".into(),
                status: OrderCandidateStatus::NotGenerated,
                first_rule_rank: None,
                rules: vec![],
            }],
        })
        .unwrap();
        let bindings = context.bind(&units);
        let tw = StyleSource::TailwindUtility { input: 10, utility };
        let original = vec![
            (tw, Condition::Always),
            (tw, Condition::Always),
            (StyleSource::Stylex(20), Condition::Focus),
            (tw, Condition::Always),
            (tw, Condition::Hover),
            (StyleSource::Unspecified, Condition::Always),
        ]
        .into_iter()
        .map(|(source, condition)| StyleDeclaration {
            source,
            condition,
            property: StyleProperty::Opacity(0.5),
        })
        .collect::<Vec<_>>();
        let expected = original.clone();
        let pointer = original.as_ptr();
        let capacity = original.capacity();
        let plan = TailwindWritePlan::passthrough(original, &bindings);
        let blocks = plan.blocks().collect::<Vec<_>>();
        assert_eq!(
            blocks
                .iter()
                .map(|block| block.range.clone())
                .collect::<Vec<_>>(),
            [0..2, 2..3, 3..4, 4..5, 5..6]
        );
        assert!(matches!(
            blocks[0].binding,
            Some(TailwindRuleBinding::NotGenerated(_))
        ));
        assert!(blocks[1].binding.is_none());
        assert!(blocks[4].binding.is_none());
        assert!(std::ptr::eq(
            blocks[3].condition,
            &plan.declarations[4].condition
        ));
        assert_eq!(blocks[0].declarations.as_ptr(), pointer);
        let after = plan.into_declarations();
        assert_eq!(after.as_ptr(), pointer);
        assert_eq!(after.capacity(), capacity);
        assert_eq!(after, expected);
    }
}
