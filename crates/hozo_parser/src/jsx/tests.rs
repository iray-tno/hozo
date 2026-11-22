use hozo_ir::{AccessibilityRole, ConditionExpr, DiagnosticCode};

/// Slices `source` at a passthrough prop's span, so tests assert on the
/// text that will actually be re-emitted rather than raw offsets.
fn passthrough_texts<'a>(source: &'a str, node: &hozo_ir::Node) -> Vec<&'a str> {
    node.props
        .passthrough
        .iter()
        .map(|p| &source[p.span.0.start as usize..p.span.0.end as usize])
        .collect()
}

#[test]
fn unmodeled_props_and_spreads_are_preserved_verbatim() {
    let source = r#"
            import { View } from '@hozo/core'
            const el = <View {...rest} className="p-4" onLayout={onLayout} testID="row" />
            "#;
    let output = crate::parse_tsx(source);
    let root = &output.roots[0].node;
    assert_eq!(passthrough_texts(source, root), vec!["{...rest}"]);
    assert!(root.props.passthrough[0].is_spread);
    assert!(root.props.on_layout.is_some());
    assert!(root.props.test_id.is_some());
}

#[test]
fn svg_filter_members_are_not_foreign_components() {
    use hozo_ir::{Primitive, SvgElement};
    for (name, element) in [
        ("Filter", SvgElement::Filter),
        ("FeColorMatrix", SvgElement::FeColorMatrix),
        ("FeGaussianBlur", SvgElement::FeGaussianBlur),
        ("FeBlend", SvgElement::FeBlend),
        ("FeComposite", SvgElement::FeComposite),
        ("FeDropShadow", SvgElement::FeDropShadow),
        ("FeFlood", SvgElement::FeFlood),
        ("FeMerge", SvgElement::FeMerge),
        ("FeMergeNode", SvgElement::FeMergeNode),
        ("FeOffset", SvgElement::FeOffset),
    ] {
        let source = format!(
                "import {{ Svg }} from '@hozo/svg'; const el = <Svg.{name} in=\"SourceGraphic\" result=\"effect\" />"
            );
        let output = crate::parse_tsx(&source);
        assert_eq!(output.roots.len(), 1);
        assert_eq!(output.roots[0].node.primitive, Primitive::Svg(element));
        assert_eq!(
            passthrough_texts(&source, &output.roots[0].node),
            vec!["in=\"SourceGraphic\"", "result=\"effect\""]
        );
    }
}

#[test]
fn svg_members_inside_an_expression_are_compiled_in_place() {
    use hozo_ir::{Child, Primitive, SvgElement};
    for (body, element) in [
            (
                "{lines.map((line) => <Svg.Text key={line} className=\"fill-red-500\">{line}</Svg.Text>)}",
                SvgElement::Text,
            ),
            (
                "{shown ? <Svg.Rect className=\"fill-red-500\" /> : null}",
                SvgElement::Rect,
            ),
        ] {
            let source = format!(
                "import {{ Svg }} from '@hozo/svg'; const el = <Svg viewBox=\"0 0 1 1\">{body}</Svg>"
            );
            let output = crate::parse_tsx(&source);
            assert_eq!(output.roots.len(), 1);
            let [Child::Verbatim { nested, .. }] = output.roots[0].node.children.as_slice() else {
                panic!("expected one carried child: {:?}", output.roots[0].node.children);
            };
            assert_eq!(nested.len(), 1, "{body}");
            assert_eq!(nested[0].node.primitive, Primitive::Svg(element));
            assert!(!nested[0].node.style.is_empty(), "its class compiles: {body}");
        }
    // A member the compiler does not model is still looked inside.
    let output = crate::parse_tsx(
            "import { View } from '@hozo/core'; const el = <View>{a ? <Card.Body><View className=\"p-4\" /></Card.Body> : null}</View>",
        );
    let [Child::Verbatim { nested, .. }] = output.roots[0].node.children.as_slice() else {
        panic!("expected one carried child");
    };
    assert_eq!(nested.len(), 1);
    assert_eq!(nested[0].node.primitive, Primitive::View);
}

#[test]
fn primitives_inside_a_render_prop_are_retained_for_nested_lowering() {
    let source = r#"
            import { FlatList, Text } from '@hozo/core'
            const el = <FlatList data={rows} renderItem={({ item }) => <Text className="p-2">{item}</Text>} />
            "#;
    let output = crate::parse_tsx(source);
    let render_item = output.roots[0]
        .node
        .props
        .passthrough
        .iter()
        .find(|prop| {
            let text = &source[prop.span.0.start as usize..prop.span.0.end as usize];
            text.starts_with("renderItem")
        })
        .expect("renderItem should carry its nested primitive");
    assert_eq!(render_item.nested.len(), 1);
    assert_eq!(
        render_item.nested[0].node.primitive,
        hozo_ir::Primitive::Text
    );
}

