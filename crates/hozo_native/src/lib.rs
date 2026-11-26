//! Hozo IR to React Native primitive/StyleSheet lowering (Native backend).
//!
//! `Condition::Always` merges directly into the rendered `style` prop.
//! Other conditions merge too, each keyed to whatever real value drives
//! them -- `Disabled` uses `PropSet.disabled`'s guard (the *style*
//! condition itself carries no expression; the actual boolean comes from
//! the separate `disabled={...}` prop), `Expr` carries its own guard
//! directly. Both get spliced into a conditional `style={[base, guard &&
//! variant]}` array, re-emitting the guard verbatim from `source` (see
//! `render_condition_expr`) exactly like `hozo_web` does for its
//! attribute-toggle wiring -- same "never evaluate, only re-emit" rule.
//!
//! `Pressed` merges too, but differently: RN's `Pressable` already tracks
//! press state natively via a `style={({ pressed }) => [...]}` render-prop
//! form (no synthesized state needed, unlike what an earlier pass of this
//! design assumed) -- so a node with a `Pressed` condition gets its whole
//! `style` prop wrapped in that function instead of being a plain array.
//! Control hosts (Pressable, Button and Link) expose that callback. Text
//! in an enhanced owner's context reads it through HozoText; a standalone
//! View/Text cannot take a function style and is diagnosed instead.
//!
//! Until 2026-08-15 `Hover`/`Focus`/`Responsive`/`Dark`/`FirstChild` did
//! not merge into anything. That was a
//! **silent** drop, not the "honest gap" an earlier version of this
//! comment claimed: their style objects were computed into the StyleSheet
//! and then never referenced by the rendered JSX, with no diagnostic, and
//! the conformance suite scored all eight variant candidates as covered
//! because the entry existed. Each is now handled explicitly:
//!
//! - `Responsive`/`Dark` are *wired*, through a React hook. They are
//!   ambient -- one value for the whole app at any moment -- so
//!   `@hozo/engine` keeps a single subscription and the hook exists only
//!   to re-render this component. The declaration is returned in
//!   `LowerOutput::prelude` for the caller to splice at
//!   `hozo_parser::Root::hook_slot`, never inlined into the JSX: a hook
//!   must be called unconditionally and in the same order every render,
//!   and `style={[a, useHozoDark() && b]}` stops being either as soon as
//!   the element sits behind a conditional.
//! - `FirstChild` is *resolved*, not reported, whenever the compiler can
//!   see the element's position among its siblings -- which is most of the
//!   time, since it is looking straight at the JSX tree. Web asks
//!   `:first-child` at match time; here the answer is already known, so it
//!   costs nothing at runtime. Only an undecidable position (a component
//!   root, or a sibling of anything carried as `Child::Verbatim`, which
//!   may render nothing or a hundred elements) is an error.
//! - `Hover`/`Focus` are wired on Pressable, Button and Link through the
//!   same small runtime wrapper. Own or descendant state selects it;
//!   ordinary controls keep RN's native path. Link retains navigation
//!   around that host, and Text reads its nearest owner's context. A
//!   standalone View/Text has none, so using either there is an error
//!   rather than a style silently applied under the wrong condition.
//! - `Disabled` without a `disabled` prop, and `Pressed` without a control
//!   or inherited interaction context, are errors: nothing can drive them.

mod candidate;
mod children;
mod class_route;
mod conditions;
mod context;
mod edge_projection;
mod environment;
mod expr;
mod filters;
mod gradients;
mod grid;
mod interaction;
mod keyframes;
mod layout;
mod lower;
mod markup;
mod measured;
mod owner_style;
mod pattern;
mod pattern_layout;
mod render;
mod runtime_classes;
mod shadows;
mod source_evidence;
mod spread_style;
mod states;
mod structural;
mod style;
mod text;
mod text_region;
mod transforms;
mod transition;
mod variants;

// Moved out of this file; the older modules still read them from the root.
use children::{render_verbatim, spaced_children, subtree_for_children};
use context::{AncestorContext, FromAncestor, GroupAncestor, NativeRenderContext, RuntimeNeeds};
use environment::{
    environment_name, environment_unwired_message, native_environment, uses_container_width,
    width_threshold_px,
};
use expr::{escape_jsx_text, native_flag, render_condition_expr, source_text};
use layout::{
    is_safe_area_inset, is_viewport_sized, lower_inline_flex, safe_area_object,
    take_viewport_object,
};
pub use lower::{
    lower, lower_forwarded, lower_forwarded_with_evidence, lower_text_reference, lower_text_unified,
};
use lower::{lower_forwarded_capturing, RenderOptions, STYLE_OBJECT};
use states::{
    animation_name, aria_state_guard, condition_contains, focus_state, group_interaction_state,
    group_state, group_unwired_message, read_only_guard, runtime_class_state, uses_hover,
    uses_pressed,
};
use structural::{structural_holds, SiblingPosition};
use variants::{condition_suffix, variant_spelling};

