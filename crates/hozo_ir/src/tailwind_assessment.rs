//! Evidence about original CSS rules and write ownership, not permission to
//! reorder. Values, condition equivalence, composition tiers and Native edge
//! normalization still have to be proved by the caller of a future planner.
use crate::{OrderCandidateDescriptor, OrderRuleDescriptor, OrderRuleShape, StyleProperty};

/// Interaction facts and the boolean ARIA facts already delivered by Native
/// owners. This is predicate equivalence, not a variant precedence table.
/// Every state Tailwind names for `aria-…:` is here: each is one attribute
/// selector of one class weight, and Native resolves each through the same
/// guard (`accessibilityState`, or a pattern slot's own fact), so ranking
/// one changes which write wins, never how its guard is delivered.
const ARIA_FACT_COUNT: usize = 10;
/// After the ARIA facts and their negations, the negated interaction facts
/// (`not-focus:` is `&:not(*:focus)`), in the same order as the positive.
const NEGATED_INTERACTION: usize = 5 + 2 * ARIA_FACT_COUNT;
pub(crate) const OWNER_PREDICATE_COUNT: usize = NEGATED_INTERACTION + 5;

/// `not-hover:`, `not-focus:`, `not-focus-visible:`, `not-active:` and
/// `not-disabled:`. `not-hover:` is two branches in Tailwind; see
/// [`not_hover_branch`].
pub(crate) fn negated_interaction_index(interaction: usize) -> Option<usize> {
    (0..5)
        .contains(&interaction)
        .then_some(NEGATED_INTERACTION + interaction)
}

/// Tailwind writes `not-hover:` as `& { &:not(*:hover) { … } @media not
/// (hover: hover) { … } }`: the same declarations, once for a device that
/// can hover and is not, once for one that cannot hover. Both sit at the
/// rule's one place in the order, so the rule is ranked by that place, read
/// through the selector branch; the media branch is the same body. Anything
/// else in that shape is still branching.
pub(crate) fn not_hover_branch(nodes: &[OrderRuleShape]) -> Option<&[OrderRuleShape]> {
    let [OrderRuleShape::Rule {
        selector,
        nodes: selected,
    }, OrderRuleShape::AtRule {
        name,
        params,
        nodes: queried,
    }] = nodes
    else {
        return None;
    };
    (selector == "&:not(*:hover)"
        && name == "@media"
        && params == "not (hover: hover)"
        && selected == queried)
        .then_some(selected.as_slice())
}

