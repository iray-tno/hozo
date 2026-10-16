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
                assert!(out.diagnostics.iter().any(|d| {
                    d.code == DiagnosticCode::WebOnlyPropertyOnNative && d.message.contains("resize")
                }), "{utility}: {:?}", out.diagnostics);
            }
        }
    }
    // A reset must not hide an earlier request for a missing handle.
    let source = "import {TextInput} from '@hozo/core'; const e = <TextInput accessibilityLabel=\"Field\" className=\"resize-y resize-none\"/>";
    let parsed = hozo_parser::parse_tsx(source);
    let out = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(out.diagnostics.iter().any(|d| d.code == DiagnosticCode::WebOnlyPropertyOnNative));
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
        ("translate-x-2 rotate-45 scale-95 rotate-none", "[{ translateX: 8 }, { scale: 0.95 }]"),
        ("translate-x-2 rotate-45 scale-95 scale-none", "[{ translateX: 8 }, { rotate: '45deg' }]"),
        ("translate-x-2 rotate-45 scale-95 translate-none", "[{ rotate: '45deg' }, { scale: 0.95 }]"),
        ("translate-x-2 rotate-45 scale-95 rotate-x-30 transform-none", "[{ translateX: 8 }, { rotate: '45deg' }, { scale: 0.95 }]"),
        ("rotate-none rotate-45", "[{ rotate: '45deg' }]"),
        ("translate-y-3 translate-none translate-x-2", "[{ translateX: 8 }, { translateY: 12 }]"),
        ("scale-y-75 scale-none scale-x-50", "[{ scaleX: 0.5 }, { scaleY: 0.75 }]"),
        ("rotate-x-30 transform-none transform-cpu", "[{ rotateX: '30deg' }]"),
        ("rotate-x-30 transform-none skew-x-3", "[{ rotateX: '30deg' }, { skewX: '3deg' }]"),
        ("rotate-none scale-none translate-none transform-none", "[]"),
        ("transform", "[]"),
    ] {
        let source = format!("import {{ View }} from '@hozo/core'; const e = <View className=\"{classes}\" />");
        let parsed = hozo_parser::parse_tsx(&source);
        let output = lower(&parsed.roots[0].node, &source, &Theme::default());
        assert!(output.diagnostics.is_empty(), "{classes}: {:?}", output.diagnostics);
        assert!(output.styles.contains(&format!("transform: {expected},")), "{classes}: {}", output.styles);
        assert!(!output.runtime_imports.contains(&"hozoTransformStyles"), "static resets need no runtime");
    }
}

#[test]
fn conditional_transform_resets_carry_slots_and_use_existing_guards() {
    let source = "import { Pressable } from '@hozo/core'; function C() { return <Pressable accessibilityRole=\"button\" className=\"translate-x-2 rotate-45 scale-95 md:rotate-none hover:scale-none pressed:translate-none\" /> }";
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(output.runtime_imports.contains(&"hozoTransformStyles"));
    assert!(output.jsx.contains("hozoTransformStyles(["), "{}", output.jsx);
    for expected in ["__hozoBp_md &&", "hovered &&", "pressed &&", "rotate: []", "scale: 'none'", "translate: 'none'"] {
        assert!(output.jsx.contains(expected), "{expected}: {}", output.jsx);
    }
    assert_eq!(output.prelude.len(), 1, "only the existing breakpoint hook is needed");
}

