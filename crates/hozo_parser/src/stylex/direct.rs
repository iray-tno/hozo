//! Properties that lower straight to one typed property, without Tailwind.

use hozo_ir::{Dimension, Edge, Length, Origin, Radius, StyleProperty};

use super::border_image::{stylex_border_image, stylex_mask_border};
use super::css_tokens::web_longhand;
use super::filters::{stylex_backdrop_filter, supported_filter_list};
use super::grid::{
    stylex_grid, stylex_grid_area, stylex_grid_line, stylex_grid_span, stylex_grid_template,
    stylex_grid_tracks,
};
use super::keywords::{
    stylex_caret, stylex_font_weight, stylex_order, stylex_overflow, stylex_scroll_edge,
    stylex_text_overflow, stylex_transition, stylex_transition_duration,
    stylex_transition_property, stylex_transition_timing, stylex_white_space,
};
use super::mask::{stylex_mask, web_position_try, web_position_try_fallbacks};
use super::offset::stylex_offset;
use super::shorthands::{
    stylex_column_rule, stylex_columns, stylex_list_style, stylex_place_content,
    stylex_scroll_axis, stylex_scroll_box, stylex_text_shadow,
};
use super::speech::{
    stylex_azimuth, stylex_legacy_motion, stylex_page, stylex_speech_cue, stylex_speech_pause,
    stylex_voice_value,
};
use super::static_value::StaticValue;
use super::text::{portable_font_variant, stylex_font};
use super::timeline::{stylex_animation_range, stylex_scroll_timeline, stylex_view_timeline};
use super::transform::{
    stylex_rotate, stylex_scale, stylex_translate, transform_functions, transform_origin,
};
use super::values::{
    css_color, dimension, px_length, stylex_border_style, stylex_border_width, stylex_container,
    stylex_container_name, stylex_container_type, stylex_flex_flow, stylex_gap,
    stylex_legacy_box_number, stylex_web_border_style,
};
use super::web_only::web_only_property;

