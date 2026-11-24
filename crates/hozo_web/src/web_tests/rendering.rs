use super::*;

const LOGIN_EXAMPLE: &str = r#"
import { View, Text, Button } from '@hozo/core'

export function Login() {
  return (
<View className="flex-1 items-center justify-center p-6">
  <Text className="text-xl font-bold">
    Welcome
  </Text>

  <Button className="mt-4 px-4 py-2">
    Continue
  </Button>
</View>
  )
}
"#;

#[test]
fn lowers_the_login_example_to_html_and_css() {
    let parsed = hozo_parser::parse_tsx(LOGIN_EXAMPLE);
    let root = &parsed.roots[0].node;
    let output = lower(root, LOGIN_EXAMPLE, &Theme::default());

    assert!(output
        .jsx
        .starts_with(r#"<div className="hozo-view hozo-0">"#));
    assert!(output
        .jsx
        .contains("<span className=\"hozo-1\">Welcome</span>"));
    assert!(output
        .jsx
        .contains("<button className=\"hozo-2\" type=\"button\">Continue</button>"));

    // Zero-specificity, so a component class beats it wherever the
    // two land relative to each other. See VIEW_BASE_CSS.
    assert!(output.css.contains(":where(.hozo-view) {"));
    assert!(output.css.contains(".hozo-0 {"));
    assert!(output.css.contains("flex: 1 1 0%;"));
    assert!(output.css.contains("padding-top: 24px;"));
    assert!(output.css.contains(".hozo-1 {"));
    assert!(output.css.contains("font-size: 20px;"));
    assert!(output.css.contains("font-weight: 700;"));
    assert!(output.css.contains(".hozo-2 {"));
    // `px-4` is Tailwind's logical inline axis, not left/right.
    assert!(output.css.contains("padding-inline-start: 16px;"));
    assert!(output.css.contains("padding-inline-end: 16px;"));

    assert!(output.diagnostics.is_empty());
}

#[test]
fn hover_condition_compiles_to_a_real_pseudo_class() {
    let source = r#"
        import { View } from '@hozo/core'
        const el = <View className="hover:text-xl" />
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.css.contains(".hozo-0:hover {"));
    assert!(output.css.contains("font-size: 20px;"));
}

#[test]
fn an_unresolvable_class_name_is_preserved_not_dropped() {
    let source = r#"
        import { View } from '@hozo/core'
        const el = <View className={classNameFromProps} />
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());

    // The expression reaches the DOM instead of vanishing...
    assert!(output.jsx.contains("classNameFromProps"));
    // ...and the diagnostic says Hozo generates no CSS behind it,
    // rather than letting it look resolved.
    assert_eq!(output.diagnostics.len(), 1);
    assert_eq!(
        output.diagnostics[0].code,
        hozo_ir::DiagnosticCode::DynamicClassNameNotResolved
    );
}

#[test]
fn a_prop_that_compiles_to_one_the_author_wrote_is_reported() {
    // `onPress` becomes `onClick` on Web, so an element carrying both
    // asked for one thing twice: JSX resolves a duplicate last-wins
    // and the passthrough is emitted last, so the author's `onClick`
    // won and their `onPress` was dropped in silence -- the prop the
    // compiler models losing to the one it carries.
    let source = r#"
        import { Svg } from '@hozo/svg'
        const el = <Svg><Svg.Rect onClick={f} onPress={g} /></Svg>
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());

    assert_eq!(output.jsx.matches("onClick").count(), 1, "{}", output.jsx);
    assert!(
        output.jsx.contains("onClick={f}"),
        "the author's own prop lost: {}",
        output.jsx
    );
    assert!(
        output
            .diagnostics
            .iter()
            .any(|d| d.code == hozo_ir::DiagnosticCode::PropCollidesWithPlatformName),
        "the dropped handler was not reported",
    );
}

