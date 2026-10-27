//! Evidence about original CSS rules and write ownership, not permission to
//! reorder. Values, condition equivalence, composition tiers and Native edge
//! normalization still have to be proved by the caller of a future planner.
use crate::{OrderCandidateDescriptor, OrderRuleDescriptor, OrderRuleShape, StyleProperty};

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
    pub media: Vec<&'a str>,
    /// Multiplicity of hover/focus/focus-visible/active/disabled predicates.
    /// Guard equivalence only; precedence still comes from the rule.
    pub owner: [u16; 5],
}

/// Match Tailwind's escaped root literally, not a substring of another
/// selector. Only ASCII candidates are assessed in this initial domain.
fn root_selector(candidate: &str) -> Option<String> {
    if candidate.is_empty() || !candidate.is_ascii() {
        return None;
    }
    let mut out = String::from(".");
    for (index, byte) in candidate.bytes().enumerate() {
        if byte == 0 || byte < 32 || byte == 127 {
            return None;
        }
        if byte.is_ascii_digit() && (index == 0 || (index == 1 && candidate.starts_with('-'))) {
            out.push_str(&format!("\\{byte:x} "));
        } else if byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-' {
            if candidate == "-" {
                out.push('\\');
            }
            out.push(byte as char);
        } else {
            out.push('\\');
            out.push(byte as char);
        }
    }
    Some(out)
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
        owner: [0; 5],
    };
    assess_body(nodes, &mut result)?;
    if result.properties.is_empty() {
        return Err(RuleAssessmentError::Empty);
    }
    Ok(result)
}

/// A hoisted CSS property definition has no selector-owned style writes.
/// Only the closed registration shape is ignored, never arbitrary @root CSS.
pub(crate) fn property_registration(node: &OrderRuleShape) -> bool {
    let OrderRuleShape::AtRoot { nodes } = node else {
        return false;
    };
    !nodes.is_empty()
        && nodes.iter().all(|node| {
            let OrderRuleShape::AtRule {
                name,
                params,
                nodes,
            } = node
            else {
                return false;
            };
            if name != "@property"
                || !params.starts_with("--")
                || params.len() <= 2
                || !params
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
            {
                return false;
            }
            let mut syntax = false;
            let mut inherits = false;
            let mut initial = false;
            for node in nodes {
                let OrderRuleShape::Declaration {
                    property,
                    important: false,
                } = node
                else {
                    if matches!(node, OrderRuleShape::Comment) {
                        continue;
                    }
                    return false;
                };
                let seen = match property.as_str() {
                    "syntax" => &mut syntax,
                    "inherits" => &mut inherits,
                    "initial-value" => &mut initial,
                    _ => return false,
                };
                if *seen {
                    return false;
                }
                *seen = true;
            }
            syntax && inherits
        })
}

fn assess_body<'a>(
    nodes: &'a [OrderRuleShape],
    result: &mut AssessedTailwindRule<'a>,
) -> Result<(), RuleAssessmentError> {
    // A single chain of wrappers followed by declarations has one scope.
    // Sibling nested rules, or declarations beside a wrapper, do not.
    let branches = nodes
        .iter()
        .filter(|node| !matches!(node, OrderRuleShape::Comment) && !property_registration(node))
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
            OrderRuleShape::Rule { selector, nodes } => {
                // Functional/list/relational/pseudo-element selectors require
                // real assessment, never a colon count or boolean count.
                let owner = match selector.as_str() {
                    "&:hover" => 0,
                    "&:focus" => 1,
                    "&:focus-visible" => 2,
                    "&:active" => 3,
                    "&:disabled" => 4,
                    _ => return Err(RuleAssessmentError::Selector),
                };
                result.owner[owner] = result.owner[owner]
                    .checked_add(1)
                    .ok_or(RuleAssessmentError::Selector)?;
                result.specificity[1] += 1;
                assess_body(nodes, result)?;
            }
            OrderRuleShape::AtRule {
                name,
                params,
                nodes,
            } if name == "@media" && params == "(hover: hover)" => {
                result.media.push(params);
                assess_body(nodes, result)?;
            }
            OrderRuleShape::Comment => {}
            _ => return Err(RuleAssessmentError::AtRule),
        }
    }
    Ok(())
}

#[derive(Debug)]
pub enum TailwindWriteOwnership<'a> {
    Unique {
        rule_id: u32,
        css_property: &'a str,
        specificity: [u32; 3],
    },
    Unknown(&'static str),
}

