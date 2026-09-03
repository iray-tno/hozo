use super::*;

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
    assert!(output.jsx.contains(r#"<Pressable accessibilityRole="button">"#), "{}", output.jsx);
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
    assert!(output.jsx.contains(r#"<HozoLink accessibilityRole="button" href="https://example.com">"#), "{}", output.jsx);
}
