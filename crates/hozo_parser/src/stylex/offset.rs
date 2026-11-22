//! Motion path `offset` and its longhands, and `shape-outside`.

use hozo_ir::StyleProperty;

use super::css_tokens::web_longhand;
use super::static_value::StaticValue;
use super::transform::{transform_angle, transform_dimension};
use super::values::length_value;
use super::web_functions::{minify_css_commas, web_single_function};
use super::web_grid::web_url_or_none;
use super::web_length::web_length_percentage;

pub(super) fn web_offset_path(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else {
        return None;
    };
    let value = value.trim();
    if value == "none" || web_url_or_none(&StaticValue::String(value.to_string())).is_some() {
        return Some(value.to_string());
    }
    web_single_function(
        value,
        &["path", "ray", "circle", "ellipse", "inset", "polygon"],
    )
    .then(|| minify_css_commas(value))
}

pub(super) fn web_offset_position(value: &StaticValue, keywords: &[&str]) -> Option<String> {
    let StaticValue::String(value) = value else {
        return None;
    };
    if keywords.contains(&value.as_str()) {
        return Some(value.clone());
    }
    let parts = value.split_ascii_whitespace().collect::<Vec<_>>();
    ((1..=4).contains(&parts.len())
        && parts.iter().all(|part| {
            matches!(*part, "left" | "center" | "right" | "top" | "bottom")
                || transform_dimension(part).is_some()
        }))
    .then(|| parts.join(" "))
}

pub(super) fn web_offset_rotate(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else {
        return None;
    };
    let parts = value.split_ascii_whitespace().collect::<Vec<_>>();
    if !(1..=2).contains(&parts.len()) {
        return None;
    }
    let keyword_count = parts
        .iter()
        .filter(|part| matches!(**part, "auto" | "reverse"))
        .count();
    let angle_count = parts
        .iter()
        .filter(|part| transform_angle(part).is_some())
        .count();
    (keyword_count <= 1 && angle_count <= 1 && keyword_count + angle_count == parts.len())
        .then(|| parts.join(" "))
}

/// Expand the common path-first `offset` shorthand without losing StyleX's
/// independently ranked longhand slots. Position/anchor slash syntax stays
/// residual until its wider grammar can be represented exactly.
pub(super) fn stylex_offset(value: &StaticValue) -> Option<Vec<StyleProperty>> {
    let StaticValue::String(value) = value else {
        return None;
    };
    let value = value.trim();
    if value == "none" {
        return Some(vec![
            web_longhand("offset-position", "normal"),
            web_longhand("offset-path", "none"),
            web_longhand("offset-distance", "0px"),
            web_longhand("offset-rotate", "auto"),
            web_longhand("offset-anchor", "auto"),
        ]);
    }
    let close = value.find(')')?;
    let path = value[..=close].trim();
    let path = web_offset_path(&StaticValue::String(path.to_string()))?;
    let rest = value[close + 1..]
        .split_ascii_whitespace()
        .map(str::to_string)
        .collect::<Vec<_>>();
    let (distance, rotate) = match rest.as_slice() {
        [] => ("0px".to_string(), "auto".to_string()),
        [distance] => {
            let value = StaticValue::String(distance.clone());
            (
                web_length_percentage(&value).then(|| length_value(&value))?,
                "auto".to_string(),
            )
        }
        [distance, rotate @ ..] => {
            let distance_value = StaticValue::String(distance.clone());
            let rotate_value = StaticValue::String(rotate.join(" "));
            (
                web_length_percentage(&distance_value).then(|| length_value(&distance_value))?,
                web_offset_rotate(&rotate_value)?,
            )
        }
    };
    Some(vec![
        web_longhand("offset-position", "normal"),
        web_longhand("offset-path", path),
        web_longhand("offset-distance", distance),
        web_longhand("offset-rotate", rotate),
        web_longhand("offset-anchor", "auto"),
    ])
}

pub(super) fn web_shape_outside(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else {
        return None;
    };
    let value = value.trim();
    if matches!(
        value,
        "none" | "margin-box" | "border-box" | "padding-box" | "content-box"
    ) || web_url_or_none(&StaticValue::String(value.to_string())).is_some()
    {
        return Some(value.to_string());
    }
    web_single_function(value, &["circle", "ellipse", "inset", "polygon"])
        .then(|| minify_css_commas(value))
}
