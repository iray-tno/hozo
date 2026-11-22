//! An element's children: spacing between them, verbatim source, and
//! nested components.

use hozo_ir::{Condition, Diagnostic, ExprRef, Node, Severity, StyleDeclaration};

use super::conditions;
use super::conditions::{build_style_entries, unwired_variant};
use super::context::{AncestorContext, FromAncestor, NativeRenderContext};
use super::lower::{forwarded_text, forwards_interaction};
use super::render::render_node;
use super::source_evidence::Rendered;
use super::structural::SiblingPosition;
use super::variants::variant_spelling;

/// A parent's subtree declarations, rewritten as the child's own.
///
/// The half of the condition that qualifies the parent is kept only when
/// it is ambient -- a media query, the colour scheme, a container width.
/// Those are answered by a hook declared once for the whole component, so
/// a child reads the same binding the parent would. An *elemental* half
/// is about the parent as an element -- `hover:*:` is the children of a
/// hovered element -- and React Native has no way to hand that down
/// except the interaction context `group-` uses. Reported rather than
/// quietly turned into `*:hover:`, which is a different rule.
pub(super) fn subtree_for_children(
    declarations: &[StyleDeclaration],
    node: &Node,
    diagnostics: &mut Vec<Diagnostic>,
) -> (Vec<StyleDeclaration>, Vec<StyleDeclaration>) {
    let mut direct = Vec::new();
    let mut all = Vec::new();
    for declaration in declarations {
        let Some((before, after, is_direct)) = declaration.condition.split_subtree() else {
            continue;
        };
        if let Some(elemental) = before.iter().find(|condition| condition.is_elemental()) {
            let name = variant_spelling(elemental).unwrap_or_else(|| "…".to_string());
            diagnostics.push(unwired_variant(
                node,
                &format!(
                    "`{name}:` in front of `*:` asks about *this* element while styling its children, and React Native has no way to hand an element's own state down. Put the condition after the `*:` if you meant the children, or move the style to a Pressable and use `group-{name}:` on them. On Web the same class works from the selector."
                ),
                Severity::Error,
            ));
            continue;
        }
        let condition = Condition::all(before.into_iter().chain(after).collect());
        let rewritten = StyleDeclaration {
            source: declaration.source,
            property: declaration.property.clone(),
            condition,
        };
        if is_direct {
            direct.push(rewritten);
        } else {
            all.push(rewritten);
        }
    }
    (direct, all)
}

/// Wraps `inner` in `HozoSpaced` when the element carries `space-*` or
/// `divide-*`, so the style reaches the children.
///
/// The children are handed over as JSX children rather than as arguments,
/// which is why this is a component and not a function call: a child may be
/// an element, a bare string, or a carried expression like
/// `{items.map(..)}`, and only the first of those is already an expression.
/// Passing them as `children` means none of them has to be re-rendered into
/// a different position.
///
/// `HozoSpaced` returns its children rather than an element, so no host
/// view is added and Yoga sees the tree it would have seen anyway.
pub(super) fn spaced_children(
    inner: Rendered,
    child_declarations: &[StyleDeclaration],
    base_name: &str,
    node: &Node,
    position: SiblingPosition,
    cx: &mut NativeRenderContext<'_>,
) -> Rendered {
    if child_declarations.is_empty() {
        return inner;
    }

    let mut parts: Vec<String> = Vec::new();
    // `pressed:` has nowhere to go here: the render-prop `style` form it
    // relies on belongs to Pressable, and this style is destined for the
    // children rather than for the element that would track the press.
    let mut pressed_parts: Vec<String> = Vec::new();
    let target = conditions::StyleTarget {
        owner_facts: &[],
        owner_events: &[],
        node,
        position,
        interaction_context: false,
        pattern_slot: None,
        composition: Default::default(),
    };
    build_style_entries(
        child_declarations,
        &format!("{base_name}Children"),
        &target,
        &mut parts,
        &mut pressed_parts,
        None,
        cx,
    );
    if !pressed_parts.is_empty() {
        cx.diagnostics.push(unwired_variant(
            node,
            "`pressed:` on a `space-*`/`divide-*` utility would have to track press state on the \
             parent and restyle its children, which Hozo doesn't do.",
            Severity::Error,
        ));
    }
    if parts.is_empty() {
        return inner;
    }

    cx.runtime.need_component("HozoSpaced");
    let style = if parts.len() == 1 && !parts[0].contains("&&") {
        parts[0].clone()
    } else {
        format!("[{}]", parts.join(", "))
    };
    let text = format!("<HozoSpaced style={{{style}}}>{}</HozoSpaced>", inner.text);
    inner.wrap(text, "</HozoSpaced>".len())
}

