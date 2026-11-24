use super::*;

#[test]
fn children_the_compiler_cannot_read_are_carried_and_their_primitives_still_compile() {
    // Until 2026-08-15 every one of these vanished from the output with
    // no diagnostic. Now the *expression* is carried untouched while
    // the primitives inside it compile exactly as top-level ones do.
    let source = r#"
        import { View, Text } from '@hozo/core'
        export function C({ show, items, name }) {
          return (
            <View className="p-4">
              <ProfilePicture />
              {show && <Text className="text-xl">hi</Text>}
              {items.map((i) => <Text key={i} className="p-2">{i}</Text>)}
              <Text>Hello {name}</Text>
            </View>
          )
        }
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());

    // Carried, not interpreted: the guard and the callback survive.
    assert!(output.jsx.contains("{show && "), "{}", output.jsx);
    assert!(output.jsx.contains("{items.map((i) => "), "{}", output.jsx);
    assert!(output.jsx.contains("<ProfilePicture />"), "{}", output.jsx);
    // ...while the primitives inside them are fully lowered.
    assert!(!output.jsx.contains("<Text"), "{}", output.jsx);
    assert!(output.css.contains("font-size: 20px;"), "{}", output.css);
    assert!(output.css.contains("padding-top: 8px;"), "{}", output.css);
    // Text and expression keep their order.
    assert!(output.jsx.contains(">Hello {name}<"), "{}", output.jsx);
}

#[test]
fn flat_list_keeps_its_web_renderer_and_compiles_the_render_item_body() {
    let source = r#"
        import { FlatList, Text } from '@hozo/core'
        const el = <FlatList className="h-40" data={rows}
          renderItem={({ item }) => <Text className="p-2">{item}</Text>} />
    "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(
        output.jsx.starts_with("<HozoFlatList className=\"hozo-0\""),
        "{}",
        output.jsx
    );
    assert!(output.runtime_imports.contains(&"HozoFlatList"));
    assert!(
        output
            .jsx
            .contains("renderItem={({ item }) => <span className=\"hozo-1\">{item}</span>}"),
        "{}",
        output.jsx
    );
    assert!(output.css.contains("height: 160px"), "{}", output.css);
    assert!(output.css.contains("padding-top: 8px"), "{}", output.css);
}

#[test]
fn flat_list_keeps_refresh_columns_and_pagination_props_for_its_web_runtime() {
    let source = r#"
        import { FlatList, Text } from '@hozo/core'
        const el = <FlatList data={rows} horizontal={horizontal} numColumns={2}
          refreshing={loading} onRefresh={reload}
          onEndReached={loadMore} onEndReachedThreshold={0.5}
          showsHorizontalScrollIndicator={false}
          ListEmptyComponent={<Text className="p-2">Empty</Text>}
          renderItem={({ item }) => <Text>{item}</Text>} />
    "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.jsx.starts_with("<HozoFlatList"), "{}", output.jsx);
    assert!(output.runtime_imports.contains(&"HozoFlatList"));
    assert!(
        output.jsx.contains(" horizontal={horizontal}"),
        "{}",
        output.jsx
    );
    assert!(
        output
            .jsx
            .contains(" refreshing={loading} onRefresh={reload}"),
        "{}",
        output.jsx
    );
    assert!(
        output
            .jsx
            .contains(" showsHorizontalScrollIndicator={false}"),
        "{}",
        output.jsx
    );
    assert!(output.jsx.contains("numColumns={2}"), "{}", output.jsx);
    assert!(
        output.jsx.contains("onEndReached={loadMore}"),
        "{}",
        output.jsx
    );
    assert!(
        output.jsx.contains("onEndReachedThreshold={0.5}"),
        "{}",
        output.jsx
    );
    assert!(
        output
            .jsx
            .contains("ListEmptyComponent={<span className=\"hozo-1\">Empty</span>}"),
        "{}",
        output.jsx
    );
}