#[test]
fn a_spread_keeps_the_mapping() {
    // What a spread carries is not knowable here, so the mapping
    // stays -- and if the spread does carry `onClick` it lands last
    // and still wins. The Native backend guards its own props the
    // same way for the same reason.
    let source = r#"
        import { Svg } from '@hozo/svg'
        const el = <Svg><Svg.Rect {...rest} onPress={g} /></Svg>
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());

    assert!(output.jsx.contains("onClick={g}"), "{}", output.jsx);
    assert!(output.diagnostics.is_empty());
}

#[test]
fn host_dom_normalizes_inline_style_and_spread_values() {
    let source = r#"
        import { View } from '@hozo/core'
        const el = <View style={[base, active && selected]} {...rest} />
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());

    assert!(
        output
            .jsx
            .contains("style={hozoDomStyle([base, active && selected])}"),
        "{}",
        output.jsx
    );
    assert!(
        output.jsx.contains("{...hozoViewDomProps(rest)}"),
        "{}",
        output.jsx
    );
    assert!(
        output.runtime_imports.contains(&"hozoDomStyle"),
        "{:?}",
        output.runtime_imports
    );
    assert!(
        output.runtime_imports.contains(&"hozoViewDomProps"),
        "{:?}",
        output.runtime_imports
    );
}

#[test]
fn static_host_dom_keeps_the_zero_runtime_path() {
    let source = r#"
        import { View } from '@hozo/core'
        const el = <View className="p-4" />
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());

    assert!(!output.jsx.contains("hozoDom"), "{}", output.jsx);
    assert!(!output.runtime_imports.contains(&"hozoDomStyle"));
    assert!(!output.runtime_imports.contains(&"hozoViewDomProps"));
}

#[test]
fn svg_link_is_a_semantic_router_aware_anchor() {
    let source = r#"
        import { Svg } from '@hozo/svg'
        const el = <Svg><Svg.Link href="/detail" replace><Svg.Rect width={10} height={10} /></Svg.Link></Svg>
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());

    assert!(
        output
            .jsx
            .contains(r#"<a data-hozo-navigation-replace="" href="/detail">"#),
        "{}",
        output.jsx
    );
    assert!(output.jsx.contains("</a>"), "{}", output.jsx);
}

