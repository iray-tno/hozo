use super::*;

#[test]
fn only_disabling_user_resize_is_already_true_on_native() {
    for primitive in ["View", "TextInput"] {
        for utility in ["resize-none", "resize", "resize-x", "resize-y"] {
            let source = format!(
                "import {{ {primitive} }} from '@hozo/core'; export function C() {{ return <{primitive} accessibilityLabel=\"Field\" className=\"{utility}\"/> }}"
            );
            let parsed = hozo_parser::parse_tsx(&source);
            let out = lower(&parsed.roots[0].node, &source, &Theme::default());
            if utility == "resize-none" {
                assert!(out.diagnostics.is_empty(), "{:?}", out.diagnostics);
                assert!(!out.styles.contains("resize"), "{}", out.styles);
                assert!(out.runtime_imports.is_empty());
            } else {
                assert!(
                    out.diagnostics.iter().any(|d| {
                        d.code == DiagnosticCode::WebOnlyPropertyOnNative
                            && d.message.contains("resize")
                    }),
                    "{utility}: {:?}",
                    out.diagnostics
                );
            }
        }
    }
    // A reset must not hide an earlier request for a missing handle.
    let source = "import {TextInput} from '@hozo/core'; const e = <TextInput accessibilityLabel=\"Field\" className=\"resize-y resize-none\"/>";
    let parsed = hozo_parser::parse_tsx(source);
    let out = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(out
        .diagnostics
        .iter()
        .any(|d| d.code == DiagnosticCode::WebOnlyPropertyOnNative));
}

const LOGIN_EXAMPLE: &str = r#"
import { View, Text, Button } from '@hozo/core'

export function Login() {
  return (
    <View className="flex-1 items-center justify-center p-6">
      <Text className="text-xl font-bold">
        Welcome
      </Text>

      <Button className="mt-4 px-4 py-2">
        Continue
      </Button>
    </View>
  )
}
"#;

#[test]
fn lowers_the_login_example_to_rn_jsx_and_styles() {
    let parsed = hozo_parser::parse_tsx(LOGIN_EXAMPLE);
    let root = &parsed.roots[0].node;
    let output = lower(root, LOGIN_EXAMPLE, &Theme::default());

    assert!(output.jsx.starts_with("<View style={hozoStyles.hozo0}>"));
    assert!(output
        .jsx
        .contains("<Text style={hozoStyles.hozo1}>Welcome</Text>"));
    // The label is wrapped: React Native crashes on a raw string inside
    // a Pressable, even though the same source is fine on Web.
    assert!(output.jsx.contains(
            r#"<Pressable style={hozoStyles.hozo2} accessibilityRole="button"><Text>Continue</Text></Pressable>"#
        ));

    assert!(output.styles.contains("hozo0: {"));
    assert!(output.styles.contains("flex: 1,"));
    assert!(output.styles.contains("paddingTop: 24,"));
    assert!(output.styles.contains("hozo1: {"));
    assert!(output.styles.contains("fontSize: 20,"));
    assert!(output.styles.contains("fontWeight: '700',"));
    assert!(output.styles.contains("hozo2: {"));
    // `px-4` is Tailwind's logical inline axis, so this lowers to RN's
    // direction-relative props rather than paddingLeft/paddingRight.
    assert!(output.styles.contains("paddingStart: 16,"));
    assert!(output.styles.contains("paddingEnd: 16,"));
    // No `px`/CSS units anywhere -- these are unitless RN numbers.
    assert!(!output.styles.contains("px"));

    assert!(output.diagnostics.is_empty());
}

