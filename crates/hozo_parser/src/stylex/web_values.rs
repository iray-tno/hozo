//! Web-only values for decoration, content, outline, clipping and plain numbers.

use super::css_tokens::{web_components, web_css_identifier, web_css_string, web_shorthand_color};
use super::static_value::{numeric_text, StaticValue};
use super::values::length_value;
use super::web_length::{
    web_length, web_length_number, web_length_percentage_string, web_length_string,
};

pub(super) fn web_masonry_auto_flow(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else {
        return None;
    };
    let tokens = value.split_ascii_whitespace().collect::<Vec<_>>();
    if tokens.is_empty() || tokens.len() > 2 {
        return None;
    }
    let packing = tokens
        .iter()
        .filter(|token| matches!(**token, "pack" | "next"))
        .count();
    let ordering = tokens
        .iter()
        .filter(|token| matches!(**token, "definite-first" | "ordered"))
        .count();
    (packing <= 1 && ordering <= 1 && packing + ordering == tokens.len()).then(|| value.clone())
}

pub(super) fn web_angle(value: &StaticValue, keywords: &[&str]) -> Option<String> {
    match value {
        StaticValue::Number(number) if number.is_finite() => Some(length_value(value)),
        StaticValue::String(value) if keywords.contains(&value.as_str()) => Some(value.clone()),
        StaticValue::String(value) if value == "0" => Some(value.clone()),
        StaticValue::String(value) => ["deg", "grad", "rad", "turn"]
            .iter()
            .find_map(|unit| value.strip_suffix(unit))?
            .parse::<f64>()
            .ok()
            .filter(|number| number.is_finite())
            .map(|_| value.clone()),
        StaticValue::Number(_) => None,
    }
}

pub(super) fn web_text_decoration_skip(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else {
        return None;
    };
    if value == "none" {
        return Some(value.clone());
    }
    let choices = ["objects", "spaces", "ink", "edges", "box-decoration"];
    let tokens = value.split_ascii_whitespace().collect::<Vec<_>>();
    (tokens.len() <= choices.len()
        && !tokens.is_empty()
        && tokens.iter().all(|token| choices.contains(token))
        && tokens
            .iter()
            .enumerate()
            .all(|(index, token)| !tokens[..index].contains(token)))
    .then(|| value.clone())
}

pub(super) fn web_counter_list(value: &StaticValue, allow_reversed: bool) -> Option<String> {
    let StaticValue::String(value) = value else {
        return None;
    };
    if value == "none" {
        return Some(value.clone());
    }
    let tokens = value.split_ascii_whitespace().collect::<Vec<_>>();
    let mut index = 0;
    while index < tokens.len() {
        let token = tokens[index];
        let identifier = allow_reversed
            .then(|| token.strip_prefix("reversed(")?.strip_suffix(')'))
            .flatten()
            .unwrap_or(token);
        if !web_css_identifier(identifier)
            || matches!(
                identifier,
                "none" | "inherit" | "initial" | "revert" | "revert-layer" | "unset"
            )
        {
            return None;
        }
        index += 1;
        if index < tokens.len() && tokens[index].parse::<i64>().is_ok() {
            index += 1;
        }
    }
    (!tokens.is_empty()).then(|| value.clone())
}

pub(super) fn web_scrollbar_color(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else {
        return None;
    };
    if value == "auto" {
        return Some(value.clone());
    }
    let colors = web_components(value)?;
    (colors.len() == 2 && colors.iter().all(|color| web_shorthand_color(color)))
        .then(|| value.clone())
}

pub(super) fn web_quotes(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else {
        return None;
    };
    if matches!(value.as_str(), "auto" | "none") {
        return Some(value.clone());
    }
    let strings = web_components(value)?;
    (strings.len() % 2 == 0 && strings.iter().all(|string| web_css_string(string)))
        .then(|| value.clone())
}

