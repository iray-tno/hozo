use super::*;

#[test]
fn collects_static_universal_properties() {
    let frontend = frontend(
        r#"
        import * as stylex from '@stylexjs/stylex'
        const styles = stylex.create({
          root: { padding: 16, backgroundColor: '#f00', flexDirection: 'row' }
        })
    "#,
    );
    let Rule::Ready { entries, .. } = &frontend.sheets["styles"]["root"] else {
        panic!("rule was not lowerable")
    };
    assert_eq!(
        entries
            .iter()
            .map(|entry| entry.properties.len())
            .sum::<usize>(),
        6
    ); // four padding sides, colour, direction
}

#[test]
fn local_unthemeable_define_vars_defaults_become_static_values() {
    let frontend = frontend(
        r#"
        import * as stylex from '@stylexjs/stylex'
        const tokens = stylex.defineVars({ accent: '#123456', space: 12 })
        const styles = stylex.create({
          root: { color: tokens.accent, padding: tokens.space }
        })
    "#,
    );
    let Rule::Ready {
        entries,
        residual,
        gaps,
    } = &frontend.sheets["styles"]["root"]
    else {
        panic!("static local variables should be lowerable")
    };
    assert!(residual.is_empty());
    assert!(gaps.is_empty());
    assert!(entries.iter().any(|entry| {
        entry
            .properties
            .contains(&StyleProperty::TextColor(Color::Css("#123456".into())))
    }));
    assert_eq!(
        entries
            .iter()
            .flat_map(|entry| &entry.properties)
            .filter(|property| {
                matches!(
                    property,
                    StyleProperty::PaddingTop(hozo_ir::Dimension::Length(Length::Px(12.0)))
                )
            })
            .count(),
        1
    );
}

#[test]
fn themeable_define_vars_stay_with_official_stylex() {
    let themed = frontend(
        r#"
        import * as stylex from '@stylexjs/stylex'
        const tokens = stylex.defineVars({ accent: '#123456' })
        const dark = stylex.createTheme(tokens, { accent: '#abcdef' })
        const styles = stylex.create({ root: { color: tokens.accent } })
    "#,
    );
    let Rule::Ready {
        entries,
        residual,
        gaps,
    } = &themed.sheets["styles"]["root"]
    else {
        panic!("the themed value should remain a property residual")
    };
    assert!(entries.is_empty());
    assert_eq!(residual.len(), 1);
    assert_eq!(gaps.len(), 1);

    let exported = frontend(
        r#"
        import * as stylex from '@stylexjs/stylex'
        const tokens = stylex.defineVars({ accent: '#123456' })
        export { tokens }
        const styles = stylex.create({ root: { color: tokens.accent } })
    "#,
    );
    let Rule::Ready {
        entries,
        residual,
        gaps,
    } = &exported.sheets["styles"]["root"]
    else {
        panic!("an exported token should remain a property residual")
    };
    assert!(entries.is_empty());
    assert_eq!(residual.len(), 1);
    assert_eq!(gaps.len(), 1);
}

#[test]
fn statically_called_function_styles_become_typed_ir() {
    let source = r#"
        import * as stylex from '@stylexjs/stylex'
        import { View } from '@hozo/core'
        const styles = stylex.create({
          dynamic: (value) => ({ opacity: value, backgroundColor: '#123456' })
        })
        export const Card = () => <View {...stylex.props(styles.dynamic(0.5))} />
    "#;
    let parsed = crate::parse_tsx(source);
    assert!(parsed.diagnostics.is_empty(), "{:?}", parsed.diagnostics);
    let style = &parsed.roots[0].node.style;
    assert!(style
        .iter()
        .any(|declaration| declaration.property == StyleProperty::Opacity(0.5)));
    assert!(style.iter().any(|declaration| {
        declaration.property == StyleProperty::BackgroundColor(Color::Css("#123456".into()))
    }));
    assert!(parsed.roots[0].node.props.stylex_residuals.is_empty());
}

#[test]
fn runtime_function_style_arguments_remain_with_official_stylex() {
    let source = r#"
        import * as stylex from '@stylexjs/stylex'
        import { View } from '@hozo/core'
        const styles = stylex.create({ dynamic: (value) => ({ opacity: value }) })
        export const Card = ({ value }) => (
          <View {...stylex.props(styles.dynamic(value))} />
        )
    "#;
    let parsed = crate::parse_tsx(source);
    let node = &parsed.roots[0].node;
    assert!(node.style.is_empty());
    assert!(node.props.stylex_residuals.is_empty());
    assert_eq!(node.props.passthrough.len(), 1);
    assert_eq!(parsed.diagnostics.len(), 1);
    assert!(parsed.diagnostics[0].message.contains("runtime argument"));
}

