use super::*;

#[test]
fn menu_retains_actual_button_and_div_classes_and_a_leaf_abi() {
    let source = r#"import { Menu } from '@hozo/core'; const el = <Menu trigger="Actions" items={items}
        className="enabled:opacity-50 disabled:opacity-25"
        triggerClassName="enabled:px-3 aria-expanded:border-2"
        itemClassName="disabled:opacity-25 enabled:opacity-50 aria-disabled:opacity-25" />"#;
    let parsed = hozo_parser::parse_tsx(source);
    let out = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(out.diagnostics.is_empty(), "{:?}", out.diagnostics);
    assert!(out.jsx.starts_with("<HozoMenu"), "{}", out.jsx);
    assert!(out.runtime_imports.contains(&"HozoMenu"));
    assert!(out.jsx.contains("triggerClassName="));
    assert!(out.jsx.contains("itemClassName="));
    assert!(!out.css.contains("data-hozo-disabled"), "{}", out.css);
    assert!(out.css.contains(":enabled"), "{}", out.css);
    let source = "import { Menu } from '@hozo/core'; const el = <Menu trigger=\"Actions\" items={[]} className={choose()} />";
    let parsed = hozo_parser::parse_tsx(source);
    let out = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(
        out.jsx
            .contains("hozo-candidate-owner hozo-candidate-slot-owner"),
        "{}",
        out.jsx
    );
}

#[test]
fn listbox_keeps_actual_div_selectors_and_its_runtime_abi() {
    let source = r#"import { Listbox } from '@hozo/core'; const el = <Listbox options={options}
        className="disabled:opacity-25 enabled:opacity-50"
        optionClassName="focus:opacity-50 aria-selected:border-2 aria-disabled:opacity-25 disabled:mt-8 enabled:mb-8" />"#;
    let parsed = hozo_parser::parse_tsx(source);
    let out = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(out.diagnostics.is_empty(), "{:?}", out.diagnostics);
    assert!(out.jsx.starts_with("<HozoListbox"), "{}", out.jsx);
    assert!(out.runtime_imports.contains(&"HozoListbox"));
    assert!(out.jsx.contains("optionClassName="));
    assert!(!out.css.contains("data-hozo-disabled"), "{}", out.css);
    assert!(out.css.contains(":disabled"), "{}", out.css);
    let source = "import { Listbox } from '@hozo/core'; const el = <Listbox options={[]} className={choose()} />";
    let parsed = hozo_parser::parse_tsx(source);
    let out = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(
        out.jsx
            .contains("hozo-candidate-owner hozo-candidate-slot-owner"),
        "{}",
        out.jsx
    );
}

#[test]
fn combobox_keeps_actual_owner_classes_and_its_runtime_abi() {
    let source = r#"import { Combobox } from '@hozo/core'; const el = <Combobox options={options}
        className="disabled:opacity-25 enabled:opacity-50 read-only:rounded-lg"
        inputClassName="focus:opacity-50 aria-expanded:border-2"
        listClassName="read-only:rounded-lg" optionClassName="aria-selected:border-2" />"#;
    let parsed = hozo_parser::parse_tsx(source);
    let out = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(out.diagnostics.is_empty(), "{:?}", out.diagnostics);
    assert!(out.jsx.starts_with("<HozoCombobox"), "{}", out.jsx);
    assert!(out.runtime_imports.contains(&"HozoCombobox"));
    assert!(out.jsx.contains("inputClassName="));
    assert!(out.jsx.contains("listClassName="));
    assert!(out.jsx.contains("optionClassName="));
    assert!(!out.css.contains("data-hozo-disabled"), "{}", out.css);
    assert!(out.css.contains(":disabled"), "{}", out.css);
    let source = "import { Combobox } from '@hozo/core'; const el = <Combobox options={[]} className={choose()} />";
    let parsed = hozo_parser::parse_tsx(source);
    let out = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(
        out.jsx
            .contains("hozo-candidate-owner hozo-candidate-slot-owner"),
        "{}",
        out.jsx
    );
}

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
        output.jsx.contains("{...hozoDomProps(rest)}"),
        "{}",
        output.jsx
    );
    assert!(
        output.runtime_imports.contains(&"hozoDomStyle"),
        "{:?}",
        output.runtime_imports
    );
    assert!(
        output.runtime_imports.contains(&"hozoDomProps"),
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
    assert!(!output.runtime_imports.contains(&"hozoDomProps"));
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
fn candidate_css_uses_the_real_tailwind_names() {
    // The classes a scan finds live somewhere the AST-based reader
    // can't see them, so the only thing that can match at runtime is
    // the name itself. No runtime code is involved: the browser's CSS
    // engine resolves it.
    let css =
        render_candidate_stylesheet(&["p-8".to_string(), "p-2".to_string()], &Theme::default());
    assert!(css.contains(".p-8 {"));
    assert!(css.contains(".p-2 {"));
    assert!(css.contains("padding-top: 32px;"));
    assert!(css.starts_with("@layer theme, base, components, utilities;"));
    assert!(css.contains("@layer utilities.hozo-candidates {"));
    assert!(css.contains(".p-8:where(.hozo-candidate-owner):not(hozo-none) {"));
}

#[test]
fn candidate_secondary_form_predicates_keep_real_owners_separate_from_portable_roots() {
    let names = [
        "p-2",
        "disabled:opacity-25",
        "enabled:px-3",
        "not-disabled:py-1",
        "not-enabled:mt-2",
        "md:disabled:opacity-50",
    ];
    let css = render_candidate_stylesheet(&names.map(str::to_string), &Theme::default());
    assert!(
        css.contains(":not(:where(.hozo-candidate-slot-owner))[data-hozo-disabled]"),
        "{css}"
    );
    assert!(
        css.contains(":where(.hozo-candidate-slot-owner):not(hozo-none):disabled"),
        "{css}"
    );
    assert!(
        css.contains(":where(.hozo-candidate-slot-owner):not(hozo-none):enabled"),
        "{css}"
    );
    assert!(
        css.contains(":where(.hozo-candidate-slot-owner):not(hozo-none):not(:disabled)"),
        "{css}"
    );
    assert!(
        css.contains(":where(.hozo-candidate-slot-owner):not(hozo-none):not(:enabled)"),
        "{css}"
    );
    assert!(
        !css.contains(".p-2:where(.hozo-candidate-slot-owner)"),
        "no extra unconditional rule: {css}"
    );
    for (source, marked) in [
        ("import {ColorPicker,cx} from '@hozo/core'; const el=<ColorPicker inputClassName={cx('p-2',classes)}/>", true),
        ("import {ColorPicker} from '@hozo/core'; const el=<ColorPicker inputClassName={classes}/>", true),
        ("import {ColorPicker} from '@hozo/core'; const el=<ColorPicker inputClassName=\"p-2\"/>", false),
        ("import {Pressable,cx} from '@hozo/core'; const el=<Pressable className={cx('p-2',classes)}/>", false),
    ] {
        let parsed=hozo_parser::parse_tsx(source);
        let output=lower(&parsed.roots[0].node,source,&Theme::default());
        assert_eq!(output.jsx.contains("hozo-candidate-slot-owner"),marked,"{}",output.jsx);
    }
}

#[test]
fn only_dynamic_class_targets_and_slots_get_candidate_ownership() {
    let source =
        "import { View, Chip } from '@hozo/core'; const el = <View className={`p-3 ${tone}`} />";
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(
        output
            .jsx
            .contains(".replace(/\\S/, 'hozo-candidate-owner $&')"),
        "{}",
        output.jsx
    );
    let source = "import { View } from '@hozo/core'; const el = <View className=\"p-3\" />";
    let parsed = hozo_parser::parse_tsx(source);
    assert!(!lower(&parsed.roots[0].node, source, &Theme::default())
        .jsx
        .contains("hozo-candidate-owner"));
    let source = "import { Chip } from '@hozo/core'; const el = <Chip label=\"Filter\" removeClassName={getClasses()} onRemove={remove} />";
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(
        output
            .jsx
            .contains("removeClassName={((value) => typeof value === 'string'"),
        "{}",
        output.jsx
    );
    assert_eq!(output.jsx.matches("getClasses()").count(), 1);
}

#[test]
fn a_candidate_whose_colour_names_nothing_is_not_a_utility() {
    // These are SVG presentation attributes and CSS property names,
    // and they reached a real stylesheet: React's DOM attribute table
    // carries `["accentHeight", "accent-height"]`, so any scan that
    // sees a bundle sees them. By shape they are utilities --
    // `accent-<colour>`, `fill-<colour>` -- and they compiled to a
    // reference to `--hozo-color-height`, which nothing defines.
    let names: Vec<String> = ["accent-height", "fill-opacity", "border-radius"]
        .iter()
        .map(|s| s.to_string())
        .collect();
    let css = render_candidate_stylesheet(&names, &Theme::default());
    assert_eq!(css, "", "{css}");
}

#[test]
fn a_candidate_whose_colour_the_theme_defines_survives() {
    // The other half of the rule, and the reason it is not simply "drop
    // unknown colours": a project token is unknown to the default
    // palette and is still a class the author uses.
    let theme = Theme::new(
        std::collections::HashMap::from([(
            "brand".to_string(),
            hozo_ir::ThemeColor {
                oklch: "oklch(0.7 0.2 30)".into(),
                hex: "#e05a2b".into(),
            },
        )]),
        None,
        false,
    );
    let names = vec!["bg-brand".to_string(), "accent-height".to_string()];
    let css = render_candidate_stylesheet(&names, &theme);
    assert!(css.contains(".bg-brand {"), "{css}");
    assert!(!css.contains("accent-height"), "{css}");
}

#[test]
fn a_paired_token_emits_its_dark_half_without_anybody_writing_dark() {
    // The whole point of pairing. Tailwind emits `var(--color-brand)` and
    // a project redefines the variable under `prefers-color-scheme`;
    // Hozo resolves the value into the rule, so redefining a variable it
    // never reads does nothing. This is the same ability, spelled the way
    // a compiler that inlines can spell it.
    let theme = paired_theme();
    let source =
        "import { View } from '@hozo/core'\nconst el = <View className=\"bg-brand p-4\">x</View>";
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &theme);
    assert!(
        output.css.contains("background-color: oklch(0.7 0.2 30)"),
        "{}",
        output.css
    );
    assert!(
        output.css.contains("@media (prefers-color-scheme: dark)"),
        "{}",
        output.css
    );
    assert!(
        output.css.contains("background-color: oklch(0.2 0.05 266)"),
        "{}",
        output.css
    );
    // The padding is in the light rule and has no business being repeated
    // in the dark one -- but it is, because the dark rule is the same
    // properties rendered again. Asserted so the cost is visible: a rule
    // built from one paired token carries whatever else was on it.
    assert_eq!(
        output.css.matches("padding-top: 16px").count(),
        2,
        "{}",
        output.css
    );
}

