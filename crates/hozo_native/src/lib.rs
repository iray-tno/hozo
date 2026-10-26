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
mod class_route;
mod conditions;
mod grid;
mod interaction;
mod keyframes;
mod markup;
mod pattern;
mod pattern_layout;
mod render;
mod runtime_classes;
mod spread_style;
mod style;
mod text;
mod text_region;
mod transforms;
mod transition;

use candidate::style_pairs;
use conditions::{build_style_entries, unwired_variant, RuntimeHook};

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
    render_candidate_module, render_candidate_module_plan, CandidateModulePlan, CandidateOrdering,
    CandidatePriorityEntry, CandidatePriorityGroup,
};
use grid::{grid_absorbs, native_grid, native_grid_item};
use hozo_ir::{
    AlignSelf, Axis, Breakpoint, Condition, ConditionExpr, Diagnostic, DiagnosticCode, Display,
    Environment, ExprRef, FilterFunction, FormState, Length, Node, Primitive, Severity, Structural,
    StyleDeclaration, StyleProperty, SvgElement, TextOverflow, Theme, WhiteSpace,
};
use render::render_node;
pub use runtime_classes::{
    native_class_diagnostics, native_class_report, native_class_verdict,
    native_classes_drawn_statically, NativeClassFinding, NativeClassKind, NativeClassVerdict,
};
use transition::{ambient_transition, native_driver_transition};

pub struct LowerOutput {
    pub jsx: String,
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
}

/// What the generated module will need from `@hozo/engine`, accumulated
/// as the tree is walked.
///
/// Hooks and components are kept apart because only hooks constrain where
/// they may appear: a hook has to be declared once, unconditionally, in the
/// enclosing function body (`LowerOutput::prelude`), while a component is
/// just an element in the JSX. They share this struct only so that adding a
/// second kind of runtime dependency didn't mean threading a second `&mut`
/// through every rendering function.
#[derive(Default)]
pub(crate) struct RuntimeNeeds {
    pub hooks: Vec<RuntimeHook>,
    pub components: Vec<&'static str>,
    /// Tags this lowering emitted that `react-native` exports.
    ///
    /// Derived rather than listed. A tag reaching the output is one of
    /// three things and the other two are recognisable: `Primitive::Svg`
    /// comes from `react-native-svg`, and anything Hozo ships is spelled
    /// `Hozo…` -- so what is left is React Native's own. A list beside the
    /// mapping would be a second copy of it, and this repository has
    /// already paid three times for that shape.
    pub native: Vec<&'static str>,
    /// `useHozoKeyframes` arguments, one per distinct animation;
    /// `RuntimeHook::Keyframes` holds the index.
    pub keyframes: Vec<String>,
}

impl RuntimeNeeds {
    pub(crate) fn need_component(&mut self, name: &'static str) {
        if !self.components.contains(&name) {
            self.components.push(name);
        }
    }

    /// The hook for a keyframes spec, sharing one call between elements
    /// that run the same animation.
    pub(crate) fn keyframes_hook(&mut self, spec: String) -> RuntimeHook {
        let index = match self.keyframes.iter().position(|known| *known == spec) {
            Some(index) => index,
            None => {
                self.keyframes.push(spec);
                self.keyframes.len() - 1
            }
        };
        RuntimeHook::Keyframes(index)
    }

    pub(crate) fn need_native(&mut self, name: &'static str) {
        let name = name.split_once('.').map_or(name, |(root, _)| root);
        if !name.starts_with("Hozo") && !self.native.contains(&name) {
            self.native.push(name);
        }
    }
}

pub(crate) struct NameAllocator {
    pub next: u32,
}

impl NameAllocator {
    pub(crate) fn alloc(&mut self) -> String {
        let name = format!("hozo{}", self.next);
        self.next += 1;
        name
    }
}

/// Bundles compiler output and mutable state across native lowering.
pub(crate) struct NativeRenderContext<'a> {
    pub source: &'a str,
    pub theme: &'a Theme,
    pub allocator: &'a mut NameAllocator,
    pub style_entries: &'a mut Vec<StyleEntry>,
    pub diagnostics: &'a mut Vec<Diagnostic>,
    pub runtime: &'a mut RuntimeNeeds,
    /// RFC 006 experiment only; normal lowering never enables it. The
    /// resulting owner styles require the private contextual test hosts.
    pub text_reference: bool,
    /// Internal per-call runtime integration. Never a project/default mode.
    pub text_inheritance: bool,
}

/// Context passed down from an ancestor to lower layout, text, and tree properties.
#[derive(Clone, Copy)]
pub(crate) struct AncestorContext<'a> {
    pub inherited: &'a [StyleDeclaration],
    pub parent_font_size: Option<f64>,
    pub parent_size_opaque: bool,
    pub in_dynamic_ruby: bool,
    pub from_ancestor: FromAncestor<'a>,
    pub grid_columns: Option<usize>,
    pub grid_rows: Option<usize>,
}

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
const STYLE_OBJECT: &str = "hozoStyles";

pub fn lower(root: &Node, source: &str, theme: &Theme) -> LowerOutput {
    lower_forwarded(root, &[], source, theme)
}

/// The text declarations a component around the root hands it, out of
/// the declarations a package's manifest gave for it (#950). The rest, a
/// background or a padding, are the component's own box.
fn forwarded_text(forwarded: &[StyleDeclaration]) -> impl Iterator<Item = &StyleDeclaration> {
    forwarded
        .iter()
        .filter(|d| text::is_text_property(&d.property))
}

/// Whether a component around this element shares its interaction state
/// with it. The parser hands down a `hover:` or `active:` only from a host
/// that does (#974), so its presence is the answer, and a Text below reads
/// that state through `HozoText` as it would inside a pressable in its own
/// file.
fn forwards_interaction(forwarded: &[StyleDeclaration]) -> bool {
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
    lower_forwarded_impl(root, forwarded, source, theme, false, false)
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
    lower_forwarded_impl(root, forwarded, source, theme, true, false)
}

