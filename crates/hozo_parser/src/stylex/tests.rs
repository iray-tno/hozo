use super::*;
use oxc_allocator::Allocator;
use oxc_parser::Parser;
use oxc_span::SourceType;

fn frontend(source: &str) -> Frontend {
    let allocator = Allocator::default();
    let parsed = Parser::new(
        &allocator,
        source,
        SourceType::from_extension("tsx").unwrap(),
    )
    .parse();
    Frontend::collect(&parsed.program, &parsed.module_record)
}

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
            .filter(|property| matches!(property, StyleProperty::PaddingTop(Length::Px(12.0))))
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
            StyleProperty::FontWeight(FontWeight(700)),
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
fn practical_web_only_values_are_exact_and_wider_values_remain_residual() {
    let frontend = frontend(
        r#"
        import * as stylex from '@stylexjs/stylex'
        const styles = stylex.create({
          exact: {
            wordBreak: 'break-word', overflowWrap: 'anywhere', visibility: 'hidden',
            backgroundPosition: 'center', backgroundRepeat: 'no-repeat', backgroundSize: 'cover',
            objectPosition: 'center', justifySelf: 'center', placeItems: 'center',
            transitionDelay: '100ms', animationDuration: '.2s',
            content: '"New" open-quote', caret: '#123456 bar'
          },
          wider: {
            backgroundSize: 'calc(100% - 1px)', transitionDelay: 'calc(1s - 2ms)',
            content: 'attr(data-label)', caret: 'red blue'
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
        panic!("exact Web values were not lowerable")
    };
    assert_eq!(entries.len(), 13);
    assert!(entries
        .iter()
        .flat_map(|entry| &entry.properties)
        .any(|property| {
            property == &StyleProperty::CaretColor(Color::Css("#123456".to_string()))
        }));
    assert!(entries
        .iter()
        .flat_map(|entry| &entry.properties)
        .any(|property| {
            property == &StyleProperty::WebOnly("caret-shape".to_string(), "bar".to_string())
        }));
    assert!(residual.is_empty());
    assert!(gaps.is_empty());

    let Rule::Ready {
        entries,
        residual,
        gaps,
    } = &frontend.sheets["styles"]["wider"]
    else {
        panic!("wider values should remain residual")
    };
    assert!(entries.is_empty());
    assert_eq!(residual.len(), 4);
    assert_eq!(gaps.len(), 4);
}

#[test]
fn animation_controls_lower_exact_common_values_and_preserve_wider_syntax() {
    let frontend = frontend(
        r#"
        import * as stylex from '@stylexjs/stylex'
        const styles = stylex.create({
          exact: {
            animationComposition: 'add', animationDelay: '-100ms',
            animationDirection: 'alternate-reverse', animationFillMode: 'both',
            animationIterationCount: 2.5, animationPlayState: 'paused',
            animationTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)'
          },
          wider: {
            animationDelay: 'calc(1s - 2ms)', animationIterationCount: -1,
            animationTimingFunction: 'linear(0, 1)'
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
        panic!("exact animation controls were not lowerable")
    };
    assert_eq!(entries.len(), 7);
    assert!(residual.is_empty());
    assert!(gaps.is_empty());

    let Rule::Ready {
        entries,
        residual,
        gaps,
    } = &frontend.sheets["styles"]["wider"]
    else {
        panic!("wider animation controls should remain residual")
    };
    assert!(entries.is_empty());
    assert_eq!(residual.len(), 3);
    assert_eq!(gaps.len(), 3);
}

#[test]
fn compositing_effects_lower_safe_common_css_and_preserve_wider_syntax() {
    let frontend = frontend(
        r#"
        import * as stylex from '@stylexjs/stylex'
        const styles = stylex.create({
          exact: {
            clipPath: 'polygon(0 0, 100% 0, 50% 100%)',
            perspective: '800px', perspectiveOrigin: '25% 75%',
            transformBox: 'fill-box', transformStyle: 'preserve-3d',
            willChange: 'opacity, transform'
          },
          wider: {
            clipPath: 'shape(from 0 0, line to 100% 100%)',
            perspective: 'calc(100px + 2rem)', perspectiveOrigin: 'calc(50% + 1px) center',
            transformBox: 'padding-box', transformStyle: 'preserve-4d',
            willChange: 'var(--property)'
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
        panic!("common compositing values were not lowerable")
    };
    assert_eq!(entries.len(), 6);
    assert!(residual.is_empty());
    assert!(gaps.is_empty());

    let Rule::Ready {
        entries,
        residual,
        gaps,
    } = &frontend.sheets["styles"]["wider"]
    else {
        panic!("wider compositing values should remain residual")
    };
    assert!(entries.is_empty());
    assert_eq!(residual.len(), 6);
    assert_eq!(gaps.len(), 6);
}

#[test]
fn backdrop_filter_lowers_only_the_native_adapter_subset() {
    let frontend = frontend(
        r#"
        import * as stylex from '@stylexjs/stylex'
        const styles = stylex.create({
          exact: { backdropFilter: 'blur(12px)' },
          none: { backdropFilter: 'none' },
          wider: { backdropFilter: 'brightness(0.8) blur(12px)' }
        })
    "#,
    );
    let Rule::Ready {
        entries,
        residual,
        gaps,
    } = &frontend.sheets["styles"]["exact"]
    else {
        panic!("static pixel blur was not lowerable")
    };
    assert!(matches!(
        entries[0].properties.as_slice(),
        [StyleProperty::BackdropFilter(FilterFunction::Blur, value)] if value == "blur(12px)"
    ));
    assert!(residual.is_empty());
    assert!(gaps.is_empty());

    let Rule::Ready {
        entries,
        residual,
        gaps,
    } = &frontend.sheets["styles"]["none"]
    else {
        panic!("backdrop-filter none was not lowerable")
    };
    assert!(matches!(
        entries[0].properties.as_slice(),
        [StyleProperty::BackdropFilter(FilterFunction::None, value)] if value == "none"
    ));
    assert!(residual.is_empty());
    assert!(gaps.is_empty());

    let Rule::Ready {
        entries,
        residual,
        gaps,
    } = &frontend.sheets["styles"]["wider"]
    else {
        panic!("wider backdrop filter should remain residual")
    };
    assert!(entries.is_empty());
    assert_eq!(residual.len(), 1);
    assert_eq!(gaps.len(), 1);
}

#[test]
fn mask_longhands_lower_common_layers_and_preserve_wider_image_syntax() {
    assert_eq!(
        minify_css_commas("linear-gradient(\"literal, text\", black, white)"),
        "linear-gradient(\"literal, text\",black,white)"
    );
    let frontend = frontend(
        r#"
        import * as stylex from '@stylexjs/stylex'
        const styles = stylex.create({
          exact: {
            mask: 'url(mask.svg) center / cover no-repeat',
            maskBorder: 'url(mask.svg) 30 round alpha',
            WebkitMaskImage: 'url(mask.svg)',
            maskImage: 'linear-gradient(black, transparent)',
            maskMode: 'luminance', maskRepeat: 'no-repeat',
            maskPosition: 'center top', maskSize: 'cover',
            maskOrigin: 'border-box', maskClip: 'no-clip',
            maskComposite: 'exclude', maskType: 'alpha'
          },
          wider: {
            mask: 'url(a.svg), url(b.svg)',
            maskBorder: 'image-set(url(a.png) 1x, url(b.png) 2x) 30',
            WebkitMaskImage: 'image-set(url(a.png) 1x, url(b.png) 2x)',
            maskImage: 'cross-fade(url(a.png), url(b.png), 50%)',
            maskMode: 'match-source, var(--mask-mode)',
            maskRepeat: 'repeat var(--repeat)',
            maskPosition: 'calc(50% + 1px) top', maskSize: 'calc(100% - 1px)',
            maskOrigin: 'var(--origin)', maskClip: 'text',
            maskComposite: 'source-over', maskType: 'var(--mask-type)'
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
        panic!("common mask longhands were not lowerable")
    };
    assert_eq!(entries.len(), 12);
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
        panic!("wider mask syntax should remain residual")
    };
    assert!(entries.is_empty());
    assert_eq!(residual.len(), 12);
    assert_eq!(gaps.len(), 12);
}

#[test]
fn motion_paths_and_float_shapes_lower_common_values_and_preserve_wider_syntax() {
    let frontend = frontend(
        r#"
        import * as stylex from '@stylexjs/stylex'
        const styles = stylex.create({
          exact: {
            float: 'left', clear: 'both',
            offset: 'path("M 0 0 L 100 100") 25% auto 45deg',
            offsetAnchor: 'left top', offsetDistance: '25%',
            offsetPath: 'path("M 0 0 L 100 100")',
            offsetPosition: 'center top', offsetRotate: 'auto 45deg',
            shapeImageThreshold: 0.5, shapeMargin: '1rem',
            shapeOutside: 'circle(50%)'
          },
          wider: {
            float: 'inline-start', clear: 'inline-end',
            offset: 'normal path("M 0 0 L 100 100") 20% / center',
            offsetAnchor: 'calc(50% + 1px) top', offsetDistance: 'calc(25% + 1px)',
            offsetPath: 'shape(from 0 0, line to 100% 100%)',
            offsetPosition: 'calc(50% + 1px) top', offsetRotate: '0.25turn',
            shapeImageThreshold: 1.5, shapeMargin: '-1rem',
            shapeOutside: 'linear-gradient(black, transparent)'
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
        panic!("common motion-path and float-shape values were not lowerable")
    };
    assert_eq!(entries.len(), 11);
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
        panic!("wider motion-path and float-shape syntax should remain residual")
    };
    assert!(entries.is_empty());
    assert_eq!(residual.len(), 11);
    assert_eq!(gaps.len(), 11);
}

#[test]
fn anchor_positioning_fallbacks_lower_common_values_and_preserve_wider_syntax() {
    let frontend = frontend(
        r#"
        import * as stylex from '@stylexjs/stylex'
        const styles = stylex.create({
          exact: {
            positionArea: 'top',
            positionTryFallbacks: 'flip-block, --menu-below',
            positionTryOptions: 'flip-inline',
            positionTry: 'most-width flip-block, --menu-below'
          },
          wider: {
            positionArea: 'top center',
            positionTryFallbacks: 'flip-block flip-block',
            positionTryOptions: 'var(--fallback)',
            positionTry: 'most-width'
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
        panic!("common anchor positioning values were not lowerable")
    };
    assert_eq!(entries.len(), 4);
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
        panic!("wider anchor positioning syntax should remain residual")
    };
    assert!(entries.is_empty());
    assert_eq!(residual.len(), 4);
    assert_eq!(gaps.len(), 4);
}

#[test]
fn border_image_longhands_lower_common_values_and_preserve_wider_syntax() {
    let frontend = frontend(
        r#"
        import * as stylex from '@stylexjs/stylex'
        const styles = stylex.create({
          exact: {
            borderImage: 'url(border.svg) 30 round',
            borderImageSource: 'linear-gradient(red, blue)',
            borderImageSlice: '30% fill', borderImageWidth: '1 2 3 4',
            borderImageOutset: '4px 8px', borderImageRepeat: 'round stretch'
          },
          wider: {
            borderImage: 'image-set(url(a.png) 1x, url(b.png) 2x) 30',
            borderImageSource: 'image-set(url(a.png) 1x, url(b.png) 2x)',
            borderImageSlice: 'calc(30% + 5%) fill',
            borderImageWidth: 'calc(1rem + 2px)',
            borderImageOutset: 'calc(1rem + 2px)',
            borderImageRepeat: 'var(--border-repeat)'
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
        panic!("common border-image longhands were not lowerable")
    };
    assert_eq!(entries.len(), 6);
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
        panic!("wider border-image syntax should remain residual")
    };
    assert!(entries.is_empty());
    assert_eq!(residual.len(), 6);
    assert_eq!(gaps.len(), 6);
}

#[test]
fn corner_shapes_lower_published_keywords_and_preserve_future_grammar() {
    let frontend = frontend(
        r#"
        import * as stylex from '@stylexjs/stylex'
        const styles = stylex.create({
          exact: {
            cornerShape: 'squircle',
            cornerStartStartShape: 'scoop', cornerStartEndShape: 'bevel',
            cornerEndStartShape: 'notch', cornerEndEndShape: 'square',
            cornerTopLeftShape: 'round', cornerTopRightShape: 'scoop',
            cornerBottomLeftShape: 'bevel', cornerBottomRightShape: 'notch'
          },
          wider: {
            cornerShape: 'superellipse(0.5)',
            cornerStartStartShape: 'superellipse(0.5)',
            cornerStartEndShape: 'superellipse(0.5)',
            cornerEndStartShape: 'superellipse(0.5)',
            cornerEndEndShape: 'superellipse(0.5)',
            cornerTopLeftShape: 'superellipse(0.5)',
            cornerTopRightShape: 'superellipse(0.5)',
            cornerBottomLeftShape: 'superellipse(0.5)',
            cornerBottomRightShape: 'superellipse(0.5)'
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
        panic!("published corner-shape keywords were not lowerable")
    };
    assert_eq!(entries.len(), 9);
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
        panic!("future corner-shape grammar should remain residual")
    };
    assert!(entries.is_empty());
    assert_eq!(residual.len(), 9);
    assert_eq!(gaps.len(), 9);
}

#[test]
fn legacy_box_properties_match_stylex_numeric_and_keyword_output() {
    let frontend = frontend(
        r#"
        import * as stylex from '@stylexjs/stylex'
        const styles = stylex.create({
          exact: {
            boxAlign: 'center', boxDirection: 'reverse', boxFlex: 1,
            boxFlexGroup: 2, boxLines: 'multiple', boxOrdinalGroup: 2,
            boxOrient: 'vertical', boxSuppress: 'discard'
          },
          wider: {
            boxAlign: 'around', boxDirection: 'sideways', boxFlex: -1,
            boxFlexGroup: 1.5, boxLines: 'wrap', boxOrdinalGroup: 0,
            boxOrient: 'diagonal', boxSuppress: 'remove'
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
        panic!("legacy box properties were not lowerable")
    };
    assert_eq!(entries.len(), 8);
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
        panic!("invalid legacy box values should remain residual")
    };
    assert!(entries.is_empty());
    assert_eq!(residual.len(), 8);
    assert_eq!(gaps.len(), 8);
}

#[test]
fn legacy_motion_aliases_reuse_the_validated_offset_grammars() {
    let frontend = frontend(
        r#"
        import * as stylex from '@stylexjs/stylex'
        const styles = stylex.create({
          exact: {
            motion: 'path("M 0 0 L 100 100")', motionOffset: '25%',
            motionPath: 'ray(45deg)', motionRotation: 'auto 45deg'
          },
          wider: {
            motion: 'var(--motion)', motionOffset: 'calc(25% + 1px)',
            motionPath: 'paint(route)', motionRotation: 'spin 45deg'
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
        panic!("legacy motion aliases were not lowerable")
    };
    assert_eq!(entries.len(), 4);
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
        panic!("wider legacy motion values should remain residual")
    };
    assert!(entries.is_empty());
    assert_eq!(residual.len(), 4);
    assert_eq!(gaps.len(), 4);
}

#[test]
fn speech_timing_properties_keep_the_stylex_oracle_boundary() {
    let frontend = frontend(
        r#"
        import * as stylex from '@stylexjs/stylex'
        const styles = stylex.create({
          exact: {
            cue: 'url(chime.wav)', cueAfter: 'none', cueBefore: 'url(alert.wav)',
            pause: 'medium', pauseAfter: 200, pauseBefore: 'strong',
            rest: 'weak', restAfter: 300, restBefore: 'none'
          },
          wider: {
            cue: 'linear-gradient(red, blue)', cueAfter: 'var(--cue)', cueBefore: 'url(',
            pause: 'sometimes', pauseAfter: -1, pauseBefore: '200ms',
            rest: 'often', restAfter: -1, restBefore: '300ms'
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
        panic!("speech timing properties were not lowerable")
    };
    assert_eq!(entries.len(), 9);
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
        panic!("wider speech timing values should remain residual")
    };
    assert!(entries.is_empty());
    assert_eq!(residual.len(), 9);
    assert_eq!(gaps.len(), 9);
}

#[test]
fn speech_voice_properties_keep_validated_value_boundaries() {
    let frontend = frontend(
        r#"
        import * as stylex from '@stylexjs/stylex'
        const styles = stylex.create({
          exact: {
            azimuth: 'center-right', speak: 'normal', speakAs: 'spell-out',
            voiceBalance: 'left', voiceDuration: '500ms', voiceFamily: 'male',
            voicePitch: 'medium', voiceRange: 'high', voiceRate: 'fast',
            voiceStress: 'strong', voiceVolume: 'loud'
          },
          wider: {
            azimuth: '20deg', speak: 'sometimes', speakAs: 'words',
            voiceBalance: '25%', voiceDuration: '-1ms', voiceFamily: 'Alex',
            voicePitch: '220Hz', voiceRange: '2st', voiceRate: '120%',
            voiceStress: 'heavy', voiceVolume: '6dB'
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
        panic!("speech voice properties were not lowerable")
    };
    assert_eq!(entries.len(), 11);
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
        panic!("wider speech voice values should remain residual")
    };
    assert_eq!(entries.len(), 7);
    assert!(entries.iter().all(|entry| entry
        .properties
        .iter()
        .all(|property| { matches!(property, StyleProperty::WebOnly(_, _)) })));
    assert_eq!(residual.len(), 4);
    assert_eq!(gaps.len(), 4);
}

#[test]
fn named_page_selection_accepts_only_a_static_identifier() {
    let frontend = frontend(
        r#"
        import * as stylex from '@stylexjs/stylex'
        const styles = stylex.create({
          exact: { page: 'chapter' },
          wider: { page: 'chapter cover' }
        })
    "#,
    );
    let Rule::Ready {
        entries,
        residual,
        gaps,
    } = &frontend.sheets["styles"]["exact"]
    else {
        panic!("named page selection was not lowerable")
    };
    assert_eq!(entries.len(), 1);
    assert!(matches!(
        &entries[0].properties[0],
        StyleProperty::WebOnly(name, _) if name == "page"
    ));
    assert!(residual.is_empty());
    assert!(gaps.is_empty());

    let Rule::Ready {
        entries,
        residual,
        gaps,
    } = &frontend.sheets["styles"]["wider"]
    else {
        panic!("invalid page syntax should remain residual")
    };
    assert!(entries.is_empty());
    assert_eq!(residual.len(), 1);
    assert_eq!(gaps.len(), 1);
}

#[test]
fn grid_auto_tracks_flow_and_areas_lower_exactly_on_web() {
    let frontend = frontend(
        r#"
        import * as stylex from '@stylexjs/stylex'
        const styles = stylex.create({
          exact: {
            gridAutoColumns: 'minmax(100px, 1fr) max-content',
            gridAutoRows: '48px auto', gridAutoFlow: 'column dense',
            gridTemplateAreas: '"header header" "main aside"'
          },
          wider: {
            gridAutoColumns: 'calc(100% - 1rem)',
            gridAutoRows: 'repeat(2, 1fr)',
            gridAutoFlow: 'var(--flow)',
            gridTemplateAreas: '"a a" "a b"'
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
        panic!("common implicit-grid declarations were not lowerable")
    };
    assert_eq!(entries.len(), 4);
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
        panic!("wider implicit-grid syntax should remain residual")
    };
    assert!(entries.is_empty());
    assert_eq!(residual.len(), 4);
    assert_eq!(gaps.len(), 4);
}

#[test]
fn browser_typography_keywords_are_exact_and_composed_values_remain_residual() {
    let frontend = frontend(
        r#"
        import * as stylex from '@stylexjs/stylex'
        const styles = stylex.create({
          exact: {
            fontKerning: 'normal', fontOpticalSizing: 'auto', fontStretch: 'condensed',
            fontFeatureSettings: '\"kern\" 1', fontLanguageOverride: '\"TRK\"',
            fontPalette: 'dark', fontSizeAdjust: 0.5, fontSynthesis: 'weight style',
            fontSynthesisPosition: 'none', fontSynthesisSmallCaps: 'none',
            fontSynthesisStyle: 'none', fontSynthesisWeight: 'none',
            fontVariantAlternates: 'historical-forms', fontVariantCaps: 'small-caps',
            fontVariantEastAsian: 'jis78 full-width', fontVariantLigatures: 'none',
            fontVariantNumeric: 'tabular-nums', fontVariantPosition: 'super',
            fontVariationSettings: '\"wght\" 650',
            hyphens: 'auto', lineBreak: 'strict', textAlignLast: 'center',
            textDecorationSkipInk: 'all', textDecorationThickness: '2px',
            textJustify: 'inter-word',
            textOrientation: 'upright', textWrap: 'balance'
          },
          wider: {
            fontStretch: '75%',
            fontVariantLigatures: 'common-ligatures no-discretionary-ligatures',
            fontFeatureSettings: '\"bad\" 1', fontLanguageOverride: 'TRK',
            fontPalette: 'var(--palette)', fontSizeAdjust: -0.5,
            fontSynthesis: 'weight weight',
            fontVariantAlternates: 'styleset()',
            fontVariantEastAsian: 'jis78 jis90',
            fontVariationSettings: '\"wght\" bold',
            textDecorationThickness: '-2px'
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
        panic!("exact browser typography values were not lowerable")
    };
    assert_eq!(entries.len(), 27);
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
        panic!("composed browser typography values should remain residual")
    };
    assert!(entries.is_empty());
    assert_eq!(residual.len(), 11);
    assert_eq!(gaps.len(), 11);
}

#[test]
fn font_shorthand_lowers_common_single_family_values_and_preserves_wider_syntax() {
    let frontend = frontend(
        r#"
        import * as stylex from '@stylexjs/stylex'
        const styles = stylex.create({
          exact: {
            font: 'italic 700 16px Arial'
          },
          exactLineHeight: {
            font: 'normal 1rem / 1.5 sans-serif'
          },
          wider: {
            font: 'small-caps condensed 16px Arial, sans-serif'
          }
        })
    "#,
    );
    for name in ["exact", "exactLineHeight"] {
        let Rule::Ready {
            entries,
            residual,
            gaps,
        } = &frontend.sheets["styles"][name]
        else {
            panic!("common font shorthand was not lowerable")
        };
        assert_eq!(entries.len(), 1);
        assert!(matches!(
            entries[0].properties[0],
            StyleProperty::WebOnly(_, _)
        ));
        assert!(residual.is_empty());
        assert!(gaps.is_empty());
    }
    let Rule::Ready {
        entries,
        residual,
        gaps,
    } = &frontend.sheets["styles"]["wider"]
    else {
        panic!("wider font shorthand should remain residual")
    };
    assert!(entries.is_empty());
    assert_eq!(residual.len(), 1);
    assert_eq!(gaps.len(), 1);
}

#[test]
fn browser_text_controls_validate_exact_css_grammars() {
    let frontend = frontend(
        r#"
        import * as stylex from '@stylexjs/stylex'
        const styles = stylex.create({
          exact: {
            WebkitLineClamp: 3, WebkitTextStrokeWidth: 2,
            hangingPunctuation: 'first allow-end', hyphenateCharacter: '"-"',
            tabSize: 4, textCombineUpright: 'digits 2',
            textEmphasisColor: '#123456', textEmphasisPosition: 'over right',
            textEmphasisStyle: 'filled sesame', textFillColor: '#abcdef',
            textSizeAdjust: '100%', textUnderlineOffset: 2,
            textUnderlinePosition: 'under left', wordSpacing: 4,
            wordWrap: 'break-word'
          },
          wider: {
            WebkitLineClamp: 0, WebkitTextStrokeWidth: -1,
            hangingPunctuation: 'first force-end allow-end', hyphenateCharacter: '-',
            tabSize: -1, textCombineUpright: 'digits 5',
            textEmphasisColor: 'var(--accent)', textEmphasisPosition: 'over under',
            textEmphasisStyle: 'filled open', textFillColor: 'var(--ink)',
            textSizeAdjust: '-10%', textUnderlineOffset: '20%',
            textUnderlinePosition: 'under over', wordSpacing: 'calc(1px + 1em)',
            wordWrap: 'anywhere'
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
        panic!("exact browser text controls were not lowerable")
    };
    assert_eq!(entries.len(), 15);
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
        panic!("invalid browser text controls should remain residual")
    };
    assert!(entries.is_empty());
    assert_eq!(residual.len(), 15);
    assert_eq!(gaps.len(), 15);
}

#[test]
fn logical_background_and_form_web_values_keep_exact_boundaries() {
    let frontend = frontend(
        r#"
        import * as stylex from '@stylexjs/stylex'
        const styles = stylex.create({
          exact: {
            blockSize: 320, inlineSize: '50%', minBlockSize: 'auto',
            minInlineSize: '12rem', maxBlockSize: 'none', maxInlineSize: 'fit-content',
            justifyItems: 'center', placeSelf: 'center center',
            backgroundAttachment: 'fixed', backgroundBlendMode: 'multiply',
            backgroundClip: 'text', WebkitBackgroundClip: 'text',
            backgroundOrigin: 'padding-box', backgroundPositionX: 'left',
            backgroundPositionY: 'bottom', accentColor: '#123456', caretShape: 'bar',
            WebkitTextFillColor: 'currentColor', WebkitTextStrokeColor: '#abcdef',
            WebkitTapHighlightColor: 'transparent', MozOsxFontSmoothing: 'grayscale',
            WebkitFontSmoothing: 'antialiased', writingMode: 'vertical-rl'
          },
          wider: {
            blockSize: 'calc(100% - 1rem)', accentColor: 'var(--accent)',
            backgroundBlendMode: 'multiply,screen'
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
        panic!("exact logical and background values were not lowerable")
    };
    assert_eq!(entries.len(), 23);
    assert!(entries.iter().all(|entry| entry
        .properties
        .iter()
        .all(|property| { matches!(property, StyleProperty::WebOnly(_, _)) })));
    let css_names = entries
        .iter()
        .flat_map(|entry| entry.properties.iter())
        .filter_map(|property| match property {
            StyleProperty::WebOnly(name, _) => Some(name.as_str()),
            _ => None,
        })
        .collect::<HashSet<_>>();
    for name in [
        "height",
        "width",
        "min-height",
        "min-width",
        "max-height",
        "max-width",
    ] {
        assert!(
            css_names.contains(name),
            "StyleX logical size should emit {name}"
        );
    }
    assert!(residual.is_empty());
    assert!(gaps.is_empty());

    let Rule::Ready {
        entries,
        residual,
        gaps,
    } = &frontend.sheets["styles"]["wider"]
    else {
        panic!("dynamic and composed Web values should remain residual")
    };
    assert!(entries.is_empty());
    assert_eq!(residual.len(), 3);
    assert_eq!(gaps.len(), 3);
}

#[test]
fn list_table_columns_and_containment_keep_exact_boundaries() {
    let frontend = frontend(
        r#"
        import * as stylex from '@stylexjs/stylex'
        const styles = stylex.create({
          exact: {
            borderCollapse: 'collapse', borderSpacing: '8px 12px',
            captionSide: 'block-start', clip: 'rect(0 10px 10px 0)',
            columnCount: 3, columnFill: 'balance', columnRuleColor: '#123456',
            columnRuleStyle: 'dashed', columnRuleWidth: '2px', columnSpan: 'all',
            columnWidth: '16rem', contain: 'layout paint', contentVisibility: 'auto',
            containIntrinsicBlockSize: 'auto 320px', containIntrinsicHeight: '20rem',
            containIntrinsicInlineSize: 480, containIntrinsicSize: '320px 180px',
            containIntrinsicWidth: 'none',
            displayInside: 'grid', displayList: 'list-item',
            displayOutside: 'inline-level', emptyCells: 'hide',
            listStyleImage: 'url(#marker)', listStylePosition: 'inside',
            listStyleType: 'decimal-leading-zero', tableLayout: 'fixed'
          },
          wider: {
            borderSpacing: '8px 12px 16px', clip: 'circle(50%)', columnCount: 0,
            columnRuleWidth: '-1px', columnWidth: 'calc(50% - 1rem)',
            contain: 'size inline-size', containIntrinsicBlockSize: 'auto',
            containIntrinsicSize: '320px 180px 90px',
            listStyleImage: 'linear-gradient(red, blue)',
            listStyleType: 'symbols(cyclic "A")'
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
        panic!("exact list and table values were not lowerable")
    };
    assert_eq!(entries.len(), 26);
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
        panic!("wider list and table values should remain residual")
    };
    assert!(entries.is_empty());
    assert_eq!(residual.len(), 10);
    assert_eq!(gaps.len(), 10);
}

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
fn svg_paint_web_values_keep_exact_boundaries() {
    let frontend = frontend(
        r#"
        import * as stylex from '@stylexjs/stylex'
        const styles = stylex.create({
          exact: {
            alignmentBaseline: 'middle', baselineShift: '2px', clipRule: 'evenodd',
            dominantBaseline: 'central', fill: '#123456', fillOpacity: 0.5,
            fillRule: 'nonzero', marker: 'url(#dot)', markerEnd: 'none',
            markerMid: 'url(#dot)', markerStart: 'url(#dot)',
            paintOrder: 'stroke fill markers', shapeRendering: 'crispEdges',
            stroke: 'currentColor', strokeDasharray: '5 3', strokeDashoffset: 2,
            strokeLinecap: 'round', strokeLinejoin: 'bevel', strokeMiterlimit: 4,
            strokeOpacity: '50%', strokeWidth: '2px', textAnchor: 'middle'
          },
          wider: {
            baselineShift: 'calc(1em + 2px)', fillOpacity: 1.5,
            marker: 'paint-server', strokeDasharray: '-1 2', strokeMiterlimit: 0
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
        panic!("exact SVG paint values were not lowerable")
    };
    assert_eq!(entries.len(), 22);
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
        panic!("wider SVG paint values should remain residual")
    };
    assert!(entries.is_empty());
    assert_eq!(residual.len(), 5);
    assert_eq!(gaps.len(), 5);
}

#[test]
fn transition_values_the_native_runtime_cannot_preserve_remain_residual() {
    let frontend = frontend(
        r#"
        import * as stylex from '@stylexjs/stylex'
        const styles = stylex.create({
          motion: {
            transitionProperty: 'filter',
            transitionDuration: '0.5ms',
            transitionTimingFunction: 'steps(2, jump-none)'
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
        panic!("static unsupported values should remain residual")
    };
    assert!(entries.is_empty());
    assert_eq!(residual.len(), 3);
    assert_eq!(gaps.len(), 3);
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
