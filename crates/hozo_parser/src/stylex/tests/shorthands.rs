use super::*;

#[test]
fn list_and_column_shorthands_expand_to_atomic_web_slots() {
    let frontend = frontend(
        r#"
        import * as stylex from '@stylexjs/stylex'
        const styles = stylex.create({
          exact: {
            columns: '16rem 3',
            columnRule: '2px dashed rgb(0 0 0)',
            listStyle: 'url(#marker) outside square'
          },
          wider: {
            columns: '3 4',
            columnRule: 'solid dashed red',
            listStyle: 'inside outside disc'
          }
        })
    "#,
    );
    let Rule::Ready {
        entries,
        residual,
        gaps,
    } = &frontend.sheets["styles"]["exact"]
    else {
        panic!("exact shorthand values were not lowerable")
    };
    assert_eq!(entries.len(), 3);
    assert_eq!(
        entries
            .iter()
            .map(|entry| entry.properties.len())
            .sum::<usize>(),
        8
    );
    assert!(entries.iter().all(|entry| entry
        .properties
        .iter()
        .all(|property| { matches!(property, StyleProperty::WebOnly(_, _)) })));
    assert!(residual.is_empty());
    assert!(gaps.is_empty());

    let Rule::Ready {
        entries,
        residual,
        gaps,
    } = &frontend.sheets["styles"]["wider"]
    else {
        panic!("ambiguous shorthand values should remain residual")
    };
    assert!(entries.is_empty());
    assert_eq!(residual.len(), 3);
    assert_eq!(gaps.len(), 3);
}

#[test]
fn a_column_longhand_suppresses_only_its_conditional_shorthand_slot() {
    let parsed = crate::parse_tsx(
        r#"
        import * as stylex from '@stylexjs/stylex'
        import { View } from '@hozo/core'
        const styles = stylex.create({
          all: { columns: '16rem 3' },
          count: { columnCount: 5 }
        })
        const card = <View {...stylex.props(styles.count, active && styles.all)} />
    "#,
    );
    assert!(parsed.diagnostics.is_empty(), "{:?}", parsed.diagnostics);
    let style = &parsed.roots[0].node.style;
    assert_eq!(style.len(), 2);
    assert!(style.iter().any(|declaration| {
        declaration.condition == Condition::Always
            && declaration.property == web_longhand("column-count", "5")
    }));
    assert!(style.iter().any(|declaration| {
        matches!(declaration.condition, Condition::Expr(_))
            && declaration.property == web_longhand("column-width", "16rem")
    }));
    assert!(!style.iter().any(|declaration| {
        matches!(declaration.condition, Condition::Expr(_))
            && declaration.property == web_longhand("column-count", "3")
    }));
}

#[test]
fn scroll_box_shorthands_expand_one_to_four_physical_values() {
    let frontend = frontend(
        r#"
        import * as stylex from '@stylexjs/stylex'
        const styles = stylex.create({
          exact: {
            scrollMargin: '8px 12px 16px 20px',
            scrollPadding: 4
          },
          wider: {
            scrollMargin: '8px 12px 16px 20px 24px',
            scrollPadding: 'calc(1rem + 2px)'
          },
          invalidPadding: { scrollPadding: '-1px 8px' }
        })
    "#,
    );
    let Rule::Ready {
        entries,
        residual,
        gaps,
    } = &frontend.sheets["styles"]["exact"]
    else {
        panic!("exact scroll shorthands were not lowerable")
    };
    assert_eq!(entries.len(), 2);
    assert_eq!(
        entries
            .iter()
            .map(|entry| entry.properties.len())
            .sum::<usize>(),
        8
    );
    assert!(residual.is_empty());
    assert!(gaps.is_empty());

    let Rule::Ready {
        entries,
        residual,
        gaps,
    } = &frontend.sheets["styles"]["wider"]
    else {
        panic!("wider scroll shorthands should remain residual")
    };
    assert!(entries.is_empty());
    assert_eq!(residual.len(), 2);
    assert_eq!(gaps.len(), 2);

    let Rule::Ready {
        entries,
        residual,
        gaps,
    } = &frontend.sheets["styles"]["invalidPadding"]
    else {
        panic!("partly invalid scroll padding should remain residual")
    };
    assert!(entries.is_empty());
    assert_eq!(residual.len(), 1);
    assert_eq!(gaps.len(), 1);
}

