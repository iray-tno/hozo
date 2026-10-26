//! Build-time evidence collected by the actual candidate generator, not a
//! second scan/parse or a device ordering contract. Write indices name IR
//! properties before Native expansion/deduplication/transform composition.
use super::StateGroup;
use hozo_ir::{Condition, StyleProperty, TailwindOrderContext, TailwindWriteEvidence};
use std::collections::{BTreeMap, HashMap};

pub struct CandidateModulePlan {
    pub code: String,
    pub schema: u32,
    pub fingerprint: String,
    pub entries: Vec<CandidatePriorityEntry>,
    pub ordering: Option<CandidateOrdering>,
}

/// Compact trusted build output. Missing classes are barriers, never rank0.
pub struct CandidateOrdering {
    pub schema: u32,
    pub ranks: BTreeMap<String, Vec<u32>>,
}

pub struct CandidatePriorityEntry {
    pub candidate: String,
    pub candidate_id: u32,
    /// `style`/`state` identify actual generated objects. `refused` does not
    /// acquire hypothetical properties merely because Tailwind describes it.
    pub kind: &'static str,
    pub reason: Option<&'static str>,
    pub groups: Vec<CandidatePriorityGroup>,
}

pub struct CandidatePriorityGroup {
    /// Object position: styles[candidate], or states[candidate][index][1].
    pub index: usize,
    /// Exact predicate keys emitted by state_groups, not reinterpreted CSS.
    pub state_keys: Vec<String>,
    pub native_keys: Vec<String>,
    pub orderable: bool,
    pub writes: Vec<TailwindWriteEvidence>,
    /// Only uniform assessed writes acquire a whole-object priority. A
    /// multi-rule object is not assigned the first/max rule's rank.
    pub priority_rank: Option<usize>,
    pub reason: Option<&'static str>,
}

pub(super) struct CandidatePlanBuilder<'a> {
    context: &'a TailwindOrderContext,
    entries: Vec<CandidatePriorityEntry>,
    pub finalized: bool,
    ordering: Option<Option<CandidateOrdering>>,
}

impl<'a> CandidatePlanBuilder<'a> {
    pub fn new(context: &'a TailwindOrderContext) -> Self {
        Self {
            context,
            entries: Vec::new(),
            finalized: false,
            ordering: None,
        }
    }

    fn group(
        &self,
        name: &str,
        index: usize,
        condition: &Condition,
        keys: Vec<String>,
        props: &[StyleProperty],
        pairs: &[(String, String)],
    ) -> CandidatePriorityGroup {
        let writes: Vec<_> = props
            .iter()
            .enumerate()
            .map(|(index, property)| self.context.write_evidence(name, index, property))
            .collect();
        let first = writes.first().and_then(|write| write.priority_rank);
        let uniform = first.filter(|rank| {
            writes
                .iter()
                .all(|write| write.priority_rank == Some(*rank))
        });
        let orderable = uniform.is_some()
            && !props.is_empty()
            && props.iter().all(|property| {
                self.context
                    .scalar_write_priority(name, condition, property)
                    .is_some_and(|priority| Some(priority.rank) == uniform)
            });
        CandidatePriorityGroup {
            index,
            state_keys: keys,
            native_keys: pairs.iter().map(|(key, _)| key.clone()).collect(),
            // Scalar physical keys need no logical-edge, shorthand-gap or
            // register normalization. This is eligibility, not an order table.
            orderable,
            writes,
            priority_rank: uniform,
            reason: if uniform.is_none() {
                Some("nonuniform-or-unassessed-writes")
            } else if !orderable {
                Some("unassessed-scalar-owner")
            } else {
                None
            },
        }
    }

    fn entry(
        &mut self,
        name: &str,
        kind: &'static str,
        reason: Option<&'static str>,
        groups: Vec<CandidatePriorityGroup>,
    ) {
        // Completeness was checked before any generation; lookup cannot fail.
        self.entries.push(CandidatePriorityEntry {
            candidate: name.into(),
            candidate_id: self.context.lookup(name).unwrap().id,
            kind,
            reason,
            groups,
        });
    }

    pub fn refused(&mut self, name: &str, reason: &'static str) {
        self.entry(name, "refused", Some(reason), Vec::new());
    }

    pub fn style(&mut self, name: &str, props: &[StyleProperty], pairs: &[(String, String)]) {
        self.entry(
            name,
            "style",
            None,
            vec![self.group(name, 0, &Condition::Always, Vec::new(), props, pairs)],
        );
    }

