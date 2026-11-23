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
const SCROLL_VIEW_BASE_CSS: &str = ":where(.hozo-scroll-view) {\n  \
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

const ACTIVITY_INDICATOR_BASE_CSS: &str = "@keyframes hozo-activity-indicator-spin {\n  \
    from { transform: rotate(0deg); }\n  \
    to { transform: rotate(360deg); }\n\
}\n\n";

const MODAL_BASE_CSS: &str = "dialog[data-hozo-modal] {\n  \
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
const DISABLED_BASE_CSS: &str = "@media (forced-colors: active) {\n  \
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
const SKELETON_BASE_CSS: &str = "@media (prefers-reduced-motion: reduce) {\n  \
     [data-hozo-skeleton],\n  [data-hozo-skeleton] * {\n    animation: none !important;\n  }\n}\n\n";

const CONTENT_BASE_CSS: &str = "@property --hozo-content {
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
const LEADING_BASE_CSS: &str =
    "@property --tw-leading {\n  syntax: \"*\";\n  inherits: false;\n}\n\n";

const TAILWIND_LAYER_ORDER: &str = "@layer theme, base, components, utilities;\n";

const POINTER_EVENTS_BASE_CSS: &str =
    "[data-hozo-pointer-events='none'] { pointer-events: none; }\n\
[data-hozo-pointer-events='auto'] { pointer-events: auto; }\n\
[data-hozo-pointer-events='box-none'] { pointer-events: none; }\n\
[data-hozo-pointer-events='box-none'] > * { pointer-events: auto; }\n\
[data-hozo-pointer-events='box-only'] { pointer-events: auto; }\n\
[data-hozo-pointer-events='box-only'] > * { pointer-events: none; }\n\n";

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

/// `source` is the original TSX text `root` was parsed from -- needed to
/// re-emit `ExprRef`/`ConditionExpr` guards verbatim (they're spans into
/// it, not evaluated by the compiler; see `hozo_ir`'s doc comments).
///
/// CSS for classes that can only be known at runtime is *not* emitted
/// here: candidates are a project-wide set, so their stylesheet is built
/// once by `render_candidate_stylesheet` rather than per file.
pub fn lower(root: &Node, source: &str, theme: &Theme) -> LowerOutput {
    lower_with_evidence(root, source, theme, false)
}

pub fn lower_with_evidence(
    root: &Node,
    source: &str,
    theme: &Theme,
    evidence: bool,
) -> LowerOutput {
    lower_capturing(root, source, theme, evidence, None)
}

fn lower_capturing(
    root: &Node,
    source: &str,
    theme: &Theme,
    evidence: bool,
    owner_class: Option<&mut Option<String>>,
) -> LowerOutput {
    // An `animate-<name>` or `rounded-<name>` the theme does not define
    // has nothing to emit here: its class is carried, which is what lets the project's own CSS
    // run it. Taken out before rendering, so it leaves no empty rule and
    // no class behind -- the output an unknown class always had.
    let resolved;
    let root = if mentions_unresolved_animation(root, theme) {
        resolved = without_unresolved_animations(root, theme);
        &resolved
    } else {
        root
    };
    let mut allocator = ClassAllocator { next: 0 };
    let mut rules = String::new();
    let mut diagnostics = Vec::new();
    let mut uses_view_base = false;
    let mut uses_key_activation = false;
    let mut tag_decisions = evidence.then(Vec::new);

    let mut cx = WebRenderContext {
        source,
        theme,
        allocator: &mut allocator,
        rules: &mut rules,
        diagnostics: &mut diagnostics,
        uses_view_base: &mut uses_view_base,
        uses_key_activation: &mut uses_key_activation,
        tag_decisions: &mut tag_decisions,
        owner_class,
    };
    let rendered = render_node(root, &mut cx);
    let jsx = rendered.text;
    let source_copies = rendered.copies;

    let mut css = String::new();
    if uses_view_base {
        css.push_str(VIEW_BASE_CSS);
    }
    if contains_primitive(root, Primitive::ScrollView) {
        css.push_str(SCROLL_VIEW_BASE_CSS);
    }
    if contains_primitive(root, Primitive::ActivityIndicator) {
        css.push_str(ACTIVITY_INDICATOR_BASE_CSS);
    }
    if contains_primitive(root, Primitive::Modal) {
        css.push_str(MODAL_BASE_CSS);
    }
    if contains_prop(root, |node| node.props.pointer_events.is_some()) {
        css.push_str(POINTER_EVENTS_BASE_CSS);
    }
    if contains_prop(root, marks_disabled) {
        css.push_str(DISABLED_BASE_CSS);
    }
    if uses_generated_content(root) {
        css.push_str(CONTENT_BASE_CSS);
    }
    if contains_prop(root, |node| {
        node.style.iter().any(|d| {
            matches!(
                d.property,
                hozo_ir::StyleProperty::LineHeight(_) | hozo_ir::StyleProperty::LeadingRegister(_)
            )
        })
    }) {
        css.push_str(LEADING_BASE_CSS);
    }
    if contains_primitive(root, Primitive::Skeleton) {
        css.push_str(SKELETON_BASE_CSS);
    }
    // An `animation` declaration is inert without its `@keyframes`, and
    // those are document-level rather than per-node -- so they're collected
    // across the whole tree and emitted once, deduplicated.
    for keyframes in collect_keyframes(root) {
        css.push_str(&render_keyframes(keyframes, theme));
        css.push_str("\n\n");
    }
    css.push_str(&rules);
    let variables = theme_variables::render(&css, theme);
    if !variables.is_empty() {
        css.insert_str(0, &format!("{TAILWIND_LAYER_ORDER}{variables}"));
    }

    let mut runtime_imports = if uses_key_activation {
        KEY_ACTIVATION_IMPORTS.to_vec()
    } else {
        Vec::new()
    };
    if contains_primitive(root, Primitive::Dialog) {
        runtime_imports.push("HozoDialog");
    }
    if contains_primitive(root, Primitive::Badge) {
        runtime_imports.push("HozoBadge");
    }
    if contains_primitive(root, Primitive::Chip) {
        runtime_imports.push("HozoChip");
    }
    if contains_primitive(root, Primitive::Avatar) {
        runtime_imports.push("HozoAvatar");
    }
    if contains_primitive(root, Primitive::Pagination) {
        runtime_imports.push("HozoPagination");
    }
    if contains_primitive(root, Primitive::Stepper) {
        runtime_imports.push("HozoStepper");
    }
    if contains_primitive(root, Primitive::OtpInput) {
        runtime_imports.push("HozoOtpInput");
    }
    if contains_primitive(root, Primitive::CommandPalette) {
        runtime_imports.push("HozoCommandPalette");
    }
    if contains_primitive(root, Primitive::Combobox) {
        runtime_imports.push("HozoCombobox");
    }
    if contains_primitive(root, Primitive::Listbox) {
        runtime_imports.push("HozoListbox");
    }
    if contains_primitive(root, Primitive::Menu) {
        runtime_imports.push("HozoMenu");
    }
    if contains_primitive(root, Primitive::ColorPicker) {
        runtime_imports.push("HozoColorPicker");
    }
    if contains_primitive(root, Primitive::ActivityIndicator) {
        runtime_imports.push("HozoActivityIndicator");
    }
    if contains_primitive(root, Primitive::TouchableOpacity) {
        runtime_imports.push("HozoTouchableOpacity");
    }
    if contains_primitive(root, Primitive::TouchableWithoutFeedback) {
        runtime_imports.push("HozoTouchableWithoutFeedback");
    }
    if jsx.contains("<HozoView") {
        runtime_imports.push("HozoView");
    }
    if jsx.contains("<HozoScrollView") {
        runtime_imports.push("HozoScrollView");
    }
    if jsx.contains("<HozoFlatList") {
        runtime_imports.push("HozoFlatList");
    }
    if jsx.contains("<HozoRefreshControl") {
        runtime_imports.push("HozoRefreshControl");
    }
    if jsx.contains("<HozoModal") {
        runtime_imports.push("HozoModal");
    }
    if jsx.contains("<HozoAnimatedView") {
        runtime_imports.push("HozoAnimatedView");
    }
    // Exactly when the spread was written, rather than a second guess at
    // the same question. A ScrollView carried through as a foreign tag
    // keeps `@hozo/core`'s own component, and an author who wrote
    // `tabIndex` gets no spread -- either would otherwise import a
    // helper nothing calls.
    if jsx.contains("hozoScrollable()") {
        runtime_imports.push("hozoScrollable");
    }
    if jsx.contains("hozoDomStyle(") {
        runtime_imports.push("hozoDomStyle");
    }
    if jsx.contains("hozoDomProps(") {
        runtime_imports.push("hozoDomProps");
    }
    if jsx.contains("hozoButtonDomProps(") {
        runtime_imports.push("hozoButtonDomProps");
    }
    if jsx.contains("hozoLinkDomProps(") {
        runtime_imports.push("hozoLinkDomProps");
    }
    if jsx.contains("hozoTextInputDomProps(") {
        runtime_imports.push("hozoTextInputDomProps");
    }
    if jsx.contains("hozoViewDomProps(") {
        runtime_imports.push("hozoViewDomProps");
    }
    if jsx.contains("hozoImageDomProps(") {
        runtime_imports.push("hozoImageDomProps");
    }
    LowerOutput {
        owner_class: None,
        jsx,
        css,
        runtime_imports,
        diagnostics,
        tag_decisions,
        source_copies,
    }
}

