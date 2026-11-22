//! `StyleProperty`/`Condition` -> CSS text.
//!
//! Grouping/flattening declarations by `Condition` lives in `hozo_ir`
//! (shared with `hozo_native`, which needs the identical rule -- "last
//! wins" only within one condition group). This module is just the
//! Web-specific value/selector formatting on top of that.
//!
//! `Color` stays a Tailwind token through the whole IR (proposal §16 still
//! defers *theme-aware* resolution to a later pass -- custom colors,
//! arbitrary values), but the default Tailwind palette is resolved here via
//! `hozo_ir::resolve_color_token`, emitted as the exact `oklch(...)`
//! string Tailwind's own CSS would produce. A token outside the default
//! palette still falls back to a CSS custom property reference
//! (`var(--hozo-color-x)`, never actually defined anywhere) --
//! correct-but-unresolved, not silently wrong.

pub use axes::{register_candidate_slots, register_split_axes};
pub use color::UNRESOLVED_COLOR_PREFIX;
pub use format::escape_class_selector;
pub use gradient::register_split_gradients;
pub use registers::{axis_register_css, candidate_register_css};
pub use render::render_rule;
pub(crate) use render::{needs_form_owner, render_slot_rule};
pub use selector::{
    conflict_ref_class, expr_ref_class, inexpressible_on_web, state_disabled_ref_class,
};
pub use shadow::register_split_shadows;
// Read from outside `css` only by `web_tests`.
#[cfg(test)]
pub use shape::condition_shape;

mod axes;
mod box_shadow;
mod color;
mod filter;
mod format;
mod gradient;
mod mask;
mod property;
mod registers;
mod render;
mod render_shape;
mod scroll;
mod selector;
mod shadow;
mod shape;
mod spacing;
mod transform;
mod values;

#[cfg(test)]
mod tests;

#[cfg(test)]
mod variant_tests;

#[cfg(test)]
mod platform_setting_tests;

#[cfg(test)]
mod escape_tests;
