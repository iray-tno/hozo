use crate::lower;
use hozo_ir::{DiagnosticCode, Theme};

fn compile(class_name: &str) -> (String, Vec<DiagnosticCode>) {
    let source = format!(
        "import {{ Text }} from '@hozo/core'\nexport const C = () => <Text className=\"{class_name}\">Hide</Text>\n"
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
fn group_open_is_compiled_beside_the_base_it_overrides() {
    // #1692. Left to Tailwind, `group-open:inline` sat in a layer and the
    // compiled, unlayered `hidden` beside it won whether the `<details>`
    // was open or not. Compiled, the variant is a second unlayered rule
    // with the group's extra specificity, so it wins when it matches.
    let (css, codes) = compile("hidden group-open:inline");
    assert_eq!(codes, []);
    assert!(css.contains("display: none"), "{css}");
    assert!(
        css.contains(":is(:where(.group):is([open], :popover-open, :open) *) { display: inline"),
        "{css}"
    );
}

#[test]
fn peer_open_uses_tailwinds_selector() {
    let (css, codes) = compile("peer-open:p-4");
    assert_eq!(codes, []);
    assert!(
        css.contains(":is(:where(.peer):is([open], :popover-open, :open) ~ *)"),
        "{css}"
    );
}

#[test]
fn open_on_an_element_that_is_never_open_is_emitted_and_reported() {
    // Emitted as Tailwind would, so a class that could never apply is not
    // also a class that silently vanished; reported, because no primitive
    // is a `<details>`, `<dialog>` or popover.
    let (css, codes) = compile("open:p-4");
    assert_eq!(codes, [DiagnosticCode::TailwindVariantCannotMatch]);
    assert!(
        css.contains(":is([open], :popover-open, :open) { padding-top:"),
        "{css}"
    );
}