#[test]
fn transform_gpu_and_reset_animation_frames_remain_explicitly_diagnostic() {
    for classes in ["transform-gpu", "transition rotate-45 starting:rotate-none"] {
        let source = format!("import {{ View }} from '@hozo/core'; function C() {{ return <View className=\"{classes}\" /> }}");
        let parsed = hozo_parser::parse_tsx(&source);
        let output = lower(&parsed.roots[0].node, &source, &Theme::default());
        assert!(output.diagnostics.iter().any(|d| d.severity == Severity::Error), "{classes}: {:?}", output.diagnostics);
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

#[test]
fn portable_display_values_lower_normally() {
    let source = r#"
            import { View } from '@hozo/core'
            const el = <View className="hidden" />
            "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty());
    assert!(output.styles.contains("display: 'none',"));
}

#[test]
fn structural_form_and_disclosure_primitives_lower_to_native_components() {
    let source = r#"
        import { Fieldset, Legend, Details, Summary, TermList, Term, Description } from '@hozo/semantics'
        const el = (
            <Fieldset>
                <Legend>Options</Legend>
                <Details>
                    <Summary>More</Summary>
                    <TermList>
                        <Term>Term</Term>
                        <Description>Detail</Description>
                        <TermList.Term>CompoundTerm</TermList.Term>
                        <TermList.Description>CompoundDetail</TermList.Description>
                    </TermList>
                </Details>
            </Fieldset>
        )
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(output.jsx.contains(r#"<View role="group">"#), "{}", output.jsx);
    // The disclosure is two runtime components now. It used to be a View
    // holding a Pressable and then the body, always -- no toggle on the
    // button and the body visible whether it was open or not.
    assert!(output.jsx.contains("<HozoDetails>"), "{}", output.jsx);
    assert!(output.jsx.contains("<HozoSummary>"), "{}", output.jsx);
    assert!(output.jsx.contains(r#"<View role="list">"#), "{}", output.jsx);
    // Legend and Term receive bold font weight semantic defaults
    assert!(output.styles.contains("fontWeight: '700',"), "{}", output.styles);
}

#[test]
fn separator_lowers_to_native_view_with_separator_role() {
    let source = r#"
        import { Separator } from '@hozo/semantics'
        const el = <Separator />
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(output.jsx.contains(r#"role="separator""#), "{}", output.jsx);
}

#[test]
fn progress_and_button_with_href_lower_to_native_components() {
    let source = r#"
        import { Button } from '@hozo/core'
        import { Progress } from '@hozo/semantics'
        const el = (
            <View>
                <Progress />
                <Button href="https://example.com">Go</Button>
            </View>
        )
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(output.jsx.contains(r#"role="progressbar""#), "{}", output.jsx);
    assert!(output.jsx.contains("role=\"progressbar\" accessible"), "{}", output.jsx);
    assert!(output.jsx.contains(r#"<HozoLink href="https://example.com">"#), "{}", output.jsx);
    assert!(!output.jsx.contains(r#"accessibilityRole="button" href="https://example.com""#), "{}", output.jsx);
}

#[test]
fn destination_replace_intent_reaches_hozo_link() {
    let source = r#"
        import { Button } from '@hozo/core'
        import { Link } from '@hozo/typography'
        const el = (
            <View>
                <Link href="/one" replace>One</Link>
                <Button href="/two" replace={shouldReplace}>Two</Button>
            </View>
        )
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(
        output.jsx.contains(r#"<HozoLink replace={true} href="/one">"#),
        "{}",
        output.jsx
    );
    assert!(
        output
            .jsx
            .contains(r#"<HozoLink replace={shouldReplace} href="/two">"#),
        "{}",
        output.jsx
    );
}

#[test]
fn destination_prefetch_intent_reaches_hozo_link() {
    let source = r#"
        import { Button, Link, Pressable } from '@hozo/core'
        const el = (
            <View>
                <Link href="/one" prefetch>One</Link>
                <Button href="/two" prefetch={likely}>Two</Button>
                <Pressable href="/three" prefetch>Three</Pressable>
            </View>
        )
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert_eq!(output.jsx.matches(" prefetch={true}").count(), 2, "{}", output.jsx);
    assert!(output.jsx.contains(" prefetch={likely}"), "{}", output.jsx);
}

/// The rule the browser draws and React Native does not.
///
/// `<hr>` takes its line from the user-agent stylesheet. React Native has
/// none, so a `View` with no size is zero pixels tall -- and a compiled
/// separator was exactly that while the uncompiled fallback in
/// `@hozo/semantics` set the height by hand. Turning the compiler on
/// removed a divider from the screen (#309), which is the sort of
/// difference the Web half hides: nothing about `<hr />` suggests the
/// other platform is short of anything.
#[test]
fn a_separator_is_one_pixel_and_says_what_it_is() {
    let cases = [
        (
            r#"<Separator />"#,
            "height: 1,",
            r#"<View style={hozoStyles.hozo0} role="separator"></View>"#,
        ),
        (
            r#"<Separator orientation="vertical" />"#,
            "width: 1,",
            r#"<View style={hozoStyles.hozo0} role="separator"></View>"#,
        ),
        // A rule drawn to look like a line is not structure. `role` and
        // `accessibilityRole` both say `none`, which is the one value
        // React Native has for silence -- it has no `separator` at all,
        // and Android discards the ARIA spelling as well.
        (
            r#"<Separator decorative />"#,
            "height: 1,",
            r#"<View style={hozoStyles.hozo0} role="none" accessibilityRole="none"></View>"#,
        ),
    ];
    // Under a reset, which is what a Tailwind project ships.
    // `Theme::default()` means no reset and draws the user agent's two
    // pixels instead; both are checked, because the number is a fact about
    // the project rather than about the primitive (#315).
    let reset = Theme::new(std::collections::HashMap::new(), None, true);
    for (element, size, jsx) in cases {
        let source =
            format!("import {{ Separator }} from '@hozo/core'\nconst el = {element}");
        let parsed = hozo_parser::parse_tsx(&source);
        let output = lower(&parsed.roots[0].node, &source, &reset);
        assert!(output.diagnostics.is_empty(), "{element}: {:?}", output.diagnostics);
        assert!(output.styles.contains(size), "{element}: {}", output.styles);
        assert!(
            output.styles.contains("alignSelf: 'stretch',"),
            "{element}: {}",
            output.styles
        );
        assert_eq!(output.jsx, jsx, "{element}");
    }
}

/// Neither of a rule's own props is a prop the platform reads.
#[test]
fn a_separator_does_not_pass_its_own_props_through() {
    for element in [r#"<Separator decorative />"#, r#"<Separator orientation="vertical" />"#] {
        let source =
            format!("import {{ Separator }} from '@hozo/core'\nconst el = {element}");
        let parsed = hozo_parser::parse_tsx(&source);
        let output = lower(&parsed.roots[0].node, &source, &Theme::default());
        assert!(!output.jsx.contains("decorative"), "{element}: {}", output.jsx);
        assert!(!output.jsx.contains("orientation"), "{element}: {}", output.jsx);
    }
}

#[test]
fn destination_pressable_is_a_native_link() {
    let source = r#"
        import { Pressable } from '@hozo/core'
        const el = <Pressable href="/card" replace external>Card</Pressable>
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(
        output
            .jsx
            .contains(r#"<HozoLink replace={true} href="/card" external>"#),
        "{}",
        output.jsx
    );
    assert!(output.jsx.contains("<Text>Card</Text></HozoLink>"), "{}", output.jsx);
    assert!(output.jsx.contains(" external"), "{}", output.jsx);
    assert!(!output.jsx.contains("accessibilityRole=\"button\""), "{}", output.jsx);
}

/// The same rule and the same heading, in a project that ships no reset.
///
/// The browser draws `<hr>` as a 2px inset border and `<h1>` at 32px bold
/// until something resets them, so a compiler matching the browser has to
/// know which browser rendering the project actually gets. Measured both
/// ways in headless Chrome (#315).
#[test]
fn without_a_reset_the_defaults_are_the_user_agent_s() {
    let source = "import { Separator, Heading } from '@hozo/core'\nconst el = <Separator />";
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.styles.contains("height: 2,"), "{}", output.styles);

    let source = "import { Heading } from '@hozo/core'\nconst el = <Heading level={1}>T</Heading>";
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.styles.contains("fontSize: 28,"), "{}", output.styles);
    assert!(output.styles.contains("fontWeight: '700',"), "{}", output.styles);
}

/// A heading under a reset is body text, which is what the browser shows.
///
/// Tailwind's preflight sets `h1`-`h6` to `font-size: inherit; font-weight:
/// inherit`. Measured at 16px and weight 400 with it, 32px and 700 without.
/// Supplying a size here would make the phone show an outline the browser
/// does not -- which is what it did (#315).
///
/// The level still reaches a screen reader through
/// `accessibilityRole="header"`, which is the half that is about structure.
#[test]
fn a_heading_under_a_reset_carries_its_role_and_no_size() {
    let reset = Theme::new(std::collections::HashMap::new(), None, true);
    for level in [1, 2, 6] {
        let source = format!(
            "import {{ Heading }} from '@hozo/core'\nconst el = <Heading level={{{level}}}>T</Heading>"
        );
        let parsed = hozo_parser::parse_tsx(&source);
        let output = lower(&parsed.roots[0].node, &source, &reset);
        assert!(!output.styles.contains("fontSize"), "level {level}: {}", output.styles);
        assert!(!output.styles.contains("fontWeight"), "level {level}: {}", output.styles);
        assert!(
            output.jsx.contains(r#"accessibilityRole="header""#),
            "level {level}: {}",
            output.jsx
        );
    }
}

#[test]
fn a_meter_is_hozo_meter_and_hands_it_everything_it_draws_with() {
    // `Meter`, not `Progress`: an amount within a range, drawn as a bar on
    // Native as `<meter>` draws one on the Web (#788). `HozoMeter` works the
    // amount out -- the bar's width, its colour from `low`/`high`/`optimum`,
    // and the percentage a reader hears -- so every one of those props has
    // to reach it, and the author's classes are the track's style.
    let source = r#"
        import { Meter } from '@hozo/core'
        const a = <Meter accessibilityLabel="Disk usage" value={used} min={0} max={100} low={30} high={80} optimum={20} className="w-40 rounded-full bg-slate-200" />
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(output.jsx.starts_with("<HozoMeter"), "{}", output.jsx);
    assert!(output.runtime_imports.contains(&"HozoMeter"), "{:?}", output.runtime_imports);
    for prop in ["value={used}", "min={0}", "max={100}", "low={30}", "high={80}", "optimum={20}", r#"accessibilityLabel={"Disk usage"}"#] {
        assert!(output.jsx.contains(prop), "{prop} did not reach HozoMeter: {}", output.jsx);
    }
    assert!(output.jsx.contains("style={hozoStyles.hozo0}"), "{}", output.jsx);
    assert!(output.styles.contains("width: 160") && output.styles.contains("borderRadius: 9999"), "{}", output.styles);
    // The component's to decide now, so not decided twice.
    assert!(!output.jsx.contains("accessibilityValue"), "{}", output.jsx);
    assert!(!output.jsx.contains("role="), "{}", output.jsx);
}

#[test]
fn a_badge_is_hozo_badge_and_keeps_its_text_styles() {
    // `HozoBadge` is a `Text` underneath and draws its count rather than
    // its children, so a colour moved onto an inserted `Text` around the
    // children would be on nothing.
    let source = r#"
        import { Badge } from '@hozo/core'
        const el = <Badge count={n} accessibilityLabel="3 unread" className="rounded-full bg-red-600 text-white text-xs" />
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(output.jsx.starts_with("<HozoBadge style={hozoStyles.hozo0}"), "{}", output.jsx);
    assert!(output.jsx.contains("count={n}"), "{}", output.jsx);
    assert!(output.runtime_imports.contains(&"HozoBadge"), "{:?}", output.runtime_imports);
    assert!(!output.styles.contains("_text"), "{}", output.styles);
    assert!(output.styles.contains("color: '#fff'"), "{}", output.styles);
}

#[test]
fn a_skeleton_is_hidden_and_animates_only_when_motion_is_allowed() {
    // Decision 007, section 5: whatever animation a class puts on a
    // skeleton runs only when motion is allowed -- `animate-pulse` here is
    // `motion-safe:animate-pulse` -- and an author who wrote `motion-safe:`
    // is not guarded twice.
    for (class_name, guard) in [
        ("h-4 animate-pulse", "__hozoEnv_motion_safe && __hozoAnim_pulse"),
        ("h-4 md:animate-pulse", "__hozoEnv_motion_safe && __hozoBp_md && __hozoAnim_pulse"),
        ("h-4 motion-safe:animate-pulse", "[hozoStyles.hozo0, __hozoEnv_motion_safe && __hozoAnim_pulse]"),
    ] {
        let source = format!(
            "import {{ Skeleton }} from '@hozo/core'\nconst el = <Skeleton className=\"{class_name}\" />\n"
        );
        let parsed = hozo_parser::parse_tsx(&source);
        let output = lower(&parsed.roots[0].node, &source, &Theme::default());
        assert!(output.diagnostics.is_empty(), "{class_name}: {:?}", output.diagnostics);
        assert!(output.jsx.contains(guard), "{class_name}: {}", output.jsx);
        assert!(output.jsx.contains(" aria-hidden"), "{class_name}: {}", output.jsx);
    }
}

#[test]
fn a_skeletons_descendants_animate_only_when_motion_is_allowed() {
    // Web's rule is `[data-hozo-skeleton], [data-hozo-skeleton] *`, so a
    // spinner inside a placeholder stops under reduced motion there. It
    // has to here too, at any depth, and outside a skeleton the same class
    // is not guarded.
    let compile = |element: &str| {
        let source =
            format!("import {{ Skeleton, View }} from '@hozo/core'\nconst el = {element}\n");
        let parsed = hozo_parser::parse_tsx(&source);
        lower(&parsed.roots[0].node, &source, &Theme::default())
    };
    for element in [
        r#"<Skeleton><View className="animate-spin" /></Skeleton>"#,
        r#"<Skeleton><View><View><View className="animate-spin" /></View></View></Skeleton>"#,
    ] {
        let output = compile(element);
        assert!(output.diagnostics.is_empty(), "{element}: {:?}", output.diagnostics);
        assert!(
            output.jsx.contains("__hozoEnv_motion_safe && __hozoAnim_spin"),
            "{element}: {}",
            output.jsx
        );
    }
    // Not guarded twice.
    let written = compile(r#"<Skeleton><View className="motion-safe:animate-spin" /></Skeleton>"#);
    assert_eq!(written.jsx.matches("__hozoEnv_motion_safe &&").count(), 1, "{}", written.jsx);
    // A sibling outside the skeleton keeps its ordinary animation.
    let outside =
        compile(r#"<View><Skeleton className="h-4" /><View className="animate-spin" /></View>"#);
    assert!(!outside.jsx.contains("__hozoEnv_motion_safe"), "{}", outside.jsx);
    assert!(outside.jsx.contains("__hozoAnim_spin"), "{}", outside.jsx);
}

#[test]
fn line_breaking_is_a_text_prop_where_android_has_one_and_a_warning_where_not() {
    // `text-balance` used to stop the Native build as a Web-only error,
    // for a utility that only moves where lines fall.
    let compile = |element: &str| {
        let source = format!("import {{ Text, View }} from '@hozo/core'\nconst el = {element}\n");
        let parsed = hozo_parser::parse_tsx(&source);
        lower(&parsed.roots[0].node, &source, &Theme::default())
    };
    let balanced = compile(r#"<Text className="text-balance">x</Text>"#);
    assert!(balanced.jsx.contains(r#"textBreakStrategy="balanced""#), "{}", balanced.jsx);
    assert!(balanced.diagnostics.is_empty(), "{:?}", balanced.diagnostics);
    let pretty = compile(r#"<Text className="text-pretty">x</Text>"#);
    assert!(pretty.jsx.contains(r#"textBreakStrategy="highQuality""#), "{}", pretty.jsx);
    // `break-keep` is iOS's `hangul-word` for the Korean it covers, and still
    // reported for the Chinese and Japanese it does not, and for Android.
    let keep = compile(r#"<Text className="break-keep">x</Text>"#);
    assert!(keep.jsx.contains(r#"lineBreakStrategyIOS="hangul-word""#), "{}", keep.jsx);
    assert!(
        keep.diagnostics.iter().any(|d| d.severity == hozo_ir::Severity::Warning && d.message.contains("Korean")),
        "{:?}",
        keep.diagnostics
    );
    assert!(!compile(r#"<View className="break-keep">x</View>"#).jsx.contains("lineBreakStrategyIOS"));
    assert!(!compile(r#"<Text className="md:break-keep">x</Text>"#).jsx.contains("lineBreakStrategyIOS"));

    for element in [
        r#"<Text className="break-keep">x</Text>"#,
        r#"<Text className="wrap-anywhere">x</Text>"#,
        r#"<Text className="[line-break:strict]">x</Text>"#,
        r#"<Text className="md:text-balance">x</Text>"#,
        r#"<View className="text-balance">x</View>"#,
    ] {
        let output = compile(element);
        assert!(!output.jsx.contains("textBreakStrategy"), "{element}: {}", output.jsx);
        assert!(
            !output.diagnostics.is_empty()
                && output.diagnostics.iter().all(|d| d.severity == hozo_ir::Severity::Warning),
            "{element}: {:?}",
            output.diagnostics
        );
    }
    // The platform's own behaviour already, so nothing to say.
    for element in [r#"<Text className="break-normal">x</Text>"#, r#"<Text className="text-wrap">x</Text>"#] {
        assert!(compile(element).diagnostics.is_empty(), "{element}");
    }
}

#[test]
fn a_chip_is_hozo_chip_and_its_class_lists_are_style_props() {
    // #787: on the Web a chip takes two class lists, one for itself and one
    // for its remove button. React Native hands a component styles, so both
    // become style props -- and neither may be dropped on the way.
    let compile = |element: &str| {
        let source = format!("import {{ Chip }} from '@hozo/core'\nconst el = {element}\n");
        let parsed = hozo_parser::parse_tsx(&source);
        lower(&parsed.roots[0].node, &source, &Theme::default())
    };
    let both = compile(
        r#"<Chip selected={on} onRemove={drop} disabled={busy} className="bg-red-500 text-white px-2 md:px-4" removeClassName="p-2">Remote</Chip>"#,
    );
    assert!(both.diagnostics.is_empty(), "{:?}", both.diagnostics);
    assert!(both.jsx.starts_with("<HozoChip "), "{}", both.jsx);
    assert!(both.runtime_imports.contains(&"HozoChip"), "{:?}", both.runtime_imports);
    assert!(both.jsx.contains("style={[hozoStyles.hozo0, __hozoBp_md && hozoStyles.hozo0_md]}"), "{}", both.jsx);
    assert!(both.jsx.contains("removeStyle={hozoStyles.hozo1}"), "{}", both.jsx);
    assert!(!both.jsx.contains("className"), "{}", both.jsx);
    // The pattern's own props, as written: `disabled` is not a host's state
    // to translate, and the label stays a string the pattern can name its
    // remove button from.
    assert!(both.jsx.contains("disabled={busy}") && both.jsx.contains("onRemove={drop}"), "{}", both.jsx);
    assert!(both.jsx.contains(">Remote</HozoChip>"), "{}", both.jsx);
    // The text colour stays with the chip, which hands it to its label.
    assert!(both.styles.contains("color: '#fff'"), "{}", both.styles);
    assert!(both.styles.contains("padding: 8") || both.styles.contains("paddingTop: 8"), "{}", both.styles);

    // An expression reaches the remove button before resolution, so it can
    // supply its state. An authored `removeStyle` still wins, last.
    let dynamic = compile(r#"<Chip onRemove={drop} removeClassName={tone} removeStyle={extra}>x</Chip>"#);
    assert!(dynamic.jsx.contains("removeClassName={tone}"), "{}", dynamic.jsx);
    assert!(dynamic.jsx.contains("removeStyle={extra}"), "{}", dynamic.jsx);
    assert!(!dynamic.jsx.contains("hozoClasses(tone)"), "{}", dynamic.jsx);
    assert!(
        dynamic.diagnostics.iter().any(|d| d.code == hozo_ir::DiagnosticCode::DynamicClassNameNotResolved),
        "{:?}",
        dynamic.diagnostics
    );

    // The remove button now consumes a compiler callback with its own state.
    let hovered = compile(r#"<Chip onRemove={drop} removeClassName="hover:bg-red-500">x</Chip>"#);
    assert!(hovered.diagnostics.is_empty(), "{:?}", hovered.diagnostics);
    assert!(hovered.jsx.contains("hozoRemoveStyle={({ pressed, hovered, focused, focusVisible, disabled: __hozoSlotDisabled, enabled: __hozoSlotEnabled, 'aria-pressed': __hozoSlotAriaPressed }) => [hovered && hozoStyles.hozo1_hover]}"), "{}", hovered.jsx);
}

#[test]
fn dynamic_secondary_pattern_classes_reach_only_registered_owners() {
    for (name, primitive) in [("Chip", Primitive::Chip), ("Pagination", Primitive::Pagination),
        ("ColorPicker", Primitive::ColorPicker), ("Stepper", Primitive::Stepper),
        ("CommandPalette", Primitive::CommandPalette), ("OtpInput", Primitive::OtpInput)] {
        for slot in primitive.class_slots() {
            let owned = crate::pattern::interaction_slot(primitive, slot.class_prop).is_some();
            let source = format!(
                "import {{ {} }} from '@hozo/core'; const el = <{} {}={{selectClasses()}} {}={{extra}} />",
                name, name, slot.class_prop, slot.style_prop,
            );
            let parsed = hozo_parser::parse_tsx(&source);
            let output = lower(&parsed.roots[0].node, &source, &Theme::default());
            assert_eq!(output.jsx.matches("selectClasses()").count(), 1, "{}", output.jsx);
            let warning = output.diagnostics.iter().find(|d| d.code == DiagnosticCode::DynamicClassNameNotResolved)
                .expect("dynamic candidates are not build-time validated");
            assert_eq!(warning.severity, hozo_ir::Severity::Warning);
            if owned {
                assert!(output.jsx.contains(&format!("{}={{selectClasses()}}", slot.class_prop)), "{}", output.jsx);
                assert!(output.jsx.contains(&format!("{}={{extra}}", slot.style_prop)), "{}", output.jsx);
                assert!(!output.jsx.contains("hozoClasses("), "{}", output.jsx);
                assert!(warning.message.contains("owner's available state"), "{}", warning.message);
            } else {
                assert!(output.jsx.contains("hozoClasses(selectClasses())"), "{}", output.jsx);
                assert!(!output.jsx.contains(&format!("{}=", slot.class_prop)), "{}", output.jsx);
                assert!(warning.message.contains("Conditional utilities can't"), "{}", warning.message);
            }
        }
    }
}

#[test]
fn chip_static_state_callbacks_keep_base_styles_and_explicit_overrides() {
    let source = r#"import { Chip } from '@hozo/core'
        const el = <Chip defaultSelected={false} onRemove={drop} disabled={busy}
            className="bg-red-500 hover:bg-blue-500 active:opacity-50 md:focus:opacity-25 not-hover:text-white focus-visible:outline-2"
            removeClassName="p-2 focus-visible:outline-2 motion-safe:hover:opacity-50"
            style={extra} removeStyle={removeExtra}>Remote</Chip>"#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(output.jsx.contains("hozoStyle={({ pressed, hovered, focused, focusVisible, disabled: __hozoSlotDisabled, enabled: __hozoSlotEnabled, 'aria-pressed': __hozoSlotAriaPressed }) => ["), "{}", output.jsx);
    for guard in ["hovered &&", "pressed &&", "__hozoBp_md && focused &&", "!(hovered) &&", "__hozoEnv_motion_safe && hovered &&"] {
        assert!(output.jsx.contains(guard), "{guard} missing from {}", output.jsx);
    }
    assert!(output.jsx.contains("style={[extra]}"), "{}", output.jsx);
    assert!(output.jsx.contains("removeStyle={removeExtra}"), "{}", output.jsx);
    assert!(output.styles.contains("color: '#fff'"), "{}", output.styles);
    assert!(output.prelude.iter().any(|line| line.contains("__hozoBp_md")), "{:?}", output.prelude);
    // These are static styles: no candidate-map lookup, per-slot hooks or
    // extra Pressable wrapping, and no state can escape into a Text child.
    assert!(!output.jsx.contains("hozoClasses(") && !output.jsx.contains("HozoText"), "{}", output.jsx);
}

#[test]
fn chip_root_residuals_use_the_same_owner_route_as_secondary_classes() {
    let compile = |classes: &str| {
        let source = format!("import {{ Chip, cx }} from '@hozo/core'; const el = <Chip className={{{classes}}} style={{extra}} />");
        let parsed = hozo_parser::parse_tsx(&source);
        lower(&parsed.roots[0].node, &source, &Theme::default())
    };
    let opaque = compile("chooseClasses()");
    assert!(opaque.jsx.contains("className={chooseClasses()}"), "{}", opaque.jsx);
    assert!(!opaque.jsx.contains("hozoClasses("), "{}", opaque.jsx);
    assert!(opaque.jsx.contains("style={[extra]}"), "{}", opaque.jsx);

    let mixed = compile("cx('p-2 hover:opacity-50 not-focus:rounded-lg md:mt-2', chooseClasses(), chooseOther())");
    assert_eq!(mixed.jsx.matches("chooseClasses()").count(), 1, "{}", mixed.jsx);
    assert_eq!(mixed.jsx.matches("chooseOther()").count(), 1, "{}", mixed.jsx);
    assert!(mixed.jsx.contains("hozoStyles.hozo0, __hozoBp_md && hozoStyles.hozo0_md, hozoClasses(__hozoClassSlot0Value0, __hozoClassSlot0State), hozoClasses(__hozoClassSlot0Value1, __hozoClassSlot0State), hovered &&"), "{}", mixed.jsx);
    assert!(mixed.jsx.contains("!(focused) &&"), "{}", mixed.jsx);
    assert!(mixed.jsx.contains("})((chooseClasses()), (chooseOther()))}"), "{}", mixed.jsx);
    assert!(!mixed.jsx.contains("className="), "{}", mixed.jsx);

    // Even without AOT declarations, several residual leaves must be
    // captured together rather than silently dropping all but the first.
    let multiple = compile("cx(chooseClasses(), chooseOther())");
    assert!(multiple.jsx.contains("hozoClasses(__hozoClassSlot0Value0, __hozoClassSlot0State), hozoClasses(__hozoClassSlot0Value1, __hozoClassSlot0State)"), "{}", multiple.jsx);
    assert_eq!(multiple.jsx.matches("chooseClasses()").count(), 1, "{}", multiple.jsx);
    assert_eq!(multiple.jsx.matches("chooseOther()").count(), 1, "{}", multiple.jsx);

    // An authored reference must not be shadowed by a capture/local name.
    let hygienic = compile("cx(__hozoClassSlot0State && 'hover:opacity-50', chooseClasses())");
    assert!(hygienic.jsx.contains("__hozoClassSlot1Value0"), "{}", hygienic.jsx);
    assert!(hygienic.jsx.contains("__hozoClassSlot0State"), "{}", hygienic.jsx);
}

#[test]
fn chip_semantic_predicates_read_the_class_owners_private_state() {
    let source = r#"import { Chip } from '@hozo/core'
      const el = <Chip defaultSelected={true} onRemove={maybeRemove}
        className="aria-pressed:bg-blue-500 not-aria-pressed:opacity-50 disabled:opacity-25 enabled:border-2 aria-pressed:hover:text-white aria-checked:outline-4 aria-disabled:border-4"
        removeClassName="disabled:opacity-25 enabled:border-2 aria-pressed:bg-red-500" />"#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    for guard in ["__hozoSlotAriaPressed &&", "!(__hozoSlotAriaPressed) &&", "__hozoSlotDisabled &&", "__hozoSlotEnabled &&", "__hozoSlotAriaPressed && hovered &&"] {
        assert!(output.jsx.contains(guard), "{guard}: {}", output.jsx);
    }
    assert!(output.jsx.contains("hozoRemoveStyle={({"), "{}", output.jsx);
    assert!(!output.jsx.contains("accessibilityState"), "RN announcements remain the pattern's job: {}", output.jsx);
    let unsupported = source.replace("aria-checked:outline-4", "aria-expanded:outline-4");
    let parsed = hozo_parser::parse_tsx(&unsupported);
    let output = lower(&parsed.roots[0].node, &unsupported, &Theme::default());
    assert!(output.diagnostics.iter().any(|d| d.code == DiagnosticCode::NotWiredOnNative), "{:?}", output.diagnostics);
}

#[test]
fn pagination_semantic_predicates_have_per_control_button_link_facts() {
    let source = r#"import { Pagination } from '@hozo/core'
      const el = <Pagination pageCount={3} getPageHref={maybeHref}
        itemClassName="disabled:opacity-25 enabled:border-2 aria-disabled:bg-red-500 not-aria-disabled:hover:text-white aria-selected:outline-4"
        currentItemClassName="disabled:opacity-50"
        disabledItemClassName="aria-disabled:border-4" />"#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    for guard in ["__hozoSlotDisabled &&", "__hozoSlotEnabled &&", "__hozoSlotAriaDisabled &&", "!(__hozoSlotAriaDisabled) && hovered &&"] {
        assert!(output.jsx.contains(guard), "{guard}: {}", output.jsx);
    }
    for callback in ["hozoItemStyle", "hozoCurrentItemStyle", "hozoDisabledItemStyle"] {
        assert!(output.jsx.contains(&format!("{callback}={{({{ pressed, hovered, focused, focusVisible, disabled: __hozoSlotDisabled, enabled: __hozoSlotEnabled, 'aria-disabled': __hozoSlotAriaDisabled }}")), "{}", output.jsx);
    }
    let unsupported = source.replace("aria-selected:outline-4", "aria-checked:outline-4");
    let parsed = hozo_parser::parse_tsx(&unsupported);
    let output = lower(&parsed.roots[0].node, &unsupported, &Theme::default());
    assert!(output.diagnostics.iter().any(|d| d.code == DiagnosticCode::NotWiredOnNative), "{:?}", output.diagnostics);
}

#[test]
fn pattern_state_callbacks_do_not_invent_other_slots_or_group_context() {
    for element in [
        r#"<Avatar name="Ada" statusClassName="hover:opacity-50" />"#,
        r#"<Chip onRemove={drop} removeClassName="group-hover:opacity-50">x</Chip>"#,
        r#"<Pressable accessibilityRole="button"><Chip defaultSelected={false} className="group-hover:opacity-50">x</Chip></Pressable>"#,
        r#"<View className="hover:opacity-50" />"#,
    ] {
        let source = format!("import {{ Chip, Avatar, View, Pressable }} from '@hozo/core'\nconst el = {element}");
        let parsed = hozo_parser::parse_tsx(&source);
        let output = lower(&parsed.roots[0].node, &source, &Theme::default());
        assert!(output.diagnostics.iter().any(|d| d.code == DiagnosticCode::NotWiredOnNative && d.severity == Severity::Error), "{element}: {:?}", output.diagnostics);
    }
}

#[test]
fn an_avatar_is_hozo_avatar_and_each_part_gets_its_style() {
    // #144: four class lists, one per part, each a style prop here; the
    // avatar keeps its text styles, which it hands to the initials.
    let source = r#"
        import { Avatar } from '@hozo/core'
        const el = <Avatar src={photo} name="Ada Lovelace" status="online" className="size-10 rounded-full bg-slate-200 text-slate-700" imageClassName="opacity-90" fallbackClassName="p-1" statusClassName="size-3 bg-green-500" />
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(output.jsx.starts_with("<HozoAvatar style={hozoStyles.hozo0}"), "{}", output.jsx);
    assert!(output.runtime_imports.contains(&"HozoAvatar"), "{:?}", output.runtime_imports);
    for prop in [
        "imageStyle={hozoStyles.hozo1}",
        "fallbackStyle={hozoStyles.hozo2}",
        "statusStyle={hozoStyles.hozo3}",
        "src={photo}",
        r#"status="online""#,
    ] {
        assert!(output.jsx.contains(prop), "{prop}: {}", output.jsx);
    }
    assert!(!output.jsx.contains("ClassName"), "{}", output.jsx);
    // The text colour stays on the avatar for its initials.
    let first = output.styles.split("hozo1").next().unwrap_or_default();
    assert!(first.contains("color:"), "{}", output.styles);
}

#[test]
fn a_pagination_is_hozo_pagination_with_a_style_per_state() {
    // #150: the current page and a disabled end are styled by class lists
    // the pattern applies, so each is a style prop here.
    let source = r#"
        import { Pagination } from '@hozo/core'
        const el = <Pagination page={page} pageCount={20} onPageChange={setPage} className="gap-1 text-sm" itemClassName="px-2" currentItemClassName="bg-blue-600 text-white" disabledItemClassName="opacity-50" ellipsisClassName="px-1" />
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(output.jsx.starts_with("<HozoPagination style={hozoStyles.hozo0}"), "{}", output.jsx);
    for prop in [
        "itemStyle={hozoStyles.hozo1}",
        "currentItemStyle={hozoStyles.hozo2}",
        "disabledItemStyle={hozoStyles.hozo3}",
        "ellipsisStyle={hozoStyles.hozo4}",
        "pageCount={20}",
    ] {
        assert!(output.jsx.contains(prop), "{prop}: {}", output.jsx);
    }
    assert!(output.runtime_imports.contains(&"HozoPagination"), "{:?}", output.runtime_imports);
}

#[test]
fn pagination_compiles_control_state_slots_not_the_row_or_ellipsis() {
    let compile = |props: &str| {
        let source = format!("import {{ Pagination }} from '@hozo/core'\nconst el = <Pagination pageCount={{20}} {props} />");
        let parsed = hozo_parser::parse_tsx(&source);
        lower(&parsed.roots[0].node, &source, &Theme::default())
    };
    let output = compile(r#"itemClassName="px-2 hover:text-white active:opacity-50" currentItemClassName="bg-red-500 focus-visible:outline-4" disabledItemClassName="opacity-25 not-hover:border-2" itemStyle={extra} currentItemStyle={currentExtra} disabledItemStyle={disabledExtra}"#);
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    for prop in ["hozoItemStyle", "hozoCurrentItemStyle", "hozoDisabledItemStyle"] {
        assert!(output.jsx.contains(&format!("{prop}={{({{ pressed, hovered, focused, focusVisible, disabled: __hozoSlotDisabled, enabled: __hozoSlotEnabled, 'aria-disabled': __hozoSlotAriaDisabled }}) => [")), "{}", output.jsx);
    }
    for expected in ["hovered &&", "pressed &&", "focusVisible &&", "!(hovered) &&", "itemStyle={extra}", "currentItemStyle={currentExtra}", "disabledItemStyle={disabledExtra}"] {
        assert!(output.jsx.contains(expected), "{expected} missing from {}", output.jsx);
    }
    for slot in ["className", "ellipsisClassName"] {
        let output = compile(&format!(r#"{slot}="focus-visible:outline-2""#));
        assert!(output.diagnostics.iter().any(|d| d.code == DiagnosticCode::NotWiredOnNative && d.severity == Severity::Error), "{slot}: {:?}", output.diagnostics);
    }
}

#[test]
fn stepper_compiles_only_authored_button_slots_and_scopes_negation_to_that_owner() {
    let compile = |props: &str| {
        let source = format!("import {{ Stepper }} from '@hozo/core'\nconst el = <Stepper steps={{steps}} activeStep={{1}} {props} />");
        let parsed = hozo_parser::parse_tsx(&source);
        lower(&parsed.roots[0].node, &source, &Theme::default())
    };
    let output = compile(r#"onStepPress={handler} stepClassName="px-2 hover:text-white active:opacity-50 not-hover:border-2" completedStepClassName="focus:bg-blue-500" currentStepClassName="bg-red-500 focus-visible:outline-4" errorStepClassName="md:not-hover:opacity-25" stepStyle={extra} currentStepStyle={currentExtra}"#);
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    for prop in ["hozoStepStyle", "hozoCompletedStepStyle", "hozoCurrentStepStyle", "hozoErrorStepStyle"] {
        assert!(output.jsx.contains(&format!("{prop}={{({{ pressed, hovered, focused, focusVisible, interactionAvailable, disabled: __hozoSlotDisabled, enabled: __hozoSlotEnabled }}) => [")), "{}", output.jsx);
    }
    for expected in ["(interactionAvailable && hovered) &&", "(interactionAvailable && pressed) &&", "(interactionAvailable && !(hovered)) &&", "(interactionAvailable && focused) &&", "(interactionAvailable && focusVisible) &&", "stepStyle={extra}", "currentStepStyle={currentExtra}"] {
        assert!(output.jsx.contains(expected), "{expected} missing from {}", output.jsx);
    }
    for slot in ["stepClassName", "completedStepClassName", "currentStepClassName", "errorStepClassName"] {
        for condition in ["hover", "not-hover", "md:not-focus-visible"] {
            let output = compile(&format!(r#"{slot}="{condition}:opacity-50""#));
            assert!(output.diagnostics.iter().any(|d| d.code == DiagnosticCode::NotWiredOnNative && d.severity == Severity::Error && d.message.contains("onStepPress")), "{slot}/{condition}: {:?}", output.diagnostics);
            assert!(!output.jsx.contains("interactionAvailable"), "{}", output.jsx);
        }
    }
    // Even with a handler, the ol and decorative spans are not step buttons.
    for slot in ["className", "indicatorClassName", "completedIndicatorClassName", "currentIndicatorClassName", "errorIndicatorClassName", "descriptionClassName"] {
        let output = compile(&format!(r#"onStepPress={{handler}} {slot}="not-focus-visible:outline-2""#));
        assert!(output.diagnostics.iter().any(|d| d.code == DiagnosticCode::NotWiredOnNative && d.severity == Severity::Error), "{slot}: {:?}", output.diagnostics);
    }
    for condition in ["aria-checked", "not-aria-expanded", "hover:aria-pressed"] {
        let output = compile(&format!(r#"onStepPress={{handler}} stepClassName="{condition}:opacity-50""#));
        assert!(output.diagnostics.iter().any(|d| d.code == DiagnosticCode::NotWiredOnNative && d.severity == Severity::Error), "{condition}: {:?}", output.diagnostics);
    }
}

#[test]
fn stepper_semantics_describe_the_class_owner_even_without_a_button() {
    for slot in ["stepClassName", "completedStepClassName", "currentStepClassName", "errorStepClassName"] {
        let source = format!(r#"import {{ Stepper }} from '@hozo/core'
          const el = <Stepper steps={{steps}} activeStep={{0}}
            {slot}="px-2 disabled:opacity-50 enabled:border-2 not-disabled:bg-blue-500 not-enabled:outline-4 not-aria-selected:font-bold not-aria-disabled:text-red-500 disabled:not-enabled:underline"
            />"#);
        let parsed = hozo_parser::parse_tsx(&source);
        let output = lower(&parsed.roots[0].node, &source, &Theme::default());
        assert!(output.diagnostics.is_empty(), "{slot}: {:?}", output.diagnostics);
        for predicate in ["__hozoSlotDisabled &&", "__hozoSlotEnabled &&", "!(__hozoSlotDisabled) &&", "!(__hozoSlotEnabled) &&", "__hozoSlotDisabled && !(__hozoSlotEnabled) &&"] {
            assert!(output.jsx.contains(predicate), "{predicate}: {}", output.jsx);
        }
        // The callback needs local facts, not an event-owner gate around all
        // entries: descriptive rows must match both negative pseudo-classes.
        assert!(!output.jsx.contains("interactionAvailable &&"), "{}", output.jsx);
        assert!(output.styles.contains("fontWeight: '700'") && output.styles.contains("color: '#fb2c36'"), "{}", output.styles);
    }
    let source = r#"import { Stepper } from '@hozo/core'
      const el = <Stepper steps={steps} activeStep={0} onStepPress={handler}
        stepClassName="not-disabled:not-hover:opacity-50" />"#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(output.jsx.contains("(interactionAvailable && !(hovered))"), "{}", output.jsx);
    assert!(output.jsx.contains("!(__hozoSlotDisabled)"), "{}", output.jsx);
}

#[test]
fn text_input_focus_styles_use_the_field_and_keep_value_typography() {
    let compile = |props: &str| {
        let source = format!("import {{ TextInput }} from '@hozo/core'\nfunction C() {{ return <TextInput accessibilityLabel=\"Field\" {props} /> }}");
        let parsed = hozo_parser::parse_tsx(&source);
        lower(&parsed.roots[0].node, &source, &Theme::default())
    };
    let plain = compile(r#"className="text-red-500 text-sm border""#);
    assert!(plain.diagnostics.is_empty(), "{:?}", plain.diagnostics);
    assert!(plain.jsx.starts_with("<TextInput style="), "{}", plain.jsx);
    assert!(plain.runtime_imports.is_empty(), "{:?}", plain.runtime_imports);
    assert!(plain.styles.contains("color: '#fb2c36'"), "{}", plain.styles);
    assert!(plain.styles.contains("fontSize: 14"), "{}", plain.styles);
    let output = compile(r#"className="px-2 text-red-500 focus:text-blue-500 focus-visible:outline-4 not-focus:opacity-50 md:not-focus-visible:outline-1" style={extra} ref={input} onFocus={focused} onBlur={blurred}"#);
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(output.jsx.starts_with("<HozoTextInput ") && output.jsx.contains("hozoStyle="), "{}", output.jsx);
    assert!(output.runtime_imports.contains(&"HozoTextInput"), "{:?}", output.runtime_imports);
    for expected in ["focused &&", "focusVisible &&", "!(focused) &&", "!(focusVisible)", "style={[extra]}", "ref={input}", "onFocus={focused}", "onBlur={blurred}"] {
        assert!(output.jsx.contains(expected), "{expected} missing from {}", output.jsx);
    }
    assert!(output.styles.contains("color: '#2b7fff'"), "{}", output.styles);
    assert!(!output.jsx.contains("HozoPressable") && !output.jsx.contains("HozoText "), "{}", output.jsx);
    for condition in ["hover", "active", "not-hover", "md:not-active", "hover:focus-visible", "not-focus-within"] {
        let output = compile(&format!(r#"className="{condition}:opacity-50""#));
        assert!(output.diagnostics.iter().any(|d| d.code == DiagnosticCode::NotWiredOnNative && d.severity == Severity::Error), "{condition}: {:?}", output.diagnostics);
    }
}

#[test]
fn runtime_text_input_classes_receive_only_field_focus_facts() {
    let source = "import { TextInput } from '@hozo/core'; function C({extra}) {return <TextInput accessibilityLabel=\"Field\" className={extra} style={custom} ref={input} />}";
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.iter().all(|d| d.code == DiagnosticCode::DynamicClassNameNotResolved), "{:?}", output.diagnostics);
    assert!(output.jsx.starts_with("<HozoTextInput "), "{}", output.jsx);
    assert!(output.jsx.contains("hozoClasses(extra, { focused, focusVisible })"), "{}", output.jsx);
    for expected in ["hozoStyle=", "style={[custom]}", "ref={input}"] {
        assert!(output.jsx.contains(expected), "{}", output.jsx);
    }
    assert!(!output.jsx.contains("hozoClasses(extra, { pressed"), "{}", output.jsx);
}

#[test]
fn a_stepper_is_hozo_stepper_with_a_style_per_status() {
    let source = r#"
        import { Stepper } from '@hozo/core'
        const el = <Stepper steps={steps} activeStep={1} className="gap-2" currentStepClassName="font-bold" completedIndicatorClassName="bg-blue-600" errorIndicatorClassName="bg-red-600" />
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(output.jsx.starts_with("<HozoStepper style={hozoStyles.hozo0}"), "{}", output.jsx);
    for prop in [
        "currentStepStyle={hozoStyles.hozo1}",
        "completedIndicatorStyle={hozoStyles.hozo2}",
        "errorIndicatorStyle={hozoStyles.hozo3}",
        "steps={steps}",
        "activeStep={1}",
    ] {
        assert!(output.jsx.contains(prop), "{prop}: {}", output.jsx);
    }
    assert!(output.runtime_imports.contains(&"HozoStepper"), "{:?}", output.runtime_imports);
}

#[test]
fn a_table_is_runtime_parts_whose_cells_keep_their_text_styles() {
    // #144: a cell is nearly always `{row.price}`, so its text styles stay
    // on the cell, which wraps its own content in a Text; a header cell is
    // the same component told it is one.
    let source = r#"
        import { Table, TableBody, TableRow, TableHead, TableCell } from '@hozo/core'
        const el = <Table className="w-full"><TableBody><TableRow><TableHead scope="row">{name}</TableHead><TableCell className="text-right font-bold">{price}</TableCell></TableRow></TableBody></Table>
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(output.jsx.starts_with("<HozoTable style={hozoStyles.hozo0}>"), "{}", output.jsx);
    assert!(output.jsx.contains(r#"<HozoTableSection section="body">"#), "{}", output.jsx);
    assert!(output.jsx.contains(r#"<HozoTableCell head scope="row">{name}</HozoTableCell>"#), "{}", output.jsx);
    assert!(output.jsx.contains("{price}</HozoTableCell>"), "{}", output.jsx);
    assert!(!output.jsx.contains("<Text"), "{}", output.jsx);
    assert!(output.styles.contains("textAlign: 'right'"), "{}", output.styles);
    for name in ["HozoTable", "HozoTableSection", "HozoTableRow", "HozoTableCell"] {
        assert!(output.runtime_imports.contains(&name), "{name}: {:?}", output.runtime_imports);
    }
}

#[test]
fn otp_input_focus_belongs_to_the_field_not_wrapper_or_virtual_cells() {
    let compile = |props: &str| {
        let source = format!("import {{ OtpInput }} from '@hozo/core'\nconst el = <OtpInput accessibilityLabel=\"Code\" {props} />");
        let parsed = hozo_parser::parse_tsx(&source);
        lower(&parsed.roots[0].node, &source, &Theme::default())
    };
    let output = compile(r#"disabled={blocked} inputClassName="rounded-lg focus:outline-2 focus-visible:outline-4 not-focus:opacity-50 md:not-focus-visible:outline-1 disabled:opacity-25" inputStyle={extra}"#);
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(output.jsx.contains("hozoInputStyle={({ pressed, hovered, focused, focusVisible, disabled: __hozoSlotDisabled, enabled: __hozoSlotEnabled, readOnly: __hozoSlotReadOnly }) => ["), "{}", output.jsx);
    for expected in ["focused &&", "focusVisible &&", "!(focused) &&", "!(focusVisible)", "inputStyle={extra}", "disabled={blocked}"] {
        assert!(output.jsx.contains(expected), "{expected} missing from {}", output.jsx);
    }
    let base = compile(r#"inputClassName="rounded-lg""#);
    assert!(base.diagnostics.is_empty(), "{:?}", base.diagnostics);
    assert!(base.jsx.contains("inputStyle={hozoStyles.hozo1}"), "{}", base.jsx);
    assert!(!base.jsx.contains("hozoInputStyle"), "{}", base.jsx);
    for slot in ["className", "cellClassName", "activeCellClassName", "filledCellClassName"] {
        for condition in ["focus", "not-focus-visible", "md:not-focus"] {
            let output = compile(&format!(r#"{slot}="{condition}:outline-2""#));
            assert!(output.diagnostics.iter().any(|d| d.code == DiagnosticCode::NotWiredOnNative && d.severity == Severity::Error), "{slot}/{condition}: {:?}", output.diagnostics);
        }
    }
    for condition in ["hover", "active", "not-hover", "md:not-active"] {
        let output = compile(&format!(r#"inputClassName="{condition}:opacity-50""#));
        assert!(output.diagnostics.iter().any(|d| d.code == DiagnosticCode::NotWiredOnNative && d.severity == Severity::Error && d.message.contains("different owner")), "{condition}: {:?}", output.diagnostics);
        assert!(!output.jsx.contains("hozoInputStyle"), "{}", output.jsx);
    }
}

#[test]
fn otp_input_semantics_use_internal_field_facts_without_authored_drivers() {
    let source = r#"import { OtpInput } from '@hozo/core'
        const el = <OtpInput accessibilityLabel="Code"
          inputClassName="disabled:opacity-25 enabled:rounded-lg read-only:outline-2 not-read-only:outline-4 not-disabled:outline-offset-2 not-enabled:outline-offset-4 read-only:focus:opacity-50 aria-disabled:border-8 not-aria-disabled:border-2" />"#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    for expected in ["disabled: __hozoSlotDisabled", "enabled: __hozoSlotEnabled", "readOnly: __hozoSlotReadOnly", "__hozoSlotDisabled &&", "__hozoSlotEnabled &&", "__hozoSlotReadOnly &&", "!(__hozoSlotReadOnly) &&", "__hozoSlotReadOnly && focused &&"] {
        assert!(output.jsx.contains(expected), "{expected}: {}", output.jsx);
    }
    for slot in ["className", "cellClassName", "activeCellClassName", "filledCellClassName"] {
        let source = format!(r#"import {{ OtpInput }} from '@hozo/core'
            const el = <OtpInput accessibilityLabel="Code" disabled
              {slot}="disabled:opacity-25 enabled:outline-8 read-only:rounded-lg not-read-only:opacity-50 not-disabled:border-2 not-enabled:pt-1 aria-disabled:outline-8" />"#);
        let parsed = hozo_parser::parse_tsx(&source);
        let output = lower(&parsed.roots[0].node, &source, &Theme::default());
        assert!(output.diagnostics.is_empty(), "{slot}: {:?}", output.diagnostics);
        assert!(!output.jsx.contains("__hozoSlotDisabled") && !output.jsx.contains("__hozoSlotReadOnly"), "constants need no callback: {}", output.jsx);
    }
    for (slot, variant) in [("cellClassName", "aria-expanded"), ("activeCellClassName", "aria-expanded"), ("filledCellClassName", "not-aria-expanded"), ("inputClassName", "not-aria-expanded")] {
        let source = format!(r#"import {{ OtpInput }} from '@hozo/core'
            const el = <OtpInput accessibilityLabel="Code" {slot}="{variant}:opacity-50" />"#);
        let parsed = hozo_parser::parse_tsx(&source);
        let output = lower(&parsed.roots[0].node, &source, &Theme::default());
        assert!(output.diagnostics.iter().any(|d| d.code == DiagnosticCode::NotWiredOnNative && d.severity == Severity::Error), "{slot}/{variant}: {:?}", output.diagnostics);
    }
}

#[test]
fn an_otp_input_is_hozo_otp_input_with_a_style_per_cell_state() {
    let source = r#"
        import { OtpInput } from '@hozo/core'
        const el = <OtpInput length={6} onComplete={verify} accessibilityLabel="Verification code" className="gap-2" cellClassName="size-10 border text-lg" activeCellClassName="border-blue-600" filledCellClassName="bg-slate-100" />
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(output.jsx.starts_with("<HozoOtpInput style={hozoStyles.hozo0}"), "{}", output.jsx);
    for prop in [
        "cellStyle={hozoStyles.hozo1}",
        "activeCellStyle={hozoStyles.hozo2}",
        "filledCellStyle={hozoStyles.hozo3}",
        "onComplete={verify}",
    ] {
        assert!(output.jsx.contains(prop), "{prop}: {}", output.jsx);
    }
    assert!(output.runtime_imports.contains(&"HozoOtpInput"), "{:?}", output.runtime_imports);
}

#[test]
fn an_image_srcset_of_widths_is_said_to_be_density_only_on_native() {
    // React Native picks a `srcSet` candidate by density and skips a width
    // descriptor at runtime, so a set of widths can draw nothing on device.
    let compile = |src_set: &str| {
        let source = format!(
            "import {{ Image }} from '@hozo/core'\nconst el = <Image src=\"a.jpg\" srcSet=\"{src_set}\" alt=\"A\" />\n"
        );
        let parsed = hozo_parser::parse_tsx(&source);
        lower(&parsed.roots[0].node, &source, &Theme::default())
    };
    let widths = compile("a-400.jpg 400w, a-800.jpg 800w");
    assert!(
        widths.diagnostics.iter().any(|d| d.code == hozo_ir::DiagnosticCode::NotWiredOnNative
            && d.severity == hozo_ir::Severity::Warning
            && d.message.contains("density")),
        "{:?}",
        widths.diagnostics
    );
    // Passed through either way: React Native reads it.
    assert!(widths.jsx.contains(r#"srcSet="a-400.jpg 400w, a-800.jpg 800w""#), "{}", widths.jsx);
    let densities = compile("a.jpg 1x, a@2x.jpg 2x");
    assert!(densities.diagnostics.is_empty(), "{:?}", densities.diagnostics);
}

#[test]
fn a_command_palette_is_hozo_command_palette_with_a_style_per_part() {
    let source = r#"
        import { CommandPalette } from '@hozo/core'
        const el = <CommandPalette open={open} onOpenChange={setOpen} commands={commands} panelClassName="bg-white text-sm" itemClassName="px-3" activeItemClassName="bg-slate-100" groupHeadingClassName="text-xs" />
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(output.jsx.starts_with("<HozoCommandPalette "), "{}", output.jsx);
    for prop in [
        // Numbered in the slot table's order, not the order they were written.
        "panelStyle={hozoStyles.hozo1}",
        "groupHeadingStyle={hozoStyles.hozo2}",
        "itemStyle={hozoStyles.hozo3}",
        "activeItemStyle={hozoStyles.hozo4}",
        "commands={commands}",
        "onOpenChange={setOpen}",
    ] {
        assert!(output.jsx.contains(prop), "{prop}: {}", output.jsx);
    }
    assert!(output.runtime_imports.contains(&"HozoCommandPalette"), "{:?}", output.runtime_imports);
}

#[test]
fn command_item_pointer_states_compile_without_inventing_input_focus() {
    let source = r#"import { CommandPalette } from '@hozo/core'
        const el = <CommandPalette open commands={commands}
            itemClassName="px-2 hover:bg-blue-500 active:opacity-50 not-hover:text-white md:hover:text-black"
            activeItemClassName="border-2 hover:opacity-75 active:opacity-25"
            itemStyle={extra} activeItemStyle={activeExtra} />"#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    for prop in ["hozoItemStyle", "hozoActiveItemStyle"] {
        assert!(output.jsx.contains(&format!("{prop}={{({{ pressed, hovered, focused, focusVisible, 'aria-disabled': __hozoSlotAriaDisabled, 'aria-selected': __hozoSlotAriaSelected }}) => [")), "{}", output.jsx);
    }
    for expected in ["hovered &&", "pressed &&", "!(hovered) &&", "__hozoBp_md && hovered &&", "itemStyle={extra}", "activeItemStyle={activeExtra}"] {
        assert!(output.jsx.contains(expected), "{expected} missing from {}", output.jsx);
    }
    assert!(!output.jsx.contains("hozoClasses(") && !output.jsx.contains("HozoPressable"), "{}", output.jsx);
}

#[test]
fn command_option_semantics_are_not_native_button_pseudo_classes() {
    for slot in ["itemClassName", "activeItemClassName"] {
        let source = format!(r#"import {{ CommandPalette }} from '@hozo/core'
            const el = <CommandPalette commands={{commands}}
              {slot}="disabled:ml-8 enabled:mr-8 not-disabled:mt-1 not-enabled:mb-1 aria-selected:border-2 not-aria-selected:opacity-50 aria-disabled:rounded-lg not-aria-disabled:pt-1 aria-selected:hover:text-white aria-checked:outline-8 not-aria-checked:pb-1" />"#);
        let parsed = hozo_parser::parse_tsx(&source);
        let output = lower(&parsed.roots[0].node, &source, &Theme::default());
        assert!(output.diagnostics.is_empty(), "{slot}: {:?}", output.diagnostics);
        for expected in ["__hozoSlotAriaSelected &&", "!(__hozoSlotAriaSelected) &&", "__hozoSlotAriaDisabled &&", "!(__hozoSlotAriaDisabled) &&", "__hozoSlotAriaSelected && hovered &&"] {
            assert!(output.jsx.contains(expected), "{expected}: {}", output.jsx);
        }
        // Neither positive pseudo-class applies to the div, but its negations
        // do. No outer prop or Native button state is consulted for them.
        assert!(!output.jsx.contains("__hozoSlotDisabled") && !output.jsx.contains("__hozoSlotEnabled"), "{}", output.jsx);
        assert!(output.styles.contains("marginTop: 4") && output.styles.contains("marginBottom: 4"), "{}", output.styles);
        let unsupported = source.replace("not-aria-checked:pb-1", "not-aria-expanded:pb-1");
        let parsed = hozo_parser::parse_tsx(&unsupported);
        let output = lower(&parsed.roots[0].node, &unsupported, &Theme::default());
        assert!(output.diagnostics.iter().any(|d| d.code == DiagnosticCode::NotWiredOnNative && d.severity == Severity::Error), "{:?}", output.diagnostics);
    }
    for slot in ["className", "scrimClassName", "panelClassName", "inputClassName", "listClassName", "shortcutClassName", "groupHeadingClassName", "emptyClassName"] {
        let source = format!(r#"import {{ CommandPalette }} from '@hozo/core'
            const el = <CommandPalette commands={{commands}} {slot}="aria-selected:opacity-50" />"#);
        let parsed = hozo_parser::parse_tsx(&source);
        let output = lower(&parsed.roots[0].node, &source, &Theme::default());
        assert!(output.diagnostics.iter().any(|d| d.code == DiagnosticCode::NotWiredOnNative && d.severity == Severity::Error), "{slot}: {:?}", output.diagnostics);
    }
}

#[test]
fn command_item_focus_is_refused_alone_stacked_and_negated() {
    for slot in ["itemClassName", "activeItemClassName"] {
        for variant in ["focus", "focus-visible", "not-focus", "not-focus-visible", "hover:focus", "md:not-focus-visible"] {
            let source = format!(r#"import {{ CommandPalette }} from '@hozo/core'; const el = <CommandPalette commands={{commands}} {slot}="{variant}:opacity-50" />"#);
            let parsed = hozo_parser::parse_tsx(&source);
            let output = lower(&parsed.roots[0].node, &source, &Theme::default());
            assert!(output.diagnostics.iter().any(|d| d.code == DiagnosticCode::NotWiredOnNative && d.severity == Severity::Error && d.message.contains("Web input keeps focus")), "{slot} {variant}: {:?}", output.diagnostics);
            assert!(!output.jsx.contains("_focus"), "a refused predicate must not apply: {}", output.jsx);
        }
    }
    for slot in ["className", "scrimClassName", "panelClassName", "inputClassName", "shortcutClassName", "groupHeadingClassName", "emptyClassName"] {
        let source = format!(r#"import {{ CommandPalette }} from '@hozo/core'; const el = <CommandPalette commands={{commands}} {slot}="hover:opacity-50" />"#);
        let parsed = hozo_parser::parse_tsx(&source);
        let output = lower(&parsed.roots[0].node, &source, &Theme::default());
        assert!(output.diagnostics.iter().any(|d| d.code == DiagnosticCode::NotWiredOnNative && d.severity == Severity::Error), "{slot}: {:?}", output.diagnostics);
    }
}

#[test]
fn a_color_picker_is_hozo_color_picker_with_a_style_per_part() {
    let source = r#"
        import { ColorPicker } from '@hozo/core'
        const el = <ColorPicker value={color} onChange={setColor} presets={presets} accessibilityLabel="Theme" swatchClassName="size-8" selectedSwatchClassName="border-2" sliderClassName="h-3" thumbClassName="size-5" inputClassName="px-2" />
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(output.jsx.starts_with("<HozoColorPicker "), "{}", output.jsx);
    for prop in [
        "swatchStyle={hozoStyles.hozo1}",
        "selectedSwatchStyle={hozoStyles.hozo2}",
        "sliderStyle={hozoStyles.hozo3}",
        "thumbStyle={hozoStyles.hozo4}",
        "inputStyle={hozoStyles.hozo5}",
        "presets={presets}",
    ] {
        assert!(output.jsx.contains(prop), "{prop}: {}", output.jsx);
    }
    assert!(output.runtime_imports.contains(&"HozoColorPicker"), "{:?}", output.runtime_imports);
}

#[test]
fn color_picker_compiles_only_the_slots_with_real_swatch_interaction() {
    let compile = |props: &str| {
        let source = format!("import {{ ColorPicker }} from '@hozo/core'\nconst el = <ColorPicker accessibilityLabel=\"Theme\" {props} />");
        let parsed = hozo_parser::parse_tsx(&source);
        lower(&parsed.roots[0].node, &source, &Theme::default())
    };
    let output = compile(r#"swatchClassName="size-8 hover:opacity-50 not-focus:border-2" selectedSwatchClassName="border-2 md:focus-visible:outline-2" swatchStyle={extra} selectedSwatchStyle={selectedExtra}"#);
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    for expected in [
        "hozoSwatchStyle={({ pressed, hovered, focused, focusVisible, disabled: __hozoSlotDisabled, enabled: __hozoSlotEnabled, 'aria-checked': __hozoSlotAriaChecked }) => [",
        "hozoSelectedSwatchStyle={({ pressed, hovered, focused, focusVisible, disabled: __hozoSlotDisabled, enabled: __hozoSlotEnabled, 'aria-checked': __hozoSlotAriaChecked }) => [",
        "hovered &&", "!(focused) &&", "__hozoBp_md && focusVisible &&",
        "swatchStyle={extra}", "selectedSwatchStyle={selectedExtra}",
    ] {
        assert!(output.jsx.contains(expected), "{expected} missing from {}", output.jsx);
    }
    for slot in ["className", "sliderClassName", "thumbClassName", "inputClassName"] {
        let output = compile(&format!(r#"{slot}="hover:opacity-50""#));
        assert!(output.diagnostics.iter().any(|d| d.code == DiagnosticCode::NotWiredOnNative && d.severity == Severity::Error), "{slot}: {:?}", output.diagnostics);
    }
}

#[test]
fn color_picker_semantics_belong_to_each_radio_not_the_group() {
    for slot in ["swatchClassName", "selectedSwatchClassName"] {
        let source = format!(r#"import {{ ColorPicker }} from '@hozo/core'
          const el = <ColorPicker accessibilityLabel="Theme"
            {slot}="disabled:opacity-25 enabled:border-2 not-disabled:mt-1 not-enabled:mb-1 aria-checked:outline-4 not-aria-checked:rounded-lg not-aria-disabled:pt-1 not-aria-selected:pb-1 aria-checked:hover:opacity-50 disabled:not-enabled:border-4" />"#);
        let parsed = hozo_parser::parse_tsx(&source);
        let output = lower(&parsed.roots[0].node, &source, &Theme::default());
        assert!(output.diagnostics.is_empty(), "{slot}: {:?}", output.diagnostics);
        for expected in ["disabled: __hozoSlotDisabled", "enabled: __hozoSlotEnabled", "'aria-checked': __hozoSlotAriaChecked", "__hozoSlotDisabled &&", "__hozoSlotEnabled &&", "!(__hozoSlotDisabled) &&", "!(__hozoSlotEnabled) &&", "!(__hozoSlotAriaChecked) &&", "__hozoSlotAriaChecked && hovered &&"] {
            assert!(output.jsx.contains(expected), "{expected}: {}", output.jsx);
        }
        assert!(!output.jsx.contains("interactionAvailable"), "{}", output.jsx);
        // A truly unknown state is still an error, including under negation.
        let unsupported = source.replace("not-aria-selected:pb-1", "not-aria-expanded:pb-1");
        let parsed = hozo_parser::parse_tsx(&unsupported);
        let output = lower(&parsed.roots[0].node, &unsupported, &Theme::default());
        assert!(output.diagnostics.iter().any(|d| d.code == DiagnosticCode::NotWiredOnNative && d.severity == Severity::Error), "{:?}", output.diagnostics);
    }
    // No ARIA facts are invented for the group, track, thumb or hex field.
    for slot in ["className", "sliderClassName", "thumbClassName", "inputClassName"] {
        let source = format!(r#"import {{ ColorPicker }} from '@hozo/core'
          const el = <ColorPicker accessibilityLabel="Theme" {slot}="aria-checked:opacity-50" />"#);
        let parsed = hozo_parser::parse_tsx(&source);
        let output = lower(&parsed.roots[0].node, &source, &Theme::default());
        assert!(output.diagnostics.iter().any(|d| d.code == DiagnosticCode::NotWiredOnNative && d.severity == Severity::Error), "{slot}: {:?}", output.diagnostics);
    }
}

/// A radius only the project's theme defines (`--radius-hozo-control`),
/// which `@hozo/ui` writes on nearly every component.
#[test]
fn a_theme_radius_is_its_value_and_an_unknown_one_is_nothing() {
    let theme = Theme::default().with_radii(std::collections::HashMap::from([("hozo-control".to_string(), 8.0)]));
    let compile = |class_name: &str| {
        let source = format!("import {{ View }} from '@hozo/core'\nconst el = <View className=\"{class_name}\" />");
        let parsed = hozo_parser::parse_tsx(&source);
        lower(&parsed.roots[0].node, &source, &theme)
    };

    let output = compile("rounded-hozo-control rounded-ss-hozo-control");
    assert!(output.styles.contains("borderRadius: 8,"), "{}", output.styles);
    assert!(output.styles.contains("borderStartStartRadius: 8,"), "{}", output.styles);
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);

    let output = compile("rounded-unknown");
    assert!(!output.styles.contains("Radius"), "{}", output.styles);
}

#[test]
fn standard_radius_scales_prefer_the_theme_with_unchanged_defaults() {
    for (name, fallback_px) in [("xs", 2.0), ("sm", 4.0), ("md", 6.0), ("lg", 8.0),
                               ("xl", 12.0), ("2xl", 16.0), ("3xl", 24.0), ("4xl", 32.0)] {
        let source = format!("import {{ View }} from '@hozo/core'; const el = <View className=\"rounded-{name}\" />");
        let parsed = hozo_parser::parse_tsx(&source);
        let compile = |theme: &Theme| lower(&parsed.roots[0].node, &source, theme);
        let default = compile(&Theme::default());
        assert!(default.styles.contains(&format!("borderRadius: {fallback_px},")), "{}", default.styles);
        let same = Theme::default().with_radii(std::collections::HashMap::from([(name.to_string(), fallback_px)]));
        assert_eq!(compile(&same).styles, default.styles);
        let themed = Theme::default().with_radii(std::collections::HashMap::from([(name.to_string(), 10.0)]));
        let out = compile(&themed);
        assert!(out.styles.contains("borderRadius: 10,"), "{}", out.styles);
        assert!(out.diagnostics.is_empty(), "{:?}", out.diagnostics);
    }
}

#[test]
fn scale_overrides_reach_corners_but_not_fixed_or_arbitrary_radii() {
    let theme = Theme::default().with_radii(std::collections::HashMap::from([
        ("lg".to_string(), 10.0), ("sm".to_string(), 0.0),
        ("none".to_string(), 20.0), ("full".to_string(), 20.0),
    ]));
    let compile = |class_name: &str, theme: &Theme| {
        let source = format!("import {{ View }} from '@hozo/core'; const el = <View className=\"{class_name}\" />");
        let parsed = hozo_parser::parse_tsx(&source);
        lower(&parsed.roots[0].node, &source, theme)
    };
    let out = compile("rounded-t-lg rounded-ee-lg", &theme);
    for property in ["borderTopLeftRadius", "borderTopRightRadius", "borderEndEndRadius"] {
        assert!(out.styles.contains(&format!("{property}: 10,")), "{}", out.styles);
    }
    assert!(compile("rounded-sm", &theme).styles.contains("borderRadius: 0,"));
    for class_name in ["rounded", "rounded-none", "rounded-full", "rounded-[8px]"] {
        assert_eq!(compile(class_name, &theme).styles, compile(class_name, &Theme::default()).styles);
    }
}

/// A pressable whose label arrives as `children` hands its text styles to
/// `HozoPressable` rather than dropping them with a warning (#876); a View
/// has nothing to hand them to, and still says so.
#[test]
fn a_pressable_with_an_unseen_label_forwards_its_text_styles() {
    let source = "import { Button, View } from '@hozo/core'\nconst el = <Button disabled={off} className=\"bg-blue-500 text-white font-semibold disabled:text-gray-400\">{children}</Button>";
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.jsx.starts_with("<HozoPressable"), "{}", output.jsx);
    assert!(
        output.jsx.contains("hozoTextStyle={({ pressed, hovered, focused, focusVisible }) => [hozoStyles.hozo0_label, (off) && hozoStyles.hozo0_label_disabled]}"),
        "{}",
        output.jsx
    );
    assert!(output.styles.contains("hozo0_label: {\n    color: '#fff',\n    fontWeight: '600',"), "{}", output.styles);
    assert!(!output.styles.contains("hozo0: {\n    backgroundColor: '#2b7fff',\n    color"), "{}", output.styles);
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);

    // A Button with an `href` is a link, rendered through the same
    // `HozoPressable`, and its label is just as unseen.
    let source = "import { Button } from '@hozo/core'\nconst el = <Button href={to} className=\"bg-blue-500 text-white font-semibold\">{children}</Button>";
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.jsx.starts_with("<HozoLink hozoLinkComponent={HozoPressable}"), "{}", output.jsx);
    assert!(output.jsx.contains("hozoTextStyle={({ pressed, hovered, focused, focusVisible }) => [hozoStyles.hozo0_label]}"), "{}", output.jsx);
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);

    let source = "import { View } from '@hozo/core'\nconst el = <View className=\"text-white\">{children}</View>";
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(!output.jsx.contains("hozoTextStyle"), "{}", output.jsx);
    assert!(
        output.diagnostics.iter().any(|d| d.message.contains("text styles are handed down")),
        "{:?}",
        output.diagnostics
    );
}
