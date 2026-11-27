use super::*;

#[test]
fn a_js_string_survives_line_terminators() {
    let input = "a,\n'b'\r\u{2028}\u{2029}\\";
    let expected = [
        "'a,", "\\n", "\\'b\\'", "\\r", "\\u2028", "\\u2029", "\\\\", "'",
    ]
    .concat();
    assert_eq!(js_string(input), expected);
}

#[test]
fn a_logical_border_width_lowers_and_its_solid_style_asks_nothing() {
    // `border-s-2` failed the build: Tailwind writes a solid style per
    // edge beside the width, and that style was refused as Web-only
    // although solid is what React Native draws anyway.
    for (class_name, expected) in [
        ("border-s-2", "borderStartWidth: 2"),
        ("border-e", "borderEndWidth: 1"),
        ("border-x-4", "borderEndWidth: 4"),
    ] {
        let source = format!(
            "import {{ View }} from '@hozo/core'\nconst el = <View className=\"{class_name}\" />\n"
        );
        let parsed = hozo_parser::parse_tsx(&source);
        let out = crate::lower(&parsed.roots[0].node, &source, &Theme::default());
        assert!(
            out.styles.contains(expected),
            "{class_name}: {}",
            out.styles
        );
        assert!(
            out.diagnostics.is_empty(),
            "{class_name}: {:?}",
            out.diagnostics
        );
    }
    // A non-solid side style is still one React Native cannot draw.
    assert!(StyleProperty::BorderLogicalStyle(
        hozo_ir::Edge::InlineStart,
        hozo_ir::BorderStyle::Dashed
    )
    .unsupported_on_native()
    .is_some());
}

#[test]
fn numbers_have_no_unit_suffix() {
    assert_eq!(
        property_and_value(
            &StyleProperty::PaddingTop(Dimension::Length(Length::Px(24.0))),
            &Theme::default()
        ),
        vec![("paddingTop", "24".to_string())]
    );
}

#[test]
fn flex_grow_is_a_bare_number() {
    assert_eq!(
        property_and_value(
            &StyleProperty::Flex(FlexShorthand::Grow(1.0)),
            &Theme::default()
        ),
        vec![("flex", "1".to_string())]
    );
}

#[test]
fn flex_auto_expands_to_two_keys() {
    assert_eq!(
        property_and_value(&StyleProperty::Flex(FlexShorthand::Auto), &Theme::default()),
        vec![
            ("flexGrow", "1".to_string()),
            ("flexShrink", "1".to_string())
        ]
    );
}

#[test]
fn font_weight_is_a_string() {
    assert_eq!(
        property_and_value(
            &StyleProperty::FontWeight(hozo_ir::FontWeight::Absolute(700)),
            &Theme::default()
        ),
        vec![("fontWeight", "'700'".to_string())]
    );
}

#[test]
fn known_color_token_resolves_to_real_hex() {
    assert_eq!(
        property_and_value(
            &StyleProperty::BackgroundColor(Color::Token("blue-500".to_string())),
            &Theme::default()
        ),
        vec![("backgroundColor", "'#2b7fff'".to_string())]
    );
}

#[test]
fn unknown_color_token_falls_back_to_a_marker_string() {
    assert_eq!(
        property_and_value(
            &StyleProperty::TextColor(Color::Token("brand-primary".to_string())),
            &Theme::default()
        ),
        vec![("color", "'hozo-unresolved:brand-primary'".to_string())]
    );
}

#[test]
fn an_opacity_modifier_folds_into_the_colour() {
    // React Native has no `color-mix`, so the alpha goes into the
    // colour itself. Before this the token kept its modifier through
    // the palette lookup, missed, and reached the style object as
    // `'hozo-unresolved:blue-500/50'` -- a string React Native cannot
    // parse, emitted with no diagnostic.
    let prop = StyleProperty::BackgroundColor(Color::Token("blue-500/50".to_string()));
    assert_eq!(
        property_and_value(&prop, &Theme::default()),
        vec![("backgroundColor", "'rgba(43, 127, 255, 0.5)'".to_string())]
    );
}