#[test]
fn unmodeled_props_and_spreads_reach_the_output() {
    let source = r#"
        import { View } from '@hozo/core'
        const el = <View className="p-4" {...rest} onLayout={onLayout} testID="row" />
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    // `onLayout` and `testID` come after the spread, so they are taken out
    // of it: the author's later values win, as in JSX (#1127).
    assert!(
        output.jsx.contains(
            r#"{...(({ "onLayout": _hozoOmit0, "testID": _hozoOmit1, ..._hozoRest }) => _hozoRest)((rest) ?? {})}"#
        ),
        "{}",
        output.jsx
    );
    assert!(output.jsx.contains("onLayout={onLayout}"));
    assert!(output.jsx.starts_with("<HozoView "), "{}", output.jsx);
    assert_eq!(output.runtime_imports, vec!["HozoView"]);
    assert!(output.jsx.contains(r#"testID={"row"}"#));
}

#[test]
fn a_named_prop_after_a_translated_spread_is_taken_out_of_it() {
    // #1127: the modeled props are emitted before the spread, so without
    // this a `testID` inside `props` became `data-testid` and beat the
    // later explicit one. One case per translator.
    for (source, translator) in [
        (
            r#"
            import { View } from '@hozo/core'
            const el = <View accessibilityLabel="x" {...props} testID="t">x</View>
            "#,
            "hozoViewDomProps",
        ),
        (
            r#"
            import { Button } from '@hozo/core'
            function B({ href, ...rest }) { return <Button {...rest} onPress={go}>Go</Button> }
            "#,
            "hozoButtonDomProps",
        ),
        (
            r#"
            import { TextInput } from '@hozo/core'
            const el = <TextInput {...rest} editable={false} />
            "#,
            "hozoTextInputDomProps",
        ),
    ] {
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        let spread = output
            .jsx
            .find(&format!("{{...{translator}("))
            .unwrap_or_else(|| panic!("{translator} not used: {}", output.jsx));
        let rest = &output.jsx[spread..];
        assert!(rest.contains("_hozoOmit0"), "{}", output.jsx);
        assert!(rest.contains("..._hozoRest"), "{}", output.jsx);
    }
    // A prop before the spread stays the spread's to override.
    let source = r#"
        import { View } from '@hozo/core'
        const el = <View accessibilityLabel="x" {...props}>x</View>
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(
        output.jsx.contains("{...hozoViewDomProps(props)}"),
        "{}",
        output.jsx
    );
}

#[test]
fn pressed_condition_compiles_to_a_real_active_pseudo_class() {
    let source = r#"
        import { Button } from '@hozo/core'
        const el = <Button className="pressed:opacity-50">Save</Button>
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.css.contains(".hozo-0:active {"));
    assert!(output.css.contains("opacity: 0.5;"));
}

#[test]
fn interactive_pressable_without_role_is_diagnosed_from_real_source() {
    // Previously only reachable by hand-constructing a `Node` directly
    // -- `PropSet.on_press`/`accessibility_role` weren't populated by
    // the parser at all until hozo_parser::jsx gained onPress/
    // accessibilityRole attribute parsing.
    let source = r#"
        import { Pressable } from '@hozo/core'
        const el = <Pressable onPress={handleTap}>Tap</Pressable>
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert_eq!(output.diagnostics.len(), 1);
    assert_eq!(
        output.diagnostics[0].code,
        hozo_ir::DiagnosticCode::A11yInteractiveWithoutRole
    );
    assert!(!output.jsx.contains("role="));
    // The press is wired regardless of the diagnostic -- warning about
    // a missing role is not a reason to drop the handler. It goes
    // through `hozoInteractive` because Hozo still had to synthesize
    // the control, role or no role.
    assert!(
        output.jsx.contains("{...hozoInteractive(handleTap)}"),
        "{}",
        output.jsx
    );
}

#[test]
fn accessibility_role_suppresses_the_diagnostic_and_sets_role() {
    let source = r#"
        import { Pressable } from '@hozo/core'
        const el = (
          <Pressable onPress={handleTap} accessibilityRole="button">Tap</Pressable>
        )
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty());
    assert!(output.jsx.contains(r#"role="button""#));
}

#[test]
fn disabled_renders_the_native_attribute_on_button() {
    let source = r#"
        import { Button } from '@hozo/core'
        const el = <Button disabled={isLoading}>Save</Button>
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.jsx.contains("disabled={isLoading}"));
    // Reflect the same fact for aria-disabled utilities without replacing
    // the native disabled attribute that supplies actual button behavior.
    assert!(output.jsx.contains("aria-disabled={isLoading}"));
}

/// The rendered tag decides, not the primitive: a Button with a
/// destination is an anchor, which has no `disabled` (#943). It is
/// announced unavailable and leaves the tab order instead.
#[test]
fn a_disabled_button_with_a_destination_is_an_aria_disabled_anchor_out_of_the_tab_order() {
    let source = r#"
        import { Button } from '@hozo/core'
        const el = <Button href="/docs" disabled={off}>Docs</Button>
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.jsx.starts_with("<a "), "{}", output.jsx);
    assert!(output.jsx.contains("aria-disabled={off}"), "{}", output.jsx);
    assert!(!output.jsx.contains(" disabled={"), "{}", output.jsx);
    assert!(
        output.jsx.contains("tabIndex={(off) ? -1 : undefined}"),
        "{}",
        output.jsx
    );
    assert!(output.jsx.contains("data-hozo-disabled="), "{}", output.jsx);
}

/// A Button kept as a component -- a spread may carry `href` -- decides
/// its own host, so it is handed the portable `disabled` prop. Handing
/// it `aria-disabled` lost the state: `@hozo/ui`'s disabled toolbar
/// button stopped being announced disabled.
#[test]
fn a_button_kept_as_a_component_keeps_the_portable_disabled_prop() {
    let source = r#"
        import { Button } from '@hozo/primitives'
        const el = <Button {...rest} disabled={off}>Go</Button>
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.jsx.starts_with("<Button"), "{}", output.jsx);
    assert!(output.jsx.contains(" disabled={off}"), "{}", output.jsx);
    assert!(!output.jsx.contains("aria-disabled"), "{}", output.jsx);
    assert!(!output.jsx.contains("tabIndex"), "{}", output.jsx);
}

