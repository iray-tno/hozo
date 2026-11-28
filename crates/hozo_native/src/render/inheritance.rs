//! The styles an element starts from before its own: what it inherits as
//! text, the semantic defaults its primitive brings, and what an ancestor's
//! `*:`/`**:` wrote for it -- and what it writes for its own subtree.

use super::*;

/// The element's style once inheritance and subtree styles are applied,
/// and what it hands to its children and to every descendant.
pub(super) struct Inheritance {
    pub(super) style: Vec<StyleDeclaration>,
    pub(super) to_children: Vec<StyleDeclaration>,
    pub(super) descendants: Vec<StyleDeclaration>,
    pub(super) subtree_needs_interaction_host: bool,
    pub(super) subtree_needs_focus_visible: bool,
    pub(super) subtree_child_report: SubtreeReport,
}

#[allow(clippy::too_many_arguments)]
pub(super) fn inherit(
    node: &Node,
    component: &str,
    position: SiblingPosition,
    interaction_context: bool,
    peers: &[PeerSibling<'_>],
    style: Vec<StyleDeclaration>,
    ancestor: AncestorContext<'_>,
    cx: &mut NativeRenderContext<'_>,
) -> Inheritance {
    let AncestorContext {
        inherited,
        parent_font_size,
        parent_size_opaque,
        from_ancestor,
        group_ancestor,
        ..
    } = ancestor;
    let theme = cx.theme;
    let semantic_defaults = semantic_defaults::semantic_defaults(
        node,
        theme,
        &style,
        inherited,
        parent_font_size,
        parent_size_opaque,
    );

    // `inherited` is text inheritance and belongs to `Text`. The semantic
    // defaults do not: every one of them happened to be a text property
    // until `Separator` needed a height, and the gate was quietly deciding
    // that a default could only ever be about type. Widening it changes
    // nothing above -- each of those arms matches a primitive that lowers
    // to `Text` anyway -- and it is what makes a rule one pixel tall.
    let style: Vec<StyleDeclaration> = if renders_text(component) {
        // Provenance resolves competing utilities on the *same* element.
        // A child's own font fallback still outranks an inherited leading;
        // do not let the parent's Written marker reverse CSS inheritance.
        // Context is the reference's source of inherited values. A copied
        // class size/color could mask the parent's later inline override
        // or replace a relative helper's computed size. Normal lowering
        // keeps its existing iterator with no per-declaration extra test.
        let inherited = if cx.text_reference {
            &[][..]
        } else {
            inherited
        };
        let inherited: Vec<_> = inherited
            .iter()
            .filter(|parent| {
                !matches!(parent.property, StyleProperty::LineHeight(_))
                    || !style.iter().any(|own| {
                        own.condition == parent.condition
                            && matches!(own.property, StyleProperty::LineHeight(_))
                    })
            })
            .cloned()
            .collect();
        inherited
            .into_iter()
            .chain(semantic_defaults)
            .chain(style)
            .collect()
    } else {
        semantic_defaults.into_iter().chain(style).collect()
    };

    // What an ancestor's `*:`/`**:` wrote for this element, before its
    // own, so the element's own win -- `dedupe_last_wins` keeps the last
    // of a property, which is where CSS specificity would land too.
    let style: Vec<StyleDeclaration> = from_ancestor
        .direct
        .iter()
        .cloned()
        .chain(from_ancestor.all.iter().cloned())
        .chain(style)
        .collect();
    // And what this element writes for its own subtree, taken out before
    // anything tries to apply it here.
    let (subtree, style): (Vec<_>, Vec<_>) = style
        .into_iter()
        .partition(|d| d.condition.split_subtree().is_some());
    let crate::children::SubtreeChildren {
        direct: to_children,
        all: to_descendants,
        needs_interaction_host: subtree_needs_interaction_host,
        needs_focus_visible: subtree_needs_focus_visible,
        subtree_report: subtree_child_report,
    } = subtree_for_children(
        &subtree,
        node,
        position,
        interaction_context,
        group_ancestor,
        peers,
        cx,
    );
    // An ancestor's `**:` keeps going; a parent's `*:` stops here.
    let descendants: Vec<StyleDeclaration> = from_ancestor
        .all
        .iter()
        .cloned()
        .chain(to_descendants)
        .collect();
    // A child the compiler cannot read may render anything, so a style
    // meant for "every child" would reach some of them and not others.
    if !(to_children.is_empty() && descendants.is_empty())
        && node
            .children
            .iter()
            .any(|c| matches!(c, hozo_ir::Child::Verbatim { .. }))
    {
        cx.diagnostics.push(unwired_variant(
            node,
            "`*:`/`**:` hands a style to each child, and one of this element's children is an expression or a component the compiler doesn't read. It reaches the children it can see and not that one. On Web the selector reaches all of them.",
            Severity::Warning,
        ));
    }
    Inheritance {
        style,
        to_children,
        descendants,
        subtree_needs_interaction_host,
        subtree_needs_focus_visible,
        subtree_child_report,
    }
}
