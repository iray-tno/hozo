use crate::lower;
use hozo_ir::{DiagnosticCode, Theme};

fn compile(class_name: &str) -> (String, Vec<DiagnosticCode>) {
    let source = format!(
        "import {{ View }} from '@hozo/core'\nexport const C = () => <View className=\"{class_name}\" />\n"
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

const P4: &str =
    "{ padding-top: 16px; padding-right: 16px; padding-bottom: 16px; padding-left: 16px; }";

#[test]
fn a_selector_without_an_ampersand_is_a_condition_on_the_element() {
    // #1781. Each selector is the one Tailwind v4.3 writes for the same
    // class, with `.hozo-0` for its escaped class name. Before, the first
    // two were rules on every `.x` and every hovered element on the page,
    // and the rest wrote nothing and said nothing.
    for (class_name, selector) in [
        ("p-2 [.x]:p-4", ".hozo-0:is(.x)"),
        ("p-2 [:hover]:p-4", ".hozo-0:is(:hover)"),
        ("p-2 group-[.x]:p-4", ".hozo-0:is(:where(.group):is(.x) *)"),
        (
            "p-2 group-[:hover]:p-4",
            ".hozo-0:is(:where(.group):is(:hover) *)",
        ),
        ("p-2 peer-[.x]:p-4", ".hozo-0:is(:where(.peer):is(.x) ~ *)"),
        ("p-2 not-[.x]:p-4", ".hozo-0:not(:is(.x))"),
        // Tailwind writes `:where(:is(.x)) &`; the same match and weight,
        // spelled from `&` as every `in-` is here.
        ("p-2 in-[.x]:p-4", ".hozo-0:is(:where(*:is(.x)) *)"),
    ] {
        let (css, codes) = compile(class_name);
        assert_eq!(codes, [], "{class_name}");
        assert!(
            css.contains(&format!("{selector} {P4}")),
            "{class_name}: {css}"
        );
        // Never a rule without the element's own class in it.
        assert!(!css.contains(&format!("}} .x {P4}")), "{class_name}: {css}");
        assert!(
            !css.contains(&format!("}} :hover {P4}")),
            "{class_name}: {css}"
        );
    }
}

#[test]
fn a_selector_with_an_ampersand_is_still_passed_through_as_written() {
    for (class_name, selector) in [
        ("p-2 [&.x]:p-4", ".hozo-0.x"),
        ("p-2 [&_.x]:p-4", ".hozo-0 .x"),
        ("p-2 [.dark_&]:p-4", ".dark .hozo-0"),
        ("p-2 group-[&.x]:p-4", ".hozo-0:is(:where(.group).x *)"),
        ("p-2 in-[&.x]:p-4", ".hozo-0:is(:where(*.x) *)"),
    ] {
        let (css, codes) = compile(class_name);
        assert_eq!(codes, [], "{class_name}");
        assert!(
            css.contains(&format!("{selector} {P4}")),
            "{class_name}: {css}"
        );
    }
}