#[test]
fn static_function_styles_keep_stylex_argument_order() {
    let source = r#"
        import * as stylex from '@stylexjs/stylex'
        import { View } from '@hozo/core'
        const styles = stylex.create({
          base: { opacity: 0.75 },
          dynamic: (value) => ({ opacity: value })
        })
        export const A = () => (
          <View {...stylex.props(styles.dynamic(0.5), styles.base)} />
        )
        export const B = () => (
          <View {...stylex.props(styles.base, styles.dynamic(0.5))} />
        )
    "#;
    let parsed = crate::parse_tsx(source);
    assert!(parsed.diagnostics.is_empty(), "{:?}", parsed.diagnostics);
    assert!(parsed.roots[0]
        .node
        .style
        .iter()
        .any(|declaration| declaration.property == StyleProperty::Opacity(0.75)));
    assert!(parsed.roots[1]
        .node
        .style
        .iter()
        .any(|declaration| declaration.property == StyleProperty::Opacity(0.5)));
}

#[test]
fn first_that_works_preserves_preference_order_in_typed_ir() {
    let frontend = frontend(
        r#"
        import * as sx from '@stylexjs/stylex'
        const styles = sx.create({
          root: { display: sx.firstThatWorks('grid', 'flex') }
        })
    "#,
    );
    let Rule::Ready {
        entries,
        residual,
        gaps,
    } = &frontend.sheets["styles"]["root"]
    else {
        panic!("rule was not lowerable")
    };
    assert!(residual.is_empty());
    assert!(gaps.is_empty());
    assert_eq!(
        entries[0].properties,
        vec![StyleProperty::FirstThatWorks(vec![
            StyleProperty::Display(hozo_ir::Display::Grid),
            StyleProperty::Display(hozo_ir::Display::Flex),
        ])]
    );
}

#[test]
fn dynamic_first_that_works_remains_with_official_stylex() {
    let frontend = frontend(
        r#"
        import * as stylex from '@stylexjs/stylex'
        const styles = stylex.create({
          root: { display: stylex.firstThatWorks(preferred, 'flex') }
        })
    "#,
    );
    let Rule::Ready {
        entries,
        residual,
        gaps,
    } = &frontend.sheets["styles"]["root"]
    else {
        panic!("dynamic fallback should remain as a residual")
    };
    assert!(entries.is_empty());
    assert_eq!(residual.len(), 1);
    assert_eq!(gaps.len(), 1);
    assert!(gaps[0].message.contains("firstThatWorks"));
}

#[test]
fn unsupported_properties_are_named_gaps() {
    let frontend = frontend(
        r#"
        import * as stylex from '@stylexjs/stylex'
        const styles = stylex.create({ root: { transform: 'translateX(calc(100% - 2px))' } })
    "#,
    );
    let Rule::Ready {
        entries,
        residual,
        gaps,
    } = &frontend.sheets["styles"]["root"]
    else {
        panic!("static unsupported property should remain as a residual")
    };
    assert!(entries.is_empty());
    assert_eq!(residual.len(), 1);
    assert_eq!(gaps.len(), 1);
}

#[test]
fn ordered_static_transforms_and_origin_become_typed_ir() {
    let frontend = frontend(
        r#"
        import * as stylex from '@stylexjs/stylex'
        const styles = stylex.create({
          root: {
            transform: 'translateX(12px) rotate(10deg) scale(0.9)',
            transformOrigin: 'left top'
          }
        })
    "#,
    );
    let Rule::Ready { entries, .. } = &frontend.sheets["styles"]["root"] else {
        panic!("rule was not lowerable")
    };
    assert_eq!(
        entries[0].properties,
        vec![StyleProperty::Transform(vec![
            TransformFunction::TranslateX(Dimension::Length(Length::Px(12.0))),
            TransformFunction::Rotate(Angle::Deg(10.0)),
            TransformFunction::Scale(0.9),
        ])]
    );
    assert_eq!(
        entries[1].properties,
        vec![StyleProperty::TransformOrigin("left top".to_string())]
    );
}

