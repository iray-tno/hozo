use super::*;

#[test]
fn authored_gap_projection_is_bounded_to_known_or_opaque_class_gap_owners() {
    for (classes, expected) in [
        (r#""gap-y-2""#, true),
        (r#""gap-x-2""#, true),
        (r#""gap-2""#, true),
        ("{classes}", true),
        (r#""opacity-50""#, false),
    ] {
        let source = format!("import {{ View }} from '@hozo/core';const el=<View className={classes} style={{own}} />");
        let parsed = hozo_parser::parse_tsx(&source);
        let output = lower(&parsed.roots[0].node, &source, &Theme::default());
        assert_eq!(
            output.jsx.contains("hozoAuthoredStyle(own)"),
            expected,
            "{}",
            output.jsx
        );
        assert_eq!(
            output.runtime_imports.contains(&"hozoAuthoredStyle"),
            expected
        );
    }
    let source = r#"import {View} from '@hozo/core';const el=<View className="gap-2" />"#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(!output.runtime_imports.contains(&"hozoAuthoredStyle"));
}

#[test]
fn secondary_gap_owners_project_authors_before_composing_class_axes() {
    for classes in [r#""gap-y-2""#, "{classes}"] {
        for style in [" optionStyle={own}", " {...rest}"] {
            let source = format!("import {{Listbox}} from '@hozo/core';const el=<Listbox optionClassName={classes}{style}/>");
            let parsed = hozo_parser::parse_tsx(&source);
            let output = lower(&parsed.roots[0].node, &source, &Theme::default());
            let helper = if classes == "{classes}" {
                // The owner resolves opaque classes separately; no compiled
                // axes have been mixed into the public authored style.
                "optionClassName={classes}"
            } else if style.contains("own") {
                "hozoAuthoredStyle(own)"
            } else {
                "hozoGapSpreadStyles"
            };
            assert!(output.jsx.contains(helper), "{}", output.jsx);
        }
    }
    let source = r#"import {Listbox} from '@hozo/core';const el=<Listbox optionClassName="opacity-50" optionStyle={own} {...rest}/>"#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(!output.runtime_imports.contains(&"hozoAuthoredStyle"));
    assert!(!output.runtime_imports.contains(&"hozoGapSpreadStyles"));
}

#[test]
fn unmodeled_props_and_spreads_reach_the_output() {
    let source = r#"
            import { View } from '@hozo/core'
            const el = <View className="p-4" {...rest} onLayout={onLayout} testID="row" />
            "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    // The spread may carry `style`, so the compiled one goes through it (#1054).
    assert!(
        output
            .jsx
            .contains("{...hozoSpreadStyles({ style: hozoStyles.hozo0 }, [], rest)}"),
        "{}",
        output.jsx
    );
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
        assert!(
            output.jsx.contains(expected),
            "missing {expected}: {}",
            output.jsx
        );
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
        assert!(
            output.jsx.contains(expected),
            "missing {expected}: {}",
            output.jsx
        );
    }
    assert!(
        output.runtime_imports.is_empty(),
        "{:?}",
        output.runtime_imports
    );
}

#[test]
fn image_default_source_uses_the_same_native_normalizer() {
    let source = r#"
            import { Image } from '@hozo/core'
            const el = <Image src={remote} defaultSource={require('./fallback.png')} alt="Cover" />
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(
        output.jsx.contains("source={hozoImageSource(remote)}"),
        "{}",
        output.jsx
    );
    assert!(
        output
            .jsx
            .contains("defaultSource={hozoImageSource(require('./fallback.png'))}"),
        "{}",
        output.jsx
    );
    assert!(output.runtime_imports.contains(&"hozoImageSource"));
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
        assert!(
            output.jsx.contains(expected),
            "{expected} missing from {}",
            output.jsx
        );
    }
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
    assert!(
        output.jsx.contains("placeholderTextColor={'#fb2c36'}"),
        "{}",
        output.jsx
    );
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
fn placeholder_pseudo_colour_and_dark_mode_are_props_not_value_styles() {
    let source = "import {TextInput} from '@hozo/core'; export function C() { return <TextInput accessibilityLabel=\"Field\" className=\"text-green-500 placeholder:text-red-500 dark:placeholder:text-blue-500\"/> }";
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(
        output
            .jsx
            .contains("placeholderTextColor={__hozoDark ? '#2b7fff' : '#fb2c36'}"),
        "{}",
        output.jsx
    );
    assert!(output.styles.contains("color: '#00c950'"));
    assert!(!output.styles.contains("#fb2c36"));
    assert!(!output.styles.contains("#2b7fff"));
    assert_eq!(output.prelude, ["const __hozoDark = useHozoDark()"]);
}

#[test]
fn unsupported_placeholder_styles_and_stacks_still_diagnose() {
    for classes in [
        "placeholder:font-bold",
        "hover:placeholder:text-red-500",
        "visited:placeholder:text-red-500",
        "placeholder:text-current",
        "placeholder:text-inherit",
        "placeholder:text-[color(display-p3_1_0_0)]",
    ] {
        let source = format!("import {{TextInput}} from '@hozo/core'; export function C() {{ return <TextInput accessibilityLabel=\"Field\" className=\"{classes}\"/> }}");
        let parsed = hozo_parser::parse_tsx(&source);
        let output = lower(&parsed.roots[0].node, &source, &Theme::default());
        assert!(
            output
                .diagnostics
                .iter()
                .any(|d| d.code == DiagnosticCode::NotWiredOnNative),
            "{classes}: {:?}",
            output.diagnostics
        );
    }
}

#[test]
fn an_authored_placeholder_prop_wins_and_a_plain_colour_needs_no_hook() {
    let source = "import {TextInput} from '@hozo/core'; const e = <TextInput accessibilityLabel=\"Field\" placeholderTextColor={authored} className=\"placeholder:text-red-500\"/>";
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert_eq!(output.jsx.matches("placeholderTextColor=").count(), 1);
    assert!(output.jsx.contains("placeholderTextColor={authored}"));
    assert!(output.prelude.is_empty());
}

#[test]
fn selection_background_lowers_to_text_inputs_selection_colour() {
    let source = "import {TextInput} from '@hozo/core'; export function C() { return <TextInput accessibilityLabel=\"Field\" className=\"bg-white selection:bg-red-500 dark:selection:bg-blue-500\"/> }";
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(
        output
            .jsx
            .contains("selectionColor={__hozoDark ? '#2b7fff' : '#fb2c36'}"),
        "{}",
        output.jsx
    );
    // The field's own background is still a style; the highlight is not.
    assert!(
        output.styles.contains("backgroundColor: '#fff'"),
        "{}",
        output.styles
    );
    assert!(!output.styles.contains("#fb2c36"), "{}", output.styles);
    assert!(!output.styles.contains("#2b7fff"), "{}", output.styles);
}

#[test]
fn an_authored_selection_colour_wins() {
    let source = "import {TextInput} from '@hozo/core'; const e = <TextInput accessibilityLabel=\"Field\" selectionColor={authored} className=\"selection:bg-red-500\"/>";
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert_eq!(
        output.jsx.matches("selectionColor=").count(),
        1,
        "{}",
        output.jsx
    );
    assert!(
        output.jsx.contains("selectionColor={authored}"),
        "{}",
        output.jsx
    );
}

#[test]
fn selection_styles_the_prop_cannot_carry_still_diagnose() {
    // The prop is the highlight colour and nothing else: not the selected
    // text's colour, not a stack it cannot follow (TextInput has no hover),
    // and not on an element that has no selection to highlight.
    for (primitive, classes) in [
        ("TextInput", "selection:text-red-500"),
        ("TextInput", "selection:p-4"),
        ("TextInput", "hover:selection:bg-red-500"),
        ("TextInput", "visited:selection:bg-red-500"),
        ("TextInput", "selection:bg-current"),
        ("View", "selection:bg-red-500"),
    ] {
        let source = format!("import {{{primitive}}} from '@hozo/core'; export function C() {{ return <{primitive} accessibilityLabel=\"Field\" className=\"{classes}\"/> }}");
        let parsed = hozo_parser::parse_tsx(&source);
        let output = lower(&parsed.roots[0].node, &source, &Theme::default());
        assert!(
            output
                .diagnostics
                .iter()
                .any(|d| d.code == DiagnosticCode::NotWiredOnNative),
            "{classes} on {primitive}: {:?}",
            output.diagnostics
        );
        assert!(!output.jsx.contains("selectionColor"), "{}", output.jsx);
        assert!(!output.jsx.contains("hozoFieldColors"), "{}", output.jsx);
    }
}

#[test]
fn conditional_field_colours_lower_to_props_and_focus_callback() {
    // Non-interactive stacks (breakpoints, env, props, container queries) stay on
    // plain TextInput props with zero callback overhead.
    let source = r#"
        import { TextInput } from '@hozo/core'
        export function C({ locked }) {
            return <TextInput accessibilityLabel="Field" readOnly={locked} className="selection:bg-red-500 md:selection:bg-blue-500 read-only:placeholder:text-gray-400 rtl:caret-blue-500" />
        }
    "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(
        output
            .jsx
            .contains("selectionColor={__hozoBp_md ? '#2b7fff' : '#fb2c36'}"),
        "{}",
        output.jsx
    );
    assert!(
        output
            .jsx
            .contains("placeholderTextColor={(locked) ? '#99a1af' : undefined}"),
        "{}",
        output.jsx
    );
    assert!(
        output
            .jsx
            .contains("cursorColor={__hozoEnv_rtl ? '#2b7fff' : undefined}"),
        "{}",
        output.jsx
    );
    assert!(output.jsx.starts_with("<TextInput "), "{}", output.jsx);

    // Focus-driven stacks upgrade to HozoTextInput with `hozoFieldColors`.
    let focused_source = r#"
        import { TextInput } from '@hozo/core'
        export function C() {
            return <TextInput accessibilityLabel="Field" className="selection:bg-red-500 focus:selection:bg-blue-500 focus-visible:placeholder:text-gray-500 md:focus:caret-blue-500" />
        }
    "#;
    let parsed = hozo_parser::parse_tsx(focused_source);
    let output = lower(&parsed.roots[0].node, focused_source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(output.jsx.starts_with("<HozoTextInput "), "{}", output.jsx);
    assert!(output.jsx.contains("hozoFieldColors={"), "{}", output.jsx);
    assert!(
        output
            .jsx
            .contains("selectionColor: focused ? '#2b7fff' : '#fb2c36'"),
        "{}",
        output.jsx
    );
    assert!(
        output
            .jsx
            .contains("placeholderTextColor: focusVisible ? '#6a7282' : undefined"),
        "{}",
        output.jsx
    );
    assert!(
        output
            .jsx
            .contains("cursorColor: __hozoBp_md && focused ? '#2b7fff' : undefined"),
        "{}",
        output.jsx
    );

    // Container query on selection colour wraps TextInput in HozoContainerQuery.
    let cq_source = r#"
        import { TextInput } from '@hozo/core'
        export function C() {
            return <TextInput accessibilityLabel="Field" className="@sm:selection:bg-blue-500" />
        }
    "#;
    let parsed = hozo_parser::parse_tsx(cq_source);
    let output = lower(&parsed.roots[0].node, cq_source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(
        output.jsx.contains("<HozoContainerQuery>"),
        "{}",
        output.jsx
    );
    assert!(output.jsx.contains("selectionColor={"), "{}", output.jsx);

    // Failed stacked condition must not leak hooks into the prelude.
    let bad_source = r#"
        import { TextInput } from '@hozo/core'
        export function C() {
            return <TextInput accessibilityLabel="Field" className="md:hover:selection:bg-blue-500" />
        }
    "#;
    let parsed = hozo_parser::parse_tsx(bad_source);
    let output = lower(&parsed.roots[0].node, bad_source, &Theme::default());
    assert!(
        output
            .diagnostics
            .iter()
            .any(|d| d.code == DiagnosticCode::NotWiredOnNative),
        "{:?}",
        output.diagnostics
    );
    assert!(
        !output.prelude.iter().any(|p| p.contains("__hozoBp_md")),
        "{:?}",
        output.prelude
    );
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
    assert!(
        output.jsx.contains("cursorColor={'#2b7fff'}"),
        "{}",
        output.jsx
    );
}

fn native(source: &str) -> String {
    let parsed = hozo_parser::parse_tsx(source);
    lower(&parsed.roots[0].node, source, &Theme::default()).jsx
}

#[test]
fn a_spread_that_cannot_carry_style_keeps_the_plain_attribute() {
    // `style` was taken out by name, so `rest` provably has none: no helper,
    // and the output is what it was before #1054.
    let jsx = native(
        r#"
        import { View } from '@hozo/core'
        function Box({ style, ...rest }) { return <View {...rest} className="p-4" style={style} /> }
        "#,
    );
    assert_eq!(
        jsx,
        "<View style={[hozoStyles.hozo0, style]} {...rest}></View>"
    );
    // No spread at all, no helper.
    let plain = native(
        r#"
        import { View } from '@hozo/core'
        const el = <View className="p-4" testID="a" />
        "#,
    );
    assert!(!plain.contains("hozoSpreadStyles"), "{plain}");
}

#[test]
fn a_wrappers_spread_composes_with_the_pattern_slot_styles_it_compiled() {
    // The issue's shape: a UI wrapper over a pattern, handing `rest` on.
    let jsx = native(
        r#"
        import { cx } from '@hozo/core'
        import { Listbox as ListboxPattern } from '@hozo/patterns'
        const box = 'max-h-60 p-2'
        function UiListbox({ className, ...rest }) {
          return <ListboxPattern {...rest} className={cx(box, className)} optionClassName="px-2" />
        }
        "#,
    );
    // An opaque caller class may write a start or end edge, so the caller's
    // style goes through the edge-aware boundary, gap projection included
    // (#2050).
    assert!(
        jsx.starts_with(
            "<HozoListbox {...hozoEdgeSpreadStyles(I18nManager.isRTL, I18nManager.doLeftAndRightSwapInRTL, true)({ "
        ),
        "{jsx}"
    );
    assert!(jsx.contains("optionStyle: hozoStyles.hozo1"), "{jsx}");
    assert!(
        jsx.contains("style: [hozoStyles.hozo0, hozoClasses(className, "),
        "{jsx}"
    );
    assert!(jsx.ends_with("}, [], rest)}></HozoListbox>"), "{jsx}");
    // Each held style once, and `rest` once: nothing reads `rest.style`.
    assert_eq!(jsx.matches("rest").count(), 1, "{jsx}");
}

#[test]
fn multiple_spreads_keep_their_order_with_the_props_between_them() {
    // Unmodelled props, re-emitted from source in their order: one before the
    // spreads, two between them, one after.
    let jsx = native(
        r#"
        import { View } from '@hozo/core'
        const el = <View first="1" {...a} label="Go" onThing={measure} {...b} className="p-4" last />
        "#,
    );
    assert_eq!(
        jsx,
        r#"<View first="1" {...hozoSpreadStyles({ style: hozoStyles.hozo0 }, [], a, { "label": "Go" }, { "onThing": (measure) }, b)} last></View>"#
    );
}

#[test]
fn a_style_written_after_the_spreads_still_wins_over_theirs() {
    let after = native(
        r#"
        import { View } from '@hozo/core'
        const el = <View {...rest} className="p-4" style={mine} />
        "#,
    );
    assert!(
        after.contains(r#"hozoSpreadStyles({ style: [hozoStyles.hozo0, mine] }, ["style"], rest)"#),
        "{after}"
    );
    // Written before: the spread's style came later in source, so it composes.
    let before = native(
        r#"
        import { View } from '@hozo/core'
        const el = <View style={mine} className="p-4" {...rest} />
        "#,
    );
    assert!(
        before.contains(r#"hozoSpreadStyles({ style: [hozoStyles.hozo0, mine] }, [], rest)"#),
        "{before}"
    );
}

#[test]
fn a_pressed_style_function_goes_through_the_spread_too() {
    let jsx = native(
        r#"
        import { Pressable } from '@hozo/core'
        const el = <Pressable {...rest} role="button" aria-label="Go" onPress={go} className="p-4 active:p-2" />
        "#,
    );
    assert!(
        jsx.contains("{...hozoSpreadStyles({ style: ({ pressed }) => ["),
        "{jsx}"
    );
    assert!(jsx.contains("}, [], rest)}"), "{jsx}");
}

#[test]
fn an_attribute_between_spreads_it_cannot_take_apart_keeps_the_old_emission() {
    // An entity in a JSX string means something else in a JS one.
    let source = r#"
        import { View } from '@hozo/core'
        const el = <View {...a} title="a &amp; b" {...b} className="p-4" />
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    let jsx = &output.jsx;
    assert!(!jsx.contains("hozoSpreadStyles"), "{jsx}");
    assert!(jsx.contains("{...a}") && jsx.contains("{...b}"), "{jsx}");
    // That emission lets a spread's style replace the compiled one, so it
    // is said, at the prop that stopped the composition.
    let warning = output
        .diagnostics
        .iter()
        .find(|d| d.code == DiagnosticCode::UnsafePropSpreadAfterStyle)
        .expect("the fallback is reported");
    assert_eq!(warning.severity, Severity::Warning);
    assert!(warning.message.contains("`style`"), "{}", warning.message);
    assert_eq!(
        &source[warning.span.start as usize..warning.span.end as usize],
        r#"title="a &amp; b""#
    );
}

#[test]
fn a_composed_spread_raises_no_fallback_warning() {
    let source = r#"
        import { View } from '@hozo/core'
        const el = <View {...a} title="Go" {...b} className="p-4" />
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.jsx.contains("hozoSpreadStyles"), "{}", output.jsx);
    assert!(output
        .diagnostics
        .iter()
        .all(|d| d.code != DiagnosticCode::UnsafePropSpreadAfterStyle));
}