/// The object pattern that takes the props written after `spread` out of
/// it, as `{ "testID": _hozoOmit0, ..._hozoRest }`, or `None` when there
/// are none to take.
///
/// Not a key the spread provably lacks (`{ href, ...rest }`), and not a
/// passthrough prop after it: those are emitted after the spread in source
/// order and win already.
fn omit_later_names(
    spread: &hozo_ir::PassthroughProp,
    passthrough: &[hozo_ir::PassthroughProp],
) -> Option<String> {
    let mut seen: Vec<&str> = Vec::new();
    for name in &spread.later_names {
        let emitted_after = passthrough.iter().any(|prop| {
            !prop.is_spread
                && prop.name.as_deref() == Some(name.as_str())
                && prop.span.0.start > spread.span.0.start
        });
        if emitted_after || spread.spread_excludes.contains(name) || seen.contains(&name.as_str()) {
            continue;
        }
        seen.push(name);
    }
    if seen.is_empty() {
        return None;
    }
    let keys = seen
        .iter()
        .enumerate()
        .map(|(at, name)| format!("{name:?}: _hozoOmit{at}"))
        .collect::<Vec<_>>()
        .join(", ");
    Some(format!("{{ {keys}, ..._hozoRest }}"))
}

fn portable_candidate_selector(selector: &str, real_form: bool) -> std::borrow::Cow<'_, str> {
    if real_form {
        std::borrow::Cow::Owned(format!(
            "{selector}:not(:where(.hozo-candidate-slot-owner))"
        ))
    } else {
        std::borrow::Cow::Borrowed(selector)
    }
}

/// One stylesheet for every candidate class in the project, written under
/// the classes' real Tailwind names.
///
/// This is what makes proposal §7's third tier do something: a `className`
/// the compiler couldn't read is passed through, evaluates to a class
/// string at runtime, and finds a matching rule here. No runtime code is
/// involved -- the browser's CSS engine does the resolution.
///
/// Project-wide rather than per-file because the union is: a class written
/// in one module can be produced by an expression in another. Emitting it
/// per file would ship the whole set once per file that needs any of it.
///
/// Unrecognized names are skipped rather than reported. The candidate list
/// comes from scanning, so it's expected to contain tokens that only
/// looked like classes.
/// So is a name whose colour resolves to nothing. `resolve_class_name`
/// asks only whether a token has the *shape* of a utility, and by that
/// test `accent-height` is one -- it compiled to
/// `accent-color: var(--hozo-color-height)`, a reference to a variable no
/// theme defines and nothing else declares. React's DOM attribute table is
/// full of such names, and so is any minified bundle; Tailwind rejects
/// them because it validates the value against the theme rather than the
/// name against a grammar.
///
/// The looser rule stays where it belongs. For a class the author wrote,
/// `var(--hozo-color-brand)` is correct-but-unresolved: the token may well
/// be defined in a stylesheet Hozo was not given, and a dangling reference
/// beats dropping a style someone asked for. A scanned token asked for
/// nothing, so the same output is instead the evidence that it was never a
/// class -- which is why this test lives here and not in
/// `resolve_theme_color`.
pub fn render_candidate_stylesheet(class_names: &[String], theme: &Theme) -> String {
    render_scanned_candidates(
        class_names
            .iter()
            .filter_map(|name| hozo_parser::resolve_class_name(name)),
        theme,
    )
}

/// When a project did not supply its own candidate order, use the same
/// built-in Tailwind descriptors as the static compiler. Order the rules,
/// not their CSS specificity: the browser still decides which match wins.
pub fn render_builtin_candidate_stylesheet(class_names: &[String], theme: &Theme) -> String {
    let mut utilities: Vec<_> = class_names
        .iter()
        .filter_map(|name| {
            hozo_parser::resolve_class_name(name).map(|utility| (name.as_str(), utility))
        })
        .collect();
    if utilities.len() > 1 {
        // Reuse the parsed utilities for rendering; ordering and emitting
        // the sheet must not each parse the whole universe.
        let ranks: std::collections::HashMap<_, _> =
            hozo_ir::builtin_tailwind_emission_order(utilities.iter().map(|(name, utility)| {
                (
                    *name,
                    utility
                        .groups
                        .iter()
                        .flat_map(|(_, writes)| writes.iter().cloned())
                        .collect(),
                )
            }))
            .into_iter()
            .enumerate()
            .map(|(rank, name)| (name, rank))
            .collect();
        // Built-in facts describe at most one rule per candidate. An
        // undescribed form still renders in its original order after them.
        utilities.sort_by_cached_key(|(name, _)| ranks.get(name).copied().unwrap_or(usize::MAX));
    }
    render_scanned_candidates(utilities.into_iter().map(|(_, utility)| utility), theme)
}

