//! One utility token to one style property: the first table every token meets.

use hozo_ir::{
    Align, AlignSelf, Animation, Axis, Color, Dimension, Display, Em, FlexDirection, FlexShorthand,
    Justify, LetterSpacing, LineHeight, Origin, Overflow, Position, StyleProperty, TextAlign,
    TextOverflow, TextTransform, WhiteSpace,
};

use super::color_family::{is_non_color_suffix, register_color, ColorFamily};
use super::dimension::{parse_dimension_suffix, parse_extremum_suffix, parse_inline_size_suffix};
use super::layout::{parse_columns_suffix, parse_cursor, parse_grid_placement, parse_order};
use super::spacing::{parse_single_margin, parse_spacing_suffix, parse_spacing_utility};
use super::typography::{parse_font_size, parse_font_weight, parse_named_leading, parse_tracking};

use super::border::parse_border_side_color;
use super::filter::parse_shadow;
use super::radius::parse_border_radius;
use super::transform::parse_transform;

pub fn parse_utility(token: &str) -> Option<StyleProperty> {
    match token {
        "flex-auto" => return Some(StyleProperty::Flex(FlexShorthand::Auto)),
        "shrink" => return Some(StyleProperty::FlexShrink(1.0)),
        "shrink-0" => return Some(StyleProperty::FlexShrink(0.0)),
        "grow" => return Some(StyleProperty::FlexGrow(1.0)),
        "grow-0" => return Some(StyleProperty::FlexGrow(0.0)),
        "z-auto" => return Some(StyleProperty::ZIndex(None)),
        "aspect-square" => return Some(StyleProperty::AspectRatio("1 / 1")),
        "aspect-video" => return Some(StyleProperty::AspectRatio("16 / 9")),
        "aspect-auto" => return Some(StyleProperty::AspectRatio("auto")),
        "flex-initial" => return Some(StyleProperty::Flex(FlexShorthand::Initial)),
        "flex-none" => return Some(StyleProperty::Flex(FlexShorthand::None)),
        "flex-row" => return Some(StyleProperty::FlexDirection(FlexDirection::Row)),
        "flex-col" => return Some(StyleProperty::FlexDirection(FlexDirection::Column)),
        "flex-row-reverse" => {
            return Some(StyleProperty::FlexDirection(FlexDirection::RowReverse));
        }
        "flex-col-reverse" => {
            return Some(StyleProperty::FlexDirection(FlexDirection::ColumnReverse));
        }
        "items-start" => return Some(StyleProperty::AlignItems(Align::Start)),
        "items-center" => return Some(StyleProperty::AlignItems(Align::Center)),
        "items-end" => return Some(StyleProperty::AlignItems(Align::End)),
        "items-stretch" => return Some(StyleProperty::AlignItems(Align::Stretch)),
        "items-baseline" => return Some(StyleProperty::AlignItems(Align::Baseline)),
        "justify-start" => return Some(StyleProperty::JustifyContent(Justify::Start)),
        "justify-center" => return Some(StyleProperty::JustifyContent(Justify::Center)),
        "justify-end" => return Some(StyleProperty::JustifyContent(Justify::End)),
        "justify-between" => return Some(StyleProperty::JustifyContent(Justify::Between)),
        "justify-around" => return Some(StyleProperty::JustifyContent(Justify::Around)),
        "justify-evenly" => return Some(StyleProperty::JustifyContent(Justify::Evenly)),
        "w-full" => return Some(StyleProperty::Width(Dimension::Percent(100.0))),
        "h-full" => return Some(StyleProperty::Height(Dimension::Percent(100.0))),
        "w-auto" => return Some(StyleProperty::Width(Dimension::Auto)),
        "h-auto" => return Some(StyleProperty::Height(Dimension::Auto)),
        // Web-only: refused by the Native backend rather than dropped.
        "w-screen" => return Some(StyleProperty::Width(Dimension::ViewportWidth(100.0))),
        "h-screen" => return Some(StyleProperty::Height(Dimension::ViewportHeight(100.0))),
        "min-h-screen" => return Some(StyleProperty::MinHeight(Dimension::ViewportHeight(100.0))),
        "max-h-screen" => return Some(StyleProperty::MaxHeight(Dimension::ViewportHeight(100.0))),
        "text-left" => return Some(StyleProperty::TextAlign(TextAlign::Left)),
        "text-center" => return Some(StyleProperty::TextAlign(TextAlign::Center)),
        "text-right" => return Some(StyleProperty::TextAlign(TextAlign::Right)),
        "relative" => return Some(StyleProperty::Position(Position::Relative)),
        "absolute" => return Some(StyleProperty::Position(Position::Absolute)),
        "flex" => return Some(StyleProperty::Display(Display::Flex)),
        "hidden" => return Some(StyleProperty::Display(Display::None)),
        "contents" => return Some(StyleProperty::Display(Display::Contents)),
        // Accepted here and refused later by the Native backend, rather
        // than dropped at parse time: the Web backend can lower them fine,
        // and a build error naming the class beats silence.
        "block" => return Some(StyleProperty::Display(Display::Block)),
        "inline-flex" => return Some(StyleProperty::Display(Display::InlineFlex)),
        "grid" => return Some(StyleProperty::Display(Display::Grid)),
        "self-auto" => return Some(StyleProperty::AlignSelf(AlignSelf::Auto)),
        "self-start" => return Some(StyleProperty::AlignSelf(AlignSelf::Start)),
        "self-center" => return Some(StyleProperty::AlignSelf(AlignSelf::Center)),
        "self-end" => return Some(StyleProperty::AlignSelf(AlignSelf::End)),
        "self-stretch" => return Some(StyleProperty::AlignSelf(AlignSelf::Stretch)),
        "self-baseline" => return Some(StyleProperty::AlignSelf(AlignSelf::Baseline)),
        // Not a `Keyword`, and the test that noticed is
        // `no_keyword_property_is_also_written_by_a_variant`: `before:`
        // writes `content` too, and a `Keyword` and a modelled property
        // that reach the same declaration stop overriding each other.
        "content-none" => return Some(StyleProperty::Content("none".to_string())),
        "content-start" => return Some(StyleProperty::AlignContent(Justify::Start)),
        "content-center" => return Some(StyleProperty::AlignContent(Justify::Center)),
        "content-end" => return Some(StyleProperty::AlignContent(Justify::End)),
        "content-between" => return Some(StyleProperty::AlignContent(Justify::Between)),
        "content-around" => return Some(StyleProperty::AlignContent(Justify::Around)),
        "content-evenly" => return Some(StyleProperty::AlignContent(Justify::Evenly)),
        "animate-spin" => return Some(StyleProperty::Animation(Animation::Spin)),
        "animate-ping" => return Some(StyleProperty::Animation(Animation::Ping)),
        "animate-pulse" => return Some(StyleProperty::Animation(Animation::Pulse)),
        "animate-bounce" => return Some(StyleProperty::Animation(Animation::Bounce)),
        "animate-none" => return Some(StyleProperty::Animation(Animation::None)),
        "overflow-hidden" => return Some(StyleProperty::Overflow(Overflow::Hidden)),
        "overflow-visible" => return Some(StyleProperty::Overflow(Overflow::Visible)),
        "overflow-scroll" => return Some(StyleProperty::Overflow(Overflow::Scroll)),
        "whitespace-nowrap" => return Some(StyleProperty::WhiteSpace(WhiteSpace::NoWrap)),
        "whitespace-normal" => return Some(StyleProperty::WhiteSpace(WhiteSpace::Normal)),
        "text-ellipsis" => return Some(StyleProperty::TextOverflow(TextOverflow::Ellipsis)),
        "text-clip" => return Some(StyleProperty::TextOverflow(TextOverflow::Clip)),
        // `transition-*` also carries the default timing/duration, so it's
        // a multi-property expansion handled in `expand_base_utility`.
        "ease-linear" => {
            return Some(StyleProperty::TransitionTimingFunction(
                "linear".to_string(),
                Origin::Written,
            ))
        }
        "ease-in" => {
            return Some(StyleProperty::TransitionTimingFunction(
                "cubic-bezier(0.4, 0, 1, 1)".to_string(),
                Origin::Written,
            ))
        }
        "ease-out" => {
            return Some(StyleProperty::TransitionTimingFunction(
                "cubic-bezier(0, 0, 0.2, 1)".to_string(),
                Origin::Written,
            ))
        }
        "ease-in-out" => {
            return Some(StyleProperty::TransitionTimingFunction(
                "cubic-bezier(0.4, 0, 0.2, 1)".to_string(),
                Origin::Written,
            ))
        }
        "uppercase" => return Some(StyleProperty::TextTransform(TextTransform::Uppercase)),
        "lowercase" => return Some(StyleProperty::TextTransform(TextTransform::Lowercase)),
        "capitalize" => return Some(StyleProperty::TextTransform(TextTransform::Capitalize)),
        "normal-case" => return Some(StyleProperty::TextTransform(TextTransform::None)),
        // `border-{solid,dashed,...}` set all four sides, so they live in
        // `expand_base_utility` (multi-property) and never reach here.
        _ => {}
    }

    // Tailwind's four are matched above. Any other name is one only the
    // project's theme can define (`--animate-wiggle`), and the parser has no
    // theme, so it is held by name for each backend to look up (decision
    // 007, slice 3). The bracket form is an arbitrary value and is read
    // elsewhere.
    if let Some(name) = token.strip_prefix("animate-") {
        if !name.is_empty()
            && name
                .bytes()
                .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
        {
            return Some(StyleProperty::ThemeAnimation(name.to_string()));
        }
    }

    if let Some(radius) = parse_border_radius(token) {
        return Some(StyleProperty::BorderRadius(radius));
    }
    // `leading-<n>` only: Tailwind's *named* leading scale (`leading-tight`
    // = 1.25 etc.) is a unitless ratio of the element's own font size,
    // which `Length::Px` can't represent and which can't be resolved
    // statically -- so those fall through as unrecognized rather than being
    // converted to a wrong pixel value.
    if let Some(rest) = token.strip_prefix("leading-") {
        // Named scale first: those are unitless ratios, not lengths.
        if let Some(ratio) = parse_named_leading(rest) {
            return Some(StyleProperty::LineHeight(LineHeight::Ratio(ratio)));
        }
        if let Some(v) = parse_spacing_suffix(rest) {
            return Some(StyleProperty::LineHeight(LineHeight::Length(v)));
        }
    }
    if let Some(rest) = token.strip_prefix("tracking-") {
        if let Some(em) = parse_tracking(rest) {
            return Some(StyleProperty::LetterSpacing(LetterSpacing::Em(Em(em))));
        }
    }
    if let Some(rest) = token.strip_prefix("duration-") {
        if let Ok(ms) = rest.parse::<u32>() {
            return Some(StyleProperty::TransitionDuration(ms, Origin::Written));
        }
    }
    if let Some(rest) = token.strip_prefix("delay-") {
        if let Ok(ms) = rest.parse::<u32>() {
            return Some(StyleProperty::TransitionDelay(ms, Origin::Written));
        }
    }
    if let Some(prop) = parse_grid_placement(token) {
        return Some(prop);
    }
    if token == "space-x-reverse" {
        return Some(StyleProperty::SpaceReverse(Axis::X));
    }
    if token == "space-y-reverse" {
        return Some(StyleProperty::SpaceReverse(Axis::Y));
    }
    if let Some(rest) = token.strip_prefix("space-x-") {
        if let Some(v) = parse_spacing_suffix(rest) {
            return Some(StyleProperty::SpaceX(Dimension::Length(v)));
        }
    }
    if let Some(rest) = token.strip_prefix("space-y-") {
        if let Some(v) = parse_spacing_suffix(rest) {
            return Some(StyleProperty::SpaceY(Dimension::Length(v)));
        }
    }
    if let Some(rest) = token.strip_prefix("top-") {
        if let Some(v) = parse_dimension_suffix(rest) {
            return Some(StyleProperty::InsetTop(v));
        }
    }
    if let Some(rest) = token.strip_prefix("right-") {
        if let Some(v) = parse_dimension_suffix(rest) {
            return Some(StyleProperty::InsetRight(v));
        }
    }
    if let Some(rest) = token.strip_prefix("bottom-") {
        if let Some(v) = parse_dimension_suffix(rest) {
            return Some(StyleProperty::InsetBottom(v));
        }
    }
    if let Some(rest) = token.strip_prefix("start-") {
        if let Some(v) = parse_dimension_suffix(rest) {
            return Some(StyleProperty::InsetInlineStart(v));
        }
    }
    if let Some(rest) = token.strip_prefix("end-") {
        if let Some(v) = parse_dimension_suffix(rest) {
            return Some(StyleProperty::InsetInlineEnd(v));
        }
    }
    if let Some(rest) = token.strip_prefix("left-") {
        if let Some(v) = parse_dimension_suffix(rest) {
            return Some(StyleProperty::InsetLeft(v));
        }
    }
    // Inline axis takes the container scale, block axis doesn't -- see
    // `parse_inline_size_suffix`.
    if let Some(rest) = token.strip_prefix("w-") {
        if let Some(d) = parse_inline_size_suffix(rest) {
            return Some(StyleProperty::Width(d));
        }
    }
    if let Some(rest) = token.strip_prefix("h-") {
        if let Some(d) = parse_dimension_suffix(rest) {
            return Some(StyleProperty::Height(d));
        }
    }
    if let Some(rest) = token.strip_prefix("min-w-") {
        if let Some(d) = parse_extremum_suffix(rest) {
            return Some(StyleProperty::MinWidth(d));
        }
        if rest == "screen" {
            return Some(StyleProperty::MinWidth(Dimension::ViewportWidth(100.0)));
        }
        if let Some(d) = parse_inline_size_suffix(rest) {
            return Some(StyleProperty::MinWidth(d));
        }
    }
    if let Some(rest) = token.strip_prefix("min-h-") {
        if let Some(d) = parse_extremum_suffix(rest) {
            return Some(StyleProperty::MinHeight(d));
        }
        if let Some(d) = parse_dimension_suffix(rest) {
            return Some(StyleProperty::MinHeight(d));
        }
    }
    if let Some(rest) = token.strip_prefix("max-w-") {
        if let Some(d) = parse_extremum_suffix(rest) {
            return Some(StyleProperty::MaxWidth(d));
        }
        if let Some(d) = parse_inline_size_suffix(rest) {
            return Some(StyleProperty::MaxWidth(d));
        }
    }
    if let Some(rest) = token.strip_prefix("max-h-") {
        if let Some(d) = parse_extremum_suffix(rest) {
            return Some(StyleProperty::MaxHeight(d));
        }
        if let Some(d) = parse_dimension_suffix(rest) {
            return Some(StyleProperty::MaxHeight(d));
        }
    }
    if let Some(rest) = token.strip_prefix("z-") {
        if let Ok(z) = rest.parse::<i32>() {
            return Some(StyleProperty::ZIndex(Some(z)));
        }
    }
    if let Some(prop) = parse_order(token) {
        return Some(prop);
    }
    if let Some(rest) = token.strip_prefix("columns-") {
        if let Some(columns) = parse_columns_suffix(rest) {
            return Some(StyleProperty::Columns(columns));
        }
    }
    if let Some(keyword) = parse_cursor(token) {
        return Some(StyleProperty::Cursor(keyword.to_string()));
    }
    if let Some(rest) = token.strip_prefix("inset-shadow") {
        let shadow = match rest.trim_start_matches('-') {
            "2xs" => "inset 0 1px rgb(0 0 0 / 0.05)",
            "xs" => "inset 0 1px 1px rgb(0 0 0 / 0.05)",
            "sm" => "inset 0 2px 4px rgb(0 0 0 / 0.05)",
            // Tailwind clears the layer to a fully transparent inset
            // rather than dropping it, so a ring beside it still paints.
            "none" => "inset 0 0 #0000",
            // Anything else after the prefix is a colour for the layer,
            // which is a second utility rather than a second shadow --
            // `inset-shadow-sm inset-shadow-red-500` is one red shadow.
            suffix if !suffix.is_empty() => {
                return Some(StyleProperty::InsetShadowColor(register_color(suffix)))
            }
            _ => return None,
        };
        return Some(StyleProperty::InsetShadow(shadow.to_string()));
    }
    if let Some(shadow) = parse_shadow(token) {
        return Some(StyleProperty::BoxShadow(shadow.to_string()));
    }
    // Same split as the inset form: a suffix the size table declined is a
    // colour. After `parse_shadow`, so `shadow-sm` stays a size.
    if let Some(suffix) = token.strip_prefix("shadow-") {
        return Some(StyleProperty::ShadowColor(register_color(suffix)));
    }
    if let Some(prop) = parse_transform(token) {
        return Some(prop);
    }

    if let Some(weight) = parse_font_weight(token) {
        return Some(StyleProperty::FontWeight(weight));
    }
    // `text-<size>` sets font-size *and* line-height, so it can't fit this
    // one-property shape -- `expand_base_utility` handles it before ever
    // reaching here. It still has to be excluded explicitly, though,
    // because the `text-<color>` fallthrough below would otherwise swallow
    // `text-xl` as the color token "xl".
    if parse_font_size(token).is_some() {
        return None;
    }
    if let Some(prop) = parse_spacing_utility(token) {
        return Some(prop);
    }
    if let Some(prop) = parse_single_margin(token) {
        return Some(prop);
    }
    if let Some(rest) = token.strip_prefix("opacity-") {
        // Tailwind's opacity scale is 0-100 (in practice steps of 5),
        // meaning percent -- StyleProperty::Opacity wants the 0.0-1.0
        // fraction CSS/RN both expect.
        return rest
            .parse::<f64>()
            .ok()
            .map(|pct| StyleProperty::Opacity(pct / 100.0));
    }
    if let Some(color) = token.strip_prefix("bg-") {
        if is_non_color_suffix(ColorFamily::Background, color) {
            return None;
        }
        return Some(StyleProperty::BackgroundColor(Color::Token(
            color.to_string(),
        )));
    }
    if let Some(color) = token.strip_prefix("text-") {
        // Only reached if `parse_font_size`/`text-{left,center,right}` above
        // didn't match, so whatever remains is a color token (e.g. `blue-500`).
        if is_non_color_suffix(ColorFamily::Text, color) {
            return None;
        }
        return Some(StyleProperty::TextColor(Color::Token(color.to_string())));
    }
    if let Some(color) = token.strip_prefix("border-") {
        // Only reached once the width/style forms above have declined it,
        // so a non-numeric, non-keyword suffix here is a color token.
        if let Some(prop) = parse_border_side_color(color) {
            return Some(prop);
        }
        if is_non_color_suffix(ColorFamily::Border, color) {
            return None;
        }
        return Some(StyleProperty::BorderColor(Color::Token(color.to_string())));
    }

    None
}
