//! The base rules the generated stylesheet carries when the tree needs them:
//! view boxes, scroll views, dialogs, disabled elements, skeletons and the rest.

/// The proposal §8.1 "hozo-view" shared base style: applied to every
/// `View`, emitted once as a shared rule rather than duplicated per node.
///
/// Inside `:where()`, which makes it specificity zero. A base and a
/// component's own rule are both single classes otherwise, so which one
/// wins is decided by which was written last -- and `lower` runs per root,
/// so a file with two components emits this twice and the second copy
/// outranks the first component's rules. A `View` asking for `flex-row`
/// laid out as a column, and only for the properties this rule also sets,
/// which reads as "flex-row does nothing" rather than as a cascade
/// problem.
///
/// Zero specificity is the right answer rather than a workaround: every
/// property here is a default a component class exists to override. It is
/// the same reasoning that puts Preflight's element selectors below every
/// utility.
///
/// The `[data-hozo-*]` bases below are deliberately *not* wrapped. Those
/// are behaviour rather than defaults -- a disabled control has to look
/// disabled in forced colours even if a component class says otherwise.
// Included here and generated into @hozo/engine for uncompiled components.
// `base` keeps Tailwind's layered utilities stronger than these defaults;
// :where keeps ordinary project rules stronger regardless of source order.
//
// It also gives `[data-hozo-pressable]` its pointer. A `<div role="button">`
// never gets one from the browser, and since Tailwind v4's Preflight neither
// does a `<button>`, so every component had to remember `cursor-pointer` and
// several did not. Hozo marks what it makes clickable -- compiled controls,
// the runtime primitives, and the elements `@hozo/patterns` and its siblings
// render -- and the rule leaves out every way Hozo spells disabled, so a
// marker can be static. Zero specificity, so an authored `cursor-*` wins.
pub(crate) const VIEW_BASE_CSS: &str = include_str!("view-base.css");

/// The plain rule is zero-specificity for the same reason `.hozo-view`
/// is. The two attribute-qualified rules below it are not: they answer a
/// prop the author set, and `[data-hozo-horizontal]` has to beat the
/// default it is written to replace.
pub(super) const SCROLL_VIEW_BASE_CSS: &str = ":where(.hozo-scroll-view) {\n  \
    overflow-x: hidden;\n  \
    overflow-y: auto;\n  \
    -webkit-overflow-scrolling: touch;\n\
}\n\n\
.hozo-scroll-view[data-hozo-horizontal] {\n  \
    overflow-x: auto;\n  \
    overflow-y: hidden;\n\
}\n\n\
.hozo-scroll-view[data-hozo-hide-scrollbar] {\n  \
    scrollbar-width: none;\n\
}\n\n\
.hozo-scroll-view[data-hozo-hide-scrollbar]::-webkit-scrollbar {\n  \
    display: none;\n\
}\n\n";

pub(super) const ACTIVITY_INDICATOR_BASE_CSS: &str =
    "@keyframes hozo-activity-indicator-spin {\n  \
    from { transform: rotate(0deg); }\n  \
    to { transform: rotate(360deg); }\n\
}\n\n";

pub(super) const MODAL_BASE_CSS: &str = "dialog[data-hozo-modal] {\n  \
    position: fixed;\n  \
    inset: 0;\n  \
    width: 100vw;\n  \
    height: 100dvh;\n  \
    max-width: none;\n  \
    max-height: none;\n  \
    margin: 0;\n  \
    padding: 0;\n  \
    border: 0;\n\
}\n\n\
dialog[data-hozo-modal][data-hozo-transparent] { background: transparent; }\n\
dialog[data-hozo-modal][data-hozo-transparent]::backdrop { background: transparent; }\n\
dialog[data-hozo-modal][data-hozo-animation=\"fade\"] { animation: hozo-modal-fade 150ms ease-out; }\n\
dialog[data-hozo-modal][data-hozo-animation=\"slide\"] { animation: hozo-modal-slide 200ms ease-out; }\n\
@keyframes hozo-modal-fade { from { opacity: 0; } }\n\
@keyframes hozo-modal-slide { from { transform: translateY(100%); } }\n\
@media (prefers-reduced-motion: reduce) { dialog[data-hozo-modal] { animation: none; } }\n\n";

/// What a browser does for `<button disabled>` in forced-colors mode,
/// for everything else Hozo marks disabled.
///
/// In that mode the user's palette replaces the author's, so a disabled
/// control dimmed with `opacity` or a muted colour looks exactly like an
/// enabled one. Browsers avoid that by painting disabled *form controls*
/// with the `GrayText` system colour -- which a `<div role="button">` is
/// not, and never gets. Same value, so a real `<button>` is unaffected.
pub(super) const DISABLED_BASE_CSS: &str = "@media (forced-colors: active) {\n  \
    [data-hozo-disabled] { color: GrayText; }\n\
}\n\n";

/// The register `before:` and `after:` read, and the fallback for
/// browsers that cannot register it.
///
/// `::before` generates nothing without `content`, so every rule that
/// targets one writes `content: var(--hozo-content)` -- which needs an
/// initial value of `""` or the declaration is invalid and the box is
/// never made. `@property` supplies it where it is supported; the
/// `@supports` test below is Tailwind's own, and it detects Safari and
/// Firefox versions that have `::before` but not `@property`.
///
/// Copied from Tailwind's output rather than reasoned about, including
/// the shape of the feature test, which is not something to re-derive.
/// A skeleton's animation stops under reduced motion, whatever started it:
/// `animate-pulse`, a theme animation, or a dynamic class the compiler never
/// saw (decision 007, section 5). On the element and inside it, so a
/// pulsing layer a look puts within it stops too. `!important`, because the
/// rule that started it is a class written after this one.
pub(super) const SKELETON_BASE_CSS: &str = "@media (prefers-reduced-motion: reduce) {\n  \
     [data-hozo-skeleton],\n  [data-hozo-skeleton] * {\n    animation: none !important;\n  }\n}\n\n";

pub(super) const CONTENT_BASE_CSS: &str = "@property --hozo-content {
      syntax: \"*\";
      inherits: false;
      initial-value: \"\";
}

@supports ((-webkit-hyphens: none) and (not (margin-trim: inline))) or ((-moz-orient: inline) and (not (color:rgb(from red r g b)))) {
      *, ::before, ::after, ::backdrop { --hozo-content: \"\"; }
}

";

// Do not leak an ancestor's leading register into a child with its own
// text-size utility. Line-height itself still inherits normally. This is
// Tailwind's registration, and also works when no Tailwind sheet is loaded.
pub(super) const LEADING_BASE_CSS: &str =
    "@property --tw-leading {\n  syntax: \"*\";\n  inherits: false;\n}\n\n";

pub(super) const TAILWIND_LAYER_ORDER: &str = "@layer theme, base, components, utilities;\n";

pub(super) const POINTER_EVENTS_BASE_CSS: &str =
    "[data-hozo-pointer-events='none'] { pointer-events: none; }\n\
[data-hozo-pointer-events='auto'] { pointer-events: auto; }\n\
[data-hozo-pointer-events='box-none'] { pointer-events: none; }\n\
[data-hozo-pointer-events='box-none'] > * { pointer-events: auto; }\n\
[data-hozo-pointer-events='box-only'] { pointer-events: auto; }\n\
[data-hozo-pointer-events='box-only'] > * { pointer-events: none; }\n\n";
