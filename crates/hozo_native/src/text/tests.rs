use crate::lower;
use hozo_ir::{DiagnosticCode, Theme};

#[test]
fn reference_retains_view_typography_without_changing_normal_lowering() {
    let source = "import {View} from '@hozo/core'; const el=<View className=\"text-red-500 text-[20px]\"><Label/></View>";
    let parsed = hozo_parser::parse_tsx(source);
    let node = &parsed.roots[0].node;
    let normal = lower(node, source, &Theme::default());
    let reference = crate::lower_text_reference(node, &[], source, &Theme::default());
    assert!(!normal.jsx.contains("style="), "{}", normal.jsx);
    assert!(reference.jsx.contains("style="), "{}", reference.jsx);
    assert!(reference.styles.contains("fontSize: 20"));
    assert!(reference.styles.contains("color:"));
    let after = lower(node, source, &Theme::default());
    assert_eq!(normal.jsx, after.jsx);
    assert_eq!(normal.styles, after.styles);
    assert_eq!(normal.runtime_imports, after.runtime_imports);
    assert_eq!(normal.diagnostics, after.diagnostics);
}

#[test]
fn reference_keeps_open_root_ratio_and_does_not_copy_an_inherited_size_over_it() {
    for source in [
            "import {Small} from '@hozo/core'; const el=<Small>x</Small>",
            "import {View,Small} from '@hozo/core'; const el=<View className=\"text-[20px]\"><Small>x</Small></View>",
        ] {
            let parsed = hozo_parser::parse_tsx(source);
            let node = &parsed.roots[0].node;
            let normal = lower(node, source, &Theme::default());
            let reference = crate::lower_text_reference(node, &[], source, &Theme::default());
            assert!(!normal.jsx.contains("HozoRelativeText"), "{}", normal.jsx);
            assert!(reference.jsx.contains("HozoRelativeText"), "{}", reference.jsx);
            assert!(reference.jsx.contains("hozoRelative="), "{}", reference.jsx);
            assert!(reference.runtime_imports.contains(&"HozoRelativeText"));
        }
}

/// A project that ships a CSS reset, which is what `preflight: 'auto'`
/// resolves to for anything using Tailwind -- so it is the theme most
/// of these cases are about. Under it `small` is 80% and `sub`/`sup`
/// are 75%; the bare user agent makes all three `smaller`, and
/// `Theme::default()` is that one (#315).
fn reset() -> Theme {
    Theme::new(std::collections::HashMap::new(), None, true)
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

    assert!(output
        .jsx
        .contains("<Text style={hozoStyles.hozo0_text}>Hello</Text>"));
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
    assert!(
        output.styles.contains("color: '#fb2c36',"),
        "{}",
        output.styles
    );
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
    assert!(
        !output.styles.contains("fontSize: 20,"),
        "{}",
        output.styles
    );
    assert!(
        output.styles.contains("color: '#fb2c36',"),
        "{}",
        output.styles
    );
    assert!(
        output.styles.contains("fontWeight: '700',"),
        "{}",
        output.styles
    );
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
    assert_eq!(
        output.styles.matches("fontSize: 20,").count(),
        1,
        "{}",
        output.styles
    );
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
    assert!(
        output.styles.contains("lineHeight: 22.5,"),
        "{}",
        output.styles
    );
    assert!(
        output.styles.contains("letterSpacing: 0.45,"),
        "{}",
        output.styles
    );
}

#[test]
fn a_relative_size_scales_against_the_nearest_one_not_the_furthest() {
    // `find` used to read the inherited declarations before the
    // parent's own size, and the inherited ones come from further up.
    // So a `Small` inside an `<Heading level={1}>` scaled against the
    // page's 16 rather than the heading's 32 and came out smaller than
    // the body text it is supposed to be smaller than.
    let source = r#"
            import { View, Heading, Small } from '@hozo/core'
            const el = (
              <View className="text-base">
                <Heading level={1}>T<Small>s</Small></Heading>
              </View>
            )
            "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    // 16 * 2 = 32 for the heading, and 32 * 0.85 = 27 inside it.
    assert!(output.styles.contains("fontSize: 32,"), "{}", output.styles);
    assert!(output.styles.contains("fontSize: 27,"), "{}", output.styles);
}