#[test]
fn logical_scroll_shorthands_expand_one_or_two_axis_values() {
    let frontend = frontend(
        r#"
        import * as stylex from '@stylexjs/stylex'
        const styles = stylex.create({
          exact: {
            scrollMarginBlock: '8px 12px',
            scrollMarginInline: -4,
            scrollPaddingBlock: 6,
            scrollPaddingInline: '10px 14px'
          },
          wider: { scrollMarginInline: '4px 8px 12px' },
          invalidPadding: { scrollPaddingBlock: '-1px 8px' }
        })
    "#,
    );
    let Rule::Ready {
        entries,
        residual,
        gaps,
    } = &frontend.sheets["styles"]["exact"]
    else {
        panic!("exact logical scroll shorthands were not lowerable")
    };
    assert_eq!(entries.len(), 4);
    assert_eq!(
        entries
            .iter()
            .map(|entry| entry.properties.len())
            .sum::<usize>(),
        8
    );
    assert!(entries
        .iter()
        .flat_map(|entry| &entry.properties)
        .any(|property| {
            *property == StyleProperty::ScrollMargin(Edge::BlockStart, Length::Px(8.0))
        }));
    assert!(entries
        .iter()
        .flat_map(|entry| &entry.properties)
        .any(|property| {
            *property == StyleProperty::ScrollPadding(Edge::InlineEnd, Length::Px(14.0))
        }));
    assert!(residual.is_empty());
    assert!(gaps.is_empty());

    for name in ["wider", "invalidPadding"] {
        let Rule::Ready {
            entries,
            residual,
            gaps,
        } = &frontend.sheets["styles"][name]
        else {
            panic!("invalid logical scroll shorthand should remain residual")
        };
        assert!(entries.is_empty());
        assert_eq!(residual.len(), 1);
        assert_eq!(gaps.len(), 1);
    }
}

#[test]
fn a_logical_scroll_longhand_suppresses_only_its_shorthand_edge() {
    let parsed = crate::parse_tsx(
        r#"
        import * as stylex from '@stylexjs/stylex'
        import { View } from '@hozo/core'
        const styles = stylex.create({
          all: { scrollMarginInline: '8px 12px' },
          start: { scrollMarginInlineStart: 4 }
        })
        const card = <View {...stylex.props(styles.start, active && styles.all)} />
    "#,
    );
    assert!(parsed.diagnostics.is_empty(), "{:?}", parsed.diagnostics);
    let style = &parsed.roots[0].node.style;
    assert_eq!(style.len(), 2);
    assert!(style.iter().any(|declaration| {
        declaration.condition == Condition::Always
            && declaration.property
                == StyleProperty::ScrollMargin(Edge::InlineStart, Length::Px(4.0))
    }));
    assert!(style.iter().any(|declaration| {
        matches!(declaration.condition, Condition::Expr(_))
            && declaration.property
                == StyleProperty::ScrollMargin(Edge::InlineEnd, Length::Px(12.0))
    }));
}

#[test]
fn a_scroll_longhand_suppresses_only_its_conditional_shorthand_edge() {
    let parsed = crate::parse_tsx(
        r#"
        import * as stylex from '@stylexjs/stylex'
        import { View } from '@hozo/core'
        const styles = stylex.create({
          all: { scrollMargin: '8px 12px' },
          top: { scrollMarginTop: 4 }
        })
        const card = <View {...stylex.props(styles.top, active && styles.all)} />
    "#,
    );
    assert!(parsed.diagnostics.is_empty(), "{:?}", parsed.diagnostics);
    let style = &parsed.roots[0].node.style;
    assert_eq!(style.len(), 4);
    assert!(style.iter().any(|declaration| {
        declaration.condition == Condition::Always
            && declaration.property == StyleProperty::ScrollMargin(Edge::Top, Length::Px(4.0))
    }));
    assert_eq!(
        style
            .iter()
            .filter(|declaration| matches!(declaration.condition, Condition::Expr(_)))
            .count(),
        3
    );
}

