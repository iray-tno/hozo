//! A project's own `@keyframes` as a `useHozoKeyframes` spec (decision 007,
//! slice 3).
//!
//! The frames become React Native style objects through the same lowering
//! every other style takes, and the timing comes from the `animation-*`
//! longhands beside them, as CSS reads it. What a frame cannot animate --
//! anything `HozoAnimated` cannot interpolate -- is left out and named.

use super::*;
use hozo_ir::Keyframes;

/// The `animation-*` longhands this lowering reads.
const TIMING: [&str; 6] = [
    "animation-duration",
    "animation-delay",
    "animation-timing-function",
    "animation-iteration-count",
    "animation-direction",
    "animation-fill-mode",
];

/// Whether `property` is timing for a keyframe animation, which the
/// keyframes hook reads rather than the style array.
pub(super) fn is_timing(property: &StyleProperty) -> bool {
    matches!(property, StyleProperty::WebOnly(name, _) if TIMING.contains(&name.as_str()))
}

/// What a frame can move: what `HozoAnimated` interpolates, plus an authored
/// `transform` list (StyleX writes `transform: 'rotate(3deg)'`) made only of
/// functions with a React Native transform entry. `perspective` is not one
/// a frame can interpolate towards.
fn animatable(property: &StyleProperty) -> bool {
    // Ambient transitions receive a composed style target. Frame specs do
    // not carry the independent CSS slots, so a control is not a safe
    // endpoint here even though transitions can interpolate its target.
    !crate::transforms::is_control(property)
        && (crate::transition::interpolatable(property)
            || matches!(property, StyleProperty::Transform(functions)
                if functions.iter().all(|function| !matches!(function, hozo_ir::TransformFunction::Perspective(_)))))
}

/// A CSS time in milliseconds: `200ms`, `0.2s`, `.5s`.
fn milliseconds(value: &str) -> Option<f64> {
    let value = value.trim();
    let (number, scale) = match value.strip_suffix("ms") {
        Some(number) => (number, 1.0),
        None => (value.strip_suffix('s')?, 1000.0),
    };
    number.trim().parse::<f64>().ok().filter(|n| n.is_finite()).map(|n| n * scale)
}

/// Where a selector's frames sit: `from` 0, `to` 1, `40%` 0.4, and a
/// comma list for each of its members.
fn offsets(selector: &str) -> Option<Vec<f64>> {
    selector
        .split(',')
        .map(|part| match part.trim() {
            "from" => Some(0.0),
            "to" => Some(1.0),
            percent => percent
                .strip_suffix('%')?
                .trim()
                .parse::<f64>()
                .ok()
                .filter(|n| (0.0..=100.0).contains(n))
                .map(|n| n / 100.0),
        })
        .collect()
}

fn easing(value: &str) -> Result<String, ()> {
    let value = value.trim();
    match value {
        "linear" | "ease" | "ease-in" | "ease-out" | "ease-in-out" => Ok(format!("'{value}'")),
        _ => {
            let inner = value
                .strip_prefix("cubic-bezier(")
                .and_then(|rest| rest.strip_suffix(')'))
                .ok_or(())?;
            let numbers: Vec<f64> = inner
                .split(',')
                .map(|n| n.trim().parse::<f64>().map_err(|_| ()))
                .collect::<Result<_, _>>()?;
            if numbers.len() != 4 {
                return Err(());
            }
            Ok(format!(
                "[{}]",
                numbers.iter().map(f64::to_string).collect::<Vec<_>>().join(", ")
            ))
        }
    }
}

fn number(value: f64) -> String {
    if value.fract() == 0.0 { format!("{}", value as i64) } else { value.to_string() }
}