#[test]
fn a_conditional_base_gets_a_conditional_ratio() {
    // The inherited `md:text-xl` reaches the element like any other
    // text declaration. A ratio that existed only at `Always` left it
    // standing above the breakpoint, so a `Small` under
    // `text-base md:text-xl` rendered at 20 on a tablet -- the size of
    // the body, with the shrink gone.
    // `text-2xl` rather than `text-xl` for the breakpoint, so that the
    // scaled number is not also one of the unscaled ones: 20 * 0.8 is
    // 16, which is the base size this element inherits, and an
    // assertion on it would have passed with the ratio missing
    // entirely.
    let source = r#"
            import { View, Small } from '@hozo/core'
            const el = <View className="text-base md:text-2xl">a<Small>s</Small></View>
            "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &reset());
    // 16 * 0.8 = 12.8 -> 13 at the base.
    assert!(output.styles.contains("fontSize: 13,"), "{}", output.styles);
    // 24 * 0.8 = 19.2 -> 19 above the breakpoint, not the 24 it inherited.
    assert!(output.styles.contains("fontSize: 19,"), "{}", output.styles);
    assert!(
        !output
            .styles
            .contains("fontSize: 24,\n    lineHeight: 32,\n  },\n}"),
        "{}",
        output.styles
    );
}

#[test]
fn a_size_the_compiler_cannot_read_is_resolved_at_runtime() {
    // An author's `style` is a number Hozo never sees. Scaling against
    // what it *can* see would be scaling from the wrong base, so the
    // ratio goes to a component instead: one publishes the size React
    // Native resolved, the other reads it.
    let source = r#"
            import { Text, RubyText } from '@hozo/core'
            const el = <Text style={{ fontSize: 20 }}>漢<RubyText>かん</RubyText></Text>
            "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(
        output
            .jsx
            .contains("<HozoTextSize style={{ fontSize: 20 }}>"),
        "{}",
        output.jsx
    );
    assert!(
        output.jsx.contains("<HozoRelativeText hozoRelative={0.5}>"),
        "{}",
        output.jsx
    );
    // And no guess in a stylesheet beside it.
    assert!(!output.styles.contains("fontSize"), "{}", output.styles);
}

#[test]
fn a_reset_heading_is_not_relative_at_runtime_either() {
    // The runtime half of #315, which the static half did not cover.
    // A `Heading` inside an opaque parent hands its ratio to
    // `HozoRelativeText` instead of resolving it, and that path read a
    // ratio table the reset does not use: a level-1 heading under
    // `style={{ fontSize: 20 }}` scaled by 2 and drew at 40, while the
    // browser -- where preflight gives `h1` `font-size: inherit` --
    // drew it at 20.
    //
    // Asking `size_ratio` rather than the primitive is what makes the
    // two halves agree: no ratio, no relative component, and no
    // publisher above it either, because nothing below is relative.
    let source = r#"
            import { Text, Heading } from '@hozo/core'
            const el = <Text style={{ fontSize: 20 }}>t<Heading level={1}>T</Heading></Text>
            "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &reset());
    assert!(!output.jsx.contains("hozoRelative"), "{}", output.jsx);
    assert!(!output.jsx.contains("HozoTextSize"), "{}", output.jsx);
    // The level still reaches a screen reader.
    assert!(
        output.jsx.contains(r#"accessibilityRole="header""#),
        "{}",
        output.jsx
    );

    // Without the reset it is relative, and by the user agent's 2.
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.jsx.contains("hozoRelative={2}"), "{}", output.jsx);
}

#[test]
fn an_opaque_element_with_nothing_relative_below_it_stays_a_text() {
    // The component boundary is only worth what it answers. Most
    // elements with an inline style have nothing scaling against them.
    let source = r#"
            import { Text } from '@hozo/core'
            const el = <Text style={{ fontSize: 20 }}>a</Text>
            "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(!output.jsx.contains("HozoTextSize"), "{}", output.jsx);
    assert!(output.jsx.starts_with("<Text "), "{}", output.jsx);
}

#[test]
fn a_size_the_compiler_can_read_stays_a_number_in_a_stylesheet() {
    // The runtime pair is for the blind case only. Everything Hozo
    // resolves is still a plain `Text` and costs nothing to render.
    let source = r#"
            import { View, Text, RubyText } from '@hozo/core'
            const el = <View className="text-xl"><Text>漢<RubyText>かん</RubyText></Text></View>
            "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(!output.jsx.contains("Hozo"), "{}", output.jsx);
    assert!(output.styles.contains("fontSize: 10,"), "{}", output.styles);
}

#[test]
fn an_authored_style_joins_the_array_rather_than_replacing_it() {
    // Two `style` attributes on one element: JSX keeps the last, so
    // every compiled class on it was dropped. Silently, and only where
    // someone reached for an inline style.
    let source = r#"
            import { Text } from '@hozo/core'
            const el = <Text className="text-xl" style={{ color: 'red' }}>a</Text>
            "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert_eq!(
        output.jsx,
        "<Text style={[hozoStyles.hozo0, { color: 'red' }]}>a</Text>"
    );
    assert!(output.styles.contains("fontSize: 20,"), "{}", output.styles);
}

