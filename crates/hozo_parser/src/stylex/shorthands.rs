//! Shorthands expanded into longhands: text shadow, place content, columns,
//! column rule, list style and scroll boxes.

use hozo_ir::{Color, Edge, Justify, Length, StyleProperty, TextShadowValue};

use super::css_tokens::{
    has_top_level_comma, portable_text_shadow_color, web_components, web_longhand,
    web_shorthand_color,
};
use super::grid::{normalize_stylex_grid_value, normalize_stylex_number_zeros};
use super::static_value::{numeric_text, StaticValue};
use super::values::px_length;
use super::web_grid::web_url_or_none;
use super::web_length::web_length;
use super::web_values::web_integer;

/// The exact intersection of CSS `text-shadow` and React Native's three
/// text-shadow fields. Multiple layers and relative/dynamic lengths stay in
/// the official StyleX transform; a single px layer can be losslessly split.
pub(super) fn stylex_text_shadow(value: &StaticValue) -> Option<TextShadowValue> {
    let StaticValue::String(value) = value else {
        return None;
    };
    let value = value.trim();
    if value == "none" {
        return Some(TextShadowValue::Portable {
            css: value.to_string(),
            color: Color::Css("transparent".to_string()),
            offset_x: Length::Px(0.0),
            offset_y: Length::Px(0.0),
            radius: Length::Px(0.0),
        });
    }
    if has_top_level_comma(value) {
        return None;
    }

    let mut color = None;
    let mut lengths = Vec::new();
    for part in web_components(value)? {
        if portable_text_shadow_color(&part) {
            if color.replace(Color::Css(part)).is_some() {
                return None;
            }
            continue;
        }
        let length = px_length(&StaticValue::String(part))?;
        if !matches!(length, Length::Px(number) if number.is_finite()) {
            return None;
        }
        lengths.push(length);
    }
    if !(2..=3).contains(&lengths.len()) {
        return None;
    }
    let radius = lengths.get(2).cloned().unwrap_or(Length::Px(0.0));
    if !matches!(radius, Length::Px(number) if number >= 0.0) {
        return None;
    }
    Some(TextShadowValue::Portable {
        css: normalize_stylex_number_zeros(&normalize_stylex_grid_value(value)),
        color: color?,
        offset_x: lengths[0].clone(),
        offset_y: lengths[1].clone(),
        radius,
    })
}

pub(super) fn stylex_place_content(value: &StaticValue) -> Option<Vec<StyleProperty>> {
    let StaticValue::String(value) = value else {
        return None;
    };
    let parts = value.split_ascii_whitespace().collect::<Vec<_>>();
    if !(1..=2).contains(&parts.len()) {
        return None;
    }
    let alignment = |value| {
        Some(match value {
            "flex-start" => Justify::Start,
            "center" => Justify::Center,
            "flex-end" => Justify::End,
            "space-between" => Justify::Between,
            "space-around" => Justify::Around,
            "space-evenly" => Justify::Evenly,
            _ => return None,
        })
    };
    let align = alignment(parts[0])?;
    let justify = alignment(parts.get(1).copied().unwrap_or(parts[0]))?;
    Some(vec![
        StyleProperty::AlignContent(align),
        StyleProperty::JustifyContent(justify),
    ])
}

pub(super) fn stylex_columns(value: &StaticValue) -> Option<Vec<StyleProperty>> {
    let mut width = "auto".to_string();
    let mut count = "auto".to_string();
    match value {
        // StyleX treats a numeric shorthand value as a length and appends px.
        StaticValue::Number(number) if number.is_finite() && *number > 0.0 => {
            width = format!("{}px", numeric_text(*number));
        }
        StaticValue::String(value) if value == "auto" => {}
        StaticValue::String(value) => {
            let parts = web_components(value)?;
            if parts.len() > 2 {
                return None;
            }
            for part in parts {
                let part_value = StaticValue::String(part.clone());
                if count == "auto" && web_integer(&part_value, 1, i64::MAX).is_some() {
                    count = part;
                } else if width == "auto"
                    && web_length(&part_value, &[], f64::MIN_POSITIVE).is_some()
                {
                    width = part;
                } else {
                    return None;
                }
            }
        }
        _ => return None,
    }
    Some(vec![
        web_longhand("column-width", width),
        web_longhand("column-count", count),
    ])
}

pub(super) fn stylex_column_rule(value: &StaticValue) -> Option<Vec<StyleProperty>> {
    const STYLES: &[&str] = &[
        "none", "hidden", "dotted", "dashed", "solid", "double", "groove", "ridge", "inset",
        "outset",
    ];
    let mut width = "medium".to_string();
    let mut style = "none".to_string();
    let mut color = "currentcolor".to_string();
    let mut saw_width = false;
    let mut saw_style = false;
    let mut saw_color = false;
    let parts = match value {
        StaticValue::Number(number) if number.is_finite() && *number >= 0.0 => {
            vec![format!("{}px", numeric_text(*number))]
        }
        StaticValue::String(value) => web_components(value)?,
        _ => return None,
    };
    if parts.len() > 3 {
        return None;
    }
    for part in parts {
        let part_value = StaticValue::String(part.clone());
        if !saw_style && STYLES.contains(&part.as_str()) {
            style = part;
            saw_style = true;
        } else if !saw_width && web_length(&part_value, &["thin", "medium", "thick"], 0.0).is_some()
        {
            width = part;
            saw_width = true;
        } else if !saw_color && web_shorthand_color(&part) {
            color = part;
            saw_color = true;
        } else {
            return None;
        }
    }
    Some(vec![
        web_longhand("column-rule-width", width),
        web_longhand("column-rule-style", style),
        web_longhand("column-rule-color", color),
    ])
}

