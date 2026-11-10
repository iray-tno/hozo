//! Compile-time `tailwind-merge` (`twMerge`) classification, conflict resolution,
//! and runtime `className` conflict-guard regex synthesis (#1676).
//!
//! All class-group tries, validators, and conflict tables come from
//! `tw_merge_table`, generated directly from `tailwind-merge`'s
//! `getDefaultConfig()`.

use crate::tw_merge_table::{
    TrieNode, Validator, CONFLICTING_CLASS_GROUPS, CONFLICTING_CLASS_GROUP_MODIFIERS,
    ORDER_SENSITIVE_MODIFIERS, POSTFIX_LOOKUP_CLASS_GROUPS, ROOT_INDEX, TRIE_NODES,
};
use std::collections::BTreeSet;

const ARBITRARY_PROPERTY_PREFIX: &str = "arbitrary..";

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ParsedClassName<'a> {
    pub modifiers: Vec<&'a str>,
    pub has_important_modifier: bool,
    pub base_class_name: &'a str,
    pub maybe_postfix_modifier_position: Option<usize>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ClassifiedToken {
    /// Canonicalized modifier + `!` prefix (e.g. `""`, `"hover"`, `"focus:hover"`, `"hover!"`).
    pub modifier_id: String,
    /// `twMerge` class group ID (e.g. `"px"`, `"p"`, `"font-size"`, `"arbitrary..color"`).
    pub class_group_id: String,
    /// Whether the token retained an unconsumed `/...` postfix modifier (e.g. `text-lg/6`).
    pub has_postfix_modifier: bool,
}

impl ClassifiedToken {
    pub fn class_id(&self) -> String {
        format!("{}{}", self.modifier_id, self.class_group_id)
    }

    pub fn conflicting_class_ids(&self) -> Vec<String> {
        get_conflicting_class_group_ids(&self.class_group_id, self.has_postfix_modifier)
            .into_iter()
            .map(|group| format!("{}{group}", self.modifier_id))
            .collect()
    }
}

pub fn parse_class_name(class_name: &str) -> ParsedClassName<'_> {
    let mut modifiers = Vec::new();
    let mut bracket_depth: i32 = 0;
    let mut paren_depth: i32 = 0;
    let mut modifier_start = 0;
    let mut postfix_modifier_position: Option<usize> = None;

    for (index, ch) in class_name.char_indices() {
        if bracket_depth == 0 && paren_depth == 0 {
            if ch == ':' {
                modifiers.push(&class_name[modifier_start..index]);
                modifier_start = index + 1;
                continue;
            }
            if ch == '/' {
                postfix_modifier_position = Some(index);
                continue;
            }
        }
        match ch {
            '[' => bracket_depth += 1,
            ']' => bracket_depth -= 1,
            '(' => paren_depth += 1,
            ')' => paren_depth -= 1,
            _ => {}
        }
    }

    let base_with_important = if modifiers.is_empty() {
        class_name
    } else {
        &class_name[modifier_start..]
    };

    let (base_class_name, has_important_modifier) =
        if let Some(stripped) = base_with_important.strip_suffix('!') {
            (stripped, true)
        } else if let Some(stripped) = base_with_important.strip_prefix('!') {
            (stripped, true)
        } else {
            (base_with_important, false)
        };

    let maybe_postfix_modifier_position = postfix_modifier_position.and_then(|pos| {
        if pos > modifier_start {
            // If leading `!` was stripped, adjust relative index in `base_class_name`.
            let offset = usize::from(
                !base_with_important.ends_with('!') && base_with_important.starts_with('!'),
            );
            (pos - modifier_start).checked_sub(offset)
        } else {
            None
        }
    });

    ParsedClassName {
        modifiers,
        has_important_modifier,
        base_class_name,
        maybe_postfix_modifier_position,
    }
}

