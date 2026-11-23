//! What a rule's selector says: the root it styles, its child scope, the
//! owner state it reads, and how much it weighs.

use super::*;

/// Tailwind's `space-*` selector. It is all inside `:where()`, the class
/// too, so it weighs nothing.
pub(crate) const CHILD_SCOPE: &str = ":where(& > :not(:last-child))";

/// Writes that land on the element's children, owned only by a
/// [`CHILD_SCOPE`] rule and never by the element's own.
pub(crate) fn child_scoped(write: &StyleProperty) -> bool {
    matches!(
        write,
        StyleProperty::SpaceX(_)
            | StyleProperty::SpaceY(_)
            | StyleProperty::SpaceReverse(_)
            | StyleProperty::DivideX(_)
            | StyleProperty::DivideY(_)
            | StyleProperty::DivideColor(_)
            | StyleProperty::DivideStyle(_)
            | StyleProperty::DivideReverse(_)
    )
}

/// Match Tailwind's escaped root literally, not a substring of another
/// selector. Only ASCII candidates are assessed in this initial domain.
pub(crate) fn root_selector(candidate: &str) -> Option<String> {
    if candidate.is_empty() || !candidate.is_ascii() {
        return None;
    }
    let mut out = String::from(".");
    for (index, byte) in candidate.bytes().enumerate() {
        if byte == 0 || byte < 32 || byte == 127 {
            return None;
        }
        if byte.is_ascii_digit() && (index == 0 || (index == 1 && candidate.starts_with('-'))) {
            out.push_str(&format!("\\{byte:x} "));
        } else if byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-' {
            if candidate == "-" {
                out.push('\\');
            }
            out.push(byte as char);
        } else {
            out.push('\\');
            out.push(byte as char);
        }
    }
    Some(out)
}

/// The interaction and boolean ARIA selectors whose facts an owner delivers.
pub(crate) fn owner_selector(selector: &str) -> Option<usize> {
    match selector {
        "&:hover" => Some(0),
        "&:focus" => Some(1),
        "&:focus-visible" => Some(2),
        "&:active" => Some(3),
        "&:disabled" => Some(4),
        "&:not(*:hover)" => negated_interaction_index(0),
        "&:not(*:focus)" => negated_interaction_index(1),
        "&:not(*:focus-visible)" => negated_interaction_index(2),
        "&:not(*:active)" => negated_interaction_index(3),
        "&:not(*:disabled)" => negated_interaction_index(4),
        _ => selector
            .strip_prefix("&[aria-")
            .and_then(|tail| tail.strip_suffix("=\"true\"]"))
            .and_then(aria_owner_index)
            .or_else(|| {
                selector
                    .strip_prefix("&:not(*[aria-")
                    .and_then(|tail| tail.strip_suffix("=\"true\"])"))
                    .and_then(negated_aria_owner_index)
            }),
    }
}

