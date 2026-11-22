//! Reading a token's variant prefixes into a condition.

use hozo_ir::{Breakpoint, Condition, ControlState, Environment};

use super::responsive::{container_variant, width_variant};
use super::structural::{structural, FORM_STATES, PSEUDO_ELEMENTS};

/// Strips every recognized `variant:` prefix, innermost last:
/// `md:hover:flex` -> `(All([Responsive(Md), Hover]), "flex")`.
///
/// The loop is the whole point. Stripping one level and handing the rest
/// to the utility parser meant `md:hover:bg-blue-500` compiled to nothing
/// at all, silently -- `hover:bg-blue-500` is not a utility name, so
/// nothing matched and nothing complained.
///
/// Stops at the first prefix it doesn't recognise rather than skipping it,
/// because the remainder may legitimately contain a colon: an arbitrary
/// value can (`bg-[url(https://x)]`), and an unrecognised variant is a
/// gap that should stay visible rather than being silently applied
/// unconditionally.
pub fn parse_variant_prefix(token: &str) -> (Condition, &str) {
    let mut conditions: Vec<Condition> = Vec::new();
    let mut rest = token;
    loop {
        let (condition, tail) = parse_one_variant(rest);
        if condition == Condition::Always {
            break;
        }
        conditions.push(condition);
        rest = tail;
    }
    let condition = match conditions.len() {
        0 => Condition::Always,
        // Not wrapped, so a single variant stays the value it always was
        // and everything that matches on `Condition::Hover` keeps working.
        1 => conditions.pop().expect("length checked"),
        _ => Condition::All(conditions),
    };
    (condition, rest)
}

/// A `data-…` variant's attribute selector, and what follows it.
///
/// Three shapes, all of them Tailwind's: a bare name is presence
/// (`data-open:` is `[data-open]`), a bracketed name without `=` is the
/// same (`data-[foo]:`), and a bracketed `name=value` is quoted unless
/// the author quoted it already (`data-[state=open]:` is
/// `[data-state="open"]`, `data-[state~="a"]:` is left alone).
pub(super) fn data_attribute(rest: &str) -> Option<(String, &str)> {
    if let Some((inner, tail)) = crate::arbitrary::split_variant(rest) {
        let selector = match inner.split_once('=') {
            None => format!("[data-{inner}]"),
            Some((name, value)) if value.starts_with('"') => format!("[data-{name}={value}]"),
            // The operator, if any, rides with the name: `state~` keeps
            // its tilde and `state` has none.
            Some((name, value)) => format!("[data-{name}=\"{value}\"]"),
        };
        return Some((selector, tail));
    }
    let (name, tail) = rest.split_once(':')?;
    if name.is_empty() || !name.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-') {
        return None;
    }
    Some((format!("[data-{name}]"), tail))
}

/// Tailwind's environment variants, with the colon they are written with.
///
/// `dark:` is not here: it predates this and every backend matches on
/// `Condition::Dark` by name, so moving it would be churn for a tidier
/// list.
pub(super) const ENVIRONMENT_VARIANTS: &[(&str, Environment)] = &[
    ("motion-safe:", Environment::MotionSafe),
    ("motion-reduce:", Environment::MotionReduce),
    ("portrait:", Environment::Portrait),
    ("landscape:", Environment::Landscape),
    ("inverted-colors:", Environment::InvertedColors),
    ("ltr:", Environment::Ltr),
    ("rtl:", Environment::Rtl),
    ("contrast-more:", Environment::ContrastMore),
    ("contrast-less:", Environment::ContrastLess),
    ("forced-colors:", Environment::ForcedColors),
    ("print:", Environment::Print),
    ("noscript:", Environment::Noscript),
    ("pointer-fine:", Environment::PointerFine),
    ("pointer-coarse:", Environment::PointerCoarse),
    ("pointer-none:", Environment::PointerNone),
    ("any-pointer-fine:", Environment::AnyPointerFine),
    ("any-pointer-coarse:", Environment::AnyPointerCoarse),
    ("any-pointer-none:", Environment::AnyPointerNone),
    // Not Tailwind's. These four are the accessibility settings React
    // Native reports and Tailwind has no name for, and they are spelled
    // the way Tailwind spells the ones it does have -- after the user
    // preference (`motion-reduce`, `inverted-colors`) rather than after
    // the CSS. `grayscale:` shares a name with the filter utility, which
    // is the arrangement `contrast-more:contrast-125` already has and
    // reads unambiguously for the same reason: a variant is what comes
    // before the colon.
    //
    // They need `@custom-variant` in the project's stylesheet to exist in
    // Tailwind too -- see `scripts/` and decision 003. Adding them here
    // without that would compile classes Tailwind does not, which is the
    // one direction the conformance suite is built to catch.
    ("reduce-transparency:", Environment::ReduceTransparency),
    ("bold-text:", Environment::BoldText),
    ("grayscale:", Environment::Grayscale),
    ("screen-reader:", Environment::ScreenReader),
];