pub fn sort_modifiers<'a>(modifiers: &[&'a str]) -> Vec<&'a str> {
    let mut result = Vec::with_capacity(modifiers.len());
    let mut current_segment: Vec<&'a str> = Vec::new();

    for &modifier in modifiers {
        let is_arbitrary = modifier.starts_with('[');
        let is_order_sensitive = ORDER_SENSITIVE_MODIFIERS.binary_search(&modifier).is_ok();
        if is_arbitrary || is_order_sensitive {
            if !current_segment.is_empty() {
                current_segment.sort_unstable();
                result.append(&mut current_segment);
            }
            result.push(modifier);
        } else {
            current_segment.push(modifier);
        }
    }
    if !current_segment.is_empty() {
        current_segment.sort_unstable();
        result.append(&mut current_segment);
    }
    result
}

pub fn classify_token(class_name: &str) -> Option<ClassifiedToken> {
    let parsed = parse_class_name(class_name);
    let mut has_postfix_modifier = parsed.maybe_postfix_modifier_position.is_some();
    let class_group_id = if let Some(pos) = parsed.maybe_postfix_modifier_position {
        let without_postfix = &parsed.base_class_name[..pos];
        let mut group = get_class_group_id(without_postfix);
        if let Some(ref g) = group {
            if POSTFIX_LOOKUP_CLASS_GROUPS
                .binary_search(&g.as_str())
                .is_ok()
            {
                if let Some(with_postfix) = get_class_group_id(parsed.base_class_name) {
                    if with_postfix != *g {
                        group = Some(with_postfix);
                        has_postfix_modifier = false;
                    }
                }
            }
        }
        if group.is_none() {
            group = get_class_group_id(parsed.base_class_name);
            has_postfix_modifier = false;
        }
        group?
    } else {
        get_class_group_id(parsed.base_class_name)?
    };

    let variant_modifier = match parsed.modifiers.as_slice() {
        [] => String::new(),
        [single] => (*single).to_string(),
        many => sort_modifiers(many).join(":"),
    };
    let modifier_id = if parsed.has_important_modifier {
        format!("{variant_modifier}!")
    } else {
        variant_modifier
    };

    Some(ClassifiedToken {
        modifier_id,
        class_group_id,
        has_postfix_modifier,
    })
}

/// Returns whether a later token overrides an earlier token in `twMerge`.
pub fn overrides(later: &ClassifiedToken, earlier: &ClassifiedToken) -> bool {
    if later.modifier_id != earlier.modifier_id {
        return false;
    }
    if later.class_group_id == earlier.class_group_id {
        return true;
    }
    get_conflicting_class_group_ids(&later.class_group_id, later.has_postfix_modifier)
        .iter()
        .any(|&g| g == earlier.class_group_id)
}

/// Exact port of `tailwind-merge`'s `mergeClassList`.
pub fn merge_class_list(class_list: &str) -> String {
    let class_names: Vec<&str> = class_list.split_whitespace().collect();
    if class_names.is_empty() {
        return String::new();
    }
    let mut class_groups_in_conflict: Vec<String> = Vec::new();
    let mut kept_reversed: Vec<&str> = Vec::with_capacity(class_names.len());

    for &original in class_names.iter().rev() {
        let Some(classified) = classify_token(original) else {
            kept_reversed.push(original);
            continue;
        };
        let class_id = classified.class_id();
        if class_groups_in_conflict.contains(&class_id) {
            continue;
        }
        class_groups_in_conflict.push(class_id);
        class_groups_in_conflict.extend(classified.conflicting_class_ids());
        kept_reversed.push(original);
    }

    kept_reversed.reverse();
    kept_reversed.join(" ")
}

fn get_conflicting_class_group_ids(
    class_group_id: &str,
    has_postfix_modifier: bool,
) -> Vec<&'static str> {
    let base = CONFLICTING_CLASS_GROUPS
        .binary_search_by_key(&class_group_id, |&(k, _)| k)
        .ok()
        .map(|idx| CONFLICTING_CLASS_GROUPS[idx].1)
        .unwrap_or(&[]);

    if has_postfix_modifier {
        if let Ok(idx) =
            CONFLICTING_CLASS_GROUP_MODIFIERS.binary_search_by_key(&class_group_id, |&(k, _)| k)
        {
            let mod_conflicts = CONFLICTING_CLASS_GROUP_MODIFIERS[idx].1;
            let mut combined = Vec::with_capacity(base.len() + mod_conflicts.len());
            combined.extend_from_slice(base);
            combined.extend_from_slice(mod_conflicts);
            return combined;
        }
    }
    base.to_vec()
}