#[test]
fn transforms_compose_into_rn_single_transform_array() {
    // RN has no standalone rotate/scale/translate, so several IR
    // properties collapse into one entry -- ordered translate, rotate,
    // scale to match how CSS applies its standalone equivalents.
    let source = r#"
            import { View } from '@hozo/core'
            const el = <View className="scale-95 rotate-45 translate-x-2" />
            "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output
        .styles
        .contains("transform: [{ translateX: 8 }, { rotate: '45deg' }, { scale: 0.95 }],"));
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);

    let explicit_z = r#"
            import { View } from '@hozo/core'
            const el = <View className="scale-z-95" />
            "#;
    let parsed = hozo_parser::parse_tsx(explicit_z);
    let output = lower(&parsed.roots[0].node, explicit_z, &Theme::default());
    assert!(output
        .styles
        .contains("transform: [{ matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0.95, 0, 0, 0, 0, 1] }],"));
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);

    let all_axes = r#"
            import { View } from '@hozo/core'
            const el = <View className="scale-x-50 scale-y-75 scale-z-95" />
            "#;
    let parsed = hozo_parser::parse_tsx(all_axes);
    let output = lower(&parsed.roots[0].node, all_axes, &Theme::default());
    assert!(output.styles.contains(
            "transform: [{ scaleX: 0.5 }, { scaleY: 0.75 }, { matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0.95, 0, 0, 0, 0, 1] }],"
        ));
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
}

#[test]
fn transform_resets_preserve_other_css_transform_properties() {
    for (classes, expected) in [
        (
            "translate-x-2 rotate-45 scale-95 rotate-none",
            "[{ translateX: 8 }, { scale: 0.95 }]",
        ),
        (
            "translate-x-2 rotate-45 scale-95 scale-none",
            "[{ translateX: 8 }, { rotate: '45deg' }]",
        ),
        (
            "translate-x-2 rotate-45 scale-95 translate-none",
            "[{ rotate: '45deg' }, { scale: 0.95 }]",
        ),
        (
            "translate-x-2 rotate-45 scale-95 rotate-x-30 transform-none",
            "[{ translateX: 8 }, { rotate: '45deg' }, { scale: 0.95 }]",
        ),
        ("rotate-none rotate-45", "[{ rotate: '45deg' }]"),
        (
            "translate-y-3 translate-none translate-x-2",
            "[{ translateX: 8 }, { translateY: 12 }]",
        ),
        (
            "scale-y-75 scale-none scale-x-50",
            "[{ scaleX: 0.5 }, { scaleY: 0.75 }]",
        ),
        (
            "rotate-x-30 transform-none transform-cpu",
            "[{ rotateX: '30deg' }]",
        ),
        (
            "rotate-x-30 transform-none skew-x-3",
            "[{ rotateX: '30deg' }, { skewX: '3deg' }]",
        ),
        ("rotate-none scale-none translate-none transform-none", "[]"),
        ("transform", "[]"),
    ] {
        let source = format!(
            "import {{ View }} from '@hozo/core'; const e = <View className=\"{classes}\" />"
        );
        let parsed = hozo_parser::parse_tsx(&source);
        let output = lower(&parsed.roots[0].node, &source, &Theme::default());
        assert!(
            output.diagnostics.is_empty(),
            "{classes}: {:?}",
            output.diagnostics
        );
        assert!(
            output.styles.contains(&format!("transform: {expected},")),
            "{classes}: {}",
            output.styles
        );
        assert!(
            !output.runtime_imports.contains(&"hozoTransformStyles"),
            "static resets need no runtime"
        );
    }
}

#[test]
fn conditional_transform_resets_carry_slots_and_use_existing_guards() {
    let source = "import { Pressable } from '@hozo/core'; function C() { return <Pressable accessibilityRole=\"button\" className=\"translate-x-2 rotate-45 scale-95 md:rotate-none hover:scale-none pressed:translate-none\" /> }";
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(output.runtime_imports.contains(&"hozoTransformStyles"));
    assert!(
        output.jsx.contains("hozoTransformStyles(["),
        "{}",
        output.jsx
    );
    for expected in [
        "__hozoBp_md &&",
        "hovered &&",
        "pressed &&",
        "rotate: []",
        "scale: 'none'",
        "translate: 'none'",
    ] {
        assert!(output.jsx.contains(expected), "{expected}: {}", output.jsx);
    }
    assert_eq!(
        output.prelude.len(),
        1,
        "only the existing breakpoint hook is needed"
    );
}