#[test]
fn scroll_physical_and_logical_conflicts_remain_direction_aware() {
    let parsed = crate::parse_tsx(
        r#"
        import * as stylex from '@stylexjs/stylex'
        import { View } from '@hozo/core'
        const styles = stylex.create({
          all: { scrollPadding: 8 },
          start: { scrollPaddingInlineStart: 4 }
        })
        const card = <View {...stylex.props(styles.start, styles.all)} />
    "#,
    );
    assert!(parsed.roots[0].node.style.is_empty());
    assert_eq!(
        parsed.diagnostics[0].code,
        hozo_ir::DiagnosticCode::StylexNotLowered
    );
    assert!(parsed.diagnostics[0].message.contains("runtime context"));
}

#[test]
fn logical_scroll_shorthand_and_physical_longhand_conflicts_remain_explicit() {
    let parsed = crate::parse_tsx(
        r#"
        import * as stylex from '@stylexjs/stylex'
        import { View } from '@hozo/core'
        const styles = stylex.create({
          axis: { scrollMarginBlock: '8px 12px' },
          top: { scrollMarginTop: 4 }
        })
        const card = <View {...stylex.props(styles.axis, styles.top)} />
    "#,
    );
    assert!(parsed.roots[0].node.style.is_empty());
    assert_eq!(
        parsed.diagnostics[0].code,
        hozo_ir::DiagnosticCode::StylexNotLowered
    );
    assert!(parsed.diagnostics[0].message.contains("runtime context"));
}

#[test]
fn transition_shorthand_expands_and_longhand_duration_keeps_priority() {
    let parsed = crate::parse_tsx(
        r#"
        import * as stylex from '@stylexjs/stylex'
        import { Pressable } from '@hozo/core'
        const styles = stylex.create({
          motion: { transition: 'opacity 100ms linear 50ms', transitionDuration: '200ms' }
        })
        const card = <Pressable {...stylex.props(styles.motion)} />
    "#,
    );
    let node = &parsed.roots[0].node;
    assert!(node.style.iter().any(|declaration| matches!(
        declaration.property,
        StyleProperty::TransitionProperty(ref property) if property == "opacity"
    )));
    assert!(node.style.iter().any(|declaration| matches!(
        declaration.property,
        StyleProperty::TransitionDuration(200, Origin::Written)
    )));
    assert!(node.style.iter().any(|declaration| matches!(
        declaration.property,
        StyleProperty::TransitionTimingFunction(ref timing, Origin::Written) if timing == "linear"
    )));
    assert!(node.style.iter().any(|declaration| matches!(
        declaration.property,
        StyleProperty::TransitionDelay(50, Origin::Written)
    )));
    assert!(node.props.passthrough.is_empty());
    assert!(node.props.stylex_residuals.is_empty());
    assert!(parsed.diagnostics.is_empty());
}

#[test]
fn timeline_shorthands_expand_into_independent_longhand_slots() {
    let parsed = crate::parse_tsx(
        r#"
        import * as stylex from '@stylexjs/stylex'
        import { View } from '@hozo/core'
        const styles = stylex.create({
          motion: {
            animationRange: 'entry 20% exit 80%',
            scrollTimeline: '--page y',
            viewTimeline: '--card inline 10% 20%',
            viewTimelineInset: 'auto',
          }
        })
        const card = <View {...stylex.props(styles.motion)} />
    "#,
    );
    let node = &parsed.roots[0].node;
    for (property, value) in [
        ("animation-range-start", "entry 20%"),
        ("animation-range-end", "exit 80%"),
        ("scroll-timeline-name", "--page"),
        ("scroll-timeline-axis", "y"),
        ("view-timeline-name", "--card"),
        ("view-timeline-axis", "inline"),
        ("view-timeline-inset", "auto"),
    ] {
        assert!(
            node.style.iter().any(|declaration| matches!(
                &declaration.property,
                StyleProperty::WebOnly(name, actual) if name == property && actual == value
            )),
            "missing {property}: {value} in {:?}",
            node.style
        );
    }
    assert!(node.props.passthrough.is_empty());
    assert!(node.props.stylex_residuals.is_empty());
    assert!(parsed.diagnostics.is_empty());
}

