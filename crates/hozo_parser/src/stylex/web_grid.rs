//! Web-only grid track lists, auto flow, template areas, SVG dash arrays and URLs.

use std::collections::HashMap;

use super::css_tokens::{web_components, web_css_identifier};
use super::grid::normalize_stylex_grid_value;
use super::static_value::StaticValue;
use super::web_length::{web_length_number, web_length_percentage_string};

pub(super) fn web_grid_track_breadth(value: &str, flex: bool, fit_content: bool) -> bool {
    if matches!(value, "auto" | "min-content" | "max-content") {
        return true;
    }
    if web_length_percentage_string(value)
        && web_length_number(value).is_some_and(|number| number >= 0.0)
    {
        return true;
    }
    if flex
        && value
            .strip_suffix("fr")
            .and_then(|number| number.parse::<f64>().ok())
            .is_some_and(|number| number.is_finite() && number > 0.0)
    {
        return true;
    }
    if fit_content {
        if let Some(inner) = value
            .strip_prefix("fit-content(")
            .and_then(|value| value.strip_suffix(')'))
        {
            return web_length_percentage_string(inner)
                && web_length_number(inner).is_some_and(|number| number >= 0.0);
        }
    }
    let Some(inner) = value
        .strip_prefix("minmax(")
        .and_then(|value| value.strip_suffix(')'))
    else {
        return false;
    };
    let Some((minimum, maximum)) = inner.split_once(',') else {
        return false;
    };
    web_grid_track_breadth(minimum, false, false) && web_grid_track_breadth(maximum, true, false)
}

pub(super) fn web_grid_track_list(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else {
        return None;
    };
    let normalized = normalize_stylex_grid_value(value);
    let tracks = web_components(&normalized)?;
    tracks
        .iter()
        .all(|track| web_grid_track_breadth(track, true, true))
        .then_some(normalized)
}

pub(super) fn web_grid_auto_flow(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else {
        return None;
    };
    let value = value.split_ascii_whitespace().collect::<Vec<_>>().join(" ");
    matches!(
        value.as_str(),
        "row" | "column" | "dense" | "row dense" | "column dense"
    )
    .then_some(value)
}

pub(super) fn web_grid_template_areas(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else {
        return None;
    };
    let value = value.trim();
    if value == "none" {
        return Some(value.to_string());
    }
    let rows = web_components(value)?;
    let mut cells = Vec::with_capacity(rows.len());
    for row in &rows {
        let quote = row.chars().next()?;
        if !matches!(quote, '\'' | '"') || !row.ends_with(quote) || row.len() < 2 {
            return None;
        }
        let row = row[1..row.len() - 1]
            .split_ascii_whitespace()
            .collect::<Vec<_>>();
        if row.is_empty()
            || row.iter().any(|cell| {
                !cell.chars().all(|character| character == '.') && !web_css_identifier(cell)
            })
        {
            return None;
        }
        cells.push(row);
    }
    let columns = cells.first()?.len();
    if cells.iter().any(|row| row.len() != columns) {
        return None;
    }
    let mut bounds: HashMap<&str, (usize, usize, usize, usize)> = HashMap::new();
    for (row, columns) in cells.iter().enumerate() {
        for (column, area) in columns.iter().enumerate() {
            if area.chars().all(|character| character == '.') {
                continue;
            }
            bounds
                .entry(area)
                .and_modify(|bounds| {
                    bounds.1 = row;
                    bounds.2 = column.min(bounds.2);
                    bounds.3 = column.max(bounds.3);
                })
                .or_insert((row, row, column, column));
        }
    }
    for (area, (row_start, row_end, column_start, column_end)) in bounds {
        if (row_start..=row_end)
            .any(|row| (column_start..=column_end).any(|column| cells[row][column] != area))
        {
            return None;
        }
    }
    Some(rows.join(" "))
}

pub(super) fn web_svg_dasharray(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else {
        return None;
    };
    if value == "none" {
        return Some(value.clone());
    }
    let mut saw_length = false;
    for part in value
        .split([',', ' ', '\t', '\n', '\r'])
        .filter(|part| !part.is_empty())
    {
        if !(part.parse::<f64>().is_ok_and(f64::is_finite) || web_length_percentage_string(part))
            || part
                .trim_end_matches(|character: char| {
                    character.is_ascii_alphabetic() || character == '%'
                })
                .parse::<f64>()
                .is_ok_and(|number| number < 0.0)
        {
            return None;
        }
        saw_length = true;
    }
    saw_length.then(|| value.clone())
}

pub(super) fn web_url_or_none(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else {
        return None;
    };
    (value == "none"
        || (value.starts_with("url(")
            && value.ends_with(')')
            && !value.contains(['\n', '\r', ';', '{', '}'])))
    .then(|| value.clone())
}
