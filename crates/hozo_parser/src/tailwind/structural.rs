//! Structural, form-state and pseudo-element variants.

use hozo_ir::{FormState, PseudoElement, Structural};

/// The structural variants, in the order their names would shadow one
/// another.
///
/// Longest prefix first, because `nth-last-of-type-3:` also starts with
/// `nth-` and `nth-last-`. Read out of Tailwind's output rather than its
/// documentation, which is where the shape of the argument came from:
/// `nth-3:` takes a bare number and `nth-[2n+1]:` a bracketed formula, and
/// both end up inside the same `:nth-child()`.
pub(super) fn structural(token: &str) -> Option<(Structural, &str)> {
    for (name, of_type) in [("only-of-type:", true), ("only:", false)] {
        if let Some(rest) = token.strip_prefix(name) {
            return Some((Structural::Only { of_type }, rest));
        }
    }
    for (name, last) in [("first-of-type:", false), ("last-of-type:", true)] {
        if let Some(rest) = token.strip_prefix(name) {
            return Some((Structural::Edge { last }, rest));
        }
    }
    if let Some(rest) = token.strip_prefix("empty:") {
        return Some((Structural::Empty, rest));
    }
    // Tailwind's two named formulas. Not `nth-odd:`.
    for name in ["odd", "even"] {
        if let Some(rest) = token.strip_prefix(name).and_then(|r| r.strip_prefix(':')) {
            return Some((
                Structural::Nth {
                    of_type: false,
                    from_end: false,
                    formula: name.to_string(),
                },
                rest,
            ));
        }
    }
    for (prefix, of_type, from_end) in [
        ("nth-last-of-type-", true, true),
        ("nth-of-type-", true, false),
        ("nth-last-", false, true),
        ("nth-", false, false),
    ] {
        let Some(argument) = token.strip_prefix(prefix) else {
            continue;
        };
        let (formula, rest) = nth_argument(argument)?;
        return Some((
            Structural::Nth {
                of_type,
                from_end,
                formula,
            },
            rest,
        ));
    }
    None
}

/// An `nth-…` variant's argument, bracketed or bare.
///
/// `None` for anything that is neither, which leaves the token to be
/// reported as an unsupported variant rather than compiled into a
/// `:nth-child()` whose argument the browser would throw away.
pub(super) fn nth_argument(argument: &str) -> Option<(String, &str)> {
    if let Some((inner, rest)) = crate::arbitrary::split_variant(argument) {
        return Some((inner, rest));
    }
    let (formula, rest) = argument.split_once(':')?;
    // A bare argument is a plain child number. Anything else -- a formula
    // written without brackets -- is not something Tailwind accepts either.
    if formula.is_empty() || !formula.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    Some((formula.to_string(), rest))
}

/// The form-state variants, with their names spelled out.
///
/// Derived from `FormState::variant_name` at the point of use would read
/// better and cannot be done: matching a prefix needs the trailing colon,
/// and a `const` cannot concatenate. Written out, and kept honest by a
/// test that walks both.
pub(super) const FORM_STATES: &[(&str, FormState)] = &[
    ("placeholder-shown:", FormState::PlaceholderShown),
    ("out-of-range:", FormState::OutOfRange),
    ("user-invalid:", FormState::UserInvalid),
    ("user-valid:", FormState::UserValid),
    ("read-only:", FormState::ReadOnly),
    ("in-range:", FormState::InRange),
    ("required:", FormState::Required),
    ("optional:", FormState::Optional),
    ("autofill:", FormState::Autofill),
    ("invalid:", FormState::Invalid),
    ("valid:", FormState::Valid),
];

/// The pseudo-element variants.
///
/// Before the form states in `parse_one_variant`, because
/// `placeholder:` and `placeholder-shown:` share a prefix and the
/// element has to win: `placeholder-shown:` is checked first inside its
/// own table, and `placeholder:` here would otherwise take the front of
/// it. Longest-first within the table for `first-letter`/`first-line`.
pub(super) const PSEUDO_ELEMENTS: &[(&str, PseudoElement)] = &[
    ("placeholder:", PseudoElement::Placeholder),
    ("first-letter:", PseudoElement::FirstLetter),
    ("first-line:", PseudoElement::FirstLine),
    ("selection:", PseudoElement::Selection),
    ("backdrop:", PseudoElement::Backdrop),
    ("before:", PseudoElement::Before),
    ("marker:", PseudoElement::Marker),
    ("after:", PseudoElement::After),
    ("file:", PseudoElement::File),
    ("details-content:", PseudoElement::DetailsContent),
];
