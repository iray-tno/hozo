//! Maps a single Tailwind utility class token to a `hozo_ir::StyleProperty`.
//!
//! Phase 0 scope only (proposal §13): flex layout, spacing, color,
//! typography. Unrecognized tokens return `None` rather than erroring --
//! callers decide what to do with an unmapped utility (Phase 0: drop it).

/// Re-exported so callers can ask "was this class asking for something?"
/// without reaching past this module for the answer.
pub use crate::arbitrary::is_arbitrary;
pub use expand::{expand_class, expand_utility};
pub(crate) use gradient::mask_slots;
pub use utility::parse_utility;
pub use variant::parse_variant_prefix;
pub use variant_support::{carried_writes, has_unstripped_variant, unsupported_variant_name};

mod base;
mod border;
mod border_width;
mod color_family;
mod dimension;
mod expand;
mod extended;
mod filter;
mod gradient;
mod keyword_table;
mod keywords;
mod layout;
mod negate;
mod paint;
mod radius;
mod responsive;
mod spacing;
mod structural;
mod transform;
mod typography;
mod utility;
mod variant;
mod variant_support;

/// The property lists Tailwind's `transition`/`transition-colors` expand
/// to, copied verbatim so the emitted CSS matches. Long, but that's what
/// the utility means -- shortening it would change behaviour.
const DEFAULT_TRANSITION_PROPERTIES: &str =
    "color, background-color, border-color, outline-color, \
    text-decoration-color, fill, stroke, --tw-gradient-from, --tw-gradient-via, --tw-gradient-to, \
    opacity, box-shadow, transform, translate, scale, rotate, filter, -webkit-backdrop-filter, \
    backdrop-filter, display, content-visibility, overlay, pointer-events";

const COLOR_TRANSITION_PROPERTIES: &str = "color, background-color, border-color, outline-color, \
    text-decoration-color, fill, stroke, --tw-gradient-from, --tw-gradient-via, --tw-gradient-to";

/// Tailwind's `--default-transition-*`, applied by every `transition-*`
/// utility unless an explicit `duration-*`/`ease-*` overrides them.
pub(crate) const DEFAULT_TRANSITION_TIMING: &str = "cubic-bezier(0.4, 0, 0.2, 1)";
pub(crate) const DEFAULT_TRANSITION_DURATION_MS: u32 = 150;

fn parse_transition_properties(token: &str) -> Option<&'static str> {
    Some(match token {
        "transition" => DEFAULT_TRANSITION_PROPERTIES,
        "transition-colors" => COLOR_TRANSITION_PROPERTIES,
        "transition-opacity" => "opacity",
        "transition-transform" => "transform, translate, scale, rotate",
        "transition-shadow" => "box-shadow",
        "transition-all" => "all",
        "transition-none" => "none",
        _ => return None,
    })
}

#[cfg(test)]
mod platform_setting_tests;
#[cfg(test)]
mod tests;
#[cfg(test)]
mod unsupported_variant_tests;