/// Production-owned ABI for passive roots and bounded semantic typography.
/// Conservative opt-in: interaction, relative CSS metrics and layout adapters
/// still need their own integration. The static entry point proves erasure.
#[doc(hidden)]
pub fn lower_text_inheritance(
    root: &Node,
    forwarded: &[StyleDeclaration],
    source: &str,
    theme: &Theme,
) -> LowerOutput {
    if text_region::passive(root) {
        let output = lower_forwarded_impl(root, forwarded, source, theme, true, true);
        if output.runtime_imports.iter().all(|name| {
            matches!(
                *name,
                "HozoInheritedText"
                    | "HozoInheritedRelativeText"
                    | "HozoInheritedView"
                    | "HozoInheritedPressable"
                    | "HozoInheritedLabel"
                    | "HozoChip"
            )
        }) {
            return output;
        }
    }
    // An explicitly requested internal path must not silently certify a
    // partially integrated owner. Ordinary output itself is kept intact.
    let mut output = lower_forwarded(root, forwarded, source, theme);
    output.diagnostics.push(Diagnostic {
        code: DiagnosticCode::NotWiredOnNative,
        severity: Severity::Error,
        message: "Internal text inheritance currently assesses passive Text/View, bounded semantic typography, Button/Pressable labels and Chip row/toggle/removal labels without spreads. Button/Pressable can additionally use planned colour transitions: explicit transition-[color], or colour lists with a base text colour and class-owned background paint (no authored root style). Changing border/other paints and non-colour transitions remain unassessed. Chip secondary class slots must satisfy the same assessed scalar and condition rules as its root. Only label typography and the assessed moving background can additionally use that owner's hover/active/focus/focus-visible conditions and their conjunctions. Other conditional classes, animation, relative CSS metrics, dynamic heading levels, font families/styles/variants and additional generated adapters remain unassessed. This root retains ordinary lowering; it is not runtime-inheritance evidence.".to_string(),
        span: root.span,
    });
    output
}

/// Opt-in static selection keeps the measured runtime route independently
/// callable. Identity comes from the same parser AST; styles from this IR.
#[doc(hidden)]
pub fn lower_text_inheritance_static(
    root: &Node,
    forwarded: &[StyleDeclaration],
    source: &str,
    theme: &Theme,
    stable_root: bool,
) -> LowerOutput {
    if stable_root
        && forwarded.is_empty()
        && text_region::passive(root)
        && text_region::prove(root, theme).is_ok()
    {
        let output = lower_forwarded(root, forwarded, source, theme);
        if output.runtime_imports.is_empty()
            && output.prelude.is_empty()
            && output.diagnostics.is_empty()
            && output.native_imports.iter().all(|name| *name == "Text")
        {
            return output;
        }
    }
    lower_text_inheritance(root, forwarded, source, theme)
}

fn lower_forwarded_impl(
    root: &Node,
    forwarded: &[StyleDeclaration],
    source: &str,
    theme: &Theme,
    text_reference: bool,
    text_inheritance: bool,
) -> LowerOutput {
    let inherited: Vec<StyleDeclaration> = forwarded_text(forwarded).cloned().collect();
    let mut allocator = NameAllocator { next: 0 };
    let mut style_entries: Vec<StyleEntry> = Vec::new();
    // See `StyleEntry`: the third field says which palette the entry is
    // rendered against, and nothing but a dark copy sets it.
    let mut diagnostics = Vec::new();
    let mut runtime = RuntimeNeeds::default();

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
        text_inheritance,
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
        jsx,
        styles,
        prelude,
        runtime_imports,
        native_imports,
        diagnostics,
    }
}

/// Byte-slices `source` at an `ExprRef`'s span. Spans come from oxc's own
/// tokenizer over this same `source`, so they're always on UTF-8 character
/// boundaries -- not re-validated here.
fn source_text(source: &str, expr_ref: ExprRef) -> &str {
    &source[expr_ref.0.start as usize..expr_ref.0.end as usize]
}

/// Re-emits a `ConditionExpr` as a JS boolean expression by splicing the
/// original source at each leaf `Ref`'s span, reconstructed with real
/// `&&`/`||`/`!` matching the combinator structure the compiler built
/// (see hozo_parser's `dynamic_class` module) -- never anything parsed
/// out of the leaves themselves.
fn render_condition_expr(source: &str, expr: &ConditionExpr) -> String {
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

/// Where a node sits among its siblings, as far as the compiler can tell.
///
/// This is what lets `first:` be resolved at build time instead of needing
/// a selector engine: CSS asks the question at match time, but the compiler
/// is looking at the JSX tree and usually already knows the answer. It's a
/// small example of the general shape -- a condition Web resolves at
/// runtime that Native can have for free by resolving it earlier.
///
/// Two independent questions, because `first:` and `last:` are answerable
/// separately: a `Child::Verbatim` *before* this element makes "is it
/// first" unknowable and says nothing about "is it last".
///
/// `None` is not a failure to compute; it's the honest answer whenever the
/// position genuinely isn't decidable here -- a `Verbatim` sibling --
/// and it is never quietly treated as `false`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct SiblingPosition {
    first: Option<bool>,
    last: Option<bool>,
    /// 1-based position among the element siblings, counted the way
    /// `:nth-child` counts: text is not an element and does not take a
    /// place. Knowable when nothing before this element could render an
    /// unknown number of them.
    ordinal: Option<usize>,
    /// How many element siblings there are altogether.
    ///
    /// A stricter question than `ordinal`: one `Verbatim` anywhere among
    /// the siblings, before or after, makes the total unknown even where
    /// the position is not.
    count: Option<usize>,
}

impl SiblingPosition {
    /// Neither end is decidable: a component root, whose position its
    /// caller chooses.
    const UNKNOWN: SiblingPosition = SiblingPosition {
        first: None,
        last: None,
        ordinal: None,
        count: None,
    };
}

/// Whether a structural variant holds for this element, or `None` when
/// the JSX doesn't say.
///
/// The whole family resolves the same way `first:` and `last:` already
/// do: React Native has no selector engine, but a sibling position is a
/// fact about the tree the compiler is reading, so the question can be
/// asked earlier instead of never.
///
/// `None` is not a failure to compute. A `Verbatim` sibling may render
/// nothing or a hundred elements, and a `-of-type` spelling asks which
/// siblings share this element's tag -- which on Native is not a question
/// about the tree but about a Web lowering decision that was never made.
fn structural_holds(
    structural: &Structural,
    node: &Node,
    position: SiblingPosition,
) -> Option<bool> {
    if let Structural::Empty = structural {
        // Its own children, not its siblings. `:empty` is strict -- a
        // single space disqualifies -- so any child at all decides it, and
        // a `Verbatim` decides nothing.
        if node
            .children
            .iter()
            .any(|c| matches!(c, hozo_ir::Child::Verbatim { .. }))
        {
            return None;
        }
        return Some(node.children.is_empty());
    }
    structural.matches_position(position.ordinal?, position.count?)
}

