//! Breakpoint, width and container query variants.

use hozo_ir::{Breakpoint, Condition};

/// The named breakpoints, and the widths they stand for.
pub(super) const BREAKPOINTS: &[(&str, Breakpoint, u32)] = &[
    ("sm", Breakpoint::Sm, 640),
    ("md", Breakpoint::Md, 768),
    ("lg", Breakpoint::Lg, 1024),
    ("xl", Breakpoint::Xl, 1280),
    ("2xl", Breakpoint::Xl2, 1536),
];

/// `min-…:` and `max-…:`, either named or an arbitrary length.
///
/// `min-<bp>:` returns the plain `Responsive` rather than a `Width`,
/// because Tailwind emits exactly what the bare breakpoint emits -- the
/// two are one condition spelled twice, and keeping them as one is what
/// lets React Native reuse its cheap bucketed hook for both.
///
/// Ordered so `2xl` is tried before `xl`: `max-2xl:` starts with neither
/// prefix cleanly, and a shorter name matching first would leave a `2`
/// where the colon should be. Handled by requiring the colon, which is
/// also what keeps `min-w-0` and `max-h-[50px]` out of here -- neither has
/// one after the prefix.
pub(super) fn width_variant(token: &str) -> Option<(Condition, &str)> {
    for (prefix, at_least) in [("min-", true), ("max-", false)] {
        let Some(after) = token.strip_prefix(prefix) else {
            continue;
        };
        if let Some((value, rest)) = crate::arbitrary::split_variant(after) {
            return Some((Condition::Width { at_least, value }, rest));
        }
        for (name, breakpoint, px) in BREAKPOINTS {
            let Some(rest) = after.strip_prefix(name).and_then(|r| r.strip_prefix(':')) else {
                continue;
            };
            return Some(if at_least {
                (Condition::Responsive(*breakpoint), rest)
            } else {
                (
                    Condition::Width {
                        at_least,
                        value: format!("{px}px"),
                    },
                    rest,
                )
            });
        }
    }
    None
}

/// Tailwind's container scale, which is not the viewport scale.
///
/// `@sm` is 24rem where `sm` is 40rem, and five of the names are shared.
/// Two scales sharing five names is a trap worth stating rather than
/// leaving to be discovered.
///
/// In px, as the viewport breakpoints are: these are Tailwind's own
/// numbers rather than a length the author wrote, so resolving the name
/// is Hozo's job and not the browser's. It is also what lets React Native
/// answer them at all -- there is no root font size on a device, and an
/// author who writes `@min-[40rem]:` is stating a CSS length and gets the
/// CSS answer, which is that Native reports it.
pub(super) const CONTAINER_SIZES: &[(&str, &str)] = &[
    ("7xl", "1280px"),
    ("6xl", "1152px"),
    ("5xl", "1024px"),
    ("4xl", "896px"),
    ("3xl", "768px"),
    ("2xl", "672px"),
    ("3xs", "256px"),
    ("2xs", "288px"),
    ("xs", "320px"),
    ("sm", "384px"),
    ("md", "448px"),
    ("lg", "512px"),
    ("xl", "576px"),
];

/// `@sm:`, `@min-md:`, `@max-[400px]:`, and the `/name` forms.
///
/// Ordered so a two-character name is tried before the one-character one
/// it ends with: `@2xl` before `@xl`, `@3xs` before `@xs`. The table
/// above is in that order and the search follows it.
pub(super) fn container_variant(token: &str) -> Option<(Condition, &str)> {
    let after = token.strip_prefix('@')?;
    // `@container` is a utility, not a variant, and it has no colon.
    for (prefix, at_least) in [("min-", true), ("max-", false), ("", true)] {
        let Some(rest) = after.strip_prefix(prefix) else {
            continue;
        };
        if let Some((value, tail)) = container_argument(rest) {
            let (name, tail) = container_name(tail)?;
            return Some((
                Condition::Container {
                    name,
                    at_least,
                    value,
                },
                tail,
            ));
        }
    }
    None
}

/// A container variant's size: a bracketed length, or one of the names.
///
/// The bracket is split here rather than by `arbitrary::split_variant`,
/// which consumes the colon after it. A container variant may carry a
/// `/name` between the two -- `@min-[400px]/main:` -- so what follows the
/// bracket has to be handed back intact.
pub(super) fn container_argument(rest: &str) -> Option<(String, &str)> {
    if rest.starts_with('[') {
        let end = rest.find(']')?;
        let inner = crate::arbitrary::normalize(&rest[1..end]);
        if inner.is_empty() {
            return None;
        }
        return Some((inner, &rest[end + 1..]));
    }
    for (name, size) in CONTAINER_SIZES {
        if let Some(tail) = rest.strip_prefix(name) {
            // Either the colon, or the `/name` before it.
            if tail.starts_with(':') || tail.starts_with('/') {
                return Some(((*size).to_string(), tail));
            }
        }
    }
    None
}

/// The `/name` a container variant may carry, and what follows the colon.
pub(super) fn container_name(tail: &str) -> Option<(Option<String>, &str)> {
    let Some(named) = tail.strip_prefix('/') else {
        return tail.strip_prefix(':').map(|rest| (None, rest));
    };
    let (name, rest) = named.split_once(':')?;
    if name.is_empty() {
        return None;
    }
    Some((Some(name.to_string()), rest))
}
