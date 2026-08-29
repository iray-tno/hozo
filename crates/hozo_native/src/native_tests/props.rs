use super::*;

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