/// A boolean prop, in the shortest spelling its value allows.
///
/// `multiline` rather than `multiline={true}`, which is what the author
/// wrote and what React Native's own code reads like.
fn native_flag(name: &str, value: &ConditionExpr, source: &str) -> String {
    match value {
        ConditionExpr::Static(true) => format!(" {name}"),
        ConditionExpr::Static(false) => format!(" {name}={{false}}"),
        other => format!(" {name}={{{}}}", render_condition_expr(source, other)),
    }
}

/// Declarations an ancestor handed down through `*:` or `**:`.
///
/// React Native has no selector, so a style written on the parent has to
/// arrive at the child as the child's own. The compiler is looking at the
/// children this would style, which is what makes that possible -- the
/// same trade `first:` and `odd:` already make.
///
/// Two lists because the two variants stop at different depths, and
/// nothing else in this backend needed that distinction: `inherited`
/// carries text properties to every descendant and is re-derived at each
/// level, which is `**:` behaviour and not `*:` behaviour.
#[derive(Clone, Copy, Default)]
pub(crate) struct FromAncestor<'a> {
    /// The parent's `*:`. Applied here, not passed on.
    pub direct: &'a [StyleDeclaration],
    /// An ancestor's `**:`. Applied here and passed on.
    pub all: &'a [StyleDeclaration],
    /// Whether this element is inside a `Skeleton`. Web's reduced-motion
    /// rule matches `[data-hozo-skeleton] *`, so a spinner drawn inside a
    /// placeholder stops with it; this carries the same guard down to
    /// every descendant the compiler renders. What it cannot reach is a
    /// child it does not read -- a component or an expression renders
    /// whatever it renders, and its animations are its own.
    pub in_skeleton: bool,
}

/// A parent's subtree declarations, rewritten as the child's own.
///
/// The half of the condition that qualifies the parent is kept only when
/// it is ambient -- a media query, the colour scheme, a container width.
/// Those are answered by a hook declared once for the whole component, so
/// a child reads the same binding the parent would. An *elemental* half
/// is about the parent as an element -- `hover:*:` is the children of a
/// hovered element -- and React Native has no way to hand that down
/// except the interaction context `group-` uses. Reported rather than
/// quietly turned into `*:hover:`, which is a different rule.
fn subtree_for_children(
    declarations: &[StyleDeclaration],
    node: &Node,
    diagnostics: &mut Vec<Diagnostic>,
) -> (Vec<StyleDeclaration>, Vec<StyleDeclaration>) {
    let mut direct = Vec::new();
    let mut all = Vec::new();
    for declaration in declarations {
        let Some((before, after, is_direct)) = declaration.condition.split_subtree() else {
            continue;
        };
        if let Some(elemental) = before.iter().find(|condition| condition.is_elemental()) {
            let name = condition_suffix(elemental).unwrap_or_else(|| "…".to_string());
            diagnostics.push(unwired_variant(
                node,
                &format!(
                    "`{name}:` in front of `*:` asks about *this* element while styling its children, and React Native has no way to hand an element's own state down. Put the condition after the `*:` if you meant the children, or move the style to a Pressable and use `group-{name}:` on them. On Web the same class works from the selector."
                ),
                Severity::Error,
            ));
            continue;
        }
        let condition = Condition::all(before.into_iter().chain(after).collect());
        let rewritten = StyleDeclaration {
            source: declaration.source,
            property: declaration.property.clone(),
            condition,
        };
        if is_direct {
            direct.push(rewritten);
        } else {
            all.push(rewritten);
        }
    }
    (direct, all)
}

/// Yoga has no inline formatting context, but an inline-flex box's useful
/// layout characteristic can be approximated by a flex container that does
/// not stretch across its parent's cross axis. Keep the authored `self-*`
/// authoritative across every condition: synthesizing a base or conditional
/// flex-start beside one could otherwise win only while that condition is on.
fn lower_inline_flex(mut declarations: Vec<StyleDeclaration>) -> Vec<StyleDeclaration> {
    let has_authored_align_self = declarations
        .iter()
        .any(|declaration| matches!(declaration.property, StyleProperty::AlignSelf(_)));
    if has_authored_align_self {
        return declarations;
    }

    let synthetic: Vec<_> = declarations
        .iter()
        .enumerate()
        .filter(|(index, declaration)| {
            matches!(
                declaration.property,
                StyleProperty::Display(Display::InlineFlex)
            ) && !declarations[index + 1..].iter().any(|later| {
                later.condition == declaration.condition
                    && matches!(later.property, StyleProperty::Display(_))
            })
        })
        .map(|(_, declaration)| StyleDeclaration {
            source: declaration.source,
            property: StyleProperty::AlignSelf(AlignSelf::Start),
            condition: declaration.condition.clone(),
        })
        .collect();
    declarations.extend(synthetic);
    declarations
}

fn condition_contains(
    condition: &Condition,
    predicate: impl Fn(&Condition) -> bool + Copy,
) -> bool {
    predicate(condition)
        || matches!(condition, Condition::All(conditions) if conditions.iter().any(|condition| condition_contains(condition, predicate)))
}

// Focus predicates are transparent through negation here. Walking every
// Not in condition_contains would also enable unrelated, unwired starting
// frames merely because their inner condition exists. Container reads use
// a similarly narrow helper below rather than widening that traversal.
fn focus_state(condition: &Condition) -> Option<&'static str> {
    match condition {
        Condition::Focus => Some("focused"),
        Condition::FocusVisible => Some("focusVisible"),
        Condition::Not(inner) => focus_state(inner),
        _ => None,
    }
}

// Native hover is the interaction owner's event state, not CSS's primary
// input capability query. Its complement uses the same owner, including
// when only a descendant asks for it; unrelated negations stay opaque.
fn uses_hover(condition: &Condition) -> bool {
    match condition {
        Condition::Hover => true,
        Condition::Not(inner) => uses_hover(inner),
        _ => false,
    }
}

// Negation changes the predicate, not which owner supplies its state.
// Keep this narrow: traversing every Not in condition_contains would also
// enable unrelated conditions whose ownership has not been implemented.
fn uses_pressed(condition: &Condition) -> bool {
    match condition {
        Condition::Pressed => true,
        Condition::Not(inner) => uses_pressed(inner),
        _ => false,
    }
}

