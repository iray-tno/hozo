//! Lengths, colors, containers, flex flow, gaps and borders, lowered to the
//! typed properties both platforms share.

use hozo_ir::{BorderStyle, Color, Dimension, FlexDirection, Length, StyleProperty};

use super::css_tokens::{web_components, web_longhand};
use super::static_value::{numeric_text, raw_value, StaticValue};

pub(super) fn length_value(value: &StaticValue) -> String {
    match value {
        StaticValue::String(value) => value.clone(),
        StaticValue::Number(value) => format!("{}px", numeric_text(*value)),
    }
}

pub(super) fn px_length(value: &StaticValue) -> Option<Length> {
    match value {
        StaticValue::Number(value) => Some(Length::Px(*value)),
        StaticValue::String(value) if value == "0" => Some(Length::Px(0.0)),
        StaticValue::String(value) => value
            .strip_suffix("px")
            .and_then(|value| value.parse::<f64>().ok())
            .map(Length::Px),
    }
}

pub(super) fn dimension(value: &StaticValue) -> Option<Dimension> {
    match value {
        StaticValue::Number(value) => Some(Dimension::Length(Length::Px(*value))),
        StaticValue::String(value) if value == "auto" => Some(Dimension::Auto),
        StaticValue::String(value) => value
            .strip_suffix('%')
            .and_then(|value| value.parse::<f64>().ok())
            .map(Dimension::Percent)
            .or_else(|| {
                if value == "0" {
                    return Some(Dimension::Length(Length::Px(0.0)));
                }
                value
                    .strip_suffix("px")
                    .and_then(|value| value.parse::<f64>().ok())
                    .map(|value| Dimension::Length(Length::Px(value)))
            }),
    }
}

pub(super) fn css_color(value: &StaticValue) -> Option<Color> {
    let StaticValue::String(value) = value else {
        return None;
    };
    (!value.is_empty() && !value.contains("var(") && !value.contains("env("))
        .then(|| Color::Css(value.clone()))
}

/// One container name the Native runtime can register under its context.
///
/// CSS accepts a whitespace-separated list of custom identifiers, but the
/// existing Hozo container runtime deliberately has one lookup key. Keep a
/// wider StyleX value with the official transform rather than registering a
/// string no Native query could faithfully address.
pub(super) fn stylex_container_name(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else {
        return None;
    };
    let mut bytes = value.bytes();
    match bytes.next()? {
        first if first.is_ascii_alphabetic() || first == b'_' => {}
        b'-' => {
            let second = bytes.next()?;
            if !second.is_ascii_alphabetic() && !matches!(second, b'_' | b'-') {
                return None;
            }
        }
        _ => return None,
    }
    let reserved = value.to_ascii_lowercase();
    if !bytes.all(|character| character.is_ascii_alphanumeric() || matches!(character, b'_' | b'-'))
        || matches!(
            reserved.as_str(),
            "none" | "default" | "initial" | "inherit" | "unset" | "revert" | "revert-layer"
        )
    {
        return None;
    }
    Some(value.clone())
}

pub(super) fn stylex_container_type(value: &StaticValue) -> Option<&'static str> {
    let StaticValue::String(value) = value else {
        return None;
    };
    match value.as_str() {
        "normal" => Some("normal"),
        "size" => Some("size"),
        "inline-size" => Some("inline-size"),
        _ => None,
    }
}

pub(super) fn stylex_container(value: &StaticValue) -> Option<Vec<StyleProperty>> {
    let StaticValue::String(value) = value else {
        return None;
    };
    let mut parts = value.split('/');
    let name = parts.next()?.trim();
    let kind = parts.next().map(str::trim).unwrap_or("normal");
    if parts.next().is_some() || name.is_empty() || kind.is_empty() {
        return None;
    }
    let name = stylex_container_name(&StaticValue::String(name.to_string()))?;
    let kind = stylex_container_type(&StaticValue::String(kind.to_string()))?;
    Some(vec![
        StyleProperty::ContainerName(name),
        StyleProperty::Keyword("container-type", kind),
    ])
}

