//! Web-only properties and the grammar each one's value must match.

use super::web_grammar::WebValueGrammar;
use super::web_keywords::web_only_keyword_spec;

pub(super) fn web_only_spec(property: &str) -> Option<(&'static str, WebValueGrammar)> {
    match property {
        "accentColor" => Some(("accent-color", WebValueGrammar::Color)),
        "WebkitLineClamp" => Some((
            "-webkit-line-clamp",
            WebValueGrammar::Integer {
                keywords: &["none"],
                minimum: 1,
                maximum: i64::MAX,
            },
        )),
        "WebkitTextStrokeWidth" => Some((
            "-webkit-text-stroke-width",
            WebValueGrammar::Length {
                keywords: &["thin", "medium", "thick"],
                minimum: 0.0,
            },
        )),
        "hyphenateLimitChars" => Some((
            "hyphenate-limit-chars",
            WebValueGrammar::HyphenateLimitChars,
        )),
        "lineHeightStep" => Some((
            "line-height-step",
            WebValueGrammar::Length {
                keywords: &[],
                minimum: 0.0,
            },
        )),
        "mathDepth" => Some(("math-depth", WebValueGrammar::MathDepth)),
        "masonryAutoFlow" => Some(("masonry-auto-flow", WebValueGrammar::MasonryAutoFlow)),
        "imageResolution" => Some(("image-resolution", WebValueGrammar::ImageResolution)),
        "initialLetter" => Some(("initial-letter", WebValueGrammar::InitialLetter)),
        "voiceDuration" => Some(("voice-duration", WebValueGrammar::Time)),
        "scrollTimelineName" => Some((
            "scroll-timeline-name",
            WebValueGrammar::TimelineNames { allow_all: false },
        )),
        "anchorName" => Some((
            "anchor-name",
            WebValueGrammar::TimelineNames { allow_all: false },
        )),
        "positionAnchor" => Some((
            "position-anchor",
            WebValueGrammar::DashedIdent { keyword: "auto" },
        )),
        "timelineScope" => Some((
            "timeline-scope",
            WebValueGrammar::TimelineNames { allow_all: true },
        )),
        "viewTimelineName" => Some((
            "view-timeline-name",
            WebValueGrammar::TimelineNames { allow_all: false },
        )),
        "viewTransitionName" => Some(("view-transition-name", WebValueGrammar::ViewTransitionName)),
        "viewTimelineInset" => Some(("view-timeline-inset", WebValueGrammar::ViewTimelineInset)),
        "orphans" => Some((
            "orphans",
            WebValueGrammar::Integer {
                keywords: &[],
                minimum: 1,
                maximum: i64::MAX,
            },
        )),
        "widows" => Some((
            "widows",
            WebValueGrammar::Integer {
                keywords: &[],
                minimum: 1,
                maximum: i64::MAX,
            },
        )),
        "borderSpacing" => Some((
            "border-spacing",
            WebValueGrammar::LengthList {
                minimum: 1,
                maximum: 2,
            },
        )),
        "borderImageSource" => Some(("border-image-source", WebValueGrammar::MaskImage)),
        "borderImageSlice" => Some(("border-image-slice", WebValueGrammar::BorderImageSlice)),
        "borderImageWidth" => Some(("border-image-width", WebValueGrammar::BorderImageWidth)),
        "borderImageOutset" => Some(("border-image-outset", WebValueGrammar::BorderImageOutset)),
        "borderImageRepeat" => Some(("border-image-repeat", WebValueGrammar::BorderImageRepeat)),
        "maskBorderMode" => Some((
            "mask-border-mode",
            WebValueGrammar::Keywords(&["alpha", "luminance"]),
        )),
        "maskBorderOutset" => Some(("mask-border-outset", WebValueGrammar::BorderImageOutset)),
        "maskBorderRepeat" => Some(("mask-border-repeat", WebValueGrammar::BorderImageRepeat)),
        "maskBorderSlice" => Some(("mask-border-slice", WebValueGrammar::BorderImageSlice)),
        "maskBorderSource" => Some(("mask-border-source", WebValueGrammar::MaskImage)),
        "maskBorderWidth" => Some(("mask-border-width", WebValueGrammar::BorderImageWidth)),
        "gridAutoColumns" => Some(("grid-auto-columns", WebValueGrammar::GridTrackList)),
        "gridAutoRows" => Some(("grid-auto-rows", WebValueGrammar::GridTrackList)),
        "gridAutoFlow" => Some(("grid-auto-flow", WebValueGrammar::GridAutoFlow)),
        "gridTemplateAreas" => Some(("grid-template-areas", WebValueGrammar::GridTemplateAreas)),
        "glyphOrientationHorizontal" => {
            Some(("glyph-orientation-horizontal", WebValueGrammar::Angle(&[])))
        }
        "glyphOrientationVertical" => Some((
            "glyph-orientation-vertical",
            WebValueGrammar::Angle(&["auto"]),
        )),
        "kerning" => Some(("kerning", WebValueGrammar::SvgLength(&["auto"]))),
        "markerOffset" => Some(("marker-offset", WebValueGrammar::SvgLength(&["auto"]))),
        "textDecorationSkip" => Some(("text-decoration-skip", WebValueGrammar::TextDecorationSkip)),
        "counterIncrement" => Some((
            "counter-increment",
            WebValueGrammar::CounterList {
                allow_reversed: false,
            },
        )),
        "counterReset" => Some((
            "counter-reset",
            WebValueGrammar::CounterList {
                allow_reversed: true,
            },
        )),
        "counterSet" => Some((
            "counter-set",
            WebValueGrammar::CounterList {
                allow_reversed: false,
            },
        )),
        "scrollbarColor" => Some(("scrollbar-color", WebValueGrammar::ScrollbarColor)),
        "quotes" => Some(("quotes", WebValueGrammar::Quotes)),
        "content" => Some(("content", WebValueGrammar::Content)),
        "zoom" => Some(("zoom", WebValueGrammar::Zoom)),
        "textDecoration" => Some(("text-decoration", WebValueGrammar::TextDecoration)),
        "textEmphasis" => Some(("text-emphasis", WebValueGrammar::TextEmphasis)),
        "outline" => Some(("outline", WebValueGrammar::Outline)),
        "baselineShift" => Some((
            "baseline-shift",
            WebValueGrammar::SvgLength(&["baseline", "sub", "super"]),
        )),
        "fill" => Some(("fill", WebValueGrammar::Color)),
        "fillOpacity" => Some((
            "fill-opacity",
            WebValueGrammar::NumberPercentage {
                minimum: 0.0,
                maximum: 1.0,
            },
        )),
        "fontFeatureSettings" => Some((
            "font-feature-settings",
            WebValueGrammar::FontFeatureSettings,
        )),
        "fontLanguageOverride" => Some((
            "font-language-override",
            WebValueGrammar::FontLanguageOverride,
        )),
        "fontPalette" => Some(("font-palette", WebValueGrammar::FontPalette)),
        // StyleX 0.19 turns numeric length-like values into px even though the
        // CSS property itself is unitless. Preserve that observable output.
        "fontSizeAdjust" => Some((
            "font-size-adjust",
            WebValueGrammar::Length {
                keywords: &["none"],
                minimum: 0.0,
            },
        )),
        "fontSynthesis" => Some(("font-synthesis", WebValueGrammar::FontSynthesis)),
        "fontVariantAlternates" => Some((
            "font-variant-alternates",
            WebValueGrammar::FontVariantAlternates,
        )),
        "fontVariantEastAsian" => Some((
            "font-variant-east-asian",
            WebValueGrammar::FontVariantEastAsian,
        )),
        "fontVariationSettings" => Some((
            "font-variation-settings",
            WebValueGrammar::FontVariationSettings,
        )),
        "hangingPunctuation" => Some(("hanging-punctuation", WebValueGrammar::HangingPunctuation)),
        "hyphenateCharacter" => Some(("hyphenate-character", WebValueGrammar::HyphenateCharacter)),
        "marker" => Some(("marker", WebValueGrammar::UrlOrNone)),
        "markerEnd" => Some(("marker-end", WebValueGrammar::UrlOrNone)),
        "markerMid" => Some(("marker-mid", WebValueGrammar::UrlOrNone)),
        "markerStart" => Some(("marker-start", WebValueGrammar::UrlOrNone)),
        "WebkitMaskImage" => Some(("-webkit-mask-image", WebValueGrammar::MaskImage)),
        "maskImage" => Some(("mask-image", WebValueGrammar::MaskImage)),
        "maskMode" => Some((
            "mask-mode",
            WebValueGrammar::CommaKeywordGroups {
                keywords: &["match-source", "luminance", "alpha"],
                minimum: 1,
                maximum: 1,
            },
        )),
        "maskRepeat" => Some((
            "mask-repeat",
            WebValueGrammar::CommaKeywordGroups {
                keywords: &[
                    "repeat-x",
                    "repeat-y",
                    "repeat",
                    "space",
                    "round",
                    "no-repeat",
                ],
                minimum: 1,
                maximum: 2,
            },
        )),
        "maskPosition" => Some(("mask-position", WebValueGrammar::MaskPosition)),
        "maskSize" => Some(("mask-size", WebValueGrammar::MaskSize)),
        "maskOrigin" => Some((
            "mask-origin",
            WebValueGrammar::CommaKeywordGroups {
                keywords: &[
                    "content-box",
                    "padding-box",
                    "border-box",
                    "fill-box",
                    "stroke-box",
                    "view-box",
                ],
                minimum: 1,
                maximum: 1,
            },
        )),
        "maskClip" => Some((
            "mask-clip",
            WebValueGrammar::CommaKeywordGroups {
                keywords: &[
                    "content-box",
                    "padding-box",
                    "border-box",
                    "fill-box",
                    "stroke-box",
                    "view-box",
                    "no-clip",
                ],
                minimum: 1,
                maximum: 1,
            },
        )),
        "maskComposite" => Some((
            "mask-composite",
            WebValueGrammar::CommaKeywordGroups {
                keywords: &["add", "subtract", "intersect", "exclude"],
                minimum: 1,
                maximum: 1,
            },
        )),
        "maskType" => Some((
            "mask-type",
            WebValueGrammar::Keywords(&["luminance", "alpha"]),
        )),
        "offsetAnchor" => Some(("offset-anchor", WebValueGrammar::OffsetPosition(&["auto"]))),
        "offsetDistance" => Some(("offset-distance", WebValueGrammar::LengthPercentage(&[]))),
        "offsetPath" => Some(("offset-path", WebValueGrammar::OffsetPath)),
        "offsetPosition" => Some((
            "offset-position",
            WebValueGrammar::OffsetPosition(&["normal", "auto"]),
        )),
        "offsetRotate" => Some(("offset-rotate", WebValueGrammar::OffsetRotate)),
        "shapeImageThreshold" => Some((
            "shape-image-threshold",
            WebValueGrammar::Number {
                minimum: 0.0,
                maximum: 1.0,
            },
        )),
        "shapeMargin" => Some((
            "shape-margin",
            WebValueGrammar::NonNegativeLengthPercentage(&[]),
        )),
        "shapeOutside" => Some(("shape-outside", WebValueGrammar::ShapeOutside)),
        "clip" => Some(("clip", WebValueGrammar::ClipRect)),
        "columnCount" => Some((
            "column-count",
            WebValueGrammar::Integer {
                keywords: &["auto"],
                minimum: 1,
                maximum: i64::MAX,
            },
        )),
        "columnRuleColor" => Some(("column-rule-color", WebValueGrammar::Color)),
        "columnRuleWidth" => Some((
            "column-rule-width",
            WebValueGrammar::Length {
                keywords: &["thin", "medium", "thick"],
                minimum: 0.0,
            },
        )),
        "columnWidth" => Some((
            "column-width",
            WebValueGrammar::Length {
                keywords: &["auto"],
                minimum: 0.0,
            },
        )),
        "contain" => Some(("contain", WebValueGrammar::Contain)),
        "listStyleImage" => Some(("list-style-image", WebValueGrammar::UrlOrNone)),
        "stroke" => Some(("stroke", WebValueGrammar::Color)),
        "strokeDasharray" => Some(("stroke-dasharray", WebValueGrammar::SvgDasharray)),
        "strokeDashoffset" => Some(("stroke-dashoffset", WebValueGrammar::SvgLength(&[]))),
        "strokeMiterlimit" => Some((
            "stroke-miterlimit",
            WebValueGrammar::Number {
                minimum: 1.0,
                maximum: f64::INFINITY,
            },
        )),
        "strokeOpacity" => Some((
            "stroke-opacity",
            WebValueGrammar::NumberPercentage {
                minimum: 0.0,
                maximum: 1.0,
            },
        )),
        "strokeWidth" => Some(("stroke-width", WebValueGrammar::SvgLength(&[]))),
        "WebkitTapHighlightColor" => Some(("-webkit-tap-highlight-color", WebValueGrammar::Color)),
        "WebkitTextFillColor" => Some(("-webkit-text-fill-color", WebValueGrammar::Color)),
        "WebkitTextStrokeColor" => Some(("-webkit-text-stroke-color", WebValueGrammar::Color)),
        "blockSize" => Some((
            "height",
            WebValueGrammar::LengthPercentage(&[
                "auto",
                "available",
                "min-content",
                "max-content",
                "fit-content",
            ]),
        )),
        "inlineSize" => Some((
            "width",
            WebValueGrammar::LengthPercentage(&[
                "auto",
                "available",
                "min-content",
                "max-content",
                "fit-content",
            ]),
        )),
        "minBlockSize" => Some((
            "min-height",
            WebValueGrammar::LengthPercentage(&[
                "auto",
                "min-content",
                "max-content",
                "fit-content",
                "fill-available",
            ]),
        )),
        "minInlineSize" => Some((
            "min-width",
            WebValueGrammar::LengthPercentage(&[
                "auto",
                "min-content",
                "max-content",
                "fit-content",
                "fill-available",
            ]),
        )),
        "maxBlockSize" => Some((
            "max-height",
            WebValueGrammar::LengthPercentage(&[
                "none",
                "min-content",
                "max-content",
                "fit-content",
                "fill-available",
            ]),
        )),
        "maxInlineSize" => Some((
            "max-width",
            WebValueGrammar::LengthPercentage(&[
                "none",
                "min-content",
                "max-content",
                "fit-content",
                "fill-available",
            ]),
        )),
        "animationDelay" => Some(("animation-delay", WebValueGrammar::SignedTime)),
        "animationDuration" => Some(("animation-duration", WebValueGrammar::Time)),
        "animationTimingFunction" => Some((
            "animation-timing-function",
            WebValueGrammar::AnimationTimingFunction,
        )),
        "animationTimeline" => Some(("animation-timeline", WebValueGrammar::AnimationTimeline)),
        "animationRangeStart" => Some((
            "animation-range-start",
            WebValueGrammar::AnimationRangeBoundary,
        )),
        "animationRangeEnd" => Some((
            "animation-range-end",
            WebValueGrammar::AnimationRangeBoundary,
        )),
        "clipPath" => Some(("clip-path", WebValueGrammar::ClipPath)),
        "containIntrinsicBlockSize" => Some((
            "contain-intrinsic-height",
            WebValueGrammar::ContainIntrinsicSize { axes: 1 },
        )),
        "containIntrinsicHeight" => Some((
            "contain-intrinsic-height",
            WebValueGrammar::ContainIntrinsicSize { axes: 1 },
        )),
        "containIntrinsicInlineSize" => Some((
            "contain-intrinsic-width",
            WebValueGrammar::ContainIntrinsicSize { axes: 1 },
        )),
        "containIntrinsicSize" => Some((
            "contain-intrinsic-size",
            WebValueGrammar::ContainIntrinsicSize { axes: 2 },
        )),
        "containIntrinsicWidth" => Some((
            "contain-intrinsic-width",
            WebValueGrammar::ContainIntrinsicSize { axes: 1 },
        )),
        "perspective" => Some((
            "perspective",
            WebValueGrammar::Length {
                keywords: &["none"],
                minimum: 0.0,
            },
        )),
        "perspectiveOrigin" => Some(("perspective-origin", WebValueGrammar::PerspectiveOrigin)),
        "overflowClipMargin" => Some(("overflow-clip-margin", WebValueGrammar::OverflowClipMargin)),
        "willChange" => Some(("will-change", WebValueGrammar::WillChange)),
        "animationIterationCount" => Some((
            "animation-iteration-count",
            WebValueGrammar::NumberWithKeywords {
                keywords: &["infinite"],
                minimum: 0.0,
                maximum: f64::INFINITY,
            },
        )),
        "tabSize" => Some(("tab-size", WebValueGrammar::TabSize)),
        "textCombineUpright" => Some(("text-combine-upright", WebValueGrammar::TextCombineUpright)),
        "textEmphasisColor" => Some(("text-emphasis-color", WebValueGrammar::Color)),
        "textEmphasisPosition" => Some((
            "text-emphasis-position",
            WebValueGrammar::Keywords(&[
                "over",
                "under",
                "over right",
                "over left",
                "under right",
                "under left",
            ]),
        )),
        "textEmphasisStyle" => Some(("text-emphasis-style", WebValueGrammar::TextEmphasisStyle)),
        "textFillColor" => Some(("text-fill-color", WebValueGrammar::Color)),
        "textSizeAdjust" => Some((
            "text-size-adjust",
            WebValueGrammar::Percentage {
                keywords: &["none", "auto"],
                minimum: 0.0,
                maximum: f64::INFINITY,
            },
        )),
        "textDecorationThickness" => Some((
            "text-decoration-thickness",
            WebValueGrammar::NonNegativeLengthPercentage(&["auto", "from-font"]),
        )),
        "textUnderlineOffset" => Some((
            "text-underline-offset",
            WebValueGrammar::Length {
                keywords: &["auto"],
                minimum: f64::NEG_INFINITY,
            },
        )),
        "textUnderlinePosition" => Some((
            "text-underline-position",
            WebValueGrammar::Keywords(&[
                "auto",
                "from-font",
                "under",
                "left",
                "right",
                "under left",
                "under right",
                "left under",
                "right under",
            ]),
        )),
        "wordSpacing" => Some((
            "word-spacing",
            WebValueGrammar::LengthPercentage(&["normal"]),
        )),
        _ => web_only_keyword_spec(property)
            .map(|(css_property, choices)| (css_property, WebValueGrammar::Keywords(choices))),
    }
}
