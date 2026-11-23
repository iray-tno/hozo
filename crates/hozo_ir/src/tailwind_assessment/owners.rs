//! The interaction and ARIA facts a Native owner delivers, and the
//! predicate index each one is ranked under.

use super::*;

/// Interaction facts and the boolean ARIA facts already delivered by Native
/// owners. This is predicate equivalence, not a variant precedence table.
/// Every state Tailwind names for `aria-…:` is here: each is one attribute
/// selector of one class weight, and Native resolves each through the same
/// guard (`accessibilityState`, or a pattern slot's own fact), so ranking
/// one changes which write wins, never how its guard is delivered.
pub(super) const ARIA_FACT_COUNT: usize = 10;
/// After the ARIA facts and their negations, the negated interaction facts
/// (`not-focus:` is `&:not(*:focus)`), in the same order as the positive.
pub(super) const NEGATED_INTERACTION: usize = 5 + 2 * ARIA_FACT_COUNT;
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
