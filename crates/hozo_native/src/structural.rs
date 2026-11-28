//! Structural variants (`first:`, `odd:`) decided from a child's position.

use hozo_ir::{Node, Structural};

/// Where a node sits among its siblings, as far as the compiler can tell.
///
/// This is what lets `first:` be resolved at build time instead of needing
/// a selector engine: CSS asks the question at match time, but the compiler
/// is looking at the JSX tree and usually already knows the answer. It's a
/// small example of the general shape -- a condition Web resolves at
/// runtime that Native can have for free by resolving it earlier.
///
/// Two independent questions, because `first:` and `last:` are answerable
/// separately: a `Child::Verbatim` *before* this element makes "is it
/// first" unknowable and says nothing about "is it last".
///
/// `None` is not a failure to compute; it's the honest answer whenever the
/// position genuinely isn't decidable here -- a `Verbatim` sibling --
/// and it is never quietly treated as `false`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct SiblingPosition {
    pub(super) first: Option<bool>,
    pub(super) last: Option<bool>,
    /// 1-based position among the element siblings, counted the way
    /// `:nth-child` counts: text is not an element and does not take a
    /// place. Knowable when nothing before this element could render an
    /// unknown number of them.
    pub(super) ordinal: Option<usize>,
    /// How many element siblings there are altogether.
    ///
    /// A stricter question than `ordinal`: one `Verbatim` anywhere among
    /// the siblings, before or after, makes the total unknown even where
    /// the position is not.
    pub(super) count: Option<usize>,
}

impl SiblingPosition {
    /// Neither end is decidable: a component root, whose position its
    /// caller chooses.
    pub(super) const UNKNOWN: SiblingPosition = SiblingPosition {
        first: None,
        last: None,
        ordinal: None,
        count: None,
    };
}

/// Whether a structural variant holds for this element, or `None` when
/// the JSX doesn't say.
///
/// The whole family resolves the same way `first:` and `last:` already
/// do: React Native has no selector engine, but a sibling position is a
/// fact about the tree the compiler is reading, so the question can be
/// asked earlier instead of never.
///
/// `None` is not a failure to compute. A `Verbatim` sibling may render
/// nothing or a hundred elements, and a `-of-type` spelling asks which
/// siblings share this element's tag -- which on Native is not a question
/// about the tree but about a Web lowering decision that was never made.
pub(super) fn structural_holds(
    structural: &Structural,
    node: &Node,
    position: SiblingPosition,
) -> Option<bool> {
    if let Structural::Empty = structural {
        // Its own children, not its siblings. `:empty` is strict -- a
        // single space disqualifies -- so any child at all decides it, and
        // a `Verbatim` decides nothing.
        if node
            .children
            .iter()
            .any(|c| matches!(c, hozo_ir::Child::Verbatim { .. }))
        {
            return None;
        }
        return Some(node.children.is_empty());
    }
    structural.matches_position(position.ordinal?, position.count?)
}

/// Computes each child's compile-time `SiblingPosition` within `children`.
pub(super) fn sibling_positions(children: &[hozo_ir::Child]) -> Vec<SiblingPosition> {
    let is_verbatim = |c: &hozo_ir::Child| matches!(c, hozo_ir::Child::Verbatim { .. });
    let is_element = |c: &hozo_ir::Child| matches!(c, hozo_ir::Child::Node(_));
    children
        .iter()
        .enumerate()
        .map(|(index, _)| {
            let before = &children[..index];
            let after = &children[index + 1..];
            SiblingPosition {
                first: (!before.iter().any(is_verbatim)).then(|| !before.iter().any(is_element)),
                last: (!after.iter().any(is_verbatim)).then(|| !after.iter().any(is_element)),
                ordinal: (!before.iter().any(is_verbatim))
                    .then(|| before.iter().filter(|c| is_element(c)).count() + 1),
                count: (!children.iter().any(is_verbatim))
                    .then(|| children.iter().filter(|c| is_element(c)).count()),
            }
        })
        .collect()
}

/// True when pure structural predicates on `node` (`first:`, `last:`, `only:`,
/// `odd:`, `even:`, `empty:`, `nth-*:`, and their negations/conjunctions)
/// already fold `condition` to `false` at `position`, so pre-render passes
/// do not emit unused `HozoPeerScope` or `HozoPressable` wrappers.
pub(super) fn condition_statically_false(
    condition: &hozo_ir::Condition,
    node: &Node,
    position: SiblingPosition,
) -> bool {
    eval_structural(condition, node, position) == Some(false)
}

fn eval_structural(
    condition: &hozo_ir::Condition,
    node: &Node,
    position: SiblingPosition,
) -> Option<bool> {
    use hozo_ir::Condition;
    match condition {
        Condition::FirstChild => position.first,
        Condition::LastChild => position.last,
        Condition::Structural(structural) if !structural.counts_by_type() => {
            structural_holds(structural, node, position)
        }
        Condition::Not(inner) => eval_structural(inner, node, position).map(|value| !value),
        Condition::All(list) => {
            let mut all_true = true;
            for item in list {
                match eval_structural(item, node, position) {
                    Some(false) => return Some(false),
                    Some(true) => {}
                    None => all_true = false,
                }
            }
            all_true.then_some(true)
        }
        _ => None,
    }
}
