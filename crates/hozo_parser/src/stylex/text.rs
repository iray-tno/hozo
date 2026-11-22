//! The font shorthand, font settings and variants, and text emphasis.

use hozo_ir::StyleProperty;

use super::css_tokens::{
    web_comma_groups, web_components, web_css_identifier, web_css_string, web_longhand,
};
use super::mask::web_top_level_tokens;
use super::static_value::{numeric_text, StaticValue};
use super::web_length::{web_length_number, web_length_percentage_string, web_length_string};

/// Validate the common single-family font shorthand while retaining the CSS
/// shorthand's full reset behavior. Variant, stretch, family lists, system
/// fonts, and open-ended relative syntax stay with the official transform.
pub(super) fn stylex_font(value: &StaticValue) -> Option<Vec<StyleProperty>> {
    let StaticValue::String(value) = value else {
        return None;
    };
    let value = value.trim();
    let tokens = web_top_level_tokens(value, true)?;
    let size_at = tokens.iter().position(|token| {
        matches!(
            token.as_str(),
            "xx-small"
                | "x-small"
                | "small"
                | "medium"
                | "large"
                | "x-large"
                | "xx-large"
                | "xxx-large"
        ) || web_length_percentage_string(token)
            && web_length_number(token).is_some_and(|number| number > 0.0)
    })?;
    if size_at > 2 {
        return None;
    }
    let mut style = false;
    let mut weight = false;
    for token in &tokens[..size_at] {
        if !style && matches!(token.as_str(), "normal" | "italic") {
            style = true;
        } else if !weight
            && (matches!(token.as_str(), "normal" | "bold" | "bolder" | "lighter")
                || token
                    .parse::<u16>()
                    .is_ok_and(|number| (100..=900).contains(&number) && number % 100 == 0))
        {
            weight = true;
        } else {
            return None;
        }
    }
    let tail = &tokens[size_at + 1..];
    let family = match tail {
        [family] => family,
        [slash, line_height, family] if slash == "/" => {
            let valid_line_height = line_height == "normal"
                || line_height
                    .parse::<f64>()
                    .is_ok_and(|number| number.is_finite() && number >= 0.0)
                || web_length_percentage_string(line_height)
                    && web_length_number(line_height).is_some_and(|number| number >= 0.0);
            if !valid_line_height {
                return None;
            }
            family
        }
        _ => return None,
    };
    if !web_css_identifier(family) && !web_css_string(family) {
        return None;
    }
    Some(vec![web_longhand("font", value)])
}

pub(super) fn web_font_setting(value: &StaticValue, variation: bool) -> Option<String> {
    let StaticValue::String(value) = value else {
        return None;
    };
    if value == "normal" {
        return Some(value.clone());
    }
    for group in web_comma_groups(value)? {
        let parts = web_components(group)?;
        if parts.is_empty() || parts.len() > 2 || !web_css_string(&parts[0]) {
            return None;
        }
        let tag = &parts[0][1..parts[0].len() - 1];
        if tag.len() != 4 || !tag.bytes().all(|byte| (0x20..=0x7e).contains(&byte)) {
            return None;
        }
        let Some(setting) = parts.get(1) else {
            if variation {
                return None;
            }
            continue;
        };
        if variation {
            if !setting.parse::<f64>().is_ok_and(f64::is_finite) {
                return None;
            }
        } else if !matches!(setting.as_str(), "on" | "off") && setting.parse::<u64>().is_err() {
            return None;
        }
    }
    Some(value.clone())
}

pub(super) fn web_font_synthesis(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else {
        return None;
    };
    if value == "none" {
        return Some(value.clone());
    }
    let parts = value.split_ascii_whitespace().collect::<Vec<_>>();
    let allowed = ["weight", "style", "small-caps", "position"];
    (!parts.is_empty()
        && parts.iter().all(|part| allowed.contains(part))
        && parts
            .iter()
            .enumerate()
            .all(|(index, part)| !parts[..index].contains(part)))
    .then(|| value.clone())
}

pub(super) fn web_font_variant_alternates(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else {
        return None;
    };
    if matches!(value.as_str(), "normal" | "historical-forms") {
        return Some(value.clone());
    }
    let parts = web_components(value)?;
    let mut kinds = Vec::new();
    for part in &parts {
        let open = part.find('(')?;
        let kind = &part[..open];
        let inner = part[open + 1..].strip_suffix(')')?;
        if !matches!(
            kind,
            "stylistic" | "styleset" | "character-variant" | "swash" | "ornaments" | "annotation"
        ) || kinds.contains(&kind)
        {
            return None;
        }
        let names = inner.split(',').map(str::trim).collect::<Vec<_>>();
        if names.is_empty()
            || names.iter().any(|name| !web_css_identifier(name))
            || (!matches!(kind, "styleset" | "character-variant") && names.len() != 1)
        {
            return None;
        }
        kinds.push(kind);
    }
    Some(value.clone())
}

