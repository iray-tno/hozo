//! Hozo IR to DOM/CSS/ARIA lowering (Web backend).
//!
//! Emits per-node scoped CSS classes rather than deduplicating/reusing
//! atomic utility classes across call sites -- a constraint carried over
//! from the cascade-ordering design discussion, since it's what lets
//! simple source-order-within-condition flattening (see `css.rs`) stay
//! correct without needing RNW/StyleX-style explicit priority tables.

mod accessibility;
mod class_attribute;
mod class_slots;
mod css;
mod disabled;
mod markup;
mod navigation;
mod owner_class;
mod passthrough;
mod press;
mod responder;
mod scroll;
mod theme_variables;
pub use owner_class::lower_owner_class;
mod source_evidence;
mod text_input;
use source_evidence::Rendered;
pub use source_evidence::SourceCopy;
#[cfg(test)]
mod web_tests;

mod attributes;
mod base_css;
mod candidates;
mod lower;
mod render;
mod tree_needs;

use attributes::*;
use base_css::*;
pub use candidates::*;
pub use lower::*;
use render::*;
use tree_needs::*;

use hozo_ir::{Diagnostic, Node, Primitive, Theme};

pub struct LowerOutput {
    /// Explicit class-only preparation for an existing destination, never a host replacement.
    pub owner_class: Option<OwnerClass>,
    pub jsx: String,
    pub css: String,
    /// Named imports `jsx` needs from `@hozo/engine`.
    ///
    /// The Web backend's first, and it exists for one reason: a
    /// `<div role="button">` that Hozo put in the tab order has to be
    /// activatable from the keyboard, and only script can do that. The
    /// Native backend has carried the same field since it needed hooks.
    pub runtime_imports: Vec<&'static str>,
    pub diagnostics: Vec<Diagnostic>,
    /// Opt-in evidence from the same rendering branch that emitted each tag.
    pub tag_decisions: Option<Vec<TagDecision>>,
    /// Exact carried fragments, scoped to branches that actually emitted them.
    pub source_copies: Option<Vec<SourceCopy>>,
}

pub struct OwnerClass {
    pub class_name: String,
    /// Class-owned rules and required CSS globals, not the synthetic host base.
    pub css: String,
}

pub struct TagDecision {
    pub span: hozo_ir::SourceSpan,
    /// None for an authored closing tag consumed by an emitted void element.
    pub replacement: Option<String>,
}

/// What a synthesized interactive element imports from `@hozo/engine`.
///
/// Two module-level functions rather than one inline arrow per element:
/// they close over nothing (`event.currentTarget.click()` is how they reach
/// the author's `onClick`, which also means the author's handler still
/// receives a real MouseEvent rather than a keyboard one it isn't typed
/// for), so a stable reference costs nothing and allocates nothing.
const KEY_ACTIVATION_IMPORTS: &[&str] = &["hozoInteractive"];

/// `accessibilityState`'s keys, and the ARIA attribute each becomes.
///
/// The names come from React Native's `AccessibilityState`; the mapping is
/// one to one. Which of these a given `role` actually permits is a
/// separate question -- `role="button"` allows only `aria-disabled`,
/// `aria-busy` and `aria-expanded` -- and belongs with the ARIA validity
/// diagnostics rather than here, where the author's stated intent is
/// carried through.
const ARIA_STATE_ATTRS: &[(&str, &str)] = &[
    ("aria-disabled", "disabled"),
    ("aria-selected", "selected"),
    ("aria-checked", "checked"),
    ("aria-busy", "busy"),
    ("aria-expanded", "expanded"),
];

struct ClassAllocator {
    next: u32,
}

impl ClassAllocator {
    fn alloc(&mut self) -> String {
        let name = format!("hozo-{}", self.next);
        self.next += 1;
        name
    }
}

pub(crate) struct WebRenderContext<'a> {
    pub source: &'a str,
    pub theme: &'a Theme,
    pub allocator: &'a mut ClassAllocator,
    pub rules: &'a mut String,
    pub diagnostics: &'a mut Vec<Diagnostic>,
    pub uses_view_base: &'a mut bool,
    pub uses_key_activation: &'a mut bool,
    pub tag_decisions: &'a mut Option<Vec<TagDecision>>,
    pub owner_class: Option<&'a mut Option<String>>,
}
