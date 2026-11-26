//! The entry points: a component lowered to React Native, with or without
//! forwarded text styles and evidence.

use hozo_ir::{Node, StyleDeclaration, Theme};

use super::candidate::style_pairs;
use super::conditions::RuntimeHook;
use super::context::{
    AncestorContext, FromAncestor, NameAllocator, NativeRenderContext, RuntimeNeeds,
};
use super::owner_style::{OwnerStyle, OwnerStyleInputs};
use super::render::render_node;
use super::structural::SiblingPosition;
use super::{interaction, text, LowerOutput, StyleEntry};

/// `source` is the original TSX text `root` was parsed from -- needed to
/// re-emit `ExprRef`/`ConditionExpr` guards verbatim (they're spans into
/// it, never evaluated by the compiler; see `hozo_ir`'s doc comments).
/// The binding the generated `StyleSheet.create` is assigned to.
///
/// Not `styles`. That is the name every React Native file in the world
/// already uses, and once the integrations stopped requiring a rewrite to
/// `@hozo/core` -- so that an existing RN file compiles as written --
/// declaring a second one beside it became a SyntaxError rather than a
/// shadowing. The bundle-size baseline in the native example was the first
/// file to hit it, which is fitting: it is the one deliberately written
/// the way React Native documents.
pub(super) const STYLE_OBJECT: &str = "hozoStyles";

pub fn lower(root: &Node, source: &str, theme: &Theme) -> LowerOutput {
    lower_forwarded(root, &[], source, theme)
}

/// The text declarations a component around the root hands it, out of
/// the declarations a package's manifest gave for it (#950). The rest, a
/// background or a padding, are the component's own box.
pub(super) fn forwarded_text(
    forwarded: &[StyleDeclaration],
) -> impl Iterator<Item = &StyleDeclaration> {
    forwarded
        .iter()
        .filter(|d| text::is_text_property(&d.property))
}

/// Whether a component around this element shares its interaction state
/// with it. The parser hands down a `hover:` or `active:` only from a host
/// that does (#974), so its presence is the answer, and a Text below reads
/// that state through `HozoText` as it would inside a pressable in its own
/// file.
pub(super) fn forwards_interaction(forwarded: &[StyleDeclaration]) -> bool {
    forwarded_text(forwarded).any(|d| interaction::uses_interaction(&d.condition))
}

/// `lower`, for a root inside components whose package's manifest says
/// what they hand down (`forwarded`, from `Root::forwarded`).
pub fn lower_forwarded(
    root: &Node,
    forwarded: &[StyleDeclaration],
    source: &str,
    theme: &Theme,
) -> LowerOutput {
    lower_forwarded_impl(root, forwarded, source, theme, false)
}

/// Same ordinary renderer, with exact surviving child fragments. No default
/// route, text experiment or owner eligibility is selected by this request.
#[doc(hidden)]
pub fn lower_forwarded_with_evidence(
    root: &Node,
    forwarded: &[StyleDeclaration],
    source: &str,
    theme: &Theme,
) -> LowerOutput {
    lower_forwarded_capturing(
        root,
        forwarded,
        source,
        theme,
        RenderOptions {
            source_evidence: true,
            ..Default::default()
        },
        None,
    )
}

/// RFC 006's opt-in measurement path, not a production fallback. Retain
/// owner typography and relative intent for the private Context reference.
/// No application/bundler configuration selects this output.
#[doc(hidden)]
pub fn lower_text_reference(
    root: &Node,
    forwarded: &[StyleDeclaration],
    source: &str,
    theme: &Theme,
) -> LowerOutput {
    lower_forwarded_impl(root, forwarded, source, theme, true)
}

/// Decision 013's route: the ordinary renderer, with outermost Text reading
/// the inheritance protocol for what it does not set, and a text-styled View
/// publishing only around children the compiler cannot see. Assessed per
/// element: anything it cannot carry is lowered exactly as ordinary output.
#[doc(hidden)]
pub fn lower_text_unified(
    root: &Node,
    forwarded: &[StyleDeclaration],
    source: &str,
    theme: &Theme,
    source_evidence: bool,
) -> LowerOutput {
    lower_forwarded_capturing(
        root,
        forwarded,
        source,
        theme,
        RenderOptions {
            text_unified: true,
            source_evidence,
            ..Default::default()
        },
        None,
    )
}