#[test]
fn scroll_view_refresh_uses_the_accessible_web_fallback() {
    let source = r#"
        import { ScrollView, Text } from '@hozo/core'
        const el = <ScrollView className="h-40" horizontal={wide}
          refreshing={loading} onRefresh={reload}
          keyboardShouldPersistTaps="handled"
          showsHorizontalScrollIndicator={false}
          accessibilityLabel="Results">
          <Text>row</Text>
        </ScrollView>
    "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(
        output
            .jsx
            .starts_with("<HozoScrollView className=\"hozo-scroll-view hozo-0\""),
        "{}",
        output.jsx
    );
    assert!(output.runtime_imports.contains(&"HozoScrollView"));
    assert!(output.jsx.contains(" horizontal={wide}"), "{}", output.jsx);
    assert!(
        output
            .jsx
            .contains(" refreshing={loading} onRefresh={reload}"),
        "{}",
        output.jsx
    );
    assert!(
        output
            .jsx
            .contains(" keyboardShouldPersistTaps={\"handled\"}"),
        "{}",
        output.jsx
    );
    assert!(
        output
            .jsx
            .contains(" showsHorizontalScrollIndicator={false}"),
        "{}",
        output.jsx
    );
    assert!(
        output.jsx.contains(" accessibilityLabel={\"Results\"}"),
        "{}",
        output.jsx
    );
    assert!(!output.jsx.contains("aria-label"), "{}", output.jsx);
}

#[test]
fn scroll_view_with_a_nested_refresh_control_reaches_the_runtime_that_reads_it() {
    // React Native's spelling: the control as an element in a prop. A
    // `div` took it as an unknown DOM attribute and drew nothing.
    let source = r#"
        import { RefreshControl, ScrollView, Text } from '@hozo/core'
        const el = <ScrollView
          refreshControl={<RefreshControl refreshing={busy} onRefresh={reload} />}>
          <Text>row</Text>
        </ScrollView>
    "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.jsx.starts_with("<HozoScrollView "), "{}", output.jsx);
    assert!(
        output
            .jsx
            .contains("refreshControl={<HozoRefreshControl refreshing={busy} onRefresh={reload}>"),
        "{}",
        output.jsx
    );
    assert!(output.runtime_imports.contains(&"HozoScrollView"));
    assert!(output.runtime_imports.contains(&"HozoRefreshControl"));
}

#[test]
fn scroll_view_without_refresh_stays_zero_runtime_and_hides_its_active_indicator() {
    let source = r#"
        import { ScrollView } from '@hozo/core'
        const el = <ScrollView horizontal={wide}
          showsHorizontalScrollIndicator={showHorizontal}
          showsVerticalScrollIndicator={showVertical} />
    "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(
        output
            .jsx
            .starts_with("<div className=\"hozo-scroll-view\""),
        "{}",
        output.jsx
    );
    assert!(
        output
            .jsx
            .contains("data-hozo-horizontal={wide ? '' : undefined}"),
        "{}",
        output.jsx
    );
    assert!(output.jsx.contains("data-hozo-hide-scrollbar={(wide ? !(showHorizontal) : !(showVertical)) ? '' : undefined}"), "{}", output.jsx);
    assert!(
        output.css.contains("scrollbar-width: none"),
        "{}",
        output.css
    );
    assert!(output.css.contains("::-webkit-scrollbar"), "{}", output.css);
}

#[test]
fn universal_native_props_lower_to_dom_identity_pointer_and_aria() {
    let source = r#"
        import { View } from '@hozo/core'
        const el = <View testID="card" nativeID="result-card" pointerEvents="box-none"
          accessibilityState={{ disabled, selected: true, busy }}
          accessibilityValue={{ min: 0, max: 10, now: progress, text: label }}
          accessibilityLiveRegion="polite" />
    "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(
        output.jsx.starts_with("<div className=\"hozo-view\""),
        "{}",
        output.jsx
    );
    assert!(
        output.jsx.contains("data-testid={\"card\"}"),
        "{}",
        output.jsx
    );
    assert!(
        output.jsx.contains("id={\"result-card\"}"),
        "{}",
        output.jsx
    );
    assert!(
        output
            .jsx
            .contains("data-hozo-pointer-events={\"box-none\"}"),
        "{}",
        output.jsx
    );
    assert!(
        output
            .jsx
            .contains("aria-disabled={({ disabled, selected: true, busy })?.disabled === true}"),
        "{}",
        output.jsx
    );
    assert!(
        output
            .jsx
            .contains("aria-valuenow={({ min: 0, max: 10, now: progress, text: label }).now}"),
        "{}",
        output.jsx
    );
    assert!(
        output
            .jsx
            .contains("aria-live={\"polite\" === 'none' ? undefined : \"polite\"}"),
        "{}",
        output.jsx
    );
    assert!(
        output
            .css
            .contains("[data-hozo-pointer-events='box-none'] > *"),
        "{}",
        output.css
    );
}

