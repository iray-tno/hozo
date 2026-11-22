//! Web-only lengths, percentages and the properties built from them.

use super::static_value::{numeric_text, StaticValue};
use super::web_values::web_integer;

pub(super) fn web_length_percentage(value: &StaticValue) -> bool {
    match value {
        StaticValue::Number(value) => value.is_finite(),
        StaticValue::String(value) => web_length_percentage_string(value),
    }
}

pub(super) fn web_length_percentage_string(value: &str) -> bool {
    if value == "0" {
        return true;
    }
    [
        "%", "px", "rem", "em", "ch", "ex", "cap", "ic", "lh", "rlh", "vw", "vh", "vi", "vb",
        "vmin", "vmax", "svw", "svh", "lvw", "lvh", "dvw", "dvh", "cm", "mm", "q", "in", "pc",
        "pt",
    ]
    .iter()
    .any(|unit| {
        value
            .strip_suffix(unit)
            .and_then(|number| number.parse::<f64>().ok())
            .is_some_and(f64::is_finite)
    })
}

pub(super) fn web_length_string(value: &str) -> bool {
    if value == "0" {
        return true;
    }
    [
        "px", "rem", "em", "ch", "ex", "cap", "ic", "lh", "rlh", "vw", "vh", "vi", "vb", "vmin",
        "vmax", "svw", "svh", "lvw", "lvh", "dvw", "dvh", "cm", "mm", "q", "in", "pc", "pt",
    ]
    .iter()
    .any(|unit| {
        value
            .strip_suffix(unit)
            .and_then(|number| number.parse::<f64>().ok())
            .is_some_and(f64::is_finite)
    })
}

pub(super) fn web_length_number(value: &str) -> Option<f64> {
    if value == "0" {
        return Some(0.0);
    }
    value
        .trim_end_matches(|character: char| character.is_ascii_alphabetic() || character == '%')
        .parse::<f64>()
        .ok()
        .filter(|number| number.is_finite())
}

pub(super) fn web_length(value: &StaticValue, keywords: &[&str], minimum: f64) -> Option<String> {
    match value {
        StaticValue::Number(value) if value.is_finite() && *value >= minimum => {
            Some(format!("{}px", numeric_text(*value)))
        }
        StaticValue::String(value) if keywords.contains(&value.as_str()) => Some(value.clone()),
        StaticValue::String(value)
            if web_length_string(value)
                && web_length_number(value).is_some_and(|number| number >= minimum) =>
        {
            Some(value.clone())
        }
        _ => None,
    }
}

pub(super) fn web_contain_intrinsic_size(value: &StaticValue, axes: usize) -> Option<String> {
    match value {
        StaticValue::Number(value) if value.is_finite() && *value >= 0.0 => {
            Some(format!("{}px", numeric_text(*value)))
        }
        StaticValue::String(value) if value == "none" => Some(value.clone()),
        StaticValue::String(value) => {
            let tokens = value.split_ascii_whitespace().collect::<Vec<_>>();
            let mut index = 0;
            let mut sizes = 0;
            while index < tokens.len() && sizes < axes {
                if tokens[index] == "auto" {
                    index += 1;
                }
                let token = *tokens.get(index)?;
                let number = web_length_number(token)?;
                if number < 0.0 {
                    return None;
                }
                index += 1;
                sizes += 1;
            }
            (index == tokens.len() && sizes > 0).then(|| value.clone())
        }
        _ => None,
    }
}

pub(super) fn web_overflow_clip_margin(value: &StaticValue) -> Option<String> {
    match value {
        StaticValue::Number(value) if value.is_finite() && *value >= 0.0 => {
            Some(format!("{}px", numeric_text(*value)))
        }
        StaticValue::String(value) => {
            let tokens = value.split_ascii_whitespace().collect::<Vec<_>>();
            if tokens.is_empty() || tokens.len() > 2 {
                return None;
            }
            let boxes = ["content-box", "padding-box", "border-box"];
            let box_count = tokens.iter().filter(|token| boxes.contains(token)).count();
            let length_count = tokens
                .iter()
                .filter(|token| web_length_number(token).is_some_and(|number| number >= 0.0))
                .count();
            (box_count <= 1 && length_count <= 1 && box_count + length_count == tokens.len())
                .then(|| value.clone())
        }
        _ => None,
    }
}

pub(super) fn web_hyphenate_limit_chars(value: &StaticValue) -> Option<String> {
    match value {
        StaticValue::Number(_) => web_integer(value, 1, i64::MAX),
        StaticValue::String(value) if value == "auto" => Some(value.clone()),
        StaticValue::String(value) => {
            let tokens = value.split_ascii_whitespace().collect::<Vec<_>>();
            (tokens.len() <= 3
                && !tokens.is_empty()
                && tokens
                    .iter()
                    .all(|token| token.parse::<u64>().is_ok_and(|number| number > 0)))
            .then(|| value.clone())
        }
    }
}

pub(super) fn web_math_depth(value: &StaticValue) -> Option<String> {
    match value {
        StaticValue::Number(_) => web_integer(value, i64::MIN, i64::MAX),
        StaticValue::String(value) if value == "auto-add" => Some(value.clone()),
        StaticValue::String(value) => {
            let inner = value.strip_prefix("add(")?.strip_suffix(')')?;
            inner.parse::<i64>().ok().map(|_| value.clone())
        }
    }
}

pub(super) fn web_image_resolution(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else {
        return None;
    };
    let tokens = value.split_ascii_whitespace().collect::<Vec<_>>();
    if tokens.is_empty() || tokens.len() > 3 {
        return None;
    }
    let mut from_image = false;
    let mut snap = false;
    let mut resolution = false;
    for token in tokens {
        match token {
            "from-image" if !from_image => from_image = true,
            "snap" if !snap => snap = true,
            token if !resolution => {
                let number = ["dppx", "dpi", "dpcm", "x"]
                    .iter()
                    .find_map(|unit| token.strip_suffix(unit))?
                    .parse::<f64>()
                    .ok()?;
                if !number.is_finite() || number <= 0.0 {
                    return None;
                }
                resolution = true;
            }
            _ => return None,
        }
    }
    (from_image || resolution || snap).then(|| value.clone())
}

pub(super) fn web_initial_letter(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else {
        return None;
    };
    if value == "normal" {
        return Some(value.clone());
    }
    let tokens = value.split_ascii_whitespace().collect::<Vec<_>>();
    if tokens.is_empty() || tokens.len() > 2 {
        return None;
    }
    let size = tokens[0].parse::<f64>().ok()?;
    if !size.is_finite() || size < 1.0 {
        return None;
    }
    if let Some(sink) = tokens.get(1) {
        sink.parse::<u64>().ok().filter(|sink| *sink > 0)?;
    }
    Some(value.clone())
}