/// Re-emits a carried expression from source, with each Hozo primitive
/// inside it replaced by its lowered output.
///
/// The nested spans are subranges of `expr_ref`'s and don't overlap (each
/// is the outermost primitive on its branch), so one left-to-right pass is
/// enough. `{show && <Text className="p-4">hi</Text>}` comes out as
/// `{show && <Text style={hozoStyles.hozo1}>hi</Text>}` -- the guard
/// untouched, the element fully compiled.
///
/// Position is `Unknown` for every one of them: the surrounding expression
/// decides how many siblings it renders, so `first:` can't be resolved
/// there (see `SiblingPosition`).
pub(super) fn render_verbatim(
    expr_ref: ExprRef,
    nested: &[hozo_ir::NestedNode],
    inherited: &[StyleDeclaration],
    interaction_context: bool,
    cx: &mut NativeRenderContext<'_>,
) -> Rendered {
    let mut out = Rendered::new(cx.source_evidence);
    let mut cursor = expr_ref.0.start as usize;
    // An element inside a value the plan evaluates is lowered there; the
    // copy below writes the value's slot (#1879).
    let spans: Vec<_> = nested.iter().map(|entry| entry.span).collect();
    let source = cx.source;
    let planned = hozo_ir::attribute_capture::lower_captured(
        source,
        cursor,
        expr_ref.0.end as usize,
        &spans,
        |index| render_nested(&nested[index], inherited, interaction_context, cx).text,
    );
    for (entry, _) in nested.iter().zip(planned).filter(|(_, planned)| !planned) {
        out.copy(cx.source, cursor, entry.span.start as usize);
        out.append(render_nested(entry, inherited, interaction_context, cx));
        cursor = entry.span.end as usize;
    }
    out.copy(cx.source, cursor, expr_ref.0.end as usize);
    out
}

/// One element written inside an expression, with what its ancestors
/// hand down.
pub(super) fn render_nested(
    entry: &hozo_ir::NestedNode,
    inherited: &[StyleDeclaration],
    interaction_context: bool,
    cx: &mut NativeRenderContext<'_>,
) -> Rendered {
    // After what the elements above hand down, so a component written
    // in between, and nearer, wins.
    let inherited: Vec<StyleDeclaration> = inherited
        .iter()
        .chain(forwarded_text(&entry.forwarded))
        .cloned()
        .collect();
    let inherited = inherited.as_slice();
    let ambient_size = inherited.iter().rev().find_map(|d| match &d.property {
        hozo_ir::StyleProperty::FontSize(hozo_ir::Length::Px(px))
            if d.condition == hozo_ir::Condition::Always =>
        {
            Some(*px)
        }
        _ => None,
    });
    let ancestor = AncestorContext {
        inherited,
        parent_font_size: ambient_size,
        parent_size_opaque: true,
        in_dynamic_ruby: false,
        from_ancestor: FromAncestor::default(),
        grid_columns: None,
        grid_rows: None,
    };
    render_node(
        &entry.node,
        SiblingPosition::UNKNOWN,
        interaction_context || forwards_interaction(&entry.forwarded),
        ancestor,
        cx,
    )
}
