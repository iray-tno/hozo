//! An element's children: spacing between them, verbatim source, and
//! nested components.

use hozo_ir::{
    Condition, ConditionExpr, Environment, ExprRef, Node, Primitive, Severity, Structural,
    StyleDeclaration,
};

use super::conditions::{self, resolve_condition_guard, unwired_variant, ResolvedCondition};
use super::context::{
    AncestorContext, FromAncestor, GroupAncestor, NativeRenderContext, PeerContext, PeerSibling,
    SubtreeReport,
};
use super::interaction;
use super::lower::{forwarded_text, forwards_interaction};
use super::render::render_node;
use super::source_evidence::Rendered;
use super::states::{group_interaction_state, group_unwired_message, peer_interaction_state};
use super::structural::SiblingPosition;
use super::variants::variant_spelling;

/// Result of splitting and lowering an element's `*:` and `**:` declarations
/// onto its children, including any parent host/scope requirements induced by
/// parent-level conditions placed in front of `*:` / `**:`.
pub(super) struct SubtreeChildren {
    pub direct: Vec<StyleDeclaration>,
    pub all: Vec<StyleDeclaration>,
    pub needs_interaction_host: bool,
    pub needs_focus_visible: bool,
    pub subtree_report: SubtreeReport,
}

fn is_parent_elemental(condition: &Condition) -> bool {
    match condition {
        // On React Native `ltr:` / `rtl:` are component-wide environment hooks,
        // not per-element `:dir()` selectors.
        Condition::Environment(Environment::Ltr | Environment::Rtl) => false,
        Condition::Not(inner) => is_parent_elemental(inner),
        _ => condition.is_elemental(),
    }
}

fn is_direct_interaction(condition: &Condition) -> bool {
    match condition {
        Condition::Hover | Condition::Focus | Condition::FocusVisible | Condition::Pressed => true,
        Condition::Not(inner) => is_direct_interaction(inner),
        _ => false,
    }
}

fn as_group_interaction(condition: &Condition) -> Condition {
    match condition {
        Condition::Not(inner) => Condition::Not(Box::new(as_group_interaction(inner))),
        other => Condition::Group(Box::new(other.clone())),
    }
}

fn unwrap_group_inner(condition: &Condition) -> Option<&Condition> {
    match condition {
        Condition::Group(inner) => Some(inner),
        Condition::Not(inner) => unwrap_group_inner(inner),
        _ => None,
    }
}

fn condition_subtree_needs(condition: &Condition) -> SubtreeReport {
    let mut out = SubtreeReport::default();
    fn visit(condition: &Condition, out: &mut SubtreeReport) {
        match condition {
            Condition::FocusWithin => out.focus = true,
            Condition::Has(inner) => match inner.as_ref() {
                Condition::Hover | Condition::Pressed => out.hover = true,
                Condition::Focus | Condition::FocusWithin => out.focus = true,
                Condition::FocusVisible => out.focus_visible = true,
                _ => {}
            },
            Condition::HasSelector(selector) => match selector.trim() {
                ":focus" | "*:focus" | ":focus-within" | "*:focus-within" => out.focus = true,
                ":focus-visible" | "*:focus-visible" => out.focus_visible = true,
                ":hover" | "*:hover" | ":active" | "*:active" => out.hover = true,
                _ => {}
            },
            Condition::Not(inner) => visit(inner, out),
            Condition::All(list) => {
                for item in list {
                    visit(item, out);
                }
            }
            _ => {}
        }
    }
    visit(condition, &mut out);
    out
}

