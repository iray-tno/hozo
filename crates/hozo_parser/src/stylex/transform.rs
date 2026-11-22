//! Transforms and their origin, plus the arbitrary-value and named-keyword
//! guards the other lowerings share.

use hozo_ir::{Angle, Dimension, Scale, TransformFunction};

use super::static_value::StaticValue;
use super::values::{dimension, px_length};

pub(super) fn transform_angle(value: &str) -> Option<Angle> {
    if value == "0" {
        return Some(Angle::Deg(0.0));
    }
    value
        .strip_suffix("deg")
        .and_then(|value| value.parse::<f64>().ok())
        .filter(|value| value.is_finite())
        .map(Angle::Deg)
}

pub(super) fn transform_dimension(value: &str) -> Option<Dimension> {
    match dimension(&StaticValue::String(value.to_string()))? {
        value @ (Dimension::Length(_) | Dimension::Percent(_)) => Some(value),
        _ => None,
    }
}

pub(super) fn stylex_rotate(value: &StaticValue) -> Option<Angle> {
    let StaticValue::String(value) = value else {
        return None;
    };
    value
        .ends_with("deg")
        .then(|| transform_angle(value))
        .flatten()
}

pub(super) fn stylex_scale_component(value: &str) -> Option<Scale> {
    if let Some(value) = value.strip_suffix('%') {
        let value = value.parse::<f64>().ok()?;
        return value.is_finite().then_some(Scale::Percent(value));
    }
    let value = value.parse::<f64>().ok()?;
    value.is_finite().then_some(Scale::Ratio(value))
}

pub(super) fn stylex_scale(value: &StaticValue) -> Option<Vec<Scale>> {
    match value {
        StaticValue::Number(value) if value.is_finite() => Some(vec![Scale::Ratio(*value)]),
        StaticValue::String(value) => {
            let values: Vec<_> = value
                .split_whitespace()
                .map(stylex_scale_component)
                .collect();
            ((1..=3).contains(&values.len()) && values.iter().all(Option::is_some))
                .then(|| values.into_iter().flatten().collect())
        }
        _ => None,
    }
}

pub(super) fn stylex_translate(value: &StaticValue) -> Option<Vec<Dimension>> {
    match value {
        StaticValue::Number(_) => Some(vec![dimension(value)?]),
        StaticValue::String(value) => {
            let values: Vec<_> = value.split_whitespace().map(transform_dimension).collect();
            ((1..=2).contains(&values.len()) && values.iter().all(Option::is_some))
                .then(|| values.into_iter().flatten().collect())
        }
    }
}

pub(super) fn transform_arguments(value: &str) -> Vec<&str> {
    if value.contains(',') {
        value
            .split(',')
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .collect()
    } else {
        value.split_whitespace().collect()
    }
}

/// Parse only functions React Native's public transform array can represent.
pub(super) fn transform_functions(value: &StaticValue) -> Option<Vec<TransformFunction>> {
    let StaticValue::String(value) = value else {
        return None;
    };
    let mut rest = value.trim();
    if rest == "none" {
        return Some(Vec::new());
    }
    let mut functions = Vec::new();
    while !rest.is_empty() {
        let open = rest.find('(')?;
        let name = rest[..open].trim();
        if name.is_empty()
            || !name
                .chars()
                .all(|character| character.is_ascii_alphanumeric())
        {
            return None;
        }
        let tail = &rest[open + 1..];
        let close = tail.find(')')?;
        if tail[..close].contains('(') {
            return None;
        }
        let arguments = transform_arguments(tail[..close].trim());
        let number = |value: &str| value.parse::<f64>().ok().filter(|value| value.is_finite());
        let one = || (arguments.len() == 1).then_some(arguments[0]);
        match name {
            "perspective" => functions.push(TransformFunction::Perspective(px_length(
                &StaticValue::String(one()?.to_string()),
            )?)),
            "rotate" => functions.push(TransformFunction::Rotate(transform_angle(one()?)?)),
            "rotateX" => functions.push(TransformFunction::RotateX(transform_angle(one()?)?)),
            "rotateY" => functions.push(TransformFunction::RotateY(transform_angle(one()?)?)),
            "rotateZ" => functions.push(TransformFunction::RotateZ(transform_angle(one()?)?)),
            "scale" if arguments.len() == 1 => {
                functions.push(TransformFunction::Scale(number(arguments[0])?))
            }
            "scale" if arguments.len() == 2 => {
                functions.push(TransformFunction::ScaleX(number(arguments[0])?));
                functions.push(TransformFunction::ScaleY(number(arguments[1])?));
            }
            "scaleX" => functions.push(TransformFunction::ScaleX(number(one()?)?)),
            "scaleY" => functions.push(TransformFunction::ScaleY(number(one()?)?)),
            "translate" if arguments.len() == 1 || arguments.len() == 2 => {
                functions.push(TransformFunction::TranslateX(transform_dimension(
                    arguments[0],
                )?));
                if arguments.len() == 2 {
                    functions.push(TransformFunction::TranslateY(transform_dimension(
                        arguments[1],
                    )?));
                }
            }
            "translateX" => {
                functions.push(TransformFunction::TranslateX(transform_dimension(one()?)?))
            }
            "translateY" => {
                functions.push(TransformFunction::TranslateY(transform_dimension(one()?)?))
            }
            "skewX" => functions.push(TransformFunction::SkewX(transform_angle(one()?)?)),
            "skewY" => functions.push(TransformFunction::SkewY(transform_angle(one()?)?)),
            _ => return None,
        }
        rest = tail[close + 1..].trim_start();
    }
    (!functions.is_empty()).then_some(functions)
}

pub(super) fn transform_origin(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else {
        return None;
    };
    let parts: Vec<_> = value.split_whitespace().collect();
    if !(1..=3).contains(&parts.len()) {
        return None;
    }
    let valid = |part: &str| {
        matches!(part, "left" | "center" | "right" | "top" | "bottom")
            || transform_dimension(part).is_some()
    };
    parts
        .iter()
        .all(|part| valid(part))
        .then(|| parts.join(" "))
}

/// Variables, fallbacks, and values needing escaping belong with the later
/// defineVars/theme slice. Refusing them is safer than lossy underscore
/// encoding that merely looks supported.
pub(super) fn safe_arbitrary(value: String) -> Option<String> {
    (!value.is_empty()
        && !value.chars().any(char::is_whitespace)
        && !value.contains(['[', ']'])
        && !value.contains("var(")
        && !value.contains("env("))
    .then_some(value)
}

pub(super) fn named(value: &StaticValue, choices: &[(&str, &str)]) -> Option<String> {
    let StaticValue::String(value) = value else {
        return None;
    };
    choices
        .iter()
        .find(|(name, _)| *name == value)
        .map(|(_, token)| (*token).to_string())
}
