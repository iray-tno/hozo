use super::*;

fn compile_source(source: &str) -> LowerOutput {
    let parsed = hozo_parser::parse_tsx(source);
    lower(&parsed.roots[0].node, source, &Theme::default())
}

fn compile(primitive: &str, value: &str) -> LowerOutput {
    let source = format!(
            "import stylex from '@stylexjs/stylex';\nimport {{ {primitive} }} from '@hozo/core';\nconst styles = stylex.create({{ root: {{ backdropFilter: '{value}' }} }});\nconst el = <{primitive} {{...stylex.props(styles.root)}} />;\n"
        );
    compile_source(&source)
}

#[test]
fn static_blur_uses_the_opt_in_native_adapter() {
    let out = compile("View", "blur(12px)");
    assert!(out.diagnostics.is_empty(), "{:?}", out.diagnostics);
    assert!(out.runtime_imports.contains(&"HozoBackdropFilter"));
    assert!(
        out.jsx.contains("<HozoBackdropFilter hozoBlurRadius={12}"),
        "{}",
        out.jsx
    );
}

#[test]
fn none_is_a_native_no_op_and_text_is_refused() {
    let none = compile("View", "none");
    assert!(none.diagnostics.is_empty(), "{:?}", none.diagnostics);
    assert!(!none.runtime_imports.contains(&"HozoBackdropFilter"));

    let text = compile("Text", "blur(12px)");
    assert!(text
        .diagnostics
        .iter()
        .any(|diagnostic| diagnostic.code == DiagnosticCode::NotWiredOnNative));
    assert!(!text.runtime_imports.contains(&"HozoBackdropFilter"));
}

#[test]
fn conditional_and_composed_backdrop_filters_are_not_silently_absorbed() {
    for class_name in ["md:backdrop-blur-md", "backdrop-blur-md backdrop-grayscale"] {
        let source = format!(
                "import {{ View }} from '@hozo/core';\nconst el = <View className=\"{class_name}\" />;\n"
            );
        let out = compile_source(&source);
        assert!(
            out.diagnostics.iter().any(|diagnostic| {
                matches!(
                    diagnostic.code,
                    DiagnosticCode::NotWiredOnNative | DiagnosticCode::WebOnlyPropertyOnNative
                )
            }),
            "{class_name}: {:?}",
            out.diagnostics
        );
    }
}
