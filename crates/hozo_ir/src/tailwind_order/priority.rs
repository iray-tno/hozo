//! A bounded author-rule priority in one utility input tier, not a complete
//! CSS cascade or permission to reorder authored expressions/unknown writes.
use super::TailwindOrderContext;
use crate::tailwind_assessment::{
    aria_owner_index, negated_aria_owner_index, OWNER_PREDICATE_COUNT,
};
use crate::{
    assess_tailwind_rule, assess_tailwind_write, scalar_tailwind_property, Condition,
    RuleAssessmentError, StyleProperty, TailwindWriteOwnership,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TailwindRulePriority {
    /// Relative to assessed rules in this context only, not an emission rank.
    pub rank: usize,
    pub important: bool,
    pub specificity: [u32; 3],
    /// Cached assessment, not a second per-write selector parse or sort key.
    owner: [u16; OWNER_PREDICATE_COUNT],
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
    /// A scalar IR write can participate only when its actual predicate is
    /// the assessed rule's predicate. Captured JS/media/foreign guards are
    /// not silently treated as the candidate's owner state.
    pub fn scalar_write_priority(
        &self,
        name: &str,
        condition: &Condition,
        property: &StyleProperty,
    ) -> Option<TailwindRulePriority> {
        if !scalar_tailwind_property(property) {
            return None;
        }
        let candidate = self.lookup(name)?;
        let [rule] = candidate.rules.as_slice() else {
            return None;
        };
        let priority = self.rule_priority(candidate, rule.id)?.ok()?;
        if priority.important {
            return None;
        }
        let mut actual = [0_u16; OWNER_PREDICATE_COUNT];
        let mut queries = Vec::new();
        fn collect<'c>(
            condition: &'c Condition,
            actual: &mut [u16; OWNER_PREDICATE_COUNT],
            queries: &mut Vec<Query<'c>>,
        ) -> Option<()> {
            if let Some(query) = Query::of(condition) {
                queries.push(query);
                return Some(());
            }
            let index = match condition {
                Condition::Always => return Some(()),
                Condition::Hover => {
                    queries.push(Query::Exact("@media", "(hover: hover)"));
                    0
                }
                Condition::Focus => 1,
                Condition::FocusVisible => 2,
                Condition::Pressed => 3,
                Condition::Disabled => 4,
                Condition::Aria(state) => aria_owner_index(state)?,
                Condition::Not(inner) => match inner.as_ref() {
                    Condition::Aria(state) => negated_aria_owner_index(state)?,
                    _ => return None,
                },
                Condition::All(parts) if !parts.is_empty() => {
                    for part in parts {
                        collect(part, actual, queries)?;
                    }
                    return Some(());
                }
                _ => return None,
            };
            actual[index] = actual[index].checked_add(1)?;
            Some(())
        }
        collect(condition, &mut actual, &mut queries)?;
        if priority.owner != actual || !same_queries(&rule.shape, &queries) {
            return None;
        }
        // The cached assessment already validated this single rule's shape.
        // Count the actual owning declarations without allocating property or
        // selector vectors for every expanded side of a shorthand.
        fn owners(shape: &crate::OrderRuleShape, write: &StyleProperty) -> Option<usize> {
            match shape {
                crate::OrderRuleShape::Declaration { property, .. } => Some(usize::from(
                    crate::tailwind_assessment::covers(property, write),
                )),
                crate::OrderRuleShape::Rule { nodes, .. }
                | crate::OrderRuleShape::AtRule { nodes, .. } => {
                    nodes.iter().try_fold(0_usize, |count, node| {
                        count.checked_add(owners(node, write)?)
                    })
                }
                crate::OrderRuleShape::Comment => Some(0),
                crate::OrderRuleShape::AtRoot { .. }
                    if crate::tailwind_assessment::property_registration(shape) =>
                {
                    Some(0)
                }
                crate::OrderRuleShape::Context { .. } | crate::OrderRuleShape::AtRoot { .. } => {
                    None
                }
            }
        }
        (owners(&rule.shape, property)? == 1).then_some(priority)
    }

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
                ..
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

/// A query a write's own condition asks, to be found among the captured
/// rule's wrappers. Rank still comes from the rule; this only checks that
/// the rule and the write are the same question (#1230).
#[derive(Debug, Clone, Copy)]
enum Query<'c> {
    Exact(&'static str, &'c str),
    /// A width threshold. The value is the theme's, which Tailwind writes
    /// in its own unit (`48rem`) and the IR in another (`768px`), so only
    /// the side is compared. The candidate name ties the two together.
    Width {
        container: bool,
        name: Option<&'c str>,
        at_least: bool,
    },
    Supports,
}

