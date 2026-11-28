//! Screen-reader-only, keyword pairs, containers and blend modes.

use hozo_ir::{
    Dimension, Display, FlexShorthand, FontFamily, Length, Overflow, Position, StyleProperty,
    WhiteSpace,
};

use super::keyword_table::KEYWORD_UTILITIES;

/// `sr-only` / `not-sr-only`: visible to a screen reader, not to the eye.
///
/// Expanded into the properties Hozo already models rather than held as a
/// blob, so that a `w-4` written beside it still overrides the width the
/// way it does on Web -- `dedupe_key` can only do that if each declaration
/// arrives as its own property.
///
/// The mechanism is a one-pixel clipped box rather than `display: none` or
/// `visibility: hidden`, and that distinction is the whole point: those two
/// remove the element from the accessibility tree, which is the opposite of
/// what this is for.
pub(super) fn parse_screen_reader_only(token: &str) -> Option<Vec<StyleProperty>> {
    let visually_hidden = token == "sr-only";
    if !visually_hidden && token != "not-sr-only" {
        return None;
    }
    let size = |px: f64| {
        if visually_hidden {
            Dimension::Length(Length::Px(px))
        } else {
            Dimension::Auto
        }
    };
    let margin = Dimension::Length(Length::Px(if visually_hidden { -1.0 } else { 0.0 }));
    let mut props = vec![
        StyleProperty::Position(if visually_hidden {
            Position::Absolute
        } else {
            Position::Static
        }),
        StyleProperty::Width(size(1.0)),
        StyleProperty::Height(size(1.0)),
        StyleProperty::PaddingTop(Dimension::Length(Length::Px(0.0))),
        StyleProperty::PaddingRight(Dimension::Length(Length::Px(0.0))),
        StyleProperty::PaddingBottom(Dimension::Length(Length::Px(0.0))),
        StyleProperty::PaddingLeft(Dimension::Length(Length::Px(0.0))),
        StyleProperty::MarginTop(margin.clone()),
        StyleProperty::MarginRight(margin.clone()),
        StyleProperty::MarginBottom(margin.clone()),
        StyleProperty::MarginLeft(margin),
        StyleProperty::Overflow(if visually_hidden {
            Overflow::Hidden
        } else {
            Overflow::Visible
        }),
        StyleProperty::Keyword(
            "clip-path",
            if visually_hidden {
                "inset(50%)"
            } else {
                "none"
            },
        ),
        StyleProperty::WhiteSpace(if visually_hidden {
            WhiteSpace::SrOnlyNoWrap
        } else {
            WhiteSpace::Normal
        }),
    ];
    // Only `sr-only` zeroes the border; `not-sr-only` leaves whatever the
    // element had, which is why this isn't symmetric.
    //
    // Widths only, unlike `all_sides_border`: that writes a `solid` style
    // alongside, which exists so a width has something to render as. A zero
    // width has nothing to render either way, and Tailwind writes no style
    // here.
    if visually_hidden {
        props.extend([
            StyleProperty::BorderTopWidth(Length::Px(0.0)),
            StyleProperty::BorderRightWidth(Length::Px(0.0)),
            StyleProperty::BorderBottomWidth(Length::Px(0.0)),
            StyleProperty::BorderLeftWidth(Length::Px(0.0)),
        ]);
    }
    Some(props)
}

/// The utilities that are two declarations of the same value.
///
/// Almost all of them are a vendor prefix beside the standard property,
/// which Tailwind still emits because Safari and Firefox need them here.
/// `break-normal` is the odd one: two genuinely different properties that
/// Tailwind sets together because "don't break words" needs both.
pub(super) fn keyword_pair_utility(token: &str) -> Option<StyleProperty> {
    const PAIRS: &[(&str, &str, &str, &str, &str)] = &[
        ("hyphens-auto", "-webkit-hyphens", "auto", "hyphens", "auto"),
        (
            "hyphens-manual",
            "-webkit-hyphens",
            "manual",
            "hyphens",
            "manual",
        ),
        ("hyphens-none", "-webkit-hyphens", "none", "hyphens", "none"),
        (
            "antialiased",
            "-webkit-font-smoothing",
            "antialiased",
            "-moz-osx-font-smoothing",
            "grayscale",
        ),
        (
            "subpixel-antialiased",
            "-webkit-font-smoothing",
            "auto",
            "-moz-osx-font-smoothing",
            "auto",
        ),
        (
            "box-decoration-clone",
            "-webkit-box-decoration-break",
            "clone",
            "box-decoration-break",
            "clone",
        ),
        (
            "box-decoration-slice",
            "-webkit-box-decoration-break",
            "slice",
            "box-decoration-break",
            "slice",
        ),
        (
            "break-normal",
            "overflow-wrap",
            "normal",
            "word-break",
            "normal",
        ),
    ];
    PAIRS
        .iter()
        .find(|(name, ..)| *name == token)
        .map(|(_, p1, v1, p2, v2)| StyleProperty::KeywordPair(p1, v1, p2, v2))
}

