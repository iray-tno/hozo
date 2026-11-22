//! Times, timing functions and other single CSS functions on the Web.

use super::css_tokens::{web_comma_groups, web_css_identifier};
use super::static_value::{numeric_text, StaticValue};
use super::transform::transform_dimension;
use super::web_grid::web_url_or_none;

pub(super) fn web_signed_time(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else {
        return None;
    };
    let (number, milliseconds) = if let Some(number) = value.strip_suffix("ms") {
        (number.parse::<f64>().ok()?, true)
    } else {
        (value.strip_suffix('s')?.parse::<f64>().ok()?, false)
    };
    if !number.is_finite() {
        return None;
    }
    // StyleX's CSS minifier currently leaves negative times in their input
    // unit, while non-negative times use the shorter exact spelling.
    if number < 0.0 {
        return Some(value.clone());
    }
    let milliseconds_value = if milliseconds {
        number
    } else {
        number * 1000.0
    };
    let in_ms = format!("{}ms", minified_css_number(milliseconds_value));
    let in_seconds = format!("{}s", minified_css_number(milliseconds_value / 1000.0));
    if in_ms.len() < in_seconds.len() {
        Some(in_ms)
    } else if in_seconds.len() < in_ms.len() {
        Some(in_seconds)
    } else if milliseconds {
        Some(in_ms)
    } else {
        Some(in_seconds)
    }
}

pub(super) fn minified_css_number(value: f64) -> String {
    let value = numeric_text(value);
    value
        .strip_prefix("0.")
        .map(|fraction| format!(".{fraction}"))
        .or_else(|| {
            value
                .strip_prefix("-0.")
                .map(|fraction| format!("-.{fraction}"))
        })
        .unwrap_or(value)
}

pub(super) fn web_animation_timing_function(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else {
        return None;
    };
    if matches!(
        value.as_str(),
        "linear" | "ease" | "ease-in" | "ease-out" | "ease-in-out" | "step-start" | "step-end"
    ) {
        return Some(value.clone());
    }
    if let Some(arguments) = value
        .strip_prefix("cubic-bezier(")
        .and_then(|value| value.strip_suffix(')'))
    {
        let numbers = arguments
            .split(',')
            .map(|part| {
                part.trim()
                    .parse::<f64>()
                    .ok()
                    .filter(|value| value.is_finite())
            })
            .collect::<Option<Vec<_>>>()?;
        if numbers.len() != 4
            || !(0.0..=1.0).contains(&numbers[0])
            || !(0.0..=1.0).contains(&numbers[2])
        {
            return None;
        }
        return Some(format!(
            "cubic-bezier({},{},{},{})",
            minified_css_number(numbers[0]),
            minified_css_number(numbers[1]),
            minified_css_number(numbers[2]),
            minified_css_number(numbers[3])
        ));
    }
    let arguments = value
        .strip_prefix("steps(")
        .and_then(|value| value.strip_suffix(')'))?;
    let parts = arguments.split(',').map(str::trim).collect::<Vec<_>>();
    if !(1..=2).contains(&parts.len()) {
        return None;
    }
    let count = parts[0].parse::<u32>().ok().filter(|count| *count > 0)?;
    let position = parts.get(1).copied();
    if position.is_some_and(|position| {
        !matches!(
            position,
            "jump-start" | "jump-end" | "jump-none" | "jump-both" | "start" | "end"
        )
    }) || position == Some("jump-none") && count == 1
    {
        return None;
    }
    Some(match position {
        Some(position) => format!("steps({count},{position})"),
        None => format!("steps({count})"),
    })
}

pub(super) fn minify_css_commas(value: &str) -> String {
    let mut output = String::with_capacity(value.len());
    let mut characters = value.chars().peekable();
    let mut quote = None;
    let mut escaped = false;
    while let Some(character) = characters.next() {
        if escaped {
            output.push(character);
            escaped = false;
            continue;
        }
        if character == '\\' && quote.is_some() {
            output.push(character);
            escaped = true;
            continue;
        }
        if let Some(active_quote) = quote {
            output.push(character);
            if character == active_quote {
                quote = None;
            }
            continue;
        }
        if matches!(character, '\'' | '"') {
            quote = Some(character);
            output.push(character);
        } else if character == ',' {
            while output.ends_with(char::is_whitespace) {
                output.pop();
            }
            output.push(',');
            while characters.peek().is_some_and(|next| next.is_whitespace()) {
                characters.next();
            }
        } else {
            output.push(character);
        }
    }
    output
}

pub(super) fn web_single_function(value: &str, names: &[&str]) -> bool {
    if value.contains([';', '{', '}', '\n', '\r']) || !value.ends_with(')') {
        return false;
    }
    let Some(open) = value.find('(') else {
        return false;
    };
    if !names.contains(&value[..open].trim()) {
        return false;
    }
    let mut depth = 0_u32;
    for (index, character) in value.char_indices().skip(open) {
        match character {
            '(' => depth += 1,
            ')' => {
                let Some(next) = depth.checked_sub(1) else {
                    return false;
                };
                depth = next;
                if depth == 0 && index + character.len_utf8() != value.len() {
                    return false;
                }
            }
            _ => {}
        }
    }
    depth == 0
}

pub(super) fn web_clip_path(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else {
        return None;
    };
    let value = value.trim();
    if value == "none" || web_url_or_none(&StaticValue::String(value.to_string())).is_some() {
        return Some(value.to_string());
    }
    web_single_function(value, &["circle", "ellipse", "inset", "polygon", "path"])
        .then(|| minify_css_commas(value))
}

pub(super) fn web_perspective_origin(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else {
        return None;
    };
    let parts = value.split_ascii_whitespace().collect::<Vec<_>>();
    ((1..=2).contains(&parts.len())
        && parts.iter().all(|part| {
            matches!(*part, "left" | "center" | "right" | "top" | "bottom")
                || transform_dimension(part).is_some()
        }))
    .then(|| parts.join(" "))
}

pub(super) fn web_will_change(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else {
        return None;
    };
    if value == "auto" {
        return Some(value.clone());
    }
    let names = web_comma_groups(value)?;
    names
        .iter()
        .all(|name| {
            web_css_identifier(name)
                && !matches!(*name, "auto" | "initial" | "inherit" | "revert" | "unset")
        })
        .then(|| names.join(","))
}

pub(super) fn web_comma_keyword_groups(
    value: &StaticValue,
    keywords: &[&str],
    minimum: usize,
    maximum: usize,
) -> Option<String> {
    let StaticValue::String(value) = value else {
        return None;
    };
    let groups = web_comma_groups(value)?;
    groups
        .iter()
        .all(|group| {
            let words = group.split_ascii_whitespace().collect::<Vec<_>>();
            (minimum..=maximum).contains(&words.len())
                && words.iter().all(|word| keywords.contains(word))
        })
        .then(|| groups.join(","))
}