#[test]
fn a_short_hex_gets_the_same_treatment() {
    // `black` and `white` are `#000` and `#fff` in the palette, and a
    // reader that only understood six digits turned `bg-black/25` into
    // the unresolved marker while `bg-blue-500/50` worked -- one class
    // shape, two answers.
    let prop = StyleProperty::BackgroundColor(Color::Token("black/25".to_string()));
    assert_eq!(
        property_and_value(&prop, &Theme::default()),
        vec![("backgroundColor", "'rgba(0, 0, 0, 0.25)'".to_string())]
    );
}

#[test]
fn raw_filter_and_background_image_keep_their_css_order() {
    let filter = vec![
        StyleProperty::Filter(FilterFunction::Blur, "blur(8px)".to_string()),
        StyleProperty::FilterRaw("sepia(60%) hue-rotate(20deg)".to_string()),
    ];
    assert_eq!(
        filter_entry(&filter, &Theme::default()),
        Some(("filter", "'sepia(60%) hue-rotate(20deg)'".to_string()))
    );
    let image = vec![StyleProperty::BackgroundImage(
        "linear-gradient(90deg,#123456,#abcdef)".to_string(),
    )];
    assert_eq!(
        background_image_entry(&image, &Theme::default()),
        Some((
            "backgroundImage",
            "'linear-gradient(90deg,#123456,#abcdef)'".to_string()
        ))
    );
}

#[test]
fn portable_text_shadow_expands_to_native_text_fields() {
    let property = StyleProperty::TextShadow(hozo_ir::TextShadowValue::Portable {
        css: "#123456 1px -2px 4px".to_string(),
        color: Color::Css("#123456".to_string()),
        offset_x: Length::Px(1.0),
        offset_y: Length::Px(-2.0),
        radius: Length::Px(4.0),
    });
    assert_eq!(
        property_and_value(&property, &Theme::default()),
        vec![
            ("textShadowColor", "'#123456'".to_string()),
            ("textShadowOffset", "{ width: 1, height: -2 }".to_string()),
            ("textShadowRadius", "4".to_string()),
        ]
    );
    assert!(property.unsupported_on_native().is_none());
}

#[test]
fn unresolvable_arbitrary_strings_are_refused_and_rem_lengths_fold_to_px() {
    for class_name in [
        "bg-[var(--x)]",
        "border-[50%]",
        "blur-[#ff0000]",
        "shadow-[10px]",
        "bg-linear-[10px]",
        "divide-x-[50%]",
        "translate-x-[auto]",
        "max-w-[auto]",
    ] {
        let source = format!(
            "import {{ View }} from '@hozo/core'\nconst el = <View className=\"{class_name}\" />\n"
        );
        let parsed = hozo_parser::parse_tsx(&source);
        let out = crate::lower(&parsed.roots[0].node, &source, &Theme::default());
        assert!(
            out.diagnostics
                .iter()
                .any(|d| d.code == hozo_ir::DiagnosticCode::WebOnlyPropertyOnNative),
            "{class_name} should raise WebOnlyPropertyOnNative, got {:?}",
            out.diagnostics
        );
    }

    for class_name in ["caret-[10px]", "placeholder-[10px]"] {
        let source = format!(
            "import {{ TextInput }} from '@hozo/core'\nconst el = <TextInput className=\"{class_name}\" accessibilityLabel=\"Field\" />\n"
        );
        let parsed = hozo_parser::parse_tsx(&source);
        let out = crate::lower(&parsed.roots[0].node, &source, &Theme::default());
        assert!(
            out.diagnostics
                .iter()
                .any(|d| d.code == hozo_ir::DiagnosticCode::WebOnlyPropertyOnNative),
            "{class_name} should raise WebOnlyPropertyOnNative, got {:?}",
            out.diagnostics
        );
        assert!(!out.jsx.contains("10px"), "{class_name}: {}", out.jsx);
    }

    for (class_name, expected) in [
        ("blur-[2rem]", "filter: 'blur(32px)'"),
        ("origin-[2rem]", "transformOrigin: '32px'"),
    ] {
        let source = format!(
            "import {{ View }} from '@hozo/core'\nconst el = <View className=\"{class_name}\" />\n"
        );
        let parsed = hozo_parser::parse_tsx(&source);
        let out = crate::lower(&parsed.roots[0].node, &source, &Theme::default());
        assert!(
            out.diagnostics.is_empty(),
            "{class_name}: {:?}",
            out.diagnostics
        );
        assert!(
            out.styles.contains(expected),
            "{class_name}: {}",
            out.styles
        );
    }
}