/// Strips one recognized `variant:` prefix, or returns `Always` and the
/// token unchanged.
pub(super) fn parse_one_variant(token: &str) -> (Condition, &str) {
    // Before the named variants, because an arbitrary one can *contain*
    // them: `[&:hover]:p-4` starts with a bracket and would otherwise be
    // cut at the wrong colon.
    if let Some((selector, rest)) = crate::arbitrary::split_variant(token) {
        // An at-rule and a selector wrap a rule differently -- one around
        // it, one through its head -- so which it is has to be decided
        // here, where the text is, rather than by looking for a leading
        // `@` at emit time.
        let condition = if selector.starts_with('@') {
            Condition::ArbitraryAtRule(selector)
        } else {
            Condition::ArbitrarySelector(selector)
        };
        return (condition, rest);
    }
    // `data-…:` is an attribute selector and `supports-[…]:` an
    // `@supports` query; `has-…:` is the third relation, wrapping either
    // an arbitrary selector or another variant.
    if let Some(rest) = token.strip_prefix("data-") {
        if let Some((selector, tail)) = data_attribute(rest) {
            return (Condition::DataAttribute(selector), tail);
        }
    }
    if let Some(rest) = token.strip_prefix("supports-") {
        if let Some((query, tail)) = crate::arbitrary::split_variant(rest) {
            return (Condition::Supports(query), tail);
        }
    }
    if let Some(rest) = token.strip_prefix("has-") {
        // The arbitrary form first, because a bracket can contain a colon
        // and would otherwise be cut at the wrong one.
        if let Some((selector, tail)) = crate::arbitrary::split_variant(rest) {
            return (Condition::HasSelector(selector), tail);
        }
        let (condition, tail) = parse_one_variant(rest);
        // `is_queryable` rather than `is_ambient`, which differ on exactly
        // one condition: `has-starting:` would have to mean "has a
        // descendant that is having its first frame", and Tailwind emits
        // nothing for it.
        if condition.is_elemental() || condition.is_queryable() {
            return (Condition::Has(Box::new(condition)), tail);
        }
    }
    // `not-` negates whatever follows, by the same recursion. A condition
    // that is both a query and a selector negates into two rules, which
    // is what `not-hover:` is -- `:not(:hover)`, plus a rule for a device
    // where nothing is ever hovered.
    if let Some(inner) = token.strip_prefix("not-") {
        let (condition, tail) = parse_one_variant(inner);
        if condition != Condition::Always && condition.is_negatable() {
            return (Condition::Not(Box::new(condition)), tail);
        }
    }
    // `group-` and `peer-` wrap whatever variant follows them, so they
    // are parsed by recursion rather than by a list of the combinations.
    // An inner variant Hozo does not know leaves `Always`, and the token
    // falls through to the unsupported-variant diagnostic whole.
    // `in-` is the same relation with no marker. `in-range:` is a form
    // state of its own; `range:` is not a variant, so the recursion leaves
    // `Always` and it falls through to the table below.
    if let Some(inner) = token.strip_prefix("in-") {
        let (condition, tail) = parse_one_variant(inner);
        if condition.is_elemental() {
            return (Condition::In(Box::new(condition)), tail);
        }
    }
    for (prefix, wrap) in [("group-", true), ("peer-", false)] {
        if let Some(inner) = token.strip_prefix(prefix) {
            let (condition, tail) = parse_one_variant(inner);
            if condition.is_elemental() {
                return (
                    if wrap {
                        Condition::Group(Box::new(condition))
                    } else {
                        Condition::Peer(Box::new(condition))
                    },
                    tail,
                );
            }
        }
    }
    if let Some(rest) = token.strip_prefix("hover:") {
        return (Condition::Hover, rest);
    }
    if let Some(rest) = token.strip_prefix("focus:") {
        return (Condition::Focus, rest);
    }
    if let Some(rest) = token.strip_prefix("disabled:") {
        return (Condition::Disabled, rest);
    }
    if let Some(rest) = token.strip_prefix("enabled:") {
        return (Condition::Enabled, rest);
    }
    if let Some(rest) = token.strip_prefix("focus-visible:") {
        return (Condition::FocusVisible, rest);
    }
    // `aria-checked:`, `aria-expanded:` and the rest. The list of states
    // comes from Tailwind rather than from a set of names that looked
    // complete -- every one is an ARIA attribute with a `"true"`/`"false"`
    // value, which is why there is a shortlist at all: `aria-sort` takes
    // four words and is written `aria-[sort=ascending]:` instead.
    if let Some(rest) = token.strip_prefix("aria-") {
        // Tailwind does not name `aria-invalid:` by default. Its exact
        // attribute-value spelling shares our boolean ARIA condition; do
        // not invent a shorthand or pretend all arbitrary ARIA is supported.
        if let Some(tail) = rest.strip_prefix("[invalid=true]:") {
            return (Condition::Aria("invalid".to_string()), tail);
        }
        if let Some((state, tail)) = rest.split_once(':') {
            if crate::tailwind_variants::ARIA_VARIANT_STATES.contains(&state) {
                return (Condition::Aria(state.to_string()), tail);
            }
        }
    }
    // `pressed:` is Hozo's own name, kept because it is the one that
    // reads correctly on a device. `active:` is Tailwind's for the same
    // state, and refusing it would mean a Tailwind class that compiles
    // everywhere except here.
    if let Some(rest) = token
        .strip_prefix("pressed:")
        .or_else(|| token.strip_prefix("active:"))
    {
        return (Condition::Pressed, rest);
    }
    // One table rather than a branch each: these differ only in which
    // query they are, and the names are Tailwind's.
    for (name, query) in ENVIRONMENT_VARIANTS {
        if let Some(rest) = token.strip_prefix(name) {
            return (Condition::Environment(*query), rest);
        }
    }
    if let Some(rest) = token.strip_prefix("dark:") {
        return (Condition::Dark, rest);
    }
    if let Some(rest) = token.strip_prefix("first:") {
        return (Condition::FirstChild, rest);
    }
    if let Some(rest) = token.strip_prefix("last:") {
        return (Condition::LastChild, rest);
    }
    if let Some(rest) = token.strip_prefix("focus-within:") {
        return (Condition::FocusWithin, rest);
    }
    if let Some(rest) = token.strip_prefix("target:") {
        return (Condition::Target, rest);
    }
    if let Some(rest) = token.strip_prefix("open:") {
        return (Condition::Open, rest);
    }
    for state in [
        ControlState::Checked,
        ControlState::Indeterminate,
        ControlState::Default,
    ] {
        if let Some(rest) = token
            .strip_prefix(state.variant_name())
            .and_then(|rest| rest.strip_prefix(':'))
        {
            return (Condition::Control(state), rest);
        }
    }
    if let Some(rest) = token.strip_prefix("inert:") {
        return (Condition::Inert, rest);
    }
    if let Some(rest) = token.strip_prefix("visited:") {
        return (Condition::Visited, rest);
    }
    if let Some(rest) = token.strip_prefix("starting:") {
        return (Condition::StartingStyle, rest);
    }
    if let Some((structural, rest)) = structural(token) {
        return (Condition::Structural(structural), rest);
    }
    for (name, pseudo) in PSEUDO_ELEMENTS {
        if let Some(rest) = token.strip_prefix(name) {
            return (Condition::PseudoElement(*pseudo), rest);
        }
    }
    // Longest name first: `read-only:` also starts with `read`, and
    // `user-invalid:` with `user`.
    for (name, state) in FORM_STATES {
        if let Some(rest) = token.strip_prefix(name) {
            return (Condition::FormState(*state), rest);
        }
    }
    // Before the container variants, which also start with a character
    // that is not a letter -- and before anything that could read `*` as
    // part of a utility name.
    if let Some(rest) = token.strip_prefix("**:") {
        return (Condition::Subtree { direct: false }, rest);
    }
    if let Some(rest) = token.strip_prefix("*:") {
        return (Condition::Subtree { direct: true }, rest);
    }
    if let Some((condition, rest)) = container_variant(token) {
        return (condition, rest);
    }
    if let Some((condition, rest)) = width_variant(token) {
        return (condition, rest);
    }
    if let Some(rest) = token.strip_prefix("sm:") {
        return (Condition::Responsive(Breakpoint::Sm), rest);
    }
    if let Some(rest) = token.strip_prefix("md:") {
        return (Condition::Responsive(Breakpoint::Md), rest);
    }
    if let Some(rest) = token.strip_prefix("lg:") {
        return (Condition::Responsive(Breakpoint::Lg), rest);
    }
    if let Some(rest) = token.strip_prefix("xl:") {
        return (Condition::Responsive(Breakpoint::Xl), rest);
    }
    if let Some(rest) = token.strip_prefix("2xl:") {
        return (Condition::Responsive(Breakpoint::Xl2), rest);
    }
    (Condition::Always, token)
}
