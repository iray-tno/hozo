//! The public entry points: one tree lowered to JSX and CSS, with or without
//! the source evidence a binding records.

use crate::*;

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

pub(super) fn lower_capturing(
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
pub(super) fn omit_later_names(
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