#[test]
fn transform_gpu_and_reset_animation_frames_remain_explicitly_diagnostic() {
    for classes in ["transform-gpu", "transition rotate-45 starting:rotate-none"] {
        let source = format!("import {{ View }} from '@hozo/core'; function C() {{ return <View className=\"{classes}\" /> }}");
        let parsed = hozo_parser::parse_tsx(&source);
        let output = lower(&parsed.roots[0].node, &source, &Theme::default());
        assert!(
            output
                .diagnostics
                .iter()
                .any(|d| d.severity == Severity::Error),
            "{classes}: {:?}",
            output.diagnostics
        );
    }
}

#[test]
fn shadow_and_filter_carry_across_as_strings() {
    let source = r#"
            import { View } from '@hozo/core'
            const el = <View className="shadow-lg blur-sm" />
            "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.styles.contains("boxShadow: '0 10px 15px -3px"));
    assert!(output.styles.contains("filter: 'blur(8px)',"));
}

#[test]
fn a_gradient_goes_under_the_unprefixed_key() {
    // The floor is 0.87, which reads `backgroundImage`; the prefixed key was
    // only for 0.86 (#1267, #1272).
    let source = r#"
            import { View } from '@hozo/core'
            const el = <View className="bg-linear-to-r from-red-500 to-blue-500" />
            "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(
        output
            .styles
            .contains(" backgroundImage: 'linear-gradient(to right, "),
        "{}",
        output.styles
    );
    assert!(
        !output.styles.contains("experimental_backgroundImage"),
        "{}",
        output.styles
    );
}

#[test]
fn inline_flex_lowers_to_a_shrink_wrapped_flex_container() {
    let source = r#"
            import { View } from '@hozo/core'
            const el = <View className="inline-flex" />
            "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());

    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(
        output.styles.contains("display: 'flex',"),
        "{}",
        output.styles
    );
    assert!(
        output.styles.contains("alignSelf: 'flex-start',"),
        "{}",
        output.styles
    );
}

#[test]
fn inline_flex_never_overrides_an_authored_align_self() {
    let source = r#"
            import { View } from '@hozo/core'
            const el = <View className="self-center md:inline-flex" />
            "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());

    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(
        output.styles.contains("alignSelf: 'center',"),
        "{}",
        output.styles
    );
    assert!(
        !output.styles.contains("alignSelf: 'flex-start',"),
        "{}",
        output.styles
    );
    assert!(
        output.styles.contains("display: 'flex',"),
        "{}",
        output.styles
    );
}

#[test]
fn block_restores_a_hidden_yoga_node_as_a_flex_container() {
    let source = r#"
            import { View } from '@hozo/core'
            const el = <View className="hidden md:block" />
            "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());

    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(
        output.styles.contains("display: 'none',"),
        "{}",
        output.styles
    );
    assert!(output.styles.contains("hozo0_md:"), "{}", output.styles);
    assert_eq!(
        output.styles.matches("display: 'flex',").count(),
        1,
        "{}",
        output.styles
    );
}

/// Every variant that can't reach the `style` prop, with the severity
/// it should report. Until 2026-08-15 all of these produced a
/// StyleSheet entry the JSX never referenced, and said nothing -- the
/// conformance suite scored them covered because the entry existed.
#[test]
fn an_unresolvable_class_name_is_handed_to_the_runtime_resolver() {
    // Web concatenates it back on and lets the browser's CSS engine
    // match it. RN has neither a className nor a CSS engine, so the
    // expression goes to the generated resolver instead -- warned
    // about, since only unconditional classes survive that path.
    let source = r#"
            import { View } from '@hozo/core'
            const el = <View className={classNameFromProps} />
            "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());

    assert_eq!(output.diagnostics.len(), 1);
    assert_eq!(
        output.diagnostics[0].code,
        hozo_ir::DiagnosticCode::DynamicClassNameNotResolved
    );
    assert_eq!(output.diagnostics[0].severity, hozo_ir::Severity::Warning);
    assert!(
        output.jsx.contains("hozoClasses(classNameFromProps)"),
        "{}",
        output.jsx
    );
}

#[test]
fn the_runtime_resolved_part_comes_last_so_it_wins() {
    // `cn('p-4', getDynamic())` puts the opaque part last in the
    // source, and RN merges a style array last-wins -- so the compiled
    // styles must not be able to override it.
    let source = r#"
            import { View } from '@hozo/core'
            import { cn } from 'clsx'
            const el = <View className={cn('p-4', getDynamic())} />
            "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());

    let compiled = output
        .jsx
        .find("hozoStyles.hozo0")
        .expect("compiled styles");
    let dynamic = output.jsx.find("hozoClasses(").expect("resolver call");
    assert!(compiled < dynamic, "{}", output.jsx);
}