fn render_scanned_candidates(
    utilities: impl Iterator<Item = hozo_parser::ScannedUtility>,
    theme: &Theme,
) -> String {
    let mut out = String::new();
    let mut owned = String::new();
    let mut uses_leading = false;
    let mut uses_content = false;
    let mut register_names = std::collections::BTreeSet::new();
    for mut utility in utilities {
        for (_, props) in &mut utility.groups {
            *props = theme.resolve_shadow_tokens(std::mem::take(props));
        }
        if utility.important {
            // Emitting the normalized value without its importance would be
            // a different utility. Static owners diagnose the original token.
            continue;
        }
        css::register_candidate_slots(&mut utility.groups, theme, &mut register_names);
        let selector = css::escape_class_selector(&utility.class_name);
        // The owner class adds nothing (`:where`), so this never reaches
        // ordinary HTML or a target's descendants. `:not(hozo-none)` -- an
        // element nothing is called -- adds one type's worth, (0,0,1), and
        // that is the whole cascade between a component and its caller
        // (#881): above the component's resting look at (0,1,0), whichever
        // stylesheet the bundler emits first, and below its state rules at
        // (0,2,0), as on Native, where the caller's styles go between the two.
        // Append before render_rule adds conditions and pseudo-elements,
        // including group/peer and arbitrary selectors.
        let owned_selector = format!("{selector}:where(.hozo-candidate-owner):not(hozo-none)");
        // One rule per group: a `container` is a width plus a max-width at
        // each breakpoint, which cannot be one rule.
        let mut rules = String::new();
        let mut owned_rules = String::new();
        let mut slot_rules = String::new();
        // A theme animation: nothing to write when the theme does not
        // define it (the class reaches the page for the project's own CSS),
        // and its `@keyframes` beside the rule when it does, since this
        // sheet is the only CSS a dynamic class gets.
        let theme_animation = utility
            .groups
            .iter()
            .flat_map(|(_, properties)| properties)
            .find_map(|property| match property {
                hozo_ir::StyleProperty::ThemeAnimation(name) => Some(name),
                _ => None,
            });
        if let Some(name) = theme_animation {
            let Some(animation) = theme.animation(name) else {
                continue;
            };
            if let Some(keyframes) = &animation.keyframes_css {
                rules.push_str(keyframes);
                rules.push_str("\n\n");
            }
        }
        // Tailwind's four need theirs here too, for the same reason: an
        // `animation: spin 1s linear infinite` with no `@keyframes spin`
        // anywhere on the page is a spinner that does not turn.
        let built_in = utility
            .groups
            .iter()
            .flat_map(|(_, properties)| properties)
            .find_map(|property| match property {
                hozo_ir::StyleProperty::Animation(animation) => animation.keyframes(),
                _ => None,
            });
        if let Some(keyframes) = built_in {
            rules.push_str(keyframes);
            rules.push_str("\n\n");
        }
        let shaded_theme = theme.dark();
        // The captured literal rule writes only the register. Use the
        // existing owner selectors, but don't manufacture line-height.
        let leading = theme
            .utility_leading_register(&utility.class_name)
            .filter(|_| {
                utility.groups.len() == 1 && utility.groups[0].0 == hozo_ir::Condition::Always
            });
        if let Some(px) = leading {
            uses_leading = true;
            rules.push_str(&format!(".{selector} {{ --tw-leading: {px}px; }}\n\n"));
            owned_rules.push_str(&format!(
                ".{owned_selector} {{ --tw-leading: {px}px; }}\n\n"
            ));
        }
        for (condition, properties) in &utility.groups {
            uses_leading |= properties
                .iter()
                .any(|p| matches!(p, hozo_ir::StyleProperty::LineHeight(_)));
            uses_content |= condition
                .pseudo_element()
                .is_some_and(|pseudo| pseudo.needs_content())
                || properties
                    .iter()
                    .any(|p| matches!(p, hozo_ir::StyleProperty::Content(_)));
            // The same pairing `render_node` does, on the other path a class
            // can reach the output by. A utility in this sheet is written
            // once and used by every element that names it, so a project
            // whose tokens are paired and whose stylesheet is not would have
            // dark mode on the elements the compiler lowered and not on the
            // ones it emitted a class for -- which is the same class name
            // behaving two ways in one page.
            let palette = match (condition.mentions_dark(), &shaded_theme) {
                (true, Some(shaded)) => shaded,
                _ => theme,
            };
            let real_form = css::needs_form_owner(condition);
            // Portable rules must not leak into a real secondary owner's
            // :enabled/:disabled (not even from the lower-priority layer).
            let legacy_selector = portable_candidate_selector(&selector, real_form);
            let legacy_owned = portable_candidate_selector(&owned_selector, real_form);
            let slot_selector = real_form
                .then(|| format!("{selector}:where(.hozo-candidate-slot-owner):not(hozo-none)"));
            for (enabled, target, output, actual_owner) in [
                (true, legacy_selector.as_ref(), &mut rules, false),
                (true, legacy_owned.as_ref(), &mut owned_rules, false),
                (
                    real_form,
                    slot_selector.as_deref().unwrap_or(""),
                    &mut slot_rules,
                    true,
                ),
            ] {
                if !enabled {
                    continue;
                }
                let render = |condition, palette| {
                    if actual_owner {
                        css::render_slot_rule(target, condition, properties, palette)
                    } else {
                        css::render_rule(target, condition, properties, palette)
                    }
                };
                let light = render(condition, palette);
                output.push_str(&light);
                output.push_str("\n\n");
                if !condition.mentions_dark() {
                    if let Some(dark) = &shaded_theme {
                        let shaded = render(condition, dark);
                        if shaded != light {
                            output.push_str(&render(&condition.and_dark(), dark));
                            output.push_str("\n\n");
                        }
                    }
                }
            }
        }
        // The whole candidate, not the one rule: a name is a utility or it
        // is not, and half of `accent-height` is not a style anyone wants.
        if rules.contains(css::UNRESOLVED_COLOR_PREFIX) {
            continue;
        }
        out.push_str(&rules);
        owned.push_str(&owned_rules);
        owned.push_str(&slot_rules);
    }
    if out.is_empty() {
        return out;
    }
    if uses_leading {
        out.insert_str(0, LEADING_BASE_CSS);
    }
    // The rules above write `content: var(--hozo-content)` for a `before:`
    // or `after:` class, and a lowered file that uses one carries the
    // register. A class that reaches the page only through this sheet --
    // a component's class list passed to a plain element at runtime -- has
    // no such file, so without it the pseudo-element is never generated.
    if uses_content {
        out.insert_str(0, CONTENT_BASE_CSS);
    }
    if !register_names.is_empty() {
        out.insert_str(0, &css::candidate_register_css(&register_names));
    }
    // A named sublayer loses to Tailwind's direct utilities regardless of
    // which stylesheet loads first. Declare the standard layer order too:
    // candidates can arrive before the view's base styles in runtime hosts.
    // The unlayered, marked copy preserves compiled + fallback precedence on
    // Hozo targets; a bare layered copy would let compiled static declarations
    // beat Native's later dynamic style. Keyframes are shared, not duplicated.
    let variables = theme_variables::render(&format!("{out}{owned}"), theme);
    format!(
        "{TAILWIND_LAYER_ORDER}{variables}@layer utilities.hozo-candidates {{\n{out}}}\n\n{owned}"
    )
}

