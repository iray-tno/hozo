use super::*;

#[test]
fn a_spread_keeps_the_component_where_the_shape_depends_on_a_prop() {
    // #653. A wrapper forwards its props, and every prop it forwards has
    // gone into `rest`:
    //
    //   <ButtonPrimitive {...rest} className={own} />
    //
    // A lowering that asks "is `href` written here" gets "no", and was
    // wrong whenever the answer was "not here, but yes" -- it emitted a
    // `<button>` carrying a useless `href`, where the runtime half of the
    // same component returns an `<a>`. The two disagreed about the
    // element, which is worse than either answer on its own.
    //
    // There is no static way to tell. This compiler reads syntax, so
    // there is no type to ask whether `rest` can hold an `href`, and
    // following the value would mean leaving the file.
    let cases = [
        (
            r#"<Button href="/docs">Docs</Button>"#,
            r#"<a href="/docs">Docs</a>"#,
        ),
        (
            r#"<Button>Docs</Button>"#,
            r#"<button type="button">Docs</button>"#,
        ),
        (
            r#"<Button {...rest}>Docs</Button>"#,
            r#"<Button {...rest}>Docs</Button>"#,
        ),
    ];
    for (input, expected) in cases {
        let source = format!("import {{ Button }} from '@hozo/core'\nconst el = {input}");
        let parsed = hozo_parser::parse_tsx(&source);
        let output = lower(&parsed.roots[0].node, &source, &Theme::default());
        assert_eq!(output.jsx, expected, "for {input}");
    }
}

#[test]
fn a_module_string_constant_compiles_as_the_literal_it_holds() {
    let lowered = |body: &str| {
        let source = format!(
            "import {{ View }} from '@hozo/core'\nimport {{ cx }} from '@hozo/core'\n{body}"
        );
        let parsed = hozo_parser::parse_tsx(&source);
        lower(&parsed.roots[0].node, &source, &Theme::default())
    };
    let direct = lowered("const PAD = 'p-4'\nconst el = <View className={PAD} />");
    assert!(!direct.jsx.contains("PAD"), "{}", direct.jsx);
    assert!(direct.css.contains("padding"), "{}", direct.css);
    let joined =
        lowered("const PAD = 'p-4'\nfunction A({ on }) { return <View className={cx(PAD, on ? 'm-2' : 'm-4')} /> }");
    assert!(!joined.jsx.contains("PAD"), "{}", joined.jsx);
    // A local of the same name is not the constant, and stays opaque.
    let shadowed = lowered(
        "const PAD = 'p-4'\nfunction A() { const PAD = pick(); return <View className={PAD} /> }",
    );
    assert!(shadowed.jsx.contains("PAD"), "{}", shadowed.jsx);
    // Neither is a `let`, which could be reassigned.
    let reassignable = lowered("let PAD = 'p-4'\nconst el = <View className={PAD} />");
    assert!(reassignable.jsx.contains("PAD"), "{}", reassignable.jsx);
}

#[test]
fn a_rest_that_took_href_out_cannot_carry_it() {
    // #656. `rest` is every prop except the ones the pattern named, so
    // once `href` is named the spread cannot supply it, and the Button
    // can be decided -- by syntax and bindings, not by types.
    let lowered = |body: &str| {
        let source = format!("import {{ Button }} from '@hozo/core'\n{body}");
        let parsed = hozo_parser::parse_tsx(&source);
        lower(&parsed.roots[0].node, &source, &Theme::default()).jsx
    };
    assert_eq!(
        lowered("function B({ href, ...rest }) { return <Button {...rest}>Go</Button> }"),
        r#"<button type="button" {...hozoButtonDomProps(rest)}>Go</button>"#
    );
    assert_eq!(
        lowered(
            "function B({ href, ...rest }) { return <Button {...rest} href={href}>Go</Button> }"
        ),
        r#"<a {...hozoLinkDomProps(rest)} href={href}>Go</a>"#
    );
    // #1096. The spread still speaks the primitive's props (`onPress`), so
    // it goes through the Button's translation, told about a `disabled` the
    // element names so a press on the anchor stays suppressed.
    assert!(lowered(
        "function B({ href, disabled, ...rest }) { return <Button {...rest} href={href} disabled={disabled}>Go</Button> }"
    )
    .contains("{...hozoLinkDomProps(rest, (disabled))}"));
    // `href` not taken out: the spread may still hold it.
    assert_eq!(
        lowered("function B({ tone, ...rest }) { return <Button {...rest}>Go</Button> }"),
        r#"<Button {...rest}>Go</Button>"#
    );
    // Read for anything but a spread, the binding could have regained it.
    assert_eq!(
        lowered(
            "function B({ href, ...rest }) { rest.href = '/x'; return <Button {...rest}>Go</Button> }"
        ),
        r#"<Button {...rest}>Go</Button>"#
    );
}

