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