#[test]
fn layout_shorthands_expand_into_existing_typed_slots() {
    let frontend = frontend(
        r#"
        import * as stylex from '@stylexjs/stylex'
        const styles = stylex.create({
          exact: {
            flexFlow: 'wrap column-reverse',
            container: 'card-shell / inline-size',
            gridGap: '8px 12px',
            gridRowGap: 4,
            gridColumnGap: 6
          },
          defaults: { flexFlow: 'wrap', container: 'card-shell', gridGap: 8 },
          invalid: { flexFlow: 'row column', container: 'card / size / extra', gridGap: '-1px 8px' }
        })
    "#,
    );
    let Rule::Ready {
        entries,
        residual,
        gaps,
    } = &frontend.sheets["styles"]["exact"]
    else {
        panic!("exact layout shorthands were not lowerable")
    };
    assert_eq!(entries.len(), 5);
    assert_eq!(
        entries.iter().flat_map(|entry| &entry.properties).count(),
        8
    );
    assert!(entries
        .iter()
        .flat_map(|entry| &entry.properties)
        .any(|property| {
            *property == StyleProperty::FlexDirection(FlexDirection::ColumnReverse)
        }));
    assert!(entries
        .iter()
        .flat_map(|entry| &entry.properties)
        .any(|property| { *property == StyleProperty::ColumnGap(Length::Px(12.0)) }));
    assert!(residual.is_empty());
    assert!(gaps.is_empty());

    let Rule::Ready { entries, .. } = &frontend.sheets["styles"]["defaults"] else {
        panic!("one-token shorthands were not lowerable")
    };
    assert!(entries
        .iter()
        .flat_map(|entry| &entry.properties)
        .any(|property| { *property == StyleProperty::FlexDirection(FlexDirection::Row) }));
    assert!(entries
        .iter()
        .flat_map(|entry| &entry.properties)
        .any(|property| { *property == StyleProperty::Keyword("container-type", "normal") }));

    let Rule::Ready {
        entries,
        residual,
        gaps,
    } = &frontend.sheets["styles"]["invalid"]
    else {
        panic!("invalid shorthands should remain residual")
    };
    assert!(entries.is_empty());
    assert_eq!(residual.len(), 3);
    assert_eq!(gaps.len(), 3);
}

#[test]
fn border_axis_longhands_expand_into_independent_final_slots() {
    let frontend = frontend(
        r#"
        import * as stylex from '@stylexjs/stylex'
        const styles = stylex.create({
          exact: {
            borderBlockWidth: 8,
            borderInlineWidth: 12,
            borderInlineColor: '#123456',
            borderBlockStyle: 'dashed',
            borderInlineStartStyle: 'dotted',
            borderBlockStartStyle: 'solid'
          },
          invalid: {
            borderBlockWidth: -1,
            borderInlineColor: 'var(--border)',
            borderInlineStyle: 'groove',
            borderTopStyle: 2
          }
        })
    "#,
    );
    let Rule::Ready {
        entries,
        residual,
        gaps,
    } = &frontend.sheets["styles"]["exact"]
    else {
        panic!("exact border longhands were not lowerable")
    };
    assert_eq!(entries.len(), 6);
    assert_eq!(
        entries.iter().flat_map(|entry| &entry.properties).count(),
        10
    );
    assert!(entries
        .iter()
        .flat_map(|entry| &entry.properties)
        .any(|property| {
            *property == StyleProperty::BorderLogicalWidth(Edge::InlineEnd, Length::Px(12.0))
        }));
    assert!(entries
        .iter()
        .flat_map(|entry| &entry.properties)
        .any(|property| {
            *property == StyleProperty::BorderInlineStartColor(Color::Css("#123456".to_string()))
        }));
    assert!(entries
        .iter()
        .flat_map(|entry| &entry.properties)
        .any(|property| {
            *property == StyleProperty::WebOnly("border-top-style".to_string(), "solid".to_string())
        }));
    assert!(residual.is_empty());
    assert!(gaps.is_empty());

    let Rule::Ready {
        entries,
        residual,
        gaps,
    } = &frontend.sheets["styles"]["invalid"]
    else {
        panic!("invalid border longhands should remain residual")
    };
    assert!(entries.is_empty());
    assert_eq!(residual.len(), 4);
    assert_eq!(gaps.len(), 4);
}

