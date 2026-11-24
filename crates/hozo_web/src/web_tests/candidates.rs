use super::*;

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
fn separate_candidate_transforms_share_non_inheriting_registers() {
    let names = ["translate-x-2", "translate-y-3", "scale-x-75", "scale-y-50"];
    let css = render_candidate_stylesheet(&names.map(str::to_string), &Theme::default());
    assert!(css.contains("@property --hozo-translate-x {"), "{css}");
    assert!(css.contains("inherits: false;"), "{css}");
    assert_eq!(css.matches("@property --hozo-").count(), 6);
    assert!(!css.contains("@property --hozo-shadow"), "{css}");
    assert!(css.contains("--hozo-translate-x: 8px;"), "{css}");
    assert!(css.contains("--hozo-translate-y: 12px;"), "{css}");
    assert!(
        css.contains("translate: var(--hozo-translate-x) var(--hozo-translate-y);"),
        "{css}"
    );
    assert!(
        css.contains("scale: var(--hozo-scale-x) var(--hozo-scale-y);"),
        "{css}"
    );
    assert_eq!(css.matches("@property --hozo-translate-x {").count(), 1);
    let plain = render_candidate_stylesheet(&["p-2".into()], &Theme::default());
    assert!(!plain.contains("@property"), "{plain}");
}

#[test]
fn separate_candidate_filters_share_static_registers_but_not_drop_shadow() {
    let names = ["blur-sm", "grayscale", "hover:sepia"];
    let css = render_candidate_stylesheet(&names.map(str::to_string), &Theme::default());
    assert!(css.contains("--hozo-blur: blur(8px);"), "{css}");
    assert!(css.contains("--hozo-grayscale: grayscale(100%);"), "{css}");
    assert!(css.contains("--hozo-sepia: sepia(100%);"), "{css}");
    assert!(css.contains("filter: var(--hozo-blur,)"), "{css}");
    assert_eq!(css.matches("@property --hozo-blur {").count(), 1);
    assert!(css.contains("inherits: false;"), "{css}");
    assert_eq!(css.matches("@property --hozo-").count(), 8);
    assert!(!css.contains("@property --hozo-translate"), "{css}");
    assert!(!css.contains("@property --hozo-shadow"), "{css}");
    for name in ["filter-none", "drop-shadow-sm", "backdrop-filter-none"] {
        let css = render_candidate_stylesheet(&[name.into()], &Theme::default());
        assert!(!css.contains("@property"), "{name}: {css}");
    }
}

#[test]
fn candidate_backdrop_functions_read_their_own_registers_with_both_spellings() {
    let names = [
        "backdrop-blur-sm",
        "hover:backdrop-opacity-50",
        "backdrop-saturate-150",
    ];
    let css = render_candidate_stylesheet(&names.map(str::to_string), &Theme::default());
    assert!(
        css.contains("--hozo-backdrop-opacity: opacity(50%);"),
        "{css}"
    );
    assert!(
        css.contains("-webkit-backdrop-filter: var(--hozo-backdrop-blur,)"),
        "{css}"
    );
    assert!(
        css.contains("  backdrop-filter: var(--hozo-backdrop-blur,)"),
        "{css}"
    );
    assert_eq!(css.matches("@property --hozo-backdrop-").count(), 9);
    assert_eq!(css.matches("@property --hozo-").count(), 9);
}

#[test]
fn candidate_gradients_share_static_registers_without_unrelated_registrations() {
    let names = [
        "bg-linear-to-r",
        "from-red-500",
        "hover:to-blue-500",
        "focus:from-25%",
        "via-none",
    ]
    .map(String::from);
    let css = render_candidate_stylesheet(&names, &Theme::default());
    assert!(
        css.contains("linear-gradient(var(--hozo-gradient-stops, var(--hozo-gradient-position)))"),
        "{css}"
    );
    assert!(css.contains("--hozo-gradient-from-position: 25%;"), "{css}");
    assert!(css.contains("--hozo-gradient-via-stops: initial;"), "{css}");
    assert_eq!(css.matches("@property --hozo-").count(), 9);
    assert!(!css.contains("@property --hozo-blur"));
}

#[test]
fn candidate_css_registers_the_content_property_for_pseudo_elements() {
    // A bottom sheet's grabber is `before:block before:h-1 ...` in a class
    // list the pattern passes to a plain <button>, so this sheet is the only
    // CSS it gets. `content: var(--hozo-content)` with nothing registering
    // the property is invalid, and the bar was never drawn.
    let css = render_candidate_stylesheet(&["before:block".to_string()], &Theme::default());
    assert!(css.contains("content: var(--hozo-content);"), "{css}");
    assert!(css.contains("@property --hozo-content {"), "{css}");
    assert!(css.contains("initial-value: \"\";"), "{css}");

    let css = render_candidate_stylesheet(&["p-2".to_string()], &Theme::default());
    assert!(!css.contains("--hozo-content"), "{css}");
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
fn a_project_dark_variant_puts_dark_rules_under_its_selector() {
    // A page with its own theme switch -- the docs set `data-theme` -- and
    // the `@custom-variant dark` Tailwind reads for it. Hozo compiles the
    // same classes, so it has to follow the same rule (#1654): the paired
    // token's dark half, a written `dark:` and the dark copy of a
    // conditional rule, on both paths a class reaches the output by.
    let selector = "&:where([data-theme=dark], [data-theme=dark] *)";
    let theme = paired_theme().with_dark_selector(Some(selector.to_string()));
    let source = "import { View } from '@hozo/core'\nconst el = <View className=\"bg-brand hover:bg-brand dark:p-2\">x</View>";
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &theme);
    let sheet = render_candidate_stylesheet(&["hover:bg-brand".to_string()], &theme);
    for css in [&output.css, &sheet] {
        assert!(!css.contains("prefers-color-scheme"), "{css}");
        assert!(
            css.contains(":where([data-theme=dark], [data-theme=dark] *)"),
            "{css}"
        );
        assert!(css.contains("oklch(0.2 0.05 266)"), "{css}");
    }
    // The hover copy keeps its `:hover` beside the theme selector.
    assert!(
        sheet.contains(":hover:where([data-theme=dark], [data-theme=dark] *)"),
        "{sheet}"
    );
}

#[test]
fn a_project_dark_variant_may_be_an_at_rule() {
    // The other form Tailwind accepts: `@custom-variant dark (@media ...)`.
    let theme = paired_theme().with_dark_selector(Some(
        "@media (prefers-color-scheme: dark) and (prefers-contrast: more)".to_string(),
    ));
    let css = render_candidate_stylesheet(&["bg-brand".to_string()], &theme);
    assert!(
        css.contains("@media (prefers-color-scheme: dark) and (prefers-contrast: more)"),
        "{css}"
    );
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