#[test]
fn a_utility_in_the_candidate_sheet_is_paired_too() {
    // The other path a class reaches the output by. A utility here is
    // written once and used by every element that names it, so pairing
    // one path and not the other would be the same class name behaving
    // two ways in one page -- which is how this was caught: the demo's
    // components had their dark rules and its stylesheet did not.
    let names = vec!["bg-brand".to_string()];
    let css = render_candidate_stylesheet(&names, &paired_theme());
    assert!(css.contains("oklch(0.7 0.2 30)"), "{css}");
    assert!(css.contains("@media (prefers-color-scheme: dark)"), "{css}");
    assert!(css.contains("oklch(0.2 0.05 266)"), "{css}");
}

#[test]
fn an_unpaired_token_emits_nothing_extra() {
    // What keeps this from doubling every stylesheet. A project with no
    // pairs renders exactly what it rendered before.
    let theme = Theme::new(
        std::collections::HashMap::from([(
            "brand".to_string(),
            hozo_ir::ThemeColor {
                oklch: "oklch(0.7 0.2 30)".into(),
                hex: "#e05a2b".into(),
            },
        )]),
        None,
        false,
    );
    let source =
        "import { View } from '@hozo/core'\nconst el = <View className=\"bg-brand\">x</View>";
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &theme);
    assert!(
        !output.css.contains("prefers-color-scheme"),
        "{}",
        output.css
    );
}

#[test]
fn the_dark_copy_of_a_conditional_rule_keeps_the_condition() {
    // The bug this test exists for shipped: the copy was emitted under
    // `Condition::Dark` rather than under the condition *and* dark, so the
    // dark half of `hover:bg-brand` lost its `:hover` and painted the
    // hover colour on every element carrying the class, in the dark,
    // always. The class list of every styled component in `@hozo/ui` has
    // a `hover:` in it.
    let theme = paired_theme();
    let source =
        "import { View } from '@hozo/core'\nconst el = <View className=\"hover:bg-brand\">x</View>";
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &theme);
    let dark = output
        .css
        .split("@media (prefers-color-scheme: dark)")
        .nth(1)
        .unwrap_or_default();
    assert!(
        dark.contains(":hover"),
        "the dark copy dropped the condition: {}",
        output.css
    );
    assert!(dark.contains("oklch(0.2 0.05 266)"), "{}", output.css);
}

#[test]
fn the_candidate_sheet_keeps_it_too() {
    // The same class, on the path a scanned name takes -- which is the
    // path `@hozo/ui` reaches a consumer's output by, so this is the half
    // that was visible in the demo's build.
    let css = render_candidate_stylesheet(&["hover:bg-brand".to_string()], &paired_theme());
    let dark = css
        .split("@media (prefers-color-scheme: dark)")
        .nth(1)
        .unwrap_or_default();
    assert!(
        dark.contains(":hover"),
        "the dark copy dropped the condition: {css}"
    );
}

#[test]
fn a_rule_that_already_mentions_dark_among_others_is_not_doubled_either() {
    // `dark:hover:bg-brand` is not `Condition::Dark`, and an equality
    // check said it was not about dark mode at all -- so it was given a
    // copy, and resolved its colour against the *light* palette.
    let theme = paired_theme();
    let source = "import { View } from '@hozo/core'\nconst el = <View className=\"dark:hover:bg-brand\">x</View>";
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &theme);
    assert_eq!(
        output.css.matches("prefers-color-scheme").count(),
        1,
        "{}",
        output.css
    );
    assert!(output.css.contains("oklch(0.2 0.05 266)"), "{}", output.css);
    assert!(!output.css.contains("oklch(0.7 0.2 30)"), "{}", output.css);
}

#[test]
fn a_class_the_author_marked_dark_is_not_doubled() {
    // `dark:bg-brand` is a rule that exists only in dark mode. Rendering
    // a dark copy of it would say the same thing twice, and the copy
    // would win on a tie.
    let theme = paired_theme();
    let source =
        "import { View } from '@hozo/core'\nconst el = <View className=\"dark:bg-brand\">x</View>";
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &theme);
    assert_eq!(
        output.css.matches("prefers-color-scheme").count(),
        1,
        "{}",
        output.css
    );
}

/// One token with both halves, for the three tests above.
fn paired_theme() -> Theme {
    Theme::with_dark(
        std::collections::HashMap::from([(
            "brand".to_string(),
            hozo_ir::ThemeColor {
                oklch: "oklch(0.7 0.2 30)".into(),
                hex: "#e05a2b".into(),
            },
        )]),
        std::collections::HashMap::from([(
            "brand".to_string(),
            hozo_ir::ThemeColor {
                oklch: "oklch(0.2 0.05 266)".into(),
                hex: "#0f172b".into(),
            },
        )]),
        None,
        false,
    )
}

#[test]
fn an_authored_class_keeps_its_unresolved_colour_reference() {
    // The looseness is deliberate where the author wrote the class:
    // the token may be defined in a stylesheet Hozo was never given,
    // and a dangling reference beats dropping a style someone asked
    // for. Only the *scanned* path treats it as evidence of a non-class.
    let source = r#"
        import { View } from '@hozo/core'
        const el = <View className="bg-unknowable" />
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(
        output.css.contains("var(--hozo-color-unknowable)"),
        "{}",
        output.css
    );
}

#[test]
fn candidate_css_is_not_emitted_per_file() {
    // Per-file lowering compiles everything readable into scoped rules
    // and stops there -- the candidate set is project-wide, so shipping
    // it from `lower` would put a copy in every file that needs any of
    // it.
    let source = r#"
        import { View } from '@hozo/core'
        import { cn } from 'clsx'
        const el = <View className={cn('p-4', getDynamic())} />
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.css.contains(".hozo-0 {"), "{}", output.css);
    assert!(!output.css.contains(".p-4 {"), "{}", output.css);
}

#[test]
fn candidate_variant_classes_are_escaped_in_the_selector() {
    // `hover:bg-blue-500` contains selector syntax and has to be
    // written `.hover\:bg-blue-500:hover` to match literally.
    let css = render_candidate_stylesheet(&["hover:bg-blue-500".to_string()], &Theme::default());
    assert!(css.contains(r".hover\:bg-blue-500:hover {"));
}

#[test]
fn unrecognized_candidates_are_skipped() {
    // Scanning is imprecise by design, so the stylesheet has to
    // tolerate tokens that only looked like classes.
    let css = render_candidate_stylesheet(
        &["useState".to_string(), "p-4".to_string()],
        &Theme::default(),
    );
    assert!(css.contains(".p-4 {"));
    assert!(!css.contains("useState"));
}