pub(super) fn web_font_variant_east_asian(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else {
        return None;
    };
    if value == "normal" {
        return Some(value.clone());
    }
    let parts = value.split_ascii_whitespace().collect::<Vec<_>>();
    let variants = [
        "jis78",
        "jis83",
        "jis90",
        "jis04",
        "simplified",
        "traditional",
    ];
    let widths = ["full-width", "proportional-width"];
    let variant_count = parts.iter().filter(|part| variants.contains(part)).count();
    let width_count = parts.iter().filter(|part| widths.contains(part)).count();
    (!parts.is_empty()
        && parts
            .iter()
            .all(|part| variants.contains(part) || widths.contains(part) || *part == "ruby")
        && variant_count <= 1
        && width_count <= 1
        && parts.iter().filter(|part| **part == "ruby").count() <= 1)
        .then(|| value.clone())
}

pub(super) fn web_hanging_punctuation(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else {
        return None;
    };
    if value == "none" {
        return Some(value.clone());
    }
    let parts = value.split_ascii_whitespace().collect::<Vec<_>>();
    let allowed = ["first", "force-end", "allow-end", "last"];
    (!parts.is_empty()
        && parts.iter().all(|part| allowed.contains(part))
        && parts
            .iter()
            .enumerate()
            .all(|(index, part)| !parts[..index].contains(part))
        && !(parts.contains(&"force-end") && parts.contains(&"allow-end")))
    .then(|| value.clone())
}

pub(super) fn web_tab_size(value: &StaticValue) -> Option<String> {
    match value {
        StaticValue::Number(value) if value.is_finite() && *value >= 0.0 => {
            Some(numeric_text(*value))
        }
        StaticValue::String(value)
            if value
                .parse::<f64>()
                .is_ok_and(|number| number.is_finite() && number >= 0.0) =>
        {
            Some(value.clone())
        }
        StaticValue::String(value)
            if web_length_string(value)
                && web_length_number(value).is_some_and(|number| number >= 0.0) =>
        {
            Some(value.clone())
        }
        _ => None,
    }
}

pub(super) fn web_text_combine_upright(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else {
        return None;
    };
    if matches!(value.as_str(), "none" | "all") {
        return Some(value.clone());
    }
    value
        .strip_prefix("digits ")
        .is_some_and(|count| matches!(count, "2" | "3" | "4"))
        .then(|| value.clone())
}

pub(super) fn web_text_emphasis_style(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else {
        return None;
    };
    if value == "none" || web_css_string(value) {
        return Some(value.clone());
    }
    let parts = value.split_ascii_whitespace().collect::<Vec<_>>();
    let fills = ["filled", "open"];
    let shapes = ["dot", "circle", "double-circle", "triangle", "sesame"];
    (!parts.is_empty()
        && parts
            .iter()
            .all(|part| fills.contains(part) || shapes.contains(part))
        && parts.iter().filter(|part| fills.contains(part)).count() <= 1
        && parts.iter().filter(|part| shapes.contains(part)).count() <= 1)
        .then(|| value.clone())
}

pub(super) fn portable_font_variant(value: &str) -> Option<&'static str> {
    const VALUES: &[&str] = &[
        "small-caps",
        "oldstyle-nums",
        "lining-nums",
        "tabular-nums",
        "common-ligatures",
        "no-common-ligatures",
        "discretionary-ligatures",
        "no-discretionary-ligatures",
        "historical-ligatures",
        "no-historical-ligatures",
        "contextual",
        "no-contextual",
        "proportional-nums",
        "stylistic-one",
        "stylistic-two",
        "stylistic-three",
        "stylistic-four",
        "stylistic-five",
        "stylistic-six",
        "stylistic-seven",
        "stylistic-eight",
        "stylistic-nine",
        "stylistic-ten",
        "stylistic-eleven",
        "stylistic-twelve",
        "stylistic-thirteen",
        "stylistic-fourteen",
        "stylistic-fifteen",
        "stylistic-sixteen",
        "stylistic-seventeen",
        "stylistic-eighteen",
        "stylistic-nineteen",
        "stylistic-twenty",
    ];
    VALUES.iter().copied().find(|candidate| *candidate == value)
}