#[test]
fn the_kept_component_is_named_the_way_the_file_names_it() {
    // The half that makes the fallback usable. Every wrapper around a
    // primitive imports it under another name, because the wrapper wants
    // the good one:
    //
    //   import { Button as ButtonPrimitive } from '@hozo/primitives'
    //
    // Emitting `<Button>` there is a free identifier, which renders
    // nothing and reports nothing -- a blank story, which is how this was
    // found.
    let source = "import { Button as ButtonPrimitive } from '@hozo/core'\n\
                  const el = <ButtonPrimitive {...rest}>Docs</ButtonPrimitive>";
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert_eq!(
        output.jsx,
        r#"<ButtonPrimitive {...rest}>Docs</ButtonPrimitive>"#
    );
}

#[test]
fn a_spread_gives_up_nothing_where_the_shape_is_fixed() {
    // The guard is only on the primitives whose *shape* depends on a
    // prop. A `View` is a `div` whatever it is given, so a spread there
    // hides nothing and costs nothing -- which is what keeps this from
    // turning every wrapper in an application back into a runtime tree.
    let source = "import { View } from '@hozo/core'\nconst el = <View {...rest}>x</View>";
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert_eq!(
        output.jsx,
        r#"<div className="hozo-view" {...hozoViewDomProps(rest)}>x</div>"#
    );
}

#[test]
fn replace_navigation_intent_is_an_inert_anchor_marker() {
    let cases = [
        (
            r#"<Link href="/done" replace>Done</Link>"#,
            r#"<a data-hozo-navigation-replace="" href="/done">Done</a>"#,
        ),
        (
            r#"<Button href="/done" replace={shouldReplace}>Done</Button>"#,
            r#"<a data-hozo-navigation-replace={(shouldReplace) ? '' : undefined} href="/done">Done</a>"#,
        ),
        (
            r#"<Link href="/done" replace={false}>Done</Link>"#,
            r#"<a href="/done">Done</a>"#,
        ),
    ];
    for (element, expected) in cases {
        let source = format!("import {{ Link, Button }} from '@hozo/core'\nconst el = {element}");
        let parsed = hozo_parser::parse_tsx(&source);
        let output = lower(&parsed.roots[0].node, &source, &Theme::default());
        assert!(
            output.diagnostics.is_empty(),
            "{element}: {:?}",
            output.diagnostics
        );
        assert_eq!(output.jsx, expected, "{element}");
        assert!(
            !output.jsx.contains(" replace="),
            "{element}: {}",
            output.jsx
        );
    }
}

#[test]
fn prefetch_navigation_intent_is_an_inert_anchor_marker() {
    let cases = [
        (
            r#"<Link href="/likely" prefetch>Likely</Link>"#,
            r#"<a data-hozo-navigation-prefetch="" href="/likely">Likely</a>"#,
        ),
        (
            r#"<Button href="/likely" prefetch={warm}>Likely</Button>"#,
            r#"<a data-hozo-navigation-prefetch={(warm) ? '' : undefined} href="/likely">Likely</a>"#,
        ),
        (
            r#"<Pressable href="/likely" prefetch={false}>Likely</Pressable>"#,
            r#"<a href="/likely">Likely</a>"#,
        ),
    ];
    for (element, expected) in cases {
        let source =
            format!("import {{ Link, Button, Pressable }} from '@hozo/core'\nconst el = {element}");
        let parsed = hozo_parser::parse_tsx(&source);
        let output = lower(&parsed.roots[0].node, &source, &Theme::default());
        assert!(
            output.diagnostics.is_empty(),
            "{element}: {:?}",
            output.diagnostics
        );
        assert_eq!(output.jsx, expected, "{element}");
        assert!(
            !output.jsx.contains(" prefetch="),
            "{element}: {}",
            output.jsx
        );
    }
}

