use super::states::state_keys;
use super::*;

#[test]
fn four_equal_side_widths_also_say_border_width_for_android_dashes() {
    let theme = Theme::default();
    let props = [
        StyleProperty::BorderTopWidth(Length::Px(2.0)),
        StyleProperty::BorderRightWidth(Length::Px(2.0)),
        StyleProperty::BorderBottomWidth(Length::Px(2.0)),
        StyleProperty::BorderLeftWidth(Length::Px(2.0)),
    ];
    let pairs = style_pairs(&props, &theme);
    assert!(
        pairs.contains(&("borderWidth", "2".to_string())),
        "{pairs:?}"
    );
    assert!(
        pairs.contains(&("borderTopWidth", "2".to_string())),
        "{pairs:?}"
    );

    // One side apart: no claim that the border is uniform.
    let uneven = [
        StyleProperty::BorderTopWidth(Length::Px(4.0)),
        StyleProperty::BorderRightWidth(Length::Px(2.0)),
        StyleProperty::BorderBottomWidth(Length::Px(2.0)),
        StyleProperty::BorderLeftWidth(Length::Px(2.0)),
    ];
    assert!(!style_pairs(&uneven, &theme)
        .iter()
        .any(|(key, _)| *key == "borderWidth"));
}

#[test]
fn data_presence_candidates_use_boolean_owner_facts_not_a_selector_interpreter() {
    let module = render_candidate_module(
        &[
            "data-[hozo-range-start]:p-4",
            "data-[hozo-disabled]:hover:opacity-50",
            "rtl:data-open:aria-selected:border-2",
        ]
        .map(String::from),
        &Theme::default(),
    );
    assert!(
        module.contains(r#""data-[hozo-range-start]:p-4": [[["data-hozo-range-start"], "#),
        "{module}"
    );
    assert!(
        module.contains(
            r#""data-[hozo-disabled]:hover:opacity-50": [[["data-hozo-disabled", "hovered"], "#
        ),
        "{module}"
    );
    assert!(
        module.contains(
            r#""rtl:data-open:aria-selected:border-2": [[["rtl", "data-open", "aria-selected"], "#
        ),
        "{module}"
    );
    assert!(!module.contains("is conditional"), "{module}");
}

#[test]
fn data_equality_normalizes_safe_tokens_into_boolean_predicate_keys() {
    for selector in [
        "[data-state=Closed]",
        "[data-state=\"Closed\"]",
        "[data-state='Closed']",
    ] {
        assert_eq!(
            data_fact_key(selector).as_deref(),
            Some("data-state=Closed")
        );
    }
    assert_eq!(
        data_fact_key("[data-state='123']").as_deref(),
        Some("data-state=123")
    );
    let module = render_candidate_module(
        &[
            "data-[hozo-step=increase]:top-0",
            "hover:data-[state=open]:p-4",
        ]
        .map(String::from),
        &Theme::default(),
    );
    assert!(
        module.contains(r#"[[["data-hozo-step=increase"], { top: 0 }]]"#),
        "{module}"
    );
    assert!(
        module.contains(r#"[[["hovered", "data-state=open"], "#),
        "{module}"
    );
    assert!(!module.contains("is conditional"), "{module}");
}

#[test]
fn transition_utilities_go_in_their_own_table_not_unsupported() {
    let module = render_candidate_module(
        &[
            "transition-[inset-inline-start,background-color]",
            "duration-150",
            "ease-out",
            "motion-reduce:transition-colors",
            "hover:duration-300",
            "p-4",
        ]
        .map(String::from),
        &Theme::default(),
    );
    assert!(
            module.contains(
                r#""transition-[inset-inline-start,background-color]": [null, { properties: ["inset-inline-start", "background-color"]"#
            ),
            "{module}"
        );
    assert!(
        module.contains(r#""duration-150": [null, { duration: 150 }]"#),
        "{module}"
    );
    assert!(
        module.contains(r#""ease-out": [null, { easing: "ease-out" }]"#),
        "{module}"
    );
    assert!(
        module.contains(r#""motion-reduce:transition-colors": ["motion-reduce", { properties: ["#),
        "{module}"
    );
    // A condition the reader cannot decide keeps the path it had.
    assert!(!module.contains(r#""hover:duration-300": ["#), "{module}");
    let unsupported = &module[module.find("const unsupported").unwrap()..];
    let unsupported = &unsupported[..unsupported.find("\n}\n").unwrap()];
    assert!(!unsupported.contains("duration-150"), "{module}");
    assert!(!unsupported.contains("motion-reduce:"), "{module}");
}

#[test]
fn a_module_without_transitions_still_exports_the_table() {
    let module = render_candidate_module(&["p-4".to_string()], &Theme::default());
    assert!(
        module.contains("export const hozoClassTransitions = {}\n"),
        "{module}"
    );
    // Data only: the harnesses that evaluate this module inject its
    // imports by name, and a new one would break every one of them.
    assert!(!module.contains("createClassTransitions"), "{module}");
}

#[test]
fn negated_aria_candidates_keep_polarity_without_inventing_owner_facts() {
    let module = render_candidate_module(
        &[
            "not-aria-selected:p-4",
            "aria-checked:not-aria-selected:p-8",
        ]
        .map(String::from),
        &Theme::default(),
    );
    assert!(module.contains(r#"[[["!aria-selected"], "#), "{module}");
    assert!(
        module.contains(r#"[[["aria-checked", "!aria-selected"], "#),
        "{module}"
    );
    assert!(!module.contains("is conditional"), "{module}");
    assert!(state_keys(&Condition::Not(Box::new(Condition::Hover))).is_none());
    assert!(state_keys(&Condition::Not(Box::new(Condition::Not(Box::new(
        Condition::Aria("selected".into())
    )))))
    .is_none());
}

#[test]
fn complex_data_queries_relations_negation_and_unsafe_names_remain_unsupported() {
    for condition in [
        Condition::DataAttribute("[data-state~=closed]".into()),
        Condition::DataAttribute("[data-state|=closed]".into()),
        Condition::DataAttribute("[data-state^=closed]".into()),
        Condition::DataAttribute("[data-state$=closed]".into()),
        Condition::DataAttribute("[data-state*=closed]".into()),
        Condition::DataAttribute("[data-state=\"closed\" i]".into()),
        Condition::DataAttribute("[data-state=\"two words\"]".into()),
        Condition::DataAttribute("[data-state=\"two\\77ords\"]".into()),
        Condition::DataAttribute("[data-state=\"\"]".into()),
        Condition::DataAttribute("[data-state=1]".into()),
        Condition::DataAttribute("[data-state=-1]".into()),
        Condition::DataAttribute("[data-state='open\"]".into()),
        Condition::DataAttribute("[data-state=open=other]".into()),
        Condition::DataAttribute("[data-]".into()),
        Condition::DataAttribute("[data-foo bar]".into()),
        Condition::DataAttribute("[data-foo][data-bar]".into()),
        Condition::DataAttribute("[data-Foo]".into()),
        Condition::Not(Box::new(Condition::DataAttribute("[data-open]".into()))),
        Condition::Group(Box::new(Condition::DataAttribute("[data-open]".into()))),
    ] {
        assert!(state_keys(&condition).is_none(), "{condition:?}");
    }
}

#[test]
fn reset_candidates_carry_slots_without_private_stylesheet_keys() {
    let module = render_candidate_module(
        &["rotate-45", "scale-95", "rotate-none", "transform-cpu"].map(String::from),
        &Theme::default(),
    );
    assert!(
        module.contains(
            "? hozoTransformStyles(resolved, transforms, undefined, Boolean(deferred)) : resolved"
        ),
        "{module}"
    );
    assert!(
        module.contains("[styles[\"rotate-none\"], { rotate: [] }]"),
        "{module}"
    );
    assert!(module.contains("[styles[\"scale-95\"], { scale3d: false, scaleSlots: [{ scale: 0.95 }], scale: 'slots' }]"), "{module}");
    assert!(
        module.contains("[styles[\"transform-cpu\"], { functions: 'slots' }]"),
        "{module}"
    );
    assert!(!module.contains("Web-only"), "{module}");
}

#[test]
fn maps_class_names_to_style_objects() {
    let module = render_candidate_module(
        &["p-4".to_string(), "bg-blue-500".to_string()],
        &Theme::default(),
    );
    assert!(module.contains(r#""p-4": {"#), "{module}");
    assert!(module.contains("paddingTop: 16,"), "{module}");
    assert!(module.contains(r#""bg-blue-500": {"#), "{module}");
    assert!(
        module.contains("createClassResolver(styles, unsupported)"),
        "{module}"
    );
    assert!(
        module.contains("export const hozoPreflight = false"),
        "{module}"
    );
}

#[test]
fn state_transform_metadata_indexes_the_actual_state_objects() {
    let module = render_candidate_module(
        &[
            "rotate-3",
            "active:scale-95",
            "hover:scale-none",
            "hover:active:rotate-6",
        ]
        .map(String::from),
        &Theme::default(),
    );
    assert!(module.contains("const transforms = new Map(["), "{module}");
    for expected in [
        r#"[styles["rotate-3"], { rotate: [{ rotate: '3deg' }] }]"#,
        r#"[states["active:scale-95"][0][1], { scale3d: false, scaleSlots: [{ scale: 0.95 }], scale: 'slots' }]"#,
        r#"[states["hover:scale-none"][0][1], { scale: 'none' }]"#,
        r#"[states["hover:active:rotate-6"][0][1], { rotate: [{ rotate: '6deg' }] }]"#,
    ] {
        assert!(
            module.contains(expected),
            "{expected} missing from {module}"
        );
    }
    assert!(
        module.contains("resolved.some(style => transforms.has(style))"),
        "{module}"
    );
}

#[test]
fn a_state_only_transform_imports_composition_but_colour_state_does_not() {
    let module = render_candidate_module(&["active:scale-95".to_string()], &Theme::default());
    assert!(module.contains("hozoTransformStyles"), "{module}");
    assert!(
        module.contains(r#"states["active:scale-95"][0][1]"#),
        "{module}"
    );
    let module = render_candidate_module(&["hover:bg-blue-500".to_string()], &Theme::default());
    assert!(!module.contains("hozoTransformStyles"), "{module}");
}

fn box_theme() -> Theme {
    Theme::new(
        std::collections::HashMap::from([(
            "box".to_string(),
            hozo_ir::ThemeColor {
                oklch: "oklch(70% 0.1 200)".into(),
                hex: "#12abcd".into(),
            },
        )]),
        None,
        false,
    )
}

fn styles_of(module: &str) -> &str {
    let styles = &module[module.find("const styles").unwrap()..];
    &styles[..styles.find("\n}\n").unwrap()]
}

fn unsupported_of(module: &str) -> &str {
    let unsupported = &module[module.find("const unsupported").unwrap()..];
    &unsupported[..unsupported.find("\n}\n").unwrap()]
}

// #2127: `boxSizing: 'border-box'` in a Web-only file reached every
// Native app's map as a border colour named `box`.
#[test]
fn a_candidate_naming_a_colour_the_theme_lacks_is_refused_not_invented() {
    let names = ["border-box".to_string(), "hover:border-box".to_string()];
    let module = render_candidate_module(&names, &Theme::default());
    assert!(!module.contains("hozo-unresolved"), "{module}");
    assert!(!styles_of(&module).contains("border-box"), "{module}");
    let unsupported = unsupported_of(&module);
    assert!(unsupported.contains(r#""border-box": "#), "{module}");
    assert!(unsupported.contains(r#""hover:border-box": "#), "{module}");
    assert!(unsupported.contains("--color-box"), "{module}");
}

#[test]
fn the_same_spelling_is_a_colour_when_the_theme_defines_it() {
    let names = ["border-box".to_string(), "hover:border-box".to_string()];
    let module = render_candidate_module(&names, &box_theme());
    assert!(!module.contains("hozo-unresolved"), "{module}");
    assert!(
        styles_of(&module).contains(r#""border-box": {"#),
        "{module}"
    );
    assert!(styles_of(&module).contains("'#12abcd'"), "{module}");
    assert!(module.contains(r#""hover:border-box": ["#), "{module}");
    assert!(!unsupported_of(&module).contains("border-box"), "{module}");
}

#[test]
fn carries_the_resolved_preflight_choice() {
    let module = render_candidate_module(&[], &Theme::new(Default::default(), None, true));
    assert!(
        module.contains("export const hozoPreflight = true"),
        "{module}"
    );
}

#[test]
fn filter_metadata_indexes_the_selected_style_and_state_objects() {
    let module = render_candidate_module(
        &["blur-sm", "hover:sepia", "drop-shadow-sm"].map(String::from),
        &Theme::default(),
    );
    for expected in [
        "const filters = new Map([",
        r#"[styles["blur-sm"], { mode: 'slots', slots: [[0, 'blur(8px)']] }]"#,
        r#"[states["hover:sepia"][0][1], { mode: 'slots', slots: [[7, 'sepia(100%)']] }]"#,
        "resolved.some(style => 'filter' in style && !filters.has(style))",
    ] {
        assert!(
            module.contains(expected),
            "{expected} missing from {module}"
        );
    }
    assert!(
        !module.contains(r#"[styles["drop-shadow-sm"],"#),
        "{module}"
    );
}

#[test]
fn filter_free_and_drop_shadow_only_maps_do_not_import_the_composer() {
    for names in [
        ["p-4", "hover:opacity-50"],
        ["drop-shadow-sm", "drop-shadow-red-500"],
    ] {
        let module = render_candidate_module(&names.map(String::from), &Theme::default());
        assert!(!module.contains("hozoFilterStyles"), "{module}");
    }
    let module = render_candidate_module(
        &["hover:sepia".into(), "focus:grayscale".into()],
        &Theme::default(),
    );
    assert!(module.contains("hozoFilterStyles"), "{module}");
}

#[test]
fn conditional_candidates_are_named_rather_than_silently_missing() {
    // A style object can't carry `md:` or `dark:`, and making it able to
    // means subscribing to the window and the colour scheme -- the engine
    // this design is choosing not to ship. Reported when used, not at
    // build time: appearing in the scan doesn't prove anything produces it.
    let module = render_candidate_module(&["md:bg-blue-500".to_string()], &Theme::default());
    assert!(!module.contains("styles = { \"md"), "{module}");
    assert!(
        module.contains(r#""md:bg-blue-500": "`md:bg-blue-500` is conditional"#),
        "{module}"
    );
}

/// The element's own state is the exception (#886): the pressable that
/// renders it already tracks it, so the class is kept with the state it
/// needs and the resolver applies it when handed that state.
#[test]
fn state_candidates_are_kept_with_the_state_they_need() {
    let module = render_candidate_module(
        &[
            "active:opacity-80".to_string(),
            "hover:active:p-8".to_string(),
            "aria-pressed:p-4".to_string(),
            "disabled:cursor-not-allowed".to_string(),
        ],
        &Theme::default(),
    );
    assert!(
        module.contains(r#""active:opacity-80": [[["pressed"], { opacity: 0.8 }, 256]],"#),
        "{module}"
    );
    assert!(
        module.contains(r#""hover:active:p-8": [[["hovered", "pressed"], "#),
        "{module}"
    );
    assert!(
        module.contains(r#""aria-pressed:p-4": [[["aria-pressed"], "#),
        "{module}"
    );
    // A state does not make a Web-only property portable.
    assert!(
        module.contains(r#""disabled:cursor-not-allowed": ""#),
        "{module}"
    );
    assert!(
        module.contains("createClassResolver(styles, unsupported, undefined, states)"),
        "{module}"
    );
}

/// A direction is fixed for the run, so the module reads it once and the
/// resolver decides `rtl:` without any element supplying it.
#[test]
fn direction_candidates_are_kept_under_a_key_the_module_supplies() {
    let module = render_candidate_module(
        &["rtl:rotate-45".to_string(), "ltr:ps-2".to_string()],
        &Theme::default(),
    );
    assert!(
        module.contains(r#""rtl:rotate-45": [[["rtl"], { transform: "#),
        "{module}"
    );
    assert!(module.contains(r#""ltr:ps-2": [[["ltr"], "#), "{module}");
    assert!(
        module.contains("import { I18nManager } from 'react-native'"),
        "{module}"
    );
    assert!(
        module.contains("states, { rtl: I18nManager.isRTL, ltr: !I18nManager.isRTL })"),
        "{module}"
    );
    assert!(!module.contains("is conditional"), "{module}");

    // Without one, the module has no reason to import React Native.
    let module = render_candidate_module(&["hover:p-4".to_string()], &Theme::default());
    assert!(!module.contains("I18nManager"), "{module}");
}

#[test]
fn web_only_candidates_are_named_too() {
    let module = render_candidate_module(&["grid".to_string()], &Theme::default());
    assert!(module.contains(r#""grid": ""#), "{module}");
    assert!(module.contains("Web-only"), "{module}");
}

#[test]
fn unrecognized_candidates_are_skipped_entirely() {
    // Scanning is imprecise by design; a token that only looked like a
    // class is neither a style nor a problem to report.
    let module = render_candidate_module(&["useState".to_string()], &Theme::default());
    assert!(!module.contains("useState"), "{module}");
}