#[test]
fn colour_families_react_native_has_no_home_for_are_refused_by_name() {
    // Each of these is a perfectly ordinary CSS colour that React
    // Native either doesn't have (SVG paint, form-control accents) or
    // keeps on a component prop rather than in a style. On the wrong
    // primitive those prop-backed colours are named, not dropped.
    //
    // The code each is filed under is part of the assertion. Only the
    // first three are impossible on the platform; the last two work on
    // TextInput and are therefore filed as a target mismatch instead.
    for (candidate, expected, code) in [
        (
            "fill-red-500",
            "SVG",
            DiagnosticCode::WebOnlyPropertyOnNative,
        ),
        (
            "stroke-red-500",
            "SVG",
            DiagnosticCode::WebOnlyPropertyOnNative,
        ),
        (
            "accent-red-500",
            "form controls",
            DiagnosticCode::WebOnlyPropertyOnNative,
        ),
        (
            "caret-red-500",
            "TextInput",
            DiagnosticCode::NotWiredOnNative,
        ),
        (
            "placeholder-red-500",
            "TextInput",
            DiagnosticCode::NotWiredOnNative,
        ),
    ] {
        let source = format!(
            "import {{ View }} from '@hozo/core'\nconst el = <View className=\"{candidate}\" />\n"
        );
        let parsed = hozo_parser::parse_tsx(&source);
        let output = lower(&parsed.roots[0].node, &source, &Theme::default());
        let refusal = output
            .diagnostics
            .iter()
            .find(|d| d.code == code)
            .unwrap_or_else(|| panic!("{candidate} must be refused as {code:?}, not dropped"));
        assert!(
            refusal.message.contains(expected),
            "{candidate}: {}",
            refusal.message
        );
    }
}

#[test]
fn every_text_decoration_style_lowers_including_wavy() {
    // React Native's `textDecorationStyle` takes the same five values
    // CSS does. `decoration-wavy` was refused here until the refusal
    // audit checked that claim against RN's own types and found it
    // false; this test is what stops it coming back.
    let source = r#"
            import { Text } from '@hozo/core'
            const el = <Text className="decoration-red-500 decoration-double">x</Text>
            "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(
        output.styles.contains("textDecorationColor: '#fb2c36',"),
        "{}",
        output.styles
    );
    assert!(
        output.styles.contains("textDecorationStyle: 'double',"),
        "{}",
        output.styles
    );

    for (candidate, expected) in [
        ("decoration-solid", "'solid'"),
        ("decoration-double", "'double'"),
        ("decoration-dotted", "'dotted'"),
        ("decoration-dashed", "'dashed'"),
        ("decoration-wavy", "'wavy'"),
    ] {
        let source = format!(
                "import {{ Text }} from '@hozo/core'\nconst el = <Text className=\"{candidate}\">x</Text>\n"
            );
        let parsed = hozo_parser::parse_tsx(&source);
        let output = lower(&parsed.roots[0].node, &source, &Theme::default());
        assert!(
            output.diagnostics.is_empty(),
            "{candidate}: {:?}",
            output.diagnostics
        );
        assert!(
            output
                .styles
                .contains(&format!("textDecorationStyle: {expected},")),
            "{candidate}: {}",
            output.styles
        );
    }
}

#[test]
fn outline_none_becomes_zero_width_not_a_solid_outline() {
    // React Native's `outlineStyle` accepts only solid/dotted/dashed,
    // so the border path's None -> 'solid' mapping would say the
    // opposite of what was asked. Zero width is how you hide one.
    let source = r#"
            import { View } from '@hozo/core'
            const el = <View className="outline-none" />
            "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(
        output.styles.contains("outlineWidth: 0,"),
        "{}",
        output.styles
    );
    assert!(!output.styles.contains("outlineStyle"), "{}", output.styles);
}