/// This bounded mapping names the CSS write *before* platform expansion.
/// It is not a property-order table. Shorthand/axis ownership does not prove
/// that Yoga and CSS resolve logical/physical conflicts in the same way.
pub(crate) fn covers(property: &str, write: &StyleProperty) -> bool {
    if let Some(expected) = scalar_css_property(write) {
        return property == expected;
    }
    use StyleProperty::*;
    match write {
        PaddingTop(_) => matches!(property, "padding" | "padding-block" | "padding-top"),
        PaddingBottom(_) => matches!(property, "padding" | "padding-block" | "padding-bottom"),
        PaddingLeft(_) => matches!(property, "padding" | "padding-inline" | "padding-left"),
        PaddingRight(_) => matches!(property, "padding" | "padding-inline" | "padding-right"),
        PaddingInlineStart(_) => matches!(
            property,
            "padding" | "padding-inline" | "padding-inline-start"
        ),
        PaddingInlineEnd(_) => matches!(
            property,
            "padding" | "padding-inline" | "padding-inline-end"
        ),
        MarginTop(_) => matches!(property, "margin" | "margin-block" | "margin-top"),
        MarginBottom(_) => matches!(property, "margin" | "margin-block" | "margin-bottom"),
        MarginLeft(_) => matches!(property, "margin" | "margin-inline" | "margin-left"),
        MarginRight(_) => matches!(property, "margin" | "margin-inline" | "margin-right"),
        MarginInlineStart(_) => {
            matches!(property, "margin" | "margin-inline" | "margin-inline-start")
        }
        MarginInlineEnd(_) => matches!(property, "margin" | "margin-inline" | "margin-inline-end"),
        Gap(_) => property == "gap",
        RowGap(_) => matches!(property, "gap" | "row-gap"),
        ColumnGap(_) => matches!(property, "gap" | "column-gap"),
        _ => false,
    }
}

/// Single-key projections with no shorthand/longhand alias, font-relative
/// folding or shared register composition. This is write ownership, never a
/// utility precedence table: priority still comes from the captured CSS rule.
/// Keep this definition shared by static planning and candidate generation.
pub(crate) fn scalar_css_property(write: &StyleProperty) -> Option<&'static str> {
    use StyleProperty::*;
    Some(match write {
        BackgroundColor(_) => "background-color",
        TextColor(_) => "color",
        FontWeight(_) => "font-weight",
        Width(_) => "width",
        Height(_) => "height",
        MinWidth(_) => "min-width",
        MaxWidth(_) => "max-width",
        MinHeight(_) => "min-height",
        MaxHeight(_) => "max-height",
        Opacity(_) => "opacity",
        ZIndex(Some(_)) => "z-index",
        FlexDirection(_) => "flex-direction",
        FlexGrow(_) => "flex-grow",
        FlexShrink(_) => "flex-shrink",
        AlignItems(
            crate::Align::Start
            | crate::Align::Center
            | crate::Align::End
            | crate::Align::Stretch
            | crate::Align::Baseline,
        ) => "align-items",
        AlignSelf(
            crate::AlignSelf::Auto
            | crate::AlignSelf::Start
            | crate::AlignSelf::Center
            | crate::AlignSelf::End
            | crate::AlignSelf::Stretch
            | crate::AlignSelf::Baseline,
        ) => "align-self",
        AlignContent(
            crate::Justify::Start
            | crate::Justify::Center
            | crate::Justify::End
            | crate::Justify::Between
            | crate::Justify::Around
            | crate::Justify::Evenly
            | crate::Justify::Stretch,
        ) => "align-content",
        JustifyContent(
            crate::Justify::Start
            | crate::Justify::Center
            | crate::Justify::End
            | crate::Justify::Between
            | crate::Justify::Around
            | crate::Justify::Evenly,
        ) => "justify-content",
        TextAlign(crate::TextAlign::Left | crate::TextAlign::Center | crate::TextAlign::Right) => {
            "text-align"
        }
        TextTransform(_) => "text-transform",
        Keyword("font-style", "normal" | "italic") => "font-style",
        _ => return None,
    })
}