/// A parent's subtree declarations, rewritten as the child's own.
///
/// Ambient conditions in front of `*:` / `**:` (breakpoints, dark mode,
/// environment queries including `rtl:`/`ltr:`, container queries) are kept
/// directly on the child because their hooks live at component scope.
/// Elemental parent conditions are resolved on the parent itself:
/// - Interactive parent states (`hover:*:`, `focus:*:`, `active:*:`, etc.)
///   upgrade an interactive parent (`Pressable`/`Button`/`Link`) to
///   `HozoPressable` and become `Condition::Group(...)` on its children.
/// - Prop, structural, ARIA, `data-*`, `peer-*`, `group-*`, `focus-within:`,
///   and `has-*:` conditions evaluate against the parent via
///   `resolve_condition_guard` and forward as static folds or lexical JS guards.
/// - Conditions the parent cannot answer (such as `hover:*:` on a plain `View`
///   or `empty:*:`) remain explicit `NOT_WIRED_ON_NATIVE` diagnostics.
#[allow(clippy::too_many_arguments)]
pub(super) fn subtree_for_children(
    declarations: &[StyleDeclaration],
    node: &Node,
    position: SiblingPosition,
    parent_interaction_context: bool,
    group_ancestor: Option<GroupAncestor<'_>>,
    peers: &[PeerSibling<'_>],
    cx: &mut NativeRenderContext<'_>,
) -> SubtreeChildren {
    let mut direct = Vec::new();
    let mut all = Vec::new();
    let mut needs_interaction_host = false;
    let mut needs_focus_visible = false;
    let mut subtree_report = SubtreeReport::default();
    let mut reported_errors: Vec<String> = Vec::new();

    let has_child_target = node
        .children
        .iter()
        .any(|c| matches!(c, hozo_ir::Child::Node(_) | hozo_ir::Child::Verbatim { .. }));

    let parent_group_interaction_query = parent_interaction_context
        && group_ancestor.is_some_and(|group| interaction::owns_events(group.node));
    let parent_target = conditions::StyleTarget {
        owner_facts: cx.owner_inputs.facts,
        owner_events: cx.owner_inputs.events,
        node,
        position,
        interaction_context: false,
        group_interaction_query: parent_group_interaction_query,
        group_ancestor,
        peers,
        pattern_slot: None,
        composition: Default::default(),
    };

    for declaration in declarations {
        let Some((before, after, is_direct)) = declaration.condition.split_subtree() else {
            continue;
        };
        let mut kept = Vec::new();
        let mut decl_applies = true;
        let mut decl_needs_host = false;
        let mut decl_needs_fv = false;
        let mut decl_subtree = SubtreeReport::default();
        let mut scratch_runtime = crate::context::RuntimeNeeds::default();

        for cond in before {
            if !is_parent_elemental(&cond) {
                kept.push(cond);
                continue;
            }
            if is_direct_interaction(&cond) {
                if interaction::owns_events(node) {
                    kept.push(as_group_interaction(&cond));
                    decl_needs_host = true;
                    decl_needs_fv |= interaction::uses_focus_visible(&cond);
                } else {
                    let name = variant_spelling(&cond).unwrap_or_else(|| "…".to_string());
                    let msg = format!(
                        "`{name}:` in front of `*:` asks about *this* element while styling its children, and React Native has no way to hand an element's own state down. Put the condition after the `*:` if you meant the children, or move the style to a Pressable and use `group-{name}:` on them. On Web the same class works from the selector."
                    );
                    if !reported_errors.contains(&msg) {
                        cx.diagnostics
                            .push(unwired_variant(node, &msg, Severity::Error));
                        reported_errors.push(msg);
                    }
                    decl_applies = false;
                    break;
                }
                continue;
            }
            if group_interaction_state(&cond).is_some() {
                let has_group_owner = parent_interaction_context
                    || (!has_child_target
                        && group_ancestor.is_some_and(|g| interaction::owns_events(g.node)));
                if has_group_owner
                    && !interaction::owns_events(node)
                    && !node.carried_classes.iter().any(|c| c == "group")
                {
                    kept.push(cond);
                } else if parent_group_interaction_query {
                    // This element owns events or opens a nested `.group`, so
                    // its children cannot read the outer `.group` context
                    // directly; evaluate via `HozoInteractionQuery` outside it.
                    match resolve_condition_guard(
                        &cond,
                        &parent_target,
                        cx.source,
                        &mut scratch_runtime,
                        false,
                    ) {
                        Ok(ResolvedCondition::Always) => {}
                        Ok(ResolvedCondition::Never) => {
                            decl_applies = false;
                            break;
                        }
                        Ok(ResolvedCondition::Guarded { expr, .. }) => {
                            kept.push(Condition::Expr(ConditionExpr::RawJs(expr)));
                        }
                        Err(reason) => {
                            if !reported_errors.contains(&reason) {
                                cx.diagnostics.push(unwired_variant(
                                    node,
                                    &reason,
                                    Severity::Error,
                                ));
                                reported_errors.push(reason);
                            }
                            decl_applies = false;
                            break;
                        }
                    }
                } else {
                    let inner = unwrap_group_inner(&cond).unwrap_or(&cond);
                    let msg = group_unwired_message(inner, false);
                    if !reported_errors.contains(&msg) {
                        cx.diagnostics
                            .push(unwired_variant(node, &msg, Severity::Error));
                        reported_errors.push(msg);
                    }
                    decl_applies = false;
                    break;
                }
                continue;
            }
            if !has_child_target {
                if let Some(peer_state) = peer_interaction_state(&cond) {
                    let has_peer_owner = peers.iter().any(|p| {
                        interaction::owns_events(p.node)
                            || (matches!(peer_state, "focused" | "focusVisible")
                                && p.node.primitive == Primitive::TextInput)
                    });
                    if has_peer_owner {
                        continue;
                    }
                }
            }
            if matches!(&cond, Condition::Structural(Structural::Empty)) {
                let msg = "`empty:` in front of `*:` cannot match an element that has children to style on React Native.".to_string();
                if !reported_errors.contains(&msg) {
                    cx.diagnostics
                        .push(unwired_variant(node, &msg, Severity::Error));
                    reported_errors.push(msg);
                }
                decl_applies = false;
                break;
            }
            match resolve_condition_guard(
                &cond,
                &parent_target,
                cx.source,
                &mut scratch_runtime,
                false,
            ) {
                Ok(ResolvedCondition::Always) => {}
                Ok(ResolvedCondition::Never) => {
                    decl_applies = false;
                    break;
                }
                Ok(ResolvedCondition::Guarded { expr, .. }) => {
                    kept.push(Condition::Expr(ConditionExpr::RawJs(expr)));
                    let report = condition_subtree_needs(&cond);
                    decl_subtree.focus |= report.focus;
                    decl_subtree.hover |= report.hover;
                    decl_subtree.focus_visible |= report.focus_visible;
                }
                Err(reason) => {
                    if !reported_errors.contains(&reason) {
                        cx.diagnostics
                            .push(unwired_variant(node, &reason, Severity::Error));
                        reported_errors.push(reason);
                    }
                    decl_applies = false;
                    break;
                }
            }
        }

        if !decl_applies {
            continue;
        }
        if has_child_target {
            cx.runtime.hooks.extend(scratch_runtime.hooks);
            needs_interaction_host |= decl_needs_host;
            needs_focus_visible |= decl_needs_fv;
            subtree_report.focus |= decl_subtree.focus;
            subtree_report.hover |= decl_subtree.hover;
            subtree_report.focus_visible |= decl_subtree.focus_visible;
            let condition = Condition::all(kept.into_iter().chain(after).collect());
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
    }
    SubtreeChildren {
        direct,
        all,
        needs_interaction_host,
        needs_focus_visible,
        subtree_report,
    }
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
#[allow(clippy::too_many_arguments)]
pub(super) fn spaced_children(
    inner: Rendered,
    child_declarations: &[StyleDeclaration],
    base_name: &str,
    node: &Node,
    position: SiblingPosition,
    parent_measured: bool,
    group_interaction_query: bool,
    group_ancestor: Option<GroupAncestor<'_>>,
    peers: &[PeerSibling<'_>],
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
        group_interaction_query,
        group_ancestor,
        peers,
        pattern_slot: None,
        composition: Default::default(),
    };
    let uses_parent_space = parent_measured
        && child_declarations
            .iter()
            .any(|d| crate::measured::is_parent_measured_space(&d.property));
    let uses_container_size = uses_parent_space
        && child_declarations
            .iter()
            .any(|d| crate::measured::uses_container_size(&d.property));
    conditions::build_style_entries_with_measured(
        child_declarations,
        &format!("{base_name}Children"),
        &target,
        &mut parts,
        &mut pressed_parts,
        None,
        conditions::MeasuredOptions {
            allow_self_measured: false,
            allow_parent_measured: uses_parent_space,
            parent_inset_absolute: false,
        },
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
    let mut rendered = inner.wrap(text, "</HozoSpaced>".len());
    if uses_parent_space {
        cx.runtime.need_component("HozoParentSizeQuery");
        let wrapped = format!(
            "<HozoParentSizeQuery>{{(__hozoParent) => ({})}}</HozoParentSizeQuery>",
            rendered.text
        );
        rendered = rendered.wrap(wrapped, ")}</HozoParentSizeQuery>".len());
        rendered.forget_scope();
    }
    if uses_container_size {
        cx.runtime.need_component("HozoContainerSizeQuery");
        let wrapped = format!(
            "<HozoContainerSizeQuery>{{(__hozoCqs) => ({})}}</HozoContainerSizeQuery>",
            rendered.text
        );
        rendered = rendered.wrap(wrapped, ")}</HozoContainerSizeQuery>".len());
        rendered.forget_scope();
    }
    rendered
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
#[allow(clippy::too_many_arguments)]
pub(super) fn render_verbatim(
    expr_ref: ExprRef,
    nested: &[hozo_ir::NestedNode],
    inherited: &[StyleDeclaration],
    interaction_context: bool,
    group_ancestor: Option<GroupAncestor<'_>>,
    subtree_report: SubtreeReport,
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
        |index| {
            render_nested(
                &nested[index],
                inherited,
                interaction_context,
                group_ancestor,
                subtree_report,
                cx,
            )
            .text
        },
    );
    for (entry, _) in nested.iter().zip(planned).filter(|(_, planned)| !planned) {
        out.copy(cx.source, cursor, entry.span.start as usize);
        out.append(render_nested(
            entry,
            inherited,
            interaction_context,
            group_ancestor,
            subtree_report,
            cx,
        ));
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
    group_ancestor: Option<GroupAncestor<'_>>,
    subtree_report: SubtreeReport,
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
        parent_measured: false,
        group_ancestor,
        subtree_report,
    };
    render_node(
        &entry.node,
        SiblingPosition::UNKNOWN,
        interaction_context || forwards_interaction(&entry.forwarded),
        ancestor,
        PeerContext::default(),
        cx,
    )
}
