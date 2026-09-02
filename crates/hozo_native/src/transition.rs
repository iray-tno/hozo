use hozo_ir::{Condition, Node, Primitive, StyleDeclaration, StyleProperty};

use super::condition_contains;

pub(super) fn native_driver_transition(
    node: &Node,
    declarations: &[StyleDeclaration],
) -> Option<(u32, &'static str, bool, bool, bool)> {
    if !matches!(node.primitive, Primitive::Pressable | Primitive::Button) {
        return None;
    }
    let interactive = |property: fn(&StyleProperty) -> bool| {
        declarations.iter().any(|declaration| {
            property(&declaration.property)
                && condition_contains(&declaration.condition, |condition| {
                matches!(condition, Condition::Hover | Condition::Focus | Condition::FocusVisible | Condition::Pressed)
            })
        })
    };
    let interactive_opacity = interactive(|property| matches!(property, StyleProperty::Opacity(_)));
    let interactive_transform = interactive(|property| matches!(
        property,
        StyleProperty::Translate(_)
            | StyleProperty::TranslateX(_)
            | StyleProperty::TranslateY(_)
            | StyleProperty::Rotate(_)
            | StyleProperty::RotateX(_)
            | StyleProperty::RotateY(_)
            | StyleProperty::RotateZ(_)
            | StyleProperty::ScaleX(_)
            | StyleProperty::ScaleY(_)
    ) || matches!(property, StyleProperty::Scale(values) if values.len() <= 2));
    let has_base_text_color = declarations.iter().any(|declaration| {
        matches!(declaration.property, StyleProperty::TextColor(_))
            && matches!(declaration.condition, Condition::Always)
    });
    let interactive_colors = interactive(|property| matches!(property, StyleProperty::BackgroundColor(_)))
        || (has_base_text_color
            && interactive(|property| matches!(property, StyleProperty::TextColor(_))));
    if !interactive_opacity && !interactive_transform && !interactive_colors {
        return None;
    }
    let properties = declarations.iter().rev().find_map(|declaration| match &declaration.property {
        StyleProperty::TransitionProperty(properties) => Some(properties.as_str()),
        _ => None,
    })?;
    if properties == "none" {
        return None;
    }
    let includes = |wanted: &[&str]| {
        properties == "all"
            || properties.split(',').any(|property| wanted.contains(&property.trim()))
    };
    let opacity = interactive_opacity && includes(&["opacity"]);
    let transform = interactive_transform && includes(&["transform", "translate", "scale", "rotate"]);
    let colors = interactive_colors && includes(&["color", "background-color"]);
    if !opacity && !transform && !colors { return None; }
    let duration = declarations.iter().rev().find_map(|declaration| match declaration.property {
        StyleProperty::TransitionDuration(duration, _) => Some(duration),
        _ => None,
    }).unwrap_or(150);
    let timing = declarations.iter().rev().find_map(|declaration| match &declaration.property {
        StyleProperty::TransitionTimingFunction(timing, _) => Some(timing.as_str()),
        _ => None,
    }).unwrap_or("cubic-bezier(0.4, 0, 0.2, 1)");
    let easing = match timing {
        "linear" => "linear",
        "ease-in" | "cubic-bezier(0.4, 0, 1, 1)" => "ease-in",
        "ease-out" | "cubic-bezier(0, 0, 0.2, 1)" => "ease-out",
        "ease-in-out" => "ease-in-out",
        _ => "ease-in-out",
    };
    Some((duration, easing, opacity, transform, colors))
}

