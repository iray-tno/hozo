//! Adapt styles only where a real pattern host can implement their meaning.
//! An ordinary View does not become scrollable or viewport-fixed by dropping
//! a diagnostic. The catalogue identifies each consuming property's owner.

use hozo_ir::{Condition, Position, Primitive, StyleDeclaration, StyleProperty};

pub(super) struct BackdropBlurCandidate {
    original: StyleDeclaration,
    condition: Condition,
    /// `Some(expr)` for `blur(...)`, `None` for `backdrop-blur-none`.
    radius: Option<String>,
    uses_viewport: bool,
}

pub(super) struct Layout {
    pub style: Vec<StyleDeclaration>,
    pub scroll_prop: Option<&'static str>,
    pub backdrop: Vec<StyleDeclaration>,
    /// Candidate `backdrop:backdrop-blur-*` declarations resolved after `adapt`
    /// once the element's condition target and runtime hooks are available.
    pub backdrop_blur_candidates: Vec<BackdropBlurCandidate>,
}

pub(super) fn applies(primitive: Primitive, slot: &str) -> bool {
    crate::pattern::scroll_y_prop(primitive, slot).is_some()
        || (matches!(primitive, Primitive::Dialog | Primitive::CommandPalette)
            && slot == "className")
}

pub(super) fn adapt(
    primitive: Primitive,
    slot: &str,
    declarations: Vec<StyleDeclaration>,
) -> Layout {
    if !applies(primitive, slot) {
        return Layout {
            style: declarations,
            scroll_prop: None,
            backdrop: Vec::new(),
            backdrop_blur_candidates: Vec::new(),
        };
    }
    let mut out = Layout {
        style: Vec::new(),
        scroll_prop: None,
        backdrop: Vec::new(),
        backdrop_blur_candidates: Vec::new(),
    };
    for declaration in declarations {
        if declaration.condition == Condition::Always {
            if matches!(
                declaration.property,
                StyleProperty::OverflowY(
                    hozo_ir::Overflow::Css("auto") | hozo_ir::Overflow::Scroll
                )
            ) {
                if let Some(prop) = crate::pattern::scroll_y_prop(primitive, slot) {
                    out.scroll_prop = Some(prop);
                    continue;
                }
            }
            // The palette root is inside a full-window RN Modal. Only here
            // does absolute positioning have the same containing block.
            if primitive == Primitive::CommandPalette
                && slot == "className"
                && matches!(
                    declaration.property,
                    StyleProperty::Position(Position::Css("fixed"))
                )
            {
                out.style.push(StyleDeclaration {
                    property: StyleProperty::Position(Position::Absolute),
                    ..declaration
                });
                continue;
            }
        }
        // Every `backdrop:` declaration goes to the scrim, which is a real
        // View: its padding and the rest mean what they mean on any box. Only
        // `background-color` went before, so `backdrop:px-4` stayed on the
        // panel, was reported as not wired, and wrote a StyleSheet entry under
        // the scrim's own key, overwriting it (#1311). A backdrop filter is not
        // a style the scrim can take: blur radii (unconditional or guarded by
        // Native-wired conditions) are handed over as `hozoBackdropBlur` for
        // the Dialog to draw through the backdrop-filter adapter (#1310); any
        // other filter function or unwired condition stays behind and is refused.
        if crate::pattern::backdrop_style_prop(primitive, slot).is_some() {
            if let Some(condition) = backdrop_condition(&declaration.condition) {
                match &declaration.property {
                    StyleProperty::BackdropFilter(hozo_ir::FilterFunction::Blur, value)
                        if value.is_empty() =>
                    {
                        out.backdrop_blur_candidates.push(BackdropBlurCandidate {
                            original: declaration,
                            condition,
                            radius: None,
                            uses_viewport: false,
                        });
                        continue;
                    }
                    StyleProperty::BackdropFilter(hozo_ir::FilterFunction::Blur, value) => {
                        if let Some(inner) = value
                            .strip_prefix("blur(")
                            .and_then(|rest| rest.strip_suffix(')'))
                        {
                            if let Some(px) =
                                hozo_ir::resolve_native_length_px(inner).filter(|px| *px >= 0.0)
                            {
                                out.backdrop_blur_candidates.push(BackdropBlurCandidate {
                                    original: declaration,
                                    condition,
                                    radius: Some(px.to_string()),
                                    uses_viewport: false,
                                });
                                continue;
                            }
                            if let Some(expr) = crate::layout::viewport_length_str(inner, true) {
                                out.backdrop_blur_candidates.push(BackdropBlurCandidate {
                                    original: declaration,
                                    condition,
                                    radius: Some(expr),
                                    uses_viewport: true,
                                });
                                continue;
                            }
                        }
                    }
                    StyleProperty::BackdropFilter(hozo_ir::FilterFunction::None, _) => {
                        out.backdrop_blur_candidates.push(BackdropBlurCandidate {
                            original: declaration,
                            condition,
                            radius: None,
                            uses_viewport: false,
                        });
                        continue;
                    }
                    _ => {}
                }
            }
        }
        if crate::pattern::backdrop_style_prop(primitive, slot).is_some()
            && !matches!(declaration.property, StyleProperty::BackdropFilter(..))
        {
            if let Some(condition) = backdrop_condition(&declaration.condition) {
                out.backdrop.push(StyleDeclaration {
                    condition,
                    ..declaration
                });
                continue;
            }
        }
        out.style.push(declaration);
    }
    out
}