#[test]
fn on_layout_selects_the_core_adapter_only_for_the_measured_node() {
    let source = r#"
        import { View, Text } from '@hozo/core'
        const el = <View onLayout={measure} testID="measured"><Text>child</Text></View>
    "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(
        output.jsx.starts_with("<HozoView className=\"hozo-view\""),
        "{}",
        output.jsx
    );
    assert_eq!(output.runtime_imports, vec!["HozoView"]);
    assert!(
        output
            .jsx
            .contains("testID={\"measured\"} onLayout={measure}"),
        "{}",
        output.jsx
    );
    assert!(output.jsx.contains("<span>child</span>"), "{}", output.jsx);
}

#[test]
fn responder_callbacks_select_the_pointer_bridge_only_for_interactive_nodes() {
    let source = r#"
        import { View, Pressable } from '@hozo/core'
        const el = <View onStartShouldSetResponder={wantStart}
          onStartShouldSetResponderCapture={captureStart}
          onMoveShouldSetResponder={wantMove}
          onMoveShouldSetResponderCapture={captureMove}
          onResponderGrant={grant} onResponderStart={start}
          onResponderMove={move} onResponderEnd={end}
          onResponderRelease={release} onResponderReject={reject}
          onResponderTerminate={terminate}
          onResponderTerminationRequest={allowTermination}>
            <Pressable accessibilityRole="button" disabled={locked}
              onPress={save} onResponderGrant={pressGrant} />
        </View>
    "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(
        output.jsx.starts_with("<HozoView className=\"hozo-view\""),
        "{}",
        output.jsx
    );
    assert_eq!(output.runtime_imports, vec!["HozoView"]);
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
        output
            .jsx
            .contains("<Pressable accessibilityRole=\"button\""),
        "{}",
        output.jsx
    );
    assert!(output.jsx.contains("onPress={save}"), "{}", output.jsx);
    assert!(output.jsx.contains("disabled={locked}"), "{}", output.jsx);
    assert!(!output.jsx.contains("onClick={save}"), "{}", output.jsx);
}

#[test]
fn pan_responder_handler_spreads_select_the_web_bridge() {
    let source = r#"
        import { View } from '@hozo/core'
        import { PanResponder } from '@hozo/rn-compat'
        const pan = PanResponder.create({ onMoveShouldSetPanResponder: () => true })
        const el = <View className="p-4" {...pan.panHandlers} />
    "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(
        output
            .jsx
            .starts_with("<HozoView className=\"hozo-view hozo-0\""),
        "{}",
        output.jsx
    );
    assert_eq!(output.runtime_imports, vec!["HozoView"]);
    assert!(
        output.jsx.contains("{...pan.panHandlers}"),
        "{}",
        output.jsx
    );
}

#[test]
fn structured_and_fallback_image_sources_select_the_web_normalizer() {
    let source = r#"
        import { Image } from '@hozo/core'
        const el = <Image src={{ uri: remote }} defaultSource={assetModule} alt="Cover" />
    "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.jsx.starts_with("<Image "), "{}", output.jsx);
    assert!(
        output.jsx.contains("src={{ uri: remote }}"),
        "{}",
        output.jsx
    );
    assert!(
        output.jsx.contains("defaultSource={assetModule}"),
        "{}",
        output.jsx
    );
    assert!(output.jsx.contains("alt={\"Cover\"}"), "{}", output.jsx);
}

#[test]
fn scroll_events_select_the_bridge_and_keep_the_native_contract() {
    let source = r#"
        import { ScrollView, Text } from '@hozo/core'
        const el = <ScrollView onScroll={remember} scrollEventThrottle={16}><Text>row</Text></ScrollView>
    "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(
        output
            .jsx
            .starts_with("<HozoScrollView className=\"hozo-scroll-view\""),
        "{}",
        output.jsx
    );
    assert!(output.runtime_imports.contains(&"HozoScrollView"));
    assert!(
        output
            .jsx
            .contains("onScroll={remember} scrollEventThrottle={16}"),
        "{}",
        output.jsx
    );
}

#[test]
fn only_the_unresolvable_leaf_falls_back() {
    // proposal §7's three tiers in one className: a literal compiles
    // away, a guarded literal becomes a conditional rule, and only the
    // opaque call is passed through.
    let source = r#"
        import { View } from '@hozo/core'
        import { cn } from 'clsx'
        const el = <View className={cn('p-4', active && 'text-xl', getDynamic())} />
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());

    assert!(output.css.contains("padding-top: 16px;"));
    assert!(output.css.contains("font-size: 20px;"));
    assert!(output.jsx.contains("getDynamic()"));
    // The parts that did compile aren't repeated in the fallback.
    assert!(!output.jsx.contains("'p-4'"));
}