pub(crate) fn aria_owner_index(state: &str) -> Option<usize> {
    Some(match state {
        "busy" => 5,
        "checked" => 6,
        "expanded" => 7,
        "selected" => 8,
        "invalid" => 9,
        "disabled" => 10,
        "hidden" => 11,
        "pressed" => 12,
        "readonly" => 13,
        "required" => 14,
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
    /// The declarations reach the element's children through
    /// `:where(& > :not(:last-child))`, not the element itself.
    pub child_scope: bool,
}

/// Tailwind's `space-*` selector. It is all inside `:where()`, the class
/// too, so it weighs nothing.
pub(crate) const CHILD_SCOPE: &str = ":where(& > :not(:last-child))";

/// Writes that land on the element's children, owned only by a
/// [`CHILD_SCOPE`] rule and never by the element's own.
pub(crate) fn child_scoped(write: &StyleProperty) -> bool {
    matches!(
        write,
        StyleProperty::SpaceX(_)
            | StyleProperty::SpaceY(_)
            | StyleProperty::SpaceReverse(_)
            | StyleProperty::DivideX(_)
            | StyleProperty::DivideY(_)
            | StyleProperty::DivideColor(_)
            | StyleProperty::DivideStyle(_)
            | StyleProperty::DivideReverse(_)
    )
}

/// Match Tailwind's escaped root literally, not a substring of another
/// selector. Only ASCII candidates are assessed in this initial domain.
pub(crate) fn root_selector(candidate: &str) -> Option<String> {
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
        child_scope: false,
    };
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

/// An `@supports` among `siblings` that only re-declares, with the same
/// importance, properties the siblings already declare -- as
/// `bg-linear-to-r` re-declares `--tw-gradient-position` for browsers with
/// `in oklab`. It picks which value a browser uses, not which properties the
/// rule writes, under which condition, or how much it weighs, so ownership
/// and order are the same with or without it.
pub(crate) fn supports_refinement(siblings: &[OrderRuleShape], node: &OrderRuleShape) -> bool {
    let OrderRuleShape::AtRule { name, nodes, .. } = node else {
        return false;
    };
    let declared = |property: &str, important: bool| {
        siblings.iter().any(|sibling| {
            matches!(sibling, OrderRuleShape::Declaration { property: p, important: i }
                if p == property && *i == important)
        })
    };
    name == "@supports"
        && nodes
            .iter()
            .any(|node| matches!(node, OrderRuleShape::Declaration { .. }))
        && nodes.iter().all(|node| match node {
            OrderRuleShape::Declaration {
                property,
                important,
            } => declared(property, *important),
            OrderRuleShape::Comment => true,
            _ => false,
        })
}

/// `outline-hidden`'s `@media (forced-colors: active)` branch: a transparent
/// outline for a mode where the system repaints outlines. Hozo emits no
/// forced-colors fallback (a known gap), so the branch writes nothing Hozo
/// owns and is not a second place in the order. Only beside declarations of
/// the rule's own: alone, it is the `forced-colors:` variant.
pub(crate) fn forced_colors_fallback(siblings: &[OrderRuleShape], node: &OrderRuleShape) -> bool {
    if !siblings
        .iter()
        .any(|sibling| matches!(sibling, OrderRuleShape::Declaration { .. }))
    {
        return false;
    }
    let OrderRuleShape::AtRule {
        name,
        params,
        nodes,
    } = node
    else {
        return false;
    };
    name == "@media"
        && params == "(forced-colors: active)"
        && nodes.iter().all(|node| {
            matches!(
                node,
                OrderRuleShape::Declaration { .. } | OrderRuleShape::Comment
            )
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
        "&:not(*:hover)" => negated_interaction_index(0),
        "&:not(*:focus)" => negated_interaction_index(1),
        "&:not(*:focus-visible)" => negated_interaction_index(2),
        "&:not(*:active)" => negated_interaction_index(3),
        "&:not(*:disabled)" => negated_interaction_index(4),
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
    // `not-<x>:` is `&:not(*<x>)`, which weighs what its argument does:
    // one for `*:empty`, none for `*:where(:dir(ltr), …)`.
    if let Some(rest) = selector
        .strip_prefix("&:not(*")
        .and_then(|rest| rest.strip_suffix(')'))
    {
        return compound_selector_weight(&format!("&{rest}"));
    }
    compound_selector_weight(selector)
}

/// The element's own compound, without a relation: a relation never nests.
fn compound_selector_weight(selector: &str) -> Option<u32> {
    // `*:` and `**:` move the class inside `:is()`, which weighs what the
    // class does, so they add nothing to it.
    const WEIGHTLESS: [&str; 4] = [
        "&:where(:dir(ltr), [dir=\"ltr\"], [dir=\"ltr\"] *)",
        "&:where(:dir(rtl), [dir=\"rtl\"], [dir=\"rtl\"] *)",
        ":is(& > *)",
        ":is(& *)",
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

/// The pseudo-elements whose rule is read as a condition on the element.
/// Only `::placeholder`: Native carries it as `TextInput`'s
/// `placeholderTextColor`, which takes the last colour written, so the
/// ranked winner is the one it sees. Others need their own delivery proof
/// (`::backdrop` becomes a Native slot's unconditional style).
const PSEUDO_ELEMENTS: [&str; 1] = ["&::placeholder"];

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
        // The parser has no theme, so `shadow-<name>` is a colour token
        // until a backend finds a theme shadow of that name
        // (`Theme::resolve_shadow_tokens`). Tailwind's own rule has already
        // decided: a size rule declares `--tw-shadow`, a colour rule
        // `--tw-shadow-color`. Either owns the write; a rule declaring both
        // is ambiguous and stays a barrier.
        ShadowColor(crate::Color::Token(_)) => {
            return matches!(property, "--tw-shadow" | "--tw-shadow-color")
        }
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
/// `solid` unless a style utility sets the register. Hozo writes it as
/// `BorderStyle::Default`, which never beats a written style, so both rank.
/// Widths in font-relative units fold through the font size and are left
/// out, as `font-size` is.
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

/// Single-key projections with no shorthand/longhand alias, font-relative
/// folding or shared register composition. This is write ownership, never a
/// utility precedence table: priority still comes from the captured CSS rule.
/// Keep this definition shared by static planning and candidate generation.
fn filter_register(function: crate::FilterFunction, backdrop: bool) -> Option<&'static str> {
    use crate::FilterFunction::*;
    Some(match (function, backdrop) {
        (Blur, false) => "--tw-blur",
        (Brightness, false) => "--tw-brightness",
        (Contrast, false) => "--tw-contrast",
        (Grayscale, false) => "--tw-grayscale",
        (HueRotate, false) => "--tw-hue-rotate",
        (Invert, false) => "--tw-invert",
        (Saturate, false) => "--tw-saturate",
        (Sepia, false) => "--tw-sepia",
        (Blur, true) => "--tw-backdrop-blur",
        (Brightness, true) => "--tw-backdrop-brightness",
        (Contrast, true) => "--tw-backdrop-contrast",
        (Grayscale, true) => "--tw-backdrop-grayscale",
        (HueRotate, true) => "--tw-backdrop-hue-rotate",
        (Invert, true) => "--tw-backdrop-invert",
        (Saturate, true) => "--tw-backdrop-saturate",
        (Sepia, true) => "--tw-backdrop-sepia",
        (Opacity, true) => "--tw-backdrop-opacity",
        (DropShadow | None | Opacity, _) => return Option::None,
    })
}

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
        // Any size, absolute or not, is one `font-size`. Native's relative
        // folds read only pixel sizes and run after ordering, so ranking an
        // em size decides which size wins without changing what they read.
        FontSize(_) => "font-size",
        LineHeight(crate::LineHeight::Length(length) | crate::LineHeight::FontDefault(length))
            if absolute(length) =>
        {
            "line-height"
        }
        LetterSpacing(crate::LetterSpacing::Px(length)) if absolute(length) => "letter-spacing",
        // Relative metrics are one declaration each too. Native turns them
        // into pixels against the font size after ordering
        // (`fold_font_relative`), so ranking decides which leading or
        // tracking wins and the fold then sizes the winner exactly as it
        // sized the authored-last one before.
        LineHeight(crate::LineHeight::Ratio(_)) => "line-height",
        LetterSpacing(crate::LetterSpacing::Em(_)) => "letter-spacing",
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
            | crate::Display::InlineFlex
            // Grid goes to the Native grid wrapper, which reads the last
            // unconditional display, so the ranked winner is the one it
            // sees. The other keywords are refused on Native as before;
            // on Web each is one `display` declaration.
            | crate::Display::Grid
            | crate::Display::Css(_),
        ) => "display",
        // One declaration each. Native's grid solver reads the last write
        // of each, and combines a shorthand with a longhand edge by key, as
        // Tailwind's order (`grid-column` before `grid-column-start`) does.
        GridTemplateColumns(_) => "grid-template-columns",
        GridTemplateRows(_) => "grid-template-rows",
        GridColumn(_) => "grid-column",
        GridColumnStart(_) => "grid-column-start",
        GridColumnEnd(_) => "grid-column-end",
        GridRow(_) => "grid-row",
        GridRowStart(_) => "grid-row-start",
        GridRowEnd(_) => "grid-row-end",
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
        // beside the width, as border widths do; Hozo writes that as
        // `BorderStyle::Default`, which never beats a written style.
        // `outline-none`/`outline-hidden` (`None`) is a written style too;
        // Native has no `none` and writes `outlineWidth: 0` instead, which
        // a later width can override where Tailwind's register would not (a
        // known gap, not an ordering one).
        OutlineWidth(length) if absolute(length) => "outline-width",
        OutlineStyle(_) => "outline-style",
        OutlineColor(_) => "outline-color",
        OutlineOffset(length) if absolute(length) => "outline-offset",
        Position(
            crate::Position::Relative
            | crate::Position::Absolute
            | crate::Position::Static
            // `fixed` and `sticky` are refused on Native as before.
            | crate::Position::Css(_),
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
        // Native has no resize handle: `none` writes nothing there and the
        // others are refused, whichever wins, as before.
        Keyword("resize", "none" | "both" | "horizontal" | "vertical") => "resize",
        // `cursorColor` on a Native `TextInput`, which takes the last light
        // and dark colour; refused elsewhere. `accent-*` is refused on
        // Native whatever wins.
        CaretColor(_) => "caret-color",
        // `color` on `::placeholder`, which ranking asks for as a selector
        // (`scalar_write_priority`), never on the element itself. Native's
        // `placeholderTextColor` takes the last colour per scheme.
        PlaceholderColor(_) => "color",
        // One `animation` declaration. Native runs the last one under each
        // condition as a hook; a project's own `animate-<name>` and the
        // `animation-*` longhands are not read yet.
        Animation(_) => "animation",
        // The logical sizes, one declaration each. Native writes them as the
        // physical key (`inline-*` is `width`), the same key `w-*` writes,
        // so ranking decides which one lands last, as CSS's logical property
        // group does.
        InlineSize(_) => "inline-size",
        BlockSize(_) => "block-size",
        MinInlineSize(_) => "min-inline-size",
        MinBlockSize(_) => "min-block-size",
        MaxInlineSize(_) => "max-inline-size",
        MaxBlockSize(_) => "max-block-size",
        TransformOrigin(_) => "transform-origin",
        // Native carries these as `numberOfLines`/`ellipsizeMode` on Text,
        // reading the last of each (`truncation_props`). A line clamp's rule
        // also declares `overflow` and `display`; Web emits all four where
        // the clamp is in the plan's order, so a later `flex` still wins.
        WhiteSpace(_) => "white-space",
        TextOverflow(_) => "text-overflow",
        LineClamp(_) => "-webkit-line-clamp",
        // `@container` and `@container/<name>`: a query container for its
        // descendants' `@<size>:` variants, one declaration each.
        Keyword("container-type", "inline-size" | "size" | "normal") => "container-type",
        ContainerName(_) => "container-name",
        AccentColor(_) => "accent-color",
        // On the children, through [`CHILD_SCOPE`]; see `child_scoped`.
        // Each backend joins the parent's last gap behind a child's own
        // margin, so ranking only decides which gap that is.
        SpaceX(_) => "margin-inline-start",
        SpaceY(_) => "margin-block-start",
        // Each reverse flag is its register; a gap's rule also declares it,
        // as 0, but a gap write owns its margin, not the flag.
        SpaceReverse(crate::Axis::X) => "--tw-space-x-reverse",
        SpaceReverse(crate::Axis::Y) => "--tw-space-y-reverse",
        DivideReverse(crate::Axis::X) => "--tw-divide-x-reverse",
        DivideReverse(crate::Axis::Y) => "--tw-divide-y-reverse",
        // A divider's width, colour and style on the children. Its style
        // (`divide-dashed`) sets `--tw-border-style`, which every divider
        // width reads; a width's own implied style is written beneath every
        // written one (the base layer on Web, nothing on Native), so the
        // written style ranks like the others.
        DivideX(_) => "border-inline-start-width",
        DivideY(_) => "border-top-width",
        DivideColor(_) => "border-color",
        DivideStyle(_) => "border-style",
        // Tailwind 4.3's block-logical spacing, one declaration each. Native
        // writes the physical key (`paddingTop`), the one `pt-*` writes, so
        // ranking decides which lands last, as the logical group does in CSS.
        PaddingBlockStart(_) => "padding-block-start",
        PaddingBlockEnd(_) => "padding-block-end",
        MarginBlockStart(_) => "margin-block-start",
        MarginBlockEnd(_) => "margin-block-end",
        // One declaration and, where Native has it, one key each. A cursor
        // Native lacks is refused there, as an unsupported display is.
        Cursor(_) => "cursor",
        FontFamily(_) => "font-family",
        // `transition` and `transition-colors` declare all three; `duration-*`
        // and `ease-*` declare their register and the one property. A
        // utility's own duration or easing still beats `transition`'s
        // fallback by provenance (`dedupe_last_wins`), as Tailwind's
        // `var(--tw-duration, 0s)` does, whichever is ranked later.
        TransitionProperty(_) => "transition-property",
        TransitionDuration(..) => "transition-duration",
        TransitionDelay(..) => "transition-delay",
        TransitionTimingFunction(..) => "transition-timing-function",
        ObjectFit(_) => "object-fit",
        // `mixBlendMode` on Native, apart from `plus-darker`, which is
        // refused there as before; `bg-blend-*` is refused there whole.
        MixBlendMode(_) => "mix-blend-mode",
        BackgroundBlendMode(_) => "background-blend-mode",
        // Native has neither multi-column layout nor text-decoration metrics,
        // so both are refused there as before; the gain is the Web cascade.
        Columns(_) => "columns",
        TextUnderlineOffset(_) => "text-underline-offset",
        // `rotate-*` writes `rotate` itself. Each translate and scale axis
        // writes its own register, which one `translate`/`scale` declaration
        // reads; that declaration is in every axis rule, so the register is
        // what decides which rule owns the axis. Hozo holds each axis as its
        // own write and joins them at emit time, on Native into one
        // `transform` in a fixed function order, so ranking only decides
        // which value each axis keeps.
        Rotate(_) => "rotate",
        TranslateX(_) => "--tw-translate-x",
        TranslateY(_) => "--tw-translate-y",
        TranslateZ(_) => "--tw-translate-z",
        ScaleX(_) => "--tw-scale-x",
        ScaleY(_) => "--tw-scale-y",
        ScaleZ(_) => "--tw-scale-z",
        // The same shape for the functions Tailwind reads in one
        // `transform`: each 3D rotation and skew writes its own register.
        RotateX(_) => "--tw-rotate-x",
        RotateY(_) => "--tw-rotate-y",
        RotateZ(_) => "--tw-rotate-z",
        SkewX(_) => "--tw-skew-x",
        SkewY(_) => "--tw-skew-y",
        // Every axis rule also writes the shared declaration (`translate`,
        // `scale`, `transform`) in its own form; the last such rule decides
        // the form. Hozo's axis writes own their registers, and these own
        // the declaration: a reset turns it off, `scale-3d` (and the z form
        // of `scale-z-*`) adds the third component, `transform`/`-cpu`/
        // `-gpu` write the chain. Each backend reads the last of them
        // against the last axis write, which ranking puts in Tailwind's order.
        TranslateNone => "translate",
        ScaleNone | Scale3d => "scale",
        RotateNone => "rotate",
        TransformNone | TransformEmpty | TransformGpu => "transform",
        // Each filter function writes its register, read by one shared
        // `filter`/`backdrop-filter`. `filter-none` writes the declaration
        // itself, and a drop shadow pairs its register with a colour and a
        // size register, so both stay barriers.
        // A drop shadow is two registers in Tailwind: the size rule sets
        // `--tw-drop-shadow-size` (which reads the colour) and the colour
        // rule `--tw-drop-shadow-color`; each owns its own. `drop-shadow-none`
        // writes `--tw-drop-shadow` itself and stays a barrier.
        Filter(crate::FilterFunction::DropShadow, value) if !value.is_empty() => {
            "--tw-drop-shadow-size"
        }
        DropShadowColor(_) => "--tw-drop-shadow-color",
        Filter(function, _) => filter_register(*function, false)?,
        BackdropFilter(function, _) => filter_register(*function, true)?,
        // Shadows and rings are five layers in one `box-shadow`, and each
        // layer, colour, offset and the inset flag is a register of its own.
        // `ring-offset-*` also writes `--tw-ring-offset-shadow`, which reads
        // the width; the width register is the one Hozo's write sets.
        BoxShadow(_) => "--tw-shadow",
        ShadowColor(_) => "--tw-shadow-color",
        InsetShadow(_) => "--tw-inset-shadow",
        InsetShadowColor(_) => "--tw-inset-shadow-color",
        RingWidth(_) => "--tw-ring-shadow",
        RingColor(_) => "--tw-ring-color",
        InsetRingWidth(_) => "--tw-inset-ring-shadow",
        InsetRingColor(_) => "--tw-inset-ring-color",
        RingOffsetWidth(_) => "--tw-ring-offset-width",
        RingOffsetColor(_) => "--tw-ring-offset-color",
        RingInset => "--tw-ring-inset",
        // A constructor (`bg-linear-*`, `bg-radial`), `bg-none` and an
        // image all declare `background-image` itself; the constructor's
        // `--tw-gradient-position` rides along. Each stop's colour and
        // position is a register, read through `--tw-gradient-stops`, which
        // every colour rule also declares.
        Gradient(..) | BackgroundImageNone | BackgroundImage(_) => "background-image",
        GradientStopColor(crate::GradientStop::From, _) => "--tw-gradient-from",
        GradientStopColor(crate::GradientStop::Via, _) => "--tw-gradient-via",
        GradientStopColor(crate::GradientStop::To, _) => "--tw-gradient-to",
        GradientStopPosition(crate::GradientStop::From, _) => "--tw-gradient-from-position",
        GradientStopPosition(crate::GradientStop::Via, _) => "--tw-gradient-via-position",
        GradientStopPosition(crate::GradientStop::To, _) => "--tw-gradient-to-position",
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
        // A child-scoped write is owned only by a child-scoped rule, and an
        // element write never by one.
        if assessment.child_scope != child_scoped(write) {
            continue;
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
                StyleProperty::LineHeight(crate::LineHeight::Ratio(1.25)),
                "line-height",
            ),
            (
                StyleProperty::LetterSpacing(crate::LetterSpacing::Em(crate::Em(0.025))),
                "letter-spacing",
            ),
            (
                StyleProperty::Columns(crate::ColumnCount::Count(2)),
                "columns",
            ),
            (
                StyleProperty::TextUnderlineOffset(crate::Dimension::Auto),
                "text-underline-offset",
            ),
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
            StyleProperty::LetterSpacing(crate::LetterSpacing::Px(Length::Unit(
                1.0,
                crate::LengthUnit::Em,
            ))),
            StyleProperty::LineHeight(crate::LineHeight::Length(Length::Css("var(--line)".into()))),
            StyleProperty::ZIndex(None),
            StyleProperty::Keyword("font-style", "oblique"),
            StyleProperty::AlignContent(crate::Justify::Baseline),
            StyleProperty::JustifyContent(crate::Justify::Stretch),
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
    fn border_widths_and_written_styles_rank() {
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
        // `border-dashed` sets the register every width's style reads, but a
        // width's own style is `BorderStyle::Default`, which never beats a
        // written one, so the written style ranks like any other write.
        let style = StyleProperty::BorderTopStyle(solid);
        assert_eq!(style.origin(), Some(crate::Origin::Written));
        assert_eq!(
            StyleProperty::BorderTopStyle(BorderStyle::Default).origin(),
            Some(crate::Origin::Default)
        );
        assert!(crate::scalar_tailwind_property(
            &StyleProperty::BorderTopWidth(px)
        ));
    }

    #[test]
    fn outline_writes_and_written_styles_rank() {
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
        // `outline-none` is a written style like the others.
        assert!(crate::scalar_tailwind_property(
            &StyleProperty::OutlineStyle(BorderStyle::None)
        ));
        // `outline-hidden`'s forced-colors branch is not a second place.
        let forced = OrderRuleShape::AtRule {
            name: "@media".into(),
            params: "(forced-colors: active)".into(),
            nodes: vec![OrderRuleShape::Declaration {
                property: "outline".into(),
                important: false,
            }],
        };
        let own = OrderRuleShape::Declaration {
            property: "outline-style".into(),
            important: false,
        };
        assert!(forced_colors_fallback(&[own, forced.clone()], &forced));
        // Alone, it is the `forced-colors:` variant.
        assert!(!forced_colors_fallback(
            std::slice::from_ref(&forced),
            &forced
        ));
        // A width's implied style never beats a written one.
        assert_eq!(
            StyleProperty::OutlineStyle(BorderStyle::Dashed).origin(),
            Some(crate::Origin::Written)
        );
        assert_eq!(
            StyleProperty::OutlineStyle(BorderStyle::Default).origin(),
            Some(crate::Origin::Default)
        );
    }

    #[test]
    fn each_transform_axis_owns_its_register_not_the_shared_declaration() {
        let x = crate::Dimension::Length(Length::Px(8.0));
        let half = crate::Scale::Percent(50.0);
        for (write, register) in [
            (StyleProperty::TranslateX(x.clone()), "--tw-translate-x"),
            (StyleProperty::TranslateY(x.clone()), "--tw-translate-y"),
            (StyleProperty::ScaleX(half.clone()), "--tw-scale-x"),
            (StyleProperty::ScaleZ(half.clone()), "--tw-scale-z"),
            (StyleProperty::Rotate(crate::Angle::Deg(45.0)), "rotate"),
        ] {
            assert!(crate::scalar_tailwind_property(&write), "{write:?}");
            assert!(covers(register, &write), "{write:?}");
            // Every axis rule also declares the shared `translate`/`scale`;
            // owning it would make `translate-4` ambiguous between its axes.
            assert!(!covers("translate", &write), "{write:?}");
            assert!(!covers("scale", &write), "{write:?}");
        }
        // Each 3D rotation and skew owns its register, not the shared
        // `transform` every one of those rules declares.
        for (write, register) in [
            (
                StyleProperty::RotateX(crate::Angle::Deg(45.0)),
                "--tw-rotate-x",
            ),
            (StyleProperty::SkewY(crate::Angle::Deg(6.0)), "--tw-skew-y"),
        ] {
            assert!(crate::scalar_tailwind_property(&write), "{write:?}");
            assert!(covers(register, &write), "{write:?}");
            assert!(!covers("transform", &write), "{write:?}");
        }
        // `scale-3d`, the resets and `transform`/`-gpu` own the shared
        // declaration itself: each writes its form, and the last one decides.
        for (write, declaration) in [
            (StyleProperty::Scale3d, "scale"),
            (StyleProperty::ScaleNone, "scale"),
            (StyleProperty::TranslateNone, "translate"),
            (StyleProperty::RotateNone, "rotate"),
            (StyleProperty::TransformNone, "transform"),
            (StyleProperty::TransformGpu, "transform"),
        ] {
            assert!(crate::scalar_tailwind_property(&write), "{write:?}");
            assert!(covers(declaration, &write), "{write:?}");
        }
    }

    #[test]
    fn an_supports_refinement_of_a_declared_property_is_not_a_branch() {
        let declaration = |property: &str, important: bool| OrderRuleShape::Declaration {
            property: property.into(),
            important,
        };
        let supports = |nodes: Vec<OrderRuleShape>| OrderRuleShape::AtRule {
            name: "@supports".into(),
            params: "(background-image: linear-gradient(in lab, red, red))".into(),
            nodes,
        };
        let siblings = vec![
            declaration("--tw-gradient-position", false),
            declaration("background-image", false),
        ];
        assert!(supports_refinement(
            &siblings,
            &supports(vec![declaration("--tw-gradient-position", false)])
        ));
        // A new property, a different importance, an empty block or a
        // nested rule is a real branch.
        for nodes in [
            vec![declaration("color", false)],
            vec![declaration("--tw-gradient-position", true)],
            vec![],
            vec![OrderRuleShape::Rule {
                selector: "&:hover".into(),
                nodes: vec![declaration("background-image", false)],
            }],
        ] {
            assert!(!supports_refinement(&siblings, &supports(nodes)));
        }
        let media = OrderRuleShape::AtRule {
            name: "@media".into(),
            params: "(width >= 48rem)".into(),
            nodes: vec![declaration("background-image", false)],
        };
        assert!(!supports_refinement(&siblings, &media));
    }

    #[test]
    fn each_shadow_layer_and_colour_owns_its_register_not_box_shadow() {
        let px = Length::Px(2.0);
        let red = crate::Color::Token("red-500".into());
        for (write, register) in [
            (
                StyleProperty::BoxShadow("0 1px 3px 0".into()),
                "--tw-shadow",
            ),
            (StyleProperty::ShadowColor(red.clone()), "--tw-shadow-color"),
            (StyleProperty::RingWidth(px.clone()), "--tw-ring-shadow"),
            (StyleProperty::RingColor(red.clone()), "--tw-ring-color"),
            (
                StyleProperty::RingOffsetWidth(px.clone()),
                "--tw-ring-offset-width",
            ),
            (StyleProperty::RingInset, "--tw-ring-inset"),
        ] {
            assert!(crate::scalar_tailwind_property(&write), "{write:?}");
            assert!(covers(register, &write), "{write:?}");
            assert!(!covers("box-shadow", &write), "{write:?}");
        }
        // The offset rule also writes the shadow that reads its width.
        assert!(!covers(
            "--tw-ring-offset-shadow",
            &StyleProperty::RingOffsetWidth(px)
        ));
    }

    #[test]
    fn each_filter_function_owns_its_register_and_none_or_drop_shadow_none_does_not() {
        use crate::FilterFunction;
        for (write, register) in [
            (
                StyleProperty::Filter(FilterFunction::Blur, "blur(8px)".into()),
                "--tw-blur",
            ),
            (
                StyleProperty::BackdropFilter(FilterFunction::Opacity, "opacity(50%)".into()),
                "--tw-backdrop-opacity",
            ),
            (
                StyleProperty::Filter(FilterFunction::DropShadow, "drop-shadow(0 0 1px)".into()),
                "--tw-drop-shadow-size",
            ),
        ] {
            assert!(crate::scalar_tailwind_property(&write), "{write:?}");
            assert!(covers(register, &write), "{write:?}");
            assert!(!covers("filter", &write), "{write:?}");
            assert!(!covers("backdrop-filter", &write), "{write:?}");
        }
        for write in [
            StyleProperty::Filter(FilterFunction::None, "none".into()),
            StyleProperty::Filter(FilterFunction::DropShadow, String::new()),
        ] {
            assert!(!crate::scalar_tailwind_property(&write), "{write:?}");
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
        for state in [
            "busy", "checked", "expanded", "selected", "invalid", "disabled", "hidden", "pressed",
            "readonly", "required",
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
            "busy", "checked", "expanded", "selected", "invalid", "disabled", "hidden", "pressed",
            "readonly", "required",
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
            "&:not(*[aria-current=\"true\"])",
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
            "&[aria-disabled=\"false\"]",
            "&[aria-pressed=\"mixed\"]",
            "&[aria-current=\"true\"]",
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
        // A pseudo-element weighs one type.
        let candidate = fixture("placeholder:text-red-500");
        let assessed =
            assess_tailwind_rule("placeholder:text-red-500", &candidate.rules[0]).unwrap();
        assert_eq!(assessed.specificity, [0, 1, 1]);
        // `not-hover:` is read through its selector branch: one class, and
        // the negated hover fact.
        let candidate = fixture("not-hover:p-2");
        let assessed = assess_tailwind_rule("not-hover:p-2", &candidate.rules[0]).unwrap();
        assert_eq!(assessed.specificity, [0, 2, 0]);
        assert_eq!(assessed.owner[negated_interaction_index(0).unwrap()], 1);
        assert!(assessed.media.is_empty());
        for name in ["[&:where(:hover)]:p-2", "[&>span]:p-2"] {
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