#[test]
fn pressable_with_href_is_a_real_disableable_link() {
    let source = r#"
        import { Pressable } from '@hozo/core'
        const el = (
            <Pressable href="/card" replace disabled={blocked} onPress={visit}>
                Card
            </Pressable>
        )
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(output.jsx.starts_with("<a "), "{}", output.jsx);
    assert!(
        output.jsx.contains("data-hozo-navigation-replace=\"\""),
        "{}",
        output.jsx
    );
    assert!(
        output.jsx.contains("aria-disabled={blocked}"),
        "{}",
        output.jsx
    );
    assert!(
        output
            .jsx
            .contains("onClick={(blocked) ? (event) => event.preventDefault() : visit}"),
        "{}",
        output.jsx
    );
    assert!(output.jsx.contains("href=\"/card\""), "{}", output.jsx);
    assert!(!output.jsx.contains("role=\"button\""), "{}", output.jsx);

    // A destination with no authored handler still needs to stop the
    // browser's own activation. This also covers Button-with-href,
    // which shared the anchor path before Pressable joined it.
    let source = r#"
        import { Button } from '@hozo/core'
        const el = <Button href="/card" disabled>Card</Button>
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(
        output
            .jsx
            .contains("onClick={(true) ? (event) => event.preventDefault() : undefined}"),
        "{}",
        output.jsx
    );

    let source = r#"
        import { Pressable } from '@hozo/core'
        const el = (
            <Pressable
                href="/drag-card"
                replace
                onStartShouldSetResponder={() => true}
            >
                Card
            </Pressable>
        )
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(output.jsx.starts_with("<Pressable "), "{}", output.jsx);
    assert!(output.jsx.contains(" replace"), "{}", output.jsx);
    assert!(output.jsx.contains("href=\"/drag-card\""), "{}", output.jsx);
    assert!(
        output
            .jsx
            .contains("onStartShouldSetResponder={() => true}"),
        "{}",
        output.jsx
    );
}