#[test]
fn space_and_divide_reach_the_children_through_hozo_spaced() {
    // These were refused ("React Native has no selector engine") until
    // the refusal audit pointed out that the CSS they produce is
    // entirely expressible -- the selector was never the obstacle, since
    // the styles are ordinary margins and border widths. What is
    // genuinely unknowable at build time is *which* child is last when
    // one of them is `{items.map(..)}`, and that is the only thing
    // `HozoSpaced` decides.
    let source = r#"
            import { View, Text } from '@hozo/core'
            const el = (
              <View className="divide-y-4 space-y-2">
                <Text>a</Text>
                <Text>b</Text>
              </View>
            )
            "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());

    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(
        output
            .jsx
            .contains("<HozoSpaced style={hozoStyles.hozo0Children}>"),
        "{}",
        output.jsx
    );
    assert!(output.jsx.contains("</HozoSpaced>"), "{}", output.jsx);
    assert!(
        output.runtime_imports.contains(&"HozoSpaced"),
        "{:?}",
        output.runtime_imports
    );

    // The child style, not the parent's: the element itself gets no
    // border or margin from these.
    assert!(
        output.styles.contains("hozo0Children: {"),
        "{}",
        output.styles
    );
    assert!(
        output.styles.contains("borderTopWidth: 0,"),
        "{}",
        output.styles
    );
    assert!(
        output.styles.contains("borderBottomWidth: 4,"),
        "{}",
        output.styles
    );
    assert!(output.styles.contains("marginTop: 0,"), "{}", output.styles);
    assert!(
        output.styles.contains("marginBottom: 8,"),
        "{}",
        output.styles
    );
}

#[test]
fn space_x_uses_the_logical_margins_and_divide_x_the_logical_border_widths() {
    // React Native takes the CSS logical names for margins
    // (`marginInlineStart`) but its own for border widths
    // (`borderStartWidth`, not `borderInlineStartWidth`). Emitting the
    // CSS spelling for the border would be silently ignored on device.
    let source = r#"
            import { View, Text } from '@hozo/core'
            const el = (
              <View className="space-x-3 divide-x-2 divide-red-500">
                <Text>a</Text>
              </View>
            )
            "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());

    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(
        output.styles.contains("marginInlineStart: 0,"),
        "{}",
        output.styles
    );
    assert!(
        output.styles.contains("marginInlineEnd: 12,"),
        "{}",
        output.styles
    );
    assert!(
        output.styles.contains("borderStartWidth: 0,"),
        "{}",
        output.styles
    );
    assert!(
        output.styles.contains("borderEndWidth: 2,"),
        "{}",
        output.styles
    );
    assert!(
        output.styles.contains("borderColor: '#fb2c36',"),
        "{}",
        output.styles
    );
}

#[test]
fn an_element_without_space_or_divide_gets_no_wrapper() {
    // The wrapper is not free -- it is a component in the tree and a
    // runtime import -- so it must appear only where it does something.
    let source = r#"
            import { View, Text } from '@hozo/core'
            const el = (
              <View className="p-4">
                <Text>a</Text>
              </View>
            )
            "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(!output.jsx.contains("HozoSpaced"), "{}", output.jsx);
    assert!(
        output.runtime_imports.is_empty(),
        "{:?}",
        output.runtime_imports
    );
}

fn lower_element(element: &str) -> LowerOutput {
    let source =
        format!("import {{ Pressable, Text, View }} from '@hozo/core'\nconst el = {element}");
    let parsed = hozo_parser::parse_tsx(&source);
    lower(&parsed.roots[0].node, &source, &Theme::default())
}

#[test]
fn a_view_inside_a_group_pressable_reads_its_state() {
    // A `group` card restyling the box beside its label: the View reads the
    // same context a Text does, so the Pressable has to provide it.
    for (element, state) in [
        (
            r#"<Pressable className="group"><View className="bg-white group-hover:bg-blue-500">x</View></Pressable>"#,
            "hovered && hozoStyles.",
        ),
        (
            r#"<Pressable className="group"><View><View className="group-pressed:p-4" /></View></Pressable>"#,
            "pressed && hozoStyles.",
        ),
    ] {
        let output = lower_element(element);
        assert!(
            output.diagnostics.is_empty(),
            "{element}: {:?}",
            output.diagnostics
        );
        assert!(output.jsx.starts_with("<HozoPressable"), "{}", output.jsx);
        assert!(
            output
                .jsx
                .contains("<HozoInteractionView style={({ pressed, hovered, focused }) => ["),
            "{}",
            output.jsx
        );
        assert!(output.jsx.contains(state), "{}", output.jsx);
        assert!(output.runtime_imports.contains(&"HozoInteractionView"));
    }
}