impl<'c> Query<'c> {
    fn of(condition: &'c Condition) -> Option<Self> {
        Some(match condition {
            // Only the media strategy. A project's own `@custom-variant
            // dark` is a selector or another query, and does not match.
            Condition::Dark => Self::Exact("@media", "(prefers-color-scheme: dark)"),
            Condition::Environment(query) => {
                let (name, params) = query.web_at_rule().split_once(' ')?;
                Self::Exact(
                    if name == "@media" {
                        "@media"
                    } else {
                        return None;
                    },
                    params,
                )
            }
            Condition::Responsive(_) => Self::Width {
                container: false,
                name: None,
                at_least: true,
            },
            Condition::Width { at_least, .. } => Self::Width {
                container: false,
                name: None,
                at_least: *at_least,
            },
            Condition::Container { name, at_least, .. } => Self::Width {
                container: true,
                name: name.as_deref(),
                at_least: *at_least,
            },
            Condition::Supports(_) => Self::Supports,
            _ => return None,
        })
    }

    fn matches(self, name: &str, params: &str) -> bool {
        match self {
            Self::Exact(expected, query) => name == expected && params == query,
            Self::Width {
                container,
                name: label,
                at_least,
            } => {
                let params = match (container, label) {
                    (false, _) if name == "@media" => params,
                    (true, None) if name == "@container" => params,
                    (true, Some(label)) if name == "@container" => {
                        let Some(rest) = params.strip_prefix(label) else {
                            return false;
                        };
                        let Some(rest) = rest.strip_prefix(' ') else {
                            return false;
                        };
                        rest
                    }
                    _ => return false,
                };
                params.starts_with(if at_least { "(width >= " } else { "(width < " })
            }
            Self::Supports => name == "@supports",
        }
    }
}