/// The `useHozoKeyframes` argument for `keyframes`, timed by `timing` (the
/// element's `animation-*` longhands, last written wins).
pub(super) fn spec(
    keyframes: &Keyframes,
    timing: &[&StyleProperty],
    theme: &Theme,
    node: &Node,
    diagnostics: &mut Vec<Diagnostic>,
) -> String {
    let mut fields: Vec<String> = Vec::new();
    let mut unread: Vec<String> = Vec::new();
    let mut duration = 0.0;
    for property in timing {
        let StyleProperty::WebOnly(name, value) = property else { continue };
        match name.as_str() {
            "animation-duration" => match milliseconds(value) {
                Some(ms) => duration = ms,
                None => unread.push(format!("`{name}: {value}`")),
            },
            "animation-delay" => match milliseconds(value) {
                Some(ms) if ms > 0.0 => fields.push(format!("delay: {}", number(ms))),
                Some(_) => {}
                None => unread.push(format!("`{name}: {value}`")),
            },
            "animation-timing-function" => match easing(value) {
                Ok(easing) => fields.push(format!("easing: {easing}")),
                Err(()) => unread.push(format!("`{name}: {value}`")),
            },
            "animation-iteration-count" => match value.trim() {
                "infinite" => fields.push("iterations: -1".to_string()),
                count => match count.parse::<f64>() {
                    Ok(n) if n >= 0.0 && n.fract() == 0.0 => {
                        fields.push(format!("iterations: {}", number(n)))
                    }
                    _ => unread.push(format!("`{name}: {value}`")),
                },
            },
            "animation-direction" => match value.trim() {
                direction @ ("normal" | "reverse" | "alternate" | "alternate-reverse") => {
                    fields.push(format!("direction: '{direction}'"))
                }
                _ => unread.push(format!("`{name}: {value}`")),
            },
            "animation-fill-mode" => match value.trim() {
                fill @ ("none" | "forwards" | "backwards" | "both") => {
                    fields.push(format!("fillMode: '{fill}'"))
                }
                _ => unread.push(format!("`{name}: {value}`")),
            },
            _ => {}
        }
    }

    let mut frames: Vec<String> = Vec::new();
    let mut fixed: Vec<String> = Vec::new();
    if keyframes.frames.iter().any(|frame| {
        frame.properties.iter().any(crate::transforms::is_control)
    }) {
        diagnostics.push(crate::conditions::unwired_variant(
            node,
            &format!(
                "Transform controls in `@keyframes {}` are not wired on Native yet. Use explicit transform values for these animation endpoints.",
                keyframes.name,
            ),
            Severity::Error,
        ));
    }
    for frame in &keyframes.frames {
        let Some(at) = offsets(&frame.selector) else {
            unread.push(format!("the frame selector `{}`", frame.selector));
            continue;
        };
        let (kept, dropped): (Vec<StyleProperty>, Vec<StyleProperty>) = frame
            .properties
            .iter()
            .cloned()
            .partition(animatable);
        for property in &dropped {
            for (key, _) in crate::style::property_and_value(property, theme) {
                let key = format!("`{key}`");
                if !fixed.contains(&key) {
                    fixed.push(key);
                }
            }
        }
        let pairs = crate::candidate::style_pairs(&kept, theme);
        if pairs.is_empty() {
            continue;
        }
        let style = pairs
            .iter()
            .map(|(key, value)| format!("{key}: {value}"))
            .collect::<Vec<_>>()
            .join(", ");
        for at in at {
            frames.push(format!("{{ at: {}, style: {{ {style} }} }}", number(at)));
        }
    }

    if !fixed.is_empty() {
        diagnostics.push(crate::conditions::unwired_variant(
            node,
            &format!(
                "`@keyframes {}` on React Native animates opacity, transforms and colours -- what \
                 the native runtime can interpolate. {} would jump from frame to frame rather than \
                 move, so it is left out here. On Web the same keyframes animate it.",
                keyframes.name,
                fixed.join(", ")
            ),
            Severity::Warning,
        ));
    }
    if !unread.is_empty() {
        diagnostics.push(crate::conditions::unwired_variant(
            node,
            &format!(
                "`@keyframes {}`: {} could not be read on React Native, so the CSS default is used \
                 in its place. On Web it applies as written.",
                keyframes.name,
                unread.join(", ")
            ),
            Severity::Warning,
        ));
    }

    let mut out = vec![
        format!("frames: [{}]", frames.join(", ")),
        format!("duration: {}", number(duration)),
    ];
    out.extend(fields);
    format!("{{ {} }}", out.join(", "))
}

