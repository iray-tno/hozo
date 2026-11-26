//! The values a condition group cannot put in its StyleSheet entry --
//! viewport sizes, safe-area insets, a built-in animation, a project's own
//! keyframes -- each as an inline object or hook binding read at runtime.

use super::*;

/// The inline parts of one condition group, beside its StyleSheet entry.
pub(super) struct InlineParts {
    pub(super) viewport: Option<String>,
    pub(super) container: Option<String>,
    pub(super) parent_measured: Option<String>,
    pub(super) self_measured: Option<String>,
    pub(super) safe_area: Option<String>,
    pub(super) animation: Option<String>,
    pub(super) keyframes: Option<String>,
}

/// Which opt-in layout measurements are available for this style target.
#[derive(Clone, Copy, Default)]
pub(crate) struct MeasuredOptions {
    pub allow_self_measured: bool,
    pub allow_parent_measured: bool,
    pub parent_inset_absolute: bool,
}

/// Takes the group's inline values out of `props`, registering the hooks
/// they read, and returns what is left for the StyleSheet beside them.
#[allow(clippy::too_many_arguments)]
pub(super) fn inline_parts(
    mut props: Vec<StyleProperty>,
    condition: &Condition,
    declarations: &[StyleDeclaration],
    node: &Node,
    theme: &Theme,
    measured: MeasuredOptions,
    runtime: &mut RuntimeNeeds,
    diagnostics: &mut Vec<Diagnostic>,
) -> (Vec<StyleProperty>, InlineParts) {
    // A viewport-relative size can't live in the StyleSheet: its value
    // is a number that changes when the device rotates. It becomes an
    // inline object read from a hook instead, so it stays in the same
    // style array -- and therefore in the same last-wins order -- as the
    // static entry it sits beside.
    let viewport = take_viewport_object(&mut props);
    if viewport.is_some() {
        runtime.hooks.push(RuntimeHook::Viewport);
    }
    let container = crate::measured::take_container_object(&mut props, runtime);
    let parent_measured = if measured.allow_parent_measured {
        crate::measured::take_parent_measured_object(
            &mut props,
            declarations,
            measured.parent_inset_absolute,
            runtime,
        )
    } else {
        None
    };
    let self_measured = if measured.allow_self_measured {
        crate::measured::take_self_measured_object(&mut props, theme, runtime)
    } else {
        None
    };
    // A safe-area inset is the same kind of value: the device knows it
    // and the build does not, and it moves when the device rotates.
    let (safe_area_props, props): (Vec<_>, Vec<_>) =
        props.into_iter().partition(is_safe_area_inset);
    let safe_area = safe_area_object(&safe_area_props);
    if safe_area.is_some() {
        runtime.hooks.push(RuntimeHook::SafeArea);
    }
    let (animation_props, props): (Vec<_>, Vec<_>) = props
        .into_iter()
        .partition(|property| matches!(property, StyleProperty::Animation(_)));
    // `animate-none` asks for no hook: it turns an animation off
    // rather than being one. The last one under this condition wins, as
    // the later `animation` declaration does in CSS.
    let animation_hook = match animation_props.last() {
        Some(StyleProperty::Animation(name)) if *name != hozo_ir::Animation::None => {
            Some(RuntimeHook::Animation(*name))
        }
        _ => None,
    };
    let animation = animation_hook.as_ref().map(RuntimeHook::binding);
    if let Some(hook) = animation_hook {
        runtime.hooks.push(hook);
    }
    // A project's own `@keyframes` (decision 007, slice 3), timed by the
    // `animation-*` longhands written beside it: those under this same
    // condition, over the unconditional ones. The longhands themselves
    // never reach the style array -- they are the hook's argument.
    let (keyframe_props, props): (Vec<_>, Vec<_>) = props
        .into_iter()
        .filter(|property| !crate::keyframes::is_timing(property))
        .partition(|property| {
            matches!(
                property,
                StyleProperty::AnimationName(_) | StyleProperty::ThemeAnimation(_)
            )
        });
    let keyframes = keyframe_props.last().and_then(|property| {
        // One of the project's own Tailwind animations: the theme holds
        // both the keyframes and the timing, as `--animate-<name>`.
        if let StyleProperty::ThemeAnimation(name) = property {
            let Some(keyframes) = theme.animation(name).and_then(|animation| animation.keyframes.as_ref())
            else {
                diagnostics.push(unwired_variant(
                    node,
                    &format!(
                        "`animate-{name}` names an animation the project's Tailwind theme does not define \
                         with `--animate-{name}` and its `@keyframes`, so there is nothing to run here. \
                         On Web the class reaches the page, where the project's own CSS can still run it."
                    ),
                    Severity::Warning,
                ));
                return None;
            };
            let unread = theme.animation(name).map(|animation| animation.unread.as_slice()).unwrap_or_default();
            if !unread.is_empty() {
                diagnostics.push(unwired_variant(
                    node,
                    &format!(
                        "`animate-{name}`: {} in its `@keyframes` could not be read on React Native, so \
                         the frames run without {}. On Web the keyframes apply as written.",
                        unread.iter().map(|declaration| format!("`{declaration}`")).collect::<Vec<_>>().join(", "),
                        if unread.len() == 1 { "it" } else { "them" },
                    ),
                    Severity::Warning,
                ));
            }
            let shorthand = theme.animation(name).map(|animation| animation.shorthand.as_str()).unwrap_or_default();
            let timing = crate::keyframes::shorthand_timing(shorthand);
            let timing: Vec<&StyleProperty> = timing.iter().collect();
            let spec = crate::keyframes::spec(keyframes, &timing, theme, node, diagnostics);
            let hook = runtime.keyframes_hook(spec);
            let binding = hook.binding();
            runtime.hooks.push(hook);
            return Some(binding);
        }
        let StyleProperty::AnimationName(keyframes) = property else { return None };
        let timing: Vec<&StyleProperty> = declarations
            .iter()
            .filter(|declaration| declaration.condition == Condition::Always)
            .chain(declarations.iter().filter(|declaration| {
                *condition != Condition::Always && declaration.condition == *condition
            }))
            .map(|declaration| &declaration.property)
            .filter(|property| crate::keyframes::is_timing(property))
            .collect();
        let spec = crate::keyframes::spec(keyframes, &timing, theme, node, diagnostics);
        let hook = runtime.keyframes_hook(spec);
        let binding = hook.binding();
        runtime.hooks.push(hook);
        Some(binding)
    });
    (
        props,
        InlineParts {
            viewport,
            container,
            parent_measured,
            self_measured,
            safe_area,
            animation,
            keyframes,
        },
    )
}
