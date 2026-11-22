//! `filter` and `backdrop-filter` function lists.

use hozo_ir::{FilterFunction, StyleProperty};

use super::static_value::StaticValue;
use super::web_functions::minified_css_number;

pub(super) fn supported_filter_list(value: &str) -> bool {
    let mut rest = value.trim();
    while !rest.is_empty() {
        let Some(open) = rest.find('(') else {
            return false;
        };
        let name = rest[..open].trim();
        if !matches!(
            name,
            "blur"
                | "brightness"
                | "contrast"
                | "drop-shadow"
                | "grayscale"
                | "hue-rotate"
                | "invert"
                | "opacity"
                | "saturate"
                | "sepia"
        ) {
            return false;
        }
        let mut depth = 0_u32;
        let mut close = None;
        for (index, character) in rest[open..].char_indices() {
            match character {
                '(' => depth += 1,
                ')' => {
                    depth -= 1;
                    if depth == 0 {
                        close = Some(open + index + 1);
                        break;
                    }
                }
                _ => {}
            }
        }
        let Some(close) = close else { return false };
        rest = rest[close..].trim_start();
    }
    true
}

/// The portable part of CSS backdrop-filter that a Native blur component can
/// represent. Wider filter chains remain in the official StyleX residual.
pub(super) fn stylex_backdrop_filter(value: &StaticValue) -> Option<Vec<StyleProperty>> {
    let StaticValue::String(value) = value else {
        return None;
    };
    let value = value.trim();
    if value == "none" {
        return Some(vec![StyleProperty::BackdropFilter(
            FilterFunction::None,
            "none".to_string(),
        )]);
    }
    let radius = value.strip_prefix("blur(")?.strip_suffix(')')?.trim();
    let radius = if radius == "0" {
        0.0
    } else {
        radius.strip_suffix("px")?.trim().parse::<f64>().ok()?
    };
    if !radius.is_finite() || radius < 0.0 {
        return None;
    }
    Some(vec![StyleProperty::BackdropFilter(
        FilterFunction::Blur,
        format!("blur({}px)", minified_css_number(radius)),
    )])
}
