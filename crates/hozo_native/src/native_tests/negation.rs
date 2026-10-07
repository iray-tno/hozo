use super::*;

fn compile(body: &str) -> LowerOutput {
    let source = format!("import {{ View, Text, Pressable, Button }} from '@hozo/core'; const el = {body}");
    let parsed = hozo_parser::parse_tsx(&source);
    lower(&parsed.roots[0].node, &source, &Theme::default())
}

#[test]
fn negated_prop_guards_use_the_same_readable_driver() {
    let out = compile(
        r#"<View disabled={off} accessibilityState={{ checked }} className="not-disabled:opacity-50 not-aria-checked:p-4" />"#,
    );
    assert!(out.diagnostics.is_empty(), "{:?}", out.diagnostics);
    assert!(out.jsx.contains("!((off)) &&"), "{}", out.jsx);
    assert!(out.jsx.contains(".checked === true)) &&"), "{}", out.jsx);
    assert!(out.prelude.is_empty(), "{:?}", out.prelude);
}

#[test]
fn negated_structural_answers_are_resolved_without_runtime_state() {
    let out = compile(
        r#"<View><View className="not-first:p-4 not-last:m-2" /><View className="not-first:p-4 not-last:m-2" /></View>"#,
    );
    assert!(out.diagnostics.is_empty(), "{:?}", out.diagnostics);
    assert!(!out.jsx.contains("hozo1_notfirst"), "{}", out.jsx);
    assert!(out.jsx.contains("hozo1_notlast"), "{}", out.jsx);
    assert!(out.jsx.contains("hozo2_notfirst"), "{}", out.jsx);
    assert!(!out.jsx.contains("hozo2_notlast"), "{}", out.jsx);
    assert!(out.prelude.is_empty());
}

#[test]
fn negated_environment_reuses_the_positive_hook_and_can_transition() {
    let out = compile(
        r#"<View className="opacity-100 transition-opacity motion-reduce:opacity-100 not-motion-reduce:opacity-50" />"#,
    );
    assert!(out.diagnostics.is_empty(), "{:?}", out.diagnostics);
    assert_eq!(
        out.prelude
            .iter()
            .filter(|line| line.contains("useHozoEnvironment"))
            .count(),
        1
    );
    assert!(
        out.jsx.contains("!(__hozoEnv_motion_reduce) &&"),
        "{}",
        out.jsx
    );
    assert!(out.jsx.starts_with("<HozoAnimated"), "{}", out.jsx);
}