/// A transition on an element whose condition is ambient rather than an
/// interaction.
///
/// `native_driver_transition` above serves `Pressable` and asks whether a
/// *press* changes something worth animating. This asks the other half of
/// the question: does a condition the whole app shares -- the colour
/// scheme, a breakpoint, an accessibility setting -- change something
/// worth animating on an element that is not a control.
///
/// Returns the duration and easing only. Which properties moved is not
/// decidable here in the way it is for a Pressable: there the compiler
/// evaluates the style for each interaction state and can compare them,
/// and here the guard is a runtime value, so what the style *becomes* is
/// only known once it has. `HozoAnimated` diffs it at render instead.
pub(super) fn ambient_transition(node: &Node, declarations: &[StyleDeclaration]) -> Option<(u32, &'static str)> {
    if matches!(node.primitive, Primitive::Pressable | Primitive::Button) {
        return None;
    }
    let properties = declarations.iter().rev().find_map(|declaration| match &declaration.property {
        StyleProperty::TransitionProperty(properties) => Some(properties.as_str()),
        _ => None,
    })?;
    if properties == "none" {
        return None;
    }
    // Something the runtime can interpolate, under a condition the runtime
    // can change its mind about. Both halves matter: `transition` beside a
    // `dark:rounded-lg` is a rule that flips and a property nothing can
    // animate between, and wrapping the element for it would add a
    // component and an animation that never shows.
    let animatable = declarations.iter().any(|declaration| {
        let interpolatable = matches!(
            declaration.property,
            StyleProperty::Opacity(_)
                | StyleProperty::BackgroundColor(_)
                | StyleProperty::TextColor(_)
                | StyleProperty::BorderColor(_)
                | StyleProperty::Translate(_)
                | StyleProperty::TranslateX(_)
                | StyleProperty::TranslateY(_)
                | StyleProperty::Rotate(_)
                | StyleProperty::ScaleX(_)
                | StyleProperty::ScaleY(_)
        ) || matches!(&declaration.property, StyleProperty::Scale(values) if values.len() <= 2);
        interpolatable && condition_contains(&declaration.condition, runtime_variable)
    });
    if !animatable {
        return None;
    }
    let duration = declarations
        .iter()
        .rev()
        .find_map(|declaration| match declaration.property {
            StyleProperty::TransitionDuration(duration, _) => Some(duration),
            _ => None,
        })
        .unwrap_or(150);
    let timing = declarations
        .iter()
        .rev()
        .find_map(|declaration| match &declaration.property {
            StyleProperty::TransitionTimingFunction(timing, _) => Some(timing.as_str()),
            _ => None,
        })
        .unwrap_or("cubic-bezier(0.4, 0, 0.2, 1)");
    let easing = match timing {
        "linear" => "linear",
        "ease-in" | "cubic-bezier(0.4, 0, 1, 1)" => "ease-in",
        "ease-out" | "cubic-bezier(0, 0, 0.2, 1)" => "ease-out",
        "ease-in-out" => "ease-in-out",
        _ => "ease-in-out",
    };
    Some((duration, easing))
}

#[cfg(test)]
mod ambient_transition_tests {
    use crate::{lower, LowerOutput};
    use hozo_ir::Theme;

    fn compile(class_name: &str) -> LowerOutput {
        let source = format!(
            "import {{ View }} from '@hozo/core'\nconst el = <View className=\"{class_name}\" />\n"
        );
        let parsed = hozo_parser::parse_tsx(&source);
        lower(&parsed.roots[0].node, &source, &Theme::default())
    }

    #[test]
    fn a_colour_that_changes_with_the_theme_is_animated() {
        // The case the whole path exists for: an ambient condition flips
        // and the element crossfades instead of jumping.
        let out = compile("transition bg-white dark:bg-black");
        assert!(out.jsx.starts_with("<HozoAnimated"), "{}", out.jsx);
        assert!(out.jsx.contains("hozoTransition={{ duration: 150"), "{}", out.jsx);
        assert!(out.runtime_imports.contains(&"HozoAnimated"), "{:?}", out.runtime_imports);
        // The transition properties are consumed rather than refused --
        // they are Web-only on an element with nothing to animate and
        // lowered on one with something.
        assert!(out.diagnostics.is_empty(), "{:?}", out.diagnostics);
    }

    #[test]
    fn the_duration_and_easing_come_from_the_classes() {
        let out = compile("transition duration-500 ease-linear opacity-100 md:opacity-50");
        assert!(
            out.jsx.contains("hozoTransition={{ duration: 500, easing: 'linear' }}"),
            "{}",
            out.jsx,
        );
    }

    #[test]
    fn a_property_nothing_can_interpolate_is_left_alone() {
        // `transition` beside a `dark:rounded-lg` is a rule that flips and
        // a property nothing can animate between. Wrapping the element
        // would add a component and an animation that never shows.
        let out = compile("transition dark:rounded-lg");
        assert!(out.jsx.starts_with("<View"), "{}", out.jsx);
        assert!(!out.runtime_imports.contains(&"HozoAnimated"), "{:?}", out.runtime_imports);
    }