fn get_class_group_id(class_name: &str) -> Option<String> {
    if class_name.starts_with('[') && class_name.ends_with(']') {
        let content = &class_name[1..class_name.len() - 1];
        let colon = content.find(':')?;
        let property = &content[..colon];
        return (!property.is_empty()).then(|| format!("{ARBITRARY_PROPERTY_PREFIX}{property}"));
    }
    let parts: Vec<&str> = class_name.split('-').collect();
    let start_index = usize::from(parts.first() == Some(&"") && parts.len() > 1);
    get_group_recursive(&parts, start_index, &TRIE_NODES[ROOT_INDEX]).map(str::to_string)
}

fn get_group_recursive(
    parts: &[&str],
    start_index: usize,
    node: &TrieNode,
) -> Option<&'static str> {
    if parts.len() == start_index {
        return node.class_group_id;
    }
    let current = parts[start_index];
    if let Ok(child_pos) = node.children.binary_search_by_key(&current, |&(k, _)| k) {
        let child_idx = node.children[child_pos].1;
        if let Some(found) = get_group_recursive(parts, start_index + 1, &TRIE_NODES[child_idx]) {
            return Some(found);
        }
    }
    if node.validators.is_empty() {
        return None;
    }
    let class_rest = parts[start_index..].join("-");
    for &(group_id, validator) in node.validators {
        if run_validator(validator, &class_rest) {
            return Some(group_id);
        }
    }
    None
}

fn run_validator(validator: Validator, value: &str) -> bool {
    match validator {
        Validator::IsAny => true,
        Validator::IsAnyNonArbitrary => !is_arbitrary_value(value) && !is_arbitrary_variable(value),
        Validator::IsArbitraryFamilyName => {
            get_is_arbitrary_value(value, is_label_family_name, |_| false)
        }
        Validator::IsArbitraryImage => get_is_arbitrary_value(value, is_label_image, is_image),
        Validator::IsArbitraryLength => {
            get_is_arbitrary_value(value, is_label_length, is_length_only)
        }
        Validator::IsArbitraryNumber => get_is_arbitrary_value(value, is_label_number, is_number),
        Validator::IsArbitraryPosition => {
            get_is_arbitrary_value(value, is_label_position, |_| false)
        }
        Validator::IsArbitraryShadow => get_is_arbitrary_value(value, is_label_shadow, is_shadow),
        Validator::IsArbitrarySize => get_is_arbitrary_value(value, is_label_size, |_| false),
        Validator::IsArbitraryValue => is_arbitrary_value(value),
        Validator::IsArbitraryVariable => is_arbitrary_variable(value),
        Validator::IsArbitraryVariableFamilyName => {
            get_is_arbitrary_variable(value, is_label_family_name, false)
        }
        Validator::IsArbitraryVariableImage => {
            get_is_arbitrary_variable(value, is_label_image, false)
        }
        Validator::IsArbitraryVariableLength => {
            get_is_arbitrary_variable(value, is_label_length, false)
        }
        Validator::IsArbitraryVariablePosition => {
            get_is_arbitrary_variable(value, is_label_position, false)
        }
        Validator::IsArbitraryVariableShadow => {
            get_is_arbitrary_variable(value, is_label_shadow, true)
        }
        Validator::IsArbitraryVariableSize => {
            get_is_arbitrary_variable(value, is_label_size, false)
        }
        Validator::IsArbitraryVariableWeight => {
            get_is_arbitrary_variable(value, is_label_weight, true)
        }
        Validator::IsArbitraryWeight => get_is_arbitrary_value(value, is_label_weight, |_| true),
        Validator::IsFraction => is_fraction(value),
        Validator::IsInteger => is_integer(value),
        Validator::IsNamedContainerQuery => is_named_container_query(value),
        Validator::IsNumber => is_number(value),
        Validator::IsPercent => is_percent(value),
        Validator::IsTshirtSize => is_tshirt_size(value),
    }
}

