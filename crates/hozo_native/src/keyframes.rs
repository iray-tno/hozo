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
    crate::transition::interpolatable(property)
        || matches!(property, StyleProperty::Transform(functions)
            if functions.iter().all(|function| !matches!(function, hozo_ir::TransformFunction::Perspective(_))))
}

/// The `animation` shorthand's parts as the longhands `spec` reads.
///
/// CSS assigns them by shape rather than position: the first time is the
/// duration and the second the delay, a number or `infinite` is the
/// iteration count, and the keywords say which longhand they belong to.
/// Whatever is left is the name, which the theme already resolved.
pub(super) fn shorthand_timing(shorthand: &str) -> Vec<StyleProperty> {
    let mut parts: Vec<String> = Vec::new();
    let mut depth = 0usize;
    let mut current = String::new();
    for character in shorthand.chars() {
        match character {
            '(' => depth += 1,
            ')' => depth = depth.saturating_sub(1),
            _ => {}
        }
        if character.is_whitespace() && depth == 0 {
            if !current.is_empty() {
                parts.push(std::mem::take(&mut current));
            }
        } else {
            current.push(character);
        }
    }
    if !current.is_empty() {
        parts.push(current);
    }

    let longhand = |name: &str, value: &str| StyleProperty::WebOnly(name.to_string(), value.to_string());
    let mut out = Vec::new();
    let mut times = 0;
    for part in parts {
        let part = part.as_str();
        if milliseconds(part).is_some() {
            out.push(longhand(if times == 0 { "animation-duration" } else { "animation-delay" }, part));
            times += 1;
        } else if part == "infinite" || part.parse::<f64>().is_ok() {
            out.push(longhand("animation-iteration-count", part));
        } else if matches!(part, "linear" | "ease" | "ease-in" | "ease-out" | "ease-in-out" | "step-start" | "step-end")
            || part.starts_with("cubic-bezier(")
            || part.starts_with("steps(")
        {
            out.push(longhand("animation-timing-function", part));
        } else if matches!(part, "normal" | "reverse" | "alternate" | "alternate-reverse") {
            out.push(longhand("animation-direction", part));
        } else if matches!(part, "none" | "forwards" | "backwards" | "both") {
            out.push(longhand("animation-fill-mode", part));
        }
    }
    out
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
    use crate::{lower, LowerOutput, Theme};
    use std::collections::HashMap;

    fn theme() -> Theme {
        let frames = vec![
            hozo_ir::Keyframe {
                selector: "0%, 100%".to_string(),
                properties: hozo_parser::css_declaration("transform", "rotate(-3deg)").unwrap(),
            },
            hozo_ir::Keyframe {
                selector: "50%".to_string(),
                properties: hozo_parser::css_declaration("opacity", ".5").unwrap(),
            },
        ];
        let mut animations = HashMap::new();
        animations.insert(
            "wiggle".to_string(),
            hozo_ir::ThemeAnimation {
                shorthand: "wiggle 1s ease-in-out infinite".to_string(),
                keyframes_css: None,
                keyframes: Some(hozo_ir::Keyframes { name: "wiggle".to_string(), frames }),
            },
        );
        Theme::default().with_animations(animations)
    }

    fn compile(class_name: &str, theme: &Theme) -> LowerOutput {
        let source = format!(
            "import {{ View }} from '@hozo/core'\nconst el = <View className=\"{class_name}\" />\n"
        );
        let parsed = hozo_parser::parse_tsx(&source);
        lower(&parsed.roots[0].node, &source, theme)
    }

    fn warned(out: &LowerOutput) -> bool {
        out.diagnostics.iter().any(|d| {
            d.message.contains("does not define") && d.severity == hozo_ir::Severity::Warning
        })
    }

    #[test]
    fn a_theme_animation_runs_through_the_keyframes_hook() {
        let out = compile("animate-wiggle", &theme());
        assert!(out.jsx.starts_with("<Animated.View"), "{}", out.jsx);
        let spec = out.prelude.iter().find(|line| line.contains("useHozoKeyframes(")).expect("hook");
        for expected in [
            "{ at: 0, style: { transform: [{ rotate: '-3deg' }] } }",
            "{ at: 0.5, style: { opacity: 0.5 } }",
            "duration: 1000",
            "easing: 'ease-in-out'",
            "iterations: -1",
        ] {
            assert!(spec.contains(expected), "missing {expected}: {spec}");
        }
        assert!(out.diagnostics.is_empty(), "{:?}", out.diagnostics);
    }

    #[test]
    fn under_motion_safe_it_is_guarded_by_the_preference() {
        let out = compile("motion-safe:animate-wiggle", &theme());
        assert!(out.jsx.contains("__hozoEnv_motion_safe && __hozoKeyframes_0"), "{}", out.jsx);
    }

    #[test]
    fn a_name_the_theme_lacks_is_named_rather_than_silently_gone() {
        // It compiled to nothing at all on this platform before #748.
        let out = compile("animate-wiggle", &Theme::default());
        assert!(warned(&out), "{:?}", out.diagnostics);
        assert!(!out.jsx.starts_with("<Animated"), "{}", out.jsx);
        assert!(warned(&compile("motion-safe:animate-unknown", &theme())));
    }

    #[test]
    fn tailwinds_own_and_unrelated_classes_say_nothing() {
        assert!(!warned(&compile("animate-spin", &Theme::default())));
        assert!(!warned(&compile("my-card", &Theme::default())));
    }

    #[test]
    fn the_shorthand_is_read_by_shape() {
        let timing = super::shorthand_timing("wiggle .3s cubic-bezier(0.4, 0, 0.2, 1) 0.1s 2 alternate both");
        let pairs: Vec<(String, String)> = timing
            .into_iter()
            .filter_map(|property| match property {
                hozo_ir::StyleProperty::WebOnly(name, value) => Some((name, value)),
                _ => None,
            })
            .collect();
        assert_eq!(
            pairs,
            [
                ("animation-duration", ".3s"),
                ("animation-timing-function", "cubic-bezier(0.4, 0, 0.2, 1)"),
                ("animation-delay", "0.1s"),
                ("animation-iteration-count", "2"),
                ("animation-direction", "alternate"),
                ("animation-fill-mode", "both"),
            ]
            .map(|(name, value)| (name.to_string(), value.to_string()))
        );
    }
}
