//! Order, overflow, transitions, font weight, white space and caret, lowered
//! to typed properties.

use hozo_ir::{Edge, FontWeight, Origin, Overflow, StyleProperty, TextOverflow, WhiteSpace};

use super::css_tokens::{web_components, web_longhand, web_shorthand_color};
use super::static_value::StaticValue;
use super::values::css_color;

pub(super) fn stylex_order(value: &StaticValue) -> Option<i32> {
    let value = match value {
        StaticValue::Number(value) if value.is_finite() && value.fract() == 0.0 => *value,
        StaticValue::String(value) => value
            .parse::<f64>()
            .ok()
            .filter(|value| value.fract() == 0.0)?,
        _ => return None,
    };
    (value >= i32::MIN as f64 && value <= i32::MAX as f64).then_some(value as i32)
}

pub(super) fn stylex_overflow(value: &StaticValue) -> Option<Overflow> {
    let StaticValue::String(value) = value else {
        return None;
    };
    Some(match value.as_str() {
        "visible" => Overflow::Visible,
        "hidden" => Overflow::Hidden,
        "clip" => Overflow::Css("clip"),
        "scroll" => Overflow::Scroll,
        "auto" => Overflow::Css("auto"),
        _ => return None,
    })
}

pub(super) fn stylex_scroll_edge(property: &str) -> Option<Edge> {
    Some(match property {
        "scrollMarginTop" | "scrollPaddingTop" => Edge::Top,
        "scrollMarginRight" | "scrollPaddingRight" => Edge::Right,
        "scrollMarginBottom" | "scrollPaddingBottom" => Edge::Bottom,
        "scrollMarginLeft" | "scrollPaddingLeft" => Edge::Left,
        "scrollMarginBlockStart" => Edge::Top,
        "scrollMarginBlockEnd" => Edge::Bottom,
        "scrollPaddingBlockStart" => Edge::BlockStart,
        "scrollPaddingBlockEnd" => Edge::BlockEnd,
        "scrollMarginInlineStart" | "scrollPaddingInlineStart" => Edge::InlineStart,
        "scrollMarginInlineEnd" | "scrollPaddingInlineEnd" => Edge::InlineEnd,
        _ => return None,
    })
}

pub(super) fn stylex_transition_property(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else {
        return None;
    };
    let properties: Vec<_> = value.split(',').map(str::trim).collect();
    if properties.is_empty()
        || properties.iter().any(|property| {
            !matches!(
                *property,
                "all"
                    | "none"
                    | "opacity"
                    | "transform"
                    | "translate"
                    | "scale"
                    | "rotate"
                    | "color"
                    | "background-color"
            )
        })
        || (properties.len() > 1
            && properties
                .iter()
                .any(|property| matches!(*property, "all" | "none")))
    {
        return None;
    }
    Some(properties.join(","))
}

pub(super) fn stylex_transition_duration(value: &StaticValue) -> Option<u32> {
    let StaticValue::String(value) = value else {
        return None;
    };
    let milliseconds = if let Some(value) = value.strip_suffix("ms") {
        value.parse::<f64>().ok()?
    } else {
        let value = value.strip_suffix('s')?;
        value.parse::<f64>().ok()? * 1000.0
    };
    (milliseconds.is_finite()
        && milliseconds >= 0.0
        && milliseconds.fract() == 0.0
        && milliseconds <= u32::MAX as f64)
        .then_some(milliseconds as u32)
}

pub(super) fn stylex_font_weight(value: &StaticValue) -> Option<FontWeight> {
    let weight = match value {
        StaticValue::Number(value) if value.is_finite() && value.fract() == 0.0 => *value,
        StaticValue::String(value) => match value.as_str() {
            "normal" => 400.0,
            "bold" => 700.0,
            value => value
                .parse::<f64>()
                .ok()
                .filter(|value| value.fract() == 0.0)?,
        },
        _ => return None,
    };
    ((100.0..=900.0).contains(&weight) && (weight as u16).is_multiple_of(100))
        .then_some(FontWeight::Absolute(weight as u16))
}