pub(super) fn direct_properties(property: &str, value: &StaticValue) -> Option<Vec<StyleProperty>> {
    let width = || px_length(value);
    let dimension = || dimension(value);
    let color = || css_color(value);
    Some(match property {
        "accentColor"
        | "alignTracks"
        | "alignmentBaseline"
        | "anchorName"
        | "animationComposition"
        | "animationDelay"
        | "animationRangeEnd"
        | "animationRangeStart"
        | "animationTimeline"
        | "animationDirection"
        | "animationFillMode"
        | "animationIterationCount"
        | "animationPlayState"
        | "animationTimingFunction"
        | "appearance"
        | "WebkitAppearance"
        | "WebkitLineClamp"
        | "WebkitTextStrokeWidth"
        | "backgroundAttachment"
        | "backgroundBlendMode"
        | "backgroundClip"
        | "WebkitBackgroundClip"
        | "backgroundOrigin"
        | "backgroundPositionX"
        | "backgroundPositionY"
        | "baselineShift"
        | "blockSize"
        | "borderCollapse"
        | "borderImageOutset"
        | "borderImageRepeat"
        | "borderImageSlice"
        | "borderImageSource"
        | "borderImageWidth"
        | "borderSpacing"
        | "gridAutoColumns"
        | "gridAutoFlow"
        | "gridAutoRows"
        | "gridTemplateAreas"
        | "boxAlign"
        | "boxDirection"
        | "boxLines"
        | "boxOrient"
        | "boxSuppress"
        | "boxDecorationBreak"
        | "breakAfter"
        | "breakBefore"
        | "breakInside"
        | "captionSide"
        | "caretShape"
        | "clear"
        | "clip"
        | "clipPath"
        | "clipRule"
        | "colorScheme"
        | "columnCount"
        | "columnFill"
        | "columnRuleColor"
        | "columnRuleStyle"
        | "columnRuleWidth"
        | "columnSpan"
        | "columnWidth"
        | "contain"
        | "containIntrinsicBlockSize"
        | "containIntrinsicHeight"
        | "containIntrinsicInlineSize"
        | "containIntrinsicSize"
        | "containIntrinsicWidth"
        | "contentVisibility"
        | "cornerShape"
        | "cornerStartStartShape"
        | "cornerStartEndShape"
        | "cornerEndStartShape"
        | "cornerEndEndShape"
        | "cornerTopLeftShape"
        | "cornerTopRightShape"
        | "cornerBottomLeftShape"
        | "cornerBottomRightShape"
        | "displayInside"
        | "displayList"
        | "displayOutside"
        | "dominantBaseline"
        | "emptyCells"
        | "fill"
        | "fillOpacity"
        | "fillRule"
        | "float"
        | "forcedColorAdjust"
        | "fontFeatureSettings"
        | "fontKerning"
        | "fontLanguageOverride"
        | "fontOpticalSizing"
        | "fontPalette"
        | "fontSizeAdjust"
        | "fontStretch"
        | "fontSynthesis"
        | "fontSynthesisPosition"
        | "fontSynthesisSmallCaps"
        | "fontSynthesisStyle"
        | "fontSynthesisWeight"
        | "fontVariantAlternates"
        | "fontVariantCaps"
        | "fontVariantEastAsian"
        | "fontVariantLigatures"
        | "fontVariantNumeric"
        | "fontVariantPosition"
        | "counterIncrement"
        | "counterReset"
        | "counterSet"
        | "quotes"
        | "content"
        | "fontVariationSettings"
        | "glyphOrientationHorizontal"
        | "glyphOrientationVertical"
        | "hangingPunctuation"
        | "hyphenateCharacter"
        | "hyphenateLimitChars"
        | "hyphens"
        | "imageOrientation"
        | "imageRendering"
        | "imageResolution"
        | "imeMode"
        | "initialLetter"
        | "initialLetterAlign"
        | "inlineSize"
        | "interpolateSize"
        | "justifyItems"
        | "lineBreak"
        | "lineHeightStep"
        | "listStyleImage"
        | "listStylePosition"
        | "listStyleType"
        | "maxBlockSize"
        | "maxInlineSize"
        | "marker"
        | "markerEnd"
        | "markerMid"
        | "markerStart"
        | "minBlockSize"
        | "maskClip"
        | "maskComposite"
        | "maskImage"
        | "maskMode"
        | "maskOrigin"
        | "maskBorderMode"
        | "maskBorderOutset"
        | "maskBorderRepeat"
        | "maskBorderSlice"
        | "maskBorderSource"
        | "maskBorderWidth"
        | "maskPosition"
        | "maskRepeat"
        | "maskSize"
        | "maskType"
        | "WebkitMaskImage"
        | "justifyTracks"
        | "kerning"
        | "marginTrim"
        | "markerOffset"
        | "masonryAutoFlow"
        | "mathDepth"
        | "mathShift"
        | "mathStyle"
        | "minInlineSize"
        | "MozOsxFontSmoothing"
        | "MsOverflowStyle"
        | "overflowAnchor"
        | "overscrollBehavior"
        | "perspective"
        | "perspectiveOrigin"
        | "offsetAnchor"
        | "offsetDistance"
        | "offsetPath"
        | "offsetPosition"
        | "offsetRotate"
        | "overscrollBehaviorBlock"
        | "overscrollBehaviorInline"
        | "overscrollBehaviorX"
        | "orphans"
        | "outline"
        | "overflowBlock"
        | "overflowBlockX"
        | "overflowClipMargin"
        | "overscrollBehaviorY"
        | "pageBreakAfter"
        | "pageBreakBefore"
        | "pageBreakInside"
        | "paintOrder"
        | "positionAnchor"
        | "positionArea"
        | "positionVisibility"
        | "printColorAdjust"
        | "resize"
        | "rubyAlign"
        | "rubyMerge"
        | "rubyPosition"
        | "scrollSnapAlign"
        | "scrollSnapStop"
        | "scrollSnapType"
        | "scrollTimelineAxis"
        | "scrollTimelineName"
        | "scrollbarColor"
        | "scrollbarGutter"
        | "scrollbarWidth"
        | "shapeImageThreshold"
        | "shapeMargin"
        | "shapeOutside"
        | "shapeRendering"
        | "stroke"
        | "strokeDasharray"
        | "strokeDashoffset"
        | "strokeLinecap"
        | "strokeLinejoin"
        | "strokeMiterlimit"
        | "strokeOpacity"
        | "strokeWidth"
        | "tabSize"
        | "tableLayout"
        | "textAnchor"
        | "textCombineUpright"
        | "textEmphasisColor"
        | "textEmphasisPosition"
        | "textEmphasisStyle"
        | "textFillColor"
        | "textRendering"
        | "textSizeAdjust"
        | "textUnderlineOffset"
        | "textUnderlinePosition"
        | "timelineScope"
        | "touchAction"
        | "transformBox"
        | "transformStyle"
        | "unicodeBidi"
        | "viewTimelineAxis"
        | "viewTimelineInset"
        | "viewTimelineName"
        | "viewTransitionName"
        | "speak"
        | "speakAs"
        | "voiceDuration"
        | "voiceStress"
        | "widows"
        | "willChange"
        | "wordBreak"
        | "wordSpacing"
        | "wordWrap"
        | "overflowWrap"
        | "visibility"
        | "backgroundPosition"
        | "backgroundRepeat"
        | "backgroundSize"
        | "objectPosition"
        | "justifySelf"
        | "placeItems"
        | "placeSelf"
        | "textAlignLast"
        | "textDecoration"
        | "textDecorationSkip"
        | "textDecorationSkipInk"
        | "textDecorationThickness"
        | "textEmphasis"
        | "textJustify"
        | "textOrientation"
        | "textWrap"
        | "animationDuration"
        | "WebkitBoxOrient"
        | "WebkitFontSmoothing"
        | "WebkitTapHighlightColor"
        | "WebkitTextFillColor"
        | "WebkitTextStrokeColor"
        | "writingMode"
        | "zoom" => {
            vec![web_only_property(property, value)?]
        }
        "caret" => stylex_caret(value)?,
        "azimuth" => vec![stylex_azimuth(value)?],
        "cue" => vec![stylex_speech_cue("cue", value)?],
        "cueAfter" => vec![stylex_speech_cue("cue-after", value)?],
        "cueBefore" => vec![stylex_speech_cue("cue-before", value)?],
        "borderImage" => stylex_border_image(value)?,
        "font" => stylex_font(value)?,
        "mask" => stylex_mask(value)?,
        "maskBorder" => stylex_mask_border(value)?,
        "motion" => vec![stylex_legacy_motion("motion", value)?],
        "motionOffset" => vec![stylex_legacy_motion("motion-offset", value)?],
        "motionPath" => vec![stylex_legacy_motion("motion-path", value)?],
        "motionRotation" => vec![stylex_legacy_motion("motion-rotation", value)?],
        "offset" => stylex_offset(value)?,
        "page" => vec![stylex_page(value)?],
        "pause" => vec![stylex_speech_pause("pause", value)?],
        "pauseAfter" => vec![stylex_speech_pause("pause-after", value)?],
        "pauseBefore" => vec![stylex_speech_pause("pause-before", value)?],
        "rest" => vec![stylex_speech_pause("rest", value)?],
        "restAfter" => vec![stylex_speech_pause("rest-after", value)?],
        "restBefore" => vec![stylex_speech_pause("rest-before", value)?],
        "voiceBalance" => vec![stylex_voice_value("voice-balance", value)?],
        "voiceFamily" => vec![stylex_voice_value("voice-family", value)?],
        "voicePitch" => vec![stylex_voice_value("voice-pitch", value)?],
        "voiceRange" => vec![stylex_voice_value("voice-range", value)?],
        "voiceRate" => vec![stylex_voice_value("voice-rate", value)?],
        "voiceVolume" => vec![stylex_voice_value("voice-volume", value)?],
        "positionTryFallbacks" => vec![web_longhand(
            "position-try-fallbacks",
            web_position_try_fallbacks(value)?,
        )],
        "positionTryOptions" => vec![web_longhand(
            "position-try-options",
            web_position_try_fallbacks(value)?,
        )],
        "positionTry" => vec![web_longhand("position-try", web_position_try(value)?)],
        "fontWeight" => vec![StyleProperty::FontWeight(stylex_font_weight(value)?)],
        "boxFlex" => vec![stylex_legacy_box_number("box-flex", value, 0.0, false)?],
        "boxFlexGroup" => vec![stylex_legacy_box_number(
            "box-flex-group",
            value,
            1.0,
            true,
        )?],
        "boxOrdinalGroup" => vec![stylex_legacy_box_number(
            "box-ordinal-group",
            value,
            1.0,
            true,
        )?],
        "whiteSpace" => vec![StyleProperty::WhiteSpace(stylex_white_space(value)?)],
        "textOverflow" => vec![StyleProperty::TextOverflow(stylex_text_overflow(value)?)],
        "caretColor" => vec![StyleProperty::CaretColor(color()?)],
        "order" => vec![StyleProperty::Order(stylex_order(value)?)],
        "overflowX" => vec![StyleProperty::OverflowX(stylex_overflow(value)?)],
        "overflowY" => vec![StyleProperty::OverflowY(stylex_overflow(value)?)],
        "scrollBehavior" => {
            let StaticValue::String(value) = value else {
                return None;
            };
            let value = match value.as_str() {
                "auto" => "auto",
                "smooth" => "smooth",
                _ => return None,
            };
            vec![StyleProperty::ScrollBehavior(value)]
        }
        "scrollMarginTop" => vec![StyleProperty::ScrollMargin(
            stylex_scroll_edge(property)?,
            width()?,
        )],
        "scrollMarginRight" => vec![StyleProperty::ScrollMargin(
            stylex_scroll_edge(property)?,
            width()?,
        )],
        "scrollMarginBottom" => vec![StyleProperty::ScrollMargin(
            stylex_scroll_edge(property)?,
            width()?,
        )],
        "scrollMarginLeft" => vec![StyleProperty::ScrollMargin(
            stylex_scroll_edge(property)?,
            width()?,
        )],
        "scrollMarginBlockStart" => vec![StyleProperty::ScrollMargin(
            stylex_scroll_edge(property)?,
            width()?,
        )],
        "scrollMarginBlockEnd" => vec![StyleProperty::ScrollMargin(
            stylex_scroll_edge(property)?,
            width()?,
        )],
        "scrollMarginInlineStart" => vec![StyleProperty::ScrollMargin(
            stylex_scroll_edge(property)?,
            width()?,
        )],
        "scrollMarginInlineEnd" => vec![StyleProperty::ScrollMargin(
            stylex_scroll_edge(property)?,
            width()?,
        )],
        "scrollPaddingTop" => vec![StyleProperty::ScrollPadding(
            stylex_scroll_edge(property)?,
            width()?,
        )],
        "scrollPaddingRight" => vec![StyleProperty::ScrollPadding(
            stylex_scroll_edge(property)?,
            width()?,
        )],
        "scrollPaddingBottom" => vec![StyleProperty::ScrollPadding(
            stylex_scroll_edge(property)?,
            width()?,
        )],
        "scrollPaddingLeft" => vec![StyleProperty::ScrollPadding(
            stylex_scroll_edge(property)?,
            width()?,
        )],
        "scrollPaddingBlockStart" => vec![StyleProperty::ScrollPadding(
            stylex_scroll_edge(property)?,
            width()?,
        )],
        "scrollPaddingBlockEnd" => vec![StyleProperty::ScrollPadding(
            stylex_scroll_edge(property)?,
            width()?,
        )],
        "scrollPaddingInlineStart" => vec![StyleProperty::ScrollPadding(
            stylex_scroll_edge(property)?,
            width()?,
        )],
        "scrollPaddingInlineEnd" => vec![StyleProperty::ScrollPadding(
            stylex_scroll_edge(property)?,
            width()?,
        )],
        "textIndent" => vec![StyleProperty::TextIndent(dimension()?)],
        "transitionProperty" => vec![StyleProperty::TransitionProperty(
            stylex_transition_property(value)?,
        )],
        "transitionDuration" => vec![StyleProperty::TransitionDuration(
            stylex_transition_duration(value)?,
            Origin::Written,
        )],
        "transitionDelay" => vec![StyleProperty::TransitionDelay(
            stylex_transition_duration(value)?,
            Origin::Written,
        )],
        "transitionTimingFunction" => vec![StyleProperty::TransitionTimingFunction(
            stylex_transition_timing(value)?,
            Origin::Written,
        )],
        "transition" => stylex_transition(value)?,
        "animationRange" => stylex_animation_range(value)?,
        "scrollTimeline" => stylex_scroll_timeline(value)?,
        "viewTimeline" => stylex_view_timeline(value)?,
        "containerName" => vec![StyleProperty::ContainerName(stylex_container_name(value)?)],
        "containerType" => vec![StyleProperty::Keyword(
            "container-type",
            stylex_container_type(value)?,
        )],
        // These Web-only shorthands are expanded into their final CSS slots.
        // This lets atomic priority suppress only the slot a higher-priority
        // conditional longhand makes unreachable.
        "columns" => stylex_columns(value)?,
        "columnRule" => stylex_column_rule(value)?,
        "container" => stylex_container(value)?,
        "flexFlow" => stylex_flex_flow(value)?,
        "gridGap" => stylex_gap(value)?,
        "gridRowGap" => {
            let value = width()?;
            if matches!(&value, Length::Px(number) if *number < 0.0) {
                return None;
            }
            vec![StyleProperty::RowGap(value)]
        }
        "gridColumnGap" => {
            let value = width()?;
            if matches!(&value, Length::Px(number) if *number < 0.0) {
                return None;
            }
            vec![StyleProperty::ColumnGap(value)]
        }
        "borderBlockWidth" => {
            let value = stylex_border_width(value)?;
            vec![
                StyleProperty::BorderLogicalWidth(Edge::BlockStart, value.clone()),
                StyleProperty::BorderLogicalWidth(Edge::BlockEnd, value),
            ]
        }
        "borderBlockStartWidth" => vec![StyleProperty::BorderTopWidth(stylex_border_width(value)?)],
        "borderBlockEndWidth" => vec![StyleProperty::BorderBottomWidth(stylex_border_width(
            value,
        )?)],
        "borderInlineWidth" => {
            let value = stylex_border_width(value)?;
            vec![
                StyleProperty::BorderLogicalWidth(Edge::InlineStart, value.clone()),
                StyleProperty::BorderLogicalWidth(Edge::InlineEnd, value),
            ]
        }
        "borderInlineStartWidth" => vec![StyleProperty::BorderLogicalWidth(
            Edge::InlineStart,
            stylex_border_width(value)?,
        )],
        "borderInlineEndWidth" => vec![StyleProperty::BorderLogicalWidth(
            Edge::InlineEnd,
            stylex_border_width(value)?,
        )],
        "borderInlineColor" => {
            let value = color()?;
            vec![
                StyleProperty::BorderInlineStartColor(value.clone()),
                StyleProperty::BorderInlineEndColor(value),
            ]
        }
        "borderInlineStartColor" => vec![StyleProperty::BorderInlineStartColor(color()?)],
        "borderInlineEndColor" => vec![StyleProperty::BorderInlineEndColor(color()?)],
        "borderBlockStyle" => {
            let value = stylex_border_style(value)?;
            vec![
                StyleProperty::BorderLogicalStyle(Edge::BlockStart, value),
                StyleProperty::BorderLogicalStyle(Edge::BlockEnd, value),
            ]
        }
        "borderInlineStyle" => {
            let value = stylex_border_style(value)?;
            vec![
                StyleProperty::BorderLogicalStyle(Edge::InlineStart, value),
                StyleProperty::BorderLogicalStyle(Edge::InlineEnd, value),
            ]
        }
        "borderInlineStartStyle" => vec![StyleProperty::BorderLogicalStyle(
            Edge::InlineStart,
            stylex_border_style(value)?,
        )],
        "borderInlineEndStyle" => vec![StyleProperty::BorderLogicalStyle(
            Edge::InlineEnd,
            stylex_border_style(value)?,
        )],
        // StyleX normalizes the block-start/end aliases to physical top/bottom.
        // Keep the StyleX lane Web-only: React Native has only one global
        // borderStyle and cannot preserve a side-specific authored style.
        "borderBlockStartStyle" => vec![stylex_web_border_style("border-top-style", value)?],
        "borderBlockEndStyle" => vec![stylex_web_border_style("border-bottom-style", value)?],
        "borderTopStyle" => vec![stylex_web_border_style("border-top-style", value)?],
        "borderBottomStyle" => vec![stylex_web_border_style("border-bottom-style", value)?],
        "borderRightStyle" => vec![stylex_web_border_style("border-right-style", value)?],
        "borderLeftStyle" => vec![stylex_web_border_style("border-left-style", value)?],
        "listStyle" => stylex_list_style(value)?,
        "scrollMargin" => stylex_scroll_box(value, false)?,
        "scrollPadding" => stylex_scroll_box(value, true)?,
        "scrollMarginBlock" => stylex_scroll_axis(value, false, Edge::BlockStart, Edge::BlockEnd)?,
        "scrollMarginInline" => {
            stylex_scroll_axis(value, false, Edge::InlineStart, Edge::InlineEnd)?
        }
        "scrollPaddingBlock" => stylex_scroll_axis(value, true, Edge::BlockStart, Edge::BlockEnd)?,
        "scrollPaddingInline" => {
            stylex_scroll_axis(value, true, Edge::InlineStart, Edge::InlineEnd)?
        }
        // StyleX emits these as CSS shorthands at a lower atomic priority
        // than their longhands. Split them into the typed final slots here
        // so the same priority resolution works on Web and Native.
        "gap" => stylex_gap(value)?,
        "borderRadius" => {
            let value = Radius::Length(width()?);
            vec![
                StyleProperty::BorderTopLeftRadius(value.clone()),
                StyleProperty::BorderTopRightRadius(value.clone()),
                StyleProperty::BorderBottomRightRadius(value.clone()),
                StyleProperty::BorderBottomLeftRadius(value),
            ]
        }
        "flex" => {
            let StaticValue::String(value) = value else {
                return None;
            };
            let (grow, shrink, basis) = match value.as_str() {
                "auto" => (1.0, 1.0, Dimension::Auto),
                "initial" => (0.0, 1.0, Dimension::Auto),
                "none" => (0.0, 0.0, Dimension::Auto),
                "1" => (1.0, 1.0, Dimension::Percent(0.0)),
                _ => return None,
            };
            vec![
                StyleProperty::FlexGrow(grow),
                StyleProperty::FlexShrink(shrink),
                StyleProperty::FlexBasis(basis),
            ]
        }
        "gridTemplateColumns" => vec![StyleProperty::GridTemplateColumns(stylex_grid_tracks(
            value,
        )?)],
        "gridTemplateRows" => vec![StyleProperty::GridTemplateRows(stylex_grid_tracks(value)?)],
        "gridColumnStart" => vec![StyleProperty::GridColumnStart(stylex_grid_line(value)?)],
        "gridColumnEnd" => vec![StyleProperty::GridColumnEnd(stylex_grid_line(value)?)],
        "gridRowStart" => vec![StyleProperty::GridRowStart(stylex_grid_line(value)?)],
        "gridRowEnd" => vec![StyleProperty::GridRowEnd(stylex_grid_line(value)?)],
        "gridColumn" => vec![StyleProperty::GridColumn(stylex_grid_span(value)?)],
        "gridRow" => vec![StyleProperty::GridRow(stylex_grid_span(value)?)],
        "gridArea" => stylex_grid_area(value)?,
        "gridTemplate" => stylex_grid_template(value)?,
        "grid" => stylex_grid(value)?,
        "rotate" => vec![StyleProperty::Rotate(stylex_rotate(value)?)],
        "scale" => vec![StyleProperty::Scale(stylex_scale(value)?)],
        "translate" => vec![StyleProperty::Translate(stylex_translate(value)?)],
        "transform" => vec![StyleProperty::Transform(transform_functions(value)?)],
        "transformOrigin" => vec![StyleProperty::TransformOrigin(transform_origin(value)?)],
        "textShadow" => vec![StyleProperty::TextShadow(stylex_text_shadow(value)?)],
        "placeContent" => stylex_place_content(value)?,
        // The shared IR deliberately keeps the complete shadow list as CSS
        // text. That preserves authored layer order and also maps directly
        // to React Native's string-valued `boxShadow` support.
        "boxShadow" => {
            let StaticValue::String(value) = value else {
                return None;
            };
            let value = value
                .split(',')
                .map(str::trim)
                .collect::<Vec<_>>()
                .join(",");
            vec![StyleProperty::BoxShadow(value)]
        }
        "backgroundImage" => {
            let StaticValue::String(value) = value else {
                return None;
            };
            let value = value.trim();
            if value == "none" {
                vec![StyleProperty::BackgroundImageNone]
            } else if (value.starts_with("linear-gradient(")
                || value.starts_with("radial-gradient("))
                && value.ends_with(')')
                && !value.contains("var(")
                && !value.contains("env(")
            {
                let value = value
                    .split(',')
                    .map(str::trim)
                    .collect::<Vec<_>>()
                    .join(",");
                vec![StyleProperty::BackgroundImage(value)]
            } else {
                return None;
            }
        }
        "filter" => {
            let StaticValue::String(value) = value else {
                return None;
            };
            let value = value.trim();
            if value != "none" && !supported_filter_list(value) {
                return None;
            }
            vec![StyleProperty::FilterRaw(value.to_string())]
        }
        "backdropFilter" => stylex_backdrop_filter(value)?,
        "direction" => {
            let StaticValue::String(value) = value else {
                return None;
            };
            let value = ["inherit", "ltr", "rtl"]
                .into_iter()
                .find(|candidate| *candidate == value)?;
            vec![StyleProperty::Keyword("direction", value)]
        }
        "fontFamily" => {
            let StaticValue::String(value) = value else {
                return None;
            };
            let value = value.trim();
            if value.is_empty() || value.contains(',') || value.contains("var(") {
                return None;
            }
            vec![StyleProperty::FontFamily(hozo_ir::FontFamily::Literal(
                value.to_string(),
            ))]
        }
        "fontVariant" => {
            let StaticValue::String(value) = value else {
                return None;
            };
            let variants = value
                .split_whitespace()
                .map(portable_font_variant)
                .collect::<Option<Vec<_>>>()?;
            if variants.is_empty() {
                return None;
            }
            vec![StyleProperty::FontVariant(variants)]
        }
        // Tailwind's border-width utilities intentionally add a solid
        // style so they paint without a reset. StyleX declares exactly the
        // requested property, so it must bypass that Tailwind-specific
        // expansion or `borderWidth: 2` would also change borderStyle.
        "borderWidth" => {
            let value = width()?;
            vec![
                StyleProperty::BorderTopWidth(value.clone()),
                StyleProperty::BorderRightWidth(value.clone()),
                StyleProperty::BorderBottomWidth(value.clone()),
                StyleProperty::BorderLeftWidth(value),
            ]
        }
        "borderTopWidth" => vec![StyleProperty::BorderTopWidth(width()?)],
        "borderRightWidth" => vec![StyleProperty::BorderRightWidth(width()?)],
        "borderBottomWidth" => vec![StyleProperty::BorderBottomWidth(width()?)],
        "borderLeftWidth" => vec![StyleProperty::BorderLeftWidth(width()?)],
        // Expanding the shorthand into the four typed slots makes its
        // overlap with a side longhand visible to `same_property_as`.
        "borderColor" => {
            let value = color()?;
            vec![
                StyleProperty::BorderTopColor(value.clone()),
                StyleProperty::BorderRightColor(value.clone()),
                StyleProperty::BorderBottomColor(value.clone()),
                StyleProperty::BorderLeftColor(value),
            ]
        }
        "borderTopColor" => vec![StyleProperty::BorderTopColor(color()?)],
        "borderRightColor" => vec![StyleProperty::BorderRightColor(color()?)],
        "borderBottomColor" => vec![StyleProperty::BorderBottomColor(color()?)],
        "borderLeftColor" => vec![StyleProperty::BorderLeftColor(color()?)],
        "borderBlockColor" => {
            let value = color()?;
            vec![
                StyleProperty::BorderTopColor(value.clone()),
                StyleProperty::BorderBottomColor(value),
            ]
        }
        // StyleX defines these aliases in terms of physical top/bottom,
        // which its official compiler confirms. Follow that contract even
        // though the CSS names themselves look writing-mode-relative.
        "borderBlockStartColor" => vec![StyleProperty::BorderTopColor(color()?)],
        "borderBlockEndColor" => vec![StyleProperty::BorderBottomColor(color()?)],
        // The arbitrary Tailwind outline-width form also adds `solid`;
        // StyleX does not. Keep width and offset independent here.
        "outlineWidth" => vec![StyleProperty::OutlineWidth(width()?)],
        "outlineOffset" => vec![StyleProperty::OutlineOffset(width()?)],
        // StyleX exposes both the modern inset names and React Native's
        // start/end aliases. Keep all of them logical in IR so RTL is
        // decided by the platform rather than baked into the compiler.
        "start" => vec![StyleProperty::InsetInlineStart(dimension()?)],
        "insetInlineStart" => vec![StyleProperty::InsetInlineStart(dimension()?)],
        "end" => vec![StyleProperty::InsetInlineEnd(dimension()?)],
        "insetInlineEnd" => vec![StyleProperty::InsetInlineEnd(dimension()?)],
        "insetInline" => {
            let value = dimension()?;
            vec![
                StyleProperty::InsetInlineStart(value.clone()),
                StyleProperty::InsetInlineEnd(value),
            ]
        }
        "insetBlockStart" => vec![StyleProperty::InsetTop(dimension()?)],
        "insetBlockEnd" => vec![StyleProperty::InsetBottom(dimension()?)],
        "insetBlock" => {
            let value = dimension()?;
            vec![
                StyleProperty::InsetTop(value.clone()),
                StyleProperty::InsetBottom(value),
            ]
        }
        "inset" => {
            let value = dimension()?;
            vec![
                StyleProperty::InsetTop(value.clone()),
                StyleProperty::InsetRight(value.clone()),
                StyleProperty::InsetBottom(value.clone()),
                StyleProperty::InsetLeft(value),
            ]
        }
        "marginInline" => {
            let value = dimension()?;
            vec![
                StyleProperty::MarginInlineStart(value.clone()),
                StyleProperty::MarginInlineEnd(value),
            ]
        }
        "marginBlockStart" => vec![StyleProperty::MarginTop(dimension()?)],
        "marginBlockEnd" => vec![StyleProperty::MarginBottom(dimension()?)],
        "marginBlock" => {
            let value = dimension()?;
            vec![
                StyleProperty::MarginTop(value.clone()),
                StyleProperty::MarginBottom(value),
            ]
        }
        "paddingInline" => {
            let value = width()?;
            vec![
                StyleProperty::PaddingInlineStart(value.clone()),
                StyleProperty::PaddingInlineEnd(value),
            ]
        }
        "paddingBlockStart" => vec![StyleProperty::PaddingTop(width()?)],
        "paddingBlockEnd" => vec![StyleProperty::PaddingBottom(width()?)],
        "paddingBlock" => {
            let value = width()?;
            vec![
                StyleProperty::PaddingTop(value.clone()),
                StyleProperty::PaddingBottom(value),
            ]
        }
        _ => return None,
    })
}
