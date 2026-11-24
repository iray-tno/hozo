use super::*;

#[test]
fn portable_display_values_lower_normally() {
    let source = r#"
            import { View } from '@hozo/core'
            const el = <View className="hidden" />
            "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty());
    assert!(output.styles.contains("display: 'none',"));
}

#[test]
fn structural_form_and_disclosure_primitives_lower_to_native_components() {
    let source = r#"
        import { Fieldset, Legend, Details, Summary, TermList, Term, Description } from '@hozo/semantics'
        const el = (
            <Fieldset>
                <Legend>Options</Legend>
                <Details>
                    <Summary>More</Summary>
                    <TermList>
                        <Term>Term</Term>
                        <Description>Detail</Description>
                        <TermList.Term>CompoundTerm</TermList.Term>
                        <TermList.Description>CompoundDetail</TermList.Description>
                    </TermList>
                </Details>
            </Fieldset>
        )
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(
        output.jsx.contains(r#"<View role="group">"#),
        "{}",
        output.jsx
    );
    // The disclosure is two runtime components now. It used to be a View
    // holding a Pressable and then the body, always -- no toggle on the
    // button and the body visible whether it was open or not.
    assert!(output.jsx.contains("<HozoDetails>"), "{}", output.jsx);
    assert!(output.jsx.contains("<HozoSummary>"), "{}", output.jsx);
    assert!(
        output.jsx.contains(r#"<View role="list">"#),
        "{}",
        output.jsx
    );
    // Legend and Term receive bold font weight semantic defaults
    assert!(
        output.styles.contains("fontWeight: '700',"),
        "{}",
        output.styles
    );
}

#[test]
fn separator_lowers_to_native_view_with_separator_role() {
    let source = r#"
        import { Separator } from '@hozo/semantics'
        const el = <Separator />
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(output.jsx.contains(r#"role="separator""#), "{}", output.jsx);
}

#[test]
fn progress_and_button_with_href_lower_to_native_components() {
    let source = r#"
        import { Button } from '@hozo/core'
        import { Progress } from '@hozo/semantics'
        const el = (
            <View>
                <Progress />
                <Button href="https://example.com">Go</Button>
            </View>
        )
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(
        output.jsx.contains(r#"role="progressbar""#),
        "{}",
        output.jsx
    );
    assert!(
        output.jsx.contains("role=\"progressbar\" accessible"),
        "{}",
        output.jsx
    );
    assert!(
        output
            .jsx
            .contains(r#"<HozoLink href="https://example.com">"#),
        "{}",
        output.jsx
    );
    assert!(
        !output
            .jsx
            .contains(r#"accessibilityRole="button" href="https://example.com""#),
        "{}",
        output.jsx
    );
}

#[test]
fn destination_replace_intent_reaches_hozo_link() {
    let source = r#"
        import { Button } from '@hozo/core'
        import { Link } from '@hozo/typography'
        const el = (
            <View>
                <Link href="/one" replace>One</Link>
                <Button href="/two" replace={shouldReplace}>Two</Button>
            </View>
        )
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(
        output
            .jsx
            .contains(r#"<HozoLink replace={true} href="/one">"#),
        "{}",
        output.jsx
    );
    assert!(
        output
            .jsx
            .contains(r#"<HozoLink replace={shouldReplace} href="/two">"#),
        "{}",
        output.jsx
    );
}

#[test]
fn destination_prefetch_intent_reaches_hozo_link() {
    let source = r#"
        import { Button, Link, Pressable } from '@hozo/core'
        const el = (
            <View>
                <Link href="/one" prefetch>One</Link>
                <Button href="/two" prefetch={likely}>Two</Button>
                <Pressable href="/three" prefetch>Three</Pressable>
            </View>
        )
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert_eq!(
        output.jsx.matches(" prefetch={true}").count(),
        2,
        "{}",
        output.jsx
    );
    assert!(output.jsx.contains(" prefetch={likely}"), "{}", output.jsx);
}

/// The rule the browser draws and React Native does not.
///
/// `<hr>` takes its line from the user-agent stylesheet. React Native has
/// none, so a `View` with no size is zero pixels tall -- and a compiled
/// separator was exactly that while the uncompiled fallback in
/// `@hozo/semantics` set the height by hand. Turning the compiler on
/// removed a divider from the screen (#309), which is the sort of
/// difference the Web half hides: nothing about `<hr />` suggests the
/// other platform is short of anything.
#[test]
fn a_separator_is_one_pixel_and_says_what_it_is() {
    let cases = [
        (
            r#"<Separator />"#,
            "height: 1,",
            r#"<View style={hozoStyles.hozo0} role="separator"></View>"#,
        ),
        (
            r#"<Separator orientation="vertical" />"#,
            "width: 1,",
            r#"<View style={hozoStyles.hozo0} role="separator"></View>"#,
        ),
        // A rule drawn to look like a line is not structure. `role` and
        // `accessibilityRole` both say `none`, which is the one value
        // React Native has for silence -- it has no `separator` at all,
        // and Android discards the ARIA spelling as well.
        (
            r#"<Separator decorative />"#,
            "height: 1,",
            r#"<View style={hozoStyles.hozo0} role="none" accessibilityRole="none"></View>"#,
        ),
    ];
    // Under a reset, which is what a Tailwind project ships.
    // `Theme::default()` means no reset and draws the user agent's two
    // pixels instead; both are checked, because the number is a fact about
    // the project rather than about the primitive (#315).
    let reset = Theme::new(std::collections::HashMap::new(), None, true);
    for (element, size, jsx) in cases {
        let source = format!("import {{ Separator }} from '@hozo/core'\nconst el = {element}");
        let parsed = hozo_parser::parse_tsx(&source);
        let output = lower(&parsed.roots[0].node, &source, &reset);
        assert!(
            output.diagnostics.is_empty(),
            "{element}: {:?}",
            output.diagnostics
        );
        assert!(output.styles.contains(size), "{element}: {}", output.styles);
        assert!(
            output.styles.contains("alignSelf: 'stretch',"),
            "{element}: {}",
            output.styles
        );
        assert_eq!(output.jsx, jsx, "{element}");
    }
}

/// Neither of a rule's own props is a prop the platform reads.
#[test]
fn a_separator_does_not_pass_its_own_props_through() {
    for element in [
        r#"<Separator decorative />"#,
        r#"<Separator orientation="vertical" />"#,
    ] {
        let source = format!("import {{ Separator }} from '@hozo/core'\nconst el = {element}");
        let parsed = hozo_parser::parse_tsx(&source);
        let output = lower(&parsed.roots[0].node, &source, &Theme::default());
        assert!(
            !output.jsx.contains("decorative"),
            "{element}: {}",
            output.jsx
        );
        assert!(
            !output.jsx.contains("orientation"),
            "{element}: {}",
            output.jsx
        );
    }
}

#[test]
fn destination_pressable_is_a_native_link() {
    let source = r#"
        import { Pressable } from '@hozo/core'
        const el = <Pressable href="/card" replace external>Card</Pressable>
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(
        output
            .jsx
            .contains(r#"<HozoLink replace={true} href="/card" external>"#),
        "{}",
        output.jsx
    );
    assert!(
        output.jsx.contains("<Text>Card</Text></HozoLink>"),
        "{}",
        output.jsx
    );
    assert!(output.jsx.contains(" external"), "{}", output.jsx);
    assert!(
        !output.jsx.contains("accessibilityRole=\"button\""),
        "{}",
        output.jsx
    );
}

/// The same rule and the same heading, in a project that ships no reset.
///
/// The browser draws `<hr>` as a 2px inset border and `<h1>` at 32px bold
/// until something resets them, so a compiler matching the browser has to
/// know which browser rendering the project actually gets. Measured both
/// ways in headless Chrome (#315).
#[test]
fn without_a_reset_the_defaults_are_the_user_agent_s() {
    let source = "import { Separator, Heading } from '@hozo/core'\nconst el = <Separator />";
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.styles.contains("height: 2,"), "{}", output.styles);

    let source = "import { Heading } from '@hozo/core'\nconst el = <Heading level={1}>T</Heading>";
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.styles.contains("fontSize: 28,"), "{}", output.styles);
    assert!(
        output.styles.contains("fontWeight: '700',"),
        "{}",
        output.styles
    );
}

/// A heading under a reset is body text, which is what the browser shows.
///
/// Tailwind's preflight sets `h1`-`h6` to `font-size: inherit; font-weight:
/// inherit`. Measured at 16px and weight 400 with it, 32px and 700 without.
/// Supplying a size here would make the phone show an outline the browser
/// does not -- which is what it did (#315).
///
/// The level still reaches a screen reader through
/// `accessibilityRole="header"`, which is the half that is about structure.
#[test]
fn a_heading_under_a_reset_carries_its_role_and_no_size() {
    let reset = Theme::new(std::collections::HashMap::new(), None, true);
    for level in [1, 2, 6] {
        let source = format!(
            "import {{ Heading }} from '@hozo/core'\nconst el = <Heading level={{{level}}}>T</Heading>"
        );
        let parsed = hozo_parser::parse_tsx(&source);
        let output = lower(&parsed.roots[0].node, &source, &reset);
        assert!(
            !output.styles.contains("fontSize"),
            "level {level}: {}",
            output.styles
        );
        assert!(
            !output.styles.contains("fontWeight"),
            "level {level}: {}",
            output.styles
        );
        assert!(
            output.jsx.contains(r#"accessibilityRole="header""#),
            "level {level}: {}",
            output.jsx
        );
    }
}

#[test]
fn a_meter_is_hozo_meter_and_hands_it_everything_it_draws_with() {
    // `Meter`, not `Progress`: an amount within a range, drawn as a bar on
    // Native as `<meter>` draws one on the Web (#788). `HozoMeter` works the
    // amount out -- the bar's width, its colour from `low`/`high`/`optimum`,
    // and the percentage a reader hears -- so every one of those props has
    // to reach it, and the author's classes are the track's style.
    let source = r#"
        import { Meter } from '@hozo/core'
        const a = <Meter accessibilityLabel="Disk usage" value={used} min={0} max={100} low={30} high={80} optimum={20} className="w-40 rounded-full bg-slate-200" />
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(output.jsx.starts_with("<HozoMeter"), "{}", output.jsx);
    assert!(
        output.runtime_imports.contains(&"HozoMeter"),
        "{:?}",
        output.runtime_imports
    );
    for prop in [
        "value={used}",
        "min={0}",
        "max={100}",
        "low={30}",
        "high={80}",
        "optimum={20}",
        r#"accessibilityLabel={"Disk usage"}"#,
    ] {
        assert!(
            output.jsx.contains(prop),
            "{prop} did not reach HozoMeter: {}",
            output.jsx
        );
    }
    assert!(
        output.jsx.contains("style={hozoStyles.hozo0}"),
        "{}",
        output.jsx
    );
    assert!(
        output.styles.contains("width: 160") && output.styles.contains("borderRadius: 9999"),
        "{}",
        output.styles
    );
    // The component's to decide now, so not decided twice.
    assert!(!output.jsx.contains("accessibilityValue"), "{}", output.jsx);
    assert!(!output.jsx.contains("role="), "{}", output.jsx);
}

#[test]
fn a_badge_is_hozo_badge_and_keeps_its_text_styles() {
    // `HozoBadge` is a `Text` underneath and draws its count rather than
    // its children, so a colour moved onto an inserted `Text` around the
    // children would be on nothing.
    let source = r#"
        import { Badge } from '@hozo/core'
        const el = <Badge count={n} accessibilityLabel="3 unread" className="rounded-full bg-red-600 text-white text-xs" />
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(
        output
            .jsx
            .starts_with("<HozoBadge style={hozoStyles.hozo0}"),
        "{}",
        output.jsx
    );
    assert!(output.jsx.contains("count={n}"), "{}", output.jsx);
    assert!(
        output.runtime_imports.contains(&"HozoBadge"),
        "{:?}",
        output.runtime_imports
    );
    assert!(!output.styles.contains("_text"), "{}", output.styles);
    assert!(output.styles.contains("color: '#fff'"), "{}", output.styles);
}

#[test]
fn a_skeleton_is_hidden_and_animates_only_when_motion_is_allowed() {
    // Decision 007, section 5: whatever animation a class puts on a
    // skeleton runs only when motion is allowed -- `animate-pulse` here is
    // `motion-safe:animate-pulse` -- and an author who wrote `motion-safe:`
    // is not guarded twice.
    for (class_name, guard) in [
        (
            "h-4 animate-pulse",
            "__hozoEnv_motion_safe && __hozoAnim_pulse",
        ),
        (
            "h-4 md:animate-pulse",
            "__hozoEnv_motion_safe && __hozoBp_md && __hozoAnim_pulse",
        ),
        (
            "h-4 motion-safe:animate-pulse",
            "[hozoStyles.hozo0, __hozoEnv_motion_safe && __hozoAnim_pulse]",
        ),
    ] {
        let source = format!(
            "import {{ Skeleton }} from '@hozo/core'\nconst el = <Skeleton className=\"{class_name}\" />\n"
        );
        let parsed = hozo_parser::parse_tsx(&source);
        let output = lower(&parsed.roots[0].node, &source, &Theme::default());
        assert!(
            output.diagnostics.is_empty(),
            "{class_name}: {:?}",
            output.diagnostics
        );
        assert!(output.jsx.contains(guard), "{class_name}: {}", output.jsx);
        assert!(
            output.jsx.contains(" aria-hidden"),
            "{class_name}: {}",
            output.jsx
        );
    }
}

#[test]
fn a_skeletons_descendants_animate_only_when_motion_is_allowed() {
    // Web's rule is `[data-hozo-skeleton], [data-hozo-skeleton] *`, so a
    // spinner inside a placeholder stops under reduced motion there. It
    // has to here too, at any depth, and outside a skeleton the same class
    // is not guarded.
    let compile = |element: &str| {
        let source =
            format!("import {{ Skeleton, View }} from '@hozo/core'\nconst el = {element}\n");
        let parsed = hozo_parser::parse_tsx(&source);
        lower(&parsed.roots[0].node, &source, &Theme::default())
    };
    for element in [
        r#"<Skeleton><View className="animate-spin" /></Skeleton>"#,
        r#"<Skeleton><View><View><View className="animate-spin" /></View></View></Skeleton>"#,
    ] {
        let output = compile(element);
        assert!(
            output.diagnostics.is_empty(),
            "{element}: {:?}",
            output.diagnostics
        );
        assert!(
            output
                .jsx
                .contains("__hozoEnv_motion_safe && __hozoAnim_spin"),
            "{element}: {}",
            output.jsx
        );
    }
    // Not guarded twice.
    let written = compile(r#"<Skeleton><View className="motion-safe:animate-spin" /></Skeleton>"#);
    assert_eq!(
        written.jsx.matches("__hozoEnv_motion_safe &&").count(),
        1,
        "{}",
        written.jsx
    );
    // A sibling outside the skeleton keeps its ordinary animation.
    let outside =
        compile(r#"<View><Skeleton className="h-4" /><View className="animate-spin" /></View>"#);
    assert!(
        !outside.jsx.contains("__hozoEnv_motion_safe"),
        "{}",
        outside.jsx
    );
    assert!(outside.jsx.contains("__hozoAnim_spin"), "{}", outside.jsx);
}

#[test]
fn line_breaking_is_a_text_prop_where_android_has_one_and_a_warning_where_not() {
    // `text-balance` used to stop the Native build as a Web-only error,
    // for a utility that only moves where lines fall.
    let compile = |element: &str| {
        let source = format!("import {{ Text, View }} from '@hozo/core'\nconst el = {element}\n");
        let parsed = hozo_parser::parse_tsx(&source);
        lower(&parsed.roots[0].node, &source, &Theme::default())
    };
    let balanced = compile(r#"<Text className="text-balance">x</Text>"#);
    assert!(
        balanced.jsx.contains(r#"textBreakStrategy="balanced""#),
        "{}",
        balanced.jsx
    );
    assert!(
        balanced.diagnostics.is_empty(),
        "{:?}",
        balanced.diagnostics
    );
    let pretty = compile(r#"<Text className="text-pretty">x</Text>"#);
    assert!(
        pretty.jsx.contains(r#"textBreakStrategy="highQuality""#),
        "{}",
        pretty.jsx
    );
    // `break-keep` is iOS's `hangul-word` for the Korean it covers, and still
    // reported for the Chinese and Japanese it does not, and for Android.
    let keep = compile(r#"<Text className="break-keep">x</Text>"#);
    assert!(
        keep.jsx.contains(r#"lineBreakStrategyIOS="hangul-word""#),
        "{}",
        keep.jsx
    );
    assert!(
        keep.diagnostics
            .iter()
            .any(|d| d.severity == hozo_ir::Severity::Warning && d.message.contains("Korean")),
        "{:?}",
        keep.diagnostics
    );
    assert!(!compile(r#"<View className="break-keep">x</View>"#)
        .jsx
        .contains("lineBreakStrategyIOS"));
    assert!(!compile(r#"<Text className="md:break-keep">x</Text>"#)
        .jsx
        .contains("lineBreakStrategyIOS"));

    for element in [
        r#"<Text className="break-keep">x</Text>"#,
        r#"<Text className="wrap-anywhere">x</Text>"#,
        r#"<Text className="[line-break:strict]">x</Text>"#,
        r#"<Text className="md:text-balance">x</Text>"#,
        r#"<View className="text-balance">x</View>"#,
    ] {
        let output = compile(element);
        assert!(
            !output.jsx.contains("textBreakStrategy"),
            "{element}: {}",
            output.jsx
        );
        assert!(
            !output.diagnostics.is_empty()
                && output
                    .diagnostics
                    .iter()
                    .all(|d| d.severity == hozo_ir::Severity::Warning),
            "{element}: {:?}",
            output.diagnostics
        );
    }
    // The platform's own behaviour already, so nothing to say.
    for element in [
        r#"<Text className="break-normal">x</Text>"#,
        r#"<Text className="text-wrap">x</Text>"#,
    ] {
        assert!(compile(element).diagnostics.is_empty(), "{element}");
    }
}

/// A radius only the project's theme defines (`--radius-hozo-control`),
/// which `@hozo/ui` writes on nearly every component.
#[test]
fn a_theme_radius_is_its_value_and_an_unknown_one_is_nothing() {
    let theme = Theme::default().with_radii(std::collections::HashMap::from([(
        "hozo-control".to_string(),
        8.0,
    )]));
    let compile = |class_name: &str| {
        let source = format!(
            "import {{ View }} from '@hozo/core'\nconst el = <View className=\"{class_name}\" />"
        );
        let parsed = hozo_parser::parse_tsx(&source);
        lower(&parsed.roots[0].node, &source, &theme)
    };

    let output = compile("rounded-hozo-control rounded-ss-hozo-control");
    assert!(
        output.styles.contains("borderRadius: 8,"),
        "{}",
        output.styles
    );
    assert!(
        output.styles.contains("borderStartStartRadius: 8,"),
        "{}",
        output.styles
    );
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);

    let output = compile("rounded-unknown");
    assert!(!output.styles.contains("Radius"), "{}", output.styles);
}

#[test]
fn standard_radius_scales_prefer_the_theme_with_unchanged_defaults() {
    for (name, fallback_px) in [
        ("xs", 2.0),
        ("sm", 4.0),
        ("md", 6.0),
        ("lg", 8.0),
        ("xl", 12.0),
        ("2xl", 16.0),
        ("3xl", 24.0),
        ("4xl", 32.0),
    ] {
        let source = format!(
            "import {{ View }} from '@hozo/core'; const el = <View className=\"rounded-{name}\" />"
        );
        let parsed = hozo_parser::parse_tsx(&source);
        let compile = |theme: &Theme| lower(&parsed.roots[0].node, &source, theme);
        let default = compile(&Theme::default());
        assert!(
            default
                .styles
                .contains(&format!("borderRadius: {fallback_px},")),
            "{}",
            default.styles
        );
        let same = Theme::default().with_radii(std::collections::HashMap::from([(
            name.to_string(),
            fallback_px,
        )]));
        assert_eq!(compile(&same).styles, default.styles);
        let themed = Theme::default()
            .with_radii(std::collections::HashMap::from([(name.to_string(), 10.0)]));
        let out = compile(&themed);
        assert!(out.styles.contains("borderRadius: 10,"), "{}", out.styles);
        assert!(out.diagnostics.is_empty(), "{:?}", out.diagnostics);
    }
}

#[test]
fn scale_overrides_reach_corners_but_not_fixed_or_arbitrary_radii() {
    let theme = Theme::default().with_radii(std::collections::HashMap::from([
        ("lg".to_string(), 10.0),
        ("sm".to_string(), 0.0),
        ("none".to_string(), 20.0),
        ("full".to_string(), 20.0),
    ]));
    let compile = |class_name: &str, theme: &Theme| {
        let source = format!(
            "import {{ View }} from '@hozo/core'; const el = <View className=\"{class_name}\" />"
        );
        let parsed = hozo_parser::parse_tsx(&source);
        lower(&parsed.roots[0].node, &source, theme)
    };
    let out = compile("rounded-t-lg rounded-ee-lg", &theme);
    for property in [
        "borderTopLeftRadius",
        "borderTopRightRadius",
        "borderEndEndRadius",
    ] {
        assert!(
            out.styles.contains(&format!("{property}: 10,")),
            "{}",
            out.styles
        );
    }
    assert!(compile("rounded-sm", &theme)
        .styles
        .contains("borderRadius: 0,"));
    for class_name in ["rounded", "rounded-none", "rounded-full", "rounded-[8px]"] {
        assert_eq!(
            compile(class_name, &theme).styles,
            compile(class_name, &Theme::default()).styles
        );
    }
}

/// A pressable whose label arrives as `children` hands its text styles to
/// `HozoPressable` rather than dropping them with a warning (#876); a View
/// has nothing to hand them to, and still says so.
#[test]
fn a_pressable_with_an_unseen_label_forwards_its_text_styles() {
    let source = "import { Button, View } from '@hozo/core'\nconst el = <Button disabled={off} className=\"bg-blue-500 text-white font-semibold disabled:text-gray-400\">{children}</Button>";
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.jsx.starts_with("<HozoPressable"), "{}", output.jsx);
    assert!(
        output.jsx.contains("hozoTextStyle={({ pressed, hovered, focused, focusVisible }) => [hozoStyles.hozo0_label, (off) && hozoStyles.hozo0_label_disabled]}"),
        "{}",
        output.jsx
    );
    assert!(
        output
            .styles
            .contains("hozo0_label: {\n    color: '#fff',\n    fontWeight: '600',"),
        "{}",
        output.styles
    );
    assert!(
        !output
            .styles
            .contains("hozo0: {\n    backgroundColor: '#2b7fff',\n    color"),
        "{}",
        output.styles
    );
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);

    // A Button with an `href` is a link, rendered through the same
    // `HozoPressable`, and its label is just as unseen.
    let source = "import { Button } from '@hozo/core'\nconst el = <Button href={to} className=\"bg-blue-500 text-white font-semibold\">{children}</Button>";
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(
        output
            .jsx
            .starts_with("<HozoLink hozoLinkComponent={HozoPressable}"),
        "{}",
        output.jsx
    );
    assert!(output.jsx.contains("hozoTextStyle={({ pressed, hovered, focused, focusVisible }) => [hozoStyles.hozo0_label]}"), "{}", output.jsx);
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);

    let source = "import { View } from '@hozo/core'\nconst el = <View className=\"text-white\">{children}</View>";
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(!output.jsx.contains("hozoTextStyle"), "{}", output.jsx);
    assert!(
        output
            .diagnostics
            .iter()
            .any(|d| d.message.contains("text styles are handed down")),
        "{:?}",
        output.diagnostics
    );
}
