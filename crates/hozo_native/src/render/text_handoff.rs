//! An element's text styles, split from its own: what it hands down to its
//! children, what it publishes around children the compiler cannot see, and
//! the warning when they reach no text at all.

use super::*;

/// The element's styles once its text properties are split off.
pub(super) struct TextHandoff {
    pub(super) text_declarations: Vec<StyleDeclaration>,
    pub(super) own_declarations: Vec<StyleDeclaration>,
    pub(super) current_font_size: Option<f64>,
    pub(super) descend: Vec<StyleDeclaration>,
    pub(super) forwards_label: bool,
    pub(super) unified_scope: Vec<StyleDeclaration>,
}

pub(super) fn hand_down_text(
    node: &Node,
    component: &str,
    style: &[StyleDeclaration],
    inherited: &[StyleDeclaration],
    parent_font_size: Option<f64>,
    cx: &mut NativeRenderContext<'_>,
) -> TextHandoff {
    // Everything else hands its text properties down rather than keeping
    // them: React Native's View has no `fontSize`, so leaving them here
    // would be a style that renders nothing while the same source renders
    // correctly on Web.
    // TextInput paints its value, not JSX children. Its own font/colour
    // belongs on the field too; do not hand it to nonexistent child Text.
    // An explicit leaf carrier may target an existing box/owned-label split.
    // Keep its assessed text fields in the same priority/style writer, without
    // manufacturing a child, inheritance scope or extra runtime text callback.
    let (text_declarations, own_declarations): (Vec<_>, Vec<_>) =
        if renders_text(component) || component == "TextInput" || cx.owner_inputs.split_text {
            (Vec::new(), style.to_vec())
        } else {
            style
                .iter()
                .cloned()
                .partition(|d| is_text_property(&d.property))
        };
    // Ambient font size for child relative typography:
    let current_font_size = style
        .iter()
        .rev()
        .find_map(|d| match &d.property {
            StyleProperty::FontSize(Length::Px(px)) if d.condition == Condition::Always => {
                Some(*px)
            }
            _ => None,
        })
        .or(parent_font_size);
    // Passed to every child, and to the `Text` wrapper a raw string gets.
    // The element's own come after what it inherited, for the same
    // last-wins reason.
    //
    // `disabled:` is this element's state, and a child has no `disabled`
    // of its own to drive it: handed down as it was, a nested Text was told
    // its `disabled` prop was missing and the style was never applied. So
    // it goes down already bound to this element's prop, the way a
    // package component's does to the caller's (#950).
    let disabled = node.props.effective_disabled();
    let descend: Vec<StyleDeclaration> = inherited
        .iter()
        .cloned()
        .chain(
            text_declarations
                .iter()
                .filter(|d| !matches!(d.property, StyleProperty::LeadingRegister(_)))
                .map(|d| bound_to_disabled(d, disabled.as_ref())),
        )
        .collect();

    // Handing them down is only half the job: they have to land somewhere.
    // Reported here rather than dropped, because a text size that reaches
    // no text is precisely a style that renders correctly on Web and does
    // nothing on device -- which is the divergence worth a build message.
    //
    // Except on a pressable whose label the compiler cannot see: there it
    // reaches the label at runtime instead, through `hozoTextStyle` (#876).
    // A link is one too: `HozoLink` hands its props to the `HozoPressable`
    // it renders through, which is what a Button with an `href` becomes.
    let forwards_label = !text_declarations.is_empty()
        && matches!(component, "Pressable" | "HozoLink")
        && (cx.text_reference || !matches!(text_reach(node), TextReach::Certain));
    // Decision 013: a container that hands text styles down and has a child
    // the compiler cannot see publishes them around its children instead,
    // as far as the run-time protocol can carry them. What it cannot carry
    // keeps the warning below.
    //
    // Only inside a plain `View`. A runtime component -- a table section, a
    // pressable styling its label -- reads its direct children, and a scope
    // between them would hide every one of them from it. So would a
    // `ScrollView`'s `stickyHeaderIndices`, which count them.
    let unified_scope: Vec<StyleDeclaration> = if cx.text_unified
        && matches!(component, "View" | "Animated.View")
        && !forwards_label
        && !is_text_primitive(node.primitive)
        && !renders_text(component)
        && node
            .children
            .iter()
            .any(|child| matches!(child, hozo_ir::Child::Verbatim { .. }))
    {
        descend
            .iter()
            .filter(|d| crate::text_region::protocol_scalar(d, cx.theme))
            .cloned()
            .collect()
    } else {
        Vec::new()
    };
    let scope_carries_all = !unified_scope.is_empty()
        && text_declarations
            .iter()
            .all(|d| crate::text_region::protocol_scalar(d, cx.theme));
    if !text_declarations.is_empty() && !forwards_label && !scope_carries_all {
        match text_reach(node) {
            TextReach::Certain => {}
            TextReach::Opaque => cx.diagnostics.push(unwired_variant(
                node,
                "this element's text styles are handed down to its children, and one of them is \
                 an expression or a component the compiler doesn't read. React Native doesn't \
                 inherit text styles from a View, so if the text is rendered in there it will \
                 come out at the default size. Put the `text-*` on the Text itself.",
                Severity::Warning,
            )),
            TextReach::None => cx.diagnostics.push(unwired_variant(
                node,
                "this element sets text styles and contains no text. React Native has no \
                 `fontSize` on a View, so there is nothing for them to apply to -- on Web the \
                 same source would style whatever is put inside later.",
                Severity::Warning,
            )),
        }
    }
    TextHandoff {
        text_declarations,
        own_declarations,
        current_font_size,
        descend,
        forwards_label,
        unified_scope,
    }
}

/// The label's text styles, by state, for `HozoPressable` to hand to a
/// label that arrives as `children`. Compiled here like any other entry;
/// only which element they land on waits for runtime.
pub(super) fn label_style(
    forwards_label: bool,
    text_declarations: &[StyleDeclaration],
    base_name: &str,
    node: &Node,
    position: SiblingPosition,
    group_ancestor: Option<GroupAncestor<'_>>,
    cx: &mut NativeRenderContext<'_>,
) -> Option<Vec<String>> {
    if forwards_label {
        let mut parts = Vec::new();
        let mut pressed = Vec::new();
        let target = crate::conditions::StyleTarget {
            owner_facts: &[],
            owner_events: &[],
            node,
            position,
            interaction_context: true,
            group_ancestor,
            pattern_slot: None,
            composition: Default::default(),
        };
        build_style_entries(
            text_declarations,
            &format!("{base_name}_label"),
            &target,
            &mut parts,
            &mut pressed,
            None,
            cx,
        );
        parts.extend(pressed);
        (!parts.is_empty()).then_some(parts)
    } else {
        None
    }
}