#[test]
fn border_axis_longhand_suppresses_only_its_shorthand_slot() {
    let parsed = crate::parse_tsx(
        r#"
        import * as stylex from '@stylexjs/stylex'
        import { View } from '@hozo/core'
        const styles = stylex.create({
          axis: { borderInlineWidth: 12 },
          start: { borderInlineStartWidth: 4 }
        })
        const card = <View {...stylex.props(styles.start, active && styles.axis)} />
    "#,
    );
    assert!(parsed.diagnostics.is_empty(), "{:?}", parsed.diagnostics);
    let style = &parsed.roots[0].node.style;
    assert!(style.iter().any(|declaration| {
        declaration.condition == Condition::Always
            && declaration.property
                == StyleProperty::BorderLogicalWidth(Edge::InlineStart, Length::Px(4.0))
    }));
    assert!(!style.iter().any(|declaration| {
        matches!(declaration.condition, Condition::Expr(_))
            && declaration.property
                == StyleProperty::BorderLogicalWidth(Edge::InlineStart, Length::Px(12.0))
    }));
    assert!(style.iter().any(|declaration| {
        matches!(declaration.condition, Condition::Expr(_))
            && declaration.property
                == StyleProperty::BorderLogicalWidth(Edge::InlineEnd, Length::Px(12.0))
    }));
}

#[test]
fn layout_longhands_suppress_only_their_conditional_shorthand_slots() {
    let parsed = crate::parse_tsx(
        r#"
        import * as stylex from '@stylexjs/stylex'
        import { View } from '@hozo/core'
        const styles = stylex.create({
          flow: { flexFlow: 'column wrap' },
          direction: { flexDirection: 'row' },
          gaps: { gridGap: '8px 12px' },
          row: { rowGap: 4 }
        })
        const card = <View {...stylex.props(styles.direction, active && styles.flow, styles.row, enabled && styles.gaps)} />
    "#,
    );
    assert!(parsed.diagnostics.is_empty(), "{:?}", parsed.diagnostics);
    let style = &parsed.roots[0].node.style;
    assert!(style.iter().any(|declaration| {
        declaration.condition == Condition::Always
            && declaration.property == StyleProperty::FlexDirection(FlexDirection::Row)
    }));
    assert!(!style.iter().any(|declaration| {
        matches!(declaration.condition, Condition::Expr(_))
            && matches!(declaration.property, StyleProperty::FlexDirection(_))
    }));
    assert!(style.iter().any(|declaration| {
        matches!(declaration.condition, Condition::Expr(_))
            && declaration.property == StyleProperty::Keyword("flex-wrap", "wrap")
    }));
    assert!(!style.iter().any(|declaration| {
        matches!(declaration.condition, Condition::Expr(_))
            && matches!(declaration.property, StyleProperty::RowGap(_))
    }));
    assert!(style.iter().any(|declaration| {
        matches!(declaration.condition, Condition::Expr(_))
            && declaration.property == StyleProperty::ColumnGap(Length::Px(12.0))
    }));
}

