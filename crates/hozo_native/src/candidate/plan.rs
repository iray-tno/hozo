//! Build-time evidence collected by the actual candidate generator, not a
//! second scan/parse or a device ordering contract. Write indices name IR
//! properties before Native expansion/deduplication/transform composition.
use super::StateGroup;
use hozo_ir::{Condition, StyleProperty, TailwindOrderContext, TailwindWriteEvidence};

pub struct CandidateModulePlan {
    pub code: String,
    pub schema: u32,
    pub fingerprint: String,
    pub entries: Vec<CandidatePriorityEntry>,
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
    pub writes: Vec<TailwindWriteEvidence>,
    /// Only uniform assessed writes acquire a whole-object priority. A
    /// multi-rule object is not assigned the first/max rule's rank.
    pub priority_rank: Option<usize>,
    pub reason: Option<&'static str>,
}

pub(super) struct CandidatePlanBuilder<'a> {
    context: &'a TailwindOrderContext,
    entries: Vec<CandidatePriorityEntry>,
}

impl<'a> CandidatePlanBuilder<'a> {
    pub fn new(context: &'a TailwindOrderContext) -> Self {
        Self {
            context,
            entries: Vec::new(),
        }
    }

    fn group(
        &self,
        name: &str,
        index: usize,
        keys: Vec<String>,
        props: &[StyleProperty],
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
        CandidatePriorityGroup {
            index,
            state_keys: keys,
            writes,
            priority_rank: uniform,
            reason: uniform
                .is_none()
                .then_some("nonuniform-or-unassessed-writes"),
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

    pub fn style(&mut self, name: &str, props: &[StyleProperty]) {
        self.entry(
            name,
            "style",
            None,
            vec![self.group(name, 0, Vec::new(), props)],
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
            .map(|(index, ((_, properties), group))| {
                self.group(name, index, group.keys.clone(), properties)
            })
            .collect();
        self.entry(name, "state", None, groups);
    }

    pub fn finish(self, code: String) -> CandidateModulePlan {
        CandidateModulePlan {
            code,
            schema: 1,
            fingerprint: self.context.snapshot().fingerprint.clone(),
            entries: self.entries,
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::{render_candidate_module, render_candidate_module_plan};
    use hozo_ir::{portable_tailwind_snapshot, TailwindOrderContext, Theme};

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