pub(super) fn web_generated_content(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else {
        return None;
    };
    if matches!(value.as_str(), "normal" | "none") {
        return Some(value.clone());
    }
    let components = web_components(value)?;
    let quote_keywords = [
        "open-quote",
        "close-quote",
        "no-open-quote",
        "no-close-quote",
    ];
    components
        .iter()
        .all(|component| web_css_string(component) || quote_keywords.contains(&component.as_str()))
        .then(|| value.clone())
}

pub(super) fn web_zoom(value: &StaticValue) -> Option<String> {
    match value {
        StaticValue::Number(number) if number.is_finite() && *number >= 0.0 => {
            Some(numeric_text(*number))
        }
        StaticValue::String(value) if matches!(value.as_str(), "normal" | "reset") => {
            Some(value.clone())
        }
        StaticValue::String(value) => value
            .strip_suffix('%')?
            .parse::<f64>()
            .ok()
            .filter(|number| number.is_finite() && *number >= 0.0)
            .map(|_| value.clone()),
        StaticValue::Number(_) => None,
    }
}

pub(super) fn web_text_decoration(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else {
        return None;
    };
    let components = web_components(value)?;
    let lines = ["underline", "overline", "line-through", "blink"];
    let styles = ["solid", "double", "dotted", "dashed", "wavy"];
    let mut found_lines = Vec::new();
    let mut has_style = false;
    let mut has_thickness = false;
    let mut has_color = false;
    for component in &components {
        if lines.contains(&component.as_str()) {
            if found_lines.contains(&component) {
                return None;
            }
            found_lines.push(component);
        } else if component == "none" {
            if components.len() != 1 {
                return None;
            }
            found_lines.push(component);
        } else if styles.contains(&component.as_str()) && !has_style {
            has_style = true;
        } else if !has_thickness
            && (matches!(component.as_str(), "auto" | "from-font")
                || web_length_percentage_string(component)
                    && web_length_number(component).is_some_and(|number| number >= 0.0))
        {
            has_thickness = true;
        } else if !has_color && web_shorthand_color(component) {
            has_color = true;
        } else {
            return None;
        }
    }
    (found_lines.len() <= lines.len()).then(|| value.clone())
}

pub(super) fn web_text_emphasis(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else {
        return None;
    };
    let components = web_components(value)?;
    let fills = ["filled", "open"];
    let shapes = ["dot", "circle", "double-circle", "triangle", "sesame"];
    let mut fill_count = 0;
    let mut shape_count = 0;
    let mut has_string = false;
    let mut has_none = false;
    let mut has_color = false;
    for component in &components {
        if fills.contains(&component.as_str()) && !has_string && !has_none {
            fill_count += 1;
        } else if shapes.contains(&component.as_str()) && !has_string && !has_none {
            shape_count += 1;
        } else if component == "none" && fill_count == 0 && shape_count == 0 && !has_string {
            has_none = true;
        } else if web_css_string(component)
            && fill_count == 0
            && shape_count == 0
            && !has_none
            && !has_string
        {
            has_string = true;
        } else if !has_color && web_shorthand_color(component) {
            has_color = true;
        } else {
            return None;
        }
    }
    (fill_count <= 1 && shape_count <= 1).then(|| value.clone())
}

pub(super) fn web_outline(value: &StaticValue) -> Option<String> {
    const STYLES: &[&str] = &[
        "auto", "none", "hidden", "dotted", "dashed", "solid", "double", "groove", "ridge",
        "inset", "outset",
    ];
    let parts = match value {
        StaticValue::Number(number) if number.is_finite() && *number >= 0.0 => {
            return Some(length_value(value));
        }
        StaticValue::String(value) => web_components(value)?,
        _ => return None,
    };
    if parts.len() > 3 {
        return None;
    }
    let mut has_style = false;
    let mut has_width = false;
    let mut has_color = false;
    for part in parts {
        let part_value = StaticValue::String(part.clone());
        if !has_style && STYLES.contains(&part.as_str()) {
            has_style = true;
        } else if !has_width && web_length(&part_value, &["thin", "medium", "thick"], 0.0).is_some()
        {
            has_width = true;
        } else if !has_color && (part == "invert" || web_shorthand_color(&part)) {
            has_color = true;
        } else {
            return None;
        }
    }
    Some(match value {
        StaticValue::String(value) => value.clone(),
        _ => unreachable!("numeric outlines return above"),
    })
}