#[test]
fn boolean_disabled_renders_the_attribute_and_drives_the_variant() {
    let source = r#"
        import { Button } from '@hozo/core'
        const el = <Button disabled className="disabled:opacity-50">Save</Button>
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(output.jsx.contains("disabled={true}"), "{}", output.jsx);
    // `[data-hozo-disabled]`, not `:disabled`. One selector for every
    // element, since `:disabled` matches form controls only and a
    // Pressable is a `<div>` -- so a real `<button>` carries the
    // attribute too, or the rule would match here and nowhere else.
    assert!(output.jsx.contains("data-hozo-disabled="), "{}", output.jsx);
    assert!(
        output.css.contains(".hozo-0[data-hozo-disabled]"),
        "{}",
        output.css
    );
    assert!(!output.css.contains(":disabled"), "{}", output.css);
}

#[test]
fn disabled_renders_aria_disabled_on_pressable() {
    // Pressable is a <div> -- the native `disabled` attribute has no
    // effect there, so this must be ARIA instead.
    let source = r#"
        import { Pressable } from '@hozo/core'
        const el = <Pressable disabled={isLoading} accessibilityRole="button">Save</Pressable>
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.jsx.contains("aria-disabled={isLoading}"));
}

#[test]
fn dynamic_class_name_guard_is_wired_as_a_class_toggle() {
    let source = r#"
        import { View } from '@hozo/core'
        import { cn } from 'clsx'
        const el = <View className={cn('p-4', active && 'text-xl')} />
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());

    // The captured guard toggles a class, so it goes
    // wherever `className` goes -- not an attribute a component might
    // not render (#883).
    let name = parsed.roots[0]
        .node
        .root_class_evaluation()
        .unwrap()
        .name(source);
    assert!(
        output.jsx.contains(&format!("({name}[0]) && 'hozo-cond-")),
        "{}",
        output.jsx
    );
    assert!(!output.jsx.contains("data-hozo-cond"), "{}", output.jsx);

    // And the weightless selector that class feeds is present too.
    assert!(output.css.contains(":where(.hozo-cond-"), "{}", output.css);
    assert_eq!(output.jsx.matches("active").count(), 1);
}

#[test]
fn subtree_capture_shifts_copy_evidence_without_changing_copied_bytes() {
    let source = "import {View} from '@hozo/core'; const el = <View className={guard() && 'p-2'} custom={payload}><Foreign thing={child}><View className={inner() && 'p-4'} custom={tail} /></Foreign></View>";
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower_with_evidence(&parsed.roots[0].node, source, &Theme::default(), true);
    let copies = output.source_copies.unwrap();
    assert!(!copies.is_empty());
    for copy in copies {
        assert_eq!(
            &source[copy.span.start as usize..copy.span.end as usize],
            &output.jsx[copy.emitted_start..copy.emitted_end]
        );
    }
    assert_eq!(output.jsx.matches("guard()").count(), 1);
    assert_eq!(output.jsx.matches("inner()").count(), 1);
}

/// A branch on an element that stays a component: `Button` with a spread
/// that may carry `href`. The guard has to arrive through `className`,
/// the one prop such a component passes on.
#[test]
fn a_branch_on_a_component_reaches_it_through_its_class_name() {
    let source = r#"
        import clsx from 'clsx'
        import { Button } from '@hozo/primitives'
        const el = <Button {...rest} className={clsx('p-2', small ? 'px-3' : 'px-4')}>Go</Button>
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.jsx.contains("className={["), "{}", output.jsx);
    // A spread of a binding no longer refuses the class plan (#1879): the
    // guard is read once, from the plan, and still reaches `className`.
    assert!(
        output
            .jsx
            .contains("(__hozoClassPlan131[0]) && 'hozo-cond-"),
        "{}",
        output.jsx
    );
    assert_eq!(output.jsx.matches("(small)").count(), 1, "{}", output.jsx);
    assert!(!output.jsx.contains("data-hozo-cond"), "{}", output.jsx);
}
