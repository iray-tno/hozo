//! Utilities conditioned on the element's own state: the groups, the keys
//! the resolver reads them under, and the composition tables they feed.

use super::*;

pub(super) struct StateGroup {
    pub(super) keys: Vec<String>,
    pub(super) pairs: Vec<(String, String)>,
    pub(super) transform: Option<String>,
    pub(super) filter: Option<crate::filters::Metadata>,
    pub(super) gradient: Option<crate::gradients::Metadata>,
    pub(super) shadow: Option<crate::shadows::Metadata>,
    pub(super) order: Option<u32>,
    pub(super) font_default: bool,
}

pub(super) fn write_composition_table<'a>(
    out: &mut String,
    table: &str,
    entries: impl Iterator<Item = (&'a String, &'a str)>,
    states: &[(&String, Vec<StateGroup>)],
    state_value: fn(&StateGroup) -> Option<&str>,
) {
    out.push_str(&format!("const {table} = new Map([\n"));
    for (name, code) in entries {
        out.push_str(&format!("  [styles[{}], {code}],\n", quote(name)));
    }
    for (name, groups) in states {
        for (index, group) in groups.iter().enumerate() {
            if let Some(code) = state_value(group) {
                out.push_str(&format!(
                    "  [states[{}][{index}][1], {code}],\n",
                    quote(name)
                ));
            }
        }
    }
    out.push_str("])\n\n");
}

pub(super) fn has_font_default(properties: &[StyleProperty]) -> bool {
    properties.iter().any(|property| {
        matches!(
            property,
            StyleProperty::LineHeight(hozo_ir::LineHeight::FontDefault(_))
        )
    })
}

/// A utility's groups as state groups, if every one is conditioned on the
/// element's own state and nothing else, and every property has a Native
/// form. `None` sends it to `unsupported` as before.
pub(super) fn state_groups(
    groups: &[(Condition, Vec<StyleProperty>)],
    theme: &Theme,
) -> Option<Vec<StateGroup>> {
    groups
        .iter()
        .map(|(condition, properties)| {
            let keys = state_keys(condition)?;
            if properties
                .iter()
                .any(|property| property.unsupported_on_native_with_theme(theme).is_some())
            {
                return None;
            }
            let pairs: Vec<(String, String)> = style_pairs(properties, theme)
                .into_iter()
                .map(|(key, value)| (key.to_string(), value))
                .collect();
            Some(StateGroup {
                keys,
                pairs,
                transform: crate::transforms::metadata(properties, theme),
                filter: crate::filters::metadata(properties),
                gradient: crate::gradients::metadata(properties, theme),
                shadow: crate::shadows::metadata(properties, theme),
                // Preserve the existing tuple scale; the low bits no
                // longer encode a second Tailwind variant precedence.
                order: condition
                    .owner_interaction_specificity()
                    .map(|weight| u32::from(weight) * 256),
                font_default: has_font_default(properties),
            })
        })
        .collect()
}

/// The keys an element's state is handed to the resolver under. ARIA states
/// keep their attribute names, so `aria-pressed` cannot be read as the
/// pointer's `pressed`.
pub(super) fn state_keys(condition: &Condition) -> Option<Vec<String>> {
    Some(match condition {
        Condition::Hover => vec!["hovered".to_string()],
        Condition::Pressed => vec!["pressed".to_string()],
        Condition::Focus => vec!["focused".to_string()],
        Condition::FocusVisible => vec!["focusVisible".to_string()],
        Condition::Disabled => vec!["disabled".to_string()],
        Condition::FormState(FormState::ReadOnly) => vec!["readOnly".to_string()],
        Condition::Aria(state) => vec![format!("aria-{state}")],
        Condition::Not(inner) => match inner.as_ref() {
            Condition::Aria(state) => vec![format!("!aria-{state}")],
            _ => return None,
        },
        Condition::DataAttribute(selector) => {
            vec![data_fact_key(selector)?]
        }
        Condition::Environment(Environment::Rtl) => vec!["rtl".to_string()],
        Condition::Environment(Environment::Ltr) => vec!["ltr".to_string()],
        Condition::All(conditions) => {
            let mut keys = Vec::new();
            for condition in conditions {
                keys.extend(state_keys(condition)?);
            }
            keys
        }
        _ => return None,
    })
}

/// Encode a narrow, case-sensitive attribute predicate once at build time.
/// The owner supplies its boolean result, not a raw attribute for JS to parse.
/// Presence and equality have disjoint keys; quoted and unquoted safe tokens
/// normalize alike. Escapes, whitespace, flags and other CSS operators stay
/// unsupported rather than receiving an approximate selector interpretation.
pub(crate) fn data_fact_key(selector: &str) -> Option<String> {
    let query = selector.strip_prefix("[data-")?.strip_suffix(']')?;
    let (name, value) = match query.split_once('=') {
        Some((name, value)) => (name, Some(value)),
        None => (query, None),
    };
    if name.is_empty()
        || !name
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-' || b == b'_')
    {
        return None;
    }
    let Some(raw_value) = value else {
        return Some(format!("data-{name}"));
    };
    let quoted = raw_value.starts_with(['\'', '"']);
    let value = if quoted {
        let quote = raw_value.chars().next()?;
        raw_value.strip_prefix(quote)?.strip_suffix(quote)?
    } else {
        raw_value
    };
    if value.is_empty()
        || !value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
    {
        return None;
    }
    // CSS's unquoted attribute values are identifiers, not arbitrary strings.
    // A quoted numeric token is safe, but an unquoted number is not one.
    let ident = value.strip_prefix('-').unwrap_or(value);
    if !quoted
        && !ident
            .bytes()
            .next()
            .is_some_and(|b| b.is_ascii_alphabetic() || b == b'_' || b == b'-')
    {
        return None;
    }
    Some(format!("data-{name}={value}"))
}

/// The `states` table: each class's groups, as the keys it needs and the
/// pairs it applies, with its owner rank when ranks can change the order.
pub(super) fn write_states(
    body: &mut String,
    states: &[(&String, Vec<StateGroup>)],
    emit_owner_ranks: bool,
) {
    body.push_str("const states = {\n");
    for (name, groups) in states {
        let groups: Vec<String> = groups
            .iter()
            .map(|group| {
                let keys: Vec<String> = group.keys.iter().map(|key| quote(key)).collect();
                let pairs: Vec<String> = group
                    .pairs
                    .iter()
                    .map(|(key, value)| format!("{key}: {value}"))
                    .collect();
                let order = group
                    .order
                    .filter(|_| emit_owner_ranks)
                    .map(|key| format!(", {key}"))
                    .unwrap_or_default();
                format!("[[{}], {{ {} }}{order}]", keys.join(", "), pairs.join(", "))
            })
            .collect();
        body.push_str(&format!("  {}: [{}],\n", quote(name), groups.join(", ")));
    }
    body.push_str("}\n\n");
}
