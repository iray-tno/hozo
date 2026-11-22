//! Masks and anchor position fallbacks, which share top-level token splitting.

use hozo_ir::StyleProperty;

use super::css_tokens::{web_comma_groups, web_css_identifier, web_longhand};
use super::static_value::StaticValue;
use super::transform::transform_dimension;
use super::web_functions::{minify_css_commas, web_single_function};
use super::web_grid::web_url_or_none;
use super::web_length::{web_length_number, web_length_percentage_string};

pub(super) fn web_mask_image(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else {
        return None;
    };
    let groups = web_comma_groups(value)?;
    groups
        .iter()
        .all(|image| {
            *image == "none"
                || web_url_or_none(&StaticValue::String((*image).to_string())).is_some()
                || web_single_function(
                    image,
                    &[
                        "linear-gradient",
                        "radial-gradient",
                        "conic-gradient",
                        "repeating-linear-gradient",
                        "repeating-radial-gradient",
                        "repeating-conic-gradient",
                    ],
                )
        })
        .then(|| minify_css_commas(value))
}

pub(super) fn web_mask_position(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else {
        return None;
    };
    let groups = web_comma_groups(value)?;
    groups
        .iter()
        .all(|position| {
            let parts = position.split_ascii_whitespace().collect::<Vec<_>>();
            (1..=4).contains(&parts.len())
                && parts.iter().all(|part| {
                    matches!(*part, "left" | "center" | "right" | "top" | "bottom")
                        || transform_dimension(part).is_some()
                })
        })
        .then(|| groups.join(","))
}

pub(super) fn web_mask_size(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else {
        return None;
    };
    let groups = web_comma_groups(value)?;
    groups
        .iter()
        .all(|size| {
            if matches!(*size, "cover" | "contain") {
                return true;
            }
            let parts = size.split_ascii_whitespace().collect::<Vec<_>>();
            (1..=2).contains(&parts.len())
                && parts.iter().all(|part| {
                    *part == "auto"
                        || (web_length_percentage_string(part)
                            && web_length_number(part).is_some_and(|number| number >= 0.0))
                })
        })
        .then(|| groups.join(","))
}

pub(super) fn web_position_try_fallbacks(value: &StaticValue) -> Option<String> {
    const AREAS: &[&str] = &[
        "top",
        "left",
        "bottom",
        "right",
        "center",
        "block-start",
        "block-end",
        "inline-start",
        "inline-end",
        "span-inline-start",
        "span-inline-end",
        "span-block-start",
        "span-block-end",
    ];
    const TACTICS: &[&str] = &["flip-block", "flip-inline", "flip-start"];
    let StaticValue::String(value) = value else {
        return None;
    };
    if value == "none" {
        return Some(value.clone());
    }
    let groups = web_comma_groups(value)?;
    groups
        .iter()
        .all(|group| {
            let words = group.split_ascii_whitespace().collect::<Vec<_>>();
            let bases = words
                .iter()
                .filter(|word| {
                    AREAS.contains(word) || word.starts_with("--") && web_css_identifier(word)
                })
                .count();
            let tactics = words.iter().filter(|word| TACTICS.contains(word)).count();
            !words.is_empty()
                && bases <= 1
                && bases + tactics == words.len()
                && tactics <= 3
                && TACTICS
                    .iter()
                    .all(|tactic| words.iter().filter(|word| *word == tactic).count() <= 1)
        })
        .then(|| groups.join(","))
}

pub(super) fn web_position_try(value: &StaticValue) -> Option<String> {
    const ORDERS: &[&str] = &[
        "normal",
        "most-width",
        "most-height",
        "most-block-size",
        "most-inline-size",
    ];
    let StaticValue::String(value) = value else {
        return None;
    };
    if value == "none" {
        return Some(value.clone());
    }
    let groups = web_comma_groups(value)?;
    let mut normalized = groups
        .iter()
        .map(|group| (*group).to_string())
        .collect::<Vec<_>>();
    let first = normalized.first_mut()?;
    let words = first.split_ascii_whitespace().collect::<Vec<_>>();
    if words.first().is_some_and(|word| ORDERS.contains(word)) {
        if words.len() == 1 {
            return None;
        }
        *first = words[1..].join(" ");
    }
    web_position_try_fallbacks(&StaticValue::String(normalized.join(",")))?;
    Some(minify_css_commas(value))
}

