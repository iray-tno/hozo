//! Grid tracks, lines, spans, areas and templates, lowered to typed properties.

use hozo_ir::{GridLine, GridSpan, GridTracks, StyleProperty};

use super::css_tokens::web_longhand;
use super::static_value::StaticValue;

pub(super) fn normalize_stylex_grid_value(value: &str) -> String {
    let value = value.trim();
    // StyleX removes whitespace around commas inside functions but keeps
    // whitespace between tracks. Match that CSS while accepting the usual
    // authored spelling (`minmax(120px, 2fr) 1fr`).
    let mut normalized = String::new();
    let characters = value.chars().collect::<Vec<_>>();
    let mut index = 0;
    while index < characters.len() {
        let character = characters[index];
        if character.is_whitespace() {
            let previous = normalized.chars().next_back();
            let next = characters[index + 1..]
                .iter()
                .copied()
                .find(|character| !character.is_whitespace());
            if !matches!(previous, Some('(' | ','))
                && !matches!(next, Some(')' | ','))
                && !normalized.ends_with(' ')
            {
                normalized.push(' ');
            }
            index += 1;
            continue;
        }
        normalized.push(character);
        index += 1;
    }
    normalized
}

pub(super) fn normalize_stylex_number_zeros(value: &str) -> String {
    let characters = value.chars().collect::<Vec<_>>();
    let mut normalized = String::new();
    for (index, character) in characters.iter().copied().enumerate() {
        if character == '0'
            && characters.get(index + 1) == Some(&'.')
            && index
                .checked_sub(1)
                .and_then(|previous| characters.get(previous))
                .is_none_or(|previous| !previous.is_ascii_digit() && *previous != '.')
        {
            continue;
        }
        normalized.push(character);
    }
    normalized
}

pub(super) fn stylex_grid_tracks(value: &StaticValue) -> Option<GridTracks> {
    let StaticValue::String(value) = value else {
        return None;
    };
    let compact = value
        .chars()
        .filter(|character| !character.is_whitespace())
        .collect::<String>();
    if let Some(inner) = compact
        .strip_prefix("repeat(")
        .and_then(|value| value.strip_suffix(",minmax(0,1fr))"))
    {
        let count = inner.parse::<u32>().ok()?;
        return (count > 0).then(|| GridTracks::Css(format!("repeat({count},minmax(0,1fr))")));
    }

    let normalized = normalize_stylex_grid_value(value);
    let valid = normalized.split_whitespace().all(|track| {
        if let Some(inner) = track
            .strip_prefix("minmax(")
            .and_then(|value| value.strip_suffix(')'))
        {
            let Some((min, max)) = inner.split_once(',') else {
                return false;
            };
            let Some(min) = min
                .strip_suffix("px")
                .and_then(|value| value.parse::<f64>().ok())
            else {
                return false;
            };
            let Some(fr) = max
                .strip_suffix("fr")
                .and_then(|value| value.parse::<f64>().ok())
            else {
                return false;
            };
            return min.is_finite() && min >= 0.0 && fr.is_finite() && fr > 0.0;
        }
        if let Some(fr) = track
            .strip_suffix("fr")
            .and_then(|value| value.parse::<f64>().ok())
        {
            return fr.is_finite() && fr > 0.0;
        }
        if let Some(points) = track
            .strip_suffix("px")
            .and_then(|value| value.parse::<f64>().ok())
        {
            return points.is_finite() && points >= 0.0;
        }
        false
    });
    (valid && !normalized.is_empty()).then_some(GridTracks::Css(normalized))
}

pub(super) fn stylex_grid_line(value: &StaticValue) -> Option<GridLine> {
    match value {
        StaticValue::String(value) if value.trim() == "auto" => Some(GridLine::Auto),
        StaticValue::String(value) => value
            .trim()
            .parse::<i32>()
            .ok()
            .filter(|line| *line != 0)
            .map(GridLine::Line),
        StaticValue::Number(value)
            if value.is_finite()
                && value.fract() == 0.0
                && *value >= i32::MIN as f64
                && *value <= i32::MAX as f64
                && *value != 0.0 =>
        {
            Some(GridLine::Line(*value as i32))
        }
        _ => None,
    }
}

pub(super) fn stylex_grid_span(value: &StaticValue) -> Option<GridSpan> {
    let StaticValue::String(value) = value else {
        return None;
    };
    let value = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if value == "auto" {
        return Some(GridSpan::Auto);
    }
    if value == "1 / -1" {
        return Some(GridSpan::Full);
    }
    let (start, end) = value.split_once(" / ")?;
    let start = start.strip_prefix("span ")?.parse::<u32>().ok()?;
    let end = end.strip_prefix("span ")?.parse::<u32>().ok()?;
    (start > 0 && start == end).then_some(GridSpan::Span(start))
}

pub(super) fn stylex_grid_area(value: &StaticValue) -> Option<Vec<StyleProperty>> {
    let StaticValue::String(value) = value else {
        return None;
    };
    let parts = value.split('/').map(str::trim).collect::<Vec<_>>();
    let [row_start, column_start, row_end, column_end] = parts.as_slice() else {
        return None;
    };
    let line = |value: &str| stylex_grid_line(&StaticValue::String(value.to_string()));
    Some(vec![
        StyleProperty::GridRowStart(line(row_start)?),
        StyleProperty::GridColumnStart(line(column_start)?),
        StyleProperty::GridRowEnd(line(row_end)?),
        StyleProperty::GridColumnEnd(line(column_end)?),
    ])
}

pub(super) fn stylex_grid_template(value: &StaticValue) -> Option<Vec<StyleProperty>> {
    let StaticValue::String(value) = value else {
        return None;
    };
    let (rows, columns) = value.split_once('/')?;
    if columns.contains('/') {
        return None;
    }
    let rows = stylex_grid_tracks(&StaticValue::String(rows.trim().to_string()))?;
    let columns = stylex_grid_tracks(&StaticValue::String(columns.trim().to_string()))?;
    Some(vec![
        StyleProperty::GridTemplateRows(rows),
        StyleProperty::GridTemplateColumns(columns),
    ])
}

pub(super) fn stylex_grid(value: &StaticValue) -> Option<Vec<StyleProperty>> {
    let mut properties = stylex_grid_template(value)?;
    properties.extend([
        web_longhand("grid-template-areas", "none"),
        web_longhand("grid-auto-rows", "auto"),
        web_longhand("grid-auto-columns", "auto"),
        web_longhand("grid-auto-flow", "row"),
    ]);
    Some(properties)
}