#[cfg(test)]
mod tests {
    use crate::{lower, LowerOutput, Theme};

    fn compile(rule: &str, keyframes: &str) -> LowerOutput {
        let source = format!(
            "import * as stylex from '@stylexjs/stylex'\n\
             import {{ View }} from '@hozo/core'\n\
             const motion = stylex.keyframes({keyframes})\n\
             const s = stylex.create({{ card: {{ animationName: motion, {rule} }} }})\n\
             const el = <View {{...stylex.props(s.card)}} />\n"
        );
        let parsed = hozo_parser::parse_tsx(&source);
        lower(&parsed.roots[0].node, &source, &Theme::default())
    }

    fn spec(out: &LowerOutput) -> &str {
        out.prelude
            .iter()
            .find(|line| line.contains("useHozoKeyframes("))
            .map(String::as_str)
            .unwrap_or_else(|| panic!("no keyframes hook: {:?}", out.prelude))
    }

    #[test]
    fn keyframes_become_a_hook_on_an_animated_view() {
        let out = compile(
            "animationDuration: '1s', animationIterationCount: 'infinite'",
            "{ from: { opacity: 0 }, to: { opacity: 1 } }",
        );
        assert!(out.jsx.starts_with("<Animated.View style={__hozoKeyframes_0}"), "{}", out.jsx);
        assert!(out.runtime_imports.contains(&"useHozoKeyframes"), "{:?}", out.runtime_imports);
        assert!(out.native_imports.contains(&"Animated"), "{:?}", out.native_imports);
        let spec = spec(&out);
        assert!(spec.contains("{ at: 0, style: { opacity: 0 } }"), "{spec}");
        assert!(spec.contains("{ at: 1, style: { opacity: 1 } }"), "{spec}");
        assert!(spec.contains("duration: 1000"), "{spec}");
        assert!(spec.contains("iterations: -1"), "{spec}");
        // The longhands are the hook's timing, not Web-only styles.
        assert!(out.diagnostics.is_empty(), "{:?}", out.diagnostics);
    }

    #[test]
    fn the_timing_reads_as_css_writes_it() {
        let out = compile(
            "animationDuration: '250ms', animationDelay: '0.1s', \
             animationTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)', \
             animationDirection: 'alternate', animationFillMode: 'both', animationIterationCount: 3",
            "{ '0%, 100%': { transform: 'rotate(-3deg)' }, '50%': { transform: 'rotate(3deg)' } }",
        );
        let spec = spec(&out);
        for expected in [
            "duration: 250",
            "delay: 100",
            "easing: [0.4, 0, 0.2, 1]",
            "direction: 'alternate'",
            "fillMode: 'both'",
            "iterations: 3",
            "{ at: 0, style: { transform: [{ rotate: '-3deg' }] } }",
            "{ at: 1, style: { transform: [{ rotate: '-3deg' }] } }",
            "{ at: 0.5, style: { transform: [{ rotate: '3deg' }] } }",
        ] {
            assert!(spec.contains(expected), "missing {expected}: {spec}");
        }
        assert!(out.diagnostics.is_empty(), "{:?}", out.diagnostics);
    }

    #[test]
    fn what_cannot_be_interpolated_is_left_out_and_named() {
        let out = compile(
            "animationDuration: '1s'",
            "{ from: { opacity: 0, width: 10 }, to: { opacity: 1, width: 20 } }",
        );
        assert!(!spec(&out).contains("width"), "{}", spec(&out));
        assert!(
            out.diagnostics.iter().any(|d| d.message.contains("`width`")
                && d.severity == hozo_ir::Severity::Warning),
            "{:?}",
            out.diagnostics
        );
    }