pub(super) fn web_top_level_tokens(value: &str, slash_token: bool) -> Option<Vec<String>> {
    if value.contains([';', '{', '}', '\n', '\r']) {
        return None;
    }
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut depth = 0_u32;
    let mut quote = None;
    let mut escaped = false;
    for character in value.chars() {
        if escaped {
            current.push(character);
            escaped = false;
            continue;
        }
        if character == '\\' && quote.is_some() {
            current.push(character);
            escaped = true;
            continue;
        }
        if let Some(active_quote) = quote {
            current.push(character);
            if character == active_quote {
                quote = None;
            }
            continue;
        }
        match character {
            '\'' | '"' => {
                quote = Some(character);
                current.push(character);
            }
            '(' => {
                depth += 1;
                current.push(character);
            }
            ')' => {
                depth = depth.checked_sub(1)?;
                current.push(character);
            }
            '/' if slash_token && depth == 0 => {
                if !current.is_empty() {
                    tokens.push(std::mem::take(&mut current));
                }
                tokens.push("/".to_string());
            }
            character if character.is_ascii_whitespace() && depth == 0 => {
                if !current.is_empty() {
                    tokens.push(std::mem::take(&mut current));
                }
            }
            _ => current.push(character),
        }
    }
    if depth != 0 || quote.is_some() || escaped {
        return None;
    }
    if !current.is_empty() {
        tokens.push(current);
    }
    (!tokens.is_empty()).then_some(tokens)
}

/// Keep the CSS shorthand so its specified reset of `mask-border-*` remains
/// intact, but accept only a practical single-layer grammar we can validate.
pub(super) fn stylex_mask(value: &StaticValue) -> Option<Vec<StyleProperty>> {
    let StaticValue::String(value) = value else {
        return None;
    };
    let value = value.trim();
    if value == "none" {
        return Some(vec![web_longhand("mask", value)]);
    }
    let tokens = web_top_level_tokens(value, true)?;
    let image = tokens.first()?;
    web_mask_image(&StaticValue::String(image.clone()))?;

    let repeat = [
        "repeat-x",
        "repeat-y",
        "repeat",
        "space",
        "round",
        "no-repeat",
    ];
    let boxes = [
        "border-box",
        "padding-box",
        "content-box",
        "fill-box",
        "stroke-box",
        "view-box",
        "no-clip",
    ];
    let mode = ["alpha", "luminance", "match-source"];
    let composite = ["add", "subtract", "intersect", "exclude"];
    let mut position = Vec::new();
    let mut size = Vec::new();
    let mut repeats = Vec::new();
    let mut geometry = Vec::new();
    let mut after_slash = false;
    let mut suffix_started = false;
    let mut modes = 0;
    let mut composites = 0;
    for token in &tokens[1..] {
        if token == "/" {
            if after_slash || position.is_empty() {
                return None;
            }
            after_slash = true;
        } else if repeat.contains(&token.as_str()) {
            suffix_started = true;
            repeats.push(token.as_str());
        } else if boxes.contains(&token.as_str()) {
            suffix_started = true;
            geometry.push(token.as_str());
        } else if mode.contains(&token.as_str()) {
            suffix_started = true;
            modes += 1;
        } else if composite.contains(&token.as_str()) {
            suffix_started = true;
            composites += 1;
        } else if after_slash {
            if suffix_started {
                return None;
            }
            size.push(token.as_str());
        } else {
            if suffix_started {
                return None;
            }
            position.push(token.as_str());
        }
    }
    if repeats.len() > 2 || geometry.len() > 2 || modes > 1 || composites > 1 {
        return None;
    }
    if !position.is_empty() {
        web_mask_position(&StaticValue::String(position.join(" ")))?;
    }
    if after_slash {
        if size.is_empty() {
            return None;
        }
        web_mask_size(&StaticValue::String(size.join(" ")))?;
    } else if !size.is_empty() {
        return None;
    }
    Some(vec![web_longhand("mask", minify_css_commas(value))])
}
