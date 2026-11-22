//! Lengths, dimensions, grid, justify, borders, overflow, radii and scroll
//! edges as CSS text.

use hozo_ir::{
    BorderStyle, Clamp, Dimension, Edge, GridLine, GridSpan, GridTracks, Justify, Length, Overflow,
    Radius, Theme,
};

/// A length as CSS text, against the project's spacing scale.
///
/// Takes the theme because a spacing step's width is the project's to
/// decide -- see `Length::Spacing`.
pub(super) fn length_px(length: &Length, theme: &Theme) -> String {
    match length {
        // Printed in the unit it was written in, not converted. `w-[2rem]`
        // is `width: 2rem` in Tailwind's output, and the difference from
        // `32px` is not cosmetic -- a reader who has scaled up their
        // browser's font size gets a wider element from one and the same
        // element from the other. Converting here silently opted every
        // arbitrary `rem` out of that.
        Length::Unit(value, unit) => format!("{value}{}", unit.css()),
        // Printed as written, for the same reason and one step further:
        // there is nothing here to convert. Tailwind splices the expression
        // into its own output untouched, and so does this.
        Length::Css(css) => css.to_string(),
        _ => format!("{}px", length.px(theme)),
    }
}

pub(super) fn dimension_value(dim: &Dimension, theme: &Theme) -> String {
    match dim {
        Dimension::Length(length) => length_px(length, theme),
        Dimension::Percent(pct) => format!("{pct}%"),
        Dimension::Auto => "auto".to_string(),
        Dimension::ViewportWidth(pct) => format!("{pct}vw"),
        Dimension::ViewportHeight(pct) => format!("{pct}vh"),
        Dimension::Css(text) => text.to_string(),
    }
}

/// Tailwind writes equal tracks as `repeat(n, minmax(0, 1fr))`, not
/// `repeat(n, 1fr)`. The `minmax` floor is what stops an oversized item
/// from widening its own track, so the two behave differently under
/// overflow and this is not a formatting choice.
pub(super) fn grid_tracks(tracks: &GridTracks) -> String {
    match tracks {
        GridTracks::Count(n) => format!("repeat({n}, minmax(0, 1fr))"),
        GridTracks::None => "none".to_string(),
        GridTracks::Subgrid => "subgrid".to_string(),
        GridTracks::Css(list) => list.clone(),
    }
}

pub(super) fn grid_line(line: &GridLine) -> String {
    match line {
        GridLine::Line(n) => n.to_string(),
        GridLine::Auto => "auto".to_string(),
    }
}

pub(super) fn grid_span(span: &GridSpan) -> String {
    match span {
        // Both edges, so the item spans n tracks wherever it lands rather
        // than being pinned to a line.
        GridSpan::Span(n) => format!("span {n} / span {n}"),
        GridSpan::Full => "1 / -1".to_string(),
        GridSpan::Auto => "auto".to_string(),
    }
}

pub(super) fn justify_keyword(justify: &Justify) -> &'static str {
    match justify {
        Justify::Start => "flex-start",
        Justify::Center => "center",
        Justify::End => "flex-end",
        Justify::Between => "space-between",
        Justify::Around => "space-around",
        Justify::Evenly => "space-evenly",
        Justify::Stretch => "stretch",
        Justify::Baseline => "baseline",
        Justify::Css(v) => v,
    }
}

/// The CSS longhand each logical edge writes. Spelled out rather than
/// built, because `property_and_value` returns `&'static str`.
pub(super) fn border_width_property(edge: Edge) -> &'static str {
    match edge {
        Edge::Inline => "border-inline-width",
        Edge::Block => "border-block-width",
        Edge::InlineStart => "border-inline-start-width",
        Edge::InlineEnd => "border-inline-end-width",
        Edge::BlockStart => "border-block-start-width",
        Edge::BlockEnd => "border-block-end-width",
        // The physical edges have their own properties; see
        // `StyleProperty::BorderLogicalWidth`.
        _ => "border-width",
    }
}

pub(super) fn border_style_property(edge: Edge) -> &'static str {
    match edge {
        Edge::Inline => "border-inline-style",
        Edge::Block => "border-block-style",
        Edge::InlineStart => "border-inline-start-style",
        Edge::InlineEnd => "border-inline-end-style",
        Edge::BlockStart => "border-block-start-style",
        Edge::BlockEnd => "border-block-end-style",
        _ => "border-style",
    }
}