#[test]
fn children_the_compiler_cannot_read_are_carried_and_their_primitives_still_compile() {
    // Until 2026-08-15 every one of these vanished from the output with
    // no diagnostic. Now the *expression* is carried untouched while
    // the primitives inside it compile exactly as top-level ones do.
    let source = r#"
        import { View, Text } from '@hozo/core'
        export function C({ show, items, name }) {
          return (
            <View className="p-4">
              <ProfilePicture />
              {show && <Text className="text-xl">hi</Text>}
              {items.map((i) => <Text key={i} className="p-2">{i}</Text>)}
              <Text>Hello {name}</Text>
            </View>
          )
        }
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());

    // Carried, not interpreted: the guard and the callback survive.
    assert!(output.jsx.contains("{show && "), "{}", output.jsx);
    assert!(output.jsx.contains("{items.map((i) => "), "{}", output.jsx);
    assert!(output.jsx.contains("<ProfilePicture />"), "{}", output.jsx);
    // ...while the primitives inside them are fully lowered.
    assert!(!output.jsx.contains("<Text"), "{}", output.jsx);
    assert!(output.css.contains("font-size: 20px;"), "{}", output.css);
    assert!(output.css.contains("padding-top: 8px;"), "{}", output.css);
    // Text and expression keep their order.
    assert!(output.jsx.contains(">Hello {name}<"), "{}", output.jsx);
}

#[test]
fn flat_list_keeps_its_web_renderer_and_compiles_the_render_item_body() {
    let source = r#"
        import { FlatList, Text } from '@hozo/core'
        const el = <FlatList className="h-40" data={rows}
          renderItem={({ item }) => <Text className="p-2">{item}</Text>} />
    "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(
        output.jsx.starts_with("<HozoFlatList className=\"hozo-0\""),
        "{}",
        output.jsx
    );
    assert!(output.runtime_imports.contains(&"HozoFlatList"));
    assert!(
        output
            .jsx
            .contains("renderItem={({ item }) => <span className=\"hozo-1\">{item}</span>}"),
        "{}",
        output.jsx
    );
    assert!(output.css.contains("height: 160px"), "{}", output.css);
    assert!(output.css.contains("padding-top: 8px"), "{}", output.css);
}

#[test]
fn flat_list_keeps_refresh_columns_and_pagination_props_for_its_web_runtime() {
    let source = r#"
        import { FlatList, Text } from '@hozo/core'
        const el = <FlatList data={rows} horizontal={horizontal} numColumns={2}
          refreshing={loading} onRefresh={reload}
          onEndReached={loadMore} onEndReachedThreshold={0.5}
          showsHorizontalScrollIndicator={false}
          ListEmptyComponent={<Text className="p-2">Empty</Text>}
          renderItem={({ item }) => <Text>{item}</Text>} />
    "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.jsx.starts_with("<HozoFlatList"), "{}", output.jsx);
    assert!(output.runtime_imports.contains(&"HozoFlatList"));
    assert!(
        output.jsx.contains(" horizontal={horizontal}"),
        "{}",
        output.jsx
    );
    assert!(
        output
            .jsx
            .contains(" refreshing={loading} onRefresh={reload}"),
        "{}",
        output.jsx
    );
    assert!(
        output
            .jsx
            .contains(" showsHorizontalScrollIndicator={false}"),
        "{}",
        output.jsx
    );
    assert!(output.jsx.contains("numColumns={2}"), "{}", output.jsx);
    assert!(
        output.jsx.contains("onEndReached={loadMore}"),
        "{}",
        output.jsx
    );
    assert!(
        output.jsx.contains("onEndReachedThreshold={0.5}"),
        "{}",
        output.jsx
    );
    assert!(
        output
            .jsx
            .contains("ListEmptyComponent={<span className=\"hozo-1\">Empty</span>}"),
        "{}",
        output.jsx
    );
}

#[test]
fn scroll_view_refresh_uses_the_accessible_web_fallback() {
    let source = r#"
        import { ScrollView, Text } from '@hozo/core'
        const el = <ScrollView className="h-40" horizontal={wide}
          refreshing={loading} onRefresh={reload}
          keyboardShouldPersistTaps="handled"
          showsHorizontalScrollIndicator={false}
          accessibilityLabel="Results">
          <Text>row</Text>
        </ScrollView>
    "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(
        output
            .jsx
            .starts_with("<HozoScrollView className=\"hozo-scroll-view hozo-0\""),
        "{}",
        output.jsx
    );
    assert!(output.runtime_imports.contains(&"HozoScrollView"));
    assert!(output.jsx.contains(" horizontal={wide}"), "{}", output.jsx);
    assert!(
        output
            .jsx
            .contains(" refreshing={loading} onRefresh={reload}"),
        "{}",
        output.jsx
    );
    assert!(
        output
            .jsx
            .contains(" keyboardShouldPersistTaps={\"handled\"}"),
        "{}",
        output.jsx
    );
    assert!(
        output
            .jsx
            .contains(" showsHorizontalScrollIndicator={false}"),
        "{}",
        output.jsx
    );
    assert!(
        output.jsx.contains(" accessibilityLabel={\"Results\"}"),
        "{}",
        output.jsx
    );
    assert!(!output.jsx.contains("aria-label"), "{}", output.jsx);
}

#[test]
fn scroll_view_with_a_nested_refresh_control_reaches_the_runtime_that_reads_it() {
    // React Native's spelling: the control as an element in a prop. A
    // `div` took it as an unknown DOM attribute and drew nothing.
    let source = r#"
        import { RefreshControl, ScrollView, Text } from '@hozo/core'
        const el = <ScrollView
          refreshControl={<RefreshControl refreshing={busy} onRefresh={reload} />}>
          <Text>row</Text>
        </ScrollView>
    "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.jsx.starts_with("<HozoScrollView "), "{}", output.jsx);
    assert!(
        output
            .jsx
            .contains("refreshControl={<HozoRefreshControl refreshing={busy} onRefresh={reload}>"),
        "{}",
        output.jsx
    );
    assert!(output.runtime_imports.contains(&"HozoScrollView"));
    assert!(output.runtime_imports.contains(&"HozoRefreshControl"));
}

#[test]
fn scroll_view_without_refresh_stays_zero_runtime_and_hides_its_active_indicator() {
    let source = r#"
        import { ScrollView } from '@hozo/core'
        const el = <ScrollView horizontal={wide}
          showsHorizontalScrollIndicator={showHorizontal}
          showsVerticalScrollIndicator={showVertical} />
    "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(
        output
            .jsx
            .starts_with("<div className=\"hozo-scroll-view\""),
        "{}",
        output.jsx
    );
    assert!(
        output
            .jsx
            .contains("data-hozo-horizontal={wide ? '' : undefined}"),
        "{}",
        output.jsx
    );
    assert!(output.jsx.contains("data-hozo-hide-scrollbar={(wide ? !(showHorizontal) : !(showVertical)) ? '' : undefined}"), "{}", output.jsx);
    assert!(
        output.css.contains("scrollbar-width: none"),
        "{}",
        output.css
    );
    assert!(output.css.contains("::-webkit-scrollbar"), "{}", output.css);
}

#[test]
fn universal_native_props_lower_to_dom_identity_pointer_and_aria() {
    let source = r#"
        import { View } from '@hozo/core'
        const el = <View testID="card" nativeID="result-card" pointerEvents="box-none"
          accessibilityState={{ disabled, selected: true, busy }}
          accessibilityValue={{ min: 0, max: 10, now: progress, text: label }}
          accessibilityLiveRegion="polite" />
    "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(
        output.jsx.starts_with("<div className=\"hozo-view\""),
        "{}",
        output.jsx
    );
    assert!(
        output.jsx.contains("data-testid={\"card\"}"),
        "{}",
        output.jsx
    );
    assert!(
        output.jsx.contains("id={\"result-card\"}"),
        "{}",
        output.jsx
    );
    assert!(
        output
            .jsx
            .contains("data-hozo-pointer-events={\"box-none\"}"),
        "{}",
        output.jsx
    );
    assert!(
        output
            .jsx
            .contains("aria-disabled={({ disabled, selected: true, busy }).disabled}"),
        "{}",
        output.jsx
    );
    assert!(
        output
            .jsx
            .contains("aria-valuenow={({ min: 0, max: 10, now: progress, text: label }).now}"),
        "{}",
        output.jsx
    );
    assert!(
        output
            .jsx
            .contains("aria-live={\"polite\" === 'none' ? undefined : \"polite\"}"),
        "{}",
        output.jsx
    );
    assert!(
        output
            .css
            .contains("[data-hozo-pointer-events='box-none'] > *"),
        "{}",
        output.css
    );
}

