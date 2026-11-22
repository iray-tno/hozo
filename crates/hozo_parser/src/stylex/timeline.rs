//! Scroll-driven animation timelines, ranges and view-transition names.

use hozo_ir::StyleProperty;

use super::css_tokens::{web_comma_groups, web_components, web_css_identifier, web_longhand};
use super::static_value::StaticValue;
use super::values::length_value;
use super::web_length::web_length_percentage_string;

pub(super) fn web_timeline_names(value: &StaticValue, allow_all: bool) -> Option<String> {
    let StaticValue::String(value) = value else {
        return None;
    };
    if value == "none" || allow_all && value == "all" {
        return Some(value.clone());
    }
    web_comma_groups(value)?
        .iter()
        .all(|name| name.trim().starts_with("--") && web_css_identifier(name.trim()))
        .then(|| value.clone())
}

pub(super) fn web_dashed_ident(value: &StaticValue, keyword: &str) -> Option<String> {
    let StaticValue::String(value) = value else {
        return None;
    };
    (value == keyword || value.starts_with("--") && web_css_identifier(value))
        .then(|| value.clone())
}

pub(super) fn web_view_transition_name(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else {
        return None;
    };
    (matches!(value.as_str(), "none" | "match-element")
        || web_css_identifier(value)
            && !matches!(
                value.as_str(),
                "auto" | "normal" | "inherit" | "initial" | "unset"
            ))
    .then(|| value.clone())
}

pub(super) fn web_animation_timeline(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else {
        return None;
    };
    web_comma_groups(value)?
        .iter()
        .all(|item| {
            let item = item.trim();
            matches!(item, "auto" | "none") || item.starts_with("--") && web_css_identifier(item)
        })
        .then(|| value.clone())
}

pub(super) fn web_animation_range_boundary(value: &StaticValue) -> Option<String> {
    match value {
        StaticValue::Number(_) => Some(length_value(value)),
        StaticValue::String(value) if value == "normal" => Some(value.clone()),
        StaticValue::String(value) => {
            let tokens = value.split_ascii_whitespace().collect::<Vec<_>>();
            let names = [
                "cover",
                "contain",
                "entry",
                "exit",
                "entry-crossing",
                "exit-crossing",
            ];
            let valid = match tokens.as_slice() {
                [token] => names.contains(token) || web_length_percentage_string(token),
                [name, offset] => names.contains(name) && web_length_percentage_string(offset),
                _ => false,
            };
            valid.then(|| value.clone())
        }
    }
}

pub(super) fn web_view_timeline_inset(value: &StaticValue) -> Option<String> {
    match value {
        StaticValue::Number(_) => Some(length_value(value)),
        StaticValue::String(value) => {
            let tokens = value.split_ascii_whitespace().collect::<Vec<_>>();
            (tokens.len() <= 2
                && !tokens.is_empty()
                && tokens
                    .iter()
                    .all(|token| *token == "auto" || web_length_percentage_string(token)))
            .then(|| value.clone())
        }
    }
}

pub(super) fn stylex_animation_range(value: &StaticValue) -> Option<Vec<StyleProperty>> {
    let StaticValue::String(value) = value else {
        return None;
    };
    if value.contains(',') {
        return None;
    }
    let parts = web_components(value)?;
    let boundary = |parts: &[String]| {
        let value = StaticValue::String(parts.join(" "));
        web_animation_range_boundary(&value).map(|_| match value {
            StaticValue::String(value) => value,
            StaticValue::Number(_) => unreachable!(),
        })
    };
    let (start, end) = if let Some(start) = boundary(&parts) {
        (start, "normal".to_string())
    } else {
        let candidates = (1..parts.len())
            .filter_map(|split| Some((boundary(&parts[..split])?, boundary(&parts[split..])?)))
            .collect::<Vec<_>>();
        if candidates.len() != 1 {
            return None;
        }
        candidates.into_iter().next()?
    };
    Some(vec![
        web_longhand("animation-range-start", start),
        web_longhand("animation-range-end", end),
    ])
}

pub(super) fn stylex_scroll_timeline(value: &StaticValue) -> Option<Vec<StyleProperty>> {
    let StaticValue::String(value) = value else {
        return None;
    };
    let mut name = None;
    let mut axis = None;
    for part in web_components(value)? {
        if matches!(part.as_str(), "block" | "inline" | "x" | "y") && axis.is_none() {
            axis = Some(part);
        } else if (part == "none" || part.starts_with("--") && web_css_identifier(&part))
            && name.is_none()
        {
            name = Some(part);
        } else {
            return None;
        }
    }
    Some(vec![
        web_longhand(
            "scroll-timeline-name",
            name.unwrap_or_else(|| "none".to_string()),
        ),
        web_longhand(
            "scroll-timeline-axis",
            axis.unwrap_or_else(|| "block".to_string()),
        ),
    ])
}

pub(super) fn stylex_view_timeline(value: &StaticValue) -> Option<Vec<StyleProperty>> {
    let StaticValue::String(value) = value else {
        return None;
    };
    let mut name = None;
    let mut axis = None;
    let mut inset = Vec::new();
    for part in web_components(value)? {
        if matches!(part.as_str(), "block" | "inline" | "x" | "y") && axis.is_none() {
            axis = Some(part);
        } else if (part == "none" || part.starts_with("--") && web_css_identifier(&part))
            && name.is_none()
        {
            name = Some(part);
        } else {
            inset.push(part);
        }
    }
    let inset = if inset.is_empty() {
        "auto".to_string()
    } else {
        let inset = inset.join(" ");
        web_view_timeline_inset(&StaticValue::String(inset.clone()))?;
        inset
    };
    Some(vec![
        web_longhand(
            "view-timeline-name",
            name.unwrap_or_else(|| "none".to_string()),
        ),
        web_longhand(
            "view-timeline-axis",
            axis.unwrap_or_else(|| "block".to_string()),
        ),
        web_longhand("view-timeline-inset", inset),
    ])
}
