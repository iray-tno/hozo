//! What the stylesheet needs from the tree: the keyframes it animates with,
//! and which base rules its primitives and props call for.

use crate::*;

/// Every distinct `@keyframes` block the tree's animations need, in
/// first-use order so output stays deterministic.
pub(super) enum RequiredKeyframes<'a> {
    BuiltIn(&'static str),
    Stylex(&'a hozo_ir::Keyframes),
    /// A theme animation's `@keyframes`, by the animation's name.
    Theme(&'a str),
}

pub(super) fn collect_keyframes(node: &Node) -> Vec<RequiredKeyframes<'_>> {
    let mut found = Vec::new();
    collect_keyframes_into(node, &mut found);
    found
}

pub(super) fn render_keyframes(keyframes: RequiredKeyframes<'_>, theme: &Theme) -> String {
    match keyframes {
        RequiredKeyframes::BuiltIn(css) => css.to_string(),
        // As the theme wrote it: Tailwind emits the same rule for the same
        // class, so a page that also loads Tailwind's CSS gets one animation
        // under one name either way.
        RequiredKeyframes::Theme(name) => theme
            .animation(name)
            .and_then(|animation| animation.keyframes_css.clone())
            .unwrap_or_default(),
        RequiredKeyframes::Stylex(keyframes) => {
            let frames = keyframes
                .frames
                .iter()
                .map(|frame| {
                    let rule = css::render_rule(
                        &frame.selector,
                        &hozo_ir::Condition::Always,
                        &frame.properties,
                        theme,
                    );
                    // `render_rule` normally receives a class name and adds
                    // its dot. A keyframe selector is the one place the same
                    // declaration composer receives raw `from`/`50%` text.
                    rule.strip_prefix('.').unwrap_or(&rule).to_string()
                })
                .collect::<Vec<_>>()
                .join("\n");
            format!("@keyframes {} {{\n{}\n}}", keyframes.name, frames)
        }
    }
}

pub(super) fn contains_primitive(node: &Node, primitive: Primitive) -> bool {
    if node.primitive == primitive {
        return true;
    }
    node.children.iter().any(|child| match child {
        hozo_ir::Child::Node(child) => contains_primitive(child, primitive),
        hozo_ir::Child::Verbatim { nested, .. } => nested
            .iter()
            .any(|entry| contains_primitive(&entry.node, primitive)),
        hozo_ir::Child::Text(_) => false,
    })
}

/// Whether this node carries a disabled state, by either spelling.
///
/// The same question `disabled_expr` answers per node, asked of a tree so
/// the shared base rule is emitted once and only when something needs it.
pub(super) fn marks_disabled(node: &Node) -> bool {
    node.props.disabled.is_some()
        || (node.props.accessibility_state.is_some()
            && node
                .props
                .accessibility_state_keys
                .as_ref()
                .is_none_or(|keys| keys.iter().any(|key| key == "disabled")))
}

pub(super) fn contains_prop(node: &Node, predicate: fn(&Node) -> bool) -> bool {
    if predicate(node) {
        return true;
    }
    node.children.iter().any(|child| match child {
        hozo_ir::Child::Node(child) => contains_prop(child, predicate),
        hozo_ir::Child::Verbatim { nested, .. } => nested
            .iter()
            .any(|entry| contains_prop(&entry.node, predicate)),
        hozo_ir::Child::Text(_) => false,
    })
}

/// Whether anything in this tree writes into a `::before` or `::after`.
///
/// Either by targeting one, or by setting the register a rule elsewhere
/// reads. The second is what makes `content-['x']` on its own still worth
/// the base rules: the utility is only useful because some `before:` rule
/// picks the value up.
pub(super) fn uses_generated_content(node: &Node) -> bool {
    contains_prop(node, |node| {
        node.style.iter().any(|declaration| {
            matches!(declaration.property, hozo_ir::StyleProperty::Content(_))
                || declaration
                    .condition
                    .pseudo_element()
                    .is_some_and(|pseudo| pseudo.needs_content())
        })
    })
}

/// Whether this element's own styles make it scroll.
///
/// The trigger for keyboard access is what the element *does*, not which
/// primitive produced it: a `View` with `overflow-x-auto` is as
/// unreachable as a `ScrollView`, and axe judges both by computed style.
/// A story here used the first form and stayed in violation after the
/// second was fixed.
///
/// `hidden` and `visible` do not scroll and `clip` cannot be scrolled by
/// any means, so only `scroll` and `auto` count.
pub(super) fn scrolls_by_style(node: &Node) -> bool {
    node.style.iter().any(|declaration| {
        let overflow = match declaration.property {
            hozo_ir::StyleProperty::Overflow(value)
            | hozo_ir::StyleProperty::OverflowX(value)
            | hozo_ir::StyleProperty::OverflowY(value) => value,
            _ => return false,
        };
        matches!(
            overflow,
            hozo_ir::Overflow::Scroll | hozo_ir::Overflow::Css("auto")
        )
    })
}

/// A theme name the theme does not define: an animation, or a radius.
pub(super) fn unresolved_animation(property: &hozo_ir::StyleProperty, theme: &Theme) -> bool {
    matches!(property, hozo_ir::StyleProperty::ThemeAnimation(name) if theme.animation(name).is_none())
        || property
            .theme_radius()
            .is_some_and(|name| theme.radius(name).is_none())
}

pub(super) fn mentions_unresolved_animation(node: &Node, theme: &Theme) -> bool {
    node.style
        .iter()
        .any(|declaration| unresolved_animation(&declaration.property, theme))
        || node.children.iter().any(|child| match child {
            hozo_ir::Child::Node(child) => mentions_unresolved_animation(child, theme),
            hozo_ir::Child::Verbatim { nested, .. } => nested
                .iter()
                .any(|entry| mentions_unresolved_animation(&entry.node, theme)),
            hozo_ir::Child::Text(_) => false,
        })
}

pub(super) fn without_unresolved_animations(node: &Node, theme: &Theme) -> Node {
    let mut node = node.clone();
    strip_unresolved_animations(&mut node, theme);
    node
}

pub(super) fn strip_unresolved_animations(node: &mut Node, theme: &Theme) {
    node.style
        .retain(|declaration| !unresolved_animation(&declaration.property, theme));
    for child in &mut node.children {
        match child {
            hozo_ir::Child::Node(child) => strip_unresolved_animations(child, theme),
            hozo_ir::Child::Verbatim { nested, .. } => {
                for entry in nested {
                    strip_unresolved_animations(&mut entry.node, theme);
                }
            }
            hozo_ir::Child::Text(_) => {}
        }
    }
}

pub(super) fn collect_keyframes_into<'a>(node: &'a Node, found: &mut Vec<RequiredKeyframes<'a>>) {
    fn collect_property<'a>(
        property: &'a hozo_ir::StyleProperty,
        found: &mut Vec<RequiredKeyframes<'a>>,
    ) {
        match property {
            hozo_ir::StyleProperty::Animation(animation) => {
                if let Some(keyframes) = animation.keyframes() {
                    if !found.iter().any(|found| {
                        matches!(found, RequiredKeyframes::BuiltIn(existing) if *existing == keyframes)
                    }) {
                        found.push(RequiredKeyframes::BuiltIn(keyframes));
                    }
                }
            }
            hozo_ir::StyleProperty::AnimationName(keyframes) => {
                if !found.iter().any(|found| {
                    matches!(found, RequiredKeyframes::Stylex(existing) if existing.name == keyframes.name)
                }) {
                    found.push(RequiredKeyframes::Stylex(keyframes));
                }
            }
            hozo_ir::StyleProperty::ThemeAnimation(name) => {
                if !found
                    .iter()
                    .any(|found| matches!(found, RequiredKeyframes::Theme(existing) if *existing == name))
                {
                    found.push(RequiredKeyframes::Theme(name));
                }
            }
            hozo_ir::StyleProperty::FirstThatWorks(candidates) => {
                for candidate in candidates {
                    collect_property(candidate, found);
                }
            }
            _ => {}
        }
    }
    for declaration in &node.style {
        collect_property(&declaration.property, found);
    }
    for child in &node.children {
        match child {
            hozo_ir::Child::Node(child_node) => collect_keyframes_into(child_node, found),
            hozo_ir::Child::Verbatim { nested, .. } => {
                for entry in nested {
                    collect_keyframes_into(&entry.node, found);
                }
            }
            hozo_ir::Child::Text(_) => {}
        }
    }
}
