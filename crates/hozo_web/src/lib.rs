//! Hozo IR to DOM/CSS/ARIA lowering (Web backend).
//!
//! Emits per-node scoped CSS classes rather than deduplicating/reusing
//! atomic utility classes across call sites -- a constraint carried over
//! from the cascade-ordering design discussion, since it's what lets
//! simple source-order-within-condition flattening (see `css.rs`) stay
//! correct without needing RNW/StyleX-style explicit priority tables.

mod css;
mod markup;
mod source_evidence;
use source_evidence::Rendered;
pub use source_evidence::SourceCopy;
#[cfg(test)]
mod web_tests;

use hozo_ir::{Diagnostic, Node, Primitive, Theme};

pub struct LowerOutput {
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
        node.style
            .iter()
            .any(|d| matches!(d.property, hozo_ir::StyleProperty::LineHeight(_)))
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
    LowerOutput {
        jsx,
        css,
        runtime_imports,
        diagnostics,
        tag_decisions,
        source_copies,
    }
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
    let mut out = String::new();
    let mut owned = String::new();
    let mut uses_leading = false;
    for name in class_names {
        let Some(utility) = hozo_parser::resolve_class_name(name) else {
            continue;
        };
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
        for (condition, properties) in &utility.groups {
            uses_leading |= properties
                .iter()
                .any(|p| matches!(p, hozo_ir::StyleProperty::LineHeight(_)));
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
    // A named sublayer loses to Tailwind's direct utilities regardless of
    // which stylesheet loads first. Declare the standard layer order too:
    // candidates can arrive before the view's base styles in runtime hosts.
    // The unlayered, marked copy preserves compiled + fallback precedence on
    // Hozo targets; a bare layered copy would let compiled static declarations
    // beat Native's later dynamic style. Keyframes are shared, not duplicated.
    format!("@layer theme, base, components, utilities;\n@layer utilities.hozo-candidates {{\n{out}}}\n\n{owned}")
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

fn source_text(source: &str, expr_ref: hozo_ir::ExprRef) -> &str {
    &source[expr_ref.0.start as usize..expr_ref.0.end as usize]
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
        .unwrap_or("true")
        .to_string()
}

fn attribute_value_slice(source: &str, span: hozo_ir::ExprRef) -> Option<&str> {
    let text = source_text(source, span);
    let (_, value) = text.split_once('=')?;
    let value = value.trim();
    Some(
        value
            .strip_prefix('{')
            .and_then(|rest| rest.strip_suffix('}'))
            .unwrap_or(value)
            .trim(),
    )
}
fn render_condition_expr(source: &str, expr: &hozo_ir::ConditionExpr) -> String {
    use hozo_ir::ConditionExpr;
    match expr {
        ConditionExpr::Static(value) => value.to_string(),
        ConditionExpr::Ref(r) => source_text(source, *r).to_string(),
        ConditionExpr::Captured(capture) => format!(
            "{}[{}]",
            hozo_ir::ClassEvaluation::binding(source, capture.plan),
            capture.index
        ),
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
                    .map(|inner| inner.trim().to_string())
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
    for (condition, props) in hozo_ir::group_by_condition(style) {
        let props = hozo_ir::dedupe_last_wins(props);
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

fn render_node(node: &Node, cx: &mut WebRenderContext<'_>) -> Rendered {
    let source = cx.source;
    let theme = cx.theme;
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
    // spelled. React Native folds them together -- `aria-disabled` and
    // `accessibilityState.disabled` are one state, and `Pressable.js`
    // merges the `disabled` prop into it -- so Hozo does too, rather than
    // emitting `aria-disabled` twice and letting the later one win by
    // accident, which is what writing both used to do.
    let state_disabled = node
        .props
        .accessibility_state
        .filter(|_| {
            node.props
                .accessibility_state_keys
                .as_ref()
                .is_none_or(|keys| keys.iter().any(|key| key == "disabled"))
        })
        .map(|value| format!("({}).disabled", source_text(source, value)));
    let disabled_expr = match (node.props.disabled.as_ref(), state_disabled) {
        (Some(flag), Some(state)) => Some(format!(
            "({}) || {state}",
            render_condition_expr(source, flag)
        )),
        (Some(flag), None) => Some(render_condition_expr(source, flag)),
        (None, state) => state,
    };

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

    // The generated class is dropped when no rule was written for it. It
    // matched nothing, so it was a class attribute on every unstyled
    // element and bytes in every render -- found by rendering the output
    // and comparing the classes in the DOM against the ones the stylesheet
    // defines, which is a comparison nothing had made before.
    let mut classes = if cx.rules.len() == rules_before {
        String::new()
    } else {
        class_name
    };
    if node.primitive.is_view_box() {
        *cx.uses_view_base = true;
        classes = if classes.is_empty() {
            "hozo-view".to_string()
        } else {
            format!("hozo-view {classes}")
        };
    }
    if node.primitive == Primitive::ScrollView {
        classes = if classes.is_empty() {
            "hozo-scroll-view".to_string()
        } else {
            format!("hozo-scroll-view {classes}")
        };
    }
    // The classes Hozo produced no style for, put back.
    //
    // They used to be dropped, which deleted a project's own `my-card`
    // from the element and, worse, Tailwind's `group` and `peer` -- marker
    // classes with no styles of their own, whose entire purpose is to be
    // selected against by a descendant. Not understanding a thing is not a
    // reason to delete it; the same rule the props and children already
    // follow.
    for carried in &node.carried_classes {
        if classes.is_empty() {
            classes = carried.clone();
        } else {
            classes.push(' ');
            classes.push_str(carried);
        }
    }

    // `className`, not `class` -- Hozo's Web output is consumed as JSX
    // (the Vite plugin splices it back into React source), not raw HTML.
    //
    // Anything the parser couldn't decompose statically (proposal §7's
    // third tier) is concatenated back on at runtime. What it evaluates to
    // is matched by the project-wide candidate stylesheet
    // (`render_candidate_stylesheet`) -- the browser's own CSS engine does
    // the resolution, with no runtime code involved.
    // A className branch's guard, as the class its rules select on: present
    // when the source's condition holds. See `css::expr_ref_class`.
    let guards = class_guards(&node.style, source);
    let mut attrs =
        if node.class_name_fallback.is_empty()
            && node.props.stylex_residuals.is_empty()
            && guards.is_empty()
        {
            if classes.is_empty() {
                String::new()
            } else {
                format!(r#" className="{classes}""#)
            }
        } else {
            for expr_ref in &node.class_name_fallback {
                cx.diagnostics.push(hozo_ir::Diagnostic {
                    code: hozo_ir::DiagnosticCode::DynamicClassNameNotResolved,
                    severity: hozo_ir::Severity::Warning,
                    message: format!(
                        "`{}` can't be resolved at build time, so it's passed through and its CSS \
                     comes from the project-wide candidate stylesheet instead. Only classes \
                     whose text appears literally somewhere in the project are covered -- one \
                     assembled at runtime (`` `bg-${{color}}-500` ``) still won't be.",
                        source_text(source, *expr_ref)
                    ),
                    span: node.span,
                });
            }
            let parts: Vec<String> =
                std::iter::once(format!(r#""{classes}""#))
                    .chain(guards)
                    .chain(node.props.stylex_residuals.iter().map(|residual| {
                        format!("({}).className", residual.render_expression(source))
                    }))
                    .chain(node.class_name_fallback.iter().map(|r| {
                        node.root_class_evaluation().map_or_else(
                            || source_text(source, *r).to_string(),
                            |evaluation| evaluation.value(source, *r),
                        )
                    }))
                    .collect();
            let mut value = format!("[{}].filter(Boolean).join(' ')", parts.join(", "));
            if !node.class_name_fallback.is_empty() {
                // Do not turn an empty class list into a truthy one: a runtime
                // component can use emptiness to select its own defaults.
                value.push_str(".replace(/\\S/, 'hozo-candidate-owner $&')");
            }
            format!(" className={{{value}}}")
        };
    // A component's other class lists, compiled the same way and handed to
    // it under the prop the author wrote (`removeClassName`).
    for slot in node
        .props
        .class_slots
        .iter()
        .filter(|slot| slot.slot != hozo_ir::ClassSlot::ROOT)
    {
        let slot_class = cx.allocator.alloc();
        let before = cx.rules.len();
        push_rules_using(
            &slot_class,
            &slot.style,
            slot.span,
            theme,
            cx.rules,
            cx.diagnostics,
            css::render_slot_rule,
        );
        let produced = (cx.rules.len() != before).then_some(slot_class);
        let classes: Vec<&str> = produced
            .iter()
            .map(String::as_str)
            .chain(slot.carried.iter().map(String::as_str))
            .collect();
        if !slot.fallback.is_empty() || slot.evaluation.is_some() {
            for _ in &slot.fallback {
                cx.diagnostics.push(hozo_ir::Diagnostic {
                    code: hozo_ir::DiagnosticCode::DynamicClassNameNotResolved,
                    severity: hozo_ir::Severity::Warning,
                    message: format!("`{}` retains an opaque class expression; its CSS comes from the project-wide candidate stylesheet. Use a static string for build-time validation.", slot.slot.class_prop),
                    span: slot.span,
                });
            }
            // The fallback remains an authored value, not a condition
            // emitted onto the widget root instead of the slot owner.
            let compiled = std::iter::once(format!("{:?}", classes.join(" ")))
                .chain(class_guards(&slot.style, source))
                .collect::<Vec<_>>()
                .join(", ");
            // With no unconditional text, an inactive branch is an empty
            // class list. A guard/base marker must not turn it truthy and
            // suppress the component's empty-class defaults.
            let compiled = if slot.evaluation.is_some()
                && slot
                    .style
                    .iter()
                    .all(|d| matches!(d.condition, hozo_ir::Condition::Expr(_)))
            {
                let active = slot
                    .style
                    .iter()
                    .filter_map(|d| match &d.condition {
                        hozo_ir::Condition::Expr(expression) => {
                            Some(render_condition_expr(source, expression))
                        }
                        _ => None,
                    })
                    .collect::<std::collections::BTreeSet<_>>()
                    .into_iter()
                    .map(|expr| format!("({expr})"))
                    .collect::<Vec<_>>()
                    .join(" || ");
                format!("...(({active}) ? [{compiled}] : [])")
            } else {
                compiled
            };
            let parts = std::iter::once(compiled)
                .chain(slot.fallback.iter().map(|expr| {
                    slot.evaluation.as_ref().map_or_else(
                        || source_text(source, *expr).to_string(),
                        |evaluation| evaluation.value(source, *expr),
                    )
                }))
                .collect::<Vec<_>>()
                .join(", ");
            let mut value = format!("[{parts}].filter(Boolean).join(' ')");
            if !slot.fallback.is_empty() {
                value.push_str(
                    ".replace(/\\S/, 'hozo-candidate-owner hozo-candidate-slot-owner $&')",
                );
            }
            if let Some(evaluation) = &slot.evaluation {
                value = evaluation.wrap(source, &value);
            }
            attrs.push_str(&format!(" {}={{{value}}}", slot.slot.class_prop));
        } else if !classes.is_empty() {
            attrs.push_str(&format!(
                r#" {}="{}""#,
                slot.slot.class_prop,
                classes.join(" ")
            ));
        }
    }
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

    // A meter's amount as a percentage, which is what a reader is given on
    // Native. Without it NVDA reads `<meter value={0.6}>` as "progress bar,
    // 0.6" and VoiceOver as "0.6" (screen-readers run 37790021610): the
    // fraction, not the amount. Worked out at build time when the three
    // numbers are written; otherwise the same sum runs on the page. An
    // author's own `aria-valuetext` wins.
    if tag == "meter"
        && !node
            .props
            .passthrough
            .iter()
            .any(|prop| prop.name.as_deref() == Some("aria-valuetext"))
    {
        if let Some(text) = meter_value_text(node, source) {
            attrs.push_str(&format!(" aria-valuetext={{{text}}}"));
        }
    }
    if let Some(value) = node.props.test_id {
        let name = if is_hozo_component {
            "testID"
        } else {
            "data-testid"
        };
        attrs.push_str(&format!(" {name}={{{}}}", source_text(source, value)));
    }
    if let Some(value) = node.props.native_id {
        let name = if is_hozo_component { "nativeID" } else { "id" };
        attrs.push_str(&format!(" {name}={{{}}}", source_text(source, value)));
    }
    if let Some(value) = node.props.pointer_events {
        let name = if is_hozo_component {
            "pointerEvents"
        } else {
            "data-hozo-pointer-events"
        };
        attrs.push_str(&format!(" {name}={{{}}}", source_text(source, value)));
    }
    if let Some(value) = node.props.accessibility_state {
        let value = source_text(source, value);
        if is_hozo_component {
            attrs.push_str(&format!(" accessibilityState={{{value}}}"));
        } else {
            // Only the keys the author actually wrote.
            //
            // This used to emit all five unconditionally, which is a type
            // error the moment the value is an object literal with fewer:
            // `accessibilityState={{ expanded: open }}` produced
            // `aria-disabled={({ expanded: open }).disabled}`, and
            // `Property 'disabled' does not exist` -- four times, in the
            // author's own build. A partial state object is the normal way
            // to write one.
            //
            // `None` keys means the expression is opaque (a variable, a
            // spread). Reading any of the five off that is fine: React
            // Native's `AccessibilityState` declares all of them optional.
            for (attr_name, key) in ARIA_STATE_ATTRS {
                // `disabled` folds into `hozoInteractive` when there is
                // one; emitting it here too put `aria-disabled` on the
                // element twice and let the later win by accident.
                if (synthesized_control || tag == "a") && *key == "disabled" {
                    continue;
                }
                let written = node
                    .props
                    .accessibility_state_keys
                    .as_ref()
                    .is_none_or(|keys| keys.iter().any(|written| written == key));
                if written {
                    attrs.push_str(&format!(" {attr_name}={{({value}).{key}}}"));
                }
            }
        }
    }
    if let Some(value) = node.props.accessibility_value {
        let value = source_text(source, value);
        if is_hozo_component {
            attrs.push_str(&format!(" accessibilityValue={{{value}}}"));
        } else {
            // Only the keys the literal has, for the reason the state
            // above does the same: reading `.text` off `{ min, max, now }`
            // is a type error in the author's own project, and `next
            // build` type-checks by default. `None` keys means the
            // expression is opaque, and reading any of the four off that
            // is fine -- React Native declares all of them optional.
            for (attr_name, key) in [
                ("aria-valuemin", "min"),
                ("aria-valuemax", "max"),
                ("aria-valuenow", "now"),
                ("aria-valuetext", "text"),
            ] {
                let written = node
                    .props
                    .accessibility_value_keys
                    .as_ref()
                    .is_none_or(|keys| keys.iter().any(|written| written == key));
                if written {
                    attrs.push_str(&format!(" {attr_name}={{({value}).{key}}}"));
                }
            }
        }
    }
    if let Some(value) = node.props.accessibility_live_region {
        let value = source_text(source, value);
        if is_hozo_component {
            attrs.push_str(&format!(" accessibilityLiveRegion={{{value}}}"));
        } else {
            attrs.push_str(&format!(
                " aria-live={{{value} === 'none' ? undefined : {value}}}"
            ));
        }
    }
    if let Some(value) = node.props.on_layout {
        attrs.push_str(&format!(" onLayout={{{}}}", source_text(source, value)));
    }
    if tag == "Heading" {
        if let Some(level) = &node.props.heading_level {
            let value = match level {
                hozo_ir::HeadingLevel::Static(level) => level.to_string(),
                hozo_ir::HeadingLevel::Dynamic(expr) => source_text(source, *expr).to_string(),
            };
            attrs.push_str(&format!(" level={{{value}}}"));
        }
    }
    if tag == "List" {
        if let Some(ordered) = &node.props.list_ordered {
            attrs.push_str(&format!(
                " ordered={{{}}}",
                render_condition_expr(source, ordered)
            ));
        }
    }

    // Written under the DOM's name for it. See the parser: the source may
    // spell this either way, and re-emitting `accessibilityLabel` here
    // would leave the field with no accessible name at all.
    if node.primitive != Primitive::Image {
        if let Some(label) = node.props.accessibility_label {
            // `aria-label` for a real DOM element; `accessibilityLabel` for a
            // Hozo component, which maps it to `aria-label` itself. Writing
            // the DOM spelling on a component would make it an unknown prop
            // that React drops.
            let name = if is_hozo_component {
                "accessibilityLabel"
            } else {
                "aria-label"
            };
            attrs.push_str(&format!(" {name}={{{}}}", source_text(source, label)));
        }
    }
    if let Some(hint) = node.props.accessibility_hint {
        let name = if is_hozo_component {
            "accessibilityHint"
        } else {
            "aria-description"
        };
        attrs.push_str(&format!(" {name}={{{}}}", source_text(source, hint)));
    }
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
    // A tag that lowered to a DOM element, rather than one carried
    // verbatim: a foreign component supplies its own behaviour and a spread
    // aimed at a `div` would be props it never asked for. Lowercase is the
    // whole test -- JSX reserves it for host elements.
    let lowered_to_dom = tag.chars().next().is_some_and(char::is_lowercase);
    if lowered_to_dom && (node.primitive == Primitive::ScrollView || scrolls_by_style(node)) {
        // Keyboard access for the scroll container, decided at runtime
        // because nothing that decides it is a compile-time fact:
        // whether it overflows depends on CSS, content and viewport,
        // and whether it holds anything focusable depends on what a
        // runtime expression rendered. See `hozoScrollable` and #99.
        //
        // Skipped entirely when the author wrote `tabIndex`. That is the
        // whole of the precedence rule, and settling it here rather than
        // in the runtime means there is no branch to get wrong: an
        // author saying `tabIndex={-1}` means it, and a spread that is
        // never emitted cannot argue.
        let authored_tab_index = node.props.passthrough.iter().any(|prop| {
            !prop.is_spread
                && source_text(source, prop.span)
                    .trim_start()
                    .starts_with("tabIndex")
        });
        if !authored_tab_index {
            attrs.push_str(" {...hozoScrollable()}");
        }
    }
    if node.primitive == Primitive::ScrollView {
        if tag == "HozoScrollView" {
            if let Some(refreshing) = &node.props.refreshing {
                attrs.push_str(&format!(
                    " refreshing={{{}}}",
                    render_condition_expr(source, refreshing)
                ));
            }
            if let Some(on_refresh) = node.props.on_refresh {
                attrs.push_str(&format!(
                    " onRefresh={{{}}}",
                    source_text(source, on_refresh)
                ));
            }
            if let Some(value) = node.props.keyboard_should_persist_taps {
                attrs.push_str(&format!(
                    " keyboardShouldPersistTaps={{{}}}",
                    source_text(source, value)
                ));
            }
            if let Some(value) = &node.props.shows_vertical_scroll_indicator {
                attrs.push_str(&format!(
                    " showsVerticalScrollIndicator={{{}}}",
                    render_condition_expr(source, value)
                ));
            }
            if let Some(value) = &node.props.shows_horizontal_scroll_indicator {
                attrs.push_str(&format!(
                    " showsHorizontalScrollIndicator={{{}}}",
                    render_condition_expr(source, value)
                ));
            }
        } else if node.props.shows_vertical_scroll_indicator.is_some()
            || node.props.shows_horizontal_scroll_indicator.is_some()
        {
            let horizontal = node
                .props
                .scroll_horizontal
                .as_ref()
                .map(|value| render_condition_expr(source, value))
                .unwrap_or_else(|| "false".to_string());
            let vertical = node
                .props
                .shows_vertical_scroll_indicator
                .as_ref()
                .map(|value| render_condition_expr(source, value))
                .unwrap_or_else(|| "true".to_string());
            let horizontal_indicator = node
                .props
                .shows_horizontal_scroll_indicator
                .as_ref()
                .map(|value| render_condition_expr(source, value))
                .unwrap_or_else(|| "true".to_string());
            attrs.push_str(&format!(
                " data-hozo-hide-scrollbar={{({horizontal} ? !({horizontal_indicator}) : !({vertical})) ? '' : undefined}}"
            ));
        }
    } else if node.primitive == Primitive::FlatList {
        if let Some(refreshing) = &node.props.refreshing {
            attrs.push_str(&format!(
                " refreshing={{{}}}",
                render_condition_expr(source, refreshing)
            ));
        }
        if let Some(on_refresh) = node.props.on_refresh {
            attrs.push_str(&format!(
                " onRefresh={{{}}}",
                source_text(source, on_refresh)
            ));
        }
        if let Some(value) = node.props.keyboard_should_persist_taps {
            attrs.push_str(&format!(
                " keyboardShouldPersistTaps={{{}}}",
                source_text(source, value)
            ));
        }
        if let Some(value) = &node.props.shows_vertical_scroll_indicator {
            attrs.push_str(&format!(
                " showsVerticalScrollIndicator={{{}}}",
                render_condition_expr(source, value)
            ));
        }
        if let Some(value) = &node.props.shows_horizontal_scroll_indicator {
            attrs.push_str(&format!(
                " showsHorizontalScrollIndicator={{{}}}",
                render_condition_expr(source, value)
            ));
        }
    } else if node.primitive == Primitive::RefreshControl {
        if let Some(refreshing) = &node.props.refreshing {
            attrs.push_str(&format!(
                " refreshing={{{}}}",
                render_condition_expr(source, refreshing)
            ));
        }
        if let Some(on_refresh) = node.props.on_refresh {
            attrs.push_str(&format!(
                " onRefresh={{{}}}",
                source_text(source, on_refresh)
            ));
        }
    }
    if matches!(node.primitive, Primitive::ScrollView | Primitive::FlatList) {
        if let Some(value) = node.props.on_scroll {
            attrs.push_str(&format!(" onScroll={{{}}}", source_text(source, value)));
        }
        if let Some(value) = node.props.scroll_event_throttle {
            attrs.push_str(&format!(
                " scrollEventThrottle={{{}}}",
                source_text(source, value)
            ));
        }
    }
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
    if let Some(on_press) = node.props.on_press {
        let name = if is_hozo_component {
            "onPress"
        } else {
            "onClick"
        };
        // Not when the author already wrote the name this maps onto.
        //
        // `onPress` is React Native's spelling and becomes `onClick` here,
        // so an element carrying both got `onClick` twice. JSX resolves a
        // duplicate last-wins and the passthrough is emitted last, so the
        // author's `onClick` won and their `onPress` was dropped in
        // silence -- the prop the compiler models losing to the one it
        // carries, which is backwards.
        //
        // The Native backend already guards its semantic props this way,
        // for the same reason and with the same treatment of a spread: its
        // contents are unknowable here, so the mapping stays, and if the
        // spread does carry the prop it lands last and still wins.
        let authored_target = node
            .props
            .passthrough
            .iter()
            .filter(|prop| !prop.is_spread)
            .filter_map(|prop| prop.name.as_deref())
            .any(|prop| prop == name);
        // Keyed off `tabIndex` being in the emitted attributes rather than
        // off the primitive: that attribute *is* the statement that Hozo
        // made this element focusable itself, so "Hozo put it in the tab
        // order" and "Hozo owes it the rest of being a control" cannot
        // drift apart.
        if tag == "a" && disabled_expr.is_some() && !authored_target {
            // Anchors have no native disabled state. Keep the real href
            // for copying, SEO, and browser menus, but suppress ordinary
            // activation while disabled. The uncompiled HozoLink uses the
            // same conditional handler shape.
            // `event` binds only the disabled arm, not the authored handler
            // in the other arm. Trace that value, not the generated callback.
            let prefix = format!(
                " onClick={{({}) ? (event) => event.preventDefault() : ",
                disabled_expr.as_deref().unwrap_or("false"),
            );
            source_evidence::expression(
                &mut attrs,
                &mut attr_copies,
                source,
                source_text(source, on_press),
                &prefix,
                "}",
            );
        } else if synthesized_control {
            // One call, not five expressions. `disabled` means five things
            // at once (see docs/decisions/001) and emitting them
            // separately is how they came apart: this announced
            // `aria-disabled` and then ran the handler anyway, and once
            // keyboard activation existed it ran on Enter and Space too.
            //
            // It also means the guard expression is evaluated once rather
            // than once per thing it decides.
            // The authored function is created in its original scope and
            // passed as a value. The helper does not wrap its source body.
            let suffix = format!(
                "{})}}",
                disabled_expr
                    .as_ref()
                    .map(|expr| format!(", {expr}"))
                    .unwrap_or_default(),
            );
            source_evidence::expression(
                &mut attrs,
                &mut attr_copies,
                source,
                source_text(source, on_press),
                " {...hozoInteractive(",
                &suffix,
            );
            *cx.uses_key_activation = true;
            // `hozoInteractive` marks the element `data-hozo-pressable`,
            // and the rule that gives it a pointer lives with the view base.
            *cx.uses_view_base = true;
        } else if authored_target {
            cx.diagnostics.push(hozo_ir::Diagnostic {
                code: hozo_ir::DiagnosticCode::PropCollidesWithPlatformName,
                severity: hozo_ir::Severity::Warning,
                message: format!(
                    "`onPress` compiles to `{name}` on Web and this element already has one,                      so the `onPress` handler is not used. Keep whichever you meant."
                ),
                span: node.span,
            });
        } else {
            source_evidence::expression(
                &mut attrs,
                &mut attr_copies,
                source,
                source_text(source, on_press),
                &format!(" {name}={{"),
                "}",
            );
            // A real `<button>` is a control already, but since Tailwind
            // v4's Preflight its cursor is `default`. The same marker as a
            // synthesized control; the rule itself skips `:disabled`.
            if node.primitive == Primitive::Button && tag == "button" {
                attrs.push_str(" data-hozo-pressable=\"\"");
                *cx.uses_view_base = true;
            }
        }
    }
    if tag == "a"
        && node.props.on_press.is_none()
        && !node
            .props
            .passthrough
            .iter()
            .any(|prop| prop.name.as_deref() == Some("onClick"))
    {
        if let Some(disabled) = &disabled_expr {
            attrs.push_str(&format!(
                " onClick={{({disabled}) ? (event) => event.preventDefault() : undefined}}"
            ));
        }
    }
    if tag == "a" {
        if let Some(disabled) = &disabled_expr {
            attrs.push_str(&format!(" aria-disabled={{{disabled}}}"));
            // Keep href available to copying/context menus, but not in the
            // sequential keyboard order while unavailable (decision 001).
            // An authored tabindex is restored only in the enabled branch.
            let authored_tab = node
                .props
                .passthrough
                .iter()
                .find(|prop| prop.name.as_deref() == Some("tabIndex"));
            if let Some(prop) = authored_tab {
                let value = attribute_value_slice(source, prop.span).unwrap_or("true");
                source_evidence::expression(
                    &mut attrs,
                    &mut attr_copies,
                    source,
                    value,
                    &format!(" tabIndex={{({disabled}) ? -1 : ("),
                    ")}",
                );
            } else {
                let enabled = node
                    .props
                    .focusable
                    .as_ref()
                    .map(|value| format!("({}) ? 0 : -1", render_condition_expr(source, value)))
                    .unwrap_or_else(|| "undefined".to_string());
                attrs.push_str(&format!(" tabIndex={{({disabled}) ? -1 : {enabled}}}"));
            }
            if !node
                .props
                .passthrough
                .iter()
                .any(|prop| prop.name.as_deref() == Some("onAuxClick"))
            {
                attrs.push_str(&format!(
                    " onAuxClick={{({disabled}) ? (event) => event.preventDefault() : undefined}}"
                ));
            }
        }
    }
    for (name, value) in [
        (
            "onStartShouldSetResponder",
            node.props.on_start_should_set_responder,
        ),
        (
            "onStartShouldSetResponderCapture",
            node.props.on_start_should_set_responder_capture,
        ),
        (
            "onMoveShouldSetResponder",
            node.props.on_move_should_set_responder,
        ),
        (
            "onMoveShouldSetResponderCapture",
            node.props.on_move_should_set_responder_capture,
        ),
        ("onResponderGrant", node.props.on_responder_grant),
        ("onResponderStart", node.props.on_responder_start),
        ("onResponderMove", node.props.on_responder_move),
        ("onResponderEnd", node.props.on_responder_end),
        ("onResponderRelease", node.props.on_responder_release),
        ("onResponderReject", node.props.on_responder_reject),
        ("onResponderTerminate", node.props.on_responder_terminate),
        (
            "onResponderTerminationRequest",
            node.props.on_responder_termination_request,
        ),
    ] {
        if let Some(value) = value {
            source_evidence::expression(
                &mut attrs,
                &mut attr_copies,
                source,
                source_text(source, value),
                &format!(" {name}={{"),
                "}",
            );
        }
    }
    if let Some(disabled) = node
        .props
        .disabled
        .as_ref()
        .filter(|_| !synthesized_control && tag != "a")
    {
        // `disabled` is a real, React-boolean-aware HTML attribute only on
        // actual form controls (<button> here) -- react omits it entirely
        // when the value is falsy. Everything else Hozo maps to a <div>
        // (Pressable, View, Text), where the native attribute has no
        // effect at all, so ARIA is the honest choice there instead.
        // The actual rendered tag decides, not Primitive::Button, which
        // may be an anchor. Retained component aliases keep the portable
        // prop because they choose their host at runtime (#943).
        let attr_name =
            if is_hozo_component || matches!(tag, "button" | "input" | "textarea" | "select") {
                "disabled"
            } else {
                "aria-disabled"
            };
        attrs.push_str(&format!(
            " {attr_name}={{{}}}",
            render_condition_expr(source, disabled)
        ));
    }

    // React Native's `focusable`, in the spelling the DOM has.
    //
    // Carried verbatim before this, which meant it reached a `<div>` as an
    // attribute nothing reads -- so a prop that works on Native did
    // nothing at all on Web, silently. React Native's own `tabIndex: 0 |
    // -1` needs no translation and stays a passthrough, which is also why
    // an author who wrote both gets theirs: passthrough props are emitted
    // last.
    if let Some(value) = node
        .props
        .focusable
        .as_ref()
        .filter(|_| !(tag == "a" && disabled_expr.is_some()))
    {
        if is_hozo_component {
            attrs.push_str(&boolean_attribute("focusable", value, source));
        } else {
            attrs.push_str(&match value {
                // `<View focusable />` and `focusable={false}` are both known
                // at compile time, so they become the attribute they mean
                // rather than a ternary over a constant.
                hozo_ir::ConditionExpr::Static(true) => " tabIndex={0}".to_string(),
                hozo_ir::ConditionExpr::Static(false) => " tabIndex={-1}".to_string(),
                other => format!(
                    " tabIndex={{({}) ? 0 : -1}}",
                    render_condition_expr(source, other)
                ),
            });
        }
    }

    // The styling hook, on every element Hozo marks disabled and by
    // whichever spelling. `disabled:` compiles to `[data-hozo-disabled]`
    // (see `css.rs`), so a `<button>`, a `<div aria-disabled>` and a
    // dimmed region all have to carry it or the rule matches nothing --
    // which is what `disabled:opacity-50` on a Pressable used to do.
    //
    // `{expr ? '' : undefined}` is the presence form the rest of Hozo's
    // `data-hozo-*` attributes already use: React renders `data-x={false}`
    // as the string "false", and an attribute selector matches that.
    //
    // Skipped when `hozoInteractive` is supplying it, which is the same
    // rule the state attributes above follow.
    if let Some(expr) = disabled_expr.as_ref().filter(|_| !synthesized_control) {
        attrs.push_str(&format!(
            " data-hozo-disabled={{({expr}) ? '' : undefined}}"
        ));
    }

    // The `TextInput` props the DOM has under another name.
    //
    // Every one of these was passed through before, which is the right
    // default for a prop only React Native has and the wrong one for a
    // prop the DOM has and spells differently. `onChangeText` reached
    // `<input onChangeText={…}>`: the field rendered, React warned, and
    // typing in it did nothing.
    if !node.props.text_input.is_empty() {
        let text_input = &node.props.text_input;
        if let Some(handler) = text_input.on_change_text {
            // The wrapper the fallback `TextInput` in `@hozo/core` has
            // always written, generated here instead. Parenthesised
            // because the handler is an arbitrary expression and
            // `a || b` beside a call would bind the wrong way.
            attrs.push_str(&format!(
                " onChange={{(event) => ({})(event.target.value)}}",
                source_text(source, handler),
            ));
        }
        // Two spellings of one attribute. React Native 0.87 has both, so
        // an author may write either, and `editable` is the negative of
        // the two -- `editable={false}` is `readOnly`.
        if let Some(editable) = text_input.editable.as_ref() {
            attrs.push_str(&match editable {
                hozo_ir::ConditionExpr::Static(true) => String::new(),
                hozo_ir::ConditionExpr::Static(false) => " readOnly".to_string(),
                other => format!(" readOnly={{!({})}}", render_condition_expr(source, other)),
            });
        }
        if let Some(read_only) = text_input.read_only.as_ref() {
            attrs.push_str(&boolean_attribute("readOnly", read_only, source));
        }
        if let Some(auto_correct) = text_input.auto_correct.as_ref() {
            attrs.push_str(&match auto_correct {
                hozo_ir::ConditionExpr::Static(true) => " autoCorrect=\"on\"".to_string(),
                hozo_ir::ConditionExpr::Static(false) => " autoCorrect=\"off\"".to_string(),
                other => format!(
                    // Evaluate an arbitrary author expression once, preserving
                    // `undefined` (the platform default) rather than disabling it.
                    " autoCorrect={{((value) => value === undefined ? undefined : value ? 'on' : 'off')({})}}",
                    render_condition_expr(source, other),
                ),
            });
        }
        if let Some(secure) = text_input.secure_text_entry.as_ref() {
            attrs.push_str(&match secure {
                hozo_ir::ConditionExpr::Static(true) => " type=\"password\"".to_string(),
                hozo_ir::ConditionExpr::Static(false) => String::new(),
                other => format!(
                    " type={{({}) ? 'password' : 'text'}}",
                    render_condition_expr(source, other),
                ),
            });
        }
        if let Some(mode) = text_input.dom_input_mode() {
            attrs.push_str(&format!(" inputMode=\"{mode}\""));
        }
        // `numberOfLines` is only `rows` on the element `multiline`
        // produces. On an `<input>` there are no rows to set.
        if let Some(rows) = text_input.number_of_lines.filter(|_| is_textarea(node)) {
            attrs.push_str(&format!(" rows={{{}}}", source_text(source, rows)));
        }
    }

    // `replace` belongs to an application router, not to HTML. Preserve
    // it on the real anchor as inert data so @hozo/navigation's delegated
    // click handler can reconstruct the request for compiled output too.
    if let Some(replace) = &node.props.navigation_replace {
        if tag == "a" {
            match replace {
                hozo_ir::ConditionExpr::Static(true) => {
                    attrs.push_str(" data-hozo-navigation-replace=\"\"");
                }
                hozo_ir::ConditionExpr::Static(false) => {}
                other => attrs.push_str(&format!(
                    " data-hozo-navigation-replace={{({}) ? '' : undefined}}",
                    render_condition_expr(source, other)
                )),
            }
        } else if tag == "Pressable" {
            attrs.push_str(&boolean_attribute("replace", replace, source));
        }
    }

    // Like `replace`, prefetch intent belongs to the router rather than
    // HTML. The provider observes this inert marker on hover or focus.
    if let Some(prefetch) = &node.props.navigation_prefetch {
        if tag == "a" {
            match prefetch {
                hozo_ir::ConditionExpr::Static(true) => {
                    attrs.push_str(" data-hozo-navigation-prefetch=\"\"");
                }
                hozo_ir::ConditionExpr::Static(false) => {}
                other => attrs.push_str(&format!(
                    " data-hozo-navigation-prefetch={{({}) ? '' : undefined}}",
                    render_condition_expr(source, other)
                )),
            }
        } else if tag == "Pressable" {
            attrs.push_str(&boolean_attribute("prefetch", prefetch, source));
        }
    }

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
    let mut external_target_consumed = false;
    if tag == "a" {
        let named = |wanted: &str| {
            node.props
                .passthrough
                .iter()
                .find(|prop| prop.name.as_deref() == Some(wanted))
        };
        let authored_rel = named("rel").is_some();
        match named("external") {
            // `<Link external>` and `external={true}`. Known here, so it
            // becomes the attributes it means rather than a ternary over
            // a constant -- the shape `focusable` already uses above.
            Some(prop) if prop.literal.as_deref() == Some("true") => {
                external_target_consumed = true;
                attrs.push_str(" target=\"_blank\"");
                if !authored_rel {
                    attrs.push_str(" rel=\"noreferrer noopener\"");
                }
            }
            // `external={false}` says nothing beyond dropping the prop.
            Some(prop) if prop.literal.is_some() => {}
            Some(prop) => {
                // Carried as a ternary rather than decided, which is what
                // Hozo does with every expression it cannot read. The
                // expression is emitted twice; `data-hozo-disabled` above
                // already re-emits `disabled` the same way.
                external_target_consumed = true;
                let expr = attribute_value_source(source, prop.span);
                attrs.push_str(&format!(" target={{({expr}) ? '_blank' : undefined}}"));
                if !authored_rel {
                    attrs.push_str(&format!(
                        " rel={{({expr}) ? 'noreferrer noopener' : undefined}}"
                    ));
                }
            }
            None => {}
        }
        // A `_blank` written out by hand earns the same `rel`: the risk
        // belongs to the new browsing context, not to the spelling.
        if named("external").is_none() && !authored_rel {
            if let Some(prop) = named("target") {
                match prop.literal.as_deref() {
                    Some("_blank") => attrs.push_str(" rel=\"noreferrer noopener\""),
                    Some(_) => {}
                    None => {
                        let expr = attribute_value_source(source, prop.span);
                        attrs.push_str(&format!(
                            " rel={{(({expr}) === '_blank') ? 'noreferrer noopener' : undefined}}"
                        ));
                    }
                }
            }
        }
    }
    // Everything Hozo doesn't model, re-emitted verbatim and last so JSX's
    // last-wins duplicate resolution keeps matching the source's own
    // ordering semantics. Known cross-platform props were consumed above;
    // an unknown RN-specific prop is still carried as written, because a
    // visible React warning is safer than silently deleting app behavior.
    for prop in &node.props.passthrough {
        if tag == "a" {
            if let Some(disabled) = &disabled_expr {
                if prop.name.as_deref() == Some("tabIndex") {
                    continue; // Emitted once above, guarded by disabled.
                }
                if let Some(name @ ("onClick" | "onAuxClick")) = prop.name.as_deref() {
                    let value = attribute_value_slice(source, prop.span).unwrap_or("true");
                    source_evidence::expression(
                        &mut attrs,
                        &mut attr_copies,
                        source,
                        value,
                        &format!(" {name}={{({disabled}) ? (event) => event.preventDefault() : "),
                        "}",
                    );
                    continue;
                }
            }
        }
        if let Some(slot) = node
            .primitive
            .class_slots()
            .iter()
            .find(|slot| prop.name.as_deref() == Some(slot.class_prop))
        {
            let text = source_text(source, prop.span);
            if let Some(expression) = text
                .split_once('=')
                .map(|(_, value)| value.trim())
                .and_then(|value| {
                    value
                        .strip_prefix('{')
                        .and_then(|value| value.strip_suffix('}'))
                })
            {
                // Slot classes land on a child, not the widget's root.
                // Mark that exact target, evaluate once and preserve absent
                // values so component defaults and descendant raw HTML stay
                // untouched. Native resolves this same dynamic slot last.
                source_evidence::expression(&mut attrs, &mut attr_copies, source, expression,
                        &format!(" {}={{((value) => typeof value === 'string' ? value.replace(/\\S/, 'hozo-candidate-owner hozo-candidate-slot-owner $&') : value)(", slot.class_prop), ")}");
                continue;
            }
        }
        // React Native accepts a recursively nested StyleProp array; React
        // DOM accepts one object. Passing the array through does not throw:
        // React serializes its numeric indices as CSS property names and
        // the browser ignores them, which is a quiet total style loss.
        // Keep the native-shaped value and normalize it only on a host DOM
        // element. A fallback component owns the same conversion itself.
        if !is_hozo_component && prop.name.as_deref() == Some("style") {
            if let Some(value) = attribute_value_slice(source, prop.span) {
                source_evidence::expression(
                    &mut attrs,
                    &mut attr_copies,
                    source,
                    value,
                    " style={hozoDomStyle(",
                    ")}",
                );
            } else {
                attrs.push_str(" style={hozoDomStyle(true)}");
            }
            continue;
        }
        // A spread can carry the same style without naming it in source.
        // The helper returns an ordinary spread unchanged when it has no
        // style key, so allocation is paid only by the dynamic path that
        // actually needs normalization.
        if !is_hozo_component && prop.is_spread {
            let text = source_text(source, prop.span);
            let value = text
                .strip_prefix("{...")
                .and_then(|rest| rest.strip_suffix('}'))
                .unwrap_or(text)
                .trim();
            source_evidence::expression(
                &mut attrs,
                &mut attr_copies,
                source,
                value,
                " {...hozoDomProps(",
                ")}",
            );
            continue;
        }
        // `external` is not an attribute the DOM has; it was lowered into
        // `target` and `rel` above. The authored `target` goes with it
        // when it did, because `external` means `_blank` and passthrough
        // props are emitted last -- left in place it would win, and
        // `@hozo/engine`'s half resolves the contradiction the other way.
        if tag == "a" {
            let name = prop.name.as_deref();
            if name == Some("external") || (external_target_consumed && name == Some("target")) {
                continue;
            }
        }
        // `decorative` and `orientation` are Hozo's words for a rule, not
        // the DOM's. They were reaching `<hr>` as attributes nothing reads,
        // while `markup::separator_attrs` says what they actually mean.
        if node.primitive == Primitive::Separator
            && matches!(
                prop.name.as_deref(),
                Some("decorative") | Some("orientation")
            )
        {
            continue;
        }
        attrs.push(' ');
        source_evidence::append(
            &mut attrs,
            &mut attr_copies,
            render_verbatim(prop.span, &prop.nested, cx),
        );
    }

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
    let text = if void {
        format!("<{tag}{attrs} />")
    } else {
        format!("<{tag}{attrs}>{}</{tag}>", inner.text)
    };
    if let Some(evaluation) = node.root_class_evaluation() {
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
fn render_verbatim(
    expr_ref: hozo_ir::ExprRef,
    nested: &[hozo_ir::NestedNode],
    cx: &mut WebRenderContext<'_>,
) -> Rendered {
    let start = expr_ref.0.start as usize;
    let mut out = Rendered::new(cx.tag_decisions.is_some());
    let mut cursor = start;
    for entry in nested {
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
        if let hozo_ir::Condition::Expr(expr) = &decl.condition {
            collect_from_expr(expr, &mut refs);
        }
    }
    refs.sort_by_key(|(reference, _)| (reference.0.start, reference.0.end));
    refs.dedup_by_key(|(reference, _)| *reference);
    refs.into_iter()
        .map(|(reference, expression)| {
            format!(
                "({}) && '{}'",
                render_condition_expr(source, expression),
                css::expr_ref_class(reference)
            )
        })
        .collect()
}

fn collect_from_expr<'a>(
    expr: &'a hozo_ir::ConditionExpr,
    out: &mut Vec<(hozo_ir::ExprRef, &'a hozo_ir::ConditionExpr)>,
) {
    use hozo_ir::ConditionExpr;
    match expr {
        ConditionExpr::Static(_) => {}
        ConditionExpr::Ref(r) => out.push((*r, expr)),
        ConditionExpr::Captured(capture) => out.push((capture.reference, expr)),
        ConditionExpr::Not(inner) => collect_from_expr(inner, out),
        ConditionExpr::And(a, b) | ConditionExpr::Or(a, b) => {
            collect_from_expr(a, out);
            collect_from_expr(b, out);
        }
    }
}