#[test]
fn physical_longhand_beats_a_later_shorthand_by_stylex_priority() {
    let parsed = crate::parse_tsx(
        r#"
        import * as stylex from '@stylexjs/stylex'
        import { View } from '@hozo/core'
        const styles = stylex.create({
          all: { padding: 16 },
          top: { paddingTop: 8 }
        })
        const card = <View {...stylex.props(styles.top, styles.all)} />
    "#,
    );
    assert!(parsed.diagnostics.is_empty(), "{:?}", parsed.diagnostics);
    let style = &parsed.roots[0].node.style;
    assert!(matches!(
        style.last().map(|declaration| &declaration.property),
        Some(StyleProperty::PaddingTop(Length::Px(8.0)))
    ));
    let flattened = hozo_ir::dedupe_last_wins(
        style
            .iter()
            .map(|declaration| declaration.property.clone())
            .collect(),
    );
    assert_eq!(flattened.len(), 4);
    assert!(flattened.contains(&StyleProperty::PaddingTop(Length::Px(8.0))));
}

#[test]
fn unconditional_longhand_removes_an_unreachable_conditional_shorthand_slot() {
    let parsed = crate::parse_tsx(
        r#"
        import * as stylex from '@stylexjs/stylex'
        import { View } from '@hozo/core'
        const styles = stylex.create({
          all: { padding: 16 },
          top: { paddingTop: 8 }
        })
        const card = <View {...stylex.props(styles.top, active && styles.all)} />
    "#,
    );
    assert!(parsed.diagnostics.is_empty(), "{:?}", parsed.diagnostics);
    let style = &parsed.roots[0].node.style;
    assert_eq!(style.len(), 4);
    assert_eq!(
        style
            .iter()
            .filter(|declaration| matches!(declaration.condition, Condition::Expr(_)))
            .count(),
        3
    );
    assert!(!style.iter().any(|declaration| {
        matches!(declaration.condition, Condition::Expr(_))
            && matches!(declaration.property, StyleProperty::PaddingTop(_))
    }));
}

#[test]
fn caret_color_longhand_suppresses_only_its_conditional_shorthand_slot() {
    let parsed = crate::parse_tsx(
        r#"
        import * as stylex from '@stylexjs/stylex'
        import { TextInput } from '@hozo/core'
        const styles = stylex.create({
          all: { caret: '#123456 bar' },
          color: { caretColor: '#654321' }
        })
        const input = <TextInput {...stylex.props(styles.color, active && styles.all)} />
    "#,
    );
    assert!(parsed.diagnostics.is_empty(), "{:?}", parsed.diagnostics);
    let style = &parsed.roots[0].node.style;
    assert!(!style.iter().any(|declaration| {
        matches!(declaration.condition, Condition::Expr(_))
            && matches!(declaration.property, StyleProperty::CaretColor(_))
    }));
    assert!(style.iter().any(|declaration| {
        matches!(declaration.condition, Condition::Expr(_))
            && declaration.property
                == StyleProperty::WebOnly("caret-shape".to_string(), "bar".to_string())
    }));
}