/// Every distinct `@keyframes` block the tree's animations need, in
/// first-use order so output stays deterministic.
enum RequiredKeyframes<'a> {
    BuiltIn(&'static str),
    Stylex(&'a hozo_ir::Keyframes),
    /// A theme animation's `@keyframes`, by the animation's name.
    Theme(&'a str),
}

fn collect_keyframes(node: &Node) -> Vec<RequiredKeyframes<'_>> {
    let mut found = Vec::new();
    collect_keyframes_into(node, &mut found);
    found
}

fn render_keyframes(keyframes: RequiredKeyframes<'_>, theme: &Theme) -> String {
    match keyframes {
        RequiredKeyframes::BuiltIn(css) => css.to_string(),
        // As the theme wrote it: Tailwind emits the same rule for the same
        // class, so a page that also loads Tailwind's CSS gets one animation
        // under one name either way.
        RequiredKeyframes::Theme(name) => theme
            .animation(name)
            .and_then(|animation| animation.keyframes_css.clone())
            .unwrap_or_default(),
        RequiredKeyframes::Stylex(keyframes) => {
            let frames = keyframes
                .frames
                .iter()
                .map(|frame| {
                    let rule = css::render_rule(
                        &frame.selector,
                        &hozo_ir::Condition::Always,
                        &frame.properties,
                        theme,
                    );
                    // `render_rule` normally receives a class name and adds
                    // its dot. A keyframe selector is the one place the same
                    // declaration composer receives raw `from`/`50%` text.
                    rule.strip_prefix('.').unwrap_or(&rule).to_string()
                })
                .collect::<Vec<_>>()
                .join("\n");
            format!("@keyframes {} {{\n{}\n}}", keyframes.name, frames)
        }
    }
}

fn contains_primitive(node: &Node, primitive: Primitive) -> bool {
    if node.primitive == primitive {
        return true;
    }
    node.children.iter().any(|child| match child {
        hozo_ir::Child::Node(child) => contains_primitive(child, primitive),
        hozo_ir::Child::Verbatim { nested, .. } => nested
            .iter()
            .any(|entry| contains_primitive(&entry.node, primitive)),
        hozo_ir::Child::Text(_) => false,
    })
}

/// Whether this node carries a disabled state, by either spelling.
///
/// The same question `disabled_expr` answers per node, asked of a tree so
/// the shared base rule is emitted once and only when something needs it.
fn marks_disabled(node: &Node) -> bool {
    node.props.disabled.is_some()
        || (node.props.accessibility_state.is_some()
            && node
                .props
                .accessibility_state_keys
                .as_ref()
                .is_none_or(|keys| keys.iter().any(|key| key == "disabled")))
}

fn contains_prop(node: &Node, predicate: fn(&Node) -> bool) -> bool {
    if predicate(node) {
        return true;
    }
    node.children.iter().any(|child| match child {
        hozo_ir::Child::Node(child) => contains_prop(child, predicate),
        hozo_ir::Child::Verbatim { nested, .. } => nested
            .iter()
            .any(|entry| contains_prop(&entry.node, predicate)),
        hozo_ir::Child::Text(_) => false,
    })
}

/// Whether anything in this tree writes into a `::before` or `::after`.
///
/// Either by targeting one, or by setting the register a rule elsewhere
/// reads. The second is what makes `content-['x']` on its own still worth
/// the base rules: the utility is only useful because some `before:` rule
/// picks the value up.
fn uses_generated_content(node: &Node) -> bool {
    contains_prop(node, |node| {
        node.style.iter().any(|declaration| {
            matches!(declaration.property, hozo_ir::StyleProperty::Content(_))
                || declaration
                    .condition
                    .pseudo_element()
                    .is_some_and(|pseudo| pseudo.needs_content())
        })
    })
}

/// Whether this element's own styles make it scroll.
///
/// The trigger for keyboard access is what the element *does*, not which
/// primitive produced it: a `View` with `overflow-x-auto` is as
/// unreachable as a `ScrollView`, and axe judges both by computed style.
/// A story here used the first form and stayed in violation after the
/// second was fixed.
///
/// `hidden` and `visible` do not scroll and `clip` cannot be scrolled by
/// any means, so only `scroll` and `auto` count.
fn scrolls_by_style(node: &Node) -> bool {
    node.style.iter().any(|declaration| {
        let overflow = match declaration.property {
            hozo_ir::StyleProperty::Overflow(value)
            | hozo_ir::StyleProperty::OverflowX(value)
            | hozo_ir::StyleProperty::OverflowY(value) => value,
            _ => return false,
        };
        matches!(
            overflow,
            hozo_ir::Overflow::Scroll | hozo_ir::Overflow::Css("auto")
        )
    })
}

/// A theme name the theme does not define: an animation, or a radius.
fn unresolved_animation(property: &hozo_ir::StyleProperty, theme: &Theme) -> bool {
    matches!(property, hozo_ir::StyleProperty::ThemeAnimation(name) if theme.animation(name).is_none())
        || property
            .theme_radius()
            .is_some_and(|name| theme.radius(name).is_none())
}

fn mentions_unresolved_animation(node: &Node, theme: &Theme) -> bool {
    node.style
        .iter()
        .any(|declaration| unresolved_animation(&declaration.property, theme))
        || node.children.iter().any(|child| match child {
            hozo_ir::Child::Node(child) => mentions_unresolved_animation(child, theme),
            hozo_ir::Child::Verbatim { nested, .. } => nested
                .iter()
                .any(|entry| mentions_unresolved_animation(&entry.node, theme)),
            hozo_ir::Child::Text(_) => false,
        })
}

fn without_unresolved_animations(node: &Node, theme: &Theme) -> Node {
    let mut node = node.clone();
    strip_unresolved_animations(&mut node, theme);
    node
}

fn strip_unresolved_animations(node: &mut Node, theme: &Theme) {
    node.style
        .retain(|declaration| !unresolved_animation(&declaration.property, theme));
    for child in &mut node.children {
        match child {
            hozo_ir::Child::Node(child) => strip_unresolved_animations(child, theme),
            hozo_ir::Child::Verbatim { nested, .. } => {
                for entry in nested {
                    strip_unresolved_animations(&mut entry.node, theme);
                }
            }
            hozo_ir::Child::Text(_) => {}
        }
    }
}

fn collect_keyframes_into<'a>(node: &'a Node, found: &mut Vec<RequiredKeyframes<'a>>) {
    fn collect_property<'a>(
        property: &'a hozo_ir::StyleProperty,
        found: &mut Vec<RequiredKeyframes<'a>>,
    ) {
        match property {
            hozo_ir::StyleProperty::Animation(animation) => {
                if let Some(keyframes) = animation.keyframes() {
                    if !found.iter().any(|found| {
                        matches!(found, RequiredKeyframes::BuiltIn(existing) if *existing == keyframes)
                    }) {
                        found.push(RequiredKeyframes::BuiltIn(keyframes));
                    }
                }
            }
            hozo_ir::StyleProperty::AnimationName(keyframes) => {
                if !found.iter().any(|found| {
                    matches!(found, RequiredKeyframes::Stylex(existing) if existing.name == keyframes.name)
                }) {
                    found.push(RequiredKeyframes::Stylex(keyframes));
                }
            }
            hozo_ir::StyleProperty::ThemeAnimation(name) => {
                if !found
                    .iter()
                    .any(|found| matches!(found, RequiredKeyframes::Theme(existing) if *existing == name))
                {
                    found.push(RequiredKeyframes::Theme(name));
                }
            }
            hozo_ir::StyleProperty::FirstThatWorks(candidates) => {
                for candidate in candidates {
                    collect_property(candidate, found);
                }
            }
            _ => {}
        }
    }
    for declaration in &node.style {
        collect_property(&declaration.property, found);
    }
    for child in &node.children {
        match child {
            hozo_ir::Child::Node(child_node) => collect_keyframes_into(child_node, found),
            hozo_ir::Child::Verbatim { nested, .. } => {
                for entry in nested {
                    collect_keyframes_into(&entry.node, found);
                }
            }
            hozo_ir::Child::Text(_) => {}
        }
    }
}