#[test]
fn standalone_transform_properties_preserve_components_in_typed_ir() {
    let frontend = frontend(
        r#"
        import * as stylex from '@stylexjs/stylex'
        const styles = stylex.create({
          root: {
            translate: '12px 25%',
            rotate: '10deg',
            scale: '0.9 110%'
          }
        })
    "#,
    );
    let Rule::Ready {
        entries,
        residual,
        gaps,
    } = &frontend.sheets["styles"]["root"]
    else {
        panic!("rule was not lowerable")
    };
    assert!(residual.is_empty());
    assert!(gaps.is_empty());
    assert_eq!(
        entries[0].properties,
        vec![StyleProperty::Translate(vec![
            Dimension::Length(Length::Px(12.0)),
            Dimension::Percent(25.0),
        ])]
    );
    assert_eq!(
        entries[1].properties,
        vec![StyleProperty::Rotate(Angle::Deg(10.0))]
    );
    assert_eq!(
        entries[2].properties,
        vec![StyleProperty::Scale(vec![
            Scale::Ratio(0.9),
            Scale::Percent(110.0),
        ])]
    );
}

#[test]
fn wider_standalone_transform_values_remain_official_residuals() {
    let frontend = frontend(
        r#"
        import * as stylex from '@stylexjs/stylex'
        const styles = stylex.create({
          root: {
            translate: 'calc(100% - 2px)',
            rotate: '0.25turn',
            scale: 'none'
          }
        })
    "#,
    );
    let Rule::Ready {
        entries,
        residual,
        gaps,
    } = &frontend.sheets["styles"]["root"]
    else {
        panic!("rule should retain unsupported values as residuals")
    };
    assert!(entries.is_empty());
    assert_eq!(residual.len(), 3);
    assert_eq!(gaps.len(), 3);
}

#[test]
fn static_grid_values_become_the_existing_contextual_ir() {
    let frontend = frontend(
        r#"
        import * as stylex from '@stylexjs/stylex'
        const styles = stylex.create({
          grid: {
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gridTemplateRows: '80px minmax(120px, 2fr) 1fr'
          },
          span: { gridColumn: 'span 2 / span 2', gridRow: '1 / -1' },
          lines: {
            gridColumnStart: 2,
            gridColumnEnd: -1,
            gridRowStart: '2',
            gridRowEnd: 'auto'
          },
          area: { gridArea: '1 / 2 / 3 / -1' },
          template: { gridTemplate: '80px 1fr / 120px 2fr' },
          shorthand: { grid: '80px 1fr / 120px 2fr' }
        })
    "#,
    );
    let Rule::Ready { entries: grid, .. } = &frontend.sheets["styles"]["grid"] else {
        panic!("grid rule was not lowerable")
    };
    assert_eq!(
        grid[0].properties,
        vec![StyleProperty::GridTemplateColumns(GridTracks::Css(
            "repeat(3,minmax(0,1fr))".to_string()
        ))]
    );
    assert_eq!(
        grid[1].properties,
        vec![StyleProperty::GridTemplateRows(GridTracks::Css(
            "80px minmax(120px,2fr) 1fr".to_string()
        ))]
    );
    let Rule::Ready { entries: span, .. } = &frontend.sheets["styles"]["span"] else {
        panic!("span rule was not lowerable")
    };
    assert_eq!(
        span[0].properties,
        vec![StyleProperty::GridColumn(GridSpan::Span(2))]
    );
    assert_eq!(
        span[1].properties,
        vec![StyleProperty::GridRow(GridSpan::Full)]
    );
    let Rule::Ready { entries: lines, .. } = &frontend.sheets["styles"]["lines"] else {
        panic!("line rule was not lowerable")
    };
    assert_eq!(
        lines[0].properties,
        vec![StyleProperty::GridColumnStart(GridLine::Line(2))]
    );
    assert_eq!(
        lines[1].properties,
        vec![StyleProperty::GridColumnEnd(GridLine::Line(-1))]
    );
    assert_eq!(
        lines[2].properties,
        vec![StyleProperty::GridRowStart(GridLine::Line(2))]
    );
    assert_eq!(
        lines[3].properties,
        vec![StyleProperty::GridRowEnd(GridLine::Auto)]
    );
    let Rule::Ready { entries: area, .. } = &frontend.sheets["styles"]["area"] else {
        panic!("grid area was not lowerable")
    };
    assert_eq!(
        area[0].properties,
        vec![
            StyleProperty::GridRowStart(GridLine::Line(1)),
            StyleProperty::GridColumnStart(GridLine::Line(2)),
            StyleProperty::GridRowEnd(GridLine::Line(3)),
            StyleProperty::GridColumnEnd(GridLine::Line(-1)),
        ]
    );
    let Rule::Ready {
        entries: template, ..
    } = &frontend.sheets["styles"]["template"]
    else {
        panic!("grid template was not lowerable")
    };
    assert_eq!(
        template[0].properties,
        vec![
            StyleProperty::GridTemplateRows(GridTracks::Css("80px 1fr".to_string())),
            StyleProperty::GridTemplateColumns(GridTracks::Css("120px 2fr".to_string())),
        ]
    );
    let Rule::Ready {
        entries: shorthand, ..
    } = &frontend.sheets["styles"]["shorthand"]
    else {
        panic!("grid shorthand was not lowerable")
    };
    assert_eq!(
        shorthand[0].properties,
        vec![
            StyleProperty::GridTemplateRows(GridTracks::Css("80px 1fr".to_string())),
            StyleProperty::GridTemplateColumns(GridTracks::Css("120px 2fr".to_string())),
            StyleProperty::WebOnly("grid-template-areas".to_string(), "none".to_string()),
            StyleProperty::WebOnly("grid-auto-rows".to_string(), "auto".to_string()),
            StyleProperty::WebOnly("grid-auto-columns".to_string(), "auto".to_string()),
            StyleProperty::WebOnly("grid-auto-flow".to_string(), "row".to_string()),
        ]
    );
}