fn split_arbitrary_inner(inner: &str) -> Option<(Option<&str>, &str)> {
    if inner.is_empty() || inner.contains('\n') || inner.contains('\r') {
        return None;
    }
    if let Some((label, rest)) = inner.split_once(':') {
        let mut chars = label.chars();
        if let Some(first) = chars.next() {
            if (first.is_ascii_alphanumeric() || first == '_')
                && chars.all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
            {
                if rest.is_empty() {
                    return None;
                }
                return Some((Some(label), rest));
            }
        }
    }
    Some((None, inner))
}

fn parse_arbitrary_value(value: &str) -> Option<(Option<&str>, &str)> {
    let inner = value.strip_prefix('[')?.strip_suffix(']')?;
    split_arbitrary_inner(inner)
}

fn parse_arbitrary_variable(value: &str) -> Option<(Option<&str>, &str)> {
    let inner = value.strip_prefix('(')?.strip_suffix(')')?;
    split_arbitrary_inner(inner)
}

fn is_arbitrary_value(value: &str) -> bool {
    parse_arbitrary_value(value).is_some()
}

fn is_arbitrary_variable(value: &str) -> bool {
    parse_arbitrary_variable(value).is_some()
}

fn get_is_arbitrary_value(
    value: &str,
    test_label: fn(&str) -> bool,
    test_value: fn(&str) -> bool,
) -> bool {
    let Some((label, rest)) = parse_arbitrary_value(value) else {
        return false;
    };
    match label {
        Some(l) => test_label(&l.to_ascii_lowercase()),
        None => test_value(rest),
    }
}

fn get_is_arbitrary_variable(
    value: &str,
    test_label: fn(&str) -> bool,
    should_match_no_label: bool,
) -> bool {
    let Some((label, _)) = parse_arbitrary_variable(value) else {
        return false;
    };
    match label {
        Some(l) => test_label(&l.to_ascii_lowercase()),
        None => should_match_no_label,
    }
}

fn is_label_position(label: &str) -> bool {
    label == "position" || label == "percentage"
}
fn is_label_image(label: &str) -> bool {
    label == "image" || label == "url"
}
fn is_label_size(label: &str) -> bool {
    label == "length" || label == "size" || label == "bg-size"
}
fn is_label_length(label: &str) -> bool {
    label == "length"
}
fn is_label_number(label: &str) -> bool {
    label == "number"
}
fn is_label_family_name(label: &str) -> bool {
    label == "family-name"
}
fn is_label_weight(label: &str) -> bool {
    label == "number" || label == "weight"
}
fn is_label_shadow(label: &str) -> bool {
    label == "shadow"
}

fn is_decimal_digits_with_optional_dot(s: &str) -> bool {
    if let Some((a, b)) = s.split_once('.') {
        !a.is_empty()
            && !b.is_empty()
            && a.bytes().all(|c| c.is_ascii_digit())
            && b.bytes().all(|c| c.is_ascii_digit())
    } else {
        !s.is_empty() && s.bytes().all(|c| c.is_ascii_digit())
    }
}

fn is_fraction(value: &str) -> bool {
    let Some((num, den)) = value.split_once('/') else {
        return false;
    };
    is_decimal_digits_with_optional_dot(num) && is_decimal_digits_with_optional_dot(den)
}

fn is_number(value: &str) -> bool {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return false;
    }
    if trimmed == "Infinity" || trimmed == "-Infinity" || trimmed == "+Infinity" {
        return true;
    }
    if let Some(hex) = trimmed
        .strip_prefix("0x")
        .or_else(|| trimmed.strip_prefix("0X"))
    {
        return !hex.is_empty() && hex.bytes().all(|b| b.is_ascii_hexdigit());
    }
    if let Some(bin) = trimmed
        .strip_prefix("0b")
        .or_else(|| trimmed.strip_prefix("0B"))
    {
        return !bin.is_empty() && bin.bytes().all(|b| b == b'0' || b == b'1');
    }
    if let Some(oct) = trimmed
        .strip_prefix("0o")
        .or_else(|| trimmed.strip_prefix("0O"))
    {
        return !oct.is_empty() && oct.bytes().all(|b| (b'0'..=b'7').contains(&b));
    }
    trimmed.parse::<f64>().is_ok_and(|n| {
        !n.is_nan()
            && !trimmed
                .bytes()
                .any(|b| b.is_ascii_alphabetic() && b != b'e' && b != b'E')
    })
}

