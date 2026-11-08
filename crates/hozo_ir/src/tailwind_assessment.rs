//! Evidence about original CSS rules and write ownership, not permission to
//! reorder. Values, condition equivalence, composition tiers and Native edge
//! normalization still have to be proved by the caller of a future planner.
use crate::{OrderCandidateDescriptor, OrderRuleDescriptor, OrderRuleShape, StyleProperty};

/// Interaction facts and the boolean ARIA facts already delivered by Native
/// owners. This is predicate equivalence, not a variant precedence table.
const ARIA_FACT_COUNT: usize = 6;
pub(crate) const OWNER_PREDICATE_COUNT: usize = 5 + 2 * ARIA_FACT_COUNT;

pub(crate) fn aria_owner_index(state: &str) -> Option<usize> {
    Some(match state {
        "busy" => 5,
        "checked" => 6,
        "expanded" => 7,
        "selected" => 8,
        "invalid" => 9,
        "disabled" => 10,
        _ => return None,
    })
}

pub(crate) fn negated_aria_owner_index(state: &str) -> Option<usize> {
    // Negation is a distinct original-selector atom, not a different rank.
    aria_owner_index(state).map(|index| index + ARIA_FACT_COUNT)
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
    /// Every query wrapper, as `(name, params)` in nesting order. Ordering
    /// matches these against the write's own condition before ranking it.
    pub media: Vec<(&'a str, &'a str)>,
    /// Conditions on the element itself outside the owner facts, as written.
    /// Matched against the write's condition the same way as `media`.
    pub selectors: Vec<&'a str>,
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
        selectors: Vec::new(),
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

/// The interaction and boolean ARIA selectors whose facts an owner delivers.
pub(crate) fn owner_selector(selector: &str) -> Option<usize> {
    match selector {
        "&:hover" => Some(0),
        "&:focus" => Some(1),
        "&:focus-visible" => Some(2),
        "&:active" => Some(3),
        "&:disabled" => Some(4),
        _ => selector
            .strip_prefix("&[aria-")
            .and_then(|tail| tail.strip_suffix("=\"true\"]"))
            .and_then(aria_owner_index)
            .or_else(|| {
                selector
                    .strip_prefix("&:not(*[aria-")
                    .and_then(|tail| tail.strip_suffix("=\"true\"])"))
                    .and_then(negated_aria_owner_index)
            }),
    }
}

/// A condition on the element itself whose weight is read from a closed
/// set of shapes, never counted from colons (#1230). Anything else -- a
/// relation, a list, a pseudo-element, `:visited` -- stays unassessed.
///
/// - one bare pseudo-class, `&:first-child`: one class weight;
/// - `&:nth-child(odd)` and the other three `nth` forms: one;
/// - one `data-` attribute, `&[data-state="open"]`: one;
/// - Tailwind's own `open:` and `inert:` spellings: one, from the
///   attribute inside `:is()`;
/// - Tailwind's `ltr:`/`rtl:`, wrapped in `:where()`: none;
/// - a relation around one of those weighing one, or around an owner
///   state (`:hover`, `[aria-checked="true"]`): `group-` and `peer-`
///   inside `:is()` and `has-` inside `:has(*…)` weigh what the inner
///   compound weighs, one; `in-` is `:where(*…) &` and weighs none.
pub(crate) fn element_selector_weight(selector: &str) -> Option<u32> {
    // `:is()` and `:has()` take their argument's weight and `:where(.group)`
    // adds none, so the relation weighs exactly its inner compound.
    let inner = |inner: &str| {
        let compound = format!("&{inner}");
        (owner_selector(&compound).is_some() || compound_selector_weight(&compound) == Some(1))
            .then_some(1)
    };
    if let Some(rest) = selector
        .strip_prefix("&:is(:where(.group)")
        .and_then(|rest| rest.strip_suffix(" *)"))
        .or_else(|| {
            selector
                .strip_prefix("&:is(:where(.peer)")
                .and_then(|rest| rest.strip_suffix(" ~ *)"))
        })
        .or_else(|| {
            selector
                .strip_prefix("&:has(*")
                .and_then(|rest| rest.strip_suffix(')'))
        })
    {
        return inner(rest);
    }
    if let Some(rest) = selector
        .strip_prefix(":where(*")
        .and_then(|rest| rest.strip_suffix(") &"))
    {
        return inner(rest).map(|_| 0);
    }
    compound_selector_weight(selector)
}

/// The element's own compound, without a relation: a relation never nests.
fn compound_selector_weight(selector: &str) -> Option<u32> {
    const WEIGHTLESS: [&str; 2] = [
        "&:where(:dir(ltr), [dir=\"ltr\"], [dir=\"ltr\"] *)",
        "&:where(:dir(rtl), [dir=\"rtl\"], [dir=\"rtl\"] *)",
    ];
    const ONE: [&str; 2] = [
        "&:is([open], :popover-open, :open)",
        "&:is([inert], [inert] *)",
    ];
    if WEIGHTLESS.contains(&selector) {
        return Some(0);
    }
    if ONE.contains(&selector) {
        return Some(1);
    }
    let name = |text: &str| {
        !text.is_empty()
            && text
                .bytes()
                .all(|byte| byte.is_ascii_lowercase() || byte == b'-')
    };
    if let Some(pseudo) = selector.strip_prefix("&:") {
        if name(pseudo) && pseudo != "visited" {
            return Some(1);
        }
        for function in [
            "nth-child(",
            "nth-last-child(",
            "nth-of-type(",
            "nth-last-of-type(",
        ] {
            if let Some(formula) = pseudo
                .strip_prefix(function)
                .and_then(|rest| rest.strip_suffix(')'))
            {
                return (!formula.is_empty()
                    && formula
                        .bytes()
                        .all(|byte| byte.is_ascii_alphanumeric() || byte == b'+' || byte == b'-'))
                .then_some(1);
            }
        }
        return None;
    }
    let attribute = selector.strip_prefix("&[data-")?.strip_suffix(']')?;
    let (attribute, value) = match attribute.split_once('=') {
        None => (attribute, None),
        Some((attribute, value)) => (attribute, Some(value)),
    };
    let quoted = |value: &str| {
        value
            .strip_prefix('"')
            .and_then(|value| value.strip_suffix('"'))
            .is_some_and(|inner| !inner.contains(['"', '\\', ']']))
    };
    let plain = !attribute.is_empty()
        && attribute
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-');
    (plain && value.is_none_or(quoted)).then_some(1)
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
                if let Some(owner) = owner_selector(selector) {
                    result.owner[owner] = result.owner[owner]
                        .checked_add(1)
                        .ok_or(RuleAssessmentError::Selector)?;
                    result.specificity[1] += 1;
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
            } if matches!(name.as_str(), "@media" | "@container" | "@supports") => {
                result.media.push((name, params));
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
    use StyleProperty::*;
    // `inset-2` writes all four physical edges from one `inset` declaration.
    // Each edge is still one Native key, so it stays a scalar projection.
    match write {
        InsetTop(_) => return matches!(property, "inset" | "top"),
        InsetRight(_) => return matches!(property, "inset" | "right"),
        InsetBottom(_) => return matches!(property, "inset" | "bottom"),
        InsetLeft(_) => return matches!(property, "inset" | "left"),
        _ => {}
    }
    if let Some(expected) = scalar_css_property(write) {
        return property == expected;
    }
    if let Some(owners) = border_edge_properties(write) {
        return owners.contains(&property);
    }
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
        InsetInline(_) => property == "inset-inline",
        InsetInlineStart(_) => property == "inset-inline-start",
        InsetInlineEnd(_) => property == "inset-inline-end",
        InsetBlock(_) => property == "inset-block",
        InsetBlockStart(_) => property == "inset-block-start",
        InsetBlockEnd(_) => property == "inset-block-end",
        Gap(_) => property == "gap",
        RowGap(_) => matches!(property, "gap" | "row-gap"),
        ColumnGap(_) => matches!(property, "gap" | "column-gap"),
        _ => false,
    }
}

/// The CSS declarations that write a border width, or the style Tailwind
/// writes beside every width (`border-style: var(--tw-border-style)`).
///
/// A width utility's style reads the `--tw-border-style` register, so it is
/// `solid` unless a style utility sets the register -- which Hozo lowers as a
/// literal `solid`. That literal is only safe to rank against other width
/// utilities; a style utility (which declares the register itself) stays
/// unranked, see `register_bound`. Widths in font-relative units fold
/// through the font size and are left out, as `font-size` is.
pub(crate) fn border_edge_properties(write: &StyleProperty) -> Option<[&'static str; 2]> {
    use crate::Edge;
    use StyleProperty::*;
    fn absolute(length: &crate::Length) -> bool {
        match length {
            crate::Length::Px(_) | crate::Length::Spacing(_) => true,
            crate::Length::Unit(_, unit) => unit.px().is_some(),
            crate::Length::Css(_) => false,
        }
    }
    fn logical(edge: Edge, suffix: &'static str) -> Option<&'static str> {
        Some(match (edge, suffix) {
            (Edge::Inline, "width") => "border-inline-width",
            (Edge::Block, "width") => "border-block-width",
            (Edge::InlineStart, "width") => "border-inline-start-width",
            (Edge::InlineEnd, "width") => "border-inline-end-width",
            (Edge::BlockStart, "width") => "border-block-start-width",
            (Edge::BlockEnd, "width") => "border-block-end-width",
            (Edge::Inline, _) => "border-inline-style",
            (Edge::Block, _) => "border-block-style",
            (Edge::InlineStart, _) => "border-inline-start-style",
            (Edge::InlineEnd, _) => "border-inline-end-style",
            (Edge::BlockStart, _) => "border-block-start-style",
            (Edge::BlockEnd, _) => "border-block-end-style",
            _ => return None,
        })
    }
    Some(match write {
        BorderTopWidth(length) if absolute(length) => ["border-width", "border-top-width"],
        BorderRightWidth(length) if absolute(length) => ["border-width", "border-right-width"],
        BorderBottomWidth(length) if absolute(length) => ["border-width", "border-bottom-width"],
        BorderLeftWidth(length) if absolute(length) => ["border-width", "border-left-width"],
        BorderTopStyle(_) => ["border-style", "border-top-style"],
        BorderRightStyle(_) => ["border-style", "border-right-style"],
        BorderBottomStyle(_) => ["border-style", "border-bottom-style"],
        BorderLeftStyle(_) => ["border-style", "border-left-style"],
        BorderLogicalWidth(edge, length) if absolute(length) => {
            let property = logical(*edge, "width")?;
            [property, property]
        }
        BorderLogicalStyle(edge, _) => {
            let property = logical(*edge, "style")?;
            [property, property]
        }
        _ => return None,
    })
}

/// The style register a style write competes with, if any.
pub(crate) fn style_register(write: &StyleProperty) -> Option<&'static str> {
    use StyleProperty::*;
    match write {
        BorderTopStyle(_)
        | BorderRightStyle(_)
        | BorderBottomStyle(_)
        | BorderLeftStyle(_)
        | BorderLogicalStyle(..) => Some("--tw-border-style"),
        OutlineStyle(_) => Some("--tw-outline-style"),
        _ => None,
    }
}

/// A border or outline style written by a rule that also sets that style's
/// register (`--tw-border-style`, `--tw-outline-style`). Wherever such a
/// style utility applies, every width utility's style reads the register and
/// agrees with it, whatever the two rules' order. Hozo's width utilities
/// write a literal `solid` instead, which ranking would let override the
/// style utility (`border-dashed md:border-2`), so these writes stay
/// unranked and keep their input in authored order.
pub(crate) fn register_bound<'p>(
    mut properties: impl Iterator<Item = &'p str>,
    write: &StyleProperty,
) -> bool {
    style_register(write).is_some_and(|register| properties.any(|property| property == register))
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
        // One `flex` declaration on Web. On Native it projects to `flex` or
        // to `flexGrow`/`flexShrink`, the same keys `grow-*`/`shrink-*`
        // write. Yoga lets an explicit `flexGrow` beat `flex` by key and
        // Tailwind emits `flex-grow` after `flex`, so the two agree; where
        // the keys coincide (`flex-auto grow-0`), the order decides.
        Flex(_) => "flex",
        // `Block` is one Native key too: Yoga has no block context, so it
        // projects to `display: 'flex'`, which still has to beat an earlier
        // `display: 'none'` in the same order Tailwind's rules do.
        // `InlineFlex` is also `display: 'flex'`; Native adds a synthetic
        // `alignSelf: 'flex-start'` after ordering, only when no `self-*`
        // is authored and no later display in the same condition replaces
        // it, so ranking decides which display is "later" as Tailwind does.
        Display(
            crate::Display::Flex
            | crate::Display::None
            | crate::Display::Contents
            | crate::Display::Block
            | crate::Display::InlineFlex,
        ) => "display",
        // One CSS property and, where Native has it, one Native key each.
        InsetTop(_) => "top",
        InsetRight(_) => "right",
        InsetBottom(_) => "bottom",
        InsetLeft(_) => "left",
        AspectRatio(_) => "aspect-ratio",
        Order(_) => "order",
        BorderRadius(_) => "border-radius",
        // Each corner is its own declaration in Tailwind and its own key on
        // Native. Yoga lets a corner beat `borderRadius` by key, and Tailwind
        // emits every corner after `border-radius`, so the two agree.
        BorderTopLeftRadius(_) => "border-top-left-radius",
        BorderTopRightRadius(_) => "border-top-right-radius",
        BorderBottomRightRadius(_) => "border-bottom-right-radius",
        BorderBottomLeftRadius(_) => "border-bottom-left-radius",
        BorderStartStartRadius(_) => "border-start-start-radius",
        BorderStartEndRadius(_) => "border-start-end-radius",
        BorderEndStartRadius(_) => "border-end-start-radius",
        BorderEndEndRadius(_) => "border-end-end-radius",
        // Border colours, one declaration each. An axis writes two Native
        // keys (`borderStartColor`/`borderEndColor`), as `px-*` does; a side
        // beats `borderColor` by key, and Tailwind emits every side after
        // `border-color`, so the class tier agrees either way.
        BorderColor(_) => "border-color",
        BorderTopColor(_) => "border-top-color",
        BorderRightColor(_) => "border-right-color",
        BorderBottomColor(_) => "border-bottom-color",
        BorderLeftColor(_) => "border-left-color",
        BorderInlineColor(_) => "border-inline-color",
        BorderBlockColor(_) => "border-block-color",
        BorderInlineStartColor(_) => "border-inline-start-color",
        BorderInlineEndColor(_) => "border-inline-end-color",
        BorderBlockStartColor(_) => "border-block-start-color",
        BorderBlockEndColor(_) => "border-block-end-color",
        // Outline widths write `outline-style: var(--tw-outline-style)`
        // beside the width, as border widths do; a style utility's own
        // write is kept out by `register_bound`. `None` projects to Native's
        // `outlineWidth: 0`, a width key, so it stays out of the domain.
        OutlineWidth(length) if absolute(length) => "outline-width",
        OutlineStyle(style) if *style != crate::BorderStyle::None => "outline-style",
        OutlineColor(_) => "outline-color",
        OutlineOffset(length) if absolute(length) => "outline-offset",
        Position(
            crate::Position::Relative | crate::Position::Absolute | crate::Position::Static,
        ) => "position",
        // `auto`, `clip` and the axes have no Native key and are refused
        // there, as a cursor Native lacks is; on Web they still cascade in
        // Tailwind's order, `overflow` before `overflow-x` and `overflow-y`.
        Overflow(_) => "overflow",
        OverflowX(_) => "overflow-x",
        OverflowY(_) => "overflow-y",
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
        // `start`, `end` and `justify` write the same `textAlign` key on
        // Native as `left`, `center` and `right` do.
        TextAlign(_) => "text-align",
        TextTransform(_) => "text-transform",
        Keyword("font-style", "normal" | "italic") => "font-style",
        Keyword("flex-wrap", "nowrap" | "wrap" | "wrap-reverse") => "flex-wrap",
        Keyword("backface-visibility", "visible" | "hidden") => "backface-visibility",
        Keyword("box-sizing", "border-box" | "content-box") => "box-sizing",
        Keyword("isolation", "auto" | "isolate") => "isolation",
        Keyword("pointer-events", "auto" | "none") => "pointer-events",
        Keyword("user-select", "auto" | "text" | "none" | "all") => "user-select",
        Keyword("vertical-align", "auto" | "top" | "bottom" | "middle") => "vertical-align",
        // One declaration and, where Native has it, one key each. A cursor
        // Native lacks is refused there, as an unsupported display is.
        Cursor(_) => "cursor",
        ObjectFit(_) => "object-fit",
        // `mixBlendMode` on Native, apart from `plus-darker`, which is
        // refused there as before; `bg-blend-*` is refused there whole.
        MixBlendMode(_) => "mix-blend-mode",
        BackgroundBlendMode(_) => "background-blend-mode",
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
        if register_bound(assessment.properties.iter().copied(), write) {
            return TailwindWriteOwnership::Unknown("register-bound-property");
        }
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
                StyleProperty::TextAlign(crate::TextAlign::Css("justify")),
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
                StyleProperty::Overflow(crate::Overflow::Css("clip")),
                "overflow",
            ),
            (
                StyleProperty::OverflowX(crate::Overflow::Css("auto")),
                "overflow-x",
            ),
            (
                StyleProperty::OverflowY(crate::Overflow::Hidden),
                "overflow-y",
            ),
            (StyleProperty::Flex(crate::FlexShorthand::Grow(1.0)), "flex"),
            (StyleProperty::Flex(crate::FlexShorthand::None), "flex"),
            (StyleProperty::Cursor("pointer".into()), "cursor"),
            (StyleProperty::ObjectFit("cover"), "object-fit"),
            (StyleProperty::MixBlendMode("multiply"), "mix-blend-mode"),
            (
                StyleProperty::BackgroundBlendMode("screen"),
                "background-blend-mode",
            ),
            (
                StyleProperty::Display(crate::Display::InlineFlex),
                "display",
            ),
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
            (StyleProperty::Display(crate::Display::Block), "display"),
            (StyleProperty::InsetTop(crate::Dimension::Auto), "top"),
            (StyleProperty::InsetRight(crate::Dimension::Auto), "right"),
            (StyleProperty::InsetBottom(crate::Dimension::Auto), "bottom"),
            (StyleProperty::InsetLeft(crate::Dimension::Auto), "left"),
            (StyleProperty::AspectRatio("16 / 9"), "aspect-ratio"),
            (StyleProperty::Order(1), "order"),
            (
                StyleProperty::BorderRadius(crate::Radius::Full),
                "border-radius",
            ),
            (
                StyleProperty::BorderTopLeftRadius(crate::Radius::Full),
                "border-top-left-radius",
            ),
            (
                StyleProperty::BorderEndStartRadius(crate::Radius::Full),
                "border-end-start-radius",
            ),
            (
                StyleProperty::BorderColor(crate::Color::Token("red-500".into())),
                "border-color",
            ),
            (
                StyleProperty::BorderInlineStartColor(crate::Color::Token("red-500".into())),
                "border-inline-start-color",
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
            StyleProperty::ZIndex(None),
            StyleProperty::Keyword("font-style", "oblique"),
            StyleProperty::AlignContent(crate::Justify::Baseline),
            StyleProperty::JustifyContent(crate::Justify::Stretch),
            StyleProperty::Display(crate::Display::Grid),
            StyleProperty::Position(crate::Position::Css("fixed")),
            StyleProperty::TextDecorationLine("overline"),
            StyleProperty::UserSelect("contain"),
            StyleProperty::Keyword("vertical-align", "baseline"),
            StyleProperty::Keyword("pointer-events", "visiblePainted"),
        ] {
            assert_eq!(scalar_css_property(&write), None);
            assert!(!crate::scalar_tailwind_property(&write));
        }
    }

    #[test]
    fn axis_and_logical_writes_own_their_shorthands_and_nothing_else() {
        let px = Length::Px(8.0);
        let edge = crate::Dimension::Length(px.clone());
        for (write, owners) in [
            (
                StyleProperty::PaddingInlineStart(px.clone()),
                &["padding", "padding-inline", "padding-inline-start"][..],
            ),
            (
                StyleProperty::MarginInlineEnd(edge.clone()),
                &["margin", "margin-inline", "margin-inline-end"],
            ),
            (StyleProperty::Gap(px.clone()), &["gap"]),
            (StyleProperty::RowGap(px.clone()), &["gap", "row-gap"]),
            (StyleProperty::ColumnGap(px.clone()), &["gap", "column-gap"]),
            (StyleProperty::InsetTop(edge.clone()), &["inset", "top"]),
            (StyleProperty::InsetLeft(edge.clone()), &["inset", "left"]),
            (StyleProperty::InsetInline(edge.clone()), &["inset-inline"]),
            (
                StyleProperty::InsetInlineStart(edge.clone()),
                &["inset-inline-start"],
            ),
            (StyleProperty::InsetBlockEnd(edge), &["inset-block-end"]),
        ] {
            assert!(crate::scalar_tailwind_property(&write), "{write:?}");
            for property in [
                "padding",
                "padding-inline",
                "padding-inline-start",
                "padding-left",
                "margin",
                "margin-inline",
                "margin-inline-end",
                "gap",
                "column-gap",
                "row-gap",
                "inset",
                "inset-inline",
                "inset-inline-start",
                "inset-block",
                "inset-block-end",
                "top",
                "left",
            ] {
                assert_eq!(
                    covers(property, &write),
                    owners.contains(&property),
                    "{write:?} / {property}"
                );
            }
        }
    }

    #[test]
    fn border_widths_and_their_style_rank_but_a_style_register_does_not() {
        use crate::{BorderStyle, Edge};
        let px = Length::Px(2.0);
        let solid = BorderStyle::Solid;
        for (write, owners) in [
            (
                StyleProperty::BorderTopWidth(px.clone()),
                &["border-width", "border-top-width"][..],
            ),
            (
                StyleProperty::BorderLeftStyle(solid),
                &["border-style", "border-left-style"],
            ),
            (
                StyleProperty::BorderLogicalWidth(Edge::Inline, px.clone()),
                &["border-inline-width"],
            ),
            (
                StyleProperty::BorderLogicalStyle(Edge::InlineStart, solid),
                &["border-inline-start-style"],
            ),
        ] {
            assert!(crate::scalar_tailwind_property(&write), "{write:?}");
            for property in [
                "border-width",
                "border-top-width",
                "border-left-width",
                "border-inline-width",
                "border-style",
                "border-left-style",
                "border-inline-start-style",
                "border-inline-style",
                "--tw-border-style",
            ] {
                assert_eq!(
                    covers(property, &write),
                    owners.contains(&property),
                    "{write:?} / {property}"
                );
            }
        }
        // A font-relative width folds through the font size.
        let em = Length::Css("0.5em".into());
        assert!(!crate::scalar_tailwind_property(
            &StyleProperty::BorderTopWidth(em)
        ));
        // `border-2` declares the style it reads; `border-dashed` sets the
        // register every width's style reads.
        let style = StyleProperty::BorderTopStyle(solid);
        assert!(!register_bound(
            ["border-style", "border-width"].into_iter(),
            &style
        ));
        assert!(register_bound(
            ["--tw-border-style", "border-style"].into_iter(),
            &style
        ));
        assert!(!register_bound(
            ["--tw-border-style", "border-style"].into_iter(),
            &StyleProperty::BorderTopWidth(px)
        ));
    }

    #[test]
    fn outline_writes_rank_but_its_style_register_and_none_do_not() {
        use crate::BorderStyle;
        let px = Length::Px(2.0);
        for (write, property) in [
            (StyleProperty::OutlineWidth(px.clone()), "outline-width"),
            (
                StyleProperty::OutlineStyle(BorderStyle::Solid),
                "outline-style",
            ),
            (
                StyleProperty::OutlineColor(crate::Color::Token("red-500".into())),
                "outline-color",
            ),
            (StyleProperty::OutlineOffset(px.clone()), "outline-offset"),
        ] {
            assert!(crate::scalar_tailwind_property(&write), "{write:?}");
            assert!(covers(property, &write), "{write:?}");
            assert!(!covers("outline", &write), "{write:?}");
        }
        // Native writes `outline-none` as `outlineWidth: 0`.
        assert!(!crate::scalar_tailwind_property(
            &StyleProperty::OutlineStyle(BorderStyle::None)
        ));
        let style = StyleProperty::OutlineStyle(BorderStyle::Dashed);
        assert!(register_bound(
            ["--tw-outline-style", "outline-style"].into_iter(),
            &style
        ));
        assert!(!register_bound(
            ["outline-style", "outline-width"].into_iter(),
            &style
        ));
        assert!(!register_bound(
            ["--tw-border-style", "outline-style"].into_iter(),
            &style
        ));
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
        for state in [
            "busy", "checked", "expanded", "selected", "invalid", "disabled",
        ] {
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
    fn negated_aria_requires_exact_original_polarity_and_multiplicity() {
        for state in [
            "busy", "checked", "expanded", "selected", "invalid", "disabled",
        ] {
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
                selector: format!("&:not(*[aria-{state}=\"true\"])"),
                nodes: std::mem::take(nodes),
            }];
            let assessed = assess_tailwind_rule("p-2", &candidate.rules[0]).unwrap();
            assert_eq!(assessed.specificity, [0, 2, 0]);
            assert_eq!(assessed.owner[negated_aria_owner_index(state).unwrap()], 1);
            assert_eq!(assessed.owner[aria_owner_index(state).unwrap()], 0);
            let context = TailwindOrderContext::new(snapshot).unwrap();
            let write = StyleProperty::PaddingTop(Length::Px(8.0));
            let negative = crate::Condition::Not(Box::new(crate::Condition::Aria(state.into())));
            assert!(context
                .scalar_write_priority("p-2", &negative, &write)
                .is_some());
            for wrong in [
                crate::Condition::Always,
                crate::Condition::Aria(state.into()),
                crate::Condition::Not(Box::new(negative.clone())),
                crate::Condition::Not(Box::new(crate::Condition::All(vec![
                    crate::Condition::Aria(state.into()),
                ]))),
                crate::Condition::All(vec![negative.clone(), negative.clone()]),
            ] {
                assert!(context
                    .scalar_write_priority("p-2", &wrong, &write)
                    .is_none());
            }
        }
        for selector in [
            "&:not(*[aria-selected=\"false\"])",
            "&:not(*[aria-selected])",
            "&:not(*[aria-checked=\"mixed\"])",
            "&:not(*[aria-selected=\"true\" i])",
            "&:not(*[aria-selected=\"true\"]) > *",
            "&:not(*[aria-selected=\"true\"], *[aria-checked=\"true\"])",
            "&:not(*[aria-hidden=\"true\"])",
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
            "&[aria-disabled=\"false\"]",
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
            // A query adds no weight; it is recorded for the write to match.
            ("sm:p-2", 1, 1),
            // A relation weighs its inner compound and keeps its query.
            ("group-hover:p-2", 2, 1),
        ] {
            let candidate = fixture(name);
            assert_eq!(candidate.rules.len(), 1, "{name}");
            let assessed = assess_tailwind_rule(name, &candidate.rules[0]).unwrap();
            assert_eq!(assessed.specificity, [0, weight, 0], "{name}");
            assert_eq!(assessed.media.len(), media, "{name}");
        }
        for name in [
            "placeholder:text-red-500",
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
