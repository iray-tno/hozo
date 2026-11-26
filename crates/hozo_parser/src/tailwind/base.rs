//! Expanding one variant-free utility into every property it writes.

use hozo_ir::{
    BorderStyle, Clamp, Dimension, Length, LineHeight, Origin, Overflow, StyleProperty,
    TextOverflow, TextShadowValue, WhiteSpace,
};

use super::border::{
    expand_divide, expand_inset, expand_outline, parse_logical_border, parse_ring,
};
use super::border_width::{all_sides_border_style, expand_border_width};
use super::dimension::{expand_dimension_family, parse_dimension_suffix};
use super::gradient::{expand_gradient, expand_mask, expand_mask_gradient};
use super::keywords::{
    container_declaration, keyword_pair_utility, keyword_utility, parse_keyword_utility,
    parse_screen_reader_only,
};
use super::paint::{expand_paint, expand_scroll, expand_scrollbar};
use super::spacing::{parse_margin_suffix, parse_spacing_suffix};
use super::{
    expand_class, parse_transition_properties, parse_utility, DEFAULT_TRANSITION_DURATION_MS,
    DEFAULT_TRANSITION_TIMING,
};

use super::color_family::register_color;
use super::extended::parse_extended_value;
use super::filter::expand_filter;
use super::radius::expand_border_radius;
use super::typography::parse_font_size;

