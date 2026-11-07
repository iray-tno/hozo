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

#[test]
fn group_checked_is_compiled_beside_the_base_it_overrides() {
    // #1752, the `open:` case again (#1692). Left to Tailwind,
    // `group-checked:bg-blue-500` sat in a layer and the compiled,
    // unlayered `bg-white` beside it won whether the box was checked or
    // not. Compiled, it is a second unlayered rule with the group's extra
    // specificity, so it wins when it matches.
    //
    // A checkbox has no descendants, so a real `group-checked:` is rare;
    // `group-has-checked:` and `peer-checked:` are the ones that read a
    // checkbox, and `group-default:` reads a form's submit button.
    let (css, codes) = compile("bg-white group-checked:bg-blue-500");
    assert_eq!(codes, []);
    assert!(css.contains(":is(:where(.group):checked *) {"), "{css}");

    for (class_name, selector) in [
        (
            "bg-white has-checked:bg-blue-500",
            ".hozo-0:has(:checked) {",
        ),
        (
            "bg-white group-has-checked:bg-blue-500",
            ":is(:where(.group):has(:checked) *) {",
        ),
        (
            "bg-white group-default:bg-blue-500",
            ":is(:where(.group):default *) {",
        ),
    ] {
        let (css, codes) = compile(class_name);
        assert_eq!(codes, [], "{class_name}");
        assert!(css.contains(selector), "{class_name}: {css}");
    }
}

#[test]
fn peer_indeterminate_and_peer_default_use_tailwinds_selectors() {
    let (css, codes) = compile("p-2 peer-indeterminate:p-4");
    assert_eq!(codes, []);
    assert!(
        css.contains(":is(:where(.peer):indeterminate ~ *)"),
        "{css}"
    );

    let (css, codes) = compile("p-2 peer-default:p-4");
    assert_eq!(codes, []);
    assert!(css.contains(":is(:where(.peer):default ~ *)"), "{css}");
}

#[test]
fn a_state_on_an_element_that_is_never_a_control_is_emitted_and_reported() {
    // Emitted as Tailwind would, so a class that cannot apply is not also
    // a class that silently vanished; reported, because no primitive is a
    // checkbox, a radio or a default button.
    for (class_name, selector) in [
        ("checked:p-4", ":checked {"),
        ("indeterminate:p-4", ":indeterminate {"),
        ("default:p-4", ":default {"),
    ] {
        let (css, codes) = compile(class_name);
        assert_eq!(
            codes,
            [DiagnosticCode::TailwindVariantCannotMatch],
            "{class_name}"
        );
        assert!(css.contains(selector), "{class_name}: {css}");
    }
}

#[test]
fn not_checked_always_applies_and_is_not_reported() {
    // An element that is never checked is always `:not(:checked)`, so this
    // is a rule that applies rather than one that cannot.
    let (css, codes) = compile("not-checked:p-4");
    assert_eq!(codes, []);
    assert!(css.contains(":not(:checked)"), "{css}");
}