/// One case per branch of the `external` lowering.
///
/// The differential test in the conformance suite is the one that
/// keeps this agreeing with `externalLinkAttributes`; these pin the
/// emitted text, which is what a reader of a generated file sees.
#[test]
fn external_becomes_a_target_and_a_rel_that_severs_the_opener() {
    let cases = [
        (
            r#"<Link href="https://example.com" external>Docs</Link>"#,
            "<a target=\"_blank\" rel=\"noreferrer noopener\" href=\"https://example.com\">Docs</a>",
        ),
        (
            r#"<Link href="https://example.com" external={false}>Docs</Link>"#,
            "<a href=\"https://example.com\">Docs</a>",
        ),
        // The author wrote one, so the author gets it. Passthrough
        // props are emitted last and JSX resolves duplicates
        // last-wins, which is how the rest of this backend defers.
        (
            r#"<Link href="https://example.com" external rel="me">Docs</Link>"#,
            "<a target=\"_blank\" href=\"https://example.com\" rel=\"me\">Docs</a>",
        ),
        // `external` and a `target` that contradicts it. `external`
        // wins, and the authored one is dropped rather than left to
        // win by position -- the same resolution the runtime half
        // reaches, where `external ? '_blank' : target` decides it.
        (
            r#"<Link href="https://example.com" external target="_self">Docs</Link>"#,
            "<a target=\"_blank\" rel=\"noreferrer noopener\" href=\"https://example.com\">Docs</a>",
        ),
        // A `_blank` written out by hand earns the same `rel`: the
        // risk belongs to the new browsing context, not the spelling.
        (
            r#"<Link href="https://example.com" target="_blank">Docs</Link>"#,
            "<a rel=\"noreferrer noopener\" href=\"https://example.com\" target=\"_blank\">Docs</a>",
        ),
        (
            r#"<Link href="https://example.com" target="_self">Docs</Link>"#,
            "<a href=\"https://example.com\" target=\"_self\">Docs</a>",
        ),
        // Carried as a ternary rather than decided, which is what
        // this backend does with every expression it cannot read.
        (
            r#"<Link href="https://example.com" external={leaves}>Docs</Link>"#,
            "<a target={(leaves) ? '_blank' : undefined} rel={(leaves) ? 'noreferrer noopener' : undefined} href=\"https://example.com\">Docs</a>",
        ),
        (
            r#"<Link href="https://example.com" target={where}>Docs</Link>"#,
            "<a rel={((where) === '_blank') ? 'noreferrer noopener' : undefined} href=\"https://example.com\" target={where}>Docs</a>",
        ),
        (
            r#"<Button href="https://example.com" external>Docs</Button>"#,
            "<a target=\"_blank\" rel=\"noreferrer noopener\" href=\"https://example.com\">Docs</a>",
        ),
    ];
    for (element, expected) in cases {
        let source = format!(
            "import {{ Link, Button }} from '@hozo/core'
const el = {element}"
        );
        let parsed = hozo_parser::parse_tsx(&source);
        let output = lower(&parsed.roots[0].node, &source, &Theme::default());
        assert!(
            output.diagnostics.is_empty(),
            "{element}: {:?}",
            output.diagnostics
        );
        assert_eq!(output.jsx, expected, "{element}");
    }
}

#[test]
fn dynamic_heading_level_uses_the_typed_fallback_component() {
    let source = r#"
        import { Heading } from '@hozo/core'
        const el = <Heading level={level}>Title</Heading>
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert_eq!(output.jsx, "<Heading level={level}>Title</Heading>");
}

#[test]
fn article_and_navigation_lower_to_web_landmarks() {
    let source = r#"
        import { Article, Nav, Heading } from '@hozo/core'
        const el = <Article><Heading>Title</Heading><Nav accessibilityLabel="Primary" /></Article>
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert_eq!(output.jsx, "<article className=\"hozo-view\"><h1>Title</h1><nav className=\"hozo-view\" aria-label={\"Primary\"}></nav></article>");
}

#[test]
fn a_synthesized_interactive_element_gets_keyboard_activation() {
    // A `<div role="button">` receives no Enter or Space from the
    // browser. Emitting `tabIndex` without them produced a control a
    // keyboard user could reach and not operate -- WCAG 2.1.1.
    let source = r#"
        import { Pressable } from '@hozo/core'
        const el = <Pressable accessibilityRole="button" onPress={save}>Save</Pressable>
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(
        output.jsx.contains("{...hozoInteractive(save)}"),
        "{}",
        output.jsx
    );
    assert_eq!(output.runtime_imports, KEY_ACTIVATION_IMPORTS);
    // Not separately: the helper supplies it, together with everything
    // it has to agree with.
    assert!(!output.jsx.contains("tabIndex"), "{}", output.jsx);
}

#[test]
fn a_control_brings_the_rule_that_gives_it_a_pointer() {
    // `hozoInteractive` marks a synthesized control and the compiler
    // marks a real `<button>`; either way the stylesheet that turns the
    // marker into a pointer has to come with it, even with no View in
    // the file.
    for (source, marker) in [
        (
            "import { Pressable } from '@hozo/core'\nconst el = <Pressable accessibilityRole=\"button\" onPress={save}>S</Pressable>",
            "hozoInteractive(save)",
        ),
        (
            "import { Button } from '@hozo/core'\nconst el = <Button onPress={save}>S</Button>",
            "data-hozo-pressable=\"\"",
        ),

    ] {
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(output.jsx.contains(marker), "{}", output.jsx);
        assert!(output.css.contains(":where([data-hozo-pressable]"), "{}", output.css);
    }

    // A button that does nothing when clicked keeps the default cursor.
    let source = "import { Button } from '@hozo/core'\nconst el = <Button>S</Button>";
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(
        !output.jsx.contains("data-hozo-pressable"),
        "{}",
        output.jsx
    );
}