pub(super) fn stylex_white_space(value: &StaticValue) -> Option<WhiteSpace> {
    let StaticValue::String(value) = value else {
        return None;
    };
    Some(match value.as_str() {
        "normal" => WhiteSpace::Normal,
        "nowrap" => WhiteSpace::NoWrap,
        "pre" => WhiteSpace::Css("pre"),
        "pre-line" => WhiteSpace::Css("pre-line"),
        "pre-wrap" => WhiteSpace::Css("pre-wrap"),
        "break-spaces" => WhiteSpace::Css("break-spaces"),
        _ => return None,
    })
}

pub(super) fn stylex_text_overflow(value: &StaticValue) -> Option<TextOverflow> {
    let StaticValue::String(value) = value else {
        return None;
    };
    Some(match value.as_str() {
        "clip" => TextOverflow::Clip,
        "ellipsis" => TextOverflow::Ellipsis,
        _ => return None,
    })
}

pub(super) fn stylex_transition_timing(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else {
        return None;
    };
    matches!(
        value.as_str(),
        "linear" | "ease-in" | "ease-out" | "ease-in-out"
    )
    .then(|| value.clone())
}

/// Lower the practical single-transition shorthand into the same four slots
/// the browser shorthand resets. Comma-separated transition lists and timing
/// functions outside the Native runtime stay with the official StyleX pass.
pub(super) fn stylex_transition(value: &StaticValue) -> Option<Vec<StyleProperty>> {
    let StaticValue::String(value) = value else {
        return None;
    };
    if value.contains(',') {
        return None;
    }
    let components = web_components(value)?;
    let mut property = None;
    let mut duration = None;
    let mut delay = None;
    let mut timing = None;
    for component in components {
        let static_value = StaticValue::String(component.clone());
        if let Some(milliseconds) = stylex_transition_duration(&static_value) {
            if duration.is_none() {
                duration = Some(milliseconds);
            } else if delay.is_none() {
                delay = Some(milliseconds);
            } else {
                return None;
            }
        } else if timing.is_none() && stylex_transition_timing(&static_value).is_some() {
            timing = Some(component);
        } else if property.is_none() && stylex_transition_property(&static_value).is_some() {
            property = Some(component);
        } else {
            return None;
        }
    }
    // CSS defaults to `ease`, which the deliberately small Native easing
    // contract does not approximate. Require an explicit supported easing.
    Some(vec![
        StyleProperty::TransitionProperty(property.unwrap_or_else(|| "all".to_string())),
        StyleProperty::TransitionDuration(duration.unwrap_or(0), Origin::Written),
        StyleProperty::TransitionTimingFunction(timing?, Origin::Written),
        StyleProperty::TransitionDelay(delay.unwrap_or(0), Origin::Written),
    ])
}

pub(super) fn stylex_caret(value: &StaticValue) -> Option<Vec<StyleProperty>> {
    let StaticValue::String(value) = value else {
        return None;
    };
    let components = web_components(value)?;
    if components.len() > 2 {
        return None;
    }
    let shapes = ["bar", "block", "underscore"];
    let mut color = None;
    let mut shape = None;
    let mut autos = 0;
    for component in components {
        if component == "auto" {
            autos += 1;
        } else if shapes.contains(&component.as_str()) && shape.is_none() {
            shape = Some(component);
        } else if web_shorthand_color(&component) && color.is_none() {
            color = Some(component);
        } else {
            return None;
        }
    }
    if autos > usize::from(color.is_some()) + usize::from(shape.is_some()) + 1 {
        return None;
    }
    let color = match color {
        Some(value) => StyleProperty::CaretColor(css_color(&StaticValue::String(value))?),
        None => web_longhand("caret-color", "auto"),
    };
    Some(vec![
        color,
        web_longhand("caret-shape", shape.unwrap_or_else(|| "auto".to_string())),
    ])
}