fn is_integer(value: &str) -> bool {
    if !is_number(value) {
        return false;
    }
    let Ok(n) = value.trim().parse::<f64>() else {
        return false;
    };
    n.is_finite() && n.fract() == 0.0
}

fn is_percent(value: &str) -> bool {
    value.strip_suffix('%').is_some_and(is_number)
}

fn is_tshirt_size(value: &str) -> bool {
    for suffix in ["xs", "sm", "md", "lg", "xl"] {
        if let Some(prefix) = value.strip_suffix(suffix) {
            return prefix.is_empty() || is_decimal_digits_with_optional_dot(prefix);
        }
    }
    false
}

fn is_named_container_query(value: &str) -> bool {
    let Some(rest) = value.strip_prefix("@container") else {
        return false;
    };
    rest.strip_prefix('/')
        .or_else(|| rest.strip_prefix("-size/"))
        .or_else(|| rest.strip_prefix("-normal/"))
        .is_some_and(|name| !name.is_empty())
}

fn is_color_function(value: &str) -> bool {
    let Some(inner_end) = value.strip_suffix(')') else {
        return false;
    };
    let Some((func, arg)) = inner_end.split_once('(') else {
        return false;
    };
    !arg.is_empty()
        && matches!(
            func,
            "rgb"
                | "rgba"
                | "hsl"
                | "hsla"
                | "hwb"
                | "lab"
                | "lch"
                | "oklab"
                | "oklch"
                | "color-mix"
                | "color"
                | "light-dark"
        )
}

fn is_length_unit(unit: &str) -> bool {
    matches!(
        unit,
        "%" | "px"
            | "em"
            | "rem"
            | "vh"
            | "vw"
            | "vi"
            | "vb"
            | "vmin"
            | "vmax"
            | "svh"
            | "svw"
            | "svi"
            | "svb"
            | "svmin"
            | "svmax"
            | "lvh"
            | "lvw"
            | "lvi"
            | "lvb"
            | "lvmin"
            | "lvmax"
            | "dvh"
            | "dvw"
            | "dvi"
            | "dvb"
            | "dvmin"
            | "dvmax"
            | "pt"
            | "pc"
            | "in"
            | "cm"
            | "mm"
            | "cap"
            | "ch"
            | "ex"
            | "lh"
            | "rlh"
            | "cqw"
            | "cqh"
            | "cqi"
            | "cqb"
            | "cqmin"
            | "cqmax"
    )
}

fn has_length_unit_token(value: &str) -> bool {
    if value == "0" {
        return true;
    }
    let bytes = value.as_bytes();
    for i in 0..bytes.len() {
        let prev_is_word = i > 0 && (bytes[i - 1].is_ascii_alphanumeric() || bytes[i - 1] == b'_');
        if !prev_is_word {
            for fn_prefix in ["calc(", "min(", "max(", "clamp("] {
                if let Some(after) = value[i..].strip_prefix(fn_prefix) {
                    if let Some(close) = after.rfind(')') {
                        if close > 0 {
                            return true;
                        }
                    }
                }
            }
        }
        if bytes[i].is_ascii_digit() {
            let mut j = i + 1;
            while j < bytes.len() && bytes[j].is_ascii_digit() {
                j += 1;
            }
            if j < bytes.len() && bytes[j] == b'%' {
                return true;
            }
            let unit_start = j;
            while j < bytes.len() && bytes[j].is_ascii_alphabetic() {
                j += 1;
            }
            for end in (unit_start + 1)..=j {
                if is_length_unit(&value[unit_start..end]) {
                    return true;
                }
            }
        }
    }
    false
}

fn is_length_only(value: &str) -> bool {
    has_length_unit_token(value) && !is_color_function(value)
}

