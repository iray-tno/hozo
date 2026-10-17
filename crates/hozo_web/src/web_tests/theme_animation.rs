use std::collections::HashMap;

use crate::{lower, render_candidate_stylesheet, LowerOutput};
use hozo_ir::Theme;

fn theme() -> Theme {
    let mut animations = HashMap::new();
    animations.insert(
        "wiggle".to_string(),
        hozo_ir::ThemeAnimation {
            shorthand: "wiggle 1s ease-in-out infinite".to_string(),
            keyframes_css: Some(
                "@keyframes wiggle {\n  50% {\n    opacity: .5;\n  }\n}\n".to_string(),
            ),
            keyframes: None,
            unread: Vec::new(),
        },
    );
    Theme::default().with_animations(animations)
}

fn compile(class_name: &str, theme: &Theme) -> LowerOutput {
    let source = format!(
        "import {{ View }} from '@hozo/core'\nconst el = <View className=\"{class_name}\" />\n"
    );
    let parsed = hozo_parser::parse_tsx(&source);
    lower(&parsed.roots[0].node, &source, theme)
}

#[test]
fn a_theme_animation_is_its_shorthand_and_its_keyframes() {
    let out = compile("animate-wiggle", &theme());
    assert!(
        out.css
            .contains("animation: wiggle 1s ease-in-out infinite;"),
        "{}",
        out.css
    );
    assert_eq!(
        out.css.matches("@keyframes wiggle").count(),
        1,
        "{}",
        out.css
    );
    // Still carried, as Tailwind's own CSS would also select on it.
    assert!(out.jsx.contains("animate-wiggle"), "{}", out.jsx);
}

#[test]
fn a_name_the_theme_lacks_is_only_carried() {
    let out = compile("animate-unknown", &theme());
    assert!(!out.css.contains("animation"), "{}", out.css);
    assert!(!out.css.contains("hozo-0"), "{}", out.css);
    assert!(out.jsx.contains("animate-unknown"), "{}", out.jsx);
}

#[test]
fn the_dynamic_path_brings_the_keyframes_too() {
    let sheet = render_candidate_stylesheet(&["animate-wiggle".to_string()], &theme());
    assert!(sheet.contains("@keyframes wiggle"), "{sheet}");
    assert!(
        sheet.contains("animation: wiggle 1s ease-in-out infinite;"),
        "{sheet}"
    );
    assert!(render_candidate_stylesheet(&["animate-unknown".to_string()], &theme()).is_empty());
}

#[test]
fn and_so_does_it_for_tailwinds_own() {
    let sheet = render_candidate_stylesheet(&["animate-spin".to_string()], &Theme::default());
    assert!(sheet.contains("@keyframes spin"), "{sheet}");
    assert!(
        sheet.contains("animation: spin 1s linear infinite;"),
        "{sheet}"
    );
    assert!(
        !render_candidate_stylesheet(&["animate-none".to_string()], &Theme::default())
            .contains("@keyframes")
    );
}
