//! Lowering a Web-only declaration through its named grammar.

use hozo_ir::StyleProperty;

use super::border_image::{
    web_border_image_outset, web_border_image_repeat, web_border_image_slice,
    web_border_image_width,
};
use super::css_tokens::{web_css_identifier, web_css_string};
use super::keywords::stylex_transition_duration;
use super::mask::{web_mask_image, web_mask_position, web_mask_size};
use super::offset::{web_offset_path, web_offset_position, web_offset_rotate, web_shape_outside};
use super::static_value::{numeric_text, raw_value, StaticValue};
use super::text::{
    web_font_setting, web_font_synthesis, web_font_variant_alternates, web_font_variant_east_asian,
    web_hanging_punctuation, web_tab_size, web_text_combine_upright, web_text_emphasis_style,
};
use super::timeline::{
    web_animation_range_boundary, web_animation_timeline, web_dashed_ident, web_timeline_names,
    web_view_timeline_inset, web_view_transition_name,
};
use super::values::{css_color, length_value};
use super::web_functions::{
    web_animation_timing_function, web_clip_path, web_comma_keyword_groups, web_perspective_origin,
    web_signed_time, web_will_change,
};
use super::web_grammar::WebValueGrammar;
use super::web_grid::{
    web_grid_auto_flow, web_grid_template_areas, web_grid_track_list, web_svg_dasharray,
    web_url_or_none,
};
use super::web_length::{
    web_contain_intrinsic_size, web_hyphenate_limit_chars, web_image_resolution,
    web_initial_letter, web_length, web_length_number, web_length_percentage,
    web_length_percentage_string, web_math_depth, web_overflow_clip_margin,
};
use super::web_specs::web_only_spec;
use super::web_values::{
    web_angle, web_clip_rect, web_contain, web_counter_list, web_generated_content, web_integer,
    web_length_list, web_masonry_auto_flow, web_number, web_number_percentage, web_outline,
    web_quotes, web_scrollbar_color, web_svg_length, web_text_decoration, web_text_decoration_skip,
    web_text_emphasis, web_zoom,
};

