//! Scrollbar, scroll margin and padding, and SVG fill and stroke.

use hozo_ir::{Color, Edge, Length, StyleProperty};

use super::border::decoration_style_keyword;
use super::spacing::parse_spacing_suffix;

pub(super) fn expand_scrollbar(token: &str) -> Option<StyleProperty> {
    let rest = token.strip_prefix("scrollbar-")?;
    if let Some(colour) = rest.strip_prefix("thumb-") {
        return Some(StyleProperty::ScrollbarThumbColor(Color::Token(
            colour.to_string(),
        )));
    }
    if let Some(colour) = rest.strip_prefix("track-") {
        return Some(StyleProperty::ScrollbarTrackColor(Color::Token(
            colour.to_string(),
        )));
    }
    Some(match rest {
        "auto" => StyleProperty::ScrollbarWidth("auto"),
        "none" => StyleProperty::ScrollbarWidth("none"),
        "thin" => StyleProperty::ScrollbarWidth("thin"),
        "gutter-auto" => StyleProperty::ScrollbarGutter("auto"),
        "gutter-stable" => StyleProperty::ScrollbarGutter("stable"),
        "gutter-both" => StyleProperty::ScrollbarGutter("stable both-edges"),
        _ => return None,
    })
}

/// `scroll-m*`/`scroll-p*` (optionally negated) and `scroll-smooth`.
///
/// Regular enough to be one function: eleven edges, two families, and the
/// same spacing scale everything else uses.
pub(super) fn expand_scroll(token: &str) -> Option<Vec<StyleProperty>> {
    let rest = token.strip_prefix("scroll-")?;

    // Both values of the property, handled here rather than in
    // `KEYWORD_UTILITIES` -- splitting them would put `scroll-smooth` in a
    // variant and `scroll-auto` in a `Keyword`, and `dedupe_key` can't see
    // that those are the same declaration, so writing both would emit both.
    if let Some(behavior) = match rest {
        "smooth" => Some("smooth"),
        "auto" => Some("auto"),
        _ => None,
    } {
        return Some(vec![StyleProperty::ScrollBehavior(behavior)]);
    }

    let family = rest.chars().next()?;
    let (edge_part, value) = rest.get(1..)?.split_once('-')?;
    let edge = edge_keyword(edge_part)?;
    let length = parse_spacing_suffix(value)?;

    Some(match family {
        'm' => vec![StyleProperty::ScrollMargin(edge, length)],
        // `scroll-padding` takes no negative, which `negated` enforces by
        // having no arm for it.
        'p' => vec![StyleProperty::ScrollPadding(edge, length)],
        _ => return None,
    })
}

/// Tailwind's edge abbreviations, shared by every per-side family.
pub(super) fn edge_keyword(suffix: &str) -> Option<Edge> {
    Some(match suffix {
        "" => Edge::All,
        "t" => Edge::Top,
        "r" => Edge::Right,
        "b" => Edge::Bottom,
        "l" => Edge::Left,
        "x" => Edge::Inline,
        "y" => Edge::Block,
        "s" => Edge::InlineStart,
        "e" => Edge::InlineEnd,
        "bs" => Edge::BlockStart,
        "be" => Edge::BlockEnd,
        _ => return None,
    })
}

/// The colour families that are a single property with no keyword forms
/// worth special-casing, plus the two that carry a width/style alongside.
pub(super) fn expand_paint(token: &str) -> Option<Vec<StyleProperty>> {
    if let Some(rest) = token.strip_prefix("stroke-") {
        // `stroke-2` is a width; SVG stroke-width is unitless.
        if let Ok(n) = rest.parse::<f64>() {
            return Some(vec![StyleProperty::StrokeWidth(n)]);
        }
        if is_paint_keyword(rest) {
            return None;
        }
        return Some(vec![StyleProperty::Stroke(Color::Token(rest.to_string()))]);
    }
    if let Some(rest) = token.strip_prefix("decoration-") {
        if let Ok(px) = rest.parse::<f64>() {
            return Some(vec![StyleProperty::TextDecorationThickness(Length::Px(px))]);
        }
        if let Some(style) = decoration_style_keyword(rest) {
            return Some(vec![StyleProperty::TextDecorationStyle(style)]);
        }
        // Thickness keywords Hozo doesn't lower. Declining leaves them
        // unsupported; falling through would read them as colours named
        // `auto` and `from-font`.
        if matches!(rest, "auto" | "from-font") {
            return None;
        }
        return Some(vec![StyleProperty::TextDecorationColor(Color::Token(
            rest.to_string(),
        ))]);
    }
    let (prefix, make): (&str, fn(Color) -> StyleProperty) = if token.starts_with("fill-") {
        ("fill-", StyleProperty::Fill)
    } else if token.starts_with("accent-") {
        ("accent-", StyleProperty::AccentColor)
    } else if token.starts_with("caret-") {
        ("caret-", StyleProperty::CaretColor)
    } else if token.starts_with("placeholder-") {
        ("placeholder-", StyleProperty::PlaceholderColor)
    } else {
        return None;
    };
    let rest = token.strip_prefix(prefix)?;
    if is_paint_keyword(rest) {
        return None;
    }
    Some(vec![make(Color::Token(rest.to_string()))])
}

/// Suffixes in these families that are CSS keywords rather than colours:
/// `fill-none` is the SVG "don't paint" value, `accent-auto` hands the
/// control back to the UA. Declining keeps them honestly unsupported rather
/// than compiling to a colour named `none`.
pub(super) fn is_paint_keyword(suffix: &str) -> bool {
    matches!(suffix, "none" | "auto")
}