use conditions::{
    build_style_entries, build_style_entries_with_measured, unwired_variant, MeasuredOptions,
    RuntimeHook,
};

/// One entry in the generated `StyleSheet`, and which palette to render it
/// against.
///
/// The third field is `true` only for the dark copy of a paired token. A
/// copy holds the *same* properties as its original -- that is the whole
/// trick, and it is why the difference cannot be in the properties: what
/// changes is which value a colour token resolves to, and that is a question
/// for the theme rather than for the property.
///
/// Rendering every entry against one theme is what this replaces, and it
/// produced a `hozo0_dark` holding the light colour: structurally correct,
/// guarded correctly, and the same colour twice.
pub(crate) type StyleEntry = (String, Vec<StyleProperty>, bool);
pub use candidate::{
    render_candidate_module, render_candidate_module_plan, render_final_candidate_module_plan,
    CandidateModulePlan, CandidateOrdering, CandidatePriorityEntry, CandidatePriorityGroup,
};
use grid::{grid_absorbs, native_grid, native_grid_item};
pub use hozo_ir::SourceCopy;
use hozo_ir::{
    Axis, Breakpoint, Condition, ConditionExpr, Diagnostic, DiagnosticCode, Display, Environment,
    ExprRef, FilterFunction, FormState, Length, Node, Primitive, Severity, StyleDeclaration,
    StyleProperty, SvgElement, TextOverflow, Theme, WhiteSpace,
};
pub use owner_style::{
    lower_owner_style, lower_owner_style_with_inputs, OwnerEvent, OwnerFact, OwnerStyle,
    OwnerStyleInputs,
};
pub use runtime_classes::{
    component_class_lists, native_class_diagnostics, native_class_report, native_class_verdict,
    native_classes_drawn_statically, NativeClassFinding, NativeClassKind, NativeClassVerdict,
};
use source_evidence::Rendered;
use transition::{ambient_transition, native_driver_transition};

pub struct LowerOutput {
    pub jsx: String,
    /// Opt-in exact carried children/passthrough props, not generated syntax
    /// or a general source map.
    pub source_copies: Option<Vec<SourceCopy>>,
    /// A `StyleSheet.create({ ... })`-ready JS object literal (without the
    /// `StyleSheet.create(` wrapper -- left to the caller, since whether/how
    /// to wrap and import `StyleSheet` is a codegen-site decision).
    pub styles: String,
    /// Statements the caller must splice at the top of the enclosing
    /// function body (`hozo_parser::Root::hook_slot`) for `jsx` to work.
    /// Empty unless a condition needed a React hook.
    ///
    /// Returned rather than inlined into the JSX because a hook has to be
    /// called unconditionally, in the same order, on every render.
    /// `style={[a, useHozoDark() && b]}` reads fine and breaks the moment
    /// the element itself sits behind a conditional.
    pub prelude: Vec<String>,
    /// Named imports `prelude` needs from `@hozo/engine`.
    pub runtime_imports: Vec<&'static str>,
    /// Components `jsx` needs from `react-native` itself.
    ///
    /// Reported rather than left to the caller to work out. Metro used to
    /// scan the generated JSX with a regular expression per candidate tag
    /// per component, and then subtract the names the file imports from a
    /// module the project does not trust -- because a regex cannot tell
    /// React Native's `Text` from `@expo/ui`'s, while this can: a tag the
    /// author wrote and the compiler carried verbatim never passes through
    /// here at all.
    pub native_imports: Vec<&'static str>,
    pub diagnostics: Vec<Diagnostic>,
    /// The class lists emitted inside a pattern owner's state callback
    /// (`class_route`), rather than as a style the element holds itself.
    /// Inspection evidence (`hozo show`); nothing in the output reads it.
    pub owner_callbacks: Vec<OwnerCallback>,
    /// The class lists the compiler could not read that the element still
    /// resolves on device with its own state (`hozoClasses(cls, { pressed,
    /// … })` on a Pressable, Link or TextInput), so a runtime `hover:` works
    /// there and warns on a View. Inspection evidence, like
    /// `owner_callbacks`.
    pub runtime_states: Vec<OwnerCallback>,
}

/// A class list whose styles its pattern owner resolves with its own state:
/// the element's span (or the slot's, for a static slot list) and the class
/// prop it was written as.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OwnerCallback {
    pub span: hozo_ir::SourceSpan,
    pub class_prop: &'static str,
}

#[cfg(test)]
mod native_tests;

#[cfg(test)]
mod svg_tests;

#[cfg(test)]
mod animation_tests;

#[cfg(test)]
mod backdrop_tests;
