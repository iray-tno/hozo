use super::*;

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
