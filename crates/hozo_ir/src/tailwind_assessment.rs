//! Evidence about original CSS rules and write ownership, not permission to
//! reorder. Values, condition equivalence, composition tiers and Native edge
//! normalization still have to be proved by the caller of a future planner.
use crate::{OrderCandidateDescriptor, OrderRuleDescriptor, OrderRuleShape, StyleProperty};

mod at_rules;
mod owners;
mod selectors;
mod writes;
pub(crate) use at_rules::*;
pub(crate) use owners::*;
pub(crate) use selectors::*;
pub use writes::*;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RuleAssessmentError {
    Selector,
    AtRule,
    Branching,
    Importance,
    Empty,
}

impl RuleAssessmentError {
    pub fn reason(self) -> &'static str {
        match self {
            Self::Selector => "unassessed-selector",
            Self::AtRule => "unassessed-at-rule",
            Self::Branching => "branching-rule",
            Self::Importance => "mixed-importance",
            Self::Empty => "no-declarations",
        }
    }
}

#[derive(Debug)]
pub struct AssessedTailwindRule<'a> {
    pub rule: &'a OrderRuleDescriptor,
    /// ID/class/type components. The bounded owner-only selectors below have
    /// no IDs/types; an unknown selector never receives the default [0,1,0].
    pub specificity: [u32; 3],
    pub properties: Vec<&'a str>,
    /// Every query wrapper, as `(name, params)` in nesting order. Ordering
    /// matches these against the write's own condition before ranking it.
    pub media: Vec<(&'a str, &'a str)>,
    /// Conditions on the element itself outside the owner facts, as written.
    /// Matched against the write's condition the same way as `media`.
    pub selectors: Vec<&'a str>,
    /// Multiplicity of independently delivered interaction/ARIA predicates.
    /// Guard equivalence only; precedence still comes from the rule.
    pub owner: [u16; OWNER_PREDICATE_COUNT],
    /// The declarations reach the element's children through
    /// `:where(& > :not(:last-child))`, not the element itself.
    pub child_scope: bool,
}

impl OrderCandidateDescriptor {
    /// Use the entire captured footprint, not just the subset a backend
    /// managed to lower. A resting proof also refuses nested branches.
    pub fn writes_only_on_owner(&self, resting: bool, allowed: impl Fn(&str) -> bool) -> bool {
        !self.rules.is_empty()
            && self.rules.iter().all(|rule| {
                !rule.important
                    && (!resting
                        || matches!(&rule.shape, OrderRuleShape::Rule { nodes, .. }
                        if !nodes.is_empty() && nodes.iter().all(|node| {
                            matches!(node, OrderRuleShape::Declaration {
                                property, important: false
                            } if allowed(property))
                        })))
                    && assess_tailwind_rule(&self.candidate, rule).is_ok_and(|rule| {
                        !rule.child_scope
                            && !rule.properties.is_empty()
                            && rule.properties.into_iter().all(&allowed)
                    })
            })
    }
}

/// Closed footprint of assessed scalar writes known not to compete with
/// owner foreground/background colour, even through their CSS registers.
/// Both the static plan and generated Native candidates use this boundary.
pub fn owner_colour_independent_scalar(property: &str) -> bool {
    matches!(
        property,
        "font-size"
            | "line-height"
            | "letter-spacing"
            | "font-weight"
            | "font-family"
            | "font-feature-settings"
            | "font-variation-settings"
            | "--tw-font-weight"
            | "--tw-leading"
            | "--tw-tracking"
            | "padding"
            | "padding-top"
            | "padding-bottom"
            | "padding-left"
            | "padding-right"
            | "margin"
            | "margin-top"
            | "margin-bottom"
            | "margin-left"
            | "margin-right"
            | "opacity"
            | "gap"
            | "row-gap"
            | "column-gap"
    )
}