#[test]
fn ruby_text_is_half_the_size_it_annotates() {
    // The UA stylesheet says `rt { font-size: 50% }` and JIS X 4051
    // says the same for 振り仮名. React Native has no relative font
    // units, so the halving has to happen here or not at all -- and
    // until now it was not at all: the annotation drew at the size of
    // the text it annotates.
    let source = r#"
            import { Text, Ruby, RubyText } from '@hozo/core'
            const el = (
              <Text className="text-xl">
                漢字<RubyText>かんじ</RubyText>
              </Text>
            )
            "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());

    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    // text-xl is 20px.
    assert!(output.styles.contains("fontSize: 10,"), "{}", output.styles);
}

#[test]
fn ruby_text_is_read_under_both_spellings() {
    // `<Ruby.RubyText>` and `<RubyText>` are the same primitive, the
    // way `<TermList.Term>` and `<Term>` are.
    let member = r#"
            import { Text, Ruby } from '@hozo/core'
            const el = <Text className="text-xl">漢字<Ruby.RubyText>かんじ</Ruby.RubyText></Text>
            "#;
    let parsed = hozo_parser::parse_tsx(member);
    let output = lower(&parsed.roots[0].node, member, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(output.styles.contains("fontSize: 10,"), "{}", output.styles);
}

#[test]
fn a_ruby_reading_with_no_base_is_half_the_platform_default() {
    // This asserted the opposite, and called 14 an invention. It is
    // the size React Native draws at, so a reading scaled against it
    // is scaled against what will be on screen. The old behaviour
    // left the reading the same size as the word it annotates.
    let source = r#"
            import { Text, RubyText } from '@hozo/core'
            const el = <Text>漢字<RubyText>かんじ</RubyText></Text>
            "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    // 14 * 0.5.
    assert!(output.styles.contains("fontSize: 7,"), "{}", output.styles);
}

#[test]
fn a_heading_level_reaches_the_size_it_reaches_on_web() {
    // `heading_level` was read by the parser, used by the Web backend
    // and dropped here, so every level rendered identically on a
    // phone. The ratios are the UA stylesheet's: 2, 1.5, 1.17, 1,
    // 0.83, 0.67.
    let source = r#"
            import { View, Heading } from '@hozo/core'
            const el = (
              <View className="text-base">
                <Heading level={2}>Title</Heading>
              </View>
            )
            "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    // text-base is 16px, and h2 is 1.5em of it.
    assert!(output.styles.contains("fontSize: 24,"), "{}", output.styles);
    assert!(
        output.styles.contains("fontWeight: '700'"),
        "{}",
        output.styles
    );
}

#[test]
fn a_heading_level_chosen_at_runtime_keeps_the_weight_and_skips_the_size() {
    // The weight holds for every level, so it is not a guess. The size
    // is one of six and the compiler cannot tell which.
    let source = r#"
            import { View, Heading } from '@hozo/core'
            const el = (
              <View className="text-base">
                <Heading level={depth}>Title</Heading>
              </View>
            )
            "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(
        output.styles.contains("fontWeight: '700'"),
        "{}",
        output.styles
    );
    // The inherited 16 reaches it -- React Native's Text does not
    // inherit from a View, so the compiler carries it -- and no ratio
    // is applied on top.
    assert!(output.styles.contains("fontSize: 16,"), "{}", output.styles);
}

#[test]
fn mark_carries_the_pair_the_ua_stylesheet_sets() {
    // Both halves. A yellow ground under inherited light text is less
    // readable than no highlight, which is what this used to emit.
    let source = r#"
            import { Text, Mark } from '@hozo/core'
            const el = <Text>see <Mark>this</Mark></Text>
            "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(
        output.styles.contains("backgroundColor: '#ffff00'"),
        "{}",
        output.styles
    );
    assert!(
        output.styles.contains("color: '#000000'"),
        "{}",
        output.styles
    );
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
    assert!(
        output.styles.contains("lineHeight: 22.5,"),
        "{}",
        output.styles
    );
    assert!(
        output.styles.contains("letterSpacing: 0.45,"),
        "{}",
        output.styles
    );
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

    assert!(
        output.styles.contains("lineHeight: 22.5,"),
        "{}",
        output.styles
    );
    assert!(
        output
            .diagnostics
            .iter()
            .any(|diagnostic| diagnostic.code == DiagnosticCode::NotWiredOnNative),
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
    assert!(
        output.diagnostics[0].message.contains("text-*"),
        "{}",
        output.diagnostics[0].message
    );
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
        output
            .diagnostics
            .iter()
            .any(|d| d.code == DiagnosticCode::NotWiredOnNative && d.message.contains("text-*")),
        "{:?}",
        output.diagnostics
    );
    // `md:text-lg` still brings its own line height into the md entry;
    // what must not appear is the ratio folded against it.
    assert!(
        !output.styles.contains("lineHeight: 22.5"),
        "{}",
        output.styles
    );
}

