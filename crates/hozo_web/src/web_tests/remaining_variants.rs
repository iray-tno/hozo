use crate::lower;
use hozo_ir::{DiagnosticCode, Theme};

fn compile_on(element: &str, class_name: &str) -> (String, Vec<DiagnosticCode>) {
    let source = format!(
        "import {{ {element} }} from '@hozo/core'\nexport const C = () => <{element} className=\"{class_name}\" />\n"
    );
    let parsed = hozo_parser::parse_tsx(&source);
    let css = lower(&parsed.roots[0].node, &source, &Theme::default())
        .css
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    (
        css,
        parsed.diagnostics.into_iter().map(|d| d.code).collect(),
    )
}

fn compile(class_name: &str) -> (String, Vec<DiagnosticCode>) {
    compile_on("View", class_name)
}

#[test]
fn the_pointer_queries_are_tailwinds_media_queries() {
    // #1777. Carried, `pointer-coarse:p-4` sat in a layer and a compiled
    // `p-2` beside it won on every device.
    for (class_name, query) in [
        ("p-2 pointer-fine:p-4", "@media (pointer: fine)"),
        ("p-2 pointer-coarse:p-4", "@media (pointer: coarse)"),
        ("p-2 pointer-none:p-4", "@media (pointer: none)"),
        ("p-2 any-pointer-fine:p-4", "@media (any-pointer: fine)"),
        ("p-2 any-pointer-coarse:p-4", "@media (any-pointer: coarse)"),
        ("p-2 any-pointer-none:p-4", "@media (any-pointer: none)"),
    ] {
        let (css, codes) = compile(class_name);
        assert_eq!(codes, [], "{class_name}");
        assert!(css.contains(query), "{class_name}: {css}");
        // After the base, so it wins on a tie.
        assert!(
            css.find(".hozo-0 { padding-top: 8px").unwrap() < css.find(query).unwrap(),
            "{class_name}: {css}"
        );
    }
}

#[test]
fn inert_matches_the_element_or_anything_under_an_inert_ancestor() {
    let (css, codes) = compile("bg-white inert:bg-blue-500");
    assert_eq!(codes, []);
    assert!(css.contains(".hozo-0:is([inert], [inert] *) {"), "{css}");

    let (css, codes) = compile("bg-white group-inert:bg-blue-500");
    assert_eq!(codes, []);
    assert!(
        css.contains(":is(:where(.group):is([inert], [inert] *) *) {"),
        "{css}"
    );
}

#[test]
fn in_is_any_ancestor_in_the_state_and_weighs_nothing_extra() {
    // Tailwind's `:where(*:focus) &`, spelled from `&`. Its weight is the
    // base's, so it orders by position the way Tailwind's does.
    let (css, codes) = compile("bg-white in-focus:bg-blue-500");
    assert_eq!(codes, []);
    assert!(css.contains(".hozo-0:is(:where(*:focus) *) {"), "{css}");
    assert!(
        css.find(".hozo-0 { background-color: #fff").unwrap()
            < css.find(":where(*:focus)").unwrap(),
        "{css}"
    );

    // The inner variant's at-rule survives, as it does for `group-hover:`.
    let (css, codes) = compile("p-2 in-hover:p-4");
    assert_eq!(codes, []);
    assert!(css.contains("@media (hover: hover)"), "{css}");
    assert!(css.contains(":is(:where(*:hover) *)"), "{css}");

    // And `has-` and `not-` wrap it like any other selector.
    let (css, codes) = compile("p-2 not-in-focus:p-4");
    assert_eq!(codes, []);
    assert!(css.contains(":not(:is(:where(*:focus) *))"), "{css}");
}

#[test]
fn details_content_is_the_pseudo_element_and_matches_only_a_details() {
    let (css, codes) = compile_on("Details", "details-content:p-4");
    assert!(
        !codes.contains(&DiagnosticCode::TailwindVariantCannotMatch),
        "{codes:?}"
    );
    assert!(css.contains("::details-content {"), "{css}");

    let (css, codes) = compile("details-content:p-4");
    assert_eq!(codes, [DiagnosticCode::TailwindVariantCannotMatch]);
    assert!(css.contains("::details-content {"), "{css}");
}

#[test]
fn the_owner_class_path_now_takes_what_it_used_to_refuse() {
    // `lower_owner_class` refuses an element with a carried class or any
    // diagnostic. Carried, these nine kept their element off that path;
    // compiled, it captures the same CSS the ordinary path emits.
    let source = "import { View } from '@hozo/core'\nconst el = <View className=\"bg-white inert:bg-blue-500 in-focus:p-4 pointer-coarse:p-2 any-pointer-fine:m-1\" />\n";
    let parsed = hozo_parser::parse_tsx(source);
    let root = &parsed.roots[0].node;
    assert!(root.carried_classes.is_empty());
    let ordinary = lower(root, source, &Theme::default());
    let prepared = crate::lower_owner_class(root, source, &Theme::default(), false);
    assert!(
        prepared.diagnostics.is_empty(),
        "{:?}",
        prepared.diagnostics
    );
    let carrier = prepared.owner_class.expect("captured");
    assert!(ordinary.css.ends_with(&carrier.css));
    for selector in [
        ":is([inert], [inert] *)",
        ":is(:where(*:focus) *)",
        "@media (pointer: coarse)",
        "@media (any-pointer: fine)",
    ] {
        assert!(
            carrier.css.contains(selector),
            "{selector}: {}",
            carrier.css
        );
    }

    // One that is still carried keeps the element off it, as before.
    let source = "import { View } from '@hozo/core'\nconst el = <View className=\"bg-white aria-[sort=ascending]:bg-blue-500\" />\n";
    let parsed = hozo_parser::parse_tsx(source);
    let prepared =
        crate::lower_owner_class(&parsed.roots[0].node, source, &Theme::default(), false);
    assert!(prepared.owner_class.is_none());
}