/// The four declarations `line-clamp-*` is, as one group.
///
/// Tailwind writes all four because the `-webkit-line-clamp` mechanism
/// only works inside a `-webkit-box` with a vertical orientation and
/// hidden overflow -- they are one thing, not four choices.
pub(super) fn line_clamp_declarations(lines: Option<&Clamp>) -> Vec<(&'static str, String)> {
    match lines {
        Some(n) => vec![
            ("overflow", "hidden".to_string()),
            ("display", "-webkit-box".to_string()),
            ("-webkit-box-orient", "vertical".to_string()),
            ("-webkit-line-clamp", n.css()),
        ],
        None => vec![
            ("overflow", "visible".to_string()),
            ("display", "block".to_string()),
            ("-webkit-box-orient", "horizontal".to_string()),
            ("-webkit-line-clamp", "unset".to_string()),
        ],
    }
}

pub(super) fn overflow_keyword(overflow: &Overflow) -> &'static str {
    match overflow {
        Overflow::Visible => "visible",
        Overflow::Hidden => "hidden",
        Overflow::Scroll => "scroll",
        Overflow::Css(v) => v,
    }
}

pub(super) fn border_style_keyword(style: &BorderStyle) -> &'static str {
    match style {
        BorderStyle::Solid | BorderStyle::Default => "solid",
        BorderStyle::Dashed => "dashed",
        BorderStyle::Dotted => "dotted",
        BorderStyle::Double => "double",
        BorderStyle::Hidden => "hidden",
        BorderStyle::None => "none",
    }
}

pub(super) fn radius_value(radius: &Radius, theme: &Theme) -> Option<String> {
    match radius {
        Radius::Length(l) => Some(length_px(l, theme)),
        Radius::Scale { name, fallback_px } => Some(length_px(
            &Length::Px(theme.radius_or(name, *fallback_px)),
            theme,
        )),
        // Exactly what Tailwind emits -- CSS can state this, so there's no
        // reason to approximate it here.
        Radius::Full => Some("calc(infinity * 1px)".to_string()),
        Radius::Theme(name) => theme
            .radius(name)
            .map(|px| length_px(&Length::Px(px), theme)),
    }
}

/// A radius declaration, or nothing when it names a token the theme does
/// not define: the class is carried, so the project's own CSS still applies,
/// as with a theme animation.
pub(super) fn radius_pair<'a>(
    property: &'a str,
    radius: &Radius,
    theme: &Theme,
) -> (&'a str, String) {
    radius_value(radius, theme).map_or(("", String::new()), |value| (property, value))
}

/// The CSS longhand for each edge. Spelled out rather than concatenated
/// because `property_and_value` returns `&'static str`, and a built string
/// would have to be leaked to satisfy that.
pub(super) fn scroll_margin_property(edge: Edge) -> &'static str {
    match edge {
        Edge::All => "scroll-margin",
        Edge::Top => "scroll-margin-top",
        Edge::Right => "scroll-margin-right",
        Edge::Bottom => "scroll-margin-bottom",
        Edge::Left => "scroll-margin-left",
        Edge::Inline => "scroll-margin-inline",
        Edge::Block => "scroll-margin-block",
        Edge::InlineStart => "scroll-margin-inline-start",
        Edge::InlineEnd => "scroll-margin-inline-end",
        Edge::BlockStart => "scroll-margin-block-start",
        Edge::BlockEnd => "scroll-margin-block-end",
    }
}

pub(super) fn scroll_padding_property(edge: Edge) -> &'static str {
    match edge {
        Edge::All => "scroll-padding",
        Edge::Top => "scroll-padding-top",
        Edge::Right => "scroll-padding-right",
        Edge::Bottom => "scroll-padding-bottom",
        Edge::Left => "scroll-padding-left",
        Edge::Inline => "scroll-padding-inline",
        Edge::Block => "scroll-padding-block",
        Edge::InlineStart => "scroll-padding-inline-start",
        Edge::InlineEnd => "scroll-padding-inline-end",
        Edge::BlockStart => "scroll-padding-block-start",
        Edge::BlockEnd => "scroll-padding-block-end",
    }
}