    #[test]
    fn a_change_with_no_transition_asked_for_is_not_animated() {
        for class_name in ["bg-white dark:bg-black", "transition-none bg-white dark:bg-black"] {
            let out = compile(class_name);
            assert!(out.jsx.starts_with("<View"), "{class_name}: {}", out.jsx);
        }
    }

    #[test]
    fn a_pressable_keeps_the_interaction_path() {
        // Two transitions on one element would be two animations of the
        // same properties, and `Pressable`'s knows which ones moved
        // because it can evaluate both states.
        let source = "import { Pressable } from '@hozo/core'\n\
                      const el = <Pressable className=\"transition opacity-100 hover:opacity-50\" \
                      accessibilityRole=\"button\" onPress={go} />\n";
        let parsed = hozo_parser::parse_tsx(source);
        let out = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(out.jsx.contains("opacity: true"), "{}", out.jsx);
        assert_eq!(out.jsx.matches("hozoTransition").count(), 1, "{}", out.jsx);
    }
}

/// Whether this condition is one the React Native runtime can change its
/// mind about while the app is running.
///
/// Not `Condition::is_ambient`, which was the first version and is a
/// question about CSS: it asks whether the condition becomes an at-rule,
/// and `Hover` answers yes because on Web it is both a media query and a
/// pseudo-class. On a device there is no hover on a plain View at all --
/// the compiler reports it as unwired a few lines above -- so treating it
/// as a reason to animate wrapped every `hover:` element in a component
/// that would never see its style change.
///
/// These five are exactly the ones with a runtime hook behind them, which
/// is the same thing said from the other side: a condition Hozo subscribes
/// to is a condition that can flip.
fn runtime_variable(condition: &Condition) -> bool {
    matches!(
        condition,
        Condition::Dark
            | Condition::Responsive(_)
            | Condition::Width { .. }
            | Condition::Container { .. }
            | Condition::Environment(_)
    )
}

#[cfg(test)]
mod interaction_transition_tests {
    use crate::lower;
    use hozo_ir::Theme;

    #[test]
    fn interactive_opacity_transition_uses_the_native_driver_config() {
        let source = r#"
            import { Pressable } from '@hozo/core'
            const el = (
              <Pressable className="opacity-100 transition duration-200 ease-in-out hover:opacity-50"
                accessibilityRole="button">Save</Pressable>
            )
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(output.jsx.starts_with("<HozoPressable"), "{}", output.jsx);
        assert!(
            output.jsx.contains("hozoTransition={{ duration: 200, easing: 'ease-in-out', opacity: true, transform: false, colors: false }}"),
            "{}",
            output.jsx
        );
        assert!(output.jsx.contains("hovered && hozoStyles.hozo0_hover"), "{}", output.jsx);
    }

    #[test]
    fn interactive_color_transition_uses_the_js_driver_config() {
        let source = r#"
            import { Pressable } from '@hozo/core'
            const el = (
              <Pressable className="bg-white text-gray-500 transition duration-200 hover:bg-blue-500 focus:bg-red-500 hover:text-blue-500"
                accessibilityRole="button">Save</Pressable>
            )
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(output.jsx.contains("colors: true"), "{}", output.jsx);
        assert!(output.jsx.contains("<HozoText style={({ pressed, hovered, focused }) =>"), "{}", output.jsx);
        assert!(output.runtime_imports.contains(&"HozoText"));
    }

    #[test]
    fn explicit_text_inherits_the_pressables_animated_color_state() {
        let source = r#"
            import { Pressable, Text } from '@hozo/core'
            const el = (
              <Pressable className="text-gray-500 transition hover:text-blue-500"
                accessibilityRole="button"><Text>Save</Text></Pressable>
            )
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(output.jsx.contains("<HozoText style={({ pressed, hovered, focused }) =>"), "{}", output.jsx);
    }

    #[test]
    fn interactive_transform_transition_stays_on_the_native_driver() {
        let source = r#"
            import { Pressable } from '@hozo/core'
            const el = (
              <Pressable className="transition duration-200 hover:scale-95 focus:translate-x-2 hover:rotate-45"
                accessibilityRole="button">Save</Pressable>
            )
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(
            output.jsx.contains("opacity: false, transform: true"),
            "{}",
            output.jsx
        );
    }
}
