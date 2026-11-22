//! A token taken apart into its prefix, bracket and type hint.

use super::normalize::normalize;

/// Tailwind's data-type hints: `text-[length:14px]` says "this is a size,
/// not a colour" where the value's shape alone would be ambiguous.
///
/// A closed list because position isn't enough to tell a hint from part of
/// the value -- `bg-[url(https://x)]` has a colon in it too, and reading
/// `url(https` as a hint would leave `//x)` as the value.
pub(super) const HINTS: &[&str] = &[
    "length",
    "color",
    "image",
    "url",
    "percentage",
    "number",
    "integer",
    "angle",
    "ratio",
    "position",
    "bg-size",
    "line-width",
    "family-name",
    "generic-name",
    "absolute-size",
    "relative-size",
    "vector",
];

/// A token split into what it targets and what it says.
pub struct Arbitrary<'a> {
    /// The utility name: `w`, `bg`, `grid-cols`.
    pub prefix: &'a str,
    /// The value as CSS, normalized.
    pub value: String,
    /// The declared data type, where the source gave one.
    pub hint: Option<&'a str>,
}

/// Splits `prefix-[value]` or v4's `prefix-(--var)` shorthand.
///
/// The shorthand is sugar and treated as such: `bg-(--brand)` becomes the
/// value `var(--brand)` and then follows exactly the same path as
/// `bg-[var(--brand)]`, so there is one implementation of what a custom
/// property means rather than two that can drift.
pub fn split(token: &str) -> Option<Arbitrary<'_>> {
    let (prefix, inner, is_var) = if let Some(body) = token.strip_suffix(']') {
        let cut = body.find("-[")?;
        (&body[..cut], &body[cut + 2..], false)
    } else {
        let body = token.strip_suffix(')')?;
        let cut = body.find("-(")?;
        (&body[..cut], &body[cut + 2..], true)
    };

    let (hint, rest) = match inner.split_once(':') {
        Some((candidate, rest)) if HINTS.contains(&candidate) => (Some(candidate), rest),
        _ => (None, inner),
    };

    // The shorthand only ever names a custom property. Anything else in
    // those parens is not this syntax, and guessing would mean compiling
    // something Tailwind doesn't.
    if is_var && !rest.starts_with("--") {
        return None;
    }
    let value = if is_var {
        format!("var({})", normalize(rest))
    } else {
        normalize(rest)
    };
    Some(Arbitrary {
        prefix,
        value,
        hint,
    })
}

/// A whole class that is one declaration: `[color:red]`, `[--gap:4px]`.
///
/// Returns the property and its value. The property name is checked only
/// for shape -- a CSS identifier, or a custom property -- because the set
/// of real CSS properties is both large and always growing, and a compiler
/// that rejected next year's property would be worse than one that passed
/// through a typo.
pub fn split_property(token: &str) -> Option<(String, String)> {
    let inner = token.strip_prefix('[')?.strip_suffix(']')?;
    let (property, value) = inner.split_once(':')?;
    let valid = property.starts_with("--")
        || (property.starts_with(|c: char| c.is_ascii_alphabetic())
            && property
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-'));
    if !valid || value.is_empty() {
        return None;
    }
    Some((property.to_string(), normalize(value)))
}

/// Splits an arbitrary *variant*: `[&>*]:p-4`, `[@media(print)]:hidden`.
///
/// Bracket-aware rather than a split on the first colon, which would cut
/// `[&:hover]:p-4` in the middle of its own selector.
pub fn split_variant(token: &str) -> Option<(String, &str)> {
    if !token.starts_with('[') {
        return None;
    }
    let mut depth = 0usize;
    for (index, ch) in token.char_indices() {
        match ch {
            '[' => depth += 1,
            ']' => {
                depth -= 1;
                if depth == 0 {
                    let rest = token[index + 1..].strip_prefix(':')?;
                    // An empty rest is `[&>*]:` with nothing after it,
                    // which is not a utility.
                    if rest.is_empty() {
                        return None;
                    }
                    return Some((normalize(&token[1..index]), rest));
                }
            }
            _ => {}
        }
    }
    None
}

// ---------------------------------------------------------------------------
// Turning a split token into properties
// ---------------------------------------------------------------------------