/// Every wrapper on the rule's single chain is one of the write's queries,
/// and every query is used once. Assessment already refused branching.
fn same_queries(shape: &crate::OrderRuleShape, queries: &[Query<'_>]) -> bool {
    let mut used = 0_u64;
    let mut found = 0;
    let mut node = shape;
    loop {
        let nodes = match node {
            crate::OrderRuleShape::Rule { nodes, .. } => nodes,
            crate::OrderRuleShape::AtRule {
                name,
                params,
                nodes,
            } => {
                let Some(index) = (0..queries.len().min(64)).find(|&index| {
                    used & (1 << index) == 0 && queries[index].matches(name, params)
                }) else {
                    return false;
                };
                used |= 1 << index;
                found += 1;
                nodes
            }
            _ => break,
        };
        let mut next = nodes.iter().filter(|node| {
            matches!(
                node,
                crate::OrderRuleShape::Rule { .. } | crate::OrderRuleShape::AtRule { .. }
            )
        });
        match next.next() {
            Some(child) => node = child,
            None => break,
        }
    }
    found == queries.len()
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
                        owner: assessed.owner,
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
        for name in ["group-hover:p-2", "[&:where(:hover)]:p-2"] {
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

    #[test]
    fn scalar_priority_requires_exact_owner_guard_multiplicity_and_nonimportant_scalar_writes() {
        let context = TailwindOrderContext::new(portable_tailwind_snapshot()).unwrap();
        let write = StyleProperty::PaddingTop(crate::Length::Px(8.0));
        let both = Condition::All(vec![Condition::Focus, Condition::Hover]);
        assert!(context
            .scalar_write_priority("hover:focus:p-4", &both, &write)
            .is_some());
        for (name, condition) in [
            ("p-2", Condition::Focus),
            ("focus:p-4", Condition::Always),
            ("hover:focus:p-4", Condition::Hover),
            (
                "hover:focus:p-4",
                Condition::All(vec![Condition::Focus, Condition::Hover, Condition::Hover]),
            ),
            ("p-2", Condition::All(vec![])),
            ("p-2!", Condition::Always),
            ("sm:p-2", Condition::Always),
        ] {
            assert!(
                context
                    .scalar_write_priority(name, &condition, &write)
                    .is_none(),
                "{name}: {condition:?}"
            );
        }
        assert!(context
            .scalar_write_priority(
                "gap-2",
                &Condition::Always,
                &StyleProperty::Gap(crate::Length::Px(8.0))
            )
            .is_none());
    }

    #[test]
    fn a_query_ranks_only_when_the_write_asks_the_same_query() {
        // #1230. `sm:p-2` used to be unassessed, so any input containing
        // it kept its authored order and `sm:p-2 p-4` let the base win.
        let context = TailwindOrderContext::new(portable_tailwind_snapshot()).unwrap();
        let write = StyleProperty::PaddingTop(crate::Length::Px(8.0));
        let sm = Condition::Responsive(crate::Breakpoint::Sm);
        let ranked = context
            .scalar_write_priority("sm:p-2", &sm, &write)
            .unwrap();
        // After both unprefixed utilities, as Tailwind emits it.
        assert!(rank(&context, "p-4") < ranked.rank);
        assert!(rank(&context, "p-2") < ranked.rank);
        // The same question asked by another spelling also matches;
        // `min-sm:` is `sm:` in the IR.
        for other in [
            Condition::Width {
                at_least: true,
                value: "640px".into(),
            },
            Condition::All(vec![sm.clone()]),
        ] {
            assert!(context
                .scalar_write_priority("sm:p-2", &other, &write)
                .is_some());
        }
        // Anything else does not: no query, the other side, a different
        // kind of query, a second query, or a guard the rule lacks.
        for condition in [
            Condition::Always,
            Condition::Width {
                at_least: false,
                value: "640px".into(),
            },
            Condition::Dark,
            Condition::Container {
                name: None,
                at_least: true,
                value: "24rem".into(),
            },
            Condition::Environment(crate::Environment::Print),
            Condition::All(vec![sm.clone(), sm.clone()]),
            Condition::All(vec![sm.clone(), Condition::Hover]),
            Condition::All(vec![sm.clone(), Condition::Focus]),
        ] {
            assert!(
                context
                    .scalar_write_priority("sm:p-2", &condition, &write)
                    .is_none(),
                "{condition:?}"
            );
        }
        // And a query never attaches to a rule that has none.
        assert!(context.scalar_write_priority("p-2", &sm, &write).is_none());
    }

    #[test]
    fn each_query_kind_matches_only_its_own_spelling() {
        use super::Query;
        let dark = Condition::Dark;
        let print = Condition::Environment(crate::Environment::Print);
        let motion = Condition::Environment(crate::Environment::MotionSafe);
        let ltr = Condition::Environment(crate::Environment::Ltr);
        let max = Condition::Width {
            at_least: false,
            value: "768px".into(),
        };
        let card = Condition::Container {
            name: Some("card".into()),
            at_least: true,
            value: "400px".into(),
        };
        let any = Condition::Container {
            name: None,
            at_least: false,
            value: "28rem".into(),
        };
        let grid = Condition::Supports("display:grid".into());
        for (condition, name, params, expected) in [
            (&dark, "@media", "(prefers-color-scheme: dark)", true),
            (&dark, "@media", "(prefers-color-scheme: light)", false),
            (&print, "@media", "print", true),
            (&print, "@media", "screen", false),
            (
                &motion,
                "@media",
                "(prefers-reduced-motion: no-preference)",
                true,
            ),
            (&max, "@media", "(width < 48rem)", true),
            (&max, "@media", "(width >= 48rem)", false),
            (&max, "@container", "(width < 48rem)", false),
            (&card, "@container", "card (width >= 400px)", true),
            (&card, "@container", "(width >= 400px)", false),
            (&card, "@container", "cards (width >= 400px)", false),
            (&any, "@container", "(width < 28rem)", true),
            (&any, "@container", "card (width < 28rem)", false),
            (&grid, "@supports", "(display:grid)", true),
            (&grid, "@media", "(display:grid)", false),
        ] {
            let query = Query::of(condition).unwrap();
            assert_eq!(
                query.matches(name, params),
                expected,
                "{condition:?} {params}"
            );
        }
        // Direction is a selector in Tailwind, not a query.
        assert!(Query::of(&ltr).is_none());
    }
}