pub(super) fn web_only_property(property: &str, value: &StaticValue) -> Option<StyleProperty> {
    let (css_property, grammar) = web_only_spec(property)?;
    let value = match grammar {
        WebValueGrammar::Keywords(choices) => {
            let StaticValue::String(value) = value else {
                return None;
            };
            choices.contains(&value.as_str()).then(|| value.clone())?
        }
        WebValueGrammar::Length { keywords, minimum } => web_length(value, keywords, minimum)?,
        WebValueGrammar::LengthPercentage(keywords) => match value {
            StaticValue::String(value) if keywords.contains(&value.as_str()) => value.clone(),
            value if web_length_percentage(value) => length_value(value),
            _ => return None,
        },
        WebValueGrammar::NonNegativeLengthPercentage(keywords) => match value {
            StaticValue::String(value) if keywords.contains(&value.as_str()) => value.clone(),
            StaticValue::Number(value) if value.is_finite() && *value >= 0.0 => {
                format!("{}px", numeric_text(*value))
            }
            StaticValue::String(value)
                if web_length_percentage_string(value)
                    && web_length_number(value).is_some_and(|number| number >= 0.0) =>
            {
                value.clone()
            }
            _ => return None,
        },
        WebValueGrammar::LengthList { minimum, maximum } => {
            web_length_list(value, minimum, maximum)?
        }
        WebValueGrammar::SvgLength(keywords) => match value {
            StaticValue::String(value) if keywords.contains(&value.as_str()) => value.clone(),
            value if web_svg_length(value) => raw_value(value),
            _ => return None,
        },
        WebValueGrammar::Color => {
            css_color(value)?;
            raw_value(value)
        }
        WebValueGrammar::Integer {
            keywords,
            minimum,
            maximum,
        } => match value {
            StaticValue::String(value) if keywords.contains(&value.as_str()) => value.clone(),
            value => web_integer(value, minimum, maximum)?,
        },
        WebValueGrammar::Number { minimum, maximum } => web_number(value, minimum, maximum)?,
        WebValueGrammar::NumberWithKeywords {
            keywords,
            minimum,
            maximum,
        } => match value {
            StaticValue::String(value) if keywords.contains(&value.as_str()) => value.clone(),
            value => web_number(value, minimum, maximum)?,
        },
        WebValueGrammar::NumberPercentage { minimum, maximum } => {
            web_number_percentage(value, minimum, maximum)?
        }
        WebValueGrammar::ClipRect => web_clip_rect(value)?,
        WebValueGrammar::ClipPath => web_clip_path(value)?,
        WebValueGrammar::Contain => web_contain(value)?,
        WebValueGrammar::ContainIntrinsicSize { axes } => web_contain_intrinsic_size(value, axes)?,
        WebValueGrammar::OverflowClipMargin => web_overflow_clip_margin(value)?,
        WebValueGrammar::SvgDasharray => web_svg_dasharray(value)?,
        WebValueGrammar::UrlOrNone => web_url_or_none(value)?,
        WebValueGrammar::Time => {
            let seconds = stylex_transition_duration(value)? as f64 / 1000.0;
            format!("{seconds}s")
        }
        WebValueGrammar::SignedTime => web_signed_time(value)?,
        WebValueGrammar::AnimationTimingFunction => web_animation_timing_function(value)?,
        WebValueGrammar::BorderImageOutset => web_border_image_outset(value)?,
        WebValueGrammar::BorderImageRepeat => web_border_image_repeat(value)?,
        WebValueGrammar::BorderImageSlice => web_border_image_slice(value)?,
        WebValueGrammar::BorderImageWidth => web_border_image_width(value)?,
        WebValueGrammar::GridAutoFlow => web_grid_auto_flow(value)?,
        WebValueGrammar::GridTemplateAreas => web_grid_template_areas(value)?,
        WebValueGrammar::GridTrackList => web_grid_track_list(value)?,
        WebValueGrammar::CommaKeywordGroups {
            keywords,
            minimum,
            maximum,
        } => web_comma_keyword_groups(value, keywords, minimum, maximum)?,
        WebValueGrammar::MaskImage => web_mask_image(value)?,
        WebValueGrammar::MaskPosition => web_mask_position(value)?,
        WebValueGrammar::MaskSize => web_mask_size(value)?,
        WebValueGrammar::OffsetPath => web_offset_path(value)?,
        WebValueGrammar::OffsetPosition(keywords) => web_offset_position(value, keywords)?,
        WebValueGrammar::OffsetRotate => web_offset_rotate(value)?,
        WebValueGrammar::PerspectiveOrigin => web_perspective_origin(value)?,
        WebValueGrammar::ShapeOutside => web_shape_outside(value)?,
        WebValueGrammar::WillChange => web_will_change(value)?,
        WebValueGrammar::FontFeatureSettings => web_font_setting(value, false)?,
        WebValueGrammar::FontLanguageOverride => {
            let StaticValue::String(value) = value else {
                return None;
            };
            (value == "normal" || web_css_string(value)).then(|| value.clone())?
        }
        WebValueGrammar::FontPalette => {
            let StaticValue::String(value) = value else {
                return None;
            };
            (matches!(value.as_str(), "normal" | "light" | "dark") || web_css_identifier(value))
                .then(|| value.clone())?
        }
        WebValueGrammar::FontSynthesis => web_font_synthesis(value)?,
        WebValueGrammar::FontVariantAlternates => web_font_variant_alternates(value)?,
        WebValueGrammar::FontVariantEastAsian => web_font_variant_east_asian(value)?,
        WebValueGrammar::FontVariationSettings => web_font_setting(value, true)?,
        WebValueGrammar::HangingPunctuation => web_hanging_punctuation(value)?,
        WebValueGrammar::HyphenateCharacter => {
            let StaticValue::String(value) = value else {
                return None;
            };
            if value == "auto" {
                // Because the published type is open `string`, StyleX 0.19
                // serializes this CSS keyword as a quoted custom character.
                // Keep the official transform's observable output exact.
                "\"auto\"".to_string()
            } else {
                web_css_string(value).then(|| value.clone())?
            }
        }
        WebValueGrammar::HyphenateLimitChars => web_hyphenate_limit_chars(value)?,
        WebValueGrammar::ImageResolution => web_image_resolution(value)?,
        WebValueGrammar::InitialLetter => web_initial_letter(value)?,
        WebValueGrammar::TimelineNames { allow_all } => web_timeline_names(value, allow_all)?,
        WebValueGrammar::DashedIdent { keyword } => web_dashed_ident(value, keyword)?,
        WebValueGrammar::ViewTransitionName => web_view_transition_name(value)?,
        WebValueGrammar::AnimationTimeline => web_animation_timeline(value)?,
        WebValueGrammar::AnimationRangeBoundary => web_animation_range_boundary(value)?,
        WebValueGrammar::ViewTimelineInset => web_view_timeline_inset(value)?,
        WebValueGrammar::MasonryAutoFlow => web_masonry_auto_flow(value)?,
        WebValueGrammar::Angle(keywords) => web_angle(value, keywords)?,
        WebValueGrammar::TextDecorationSkip => web_text_decoration_skip(value)?,
        WebValueGrammar::CounterList { allow_reversed } => web_counter_list(value, allow_reversed)?,
        WebValueGrammar::ScrollbarColor => web_scrollbar_color(value)?,
        WebValueGrammar::Quotes => web_quotes(value)?,
        WebValueGrammar::Content => web_generated_content(value)?,
        WebValueGrammar::Zoom => web_zoom(value)?,
        WebValueGrammar::TextDecoration => web_text_decoration(value)?,
        WebValueGrammar::TextEmphasis => web_text_emphasis(value)?,
        WebValueGrammar::Outline => web_outline(value)?,
        WebValueGrammar::MathDepth => web_math_depth(value)?,
        WebValueGrammar::TabSize => web_tab_size(value)?,
        WebValueGrammar::TextCombineUpright => web_text_combine_upright(value)?,
        WebValueGrammar::TextEmphasisStyle => web_text_emphasis_style(value)?,
        WebValueGrammar::Percentage {
            keywords,
            minimum,
            maximum,
        } => match value {
            StaticValue::String(value) if keywords.contains(&value.as_str()) => value.clone(),
            StaticValue::String(value) if value.ends_with('%') => {
                let number = value.strip_suffix('%')?.parse::<f64>().ok()?;
                (number.is_finite() && number >= minimum && number <= maximum)
                    .then(|| value.clone())?
            }
            _ => return None,
        },
    };
    Some(StyleProperty::WebOnly(css_property.to_string(), value))
}