#[test]
fn negated_atom_composes_with_ambient_and_interactive_guards() {
    let out =
        compile(r#"<Pressable disabled={off} className="md:hover:not-disabled:opacity-50" />"#);
    assert!(out.diagnostics.is_empty(), "{:?}", out.diagnostics);
    assert!(
        out.jsx.contains("__hozoBp_md && hovered && !((off)) &&"),
        "{}",
        out.jsx
    );
}

#[test]
fn negated_focus_owns_a_callback_and_enables_modality_without_positive_variants() {
    for primitive in ["Pressable", "Button"] {
        let out = compile(&format!(
            r#"<{primitive} className="opacity-100 not-focus:opacity-50 not-focus-visible:p-4" />"#,
        ));
        assert!(out.diagnostics.is_empty(), "{:?}", out.diagnostics);
        assert!(out.jsx.starts_with("<HozoPressable"), "{}", out.jsx);
        assert!(out.jsx.contains("style={({ pressed, hovered, focused, focusVisible }) =>"), "{}", out.jsx);
        assert!(out.jsx.contains("!(focused) &&"), "{}", out.jsx);
        assert!(out.jsx.contains("!(focusVisible) &&"), "{}", out.jsx);
        assert!(out.jsx.contains(" hozoFocusVisible"), "{}", out.jsx);
        assert!(out.prelude.is_empty(), "{:?}", out.prelude);
    }
}

#[test]
fn negated_focus_reuses_transition_and_stacked_state_routing() {
    let out = compile(
        r#"<Pressable disabled={off} className="opacity-100 transition-opacity md:not-disabled:not-focus-visible:opacity-50" />"#,
    );
    assert!(out.diagnostics.is_empty(), "{:?}", out.diagnostics);
    assert!(out.jsx.contains("__hozoBp_md && !((off)) && !(focusVisible) &&"), "{}", out.jsx);
    assert!(out.jsx.contains("hozoTransition="), "{}", out.jsx);
    assert!(out.jsx.contains("opacity: true"), "{}", out.jsx);
    assert!(out.jsx.contains(" hozoFocusVisible"), "{}", out.jsx);
}

#[test]
fn unknown_and_unsupported_predicates_do_not_become_true_when_negated() {
    for body in [
        r#"<View className="not-first:p-4" />"#,
        r#"<View className="not-last:p-4" />"#,
        r#"<View className="not-disabled:p-4" />"#,
        r#"<View accessibilityState={{ busy: true }} className="not-aria-checked:p-4" />"#,
        r#"<View className="not-print:p-4" />"#,
        r#"<Pressable className="not-hover:p-4" />"#,
        r#"<View className="not-focus:p-4" />"#,
        r#"<Text className="not-focus-visible:p-4" />"#,
        r#"<View className="md:not-focus-visible:p-4" />"#,
        r#"<View><Unknown /><View className="md:not-first:p-4" /></View>"#,
        r#"<View className="md:not-has-hover:p-4" />"#,
    ] {
        let out = compile(body);
        assert!(
            out.diagnostics
                .iter()
                .any(|d| d.severity == Severity::Error),
            "{body}: {:?}",
            out.diagnostics
        );
        assert!(!out.jsx.contains("_not"), "{body}: {}", out.jsx);
    }
}

#[test]
fn descendant_focus_visible_enables_only_the_nearest_owner() {
    for parent in ["", "focus:opacity-50"] {
        for variant in ["focus-visible", "not-focus-visible", "group-focus-visible"] {
            let out = compile(&format!(
                r#"<Pressable className="{parent}"><View>{{ready && <Text className="{variant}:text-red-500">Label</Text>}}</View></Pressable>"#,
            ));
            assert!(out.diagnostics.is_empty(), "{:?}", out.diagnostics);
            assert!(out.jsx.starts_with("<HozoPressable"), "{}", out.jsx);
            assert_eq!(out.jsx.matches(" hozoFocusVisible").count(), 1, "{}", out.jsx);
            assert!(out.jsx.contains("<HozoText style={({ pressed, hovered, focused, focusVisible }) =>"), "{}", out.jsx);
            assert!(out.jsx.split("<HozoText").next().unwrap().contains("hozoFocusVisible"), "{}", out.jsx);
        }
    }

    let out = compile(r#"<Pressable><Button><Text className="not-focus-visible:text-red-500">Inner</Text></Button></Pressable>"#);
    assert!(out.diagnostics.is_empty(), "{:?}", out.diagnostics);
    assert!(out.jsx.starts_with("<Pressable>"), "{}", out.jsx);
    assert_eq!(out.jsx.matches(" hozoFocusVisible").count(), 1, "{}", out.jsx);

    let out = compile(r#"<Pressable><Unknown /></Pressable>"#);
    assert!(out.jsx.starts_with("<Pressable>"), "{}", out.jsx);
    assert!(!out.jsx.contains("hozoFocusVisible"), "{}", out.jsx);
}

#[test]
fn negated_ambient_conditions_reuse_the_positive_hooks() {
    let out = compile(r#"<View className="md:p-4 not-md:p-2 dark:opacity-50 not-dark:opacity-100 min-[500px]:m-4 not-min-[500px]:m-2 not-max-[500px]:w-10" />"#);
    assert!(out.diagnostics.is_empty(), "{:?}", out.diagnostics);
    for (hook, guard) in [
        ("useHozoBreakpoint", "!(__hozoBp_md) &&"),
        ("useHozoDark", "!(__hozoDark) &&"),
        ("useHozoWidthAtLeast", "!(__hozoWidth_500) &&"),
    ] {
        assert_eq!(out.prelude.iter().filter(|line| line.contains(hook)).count(), 1, "{:?}", out.prelude);
        assert!(out.jsx.contains(guard), "{}", out.jsx);
    }
    assert!(out.jsx.contains("!(!__hozoWidth_500) &&"), "{}", out.jsx);
    assert!(!out.jsx.contains("useHozo"), "{}", out.jsx);
}

#[test]
fn negated_ambient_targets_transition_and_compose_with_interactions() {
    for variant in ["not-md", "not-dark", "not-min-[500px]", "not-max-[500px]"] {
        let out = compile(&format!(r#"<View className="opacity-100 transition-opacity {variant}:opacity-50" />"#));
        assert!(out.diagnostics.is_empty(), "{:?}", out.diagnostics);
        assert!(out.jsx.starts_with("<HozoAnimated"), "{}", out.jsx);
    }
    let out = compile(r#"<Pressable disabled={off} className="not-md:not-dark:hover:not-disabled:opacity-50" />"#);
    assert!(out.diagnostics.is_empty(), "{:?}", out.diagnostics);
    assert!(out.jsx.contains("!(__hozoBp_md) && !(__hozoDark) && hovered && !((off)) &&"), "{}", out.jsx);
}

#[test]
fn negated_unresolvable_width_does_not_register_a_guessed_threshold() {
    for variant in ["not-min-[40rem]", "not-max-[50vw]", "md:not-min-[40rem]"] {
        let out = compile(&format!(r#"<View className="{variant}:p-4" />"#));
        assert!(out.diagnostics.iter().any(|diagnostic| diagnostic.severity == Severity::Error), "{:?}", out.diagnostics);
        assert!(!out.prelude.iter().any(|line| line.contains("useHozoWidthAtLeast")), "{:?}", out.prelude);
        assert!(!out.jsx.contains("_not"), "{}", out.jsx);
    }
}

#[test]
fn negated_container_comparison_keeps_the_applicable_ancestor_guard() {
    for (variant, comparison) in [
        ("not-@md", r#"!(__hozoCq[""] >= 448)"#),
        ("not-@max-md/main", r#"!(__hozoCq["main"] < 448)"#),
        ("not-@min-[400px]/main", r#"!(__hozoCq["main"] >= 400)"#),
        ("not-not-@md", r#"!(!(__hozoCq[""] >= 448))"#),
    ] {
        let out = compile(&format!(r#"<View className="{variant}:opacity-50" />"#));
        assert!(out.diagnostics.is_empty(), "{variant}: {:?}", out.diagnostics);
        assert!(out.jsx.starts_with("<HozoContainerQuery>{(__hozoCq) =>"), "{}", out.jsx);
        assert!(out.jsx.contains(comparison), "{}", out.jsx);
        assert!(out.jsx.contains("!== undefined && !"), "{}", out.jsx);
        assert!(!out.jsx.contains("!(__hozoCq[\"\"] !== undefined"), "{}", out.jsx);
        assert!(out.prelude.is_empty(), "{:?}", out.prelude);
    }
}

#[test]
fn negated_container_queries_compose_with_interactions_and_ambient_transitions() {
    let out = compile(r#"<Pressable disabled={off} className="md:hover:not-@md/main:not-disabled:opacity-50" />"#);
    assert!(out.diagnostics.is_empty(), "{:?}", out.diagnostics);
    assert!(out.jsx.contains(r#"__hozoBp_md && hovered && (__hozoCq["main"] !== undefined && !(__hozoCq["main"] >= 448)) && !((off)) &&"#), "{}", out.jsx);
    assert!(out.jsx.contains("<HozoPressable"), "{}", out.jsx);

    let out = compile(r#"<View className="opacity-100 transition-opacity not-@md:opacity-50" />"#);
    assert!(out.diagnostics.is_empty(), "{:?}", out.diagnostics);
    assert!(out.jsx.starts_with("<HozoContainerQuery"), "{}", out.jsx);
    assert!(out.jsx.contains("<HozoAnimated"), "{}", out.jsx);
}

#[test]
fn container_text_styles_bind_the_query_even_when_only_raw_text_uses_it() {
    for variant in ["@md", "not-@md"] {
        let out = compile(&format!(r#"<View className="{variant}:text-red-500">raw</View>"#));
        assert!(out.diagnostics.is_empty(), "{:?}", out.diagnostics);
        assert!(out.jsx.starts_with("<HozoContainerQuery"), "{}", out.jsx);
        assert!(out.jsx.contains("<Text style="), "{}", out.jsx);
        assert!(out.jsx.contains(r#"__hozoCq[""] !== undefined"#), "{}", out.jsx);
    }
}

#[test]
fn negated_container_unresolvable_units_remain_refused() {
    for variant in ["not-@min-[40rem]", "md:not-@max-[50vw]", "not-not-@min-[40rem]"] {
        let out = compile(&format!(r#"<View className="{variant}:p-4" />"#));
        assert!(out.diagnostics.iter().any(|diagnostic| diagnostic.severity == Severity::Error), "{:?}", out.diagnostics);
        assert!(!out.jsx.contains("_not"), "{}", out.jsx);
        assert!(!out.prelude.iter().any(|line| line.contains("useHozoWidthAtLeast")), "{:?}", out.prelude);
    }
}