/// Byte-slices `source` at an `ExprRef`'s span. Spans come from oxc's own
/// tokenizer over this same `source`, so they're always on UTF-8 character
/// boundaries -- not re-validated here.
/// A boolean DOM attribute, written the shortest way the value allows.
///
/// `readOnly` and nothing at all, rather than `readOnly={true}` and
/// `readOnly={false}` -- a constant known at compile time should read like
/// one in the output.
fn boolean_attribute(name: &str, value: &hozo_ir::ConditionExpr, source: &str) -> String {
    match value {
        hozo_ir::ConditionExpr::Static(true) => format!(" {name}"),
        hozo_ir::ConditionExpr::Static(false) => String::new(),
        other => format!(" {name}={{{}}}", render_condition_expr(source, other)),
    }
}

/// Whether this `TextInput` becomes a `<textarea>` rather than an
/// `<input>`.
///
/// React Native switches on a prop; the DOM switches on the element, and
/// there is no `multiline` attribute to fall back to. So a `multiline`
/// whose value isn't known until runtime cannot be answered here -- one
/// element has to be written into the file -- and `markup.rs` reports it
/// rather than picking the one that happens to be right half the time.
fn is_textarea(node: &Node) -> bool {
    matches!(
        node.props.text_input.multiline,
        Some(hozo_ir::ConditionExpr::Static(true))
    )
}

fn source_text(source: &str, expr_ref: hozo_ir::ExprRef) -> std::borrow::Cow<'_, str> {
    // Reads a captured attribute's plan slot while its element renders.
    hozo_ir::attribute_capture::text(source, expr_ref.0.start as usize, expr_ref.0.end as usize)
}

/// The tag name as the author wrote it, read off the element's own span.
///
/// `<ButtonPrimitive ...>` is `ButtonPrimitive`, not `Button`. A lowering
/// that keeps the component has to name the binding that is in scope, and an
/// import alias is ordinary in any file that wraps a primitive -- which is
/// every file in a styled component library. Emitting the canonical name
/// there produces a free identifier, and a free identifier in a component
/// position renders nothing and says nothing (#653).
fn written_tag(source: &str, span: hozo_ir::SourceSpan) -> Option<&str> {
    let text = source.get(span.start as usize..span.end as usize)?;
    let rest = text.strip_prefix('<')?;
    let end = rest.find(|c: char| !(c.is_alphanumeric() || c == '_' || c == '$' || c == '.'))?;
    let name = &rest[..end];
    if name.is_empty() {
        None
    } else {
        Some(name)
    }
}

/// Re-emits a `ConditionExpr` as a JS boolean expression by splicing the
/// original source at each leaf `Ref`'s span -- the compiler never
/// evaluates these, only reconstructs them with real `&&`/`||`/`!`
/// wrapping the *combinator structure* it built (see hozo_parser's
/// `dynamic_class` module), not anything it parsed out of the leaves
/// themselves.
/// The value half of a JSX attribute, as written.
///
/// `PassthroughProp::span` covers the whole attribute, and a prop whose
/// value is an expression has to be re-emitted inside one -- so the name
/// and the `=` have to come off. The first `=` is always the separator,
/// since an attribute name cannot contain one, and the braces come off
/// because what is wanted is an expression rather than a JSX value.
///
/// A boolean shorthand (`<Link external>`) has no `=` at all and reads as
/// `true`, which is what JSX means by it.
fn attribute_value_source(source: &str, span: hozo_ir::ExprRef) -> String {
    attribute_value_slice(source, span)
        .map_or_else(|| "true".to_string(), std::borrow::Cow::into_owned)
}

/// Read off the source itself, then substituted: the value's range is the
/// source's, and a captured value (#1879) is replaced only as a whole.
fn attribute_value_slice(
    source: &str,
    span: hozo_ir::ExprRef,
) -> Option<std::borrow::Cow<'_, str>> {
    let text = &source[span.0.start as usize..span.0.end as usize];
    let (_, value) = text.split_once('=')?;
    let value = value.trim();
    let value = value
        .strip_prefix('{')
        .and_then(|rest| rest.strip_suffix('}'))
        .unwrap_or(value)
        .trim();
    let start = value.as_ptr() as usize - source.as_ptr() as usize;
    Some(hozo_ir::attribute_capture::text(
        source,
        start,
        start + value.len(),
    ))
}
fn render_condition_expr(source: &str, expr: &hozo_ir::ConditionExpr) -> String {
    use hozo_ir::ConditionExpr;
    match expr {
        ConditionExpr::Static(value) => value.to_string(),
        ConditionExpr::Ref(r) => source_text(source, *r).to_string(),
        ConditionExpr::StateDisabled(r) => {
            format!("({})?.disabled === true", source_text(source, *r))
        }
        ConditionExpr::Captured(capture) => format!(
            "{}[{}]",
            hozo_ir::ClassEvaluation::binding(source, capture.plan),
            capture.index
        ),
        ConditionExpr::ClassConflict(conflict) => {
            let value = match &conflict.capture {
                Some(capture) => format!(
                    "{}[{}]",
                    hozo_ir::ClassEvaluation::binding(source, capture.plan),
                    capture.index
                ),
                None => format!("({})", source_text(source, conflict.reference)),
            };
            format!("/{}/.test({})", conflict.pattern, value)
        }
        ConditionExpr::Not(inner) => format!("!({})", render_condition_expr(source, inner)),
        ConditionExpr::And(a, b) => {
            format!(
                "({}) && ({})",
                render_condition_expr(source, a),
                render_condition_expr(source, b)
            )
        }
        ConditionExpr::Or(a, b) => {
            format!(
                "({}) || ({})",
                render_condition_expr(source, a),
                render_condition_expr(source, b)
            )
        }
    }
}