#[test]
fn static_transition_configuration_becomes_the_existing_contextual_ir() {
    let frontend = frontend(
        r#"
        import * as stylex from '@stylexjs/stylex'
        const styles = stylex.create({
          motion: {
            transitionProperty: 'opacity, transform',
            transitionDuration: '.2s',
            transitionTimingFunction: 'ease-in-out'
          }
        })
    "#,
    );
    let Rule::Ready {
        entries,
        residual,
        gaps,
    } = &frontend.sheets["styles"]["motion"]
    else {
        panic!("rule was not lowerable")
    };
    assert!(residual.is_empty());
    assert!(gaps.is_empty());
    assert_eq!(
        entries
            .iter()
            .flat_map(|entry| entry.properties.clone())
            .collect::<Vec<_>>(),
        vec![
            StyleProperty::TransitionProperty("opacity,transform".to_string()),
            StyleProperty::TransitionDuration(200, Origin::Written),
            StyleProperty::TransitionTimingFunction("ease-in-out".to_string(), Origin::Written),
        ]
    );
}

#[test]
fn practical_text_values_become_typed_ir() {
    let frontend = frontend(
        r#"
        import * as stylex from '@stylexjs/stylex'
        const styles = stylex.create({
          text: { fontWeight: 700, whiteSpace: 'nowrap', textOverflow: 'ellipsis' },
          input: { caretColor: '#123456' }
        })
    "#,
    );
    let Rule::Ready { entries: text, .. } = &frontend.sheets["styles"]["text"] else {
        panic!("text values were not lowerable")
    };
    assert_eq!(
        text.iter()
            .flat_map(|entry| entry.properties.clone())
            .collect::<Vec<_>>(),
        vec![
            StyleProperty::FontWeight(FontWeight::Absolute(700)),
            StyleProperty::WhiteSpace(WhiteSpace::NoWrap),
            StyleProperty::TextOverflow(TextOverflow::Ellipsis),
        ]
    );
    let Rule::Ready { entries: input, .. } = &frontend.sheets["styles"]["input"] else {
        panic!("input values were not lowerable")
    };
    assert_eq!(
        input[0].properties,
        vec![StyleProperty::CaretColor(Color::Css("#123456".to_string()))]
    );
}

#[test]
fn static_container_metadata_becomes_the_existing_contextual_ir() {
    let frontend = frontend(
        r#"
        import * as stylex from '@stylexjs/stylex'
        const styles = stylex.create({
          container: { containerName: 'card-shell', containerType: 'inline-size' },
          normal: { containerType: 'normal' }
        })
    "#,
    );
    let Rule::Ready {
        entries,
        residual,
        gaps,
    } = &frontend.sheets["styles"]["container"]
    else {
        panic!("container metadata was not lowerable")
    };
    assert!(residual.is_empty());
    assert!(gaps.is_empty());
    assert_eq!(
        entries
            .iter()
            .flat_map(|entry| entry.properties.clone())
            .collect::<Vec<_>>(),
        vec![
            StyleProperty::ContainerName("card-shell".to_string()),
            StyleProperty::Keyword("container-type", "inline-size"),
        ]
    );
    let Rule::Ready { entries, .. } = &frontend.sheets["styles"]["normal"] else {
        panic!("normal container type was not lowerable")
    };
    assert_eq!(
        entries[0].properties,
        vec![StyleProperty::Keyword("container-type", "normal")]
    );
}