/// A condition on the element itself whose weight is read from a closed
/// set of shapes, never counted from colons (#1230). Anything else -- a
/// relation, a list, a pseudo-element, `:visited` -- stays unassessed.
///
/// - one bare pseudo-class, `&:first-child`: one class weight;
/// - `&:nth-child(odd)` and the other three `nth` forms: one;
/// - one `data-` attribute, `&[data-state="open"]`: one;
/// - Tailwind's own `open:` and `inert:` spellings: one, from the
///   attribute inside `:is()`;
/// - Tailwind's `ltr:`/`rtl:`, wrapped in `:where()`: none;
/// - a relation around one of those weighing one, or around an owner
///   state (`:hover`, `[aria-checked="true"]`): `group-` and `peer-`
///   inside `:is()` and `has-` inside `:has(*…)` weigh what the inner
///   compound weighs, one; `in-` is `:where(*…) &` and weighs none.
pub(crate) fn element_selector_weight(selector: &str) -> Option<u32> {
    // `:is()` and `:has()` take their argument's weight and `:where(.group)`
    // adds none, so the relation weighs exactly its inner compound.
    let inner = |inner: &str| {
        let compound = format!("&{inner}");
        (owner_selector(&compound).is_some() || compound_selector_weight(&compound) == Some(1))
            .then_some(1)
    };
    if let Some(rest) = selector
        .strip_prefix("&:is(:where(.group)")
        .and_then(|rest| rest.strip_suffix(" *)"))
        .or_else(|| {
            selector
                .strip_prefix("&:is(:where(.peer)")
                .and_then(|rest| rest.strip_suffix(" ~ *)"))
        })
        .or_else(|| {
            selector
                .strip_prefix("&:has(*")
                .and_then(|rest| rest.strip_suffix(')'))
        })
    {
        return inner(rest);
    }
    if let Some(rest) = selector
        .strip_prefix(":where(*")
        .and_then(|rest| rest.strip_suffix(") &"))
    {
        return inner(rest).map(|_| 0);
    }
    // `not-<x>:` is `&:not(*<x>)`, which weighs what its argument does:
    // one for `*:empty`, none for `*:where(:dir(ltr), …)`.
    if let Some(rest) = selector
        .strip_prefix("&:not(*")
        .and_then(|rest| rest.strip_suffix(')'))
    {
        return compound_selector_weight(&format!("&{rest}"));
    }
    compound_selector_weight(selector)
}

/// The element's own compound, without a relation: a relation never nests.
pub(super) fn compound_selector_weight(selector: &str) -> Option<u32> {
    // `*:` and `**:` move the class inside `:is()`, which weighs what the
    // class does, so they add nothing to it.
    const WEIGHTLESS: [&str; 4] = [
        "&:where(:dir(ltr), [dir=\"ltr\"], [dir=\"ltr\"] *)",
        "&:where(:dir(rtl), [dir=\"rtl\"], [dir=\"rtl\"] *)",
        ":is(& > *)",
        ":is(& *)",
    ];
    const ONE: [&str; 2] = [
        "&:is([open], :popover-open, :open)",
        "&:is([inert], [inert] *)",
    ];
    if WEIGHTLESS.contains(&selector) {
        return Some(0);
    }
    if ONE.contains(&selector) {
        return Some(1);
    }
    let name = |text: &str| {
        !text.is_empty()
            && text
                .bytes()
                .all(|byte| byte.is_ascii_lowercase() || byte == b'-')
    };
    if let Some(pseudo) = selector.strip_prefix("&:") {
        if name(pseudo) && pseudo != "visited" {
            return Some(1);
        }
        for function in [
            "nth-child(",
            "nth-last-child(",
            "nth-of-type(",
            "nth-last-of-type(",
        ] {
            if let Some(formula) = pseudo
                .strip_prefix(function)
                .and_then(|rest| rest.strip_suffix(')'))
            {
                return (!formula.is_empty()
                    && formula
                        .bytes()
                        .all(|byte| byte.is_ascii_alphanumeric() || byte == b'+' || byte == b'-'))
                .then_some(1);
            }
        }
        return None;
    }
    let attribute = selector.strip_prefix("&[data-")?.strip_suffix(']')?;
    let (attribute, value) = match attribute.split_once('=') {
        None => (attribute, None),
        Some((attribute, value)) => (attribute, Some(value)),
    };
    let quoted = |value: &str| {
        value
            .strip_prefix('"')
            .and_then(|value| value.strip_suffix('"'))
            .is_some_and(|inner| !inner.contains(['"', '\\', ']']))
    };
    let plain = !attribute.is_empty()
        && attribute
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-');
    (plain && value.is_none_or(quoted)).then_some(1)
}

/// The pseudo-elements whose rule is read as a condition on the element.
/// Only `::placeholder`: Native carries it as `TextInput`'s
/// `placeholderTextColor`, which takes the last colour written, so the
/// ranked winner is the one it sees. Others need their own delivery proof
/// (`::backdrop` becomes a Native slot's unconditional style).
pub(super) const PSEUDO_ELEMENTS: [&str; 1] = ["&::placeholder"];
