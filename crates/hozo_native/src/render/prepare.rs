//! Readings of an element's style taken before the refusal check: motion
//! guarded inside a skeleton, whether it animates with keyframes, and the
//! paint an SVG element takes as props.

use super::*;

/// A skeleton's animation runs only when motion is allowed, whatever the
/// class said: `animate-pulse` on one is read as
/// `motion-safe:animate-pulse` (decision 007, section 5). The Web half is
/// a base CSS rule; here it is the same guard a written `motion-safe:`
/// gets. The Web rule covers the skeleton's descendants too, so this
/// does.
pub(super) fn motion_safe_skeleton(
    style: Vec<StyleDeclaration>,
    node: &Node,
    in_skeleton: bool,
) -> Vec<StyleDeclaration> {
    if node.primitive == Primitive::Skeleton || in_skeleton {
        style
            .into_iter()
            .map(|declaration| match declaration.property {
                // Already said, so not said twice.
                _ if condition_contains(&declaration.condition, |condition| {
                    matches!(
                        condition,
                        Condition::Environment(hozo_ir::Environment::MotionSafe)
                    )
                }) =>
                {
                    declaration
                }
                StyleProperty::Animation(_)
                | StyleProperty::AnimationName(_)
                | StyleProperty::ThemeAnimation(_) => StyleDeclaration {
                    condition: Condition::all(vec![
                        Condition::Environment(hozo_ir::Environment::MotionSafe),
                        declaration.condition.clone(),
                    ]),
                    ..declaration
                },
                _ => declaration,
            })
            .collect()
    } else {
        style
    }
}

/// A keyframe animation's `animation-*` longhands are its timing, read
/// into `useHozoKeyframes` -- Web-only on an element with no keyframes
/// and lowered on one with them, as the transition ones above are.
///
/// A style holding `Animated` values only moves on an `Animated`
/// component: a plain `View` or `Text` is handed objects it cannot read. Tailwind's
/// four loops and a project's own keyframes both produce one.
/// Returns whether it has keyframes and whether its style holds `Animated`
/// values.
pub(super) fn animation(style: &[StyleDeclaration], theme: &Theme) -> (bool, bool) {
    let has_keyframes = style.iter().any(|declaration| match &declaration.property {
        StyleProperty::AnimationName(_) => true,
        // Only one the theme can run: an unresolved name renders nothing
        // animated, so the element stays what it was.
        StyleProperty::ThemeAnimation(name) => theme
            .animation(name)
            .is_some_and(|animation| animation.keyframes.is_some()),
        _ => false,
    });
    // A style holding `Animated` values only moves on an `Animated`
    // component: a plain `View` or `Text` is handed objects it cannot read. Tailwind's
    // four loops and a project's own keyframes both produce one.
    let animated_style = has_keyframes
        || style.iter().any(|declaration| {
            matches!(&declaration.property, StyleProperty::Animation(name) if *name != hozo_ir::Animation::None)
        });
    (has_keyframes, animated_style)
}

/// `react-native-svg` takes paint as *props*, not as style, so on an
/// SVG element these three stop being Web-only and become something to
/// lower. The refusal that used to name them said the library "is a
/// separate dependency with its own props, not a style Hozo can lower
/// to" -- true about the style and beside the point about the props,
/// which is exactly the sort of asymmetry the compiler is for: one
/// class, `fill-blue-500`, becomes a CSS declaration on Web and an
/// attribute here.
pub(super) fn svg_paint(
    node: &Node,
    style: &[StyleDeclaration],
    theme: &Theme,
) -> Vec<(&'static str, String)> {
    if matches!(node.primitive, Primitive::Svg(_)) {
        style
            .iter()
            .filter_map(|declaration| match &declaration.property {
                // Trimmed: the style resolver returns a JavaScript string
                // literal, quotes included, because that is what a
                // StyleSheet entry needs. A JSX attribute brings its own.
                StyleProperty::Fill(color)
                    if !matches!(
                        color,
                        hozo_ir::Color::Css(text) if !hozo_ir::native_color_literal_valid(text)
                    ) =>
                {
                    Some((
                        "fill",
                        crate::style::resolve_theme_color(color, theme)
                            .trim_matches('\'')
                            .to_string(),
                    ))
                }
                StyleProperty::Stroke(color)
                    if !matches!(
                        color,
                        hozo_ir::Color::Css(text) if !hozo_ir::native_color_literal_valid(text)
                    ) =>
                {
                    Some((
                        "stroke",
                        crate::style::resolve_theme_color(color, theme)
                            .trim_matches('\'')
                            .to_string(),
                    ))
                }
                StyleProperty::StrokeWidth(width) => width
                    .px(theme)
                    .map(|px| ("strokeWidth", format!("{{{px}}}"))),
                _ => None,
            })
            .collect()
    } else {
        Vec::new()
    }
}
