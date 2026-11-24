use super::*;

#[test]
fn props_spreads_become_ir_and_keep_dynamic_guards() {
    let parsed = crate::parse_tsx(
        r#"
        import * as stylex from '@stylexjs/stylex'
        import { View } from '@hozo/core'
        const styles = stylex.create({
          root: { padding: 16, backgroundColor: '#f00' },
          active: { opacity: 0.5 }
        })
        const card = <View {...stylex.props(styles.root, active && styles.active)} />
    "#,
    );
    let node = &parsed.roots[0].node;
    assert_eq!(node.style.len(), 6);
    assert!(node.props.passthrough.is_empty());
    assert_eq!(
        node.style
            .iter()
            .filter(|declaration| { matches!(declaration.condition, Condition::Expr(_)) })
            .count(),
        1
    );
}

#[test]
fn nested_media_becomes_viewport_and_environment_conditions() {
    let parsed = crate::parse_tsx(
        r#"
        import * as stylex from '@stylexjs/stylex'
        import { View } from '@hozo/core'
        const styles = stylex.create({
          root: {
            padding: 4,
            '@media (min-width: 600px)': { padding: 24 },
            '@media (prefers-color-scheme: dark)': { opacity: 0.5 }
          }
        })
        const card = <View {...stylex.props(styles.root)} />
    "#,
    );
    assert!(parsed.diagnostics.is_empty(), "{:?}", parsed.diagnostics);
    let style = &parsed.roots[0].node.style;
    assert_eq!(style.len(), 9);
    assert_eq!(
        style
            .iter()
            .filter(|declaration| {
                declaration.condition
                    == Condition::Width {
                        at_least: true,
                        value: "600px".to_string(),
                    }
            })
            .count(),
        4
    );
    assert_eq!(
        style
            .iter()
            .filter(|declaration| declaration.condition == Condition::Dark)
            .count(),
        1
    );
    assert!(matches!(
        style.first().map(|declaration| &declaration.condition),
        Some(Condition::Always)
    ));
    assert!(matches!(
        style.last().map(|declaration| &declaration.condition),
        Some(Condition::Dark)
    ));
}

#[test]
fn nested_interaction_pseudos_become_existing_cross_platform_conditions() {
    let parsed = crate::parse_tsx(
        r#"
        import * as stylex from '@stylexjs/stylex'
        import { Pressable } from '@hozo/core'
        const styles = stylex.create({
          root: {
            opacity: 1,
            ':hover': { opacity: 0.75 },
            ':focus-visible': { opacity: 0.5 },
            ':active': { transform: 'scale(0.95)' }
          }
        })
        const card = <Pressable accessibilityRole="button" {...stylex.props(styles.root)} />
    "#,
    );
    assert!(parsed.diagnostics.is_empty(), "{:?}", parsed.diagnostics);
    let style = &parsed.roots[0].node.style;
    assert_eq!(style.len(), 4);
    assert_eq!(style[0].condition, Condition::Always);
    assert_eq!(style[1].condition, Condition::FocusVisible);
    assert_eq!(style[2].condition, Condition::Hover);
    assert_eq!(style[3].condition, Condition::Pressed);
}