#[test]
fn wider_container_values_remain_official_stylex_and_shorthand_overlap_lowers() {
    let frontend = frontend(
        r#"
        import * as stylex from '@stylexjs/stylex'
        const styles = stylex.create({
          names: { containerName: 'main secondary' },
          digit: { containerName: '-9invalid' },
          overlap: { container: 'card / inline-size', containerType: 'size' }
        })
    "#,
    );
    for name in ["names", "digit"] {
        let Rule::Ready {
            entries,
            residual,
            gaps,
        } = &frontend.sheets["styles"][name]
        else {
            panic!("unsupported static value should remain residual")
        };
        assert!(entries.is_empty());
        assert_eq!(residual.len(), 1);
        assert_eq!(gaps.len(), 1);
    }
    let Rule::Ready {
        entries,
        residual,
        gaps,
    } = &frontend.sheets["styles"]["overlap"]
    else {
        panic!("overlap should remain representable as residual")
    };
    assert_eq!(entries.len(), 2);
    assert!(residual.is_empty());
    assert!(gaps.is_empty());
}

#[test]
fn grid_values_outside_the_native_solver_subset_remain_stylex_gaps() {
    let frontend = frontend(
        r#"
        import * as stylex from '@stylexjs/stylex'
        const styles = stylex.create({
          autoTrack: { gridTemplateColumns: 'auto 1fr' },
          namedLine: { gridColumnStart: 'content' },
          unequalSpan: { gridColumn: 'span 2 / span 3' }
        })
    "#,
    );
    for name in ["autoTrack", "namedLine", "unequalSpan"] {
        let Rule::Ready {
            entries,
            residual,
            gaps,
        } = &frontend.sheets["styles"][name]
        else {
            panic!("static unsupported Grid value should remain as a residual")
        };
        assert!(entries.is_empty());
        assert_eq!(residual.len(), 1);
        assert_eq!(gaps.len(), 1);
    }
}

#[test]
fn place_content_uses_two_final_slots_and_declines_wider_alignment() {
    assert_eq!(
        stylex_place_content(&StaticValue::String("space-between center".to_string())),
        Some(vec![
            StyleProperty::AlignContent(Justify::Between),
            StyleProperty::JustifyContent(Justify::Center),
        ])
    );
    assert!(stylex_place_content(&StaticValue::String("stretch".to_string())).is_none());
    assert!(stylex_place_content(&StaticValue::String("safe center".to_string())).is_none());
    assert_eq!(property_priority("placeContent"), 2000);
    assert!(property_names_overlap("placeContent", "alignContent"));
    assert!(property_names_overlap("placeContent", "justifyContent"));
}

#[test]
fn single_layer_text_shadow_is_typed_and_wider_values_stay_residual() {
    let parsed = crate::parse_tsx(
        r#"
        import * as stylex from '@stylexjs/stylex'
        import { Text } from '@hozo/core'
        const styles = stylex.create({
          portable: { textShadow: 'rgba(0, 0, 0, 0.5) 1px -2px 4px' },
          multiple: { textShadow: '1px 2px #000, 3px 4px red' },
          relative: { textShadow: '1rem 2px 3px red' }
        })
        const label = <Text {...stylex.props(styles.portable)} />
    "#,
    );
    assert!(parsed.diagnostics.is_empty(), "{:?}", parsed.diagnostics);
    let property = &parsed.roots[0].node.style[0].property;
    let StyleProperty::TextShadow(value) = property else {
        panic!("expected typed text shadow, got {property:?}");
    };
    assert_eq!(value.css(), "rgba(0,0,0,.5) 1px -2px 4px");
    assert!(value.portable_parts().is_some());

    for rule in ["multiple", "relative"] {
        let source = format!(
            r#"
            import * as stylex from '@stylexjs/stylex'
            import {{ Text }} from '@hozo/core'
            const styles = stylex.create({{
              multiple: {{ textShadow: '1px 2px #000, 3px 4px red' }},
              relative: {{ textShadow: '1rem 2px 3px red' }}
            }})
            const label = <Text {{...stylex.props(styles.{rule})}} />
        "#,
        );
        let parsed = crate::parse_tsx(&source);
        assert!(parsed.roots[0].node.style.is_empty());
        assert_eq!(
            parsed.diagnostics[0].code,
            hozo_ir::DiagnosticCode::StylexNotLowered
        );
    }
}
