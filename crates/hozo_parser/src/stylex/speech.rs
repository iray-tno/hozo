//! Legacy motion, aural and paged-media properties that StyleX still accepts.

use hozo_ir::StyleProperty;

use super::css_tokens::{web_css_identifier, web_css_string, web_longhand};
use super::offset::{web_offset_path, web_offset_rotate};
use super::static_value::StaticValue;
use super::values::length_value;
use super::web_grid::web_url_or_none;
use super::web_length::web_length_percentage;
use super::web_values::web_angle;

pub(super) fn stylex_legacy_motion(
    property: &'static str,
    value: &StaticValue,
) -> Option<StyleProperty> {
    let css_value = match property {
        "motion-path" => web_offset_path(value)?,
        "motion-offset" => web_length_percentage(value).then(|| length_value(value))?,
        "motion-rotation" => match value {
            StaticValue::Number(number) if number.is_finite() => length_value(value),
            value => web_offset_rotate(value)?,
        },
        "motion" => match value {
            StaticValue::Number(number) if number.is_finite() => length_value(value),
            StaticValue::Number(_) => return None,
            StaticValue::String(_) => web_offset_path(value)
                .or_else(|| web_length_percentage(value).then(|| length_value(value)))
                .or_else(|| web_offset_rotate(value))?,
        },
        _ => return None,
    };
    Some(web_longhand(property, css_value))
}

pub(super) fn stylex_speech_cue(
    property: &'static str,
    value: &StaticValue,
) -> Option<StyleProperty> {
    let value = web_url_or_none(value)?;
    Some(web_longhand(property, value))
}

pub(super) fn stylex_speech_pause(
    property: &'static str,
    value: &StaticValue,
) -> Option<StyleProperty> {
    const STRENGTHS: &[&str] = &["none", "x-weak", "weak", "medium", "strong", "x-strong"];
    let value = match value {
        StaticValue::Number(number) if number.is_finite() && *number >= 0.0 => length_value(value),
        StaticValue::String(value) if STRENGTHS.contains(&value.as_str()) => value.clone(),
        _ => return None,
    };
    Some(web_longhand(property, value))
}

pub(super) fn web_number_with_unit(
    value: &str,
    unit: &str,
    minimum: f64,
    maximum: f64,
) -> Option<String> {
    let number = value.strip_suffix(unit)?.parse::<f64>().ok()?;
    (number.is_finite() && number >= minimum && number <= maximum).then(|| value.to_string())
}

pub(super) fn stylex_azimuth(value: &StaticValue) -> Option<StyleProperty> {
    const KEYWORDS: &[&str] = &[
        "left-side",
        "far-left",
        "left",
        "center-left",
        "center",
        "center-right",
        "right",
        "far-right",
        "right-side",
        "behind",
    ];
    let StaticValue::String(value) = value else {
        return None;
    };
    let value = if KEYWORDS.contains(&value.as_str()) {
        value.clone()
    } else if let Some(value) = web_angle(&StaticValue::String(value.clone()), &[]) {
        value
    } else {
        let parts = value.split_ascii_whitespace().collect::<Vec<_>>();
        let ["behind", direction] = parts.as_slice() else {
            return None;
        };
        matches!(
            *direction,
            "far-left" | "left" | "center-left" | "center-right" | "right" | "far-right"
        )
        .then(|| value.clone())?
    };
    Some(web_longhand("azimuth", value))
}

pub(super) fn stylex_voice_value(
    property: &'static str,
    value: &StaticValue,
) -> Option<StyleProperty> {
    let StaticValue::String(value) = value else {
        return None;
    };
    let exact = match property {
        "voice-balance" => matches!(
            value.as_str(),
            "left" | "center" | "right" | "leftwards" | "rightwards"
        )
        .then(|| value.clone())
        .or_else(|| web_number_with_unit(value, "%", -100.0, 100.0)),
        "voice-family" => (matches!(value.as_str(), "male" | "female" | "child")
            || web_css_identifier(value)
            || web_css_string(value))
        .then(|| value.clone()),
        "voice-pitch" | "voice-range" => matches!(
            value.as_str(),
            "x-low" | "low" | "medium" | "high" | "x-high"
        )
        .then(|| value.clone())
        .or_else(|| web_number_with_unit(value, "Hz", 0.0, f64::INFINITY))
        .or_else(|| web_number_with_unit(value, "kHz", 0.0, f64::INFINITY))
        .or_else(|| web_number_with_unit(value, "st", f64::NEG_INFINITY, f64::INFINITY)),
        "voice-rate" => matches!(
            value.as_str(),
            "x-slow" | "slow" | "medium" | "fast" | "x-fast"
        )
        .then(|| value.clone())
        .or_else(|| web_number_with_unit(value, "%", 0.0, f64::INFINITY)),
        "voice-volume" => matches!(
            value.as_str(),
            "silent" | "x-soft" | "soft" | "medium" | "loud" | "x-loud"
        )
        .then(|| value.clone())
        .or_else(|| web_number_with_unit(value, "%", 0.0, f64::INFINITY))
        .or_else(|| web_number_with_unit(value, "dB", f64::NEG_INFINITY, f64::INFINITY)),
        _ => None,
    }?;
    Some(web_longhand(property, exact))
}

pub(super) fn stylex_page(value: &StaticValue) -> Option<StyleProperty> {
    let StaticValue::String(value) = value else {
        return None;
    };
    web_css_identifier(value).then(|| web_longhand("page", value.clone()))
}
