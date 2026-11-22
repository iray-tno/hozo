//! Rendering one condition group's declarations as rules.

use hozo_ir::{Condition, StyleProperty, Theme};

use super::render_shape::render_shape;
use super::shape::condition_shapes_for;

pub fn render_rule(
    class_name: &str,
    condition: &Condition,
    props: &[StyleProperty],
    theme: &Theme,
) -> String {
    render_rule_for(class_name, condition, props, theme, true)
}

/// Only form predicates differ between portable root markers and real
/// secondary DOM owners. Other candidates keep their existing two rules.
pub(crate) fn needs_form_owner(condition: &Condition) -> bool {
    match condition {
        Condition::Disabled | Condition::Enabled => true,
        Condition::All(conditions) => conditions.iter().any(needs_form_owner),
        Condition::Not(inner)
        | Condition::Group(inner)
        | Condition::Peer(inner)
        | Condition::In(inner)
        | Condition::Has(inner) => needs_form_owner(inner),
        _ => false,
    }
}

/// A pattern's secondary class list lands on a real child DOM element, not
/// a synthesized root control. Let CSS ask that owner's actual capability:
/// a disabled descendant does not make a decorative span :disabled or
/// :enabled. This policy propagates through stacking and negation; replacing
/// marker text afterwards cannot distinguish :enabled from not-disabled.
pub(crate) fn render_slot_rule(
    class_name: &str,
    condition: &Condition,
    props: &[StyleProperty],
    theme: &Theme,
) -> String {
    render_rule_for(class_name, condition, props, theme, false)
}

pub(super) fn render_rule_for(
    class_name: &str,
    condition: &Condition,
    props: &[StyleProperty],
    theme: &Theme,
    portable_disabled: bool,
) -> String {
    // One condition can be several rules -- `marker:` is four and
    // `not-hover:` is two -- so this is a loop rather than a call. In
    // written order, which is the order Tailwind emits them and therefore
    // the order the conformance suite compares them in.
    // `::before` and `::after` generate no box at all without `content`,
    // so a rule targeting one carries it whether or not the author wrote
    // a `content-*` utility -- which is what makes `before:bg-red-500`
    // paint anything.
    //
    // At the level of the pseudo-element itself, not at the end. Tailwind
    // writes `before:md:flex` with native nesting --
    // `::before { content: …; @media … { display: flex } }` -- so the box
    // exists at every width and only the style is conditional. Putting the
    // content inside the query instead would mean no `::before` at all
    // below the breakpoint, which is a different thing to have written.
    let chain = match condition {
        Condition::All(conditions) => conditions.as_slice(),
        single => std::slice::from_ref(single),
    };
    let generates: Vec<usize> = chain
        .iter()
        .enumerate()
        .filter(|(_, c)| matches!(c, Condition::PseudoElement(p) if p.needs_content()))
        .map(|(index, _)| index)
        .collect();

    let mut rules: Vec<String> = Vec::new();
    // One content-only rule per pseudo-element that something follows.
    // `before:after:flex` is two of them nested, and each box needs its
    // own `content` -- the outer one is not inherited by the inner.
    for index in generates
        .iter()
        .copied()
        .filter(|index| index + 1 < chain.len())
    {
        rules.push(render_rule_shapes(
            class_name,
            &prefix_of(chain, index),
            &[],
            theme,
            true,
            portable_disabled,
        ));
    }
    let ends_in_content = generates
        .last()
        .is_some_and(|index| index + 1 == chain.len());
    rules.push(render_rule_shapes(
        class_name,
        condition,
        props,
        theme,
        ends_in_content,
        portable_disabled,
    ));
    rules.join("\n\n")
}

/// The chain up to and including `index`, as a condition.
pub(super) fn prefix_of(chain: &[Condition], index: usize) -> Condition {
    match &chain[..=index] {
        [single] => single.clone(),
        many => Condition::All(many.to_vec()),
    }
}

pub(super) fn render_rule_shapes(
    class_name: &str,
    condition: &Condition,
    props: &[StyleProperty],
    theme: &Theme,
    needs_content: bool,
    portable_disabled: bool,
) -> String {
    condition_shapes_for(condition, portable_disabled, theme.dark_selector())
        .into_iter()
        .map(|shape| render_shape(class_name, shape, props, theme, needs_content))
        .collect::<Vec<_>>()
        .join(
            "

",
        )
}
