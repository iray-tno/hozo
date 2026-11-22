use super::*;

fn compile(source: &str) -> LowerOutput {
    let parsed = hozo_parser::parse_tsx(source);
    lower(&parsed.roots[0].node, source, &Theme::default())
}

#[test]
fn all_four_of_tailwinds_loops_reach_the_native_driver() {
    // Three of these were refused with "only spin is wired today".
    // They move nothing but opacity and transform, which is what let
    // them share one hook rather than needing three.
    for (class_name, name) in [
        ("animate-spin", "spin"),
        ("animate-pulse", "pulse"),
        ("animate-bounce", "bounce"),
        ("animate-ping", "ping"),
    ] {
        let out = compile(&format!(
            "import {{ View }} from '@hozo/core'\nconst el = <View className=\"{class_name}\" />\n"
        ));
        assert!(
            out.diagnostics.is_empty(),
            "{class_name}: {:?}",
            out.diagnostics
        );
        assert!(
            out.prelude
                .iter()
                .any(|line| line.contains(&format!("useHozoAnimation('{name}')"))),
            "{class_name}: {:?}",
            out.prelude,
        );
        assert!(
            out.jsx.contains(&format!("__hozoAnim_{name}")),
            "{class_name}: {}",
            out.jsx
        );
    }
}

#[test]
fn animate_none_asks_for_no_hook() {
    // It turns an animation off rather than being one, so reaching for
    // the runtime would start a loop in order to express stopping.
    let out = compile(
        "import { View } from '@hozo/core'\nconst el = <View className=\"animate-none\" />\n",
    );
    assert!(out.prelude.is_empty(), "{:?}", out.prelude);
    assert!(!out.jsx.contains("__hozoAnim"), "{}", out.jsx);
}
