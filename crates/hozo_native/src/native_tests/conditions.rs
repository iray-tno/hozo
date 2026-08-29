use super::*;

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
    assert!(output
        .jsx
        .contains("style={[hozoStyles.hozo0, (isLoading) && hozoStyles.hozo0_disabled]}"));
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
    assert!(
        output.jsx.contains("(true) && hozoStyles.hozo0_disabled"),
        "{}",
        output.jsx
    );
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
    assert!(output.jsx.contains(
        "style={({ pressed }) => [hozoStyles.hozo0, pressed && hozoStyles.hozo0_pressed]}"
    ));
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
    assert!(output
        .jsx
        .contains("style={[hozoStyles.hozo0, (active) && hozoStyles.hozo0_cond_"));
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
    assert_eq!(
        output.runtime_imports,
        vec!["useHozoDark", "useHozoBreakpoint"]
    );
    assert!(
        output.jsx.contains("__hozoDark && hozoStyles.hozo0_dark"),
        "{}",
        output.jsx
    );
    assert!(
        output.jsx.contains("__hozoBp_md && hozoStyles.hozo0_md"),
        "{}",
        output.jsx
    );
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
    assert!(
        output.jsx.contains("hovered && hozoStyles.hozo0_hover"),
        "{}",
        output.jsx
    );
    assert!(
        output.jsx.contains("focused && hozoStyles.hozo0_focus"),
        "{}",
        output.jsx
    );
    assert!(
        output.jsx.contains("pressed && hozoStyles.hozo0_pressed"),
        "{}",
        output.jsx
    );
    assert!(
        output.jsx.contains("onHoverIn={noticeHover}"),
        "{}",
        output.jsx
    );
    assert!(
        output.jsx.contains("onFocus={noticeFocus}"),
        "{}",
        output.jsx
    );
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
    assert!(
        output
            .jsx
            .contains("{ pressed, hovered, focused, focusVisible }"),
        "{}",
        output.jsx
    );
    assert!(
        output
            .jsx
            .contains("focusVisible && hozoStyles.hozo0_focusvisible"),
        "{}",
        output.jsx
    );
    assert!(
        output.jsx.contains("__hozoBp_md && focusVisible &&"),
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
        output
            .jsx
            .contains("__hozoBp_md && hozoStyles.hozo1_first_md"),
        "{}",
        output.jsx
    );
    assert!(
        !output.jsx.contains("hozoStyles.hozo2_first_md"),
        "{}",
        output.jsx
    );
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
    let conditional = output
        .jsx
        .find("hozoStyles.hozo0_disabled")
        .expect("conditional style");
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
    assert!(
        output.jsx.contains("hozoStyles.hozo1_first"),
        "{}",
        output.jsx
    );
    // ...and the second doesn't get one at all, which is exactly what
    // `:first-child` would do.
    assert!(
        !output.jsx.contains("hozoStyles.hozo2_first"),
        "{}",
        output.jsx
    );
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
    assert_eq!(
        direct.styles.matches("marginTop: 8").count(),
        1,
        "{}",
        direct.styles
    );
    // `**:` reaches the inner View *and* the Text below it.
    let all = native_jsx(&source.replace("CLASS", "**:mt-2"));
    assert_eq!(
        all.styles.matches("marginTop: 8").count(),
        2,
        "{}",
        all.styles
    );
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
    assert!(
        responsive.diagnostics.is_empty(),
        "{:?}",
        responsive.diagnostics
    );
    assert!(responsive.jsx.contains("__hozoBp_md"), "{}", responsive.jsx);

    let hovered = native_jsx(&source.replace("CLASS", "hover:*:mt-2"));
    assert_eq!(hovered.diagnostics.len(), 1, "{:?}", hovered.diagnostics);
    assert!(
        hovered.diagnostics[0]
            .message
            .contains("hand an element's own state down"),
        "{}",
        hovered.diagnostics[0].message,
    );

    // And the other order is the children's own state, which needs
    // nothing from the parent.
    let child_hover = native_jsx(&source.replace("CLASS", "*:hover:mt-2"));
    assert!(
        !child_hover
            .diagnostics
            .iter()
            .any(|d| d.message.contains("own state down")),
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
        output
            .diagnostics
            .iter()
            .any(|d| d.message.contains("doesn't read")),
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
    assert!(
        output.jsx.contains("<HozoContainerQuery>{(__hozoCq) =>"),
        "{}",
        output.jsx
    );
    assert!(
        output.jsx.contains(r#"__hozoCq[""] >= 384"#),
        "{}",
        output.jsx
    );
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
    assert!(
        output.jsx.contains(r#"__hozoCq[""] !== undefined"#),
        "{}",
        output.jsx
    );
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
    assert!(
        output.jsx.contains(r#"hozoContainerName="main""#),
        "{}",
        output.jsx
    );
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
    assert!(
        !output.styles.contains("containerType"),
        "{}",
        output.styles
    );
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
    assert!(output
        .prelude
        .iter()
        .any(|line| line.contains("useHozoWidthAtLeast(500)")));
    assert!(output
        .prelude
        .iter()
        .any(|line| line.contains("useHozoWidthAtLeast(768)")));
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
    assert!(
        output.diagnostics[0].message.contains("40rem"),
        "{}",
        output.diagnostics[0].message
    );
}

#[test]
fn read_only_is_the_one_form_state_native_can_answer() {
    // React Native has the state -- under two names -- as a prop the
    // compiler is looking at, so `read-only:` resolves the same way
    // `disabled:` does rather than being reported.
    let cases = [
        (
            r#"<TextInput accessibilityLabel="N" readOnly className="read-only:p-4" />"#,
            "true",
        ),
        (
            r#"<TextInput accessibilityLabel="N" editable={canEdit} className="read-only:p-4" />"#,
            "false",
        ),
    ];
    for (element, kind) in cases {
        let source = format!(
            "import {{ TextInput }} from '@hozo/core'
const el = {element}
"
        );
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
        assert_eq!(
            output.diagnostics.len(),
            1,
            "{class_name}: {:?}",
            output.diagnostics
        );
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
        assert_eq!(
            output.jsx.contains("hozo1_empty"),
            applies,
            "{}",
            output.jsx
        );
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
    assert!(
        reported[0].message.contains("position"),
        "{}",
        reported[0].message
    );
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
        output
            .diagnostics
            .iter()
            .map(|d| &d.message)
            .collect::<Vec<_>>()
    );
    assert!(
        output.jsx.contains("pressed && hozoStyles."),
        "{}",
        output.jsx
    );
    assert!(
        output.jsx.contains("(isOff) && hozoStyles."),
        "{}",
        output.jsx
    );
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
    assert_eq!(
        output.prelude,
        vec!["const __hozoViewport = useHozoViewport()"]
    );
    assert_eq!(output.runtime_imports, vec!["useHozoViewport"]);
    // Two array elements, not one comma expression: the static entry
    // and the live one.
    assert!(
        output
            .jsx
            .contains("style={[hozoStyles.hozo0, { height: __hozoViewport.height }]}"),
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
        output
            .prelude
            .iter()
            .filter(|line| line.contains("useHozoAnimation('spin')"))
            .count(),
        1
    );
    assert!(
        output.jsx.contains("style={__hozoAnim_spin}"),
        "{}",
        output.jsx
    );
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
        viewport_object(&[StyleProperty::Width(hozo_ir::Dimension::ViewportWidth(
            50.0
        ))]),
        Some("{ width: __hozoViewport.width * 0.5 }".to_string())
    );
    assert_eq!(
        viewport_object(&[StyleProperty::MaxHeight(
            hozo_ir::Dimension::ViewportHeight(100.0)
        )]),
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
    assert!(
        output.jsx.contains("__hozoBp_md && hozoStyles.hozo0_md"),
        "{}",
        output.jsx
    );
    assert!(
        output
            .jsx
            .contains("__hozoBp_md && { height: __hozoViewport.height }"),
        "{}",
        output.jsx
    );
}
