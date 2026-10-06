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
