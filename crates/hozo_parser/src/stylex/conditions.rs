//! Media, pseudo-class and attribute conditions on a StyleX value.

use hozo_ir::{Condition, Environment};

/// The static media-query slice shared by Web and React Native.
///
/// Legacy `min-width` is exactly the same inclusive predicate as range
/// syntax. Legacy `max-width` is deliberately absent: CSS makes it
/// inclusive while Hozo's existing `Width { at_least: false }` is `<`, and
/// quietly changing the boundary would be worse than leaving that query to
/// the official StyleX transform.
pub(super) fn stylex_media_condition(name: &str) -> Option<Condition> {
    let query = name.strip_prefix("@media ")?.trim();
    if query == "print" {
        return Some(Condition::Environment(Environment::Print));
    }
    let width_value = |value: &str| {
        let value = value.trim();
        let number = value
            .strip_suffix("px")
            .or_else(|| value.strip_suffix("rem"))?;
        number
            .parse::<f64>()
            .ok()
            .filter(|number| number.is_finite() && *number >= 0.0)
            .map(|_| value.to_string())
    };
    let inner = query
        .strip_prefix('(')
        .and_then(|query| query.strip_suffix(')'))?;
    let width = |operator: &str, at_least| {
        let (subject, value) = inner.split_once(operator)?;
        (subject.trim() == "width")
            .then(|| width_value(value))
            .flatten()
            .map(|value| Condition::Width { at_least, value })
    };
    inner
        .strip_prefix("min-width:")
        .and_then(width_value)
        .map(|value| Condition::Width {
            at_least: true,
            value,
        })
        .or_else(|| width(">=", true))
        .or_else(|| (!inner.contains("<=")).then(|| width("<", false)).flatten())
        .or(match query {
            "(prefers-color-scheme: dark)" => Some(Condition::Dark),
            "(prefers-reduced-motion: reduce)" => {
                Some(Condition::Environment(Environment::MotionReduce))
            }
            "(prefers-reduced-motion: no-preference)" => {
                Some(Condition::Environment(Environment::MotionSafe))
            }
            "(orientation: portrait)" => Some(Condition::Environment(Environment::Portrait)),
            "(orientation: landscape)" => Some(Condition::Environment(Environment::Landscape)),
            "(inverted-colors: inverted)" => {
                Some(Condition::Environment(Environment::InvertedColors))
            }
            "(prefers-contrast: more)" => Some(Condition::Environment(Environment::ContrastMore)),
            "(prefers-contrast: less)" => Some(Condition::Environment(Environment::ContrastLess)),
            "(forced-colors: active)" => Some(Condition::Environment(Environment::ForcedColors)),
            "(prefers-reduced-transparency: reduce)" => {
                Some(Condition::Environment(Environment::ReduceTransparency))
            }
            "(scripting: none)" => Some(Condition::Environment(Environment::Noscript)),
            _ => None,
        })
}

/// StyleX's six interaction pseudo-classes already represented by Hozo's
/// condition IR, plus their published 0.19 atomic-priority offsets.
/// Native answers the ones its target exposes and retains the existing
/// explicit diagnostic for conditions such as `:focus-within`.
///
/// `:hover` deliberately reuses Hozo's touch-safe hover contract on Web,
/// including its `(hover: hover)` capability query. That is a stricter
/// condition than StyleX's bare selector, but prevents sticky hover on
/// touch devices and is the same meaning Native's Pressable reports.
pub(super) fn stylex_pseudo_condition(name: &str) -> Option<(Condition, u16)> {
    Some(match name {
        ":hover" => (Condition::Hover, 130),
        ":focus" => (Condition::Focus, 150),
        ":active" => (Condition::Pressed, 170),
        ":focus-visible" => (Condition::FocusVisible, 40),
        ":focus-within" => (Condition::FocusWithin, 40),
        ":disabled" => (Condition::Disabled, 92),
        _ => return None,
    })
}

/// A `data-*` attribute key, as Tailwind's `data-[…]:` reads it.
///
/// StyleX accepts any key starting with `[`; Hozo takes the `data-*`
/// presence and equality forms, which are what `Presence`'s
/// `[data-state="closed"]` needs (decision 007, amendment 1). The value is
/// written back double-quoted, the form Tailwind's variant produces, so
/// both frontends land on the same `Condition::DataAttribute` text and
/// Native recognises the same state whichever way the quotes were written.
pub(super) fn stylex_attribute_condition(name: &str) -> Option<Condition> {
    let inner = name.strip_prefix('[')?.strip_suffix(']')?;
    let attribute_ok = |attribute: &str| {
        attribute.len() > "data-".len()
            && attribute.starts_with("data-")
            && attribute
                .bytes()
                .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
    };
    let Some((attribute, value)) = inner.split_once('=') else {
        return attribute_ok(inner).then(|| Condition::DataAttribute(format!("[{inner}]")));
    };
    let value = value
        .strip_prefix('"')
        .and_then(|value| value.strip_suffix('"'))
        .or_else(|| {
            value
                .strip_prefix('\'')
                .and_then(|value| value.strip_suffix('\''))
        })
        .unwrap_or(value);
    let value_ok = !value.is_empty()
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'));
    (attribute_ok(attribute) && value_ok)
        .then(|| Condition::DataAttribute(format!("[{attribute}=\"{value}\"]")))
}

pub(super) fn combine_conditions(outer: &Condition, inner: Condition) -> Condition {
    let mut conditions = match outer {
        Condition::Always => Vec::new(),
        Condition::All(conditions) => conditions.clone(),
        condition => vec![condition.clone()],
    };
    match inner {
        Condition::Always => {}
        Condition::All(inner) => conditions.extend(inner),
        condition => conditions.push(condition),
    }
    Condition::all(conditions)
}
