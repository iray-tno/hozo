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
        assert!(output.jsx.contains("<Text style={hozoStyles.hozo1}>Welcome</Text>"));
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
    fn disabled_condition_merges_into_a_conditional_style_array_when_a_disabled_prop_exists() {
        let source = r#"
            import { Button } from '@hozo/core'
            const el = <Button disabled={isLoading} className="p-2 disabled:opacity-50">Save</Button>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.styles.contains("hozo0_disabled: {"));
        assert!(output.styles.contains("opacity: 0.5,"));
        assert!(output.jsx.contains("style={[hozoStyles.hozo0, (isLoading) && hozoStyles.hozo0_disabled]}"));
        assert!(output.jsx.contains("disabled={isLoading}"));
    }

    #[test]
    fn boolean_disabled_drives_its_conditional_style() {
        let source = r#"
            import { Button } from '@hozo/core'
            const el = <Button disabled className="p-2 disabled:opacity-50">Save</Button>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(output.jsx.contains("disabled={true}"), "{}", output.jsx);
        assert!(output.jsx.contains("(true) && hozoStyles.hozo0_disabled"), "{}", output.jsx);
    }

    #[test]
    fn unmodeled_props_and_spreads_reach_the_output() {
        let source = r#"
            import { View } from '@hozo/core'
            const el = <View className="p-4" {...rest} onLayout={onLayout} testID="row" />
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(output.jsx.contains("{...rest}"));
        assert!(output.jsx.contains("onLayout={onLayout}"));
        assert!(output.jsx.contains(r#"testID={"row"}"#));
    }

    #[test]
    fn universal_props_keep_their_native_contract() {
        let source = r#"
            import { ScrollView } from '@hozo/core'
            const el = <ScrollView testID="feed" nativeID="feed-view" pointerEvents="auto"
              accessibilityState={{ busy }} accessibilityValue={{ now: progress }}
              accessibilityLiveRegion="polite" onLayout={measure}
              onScroll={remember} scrollEventThrottle={16} />
        "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        for expected in [
            r#"testID={"feed"}"#,
            r#"nativeID={"feed-view"}"#,
            r#"pointerEvents={"auto"}"#,
            "accessibilityState={{ busy }}",
            "accessibilityValue={{ now: progress }}",
            r#"accessibilityLiveRegion={"polite"}"#,
            "onLayout={measure}",
            "onScroll={remember}",
            "scrollEventThrottle={16}",
        ] {
            assert!(output.jsx.contains(expected), "missing {expected}: {}", output.jsx);
        }
    }

    #[test]
    fn responder_callbacks_keep_the_react_native_contract() {
        let source = r#"
            import { View } from '@hozo/core'
            const el = <View onStartShouldSetResponder={wantStart}
              onStartShouldSetResponderCapture={captureStart}
              onMoveShouldSetResponder={wantMove}
              onMoveShouldSetResponderCapture={captureMove}
              onResponderGrant={grant} onResponderStart={start}
              onResponderMove={move} onResponderEnd={end}
              onResponderRelease={release} onResponderReject={reject}
              onResponderTerminate={terminate}
              onResponderTerminationRequest={allowTermination} />
        "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        for expected in [
            "onStartShouldSetResponder={wantStart}",
            "onStartShouldSetResponderCapture={captureStart}",
            "onMoveShouldSetResponder={wantMove}",
            "onMoveShouldSetResponderCapture={captureMove}",
            "onResponderGrant={grant}",
            "onResponderStart={start}",
            "onResponderMove={move}",
            "onResponderEnd={end}",
            "onResponderRelease={release}",
            "onResponderReject={reject}",
            "onResponderTerminate={terminate}",
            "onResponderTerminationRequest={allowTermination}",
        ] {
            assert!(output.jsx.contains(expected), "missing {expected}: {}", output.jsx);
        }
        assert!(output.runtime_imports.is_empty(), "{:?}", output.runtime_imports);
    }

    #[test]
    fn image_default_source_uses_the_same_native_normalizer() {
        let source = r#"
            import { Image } from '@hozo/core'
            const el = <Image src={remote} defaultSource={require('./fallback.png')} alt="Cover" />
        "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(output.jsx.contains("source={hozoImageSource(remote)}"), "{}", output.jsx);
        assert!(output.jsx.contains("defaultSource={hozoImageSource(require('./fallback.png'))}"), "{}", output.jsx);
        assert!(output.runtime_imports.contains(&"hozoImageSource"));
    }

    #[test]
    fn pressed_condition_wraps_style_in_rn_pressable_render_prop() {
        let source = r#"
            import { Button } from '@hozo/core'
            const el = <Button className="p-2 pressed:opacity-50">Save</Button>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.styles.contains("hozo0_pressed: {"));
        assert!(output.styles.contains("opacity: 0.5,"));
        assert!(output.jsx.contains("style={({ pressed }) => [hozoStyles.hozo0, pressed && hozoStyles.hozo0_pressed]}"));
    }

    #[test]
    fn pressed_condition_stays_unmerged_on_view_since_style_cannot_be_a_function_there() {
        let source = r#"
            import { View } from '@hozo/core'
            const el = <View className="p-2 pressed:opacity-50" />
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.styles.contains("hozo0_pressed: {"));
        assert!(output.jsx.contains("style={hozoStyles.hozo0}"));
        assert!(!output.jsx.contains("pressed"));
    }

    #[test]
    fn disabled_condition_stays_unmerged_without_a_disabled_prop() {
        // Nothing drives "disabled-ness" here -- the className has a
        // disabled: variant but the component never actually received a
        // `disabled` prop, so there's no guard to merge with. Computed,
        // not silently dropped, but also not merged into anything.
        let source = r#"
            import { View } from '@hozo/core'
            const el = <View className="disabled:opacity-50" />
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(output.styles.contains("hozo0_disabled: {"));
        assert!(!output.jsx.contains("hozo0_disabled"));
    }

    #[test]
    fn dynamic_class_name_guard_merges_into_the_style_array() {
        // A layout utility rather than `text-xl`: text styles are handed
        // down to children now, and a View with none has nowhere to put
        // them -- which would make this test about that instead of about
        // the guard it is checking.
        let source = r#"
            import { View } from '@hozo/core'
            import { cn } from 'clsx'
            const el = <View className={cn('p-4', active && 'p-8')} />
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(output.jsx.contains("style={[hozoStyles.hozo0, (active) && hozoStyles.hozo0_cond_"));
    }

    #[test]
    fn hover_and_focus_still_do_not_merge_into_anything() {
        // No RN mechanism for either (see module docs) -- still computed,
        // still not merged, unlike Disabled/Expr which now are.
        let node = hozo_ir::Node {
            primitive: hozo_ir::Primitive::View,
            style: vec![
                hozo_ir::StyleDeclaration {
                    property: hozo_ir::StyleProperty::Opacity(1.0),
                    condition: hozo_ir::Condition::Always,
                },
                hozo_ir::StyleDeclaration {
                    property: hozo_ir::StyleProperty::Opacity(0.5),
                    condition: hozo_ir::Condition::Hover,
                },
            ],
            props: hozo_ir::PropSet::default(),
            children: Vec::new(),
            class_name_fallback: Vec::new(),
            carried_classes: Vec::new(),
            span: hozo_ir::SourceSpan { start: 0, end: 0 },
        };
        let output = lower(&node, "", &Theme::default());
        assert!(output.jsx.contains("style={hozoStyles.hozo0}"));
        assert!(output.styles.contains("hozo0_hover: {"));
        assert!(!output.jsx.contains("hozo0_hover"));
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
        assert!(output.styles.contains(
            "transform: [{ translateX: 8 }, { rotate: '45deg' }, { scale: 0.95 }],"
        ));
        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);

        let explicit_z = r#"
            import { View } from '@hozo/core'
            const el = <View className="scale-z-95" />
            "#;
        let parsed = hozo_parser::parse_tsx(explicit_z);
        let output = lower(&parsed.roots[0].node, explicit_z, &Theme::default());
        assert!(output.styles.contains(
            "transform: [{ matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0.95, 0, 0, 0, 0, 1] }],"
        ));
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
        assert!(output.styles.contains("display: 'flex',"), "{}", output.styles);
        assert!(output.styles.contains("alignSelf: 'flex-start',"), "{}", output.styles);
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
        assert!(output.styles.contains("alignSelf: 'center',"), "{}", output.styles);
        assert!(!output.styles.contains("alignSelf: 'flex-start',"), "{}", output.styles);
        assert!(output.styles.contains("display: 'flex',"), "{}", output.styles);
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
        assert!(output.styles.contains("display: 'none',"), "{}", output.styles);
        assert!(output.styles.contains("hozo0_md:"), "{}", output.styles);
        assert_eq!(output.styles.matches("display: 'flex',").count(), 1, "{}", output.styles);
    }

    /// Every variant that can't reach the `style` prop, with the severity
    /// it should report. Until 2026-08-15 all of these produced a
    /// StyleSheet entry the JSX never referenced, and said nothing -- the
    /// conformance suite scored them covered because the entry existed.
    #[test]
    fn no_variant_is_dropped_without_saying_so() {
        let cases: &[(&str, hozo_ir::Severity)] = &[
            // Real on pointer/desktop targets, but a bare View has no
            // interaction wrapper to drive either state.
            ("hover:bg-blue-500", hozo_ir::Severity::Error),
            ("focus:p-4", hozo_ir::Severity::Error),
            // Undecidable position, so nothing can resolve it here.
            ("first:mt-0", hozo_ir::Severity::Error),
            // Nothing on a bare View drives these at all.
            ("disabled:p-4", hozo_ir::Severity::Error),
            ("pressed:p-4", hozo_ir::Severity::Error),
        ];

        for (candidate, severity) in cases {
            let source = format!(
                "import {{ View }} from '@hozo/core'\nconst el = <View className=\"{candidate}\" />\n"
            );
            let parsed = hozo_parser::parse_tsx(&source);
            let output = lower(&parsed.roots[0].node, &source, &Theme::default());

            let reported: Vec<_> = output
                .diagnostics
                .iter()
                .filter(|d| d.code == hozo_ir::DiagnosticCode::NotWiredOnNative)
                .collect();
            assert_eq!(reported.len(), 1, "{candidate}: {:?}", output.diagnostics);
            assert_eq!(reported[0].severity, *severity, "{candidate}");
        }
    }

    #[test]
    fn ambient_conditions_compile_to_a_hook_the_caller_must_splice() {
        // `dark:` and the breakpoints are the same value app-wide at any
        // moment, so `@hozo/runtime` keeps one subscription for the whole
        // app; the hook exists only to re-render *this* component when it
        // changes. The declaration is returned rather than inlined into
        // the JSX -- a hook inside `style={[a, useHozoDark() && b]}`
        // breaks the rules of hooks as soon as the element sits behind a
        // conditional.
        let source = r#"
            import { View } from '@hozo/core'
            const el = <View className="p-4 dark:bg-black md:flex-row" />
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert_eq!(
            output.prelude,
            vec![
                "const __hozoDark = useHozoDark()",
                "const __hozoBp_md = useHozoBreakpoint('md')",
            ]
        );
        assert_eq!(output.runtime_imports, vec!["useHozoDark", "useHozoBreakpoint"]);
        assert!(output.jsx.contains("__hozoDark && hozoStyles.hozo0_dark"), "{}", output.jsx);
        assert!(output.jsx.contains("__hozoBp_md && hozoStyles.hozo0_md"), "{}", output.jsx);
    }

    #[test]
    fn supported_stacked_variants_and_their_guards_together() {
        let source = r#"
            import { View, Pressable } from '@hozo/core'
            const el = (
              <View className="md:dark:p-4">
                <Pressable className="disabled:pressed:opacity-50" disabled={isOff}
                  accessibilityRole="button">Save</Pressable>
              </View>
            )
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(
            output
                .jsx
                .contains("__hozoBp_md && __hozoDark && hozoStyles.hozo0_md_dark"),
            "{}",
            output.jsx
        );
        assert!(
            output
                .jsx
                .contains("(isOff) && pressed && hozoStyles.hozo1_disabled_pressed"),
            "{}",
            output.jsx
        );
        assert_eq!(
            output.prelude,
            vec![
                "const __hozoBp_md = useHozoBreakpoint('md')",
                "const __hozoDark = useHozoDark()",
            ]
        );
    }

    #[test]
    fn pressable_hover_and_focus_use_the_interaction_wrapper() {
        let source = r#"
            import { Pressable } from '@hozo/core'
            const el = (
              <Pressable className="hover:bg-blue-500 focus:p-4 pressed:opacity-50"
                onHoverIn={noticeHover} onFocus={noticeFocus}
                accessibilityRole="button">Save</Pressable>
            )
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(output.jsx.starts_with("<HozoPressable"), "{}", output.jsx);
        assert!(!output.jsx.contains("hozoFocusVisible"), "{}", output.jsx);
        assert!(
            output.jsx.contains("({ pressed, hovered, focused }) =>"),
            "{}",
            output.jsx
        );
        assert!(output.jsx.contains("hovered && hozoStyles.hozo0_hover"), "{}", output.jsx);
        assert!(output.jsx.contains("focused && hozoStyles.hozo0_focus"), "{}", output.jsx);
        assert!(output.jsx.contains("pressed && hozoStyles.hozo0_pressed"), "{}", output.jsx);
        assert!(output.jsx.contains("onHoverIn={noticeHover}"), "{}", output.jsx);
        assert!(output.jsx.contains("onFocus={noticeFocus}"), "{}", output.jsx);
        assert!(output.runtime_imports.contains(&"HozoPressable"));
    }

    #[test]
    fn focus_visible_uses_pressable_input_modality_state() {
        let source = r#"
            import { Pressable } from '@hozo/core'
            function Save() {
              return <Pressable className="opacity-100 focus-visible:opacity-50 md:focus-visible:p-4"
                accessibilityRole="button">Save</Pressable>
            }
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(output.jsx.starts_with("<HozoPressable"), "{}", output.jsx);
        assert!(output.jsx.contains("hozoFocusVisible"), "{}", output.jsx);
        assert!(output.jsx.contains("{ pressed, hovered, focused, focusVisible }"), "{}", output.jsx);
        assert!(output.jsx.contains("focusVisible && hozoStyles.hozo0_focusvisible"), "{}", output.jsx);
        assert!(output.jsx.contains("__hozoBp_md && focusVisible &&"), "{}", output.jsx);
    }

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

    #[test]
    fn hover_composes_with_an_ambient_guard_on_pressable() {
        let source = r#"
            import { Button } from '@hozo/core'
            const el = <Button className="md:hover:bg-blue-500">Save</Button>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(output.jsx.starts_with("<HozoPressable"), "{}", output.jsx);
        assert!(
            output
                .jsx
                .contains("__hozoBp_md && hovered && hozoStyles.hozo0_md_hover"),
            "{}",
            output.jsx
        );
    }

    #[test]
    fn stacked_structural_variants_are_resolved_before_runtime_guards() {
        let source = r#"
            import { View, Text } from '@hozo/core'
            const el = (
              <View>
                <Text className="first:md:mt-0">a</Text>
                <Text className="first:md:mt-0">b</Text>
              </View>
            )
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(
            output.jsx.contains("__hozoBp_md && hozoStyles.hozo1_first_md"),
            "{}",
            output.jsx
        );
        assert!(!output.jsx.contains("hozoStyles.hozo2_first_md"), "{}", output.jsx);
    }

    #[test]
    fn one_hook_declaration_however_many_elements_guard_on_it() {
        // Two calls would redeclare the binding and change the hook order
        // between renders.
        let source = r#"
            import { View, Text } from '@hozo/core'
            const el = (
              <View className="dark:bg-black">
                <Text className="dark:text-white">a</Text>
              </View>
            )
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert_eq!(output.prelude, vec!["const __hozoDark = useHozoDark()"]);
    }

    #[test]
    fn a_conditional_style_outranks_the_base_whatever_order_it_was_written_in() {
        // Web settles this by specificity: `.hozo-0:disabled` (0,2,0)
        // beats `.hozo-0` (0,1,0) regardless of which rule comes first. A
        // React Native style array only resolves last-wins, so position has
        // to stand in for specificity -- otherwise `disabled:p-8 p-4`
        // renders p-8 on Web and p-4 on device.
        let source = r#"
            import { Pressable } from '@hozo/core'
            const el = (
              <Pressable className="disabled:p-8 p-4" disabled={off}
                accessibilityRole="button">x</Pressable>
            )
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        let base = output.jsx.find("hozoStyles.hozo0,").expect("base style");
        let conditional = output.jsx.find("hozoStyles.hozo0_disabled").expect("conditional style");
        assert!(base < conditional, "{}", output.jsx);
    }

    #[test]
    fn first_child_is_decided_at_compile_time() {
        // Web asks `:first-child` at match time; here the compiler is
        // looking straight at the JSX tree and already knows. Both answers
        // are exact, so neither reports anything.
        let source = r#"
            import { View, Text } from '@hozo/core'
            const el = (
              <View>
                <Text className="first:mt-0">a</Text>
                <Text className="first:mt-0">b</Text>
              </View>
            )
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        // The first child gets it applied unconditionally...
        assert!(output.jsx.contains("hozoStyles.hozo1_first"), "{}", output.jsx);
        // ...and the second doesn't get one at all, which is exactly what
        // `:first-child` would do.
        assert!(!output.jsx.contains("hozoStyles.hozo2_first"), "{}", output.jsx);
    }

    /// Compiles one tree and returns its JSX.
    fn native_jsx(source: &str) -> LowerOutput {
        let parsed = hozo_parser::parse_tsx(source);
        lower(&parsed.roots[0].node, source, &Theme::default())
    }

    #[test]
    fn a_style_for_the_children_is_handed_to_each_of_them() {
        // React Native has no selector, so the parent cannot say
        // "my children". The compiler is looking at those children, which
        // is what makes this answerable at all -- the same trade `first:`
        // and `odd:` already make.
        let output = native_jsx(
            r#"
            import { View, Text } from '@hozo/core'
            const el = (
              <View className="*:mt-2">
                <Text>a</Text>
                <Text>b</Text>
              </View>
            )
            "#,
        );
        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        // On the children, and not on the parent.
        assert!(output.jsx.contains("hozo1"), "{}", output.jsx);
        assert!(output.jsx.contains("hozo2"), "{}", output.jsx);
        assert!(output.styles.contains("marginTop: 8"), "{}", output.styles);
    }

    #[test]
    fn a_direct_child_style_stops_at_the_children_and_a_descendant_one_does_not() {
        let source = r#"
            import { View, Text } from '@hozo/core'
            const el = (
              <View className="CLASS">
                <View>
                  <Text>deep</Text>
                </View>
              </View>
            )
            "#;
        // `*:` reaches the inner View and stops.
        let direct = native_jsx(&source.replace("CLASS", "*:mt-2"));
        assert_eq!(direct.styles.matches("marginTop: 8").count(), 1, "{}", direct.styles);
        // `**:` reaches the inner View *and* the Text below it.
        let all = native_jsx(&source.replace("CLASS", "**:mt-2"));
        assert_eq!(all.styles.matches("marginTop: 8").count(), 2, "{}", all.styles);
    }

    #[test]
    fn which_element_the_condition_is_about_survives_the_handing_down() {
        // The half of this that a selector states and a style object
        // cannot. `md:*:` is answerable because a breakpoint is a hook
        // declared once for the component, so a child reads the same
        // binding. `hover:*:` is not: that is the parent's own state, and
        // handing it down would silently turn it into `*:hover:`, which is
        // a different rule.
        let source = r#"
            import { View, Text } from '@hozo/core'
            const el = <View className="CLASS"><Text>a</Text></View>
            "#;
        let responsive = native_jsx(&source.replace("CLASS", "md:*:mt-2"));
        assert!(responsive.diagnostics.is_empty(), "{:?}", responsive.diagnostics);
        assert!(responsive.jsx.contains("__hozoBp_md"), "{}", responsive.jsx);

        let hovered = native_jsx(&source.replace("CLASS", "hover:*:mt-2"));
        assert_eq!(hovered.diagnostics.len(), 1, "{:?}", hovered.diagnostics);
        assert!(
            hovered.diagnostics[0].message.contains("hand an element's own state down"),
            "{}",
            hovered.diagnostics[0].message,
        );

        // And the other order is the children's own state, which needs
        // nothing from the parent.
        let child_hover = native_jsx(&source.replace("CLASS", "*:hover:mt-2"));
        assert!(
            !child_hover.diagnostics.iter().any(|d| d.message.contains("own state down")),
            "{:?}",
            child_hover.diagnostics,
        );
    }

    #[test]
    fn a_child_the_compiler_cannot_read_is_named_rather_than_skipped() {
        // "Every child" reaching some of them is the divergence worth a
        // build message: the selector reaches all of them on Web.
        let output = native_jsx(
            r#"
            import { View, Text } from '@hozo/core'
            const el = (
              <View className="*:mt-2">
                <Text>a</Text>
                {items.map((i) => <Text key={i}>x</Text>)}
              </View>
            )
            "#,
        );
        assert!(
            output.diagnostics.iter().any(|d| d.message.contains("doesn't read")),
            "{:?}",
            output.diagnostics,
        );
    }

    #[test]
    fn the_elements_own_style_wins_over_what_it_was_handed() {
        // Last-wins, which is where CSS specificity lands too.
        let output = native_jsx(
            r#"
            import { View, Text } from '@hozo/core'
            const el = <View className="*:mt-2"><Text className="mt-8">a</Text></View>
            "#,
        );
        assert!(output.styles.contains("marginTop: 32"), "{}", output.styles);
        assert!(!output.styles.contains("marginTop: 8"), "{}", output.styles);
    }

    #[test]
    fn a_container_measures_itself_and_its_subtree_reads_the_width() {
        // The one width the runtime cannot already know. A window has one
        // and `useHozoViewport` reports it; a container's is whatever
        // layout gave that element, so the element has to say.
        let source = r#"
            import { View, Text } from '@hozo/core'
            const el = (
              <View className="@container">
                <Text className="@sm:mt-0">a</Text>
              </View>
            )
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(output.jsx.starts_with("<HozoContainer"), "{}", output.jsx);
        // A render prop, because the querying element is in the same
        // component as the container and a hook there would read the
        // context from outside the provider.
        assert!(output.jsx.contains("<HozoContainerQuery>{(__hozoCq) =>"), "{}", output.jsx);
        assert!(output.jsx.contains(r#"__hozoCq[""] >= 384"#), "{}", output.jsx);
    }

    #[test]
    fn no_container_in_scope_matches_nothing_in_either_direction() {
        // CSS says a query with no container matches nothing at all, so
        // the guard tests for a width before comparing one -- otherwise
        // `@max-md:` would fire on every element that has no container,
        // which is the majority of them.
        let source = r#"
            import { Text } from '@hozo/core'
            const el = <Text className="@max-md:mt-0">a</Text>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(output.jsx.contains(r#"__hozoCq[""] !== undefined"#), "{}", output.jsx);
    }

    #[test]
    fn a_named_container_answers_under_its_name_and_the_nearest_one() {
        let source = r#"
            import { View, Text } from '@hozo/core'
            const el = (
              <View className="@container/main">
                <Text className="@sm/main:mt-0">a</Text>
              </View>
            )
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(output.jsx.contains(r#"hozoContainerName="main""#), "{}", output.jsx);
        assert!(output.jsx.contains(r#"__hozoCq["main"]"#), "{}", output.jsx);
    }

    #[test]
    fn declaring_a_container_is_not_a_style_react_native_is_asked_to_hold() {
        // `container-type` is consumed by the component, not emitted --
        // and not refused either, which it was until the component
        // existed.
        let source = r#"
            import { View } from '@hozo/core'
            const el = <View className="@container">a</View>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(!output.styles.contains("containerType"), "{}", output.styles);
        // `@container-normal` declares nothing, so it stays a View.
        let normal = r#"
            import { View } from '@hozo/core'
            const el = <View className="@container-normal">a</View>
            "#;
        let parsed = hozo_parser::parse_tsx(normal);
        let output = lower(&parsed.roots[0].node, normal, &Theme::default());
        assert!(output.jsx.starts_with("<View"), "{}", output.jsx);
    }

    #[test]
    fn an_arbitrary_width_gets_its_own_hook_and_max_reuses_it() {
        // The buckets are the five named breakpoints and this is not one
        // of them, so it needs a threshold of its own. `max-` is the same
        // question from the other side, so it is that hook negated rather
        // than a second one.
        let source = r#"
            import { View } from '@hozo/core'
            const el = <View className="min-[500px]:p-4 max-md:m-2">x</View>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(output.prelude.iter().any(|line| line.contains("useHozoWidthAtLeast(500)")));
        assert!(output.prelude.iter().any(|line| line.contains("useHozoWidthAtLeast(768)")));
        assert!(output.jsx.contains("__hozoWidth_500 &&"), "{}", output.jsx);
        assert!(output.jsx.contains("!__hozoWidth_768 &&"), "{}", output.jsx);
    }

    #[test]
    fn a_threshold_react_native_cannot_resolve_is_named() {
        // `rem` has no root font size on a device and a viewport unit
        // compared against the viewport answers itself. Guessing 16px per
        // rem would disagree with the browser for anyone who changed their
        // font size, which is the reader this project is for.
        let source = r#"
            import { View } from '@hozo/core'
            const el = <View className="min-[40rem]:p-4">x</View>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert_eq!(output.diagnostics.len(), 1, "{:?}", output.diagnostics);
        assert!(output.diagnostics[0].message.contains("40rem"), "{}", output.diagnostics[0].message);
    }

    #[test]
    fn read_only_is_the_one_form_state_native_can_answer() {
        // React Native has the state -- under two names -- as a prop the
        // compiler is looking at, so `read-only:` resolves the same way
        // `disabled:` does rather than being reported.
        let cases = [
            (r#"<TextInput accessibilityLabel="N" readOnly className="read-only:p-4" />"#, "true"),
            (
                r#"<TextInput accessibilityLabel="N" editable={canEdit} className="read-only:p-4" />"#,
                "false",
            ),
        ];
        for (element, kind) in cases {
            let source =
                format!("import {{ TextInput }} from '@hozo/core'
const el = {element}
");
            let parsed = hozo_parser::parse_tsx(&source);
            let output = lower(&parsed.roots[0].node, &source, &Theme::default());
            assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
            assert!(output.jsx.contains("hozo0_readonly"), "{}", output.jsx);
            if kind == "true" {
                // Known at build time, so it decides the style instead of
                // guarding it -- no `true &&` in the output.
                assert!(!output.jsx.contains("true &&"), "{}", output.jsx);
            } else {
                assert!(output.jsx.contains("!(canEdit)"), "{}", output.jsx);
            }
        }
    }

    #[test]
    fn the_rest_of_the_form_states_are_named_absent() {
        // Constraint validation is a DOM feature. React Native has no
        // `required`, no `pattern`, and nothing for `:invalid` to be true
        // of -- so this is a refusal with a reason, not an unbuilt gap.
        for class_name in ["invalid:p-4", "required:p-4", "placeholder-shown:p-4"] {
            let source = format!(
                "import {{ TextInput }} from '@hozo/core'
                 const el = <TextInput accessibilityLabel=\"N\" className=\"{class_name}\" />
"
            );
            let parsed = hozo_parser::parse_tsx(&source);
            let output = lower(&parsed.roots[0].node, &source, &Theme::default());
            assert_eq!(output.diagnostics.len(), 1, "{class_name}: {:?}", output.diagnostics);
        }
    }

    #[test]
    fn the_text_input_props_come_back_exactly_as_written() {
        // Modelling a prop means both backends own it. Web needed these
        // because the DOM spells them differently; Native needs them
        // *unchanged*, and the moment they moved out of `passthrough`
        // they stopped being emitted here at all.
        let source = r#"
            import { TextInput } from '@hozo/core'
            const el = (
              <TextInput
                accessibilityLabel="Notes"
                onChangeText={handle}
                multiline
                numberOfLines={4}
                editable={canEdit}
                secureTextEntry={false}
                keyboardType="email-address"
              />
            )
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        for expected in [
            "onChangeText={handle}",
            // Bare, the way it was written and the way React Native's own
            // code reads -- not `multiline={true}`.
            " multiline",
            "numberOfLines={4}",
            "editable={canEdit}",
            "secureTextEntry={false}",
            "keyboardType=\"email-address\"",
        ] {
            assert!(output.jsx.contains(expected), "{expected} missing from {}", output.jsx);
        }
    }

    #[test]
    fn the_structural_family_is_decided_at_compile_time_too() {
        // Same trade `first:` already made, applied to the rest of the
        // family: React Native has no selector engine, but the compiler is
        // reading the tree and a sibling position is a fact about it.
        //
        // Striped rows are the reason this is worth having. `odd:bg-…` is
        // one class on Web and a manual index check in React Native.
        let source = r#"
            import { View, Text } from '@hozo/core'
            const el = (
              <View>
                <Text className="odd:mt-0">a</Text>
                <Text className="odd:mt-0">b</Text>
                <Text className="odd:mt-0">c</Text>
              </View>
            )
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(output.jsx.contains("hozo1_odd"), "{}", output.jsx);
        assert!(!output.jsx.contains("hozo2_odd"), "{}", output.jsx);
        assert!(output.jsx.contains("hozo3_odd"), "{}", output.jsx);
    }

    #[test]
    fn only_child_counts_the_siblings_rather_than_assuming_one() {
        // `:only-child` needs the total, which is a stricter question than
        // `first:` asks -- a `Verbatim` *after* this element changes the
        // answer without changing the position.
        let one = r#"
            import { View, Text } from '@hozo/core'
            const el = <View><Text className="only:mt-0">a</Text></View>
            "#;
        let two = r#"
            import { View, Text } from '@hozo/core'
            const el = <View><Text className="only:mt-0">a</Text><Text>b</Text></View>
            "#;
        for (source, applies) in [(one, true), (two, false)] {
            let parsed = hozo_parser::parse_tsx(source);
            let output = lower(&parsed.roots[0].node, source, &Theme::default());
            assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
            assert_eq!(output.jsx.contains("hozo1_only"), applies, "{}", output.jsx);
        }
    }

    #[test]
    fn empty_asks_about_this_elements_own_children() {
        // The one in the family that isn't about siblings at all.
        let childless = r#"
            import { View } from '@hozo/core'
            const el = <View><View className="empty:mt-0" /></View>
            "#;
        let occupied = r#"
            import { View, Text } from '@hozo/core'
            const el = <View><View className="empty:mt-0"><Text>a</Text></View></View>
            "#;
        for (source, applies) in [(childless, true), (occupied, false)] {
            let parsed = hozo_parser::parse_tsx(source);
            let output = lower(&parsed.roots[0].node, source, &Theme::default());
            assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
            assert_eq!(output.jsx.contains("hozo1_empty"), applies, "{}", output.jsx);
        }
    }

    #[test]
    fn of_type_is_named_absent_rather_than_answered_wrongly() {
        // React Native has no tags to count, and the tag this element
        // would have taken on Web is a lowering decision that was never
        // made here. Deciding it from the position would be a guess that
        // happens to be right whenever the siblings are homogeneous.
        let source = r#"
            import { View, Text } from '@hozo/core'
            const el = <View><Text className="first-of-type:mt-0">a</Text></View>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert_eq!(output.diagnostics.len(), 1, "{:?}", output.diagnostics);
        assert!(
            output.diagnostics[0].message.contains("first-of-type"),
            "{}",
            output.diagnostics[0].message,
        );
    }

    #[test]
    fn first_child_is_refused_when_a_sibling_is_unmodeled() {
        // `<Avatar/>` renders and occupies the first slot, but never
        // becomes a Node -- so the Text is index 0 in `children` and second
        // on screen. Deciding from that index would apply the style to the
        // wrong element, silently.
        let source = r#"
            import { View, Text } from '@hozo/core'
            const el = (
              <View>
                <Avatar />
                <Text className="first:mt-0">b</Text>
              </View>
            )
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        let reported: Vec<_> = output
            .diagnostics
            .iter()
            .filter(|d| d.code == hozo_ir::DiagnosticCode::NotWiredOnNative)
            .collect();
        assert_eq!(reported.len(), 1, "{:?}", output.diagnostics);
        assert!(reported[0].message.contains("position"), "{}", reported[0].message);
    }

    #[test]
    fn first_child_is_refused_on_a_component_root() {
        // Where this element sits is its caller's decision, not something
        // visible from here.
        let source = r#"
            import { View } from '@hozo/core'
            const el = <View className="first:mt-0" />
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(output
            .diagnostics
            .iter()
            .any(|d| d.code == hozo_ir::DiagnosticCode::NotWiredOnNative));
    }

    #[test]
    fn a_semantic_prop_the_author_already_wrote_is_not_emitted_twice() {
        // Ordinary in a React Native file, and unreachable while the
        // integrations required a rewrite to `@hozo/core`: the author sets
        // the role their own `<FlatList>` needs, and Hozo adds the same
        // one to every FlatList it lowers.
        let source = "import { FlatList } from 'react-native'
export const C = () => <FlatList accessibilityRole=\"list\" data={[]} renderItem={() => null} />
";
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        // One role, in ARIA's spelling: React Native has taken `role`
        // since 0.71, and it is the vocabulary both platforms share.
        assert_eq!(output.jsx.matches("role=").count(), 1, "{}", output.jsx);
        assert!(output.jsx.contains(r#"role="list""#), "{}", output.jsx);
    }

    #[test]
    fn the_authors_value_is_the_one_that_survives() {
        // Dropping ours rather than theirs. JSX resolves duplicates
        // last-wins and passthrough props are emitted last, so this was
        // already the effective answer -- now it is also the written one.
        let source = "import { List } from '@hozo/core'
export const C = () => <List accessibilityRole=\"menu\">x</List>
";
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(output.jsx.contains(r#"role="menu""#), "{}", output.jsx);
        assert!(!output.jsx.contains(r#""list""#), "{}", output.jsx);
    }

    #[test]
    fn a_spread_does_not_suppress_the_semantic_prop() {
        // Its contents are not knowable here, and it lands after ours --
        // so if it does carry the prop it still wins, and if it doesn't
        // the element still has its role.
        let source = "import { List } from '@hozo/core'
export const C = (p) => <List {...p}>x</List>
";
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(output.jsx.contains(r#"accessibilityRole="list""#), "{}", output.jsx);
    }

    #[test]
    fn a_wired_variant_reports_nothing() {
        // The two that do work must not have been swept up in the above.
        let source = r#"
            import { Pressable } from '@hozo/core'
            const el = (
              <Pressable className="pressed:p-4 disabled:opacity-50" disabled={isOff}
                accessibilityRole="button">x</Pressable>
            )
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(
            output.diagnostics.is_empty(),
            "{:?}",
            output.diagnostics.iter().map(|d| &d.message).collect::<Vec<_>>()
        );
        assert!(output.jsx.contains("pressed && hozoStyles."), "{}", output.jsx);
        assert!(output.jsx.contains("(isOff) && hozoStyles."), "{}", output.jsx);
    }

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
        assert!(output.jsx.contains("hozoClasses(classNameFromProps)"), "{}", output.jsx);
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

        let compiled = output.jsx.find("hozoStyles.hozo0").expect("compiled styles");
        let dynamic = output.jsx.find("hozoClasses(").expect("resolver call");
        assert!(compiled < dynamic, "{}", output.jsx);
    }

    #[test]
    fn raw_text_in_a_view_is_wrapped_and_takes_its_text_styles_with_it() {
        // Two separate hazards, both invisible on Web: a raw string inside
        // a View crashes React Native, and `fontSize` left on the View
        // would do nothing there because Text doesn't inherit from View.
        let source = r#"
            import { View } from '@hozo/core'
            const el = <View className="p-4 text-xl font-bold">Hello</View>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.jsx.contains("<Text style={hozoStyles.hozo0_text}>Hello</Text>"));
        // Layout stays on the View, text styling moves to the Text.
        assert!(output.styles.contains("paddingTop: 16,"));
        assert!(output.styles.contains("hozo0_text: {"));
        assert!(output.styles.contains("fontSize: 20,"));
        assert!(output.styles.contains("fontWeight: '700',"));
        // Not left behind on the container, where RN would ignore it.
        let container = output.styles.split("hozo0_text").next().unwrap();
        assert!(!container.contains("fontSize"));
    }

    #[test]
    fn a_text_node_is_not_double_wrapped() {
        let source = r#"
            import { Text } from '@hozo/core'
            const el = <Text className="text-xl">Hello</Text>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert_eq!(output.jsx.matches("<Text").count(), 1);
        assert!(output.styles.contains("fontSize: 20,"));
    }

    #[test]
    fn truncation_lowers_to_props_rather_than_styles() {
        // RN has no white-space/text-overflow; it truncates via props.
        // `truncate` asks for an ellipsis, which is `ellipsizeMode`'s
        // default, so only `numberOfLines` is needed.
        let source = r#"
            import { Text } from '@hozo/core'
            const el = <Text className="truncate">x</Text>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(output.diagnostics.is_empty());
        assert!(output.jsx.contains("numberOfLines={1}"));
        assert!(!output.jsx.contains("ellipsizeMode"));
        // The `overflow` half of `truncate` is a real RN style and still
        // lowers as one.
        assert!(output.styles.contains("overflow: 'hidden',"));
    }

    #[test]
    fn nowrap_without_ellipsis_clips_instead() {
        let source = r#"
            import { Text } from '@hozo/core'
            const el = <Text className="whitespace-nowrap">x</Text>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(output.diagnostics.is_empty());
        assert!(output.jsx.contains("numberOfLines={1}"));
        // Nothing asked for an ellipsis, and RN's default would add one.
        assert!(output.jsx.contains(r#"ellipsizeMode="clip""#));
    }

    #[test]
    fn truncation_on_a_non_text_node_is_refused() {
        // `numberOfLines` only exists on Text, so there's nothing to
        // absorb it into here -- and silently dropping it would lose the
        // author's intent.
        let source = r#"
            import { View } from '@hozo/core'
            const el = <View className="truncate" />
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(!output.diagnostics.is_empty());
        assert_eq!(output.diagnostics[0].severity, hozo_ir::Severity::Error);
    }

    #[test]
    fn whitespace_normal_stays_a_genuine_no_op() {
        // RN's Text already wraps, so this asks for what happens anyway.
        let source = r#"
            import { Text } from '@hozo/core'
            const el = <Text className="whitespace-normal">x</Text>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(output.diagnostics.is_empty());
        assert!(!output.jsx.contains("numberOfLines"));
    }

    #[test]
    fn text_styles_reach_a_text_the_author_wrote() {
        // The long-standing divergence this fixes: CSS inherits `text-xl`
        // to the span, React Native inherits nothing from a View, so the
        // same source rendered 20px on Web and the default size on device
        // with nothing said about it.
        let source = r#"
            import { View, Text } from '@hozo/core'
            const el = <View className="text-xl text-red-500"><Text>Hi</Text></View>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(output.styles.contains("fontSize: 20,"), "{}", output.styles);
        assert!(output.styles.contains("color: '#fb2c36',"), "{}", output.styles);
        // And they leave the View, which has no `fontSize` to put them in.
        assert!(!output.jsx.contains("<View style="), "{}", output.jsx);
    }

    #[test]
    fn an_inherited_text_style_loses_to_the_child_that_sets_its_own() {
        // Only the property the child sets: `text-sm` replaces the size and
        // leaves the colour and weight alone, which is what CSS would do.
        // `dedupe_last_wins` gets this right only because the inherited
        // declarations are placed *before* the child's own.
        let source = r#"
            import { View, Text } from '@hozo/core'
            const el = (
              <View className="text-xl text-red-500 font-bold">
                <Text className="text-sm">x</Text>
              </View>
            )
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(output.styles.contains("fontSize: 14,"), "{}", output.styles);
        assert!(!output.styles.contains("fontSize: 20,"), "{}", output.styles);
        assert!(output.styles.contains("color: '#fb2c36',"), "{}", output.styles);
        assert!(output.styles.contains("fontWeight: '700',"), "{}", output.styles);
    }

    #[test]
    fn inheritance_passes_through_an_intermediate_view_and_stops_at_a_text() {
        let source = r#"
            import { View, Text } from '@hozo/core'
            const el = (
              <View className="text-xl">
                <View className="p-2"><Text>Deep</Text></View>
              </View>
            )
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(output.styles.contains("fontSize: 20,"), "{}", output.styles);

        // A Text inside a Text needs nothing from the compiler: React
        // Native inherits there, so pushing a copy down would be noise.
        let nested = r#"
            import { Text } from '@hozo/core'
            const el = <Text className="text-xl"><Text>nested</Text></Text>
            "#;
        let parsed = hozo_parser::parse_tsx(nested);
        let output = lower(&parsed.roots[0].node, nested, &Theme::default());
        assert_eq!(output.styles.matches("fontSize: 20,").count(), 1, "{}", output.styles);
    }

    #[test]
    fn text_styles_with_nowhere_to_land_are_reported_rather_than_dropped() {
        // Handing them down is only half the job. A text size that reaches
        // no text is a style that renders on Web and does nothing on
        // device, which is the divergence worth a build message -- and
        // exactly what silently happened when the push-down was added.
        for (source, expected) in [
            (
                r#"
                import { View } from '@hozo/core'
                const el = <View className="text-xl p-4" />
                "#,
                "contains no text",
            ),
            (
                r#"
                import { View } from '@hozo/core'
                const el = <View className="text-xl">{rows}</View>
                "#,
                "doesn't read",
            ),
        ] {
            let parsed = hozo_parser::parse_tsx(source);
            let output = lower(&parsed.roots[0].node, source, &Theme::default());
            let warning = output
                .diagnostics
                .iter()
                .find(|d| d.code == DiagnosticCode::NotWiredOnNative)
                .unwrap_or_else(|| panic!("expected a diagnostic for: {source}"));
            assert!(warning.message.contains(expected), "{}", warning.message);
        }
    }

    #[test]
    fn a_dialog_is_lowered_with_its_styles_and_its_two_diagnostics() {
        // A primitive rather than a component the compiler walks past:
        // otherwise its className never compiles and neither of these
        // checks ever runs. The behaviour itself is `@hozo/a11y`'s.
        let source = r#"
            import { Dialog, Text } from '@hozo/core'
            const el = (
              <Dialog className="p-6" open={showing} onClose={dismiss} accessibilityLabel="Confirm">
                <Text>Delete?</Text>
              </Dialog>
            )
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(output.jsx.contains("<HozoDialog style={hozoStyles.hozo0}"), "{}", output.jsx);
        assert!(output.jsx.contains("open={showing}"), "{}", output.jsx);
        assert!(output.runtime_imports.contains(&"HozoDialog"), "{:?}", output.runtime_imports);
        assert!(output.styles.contains("paddingTop: 24,"), "{}", output.styles);
    }

    #[test]
    fn a_dialog_with_no_way_out_is_diagnosed() {
        // The one part of §10.3's quality bar a compiler can see: focus
        // trapping and restoration are behaviours, but "there is no
        // onClose" is a missing prop -- and without it Escape and the
        // Android back button both do nothing.
        let source = r#"
            import { Dialog } from '@hozo/core'
            const el = <Dialog open={showing} accessibilityLabel="Confirm" />
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert_eq!(output.diagnostics.len(), 1, "{:?}", output.diagnostics);
        assert_eq!(output.diagnostics[0].code, DiagnosticCode::A11yDialogWithoutDismiss);
        assert!(output.diagnostics[0].message.contains("trap"), "{}", output.diagnostics[0].message);
    }

    #[test]
    fn placeholder_colour_lowers_to_the_prop_that_carries_it() {
        // 291 candidates were refused for want of a `TextInput` to put this
        // on. React Native keeps the colour as a prop rather than a style,
        // which is why it needed a primitive rather than a style arm.
        let source = r#"
            import { TextInput } from '@hozo/core'
            const el = <TextInput className="placeholder-red-500" accessibilityLabel="Email" />
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(output.jsx.contains("placeholderTextColor={'#fb2c36'}"), "{}", output.jsx);
        // No children, so no closing tag to put them between.
        assert!(output.jsx.ends_with("/>"), "{}", output.jsx);
    }

    #[test]
    fn placeholder_colour_on_something_that_has_no_placeholder_is_refused() {
        // The colour is only meaningful where a placeholder exists. On a
        // View it has nothing to colour, and saying so beats emitting a
        // style React Native would ignore.
        let source = r#"
            import { View } from '@hozo/core'
            const el = <View className="placeholder-red-500" />
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert_eq!(output.diagnostics.len(), 1, "{:?}", output.diagnostics);
        assert_eq!(output.diagnostics[0].code, DiagnosticCode::NotWiredOnNative);
    }

    #[test]
    fn caret_colour_lowers_to_text_inputs_cursor_prop() {
        let source = r#"
            import { TextInput } from '@hozo/core'
            const el = <TextInput className="caret-blue-500" accessibilityLabel="Email" />
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(output.jsx.contains("cursorColor={'#2b7fff'}"), "{}", output.jsx);
    }

    #[test]
    fn a_text_input_without_an_accessible_name_is_diagnosed() {
        // The whole reason `TextInput` was added with a rule attached: a
        // placeholder reads like a label and isn't one.
        let source = r#"
            import { TextInput } from '@hozo/core'
            const el = <TextInput placeholder="you@example.com" />
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        let warning = output
            .diagnostics
            .iter()
            .find(|d| d.code == DiagnosticCode::A11yMissingAccessibleName)
            .expect("a nameless field must be diagnosed");
        assert!(warning.message.contains("placeholder is not a"), "{}", warning.message);

        // ...and the label, however it was spelled in source, is written
        // under React Native's name for it.
        let named = r#"
            import { TextInput } from '@hozo/core'
            const el = <TextInput aria-label="Email" />
            "#;
        let parsed = hozo_parser::parse_tsx(named);
        let output = lower(&parsed.roots[0].node, named, &Theme::default());
        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(output.jsx.contains(r#"accessibilityLabel={"Email"}"#), "{}", output.jsx);
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
            ("fill-red-500", "SVG", DiagnosticCode::WebOnlyPropertyOnNative),
            ("stroke-red-500", "SVG", DiagnosticCode::WebOnlyPropertyOnNative),
            ("accent-red-500", "form controls", DiagnosticCode::WebOnlyPropertyOnNative),
            ("caret-red-500", "TextInput", DiagnosticCode::NotWiredOnNative),
            ("placeholder-red-500", "TextInput", DiagnosticCode::NotWiredOnNative),
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
            assert!(refusal.message.contains(expected), "{candidate}: {}", refusal.message);
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
        assert!(output.styles.contains("textDecorationColor: '#fb2c36',"), "{}", output.styles);
        assert!(output.styles.contains("textDecorationStyle: 'double',"), "{}", output.styles);

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
            assert!(output.diagnostics.is_empty(), "{candidate}: {:?}", output.diagnostics);
            assert!(
                output.styles.contains(&format!("textDecorationStyle: {expected},")),
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
        assert!(output.styles.contains("outlineWidth: 0,"), "{}", output.styles);
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
        assert!(output.jsx.contains("<HozoSpaced style={hozoStyles.hozo0Children}>"), "{}", output.jsx);
        assert!(output.jsx.contains("</HozoSpaced>"), "{}", output.jsx);
        assert!(output.runtime_imports.contains(&"HozoSpaced"), "{:?}", output.runtime_imports);

        // The child style, not the parent's: the element itself gets no
        // border or margin from these.
        assert!(output.styles.contains("hozo0Children: {"), "{}", output.styles);
        assert!(output.styles.contains("borderTopWidth: 0,"), "{}", output.styles);
        assert!(output.styles.contains("borderBottomWidth: 4,"), "{}", output.styles);
        assert!(output.styles.contains("marginTop: 0,"), "{}", output.styles);
        assert!(output.styles.contains("marginBottom: 8,"), "{}", output.styles);
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
        assert!(output.styles.contains("marginInlineStart: 0,"), "{}", output.styles);
        assert!(output.styles.contains("marginInlineEnd: 12,"), "{}", output.styles);
        assert!(output.styles.contains("borderStartWidth: 0,"), "{}", output.styles);
        assert!(output.styles.contains("borderEndWidth: 2,"), "{}", output.styles);
        assert!(output.styles.contains("borderColor: '#fb2c36',"), "{}", output.styles);
    }

    #[test]
    fn font_relative_metrics_resolve_against_a_text_size_on_the_same_element() {
        // Refused as "the font size isn't known at compile time" until the
        // refusal audit questioned it. Often it *is* known -- `text-lg`
        // right there on the element -- and Tailwind's own output does the
        // same multiplication.
        let source = r#"
            import { Text } from '@hozo/core'
            const el = <Text className="text-lg leading-tight tracking-wide">x</Text>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        // text-lg is 18px; leading-tight is 1.25; tracking-wide is 0.025em.
        assert!(output.styles.contains("lineHeight: 22.5,"), "{}", output.styles);
        assert!(output.styles.contains("letterSpacing: 0.45,"), "{}", output.styles);
    }

    #[test]
    fn font_relative_metrics_resolve_against_an_inherited_text_size() {
        let source = r#"
            import { View, Text } from '@hozo/core'
            const el = (
              <View className="text-lg">
                <Text className="leading-tight tracking-wide">x</Text>
              </View>
            )
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(output.styles.contains("lineHeight: 22.5,"), "{}", output.styles);
        assert!(output.styles.contains("letterSpacing: 0.45,"), "{}", output.styles);
    }

    #[test]
    fn conditional_inherited_font_sizes_only_resolve_the_same_condition() {
        let source = r#"
            import { View, Text } from '@hozo/core'
            const el = (
              <View className="md:text-lg">
                <Text className="md:leading-tight leading-loose">x</Text>
              </View>
            )
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.styles.contains("lineHeight: 22.5,"), "{}", output.styles);
        assert!(
            output.diagnostics.iter().any(|diagnostic| diagnostic.code
                == DiagnosticCode::NotWiredOnNative),
            "{:?}",
            output.diagnostics
        );
    }

    #[test]
    fn a_font_relative_metric_with_no_text_size_is_named_as_unwired_not_web_only() {
        // The distinction is the whole point of the two codes: the platform
        // can hold this value, so calling it Web-only would be false, and
        // the fix is one utility away.
        let source = r#"
            import { Text } from '@hozo/core'
            const el = <Text className="leading-tight">x</Text>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert_eq!(output.diagnostics.len(), 1, "{:?}", output.diagnostics);
        assert_eq!(output.diagnostics[0].code, DiagnosticCode::NotWiredOnNative);
        assert!(output.diagnostics[0].message.contains("text-*"), "{}", output.diagnostics[0].message);
        assert!(!output.styles.contains("lineHeight"), "{}", output.styles);
    }

    #[test]
    fn a_conditional_text_size_does_not_resolve_an_unconditional_ratio() {
        // Folding `leading-tight` against `md:text-lg` would bake a size
        // that only applies above 768px into a style that always applies.
        let source = r#"
            import { Text } from '@hozo/core'
            const el = <Text className="md:text-lg leading-tight">x</Text>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(
            output.diagnostics.iter().any(|d| d.code == DiagnosticCode::NotWiredOnNative
                && d.message.contains("text-*")),
            "{:?}",
            output.diagnostics
        );
        // `md:text-lg` still brings its own line height into the md entry;
        // what must not appear is the ratio folded against it.
        assert!(!output.styles.contains("lineHeight: 22.5"), "{}", output.styles);
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
        assert!(output.runtime_imports.is_empty(), "{:?}", output.runtime_imports);
    }

    #[test]
    fn viewport_sizes_become_an_inline_style_read_from_a_hook() {
        // Refused as "React Native has no viewport unit" until the refusal
        // audit pointed out that `height` is an ordinary style key there.
        // The obstacle was never the unit; it was that the value changes on
        // rotation, so it can't sit in a `StyleSheet.create` object that is
        // evaluated once.
        let source = r#"
            import { View } from '@hozo/core'
            const el = <View className="h-screen p-4" />
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert_eq!(output.prelude, vec!["const __hozoViewport = useHozoViewport()"]);
        assert_eq!(output.runtime_imports, vec!["useHozoViewport"]);
        // Two array elements, not one comma expression: the static entry
        // and the live one.
        assert!(
            output.jsx.contains("style={[hozoStyles.hozo0, { height: __hozoViewport.height }]}"),
            "{}",
            output.jsx
        );
        // ...and the size stays out of the StyleSheet, where it would be
        // frozen at whatever the window was on the first render.
        assert!(!output.styles.contains("height"), "{}", output.styles);
        assert!(!output.styles.contains(": ,"), "{}", output.styles);
    }

    #[test]
    fn spin_animation_uses_one_native_driver_hook() {
        let source = r#"
            import { View } from '@hozo/core'
            const el = (
              <View className="animate-spin">
                <View className="md:animate-spin" />
              </View>
            )
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert_eq!(
            output.prelude.iter().filter(|line| line.contains("useHozoAnimation('spin')")).count(),
            1
        );
        assert!(output.jsx.contains("style={__hozoAnim_spin}"), "{}", output.jsx);
        assert!(
            output.jsx.contains("__hozoBp_md && __hozoAnim_spin"),
            "{}",
            output.jsx
        );
        assert!(output.runtime_imports.contains(&"useHozoAnimation"));
    }

    #[test]
    fn a_partial_viewport_size_multiplies_the_window() {
        // Tested at this level rather than through a utility because no
        // utility reaches it yet: `*-screen` is the only viewport size
        // Hozo parses, and it is always 100%. `Dimension` carries a
        // percentage because `h-dvh`/`h-lvh` and arbitrary values will land
        // here, so the branch is written and pinned rather than left to be
        // discovered later.
        assert_eq!(
            viewport_object(&[StyleProperty::Width(hozo_ir::Dimension::ViewportWidth(50.0))]),
            Some("{ width: __hozoViewport.width * 0.5 }".to_string())
        );
        assert_eq!(
            viewport_object(&[StyleProperty::MaxHeight(hozo_ir::Dimension::ViewportHeight(
                100.0
            ))]),
            Some("{ maxHeight: __hozoViewport.height }".to_string())
        );
        assert_eq!(viewport_object(&[StyleProperty::Opacity(0.5)]), None);
    }

    #[test]
    fn a_conditional_viewport_size_is_guarded_like_the_entry_beside_it() {
        // Both halves of the style have to carry the guard. Guarding only
        // the StyleSheet entry would apply the height at every width.
        let source = r#"
            import { View } from '@hozo/core'
            const el = <View className="md:h-screen md:p-4" />
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(output.jsx.contains("__hozoBp_md && hozoStyles.hozo0_md"), "{}", output.jsx);
        assert!(
            output.jsx.contains("__hozoBp_md && { height: __hozoViewport.height }"),
            "{}",
            output.jsx
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
    fn interactive_pressable_without_role_is_diagnosed_from_real_source() {
        // As with hozo_web: previously only reachable by hand-constructing
        // a `Node` -- the parser didn't populate on_press/accessibility_role
        // at all until hozo_parser::jsx gained that attribute parsing.
        let source = r#"
            import { Pressable } from '@hozo/core'
            const el = <Pressable onPress={handleTap}>Tap</Pressable>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert_eq!(output.diagnostics.len(), 1);
        assert_eq!(output.diagnostics[0].code, hozo_ir::DiagnosticCode::A11yInteractiveWithoutRole);
        assert!(output.jsx.contains("onPress={handleTap}"));

        let source_with_role = r#"
            import { Pressable } from '@hozo/core'
            const el = (
              <Pressable onPress={handleTap} accessibilityRole="button">Tap</Pressable>
            )
            "#;
        let parsed_with_role = hozo_parser::parse_tsx(source_with_role);
        let output_with_role = lower(&parsed_with_role.roots[0].node, source_with_role, &Theme::default());
        assert!(output_with_role.diagnostics.is_empty());
        assert!(output_with_role.jsx.contains(r#"role="button""#));
    }

    #[test]
    fn semantic_primitives_lower_to_native_text_and_view() {
        let source = r#"
            import { Section, Heading, Paragraph } from '@hozo/core'
            const el = <Section><Heading level={2}>Title</Heading><Paragraph>Body</Paragraph></Section>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert_eq!(
            output.jsx,
            "<View><Text accessibilityRole=\"header\">Title</Text><Text>Body</Text></View>"
        );
    }

    #[test]
    fn article_and_navigation_keep_roles_on_native() {
        let source = r#"
            import { Article, Nav, Heading } from '@hozo/core'
            const el = <Article><Heading>Title</Heading><Nav accessibilityLabel="Primary" /></Article>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert_eq!(
            output.jsx,
            "<View role=\"article\"><Text accessibilityRole=\"header\">Title</Text><View role=\"navigation\" accessibilityLabel={\"Primary\"}></View></View>"
        );
    }

    #[test]
    fn static_list_and_items_keep_native_roles() {
        let source = r#"
            import { List, ListItem } from '@hozo/core'
            const el = <List ordered><ListItem>First</ListItem></List>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert_eq!(
            output.jsx,
            "<View accessibilityRole=\"list\"><View role=\"listitem\"><Text>First</Text></View></View>"
        );
    }
