//! One style property to its CSS property name and value.

use hozo_ir::{
    Align, AlignSelf, Color, ColumnCount, DecorationStyle, Display, Em, FlexDirection,
    FlexShorthand, LetterSpacing, LineHeight, Position, StyleProperty, TextAlign, TextOverflow,
    TextTransform, Theme, WhiteSpace,
};

use super::color::resolve_theme_color;
use super::transform::authored_transform_value;
use super::values::{
    border_style_keyword, border_style_property, border_width_property, dimension_value, grid_line,
    grid_span, grid_tracks, justify_keyword, length_px, overflow_keyword, radius_pair,
    scroll_margin_property, scroll_padding_property,
};

/// Maps one `StyleProperty` to a `(css-property-name, value)` pair. Values
/// mirror Tailwind's own generated CSS where there's a choice (e.g.
/// `align-items: flex-start` rather than the newer `start` keyword) so
/// output stays recognizable to anyone used to reading Tailwind's CSS.
pub fn property_and_value<'a>(prop: &'a StyleProperty, theme: &Theme) -> (&'a str, String) {
    // Bound once, so the thirty-odd colour arms below read exactly as they
    // did before a theme existed. Threading `theme` through each of them
    // would add a word to thirty lines and say nothing at any of them.
    let color_var = |color: &Color| resolve_theme_color(color, theme);
    match prop {
        // Rule rendering expands every candidate. Helper callers use the
        // preferred value rather than inventing a property for the wrapper.
        StyleProperty::FirstThatWorks(candidates) => property_and_value(
            candidates
                .first()
                .expect("firstThatWorks always has at least one candidate"),
            theme,
        ),
        // Straight through, both halves. Neither is checked against
        // anything -- see `StyleProperty::Arbitrary` for why that is the
        // deal an arbitrary property makes rather than an omission.
        StyleProperty::Arbitrary(property, value) => (property.as_str(), value.clone()),
        StyleProperty::WebOnly(property, value) => (property.as_str(), value.clone()),
        StyleProperty::Display(d) => (
            "display",
            match d {
                Display::Flex => "flex",
                Display::None => "none",
                Display::Contents => "contents",
                Display::Block => "block",
                Display::InlineFlex => "inline-flex",
                Display::Grid => "grid",
                Display::Css(keyword) => keyword,
            }
            .to_string(),
        ),
        StyleProperty::FlexDirection(dir) => (
            "flex-direction",
            match dir {
                FlexDirection::Row => "row",
                FlexDirection::Column => "column",
                FlexDirection::RowReverse => "row-reverse",
                FlexDirection::ColumnReverse => "column-reverse",
            }
            .to_string(),
        ),
        StyleProperty::Flex(shorthand) => (
            "flex",
            match shorthand {
                FlexShorthand::Grow(n) => format!("{n} 1 0%"),
                FlexShorthand::Fraction(n, d) => format!("calc({n}/{d} * 100%)"),
                FlexShorthand::Auto => "1 1 auto".to_string(),
                FlexShorthand::Initial => "0 1 auto".to_string(),
                FlexShorthand::None => "none".to_string(),
            },
        ),
        StyleProperty::AlignItems(align) => (
            "align-items",
            match align {
                Align::Start => "flex-start",
                Align::Center => "center",
                Align::End => "flex-end",
                Align::Stretch => "stretch",
                Align::Baseline => "baseline",
                Align::Css(v) => v,
            }
            .to_string(),
        ),
        StyleProperty::AlignSelf(align) => (
            "align-self",
            match align {
                AlignSelf::Auto => "auto",
                AlignSelf::Start => "flex-start",
                AlignSelf::Center => "center",
                AlignSelf::End => "flex-end",
                AlignSelf::Stretch => "stretch",
                AlignSelf::Baseline => "baseline",
                AlignSelf::Css(v) => v,
            }
            .to_string(),
        ),
        StyleProperty::AlignContent(justify) => {
            ("align-content", justify_keyword(justify).to_string())
        }
        // Two declarations, so `render_shape` writes it directly and this
        // arm is only here to keep the match exhaustive. Reached only if a
        // `Content` escapes that path, and the value it gives is the
        // useful half rather than a panic.
        StyleProperty::Content(value) => ("content", value.clone()),
        StyleProperty::ContainerName(name) => ("container-name", name.clone()),
        StyleProperty::JustifyContent(justify) => {
            ("justify-content", justify_keyword(justify).to_string())
        }
        StyleProperty::Gap(l) => ("gap", length_px(l, theme)),
        StyleProperty::RowGap(l) => ("row-gap", length_px(l, theme)),
        StyleProperty::ColumnGap(l) => ("column-gap", length_px(l, theme)),
        StyleProperty::MarginTop(d) => ("margin-top", dimension_value(d, theme)),
        StyleProperty::MarginRight(d) => ("margin-right", dimension_value(d, theme)),
        StyleProperty::MarginBottom(d) => ("margin-bottom", dimension_value(d, theme)),
        StyleProperty::MarginLeft(d) => ("margin-left", dimension_value(d, theme)),
        StyleProperty::PaddingTop(l) => ("padding-top", length_px(l, theme)),
        StyleProperty::PaddingRight(l) => ("padding-right", length_px(l, theme)),
        StyleProperty::PaddingBottom(l) => ("padding-bottom", length_px(l, theme)),
        StyleProperty::PaddingLeft(l) => ("padding-left", length_px(l, theme)),
        StyleProperty::MarginInlineStart(d) => ("margin-inline-start", dimension_value(d, theme)),
        StyleProperty::MarginInlineEnd(d) => ("margin-inline-end", dimension_value(d, theme)),
        StyleProperty::PaddingInlineStart(l) => ("padding-inline-start", length_px(l, theme)),
        StyleProperty::PaddingInlineEnd(l) => ("padding-inline-end", length_px(l, theme)),
        StyleProperty::Width(d) => ("width", dimension_value(d, theme)),
        StyleProperty::Height(d) => ("height", dimension_value(d, theme)),
        StyleProperty::MinWidth(d) => ("min-width", dimension_value(d, theme)),
        StyleProperty::MinHeight(d) => ("min-height", dimension_value(d, theme)),
        StyleProperty::MaxWidth(d) => ("max-width", dimension_value(d, theme)),
        StyleProperty::MaxHeight(d) => ("max-height", dimension_value(d, theme)),
        StyleProperty::ZIndex(z) => (
            "z-index",
            z.map_or_else(|| "auto".to_string(), |z| z.to_string()),
        ),
        StyleProperty::GridTemplateColumns(t) => ("grid-template-columns", grid_tracks(t)),
        StyleProperty::GridTemplateRows(t) => ("grid-template-rows", grid_tracks(t)),
        StyleProperty::GridColumnStart(l) => ("grid-column-start", grid_line(l)),
        StyleProperty::GridColumnEnd(l) => ("grid-column-end", grid_line(l)),
        StyleProperty::GridRowStart(l) => ("grid-row-start", grid_line(l)),
        StyleProperty::GridRowEnd(l) => ("grid-row-end", grid_line(l)),
        StyleProperty::GridColumn(s) => ("grid-column", grid_span(s)),
        StyleProperty::GridRow(s) => ("grid-row", grid_span(s)),
        StyleProperty::Position(pos) => (
            "position",
            match pos {
                Position::Relative => "relative",
                Position::Absolute => "absolute",
                Position::Static => "static",
                Position::Css(v) => v,
            }
            .to_string(),
        ),
        StyleProperty::InsetTop(d) => ("top", dimension_value(d, theme)),
        StyleProperty::InsetRight(d) => ("right", dimension_value(d, theme)),
        StyleProperty::InsetBottom(d) => ("bottom", dimension_value(d, theme)),
        StyleProperty::InsetLeft(d) => ("left", dimension_value(d, theme)),
        StyleProperty::InsetInlineStart(d) => ("inset-inline-start", dimension_value(d, theme)),
        StyleProperty::InsetInlineEnd(d) => ("inset-inline-end", dimension_value(d, theme)),
        StyleProperty::InsetInline(d) => ("inset-inline", dimension_value(d, theme)),
        StyleProperty::InsetBlock(d) => ("inset-block", dimension_value(d, theme)),
        StyleProperty::InsetBlockStart(d) => ("inset-block-start", dimension_value(d, theme)),
        StyleProperty::InsetBlockEnd(d) => ("inset-block-end", dimension_value(d, theme)),
        StyleProperty::BackgroundColor(c) => ("background-color", color_var(c)),
        StyleProperty::Opacity(o) => ("opacity", format!("{o}")),
        StyleProperty::BorderColor(c) => ("border-color", color_var(c)),
        StyleProperty::ScrollMargin(edge, l) => {
            (scroll_margin_property(*edge), length_px(l, theme))
        }
        StyleProperty::ScrollPadding(edge, l) => {
            (scroll_padding_property(*edge), length_px(l, theme))
        }
        StyleProperty::ScrollBehavior(value) => ("scroll-behavior", value.to_string()),
        StyleProperty::MaskClip(v) => ("mask-clip", v.to_string()),
        StyleProperty::MaskOrigin(v) => ("mask-origin", v.to_string()),
        StyleProperty::MaskMode(v) => ("mask-mode", v.to_string()),
        StyleProperty::MaskType(v) => ("mask-type", v.to_string()),
        StyleProperty::MaskSize(v) => ("mask-size", v.to_string()),
        StyleProperty::MaskPosition(v) => ("mask-position", v.to_string()),
        StyleProperty::MaskRepeat(v) => ("mask-repeat", v.to_string()),
        StyleProperty::MaskImageNone => ("mask-image", "none".to_string()),
        StyleProperty::ScrollbarWidth(v) => ("scrollbar-width", v.to_string()),
        StyleProperty::ScrollbarGutter(v) => ("scrollbar-gutter", v.to_string()),
        // Composed by `scrollbar_color_value`; partitioned out above.
        StyleProperty::ScrollbarThumbColor(_) | StyleProperty::ScrollbarTrackColor(_) => {
            ("scrollbar-color", String::new())
        }
        // Composed by `gradient_value`, partitioned out before this runs.
        StyleProperty::BackgroundImageNone
        | StyleProperty::BackgroundImage(..)
        | StyleProperty::Gradient(..)
        | StyleProperty::GradientStopColor(..)
        | StyleProperty::GradientStopPosition(..) => ("background-image", String::new()),
        // Composed by `mask_declarations`; `render_rule` partitions these
        // out before this runs.
        StyleProperty::MaskStopColor(..)
        | StyleProperty::MaskStopPosition(..)
        | StyleProperty::MaskSlotArgument(..)
        | StyleProperty::MaskRadialShape(_)
        | StyleProperty::MaskRadialSize(_)
        | StyleProperty::MaskRadialPosition(_)
        | StyleProperty::MaskComposite(_) => ("mask-image", String::new()),
        StyleProperty::Fill(c) => ("fill", color_var(c)),
        StyleProperty::Stroke(c) => ("stroke", color_var(c)),
        // SVG stroke-width is unitless, unlike every other length here.
        StyleProperty::StrokeWidth(n) => ("stroke-width", format!("{n}")),
        StyleProperty::AccentColor(c) => ("accent-color", color_var(c)),
        StyleProperty::CaretColor(c) => ("caret-color", color_var(c)),
        StyleProperty::TextDecorationColor(c) => ("text-decoration-color", color_var(c)),
        StyleProperty::TextDecorationStyle(s) => (
            "text-decoration-style",
            match s {
                DecorationStyle::Solid => "solid",
                DecorationStyle::Double => "double",
                DecorationStyle::Dotted => "dotted",
                DecorationStyle::Dashed => "dashed",
                DecorationStyle::Wavy => "wavy",
            }
            .to_string(),
        ),
        StyleProperty::TextDecorationThickness(l) => {
            ("text-decoration-thickness", length_px(l, theme))
        }
        // Emitted into its own `::placeholder` rule by `render_rule`.
        StyleProperty::PlaceholderColor(c) => ("color", color_var(c)),
        StyleProperty::OutlineWidth(l) => ("outline-width", length_px(l, theme)),
        StyleProperty::OutlineStyle(s) => ("outline-style", border_style_keyword(s).to_string()),
        // Emitted under the forced-colors media query by render_shape.
        StyleProperty::OutlineHiddenForcedColors => ("outline", String::new()),
        StyleProperty::OutlineColor(c) => ("outline-color", color_var(c)),
        StyleProperty::OutlineOffset(l) => ("outline-offset", length_px(l, theme)),
        // Child-scoped; `render_rule` partitions these into their own rule
        // before this runs (see `space_declarations`).
        StyleProperty::DivideX(_)
        | StyleProperty::DivideY(_)
        | StyleProperty::DivideColor(_)
        | StyleProperty::DivideStyle(_) => ("border-color", String::new()),
        // One CSS longhand each, including the two axis shorthands, which
        // is exactly what Tailwind emits.
        StyleProperty::BorderTopColor(c) => ("border-top-color", color_var(c)),
        StyleProperty::BorderRightColor(c) => ("border-right-color", color_var(c)),
        StyleProperty::BorderBottomColor(c) => ("border-bottom-color", color_var(c)),
        StyleProperty::BorderLeftColor(c) => ("border-left-color", color_var(c)),
        StyleProperty::BorderInlineColor(c) => ("border-inline-color", color_var(c)),
        StyleProperty::BorderBlockColor(c) => ("border-block-color", color_var(c)),
        StyleProperty::BorderInlineStartColor(c) => ("border-inline-start-color", color_var(c)),
        StyleProperty::BorderInlineEndColor(c) => ("border-inline-end-color", color_var(c)),
        StyleProperty::BorderBlockStartColor(c) => ("border-block-start-color", color_var(c)),
        StyleProperty::BorderBlockEndColor(c) => ("border-block-end-color", color_var(c)),
        StyleProperty::BorderTopWidth(l) => ("border-top-width", length_px(l, theme)),
        StyleProperty::BorderRightWidth(l) => ("border-right-width", length_px(l, theme)),
        StyleProperty::BorderBottomWidth(l) => ("border-bottom-width", length_px(l, theme)),
        StyleProperty::BorderLeftWidth(l) => ("border-left-width", length_px(l, theme)),
        StyleProperty::BorderTopStyle(s) => {
            ("border-top-style", border_style_keyword(s).to_string())
        }
        StyleProperty::BorderRightStyle(s) => {
            ("border-right-style", border_style_keyword(s).to_string())
        }
        StyleProperty::BorderBottomStyle(s) => {
            ("border-bottom-style", border_style_keyword(s).to_string())
        }
        StyleProperty::BorderLeftStyle(s) => {
            ("border-left-style", border_style_keyword(s).to_string())
        }
        StyleProperty::BorderRadius(r) => radius_pair("border-radius", r, theme),
        StyleProperty::BorderTopLeftRadius(r) => radius_pair("border-top-left-radius", r, theme),
        StyleProperty::BorderTopRightRadius(r) => radius_pair("border-top-right-radius", r, theme),
        StyleProperty::BorderBottomRightRadius(r) => {
            radius_pair("border-bottom-right-radius", r, theme)
        }
        StyleProperty::BorderBottomLeftRadius(r) => {
            radius_pair("border-bottom-left-radius", r, theme)
        }
        StyleProperty::BorderStartStartRadius(r) => {
            radius_pair("border-start-start-radius", r, theme)
        }
        StyleProperty::BorderStartEndRadius(r) => radius_pair("border-start-end-radius", r, theme),
        StyleProperty::BorderEndStartRadius(r) => radius_pair("border-end-start-radius", r, theme),
        StyleProperty::BorderEndEndRadius(r) => radius_pair("border-end-end-radius", r, theme),
        StyleProperty::FontSize(l) => ("font-size", length_px(l, theme)),
        StyleProperty::FontWeight(w) => ("font-weight", w.css(theme)),
        StyleProperty::LeadingRegister(px) => ("--tw-leading", format!("{px}px")),
        StyleProperty::LineHeight(lh) => (
            "line-height",
            match lh {
                LineHeight::FontDefault(l) => format!("var(--tw-leading, {})", length_px(l, theme)),
                LineHeight::Length(l) => length_px(l, theme),
                LineHeight::Ratio(r) => format!("{r}"),
            },
        ),
        StyleProperty::TextUnderlineOffset(d) => {
            ("text-underline-offset", dimension_value(d, theme))
        }
        StyleProperty::OverflowX(o) => ("overflow-x", overflow_keyword(o).to_string()),
        StyleProperty::OverflowY(o) => ("overflow-y", overflow_keyword(o).to_string()),
        StyleProperty::BorderLogicalWidth(edge, l) => {
            (border_width_property(*edge), length_px(l, theme))
        }
        StyleProperty::BorderLogicalStyle(edge, s) => (
            border_style_property(*edge),
            border_style_keyword(s).to_string(),
        ),
        // Composed; see `line_clamp_declarations`.
        StyleProperty::RotateNone => ("rotate", "none".to_string()),
        StyleProperty::ScaleNone => ("scale", "none".to_string()),
        StyleProperty::TranslateNone => ("translate", "none".to_string()),
        StyleProperty::TransformNone => ("transform", "none".to_string()),
        StyleProperty::TransformEmpty => ("transform", String::new()),
        StyleProperty::TransformGpu => ("transform", "translateZ(0)".to_string()),
        StyleProperty::Transform(functions) => {
            ("transform", authored_transform_value(functions, theme))
        }
        StyleProperty::TransformOrigin(value) => ("transform-origin", value.clone()),
        StyleProperty::LineClamp(_) => ("-webkit-line-clamp", String::new()),
        StyleProperty::FlexGrow(n) => ("flex-grow", format!("{n}")),
        StyleProperty::FlexShrink(n) => ("flex-shrink", format!("{n}")),
        StyleProperty::AspectRatio(v) => ("aspect-ratio", v.to_string()),
        StyleProperty::ObjectFit(v) => ("object-fit", v.to_string()),
        // Composed above: it writes the -webkit- prefix too.
        StyleProperty::UserSelect(_) => ("user-select", String::new()),
        StyleProperty::TextDecorationLine(v) => ("text-decoration-line", v.to_string()),
        StyleProperty::Keyword(property, value) => (property, value.to_string()),
        // Composed: it writes both halves. See `KeywordPair`.
        StyleProperty::KeywordPair(..) => ("", String::new()),
        StyleProperty::MixBlendMode(m) => ("mix-blend-mode", m.to_string()),
        StyleProperty::BackgroundBlendMode(m) => ("background-blend-mode", m.to_string()),
        StyleProperty::Order(n) => ("order", n.to_string()),
        StyleProperty::Cursor(keyword) => ("cursor", keyword.clone()),
        StyleProperty::Columns(columns) => (
            "columns",
            match columns {
                ColumnCount::Count(n) => n.to_string(),
                ColumnCount::Width(d) => dimension_value(d, theme),
                ColumnCount::Auto => "auto".to_string(),
            },
        ),
        StyleProperty::LetterSpacing(ls) => (
            "letter-spacing",
            match ls {
                LetterSpacing::Em(Em(v)) => format!("{v}em"),
                LetterSpacing::Px(l) => length_px(l, theme),
            },
        ),
        StyleProperty::Overflow(o) => ("overflow", overflow_keyword(o).to_string()),
        StyleProperty::TextOverflow(t) => (
            "text-overflow",
            match t {
                TextOverflow::Clip => "clip",
                TextOverflow::Ellipsis => "ellipsis",
            }
            .to_string(),
        ),
        StyleProperty::WhiteSpace(w) => (
            "white-space",
            match w {
                WhiteSpace::Normal => "normal",
                WhiteSpace::NoWrap => "nowrap",
                WhiteSpace::Css(v) => v,
            }
            .to_string(),
        ),
        StyleProperty::TransitionProperty(p) => ("transition-property", p.clone()),
        StyleProperty::TransitionDuration(ms, _) => ("transition-duration", format!("{ms}ms")),
        StyleProperty::TransitionDelay(ms, _) => ("transition-delay", format!("{ms}ms")),
        StyleProperty::TransitionTimingFunction(f, _) => ("transition-timing-function", f.clone()),
        StyleProperty::AnimationName(keyframes) => ("animation-name", keyframes.name.clone()),
        StyleProperty::Animation(a) => ("animation", a.shorthand().to_string()),
        // The theme's own shorthand, as Tailwind writes it for
        // `animate-<name>`. A name the theme does not define emits nothing:
        // the class is carried, so the project's own CSS still applies.
        StyleProperty::ThemeAnimation(name) => match theme.animation(name) {
            Some(animation) => ("animation", animation.shorthand.clone()),
            None => ("", String::new()),
        },
        // Never reached: `render_rule` partitions these out into their own
        // child-scoped rule before calling this. Emitting the margin on the
        // element itself would be wrong, so there's nothing sensible to
        // return -- an empty name is filtered by the caller.
        StyleProperty::SpaceX(_)
        | StyleProperty::SpaceY(_)
        | StyleProperty::SpaceReverse(_)
        | StyleProperty::DivideReverse(_) => ("", String::new()),
        StyleProperty::TextAlign(align) => (
            "text-align",
            match align {
                TextAlign::Left => "left",
                TextAlign::Center => "center",
                TextAlign::Right => "right",
                TextAlign::Css(v) => v,
            }
            .to_string(),
        ),
        // Standalone properties, as CSS defines them and Tailwind emits
        // them -- the `transform` shorthand isn't used on either side.
        // Tailwind writes both axes explicitly for scale/translate, so
        // these do the same rather than relying on one-value expansion.
        StyleProperty::Rotate(a) => ("rotate", a.css()),
        // Composed, not emitted here -- see `scale_value` / `transform_value`.
        StyleProperty::Scale(_)
        | StyleProperty::ScaleX(_)
        | StyleProperty::ScaleY(_)
        | StyleProperty::ScaleZ(_)
        | StyleProperty::Scale3d => ("scale", String::new()),
        StyleProperty::RotateX(_)
        | StyleProperty::RotateY(_)
        | StyleProperty::RotateZ(_)
        | StyleProperty::SkewX(_)
        | StyleProperty::SkewY(_) => ("transform", String::new()),
        // Composed by `translate_value`; partitioned out above.
        StyleProperty::Translate(_)
        | StyleProperty::TranslateX(_)
        | StyleProperty::TranslateY(_)
        | StyleProperty::TranslateZ(_) => ("translate", String::new()),
        StyleProperty::FlexBasis(d) => ("flex-basis", dimension_value(d, theme)),
        StyleProperty::BlockSize(d) => ("block-size", dimension_value(d, theme)),
        StyleProperty::InlineSize(d) => ("inline-size", dimension_value(d, theme)),
        StyleProperty::MaxBlockSize(d) => ("max-block-size", dimension_value(d, theme)),
        StyleProperty::MaxInlineSize(d) => ("max-inline-size", dimension_value(d, theme)),
        StyleProperty::MinBlockSize(d) => ("min-block-size", dimension_value(d, theme)),
        StyleProperty::MinInlineSize(d) => ("min-inline-size", dimension_value(d, theme)),
        StyleProperty::TextIndent(d) => ("text-indent", dimension_value(d, theme)),
        StyleProperty::MarginBlockStart(d) => ("margin-block-start", dimension_value(d, theme)),
        StyleProperty::MarginBlockEnd(d) => ("margin-block-end", dimension_value(d, theme)),
        StyleProperty::PaddingBlockStart(l) => ("padding-block-start", length_px(l, theme)),
        StyleProperty::PaddingBlockEnd(l) => ("padding-block-end", length_px(l, theme)),
        // `border-spacing` takes both axes at once, so these compose.
        StyleProperty::BorderSpacingX(_) | StyleProperty::BorderSpacingY(_) => {
            ("border-spacing", String::new())
        }
        // Composed with any ring layers by `box_shadow_value`, not emitted
        // here -- `render_rule` partitions these out before this runs.
        StyleProperty::BoxShadow(s) => ("box-shadow", s.clone()),
        StyleProperty::RingWidth(_)
        | StyleProperty::RingColor(_)
        | StyleProperty::InsetRingWidth(_)
        | StyleProperty::RingOffsetWidth(_)
        | StyleProperty::RingOffsetColor(_)
        | StyleProperty::RingInset
        | StyleProperty::ShadowColor(_)
        | StyleProperty::InsetShadowColor(_)
        | StyleProperty::InsetRingColor(_)
        | StyleProperty::InsetShadow(_) => ("box-shadow", String::new()),
        // Composed, not emitted here -- see `filter_value` and
        // `text_shadow_value`.
        StyleProperty::DropShadowColor(_) => ("filter", String::new()),
        StyleProperty::TextShadowColor(_) | StyleProperty::TextShadow(_) => {
            ("text-shadow", String::new())
        }
        // Composed by `scroll_snap_value`; partitioned out above.
        StyleProperty::ScrollSnapType(_) | StyleProperty::ScrollSnapStrictness(_) => {
            ("scroll-snap-type", String::new())
        }
        StyleProperty::Filter(..) | StyleProperty::FilterRaw(..) => ("filter", String::new()),
        StyleProperty::BackdropFilter(..) => ("backdrop-filter", String::new()),
        StyleProperty::FontFamily(value) => ("font-family", value.css(theme)),
        StyleProperty::FontVariant(values) => ("font-variant", values.join(" ")),
        StyleProperty::TextTransform(t) => (
            "text-transform",
            match t {
                TextTransform::Uppercase => "uppercase",
                TextTransform::Lowercase => "lowercase",
                TextTransform::Capitalize => "capitalize",
                TextTransform::None => "none",
            }
            .to_string(),
        ),
        StyleProperty::TextColor(c) => ("color", color_var(c)),
    }
}