#[test]
fn on_layout_selects_the_core_adapter_only_for_the_measured_node() {
    let source = r#"
        import { View, Text } from '@hozo/core'
        const el = <View onLayout={measure} testID="measured"><Text>child</Text></View>
    "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(
        output.jsx.starts_with("<HozoView className=\"hozo-view\""),
        "{}",
        output.jsx
    );
    assert_eq!(output.runtime_imports, vec!["HozoView"]);
    assert!(
        output
            .jsx
            .contains("testID={\"measured\"} onLayout={measure}"),
        "{}",
        output.jsx
    );
    assert!(output.jsx.contains("<span>child</span>"), "{}", output.jsx);
}

#[test]
fn responder_callbacks_select_the_pointer_bridge_only_for_interactive_nodes() {
    let source = r#"
        import { View, Pressable } from '@hozo/core'
        const el = <View onStartShouldSetResponder={wantStart}
          onStartShouldSetResponderCapture={captureStart}
          onMoveShouldSetResponder={wantMove}
          onMoveShouldSetResponderCapture={captureMove}
          onResponderGrant={grant} onResponderStart={start}
          onResponderMove={move} onResponderEnd={end}
          onResponderRelease={release} onResponderReject={reject}
          onResponderTerminate={terminate}
          onResponderTerminationRequest={allowTermination}>
            <Pressable accessibilityRole="button" disabled={locked}
              onPress={save} onResponderGrant={pressGrant} />
        </View>
    "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(
        output.jsx.starts_with("<HozoView className=\"hozo-view\""),
        "{}",
        output.jsx
    );
    assert_eq!(output.runtime_imports, vec!["HozoView"]);
    for expected in [
        "onStartShouldSetResponder={wantStart}",
        "onStartShouldSetResponderCapture={captureStart}",
        "onMoveShouldSetResponder={wantMove}",
        "onMoveShouldSetResponderCapture={captureMove}",
        "onResponderGrant={grant}",
        "onResponderStart={start}",
        "onResponderMove={move}",
        "onResponderEnd={end}",
        "onResponderRelease={release}",
        "onResponderReject={reject}",
        "onResponderTerminate={terminate}",
        "onResponderTerminationRequest={allowTermination}",
    ] {
        assert!(
            output.jsx.contains(expected),
            "missing {expected}: {}",
            output.jsx
        );
    }
    assert!(
        output
            .jsx
            .contains("<Pressable accessibilityRole=\"button\""),
        "{}",
        output.jsx
    );
    assert!(output.jsx.contains("onPress={save}"), "{}", output.jsx);
    assert!(output.jsx.contains("disabled={locked}"), "{}", output.jsx);
    assert!(!output.jsx.contains("onClick={save}"), "{}", output.jsx);
}

#[test]
fn pan_responder_handler_spreads_select_the_web_bridge() {
    let source = r#"
        import { View } from '@hozo/core'
        import { PanResponder } from '@hozo/rn-compat'
        const pan = PanResponder.create({ onMoveShouldSetPanResponder: () => true })
        const el = <View className="p-4" {...pan.panHandlers} />
    "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(
        output
            .jsx
            .starts_with("<HozoView className=\"hozo-view hozo-0\""),
        "{}",
        output.jsx
    );
    assert_eq!(output.runtime_imports, vec!["HozoView"]);
    assert!(
        output.jsx.contains("{...pan.panHandlers}"),
        "{}",
        output.jsx
    );
}

#[test]
fn structured_and_fallback_image_sources_select_the_web_normalizer() {
    let source = r#"
        import { Image } from '@hozo/core'
        const el = <Image src={{ uri: remote }} defaultSource={assetModule} alt="Cover" />
    "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.jsx.starts_with("<Image "), "{}", output.jsx);
    assert!(
        output.jsx.contains("src={{ uri: remote }}"),
        "{}",
        output.jsx
    );
    assert!(
        output.jsx.contains("defaultSource={assetModule}"),
        "{}",
        output.jsx
    );
    assert!(output.jsx.contains("alt={\"Cover\"}"), "{}", output.jsx);
}

#[test]
fn scroll_events_select_the_bridge_and_keep_the_native_contract() {
    let source = r#"
        import { ScrollView, Text } from '@hozo/core'
        const el = <ScrollView onScroll={remember} scrollEventThrottle={16}><Text>row</Text></ScrollView>
    "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(
        output
            .jsx
            .starts_with("<HozoScrollView className=\"hozo-scroll-view\""),
        "{}",
        output.jsx
    );
    assert!(output.runtime_imports.contains(&"HozoScrollView"));
    assert!(
        output
            .jsx
            .contains("onScroll={remember} scrollEventThrottle={16}"),
        "{}",
        output.jsx
    );
}

#[test]
fn only_the_unresolvable_leaf_falls_back() {
    // proposal §7's three tiers in one className: a literal compiles
    // away, a guarded literal becomes a conditional rule, and only the
    // opaque call is passed through.
    let source = r#"
        import { View } from '@hozo/core'
        import { cn } from 'clsx'
        const el = <View className={cn('p-4', active && 'text-xl', getDynamic())} />
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());

    assert!(output.css.contains("padding-top: 16px;"));
    assert!(output.css.contains("font-size: 20px;"));
    assert!(output.jsx.contains("getDynamic()"));
    // The parts that did compile aren't repeated in the fallback.
    assert!(!output.jsx.contains("'p-4'"));
}

#[test]
fn space_x_becomes_a_child_scoped_rule() {
    // `space-*` is the one utility that styles the element's children
    // rather than the element, so it can't be a declaration on the
    // node's own rule.
    let source = r#"
        import { View } from '@hozo/core'
        const el = <View className="space-x-2" />
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.css.contains(":where(.hozo-0 > :not(:last-child)) {"));
    assert!(output.css.contains("margin-inline-end: 8px;"));
    // Not on the element itself.
    assert!(!output.css.contains(".hozo-0 { margin-inline-end"));
}

/// Compiles one element with `classes` and returns its CSS.
fn css_for(classes: &str) -> String {
    let source = format!(
        "import {{ View }} from '@hozo/core'\nconst el = <View className=\"{classes}\" />\n"
    );
    let parsed = hozo_parser::parse_tsx(&source);
    lower(&parsed.roots[0].node, &source, &Theme::default()).css
}

#[test]
fn stylesheets_are_laid_out_for_reading() {
    // What the REPL shows and what lands in a `.hozo.css`. The base rule
    // used to open `:where(.hozo-view) { display: flex;` -- a Rust line
    // continuation after `{ ` swallowed the newline -- and a query's
    // rules sat at the query's own indentation.
    let css = css_for("p-4 md:hover:p-8");
    assert!(
        css.contains(":where(.hozo-view) {\n    display: flex;\n"),
        "{css}"
    );
    assert!(
        css.contains(
            "@media (width >= 768px) {\n  @media (hover: hover) {\n    .hozo-0:hover {\n      padding-top: 32px;\n"
        ),
        "{css}"
    );
    assert!(!css.contains("{ display"), "{css}");
}

#[test]
fn the_translate_axes_share_one_declaration() {
    // CSS `translate` is one property taking up to three values. Until
    // 2026-08-15 each axis emitted its own `translate:`, so this pair
    // wrote two declarations and last-wins threw the x away. The
    // conformance suite can't see it -- it compiles one utility at a
    // time, and each was correct alone.
    assert!(css_for("translate-x-4").contains("translate: 16px 0;"));
    assert!(css_for("translate-y-8").contains("translate: 0 32px;"));
    let css = css_for("translate-x-4 translate-y-8");
    assert!(css.contains("translate: 16px 32px;"), "{css}");
    assert_eq!(css.matches("translate:").count(), 1, "{css}");
}

#[test]
fn responsive_text_defaults_read_the_explicit_leading_register() {
    for classes in [
        "text-lg sm:text-xl leading-relaxed",
        "leading-relaxed sm:text-xl text-lg",
    ] {
        let css = css_for(classes);
        assert!(css.contains("--tw-leading: 1.625;"), "{css}");
        assert!(
            css.contains("line-height: var(--tw-leading, 28px);"),
            "{css}"
        );
        assert!(css.contains("@property --tw-leading"), "{css}");
        assert!(css.contains("inherits: false"), "{css}");
    }
    let sheet = render_candidate_stylesheet(
        &["text-xl".to_string(), "leading-relaxed".to_string()],
        &Theme::default(),
    );
    assert_eq!(sheet.matches("@property --tw-leading").count(), 1);
    assert!(sheet.contains("--tw-leading: 1.625;"));
}