/// Resolves `backdrop:backdrop-blur-*` / `backdrop:backdrop-blur-none` into a
/// single `hozoBackdropBlur` JS expression (preserving last-wins cascade order
/// across conditions). Any candidate whose condition cannot be evaluated on
/// Native is pushed back onto `layout.style` so refusal diagnostics still fire.
pub(super) fn resolve_backdrop_blur(
    layout: &mut Layout,
    target: &crate::conditions::StyleTarget<'_>,
    source: &str,
    runtime: &mut crate::context::RuntimeNeeds,
) -> Option<String> {
    let candidates = std::mem::take(&mut layout.backdrop_blur_candidates);
    if candidates.is_empty() {
        return None;
    }
    let mut base: Option<(Option<String>, bool)> = None;
    let mut conditional: Vec<(String, String, bool)> = Vec::new();
    let mut scratch = crate::context::RuntimeNeeds::default();

    for candidate in candidates {
        match crate::conditions::resolve_condition_guard(
            &candidate.condition,
            target,
            source,
            &mut scratch,
            false,
        ) {
            Ok(crate::conditions::ResolvedCondition::Always) => {
                base = Some((candidate.radius, candidate.uses_viewport));
            }
            Ok(crate::conditions::ResolvedCondition::Never) => {}
            Ok(crate::conditions::ResolvedCondition::Guarded { expr, .. }) => {
                let value = candidate.radius.unwrap_or_else(|| "undefined".to_string());
                conditional.push((expr, value, candidate.uses_viewport));
            }
            Err(_) => {
                layout.style.push(candidate.original);
            }
        }
    }

    let (base_radius, base_vp) = match base {
        Some((radius, vp)) => (radius, vp),
        None => (None, false),
    };
    if base_radius.is_none() && conditional.is_empty() {
        return None;
    }
    runtime.hooks.extend(scratch.hooks);
    if base_vp || conditional.iter().any(|(_, _, vp)| *vp) {
        runtime.hooks.push(crate::conditions::RuntimeHook::Viewport);
    }
    let mut acc = base_radius.unwrap_or_else(|| "undefined".to_string());
    for (guard, value, _) in conditional {
        acc = format!("{guard} ? {value} : {acc}");
    }
    Some(acc)
}