fn parse_shadow_coord(s: &str) -> Option<&str> {
    let s = s.strip_prefix('-').unwrap_or(s);
    if let Some(rest) = s.strip_prefix('0') {
        let next_non_alpha = rest.is_empty() || !rest.as_bytes()[0].is_ascii_alphabetic();
        if next_non_alpha {
            return Some(rest);
        }
    }
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() && bytes[i].is_ascii_digit() {
        i += 1;
    }
    if i < bytes.len() && bytes[i] == b'.' {
        i += 1;
    }
    let frac_start = i;
    while i < bytes.len() && bytes[i].is_ascii_digit() {
        i += 1;
    }
    if i == frac_start {
        return None;
    }
    let unit_start = i;
    while i < bytes.len() && bytes[i].is_ascii_lowercase() {
        i += 1;
    }
    if i == unit_start {
        return None;
    }
    Some(&s[i..])
}

fn is_shadow(value: &str) -> bool {
    let s = value.strip_prefix("inset_").unwrap_or(value);
    let Some(after_x) = parse_shadow_coord(s) else {
        return false;
    };
    let Some(after_sep) = after_x.strip_prefix('_') else {
        return false;
    };
    parse_shadow_coord(after_sep).is_some()
}

fn is_image(value: &str) -> bool {
    let Some(inner_end) = value.strip_suffix(')') else {
        return false;
    };
    let Some((func, arg)) = inner_end.split_once('(') else {
        return false;
    };
    !arg.is_empty()
        && matches!(
            func,
            "url"
                | "image"
                | "image-set"
                | "cross-fade"
                | "element"
                | "linear-gradient"
                | "radial-gradient"
                | "conic-gradient"
                | "repeating-linear-gradient"
                | "repeating-radial-gradient"
                | "repeating-conic-gradient"
        )
}

/// Returns all `class_group_id`s whose presence in a later argument overrides
/// `target_group_id` (including `target_group_id` itself).
pub fn overriding_groups_for(target_group_id: &str) -> Vec<&'static str> {
    let mut result = BTreeSet::new();
    for &(later_group, conflicts) in CONFLICTING_CLASS_GROUPS {
        if later_group == target_group_id || conflicts.contains(&target_group_id) {
            result.insert(later_group);
        }
    }
    for &(later_group, conflicts) in CONFLICTING_CLASS_GROUP_MODIFIERS {
        if later_group == target_group_id || conflicts.contains(&target_group_id) {
            result.insert(later_group);
        }
    }
    result.into_iter().collect()
}

fn escape_regex(literal: &str) -> String {
    let mut out = String::with_capacity(literal.len());
    for ch in literal.chars() {
        if matches!(
            ch,
            '\\' | '.'
                | '+'
                | '*'
                | '?'
                | '('
                | ')'
                | '['
                | ']'
                | '{'
                | '}'
                | '^'
                | '$'
                | '|'
                | '/'
        ) {
            out.push('\\');
        }
        out.push(ch);
    }
    out
}

fn collect_patterns_for_groups(
    node: &TrieNode,
    prefix: &str,
    targets: &BTreeSet<&str>,
    exact: &mut BTreeSet<String>,
    prefixes: &mut BTreeSet<String>,
    has_leading_validators: &mut bool,
) {
    #[allow(clippy::collapsible_if)]
    if let Some(group_id) = node.class_group_id {
        if targets.contains(group_id) && !prefix.is_empty() {
            exact.insert(escape_regex(prefix));
        }
    }
    for &(group_id, _) in node.validators {
        if targets.contains(group_id) {
            if prefix.is_empty() {
                *has_leading_validators = true;
            } else {
                prefixes.insert(escape_regex(prefix));
            }
        }
    }
    for &(key, child_idx) in node.children {
        let next_prefix = if prefix.is_empty() {
            key.to_string()
        } else {
            format!("{prefix}-{key}")
        };
        collect_patterns_for_groups(
            &TRIE_NODES[child_idx],
            &next_prefix,
            targets,
            exact,
            prefixes,
            has_leading_validators,
        );
    }
}

