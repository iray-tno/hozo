//! Evidence about original CSS rules and write ownership, not permission to
//! reorder. Values, condition equivalence, composition tiers and Native edge
//! normalization still have to be proved by the caller of a future planner.
use crate::{OrderCandidateDescriptor, OrderRuleDescriptor, OrderRuleShape, StyleProperty};

/// Interaction facts and the boolean ARIA facts already delivered by Native
/// owners. This is predicate equivalence, not a variant precedence table.
pub(crate) const OWNER_PREDICATE_COUNT: usize = 10;

pub(crate) fn aria_owner_index(state: &str) -> Option<usize> {
    Some(match state {
        "busy" => 5,
        "checked" => 6,
        "expanded" => 7,
        "selected" => 8,
        "invalid" => 9,
        _ => return None,
    })
}

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
    /// Multiplicity of independently delivered interaction/ARIA predicates.
    /// Guard equivalence only; precedence still comes from the rule.
    pub owner: [u16; OWNER_PREDICATE_COUNT],
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
        owner: [0; OWNER_PREDICATE_COUNT],
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
                    _ => selector
                        .strip_prefix("&[aria-")
                        .and_then(|tail| tail.strip_suffix("=\"true\"]"))
                        .and_then(aria_owner_index)
                        .ok_or(RuleAssessmentError::Selector)?,
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
    fn absolute(length: &crate::Length) -> bool {
        match length {
            crate::Length::Px(_) | crate::Length::Spacing(_) => true,
            crate::Length::Unit(_, unit) => unit.px().is_some(),
            crate::Length::Css(_) => false,
        }
    }
    use StyleProperty::*;
    Some(match write {
        BackgroundColor(_) => "background-color",
        TextColor(_) => "color",
        FontWeight(_) => "font-weight",
        FontSize(length) if absolute(length) => "font-size",
        LineHeight(crate::LineHeight::Length(length) | crate::LineHeight::FontDefault(length))
            if absolute(length) =>
        {
            "line-height"
        }
        LetterSpacing(crate::LetterSpacing::Px(length)) if absolute(length) => "letter-spacing",
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
        FlexBasis(_) => "flex-basis",
        Display(crate::Display::Flex | crate::Display::None | crate::Display::Contents) => {
            "display"
        }
        Position(
            crate::Position::Relative | crate::Position::Absolute | crate::Position::Static,
        ) => "position",
        Overflow(crate::Overflow::Visible | crate::Overflow::Hidden | crate::Overflow::Scroll) => {
            "overflow"
        }
        TextDecorationLine("none" | "underline" | "line-through" | "underline line-through") => {
            "text-decoration-line"
        }
        TextDecorationColor(_) => "text-decoration-color",
        TextDecorationStyle(_) => "text-decoration-style",
        UserSelect("auto" | "text" | "none" | "all") => "user-select",
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
        Keyword("flex-wrap", "nowrap" | "wrap" | "wrap-reverse") => "flex-wrap",
        Keyword("backface-visibility", "visible" | "hidden") => "backface-visibility",
        Keyword("box-sizing", "border-box" | "content-box") => "box-sizing",
        Keyword("isolation", "auto" | "isolate") => "isolation",
        Keyword("pointer-events", "auto" | "none") => "pointer-events",
        Keyword("user-select", "auto" | "text" | "none" | "all") => "user-select",
        Keyword("vertical-align", "auto" | "top" | "bottom" | "middle") => "vertical-align",
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
            (StyleProperty::Display(crate::Display::None), "display"),
            (
                StyleProperty::Position(crate::Position::Absolute),
                "position",
            ),
            (StyleProperty::Overflow(crate::Overflow::Hidden), "overflow"),
            (
                StyleProperty::FlexBasis(crate::Dimension::Auto),
                "flex-basis",
            ),
            (
                StyleProperty::TextDecorationLine("underline"),
                "text-decoration-line",
            ),
            (
                StyleProperty::TextDecorationColor(crate::Color::Token("red-500".into())),
                "text-decoration-color",
            ),
            (
                StyleProperty::TextDecorationStyle(crate::DecorationStyle::Wavy),
                "text-decoration-style",
            ),
            (StyleProperty::UserSelect("none"), "user-select"),
            (StyleProperty::Keyword("flex-wrap", "wrap"), "flex-wrap"),
            (
                StyleProperty::Keyword("backface-visibility", "hidden"),
                "backface-visibility",
            ),
            (
                StyleProperty::Keyword("box-sizing", "border-box"),
                "box-sizing",
            ),
            (StyleProperty::Keyword("isolation", "isolate"), "isolation"),
            (
                StyleProperty::Keyword("pointer-events", "none"),
                "pointer-events",
            ),
            (
                StyleProperty::Keyword("vertical-align", "middle"),
                "vertical-align",
            ),
        ] {
            assert_eq!(scalar_css_property(&write), Some(property));
            assert!(crate::scalar_tailwind_property(&write));
            assert!(covers(property, &write));
            assert!(!covers("unrelated", &write));
        }
        for write in [
            StyleProperty::LineHeight(crate::LineHeight::Ratio(1.25)),
            StyleProperty::LetterSpacing(crate::LetterSpacing::Px(Length::Unit(
                1.0,
                crate::LengthUnit::Em,
            ))),
            StyleProperty::LineHeight(crate::LineHeight::Length(Length::Css("var(--line)".into()))),
            StyleProperty::Gap(Length::Px(8.0)),
            StyleProperty::ZIndex(None),
            StyleProperty::Keyword("font-style", "oblique"),
            StyleProperty::AlignContent(crate::Justify::Baseline),
            StyleProperty::JustifyContent(crate::Justify::Stretch),
            StyleProperty::Display(crate::Display::Grid),
            StyleProperty::Display(crate::Display::InlineFlex),
            StyleProperty::Position(crate::Position::Css("fixed")),
            StyleProperty::Overflow(crate::Overflow::Css("clip")),
            StyleProperty::TextDecorationLine("overline"),
            StyleProperty::UserSelect("contain"),
            StyleProperty::Keyword("vertical-align", "baseline"),
            StyleProperty::Keyword("pointer-events", "visiblePainted"),
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
    fn boolean_aria_assessment_matches_actual_independent_owner_facts_not_class_names() {
        for state in ["busy", "checked", "expanded", "selected", "invalid"] {
            let mut snapshot = portable_tailwind_snapshot();
            let candidate = snapshot
                .candidates
                .iter_mut()
                .find(|c| c.candidate == "p-2")
                .unwrap();
            let OrderRuleShape::Rule { nodes, .. } = &mut candidate.rules[0].shape else {
                panic!()
            };
            *nodes = vec![OrderRuleShape::Rule {
                selector: format!("&[aria-{state}=\"true\"]"),
                nodes: std::mem::take(nodes),
            }];
            let assessment = assess_tailwind_rule("p-2", &candidate.rules[0]).unwrap();
            assert_eq!(assessment.specificity, [0, 2, 0]);
            assert_eq!(assessment.owner[aria_owner_index(state).unwrap()], 1);
            assert_eq!(assessment.owner[4], 0, "aria-disabled is not :disabled");
            let context = TailwindOrderContext::new(snapshot).unwrap();
            let write = StyleProperty::PaddingTop(Length::Px(8.0));
            assert!(context
                .scalar_write_priority("p-2", &crate::Condition::Aria(state.into()), &write)
                .is_some());
            for wrong in [
                crate::Condition::Always,
                crate::Condition::Disabled,
                crate::Condition::Aria("unsupported".into()),
                crate::Condition::All(vec![
                    crate::Condition::Aria(state.into()),
                    crate::Condition::Aria(state.into()),
                ]),
            ] {
                assert!(context
                    .scalar_write_priority("p-2", &wrong, &write)
                    .is_none());
            }
        }
    }

    #[test]
    fn aria_assessment_does_not_guess_false_mixed_presence_flags_or_relational_selectors() {
        for selector in [
            "&[aria-checked=\"false\"]",
            "&[aria-checked=\"mixed\"]",
            "&[aria-selected]",
            "&[aria-selected=\"TRUE\"]",
            "&[aria-selected=\"true\" i]",
            "&:not([aria-selected=\"true\"])",
            "&[aria-selected=\"true\"] > *",
            "&[aria-pressed=\"true\"]",
            "&[aria-hidden=\"true\"]",
            "&[aria-disabled=\"true\"]",
        ] {
            let mut candidate = fixture("p-2");
            let OrderRuleShape::Rule { nodes, .. } = &mut candidate.rules[0].shape else {
                panic!()
            };
            *nodes = vec![OrderRuleShape::Rule {
                selector: selector.into(),
                nodes: std::mem::take(nodes),
            }];
            assert_eq!(
                assess_tailwind_rule("p-2", &candidate.rules[0]).unwrap_err(),
                RuleAssessmentError::Selector,
                "{selector}"
            );
        }
    }

    #[test]
    fn hoisted_property_definitions_do_not_become_owner_writes_or_selector_weight() {
        let candidate = fixture("font-bold");
        let assessment = assess_tailwind_rule("font-bold", &candidate.rules[0]).unwrap();
        assert_eq!(assessment.properties, ["--tw-font-weight", "font-weight"]);
        assert_eq!(assessment.specificity, [0, 1, 0]);
        assert_eq!(assessment.owner, [0; OWNER_PREDICATE_COUNT]);
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
    fn ownership_survives_longhand_expansion_and_names_absolute_text_writes() {
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
            TailwindWriteOwnership::Unique {
                css_property: "font-size",
                ..
            }
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