pub(super) fn stylex_flex_flow(value: &StaticValue) -> Option<Vec<StyleProperty>> {
    let StaticValue::String(value) = value else {
        return None;
    };
    let parts = web_components(value)?;
    if !(1..=2).contains(&parts.len()) {
        return None;
    }
    let mut direction = None;
    let mut wrap = None;
    for part in parts {
        match part.as_str() {
            "row" if direction.is_none() => direction = Some(FlexDirection::Row),
            "row-reverse" => {
                if direction.is_some() {
                    return None;
                }
                direction = Some(FlexDirection::RowReverse);
            }
            "column" if direction.is_none() => direction = Some(FlexDirection::Column),
            "column-reverse" => {
                if direction.is_some() {
                    return None;
                }
                direction = Some(FlexDirection::ColumnReverse);
            }
            "nowrap" | "wrap" | "wrap-reverse" if wrap.is_none() => {
                wrap = Some(match part.as_str() {
                    "nowrap" => "nowrap",
                    "wrap" => "wrap",
                    _ => "wrap-reverse",
                });
            }
            _ => return None,
        }
    }
    Some(vec![
        StyleProperty::FlexDirection(direction.unwrap_or(FlexDirection::Row)),
        StyleProperty::Keyword("flex-wrap", wrap.unwrap_or("nowrap")),
    ])
}

pub(super) fn stylex_gap(value: &StaticValue) -> Option<Vec<StyleProperty>> {
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
    let values = parts.iter().map(px_length).collect::<Option<Vec<_>>>()?;
    if values
        .iter()
        .any(|value| !matches!(value, Length::Px(number) if number.is_finite() && *number >= 0.0))
    {
        return None;
    }
    let row = Dimension::Length(values[0].clone());
    let column = Dimension::Length(values.get(1).unwrap_or(&values[0]).clone());
    Some(vec![
        StyleProperty::RowGap(row),
        StyleProperty::ColumnGap(column),
    ])
}

pub(super) fn stylex_border_style(value: &StaticValue) -> Option<BorderStyle> {
    let StaticValue::String(value) = value else {
        return None;
    };
    match value.as_str() {
        "solid" => Some(BorderStyle::Solid),
        "dashed" => Some(BorderStyle::Dashed),
        "dotted" => Some(BorderStyle::Dotted),
        "double" => Some(BorderStyle::Double),
        "hidden" => Some(BorderStyle::Hidden),
        "none" => Some(BorderStyle::None),
        _ => None,
    }
}

pub(super) fn stylex_web_border_style(
    property: &str,
    value: &StaticValue,
) -> Option<StyleProperty> {
    stylex_border_style(value)?;
    Some(web_longhand(property, raw_value(value)))
}

pub(super) fn stylex_border_width(value: &StaticValue) -> Option<Length> {
    let value = px_length(value)?;
    matches!(&value, Length::Px(number) if number.is_finite() && *number >= 0.0).then_some(value)
}

pub(super) fn stylex_legacy_box_number(
    property: &'static str,
    value: &StaticValue,
    minimum: f64,
    integer: bool,
) -> Option<StyleProperty> {
    let number = match value {
        StaticValue::Number(number) => *number,
        StaticValue::String(number) => number.parse::<f64>().ok()?,
    };
    if !number.is_finite() || number < minimum || integer && number.fract() != 0.0 {
        return None;
    }
    let css_value = match value {
        // StyleX 0.19 classifies these legacy numeric properties as lengths
        // and appends px. Mirror the oracle, odd as that historical result is.
        StaticValue::Number(_) => format!("{}px", numeric_text(number)),
        StaticValue::String(value) => value.clone(),
    };
    Some(web_longhand(property, css_value))
}