#[test]
fn percentage_radius_padding_and_gap_lower_on_native() {
    for (class_name, expected) in [
        ("rounded-[50%]", "borderRadius: '50%'"),
        ("rounded-tl-[50%]", "borderTopLeftRadius: '50%'"),
        ("rounded-s-[50%]", "borderStartStartRadius: '50%'"),
        ("p-[50%]", "paddingTop: '50%'"),
        ("px-[50%]", "paddingStart: '50%'"),
        ("pbs-[50%]", "paddingTop: '50%'"),
        ("gap-[50%]", "rowGap: '50%'"),
        ("gap-x-[50%]", "columnGap: '50%'"),
        ("gap-y-[50%]", "rowGap: '50%'"),
    ] {
        let source = format!(
            "import {{ View }} from '@hozo/core'\nconst el = <View className=\"{class_name}\" />\n"
        );
        let parsed = hozo_parser::parse_tsx(&source);
        let out = crate::lower(&parsed.roots[0].node, &source, &Theme::default());
        assert!(
            out.diagnostics.is_empty(),
            "{class_name}: {:?}",
            out.diagnostics
        );
        assert!(
            out.styles.contains(expected),
            "{class_name}: {}",
            out.styles
        );
    }
    for invalid in ["p-[auto]", "gap-[auto]", "rounded-[-50%]"] {
        let source = format!(
            "import {{ View }} from '@hozo/core'\nconst el = <View className=\"{invalid}\" />\n"
        );
        let parsed = hozo_parser::parse_tsx(&source);
        let out = crate::lower(&parsed.roots[0].node, &source, &Theme::default());
        assert!(
            !out.diagnostics.is_empty(),
            "{invalid} should be refused on Native"
        );
    }
}

#[test]
fn arbitrary_scale_and_translate_lower_on_native() {
    for (class_name, expected) in [
        ("scale-[1.5]", "transform: [{ scale: 1.5 }]"),
        ("scale-[50%]", "transform: [{ scale: 0.5 }]"),
        ("scale-x-[1.5]", "transform: [{ scaleX: 1.5 }]"),
        ("scale-x-[50%]", "transform: [{ scaleX: 0.5 }]"),
        ("scale-y-[1.5]", "transform: [{ scaleY: 1.5 }]"),
        ("scale-y-[50%]", "transform: [{ scaleY: 0.5 }]"),
        (
            "translate-[10px]",
            "transform: [{ translateX: 10 }, { translateY: 10 }]",
        ),
        (
            "translate-[2rem]",
            "transform: [{ translateX: 32 }, { translateY: 32 }]",
        ),
        (
            "translate-[50%]",
            "transform: [{ translateX: '50%' }, { translateY: '50%' }]",
        ),
    ] {
        let source = format!(
            "import {{ View }} from '@hozo/core'\nconst el = <View className=\"{class_name}\" />\n"
        );
        let parsed = hozo_parser::parse_tsx(&source);
        let out = crate::lower(&parsed.roots[0].node, &source, &Theme::default());
        assert!(
            out.diagnostics.is_empty(),
            "{class_name}: {:?}",
            out.diagnostics
        );
        assert!(
            out.styles.contains(expected),
            "{class_name}: {}",
            out.styles
        );
    }
    for invalid in [
        "scale-[nonsense]",
        "scale-x-[10px]",
        "translate-[auto]",
        "translate-[1.5em]",
        "perspective-[10px]",
    ] {
        let source = format!(
            "import {{ View }} from '@hozo/core'\nconst el = <View className=\"{invalid}\" />\n"
        );
        let parsed = hozo_parser::parse_tsx(&source);
        let out = crate::lower(&parsed.roots[0].node, &source, &Theme::default());
        assert!(
            !out.diagnostics.is_empty(),
            "{invalid} should be refused on Native"
        );
    }
}