pub(super) fn lower_forwarded_impl(
    root: &Node,
    forwarded: &[StyleDeclaration],
    source: &str,
    theme: &Theme,
    text_reference: bool,
) -> LowerOutput {
    lower_forwarded_capturing(
        root,
        forwarded,
        source,
        theme,
        RenderOptions {
            text_reference,
            ..Default::default()
        },
        None,
    )
}

#[derive(Default)]
pub(super) struct RenderOptions {
    pub(super) text_reference: bool,
    pub(super) text_unified: bool,
    pub(super) source_evidence: bool,
}

pub(super) fn lower_forwarded_capturing(
    root: &Node,
    forwarded: &[StyleDeclaration],
    source: &str,
    theme: &Theme,
    options: RenderOptions,
    owner: Option<(&mut Option<OwnerStyle>, OwnerStyleInputs<'_>)>,
) -> LowerOutput {
    let RenderOptions {
        text_reference,
        text_unified,
        source_evidence,
    } = options;
    let (owner_style, owner_inputs) = owner
        .map(|(style, inputs)| (Some(style), inputs))
        .unwrap_or((None, OwnerStyleInputs::default()));
    let inherited: Vec<StyleDeclaration> = forwarded_text(forwarded).cloned().collect();
    let mut allocator = NameAllocator { next: 0 };
    let mut style_entries: Vec<StyleEntry> = Vec::new();
    // See `StyleEntry`: the third field says which palette the entry is
    // rendered against, and nothing but a dark copy sets it.
    let mut diagnostics = Vec::new();
    let mut runtime = RuntimeNeeds::default();
    let mut owner_callbacks = Vec::new();
    let mut runtime_states = Vec::new();

    // The root's position is genuinely unknowable here: it's whatever the
    // component's caller renders it into.
    let mut cx = NativeRenderContext {
        source,
        theme,
        allocator: &mut allocator,
        style_entries: &mut style_entries,
        diagnostics: &mut diagnostics,
        runtime: &mut runtime,
        text_reference,
        text_unified,
        text_depth: 0,
        owner_style,
        owner_inputs,
        source_evidence,
        owner_callbacks: &mut owner_callbacks,
        runtime_states: &mut runtime_states,
    };
    let ancestor = AncestorContext {
        inherited: &inherited,
        parent_font_size: None,
        // A separately compiled root cannot prove its future caller's size.
        // Only the internal text experiments pay this open-boundary cost today.
        parent_size_opaque: text_reference,
        in_dynamic_ruby: false,
        from_ancestor: FromAncestor::default(),
        grid_columns: None,
        grid_rows: None,
        parent_measured: false,
    };
    let jsx = render_node(
        root,
        SiblingPosition::UNKNOWN,
        forwards_interaction(forwarded),
        ancestor,
        &mut cx,
    );

    // One declaration per distinct hook, however many elements guard on
    // it: the binding is function-scoped, and calling the same hook twice
    // would both redeclare the name and change the hook order.
    let mut distinct: Vec<RuntimeHook> = Vec::new();
    for hook in runtime.hooks {
        if !distinct.contains(&hook) {
            distinct.push(hook);
        }
    }
    let prelude: Vec<String> = distinct
        .iter()
        .map(|hook| match hook {
            RuntimeHook::Keyframes(index) => format!(
                "const {} = useHozoKeyframes({})",
                hook.binding(),
                runtime.keyframes[*index]
            ),
            hook => hook.declaration(),
        })
        .collect();
    let native_imports = runtime.native;
    let mut runtime_imports: Vec<&'static str> = runtime.components;
    for hook in &distinct {
        if !runtime_imports.contains(&hook.import()) {
            runtime_imports.push(hook.import());
        }
    }

    let mut styles = String::from("{\n");
    // Computed once rather than per entry: it clones the palette, and a tree
    // of forty nodes would clone it forty times for an answer that cannot
    // change.
    let shaded = theme.dark();
    for (name, props, dark) in &style_entries {
        // An entry that only applies in dark mode resolves its colours
        // against the dark palette. The Web half says the same thing in the
        // same words; the two agreeing is the point.
        let palette = match (dark, &shaded) {
            (true, Some(shaded)) => shaded,
            _ => theme,
        };
        styles.push_str(&format!("  {name}: {{\n"));
        for (key, value) in style_pairs(props, palette) {
            styles.push_str(&format!("    {key}: {value},\n"));
        }
        styles.push_str("  },\n");
    }
    styles.push('}');

    LowerOutput {
        jsx: jsx.text,
        source_copies: jsx.copies,
        styles,
        prelude,
        runtime_imports,
        native_imports,
        diagnostics,
        owner_callbacks,
        runtime_states,
    }
}