#[test]
fn relative_typography_lowers_font_size_from_parent_text() {
    let source = r#"
            import { Text } from '@hozo/core'
            import { Sub, Sup, Small } from '@hozo/typography'
            const el = (
              <Text className="text-base">
                H<Sub>2</Sub>O
                x<Sup>2</Sup>
                <Small>fine print</Small>
              </Text>
            )
            "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &reset());

    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    // text-base is 16px, in a project that ships the reset:
    // Sub/Sup = 16 * 0.75 = 12px
    // Small = 16 * 0.80 = 12.8 -> round = 13px
    assert!(output.styles.contains("fontSize: 12,"), "{}", output.styles);
    assert!(output.styles.contains("fontSize: 13,"), "{}", output.styles);
}

/// The same source in a project with no reset, where the user agent
/// makes all three `smaller` rather than 75% and 80%.
#[test]
fn without_a_reset_all_three_are_the_user_agent_s_smaller() {
    let source = r#"
            import { Text } from '@hozo/core'
            import { Sub, Sup, Small } from '@hozo/typography'
            const el = (
              <Text className="text-base">
                H<Sub>2</Sub>O
                <Small>fine print</Small>
              </Text>
            )
            "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());

    // 16 / 1.2 = 13.33 -> 13, for the subscript and the small print
    // alike. Measured in headless Chrome at 16, 20 and 32.
    assert!(output.styles.contains("fontSize: 13,"), "{}", output.styles);
    assert!(
        !output.styles.contains("fontSize: 12,"),
        "{}",
        output.styles
    );
}

#[test]
fn a_relative_size_with_no_base_uses_the_platform_default() {
    // This used to assert the opposite -- that nothing was emitted,
    // on the grounds that the compiler should not invent a number.
    // It is not an invention: React Native draws this at 14 whatever
    // Hozo does, so scaling against 14 is scaling against the size
    // that will be on screen. Emitting nothing meant a subscript the
    // same size as the text it subscripts, which is the one thing it
    // must not be.
    let source = r#"
            import { Text } from '@hozo/core'
            import { Sub } from '@hozo/typography'
            const el = (
              <Text>
                H<Sub>2</Sub>O
              </Text>
            )
            "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &reset());

    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    // 14 * 0.75, which is what `@hozo/typography` renders uncompiled.
    assert!(output.styles.contains("fontSize: 11,"), "{}", output.styles);
}

#[test]
fn the_default_only_answers_where_nothing_else_does() {
    // The three things that outrank it, in order. A default that won
    // over a size somebody wrote would be worse than no default.
    let known = r#"
            import { Text, Small } from '@hozo/core'
            const el = <Text className="text-xl"><Small>x</Small></Text>
            "#;
    let parsed = hozo_parser::parse_tsx(known);
    let output = lower(&parsed.roots[0].node, known, &Theme::default());
    // 20 * 0.85, not 14 * 0.85.
    assert!(output.styles.contains("fontSize: 17,"), "{}", output.styles);

    // A size only React Native can resolve still goes to the runtime
    // pair rather than being answered with the default here.
    let opaque = r#"
            import { Text, Small } from '@hozo/core'
            const el = <Text style={{ fontSize: 24 }}>a<Small>x</Small></Text>
            "#;
    let parsed = hozo_parser::parse_tsx(opaque);
    let output = lower(&parsed.roots[0].node, opaque, &Theme::default());
    assert!(output.jsx.contains("HozoRelativeText"), "{}", output.jsx);
    assert!(!output.styles.contains("fontSize"), "{}", output.styles);
}

#[test]
fn a_conditional_base_and_the_default_answer_their_own_conditions() {
    // `md:text-xl` names a size above the breakpoint and nothing below
    // it, so the ratio needs both: the default under it, the declared
    // one above. A default applied at `md` would put a ratio where
    // there is already a size to scale from.
    let source = r#"
            import { View, Small } from '@hozo/core'
            const el = <View className="md:text-xl">a<Small>x</Small></View>
            "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    // 14 * 0.85 unconditionally, and 20 * 0.85 at md.
    assert!(output.styles.contains("fontSize: 12,"), "{}", output.styles);
    assert!(output.styles.contains("fontSize: 17,"), "{}", output.styles);
}