#[test]
fn spread_after_class_name_is_diagnosed() {
    let output = crate::parse_tsx(
        r#"
            import { View } from '@hozo/core'
            const el = <View className="p-4" {...rest} />
            "#,
    );
    assert_eq!(output.diagnostics.len(), 1);
    assert_eq!(
        output.diagnostics[0].code,
        DiagnosticCode::UnsafePropSpreadAfterStyle
    );
    // Still emitted despite the warning -- dropping it would be worse.
    assert_eq!(output.roots[0].node.props.passthrough.len(), 1);
}

#[test]
fn spread_before_class_name_is_not_diagnosed() {
    // Safe ordering: className comes last, so it wins under JSX's
    // last-wins duplicate resolution -- nothing to warn about.
    let output = crate::parse_tsx(
        r#"
            import { View } from '@hozo/core'
            const el = <View {...rest} className="p-4" />
            "#,
    );
    assert!(output.diagnostics.is_empty());
    assert_eq!(output.roots[0].node.props.passthrough.len(), 1);
}

#[test]
fn boolean_shorthand_disabled_is_a_static_true_condition() {
    // No expression to take a span from, so it can't become a
    // ConditionExpr -- but it must still reach the output.
    let source = r#"
            import { Button } from '@hozo/core'
            const el = <Button disabled>Save</Button>
            "#;
    let output = crate::parse_tsx(source);
    let root = &output.roots[0].node;
    assert_eq!(root.props.disabled, Some(ConditionExpr::Static(true)));
    assert!(passthrough_texts(source, root).is_empty());
}

#[test]
fn dynamic_accessibility_role_reaches_output_even_though_it_is_not_modeled() {
    let source = r#"
            import { Pressable } from '@hozo/core'
            const el = <Pressable accessibilityRole={computedRole}>Go</Pressable>
            "#;
    let output = crate::parse_tsx(source);
    let root = &output.roots[0].node;
    assert_eq!(root.props.accessibility_role, None);
    assert_eq!(
        passthrough_texts(source, root),
        vec!["accessibilityRole={computedRole}"]
    );
}

#[test]
fn invalid_semantic_nesting_is_diagnosed_without_guessing_through_expressions() {
    let source = r#"
            import { Paragraph, Section } from '@hozo/core'
            const el = <Paragraph>Intro<Section>Details</Section>{extra}</Paragraph>
            "#;
    let output = crate::parse_tsx(source);
    let semantic: Vec<_> = output
        .diagnostics
        .iter()
        .filter(|diagnostic| diagnostic.code == DiagnosticCode::InvalidSemanticNesting)
        .collect();
    assert_eq!(semantic.len(), 1);
    assert!(semantic[0].message.contains("Section"));
}

#[test]
fn list_requires_static_direct_children_to_be_list_items() {
    let source = r#"
            import { List, ListItem, Paragraph } from '@hozo/core'
            const el = <List><ListItem>Good</ListItem><Paragraph>Bad</Paragraph>{items.map(render)}</List>
            "#;
    let output = crate::parse_tsx(source);
    let semantic: Vec<_> = output
        .diagnostics
        .iter()
        .filter(|diagnostic| diagnostic.code == DiagnosticCode::InvalidSemanticNesting)
        .collect();
    assert_eq!(semantic.len(), 1);
    assert!(semantic[0].message.contains("Paragraph"));
}

#[test]
fn parses_on_press_and_accessibility_role() {
    let output = crate::parse_tsx(
        r#"
            import { Pressable } from '@hozo/core'
            const el = (
              <Pressable onPress={handlePress} accessibilityRole="button">
                Go
              </Pressable>
            )
            "#,
    );
    let root = &output.roots[0].node;
    assert!(root.props.on_press.is_some());
    assert_eq!(
        root.props.accessibility_role,
        Some(AccessibilityRole::Button)
    );
}

#[test]
fn parses_disabled_as_an_opaque_condition_expr() {
    let output = crate::parse_tsx(
        r#"
            import { Button } from '@hozo/core'
            const el = <Button disabled={isLoading}>Save</Button>
            "#,
    );
    let root = &output.roots[0].node;
    assert!(matches!(root.props.disabled, Some(ConditionExpr::Ref(_))));
}

#[test]
fn accessibility_role_link_is_recognized() {
    let output = crate::parse_tsx(
        r#"
            import { Pressable } from '@hozo/core'
            const el = <Pressable accessibilityRole="link">Home</Pressable>
            "#,
    );
    assert_eq!(
        output.roots[0].node.props.accessibility_role,
        Some(AccessibilityRole::Link)
    );
}

#[test]
fn dynamic_accessibility_role_is_not_recognized() {
    // Conservative on purpose (see `accessibility_role_from_value`'s
    // doc comment): a role Hozo can't verify statically is treated as
    // absent, so the interactive-without-role diagnostic can still
    // fire rather than being silently suppressed by an unknown value.
    let output = crate::parse_tsx(
        r#"
            import { Pressable } from '@hozo/core'
            const el = <Pressable accessibilityRole={computedRole}>Go</Pressable>
            "#,
    );
    assert_eq!(output.roots[0].node.props.accessibility_role, None);
}
