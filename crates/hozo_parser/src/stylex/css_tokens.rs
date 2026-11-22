//! Splitting CSS values into strings, identifiers, comma groups and components.

use hozo_ir::StyleProperty;

pub(super) fn web_css_string(value: &str) -> bool {
    let mut characters = value.chars();
    let Some(quote @ ('\'' | '"')) = characters.next() else {
        return false;
    };
    if value.len() < 2 || !value.ends_with(quote) {
        return false;
    }
    let mut escaped = false;
    for character in value[quote.len_utf8()..value.len() - quote.len_utf8()].chars() {
        if matches!(character, '\n' | '\r' | '\0') {
            return false;
        }
        if escaped {
            escaped = false;
        } else if character == '\\' {
            escaped = true;
        } else if character == quote {
            return false;
        }
    }
    !escaped
}

pub(super) fn web_css_identifier(value: &str) -> bool {
    let mut characters = value.chars();
    let Some(first) = characters.next() else {
        return false;
    };
    let valid_start = first.is_ascii_alphabetic()
        || first == '_'
        || (first == '-'
            && characters
                .clone()
                .next()
                .is_some_and(|next| next.is_ascii_alphabetic() || matches!(next, '_' | '-')));
    valid_start
        && characters
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
}

pub(super) fn web_comma_groups(value: &str) -> Option<Vec<&str>> {
    if value.contains([';', '{', '}', '\n', '\r']) {
        return None;
    }
    let mut groups = Vec::new();
    let mut start = 0;
    let mut depth = 0_u32;
    let mut quote = None;
    let mut escaped = false;
    for (index, character) in value.char_indices() {
        if escaped {
            escaped = false;
            continue;
        }
        if character == '\\' && quote.is_some() {
            escaped = true;
            continue;
        }
        if let Some(active_quote) = quote {
            if character == active_quote {
                quote = None;
            }
            continue;
        }
        match character {
            '\'' | '"' => quote = Some(character),
            '(' => depth += 1,
            ')' => depth = depth.checked_sub(1)?,
            ',' if depth == 0 => {
                let group = value[start..index].trim();
                if group.is_empty() {
                    return None;
                }
                groups.push(group);
                start = index + character.len_utf8();
            }
            _ => {}
        }
    }
    if depth != 0 || quote.is_some() || escaped {
        return None;
    }
    let group = value[start..].trim();
    if group.is_empty() {
        return None;
    }
    groups.push(group);
    Some(groups)
}

/// Split one CSS component list without cutting whitespace inside functions
/// or quoted strings. The supported shorthands do not need a complete CSS
/// parser, but ordinary values such as `rgb(0 0 0)` must remain one token.
pub(super) fn web_components(value: &str) -> Option<Vec<String>> {
    let mut parts = Vec::new();
    let mut current = String::new();
    let mut depth = 0_u32;
    let mut quote = None;
    let mut escaped = false;
    for character in value.chars() {
        if escaped {
            current.push(character);
            escaped = false;
            continue;
        }
        if character == '\\' && quote.is_some() {
            current.push(character);
            escaped = true;
            continue;
        }
        if let Some(active_quote) = quote {
            current.push(character);
            if character == active_quote {
                quote = None;
            }
            continue;
        }
        match character {
            '\'' | '"' => {
                quote = Some(character);
                current.push(character);
            }
            '(' => {
                depth += 1;
                current.push(character);
            }
            ')' => {
                depth = depth.checked_sub(1)?;
                current.push(character);
            }
            character if character.is_whitespace() && depth == 0 => {
                if !current.is_empty() {
                    parts.push(std::mem::take(&mut current));
                }
            }
            _ => current.push(character),
        }
    }
    if depth != 0 || quote.is_some() {
        return None;
    }
    if !current.is_empty() {
        parts.push(current);
    }
    (!parts.is_empty()).then_some(parts)
}

pub(super) fn web_longhand(property: &str, value: impl Into<String>) -> StyleProperty {
    StyleProperty::WebOnly(property.to_string(), value.into())
}

pub(super) fn web_shorthand_color(value: &str) -> bool {
    if value.contains([';', '{', '}']) {
        return false;
    }
    let lower = value.to_ascii_lowercase();
    matches!(
        lower.as_str(),
        "transparent"
            | "currentcolor"
            | "black"
            | "silver"
            | "gray"
            | "white"
            | "maroon"
            | "red"
            | "purple"
            | "fuchsia"
            | "green"
            | "lime"
            | "olive"
            | "yellow"
            | "navy"
            | "blue"
            | "teal"
            | "aqua"
            | "orange"
    ) || (lower.starts_with('#')
        && matches!(lower.len(), 4 | 5 | 7 | 9)
        && lower[1..].bytes().all(|byte| byte.is_ascii_hexdigit()))
        || [
            "rgb(", "rgba(", "hsl(", "hsla(", "hwb(", "lab(", "lch(", "oklab(", "oklch(", "color(",
        ]
        .iter()
        .any(|prefix| lower.starts_with(prefix) && lower.ends_with(')'))
}

pub(super) fn portable_text_shadow_color(value: &str) -> bool {
    let lower = value.to_ascii_lowercase();
    if matches!(
        lower.as_str(),
        "transparent"
            | "black"
            | "silver"
            | "gray"
            | "white"
            | "maroon"
            | "red"
            | "purple"
            | "fuchsia"
            | "green"
            | "lime"
            | "olive"
            | "yellow"
            | "navy"
            | "blue"
            | "teal"
            | "aqua"
            | "orange"
    ) || (lower.starts_with('#')
        && matches!(lower.len(), 4 | 5 | 7 | 9)
        && lower[1..].bytes().all(|byte| byte.is_ascii_hexdigit()))
    {
        return true;
    }

    let inner = lower
        .strip_prefix("rgb(")
        .or_else(|| lower.strip_prefix("rgba("))
        .and_then(|value| value.strip_suffix(')'));
    let Some(inner) = inner else { return false };
    let parts = inner.split(',').map(str::trim).collect::<Vec<_>>();
    if !matches!(parts.len(), 3 | 4) {
        return false;
    }
    parts.iter().all(|part| {
        let number = part.strip_suffix('%').unwrap_or(part).parse::<f64>();
        number.is_ok_and(f64::is_finite)
    })
}

pub(super) fn has_top_level_comma(value: &str) -> bool {
    let mut depth = 0_u32;
    let mut quote = None;
    let mut escaped = false;
    for character in value.chars() {
        if escaped {
            escaped = false;
            continue;
        }
        if character == '\\' && quote.is_some() {
            escaped = true;
            continue;
        }
        if let Some(active_quote) = quote {
            if character == active_quote {
                quote = None;
            }
            continue;
        }
        match character {
            '\'' | '"' => quote = Some(character),
            '(' => depth += 1,
            ')' => depth = depth.saturating_sub(1),
            ',' if depth == 0 => return true,
            _ => {}
        }
    }
    false
}
