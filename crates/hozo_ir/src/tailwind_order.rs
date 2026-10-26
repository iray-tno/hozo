//! Prepared upstream facts, not a cascade comparator or a support verdict.
//! Binding is by candidate name once per parsed module. Snapshot-local rule
//! IDs cannot substitute for module-local utility IDs, or vice versa.
use crate::{TailwindUnits, TailwindUtilityId};
use serde::Deserialize;
use std::collections::{BTreeMap, HashMap};
use std::sync::OnceLock;

mod comparison;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TailwindOrderSnapshot {
    pub schema: u32,
    pub policy: String,
    pub tailwind_version: String,
    pub fingerprint: String,
    pub stylesheets: Vec<OrderStylesheet>,
    pub candidates: Vec<OrderCandidateDescriptor>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OrderStylesheet {
    pub file: String,
    pub sha256: String,
}

#[derive(Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum OrderCandidateStatus {
    Described,
    NotGenerated,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OrderCandidateDescriptor {
    pub id: u32,
    pub candidate: String,
    pub status: OrderCandidateStatus,
    pub first_rule_rank: Option<String>,
    pub rules: Vec<OrderRuleDescriptor>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OrderRuleDescriptor {
    pub id: u32,
    pub candidate_id: u32,
    // Tailwind's bitset has no u64 ceiling. Keep its arbitrary-width decimal
    // representation until the shared comparator needs it; never truncate it.
    pub variant_order: String,
    pub important: bool,
    pub property_order: Vec<u32>,
    pub declaration_count: u32,
    pub shape: OrderRuleShape,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum OrderRuleShape {
    Rule {
        selector: String,
        nodes: Vec<Self>,
    },
    AtRule {
        name: String,
        params: String,
        nodes: Vec<Self>,
    },
    Declaration {
        property: String,
        important: bool,
    },
    Comment,
    Context {
        context: BTreeMap<String, OrderContextValue>,
        nodes: Vec<Self>,
    },
    AtRoot {
        nodes: Vec<Self>,
    },
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
pub enum OrderContextValue {
    String(String),
    Boolean(bool),
}

/// Immutable after validation; replacement creates a different namespace.
/// The loader's fingerprint is provenance, not proof of Hozo support or an
/// authentication mechanism for an untrusted caller constructing a snapshot.
#[derive(Debug)]
pub struct TailwindOrderContext {
    snapshot: TailwindOrderSnapshot,
    by_name: HashMap<String, usize>,
    rule_order: OnceLock<Vec<(usize, usize)>>,
}

fn decimal(value: &str) -> bool {
    !value.is_empty()
        && value.bytes().all(|byte| byte.is_ascii_digit())
        && (value.len() == 1 || !value.starts_with('0'))
}

fn sha256(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

impl TailwindOrderContext {
    pub fn new(snapshot: TailwindOrderSnapshot) -> Result<Self, String> {
        if snapshot.schema != 1 || snapshot.policy != "tailwind-rule-signatures-v1" {
            return Err("unsupported Tailwind ordering schema or policy".into());
        }
        if snapshot.tailwind_version.is_empty() || !sha256(&snapshot.fingerprint) {
            return Err("invalid Tailwind ordering provenance".into());
        }
        let mut files = std::collections::HashSet::new();
        for sheet in &snapshot.stylesheets {
            if sheet.file.is_empty() || !sha256(&sheet.sha256) || !files.insert(&sheet.file) {
                return Err("invalid or repeated Tailwind ordering stylesheet receipt".into());
            }
        }
        let mut by_name = HashMap::with_capacity(snapshot.candidates.len());
        let mut next_rule = 0usize;
        for (index, candidate) in snapshot.candidates.iter().enumerate() {
            if candidate.id as usize != index
                || candidate.candidate.is_empty()
                || by_name.insert(candidate.candidate.clone(), index).is_some()
            {
                return Err("invalid or repeated Tailwind candidate identity".into());
            }
            let described = candidate.status == OrderCandidateStatus::Described;
            if described == candidate.rules.is_empty()
                || (!described && candidate.first_rule_rank.is_some())
                || candidate
                    .first_rule_rank
                    .as_deref()
                    .is_some_and(|rank| !decimal(rank))
            {
                return Err("inconsistent Tailwind candidate rule status".into());
            }
            for rule in &candidate.rules {
                if rule.id as usize != next_rule
                    || rule.candidate_id != candidate.id
                    || !decimal(&rule.variant_order)
                    || rule
                        .property_order
                        .windows(2)
                        .any(|pair| pair[0] >= pair[1])
                {
                    return Err("invalid Tailwind rule identity or property signature".into());
                }
                next_rule += 1;
            }
        }
        Ok(Self {
            snapshot,
            by_name,
            rule_order: OnceLock::new(),
        })
    }

    pub fn snapshot(&self) -> &TailwindOrderSnapshot {
        &self.snapshot
    }

    pub fn lookup(&self, candidate: &str) -> Option<&OrderCandidateDescriptor> {
        self.by_name
            .get(candidate)
            .map(|index| &self.snapshot.candidates[*index])
    }

    /// One complete rule sequence in this snapshot's namespace. The index is
    /// prepared lazily once, never by a module/state update. Unlike first-rule
    /// candidate ranks this preserves every rule of a multi-rule utility.
    /// This is emission order, not cascade precedence or a support verdict:
    /// importance, specificity and condition/write ownership are separate.
    pub fn rules_in_emission_order(
        &self,
    ) -> impl Iterator<Item = (&OrderCandidateDescriptor, &OrderRuleDescriptor)> {
        self.rule_order
            .get_or_init(|| comparison::ordered_indices(&self.snapshot))
            .iter()
            .map(move |&(candidate, rule)| {
                let candidate = &self.snapshot.candidates[candidate];
                (candidate, &candidate.rules[rule])
            })
    }

    /// Pass-through binding only. No sort, selector assessment, declaration
    /// reassignment or fallback priority is inferred from these descriptors.
    pub fn bind<'a>(&'a self, units: &'a TailwindUnits) -> TailwindUnitBindings<'a> {
        TailwindUnitBindings {
            context: self,
            units,
            entries: units
                .iter()
                .map(|(_, name)| match self.lookup(name) {
                    None => TailwindRuleBinding::Uncollected,
                    Some(candidate) if candidate.status == OrderCandidateStatus::NotGenerated => {
                        TailwindRuleBinding::NotGenerated(candidate)
                    }
                    Some(candidate) => TailwindRuleBinding::Described(candidate),
                })
                .collect(),
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub enum TailwindRuleBinding<'a> {
    Described(&'a OrderCandidateDescriptor),
    NotGenerated(&'a OrderCandidateDescriptor),
    Uncollected,
}

pub struct TailwindUnitBindings<'a> {
    context: &'a TailwindOrderContext,
    units: &'a TailwindUnits,
    entries: Vec<TailwindRuleBinding<'a>>,
}

impl<'a> TailwindUnitBindings<'a> {
    pub fn context(&self) -> &'a TailwindOrderContext {
        self.context
    }
    pub fn units(&self) -> &'a TailwindUnits {
        self.units
    }
    pub fn get(&self, id: TailwindUtilityId) -> Option<TailwindRuleBinding<'a>> {
        self.entries.get(id.index()).copied()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::TailwindUnitsBuilder;

    fn snapshot() -> TailwindOrderSnapshot {
        TailwindOrderSnapshot {
            schema: 1,
            policy: "tailwind-rule-signatures-v1".into(),
            tailwind_version: "test".into(),
            fingerprint: "a".repeat(64),
            stylesheets: vec![],
            candidates: vec![
                OrderCandidateDescriptor {
                    id: 0,
                    candidate: "not-generated".into(),
                    status: OrderCandidateStatus::NotGenerated,
                    first_rule_rank: None,
                    rules: vec![],
                },
                OrderCandidateDescriptor {
                    id: 1,
                    candidate: "p-2".into(),
                    status: OrderCandidateStatus::Described,
                    first_rule_rank: Some("0".into()),
                    rules: (0..2)
                        .map(|id| OrderRuleDescriptor {
                            id,
                            candidate_id: 1,
                            variant_order: "340282366920938463463374607431768211456".into(),
                            important: true,
                            property_order: vec![0, 3],
                            declaration_count: 2,
                            shape: OrderRuleShape::Rule {
                                selector: ".p-2".into(),
                                nodes: vec![OrderRuleShape::Declaration {
                                    property: "padding".into(),
                                    important: true,
                                }],
                            },
                        })
                        .collect(),
                },
            ],
        }
    }

    #[test]
    fn binding_borrows_full_rules_and_never_invents_rule_zero_or_a_missing_rank() {
        let context = TailwindOrderContext::new(snapshot()).unwrap();
        let mut builder = TailwindUnitsBuilder::default();
        let padding = builder.intern("p-2");
        let absent = builder.intern("p-99");
        let not_generated = builder.intern("not-generated");
        let units = builder.finish().unwrap();
        let bound = context.bind(&units);
        assert!(std::ptr::eq(bound.units(), units.as_ref()));
        assert!(std::ptr::eq(bound.context(), &context));
        let Some(TailwindRuleBinding::Described(candidate)) = bound.get(padding) else {
            panic!()
        };
        assert!(std::ptr::eq(candidate, context.lookup("p-2").unwrap()));
        assert_eq!(candidate.id, 1);
        assert_eq!(padding.index(), 0);
        assert_eq!(candidate.rules.len(), 2);
        assert_eq!(candidate.rules[1].id, 1);
        assert_eq!(
            candidate.rules[0].variant_order,
            "340282366920938463463374607431768211456"
        );
        assert!(candidate.rules[0].important);
        assert_eq!(candidate.rules[0].property_order, [0, 3]);
        assert_eq!(candidate.rules[0].declaration_count, 2);
        let OrderRuleShape::Rule { nodes, .. } = &candidate.rules[0].shape else {
            panic!()
        };
        assert!(
            matches!(&nodes[0], OrderRuleShape::Declaration { property, important: true } if property == "padding")
        );
        assert!(matches!(
            bound.get(absent),
            Some(TailwindRuleBinding::Uncollected)
        ));
        assert!(matches!(
            bound.get(not_generated),
            Some(TailwindRuleBinding::NotGenerated(_))
        ));
        assert_eq!(
            units.iter().map(|(_, name)| name).collect::<Vec<_>>(),
            ["p-2", "p-99", "not-generated"]
        );
    }

    #[test]
    fn independently_prepared_contexts_keep_their_namespace_and_borrowed_facts() {
        let first = TailwindOrderContext::new(snapshot()).unwrap();
        let mut next = snapshot();
        next.fingerprint = "b".repeat(64);
        next.candidates[1].rules[0].property_order = vec![6];
        let second = TailwindOrderContext::new(next).unwrap();
        let mut builder = TailwindUnitsBuilder::default();
        let id = builder.intern("p-2");
        let units = builder.finish().unwrap();
        let a = first.bind(&units);
        let b = second.bind(&units);
        assert_ne!(
            a.context().snapshot().fingerprint,
            b.context().snapshot().fingerprint
        );
        let Some(TailwindRuleBinding::Described(a)) = a.get(id) else {
            panic!()
        };
        let Some(TailwindRuleBinding::Described(b)) = b.get(id) else {
            panic!()
        };
        assert_eq!(a.rules[0].property_order, [0, 3]);
        assert_eq!(b.rules[0].property_order, [6]);
    }

    #[test]
    fn empty_contexts_and_invalid_receipts_are_explicit() {
        let mut empty = snapshot();
        empty.candidates.clear();
        assert!(TailwindOrderContext::new(empty)
            .unwrap()
            .lookup("p-2")
            .is_none());
        let mut bad = snapshot();
        bad.candidates[1].rules[1].candidate_id = 0;
        assert!(TailwindOrderContext::new(bad).is_err());
        let mut bad = snapshot();
        bad.candidates[1].rules[1].id = 0;
        assert!(TailwindOrderContext::new(bad).is_err());
        let mut bad = snapshot();
        bad.stylesheets.push(OrderStylesheet {
            file: "entry.css".into(),
            sha256: "bad".into(),
        });
        assert!(TailwindOrderContext::new(bad).is_err());
    }
}