pub fn assess_tailwind_rule<'a>(
    candidate: &str,
    rule: &'a OrderRuleDescriptor,
) -> Result<AssessedTailwindRule<'a>, RuleAssessmentError> {
    let expected = root_selector(candidate).ok_or(RuleAssessmentError::Selector)?;
    let OrderRuleShape::Rule { selector, nodes } = &rule.shape else {
        return Err(RuleAssessmentError::Selector);
    };
    if selector != &expected {
        return Err(RuleAssessmentError::Selector);
    }
    let mut result = AssessedTailwindRule {
        rule,
        specificity: [0, 1, 0],
        properties: Vec::new(),
        media: Vec::new(),
        selectors: Vec::new(),
        owner: [0; OWNER_PREDICATE_COUNT],
        child_scope: false,
    };
    if let Some(branches) = breakpoint_branches(nodes) {
        // `container`: the rule's own declarations, and one `max-width`
        // per breakpoint. Each write is matched to its branch by its
        // condition in `scalar_write_priority`; here a property is listed
        // once, so ownership sees one owner per property.
        for node in nodes {
            if let OrderRuleShape::Declaration {
                property,
                important,
            } = node
            {
                if *important != rule.important {
                    return Err(RuleAssessmentError::Importance);
                }
                result.properties.push(property);
            }
        }
        for (_, body) in &branches {
            for node in *body {
                if let OrderRuleShape::Declaration { property, .. } = node {
                    if !result.properties.contains(&property.as_str()) {
                        result.properties.push(property);
                    }
                }
            }
        }
        return Ok(result);
    }
    assess_body(nodes, &mut result)?;
    if result.properties.is_empty() {
        return Err(RuleAssessmentError::Empty);
    }
    if result.child_scope {
        // A state or selector variant moves inside the `:where()` too
        // (`hover:space-y-4` is `:where(.x:hover > …)`) and weighs nothing,
        // unlike the same variant on the element. Only queries are read.
        if result.specificity != [0, 1, 0]
            || !result.selectors.is_empty()
            || result.owner.iter().any(|count| *count != 0)
        {
            return Err(RuleAssessmentError::Selector);
        }
        result.specificity = [0, 0, 0];
    }
    Ok(result)
}

fn assess_body<'a>(
    nodes: &'a [OrderRuleShape],
    result: &mut AssessedTailwindRule<'a>,
) -> Result<(), RuleAssessmentError> {
    // A single chain of wrappers followed by declarations has one scope.
    // Sibling nested rules, or declarations beside a wrapper, do not; a
    // `supports_refinement` is neither.
    let branches = nodes
        .iter()
        .filter(|node| {
            !matches!(node, OrderRuleShape::Comment)
                && !property_registration(node)
                && !supports_refinement(nodes, node)
                && !forced_colors_fallback(nodes, node)
        })
        .collect::<Vec<_>>();
    if branches
        .iter()
        .any(|node| !matches!(node, OrderRuleShape::Declaration { .. }))
        && branches.len() != 1
    {
        return Err(RuleAssessmentError::Branching);
    }
    for node in branches {
        match node {
            OrderRuleShape::Declaration {
                property,
                important,
            } => {
                if *important != result.rule.important {
                    return Err(RuleAssessmentError::Importance);
                }
                result.properties.push(property);
            }
            OrderRuleShape::Rule { selector, nodes } if selector == "&" => {
                // `not-hover:`'s pair, read through its selector branch.
                let branch = not_hover_branch(nodes).ok_or(RuleAssessmentError::Branching)?;
                let index = negated_interaction_index(0).ok_or(RuleAssessmentError::Selector)?;
                result.owner[index] = result.owner[index]
                    .checked_add(1)
                    .ok_or(RuleAssessmentError::Selector)?;
                result.specificity[1] += 1;
                assess_body(branch, result)?;
            }
            OrderRuleShape::Rule { selector, nodes } => {
                // Functional/list/relational/pseudo-element selectors require
                // real assessment, never a colon count or boolean count.
                if selector == CHILD_SCOPE {
                    if std::mem::replace(&mut result.child_scope, true) {
                        return Err(RuleAssessmentError::Selector);
                    }
                } else if result.child_scope {
                    // Nothing is read inside the children's scope.
                    return Err(RuleAssessmentError::Selector);
                } else if let Some(owner) = owner_selector(selector) {
                    result.owner[owner] = result.owner[owner]
                        .checked_add(1)
                        .ok_or(RuleAssessmentError::Selector)?;
                    result.specificity[1] += 1;
                } else if PSEUDO_ELEMENTS.contains(&selector.as_str()) {
                    // A pseudo-element weighs one type, not one class.
                    result.selectors.push(selector);
                    result.specificity[2] += 1;
                } else {
                    let weight =
                        element_selector_weight(selector).ok_or(RuleAssessmentError::Selector)?;
                    result.selectors.push(selector);
                    result.specificity[1] += weight;
                }
                assess_body(nodes, result)?;
            }
            // A query around the rule adds no selector weight. Which query
            // it is stays recorded, so a write is ranked only when its own
            // condition asks the same one -- see `scalar_write_priority`.
            OrderRuleShape::AtRule {
                name,
                params,
                nodes,
            } if matches!(
                name.as_str(),
                "@media" | "@container" | "@supports" | "@starting-style"
            ) =>
            {
                result.media.push((name, params));
                assess_body(nodes, result)?;
            }
            OrderRuleShape::Comment => {}
            _ => return Err(RuleAssessmentError::AtRule),
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests;
