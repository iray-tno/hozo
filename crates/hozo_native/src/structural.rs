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
