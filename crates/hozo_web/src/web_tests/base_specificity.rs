use crate::lower;
use hozo_ir::Theme;

/// Both components in one file, which is the shape that broke.
fn two_roots() -> String {
    let source = r#"
        import { View } from '@hozo/core'
        export const A = () => <View className="flex flex-row gap-2" />
        export const B = () => <View className="p-4" />
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    parsed
        .roots
        .iter()
        .map(|root| lower(&root.node, source, &Theme::default()).css)
        .collect::<Vec<_>>()
        .join("\n")
}

#[test]
fn the_shared_base_cannot_outrank_a_component_rule() {
    // `lower` runs per root, so a file with two components emits the
    // base twice and the second copy lands after the first component's
    // rules. Both are single classes, so order was the whole cascade:
    // a `View` asking for `flex-row` was laid out as a column by a rule
    // emitted for a component it has nothing to do with.
    //
    // `:where()` is specificity zero, so the position stops mattering.
    let css = two_roots();
    assert!(
        css.contains(":where(.hozo-view)"),
        "the base is not zero-specificity: {css}"
    );
    assert!(
        !css.contains("\n.hozo-view {") && !css.starts_with(".hozo-view {"),
        "a full-specificity copy of the base survived: {css}"
    );
}

#[test]
fn the_base_still_arrives_before_the_rules_it_defaults() {
    // Order no longer decides the winner, but it still decides what a
    // person reads first, and a base written after the rules it
    // defaults is confusing to no purpose.
    let css = two_roots();
    let base = css.find(":where(.hozo-view)").expect("no base");
    let rule = css.find(".hozo-0 {").expect("no component rule");
    assert!(
        base < rule,
        "the base was written after the rule it defaults"
    );
}

#[test]
fn a_prop_driven_rule_keeps_the_specificity_it_needs() {
    // The `[data-hozo-*]` bases are deliberately not wrapped. A
    // horizontal ScrollView has to beat the vertical default, and a
    // disabled control has to look disabled in forced colours even when
    // a component class says otherwise.
    let source = r#"
        import { ScrollView } from '@hozo/core'
        export const A = () => <ScrollView horizontal className="p-4" />
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let css = lower(&parsed.roots[0].node, source, &Theme::default()).css;
    assert!(css.contains(":where(.hozo-scroll-view) {"), "{css}");
    assert!(
        css.contains(".hozo-scroll-view[data-hozo-horizontal] {"),
        "the prop-driven rule lost its specificity: {css}"
    );
}