/// Synthesizes a compact JS regex pattern matching any token in a runtime
/// `className` string that `twMerge` would treat as overriding `(modifier_id, target_group_id)`.
pub fn conflict_regex_for_target(modifier_id: &str, target_group_id: &str) -> String {
    let (variant_part, is_important) = match modifier_id.strip_suffix('!') {
        Some(v) => (v, true),
        None => (modifier_id, false),
    };
    let variant_prefix = if variant_part.is_empty() {
        String::new()
    } else {
        let parts: Vec<&str> = variant_part.split(':').collect();
        if parts.len() == 1 {
            format!("{}:", escape_regex(parts[0]))
        } else {
            // Multiple modifiers can appear in any order in the caller's class string.
            let joined = parts
                .iter()
                .map(|p| escape_regex(p))
                .collect::<Vec<_>>()
                .join("|");
            format!("(?:(?:{joined}):){{{}}}", parts.len())
        }
    };

    if let Some(prop) = target_group_id.strip_prefix(ARBITRARY_PROPERTY_PREFIX) {
        let base_pat = format!("\\[{}:[^\\]\\s]+\\]", escape_regex(prop));
        return wrap_token_regex(&variant_prefix, &base_pat, is_important);
    }

    let mut target_set: BTreeSet<&str> =
        overriding_groups_for(target_group_id).into_iter().collect();
    target_set.insert(target_group_id);

    let mut exact = BTreeSet::new();
    let mut prefixes = BTreeSet::new();
    let mut has_leading_validators = false;
    collect_patterns_for_groups(
        &TRIE_NODES[ROOT_INDEX],
        "",
        &target_set,
        &mut exact,
        &mut prefixes,
        &mut has_leading_validators,
    );

    let mut branches = Vec::new();
    if !prefixes.is_empty() {
        let mut exact_too = Vec::new();
        let mut only_prefix = Vec::new();
        for p in &prefixes {
            if exact.remove(p) {
                exact_too.push(p.as_str());
            } else {
                only_prefix.push(p.as_str());
            }
        }
        if !exact_too.is_empty() {
            branches.push(format!("(?:{})(?:-[^\\s/!]+)?", exact_too.join("|")));
        }
        if !only_prefix.is_empty() {
            branches.push(format!("(?:{})-[^\\s/!]+", only_prefix.join("|")));
        }
    }
    if !exact.is_empty() {
        let exact_vec: Vec<&str> = exact.iter().map(String::as_str).collect();
        branches.push(exact_vec.join("|"));
    }
    if has_leading_validators && target_set.contains("container-named") {
        branches.push("@container(?:-(?:size|normal))?\\/[^\\s!]+".to_string());
    }

    // Special disambiguations where two groups share a prefix (e.g. `text-*` font-size vs text-color).
    if target_group_id == "font-size" {
        return wrap_token_regex(
            &variant_prefix,
            "text-(?:xs|sm|base|lg|xl|\\d+(?:\\.\\d+)?(?:xs|sm|md|lg|xl)|\\[(?:length:[^\\]\\s]+|\\d[^\\]\\s]*)\\]|\\(length:[^)\\s]+\\))",
            is_important,
        );
    }
    if target_group_id == "text-color" {
        return wrap_token_regex(
            &variant_prefix,
            "text-(?!(?:xs|sm|base|lg|xl|\\d+(?:\\.\\d+)?(?:xs|sm|md|lg|xl)|left|center|right|justify|start|end|wrap|nowrap|balance|pretty|clip|ellipsis)(?:$|\\s|\\/|!))[^\\s/!]+",
            is_important,
        );
    }
    if target_group_id == "leading" && target_set.contains("font-size") {
        return wrap_token_regex(
            &variant_prefix,
            "(?:leading-[^\\s/!]+|text-(?:xs|sm|base|lg|xl|\\d+(?:\\.\\d+)?(?:xs|sm|md|lg|xl)|\\[(?:length:[^\\]\\s]+|\\d[^\\]\\s]*)\\]|\\(length:[^)\\s]+\\))(?:\\/[^\\s!]+)?)",
            is_important,
        );
    }
    if target_group_id == "border-w" || target_group_id.starts_with("border-w-") {
        let mut bw_branches = Vec::new();
        for g in &target_set {
            match *g {
                "border-w" => bw_branches.push(
                    "border(?:-(?:\\d+|\\[(?:length:)?[^\\]\\s]+\\]|\\(length:[^)\\s]+\\)))?",
                ),
                "border-w-x" => bw_branches.push(
                    "border-x(?:-(?:\\d+|\\[(?:length:)?[^\\]\\s]+\\]|\\(length:[^)\\s]+\\)))?",
                ),
                "border-w-y" => bw_branches.push(
                    "border-y(?:-(?:\\d+|\\[(?:length:)?[^\\]\\s]+\\]|\\(length:[^)\\s]+\\)))?",
                ),
                "border-w-s" => bw_branches.push(
                    "border-s(?:-(?:\\d+|\\[(?:length:)?[^\\]\\s]+\\]|\\(length:[^)\\s]+\\)))?",
                ),
                "border-w-e" => bw_branches.push(
                    "border-e(?:-(?:\\d+|\\[(?:length:)?[^\\]\\s]+\\]|\\(length:[^)\\s]+\\)))?",
                ),
                "border-w-t" => bw_branches.push(
                    "border-t(?:-(?:\\d+|\\[(?:length:)?[^\\]\\s]+\\]|\\(length:[^)\\s]+\\)))?",
                ),
                "border-w-r" => bw_branches.push(
                    "border-r(?:-(?:\\d+|\\[(?:length:)?[^\\]\\s]+\\]|\\(length:[^)\\s]+\\)))?",
                ),
                "border-w-b" => bw_branches.push(
                    "border-b(?:-(?:\\d+|\\[(?:length:)?[^\\]\\s]+\\]|\\(length:[^)\\s]+\\)))?",
                ),
                "border-w-l" => bw_branches.push(
                    "border-l(?:-(?:\\d+|\\[(?:length:)?[^\\]\\s]+\\]|\\(length:[^)\\s]+\\)))?",
                ),
                _ => {}
            }
        }
        if !bw_branches.is_empty() {
            return wrap_token_regex(&variant_prefix, &bw_branches.join("|"), is_important);
        }
    }

    let base_pat = if branches.len() == 1 {
        branches.pop().unwrap()
    } else {
        format!("(?:{})", branches.join("|"))
    };
    wrap_token_regex(&variant_prefix, &base_pat, is_important)
}