#[test]
fn a_view_without_a_group_variant_does_not_borrow_its_owners_state() {
    // A plain `hover:` on a child asks about the child. It stays refused,
    // and it does not turn the Pressable into a context provider.
    let output = lower_element(
        r#"<Pressable className="group"><View className="hover:bg-blue-500">x</View></Pressable>"#,
    );
    assert!(
        output
            .diagnostics
            .iter()
            .any(|d| d.code == DiagnosticCode::NotWiredOnNative),
        "{:?}",
        output.diagnostics
    );
    assert!(
        !output.jsx.contains("HozoInteractionView"),
        "{}",
        output.jsx
    );
}

#[test]
fn a_group_state_the_context_does_not_carry_says_so_under_a_pressable() {
    // It used to say nothing above the element was a Pressable, with the
    // Pressable right there.
    for child in ["Text", "View"] {
        let output = lower_element(&format!(
            r#"<Pressable className="group"><{child} className="group-open:p-4">x</{child}></Pressable>"#
        ));
        let messages: Vec<_> = output
            .diagnostics
            .iter()
            .map(|d| d.message.as_str())
            .collect();
        assert!(
            messages
                .iter()
                .any(|m| m.contains("does not carry") && !m.contains("Nothing above")),
            "{child}: {messages:?}"
        );
    }
    let output = lower_element(r#"<View className="group-hover:p-4">x</View>"#);
    assert!(
        output
            .diagnostics
            .iter()
            .any(|d| d.message.contains("is not a Text or View inside one")),
        "{:?}",
        output.diagnostics
    );
}

#[test]
fn group_ancestor_props_direction_and_position_lower_without_extra_wrappers() {
    // `group-aria-*` reads the enclosing `.group` ancestor's `accessibilityState`
    // without forcing `HozoPressable` or `HozoInteractionView`.
    for child in ["Text", "View"] {
        let output = lower_element(&format!(
            r#"<Pressable className="group" accessibilityState={{{{ checked: on }}}}><{child} className="group-aria-checked:p-4">x</{child}></Pressable>"#
        ));
        assert!(
            output.diagnostics.is_empty(),
            "{child}: {:?}",
            output.diagnostics
        );
        assert!(
            output.jsx.contains("({ checked: on })?.checked === true")
                && output.jsx.contains("hozo1_groupariachecked"),
            "{child}: {}",
            output.jsx
        );
        assert!(
            !output.jsx.contains("HozoPressable") && !output.jsx.contains("HozoInteractionView"),
            "{child}: {}",
            output.jsx
        );
    }

    // `group-disabled:` and `group-enabled:` read the enclosing `.group` ancestor's `disabled` prop.
    let disabled_out = lower_element(
        r#"<Pressable className="group" disabled={off}><Text className="group-disabled:opacity-50 group-enabled:opacity-100">x</Text></Pressable>"#,
    );
    assert!(
        disabled_out.diagnostics.is_empty(),
        "{:?}",
        disabled_out.diagnostics
    );
    assert!(
        disabled_out
            .jsx
            .contains("(off) && hozoStyles.hozo1_groupdisabled"),
        "{}",
        disabled_out.jsx
    );
    assert!(
        disabled_out
            .jsx
            .contains("!(off) && hozoStyles.hozo1_groupenabled"),
        "{}",
        disabled_out.jsx
    );

    // `group-rtl:` / `group-ltr:` reuse `useHozoEnvironment` when the ancestor has no explicit `dir`,
    // or resolve statically from an explicit `dir` prop on the `.group` ancestor.
    let rtl_env = lower_element(
        r#"<View className="group"><Text className="group-rtl:p-4 dark:group-rtl:m-2">x</Text></View>"#,
    );
    assert!(rtl_env.diagnostics.is_empty(), "{:?}", rtl_env.diagnostics);
    assert!(
        rtl_env
            .prelude
            .iter()
            .any(|p| p.contains("useHozoEnvironment('rtl')")),
        "{:?}",
        rtl_env.prelude
    );
    assert!(
        rtl_env
            .jsx
            .contains("__hozoEnv_rtl && hozoStyles.hozo1_grouprtl")
            && rtl_env
                .jsx
                .contains("__hozoDark && __hozoEnv_rtl && hozoStyles.hozo1_dark_grouprtl"),
        "{}",
        rtl_env.jsx
    );

    let rtl_explicit = lower_element(
        r#"<View className="group" dir="rtl"><Text className="group-rtl:p-4 group-ltr:m-2">x</Text></View>"#,
    );
    assert!(
        rtl_explicit.diagnostics.is_empty(),
        "{:?}",
        rtl_explicit.diagnostics
    );
    assert!(
        rtl_explicit.prelude.is_empty(),
        "{:?}",
        rtl_explicit.prelude
    );
    assert!(
        rtl_explicit.jsx.contains("hozoStyles.hozo1_grouprtl")
            && !rtl_explicit.jsx.contains("hozoStyles.hozo1_groupltr"),
        "{}",
        rtl_explicit.jsx
    );

    // `group-first:` / `group-last:` / `group-even:` / `group-nth-2:` resolve from the `.group` ancestor's sibling position.
    let pos_out = lower_element(
        r#"<View><View className="group"><Text className="group-first:p-4 group-last:m-2">a</Text></View><View className="group"><Text className="group-first:p-4 group-even:m-2">b</Text></View></View>"#,
    );
    assert!(pos_out.diagnostics.is_empty(), "{:?}", pos_out.diagnostics);
    assert!(
        pos_out.jsx.contains("hozoStyles.hozo2_groupfirst")
            && !pos_out.jsx.contains("hozoStyles.hozo2_grouplast")
            && !pos_out.jsx.contains("hozoStyles.hozo4_groupfirst")
            && pos_out.jsx.contains("hozoStyles.hozo4_groupeven"),
        "{}",
        pos_out.jsx
    );

    // Conditional JSX inside a `.group` still inherits the ancestor, and negated group variants work.
    let nested_and_not = lower_element(
        r#"<Pressable className="group" accessibilityState={{ checked: on }}>{show && <Text className="group-aria-checked:p-4 not-group-aria-checked:m-2 not-group-hover:opacity-50">x</Text>}</Pressable>"#,
    );
    assert!(
        nested_and_not.diagnostics.is_empty(),
        "{:?}",
        nested_and_not.diagnostics
    );
    assert!(
        nested_and_not.jsx.starts_with("<HozoPressable")
            && nested_and_not.jsx.contains("<HozoText")
            && nested_and_not.jsx.contains("!(hovered) &&")
            && nested_and_not
                .jsx
                .contains("!((({ checked: on })?.checked === true)) &&"),
        "{}",
        nested_and_not.jsx
    );
}

#[test]
fn group_ancestor_variants_refuse_without_group_or_undecidable_position() {
    for element in [
        r#"<View className="group-aria-checked:p-4" />"#,
        r#"<View className="group-disabled:p-4" />"#,
        r#"<View className="group-enabled:p-4" />"#,
        r#"<View className="group-rtl:p-4" />"#,
        r#"<View className="group-first:p-4" />"#,
        // Root `.group` has unknown sibling position -> must refuse `group-first:`.
        r#"<View className="group"><Text className="group-first:p-4">x</Text></View>"#,
        // `-of-type` stays refused per Decision 003.
        r#"<View><View className="group"><Text className="group-first-of-type:p-4">x</Text></View></View>"#,
    ] {
        let output = lower_element(element);
        assert!(
            output.diagnostics.iter().any(
                |d| d.code == DiagnosticCode::NotWiredOnNative && d.severity == Severity::Error
            ),
            "{element}: {:?}",
            output.diagnostics
        );
    }
}

#[test]
fn authored_data_attribute_variants_lower_on_self_and_group_ancestors() {
    // Dynamic presence and equality props on the same element.
    let dynamic = lower_element(
        r#"<View data-open={open ? '' : undefined} data-state={state} className="data-open:p-4 data-[state=open]:m-2 not-data-[state=open]:opacity-50 dark:data-open:bg-blue-500" />"#,
    );
    assert!(dynamic.diagnostics.is_empty(), "{:?}", dynamic.diagnostics);
    assert!(
        dynamic
            .jsx
            .contains("((open ? '' : undefined) != null) && hozoStyles.hozo0_data_open")
            && dynamic.jsx.contains(
                "((state) != null && String(state) === 'open') && hozoStyles.hozo0_data_state_eq_open"
            )
            && dynamic.jsx.contains(
                "!(((state) != null && String(state) === 'open')) && hozoStyles.hozo0_notdata_state_eq_open"
            )
            && dynamic.jsx.contains(
                "__hozoDark && ((open ? '' : undefined) != null) && hozoStyles.hozo0_dark_data_open"
            ),
        "{}",
        dynamic.jsx
    );

    // Static literal data attributes fold at compile time with zero runtime guards.
    let literal = lower_element(
        r#"<View data-open data-state="open" className="data-open:p-4 data-[state=open]:m-2 data-[state=closed]:opacity-50" />"#,
    );
    assert!(literal.diagnostics.is_empty(), "{:?}", literal.diagnostics);
    assert!(
        literal.jsx.contains("hozoStyles.hozo0_data_open")
            && literal.jsx.contains("hozoStyles.hozo0_data_state_eq_open")
            && !literal.jsx.contains("hozo0_data_state_eq_closed")
            && !literal.jsx.contains("&&"),
        "{}",
        literal.jsx
    );

    // `group-data-*` reads the enclosing `.group` ancestor's data prop.
    let group_data = lower_element(
        r#"<View className="group" data-state={state}><Text className="group-data-[state=open]:p-4">x</Text></View>"#,
    );
    assert!(
        group_data.diagnostics.is_empty(),
        "{:?}",
        group_data.diagnostics
    );
    assert!(
        group_data.jsx.contains(
            "((state) != null && String(state) === 'open') && hozoStyles.hozo1_groupdata_state_eq_open"
        ),
        "{}",
        group_data.jsx
    );

    // Missing data prop stays refused with the written variant name.
    for element in [
        r#"<View className="data-open:p-4" />"#,
        r#"<View className="data-[state=open]:p-4" />"#,
        r#"<View data-other="x" className="data-[state=open]:p-4" />"#,
        r#"<View className="group"><Text className="group-data-[state=open]:p-4">x</Text></View>"#,
    ] {
        let output = lower_element(element);
        assert!(
            output.diagnostics.iter().any(
                |d| d.code == DiagnosticCode::NotWiredOnNative && d.severity == Severity::Error
            ),
            "{element}: {:?}",
            output.diagnostics
        );
    }
}

#[test]
fn a_refusal_names_the_variant_the_way_it_was_written() {
    // The names used to be the style-entry suffix: `group-ariachecked:`,
    // `hashover:`, and `data:` for every data attribute.
    for (element, written) in [
        (
            r#"<Pressable className="group"><Text className="group-aria-checked:p-4">x</Text></Pressable>"#,
            "`group-aria-checked:`",
        ),
        (r#"<View className="has-hover:p-4" />"#, "`has-hover:`"),
        (
            r#"<View className="data-[state=open]:p-4" />"#,
            "`data-[state=open]:`",
        ),
        (r#"<View className="data-open:p-4" />"#, "`data-open:`"),
        (
            r#"<View className="focus-visible:p-4" />"#,
            "`focus-visible:`",
        ),
        (
            r#"<View className="hover:peer-hover:p-4" />"#,
            "`hover:peer-hover`",
        ),
        (
            r#"<View className="not-focus-visible:p-4" />"#,
            "`not-focus-visible:`",
        ),
    ] {
        let output = lower_element(element);
        let messages: Vec<_> = output
            .diagnostics
            .iter()
            .map(|d| d.message.as_str())
            .collect();
        assert!(
            messages.iter().any(|message| message.contains(written)),
            "{element}: {messages:?}"
        );
    }
}