#[test]
fn remaining_zero_cost_arbitrary_values_lower_on_native() {
    for (class_name, expected) in [
        ("aspect-[1.5]", "aspectRatio: 1.5"),
        ("flex-[1.5]", "flex: 1.5"),
        ("flex-[auto]", "flexGrow: 1"),
        ("opacity-[50%]", "opacity: 0.5"),
        ("align-[auto]", "verticalAlign: 'auto'"),
        ("cursor-[auto]", "cursor: 'auto'"),
        ("ring-offset-[10px]", "boxShadow: '0 0 0 10px #fff'"),
        ("ring-offset-[2rem]", "boxShadow: '0 0 0 32px #fff'"),
    ] {
        let source = format!(
            "import {{ View }} from '@hozo/core'\nconst el = <View className=\"{class_name}\" />\n"
        );
        let parsed = hozo_parser::parse_tsx(&source);
        let out = crate::lower(&parsed.roots[0].node, &source, &Theme::default());
        assert!(
            out.diagnostics.is_empty(),
            "{class_name}: {:?}",
            out.diagnostics
        );
        assert!(
            out.styles.contains(expected),
            "{class_name}: {}",
            out.styles
        );
    }

    // `[color:red]` lowers cleanly on Text.
    let color_source =
        "import { Text } from '@hozo/core'\nconst el = <Text className=\"[color:red]\">hi</Text>\n";
    let parsed = hozo_parser::parse_tsx(color_source);
    let out = crate::lower(&parsed.roots[0].node, color_source, &Theme::default());
    assert!(out.diagnostics.is_empty(), "{:?}", out.diagnostics);
    assert!(out.styles.contains("color: 'red'"), "{}", out.styles);

    // `backdrop-blur-[2rem]` folds rem to 32px in the backdrop adapter.
    let blur_source = "import { View } from '@hozo/core'\nconst el = <View className=\"backdrop-blur-[2rem]\" />\n";
    let parsed = hozo_parser::parse_tsx(blur_source);
    let out = crate::lower(&parsed.roots[0].node, blur_source, &Theme::default());
    assert!(out.diagnostics.is_empty(), "{:?}", out.diagnostics);
    assert!(out.jsx.contains("hozoBlurRadius={32}"), "{}", out.jsx);

    // `grid-cols-[2rem]` and `grid-rows-[2rem]` fold rem to points inside HozoGrid.
    let grid_source = "import { View } from '@hozo/core'\nconst el = <View className=\"grid grid-cols-[2rem] grid-rows-[2rem]\"><View /></View>\n";
    let parsed = hozo_parser::parse_tsx(grid_source);
    let out = crate::lower(&parsed.roots[0].node, grid_source, &Theme::default());
    assert!(out.diagnostics.is_empty(), "{:?}", out.diagnostics);
    assert!(
        out.jsx.contains("{ kind: 'points', value: 32 }"),
        "{}",
        out.jsx
    );

    // `stroke-[10px]` and `stroke-[2rem]` fold to numeric strokeWidth props inside <Svg>.
    let svg_source = "import { Svg } from '@hozo/svg'\nconst el = <Svg><Svg.Rect className=\"stroke-[2rem]\" /></Svg>\n";
    let parsed = hozo_parser::parse_tsx(svg_source);
    let out = crate::lower(&parsed.roots[0].node, svg_source, &Theme::default());
    assert!(out.diagnostics.is_empty(), "{:?}", out.diagnostics);
    assert!(out.jsx.contains("strokeWidth={32}"), "{}", out.jsx);

    // Invalid arbitrary values remain refused.
    for invalid in [
        "aspect-[auto]",
        "aspect-[nonsense]",
        "flex-[nonsense]",
        "opacity-[nonsense]",
        "align-[baseline]",
        "cursor-[grab]",
        "ring-offset-[nonsense]",
        "[color:var(--x)]",
    ] {
        let source = format!(
            "import {{ View }} from '@hozo/core'\nconst el = <View className=\"{invalid}\" />\n"
        );
        let parsed = hozo_parser::parse_tsx(&source);
        let out = crate::lower(&parsed.roots[0].node, &source, &Theme::default());
        assert!(
            !out.diagnostics.is_empty(),
            "{invalid} should be refused on Native"
        );
    }
}

