use std::collections::HashMap;

use crate::{lower, render_candidate_stylesheet, LowerOutput};
use hozo_ir::Theme;

fn theme() -> Theme {
    Theme::default().with_radii(HashMap::from([("hozo-control".to_string(), 8.0)]))
}

fn compile(class_name: &str, theme: &Theme) -> LowerOutput {
    let source = format!(
        "import {{ View }} from '@hozo/core'\nconst el = <View className=\"{class_name}\" />\n"
    );
    let parsed = hozo_parser::parse_tsx(&source);
    lower(&parsed.roots[0].node, &source, theme)
}

#[test]
fn a_theme_radius_is_its_value_in_pixels() {
    let out = compile("rounded-hozo-control", &theme());
    assert!(out.css.contains("border-radius: 8px;"), "{}", out.css);
}

#[test]
fn its_corner_forms_are_read_too() {
    let out = compile("rounded-t-hozo-control rounded-ee-hozo-control", &theme());
    assert!(
        out.css.contains("border-top-left-radius: 8px;"),
        "{}",
        out.css
    );
    assert!(
        out.css.contains("border-top-right-radius: 8px;"),
        "{}",
        out.css
    );
    assert!(
        out.css.contains("border-end-end-radius: 8px;"),
        "{}",
        out.css
    );
}

#[test]
fn a_name_the_theme_lacks_is_only_carried() {
    let out = compile("rounded-unknown", &theme());
    assert!(!out.css.contains("radius"), "{}", out.css);
    assert!(!out.css.contains("hozo-0"), "{}", out.css);
    assert!(out.jsx.contains("rounded-unknown"), "{}", out.jsx);
}

#[test]
fn the_dynamic_path_reads_it_as_well() {
    let sheet = render_candidate_stylesheet(&["rounded-hozo-control".to_string()], &theme());
    assert!(sheet.contains("border-radius: 8px;"), "{sheet}");
    let sheet = render_candidate_stylesheet(&["rounded-unknown".to_string()], &theme());
    assert!(!sheet.contains("radius"), "{sheet}");
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
        let class_name = format!("rounded-{name}");
        let default = compile(&class_name, &Theme::default());
        assert!(
            default
                .css
                .contains(&format!("border-radius: {fallback_px}px;")),
            "{}",
            default.css
        );
        assert!(!default.jsx.contains(&class_name), "{}", default.jsx);
        let same = Theme::default().with_radii(HashMap::from([(name.to_string(), fallback_px)]));
        assert_eq!(compile(&class_name, &same).css, default.css);
        let themed = Theme::default().with_radii(HashMap::from([(name.to_string(), 10.0)]));
        assert!(compile(&class_name, &themed)
            .css
            .contains("border-radius: 10px;"));
    }
}

#[test]
fn scale_overrides_reach_corners_and_candidates_but_not_fixed_or_arbitrary_radii() {
    let theme = Theme::default().with_radii(HashMap::from([
        ("lg".to_string(), 10.0),
        ("sm".to_string(), 0.0),
        ("none".to_string(), 20.0),
        ("full".to_string(), 20.0),
    ]));
    let out = compile("rounded-t-lg rounded-ee-lg", &theme);
    for property in [
        "border-top-left-radius",
        "border-top-right-radius",
        "border-end-end-radius",
    ] {
        assert!(
            out.css.contains(&format!("{property}: 10px;")),
            "{}",
            out.css
        );
    }
    assert!(compile("rounded-sm", &theme)
        .css
        .contains("border-radius: 0px;"));
    for class_name in ["rounded", "rounded-none", "rounded-full", "rounded-[8px]"] {
        assert_eq!(
            compile(class_name, &theme).css,
            compile(class_name, &Theme::default()).css
        );
    }
    let candidates = render_candidate_stylesheet(
        &["rounded-lg".to_string(), "rounded-s-lg".to_string()],
        &theme,
    );
    assert!(candidates.contains("border-radius: 10px;"), "{candidates}");
    assert!(
        candidates.contains("border-start-start-radius: 10px;"),
        "{candidates}"
    );
}