/// Multi-side utilities (`p-6`, `px-4`, `py-2`, `m-6`, `mx-4`, `my-2`,
/// `gap-x-2`, `gap-y-2`) expand to more than one longhand property, so they
/// can't fit through `parse_utility`'s one-token-to-one-property shape.
pub(super) fn expand_base_utility(token: &str) -> Vec<StyleProperty> {
    // First, and deliberately so. Every arm below this ends in a colour
    // catch-all that accepts whatever the specific forms declined, so a
    // bracket reaching them came out as a palette token: `text-[14px]`
    // compiled to `color: var(--hozo-color-[14px])`. Ordering is what
    // fixes that -- an arbitrary value is unambiguous, and nothing further
    // down has a better claim on it.
    if crate::arbitrary::is_arbitrary(token) {
        return crate::arbitrary::properties(token).unwrap_or_default();
    }
    // `px`/`mx` are the *logical* inline axis in Tailwind
    // (`padding-inline`), not left/right. For a symmetric value the
    // rendering is identical either way, but keeping them logical matches
    // Tailwind's own output and composes correctly with `ps-*`/`pe-*`.
    if let Some(rest) = token.strip_prefix("px-") {
        if let Some(v) = parse_spacing_suffix(rest).map(Dimension::Length) {
            return vec![
                StyleProperty::PaddingInlineStart(v.clone()),
                StyleProperty::PaddingInlineEnd(v),
            ];
        }
    }
    if let Some(rest) = token.strip_prefix("py-") {
        if let Some(v) = parse_spacing_suffix(rest).map(Dimension::Length) {
            return vec![
                StyleProperty::PaddingTop(v.clone()),
                StyleProperty::PaddingBottom(v),
            ];
        }
    }
    if let Some(rest) = token.strip_prefix("p-") {
        if let Some(v) = parse_spacing_suffix(rest).map(Dimension::Length) {
            return vec![
                StyleProperty::PaddingTop(v.clone()),
                StyleProperty::PaddingRight(v.clone()),
                StyleProperty::PaddingBottom(v.clone()),
                StyleProperty::PaddingLeft(v),
            ];
        }
    }
    if let Some(rest) = token.strip_prefix("mx-") {
        if let Some(v) = parse_margin_suffix(rest) {
            return vec![
                StyleProperty::MarginInlineStart(v.clone()),
                StyleProperty::MarginInlineEnd(v),
            ];
        }
    }
    if let Some(rest) = token.strip_prefix("my-") {
        if let Some(v) = parse_margin_suffix(rest) {
            return vec![
                StyleProperty::MarginTop(v.clone()),
                StyleProperty::MarginBottom(v),
            ];
        }
    }
    if let Some(rest) = token.strip_prefix("m-") {
        if let Some(v) = parse_margin_suffix(rest) {
            return vec![
                StyleProperty::MarginTop(v.clone()),
                StyleProperty::MarginRight(v.clone()),
                StyleProperty::MarginBottom(v.clone()),
                StyleProperty::MarginLeft(v),
            ];
        }
    }
    if let Some(rest) = token.strip_prefix("gap-x-") {
        if let Some(v) = parse_spacing_suffix(rest).map(Dimension::Length) {
            return vec![StyleProperty::ColumnGap(v)];
        }
    }
    if let Some(rest) = token.strip_prefix("gap-y-") {
        if let Some(v) = parse_spacing_suffix(rest).map(Dimension::Length) {
            return vec![StyleProperty::RowGap(v)];
        }
    }
    if let Some(props) = expand_dimension_family(token) {
        return props;
    }
    if let Some(props) = expand_filter(token) {
        return props;
    }
    if let Some(prop) = parse_keyword_utility(token) {
        return vec![prop];
    }
    if let Some(props) = parse_screen_reader_only(token) {
        return props;
    }
    if let Some(prop) = keyword_pair_utility(token) {
        return vec![prop];
    }
    if let Some(props) = container_declaration(token) {
        return props;
    }
    if let Some(prop) = keyword_utility(token) {
        return vec![prop];
    }
    // Two utilities writing one property, so neither can be a `Keyword`.
    // The axis was one, with `proximity` written into its text, which left
    // `snap-mandatory` nothing to change: `snap-x snap-mandatory` compiled
    // to `x proximity`, the opposite of what it says.
    match token {
        "snap-x" => return vec![StyleProperty::ScrollSnapType("x")],
        "snap-y" => return vec![StyleProperty::ScrollSnapType("y")],
        "snap-both" => return vec![StyleProperty::ScrollSnapType("both")],
        "snap-none" => return vec![StyleProperty::ScrollSnapType("none")],
        "snap-mandatory" => return vec![StyleProperty::ScrollSnapStrictness("mandatory")],
        "snap-proximity" => return vec![StyleProperty::ScrollSnapStrictness("proximity")],
        _ => {}
    }
    // Before the `text-<colour>` catch-all, which would otherwise read
    // `text-shadow-red-500` as the colour token `shadow-red-500` and set
    // `color` from it. That is the failure that made
    // `placeholder-shown:bg-blue-500` emit a custom property with a colon
    // in its name; the shape recurs wherever a family's prefix is also a
    // colour family's prefix.
    //
    // The sizes first, then anything else as a colour -- the same split
    // `shadow-*` and `inset-shadow-*` already make.
    if let Some(suffix) = token.strip_prefix("text-shadow-") {
        // Tailwind's text-shadow scale. Held here rather than in the
        // keyword table because the colour utility made this a
        // composition, and a property written by a composition cannot also
        // be a `Keyword` without the two ceasing to override each other.
        let shadow = match suffix {
            "2xs" => Some("0 1px 0 rgb(0 0 0 / 0.15)"),
            "xs" => Some("0 1px 1px rgb(0 0 0 / 0.2)"),
            "sm" => Some(
                "0 1px 0 rgb(0 0 0 / 0.075), 0 1px 1px rgb(0 0 0 / 0.075), \
                 0 2px 2px rgb(0 0 0 / 0.075)",
            ),
            "md" => Some(
                "0 1px 1px rgb(0 0 0 / 0.1), 0 1px 2px rgb(0 0 0 / 0.1), \
                 0 2px 4px rgb(0 0 0 / 0.1)",
            ),
            "lg" => Some(
                "0 1px 2px rgb(0 0 0 / 0.1), 0 3px 2px rgb(0 0 0 / 0.1), \
                 0 4px 8px rgb(0 0 0 / 0.1)",
            ),
            "none" => Some("none"),
            _ => None,
        };
        if let Some(shadow) = shadow {
            return vec![StyleProperty::TextShadow(TextShadowValue::Web(
                shadow.to_string(),
            ))];
        }
        if !suffix.is_empty() {
            return vec![StyleProperty::TextShadowColor(register_color(suffix))];
        }
    }
    if let Some(rest) = token.strip_prefix("line-clamp-") {
        if rest == "none" {
            return vec![StyleProperty::LineClamp(None)];
        }
        if let Ok(lines) = rest.parse::<u32>() {
            return vec![StyleProperty::LineClamp(Some(Clamp::Lines(lines)))];
        }
    }
    if let Some(prop) = parse_extended_value(token) {
        return vec![prop];
    }
    if let Some(props) = parse_logical_border(token) {
        return props;
    }
    if let Some(prop) = expand_scrollbar(token) {
        return vec![prop];
    }
    if let Some(prop) = expand_mask(token) {
        return vec![prop];
    }
    if let Some(props) = expand_mask_gradient(token) {
        return props;
    }
    if let Some(props) = expand_gradient(token) {
        return props;
    }
    if let Some(props) = expand_scroll(token) {
        return props;
    }
    if let Some(props) = expand_paint(token) {
        return props;
    }
    if let Some(props) = expand_outline(token) {
        return props;
    }
    if let Some(props) = expand_divide(token) {
        return props;
    }
    // Before `expand_inset`, which would otherwise read `inset-ring-2` as
    // an inset of "ring-2".
    if let Some(prop) = parse_ring(token) {
        return vec![prop];
    }
    if let Some(props) = expand_inset(token) {
        return props;
    }
    if let Some(props) = expand_border_radius(token) {
        return props;
    }
    if let Some(rest) = token.strip_prefix("size-") {
        if let Some(d) = parse_dimension_suffix(rest) {
            return vec![StyleProperty::Width(d.clone()), StyleProperty::Height(d)];
        }
    }
    // A `transition-*` utility sets the property list *and* Tailwind's
    // default timing function and duration -- an explicit `duration-*` or
    // `ease-*` written after it then overrides those under last-wins
    // flattening, which is how Tailwind's own custom-property indirection
    // behaves.
    if let Some(properties) = parse_transition_properties(token) {
        // ...except `transition-none`, which turns transitions off. Tailwind
        // emits the property alone there; a timing function and duration
        // would be inert but would still be two declarations it didn't write.
        if token == "transition-none" {
            return vec![StyleProperty::TransitionProperty(properties.to_string())];
        }
        return vec![
            StyleProperty::TransitionProperty(properties.to_string()),
            StyleProperty::TransitionTimingFunction(
                DEFAULT_TRANSITION_TIMING.to_string(),
                Origin::Default,
            ),
            StyleProperty::TransitionDuration(DEFAULT_TRANSITION_DURATION_MS, Origin::Default),
        ];
    }
    // Three declarations, which is why it can't go through the
    // one-property path.
    if token == "truncate" {
        return vec![
            StyleProperty::Overflow(Overflow::Hidden),
            StyleProperty::TextOverflow(TextOverflow::Ellipsis),
            StyleProperty::WhiteSpace(WhiteSpace::NoWrap),
        ];
    }
    match token {
        "border-solid" => return all_sides_border_style(BorderStyle::Solid),
        "border-dashed" => return all_sides_border_style(BorderStyle::Dashed),
        "border-dotted" => return all_sides_border_style(BorderStyle::Dotted),
        "border-double" => return all_sides_border_style(BorderStyle::Double),
        "border-hidden" => return all_sides_border_style(BorderStyle::Hidden),
        "border-none" => return all_sides_border_style(BorderStyle::None),
        _ => {}
    }
    if let Some(props) = expand_border_width(token) {
        return props;
    }
    // `text-lg/7`, `text-lg/tight`, `text-lg/[3rem]`: a size with its own
    // line height. Read as a colour it was `lg` at 7%. Tailwind writes that
    // line height as a plain `line-height`, not through `--tw-leading`, so it
    // has a text size's provenance: a later `text-sm` replaces it and any
    // `leading-*` beats it. A ratio is sized against this utility's own font
    // size, which is the size it applies to.
    if let Some((name, modifier)) = token.split_once('/') {
        if let Some((size, _)) = parse_font_size(name) {
            if let [(hozo_ir::Condition::Always, props)] =
                expand_class(&format!("leading-{modifier}")).as_slice()
            {
                let line_height = match props.as_slice() {
                    [StyleProperty::LineHeight(LineHeight::Length(length))] => Some(length.clone()),
                    [StyleProperty::LineHeight(LineHeight::Ratio(ratio))] => match size {
                        Length::Px(px) => Some(Length::Px(px * ratio)),
                        _ => None,
                    },
                    _ => None,
                };
                if let Some(line_height) = line_height {
                    return vec![
                        StyleProperty::FontSize(size),
                        StyleProperty::LineHeight(LineHeight::FontDefault(line_height)),
                    ];
                }
            }
        }
    }
    if let Some((size, line_height)) = parse_font_size(token) {
        // This is a fallback, not an explicit leading. Preserve that fact
        // through condition grouping so responsive font sizes cannot erase
        // an authored leading on either backend (#939).
        return vec![
            StyleProperty::FontSize(size),
            StyleProperty::LineHeight(LineHeight::FontDefault(line_height)),
        ];
    }

    parse_utility(token).into_iter().collect()
}