/// Wraps `inner` in `HozoSpaced` when the element carries `space-*` or
/// `divide-*`, so the style reaches the children.
///
/// The children are handed over as JSX children rather than as arguments,
/// which is why this is a component and not a function call: a child may be
/// an element, a bare string, or a carried expression like
/// `{items.map(..)}`, and only the first of those is already an expression.
/// Passing them as `children` means none of them has to be re-rendered into
/// a different position.
///
/// `HozoSpaced` returns its children rather than an element, so no host
/// view is added and Yoga sees the tree it would have seen anyway.
fn spaced_children(
    inner: String,
    child_declarations: &[StyleDeclaration],
    base_name: &str,
    node: &Node,
    position: SiblingPosition,
    cx: &mut NativeRenderContext<'_>,
) -> String {
    if child_declarations.is_empty() {
        return inner;
    }

    let mut parts: Vec<String> = Vec::new();
    // `pressed:` has nowhere to go here: the render-prop `style` form it
    // relies on belongs to Pressable, and this style is destined for the
    // children rather than for the element that would track the press.
    let mut pressed_parts: Vec<String> = Vec::new();
    let target = conditions::StyleTarget {
        node,
        position,
        interaction_context: false,
        pattern_slot: None,
    };
    build_style_entries(
        child_declarations,
        &format!("{base_name}Children"),
        &target,
        &mut parts,
        &mut pressed_parts,
        None,
        cx,
    );
    if !pressed_parts.is_empty() {
        cx.diagnostics.push(unwired_variant(
            node,
            "`pressed:` on a `space-*`/`divide-*` utility would have to track press state on the \
             parent and restyle its children, which Hozo doesn't do.",
            Severity::Error,
        ));
    }
    if parts.is_empty() {
        return inner;
    }

    cx.runtime.need_component("HozoSpaced");
    let style = if parts.len() == 1 && !parts[0].contains("&&") {
        parts[0].clone()
    } else {
        format!("[{}]", parts.join(", "))
    };
    format!("<HozoSpaced style={{{style}}}>{inner}</HozoSpaced>")
}

/// Re-emits a carried expression from source, with each Hozo primitive
/// inside it replaced by its lowered output.
///
/// The nested spans are subranges of `expr_ref`'s and don't overlap (each
/// is the outermost primitive on its branch), so one left-to-right pass is
/// enough. `{show && <Text className="p-4">hi</Text>}` comes out as
/// `{show && <Text style={hozoStyles.hozo1}>hi</Text>}` -- the guard
/// untouched, the element fully compiled.
///
/// Position is `Unknown` for every one of them: the surrounding expression
/// decides how many siblings it renders, so `first:` can't be resolved
/// there (see `SiblingPosition`).
fn render_verbatim(
    expr_ref: ExprRef,
    nested: &[hozo_ir::NestedNode],
    inherited: &[StyleDeclaration],
    interaction_context: bool,
    cx: &mut NativeRenderContext<'_>,
) -> String {
    let mut out = String::new();
    let mut cursor = expr_ref.0.start as usize;
    for entry in nested {
        out.push_str(&cx.source[cursor..entry.span.start as usize]);
        // After what the elements above hand down, so a component written
        // in between, and nearer, wins.
        let inherited: Vec<StyleDeclaration> = inherited
            .iter()
            .chain(forwarded_text(&entry.forwarded))
            .cloned()
            .collect();
        let inherited = inherited.as_slice();
        let ambient_size = inherited.iter().rev().find_map(|d| match &d.property {
            hozo_ir::StyleProperty::FontSize(hozo_ir::Length::Px(px))
                if d.condition == hozo_ir::Condition::Always =>
            {
                Some(*px)
            }
            _ => None,
        });
        let ancestor = AncestorContext {
            inherited,
            parent_font_size: ambient_size,
            parent_size_opaque: true,
            in_dynamic_ruby: false,
            from_ancestor: FromAncestor::default(),
            grid_columns: None,
            grid_rows: None,
        };
        out.push_str(&render_node(
            &entry.node,
            SiblingPosition::UNKNOWN,
            interaction_context || forwards_interaction(&entry.forwarded),
            ancestor,
            cx,
        ));
        cursor = entry.span.end as usize;
    }
    out.push_str(&cx.source[cursor..expr_ref.0.end as usize]);
    out
}

fn is_safe_area_inset(prop: &StyleProperty) -> bool {
    matches!(prop, StyleProperty::Arbitrary(property, value)
        if hozo_ir::safe_area_inset(property, value).is_some())
}

/// The inline style object for a group's safe-area insets, if it has any.
///
/// The same treatment as `viewport_object` and for the same reason: the
/// number is not knowable at build time and changes with the device --
/// rotate a phone and the notch moves from the top to the side.
///
/// The value comes from `react-native-safe-area-context`, wrapped by
/// `useHozoSafeArea` in `@hozo/engine`. Hozo does not ship native code and
/// this is the one place that decision is visible: reading the real inset
/// needs `UIView.safeAreaInsets` and Android's `WindowInsets`, and React
/// Native's core exposes neither to JavaScript -- only a deprecated
/// iOS-only `SafeAreaView` and an Android-only `StatusBar.currentHeight`.
/// So the choice was a native module of our own or a wrapper around the
/// one every React Native app already has, and the wrapper keeps `@hozo/*`
/// installable without a rebuild.
fn safe_area_object(props: &[StyleProperty]) -> Option<String> {
    let mut pairs: Vec<String> = Vec::new();
    for prop in props {
        let StyleProperty::Arbitrary(property, value) = prop else {
            continue;
        };
        let Some((key, side)) = hozo_ir::safe_area_inset(property, value) else {
            continue;
        };
        pairs.push(format!("{key}: {}.{side}", RuntimeHook::SafeArea.binding()));
    }
    (!pairs.is_empty()).then(|| format!("{{ {} }}", pairs.join(", ")))
}

fn is_viewport_sized(prop: &StyleProperty) -> bool {
    viewport_dimension(prop).is_some()
}