// Decision 007, amendment 1: StyleX says enter and exit with the same
// conditions Tailwind's `starting:` and `data-[state=closed]:` parse to.
#[test]
fn starting_style_and_presence_state_keys_are_the_tailwind_conditions() {
    let parsed = crate::parse_tsx(
        r#"
        import * as stylex from '@stylexjs/stylex'
        import { View } from '@hozo/core'
        const styles = stylex.create({
          root: {
            opacity: 1,
            '@starting-style': { opacity: 0 },
            '[data-state="closed"]': { opacity: 0 },
            "[data-state='open']": { opacity: 1 },
            '[data-state=closed]': { transform: 'translateY(16px)' },
            '[data-active]': { opacity: 0.5 }
          }
        })
        const card = <View {...stylex.props(styles.root)} />
    "#,
    );
    assert!(
        parsed
            .diagnostics
            .iter()
            .all(|d| d.code != hozo_ir::DiagnosticCode::StylexNotLowered),
        "{:?}",
        parsed.diagnostics
    );
    let conditions: Vec<_> = parsed.roots[0]
        .node
        .style
        .iter()
        .map(|d| d.condition.clone())
        .collect();
    assert!(
        conditions.contains(&Condition::StartingStyle),
        "{conditions:?}"
    );
    let closed = Condition::DataAttribute(r#"[data-state="closed"]"#.to_string());
    // Quoted or not, the same text Tailwind's variant gives.
    assert_eq!(
        conditions.iter().filter(|c| **c == closed).count(),
        2,
        "{conditions:?}"
    );
    assert!(conditions.contains(&Condition::DataAttribute(
        r#"[data-state="open"]"#.to_string()
    )));
    assert!(conditions.contains(&Condition::DataAttribute("[data-active]".to_string())));
    let tailwind = crate::parse_tsx(
        "import { View } from '@hozo/core'
const card = <View className=\"data-[state=closed]:opacity-0\" />
",
    );
    assert_eq!(tailwind.roots[0].node.style[0].condition, closed);
}

#[test]
fn other_attribute_keys_stay_with_official_stylex() {
    for key in [
        "[data-x~=a]",
        "[aria-expanded=true]",
        "[data-x=\"a b\"]",
        "[data-]",
    ] {
        let source = format!(
            "import * as stylex from '@stylexjs/stylex'
             import {{ View }} from '@hozo/core'
             const styles = stylex.create({{ root: {{ '{key}': {{ opacity: 0 }} }} }})
             const card = <View {{...stylex.props(styles.root)}} />
"
        );
        let parsed = crate::parse_tsx(&source);
        assert!(
            parsed
                .diagnostics
                .iter()
                .any(|d| d.code == hozo_ir::DiagnosticCode::StylexNotLowered),
            "{key}: {:?}",
            parsed.diagnostics
        );
    }
}

// The conditions inside the value, which is how StyleX's own
// documentation writes them, land on the same entries as the
// nested-object form.
#[test]
fn conditions_inside_a_value_are_the_nested_form_written_the_other_way() {
    let style = |rule: &str| {
        let source = format!(
            "import * as stylex from '@stylexjs/stylex'\n\
             import {{ Pressable }} from '@hozo/core'\n\
             const styles = stylex.create({{ root: {{ {rule} }} }})\n\
             const card = <Pressable accessibilityRole=\"button\" {{...stylex.props(styles.root)}} />\n"
        );
        let parsed = crate::parse_tsx(&source);
        assert!(
            parsed.diagnostics.is_empty(),
            "{rule}: {:?}",
            parsed.diagnostics
        );
        // These equivalent source forms have different attribute offsets.
        parsed.roots[0]
            .node
            .style
            .iter()
            .cloned()
            .map(|mut declaration| {
                declaration.source = Default::default();
                declaration
            })
            .collect::<Vec<_>>()
    };
    assert_eq!(
        style("opacity: { default: 1, ':hover': 0.5, ':focus-visible': 0.25 }"),
        style("opacity: 1, ':hover': { opacity: 0.5 }, ':focus-visible': { opacity: 0.25 }"),
    );
    assert_eq!(
        style("opacity: { default: 1, ':hover': { default: 0.5, '@media (min-width: 600px)': 0.25 } }"),
        style("opacity: 1, ':hover': { opacity: 0.5, '@media (min-width: 600px)': { opacity: 0.25 } }"),
    );
}

#[test]
fn a_null_default_is_no_value_at_all() {
    let parsed = crate::parse_tsx(
        r#"
        import * as stylex from '@stylexjs/stylex'
        import { Pressable } from '@hozo/core'
        const styles = stylex.create({ root: { opacity: { default: null, ':hover': 0.5 } } })
        const card = <Pressable accessibilityRole="button" {...stylex.props(styles.root)} />
    "#,
    );
    let style = &parsed.roots[0].node.style;
    assert_eq!(style.len(), 1, "{style:?}");
    assert_eq!(style[0].condition, Condition::Hover);
}

#[test]
fn one_unreadable_branch_keeps_the_whole_value_for_official_stylex() {
    let parsed = crate::parse_tsx(
        r#"
        import * as stylex from '@stylexjs/stylex'
        import { View } from '@hozo/core'
        const styles = stylex.create({ root: { opacity: { default: 1, ':nth-child(2)': 0.5 }, padding: 4 } })
        const card = <View {...stylex.props(styles.root)} />
    "#,
    );
    assert!(
        parsed
            .diagnostics
            .iter()
            .any(|d| d.code == hozo_ir::DiagnosticCode::StylexNotLowered),
        "{:?}",
        parsed.diagnostics
    );
    // Not half of it: no unconditional opacity was taken out of a value
    // whose other half stays with StyleX.
    assert!(!parsed.roots[0]
        .node
        .style
        .iter()
        .any(|d| matches!(d.property, StyleProperty::Opacity(_))));
}

#[test]
fn nested_pseudos_compose_in_the_selector_order_stylex_emits() {
    let parsed = crate::parse_tsx(
        r#"
        import * as stylex from '@stylexjs/stylex'
        import { Pressable } from '@hozo/core'
        const styles = stylex.create({
          root: { ':hover': { ':focus': { opacity: 0.5 } } }
        })
        const card = <Pressable accessibilityRole="button" {...stylex.props(styles.root)} />
    "#,
    );
    assert!(parsed.diagnostics.is_empty(), "{:?}", parsed.diagnostics);
    let [declaration] = parsed.roots[0].node.style.as_slice() else {
        panic!("expected one nested declaration")
    };
    assert_eq!(
        declaration.condition,
        Condition::All(vec![Condition::Focus, Condition::Hover])
    );
}

#[test]
fn unsupported_pseudo_blocks_stay_whole_for_official_stylex() {
    let source = r#"
        import * as stylex from '@stylexjs/stylex'
        import { View } from '@hozo/core'
        const styles = stylex.create({
          root: {
            opacity: 1,
            ':checked': { opacity: 0.5, padding: 8 }
          }
        })
        const card = <View {...stylex.props(styles.root)} />
    "#;
    let parsed = crate::parse_tsx(source);
    let node = &parsed.roots[0].node;
    assert_eq!(node.style.len(), 1);
    assert_eq!(node.props.stylex_residuals.len(), 1);
    let residual = node.props.stylex_residuals[0].render_expression(source);
    assert_eq!(residual.matches(":checked").count(), 1, "{residual}");
    assert!(residual.contains("opacity: 0.5"), "{residual}");
    assert!(residual.contains("padding: 8"), "{residual}");
    assert!(!residual.contains("opacity: 1"), "{residual}");
}

#[test]
fn nested_media_compose_in_official_wrapper_order_and_with_props_guards() {
    let parsed = crate::parse_tsx(
        r#"
        import * as stylex from '@stylexjs/stylex'
        import { View } from '@hozo/core'
        const styles = stylex.create({
          root: {
            '@media (min-width: 600px)': {
              '@media (orientation: landscape)': { opacity: 0.5 }
            }
          }
        })
        const card = <View {...stylex.props(active && styles.root)} />
    "#,
    );
    assert!(parsed.diagnostics.is_empty(), "{:?}", parsed.diagnostics);
    let [declaration] = parsed.roots[0].node.style.as_slice() else {
        panic!("expected one nested declaration")
    };
    let Condition::All(conditions) = &declaration.condition else {
        panic!("nested conditions were not composed")
    };
    assert_eq!(conditions.len(), 3);
    assert_eq!(
        conditions[0],
        Condition::Environment(Environment::Landscape)
    );
    assert_eq!(
        conditions[1],
        Condition::Width {
            at_least: true,
            value: "600px".to_string()
        }
    );
    assert!(matches!(conditions[2], Condition::Expr(_)));
}

#[test]
fn mixed_nested_media_stays_whole_in_the_stylex_residual() {
    let source = r#"
        import * as stylex from '@stylexjs/stylex'
        import { View } from '@hozo/core'
        const styles = stylex.create({
          root: {
            opacity: 1,
            '@media (min-width: 600px)': {
              padding: 24,
              behavior: 'url(example.htc)'
            }
          }
        })
        const card = <View {...stylex.props(styles.root)} />
    "#;
    let parsed = crate::parse_tsx(source);
    let node = &parsed.roots[0].node;
    assert_eq!(node.style.len(), 1);
    assert_eq!(node.props.stylex_residuals.len(), 1);
    let residual = node.props.stylex_residuals[0].render_expression(source);
    assert_eq!(
        residual.matches("@media (min-width: 600px)").count(),
        1,
        "{residual}"
    );
    assert!(residual.contains("padding: 24"), "{residual}");
    assert!(
        residual.contains("behavior: 'url(example.htc)'"),
        "{residual}"
    );
    assert!(!residual.contains("opacity: 1"), "{residual}");
}

#[test]
fn recursive_arrays_and_ternaries_keep_their_guards() {
    let parsed = crate::parse_tsx(
        r#"
        import * as stylex from '@stylexjs/stylex'
        import { View } from '@hozo/core'
        const styles = stylex.create({
          root: { padding: 16 },
          active: { opacity: 0.5 },
          inactive: { opacity: 1 }
        })
        const first = <View {...stylex.props([styles.root, [active && styles.active]])} />
        const second = <View {...stylex.props(active ? styles.active : styles.inactive)} />
    "#,
    );
    assert!(parsed.diagnostics.is_empty(), "{:?}", parsed.diagnostics);
    let array_style = &parsed.roots[0].node.style;
    assert_eq!(array_style.len(), 5);
    assert_eq!(
        array_style
            .iter()
            .filter(|declaration| matches!(declaration.condition, Condition::Expr(_)))
            .count(),
        1
    );
    let ternary_style = &parsed.roots[1].node.style;
    assert_eq!(ternary_style.len(), 2);
    assert!(ternary_style.iter().any(|declaration| {
        matches!(
            declaration.condition,
            Condition::Expr(ConditionExpr::Ref(_))
        )
    }));
    assert!(ternary_style.iter().any(|declaration| {
        matches!(
            declaration.condition,
            Condition::Expr(ConditionExpr::Not(_))
        )
    }));
}

#[test]
fn ternary_partial_residuals_rebuild_both_conditions() {
    let source = r#"
        import * as stylex from '@stylexjs/stylex'
        import { View } from '@hozo/core'
        const styles = stylex.create({
          active: { opacity: 0.5, behavior: 'url(example.htc)' },
          inactive: { padding: 8, border: 'solid' }
        })
        const card = <View {...stylex.props(active ? styles.active : styles.inactive)} />
    "#;
    let parsed = crate::parse_tsx(source);
    let node = &parsed.roots[0].node;
    assert_eq!(node.style.len(), 5);
    assert!(node.props.passthrough.is_empty());
    assert_eq!(node.props.stylex_residuals.len(), 1);
    let residual = node.props.stylex_residuals[0].render_expression(source);
    assert!(residual.contains("(active)"), "{residual}");
    assert!(residual.contains("!(active)"), "{residual}");
    assert!(
        residual.contains("behavior: 'url(example.htc)'"),
        "{residual}"
    );
    assert!(residual.contains("border: 'solid'"), "{residual}");
    assert!(!residual.contains("opacity: 0.5"), "{residual}");
    assert!(!residual.contains("padding: 8"), "{residual}");
}

#[test]
fn module_const_object_spreads_flatten_in_source_order() {
    let source = r#"
        import * as stylex from '@stylexjs/stylex'
        import { View } from '@hozo/core'
        const inset = { padding: 8 }
        const shared = { ...inset, opacity: 0.5, behavior: 'url(example.htc)' }
        const styles = stylex.create({
          root: { ...shared, ...{ marginTop: 4 }, opacity: 0.75 }
        })
        const card = <View {...stylex.props(styles.root)} />
    "#;
    let parsed = crate::parse_tsx(source);
    let node = &parsed.roots[0].node;
    assert_eq!(node.style.len(), 6);
    assert!(node
        .style
        .iter()
        .any(|declaration| { matches!(declaration.property, StyleProperty::Opacity(0.75)) }));
    assert!(!node
        .style
        .iter()
        .any(|declaration| { matches!(declaration.property, StyleProperty::Opacity(0.5)) }));
    assert_eq!(node.props.stylex_residuals.len(), 1);
    let residual = node.props.stylex_residuals[0].render_expression(source);
    assert!(
        residual.contains("behavior: 'url(example.htc)'"),
        "{residual}"
    );
    assert!(!residual.contains("opacity"), "{residual}");
    assert!(!residual.contains("padding"), "{residual}");
}

#[test]
fn mutable_escaped_late_and_dynamic_object_spreads_remain_official_stylex() {
    let parsed = crate::parse_tsx(
        r#"
        import * as stylex from '@stylexjs/stylex'
        import { View } from '@hozo/core'
        let mutable = { opacity: 0.5 }
        const escaped = { opacity: 0.5 }
        escaped.opacity = 0.75
        const mutableStyles = stylex.create({ root: { ...mutable, padding: 8 } })
        const escapedStyles = stylex.create({ root: { ...escaped, padding: 8 } })
        const lateStyles = stylex.create({ root: { ...late, padding: 8 } })
        const late = { opacity: 0.5 }
        const dynamicStyles = stylex.create({ root: { ...makeStyles(), padding: 8 } })
        const one = <View {...stylex.props(mutableStyles.root)} />
        const two = <View {...stylex.props(escapedStyles.root)} />
        const three = <View {...stylex.props(lateStyles.root)} />
        const four = <View {...stylex.props(dynamicStyles.root)} />
    "#,
    );
    assert_eq!(parsed.roots.len(), 4);
    for root in &parsed.roots {
        assert!(root.node.style.is_empty());
        assert_eq!(root.node.props.passthrough.len(), 1);
    }
    assert_eq!(parsed.diagnostics.len(), 4);
    assert!(parsed
        .diagnostics
        .iter()
        .all(|diagnostic| { diagnostic.code == hozo_ir::DiagnosticCode::StylexNotLowered }));
}

#[test]
fn a_later_unconditional_style_removes_an_earlier_conditional_property() {
    let parsed = crate::parse_tsx(
        r#"
        import * as stylex from '@stylexjs/stylex'
        import { View } from '@hozo/core'
        const styles = stylex.create({
          active: { opacity: 0.5 },
          base: { opacity: 1 }
        })
        const card = <View {...stylex.props(active && styles.active, styles.base)} />
    "#,
    );
    let style = &parsed.roots[0].node.style;
    assert_eq!(style.len(), 1);
    assert_eq!(style[0].condition, Condition::Always);
}

#[test]
fn unsupported_stylex_is_carried_and_diagnosed_at_the_jsx_use() {
    let parsed = crate::parse_tsx(
        r#"
        import * as stylex from '@stylexjs/stylex'
        import { View } from '@hozo/core'
        const styles = stylex.create({ root: { transform: 'translateX(calc(100% - 2px))' } })
        const card = <View {...stylex.props(styles.root)} />
    "#,
    );
    let node = &parsed.roots[0].node;
    assert_eq!(node.style.len(), 0);
    assert_eq!(node.props.passthrough.len(), 1);
    assert_eq!(parsed.diagnostics.len(), 1);
    assert_eq!(
        parsed.diagnostics[0].code,
        hozo_ir::DiagnosticCode::StylexNotLowered
    );
    assert!(parsed.diagnostics[0].span.start >= node.span.start);
}

#[test]
fn supported_declarations_survive_beside_a_static_stylex_residual() {
    let source = r#"
        import * as stylex from '@stylexjs/stylex'
        import { View } from '@hozo/core'
        const styles = stylex.create({
          root: { padding: 16, behavior: 'url(example.htc)' }
        })
        const card = <View {...stylex.props(styles.root)} />
    "#;
    let parsed = crate::parse_tsx(source);
    let node = &parsed.roots[0].node;
    assert_eq!(node.style.len(), 4);
    assert!(node.props.passthrough.is_empty());
    assert_eq!(node.props.stylex_residuals.len(), 1);
    let residual = node.props.stylex_residuals[0].render_expression(source);
    assert!(residual.contains("behavior: 'url(example.htc)'"));
    assert!(!residual.contains("padding: 16"));
    assert_eq!(parsed.diagnostics.len(), 1);
    assert!(parsed.diagnostics[0].span.start >= node.span.start);
}

#[test]
fn an_overlapping_residual_keeps_the_original_stylex_call_intact() {
    let parsed = crate::parse_tsx(
        r#"
        import * as stylex from '@stylexjs/stylex'
        import { View } from '@hozo/core'
        const styles = stylex.create({
          root: {
            transform: 'rotate(10deg)',
            transform: 'translateX(calc(100% - 2px))'
          }
        })
        const card = <View {...stylex.props(styles.root)} />
    "#,
    );
    let node = &parsed.roots[0].node;
    assert!(node.style.is_empty());
    assert_eq!(node.props.passthrough.len(), 1);
    assert!(node.props.stylex_residuals.is_empty());
    assert!(parsed.diagnostics[0]
        .message
        .contains("cascade is not approximated"));
}

#[test]
fn function_local_sheets_are_declined_until_bindings_are_scope_resolved() {
    let parsed = crate::parse_tsx(
        r#"
        import * as stylex from '@stylexjs/stylex'
        import { View } from '@hozo/core'
        function Card() {
          const styles = stylex.create({ root: { padding: 16 } })
          return <View {...stylex.props(styles.root)} />
        }
    "#,
    );
    assert!(parsed.roots[0].node.style.is_empty());
    assert_eq!(
        parsed.diagnostics[0].code,
        hozo_ir::DiagnosticCode::StylexNotLowered
    );
    assert!(parsed.diagnostics[0].message.contains("module-scope"));
}