#[test]
fn scrollbar_thumb_and_track_share_one_declaration() {
    // `scrollbar-color` takes both halves at once, so writing only one
    // still has to name the other -- Tailwind's registers default to
    // transparent, not to the UA's own colours.
    assert!(css_for("scrollbar-thumb-red-500")
        .contains("scrollbar-color: oklch(63.7% 0.237 25.331) #0000;"));
    assert!(css_for("scrollbar-track-blue-500")
        .contains("scrollbar-color: #0000 oklch(62.3% 0.214 259.815);"));

    let css = css_for("scrollbar-thumb-red-500 scrollbar-track-blue-500");
    assert!(
        css.contains("scrollbar-color: oklch(63.7% 0.237 25.331) oklch(62.3% 0.214 259.815);"),
        "{css}"
    );
}

#[test]
fn mask_utilities_compose_into_one_resolved_layer_list() {
    // Tailwind assembles `mask-image` from `--tw-mask-*` registers, so
    // several utilities contribute to one declaration. The conformance
    // suite only ever compiles one at a time, so the combinations are
    // pinned here instead.
    let css = css_for("mask-x-from-4 mask-x-to-80%");
    assert!(
        css.contains(
            "mask-image: linear-gradient(to left, black 16px, transparent 80%), \
             linear-gradient(to right, black 16px, transparent 80%), \
             linear-gradient(#fff, #fff), linear-gradient(#fff, #fff), \
             linear-gradient(#fff, #fff), linear-gradient(#fff, #fff);"
        ),
        "{css}"
    );

    // An angle and a stop land in the same gradient.
    let css = css_for("mask-linear-45 mask-linear-from-red-500");
    assert!(
        css.contains(
            "mask-image: linear-gradient(45deg, oklch(63.7% 0.237 25.331) 0%, \
             transparent 100%), linear-gradient(#fff, #fff), linear-gradient(#fff, #fff);"
        ),
        "{css}"
    );

    // The radial shaping utilities paint nothing alone but change the
    // gradient another utility supplies.
    let css = css_for("mask-radial-from-4 mask-circle mask-radial-at-top");
    assert!(
        css.contains("radial-gradient(circle farthest-corner at top, "),
        "{css}"
    );
}

#[test]
fn a_mask_composite_alone_emits_no_layer_list() {
    // `mask-add` with nothing to composite is just the composite mode;
    // emitting a fully-opaque `mask-image` would be a no-op declaration
    // Tailwind doesn't write either.
    let css = css_for("mask-add");
    assert!(css.contains("mask-composite: add;"), "{css}");
    assert!(!css.contains("mask-image"), "{css}");
}

#[test]
fn radial_shaping_alone_paints_nothing() {
    assert!(!css_for("mask-circle").contains("mask-image"));
}

#[test]
fn placeholder_colour_scopes_itself_to_the_pseudo_element() {
    // The conformance suite cannot catch this: it compares
    // declarations, and the difference between tinting the placeholder
    // and tinting the real text lives entirely in the selector. Emitted
    // as a plain `color` this would score a false match while doing the
    // wrong thing.
    let css = css_for("placeholder-red-500");
    assert!(css.contains(".hozo-0::placeholder {"), "{css}");
    assert!(!css.contains(".hozo-0 {"), "{css}");
}

#[test]
fn divide_becomes_a_child_scoped_rule_like_space() {
    // `divide-*` styles the gaps *between* children, so like `space-*`
    // it can't be a declaration on the element itself.
    let css = css_for("divide-y-4");
    assert!(
        css.contains(":where(.hozo-0 > :not(:last-child)) {"),
        "{css}"
    );
    // Tailwind writes both edges, zeroing the leading one, so
    // `divide-*-reverse` can flip which edge carries the border without
    // a different rule -- matched here so the output stays identical.
    assert!(css.contains("border-top-width: 0;"), "{css}");
    assert!(css.contains("border-bottom-width: 4px;"), "{css}");
}

#[test]
fn outline_width_carries_a_style_so_it_actually_renders() {
    // Same reason border widths do: CSS defaults `outline-style` to
    // `none`, so a width alone shows nothing.
    let css = css_for("outline-2");
    assert!(css.contains("outline-style: solid;"), "{css}");
    assert!(css.contains("outline-width: 2px;"), "{css}");
}

#[test]
fn ring_and_shadow_compose_into_one_box_shadow() {
    // The whole point of keeping these as separate IR properties. A
    // single `BoxShadow` would make the later utility win under
    // `dedupe_last_wins`, and the conformance suite can't catch it --
    // it compares one utility at a time, and a ring colour paints
    // nothing on its own.
    let css = css_for("ring-2 ring-blue-500 shadow-lg");
    assert!(
        css.contains(
            "box-shadow: 0 0 0 2px oklch(62.3% 0.214 259.815), \
             0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);"
        ),
        "{css}"
    );
}

#[test]
fn a_ring_defaults_to_currentcolor_and_stacks_inside_out() {
    // Tailwind's default ring colour, and its layer order: inset ring
    // before ring before shadow.
    let css = css_for("inset-ring-4 ring-2");
    assert!(
        css.contains("box-shadow: inset 0 0 0 4px currentcolor, 0 0 0 2px currentcolor;"),
        "{css}"
    );
}

#[test]
fn shadow_none_clears_the_shadow_without_taking_the_ring_with_it() {
    assert!(css_for("shadow-none").contains("box-shadow: none;"));
    // `none` as the whole declaration would erase the ring too, which
    // is not what Tailwind's register-clearing does.
    let css = css_for("shadow-none ring-2");
    assert!(css.contains("box-shadow: 0 0 0 2px currentcolor;"), "{css}");
}

#[test]
fn a_ring_colour_alone_paints_nothing() {
    // Correct, not a gap: there is no width to paint. Tailwind emits
    // only a custom property here for the same reason.
    assert!(!css_for("ring-blue-500").contains("box-shadow"));
}

#[test]
fn animation_emits_its_keyframes_once() {
    let source = r#"
        import { View, Text } from '@hozo/core'
        const el = (
          <View className="animate-spin">
            <Text className="animate-spin">x</Text>
          </View>
        )
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.css.contains("animation: spin 1s linear infinite;"));
    // An `animation` declaration is inert without its keyframes, and
    // two users of the same animation must not duplicate the block.
    assert_eq!(output.css.matches("@keyframes spin").count(), 1);
}