/// The RN style key and viewport axis a property needs, if any.
fn viewport_dimension(prop: &StyleProperty) -> Option<(&'static str, &'static str, f64)> {
    let axis = |dim: &hozo_ir::Dimension| match dim {
        hozo_ir::Dimension::ViewportWidth(pct) => Some(("width", *pct)),
        hozo_ir::Dimension::ViewportHeight(pct) => Some(("height", *pct)),
        hozo_ir::Dimension::Length(hozo_ir::Length::Unit(pct, hozo_ir::LengthUnit::Vw)) => {
            Some(("width", *pct))
        }
        hozo_ir::Dimension::Length(hozo_ir::Length::Unit(pct, hozo_ir::LengthUnit::Vh)) => {
            Some(("height", *pct))
        }
        _ => None,
    };
    let padding = match prop {
        StyleProperty::PaddingTop(length) => Some(("paddingTop", length)),
        StyleProperty::PaddingRight(length) => Some(("paddingRight", length)),
        StyleProperty::PaddingBottom(length) => Some(("paddingBottom", length)),
        StyleProperty::PaddingLeft(length) => Some(("paddingLeft", length)),
        _ => None,
    };
    if let Some((key, length)) = padding {
        return axis(&hozo_ir::Dimension::Length(length.clone()))
            .map(|(axis, pct)| (key, axis, pct));
    }
    let (key, dim) = match prop {
        StyleProperty::Width(d) => ("width", d),
        StyleProperty::Height(d) => ("height", d),
        StyleProperty::MinWidth(d) => ("minWidth", d),
        StyleProperty::MinHeight(d) => ("minHeight", d),
        StyleProperty::MaxWidth(d) => ("maxWidth", d),
        StyleProperty::MaxHeight(d) => ("maxHeight", d),
        // The logical sizes map to the same two axes on this platform, so a
        // viewport value on them resolves the same way.
        StyleProperty::BlockSize(d) => ("height", d),
        StyleProperty::InlineSize(d) => ("width", d),
        StyleProperty::MinBlockSize(d) => ("minHeight", d),
        StyleProperty::MinInlineSize(d) => ("minWidth", d),
        StyleProperty::MaxBlockSize(d) => ("maxHeight", d),
        StyleProperty::MaxInlineSize(d) => ("maxWidth", d),
        _ => return None,
    };
    axis(dim).map(|(axis, pct)| (key, axis, pct))
}

/// The inline style object for a group's viewport-relative sizes, if it has
/// any.
///
/// These can't go in the StyleSheet: `StyleSheet.create` is evaluated once
/// at module load, and the value changes when the device rotates. The object
/// is rebuilt each render instead, from a hook that re-renders the component
/// when the window changes -- so a rotation resizes the element, which is
/// what `h-screen` means on Web.
///
/// Measured against the *window*, not the screen: window excludes the system
/// UI the app can't draw under, which is the closer analogue of the Web
/// viewport. It does not account for notches or a home indicator -- a
/// full-bleed layout still wants a safe-area inset on top of this, exactly
/// as it does on Web.
fn viewport_object(props: &[StyleProperty]) -> Option<String> {
    let mut pairs: Vec<String> = Vec::new();
    for prop in props {
        let Some((key, axis, pct)) = viewport_dimension(prop) else {
            continue;
        };
        let binding = RuntimeHook::Viewport.binding();
        // The common case is a whole viewport (`h-screen`), where the
        // multiplication is noise in the output.
        if (pct - 100.0).abs() < f64::EPSILON {
            pairs.push(format!("{key}: {binding}.{axis}"));
        } else {
            pairs.push(format!("{key}: {binding}.{axis} * {}", pct / 100.0));
        }
    }
    (!pairs.is_empty()).then(|| format!("{{ {} }}", pairs.join(", ")))
}

/// The runtime guard for `aria-<state>:` on Native.
///
/// Read off `accessibilityState`, which is the only place Hozo can see
/// the value: the `aria-checked` prop React Native also accepts is
/// carried through as a passthrough and never parsed. `None` when there
/// is nothing to read.
/// The runtime value `group-<inner>:` reads on Native, if there is one.
///
/// React Native has no selectors, so a condition on an ancestor can only
/// be answered by the ancestor handing it down -- which `HozoPressable`
/// already does for the four interaction states, through the context that
/// makes `hover:` work on a `Text` inside a button at all.
///
/// So `group-hover:` is not new machinery here; it is the existing
/// machinery finally being asked the question it was built to answer.
/// `hover:` on a descendant reads the ancestor's hover because a `Text`
/// has none of its own, which is a compromise. `group-hover:` reading the
/// same value is the literal meaning.
///
/// `None` for everything else: a condition on the ancestor's *props* --
/// `group-disabled:`, `group-aria-checked:` -- would need the context to
/// carry them, and it carries interaction state only.
fn group_state(inner: &Condition, interaction_context: bool) -> Option<&'static str> {
    if !interaction_context {
        return None;
    }
    match inner {
        Condition::Hover => Some("hovered"),
        Condition::Focus => Some("focused"),
        Condition::FocusVisible => Some("focusVisible"),
        Condition::Pressed => Some("pressed"),
        _ => None,
    }
}

/// Why a `group-…:` could not be wired, in the terms the author can act on.
fn group_unwired_message(inner: &Condition, interaction_context: bool) -> String {
    let name = condition_suffix(inner).unwrap_or_else(|| "…".to_string());
    if interaction_context {
        format!(
            "`group-{name}:` reads a state React Native's Pressable context does not carry. Only `hover`, `focus`, `focus-visible` and `pressed` are handed down; a condition on the ancestor's own props is not. On Web the same class works from the selector."
        )
    } else {
        format!(
            "`group-{name}:` needs an ancestor that hands its state down, which on React Native means a `Pressable`. Nothing above this element is one. On Web the same class works from the selector."
        )
    }
}

/// Tailwind's name for an environment query, for the message and the
/// style-entry suffix.
/// The queries React Native can answer, and only those.
///
/// `contrast-less` is absent because neither platform has the setting:
/// iOS and Android both expose an *increase* contrast toggle and no
/// counterpart, so there is nothing to report. A printer, a
/// scripting-disabled page and Windows' forced-colours mode have no
/// meaning on a device at all.
///
/// `contrast-more` used to be absent beside it, on the stated grounds
/// that React Native's nearest was Android's high-contrast *text*
/// setting. That was half the surface: iOS reports Increase Contrast
/// through `isDarkerSystemColorsEnabled`, which is the same OS setting
/// Safari writes `prefers-contrast: more` from.
fn native_environment(query: Environment) -> Option<Environment> {
    matches!(
        query,
        Environment::MotionReduce
            | Environment::MotionSafe
            | Environment::Portrait
            | Environment::Landscape
            | Environment::InvertedColors
            | Environment::Ltr
            | Environment::Rtl
            // The four React Native reports and Tailwind has no name for.
            // Three of them are iOS settings, which is the same shape
            // `inverted-colors` already has: absent on Android is a value
            // of `false` rather than an error, and a style that does not
            // fire on a platform without the setting is correct.
            | Environment::ReduceTransparency
            | Environment::BoldText
            | Environment::Grayscale
            | Environment::ScreenReader
            // Two settings behind one query, which none of the others
            // needs: iOS's Increase Contrast and Android's high-contrast
            // text. See `useHozoEnvironment` for why they are read as two
            // facts and combined rather than written into one store.
            | Environment::ContrastMore
    )
    .then_some(query)
}

