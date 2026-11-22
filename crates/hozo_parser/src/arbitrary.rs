//! Tailwind's arbitrary syntax: `w-[32px]`, `bg-(--brand)`, `[color:red]`,
//! `[&>*]:p-4`.
//!
//! Everything else in `tailwind.rs` maps a name Tailwind defined to a value
//! Hozo understands. This module is the opposite: the author has stepped
//! outside the design system and written CSS, and Hozo's job is to carry
//! it through without inventing meaning.
//!
//! It exists mostly because of what happened without it. Utility parsing
//! ends in a colour catch-all -- whatever the specific forms decline
//! becomes a palette token -- so a bracket that no arm recognised fell
//! through to it. `text-[14px]`, a font size, compiled to
//! `color: var(--hozo-color-[14px])`. `w-[32px]` matched nothing at all
//! and vanished. Neither raised a diagnostic, and neither is the kind of
//! wrong you notice in a diff.
//!
//! None of this is visible to the conformance harness either, which is
//! worth stating plainly: its candidate list comes from Tailwind's
//! `getClassList()`, and arbitrary values aren't in it because there are
//! infinitely many. The 100% Web figure was 100% of a catalogue that
//! contained none of this.

use hozo_ir::StyleProperty;

use prefix::from_prefix;
use split::{split, split_property};

mod color;
mod families;
mod length;
mod normalize;
mod prefix;
mod split;

pub use normalize::normalize;
pub use split::split_variant;

/// Whether a class uses arbitrary syntax at all -- brackets, or v4's
/// `(--var)` shorthand, with or without a type hint (`(color:--var)`).
///
/// Deliberately cheap and deliberately over-eager. Its only job is to
/// decide whether failing to parse something deserves a diagnostic, and a
/// bare unknown class must never get one: projects have their own CSS and
/// Hozo has no business complaining about `card-header`. A bracket is
/// different -- it is unambiguously Tailwind being asked for something.
pub fn is_arbitrary(token: &str) -> bool {
    token.contains('[')
        || token.contains("(--")
        // The hinted shorthand has no `(--` in it. Without this it fell
        // through to the colour catch-all as the palette token
        // `(color:--b)` (#1477).
        || (token.contains("-(") && token.ends_with(')'))
}

/// The properties an arbitrary class maps to, or `None` if Hozo can't
/// read it.
///
/// `None` is not "ignore this". The caller reports it, because a bracket
/// is the author asking for something specific and silence is the one
/// answer that helps nobody -- see `DiagnosticCode::UnreadableArbitraryValue`.
pub fn properties(token: &str) -> Option<Vec<StyleProperty>> {
    if let Some((property, value)) = split_property(token) {
        return Some(vec![StyleProperty::Arbitrary(property, value)]);
    }
    let parsed = split(token)?;
    from_prefix(parsed.prefix, &parsed.value, parsed.hint)
}

#[cfg(test)]
mod split_tests;

#[cfg(test)]
mod tests;
