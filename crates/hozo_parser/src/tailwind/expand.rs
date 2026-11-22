//! Expanding a class into conditioned properties, memoized per token.

use std::cell::RefCell;
use std::collections::HashMap;

use hozo_ir::{Condition, StyleProperty};

use super::negate::expand_negatable;
use super::variant::parse_variant_prefix;

/// How many distinct tokens the memo below holds before starting over.
///
/// A project's class vocabulary is bounded by its source, so this is
/// insurance against a generated one rather than a limit anybody should
/// reach. Clearing wholesale instead of evicting is deliberate: refilling
/// an entry costs 1.4us, which is not worth the machinery of deciding
/// which entry deserved to stay.
pub(super) const MEMO_LIMIT: usize = 65_536;

thread_local! {
    /// What each token expanded to, remembered for the next time it appears.
    ///
    /// Sound because this is a pure function of the token and nothing else:
    /// `hozo_parser` never sees a `Theme` -- `p-4` is `Spacing(4.0)` here and
    /// the multiplier is applied in the backends, for the same reason
    /// `Color::Token` keeps the name -- and there is no other state in the
    /// crate to depend on. Both were checked rather than assumed.
    ///
    /// Worth it because the dispatch below is a ladder of 165 `strip_prefix`
    /// checks ending in linear scans of a 304-entry keyword table, and a real
    /// application writes `flex` and `p-4` thousands of times. Measured at
    /// 1.386us to expand a token against 0.115us to clone a remembered one --
    /// twelve times, and the report used to prove it: compiling a file whose
    /// components all carried the *same* classes took exactly as long as one
    /// where they all differed, which is what a missing memo looks like.
    ///
    /// Thread-local rather than a shared map behind a lock. Nothing here is
    /// worth contending for: an entry is small, refilling is a microsecond,
    /// and a lock on the hottest function in the compiler would cost more
    /// than the duplication.
    static EXPANDED: RefCell<HashMap<String, (Condition, Vec<StyleProperty>)>> =
        RefCell::new(HashMap::new());
}

/// The real entry point used by the JSX walker: strips a variant prefix
/// (if any) and expands the remaining base utility, returning the
/// condition that prefix implies alongside the properties it maps to.
pub fn expand_utility(token: &str) -> (Condition, Vec<StyleProperty>) {
    EXPANDED.with(|memo| {
        if let Some(remembered) = memo.borrow().get(token) {
            return remembered.clone();
        }
        let expanded = expand_utility_uncached(token);
        let mut memo = memo.borrow_mut();
        if memo.len() >= MEMO_LIMIT {
            memo.clear();
        }
        memo.insert(token.to_string(), expanded.clone());
        expanded
    })
}

pub(super) fn expand_utility_uncached(token: &str) -> (Condition, Vec<StyleProperty>) {
    let (condition, base) = parse_variant_prefix(token);
    (condition, expand_negatable(base))
}

/// Every condition/properties group one class token produces.
///
/// Almost always exactly one, which is why `expand_utility` returns a
/// single pair and everything is written against it. `container` is the
/// exception: it is `width: 100%` plus a max-width at each breakpoint, so
/// one token writes six conditions.
///
/// Handled by expanding it into the tokens it stands for rather than by
/// teaching the parser to return several conditions. That keeps one code
/// path -- each piece is parsed exactly as if the author had written it --
/// and it makes `md:container` fall out for free, since the variant
/// prefix rides along and `Condition::All` nests the two width queries the
/// way Tailwind does.
pub fn expand_class(token: &str) -> Vec<(Condition, Vec<StyleProperty>)> {
    // Parsing a value is not implementing !important. Preserve the original
    // token for the common diagnostic; never turn it into a normal write.
    if crate::important::normalized(token).is_some() {
        return Vec::new();
    }
    match expand_shorthand(token) {
        Some(tokens) => tokens.iter().map(|token| expand_utility(token)).collect(),
        None => vec![expand_utility(token)],
    }
}

/// The tokens a shorthand utility stands for, with its own variant prefix
/// carried onto each.
///
/// The max-widths are literal `rem` values rather than the `max-w-*` scale,
/// which is a different set of numbers: `max-w-sm` is 24rem and the `sm`
/// container is 40rem. They track the *breakpoints*, and Hozo's
/// breakpoints are still fixed -- when they become theme values these
/// should follow them there.
pub(super) fn expand_shorthand(token: &str) -> Option<Vec<String>> {
    const CONTAINER: &[&str] = &[
        "w-full",
        "sm:max-w-[40rem]",
        "md:max-w-[48rem]",
        "lg:max-w-[64rem]",
        "xl:max-w-[80rem]",
        "2xl:max-w-[96rem]",
    ];
    // Cheap rejection first. `parse_variant_prefix` walks the whole variant
    // table and every token that is not `container` was paying for it just
    // to be told so -- 14% of `expand_class`, on a question a nine-byte
    // suffix check answers. The base is what remains after the prefixes are
    // stripped, so it is always a suffix of the token.
    if !token.ends_with("container") {
        return None;
    }
    let (_, base) = parse_variant_prefix(token);
    if base != "container" {
        return None;
    }
    let prefix = &token[..token.len() - base.len()];
    Some(
        CONTAINER
            .iter()
            .map(|part| format!("{prefix}{part}"))
            .collect(),
    )
}