fn wrap_token_regex(variant_prefix: &str, base_pat: &str, is_important: bool) -> String {
    if is_important {
        format!(
            "(?:^|\\s){variant_prefix}(?:!(?:-?(?:{base_pat}))|-?(?:{base_pat})(?:\\/[^\\s!]+)?!)(?=$|\\s)"
        )
    } else {
        format!("(?:^|\\s){variant_prefix}-?(?:{base_pat})(?:\\/[^\\s!]+)?(?=$|\\s)")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn merges_basic_padding_and_modifiers() {
        assert_eq!(merge_class_list("p-4 px-2"), "p-4 px-2");
        assert_eq!(merge_class_list("px-2 p-4"), "p-4");
        assert_eq!(merge_class_list("px-3 px-2"), "px-2");
        assert_eq!(
            merge_class_list("hover:bg-red-500 hover:bg-blue-500"),
            "hover:bg-blue-500"
        );
        assert_eq!(
            merge_class_list("hover:focus:bg-red-500 focus:hover:bg-blue-500"),
            "focus:hover:bg-blue-500"
        );
        assert_eq!(
            merge_class_list("text-lg/6 leading-8"),
            "text-lg/6 leading-8"
        );
        assert_eq!(merge_class_list("leading-8 text-lg/6"), "text-lg/6");
    }

    #[test]
    fn synthesizes_conflict_regexes() {
        let px_re = conflict_regex_for_target("", "px");
        assert!(px_re.contains("p"), "{px_re}");
        let hover_bg = conflict_regex_for_target("hover", "bg-color");
        assert!(hover_bg.contains("hover:"), "{hover_bg}");
    }
}