#[test]
fn the_official_four_property_priority_tiers_are_explicit() {
    assert_eq!(property_priority("padding"), 1000);
    assert_eq!(property_priority("paddingInline"), 2000);
    assert_eq!(property_priority("paddingInlineStart"), 3000);
    assert_eq!(property_priority("paddingTop"), 4000);
    assert_eq!(property_priority("paddingBlockStart"), 4000);
    assert_eq!(canonical_property("paddingBlockStart"), "paddingTop");
    assert_eq!(property_priority("scrollMargin"), 1000);
    assert_eq!(property_priority("grid"), 1000);
    assert_eq!(property_priority("scrollMarginInline"), 2000);
    assert_eq!(property_priority("scrollMarginInlineStart"), 3000);
    assert_eq!(property_priority("scrollMarginLeft"), 4000);
    assert_eq!(property_priority("gridTemplateAreas"), 2000);
    assert_eq!(property_priority("textDecoration"), 2000);
    assert_eq!(property_priority("textDecorationLine"), 3000);
    assert!(property_names_overlap(
        "textDecoration",
        "textDecorationLine"
    ));
    assert!(property_names_overlap("textEmphasis", "textEmphasisColor"));
    assert_eq!(property_priority("caret"), 2000);
    assert_eq!(property_priority("caretColor"), 3000);
    assert!(property_names_overlap("caret", "caretColor"));
    assert_eq!(property_priority("mask"), 2000);
    assert_eq!(property_priority("maskImage"), 3000);
    assert!(property_names_overlap("mask", "maskImage"));
    assert!(property_names_overlap("mask", "maskBorderSource"));
    assert_eq!(property_priority("maskBorder"), 2000);
    assert!(property_names_overlap("maskBorder", "maskBorderSource"));
    assert_eq!(property_priority("borderImage"), 2000);
    assert_eq!(property_priority("borderImageSource"), 3000);
    assert!(property_names_overlap("borderImage", "borderImageSource"));
    assert!(!property_names_overlap("borderImageWidth", "borderWidth"));
    assert_eq!(property_priority("cornerShape"), 2000);
    assert_eq!(property_priority("cornerStartStartShape"), 3000);
    assert_eq!(property_priority("cornerTopLeftShape"), 4000);
    assert!(property_names_overlap("cornerShape", "cornerTopLeftShape"));
    assert_eq!(property_priority("font"), 1000);
    assert_eq!(property_priority("fontFamily"), 3000);
    assert!(property_names_overlap("font", "fontFamily"));
    assert_eq!(property_priority("positionTry"), 3000);
    assert!(property_names_overlap(
        "positionTry",
        "positionTryFallbacks"
    ));
    assert_eq!(property_priority("offset"), 2000);
    assert_eq!(property_priority("offsetPath"), 3000);
    assert!(property_names_overlap("offset", "offsetPath"));
    assert_eq!(property_priority("outline"), 2000);
    assert_eq!(property_priority("outlineWidth"), 3000);
    assert!(property_names_overlap("outline", "outlineWidth"));
}

#[test]
fn direction_dependent_physical_and_logical_priority_remains_explicit() {
    let parsed = crate::parse_tsx(
        r#"
        import * as stylex from '@stylexjs/stylex'
        import { View } from '@hozo/core'
        const styles = stylex.create({
          logical: { paddingInlineStart: 16 },
          physical: { paddingLeft: 8 }
        })
        const card = <View {...stylex.props(styles.logical, styles.physical)} />
    "#,
    );
    assert!(parsed.roots[0].node.style.is_empty());
    assert_eq!(
        parsed.diagnostics[0].code,
        hozo_ir::DiagnosticCode::StylexNotLowered
    );
    assert!(parsed.diagnostics[0].message.contains("runtime context"));
}

#[test]
fn direction_dependent_border_edges_remain_explicit() {
    for (logical, physical) in [
        ("borderInlineStartWidth: 16", "borderLeftWidth: 8"),
        ("borderInlineStartColor: 'red'", "borderRightColor: 'blue'"),
        (
            "borderInlineStartStyle: 'dashed'",
            "borderLeftStyle: 'solid'",
        ),
        ("borderBlockWidth: 16", "borderTopWidth: 8"),
    ] {
        let source = format!(
            r#"
            import * as stylex from '@stylexjs/stylex'
            import {{ View }} from '@hozo/core'
            const styles = stylex.create({{
              logical: {{ {logical} }},
              physical: {{ {physical} }}
            }})
            const card = <View {{...stylex.props(styles.logical, styles.physical)}} />
        "#,
        );
        let parsed = crate::parse_tsx(&source);
        assert!(
            parsed.roots[0].node.style.is_empty(),
            "{logical} / {physical}"
        );
        assert_eq!(
            parsed.diagnostics[0].code,
            hozo_ir::DiagnosticCode::StylexNotLowered
        );
        assert!(parsed.diagnostics[0].message.contains("runtime context"));
    }
}
