//! `border-image` and `mask-border`, kept as shorthands so their resets stay exact.

use hozo_ir::StyleProperty;

use super::css_tokens::web_longhand;
use super::mask::{web_mask_image, web_top_level_tokens};
use super::static_value::{numeric_text, StaticValue};
use super::web_functions::minify_css_commas;
use super::web_length::{web_length_number, web_length_percentage_string, web_length_string};
use super::web_values::web_non_negative_number_token;

pub(super) fn web_border_image_slice(value: &StaticValue) -> Option<String> {
    if let StaticValue::Number(number) = value {
        return (number.is_finite() && *number >= 0.0).then(|| numeric_text(*number));
    }
    let StaticValue::String(value) = value else {
        return None;
    };
    let parts = value.split_ascii_whitespace().collect::<Vec<_>>();
    let fill_count = parts.iter().filter(|part| **part == "fill").count();
    let slices = parts
        .iter()
        .filter(|part| **part != "fill")
        .copied()
        .collect::<Vec<_>>();
    (fill_count <= 1
        && (1..=4).contains(&slices.len())
        && slices.iter().all(|part| {
            web_non_negative_number_token(part)
                || part
                    .strip_suffix('%')
                    .is_some_and(web_non_negative_number_token)
        }))
    .then(|| parts.join(" "))
}

pub(super) fn web_border_image_width(value: &StaticValue) -> Option<String> {
    if let StaticValue::Number(number) = value {
        return (number.is_finite() && *number >= 0.0).then(|| numeric_text(*number));
    }
    let StaticValue::String(value) = value else {
        return None;
    };
    let parts = value.split_ascii_whitespace().collect::<Vec<_>>();
    ((1..=4).contains(&parts.len())
        && parts.iter().all(|part| {
            *part == "auto"
                || web_non_negative_number_token(part)
                || (web_length_percentage_string(part)
                    && web_length_number(part).is_some_and(|number| number >= 0.0))
        }))
    .then(|| parts.join(" "))
}

pub(super) fn web_border_image_outset(value: &StaticValue) -> Option<String> {
    if let StaticValue::Number(number) = value {
        return (number.is_finite() && *number >= 0.0).then(|| numeric_text(*number));
    }
    let StaticValue::String(value) = value else {
        return None;
    };
    let parts = value.split_ascii_whitespace().collect::<Vec<_>>();
    ((1..=4).contains(&parts.len())
        && parts.iter().all(|part| {
            web_non_negative_number_token(part)
                || (web_length_string(part)
                    && web_length_number(part).is_some_and(|number| number >= 0.0))
        }))
    .then(|| parts.join(" "))
}

pub(super) fn web_border_image_repeat(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else {
        return None;
    };
    let parts = value.split_ascii_whitespace().collect::<Vec<_>>();
    ((1..=2).contains(&parts.len())
        && parts
            .iter()
            .all(|part| matches!(*part, "stretch" | "repeat" | "round" | "space")))
    .then(|| parts.join(" "))
}

/// Preserve an image-border CSS shorthand so its resets remain exact, while
/// accepting a source-first grammar whose constituent values we can validate.
pub(super) fn stylex_image_border(
    value: &StaticValue,
    css_property: &'static str,
    mask: bool,
) -> Option<Vec<StyleProperty>> {
    let StaticValue::String(value) = value else {
        return None;
    };
    let value = value.trim();
    if value == "none" {
        return Some(vec![web_longhand(css_property, value)]);
    }
    let mut tokens = web_top_level_tokens(value, true)?;
    let source = tokens.first()?.clone();
    web_mask_image(&StaticValue::String(source))?;
    tokens.remove(0);
    if mask
        && tokens
            .last()
            .is_some_and(|token| matches!(token.as_str(), "alpha" | "luminance"))
    {
        tokens.pop();
    }

    let repeat_at = tokens
        .iter()
        .position(|token| matches!(token.as_str(), "stretch" | "repeat" | "round" | "space"))
        .unwrap_or(tokens.len());
    let repeat = tokens.split_off(repeat_at);
    if !repeat.is_empty() {
        web_border_image_repeat(&StaticValue::String(repeat.join(" ")))?;
    }
    let slash = tokens
        .iter()
        .enumerate()
        .filter(|(_, token)| *token == "/")
        .map(|(at, _)| at)
        .collect::<Vec<_>>();
    if slash.len() > 2 {
        return None;
    }
    let slice_end = slash.first().copied().unwrap_or(tokens.len());
    if slice_end == 0 {
        return None;
    }
    web_border_image_slice(&StaticValue::String(tokens[..slice_end].join(" ")))?;
    if let Some(first) = slash.first().copied() {
        let width_end = slash.get(1).copied().unwrap_or(tokens.len());
        if first + 1 == width_end {
            return None;
        }
        web_border_image_width(&StaticValue::String(tokens[first + 1..width_end].join(" ")))?;
        if let Some(second) = slash.get(1).copied() {
            if second + 1 == tokens.len() {
                return None;
            }
            web_border_image_outset(&StaticValue::String(tokens[second + 1..].join(" ")))?;
        }
    }
    Some(vec![web_longhand(css_property, minify_css_commas(value))])
}

pub(super) fn stylex_border_image(value: &StaticValue) -> Option<Vec<StyleProperty>> {
    stylex_image_border(value, "border-image", false)
}

pub(super) fn stylex_mask_border(value: &StaticValue) -> Option<Vec<StyleProperty>> {
    stylex_image_border(value, "mask-border", true)
}
