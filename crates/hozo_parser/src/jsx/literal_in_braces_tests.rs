use hozo_ir::DiagnosticCode;

fn root(attribute: &str) -> (hozo_ir::Node, Vec<DiagnosticCode>) {
    let source =
        format!("import {{ View }} from '@hozo/core'\nconst el = <View className={attribute} />\n");
    let parsed = crate::parse_tsx(&source);
    (
        parsed.roots[0].node.clone(),
        parsed.diagnostics.into_iter().map(|d| d.code).collect(),
    )
}

#[test]
fn a_string_in_braces_is_the_same_list_as_the_attribute_string() {
    for (braced, plain) in [
        ("{\"p-2 group\"}", "\"p-2 group\""),
        ("{'peer my-card'}", "\"peer my-card\""),
        (
            "{\"p-2 aria-[sort=ascending]:p-4\"}",
            "\"p-2 aria-[sort=ascending]:p-4\"",
        ),
    ] {
        let (braced_node, braced_codes) = root(braced);
        let (plain_node, plain_codes) = root(plain);
        assert_eq!(
            braced_node.carried_classes, plain_node.carried_classes,
            "{braced}"
        );
        assert!(braced_node.class_name_fallback.is_empty(), "{braced}");
        assert_eq!(braced_node.style.len(), plain_node.style.len(), "{braced}");
        assert_eq!(braced_codes, plain_codes, "{braced}");
    }
    // Anything else in braces is still an expression.
    let (node, _) = root("{`p-2 ${tone}`}");
    assert!(!node.class_name_fallback.is_empty() || node.root_class_evaluation().is_some());
}