    pub fn states(
        &mut self,
        name: &str,
        props: &[(Condition, Vec<StyleProperty>)],
        groups: &[StateGroup],
    ) {
        let groups = props
            .iter()
            .zip(groups)
            .enumerate()
            .map(|(index, ((condition, properties), group))| {
                self.group(
                    name,
                    index,
                    condition,
                    group.keys.clone(),
                    properties,
                    &group.pairs,
                )
            })
            .collect();
        self.entry(name, "state", None, groups);
    }

    pub fn prepare_ordering(&mut self) -> Option<&CandidateOrdering> {
        self.ordering
            .get_or_insert_with(|| ordering(&self.entries))
            .as_ref()
    }

    pub fn finish(self, code: String) -> CandidateModulePlan {
        let ordering = self.ordering.unwrap_or_else(|| ordering(&self.entries));
        CandidateModulePlan {
            code,
            schema: 1,
            fingerprint: self.context.snapshot().fingerprint.clone(),
            entries: self.entries,
            ordering,
        }
    }
}

fn ordering(entries: &[CandidatePriorityEntry]) -> Option<CandidateOrdering> {
    let eligible: Vec<_> = entries
        .iter()
        .filter(|entry| {
            !entry.groups.is_empty() && entry.groups.iter().all(|group| group.orderable)
        })
        .collect();
    let mut owners = HashMap::new();
    let mut conflict = false;
    for entry in &eligible {
        for key in entry.groups.iter().flat_map(|group| &group.native_keys) {
            if let Some(previous) = owners.insert(key.as_str(), entry.candidate.as_str()) {
                conflict |= previous != entry.candidate;
            }
        }
    }
    // A project with no participating scalar conflict keeps its old tiny ABI.
    if !conflict {
        return None;
    }
    Some(CandidateOrdering {
        schema: 1,
        ranks: eligible
            .into_iter()
            .map(|entry| {
                (
                    entry.candidate.clone(),
                    entry
                        .groups
                        .iter()
                        .map(|group| group.priority_rank.unwrap() as u32)
                        .collect(),
                )
            })
            .collect(),
    })
}

#[cfg(test)]
mod tests {
    use crate::{render_candidate_module, render_candidate_module_plan};
    use hozo_ir::{portable_tailwind_snapshot, TailwindOrderContext, Theme};

    #[test]
    fn compact_order_is_absent_without_a_real_scalar_key_conflict() {
        let context = TailwindOrderContext::new(portable_tailwind_snapshot()).unwrap();
        for names in [
            vec![],
            vec!["p-2".into()],
            vec!["p-2".into(), "bg-red-500".into()],
        ] {
            let plan = render_candidate_module_plan(&names, &Theme::default(), &context).unwrap();
            assert!(plan.ordering.is_none());
        }
    }

    #[test]
    fn final_factory_uses_compact_order_only_for_a_real_assessed_conflict() {
        let context = TailwindOrderContext::new(portable_tailwind_snapshot()).unwrap();
        for names in [vec!["p-2".into()], vec!["p-2".into(), "bg-red-500".into()]] {
            let final_plan =
                crate::render_final_candidate_module_plan(&names, &Theme::default(), &context)
                    .unwrap();
            assert_eq!(
                final_plan.code,
                render_candidate_module(&names, &Theme::default())
            );
        }
        let names = ["p-2", "p-4", "active:p-4", "hover:focus:p-4"].map(String::from);
        let final_plan =
            crate::render_final_candidate_module_plan(&names, &Theme::default(), &context).unwrap();
        assert!(final_plan
            .code
            .contains("createClassResolver({ schema: 1, styles, unsupported,"));
        assert!(final_plan.code.contains(" states,"));
        assert!(final_plan
            .ordering
            .unwrap()
            .ranks
            .contains_key("hover:focus:p-4"));
    }

    #[test]
    fn a_candidate_rule_with_the_wrong_actual_owner_never_gets_an_object_rank() {
        let mut snapshot = portable_tailwind_snapshot();
        let candidate = snapshot
            .candidates
            .iter_mut()
            .find(|row| row.candidate == "active:p-4")
            .unwrap();
        fn replace(shape: &mut hozo_ir::OrderRuleShape) {
            if let hozo_ir::OrderRuleShape::Rule { selector, nodes } = shape {
                *selector = selector.replace(":active", ":focus");
                for node in nodes {
                    replace(node);
                }
            }
        }
        for rule in &mut candidate.rules {
            replace(&mut rule.shape);
        }
        let context = TailwindOrderContext::new(snapshot).unwrap();
        let plan = crate::render_final_candidate_module_plan(
            &["p-2".into(), "p-4".into(), "active:p-4".into()],
            &Theme::default(),
            &context,
        )
        .unwrap();
        let entry = plan
            .entries
            .iter()
            .find(|entry| entry.candidate == "active:p-4")
            .unwrap();
        assert!(
            entry.groups[0].priority_rank.is_some(),
            "a rule rank alone is insufficient"
        );
        assert!(!entry.groups[0].orderable);
        assert!(!plan.ordering.unwrap().ranks.contains_key("active:p-4"));
    }

