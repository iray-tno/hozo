//! Where text styles reach on React Native, which inherits them only from
//! `Text` to `Text`, and the `Text` wrapper that carries them elsewhere.

use crate::*;

/// Builds the inserted `<Text>` that carries a non-Text node's string
/// content, with the text-styling declarations moved onto it.
pub(crate) fn wrap_in_text(
    content: &str,
    text_declarations: &[StyleDeclaration],
    base_name: &str,
    node: &Node,
    // The *enclosing* node's position, not the wrapper's: these
    // declarations were written on that element, so a `first:` among them
    // asks about it. (The wrapper is trivially its parent's only child,
    // which is not the question.)
    position: SiblingPosition,
    interaction_context: bool,
    cx: &mut crate::NativeRenderContext<'_>,
) -> String {
    // A `Text` that no `Primitive::Text` asked for: the author wrote a bare
    // string inside a View, and React Native crashes on one. Synthesized
    // here rather than by `native_component`, so it has to say so here too.
    // Found by the render tests, with `ReferenceError: Text is not defined`
    // -- which is the failure this whole reporting exists to make
    // impossible, arriving from the one path that bypasses it.
    cx.runtime.need_native("Text");
    let mut style_array_parts = Vec::new();
    // The wrapper is a Text, so a `pressed:` style has nowhere to go on it.
    // The enclosing Pressable reports it -- `build_style_entries` runs over
    // that node's own declarations first, and a text-styling property under
    // `pressed:` lands here only after that.
    let mut pressed_parts = Vec::new();
    let target = crate::conditions::StyleTarget {
        owner_facts: &[],
        owner_events: &[],
        node,
        position,
        interaction_context,
        pattern_slot: None,
        composition: Default::default(),
    };
    build_style_entries(
        text_declarations,
        &format!("{base_name}_text"),
        &target,
        &mut style_array_parts,
        &mut pressed_parts,
        // A text style moved onto the inserted `Text` is not on the element
        // that animates, so a `starting:` one is reported rather than kept.
        None,
        cx,
    );

    if interaction_context && !pressed_parts.is_empty() {
        style_array_parts.extend(pressed_parts);
        cx.runtime.need_component("HozoText");
        // A raw string uses the same interaction callback as an explicit
        // Text. Leaving this binding out breaks inherited focus-visible
        // colours, even if the parent correctly enabled modality tracking.
        let state = if text_declarations
            .iter()
            .any(|declaration| interaction::uses_focus_visible(&declaration.condition))
        {
            "{ pressed, hovered, focused, focusVisible }"
        } else {
            "{ pressed, hovered, focused }"
        };
        return format!(
            "<HozoText style={{({state}) => [{}]}}>{content}</HozoText>",
            style_array_parts.join(", ")
        );
    }
    let style_prop = if style_array_parts.is_empty() {
        String::new()
    } else if style_array_parts.len() == 1 && !style_array_parts[0].contains("&&") {
        format!(" style={{{}}}", style_array_parts[0])
    } else {
        format!(" style={{[{}]}}", style_array_parts.join(", "))
    };
    // Decision 013: the inserted Text is outermost like any authored one, and
    // a string is never opaque, so it reads only what it is not handed here.
    if cx.text_unified
        && cx.text_depth == 0
        && !crate::text_region::covers_protocol(text_declarations, cx.theme)
    {
        cx.runtime.need_component("HozoInheritedLeafText");
        return format!("<HozoInheritedLeafText{style_prop}>{content}</HozoInheritedLeafText>");
    }
    format!("<Text{style_prop}>{content}</Text>")
}

/// Properties that style text itself. They matter separately on this
/// platform because React Native's `Text` inherits them from an enclosing
/// `Text` but not from a `View`, so they have to travel with the text
/// rather than stay on its container.
/// Whether a text style handed down from here can actually land on
/// something that renders text.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum TextReach {
    /// There is a `Text`, or a raw string that becomes one.
    Certain,
    /// No `Text` the compiler can see, but something opaque is in the way:
    /// an expression, or a component Hozo doesn't model. It may render
    /// text through code the compiler never reads.
    Opaque,
    /// Nothing that could hold text at all.
    None,
}

pub(crate) fn is_text_primitive(primitive: Primitive) -> bool {
    matches!(
        primitive,
        Primitive::Text
            | Primitive::Badge
            | Primitive::Paragraph
            | Primitive::Heading
            | Primitive::Figcaption
            | Primitive::Time
            | Primitive::Legend
            | Primitive::Term
            | Primitive::Strong
            | Primitive::Emphasis
            | Primitive::Underline
            | Primitive::Strikethrough
            | Primitive::Sub
            | Primitive::Sup
            | Primitive::Code
            | Primitive::Preformatted
            | Primitive::Small
            | Primitive::Mark
            | Primitive::NoBreak
            | Primitive::Ruby
            | Primitive::RubyText
    )
}

/// Where a text style handed down from `node` could land.
///
/// Stops at a `Text`, because that is where React Native's own inheritance
/// takes over -- anything below it is the platform's problem, not the
/// compiler's.
pub(crate) fn text_reach(node: &Node) -> TextReach {
    let mut reach = TextReach::None;
    for child in &node.children {
        match child {
            hozo_ir::Child::Text(_) => return TextReach::Certain,
            hozo_ir::Child::Node(child_node) => {
                if is_text_primitive(child_node.primitive) {
                    return TextReach::Certain;
                }
                match text_reach(child_node) {
                    TextReach::Certain => return TextReach::Certain,
                    TextReach::Opaque => reach = TextReach::Opaque,
                    TextReach::None => {}
                }
            }
            hozo_ir::Child::Verbatim { nested, .. } => {
                if nested.iter().any(|n| {
                    is_text_primitive(n.node.primitive) || text_reach(&n.node) == TextReach::Certain
                }) {
                    return TextReach::Certain;
                }
                // `{name}` renders text and `{rows.map(..)}` may render a
                // Text through a component the compiler never reads. Either
                // way the compiler can't follow it.
                reach = TextReach::Opaque;
            }
        }
    }
    reach
}

pub(crate) fn is_text_property(property: &StyleProperty) -> bool {
    matches!(
        property,
        StyleProperty::FontSize(_)
            | StyleProperty::FontWeight(_)
            | StyleProperty::LineHeight(_)
            | StyleProperty::LeadingRegister(_)
            | StyleProperty::LetterSpacing(_)
            | StyleProperty::TextColor(_)
            | StyleProperty::TextAlign(_)
            | StyleProperty::TextTransform(_)
    )
}