fn environment_unwired_message(query: Environment) -> String {
    format!(
        "`{}:` has no React Native equivalent, so the style is not applied there. On Web the same class works from a media query.",
        environment_name(query)
    )
}

fn environment_name(query: Environment) -> &'static str {
    match query {
        Environment::MotionReduce => "motion-reduce",
        Environment::MotionSafe => "motion-safe",
        Environment::Portrait => "portrait",
        Environment::Landscape => "landscape",
        Environment::InvertedColors => "inverted-colors",
        Environment::Ltr => "ltr",
        Environment::Rtl => "rtl",
        Environment::ContrastMore => "contrast-more",
        Environment::ContrastLess => "contrast-less",
        Environment::ForcedColors => "forced-colors",
        Environment::Print => "print",
        Environment::Noscript => "noscript",
        Environment::ReduceTransparency => "reduce-transparency",
        Environment::BoldText => "bold-text",
        Environment::Grayscale => "grayscale",
        Environment::ScreenReader => "screen-reader",
    }
}

fn aria_state_guard(node: &Node, source: &str, state: &str) -> Option<String> {
    if state == "invalid" {
        // CSS matches the literal "true", not arbitrary truthy values or
        // the grammar/spelling tokens. Evaluate the prop expression once.
        return node
            .props
            .aria_invalid
            .map(|value| format!("String(({})) === 'true'", source_text(source, value)));
    }
    let value = node.props.accessibility_state?;
    // An object literal says which keys it has, so one that does not name
    // this state cannot drive it. An opaque expression could carry
    // anything and is taken at its word.
    if let Some(keys) = node.props.accessibility_state_keys.as_ref() {
        if !keys.iter().any(|key| key == state) {
            return None;
        }
    }
    // An opaque prop expression may evaluate to undefined/null (RN's
    // accessibilityState is optional). That means no active ARIA state,
    // not a JS exception in either the positive or the negative guard.
    // Tailwind's boolean aria variants match the literal true state;
    // checked="mixed" is a real RN state, but not aria-checked="true".
    Some(format!(
        "({})?.{state} === true",
        source_text(source, value)
    ))
}

/// One read-only predicate for static guards and runtime candidate states.
/// RN lets a defined readOnly override editable; absence is not false.
fn read_only_guard(node: &Node, source: &str) -> Option<String> {
    let props = &node.props.text_input;
    let base = read_only_prop_guard(props, source);
    // A canonical disabled field cannot be edited, just as :read-only
    // matches a disabled HTML input. The disabled semantic fact is separate.
    if let Some(disabled) = node
        .props
        .disabled
        .as_ref()
        .filter(|_| node.primitive == Primitive::TextInput)
    {
        return Some(format!(
            "Boolean({}) || ({})",
            render_condition_expr(source, disabled),
            base.unwrap_or_else(|| "false".to_string())
        ));
    }
    base
}

fn read_only_prop_guard(props: &hozo_ir::TextInputProps, source: &str) -> Option<String> {
    if let Some(read_only) = props.read_only.as_ref() {
        let driver = render_condition_expr(source, read_only);
        return Some(match (read_only, props.editable.as_ref()) {
            (ConditionExpr::Static(_), _) | (_, None) => driver,
            (_, Some(editable)) => format!(
                "({driver}) !== undefined ? ({driver}) : ({}) === false",
                render_condition_expr(source, editable)
            ),
        });
    }
    props
        .editable
        .as_ref()
        .map(|editable| format!("({}) === false", render_condition_expr(source, editable)))
}

/// The state a runtime `className` is resolved against, as a JS object
/// literal, or `None` when the element has none to give (#886).
///
/// `interaction` uses the owner's readable facts, not a parent's context.
/// A field reports focus only: its tracker does not wire hover or press.
/// `disabled` and the ARIA states come from the element's props, the same
/// expressions a compiled `disabled:` or `aria-*:` reads, under the keys the
/// candidate module stores them by.
fn runtime_class_state(node: &Node, source: &str, interaction: bool) -> Option<String> {
    if let Some(facts) = pattern::constant_facts(node.primitive, "className") {
        return Some(facts.into());
    }
    let mut fields: Vec<String> = Vec::new();
    if interaction {
        fields.push(
            if node.primitive == Primitive::TextInput {
                "focused, focusVisible"
            } else {
                "pressed, hovered, focused, focusVisible"
            }
            .to_string(),
        );
    }
    if let Some(disabled) = node.props.disabled.as_ref() {
        fields.push(format!(
            "disabled: Boolean({})",
            render_condition_expr(source, disabled)
        ));
    }
    if let Some(guard) = aria_state_guard(node, source, "invalid") {
        fields.push(format!("'aria-invalid': {guard}"));
    }
    if node.primitive == Primitive::TextInput {
        if let Some(guard) = read_only_guard(node, source) {
            fields.push(format!("readOnly: Boolean({guard})"));
        }
    }
    if node.props.accessibility_state.is_some() {
        // A literal says which states it has; an opaque expression could
        // carry any of React Native's.
        let states: Vec<String> = match node.props.accessibility_state_keys.as_ref() {
            Some(keys) => keys.clone(),
            None => ["checked", "selected", "expanded", "busy", "disabled"]
                .map(String::from)
                .to_vec(),
        };
        for state in states {
            if let Some(guard) = aria_state_guard(node, source, &state) {
                fields.push(format!("'aria-{state}': {guard}"));
            }
        }
    }
    (!fields.is_empty()).then(|| format!("{{ {} }}", fields.join(", ")))
}

fn escape_jsx_text(text: &str) -> String {
    text.replace('{', "&#123;").replace('}', "&#125;")
}