    #[test]
    fn independent_transform_controls_are_refused_as_keyframe_endpoints() {
        use hozo_ir::{Keyframe, Keyframes, Severity, StyleProperty};

        let source = "import { View } from '@hozo/core'; const el = <View />";
        let parsed = hozo_parser::parse_tsx(source);
        for control in [
            StyleProperty::RotateNone,
            StyleProperty::ScaleNone,
            StyleProperty::TranslateNone,
            StyleProperty::TransformNone,
            StyleProperty::TransformEmpty,
        ] {
            let keyframes = Keyframes {
                name: "reset".into(),
                frames: vec![Keyframe {
                    selector: "to".into(),
                    properties: vec![StyleProperty::Opacity(1.0), control],
                }],
            };
            let mut diagnostics = Vec::new();
            let output = super::spec(
                &keyframes, &[], &Theme::default(), &parsed.roots[0].node, &mut diagnostics,
            );
            assert!(output.contains("opacity: 1"), "{output}");
            assert!(!output.contains("transform:"), "{output}");
            assert!(
                diagnostics.iter().any(|d| d.severity == Severity::Error
                    && d.message.contains("Transform controls in `@keyframes reset`")),
                "{diagnostics:?}",
            );
        }
    }

    #[test]
    fn an_unreadable_timing_value_is_named_and_the_default_used() {
        let out = compile(
            "animationDuration: '1s', animationTimingFunction: 'steps(4)'",
            "{ from: { opacity: 0 }, to: { opacity: 1 } }",
        );
        assert!(!spec(&out).contains("easing"), "{}", spec(&out));
        assert!(
            out.diagnostics.iter().any(|d| d.message.contains("steps(4)")),
            "{:?}",
            out.diagnostics
        );
    }

    #[test]
    fn tailwinds_loops_render_on_an_animated_view_too() {
        // An `Animated` value in a plain `View`'s style is an object the
        // view cannot read; the loops needed this as much as keyframes do.
        let source = "import { View } from '@hozo/core'\nconst el = <View className=\"animate-spin\" />\n";
        let parsed = hozo_parser::parse_tsx(source);
        let out = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(out.jsx.starts_with("<Animated.View"), "{}", out.jsx);
    }

    #[test]
    fn and_a_text_with_a_loop_on_an_animated_text() {
        let source =
            "import { Text } from '@hozo/core'\nconst el = <Text className=\"animate-pulse\">Loading</Text>\n";
        let parsed = hozo_parser::parse_tsx(source);
        let out = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(out.jsx.starts_with("<Animated.Text"), "{}", out.jsx);
        assert!(out.native_imports.contains(&"Animated"), "{:?}", out.native_imports);
    }
}

#[cfg(test)]
mod theme_animation_tests {
    use crate::{lower, Theme};

    fn warned(class_name: &str) -> bool {
        let source = format!(
            "import {{ View }} from '@hozo/core'\nconst el = <View className=\"{class_name}\" />\n"
        );
        let parsed = hozo_parser::parse_tsx(&source);
        let out = lower(&parsed.roots[0].node, &source, &Theme::default());
        out.diagnostics.iter().any(|d| {
            d.message.contains("--animate-*") && d.severity == hozo_ir::Severity::Warning
        })
    }

    #[test]
    fn a_theme_animation_is_named_rather_than_silently_gone() {
        // It used to compile to nothing at all on this platform.
        assert!(warned("animate-wiggle"));
        assert!(warned("motion-safe:animate-wiggle"));
    }

    #[test]
    fn tailwinds_own_and_unrelated_classes_say_nothing() {
        assert!(!warned("animate-spin"));
        assert!(!warned("my-card"));
    }
}