#[test]
fn self_measured_calc_and_container_units_lower_on_native() {
    for (class_name, expected) in [
        (
            "translate-x-[calc(50%-8px)]",
            "hozoSelfStyle={(__hozoSelf) => ({ transform: [{ translateX: __hozoSelf.width * 0.5 - 8 }] })}",
        ),
        (
            "translate-[calc(100%-2rem)]",
            "hozoSelfStyle={(__hozoSelf) => ({ transform: [{ translateX: __hozoSelf.width - 32 }, { translateY: __hozoSelf.height - 32 }] })}",
        ),
        (
            "translate-x-[calc(50%-8px)] rotate-45",
            "transform: [{ translateX: __hozoSelf.width * 0.5 - 8 }, { rotate: '45deg' }]",
        ),
        (
            "rounded-[calc(50%-8px)]",
            "borderRadius: Math.max(0, Math.min(__hozoSelf.width, __hozoSelf.height) * 0.5 - 8)",
        ),
        (
            "gap-[calc(10%-4px)]",
            "rowGap: Math.max(0, __hozoSelf.height * 0.1 - 4), columnGap: Math.max(0, __hozoSelf.width * 0.1 - 4)",
        ),
        (
            "w-[clamp(200px,50vw,400px)]",
            "width: Math.min(Math.max(__hozoViewport.width * 0.5, 200), 400)",
        ),
    ] {
        let source = format!(
            "import {{ View }} from '@hozo/core'\nfunction C() {{ return <View className=\"{class_name}\" /> }}\n"
        );
        let parsed = hozo_parser::parse_tsx(&source);
        let out = crate::lower(&parsed.roots[0].node, &source, &Theme::default());
        assert!(
            out.diagnostics.is_empty(),
            "{class_name}: {:?}",
            out.diagnostics
        );
        assert!(
            out.jsx.contains(expected),
            "{class_name}: {}",
            out.jsx
        );
    }

    // Container query length units (`cqw` / `cqh` / `calc(100cqw - 2rem)`).
    let cq_source = "import { View } from '@hozo/core'\nfunction C() { return <View className=\"@container\"><View className=\"w-[calc(100cqw-2rem)] h-[50cqh]\" /></View> }\n";
    let parsed = hozo_parser::parse_tsx(cq_source);
    let out = crate::lower(&parsed.roots[0].node, cq_source, &Theme::default());
    assert!(out.diagnostics.is_empty(), "{:?}", out.diagnostics);
    assert!(out.runtime_imports.contains(&"HozoContainer"));
    assert!(out.runtime_imports.contains(&"HozoContainerSizeQuery"));
    assert!(
        out.jsx
            .contains("width: Math.max(0, __hozoCqs[\"\"].width - 32)"),
        "{}",
        out.jsx
    );
    assert!(
        out.jsx
            .contains("height: Math.max(0, __hozoCqs[\"\"].height * 0.5)"),
        "{}",
        out.jsx
    );

    // Grid column `calc()` lowers to HozoGrid calc track.
    let grid_source = "import { View } from '@hozo/core'\nfunction C() { return <View className=\"grid grid-cols-[calc(100%-2rem)]\"><View /></View> }\n";
    let parsed = hozo_parser::parse_tsx(grid_source);
    let out = crate::lower(&parsed.roots[0].node, grid_source, &Theme::default());
    assert!(out.diagnostics.is_empty(), "{:?}", out.diagnostics);
    assert!(
        out.jsx
            .contains("{ kind: 'calc', evaluate: (__hozoGridW) => Math.max(0, __hozoGridW - 32) }"),
        "{}",
        out.jsx
    );
}