/// `@container/main`: an element declared as a container, under a name.
///
/// Two declarations, so it cannot be a keyword utility -- and the name
/// comes from the class, so it cannot be a `KeywordPair` either. The
/// unnamed `@container` is an ordinary keyword and stays one.
pub(super) fn container_declaration(token: &str) -> Option<Vec<StyleProperty>> {
    let (base, name) = token.split_once('/')?;
    if name.is_empty() {
        return None;
    }
    let kind = match base {
        "@container" => "inline-size",
        "@container-normal" => "normal",
        _ => return None,
    };
    Some(vec![
        StyleProperty::Keyword("container-type", kind),
        StyleProperty::ContainerName(name.to_string()),
    ])
}

/// The one-declaration utilities; see `KEYWORD_UTILITIES`.
pub(super) fn keyword_utility(token: &str) -> Option<StyleProperty> {
    let origin = match token {
        "origin-bottom" => Some("bottom"),
        "origin-bottom-left" => Some("0 100%"),
        "origin-bottom-right" => Some("100% 100%"),
        "origin-center" => Some("center"),
        "origin-left" => Some("0"),
        "origin-right" => Some("100%"),
        "origin-top" => Some("top"),
        "origin-top-left" => Some("0 0"),
        "origin-top-right" => Some("100% 0"),
        _ => None,
    };
    if let Some(value) = origin {
        return Some(StyleProperty::TransformOrigin(value.to_string()));
    }
    let family = match token {
        "font-mono" => Some(("mono", "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace")),
        "font-sans" => Some(("sans", "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', 'Noto Sans', Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji'")),
        "font-serif" => Some(("serif", "ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif")),
        _ => None,
    };
    if let Some((name, fallback)) = family {
        return Some(StyleProperty::FontFamily(FontFamily::Theme {
            name,
            fallback,
        }));
    }
    KEYWORD_UTILITIES
        .iter()
        .find(|(name, _, _)| *name == token)
        .map(|(_, property, value)| StyleProperty::Keyword(property, value))
}

/// The families that are a fixed list of CSS keywords and nothing else:
/// `flex-<n>`, the two blend modes, and the display keywords beyond the
/// three Yoga implements.
pub(super) fn parse_keyword_utility(token: &str) -> Option<StyleProperty> {
    if let Some((n, d)) = token.strip_prefix("flex-").and_then(|r| r.split_once('/')) {
        if let (Ok(n), Ok(d)) = (n.parse::<u32>(), d.parse::<u32>()) {
            return Some(StyleProperty::Flex(FlexShorthand::Fraction(n, d)));
        }
    }
    // `flex-<n>` is `n 1 0%`, i.e. grow by n and start from nothing --
    // which is `FlexShorthand::Grow`, the same shape `flex-1` already had.
    if let Some(rest) = token.strip_prefix("flex-") {
        if let Ok(grow) = rest.parse::<f64>() {
            return Some(StyleProperty::Flex(FlexShorthand::Grow(grow)));
        }
    }
    /// CSS's blend modes. Shared by `mix-blend-*` and `bg-blend-*`, which
    /// take the same list applied to different things.
    const BLEND_MODES: &[&str] = &[
        "normal",
        "multiply",
        "screen",
        "overlay",
        "darken",
        "lighten",
        "color-dodge",
        "color-burn",
        "hard-light",
        "soft-light",
        "difference",
        "exclusion",
        "hue",
        "saturation",
        "color",
        "luminosity",
        "plus-darker",
        "plus-lighter",
    ];
    if let Some(rest) = token.strip_prefix("mix-blend-") {
        return blend_mode(rest, BLEND_MODES).map(StyleProperty::MixBlendMode);
    }
    if let Some(rest) = token.strip_prefix("bg-blend-") {
        return blend_mode(rest, BLEND_MODES).map(StyleProperty::BackgroundBlendMode);
    }

    // Display keywords with backend-specific handling. `inline-flex` and
    // `block` are typed because Native lowers them to constrained forms of
    // Yoga flex; `grid` is typed so Native can refuse it by name.
    const DISPLAYS: &[&str] = &[
        "inline",
        "inline-block",
        "inline-grid",
        "inline-table",
        "flow-root",
        "list-item",
        "table",
        "table-caption",
        "table-cell",
        "table-column",
        "table-column-group",
        "table-footer-group",
        "table-header-group",
        "table-row",
        "table-row-group",
        "hidden",
    ];
    if let Some(keyword) = DISPLAYS.iter().find(|k| **k == token) {
        // `hidden` is Tailwind's name for `display: none`, which Yoga does
        // have -- so it is not one of the grouped keywords.
        if *keyword == "hidden" {
            return Some(StyleProperty::Display(Display::None));
        }
        return Some(StyleProperty::Display(Display::Css(keyword)));
    }
    None
}

pub(super) fn blend_mode(suffix: &str, modes: &'static [&'static str]) -> Option<&'static str> {
    modes.iter().copied().find(|m| *m == suffix)
}