/// `aria-valuetext` for a `<meter>`: its amount as a percentage of its range,
/// which is 0 to 1 when left out, clamped the way the element clamps it.
fn meter_value_text(node: &Node, source: &str) -> Option<String> {
    let authored = |name: &str| -> Option<String> {
        node.props
            .passthrough
            .iter()
            .filter(|prop| prop.name.as_deref() == Some(name))
            .find_map(|prop| {
                let text = &source[prop.span.0.start as usize..prop.span.0.end as usize];
                let value = text.split_once('=')?.1.trim();
                value
                    .strip_prefix('{')
                    .and_then(|inner| inner.strip_suffix('}'))
                    .map(|inner| {
                        hozo_ir::attribute_capture::slice(source, inner.trim()).into_owned()
                    })
                    .or_else(|| {
                        value
                            .strip_prefix('"')?
                            .strip_suffix('"')
                            .map(str::to_string)
                    })
            })
    };
    let now = authored("value")?;
    let min = authored("min").unwrap_or_else(|| "0".to_string());
    let max = authored("max").unwrap_or_else(|| "1".to_string());
    let literal = |text: &str| text.parse::<f64>().ok();
    Some(match (literal(&now), literal(&min), literal(&max)) {
        (Some(now), Some(min), Some(max)) => {
            let fraction = if max > min { ((now - min) / (max - min)).clamp(0.0, 1.0) } else { 0.0 };
            format!("'{}%'", (fraction * 100.0).round() as i64)
        }
        _ => format!(
            "`${{Math.round(Math.min(Math.max((({now}) - ({min})) / (({max}) - ({min})), 0), 1) * 100)}}%`"
        ),
    })
}

/// The CSS for one class: a rule per condition, and the dark copy a paired
/// token needs. An element's `className` and a component's other class
/// lists (`ClassSlot`) are both written by this; `render` says whom a
/// `disabled:` asks.
fn push_rules_using(
    class_name: &str,
    style: &[hozo_ir::StyleDeclaration],
    span: hozo_ir::SourceSpan,
    theme: &Theme,
    rules: &mut String,
    diagnostics: &mut Vec<Diagnostic>,
    render: fn(&str, &hozo_ir::Condition, &[hozo_ir::StyleProperty], &Theme) -> String,
) {
    let mut groups: Vec<_> = hozo_ir::group_by_condition_for_css(style)
        .into_iter()
        .map(|(condition, props)| {
            (
                condition,
                hozo_ir::dedupe_last_wins(theme.resolve_shadow_tokens(props)),
            )
        })
        .collect();
    let axes = css::register_split_axes(&mut groups, theme);
    let shadows = css::register_split_shadows(&mut groups, theme);
    let gradients = css::register_split_gradients(&mut groups, theme);
    if (axes || shadows || gradients) && !rules.contains(css::axis_register_css()) {
        rules.push_str(css::axis_register_css());
    }
    for (condition, props) in groups {
        if props.is_empty() {
            continue;
        }
        // The mirror of what the Native backend does with `print:` and
        // `forced-colors:`: a condition this platform cannot express emits
        // no rule and says so, rather than emitting one with an empty
        // query that would apply to everyone.
        if let Some(query) = css::inexpressible_on_web(&condition) {
            diagnostics.push(hozo_ir::Diagnostic {
                code: hozo_ir::DiagnosticCode::NotWiredOnWeb,
                severity: hozo_ir::Severity::Warning,
                message: query.web_gap_message(),
                span,
            });
            continue;
        }
        // A rule that applies only in dark mode resolves its colours against
        // the dark palette. That covers a `dark:` the author wrote as well as
        // a copy made below, and the two have to agree: the same class
        // meaning two colours depending on how it was produced would be worse
        // than either answer on its own.
        let shaded_theme = theme.dark();
        let palette = match (condition.mentions_dark(), &shaded_theme) {
            (true, Some(shaded)) => shaded,
            _ => theme,
        };
        let light = render(class_name, &condition, &props, palette);
        rules.push_str(&light);
        rules.push_str("\n\n");

        // A token that carries a dark value emits the same rule again under
        // `prefers-color-scheme`, so a project says "dark" once in its theme
        // rather than on every class list.
        //
        // Rendered rather than computed: the second pass is the identical
        // properties against a palette whose paired tokens hold their dark
        // values, and the comparison decides whether it was worth emitting.
        // Anything not built from a paired token renders identically and
        // costs nothing.
        //
        // Skipped when the author already wrote `dark:`, which is a rule that
        // is *only* for dark mode. Emitting a dark copy of it would be saying
        // the same thing twice, and the second one would win on a tie.
        //
        // The copy keeps the condition it came from and adds the colour scheme
        // to it. Replacing it was a real bug: the dark half of
        // `hover:bg-hozo-surface-hover` lost its `:hover` and painted the
        // hover colour on every element carrying the class, in the dark,
        // always.
        if !condition.mentions_dark() {
            if let Some(dark) = &shaded_theme {
                let shaded = render(class_name, &condition, &props, dark);
                if shaded != light {
                    rules.push_str(&render(class_name, &condition.and_dark(), &props, dark));
                    rules.push_str("\n\n");
                }
            }
        }
    }
}

/// What `render_node`'s attribute phases (`press`, `passthrough`) read
/// about the element being rendered.
#[derive(Clone, Copy)]
pub(crate) struct Element<'n> {
    pub(crate) node: &'n Node,
    pub(crate) tag: &'n str,
    pub(crate) disabled_expr: &'n Option<String>,
    pub(crate) is_hozo_component: bool,
}