#[test]
fn unmodeled_props_and_spreads_reach_the_output() {
    let source = r#"
        import { View } from '@hozo/core'
        const el = <View className="p-4" {...rest} onLayout={onLayout} testID="row" />
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.jsx.contains("{...rest}"));
    assert!(output.jsx.contains("onLayout={onLayout}"));
    assert!(output.jsx.starts_with("<HozoView "), "{}", output.jsx);
    assert_eq!(output.runtime_imports, vec!["HozoView"]);
    assert!(output.jsx.contains(r#"testID={"row"}"#));
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
    assert!(!output.jsx.contains("aria-disabled"));
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
    assert!(
        output.jsx.contains("(small) && 'hozo-cond-"),
        "{}",
        output.jsx
    );
    assert!(!output.jsx.contains("data-hozo-cond"), "{}", output.jsx);
}

#[test]
fn semantic_boxes_keep_the_shared_base_and_explicit_overrides() {
    for primitive in [
        "Section",
        "Article",
        "Nav",
        "Main",
        "Header",
        "Footer",
        "Aside",
        "Search",
        "Figure",
        "Address",
        "Fieldset",
        "TermList",
        "Description",
        "List",
        "ListItem",
        "Skeleton",
    ] {
        let source = format!("import {{ {primitive} }} from '@hozo/core'; const el = <{primitive} className=\"flex-row shrink m-2 p-2 border-2\">x</{primitive}>");
        let parsed = hozo_parser::parse_tsx(&source);
        let out = lower(&parsed.roots[0].node, &source, &Theme::default());
        assert!(out.jsx.contains("hozo-view"), "{primitive}: {}", out.jsx);
        assert!(out.css.contains(VIEW_BASE_CSS), "{primitive}: {}", out.css);
        assert!(
            out.css.contains("flex-direction: row"),
            "{primitive}: {}",
            out.css
        );
        assert!(
            out.css.contains("flex-shrink: 1"),
            "{primitive}: {}",
            out.css
        );
        assert!(out.css.contains("@layer base"), "{primitive}: {}", out.css);
        assert!(
            out.diagnostics.is_empty(),
            "{primitive}: {:?}",
            out.diagnostics
        );
    }
}

#[test]
fn semantic_primitives_lower_to_native_html_elements() {
    let source = r#"
        import { Section, Heading, Paragraph } from '@hozo/core'
        const el = <Section><Heading level={2}>Title</Heading><Paragraph>Body</Paragraph></Section>
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert_eq!(
        output.jsx,
        "<section className=\"hozo-view\"><h2>Title</h2><p>Body</p></section>"
    );
}

#[test]
fn typography_primitives_lower_to_semantic_html_elements() {
    let source = r#"
        import { Paragraph, Strong, Emphasis, Underline, Strikethrough, Sub, Sup, Code, Small, Mark, NoBreak, Ruby, RubyText } from '@hozo/core'
        const el = (
            <Paragraph>
                <Strong>bold</Strong>
                <Emphasis>italic</Emphasis>
                <Underline>underlined</Underline>
                <Strikethrough>deleted</Strikethrough>
                <Sub>sub</Sub>
                <Sup>sup</Sup>
                <Code>const x = 1</Code>
                <Small>fine print</Small>
                <Mark>highlight</Mark>
                <NoBreak>100 km/h</NoBreak>
                <Ruby>漢字<RubyText>かんじ</RubyText></Ruby>
            </Paragraph>
        )
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert_eq!(
        output.jsx,
        "<p><strong>bold</strong><em>italic</em><u>underlined</u><s>deleted</s><sub>sub</sub><sup>sup</sup><code>const x = 1</code><small>fine print</small><mark>highlight</mark><span style={{ whiteSpace: 'nowrap' }}>100 km/h</span><ruby>漢字<rt>かんじ</rt></ruby></p>"
    );
}

#[test]
fn preformatted_lowers_to_pre_and_keeps_its_text_as_written() {
    // The whitespace is in a string expression, which JSX leaves alone,
    // and the compiler must carry it the same way.
    let source = r#"
        import { Preformatted, Code } from '@hozo/core'
        const el = <Preformatted><Code>{'a\n  b'}</Code></Preformatted>
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert_eq!(output.jsx, "<pre><code>{'a\\n  b'}</code></pre>");
}

#[test]
fn a_preformatted_block_inside_a_paragraph_is_a_nesting_warning() {
    // `<pre>` is flow content and a `<p>` holds phrasing content only; the
    // browser would close the paragraph before it.
    let source = r#"
        import { Paragraph, Preformatted } from '@hozo/core'
        const el = <Paragraph><Preformatted>x</Preformatted></Paragraph>
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    assert!(
        parsed
            .diagnostics
            .iter()
            .any(|d| d.code == hozo_ir::DiagnosticCode::InvalidSemanticNesting),
        "{:?}",
        parsed.diagnostics
    );
}

#[test]
fn landmark_primitives_lower_to_semantic_html_elements() {
    let source = r#"
        import { Main, Header, Footer, Aside, Search, Figure, Figcaption, Time, Address } from '@hozo/core'
        const el = (
            <Main>
                <Header>Banner</Header>
                <Aside>Sidebar</Aside>
                <Search>Searchbox</Search>
                <Figure>
                    <Figcaption>Caption</Figcaption>
                </Figure>
                <Time>2026-09-02</Time>
                <Address>Contact</Address>
                <Footer>Footer</Footer>
            </Main>
        )
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert_eq!(
        output.jsx,
        "<main className=\"hozo-view\"><header className=\"hozo-view\">Banner</header><aside className=\"hozo-view\">Sidebar</aside><search className=\"hozo-view\">Searchbox</search><figure className=\"hozo-view\"><figcaption>Caption</figcaption></figure><time>2026-09-02</time><address className=\"hozo-view\">Contact</address><footer className=\"hozo-view\">Footer</footer></main>"
    );
}

#[test]
fn structural_form_and_disclosure_primitives_lower_to_semantic_html_elements() {
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
    assert_eq!(
        output.jsx,
        "<fieldset className=\"hozo-view\"><legend>Options</legend><details><summary>More</summary><dl className=\"hozo-view\"><dt>Term</dt><dd className=\"hozo-view\">Detail</dd><dt>CompoundTerm</dt><dd className=\"hozo-view\">CompoundDetail</dd></dl></details></fieldset>"
    );
}

#[test]
fn separator_and_link_lower_to_html_primitives() {
    let source = r#"
        import { View } from '@hozo/core'
        import { Separator } from '@hozo/semantics'
        import { Link } from '@hozo/typography'
        const el = (
            <View>
                <Link href="https://example.com">Visit</Link>
                <Separator />
            </View>
        )
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert_eq!(
        output.jsx,
        "<div className=\"hozo-view\"><a href=\"https://example.com\">Visit</a><hr /></div>"
    );
}

/// A rule's own two props, which the DOM has no meaning for.
///
/// `decorative` and `orientation` are Hozo's spellings. Both used to
/// reach `<hr>` verbatim -- attributes nothing reads -- while the two
/// things they are for went unsaid: a decorative rule was still
/// announced as a separator, and a vertical one never said which way
/// it ran. The uncompiled fallback has always emitted both (#309).
#[test]
fn a_separator_says_what_its_props_mean() {
    let cases = [
        (r#"<Separator />"#, "<hr />"),
        (
            r#"<Separator decorative />"#,
            r#"<hr role="none" aria-hidden={true} />"#,
        ),
        (
            r#"<Separator orientation="vertical" />"#,
            r#"<hr aria-orientation="vertical" />"#,
        ),
    ];
    for (element, expected) in cases {
        let source = format!(
            "import {{ Separator }} from '@hozo/core'
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
fn a_skeleton_is_hidden_and_its_animation_stops_under_reduced_motion() {
    let source = "import { Skeleton } from '@hozo/core'
const el = <Skeleton className=\"h-4 animate-pulse\" />
";
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(
        output
            .jsx
            .contains("aria-hidden={true} data-hozo-skeleton=\"\""),
        "{}",
        output.jsx
    );
    assert!(
        output.css.contains("[data-hozo-skeleton] * {"),
        "{}",
        output.css
    );
    assert!(
        output.css.contains("animation: none !important;"),
        "{}",
        output.css
    );
    // Only where there is a skeleton.
    let plain = "import { View } from '@hozo/core'
const el = <View className=\"animate-pulse\" />
";
    let parsed = hozo_parser::parse_tsx(plain);
    assert!(!lower(&parsed.roots[0].node, plain, &Theme::default())
        .css
        .contains("data-hozo-skeleton"));
}

#[test]
fn a_badge_is_hozo_badge_with_its_classes_compiled() {
    let source = "import { Badge } from '@hozo/core'
const el = <Badge count={n} accessibilityLabel=\"3 unread\" className=\"rounded-full\" />
";
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(
        output.jsx.starts_with("<HozoBadge className=\"hozo-0\""),
        "{}",
        output.jsx
    );
    assert!(
        output.runtime_imports.contains(&"HozoBadge"),
        "{:?}",
        output.runtime_imports
    );
    assert!(output.css.contains("border-radius"), "{}", output.css);
}

#[test]
fn a_chip_is_hozo_chip_with_both_class_lists_compiled() {
    // #787: the remove button's classes are compiled like the chip's and
    // handed over under the prop the author wrote.
    let source = "import { Chip } from '@hozo/core'
const el = <Chip onRemove={drop} disabled={busy} className=\"bg-red-500 my-chip\" removeClassName=\"p-2 hover:bg-red-700\">Remote</Chip>
";
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(
        output
            .jsx
            .starts_with("<HozoChip className=\"hozo-0 my-chip\""),
        "{}",
        output.jsx
    );
    assert!(
        output.jsx.contains(" removeClassName=\"hozo-1\""),
        "{}",
        output.jsx
    );
    assert!(output.jsx.contains("disabled={busy}"), "{}", output.jsx);
    assert!(!output.jsx.contains("aria-disabled"), "{}", output.jsx);
    assert!(
        output.runtime_imports.contains(&"HozoChip"),
        "{:?}",
        output.runtime_imports
    );
    assert!(output.css.contains(".hozo-1:hover"), "{}", output.css);
}

#[test]
fn mixed_secondary_classes_keep_aot_and_residual_values_on_the_actual_slot() {
    let source = "import { Chip, cx } from '@hozo/core'; const el = <Chip onRemove={remove} removeClassName={cx('p-2 md:mt-2 not-focus:rounded-lg disabled:opacity-25 enabled:border-2 not-disabled:outline-2', first(), last())} />";
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert_eq!(output.jsx.matches("first()").count(), 1, "{}", output.jsx);
    assert_eq!(output.jsx.matches("last()").count(), 1, "{}", output.jsx);
    assert!(output.jsx.contains("removeClassName={[\"hozo-1\", first(), last()].filter(Boolean).join(' ').replace(/\\S/, 'hozo-candidate-owner hozo-candidate-slot-owner $&')}"), "{}", output.jsx);
    for selector in [
        ".hozo-1:disabled",
        ".hozo-1:enabled",
        ".hozo-1:not(:disabled)",
        ".hozo-1:not(:focus)",
    ] {
        assert!(output.css.contains(selector), "{selector}: {}", output.css);
    }
    assert!(
        !output.css.contains("data-hozo-disabled"),
        "slot state is not a root marker: {}",
        output.css
    );
    assert!(
        output.css.contains("padding-top: 8px") && output.css.contains("768px"),
        "{}",
        output.css
    );
}

/// #993: Chip's root lands on a button or a span the pattern draws, and
/// no Hozo marker reaches either; a Pressable's still does.
#[test]
fn an_audited_root_asks_its_actual_owner_whether_it_is_disabled() {
    let source = "import { Chip } from '@hozo/core'; const el = <Chip defaultSelected disabled={disabled} className=\"disabled:opacity-25 enabled:border-2 not-disabled:mt-1 not-enabled:mb-1\">Token</Chip>";
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    for selector in [
        ".hozo-0:disabled",
        ".hozo-0:enabled",
        ".hozo-0:not(:disabled)",
        ".hozo-0:not(:enabled)",
    ] {
        assert!(output.css.contains(selector), "{selector}: {}", output.css);
    }
    assert!(!output.css.contains("data-hozo-disabled"), "{}", output.css);

    let source = "import { Pressable } from '@hozo/core'; const el = <Pressable disabled={disabled} className=\"disabled:opacity-25\" />";
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(
        output.css.contains(".hozo-0[data-hozo-disabled]"),
        "{}",
        output.css
    );
}

#[test]
fn secondary_guard_classes_and_capture_values_stay_on_the_slot() {
    let source = "import {Chip,cx} from '@hozo/core'; const el = <Chip removeClassName={cx(first(), guard() ? 'p-2' : 'p-4', last())} />";
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    let (root, slot) = output.jsx.split_once(" removeClassName=").unwrap();
    assert!(!root.contains("hozo-cond-"), "{}", output.jsx);
    assert!(
        slot.contains("hozo-cond-") && slot.contains("__hozoClassPlan"),
        "{}",
        output.jsx
    );
    assert!(
        slot.contains("[(first()), ...((guard()) ? [true] : [false]), (last())]"),
        "{}",
        output.jsx
    );
    for call in ["first()", "guard()", "last()"] {
        assert_eq!(output.jsx.matches(call).count(), 1, "{}", output.jsx);
    }
    assert!(
        output.css.contains("padding-top: 8px") && output.css.contains("padding-top: 16px"),
        "{}",
        output.css
    );
}

#[test]
fn an_avatar_is_hozo_avatar_with_every_class_list_compiled() {
    let source = "import { Avatar } from '@hozo/core'
const el = <Avatar name=\"Ada Lovelace\" status=\"busy\" className=\"size-10 rounded-full\" statusClassName=\"size-3 bg-red-500\" />
";
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(
        output.jsx.starts_with("<HozoAvatar className=\"hozo-0\""),
        "{}",
        output.jsx
    );
    assert!(
        output.jsx.contains(" statusClassName=\"hozo-1\""),
        "{}",
        output.jsx
    );
    assert!(
        output.runtime_imports.contains(&"HozoAvatar"),
        "{:?}",
        output.runtime_imports
    );
}

#[test]
fn a_pagination_is_hozo_pagination_with_its_state_class_lists_compiled() {
    let source = "import { Pagination } from '@hozo/core'
const el = <Pagination pageCount={9} className=\"flex gap-1\" currentItemClassName=\"font-bold\" />
";
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(
        output
            .jsx
            .starts_with("<HozoPagination className=\"hozo-0\""),
        "{}",
        output.jsx
    );
    assert!(
        output.jsx.contains(" currentItemClassName=\"hozo-1\""),
        "{}",
        output.jsx
    );
    assert!(
        output.runtime_imports.contains(&"HozoPagination"),
        "{:?}",
        output.runtime_imports
    );
}

#[test]
fn a_stepper_is_hozo_stepper_with_its_status_class_lists_compiled() {
    let source = "import { Stepper } from '@hozo/core'
const el = <Stepper steps={steps} activeStep={0} className=\"flex gap-2\" currentIndicatorClassName=\"bg-blue-600\" />
";
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(
        output.jsx.starts_with("<HozoStepper className=\"hozo-0\""),
        "{}",
        output.jsx
    );
    assert!(
        output.jsx.contains(" currentIndicatorClassName=\"hozo-1\""),
        "{}",
        output.jsx
    );
    assert!(
        output.runtime_imports.contains(&"HozoStepper"),
        "{:?}",
        output.runtime_imports
    );
}

#[test]
fn a_table_is_the_table_elements_and_a_header_cell_heads_its_column() {
    let source = "import { Table, TableHeader, TableRow, TableHead, TableCell } from '@hozo/core'
const el = <Table className=\"w-full\"><TableHeader><TableRow><TableHead>Item</TableHead><TableHead scope=\"row\">x</TableHead><TableCell>y</TableCell></TableRow></TableHeader></Table>
";
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(
        output
            .jsx
            .starts_with("<table className=\"hozo-0\"><thead><tr>"),
        "{}",
        output.jsx
    );
    assert!(
        output.jsx.contains("<th scope=\"col\">Item</th>"),
        "{}",
        output.jsx
    );
    assert!(
        output.jsx.contains("<th scope=\"row\">x</th><td>y</td>"),
        "{}",
        output.jsx
    );
    assert!(
        output.runtime_imports.is_empty(),
        "{:?}",
        output.runtime_imports
    );
}

#[test]
fn an_otp_input_is_hozo_otp_input_with_its_cell_class_lists_compiled() {
    let source = "import { OtpInput } from '@hozo/core'
const el = <OtpInput accessibilityLabel=\"Code\" className=\"flex gap-2\" activeCellClassName=\"border-blue-600\" />
";
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(
        output.jsx.starts_with("<HozoOtpInput className=\"hozo-0\""),
        "{}",
        output.jsx
    );
    assert!(
        output.jsx.contains(" activeCellClassName=\"hozo-1\""),
        "{}",
        output.jsx
    );
    assert!(
        output.runtime_imports.contains(&"HozoOtpInput"),
        "{:?}",
        output.runtime_imports
    );
}

#[test]
fn a_command_palette_is_hozo_command_palette_with_its_class_lists_compiled() {
    let source = "import { CommandPalette } from '@hozo/core'
const el = <CommandPalette open={open} commands={commands} panelClassName=\"w-96\" activeItemClassName=\"bg-slate-100\" />
";
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(
        output
            .jsx
            .starts_with("<HozoCommandPalette panelClassName=\"hozo-1\""),
        "{}",
        output.jsx
    );
    assert!(
        output.jsx.contains(" activeItemClassName=\"hozo-2\""),
        "{}",
        output.jsx
    );
    assert!(
        output.runtime_imports.contains(&"HozoCommandPalette"),
        "{:?}",
        output.runtime_imports
    );
}

#[test]
fn a_color_picker_is_hozo_color_picker_with_its_class_lists_compiled() {
    let source = "import { ColorPicker } from '@hozo/core'
const el = <ColorPicker value={color} accessibilityLabel=\"Theme\" className=\"flex gap-3\" selectedSwatchClassName=\"ring-2\" />
";
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(
        output
            .jsx
            .starts_with("<HozoColorPicker className=\"hozo-0\""),
        "{}",
        output.jsx
    );
    assert!(
        output.jsx.contains(" selectedSwatchClassName=\"hozo-1\""),
        "{}",
        output.jsx
    );
    assert!(
        output.runtime_imports.contains(&"HozoColorPicker"),
        "{:?}",
        output.runtime_imports
    );
}

#[test]
fn a_meter_is_the_meter_element_with_its_range_as_written() {
    let source = "import { Meter } from '@hozo/core'
const el = <Meter aria-label=\"Disk usage\" value={0.6} low={0.3} high={0.8} />
";
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(output.jsx.starts_with("<meter "), "{}", output.jsx);
    assert!(
        output.jsx.contains("low={0.3} high={0.8}"),
        "{}",
        output.jsx
    );
    // The amount as a percentage, as Native reads it, rather than the
    // "0.6" both desktop readers said without it.
    assert!(
        output.jsx.contains("aria-valuetext={'60%'}"),
        "{}",
        output.jsx
    );
    let dynamic = "import { Meter } from '@hozo/core'
const el = <Meter value={used} max={total} />
";
    let parsed = hozo_parser::parse_tsx(dynamic);
    let output = lower(&parsed.roots[0].node, dynamic, &Theme::default());
    assert!(
        output.jsx.contains("aria-valuetext={`${Math.round(Math.min(Math.max(((used) - (0)) / ((total) - (0)), 0), 1) * 100)}%`}"),
        "{}",
        output.jsx
    );
}

#[test]
fn progress_and_button_with_href_lower_to_html_primitives() {
    let source = r#"
        import { Button, View } from '@hozo/core'
        import { Progress } from '@hozo/semantics'
        const el = (
            <View>
                <Progress value={50} max={100}>50%</Progress>
                <Button href="https://example.com">Go</Button>
            </View>
        )
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert_eq!(
        output.jsx,
        "<div className=\"hozo-view\"><progress value={50} max={100}>50%</progress><a href=\"https://example.com\">Go</a></div>"
    );
}

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
        r#"<button type="button" {...hozoDomProps(rest)}>Go</button>"#
    );
    assert_eq!(
        lowered(
            "function B({ href, ...rest }) { return <Button {...rest} href={href}>Go</Button> }"
        ),
        r#"<a {...hozoDomProps(rest)} href={href}>Go</a>"#
    );
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
        r#"<div className="hozo-view" {...hozoDomProps(rest)}>x</div>"#
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
            .contains("{...hozoInteractive(save, (a) || ({ disabled: b }).disabled)}"),
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
        ("open:bg-blue-500", "hozo-view open:bg-blue-500"),
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
        jsx.contains("onChange={(event) => (handle)(event.target.value)}"),
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
fn the_subtree_variants_move_the_styled_element_not_the_condition() {
    // The mirror of `group-`: that moves the condition onto another
    // element and styles this one, and this styles another element
    // under the condition as written. Which is why the two orders mean
    // different things and fall out of the fold rather than a list.
    assert!(css_for("*:flex").contains(":is(.hozo-0 > *) {"));
    assert!(css_for("**:flex").contains(":is(.hozo-0 *) {"));
    // The child is hovered.
    assert!(css_for("*:hover:flex").contains(":is(.hozo-0 > *):hover"));
    // The parent is hovered.
    assert!(css_for("hover:*:flex").contains(":is(.hozo-0:hover > *)"));
}

#[test]
fn a_container_query_asks_an_ancestor_the_width_question() {
    // Same shape as the viewport query, addressed to a container --
    // and the scale is Tailwind's container one, so `@sm` is 384px
    // where `sm:` is 640px.
    assert!(css_for("@sm:flex").contains("@container (width >= 384px)"));
    assert!(css_for("sm:flex").contains("@media (width >= 640px)"));
    assert!(css_for("@max-md:flex").contains("@container (width < 448px)"));
    // A name says which ancestor answers; without one it is the
    // nearest container.
    assert!(css_for("@sm/main:flex").contains("@container main (width >= 384px)"));
    // And declaring one under a name is two declarations.
    let named = css_for("@container/main");
    assert!(named.contains("container-type: inline-size;"), "{named}");
    assert!(named.contains("container-name: main;"), "{named}");
}

#[test]
fn the_breakpoints_are_written_as_ranges() {
    // `(min-width: 768px)` until `max-…:` arrived and turned out to
    // have no exact opposite in that spelling: `(max-width: 767.98px)`
    // is a convention that leaves a hundredth of a pixel unstyled.
    // Both directions use the range syntax, which is also what
    // Tailwind v4 writes.
    assert!(css_for("md:flex").contains("@media (width >= 768px)"));
    assert!(css_for("max-md:flex").contains("@media (width < 768px)"));
    // The unit is the author's. Nothing here resolves `rem`, because
    // the browser does and it knows the root font size.
    assert!(css_for("max-[40rem]:flex").contains("@media (width < 40rem)"));
    // And a nested pair nests, outermost first.
    let both = css_for("md:max-lg:flex");
    assert!(
        both.find("(width >= 768px)") < both.find("(width < 1024px)"),
        "{both}",
    );
}

#[test]
fn a_variant_can_be_more_than_one_rule() {
    // `condition_shape` returned one shape per condition until this,
    // and `marker:` is four: the element's own `::marker`, a
    // descendant's, and both again under Safari's
    // `::-webkit-details-marker`. Read out of Tailwind's output, which
    // documents none of it.
    let css = css_for("marker:flex");
    for suffix in ["::marker", " ::marker", "::-webkit-details-marker"] {
        assert!(
            css.contains(&format!(".hozo-0{suffix}")),
            "{suffix} missing from {css}"
        );
    }
    // Counted on the generated class rather than the declaration:
    // `View`'s own base rule sets `display: flex` too.
    assert_eq!(css.matches(".hozo-0").count(), 4, "{css}");
    // A selection crosses element boundaries, so it is two.
    assert_eq!(css_for("selection:flex").matches(".hozo-0").count(), 2);
}

#[test]
fn not_hover_is_the_two_rules_it_always_was() {
    // The one variant Hozo refused, and the refusal was about the
    // backend rather than the variant: negating a condition that is
    // both a query and a selector needs a rule for each, and there was
    // nowhere to put the second.
    let css = css_for("not-hover:flex");
    assert!(css.contains(".hozo-0:not(:hover)"), "{css}");
    assert!(css.contains("@media not (hover: hover)"), "{css}");
}

#[test]
fn a_negated_container_query_preserves_its_optional_lookup_name() {
    for (class, query) in [
        ("not-@md:flex", "@container not (width >= 448px)"),
        ("not-@max-md:flex", "@container not (width < 448px)"),
        ("not-@md/main:flex", "@container main not (width >= 448px)"),
        (
            "md:not-@min-[400px]/main:flex",
            "@container main not (width >= 400px)",
        ),
        ("not-not-@md/main:flex", "@container main (width >= 448px)"),
    ] {
        let css = css_for(class);
        assert!(css.contains(query), "{class}: {css}");
        assert_eq!(css.matches("@container").count(), 1, "{css}");
    }
}

#[test]
fn generated_content_is_written_where_the_box_is_made() {
    // A `::before` with no `content` generates nothing, so the
    // declaration is unconditional even when the style is not:
    // `before:md:flex` makes the box at every width.
    let narrow = css_for("before:md:flex");
    assert!(
        narrow.contains(
            ".hozo-0::before {
  content: var(--hozo-content);
}"
        ),
        "{narrow}"
    );
    assert!(narrow.contains("@media (width >= 768px)"), "{narrow}");
    // Two pseudo-elements, two boxes, two `content` declarations --
    // the outer one is not inherited by the inner.
    assert_eq!(css_for("before:after:flex").matches("content:").count(), 3);
    // And the register they read, once per file.
    assert!(css_for("before:flex").contains("@property --hozo-content"));
    assert!(!css_for("hover:flex").contains("@property"));
}

#[test]
fn the_content_utility_sets_what_those_rules_read() {
    // Which is the whole reason it is a custom property: the utility
    // and the `before:` rule that picks it up need not be the same
    // rule, or written in any particular order.
    assert!(css_for("content-['x']").contains("--hozo-content: 'x';"));
    assert!(css_for("content-['x']").contains("content: var(--hozo-content);"));
    // `none` resolves at the declaration instead, because a
    // `var()` holding `none` would still be a string.
    assert!(css_for("content-none").contains("content: none;"));
}

#[test]
fn an_unrecognized_variant_does_not_become_part_of_a_utility_name() {
    // The one failure mode that reports success. An unknown variant
    // leaves its own text in front of the utility, and the utility
    // parser read that text as a *value*: `placeholder-shown:` matched
    // the `placeholder-<colour>` family and wrote
    //
    //   .hozo-0::placeholder { color: var(--hozo-color-shown:bg-blue-500) }
    //
    // -- a rule for a pseudo-element nobody asked about, naming a
    // custom property whose name contains a colon and so cannot exist.
    // Nothing was reported, because a diagnostic is what happens when a
    // class produces *nothing*, and this produced something.
    //
    // Checked on the CSS rather than only on the diagnostic, because
    // the missing diagnostic was the consequence and not the defect.
    //
    // `placeholder-shown:` is compiled now, so the example that found
    // this is no longer one -- but the shape is unchanged and the
    // collision is still there for any `placeholder-…` Hozo does not
    // know, which is what the first entry keeps.
    for classes in [
        "placeholder-nonsense:bg-blue-500",
        "bg-nonsense:p-4",
        "text-x:y",
        "border-bottom:12px",
    ] {
        // `.hozo-0` is the class the element's own utilities go into;
        // `View`'s base rule is always there and is not this.
        assert!(
            !css_for(classes).contains(".hozo-0"),
            "{classes}: {}",
            css_for(classes)
        );
    }
}

#[test]
fn a_colon_inside_an_arbitrary_value_is_the_values_own() {
    // The guard is "a colon left at the top level", so it has to know
    // that brackets hold their own. Both of these are real utilities
    // whose value contains a colon.
    assert!(css_for("bg-[url(a:b)]").contains("background-image: url(a:b);"));
    assert!(css_for("supports-[display:grid]:p-4").contains("@supports (display:grid)"));
    // And the pseudo-element family still works where it is genuinely
    // the utility rather than a variant that resembled one.
    assert!(css_for("placeholder-blue-500").contains("::placeholder"));
}