pub(super) fn web_length_list(
    value: &StaticValue,
    minimum: usize,
    maximum: usize,
) -> Option<String> {
    if let StaticValue::Number(number) = value {
        return (minimum <= 1 && number.is_finite() && *number >= 0.0).then(|| length_value(value));
    }
    let StaticValue::String(value) = value else {
        return None;
    };
    let parts = value.split_ascii_whitespace().collect::<Vec<_>>();
    (parts.len() >= minimum
        && parts.len() <= maximum
        && parts.iter().all(|part| {
            web_length_string(part) && web_length_number(part).is_some_and(|number| number >= 0.0)
        }))
    .then(|| value.clone())
}

pub(super) fn web_integer(value: &StaticValue, minimum: i64, maximum: i64) -> Option<String> {
    let number = match value {
        StaticValue::Number(value) if value.is_finite() && value.fract() == 0.0 => *value,
        StaticValue::String(value) => value
            .parse::<f64>()
            .ok()
            .filter(|value| value.is_finite() && value.fract() == 0.0)?,
        _ => return None,
    };
    (number >= minimum as f64 && number <= maximum as f64).then(|| numeric_text(number))
}

pub(super) fn web_clip_rect(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else {
        return None;
    };
    if value == "auto" {
        return Some(value.clone());
    }
    let inside = value.strip_prefix("rect(")?.strip_suffix(')')?;
    let parts = inside
        .split([',', ' ', '\t', '\n', '\r'])
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>();
    (parts.len() == 4
        && parts
            .iter()
            .all(|part| *part == "auto" || web_length_string(part)))
    .then(|| value.clone())
}

pub(super) fn web_contain(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else {
        return None;
    };
    if matches!(value.as_str(), "none" | "strict" | "content") {
        return Some(value.clone());
    }
    let parts = value.split_ascii_whitespace().collect::<Vec<_>>();
    let allowed = ["size", "inline-size", "layout", "style", "paint"];
    (!parts.is_empty()
        && parts.iter().all(|part| allowed.contains(part))
        && parts
            .iter()
            .enumerate()
            .all(|(index, part)| !parts[..index].contains(part))
        && !(parts.contains(&"size") && parts.contains(&"inline-size")))
    .then(|| value.clone())
}

pub(super) fn web_svg_length(value: &StaticValue) -> bool {
    match value {
        StaticValue::Number(value) => value.is_finite(),
        StaticValue::String(value) => {
            value.parse::<f64>().is_ok_and(f64::is_finite) || web_length_percentage_string(value)
        }
    }
}

pub(super) fn web_number(value: &StaticValue, minimum: f64, maximum: f64) -> Option<String> {
    let number = match value {
        StaticValue::Number(value) => *value,
        StaticValue::String(value) => value.parse::<f64>().ok()?,
    };
    (number.is_finite() && number >= minimum && number <= maximum).then(|| numeric_text(number))
}

pub(super) fn web_number_percentage(
    value: &StaticValue,
    minimum: f64,
    maximum: f64,
) -> Option<String> {
    match value {
        StaticValue::String(value) if value.ends_with('%') => {
            let percentage = value.strip_suffix('%')?.parse::<f64>().ok()?;
            (percentage.is_finite()
                && percentage >= minimum * 100.0
                && percentage <= maximum * 100.0)
                .then(|| value.clone())
        }
        value => web_number(value, minimum, maximum),
    }
}

pub(super) fn web_non_negative_number_token(value: &str) -> bool {
    value
        .parse::<f64>()
        .is_ok_and(|number| number.is_finite() && number >= 0.0)
}
