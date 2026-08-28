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
//! Only applies when `component == "Pressable"` (Button maps to it too);
//! a function isn't a valid `style` value on View/Text, so `Pressed` stays
//! unmerged there.
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
//!   `@hozo/runtime` keeps a single subscription and the hook exists only
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
//! - `Hover`/`Focus` are wired on Pressable and Button through a small
//!   runtime wrapper. Only elements that use either condition pay for its
//!   state and event handlers; ordinary Pressables keep RN's native path.
//!   A View/Text has no interaction owner, so using either there is an
//!   error rather than a style silently applied under the wrong condition.
//! - `Disabled` without a `disabled` prop, and `Pressed` on anything but a
//!   Pressable, are errors: nothing on the element can drive them.

mod conditions;
mod grid;
mod markup;
mod render;
mod style;
mod text;
mod transition;

use conditions::{build_style_entries, unwired_variant, RuntimeHook};
use grid::{grid_absorbs, native_grid, native_grid_item};
use render::render_node;
use transition::{ambient_transition, native_driver_transition};
#[cfg(test)]
use grid::resolve_row_line;
#[cfg(test)]
use hozo_ir::GridLine;

use hozo_ir::{
    AlignSelf, Axis, Breakpoint, Condition, ConditionExpr, Diagnostic, DiagnosticCode, Display, Environment, ExprRef,
    FormState, Length, Node, Primitive,
    Severity, Structural, StyleDeclaration, StyleProperty, TextOverflow, Theme, WhiteSpace,
};

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
    /// Named imports `prelude` needs from `@hozo/runtime`.
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

/// What the generated module will need from `@hozo/runtime`, accumulated
/// as the tree is walked.
///
/// Hooks and components are kept apart because only hooks constrain where
/// they may appear: a hook has to be declared once, unconditionally, in the
/// enclosing function body (`LowerOutput::prelude`), while a component is
/// just an element in the JSX. They share this struct only so that adding a
/// second kind of runtime dependency didn't mean threading a second `&mut`
/// through every rendering function.
#[derive(Default)]
struct RuntimeNeeds {
    hooks: Vec<RuntimeHook>,
    components: Vec<&'static str>,
    /// Tags this lowering emitted that `react-native` exports.
    ///
    /// Derived rather than listed. A tag reaching the output is one of
    /// three things and the other two are recognisable: `Primitive::Svg`
    /// comes from `react-native-svg`, and anything Hozo ships is spelled
    /// `Hozo…` -- so what is left is React Native's own. A list beside the
    /// mapping would be a second copy of it, and this repository has
    /// already paid three times for that shape.
    native: Vec<&'static str>,
}

impl RuntimeNeeds {
    fn need_component(&mut self, name: &'static str) {
        if !self.components.contains(&name) {
            self.components.push(name);
        }
    }

    fn need_native(&mut self, name: &'static str) {
        if !name.starts_with("Hozo") && !self.native.contains(&name) {
            self.native.push(name);
        }
    }
}

struct NameAllocator {
    next: u32,
}

impl NameAllocator {
    fn alloc(&mut self) -> String {
        let name = format!("hozo{}", self.next);
        self.next += 1;
        name
    }
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
    let mut allocator = NameAllocator { next: 0 };
    let mut style_entries: Vec<(String, Vec<StyleProperty>)> = Vec::new();
    let mut diagnostics = Vec::new();
    let mut runtime = RuntimeNeeds::default();