/// `None` for `Always` (uses the node's base style name directly);
/// otherwise a name-safe suffix identifying the condition.
fn condition_suffix(condition: &Condition) -> Option<String> {
    match condition {
        Condition::Always => None,
        // Each atom's own suffix, joined. Names the combination rather
        // than the first of it, so `md:hover:` and `md:focus:` don't share
        // a style entry.
        Condition::All(conditions) => Some(
            conditions
                .iter()
                .filter_map(condition_suffix)
                .collect::<Vec<_>>()
                .join("_"),
        ),
        Condition::Hover => Some("hover".to_string()),
        Condition::Focus => Some("focus".to_string()),
        Condition::FocusVisible => Some("focusvisible".to_string()),
        Condition::LastChild => Some("last".to_string()),
        Condition::Disabled => Some("disabled".to_string()),
        Condition::Enabled => Some("enabled".to_string()),
        // Named by position rather than by content, the same way the
        // arbitrary selectors are: an attribute or a query can hold any
        // character and a style identifier cannot. These are refused
        // before anything references them, so the name never reaches the
        // output.
        Condition::DataAttribute(_) => Some("data".to_string()),
        Condition::Supports(_) => Some("supports".to_string()),
        Condition::HasSelector(_) => Some("has".to_string()),
        Condition::Has(inner) => Some(format!(
            "has{}",
            condition_suffix(inner).unwrap_or_default()
        )),
        Condition::Not(inner) => Some(format!(
            "not{}",
            condition_suffix(inner).unwrap_or_default()
        )),
        Condition::Environment(query) => Some(environment_name(*query).replace('-', "")),
        Condition::Group(inner) => Some(format!(
            "group{}",
            condition_suffix(inner).unwrap_or_default()
        )),
        Condition::Peer(inner) => Some(format!(
            "peer{}",
            condition_suffix(inner).unwrap_or_default()
        )),
        Condition::Aria(state) => Some(format!("aria{state}")),
        Condition::Pressed => Some("pressed".to_string()),
        Condition::Dark => Some("dark".to_string()),
        Condition::FirstChild => Some("first".to_string()),
        Condition::Structural(structural) => {
            Some(structural.variant_name().replace(['-', '+', '(', ')'], ""))
        }
        Condition::FormState(state) => Some(state.variant_name().replace('-', "")),
        // Named by the threshold, since a length can hold characters a
        // style identifier cannot -- and by direction, so `min-[500px]:`
        // and `max-[500px]:` don't share an entry.
        Condition::Container {
            name,
            at_least,
            value,
        } => Some(format!(
            "cq{}{}{}",
            name.as_deref().unwrap_or(""),
            if *at_least { "min" } else { "max" },
            value
                .chars()
                .filter(|c| c.is_ascii_alphanumeric())
                .collect::<String>(),
        )),
        Condition::Width { at_least, value } => Some(format!(
            "{}{}",
            if *at_least { "min" } else { "max" },
            value
                .chars()
                .filter(|c| c.is_ascii_alphanumeric())
                .collect::<String>(),
        )),
        Condition::PseudoElement(pseudo) => Some(pseudo.variant_name().replace('-', "")),
        Condition::Subtree { direct } => Some(if *direct {
            "child".to_string()
        } else {
            "descendant".to_string()
        }),
        Condition::FocusWithin => Some("focuswithin".to_string()),
        Condition::Target => Some("target".to_string()),
        Condition::Visited => Some("visited".to_string()),
        Condition::StartingStyle => Some("starting".to_string()),
        // Named by position rather than by content: a selector can hold
        // any character at all, and a style identifier can't. The name
        // only has to be unique within the file and stable across a
        // compile -- these entries are refused before anything references
        // them, so the name never reaches the output.
        Condition::ArbitrarySelector(_) => Some("sel".to_string()),
        Condition::ArbitraryAtRule(_) => Some("atrule".to_string()),
        Condition::Responsive(bp) => Some(
            match bp {
                Breakpoint::Sm => "sm",
                Breakpoint::Md => "md",
                Breakpoint::Lg => "lg",
                Breakpoint::Xl => "xl",
                Breakpoint::Xl2 => "xl2",
            }
            .to_string(),
        ),
        Condition::Expr(expr) => Some(format!("cond_{}", expr_key(expr))),
    }
}

/// A style key for a guard, from its shape as well as its spans.
///
/// Spans alone named `selected` and `!selected` alike, so the two branches
/// of `selected ? 'a' : 'b'` became one duplicated key in the style object,
/// and the second branch won on both sides of the ternary.
fn expr_key(expr: &ConditionExpr) -> String {
    match expr {
        ConditionExpr::Static(value) => value.to_string(),
        ConditionExpr::Ref(r) => format!("{}_{}", r.0.start, r.0.end),
        ConditionExpr::Captured(capture) => {
            format!("{}_{}", capture.reference.0.start, capture.reference.0.end)
        }
        ConditionExpr::Not(inner) => format!("not_{}", expr_key(inner)),
        ConditionExpr::And(a, b) => format!("{}_and_{}", expr_key(a), expr_key(b)),
        ConditionExpr::Or(a, b) => format!("{}_or_{}", expr_key(a), expr_key(b)),
    }
}

#[cfg(test)]
mod native_tests;

/// Only the width predicate is transparent through negation. Discover its
/// query boundary without also treating an unwired condition as supported.
fn uses_container_width(condition: &Condition) -> bool {
    match condition {
        Condition::Container { .. } => true,
        Condition::Not(inner) => uses_container_width(inner),
        _ => false,
    }
}

/// The pixel threshold a `Condition::Width` names, if React Native can be
/// asked about it.
///
/// `None` for a unit that has no fixed pixel value on a device -- `rem`
/// has no root font size to resolve against, and a viewport unit compared
/// against the viewport is a question that answers itself. Reported by
/// name rather than approximated: guessing 16px per rem would silently
/// disagree with the browser for anyone who changed their font size,
/// which is precisely the reader this project is for.
fn width_threshold_px(value: &str) -> Option<u32> {
    let digits = value.strip_suffix("px")?;
    digits.parse::<f64>().ok().map(|px| px.round() as u32)
}

#[cfg(test)]
mod svg_tests {
    use super::*;

    fn compile(source: &str) -> LowerOutput {
        let parsed = hozo_parser::parse_tsx(source);
        lower(&parsed.roots[0].node, source, &Theme::default())
    }