#[test]
fn a_disabled_control_is_inoperable_not_merely_announced() {
    // The bug this whole line of work started from: `aria-disabled`
    // went out and the handler ran anyway. Once keyboard activation
    // existed it ran on Enter and Space as well.
    let source = r#"
        import { Pressable } from '@hozo/core'
        const el = <Pressable disabled={busy} accessibilityRole="button" onPress={save}>S</Pressable>
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(
        output.jsx.contains("{...hozoInteractive(save, busy)}"),
        "{}",
        output.jsx
    );
    // One statement of the state, not two that can disagree.
    assert_eq!(
        output.jsx.matches("aria-disabled").count(),
        0,
        "{}",
        output.jsx
    );
}

#[test]
fn both_spellings_of_disabled_fold_into_one_guard() {
    // React Native merges them; emitting both put `aria-disabled` on
    // the element twice and let the later one win by accident.
    let source = r#"
        import { Pressable } from '@hozo/core'
        const el = <Pressable disabled={a} accessibilityState={{ disabled: b }} accessibilityRole="button" onPress={save}>S</Pressable>
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(
        output
            .jsx
            .contains("{...hozoInteractive(save, (a) || (({ disabled: b })?.disabled === true))}"),
        "{}",
        output.jsx
    );
}

#[test]
fn direction_is_a_selector_and_weighs_nothing() {
    // The odd one in the environment group, and the reason the whole
    // group was read out of Tailwind rather than assumed: `ltr:` is
    // not a media query. Its `:where()` wrapper is what keeps an
    // `rtl:` utility ordering against its unprefixed twin by source
    // position rather than by outweighing it.
    let (at_rules, suffix) =
        css::condition_shape(&hozo_ir::Condition::Environment(hozo_ir::Environment::Ltr));
    assert!(at_rules.is_empty());
    assert!(suffix.contains(":where("), "{suffix}");

    let (at_rules, suffix) = css::condition_shape(&hozo_ir::Condition::Environment(
        hozo_ir::Environment::Print,
    ));
    assert_eq!(at_rules, vec!["@media print".to_string()]);
    assert_eq!(suffix, "&");
}

#[test]
fn a_class_hozo_cannot_compile_is_carried_not_deleted() {
    // Dropped before this, which deleted a project's own class from
    // the element -- and Tailwind's `group` and `peer`, which carry no
    // styles themselves and exist to be selected against, so losing
    // them breaks a pattern that never mentioned Hozo.
    for (class_name, expected) in [
        ("my-card", "hozo-view my-card"),
        ("p-4 my-card", "hozo-view hozo-0 my-card"),
        ("group", "hozo-view group"),
        ("peer", "hozo-view peer"),
        // Tailwind's, and one Hozo does not implement. Carried for the
        // same reason: deleting it helps nobody.
        (
            "aria-[sort=ascending]:bg-blue-500",
            "hozo-view aria-[sort=ascending]:bg-blue-500",
        ),
    ] {
        let source = format!(
            "import {{ View }} from '@hozo/core'
const el = <View className=\"{class_name}\">x</View>
"
        );
        let parsed = hozo_parser::parse_tsx(&source);
        let output = lower(&parsed.roots[0].node, &source, &Theme::default());
        assert!(
            output.jsx.contains(&format!("className=\"{expected}\"")),
            "{} -> {}",
            class_name,
            output.jsx
        );
    }
}