pub fn assess_tailwind_write<'a>(
    candidate: &'a OrderCandidateDescriptor,
    write: &StyleProperty,
) -> TailwindWriteOwnership<'a> {
    let mut found = None;
    for rule in &candidate.rules {
        let assessment = match assess_tailwind_rule(&candidate.candidate, rule) {
            Ok(assessment) => assessment,
            // An unassessed rule could also write this property. Do not
            // cherry-pick a unique-looking owner from the assessed remainder.
            Err(reason) => return TailwindWriteOwnership::Unknown(reason.reason()),
        };
        for property in assessment.properties {
            if covers(property, write) {
                if found.is_some() {
                    return TailwindWriteOwnership::Unknown("ambiguous-property-owner");
                }
                found = Some(TailwindWriteOwnership::Unique {
                    rule_id: rule.id,
                    css_property: property,
                    specificity: assessment.specificity,
                });
            }
        }
    }
    found.unwrap_or(TailwindWriteOwnership::Unknown("unmapped-property"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{portable_tailwind_snapshot, Length, TailwindOrderContext};

    #[test]
    fn simple_projections_share_exact_css_ownership_with_scalar_eligibility() {
        for (write, property) in [
            (StyleProperty::Opacity(0.5), "opacity"),
            (StyleProperty::ZIndex(Some(10)), "z-index"),
            (
                StyleProperty::FlexDirection(crate::FlexDirection::Row),
                "flex-direction",
            ),
            (StyleProperty::FlexGrow(1.0), "flex-grow"),
            (StyleProperty::FlexShrink(0.0), "flex-shrink"),
            (
                StyleProperty::AlignItems(crate::Align::Center),
                "align-items",
            ),
            (
                StyleProperty::AlignSelf(crate::AlignSelf::Center),
                "align-self",
            ),
            (
                StyleProperty::AlignContent(crate::Justify::Center),
                "align-content",
            ),
            (
                StyleProperty::JustifyContent(crate::Justify::Center),
                "justify-content",
            ),
            (
                StyleProperty::TextAlign(crate::TextAlign::Center),
                "text-align",
            ),
            (
                StyleProperty::TextTransform(crate::TextTransform::Uppercase),
                "text-transform",
            ),
            (StyleProperty::Keyword("font-style", "italic"), "font-style"),
        ] {
            assert_eq!(scalar_css_property(&write), Some(property));
            assert!(crate::scalar_tailwind_property(&write));
            assert!(covers(property, &write));
            assert!(!covers("unrelated", &write));
        }
        for write in [
            StyleProperty::FontSize(Length::Px(18.0)),
            StyleProperty::Gap(Length::Px(8.0)),
            StyleProperty::ZIndex(None),
            StyleProperty::Keyword("font-style", "oblique"),
            StyleProperty::AlignContent(crate::Justify::Baseline),
            StyleProperty::JustifyContent(crate::Justify::Stretch),
        ] {
            assert_eq!(scalar_css_property(&write), None);
            assert!(!crate::scalar_tailwind_property(&write));
        }
    }

    fn fixture(name: &str) -> OrderCandidateDescriptor {
        portable_tailwind_snapshot()
            .candidates
            .into_iter()
            .find(|entry| entry.candidate == name)
            .unwrap()
    }

    #[test]
    fn hoisted_property_definitions_do_not_become_owner_writes_or_selector_weight() {
        let candidate = fixture("font-bold");
        let assessment = assess_tailwind_rule("font-bold", &candidate.rules[0]).unwrap();
        assert_eq!(assessment.properties, ["--tw-font-weight", "font-weight"]);
        assert_eq!(assessment.specificity, [0, 1, 0]);
        assert_eq!(assessment.owner, [0; 5]);
        let context = TailwindOrderContext::new(portable_tailwind_snapshot()).unwrap();
        assert!(context
            .scalar_write_priority(
                "font-bold",
                &crate::Condition::Always,
                &StyleProperty::FontWeight(crate::FontWeight::Theme {
                    name: "bold",
                    fallback: 700
                })
            )
            .is_some());
    }

    #[test]
    fn registration_normalization_never_discards_arbitrary_hoisted_css() {
        let base = fixture("font-bold");
        let OrderRuleShape::Rule { nodes, .. } = &base.rules[0].shape else {
            panic!()
        };
        let registration = nodes
            .iter()
            .find(|node| matches!(node, OrderRuleShape::AtRoot { .. }))
            .unwrap();
        assert!(property_registration(registration));
        for (name, fields) in [
            ("@media", vec!["syntax", "inherits"]),
            ("@property", vec!["syntax"]),
            ("@property", vec!["syntax", "inherits", "color"]),
            ("@property", vec!["syntax", "inherits", "inherits"]),
        ] {
            let bad = OrderRuleShape::AtRoot {
                nodes: vec![OrderRuleShape::AtRule {
                    name: name.into(),
                    params: "--tw-font-weight".into(),
                    nodes: fields
                        .into_iter()
                        .map(|property| OrderRuleShape::Declaration {
                            property: property.into(),
                            important: false,
                        })
                        .collect(),
                }],
            };
            assert!(!property_registration(&bad));
        }
    }

    #[test]
    fn portable_facts_are_opt_in_exact_and_validate_in_the_project_context_type() {
        let context = TailwindOrderContext::new(portable_tailwind_snapshot()).unwrap();
        assert_eq!(context.snapshot().tailwind_version, "4.3.3");
        assert_eq!(context.snapshot().candidates.len(), 90);
        assert_eq!(
            context.snapshot().stylesheets[0].file,
            "builtin:tailwindcss/theme.css"
        );
        assert!(context.lookup("p-3").is_none());
        assert!(context.lookup("unrecognized:p-2").is_none());
        assert!(context.lookup("notautility").unwrap().rules.is_empty());
    }

    #[test]
    fn original_owner_selectors_not_ir_guard_counts_supply_bounded_specificity() {
        for (name, weight, media) in [
            ("p-2", 1, 0),
            ("p-[3px]", 1, 0),
            ("p-0.5", 1, 0),
            ("w-1/2", 1, 0),
            ("bg-[#123456]", 1, 0),
            ("p-2!", 1, 0),
            ("hover:p-4", 2, 1),
            ("focus:p-4", 2, 0),
            ("focus-visible:p-4", 2, 0),
            ("disabled:p-4", 2, 0),
            ("hover:focus:p-4", 3, 1),
            ("hover:p-2!", 2, 1),
        ] {
            let candidate = fixture(name);
            assert_eq!(candidate.rules.len(), 1, "{name}");
            let assessed = assess_tailwind_rule(name, &candidate.rules[0]).unwrap();
            assert_eq!(assessed.specificity, [0, weight, 0], "{name}");
            assert_eq!(assessed.media.len(), media, "{name}");
        }
        for name in [
            "placeholder:text-red-500",
            "group-hover:p-2",
            "sm:p-2",
            "[&:where(:hover)]:p-2",
            "[&>span]:p-2",
            "not-hover:p-2",
        ] {
            let candidate = fixture(name);
            assert!(!candidate.rules.is_empty());
            assert!(
                candidate
                    .rules
                    .iter()
                    .any(|rule| assess_tailwind_rule(name, rule).is_err()),
                "{name}"
            );
        }
    }

    #[test]
    fn ownership_survives_longhand_expansion_but_does_not_certify_compound_defaults() {
        for (name, write, expected) in [
            (
                "p-2",
                StyleProperty::PaddingLeft(Length::Px(8.0)),
                "padding",
            ),
            (
                "px-2",
                StyleProperty::PaddingRight(Length::Px(8.0)),
                "padding-inline",
            ),
            (
                "py-2",
                StyleProperty::PaddingBottom(Length::Px(8.0)),
                "padding-block",
            ),
        ] {
            let candidate = fixture(name);
            let TailwindWriteOwnership::Unique {
                rule_id,
                css_property,
                ..
            } = assess_tailwind_write(&candidate, &write)
            else {
                panic!("{name}")
            };
            assert_eq!(rule_id, candidate.rules[0].id);
            assert_eq!(css_property, expected);
        }
        let text = fixture("text-lg");
        assert!(matches!(
            assess_tailwind_write(&text, &StyleProperty::FontSize(Length::Px(18.0))),
            TailwindWriteOwnership::Unknown("unmapped-property")
        ));
    }

    #[test]
    fn multiple_rules_require_unique_property_ownership_not_an_assumed_first_rule() {
        let mut candidate = fixture("p-2");
        let mut second = fixture("bg-red-500").rules.remove(0);
        second.id = 999;
        second.candidate_id = candidate.id;
        if let OrderRuleShape::Rule { selector, .. } = &mut second.shape {
            *selector = ".p-2".into();
        }
        candidate.rules.push(second);
        let write = StyleProperty::BackgroundColor(crate::Color::Token("red-500".into()));
        assert!(matches!(
            assess_tailwind_write(&candidate, &write),
            TailwindWriteOwnership::Unique {
                rule_id: 999,
                css_property: "background-color",
                ..
            }
        ));
        let mut repeated = fixture("p-2").rules.remove(0);
        repeated.id = 1000;
        candidate.rules.push(repeated);
        assert!(matches!(
            assess_tailwind_write(&candidate, &StyleProperty::PaddingLeft(Length::Px(8.0))),
            TailwindWriteOwnership::Unknown("ambiguous-property-owner")
        ));
        // Unknown siblings might overlap; do not discard one then declare
        // the assessed remainder uniquely owned.
        if let OrderRuleShape::Rule { selector, .. } = &mut candidate.rules[2].shape {
            *selector = ".p-2 > span".into();
        }
        assert!(matches!(
            assess_tailwind_write(&candidate, &write),
            TailwindWriteOwnership::Unknown("unassessed-selector")
        ));
    }

    #[test]
    fn mixed_branches_and_importance_are_not_collapsed_into_a_single_scope() {
        let mut candidate = fixture("p-2");
        if let OrderRuleShape::Rule { nodes, .. } = &mut candidate.rules[0].shape {
            nodes.push(OrderRuleShape::Rule {
                selector: "&:hover".into(),
                nodes: vec![],
            });
        }
        assert_eq!(
            assess_tailwind_rule("p-2", &candidate.rules[0]).unwrap_err(),
            RuleAssessmentError::Branching
        );
        let mut candidate = fixture("p-2");
        candidate.rules[0].important = true;
        assert_eq!(
            assess_tailwind_rule("p-2", &candidate.rules[0]).unwrap_err(),
            RuleAssessmentError::Importance
        );
    }
}