    #[test]
    fn paint_becomes_a_prop_rather_than_a_style() {
        // The asymmetry the compiler exists for: one class,
        // `fill-blue-500`, is a CSS declaration on Web and an attribute
        // here, because `react-native-svg` takes paint as props.
        let out = compile(
            "import { Svg } from '@hozo/svg'\n\
             export const C = () => <Svg.Rect className=\"fill-blue-500 stroke-2\" />\n",
        );
        assert!(out.jsx.contains(r##"fill="#"##), "{}", out.jsx);
        assert!(out.jsx.contains("strokeWidth={2}"), "{}", out.jsx);
        // And not reported as a Web-only style, which is what it was
        // before the SVG elements existed to lower it onto.
        assert!(out.diagnostics.is_empty(), "{:?}", out.diagnostics);
    }

    #[test]
    fn svg_text_holds_its_own_string() {
        // A bare string inside a `View` crashes on this platform, so the
        // compiler inserts a `Text`. Inside `<Svg.Text>` there is nothing
        // to fix, and inserting one puts a text node where an SVG element
        // belongs -- the string vanishes rather than rendering.
        let out = compile(
            "import { Svg } from '@hozo/svg'\n\
             export const C = () => <Svg.Text>hi</Svg.Text>\n",
        );
        assert!(out.jsx.contains("<SvgText>hi</SvgText>"), "{}", out.jsx);
    }

    #[test]
    fn the_import_comes_from_the_svg_subpath_by_name() {
        // `SvgText`, not `Text`: generated files already import `Text`
        // from `react-native` for the wrapper above, and two bindings of
        // one name in a file neither of them wrote is not a collision
        // anyone could debug.
        let out = compile(
            "import { Svg } from '@hozo/svg'\n\
             export const C = () => <Svg><Svg.Text>hi</Svg.Text></Svg>\n",
        );
        assert!(
            out.runtime_imports.contains(&"Svg"),
            "{:?}",
            out.runtime_imports
        );
        assert!(
            out.runtime_imports.contains(&"SvgText"),
            "{:?}",
            out.runtime_imports
        );
        assert!(
            !out.runtime_imports.contains(&"Text"),
            "{:?}",
            out.runtime_imports
        );
    }

    #[test]
    fn svg_link_uses_the_router_aware_native_group() {
        let out = compile(
            "import { Svg } from '@hozo/svg'\n\
             export const C = () => <Svg><Svg.Link href=\"/detail\" replace><Svg.Rect width={10} height={10} /></Svg.Link></Svg>\n",
        );
        assert!(
            out.runtime_imports.contains(&"SvgLink"),
            "{:?}",
            out.runtime_imports
        );
        assert!(
            out.jsx
                .contains(r#"<SvgLink replace={true} href="/detail">"#),
            "{}",
            out.jsx
        );
        assert!(out.jsx.contains("</SvgLink>"), "{}", out.jsx);
    }
}

/// Tailwind's name for an animation, which is also the runtime hook's
/// argument -- so the generated call reads as the class it came from.
fn animation_name(animation: hozo_ir::Animation) -> &'static str {
    match animation {
        hozo_ir::Animation::Spin => "spin",
        hozo_ir::Animation::Pulse => "pulse",
        hozo_ir::Animation::Bounce => "bounce",
        hozo_ir::Animation::Ping => "ping",
        // Not an animation to run: `animate-none` turns one off, and the
        // hook is never asked for.
        hozo_ir::Animation::None => "none",
    }
}

#[cfg(test)]
mod animation_tests {
    use super::*;

    fn compile(source: &str) -> LowerOutput {
        let parsed = hozo_parser::parse_tsx(source);
        lower(&parsed.roots[0].node, source, &Theme::default())
    }

    #[test]
    fn all_four_of_tailwinds_loops_reach_the_native_driver() {
        // Three of these were refused with "only spin is wired today".
        // They move nothing but opacity and transform, which is what let
        // them share one hook rather than needing three.
        for (class_name, name) in [
            ("animate-spin", "spin"),
            ("animate-pulse", "pulse"),
            ("animate-bounce", "bounce"),
            ("animate-ping", "ping"),
        ] {
            let out = compile(&format!(
                "import {{ View }} from '@hozo/core'\nconst el = <View className=\"{class_name}\" />\n"
            ));
            assert!(
                out.diagnostics.is_empty(),
                "{class_name}: {:?}",
                out.diagnostics
            );
            assert!(
                out.prelude
                    .iter()
                    .any(|line| line.contains(&format!("useHozoAnimation('{name}')"))),
                "{class_name}: {:?}",
                out.prelude,
            );
            assert!(
                out.jsx.contains(&format!("__hozoAnim_{name}")),
                "{class_name}: {}",
                out.jsx
            );
        }
    }

    #[test]
    fn animate_none_asks_for_no_hook() {
        // It turns an animation off rather than being one, so reaching for
        // the runtime would start a loop in order to express stopping.
        let out = compile(
            "import { View } from '@hozo/core'\nconst el = <View className=\"animate-none\" />\n",
        );
        assert!(out.prelude.is_empty(), "{:?}", out.prelude);
        assert!(!out.jsx.contains("__hozoAnim"), "{}", out.jsx);
    }
}

#[cfg(test)]
mod backdrop_tests {
    use super::*;

    fn compile_source(source: &str) -> LowerOutput {
        let parsed = hozo_parser::parse_tsx(source);
        lower(&parsed.roots[0].node, source, &Theme::default())
    }

    fn compile(primitive: &str, value: &str) -> LowerOutput {
        let source = format!(
            "import stylex from '@stylexjs/stylex';\nimport {{ {primitive} }} from '@hozo/core';\nconst styles = stylex.create({{ root: {{ backdropFilter: '{value}' }} }});\nconst el = <{primitive} {{...stylex.props(styles.root)}} />;\n"
        );
        compile_source(&source)
    }

    #[test]
    fn static_blur_uses_the_opt_in_native_adapter() {
        let out = compile("View", "blur(12px)");
        assert!(out.diagnostics.is_empty(), "{:?}", out.diagnostics);
        assert!(out.runtime_imports.contains(&"HozoBackdropFilter"));
        assert!(
            out.jsx.contains("<HozoBackdropFilter hozoBlurRadius={12}"),
            "{}",
            out.jsx
        );
    }

    #[test]
    fn none_is_a_native_no_op_and_text_is_refused() {
        let none = compile("View", "none");
        assert!(none.diagnostics.is_empty(), "{:?}", none.diagnostics);
        assert!(!none.runtime_imports.contains(&"HozoBackdropFilter"));

        let text = compile("Text", "blur(12px)");
        assert!(text
            .diagnostics
            .iter()
            .any(|diagnostic| diagnostic.code == DiagnosticCode::NotWiredOnNative));
        assert!(!text.runtime_imports.contains(&"HozoBackdropFilter"));
    }

    #[test]
    fn conditional_and_composed_backdrop_filters_are_not_silently_absorbed() {
        for class_name in ["md:backdrop-blur-md", "backdrop-blur-md backdrop-grayscale"] {
            let source = format!(
                "import {{ View }} from '@hozo/core';\nconst el = <View className=\"{class_name}\" />;\n"
            );
            let out = compile_source(&source);
            assert!(
                out.diagnostics.iter().any(|diagnostic| {
                    matches!(
                        diagnostic.code,
                        DiagnosticCode::NotWiredOnNative | DiagnosticCode::WebOnlyPropertyOnNative
                    )
                }),
                "{class_name}: {:?}",
                out.diagnostics
            );
        }
    }
}