#[test]
fn same_component_parent_calc_lowers_with_css_percentage_axes() {
    // Child box dimensions, margins/paddings (all against parent width!),
    // relative vs absolute insets, and flex-basis (parent main axis).
    for (class_name, expected) in [
        ("w-[calc(100%-2rem)]", "width: Math.max(0, __hozoParent.width - 32)"),
        ("h-[calc(100%-2rem)]", "height: Math.max(0, __hozoParent.height - 32)"),
        (
            "size-[calc(100%-2rem)]",
            "width: Math.max(0, __hozoParent.width - 32), height: Math.max(0, __hozoParent.height - 32)",
        ),
        ("mt-[calc(50%-4px)]", "marginTop: __hozoParent.width * 0.5 - 4"),
        ("m-[calc(100%-2rem)]", "marginTop: __hozoParent.width - 32"),
        ("mx-[calc(100%-2rem)]", "marginStart: __hozoParent.width - 32"),
        ("pt-[calc(50%-4px)]", "paddingTop: Math.max(0, __hozoParent.width * 0.5 - 4)"),
        ("px-[calc(100%-2rem)]", "paddingStart: Math.max(0, __hozoParent.width - 32)"),
        ("p-[calc(100%-2rem)]", "paddingTop: Math.max(0, __hozoParent.width - 32)"),
        ("inset-[calc(100%-2rem)]", "top: __hozoParent.height - 32"),
        ("absolute inset-[calc(100%-2rem)]", "top: __hozoParent.paddingBoxHeight - 32"),
        ("basis-[calc(100%-2rem)]", "flexBasis: Math.max(0, __hozoParent.mainAxisSize - 32)"),
        ("top-[calc(50%-4px)]", "top: __hozoParent.height * 0.5 - 4"),
        ("absolute top-[calc(50%-4px)] left-[calc(50%-8px)]", "top: __hozoParent.paddingBoxHeight * 0.5 - 4"),
        ("absolute top-[calc(50%-4px)] left-[calc(50%-8px)]", "start: __hozoParent.paddingBoxWidth * 0.5 - 8"),
        ("absolute top-[calc(50%-4px)] left-[calc(50%-8px)]", "end: __hozoParent.paddingBoxWidth * 0.5 - 8"),
    ] {
        let source = format!(
            "import {{ View }} from '@hozo/core'\nfunction C() {{ return <View className=\"p-4\"><View className=\"{class_name}\" /></View> }}\n"
        );
        let parsed = hozo_parser::parse_tsx(&source);
        let out = crate::lower(&parsed.roots[0].node, &source, &Theme::default());
        assert!(
            out.diagnostics.is_empty(),
            "{class_name}: {:?}",
            out.diagnostics
        );
        assert!(out.runtime_imports.contains(&"HozoMeasuredParent"));
        assert!(out.runtime_imports.contains(&"HozoParentSizeQuery"));
        assert!(out.jsx.contains("<HozoMeasuredParent"), "{class_name}: {}", out.jsx);
        assert!(out.jsx.contains(expected), "{class_name}: {}", out.jsx);
    }

    // `space-x` / `space-y` with %-calc measure their own container box.
    for (class_name, expected) in [
        (
            "space-x-[calc(100%-2rem)]",
            "marginInlineStart: 0, marginInlineEnd: __hozoParent.width - 32",
        ),
        (
            "space-y-[calc(50%-4px)]",
            "marginTop: 0, marginBottom: __hozoParent.width * 0.5 - 4",
        ),
    ] {
        let source = format!(
            "import {{ View }} from '@hozo/core'\nfunction C() {{ return <View className=\"{class_name}\"><View /><View /></View> }}\n"
        );
        let parsed = hozo_parser::parse_tsx(&source);
        let out = crate::lower(&parsed.roots[0].node, &source, &Theme::default());
        assert!(
            out.diagnostics.is_empty(),
            "{class_name}: {:?}",
            out.diagnostics
        );
        assert!(
            out.jsx.contains("<HozoMeasuredParent"),
            "{class_name}: {}",
            out.jsx
        );
        assert!(out.jsx.contains("<HozoSpaced"), "{class_name}: {}", out.jsx);
        assert!(out.jsx.contains(expected), "{class_name}: {}", out.jsx);
    }

    // ScrollView parent (contentContainerStyle split), grid parent (cell box),
    // `display: contents` parent, custom-component boundary, and component root
    // stay honestly refused with actionable guidance (Decision 015).
    for source in [
        "import { View } from '@hozo/core'\nfunction C() { return <View className=\"w-[calc(100%-2rem)]\" /> }\n",
        "import { View } from '@hozo/core'\nfunction C() { return <View><Card><View className=\"w-[calc(100%-2rem)]\" /></Card></View> }\n",
        "import { ScrollView, View } from '@hozo/core'\nfunction C() { return <ScrollView><View className=\"w-[calc(100%-2rem)]\" /></ScrollView> }\n",
        "import { View } from '@hozo/core'\nfunction C() { return <View className=\"grid grid-cols-2\"><View className=\"w-[calc(100%-2rem)]\" /></View> }\n",
        "import { View } from '@hozo/core'\nfunction C() { return <View className=\"contents\"><View className=\"w-[calc(100%-2rem)]\" /></View> }\n",
    ] {
        let parsed = hozo_parser::parse_tsx(source);
        let out = crate::lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(
            out.diagnostics.iter().any(|d| {
                d.code == hozo_ir::DiagnosticCode::WebOnlyPropertyOnNative
                    && d.message.contains("@container")
                    && d.message.contains("015-parent-calc-stays-within-the-component")
            }),
            "expected Decision 015 guidance for {source}, got: {:?}",
            out.diagnostics
        );
        assert!(!out.jsx.contains("HozoMeasuredParent"), "{}", out.jsx);
    }

    // Real-repository arbitrary patterns cited in #2294 all lower cleanly.
    for source in [
        "import { Pressable } from '@hozo/core'\nfunction C() { return <Pressable accessibilityRole=\"button\" className=\"hover:scale-[1.02] active:scale-[0.98]\" /> }\n",
        "import { Svg } from '@hozo/svg'\nfunction C() { return <Svg><Svg.Path className=\"stroke-[1.5]\" /></Svg> }\n",
        "import { View } from '@hozo/core'\nfunction C() { return <View className=\"w-[calc(100vw-2rem)]\" /> }\n",
    ] {
        let parsed = hozo_parser::parse_tsx(source);
        let out = crate::lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(
            out.diagnostics.is_empty(),
            "unexpected diagnostic for {source}: {:?}",
            out.diagnostics
        );
    }
}

#[test]
fn flex_fractions_and_arbitrary_basis_expand_to_rn_longhands() {
    for (class_name, expected_basis) in [
        ("flex-1/2", "flexBasis: '50%'"),
        ("flex-3/4", "flexBasis: '75%'"),
        ("flex-[50%]", "flexBasis: '50%'"),
        ("flex-[10px]", "flexBasis: 10"),
        ("flex-[2rem]", "flexBasis: 32"),
    ] {
        let source = format!(
            "import {{ View }} from '@hozo/core'\nfunction C() {{ return <View className=\"{class_name}\" /> }}\n"
        );
        let parsed = hozo_parser::parse_tsx(&source);
        let out = crate::lower(&parsed.roots[0].node, &source, &Theme::default());
        assert!(
            out.diagnostics.is_empty(),
            "{class_name}: {:?}",
            out.diagnostics
        );
        assert!(
            out.styles.contains("flexGrow: 1"),
            "{class_name}: {}",
            out.styles
        );
        assert!(
            out.styles.contains("flexShrink: 1"),
            "{class_name}: {}",
            out.styles
        );
        assert!(
            out.styles.contains(expected_basis),
            "{class_name}: {}",
            out.styles
        );
    }
}