fn backdrop_condition(condition: &Condition) -> Option<Condition> {
    match condition {
        Condition::PseudoElement(hozo_ir::PseudoElement::Backdrop) => Some(Condition::Always),
        Condition::All(conditions)
            if conditions.contains(&Condition::PseudoElement(hozo_ir::PseudoElement::Backdrop)) =>
        {
            Some(Condition::all(
                conditions
                    .iter()
                    .filter(|condition| {
                        !matches!(
                            condition,
                            Condition::PseudoElement(hozo_ir::PseudoElement::Backdrop)
                        )
                    })
                    .cloned()
                    .collect(),
            ))
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use hozo_ir::{Severity, Theme};

    fn compile(source: &str) -> crate::LowerOutput {
        let parsed = hozo_parser::parse_tsx(source);
        crate::lower(&parsed.roots[0].node, source, &Theme::default())
    }

    #[test]
    fn a_calc_of_viewport_and_fixed_lengths_is_a_runtime_value_too() {
        // #1312: the Dialog gutter, `calc(100vw - 2rem)`, needs no
        // measurement -- only the window `w-[50vw]` already reads.
        let out = compile(
            r#"import { View } from '@hozo/core'; function C() { return <View className="w-[calc(100vw-2rem)] max-h-[calc(100vh-4rem)] min-w-[calc(150vw+1px)]" /> }"#,
        );
        assert!(
            !out.diagnostics
                .iter()
                .any(|d| d.severity == Severity::Error),
            "{:?}",
            out.diagnostics
        );
        for expression in [
            "width: __hozoViewport.width - 32",
            "maxHeight: __hozoViewport.height - 64",
            "minWidth: __hozoViewport.width * 1.5 + 1",
        ] {
            assert!(out.jsx.contains(expression), "{}", out.jsx);
        }
        // A percentage needs the parent's size, which nothing here has.
        let out = compile(
            r#"import { View } from '@hozo/core'; function C() { return <View className="w-[calc(100%-2rem)]" /> }"#,
        );
        assert!(
            out.diagnostics
                .iter()
                .any(|d| d.code == hozo_ir::DiagnosticCode::WebOnlyPropertyOnNative),
            "{:?}",
            out.diagnostics
        );
        assert!(!out.jsx.contains("__hozoViewport"), "{}", out.jsx);
    }

    #[test]
    fn viewport_units_are_runtime_values_not_zeroes_in_a_sheet() {
        let out = compile(
            r#"import { View } from '@hozo/core'; function C() { return <View className="max-h-[85vh] w-[50vw] pt-[12vh]" /> }"#,
        );
        assert!(
            !out.diagnostics
                .iter()
                .any(|d| d.severity == Severity::Error),
            "{:?}",
            out.diagnostics
        );
        for expression in [
            "maxHeight: __hozoViewport.height * 0.85",
            "width: __hozoViewport.width * 0.5",
            "paddingTop: __hozoViewport.height * 0.12",
        ] {
            assert!(out.jsx.contains(expression), "{}", out.jsx);
        }
        assert_eq!(
            out.prelude
                .iter()
                .filter(|line| line.contains("useHozoViewport()"))
                .count(),
            1
        );
    }

    #[test]
    fn viewport_units_lower_across_all_numeric_native_length_properties() {
        // Scalar length families: flex-basis, border-radius, border-width, outline, typography.
        let scalar = compile(
            r#"import { View, Text } from '@hozo/core'; function C() { return <View className="basis-[50vw] rounded-[10vh] rounded-tl-[2vw] border-[1vh] outline-[1vh] outline-offset-[-1vh]"><Text className="text-[5vw] leading-[6vh] tracking-[-0.5vw]">hi</Text></View> }"#,
        );
        assert!(scalar.diagnostics.is_empty(), "{:?}", scalar.diagnostics);
        for snippet in [
            "flexBasis: __hozoViewport.width * 0.5",
            "borderRadius: __hozoViewport.height * 0.1",
            "borderTopLeftRadius: __hozoViewport.width * 0.02",
            "borderTopWidth: __hozoViewport.height * 0.01",
            "outlineWidth: __hozoViewport.height * 0.01",
            "outlineOffset: __hozoViewport.height * -0.01",
            "fontSize: __hozoViewport.width * 0.05",
            "lineHeight: __hozoViewport.height * 0.06",
            "letterSpacing: __hozoViewport.width * -0.005",
        ] {
            assert!(
                scalar.jsx.contains(snippet),
                "missing `{snippet}` in {}",
                scalar.jsx
            );
        }

        // Transforms compose viewport translate with sibling static transforms.
        let transform = compile(
            r#"import { View } from '@hozo/core'; function C() { return <View className="rotate-45 translate-y-[calc(100vh-4rem)]" /> }"#,
        );
        assert!(
            transform.diagnostics.is_empty(),
            "{:?}",
            transform.diagnostics
        );
        assert!(
            transform.jsx.contains(
                "transform: [{ translateY: __hozoViewport.height - 64 }, { rotate: '45deg' }]"
            ),
            "{}",
            transform.jsx
        );

        // Child spacing & dividers.
        let spaced = compile(
            r#"import { View } from '@hozo/core'; function C() { return <View className="space-y-[5vh] divide-y-[1vh]"><View /><View /></View> }"#,
        );
        assert!(spaced.diagnostics.is_empty(), "{:?}", spaced.diagnostics);
        assert!(spaced.jsx.contains("<HozoSpaced "), "{}", spaced.jsx);
        assert!(
            spaced
                .jsx
                .contains("marginBottom: __hozoViewport.height * 0.05"),
            "{}",
            spaced.jsx
        );
        assert!(
            spaced
                .jsx
                .contains("borderBottomWidth: __hozoViewport.height * 0.01"),
            "{}",
            spaced.jsx
        );

        // Rings & backdrop blur & grid tracks.
        let ring = compile(
            r#"import { View } from '@hozo/core'; function C() { return <View className="ring-[1vh] ring-red-500" /> }"#,
        );
        assert!(ring.diagnostics.is_empty(), "{:?}", ring.diagnostics);
        assert!(
            ring.jsx
                .contains("boxShadow: `0 0 0 ${__hozoViewport.height * 0.01}px"),
            "{}",
            ring.jsx
        );

        let blur = compile(
            r#"import { View } from '@hozo/core'; function C() { return <View className="backdrop-blur-[2vh]" /> }"#,
        );
        assert!(blur.diagnostics.is_empty(), "{:?}", blur.diagnostics);
        assert!(
            blur.jsx
                .contains("hozoBlurRadius={__hozoViewport.height * 0.02}"),
            "{}",
            blur.jsx
        );

        let grid = compile(
            r#"import { View } from '@hozo/core'; function C() { return <View className="grid grid-cols-[25vw_1fr] grid-rows-[50vh]"><View /></View> }"#,
        );
        assert!(grid.diagnostics.is_empty(), "{:?}", grid.diagnostics);
        assert!(
            grid.jsx
                .contains("{ kind: 'points', value: __hozoViewport.width * 0.25 }"),
            "{}",
            grid.jsx
        );
        assert!(
            grid.jsx
                .contains("{ kind: 'points', value: __hozoViewport.height * 0.5 }"),
            "{}",
            grid.jsx
        );

        // Negative viewport literals on non-negative properties remain refused.
        for bad in [
            "rounded-[-10vh]",
            "border-[-1vh]",
            "text-[-5vw]",
            "divide-y-[-1vh]",
            "ring-[-1vh]",
            "backdrop-blur-[-2vh]",
        ] {
            let out = compile(&format!(
                "import {{ View }} from '@hozo/core'; function C() {{ return <View className=\"{bad}\" /> }}"
            ));
            assert!(
                out.diagnostics
                    .iter()
                    .any(|d| d.severity == Severity::Error),
                "{bad} should be refused: {:?}",
                out.diagnostics
            );
        }
    }

    #[test]
    fn vertical_overflow_reaches_only_catalogued_scroll_hosts() {
        for (tag, slot, prop) in [
            ("Dialog", "className", "hozoScrollY"),
            ("Listbox", "className", "hozoScrollY"),
            ("Combobox", "listClassName", "hozoListScrollY"),
            ("CommandPalette", "listClassName", "hozoListScrollY"),
        ] {
            let out = compile(&format!("import {{ {tag} }} from '@hozo/core'; function C() {{ return <{tag} {slot}=\"overflow-y-auto max-h-60 p-2 gap-1\" /> }}"));
            assert!(
                !out.diagnostics
                    .iter()
                    .any(|d| d.severity == Severity::Error),
                "{tag}: {:?}",
                out.diagnostics
            );
            assert!(out.jsx.contains(&format!("{prop}={{true}}")), "{}", out.jsx);
            assert!(!out.styles.contains("overflow"), "{}", out.styles);
            assert!(out.styles.contains("maxHeight: 240"), "{}", out.styles);
        }
        for (tag, slot, classes) in [
            ("View", "className", "overflow-y-auto"),
            ("Combobox", "optionClassName", "overflow-y-auto"),
            ("CommandPalette", "panelClassName", "fixed"),
            ("Dialog", "className", "fixed"),
            ("Listbox", "className", "md:overflow-y-auto"),
        ] {
            let out = compile(&format!("import {{ {tag} }} from '@hozo/core'; function C() {{ return <{tag} {slot}=\"{classes}\" /> }}"));
            assert!(
                out.diagnostics
                    .iter()
                    .any(|d| d.severity == Severity::Error),
                "{tag}.{slot}={classes}: {:?}",
                out.diagnostics
            );
        }
    }

    #[test]
    fn fixed_palette_and_dialog_backdrop_have_real_native_containing_blocks() {
        let out = compile(
            r#"import { CommandPalette } from '@hozo/core'; function C() { return <CommandPalette className="fixed inset-0 pt-[12vh]" /> }"#,
        );
        assert!(
            !out.diagnostics
                .iter()
                .any(|d| d.severity == Severity::Error),
            "{:?}",
            out.diagnostics
        );
        assert!(
            out.styles.contains("position: 'absolute'"),
            "{}",
            out.styles
        );
        let out = compile(
            r#"import { Dialog } from '@hozo/core'; function C() { return <Dialog className="bg-white backdrop:bg-black/50 dark:backdrop:bg-red-500/50" open onClose={close} accessibilityLabel="Test" /> }"#,
        );
        assert!(
            !out.diagnostics
                .iter()
                .any(|d| d.severity == Severity::Error),
            "{:?}",
            out.diagnostics
        );
        assert!(out.jsx.contains("hozoBackdropStyle="), "{}", out.jsx);
        assert!(out.jsx.contains("__hozoDark &&"), "{}", out.jsx);
        assert!(
            !out.jsx
                .split("style=")
                .last()
                .unwrap()
                .contains("_backdrop"),
            "{}",
            out.jsx
        );
    }
}

#[cfg(test)]
mod backdrop_keys {
    use hozo_ir::Theme;

    #[test]
    fn every_backdrop_class_reaches_the_scrim_under_one_key() {
        let source = r#"import { Dialog } from '@hozo/core'; function C() { return <Dialog className="bg-white backdrop:bg-black/50 backdrop:px-4" open onClose={close} accessibilityLabel="Test" /> }"#;
        let parsed = hozo_parser::parse_tsx(source);
        let out = crate::lower(&parsed.roots[0].node, source, &Theme::default());
        // Two entries under one key: the object literal keeps the last one,
        // and the scrim lost its padding (#1311).
        let keys: Vec<&str> = out
            .styles
            .lines()
            .map(str::trim)
            .filter(|line| line.ends_with(": {"))
            .collect();
        let mut unique = keys.clone();
        unique.sort_unstable();
        unique.dedup();
        assert_eq!(
            keys.len(),
            unique.len(),
            "duplicate StyleSheet keys: {keys:?}"
        );
        let scrim = out
            .styles
            .split("hozo0_backdrop: {")
            .nth(1)
            .and_then(|rest| rest.split('}').next())
            .unwrap_or_default();
        assert!(scrim.contains("paddingStart: 16"), "{}", out.styles);
        assert!(scrim.contains("backgroundColor"), "{}", out.styles);
        assert!(
            out.jsx
                .contains("hozoBackdropStyle={[hozoStyles.hozo0_backdrop]}"),
            "{}",
            out.jsx
        );
        assert!(
            !out.diagnostics
                .iter()
                .any(|d| d.message.contains("styles a pseudo-element")),
            "an applied backdrop: class is not reported as unwired: {:?}",
            out.diagnostics
        );
    }

    #[test]
    fn a_backdrop_blur_reaches_the_dialog_as_a_radius() {
        // #1310: the scrim takes styles, a blur needs the adapter component,
        // so the radius travels as its own prop and the Dialog draws it.
        let source = r#"import { Dialog } from '@hozo/core'; function C() { return <Dialog className="backdrop:bg-black/50 backdrop:backdrop-blur-xs" open onClose={close} accessibilityLabel="Test" /> }"#;
        let parsed = hozo_parser::parse_tsx(source);
        let out = crate::lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(out.jsx.contains("hozoBackdropBlur={4}"), "{}", out.jsx);
        assert!(out.jsx.contains("hozoBackdropStyle="), "{}", out.jsx);
        assert!(
            !out.diagnostics
                .iter()
                .any(|d| d.severity == hozo_ir::Severity::Error),
            "{:?}",
            out.diagnostics
        );
        // On an ordinary View it is still not a scrim, and still refused.
        let source = r#"import { View } from '@hozo/core'; function C() { return <View className="backdrop:backdrop-blur-xs" /> }"#;
        let parsed = hozo_parser::parse_tsx(source);
        let out = crate::lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(!out.jsx.contains("hozoBackdropBlur"), "{}", out.jsx);
        assert!(!out.diagnostics.is_empty());
    }

    #[test]
    fn conditional_and_arbitrary_backdrop_blur_lower_to_guarded_radius() {
        let source = r#"import { Dialog } from '@hozo/core'; function C() { return <Dialog className="backdrop:backdrop-blur-[2rem] dark:backdrop:backdrop-blur-md motion-reduce:backdrop:backdrop-blur-none" open onClose={close} accessibilityLabel="Test" /> }"#;
        let parsed = hozo_parser::parse_tsx(source);
        let out = crate::lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(out.diagnostics.is_empty(), "{:?}", out.diagnostics);
        assert!(
            out.jsx.contains(
                "hozoBackdropBlur={__hozoEnv_motion_reduce ? undefined : __hozoDark ? 12 : 32}"
            ),
            "{}",
            out.jsx
        );

        // Unwired interaction condition on Dialog backdrop blur still diagnoses.
        let bad = r#"import { Dialog } from '@hozo/core'; function C() { return <Dialog className="hover:backdrop:backdrop-blur-md" open onClose={close} accessibilityLabel="Test" /> }"#;
        let parsed = hozo_parser::parse_tsx(bad);
        let out = crate::lower(&parsed.roots[0].node, bad, &Theme::default());
        assert!(!out.jsx.contains("hozoBackdropBlur"), "{}", out.jsx);
        assert!(!out.diagnostics.is_empty());
    }
}