fn render_node(node: &Node, cx: &mut WebRenderContext<'_>) -> Rendered {
    let source = cx.source;
    let theme = cx.theme;
    // Every copy of an attribute this element's plan evaluates reads the
    // plan's value instead, for as long as the element renders (#1879).
    let _captured = hozo_ir::attribute_capture::enter(node.root_class_evaluation(), source);
    let class_name = cx.allocator.alloc();
    let mut attr_copies = cx.tag_decisions.is_some().then(Vec::new);

    // `rules` accumulates the whole tree's CSS, so "did this node write
    // one" has to be asked about the span this node adds, not about
    // whether the string is empty.
    let rules_before = cx.rules.len();

    // A root the catalog has audited lands on an element the component
    // draws and keeps its own `disabled` on, which no Hozo marker reaches --
    // so its CSS asks that element, as a secondary slot's does (#993).
    push_rules_using(
        &class_name,
        &node.style,
        node.span,
        theme,
        cx.rules,
        cx.diagnostics,
        if node.primitive.root_owner_is_audited() {
            css::render_slot_rule
        } else {
            css::render_rule
        },
    );

    let (shape, extra_attrs) = markup::element_shape(node, cx.diagnostics);
    // A shape the backend declined to decide keeps the component, named the
    // way this file names it rather than the way the primitive is called.
    // See `written_tag` and #653.
    let mut tag: &str = if shape == markup::UNDECIDED {
        written_tag(source, node.span).unwrap_or("div")
    } else {
        shape
    };
    let has_pan_handlers_spread = node
        .props
        .passthrough
        .iter()
        .any(|prop| prop.is_spread && source_text(source, prop.span).contains(".panHandlers"));
    if has_pan_handlers_spread {
        tag = match node.primitive {
            Primitive::View => "HozoView",
            Primitive::Pressable => "Pressable",
            Primitive::TouchableOpacity => "HozoTouchableOpacity",
            Primitive::TouchableWithoutFeedback => "HozoTouchableWithoutFeedback",
            _ => tag,
        };
    }
    if node.primitive == Primitive::Image {
        if let Some(src) = node.props.image_src {
            let value = source_text(source, src);
            if !value.starts_with(['\"', '\'']) {
                tag = "Image";
            }
        }
    }
    // An element Hozo made into a control itself: a `<div>` it put in the
    // tab order, rather than a `<button>` the browser already knows about.
    // Everything a control needs then has to be supplied too, and has to
    // agree -- which is what `hozoInteractive` is for.
    let synthesized_control =
        node.props.on_press.is_some() && extra_attrs.iter().any(|(key, _)| *key == "tabIndex");

    // The one expression that decides `disabled`, whichever way it was
    // spelled. This is Hozo's existing unavailable policy, also used by
    // the fallback Pressable: a false flag cannot enable a state-disabled
    // control. Props, styles and activation must not each reconstruct it.
    let disabled_expr = node
        .props
        .effective_disabled()
        .map(|fact| render_condition_expr(source, &fact));

    // A retained alias is a component too. Looking only at its spelling
    // renamed nativeID/onPress/disabled for the DOM before the fallback
    // could decide whether it was an action or a destination (#943).
    let is_hozo_component = shape == markup::UNDECIDED
        || tag.starts_with("Hozo")
        || matches!(
            tag,
            "View"
                | "Text"
                | "Paragraph"
                | "Heading"
                | "Section"
                | "Article"
                | "Nav"
                | "List"
                | "ListItem"
                | "Image"
                | "ScrollView"
                | "FlatList"
                | "HozoScrollView"
                | "HozoFlatList"
                | "HozoRefreshControl"
                | "Pressable"
                | "Strong"
                | "Emphasis"
                | "Underline"
                | "Strikethrough"
                | "Sub"
                | "Sup"
                | "Code"
                | "Preformatted"
                | "Small"
                | "Mark"
                | "NoBreak"
                | "Ruby"
                | "RubyText"
        );

    let mut attrs = class_attribute::class_attribute(node, class_name, rules_before, cx);
    for (key, value) in &extra_attrs {
        // `hozoInteractive` supplies it, together with everything else it
        // has to agree with.
        if (tag == "Pressable" || synthesized_control) && *key == "tabIndex" {
            continue;
        }
        let key = if tag == "Pressable" && *key == "role" {
            "accessibilityRole"
        } else {
            key
        };
        match value {
            markup::AttrValue::Text(text) => attrs.push_str(&format!(r#" {key}="{text}""#)),
            markup::AttrValue::Expression(expr) => attrs.push_str(&format!(" {key}={{{expr}}}")),
        }
    }

    accessibility::accessibility_attrs(node, tag, is_hozo_component, source, &mut attrs);
    if let Some(src) = node.props.image_src {
        attrs.push_str(&format!(" src={{{}}}", source_text(source, src)));
    }
    if let Some(src) = node.props.image_default_source {
        attrs.push_str(&format!(" defaultSource={{{}}}", source_text(source, src)));
    }
    if let Some(horizontal) = &node.props.scroll_horizontal {
        let horizontal = render_condition_expr(source, horizontal);
        if matches!(
            tag,
            "ScrollView" | "FlatList" | "HozoScrollView" | "HozoFlatList"
        ) {
            attrs.push_str(&format!(" horizontal={{{horizontal}}}"));
        } else {
            attrs.push_str(&format!(
                " data-hozo-horizontal={{{horizontal} ? '' : undefined}}"
            ));
        }
    }
    scroll::scroll_attrs(node, tag, source, &mut attrs);
    if node.primitive == Primitive::Image {
        if let Some(label) = node.props.accessibility_label {
            attrs.push_str(&format!(" alt={{{}}}", source_text(source, label)));
        }
    }
    if let Some(open) = &node.props.open {
        attrs.push_str(&format!(
            " open={{{}}}",
            render_condition_expr(source, open)
        ));
    }
    press::on_press_attrs(
        Element {
            node,
            tag,
            disabled_expr: &disabled_expr,
            is_hozo_component,
        },
        synthesized_control,
        &mut attrs,
        &mut attr_copies,
        cx,
    );
    disabled::link_attrs(
        Element {
            node,
            tag,
            disabled_expr: &disabled_expr,
            is_hozo_component,
        },
        source,
        &mut attrs,
        &mut attr_copies,
    );
    responder::responder_attrs(node, source, &mut attrs, &mut attr_copies);
    disabled::control_attrs(
        Element {
            node,
            tag,
            disabled_expr: &disabled_expr,
            is_hozo_component,
        },
        synthesized_control,
        source,
        &mut attrs,
    );

    // The `TextInput` props the DOM has under another name.
    //
    text_input::text_input_attrs(node, source, &mut attrs);

    navigation::navigation_attrs(node, tag, source, &mut attrs);

    // `external`, which is Hozo's own spelling and not the DOM's.
    //
    // It used to reach the anchor verbatim -- the generated file said
    // `<a href="..." external>` -- and, far worse, neither `target` nor
    // `rel` was emitted at all. The attribute itself was harmless, since
    // React drops an unknown prop whose value is `true` before it reaches
    // the document; the missing `rel` was not. The opened page kept
    // `window.opener` and could navigate the one it came from, while the
    // same source rendered through `@hozo/core` severed it. The compiled
    // and uncompiled halves of one component disagreed about a security
    // property, silently, with no diagnostic (#290).
    //
    // `externalLinkAttributes` in `@hozo/engine` is the other
    // implementation of this; `external-link.test.ts` in the conformance
    // suite compares them, because a three-line rule in two languages
    // is a rule that will be changed in one of them.
    let external_target_consumed = passthrough::external_link(node, tag, source, &mut attrs);
    // Everything Hozo doesn't model, re-emitted verbatim and last so JSX's
    // last-wins duplicate resolution keeps matching the source's own
    // ordering semantics. Known cross-platform props were consumed above;
    // an unknown RN-specific prop is still carried as written, because a
    // visible React warning is safer than silently deleting app behavior.
    passthrough::emit(
        Element {
            node,
            tag,
            disabled_expr: &disabled_expr,
            is_hozo_component,
        },
        external_target_consumed,
        &mut attrs,
        &mut attr_copies,
        cx,
    );

    // In source order, and every child emitted -- `Verbatim` covers the
    // ones the compiler doesn't model, re-emitted from source rather than
    // deleted. Order is load-bearing: `<Text>Hello {name}</Text>` and
    // `<Text>{name} Hello</Text>` differ only in it.
    let child_decisions_start = cx.tag_decisions.as_ref().map_or(0, Vec::len);
    let mut inner = Rendered::new(cx.tag_decisions.is_some());
    for child in &node.children {
        match child {
            hozo_ir::Child::Node(child_node) => {
                inner.append(render_node(child_node, cx));
            }
            hozo_ir::Child::Text(text) => inner.text.push_str(&markup::html_escape(text)),
            hozo_ir::Child::Verbatim {
                source: expr_ref,
                nested,
            } => inner.append(render_verbatim(*expr_ref, nested, cx)),
        }
    }

    // `<input>`, `<img>`, `<hr>` are void elements: HTML forbids a closing
    // tag and React throws on children. Nothing can be inside one, so there
    // is no inner to lose by self-closing.
    let void = tag == "input" || tag == "img" || tag == "hr";
    if let Some(decisions) = cx.tag_decisions {
        // The renderer computes children before choosing its final output.
        // A void element emits none of them; do not journal discarded work.
        if void {
            decisions.truncate(child_decisions_start);
        }
        decisions.push(TagDecision {
            span: node.opening_tag_span,
            replacement: Some(tag.to_string()),
        });
        if let Some(span) = node.closing_tag_span {
            decisions.push(TagDecision {
                span,
                replacement: (!void).then(|| tag.to_string()),
            });
        }
    }
    let mut copies = attr_copies.map(|incoming| {
        let mut copies = Vec::new();
        source_evidence::shift_into(&mut copies, incoming, 1 + tag.len());
        copies
    });
    if !void {
        if let (Some(copies), Some(incoming)) = (&mut copies, inner.copies) {
            source_evidence::shift_into(copies, incoming, 2 + tag.len() + attrs.len());
        }
    }
    let mut text = if void {
        format!("<{tag}{attrs} />")
    } else {
        format!("<{tag}{attrs}>{}</{tag}>", inner.text)
    };
    if let Some(evaluation) = node.root_class_evaluation() {
        // Written in source order already: no plan needed (#1879).
        if hozo_ir::attribute_capture::unplan(
            evaluation,
            source,
            &mut text,
            copies.as_mut(),
            hozo_parser::plan_reads_in_order,
        ) {
            return Rendered { text, copies };
        }
        if let Some(copies) = &mut copies {
            let offset = evaluation.wrapper_offset(source);
            for copy in copies {
                copy.emitted_start += offset;
                copy.emitted_end += offset;
            }
        }
        Rendered {
            text: evaluation.wrap_subtree(source, &text),
            copies,
        }
    } else {
        Rendered { text, copies }
    }
}

/// Re-emits a carried expression from source, with each Hozo primitive
/// inside it replaced by its lowered output.
///
/// The nested spans are subranges of `expr_ref`'s and don't overlap (each
/// is the outermost primitive on its branch), so one left-to-right pass is
/// enough. `{show && <Text className="p-4">hi</Text>}` comes out as
/// `{show && <span className="hozo-1">hi</span>}` -- the guard untouched,
/// the element fully compiled.
/// A spread's argument between `prefix` and `suffix`: `value`, its text
/// as sliced, or, when primitives are written inside it
/// (`{...withFooter(<Text className="p-2" />)}`), the argument with them
/// lowered.
fn spread_argument(
    prop: &hozo_ir::PassthroughProp,
    value: &str,
    prefix: &str,
    suffix: &str,
    attrs: &mut String,
    copies: &mut Option<Vec<hozo_ir::SourceCopy>>,
    cx: &mut WebRenderContext<'_>,
) {
    if prop.nested.is_empty() {
        source_evidence::expression(attrs, copies, cx.source, value, prefix, suffix);
        return;
    }
    let source = cx.source;
    let raw = &source[prop.span.0.start as usize..prop.span.0.end as usize];
    let argument = raw
        .strip_prefix('{')
        .and_then(|rest| rest.strip_suffix('}'))
        .unwrap_or(raw)
        .trim_start();
    let argument = argument.strip_prefix("...").unwrap_or(argument).trim();
    let start = argument.as_ptr() as usize - source.as_ptr() as usize;
    let argument = hozo_ir::ExprRef(hozo_ir::SourceSpan {
        start: start as u32,
        end: (start + argument.len()) as u32,
    });
    attrs.push_str(prefix);
    source_evidence::append(attrs, copies, render_verbatim(argument, &prop.nested, cx));
    attrs.push_str(suffix);
}

fn render_verbatim(
    expr_ref: hozo_ir::ExprRef,
    nested: &[hozo_ir::NestedNode],
    cx: &mut WebRenderContext<'_>,
) -> Rendered {
    let start = expr_ref.0.start as usize;
    let mut out = Rendered::new(cx.tag_decisions.is_some());
    let mut cursor = start;
    // An element inside a value the plan evaluates is lowered there; the
    // copy below writes the value's slot (#1879).
    let spans: Vec<_> = nested.iter().map(|entry| entry.span).collect();
    let planned = hozo_ir::attribute_capture::lower_captured(
        cx.source,
        start,
        expr_ref.0.end as usize,
        &spans,
        |index| render_node(&nested[index].node, cx).text,
    );
    for (entry, _) in nested.iter().zip(planned).filter(|(_, planned)| !planned) {
        let from = entry.span.start as usize;
        out.copy(cx.source, cursor, from);
        out.append(render_node(&entry.node, cx));
        cursor = entry.span.end as usize;
    }
    out.copy(cx.source, cursor, expr_ref.0.end as usize);
    out
}

fn class_guards(style: &[hozo_ir::StyleDeclaration], source: &str) -> Vec<String> {
    let mut refs = Vec::new();
    for decl in style {
        collect_from_condition(&decl.condition, &mut refs);
    }
    refs.sort_by(|(a_ref, a_kind, _), (b_ref, b_kind, _)| {
        (a_ref.0.start, a_ref.0.end, a_kind).cmp(&(b_ref.0.start, b_ref.0.end, b_kind))
    });
    refs.dedup_by(|(a_ref, a_kind, _), (b_ref, b_kind, _)| a_ref == b_ref && a_kind == b_kind);
    refs.into_iter()
        .map(|(_, class_name, expression)| {
            format!(
                "({}) && '{}'",
                render_condition_expr(source, expression),
                class_name
            )
        })
        .collect()
}

fn collect_from_condition<'a>(
    condition: &'a hozo_ir::Condition,
    out: &mut Vec<(hozo_ir::ExprRef, String, &'a hozo_ir::ConditionExpr)>,
) {
    match condition {
        hozo_ir::Condition::Expr(expr) => collect_from_expr(expr, out),
        hozo_ir::Condition::All(conditions) => {
            for inner in conditions {
                collect_from_condition(inner, out);
            }
        }
        _ => {}
    }
}

fn collect_from_expr<'a>(
    expr: &'a hozo_ir::ConditionExpr,
    out: &mut Vec<(hozo_ir::ExprRef, String, &'a hozo_ir::ConditionExpr)>,
) {
    use hozo_ir::ConditionExpr;
    match expr {
        ConditionExpr::Static(_) => {}
        ConditionExpr::Ref(r) => out.push((*r, css::expr_ref_class(*r), expr)),
        ConditionExpr::StateDisabled(r) => out.push((*r, css::state_disabled_ref_class(*r), expr)),
        ConditionExpr::Captured(capture) => out.push((
            capture.reference,
            css::expr_ref_class(capture.reference),
            expr,
        )),
        ConditionExpr::ClassConflict(conflict) => {
            out.push((conflict.reference, css::conflict_ref_class(conflict), expr))
        }
        ConditionExpr::Not(inner) => collect_from_expr(inner, out),
        ConditionExpr::And(a, b) | ConditionExpr::Or(a, b) => {
            collect_from_expr(a, out);
            collect_from_expr(b, out);
        }
    }
}