#[test]
fn a_class_hozo_compiles_is_not_also_carried() {
    // Otherwise every element would carry the utilities twice: once as
    // the scoped class that has the rule, once as the Tailwind name
    // that has nothing.
    let source = r#"
        import { View } from '@hozo/core'
        const el = <View className="p-4 text-xl">x</View>
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(
        output.jsx.contains(r#"className="hozo-view hozo-0""#),
        "{}",
        output.jsx
    );
}

#[test]
fn focusable_is_translated_into_the_spelling_the_dom_has() {
    // React Native's prop, in the DOM's word for it. Carried verbatim
    // before this, which put `focusable` on a `<div>` where nothing
    // reads it -- so a prop that works on Native did nothing at all on
    // Web, without saying so.
    for (element, expected) in [
        (
            r#"<View focusable className="p-4">x</View>"#,
            "tabIndex={0}",
        ),
        (
            r#"<View focusable={false} className="p-4">x</View>"#,
            "tabIndex={-1}",
        ),
        (
            r#"<View focusable={can} className="p-4">x</View>"#,
            "tabIndex={(can) ? 0 : -1}",
        ),
    ] {
        let source = format!(
            "import {{ View }} from '@hozo/core'
const el = {element}
"
        );
        let parsed = hozo_parser::parse_tsx(&source);
        let output = lower(&parsed.roots[0].node, &source, &Theme::default());
        assert!(
            output.jsx.contains(expected),
            "{} -> {}",
            element,
            output.jsx
        );
        assert!(!output.jsx.contains("focusable"), "{}", output.jsx);
    }
}

#[test]
fn a_disabled_element_that_is_not_a_control_is_only_announced() {
    // Rule 5: dimming a whole disabled region is a real pattern, and
    // it neither gains nor loses a tab stop.
    let source = r#"
        import { View } from '@hozo/core'
        const el = <View disabled={busy} className="p-4">S</View>
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(
        output.jsx.contains("aria-disabled={busy}"),
        "{}",
        output.jsx
    );
    assert!(!output.jsx.contains("hozoInteractive"), "{}", output.jsx);
    assert!(output.runtime_imports.is_empty(), "{}", output.jsx);
}

#[test]
fn an_element_the_browser_already_activates_gets_no_handlers() {
    // `<button>` has Enter and Space natively, and a `<div>` with no
    // press handler is not a control. Adding handlers to either would
    // be runtime nobody asked for.
    for source in [
        r#"
        import { Button } from '@hozo/core'
        const el = <Button onPress={save}>Save</Button>
        "#,
        r#"
        import { View } from '@hozo/core'
        const el = <View className="p-4">Text</View>
        "#,
    ] {
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(!output.jsx.contains("onKeyDown"), "{}", output.jsx);
        assert!(output.runtime_imports.is_empty(), "{}", output.jsx);
    }
}

#[test]
fn static_and_dynamic_lists_keep_ordering_semantics() {
    let source = r#"
        import { List, ListItem } from '@hozo/core'
        const el = <List ordered><ListItem>First</ListItem></List>
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert_eq!(
        output.jsx,
        "<ol className=\"hozo-view\"><li className=\"hozo-view\">First</li></ol>"
    );

    let dynamic = r#"
        import { List, ListItem } from '@hozo/core'
        const el = <List ordered={ranked}><ListItem>First</ListItem></List>
        "#;
    let parsed = hozo_parser::parse_tsx(dynamic);
    let output = lower(&parsed.roots[0].node, dynamic, &Theme::default());
    assert_eq!(output.jsx, "<List className=\"hozo-view\" ordered={ranked}><li className=\"hozo-view\">First</li></List>");
}

/// Compiles one element and returns its JSX.
fn jsx_for(element: &str) -> String {
    let source = format!(
        "import {{ TextInput }} from '@hozo/core'
const el = {element}
"
    );
    let parsed = hozo_parser::parse_tsx(&source);
    lower(&parsed.roots[0].node, &source, &Theme::default()).jsx
}

#[test]
fn on_change_text_becomes_the_handler_the_dom_actually_has() {
    // The one that made a compiled `TextInput` worse than the runtime
    // fallback beside it. `onChangeText` is not a DOM prop, so
    // `<input onChangeText={f}>` rendered a field that reported
    // nothing -- and `@hozo/core`'s `TextInput` had been wrapping it
    // correctly the whole time.
    let jsx = jsx_for(r#"<TextInput accessibilityLabel="N" onChangeText={handle} />"#);
    assert!(
        jsx.contains("onChange={(event) => (handle)?.(event.target.value)}"),
        "{jsx}"
    );
    assert!(!jsx.contains("onChangeText"), "{jsx}");
}

#[test]
fn multiline_chooses_the_element_because_the_dom_has_no_such_prop() {
    // React Native switches on a prop; the DOM switches on the tag.
    assert!(jsx_for(r#"<TextInput accessibilityLabel="N" multiline />"#).contains("<textarea"));
    assert!(jsx_for(r#"<TextInput accessibilityLabel="N" />"#).contains("<input"));
    // `numberOfLines` is `rows`, and only where there are rows.
    let area = jsx_for(r#"<TextInput accessibilityLabel="N" multiline numberOfLines={4} />"#);
    assert!(area.contains("rows={4}"), "{area}");
    let line = jsx_for(r#"<TextInput accessibilityLabel="N" numberOfLines={4} />"#);
    assert!(!line.contains("rows="), "{line}");
}

#[test]
fn a_multiline_only_known_at_runtime_is_reported_rather_than_guessed() {
    // One tag goes into the file, so there is no ternary to write
    // here -- unlike every other prop, where carrying the expression
    // is enough.
    let source = "import { TextInput } from '@hozo/core'
                  const el = <TextInput accessibilityLabel=\"N\" multiline={isLong} />
";
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(
        output
            .diagnostics
            .iter()
            .any(|d| d.code == hozo_ir::DiagnosticCode::DynamicPropNotResolved),
        "{:?}",
        output.diagnostics,
    );
    assert!(output.jsx.contains("<input"), "{}", output.jsx);
}

#[test]
fn editable_is_read_only_said_the_other_way_round() {
    assert!(
        jsx_for(r#"<TextInput accessibilityLabel="N" editable={false} />"#).contains(" readOnly")
    );
    // A literal in braces is as known as a bare attribute, so it gets
    // the same short spelling rather than a negated expression.
    assert!(
        !jsx_for(r#"<TextInput accessibilityLabel="N" editable={false} />"#).contains("readOnly={")
    );
    // An expression cannot be folded, so it is carried and negated.
    assert!(
        jsx_for(r#"<TextInput accessibilityLabel="N" editable={canEdit} />"#)
            .contains("readOnly={!(canEdit)}")
    );
    // And React Native's newer spelling passes straight through.
    assert!(jsx_for(r#"<TextInput accessibilityLabel="N" readOnly />"#).contains(" readOnly"));
}

#[test]
fn boolean_auto_correct_is_an_enumerated_dom_attribute_not_a_boolean_attribute() {
    assert!(
        jsx_for(r#"<TextInput accessibilityLabel="N" autoCorrect={false} />"#)
            .contains(r#" autoCorrect="off""#)
    );
    assert!(
        jsx_for(r#"<TextInput accessibilityLabel="N" autoCorrect />"#)
            .contains(r#" autoCorrect="on""#)
    );
    let dynamic =
        jsx_for(r#"<TextInput accessibilityLabel="N" multiline autoCorrect={getCorrection()} />"#);
    assert!(
        dynamic.contains("value === undefined ? undefined : value ? 'on' : 'off'"),
        "{dynamic}"
    );
    assert_eq!(dynamic.matches("getCorrection()").count(), 1, "{dynamic}");
    assert!(!jsx_for(r#"<TextInput accessibilityLabel="N" />"#).contains("autoCorrect"));
}

#[test]
fn the_keyboard_props_become_the_attribute_the_dom_names_data_with() {
    // `keyboardType` names a keyboard and `inputmode` names a kind of
    // data, which is why the mapping is partial rather than a rename:
    // `visible-password` and `twitter` describe a layout and the DOM
    // has no vocabulary for one.
    assert!(
        jsx_for(r#"<TextInput accessibilityLabel="N" keyboardType="phone-pad" />"#)
            .contains(r#"inputMode="tel""#)
    );
    assert!(
        jsx_for(r#"<TextInput accessibilityLabel="N" keyboardType="email-address" />"#)
            .contains(r#"inputMode="email""#)
    );
    assert!(
        !jsx_for(r#"<TextInput accessibilityLabel="N" keyboardType="visible-password" />"#)
            .contains("inputMode")
    );
    // React Native documents `inputMode` as taking precedence, so Web
    // follows that rather than inventing an order.
    assert!(jsx_for(
        r#"<TextInput accessibilityLabel="N" keyboardType="phone-pad" inputMode="text" />"#
    )
    .contains(r#"inputMode="text""#));
}

#[test]
fn a_prop_only_react_native_has_is_still_carried() {
    // The rule this commit narrows rather than replaces: passing a
    // prop through is right when only React Native has it, and wrong
    // when the DOM has it under another name.
    assert!(
        jsx_for(r#"<TextInput accessibilityLabel="N" underlineColorAndroid="red" />"#)
            .contains("underlineColorAndroid")
    );
}

#[test]
fn a_text_inputs_spread_is_translated_for_the_element_it_lowered_to() {
    // #1118. A spread on a TextInput still speaks the primitive's props
    // (`onChangeText`, `editable`), so it goes through the uncompiled
    // TextInput's translation, told whether the element is a textarea.
    // Raw, `onChangeText` reached the DOM as an unknown attribute and a
    // controlled field could not be typed into.
    let lowered = |body: &str| {
        let source = format!("import {{ TextInput }} from '@hozo/core'\n{body}");
        let parsed = hozo_parser::parse_tsx(&source);
        lower(&parsed.roots[0].node, &source, &Theme::default()).jsx
    };
    let single = lowered("function F(props) { return <TextInput {...props} /> }");
    assert!(
        single.contains("{...hozoTextInputDomProps(props)}"),
        "{single}"
    );
    assert!(!single.contains("hozoDomProps("), "{single}");
    let multi = lowered("function F(props) { return <TextInput multiline {...props} /> }");
    assert!(multi.starts_with("<textarea"), "{multi}");
    assert!(
        multi.contains("{...hozoTextInputDomProps(props, true)}"),
        "{multi}"
    );
}

#[test]
fn a_spread_on_a_plain_element_primitive_is_translated_like_its_named_props() {
    // #1122. `accessibilityLabel`, `testID` and the rest of the universal
    // props are translated when written by name; through a spread they
    // reached the DOM raw, and the element lost its accessible name.
    let lowered = |import: &str, body: &str| {
        let source = format!("import {{ {import} }} from '@hozo/core'\n{body}");
        let parsed = hozo_parser::parse_tsx(&source);
        lower(&parsed.roots[0].node, &source, &Theme::default())
    };
    for (import, body, tag) in [
        ("View", "const el = <View {...rest}>x</View>", "<div"),
        ("Text", "const el = <Text {...rest}>x</Text>", "<span"),
        (
            "Heading",
            "const el = <Heading level={2} {...rest}>x</Heading>",
            "<h2",
        ),
        (
            "Section",
            "const el = <Section {...rest}>x</Section>",
            "<section",
        ),
    ] {
        let output = lowered(import, body);
        assert!(output.jsx.starts_with(tag), "{}", output.jsx);
        assert!(
            output.jsx.contains("{...hozoViewDomProps(rest)}"),
            "{}",
            output.jsx
        );
        assert!(
            output.runtime_imports.contains(&"hozoViewDomProps"),
            "{:?}",
            output.runtime_imports
        );
    }
    // An Image's `src` may be an object and its label is its `alt`, so it
    // has its own translation.
    let image = lowered("Image", "const el = <Image {...rest} />");
    assert_eq!(image.jsx, "<img {...hozoImageDomProps(rest)} />");
    assert!(image.runtime_imports.contains(&"hozoImageDomProps"));
}