pub(super) fn stylex_list_style(value: &StaticValue) -> Option<Vec<StyleProperty>> {
    const TYPES: &[&str] = &[
        "none",
        "disc",
        "circle",
        "square",
        "decimal",
        "decimal-leading-zero",
        "lower-roman",
        "upper-roman",
        "lower-greek",
        "lower-latin",
        "upper-latin",
        "armenian",
        "georgian",
        "lower-alpha",
        "upper-alpha",
    ];
    let StaticValue::String(value) = value else {
        return None;
    };
    if matches!(value.as_str(), "inherit" | "initial" | "revert" | "unset") {
        return Some(vec![
            web_longhand("list-style-type", value.clone()),
            web_longhand("list-style-position", value.clone()),
            web_longhand("list-style-image", value.clone()),
        ]);
    }
    let mut kind = "disc".to_string();
    let mut position = "outside".to_string();
    let mut image = "none".to_string();
    let mut saw_kind = false;
    let mut saw_position = false;
    let mut saw_image = false;
    for part in web_components(value)? {
        if !saw_position && matches!(part.as_str(), "inside" | "outside") {
            position = part;
            saw_position = true;
        } else if !saw_kind && TYPES.contains(&part.as_str()) {
            kind = part;
            saw_kind = true;
        } else if !saw_image && web_url_or_none(&StaticValue::String(part.clone())).is_some() {
            image = part;
            saw_image = true;
        } else {
            return None;
        }
    }
    Some(vec![
        web_longhand("list-style-type", kind),
        web_longhand("list-style-position", position),
        web_longhand("list-style-image", image),
    ])
}

pub(super) fn stylex_box_lengths(value: &StaticValue) -> Option<[Length; 4]> {
    let parts = match value {
        StaticValue::Number(_) => vec![value.clone()],
        StaticValue::String(value) => web_components(value)?
            .into_iter()
            .map(StaticValue::String)
            .collect(),
    };
    if !(1..=4).contains(&parts.len()) {
        return None;
    }
    let lengths = parts.iter().map(px_length).collect::<Option<Vec<_>>>()?;
    if !lengths
        .iter()
        .all(|length| matches!(length, Length::Px(value) if value.is_finite()))
    {
        return None;
    }
    let top = lengths[0].clone();
    let right = lengths.get(1).unwrap_or(&top).clone();
    let bottom = lengths.get(2).unwrap_or(&top).clone();
    let left = lengths.get(3).unwrap_or(&right).clone();
    Some([top, right, bottom, left])
}

pub(super) fn stylex_scroll_box(value: &StaticValue, padding: bool) -> Option<Vec<StyleProperty>> {
    let lengths = stylex_box_lengths(value)?;
    if padding
        && lengths
            .iter()
            .any(|length| matches!(length, Length::Px(value) if *value < 0.0))
    {
        return None;
    }
    let [top, right, bottom, left] = lengths;
    let property = |edge, value| {
        if padding {
            StyleProperty::ScrollPadding(edge, value)
        } else {
            StyleProperty::ScrollMargin(edge, value)
        }
    };
    Some(vec![
        property(Edge::Top, top),
        property(Edge::Right, right),
        property(Edge::Bottom, bottom),
        property(Edge::Left, left),
    ])
}

pub(super) fn stylex_scroll_axis(
    value: &StaticValue,
    padding: bool,
    start: Edge,
    end: Edge,
) -> Option<Vec<StyleProperty>> {
    let parts = match value {
        StaticValue::Number(_) => vec![value.clone()],
        StaticValue::String(value) => web_components(value)?
            .into_iter()
            .map(StaticValue::String)
            .collect(),
    };
    if !(1..=2).contains(&parts.len()) {
        return None;
    }
    let lengths = parts.iter().map(px_length).collect::<Option<Vec<_>>>()?;
    if !lengths
        .iter()
        .all(|length| matches!(length, Length::Px(value) if value.is_finite() && (!padding || *value >= 0.0)))
    {
        return None;
    }
    let start_value = lengths[0].clone();
    let end_value = lengths.get(1).unwrap_or(&start_value).clone();
    let property = |edge, value| {
        if padding {
            StyleProperty::ScrollPadding(edge, value)
        } else {
            StyleProperty::ScrollMargin(edge, value)
        }
    };
    Some(vec![property(start, start_value), property(end, end_value)])
}