    // The root's position is genuinely unknowable here: it's whatever the
    // component's caller renders it into.
    let jsx = render_node(
        root,
        SiblingPosition::UNKNOWN,
        false,
        None,
        None,
        theme,
        &[],
        FromAncestor::default(),
        source,
        &mut allocator,
        &mut style_entries,
        &mut diagnostics,
        &mut runtime,
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
    let prelude: Vec<String> = distinct.iter().map(RuntimeHook::declaration).collect();
    let native_imports = runtime.native;
    let mut runtime_imports: Vec<&'static str> = runtime.components;
    for hook in &distinct {
        if !runtime_imports.contains(&hook.import()) {
            runtime_imports.push(hook.import());
        }
    }

    let mut styles = String::from("{\n");
    for (name, props) in &style_entries {
        styles.push_str(&format!("  {name}: {{\n"));
        for (key, value) in style_pairs(props, theme) {
            styles.push_str(&format!("    {key}: {value},\n"));
        }
        styles.push_str("  },\n");
    }
    styles.push('}');

    LowerOutput { jsx, styles, prelude, runtime_imports, native_imports, diagnostics }
}

/// The Native counterpart of `hozo_web::render_candidate_stylesheet`:
/// the module that lets a `className` the compiler couldn't read still
/// produce styles (proposal §7's third tier).
///
/// The two platforms need very different amounts of machinery here, and
/// the reason is worth stating. On Web the candidate stylesheet is free --
/// the browser already *has* a CSS engine, so emitting rules costs bytes
/// and no code. React Native has no such engine, so something must turn a
/// class string into a style object on device.
///
/// This is deliberately the smallest thing that can: a flat
/// name -> style-object map plus a split-and-look-up resolver
/// (`@hozo/runtime`'s `createClassResolver`). What makes that enough,
/// where `react-native-css` needs a full reactive engine with specificity
/// sorting, is that Hozo only ever puts *single utility classes* in here.
/// They're all the same specificity, so "later in the string wins" is the
/// whole cascade -- which is exactly what React Native's own style-array
/// merging already does.
///
/// Conditional utilities (`hover:`, `md:`, `pressed:`) are the price. A
/// style object can't express them, and making it able to would mean
/// per-component state tracking -- i.e. rebuilding the engine this design
/// is choosing not to ship. They go into `unsupported` instead of being
/// dropped, so the resolver can say so at the moment one is actually used
/// rather than rendering silently wrong. A candidate merely *appearing* in
/// the scan proves nothing (it may only ever be used on Web, or in a
/// static `className` that compiled fine), which is why this is a runtime
/// warning and not a build error.
pub fn render_candidate_module(class_names: &[String], theme: &Theme) -> String {
    let mut supported: Vec<(&String, Vec<(String, String)>)> = Vec::new();
    let mut unsupported: Vec<(&String, String)> = Vec::new();

    for name in class_names {
        let Some(utility) = hozo_parser::resolve_class_name(name) else {
            continue;
        };
        // Any conditional group disqualifies the class, which is what
        // makes `container` land here: its max-widths are per-breakpoint.
        if utility.groups.iter().any(|(condition, _)| *condition != Condition::Always) {
            unsupported.push((name, format!("`{name}` is conditional, and a runtime-resolved class can only carry unconditional styles on React Native. Write it as a static className so it compiles to a real style variant.")));
            continue;
        }
        let properties: Vec<StyleProperty> =
            utility.groups.iter().flat_map(|(_, properties)| properties.clone()).collect();
        if let Some(reason) = properties
            .iter()
            .find_map(StyleProperty::unsupported_on_native)
        {
            unsupported.push((name, format!("{reason} -- this utility is Web-only.")));
            continue;
        }
        // Owned, because the properties are a local that ends with this
        // iteration -- a style key can now borrow from the property it
        // came from (an arbitrary property's name is the author's text,
        // not a literal in this binary).
        let pairs: Vec<(String, String)> = style_pairs(&properties, theme)
            .into_iter()
            .map(|(key, value)| (key.to_string(), value))
            .collect();
        if pairs.is_empty() {
            continue;
        }
        supported.push((name, pairs));
    }

    let mut out = String::from(
        "// Generated by Hozo. Do not edit.\n\
         import { createClassResolver } from '@hozo/runtime'\n\n\
         const styles = {\n",
    );
    for (name, pairs) in &supported {
        out.push_str(&format!("  {}: {{\n", quote(name)));
        for (key, value) in pairs {
            out.push_str(&format!("    {key}: {value},\n"));
        }
        out.push_str("  },\n");
    }
    out.push_str("}\n\nconst unsupported = {\n");
    for (name, reason) in &unsupported {
        out.push_str(&format!("  {}: {},\n", quote(name), quote(reason)));
    }
    out.push_str("}\n\nexport const hozoClasses = createClassResolver(styles, unsupported)\n");
    out
}

/// A JS string literal. Class names carry `:` `/` `[` `]` and reasons carry
/// backticks and apostrophes, so both are quoted rather than emitted bare.
fn quote(text: &str) -> String {
    let escaped = text.replace('\\', r"\\").replace('"', "\\\"").replace('\n', "\\n");
    format!("\"{escaped}\"")
}

/// The React Native `key: value` pairs a set of IR properties becomes.
///
/// Distinct IR properties can collapse onto one RN key (all four per-side
/// border styles map to `borderStyle`), which would emit a duplicate object
/// key. Keep the last, matching how JS itself would resolve it -- but
/// written once.
fn style_pairs<'a>(props: &'a [StyleProperty], theme: &Theme) -> Vec<(&'a str, String)> {
    let mut emitted: Vec<(&'a str, String)> = Vec::new();
    // Which axes a `-reverse` utility flipped, read across the whole set
    // because it is a second utility describing the first.
    let flipped = |axis: Axis| {
        props.iter().any(|p| {
            matches!(
                p,
                StyleProperty::SpaceReverse(a) | StyleProperty::DivideReverse(a) if *a == axis
            )
        })
    };
    let reversed = [flipped(Axis::X), flipped(Axis::Y)];
    for prop in props {
        // A child-scoped property (`space-*`/`divide-*`) means something
        // different from a property of the same name on the element itself,
        // and only ever reaches here inside an entry built for the
        // children, so the dispatch is on the property rather than on which
        // entry is being built.
        let pairs = if style::is_child_scoped(prop) {
            style::child_property_and_value(prop, theme, reversed)
        } else {
            style::property_and_value(prop, theme)
        };
        for (key, value) in pairs {
            // A property refused for Native (see
            // `StyleProperty::unsupported_on_native`) yields no value;
            // writing the key anyway would emit `height: ,`, which isn't
            // even parseable JS.
            if value.is_empty() {
                continue;
            }
            match emitted.iter_mut().find(|(existing, _)| *existing == key) {
                Some(slot) => slot.1 = value,
                None => emitted.push((key, value)),
            }
        }
    }
    if let Some(transform) = style::transform_entry(props, theme) {
        emitted.push(transform);
    }
    if let Some(filter) = style::filter_entry(props, theme) {
        emitted.push(filter);
    }
    if let Some(shadow) = style::box_shadow_entry(props, theme) {
        emitted.push(shadow);
    }
    if let Some(gradient) = style::background_image_entry(props, theme) {
        emitted.push(gradient);
    }
    emitted
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
        ConditionExpr::Not(inner) => format!("!({})", render_condition_expr(source, inner)),
        ConditionExpr::And(a, b) => {
            format!("({}) && ({})", render_condition_expr(source, a), render_condition_expr(source, b))
        }
        ConditionExpr::Or(a, b) => {
            format!("({}) || ({})", render_condition_expr(source, a), render_condition_expr(source, b))
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
    const UNKNOWN: SiblingPosition =
        SiblingPosition { first: None, last: None, ordinal: None, count: None };
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
        if node.children.iter().any(|c| matches!(c, hozo_ir::Child::Verbatim { .. })) {
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
/// Whether this element is read-only, from either spelling.
///
/// `readOnly` if it was written; otherwise the negation of `editable`,
/// which is the same state said backwards. `None` when neither is there
/// -- not `false`, because a `TextInput` with no such prop is editable by
/// default and a `read-only:` class on it is a style that will never
/// apply, which is worth saying rather than silently dropping.
fn native_read_only(props: &hozo_ir::TextInputProps) -> Option<ConditionExpr> {
    if let Some(read_only) = props.read_only.as_ref() {
        return Some(read_only.clone());
    }
    let editable = props.editable.as_ref()?;
    Some(match editable {
        ConditionExpr::Static(value) => ConditionExpr::Static(!value),
        other => ConditionExpr::Not(Box::new(other.clone())),
    })
}

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
struct FromAncestor<'a> {
    /// The parent's `*:`. Applied here, not passed on.
    direct: &'a [StyleDeclaration],
    /// An ancestor's `**:`. Applied here and passed on.
    all: &'a [StyleDeclaration],
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
        let rewritten = StyleDeclaration { property: declaration.property.clone(), condition };
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
            matches!(declaration.property, StyleProperty::Display(Display::InlineFlex))
                && !declarations[index + 1..].iter().any(|later| {
                    later.condition == declaration.condition
                        && matches!(later.property, StyleProperty::Display(_))
                })
        })
        .map(|(_, declaration)| StyleDeclaration {
            property: StyleProperty::AlignSelf(AlignSelf::Start),
            condition: declaration.condition.clone(),
        })
        .collect();
    declarations.extend(synthetic);
    declarations
}

fn condition_contains(condition: &Condition, predicate: impl Fn(&Condition) -> bool + Copy) -> bool {
    predicate(condition)
        || matches!(condition, Condition::All(conditions) if conditions.iter().any(|condition| condition_contains(condition, predicate)))
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
#[allow(clippy::too_many_arguments)]
fn spaced_children(
    inner: String,
    child_declarations: &[StyleDeclaration],
    base_name: &str,
    source: &str,
    node: &Node,
    position: SiblingPosition,
    style_entries: &mut Vec<(String, Vec<StyleProperty>)>,
    diagnostics: &mut Vec<Diagnostic>,
    runtime: &mut RuntimeNeeds,
) -> String {
    if child_declarations.is_empty() {
        return inner;
    }

    let mut parts: Vec<String> = Vec::new();
    // `pressed:` has nowhere to go here: the render-prop `style` form it
    // relies on belongs to Pressable, and this style is destined for the
    // children rather than for the element that would track the press.
    let mut pressed_parts: Vec<String> = Vec::new();
    build_style_entries(
        child_declarations,
        &format!("{base_name}Children"),
        source,
        node,
        position,
        style_entries,
        &mut parts,
        &mut pressed_parts,
        diagnostics,
        runtime,
        false,
    );
    if !pressed_parts.is_empty() {
        diagnostics.push(unwired_variant(
            node,
            "`pressed:` on a `space-*`/`divide-*` utility would have to track press state on the \
             parent and restyle its children, which Hozo doesn't do.",
            Severity::Error,
        ));
    }
    if parts.is_empty() {
        return inner;
    }

    runtime.need_component("HozoSpaced");
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
#[allow(clippy::too_many_arguments)]
fn render_verbatim(
    expr_ref: ExprRef,
    nested: &[hozo_ir::NestedNode],
    theme: &Theme,
    inherited: &[StyleDeclaration],
    source: &str,
    allocator: &mut NameAllocator,
    style_entries: &mut Vec<(String, Vec<StyleProperty>)>,
    diagnostics: &mut Vec<Diagnostic>,
    runtime: &mut RuntimeNeeds,
    interaction_context: bool,
) -> String {
    let mut out = String::new();
    let mut cursor = expr_ref.0.start as usize;
    for entry in nested {
        out.push_str(&source[cursor..entry.span.start as usize]);
        out.push_str(&render_node(
            &entry.node,
            SiblingPosition::UNKNOWN,
            interaction_context,
            None,
            None,
            theme,
            inherited,
            // Nothing: this element is inside an expression the compiler
            // only carries, so the `*:` above it could not have been
            // resolved to reach it either -- which is what the warning at
            // that element says.
            FromAncestor::default(),
            source,
            allocator,
            style_entries,
            diagnostics,
            runtime,
        ));
        cursor = entry.span.end as usize;
    }
    out.push_str(&source[cursor..expr_ref.0.end as usize]);
    out
}

fn is_viewport_sized(prop: &StyleProperty) -> bool {
    viewport_dimension(prop).is_some()
}

/// The RN style key and viewport axis a property needs, if any.
fn viewport_dimension(prop: &StyleProperty) -> Option<(&'static str, &'static str, f64)> {
    let axis = |dim: &hozo_ir::Dimension| match dim {
        hozo_ir::Dimension::ViewportWidth(pct) => Some(("width", *pct)),
        hozo_ir::Dimension::ViewportHeight(pct) => Some(("height", *pct)),
        _ => None,
    };
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
        let Some((key, axis, pct)) = viewport_dimension(prop) else { continue };
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
/// `contrast-more` and `contrast-less` are absent deliberately: React
/// Native's nearest is Android's high-contrast *text* setting, which is a
/// different thing wearing a similar name, and answering with it would be
/// worse than saying nothing. A printer, a scripting-disabled page and
/// Windows' forced-colours mode have no meaning on a device at all.
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
    let value = node.props.accessibility_state?;
    // An object literal says which keys it has, so one that does not name
    // this state cannot drive it. An opaque expression could carry
    // anything and is taken at its word.
    if let Some(keys) = node.props.accessibility_state_keys.as_ref() {
        if !keys.iter().any(|key| key == state) {
            return None;
        }
    }
    Some(format!("({}).{state}", source_text(source, value)))
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
            conditions.iter().filter_map(condition_suffix).collect::<Vec<_>>().join("_"),
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
        Condition::Has(inner) => {
            Some(format!("has{}", condition_suffix(inner).unwrap_or_default()))
        }
        Condition::Not(inner) => {
            Some(format!("not{}", condition_suffix(inner).unwrap_or_default()))
        }
        Condition::Environment(query) => Some(environment_name(*query).replace('-', "")),
        Condition::Group(inner) => {
            Some(format!("group{}", condition_suffix(inner).unwrap_or_default()))
        }
        Condition::Peer(inner) => {
            Some(format!("peer{}", condition_suffix(inner).unwrap_or_default()))
        }
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
        Condition::Container { name, at_least, value } => Some(format!(
            "cq{}{}{}",
            name.as_deref().unwrap_or(""),
            if *at_least { "min" } else { "max" },
            value.chars().filter(|c| c.is_ascii_alphanumeric()).collect::<String>(),
        )),
        Condition::Width { at_least, value } => Some(format!(
            "{}{}",
            if *at_least { "min" } else { "max" },
            value.chars().filter(|c| c.is_ascii_alphanumeric()).collect::<String>(),
        )),
        Condition::PseudoElement(pseudo) => Some(pseudo.variant_name().replace('-', "")),
        Condition::Subtree { direct } => {
            Some(if *direct { "child".to_string() } else { "descendant".to_string() })
        }
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
        Condition::Expr(expr) => {
            let mut refs = Vec::new();
            collect_expr_refs(expr, &mut refs);
            Some(format!(
                "cond_{}",
                refs.iter().map(|r: &ExprRef| format!("{}_{}", r.0.start, r.0.end)).collect::<Vec<_>>().join("_")
            ))
        }
    }
}

fn collect_expr_refs(expr: &ConditionExpr, out: &mut Vec<ExprRef>) {
    match expr {
        ConditionExpr::Static(_) => {}
        ConditionExpr::Ref(r) => out.push(*r),
        ConditionExpr::Not(inner) => collect_expr_refs(inner, out),
        ConditionExpr::And(a, b) | ConditionExpr::Or(a, b) => {
            collect_expr_refs(a, out);
            collect_expr_refs(b, out);
        }
    }
}

#[cfg(test)]
mod native_tests;

/// The test a container query becomes, or `None` when React Native has
/// nothing to resolve the threshold against.
///
/// The `!== undefined` half is not defensive. CSS says a query with no
/// container in scope matches nothing in *either* direction, so a
/// `@max-md:` must not fire merely because no width came back -- which is
/// exactly what comparing `undefined < 448` would do.
fn container_guard(name: &Option<String>, at_least: bool, value: &str) -> Option<String> {
    let px = width_threshold_px(value)?;
    let read = format!("__hozoCq[{:?}]", name.as_deref().unwrap_or(""));
    Some(format!("{read} !== undefined && {read} {} {px}", if at_least { ">=" } else { "<" }))
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
            "import { Svg } from '@hozo/core'\n\
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
            "import { Svg } from '@hozo/core'\n\
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
            "import { Svg } from '@hozo/core'\n\
             export const C = () => <Svg><Svg.Text>hi</Svg.Text></Svg>\n",
        );
        assert!(out.runtime_imports.contains(&"Svg"), "{:?}", out.runtime_imports);
        assert!(out.runtime_imports.contains(&"SvgText"), "{:?}", out.runtime_imports);
        assert!(!out.runtime_imports.contains(&"Text"), "{:?}", out.runtime_imports);
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
            assert!(out.diagnostics.is_empty(), "{class_name}: {:?}", out.diagnostics);
            assert!(
                out.prelude.iter().any(|line| line.contains(&format!("useHozoAnimation('{name}')"))),
                "{class_name}: {:?}",
                out.prelude,
            );
            assert!(out.jsx.contains(&format!("__hozoAnim_{name}")), "{class_name}: {}", out.jsx);
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
