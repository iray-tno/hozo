//! A bounded author-rule priority in one utility input tier, not a complete
//! CSS cascade or permission to reorder authored expressions/unknown writes.
use super::TailwindOrderContext;
use crate::{
    assess_tailwind_rule, assess_tailwind_write, RuleAssessmentError, StyleProperty,
    TailwindWriteOwnership,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TailwindRulePriority {
    /// Relative to assessed rules in this context only, not an emission rank.
    pub rank: usize,
    pub important: bool,
    pub specificity: [u32; 3],
}

/// Shared evidence for an original IR write, before either backend expands
/// it. The index belongs to its containing write group, not an RN style key.
#[derive(Debug)]
pub struct TailwindWriteEvidence {
    pub index: usize,
    pub rule_id: Option<u32>,
    pub css_property: Option<String>,
    pub specificity: Option<[u32; 3]>,
    pub priority_rank: Option<usize>,
    pub important: Option<bool>,
    pub reason: Option<&'static str>,
}

impl TailwindWriteEvidence {
    pub fn unknown(index: usize, reason: &'static str) -> Self {
        Self {
            index,
            rule_id: None,
            css_property: None,
            specificity: None,
            priority_rank: None,
            important: None,
            reason: Some(reason),
        }
    }
}

impl TailwindOrderContext {
    /// Both actual static plans and candidate generation ask this same
    /// boundary. Neither reconstructs selector ownership or priority policy.
    pub fn write_evidence(
        &self,
        name: &str,
        index: usize,
        property: &StyleProperty,
    ) -> TailwindWriteEvidence {
        let Some(candidate) = self.lookup(name) else {
            return TailwindWriteEvidence::unknown(index, "uncollected");
        };
        if candidate.rules.is_empty() {
            return TailwindWriteEvidence::unknown(index, "not-generated");
        }
        match assess_tailwind_write(candidate, property) {
            TailwindWriteOwnership::Unique {
                rule_id,
                css_property,
                specificity,
            } => {
                let mut result = TailwindWriteEvidence::unknown(index, "uncollected-rule-priority");
                result.rule_id = Some(rule_id);
                result.css_property = Some(css_property.into());
                result.specificity = Some(specificity);
                match self.rule_priority(candidate, rule_id) {
                    Some(Ok(priority)) => {
                        result.priority_rank = Some(priority.rank);
                        result.important = Some(priority.important);
                        result.reason = None;
                    }
                    Some(Err(reason)) => result.reason = Some(reason.reason()),
                    None => {}
                }
                result
            }
            TailwindWriteOwnership::Unknown(reason) => {
                TailwindWriteEvidence::unknown(index, reason)
            }
        }
    }
}

pub(super) fn prepare(
    context: &TailwindOrderContext,
) -> Vec<Result<TailwindRulePriority, RuleAssessmentError>> {
    // Snapshot rule IDs are validated contiguous in descriptor order. Only
    // successful assessment gets an entry; unknown rules never receive rank 0.
    let mut priorities: Vec<_> = context
        .snapshot()
        .candidates
        .iter()
        .flat_map(|candidate| {
            candidate.rules.iter().map(|rule| {
                assess_tailwind_rule(&candidate.candidate, rule).map(|assessed| {
                    TailwindRulePriority {
                        // Assigned below for every assessed rule before the
                        // completed cache is exposed to any caller.
                        rank: 0,
                        important: rule.important,
                        specificity: assessed.specificity,
                    }
                })
            })
        })
        .collect();
    let mut order: Vec<_> = context
        .rules_in_emission_order()
        .filter_map(|(_, rule)| {
            priorities[rule.id as usize]
                .is_ok()
                .then_some(rule.id as usize)
        })
        .collect();
    // Stable sorting retains the shared emission order for equal importance
    // and specificity. No JS comparator or utility-family table is needed.
    order.sort_by_key(|&id| {
        let priority = priorities[id].as_ref().unwrap();
        (priority.important, priority.specificity)
    });
    for (rank, id) in order.into_iter().enumerate() {
        priorities[id].as_mut().unwrap().rank = rank;
    }
    priorities
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::portable_tailwind_snapshot;

    fn rank(context: &TailwindOrderContext, name: &str) -> usize {
        let candidate = context.lookup(name).unwrap();
        context
            .rule_priority(candidate, candidate.rules[0].id)
            .unwrap()
            .unwrap()
            .rank
    }

    #[test]
    fn importance_and_assessed_specificity_precede_emission_and_share_one_lazy_index() {
        let context = TailwindOrderContext::new(portable_tailwind_snapshot()).unwrap();
        assert!(context.rule_priorities.get().is_none());
        assert!(rank(&context, "focus:p-4") < rank(&context, "active:p-4"));
        assert!(rank(&context, "active:p-4") < rank(&context, "hover:focus:p-4"));
        assert!(rank(&context, "hover:focus:p-4") < rank(&context, "p-2!"));
        assert!(rank(&context, "p-2!") < rank(&context, "hover:p-2!"));
        let pointer = context.rule_priorities.get().unwrap().as_ptr();
        assert!(rank(&context, "p-2") < rank(&context, "p-4"));
        assert_eq!(pointer, context.rule_priorities.get().unwrap().as_ptr());
    }

    #[test]
    fn unassessed_rules_missing_rules_and_foreign_descriptors_never_receive_priorities() {
        let context = TailwindOrderContext::new(portable_tailwind_snapshot()).unwrap();
        for name in ["sm:p-2", "group-hover:p-2", "[&:where(:hover)]:p-2"] {
            let candidate = context.lookup(name).unwrap();
            assert!(context
                .rule_priority(candidate, candidate.rules[0].id)
                .unwrap()
                .is_err());
        }
        let own = context.lookup("p-2").unwrap();
        assert!(context.rule_priority(own, u32::MAX).is_none());
        let other_rule = context.lookup("p-4").unwrap().rules[0].id;
        assert!(context.rule_priority(own, other_rule).is_none());
        let other = TailwindOrderContext::new(portable_tailwind_snapshot()).unwrap();
        let foreign = other.lookup("p-2").unwrap();
        assert!(context
            .rule_priority(foreign, foreign.rules[0].id)
            .is_none());
    }
}