    #[test]
    fn compact_order_uses_actual_keys_and_omits_unassessed_native_normalization() {
        let context = TailwindOrderContext::new(portable_tailwind_snapshot()).unwrap();
        let names = ["p-2", "p-4", "ps-2", "gap-2"].map(String::from);
        let plan = render_candidate_module_plan(&names, &Theme::default(), &context).unwrap();
        let order = plan.ordering.unwrap();
        assert_eq!(order.schema, 1);
        assert!(order.ranks["p-2"][0] < order.ranks["p-4"][0]);
        assert!(!order.ranks.contains_key("ps-2"));
        assert!(!order.ranks.contains_key("gap-2"));
        assert!(plan.entries[0].groups[0]
            .native_keys
            .iter()
            .any(|key| key == "paddingTop"));
        assert!(!plan.entries[2].groups[0].orderable);
    }

    #[test]
    fn sidecar_names_actual_objects_without_changing_the_generated_module() {
        let context = TailwindOrderContext::new(portable_tailwind_snapshot()).unwrap();
        let names = [
            "p-2",
            "active:bg-blue-500",
            "hover:focus:p-4",
            "sm:p-2",
            "group-hover:p-2",
            "notautility",
        ]
        .map(String::from);
        let plan = render_candidate_module_plan(&names, &Theme::default(), &context).unwrap();
        assert_eq!(
            plan.code,
            render_candidate_module(&names, &Theme::default())
        );
        assert_eq!(plan.schema, 1);
        assert_eq!(plan.entries.len(), names.len());
        assert_eq!(plan.entries[0].kind, "style");
        assert_eq!(plan.entries[0].groups[0].writes.len(), 4);
        assert!(plan.entries[0].groups[0].priority_rank.is_some());
        assert_eq!(plan.entries[1].groups[0].state_keys, ["pressed"]);
        assert_eq!(plan.entries[2].groups[0].state_keys, ["hovered", "focused"]);
        for entry in &plan.entries[3..] {
            assert_eq!(entry.kind, "refused");
            assert!(entry.reason.is_some());
            assert!(entry.groups.is_empty());
        }
    }

    #[test]
    fn incomplete_context_is_refused_before_generating_a_sidecar() {
        let context = TailwindOrderContext::new(portable_tailwind_snapshot()).unwrap();
        assert!(
            render_candidate_module_plan(&["p-999".into()], &Theme::default(), &context).is_err()
        );
    }

    #[test]
    fn distinct_assessed_rules_cannot_be_collapsed_to_one_object_priority() {
        use hozo_ir::{OrderRuleDescriptor, OrderRuleShape};
        let mut snapshot = portable_tailwind_snapshot();
        let mut candidate = snapshot
            .candidates
            .into_iter()
            .find(|row| row.candidate == "p-2")
            .unwrap();
        candidate.id = 0;
        candidate.rules = [
            "padding-top",
            "padding-right",
            "padding-bottom",
            "padding-left",
        ]
        .into_iter()
        .enumerate()
        .map(|(index, property)| OrderRuleDescriptor {
            id: index as u32,
            candidate_id: 0,
            declaration_count: 1,
            variant_order: "0".into(),
            important: false,
            property_order: vec![index as u32],
            shape: OrderRuleShape::Rule {
                selector: ".p-2".into(),
                nodes: vec![OrderRuleShape::Declaration {
                    property: property.into(),
                    important: false,
                }],
            },
        })
        .collect();
        snapshot.candidates = vec![candidate];
        let context = TailwindOrderContext::new(snapshot).unwrap();
        let plan =
            render_candidate_module_plan(&["p-2".into()], &Theme::default(), &context).unwrap();
        let group = &plan.entries[0].groups[0];
        assert_eq!(group.writes.len(), 4);
        assert!(group
            .writes
            .iter()
            .all(|write| write.priority_rank.is_some()));
        let mut ranks: Vec<_> = group
            .writes
            .iter()
            .map(|write| write.priority_rank.unwrap())
            .collect();
        ranks.sort();
        ranks.dedup();
        assert_eq!(ranks.len(), 4);
        assert!(group.priority_rank.is_none());
        assert!(group.reason.is_some());
    }
}
