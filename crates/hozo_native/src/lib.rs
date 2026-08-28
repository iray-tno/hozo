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

mod grid;
mod markup;
mod style;
mod transition;

use grid::{grid_absorbs, native_grid, native_grid_item};
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

fn render_node(
    node: &Node,
    position: SiblingPosition,
    interaction_context: bool,
    grid_columns: Option<usize>,
    grid_rows: Option<usize>,
    theme: &Theme,
    // Text properties inherited from an ancestor. CSS inherits these;
    // React Native inherits them only from a `Text` to a `Text`. So a
    // `text-xl` on a View has to be carried down by the compiler, or it
    // renders at the default size on device while looking right on Web --
    // the silent divergence this backend exists to avoid.
    inherited: &[StyleDeclaration],
    // Styles an ancestor wrote for this element with `*:` or `**:`.
    from_ancestor: FromAncestor,
    source: &str,
    allocator: &mut NameAllocator,
    style_entries: &mut Vec<(String, Vec<StyleProperty>)>,
    diagnostics: &mut Vec<Diagnostic>,
    runtime: &mut RuntimeNeeds,
) -> String {
    let base_name = allocator.alloc();
    let mut style_array_parts: Vec<String> = Vec::new();
    // Held separately from `style_array_parts` because they can only be
    // merged once `component` is known (below) -- RN's pressed-render-prop
    // form of `style` only exists on Pressable; on View/Text a function
    // isn't a valid style value at all, so it must not be used there.
    let mut pressed_parts: Vec<String> = Vec::new();

    // Web concatenates an unresolvable `className` back on and lets the
    // browser's CSS engine match it. React Native has no className and no
    // CSS engine, so the string is handed to the generated resolver
    // instead (see `render_candidate_module`), which looks each class up in
    // the project-wide candidate map. Warning rather than error: the styles
    // do arrive, but only for classes whose text appears literally
    // somewhere in the project and that aren't conditional.
    for expr_ref in &node.class_name_fallback {
        diagnostics.push(Diagnostic {
            code: DiagnosticCode::DynamicClassNameNotResolved,
            severity: Severity::Warning,
            message: format!(
                "`{}` can't be resolved at build time, so it's resolved on device from the \
                 project-wide candidate map. Conditional utilities (`hover:`, `md:`, `pressed:`) \
                 can't be carried that way and will warn at runtime -- write those as a static \
                 className so they compile to a real style variant.",
                source_text(source, *expr_ref)
            ),
            span: node.span,
        });
    }

    // Some CSS concepts are props on this platform rather than styles, so
    // they're absorbed before the refusal check below -- otherwise the
    // thing that *does* express them would be reported as impossible.
    let truncation = truncation_props(node);
    // Same shape as truncation: a CSS concept React Native keeps on a prop,
    // absorbed before the refusal check so the thing that *does* express it
    // isn't reported as impossible.
    let placeholder = placeholder_props(node, theme);
    // The caret colour is another TextInput prop rather than a style. Kept
    // separate from placeholder because React Native names the two props
    // independently and either utility may appear alone.
    let caret = caret_props(node, theme);

    // `leading-tight`/`tracking-wide` are relative to the font size, which
    // React Native's equivalents aren't. Resolved here, before the refusal
    // check, so only the ones that genuinely can't be resolved are refused.
    let style = lower_inline_flex(fold_font_relative(&node.style, inherited));
    let grid = native_grid(&style, theme, runtime);
    let grid_item = native_grid_item(&style, grid_columns, grid_rows);
    // The fast Native transition path is deliberately narrow: opacity on
    // Pressable interaction state can stay entirely on the native driver.
    let transition = native_driver_transition(node, &style);
    // Computed here rather than beside its use below, because the loop
    // that follows has to know not to refuse the transition properties it
    // consumes -- they are Web-only on an element with nothing to animate
    // and lowered on one with something.
    let ambient_transition = ambient_transition(node, &style);

    // `react-native-svg` takes paint as *props*, not as style, so on an
    // SVG element these three stop being Web-only and become something to
    // lower. The refusal that used to name them said the library "is a
    // separate dependency with its own props, not a style Hozo can lower
    // to" -- true about the style and beside the point about the props,
    // which is exactly the sort of asymmetry the compiler is for: one
    // class, `fill-blue-500`, becomes a CSS declaration on Web and an
    // attribute here.
    let svg_paint: Vec<(&'static str, String)> = if matches!(node.primitive, Primitive::Svg(_)) {
        style
            .iter()
            .filter_map(|declaration| match &declaration.property {
                // Trimmed: the style resolver returns a JavaScript string
                // literal, quotes included, because that is what a
                // StyleSheet entry needs. A JSX attribute brings its own.
                StyleProperty::Fill(color) => Some((
                    "fill",
                    crate::style::resolve_theme_color(color, theme).trim_matches('\'').to_string(),
                )),
                StyleProperty::Stroke(color) => Some((
                    "stroke",
                    crate::style::resolve_theme_color(color, theme).trim_matches('\'').to_string(),
                )),
                StyleProperty::StrokeWidth(width) => Some(("strokeWidth", format!("{{{width}}}"))),
                _ => None,
            })
            .collect()
    } else {
        Vec::new()
    };

    for declaration in &style {
        // Lowered as a prop just above, so it must not also be reported as
        // a style this platform cannot hold.
        if !svg_paint.is_empty()
            && matches!(
                declaration.property,
                StyleProperty::Fill(_) | StyleProperty::Stroke(_) | StyleProperty::StrokeWidth(_)
            )
        {
            continue;
        }
        if grid.is_some() && grid_absorbs(&declaration.property) {
            continue;
        }
        if grid_item.is_some()
            && matches!(
                declaration.property,
                StyleProperty::GridColumn(_)
                    | StyleProperty::GridColumnStart(_)
                    | StyleProperty::GridColumnEnd(_)
                    | StyleProperty::GridRow(_)
                    | StyleProperty::GridRowStart(_)
                    | StyleProperty::GridRowEnd(_)
            )
        {
            continue;
        }
        if (transition.is_some() || ambient_transition.is_some())
            && matches!(
                declaration.property,
                StyleProperty::TransitionProperty(_)
                    | StyleProperty::TransitionDuration(..)
                    | StyleProperty::TransitionTimingFunction(..)
            )
        {
            continue;
        }
        if truncation.is_some() && is_truncation_declaration(&declaration.property) {
            continue;
        }
        if matches!(declaration.property, StyleProperty::PlaceholderColor(_)) {
            if placeholder.is_some() {
                continue;
            }
            if let Some(reason) = placeholder_only_reason(&declaration.property) {
                diagnostics.push(unwired_variant(node, &reason, Severity::Error));
                continue;
            }
        }
        if matches!(declaration.property, StyleProperty::CaretColor(_)) {
            if caret.is_some() {
                continue;
            }
            diagnostics.push(unwired_variant(
                node,
                &caret_only_reason(),
                Severity::Error,
            ));
            continue;
        }
        if let Some(reason) = truncation_only_reason(&declaration.property) {
            diagnostics.push(Diagnostic {
                code: DiagnosticCode::WebOnlyPropertyOnNative,
                severity: Severity::Error,
                message: reason,
                span: node.span,
            });
            continue;
        }
        // Survived the fold above, so there was no font size to resolve it
        // against. Reported as unwired rather than Web-only: the platform
        // can hold the value, and writing a `text-*` on the same element is
        // all it takes.
        if let Some(reason) = font_relative_reason(&declaration.property) {
            diagnostics.push(unwired_variant(node, &reason, Severity::Error));
            continue;
        }
        // Possible on the platform, unbuilt here. Named apart from the
        // Web-only refusals so the two don't blur together -- see
        // `DiagnosticCode::NotWiredOnNative`.
        if let Some(reason) = declaration.property.not_wired_on_native() {
            diagnostics.push(unwired_variant(node, &reason, Severity::Error));
            continue;
        }
        // Refused rather than dropped: silently ignoring a `block`/`grid`
        // would leave a layout that looks right on Web and is wrong on
        // device with nothing pointing at the cause.
        if let Some(reason) =
            declaration.property.unsupported_on_native()
        {
            diagnostics.push(Diagnostic {
                code: DiagnosticCode::WebOnlyPropertyOnNative,
                severity: Severity::Error,
                message: format!("{reason} -- this utility is Web-only."),
                span: node.span,
            });
        }
    }

    let (mut component, extra_props) = markup::native_component(node, diagnostics);
    // Recorded here, where the tag is decided, and only for the primitives
    // Hozo lowered: a carried `Child::Verbatim` keeps whatever the author
    // imported and must not be imported over.
    if !matches!(node.primitive, Primitive::Svg(_)) {
        runtime.need_native(component);
    }
    // A transition on something that is not a control. `Pressable` has its
    // own path above, driven by the four interaction booleans; this one is
    // driven by the style changing, which is the shape an ambient
    // condition arrives in -- `dark:bg-black` is already resolved to a
    // guarded array by the time it renders, and what the element sees is
    // the array becoming a different array.
    if ambient_transition.is_some() && component == "View" {
        component = "HozoAnimated";
        runtime.need_component("HozoAnimated");
    }

    // Only `Text` can hold text on this platform -- a raw string inside a
    // View or Pressable is a runtime crash there ("Text strings must be
    // rendered within a <Text> component"), while the same source is fine
    // on Web. So one is inserted. Its styles have to move with it: React
    // Native's Text inherits from an enclosing Text but *not* from a View,
    // so leaving `fontSize` on the parent would silently render at the
    // default size instead.
    // A `Text` is where inheritance stops: React Native takes over from
    // here, so its descendants need nothing from the compiler. What it
    // inherited goes *before* its own declarations, so its own win --
    // `dedupe_last_wins` keeps the last of a property, which is the same
    // order CSS specificity would settle on.
    let style: Vec<StyleDeclaration> = if component == "Text" {
        inherited.iter().cloned().chain(style).collect()
    } else {
        style
    };

    // What an ancestor's `*:`/`**:` wrote for this element, before its
    // own, so the element's own win -- `dedupe_last_wins` keeps the last
    // of a property, which is where CSS specificity would land too.
    let style: Vec<StyleDeclaration> = from_ancestor
        .direct
        .iter()
        .cloned()
        .chain(from_ancestor.all.iter().cloned())
        .chain(style)
        .collect();
    // And what this element writes for its own subtree, taken out before
    // anything tries to apply it here.
    let (subtree, style): (Vec<_>, Vec<_>) =
        style.into_iter().partition(|d| d.condition.split_subtree().is_some());
    let (to_children, to_descendants) = subtree_for_children(&subtree, node, diagnostics);
    // An ancestor's `**:` keeps going; a parent's `*:` stops here.
    let descendants: Vec<StyleDeclaration> =
        from_ancestor.all.iter().cloned().chain(to_descendants).collect();
    // A child the compiler cannot read may render anything, so a style
    // meant for "every child" would reach some of them and not others.
    if !(to_children.is_empty() && descendants.is_empty())
        && node.children.iter().any(|c| matches!(c, hozo_ir::Child::Verbatim { .. }))
    {
        diagnostics.push(unwired_variant(
            node,
            "`*:`/`**:` hands a style to each child, and one of this element's children is an expression or a component the compiler doesn't read. It reaches the children it can see and not that one. On Web the selector reaches all of them.",
            Severity::Warning,
        ));
    }

    // Everything else hands its text properties down rather than keeping
    // them: React Native's View has no `fontSize`, so leaving them here
    // would be a style that renders nothing while the same source renders
    // correctly on Web.
    let (text_declarations, own_declarations): (Vec<_>, Vec<_>) = if component == "Text" {
        (Vec::new(), style.clone())
    } else {
        style.iter().cloned().partition(|d| is_text_property(&d.property))
    };
    // Passed to every child, and to the `Text` wrapper a raw string gets.
    // The element's own come after what it inherited, for the same
    // last-wins reason.
    let descend: Vec<StyleDeclaration> =
        inherited.iter().cloned().chain(text_declarations.iter().cloned()).collect();

    // Handing them down is only half the job: they have to land somewhere.
    // Reported here rather than dropped, because a text size that reaches
    // no text is precisely a style that renders correctly on Web and does
    // nothing on device -- which is the divergence worth a build message.
    if !text_declarations.is_empty() {
        match text_reach(node) {
            TextReach::Certain => {}
            TextReach::Opaque => diagnostics.push(unwired_variant(
                node,
                "this element's text styles are handed down to its children, and one of them is \
                 an expression or a component the compiler doesn't read. React Native doesn't \
                 inherit text styles from a View, so if the text is rendered in there it will \
                 come out at the default size. Put the `text-*` on the Text itself.",
                Severity::Warning,
            )),
            TextReach::None => diagnostics.push(unwired_variant(
                node,
                "this element sets text styles and contains no text. React Native has no \
                 `fontSize` on a View, so there is nothing for them to apply to -- on Web the \
                 same source would style whatever is put inside later.",
                Severity::Warning,
            )),
        }
    }

    // `space-*`/`divide-*` belong to the children, not here. Web gives them
    // their own rule with a child-scoped selector; the equivalent on this
    // platform is a style handed to `HozoSpaced`, which decides at render
    // time which children receive it -- see that component for why the
    // decision can't be made here.
    let own_declarations = own_declarations.into_iter().filter(|d| {
        if grid.is_some() && grid_absorbs(&d.property) {
            return false;
        }
        if grid_item.is_some()
            && matches!(
                d.property,
                StyleProperty::GridColumn(_)
                    | StyleProperty::GridColumnStart(_)
                    | StyleProperty::GridColumnEnd(_)
                    | StyleProperty::GridRow(_)
                    | StyleProperty::GridRowStart(_)
                    | StyleProperty::GridRowEnd(_)
            )
        {
            return false;
        }
        !matches!(
            d.property,
            StyleProperty::TransitionProperty(_)
                | StyleProperty::TransitionDuration(..)
                | StyleProperty::TransitionTimingFunction(..)
        )
    });
    let (child_declarations, own_declarations): (Vec<_>, Vec<_>) =
        own_declarations.partition(|d| style::is_child_scoped(&d.property));

    build_style_entries(
        &own_declarations,
        &base_name,
        source,
        node,
        position,
        style_entries,
        &mut style_array_parts,
        &mut pressed_parts,
        diagnostics,
        runtime,
        interaction_context && component == "Text",
    );

    // After the compiled styles, so it wins the same way it would in the
    // source: `cn('p-4', getDynamic())` puts the opaque part last, and RN
    // resolves a style array last-wins just like JSX's own duplicate-prop
    // rule.
    for expr_ref in &node.class_name_fallback {
        style_array_parts.push(format!("hozoClasses({})", source_text(source, *expr_ref)));
    }

    let needs_focus_visible = own_declarations.iter().any(|declaration| {
        condition_contains(&declaration.condition, |condition| {
            matches!(condition, Condition::FocusVisible)
        })
    });
    let needs_hover_or_focus = own_declarations.iter().any(|declaration| {
        condition_contains(&declaration.condition, |condition| {
            matches!(condition, Condition::Hover | Condition::Focus | Condition::FocusVisible)
        })
    });
    // `@container`, which on Web is a property and here is a component:
    // an element has to measure itself before anything below it can query
    // its width.
    let container_name = own_declarations.iter().find_map(|declaration| {
        match &declaration.property {
            StyleProperty::ContainerName(name) => Some(name.clone()),
            _ => None,
        }
    });
    let declares_container = own_declarations.iter().any(|declaration| {
        matches!(&declaration.property, StyleProperty::Keyword("container-type", kind) if *kind != "normal")
    });
    // And the other half: an element whose styles ask about a container's
    // width has to read that width from a component boundary away, which
    // is what `HozoContainerQuery` is for.
    let uses_container_query = own_declarations.iter().any(|declaration| {
        condition_contains(&declaration.condition, |condition| {
            matches!(condition, Condition::Container { .. })
        })
    });
    let rendered_component = if declares_container {
        runtime.need_component("HozoContainer");
        "HozoContainer"
    } else if component == "Pressable" && (needs_hover_or_focus || transition.is_some()) {
        runtime.need_component("HozoPressable");
        "HozoPressable"
    } else if component == "Text" && interaction_context && !pressed_parts.is_empty() {
        runtime.need_component("HozoText");
        "HozoText"
    } else {
        component
    };
    let needs_pressed_fn = (component == "Pressable" || rendered_component == "HozoText")
        && !pressed_parts.is_empty();
    if needs_pressed_fn {
        style_array_parts.extend(pressed_parts);
    } else if !pressed_parts.is_empty() {
        // `pressed` comes from Pressable's render-prop `style` form, which
        // only Pressable has. On a View or Text a function isn't a valid
        // `style` value at all, so there's nowhere for these to go.
        diagnostics.push(unwired_variant(
            node,
            &format!(
                "`pressed:` needs an element that tracks press state, and `{component}` doesn't. \
                 Move it to a Pressable or Button."
            ),
            Severity::Error,
        ));
    }

    // The official StyleX residue lands before Hozo's generated `style`, so
    // it cannot replace the declarations that were successfully lowered.
    let mut props_text = node
        .props
        .stylex_residuals
        .iter()
        .map(|residual| format!(" {{...({})}}", residual.render_expression(source)))
        .collect::<String>();
    if needs_pressed_fn {
        let state = if needs_focus_visible {
            "{ pressed, hovered, focused, focusVisible }"
        } else if needs_hover_or_focus || rendered_component == "HozoText" {
            "{ pressed, hovered, focused }"
        } else {
            "{ pressed }"
        };
        props_text.push_str(&format!(
            " style={{({state}) => [{}]}}",
            style_array_parts.join(", ")
        ));
    } else if style_array_parts.len() == 1 && !style_array_parts[0].contains("&&") {
        props_text.push_str(&format!(" style={{{}}}", style_array_parts[0]));
    } else if !style_array_parts.is_empty() {
        props_text.push_str(&format!(" style={{[{}]}}", style_array_parts.join(", ")));
    }
    if let Some((duration, easing, opacity, transform, colors)) = transition {
        props_text.push_str(&format!(
            " hozoTransition={{{{ duration: {duration}, easing: '{easing}', opacity: {opacity}, transform: {transform}, colors: {colors} }}}}"
        ));
    }
    // The same prop name, deliberately, with fewer fields: `HozoAnimated`
    // works out which properties moved by comparing one render's style
    // with the last, so it needs no list of them. Sharing the name means
    // an element that becomes a `Pressable` later keeps the class working.
    if let Some((duration, easing)) = ambient_transition {
        props_text.push_str(&format!(
            " hozoTransition={{{{ duration: {duration}, easing: '{easing}' }}}}"
        ));
    }
    if needs_focus_visible {
        props_text.push_str(" hozoFocusVisible");
    }
    // Skipping the ones the author already wrote.
    //
    // These are re-emitted verbatim further down, after everything here,
    // so JSX's last-wins resolution already meant the author's value was
    // the one that applied -- emitting both was noise rather than a wrong
    // answer. It only started happening when the integrations stopped
    // requiring a rewrite to `@hozo/core`: a React Native file that sets
    // `accessibilityRole="list"` on its own `<FlatList>` is ordinary, and
    // Hozo adds the same role to every one.
    //
    // A `{...spread}` keeps the semantic prop, because its contents are
    // not knowable here -- and if it does carry the prop it still lands
    // last and still wins.
    let authored: Vec<&str> = node
        .props
        .passthrough
        .iter()
        .filter_map(|prop| prop.name.as_deref())
        .collect();
    for (key, value) in &extra_props {
        if authored.contains(key) {
            continue;
        }
        props_text.push_str(&format!(r#" {key}="{value}""#));
    }
    // The paint from `fill-*`/`stroke-*`, which is a prop here and a CSS
    // declaration on Web. A `fill` the author wrote themselves wins: they
    // said it later and more specifically than a class did.
    for (key, value) in &svg_paint {
        if authored.contains(key) {
            continue;
        }
        if value.starts_with('{') {
            props_text.push_str(&format!(" {key}={value}"));
        } else {
            props_text.push_str(&format!(r#" {key}="{value}""#));
        }
    }
    for (name, value) in [
        ("testID", node.props.test_id),
        ("nativeID", node.props.native_id),
        ("pointerEvents", node.props.pointer_events),
        ("accessibilityState", node.props.accessibility_state),
        ("accessibilityValue", node.props.accessibility_value),
        ("accessibilityLiveRegion", node.props.accessibility_live_region),
        ("onLayout", node.props.on_layout),
        ("onScroll", node.props.on_scroll),
        ("scrollEventThrottle", node.props.scroll_event_throttle),
    ] {
        if let Some(value) = value {
            props_text.push_str(&format!(" {name}={{{}}}", source_text(source, value)));
        }
    }
    // Styles that RN expresses as props (see `truncation_props`).
    // `numberOfLines` takes a number, so it's braced rather than quoted.
    for (key, value) in placeholder.into_iter().flatten() {
        props_text.push_str(&format!(" {key}={{{value}}}"));
    }
    for (key, value) in caret.into_iter().flatten() {
        props_text.push_str(&format!(" {key}={{{value}}}"));
    }
    for (key, value) in truncation.into_iter().flatten() {
        if value.parse::<u32>().is_ok() {
            props_text.push_str(&format!(" {key}={{{value}}}"));
        } else {
            props_text.push_str(&format!(r#" {key}="{value}""#));
        }
    }
    if let Some(label) = node.props.accessibility_label {
        props_text.push_str(&format!(" accessibilityLabel={{{}}}", source_text(source, label)));
    }
    if let Some(hint) = node.props.accessibility_hint {
        props_text.push_str(&format!(" accessibilityHint={{{}}}", source_text(source, hint)));
    }
    if let Some(src) = node.props.image_src {
        let value = source_text(source, src);
        let static_uri = value.starts_with(['\"', '\'']);
        if static_uri {
            props_text.push_str(&format!(" source={{{{ uri: {value} }}}}"));
        } else {
            runtime.need_component("hozoImageSource");
            props_text.push_str(&format!(" source={{hozoImageSource({value})}}"));
        }
    }
    if let Some(src) = node.props.image_default_source {
        let value = source_text(source, src);
        let static_uri = value.starts_with(['\"', '\'']);
        if static_uri {
            props_text.push_str(&format!(" defaultSource={{{{ uri: {value} }}}}"));
        } else {
            runtime.need_component("hozoImageSource");
            props_text.push_str(&format!(" defaultSource={{hozoImageSource({value})}}"));
        }
    }
    // Given back exactly as written. These props are React Native's own;
    // they are modelled only because the DOM spells them differently, and
    // there is nothing to translate on the platform they came from.
    if !node.props.text_input.is_empty() {
        let text_input = &node.props.text_input;
        if let Some(handler) = text_input.on_change_text {
            props_text.push_str(&format!(" onChangeText={{{}}}", source_text(source, handler)));
        }
        for (name, value) in [
            ("editable", &text_input.editable),
            ("readOnly", &text_input.read_only),
            ("multiline", &text_input.multiline),
            ("secureTextEntry", &text_input.secure_text_entry),
        ] {
            if let Some(value) = value {
                props_text.push_str(&native_flag(name, value, source));
            }
        }
        if let Some(rows) = text_input.number_of_lines {
            props_text.push_str(&format!(" numberOfLines={{{}}}", source_text(source, rows)));
        }
        for (name, value) in [
            ("keyboardType", &text_input.keyboard_type),
            ("inputMode", &text_input.input_mode),
        ] {
            if let Some(value) = value {
                props_text.push_str(&format!(" {name}=\"{value}\""));
            }
        }
    }

    // `@container/main`. The unnamed form needs nothing: the component
    // registers under the empty key either way, which is what an unnamed
    // `@sm:` reads.
    if let Some(name) = &container_name {
        props_text.push_str(&format!(" hozoContainerName=\"{name}\""));
    }

    if let Some(horizontal) = &node.props.scroll_horizontal {
        props_text.push_str(&format!(" horizontal={{{}}}", render_condition_expr(source, horizontal)));
    }
    if let Some(value) = node.props.keyboard_should_persist_taps {
        props_text.push_str(&format!(" keyboardShouldPersistTaps={{{}}}", source_text(source, value)));
    }
    if let Some(value) = &node.props.shows_vertical_scroll_indicator {
        props_text.push_str(&format!(" showsVerticalScrollIndicator={{{}}}", render_condition_expr(source, value)));
    }
    if let Some(value) = &node.props.shows_horizontal_scroll_indicator {
        props_text.push_str(&format!(" showsHorizontalScrollIndicator={{{}}}", render_condition_expr(source, value)));
    }
    if node.primitive == Primitive::ScrollView
        && (node.props.refreshing.is_some() || node.props.on_refresh.is_some())
    {
        let refreshing = node.props.refreshing.as_ref()
            .map(|value| render_condition_expr(source, value))
            .unwrap_or_else(|| "false".to_string());
        let on_refresh = node.props.on_refresh
            .map(|value| format!(" onRefresh={{{}}}", source_text(source, value)))
            .unwrap_or_default();
        // The one React Native component that reaches the output through a
        // prop rather than through `native_component`, so it has to be
        // recorded by hand here. Missing it means a bundle that builds and
        // dies on first render, which is exactly how `TextInput` was found
        // missing from Metro's list in the first place.
        runtime.need_native("RefreshControl");
        props_text.push_str(&format!(
            " refreshControl={{<RefreshControl refreshing={{{refreshing}}}{on_refresh} />}}"
        ));
    } else {
        if let Some(refreshing) = &node.props.refreshing {
            props_text.push_str(&format!(" refreshing={{{}}}", render_condition_expr(source, refreshing)));
        }
        if let Some(on_refresh) = node.props.on_refresh {
            props_text.push_str(&format!(" onRefresh={{{}}}", source_text(source, on_refresh)));
        }
    }
    if let Some(open) = &node.props.open {
        props_text.push_str(&format!(" open={{{}}}", render_condition_expr(source, open)));
    }
    if node.primitive == Primitive::Dialog {
        // The behaviour lives in `@hozo/a11y`; the compiler only lowers
        // the styles and checks the props.
        runtime.need_component("HozoDialog");
    }
    // Re-exported by `@hozo/runtime` from `react-native-svg` rather than
    // imported from there directly, so the one import channel the emitter
    // already has keeps working -- and so the optional peer dependency is
    // declared in one package instead of appearing in generated files.
    if let Primitive::Svg(element) = node.primitive {
        runtime.need_component(element.runtime_name());
    }
    if node.primitive == Primitive::Link {
        runtime.need_component("HozoLink");
    }
    if let Some(on_press) = node.props.on_press {
        props_text.push_str(&format!(" onPress={{{}}}", source_text(source, on_press)));
    }
    for (name, value) in [
        ("onStartShouldSetResponder", node.props.on_start_should_set_responder),
        ("onStartShouldSetResponderCapture", node.props.on_start_should_set_responder_capture),
        ("onMoveShouldSetResponder", node.props.on_move_should_set_responder),
        ("onMoveShouldSetResponderCapture", node.props.on_move_should_set_responder_capture),
        ("onResponderGrant", node.props.on_responder_grant),
        ("onResponderStart", node.props.on_responder_start),
        ("onResponderMove", node.props.on_responder_move),
        ("onResponderEnd", node.props.on_responder_end),
        ("onResponderRelease", node.props.on_responder_release),
        ("onResponderReject", node.props.on_responder_reject),
        ("onResponderTerminate", node.props.on_responder_terminate),
        ("onResponderTerminationRequest", node.props.on_responder_termination_request),
    ] {
        if let Some(value) = value {
            props_text.push_str(&format!(" {name}={{{}}}", source_text(source, value)));
        }
    }
    // React Native's own name for it, unchanged. Modelling this prop was
    // about giving the Web backend something to translate; on Native there
    // is nothing to translate, and losing it here would be a regression
    // from when it was merely carried.
    if let Some(focusable) = &node.props.focusable {
        props_text.push_str(&format!(" focusable={{{}}}", render_condition_expr(source, focusable)));
    }
    if let Some(disabled) = &node.props.disabled {
        let disabled = render_condition_expr(source, disabled);
        props_text.push_str(&format!(" disabled={{{disabled}}}"));
        if matches!(node.primitive, Primitive::Button | Primitive::Pressable) {
            props_text.push_str(&format!(" accessibilityState={{{{ disabled: Boolean({disabled}) }}}}"));
        }
    }
    // Everything Hozo doesn't model, re-emitted verbatim and last so JSX's
    // last-wins duplicate resolution keeps matching the source's own
    // ordering semantics.
    for prop in &node.props.passthrough {
        props_text.push(' ');
        props_text.push_str(&render_verbatim(
            prop.span,
            &prop.nested,
            theme,
            &descend,
            source,
            allocator,
            style_entries,
            diagnostics,
            runtime,
            interaction_context || rendered_component == "HozoPressable",
        ));
    }

    // Every child, in source order. A `Verbatim` is re-emitted from source
    // rather than dropped; a bare string on a non-Text element gets the
    // wrapper described above.
    let mut inner = String::new();
    // Tracks whether any earlier sibling could occupy an element position.
    // A `Verbatim` may render nothing, one element, or a hundred
    // (`{items.map(..)}`), so everything after one has no compile-time
    // position at all.
    // Both ends are decided up front, because "is anything after this one"
    // can't be answered while walking forwards.
    let is_verbatim = |c: &hozo_ir::Child| matches!(c, hozo_ir::Child::Verbatim { .. });
    let is_element = |c: &hozo_ir::Child| matches!(c, hozo_ir::Child::Node(_));
    let positions: Vec<SiblingPosition> = node
        .children
        .iter()
        .enumerate()
        .map(|(index, _)| {
            let before = &node.children[..index];
            let after = &node.children[index + 1..];
            SiblingPosition {
                first: (!before.iter().any(is_verbatim)).then(|| !before.iter().any(is_element)),
                last: (!after.iter().any(is_verbatim)).then(|| !after.iter().any(is_element)),
                ordinal: (!before.iter().any(is_verbatim))
                    .then(|| before.iter().filter(|c| is_element(c)).count() + 1),
                count: (!node.children.iter().any(is_verbatim))
                    .then(|| node.children.iter().filter(|c| is_element(c)).count()),
            }
        })
        .collect();

    for (index, child) in node.children.iter().enumerate() {
        match child {
            hozo_ir::Child::Node(child_node) => {
                let child_position = positions[index];
                inner.push_str(&render_node(
                    child_node,
                    child_position,
                    interaction_context || rendered_component == "HozoPressable",
                    grid.as_ref().and_then(|grid| grid.track_count),
                    grid.as_ref().and_then(|grid| grid.row_track_count),
                    theme,
                    &descend,
                    FromAncestor { direct: &to_children, all: &descendants },
                    source,
                    allocator,
                    style_entries,
                    diagnostics,
                    runtime,
                ));
            }
            hozo_ir::Child::Text(text) => {
                let escaped = escape_jsx_text(text);
                // `SvgText` holds a string itself, so wrapping one in React
                // Native's `Text` puts a text node where an SVG element
                // belongs -- the string vanishes rather than rendering.
                // The wrapper exists because a bare string inside a `View`
                // crashes; inside `<Svg.Text>` there is nothing to fix.
                let holds_text = component == "Text" || component == "SvgText";
                inner.push_str(&if !holds_text {
                    wrap_in_text(
                        &escaped,
                        &descend,
                        &base_name,
                        source,
                        node,
                        position,
                        style_entries,
                        diagnostics,
                        runtime,
                        interaction_context || rendered_component == "HozoPressable",
                    )
                } else {
                    escaped
                });
            }
            hozo_ir::Child::Verbatim { source: expr_ref, nested } => {
                inner.push_str(&render_verbatim(
                    *expr_ref,
                    nested,
                    theme,
                    &descend,
                    source,
                    allocator,
                    style_entries,
                    diagnostics,
                    runtime,
                    interaction_context || rendered_component == "HozoPressable",
                ));
            }
        }
    }

    let inner = if let Some(grid) = grid {
        if !child_declarations.is_empty() {
            diagnostics.push(unwired_variant(
                node,
                "grid combined with `space-*`/`divide-*` needs the grid placer to merge those child styles; use `gap-*` for grid spacing",
                Severity::Error,
            ));
        }
        runtime.need_component("HozoGrid");
        let row_tracks = grid
            .row_tracks_js
            .as_ref()
            .map(|tracks| format!(" rowTracks={{{tracks}}}"))
            .unwrap_or_default();
        format!(
            "<HozoGrid tracks={{{}}}{row_tracks} columnGap={{{}}} rowGap={{{}}}>{inner}</HozoGrid>",
            grid.tracks_js, grid.column_gap, grid.row_gap
        )
    } else {
        spaced_children(
            inner,
            &child_declarations,
            &base_name,
            source,
            node,
            position,
            style_entries,
            diagnostics,
            runtime,
        )
    };

    // React Native's TextInput takes no children either.
    let rendered = if component == "TextInput" || component == "Image" {
        format!("<{rendered_component}{props_text} />")
    } else {
        format!("<{rendered_component}{props_text}>{inner}</{rendered_component}>")
    };
    // Inside the grid item rather than outside it: `HozoGrid` reads its
    // children's types to place them, so anything between the two would
    // make a grid item stop looking like one.
    let rendered = if uses_container_query {
        runtime.need_component("HozoContainerQuery");
        format!("<HozoContainerQuery>{{(__hozoCq) => ({rendered})}}</HozoContainerQuery>")
    } else {
        rendered
    };
    if let Some(item) = grid_item {
        runtime.need_component("HozoGridItem");
        let start = item
            .column_start
            .map(|start| format!(" columnStart={{{start}}}"))
            .unwrap_or_default();
        let row_span = (item.row_span > 1)
            .then(|| format!(" rowSpan={{{}}}", item.row_span))
            .unwrap_or_default();
        let row_start = item
            .row_start
            .map(|start| format!(" rowStart={{{start}}}"))
            .unwrap_or_default();
        format!(
            "<HozoGridItem columnSpan={{{}}}{start}{row_span}{row_start}>{rendered}</HozoGridItem>",
            item.span
        )
    } else {
        rendered
    }
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

/// Builds the inserted `<Text>` that carries a non-Text node's string
/// content, with the text-styling declarations moved onto it.
fn wrap_in_text(
    content: &str,
    text_declarations: &[StyleDeclaration],
    base_name: &str,
    source: &str,
    node: &Node,
    // The *enclosing* node's position, not the wrapper's: these
    // declarations were written on that element, so a `first:` among them
    // asks about it. (The wrapper is trivially its parent's only child,
    // which is not the question.)
    position: SiblingPosition,
    style_entries: &mut Vec<(String, Vec<StyleProperty>)>,
    diagnostics: &mut Vec<Diagnostic>,
    runtime: &mut RuntimeNeeds,
    interaction_context: bool,
) -> String {
    // A `Text` that no `Primitive::Text` asked for: the author wrote a bare
    // string inside a View, and React Native crashes on one. Synthesized
    // here rather than by `native_component`, so it has to say so here too.
    // Found by the render tests, with `ReferenceError: Text is not defined`
    // -- which is the failure this whole reporting exists to make
    // impossible, arriving from the one path that bypasses it.
    runtime.need_native("Text");
    let mut style_array_parts = Vec::new();
    // The wrapper is a Text, so a `pressed:` style has nowhere to go on it.
    // The enclosing Pressable reports it -- `build_style_entries` runs over
    // that node's own declarations first, and a text-styling property under
    // `pressed:` lands here only after that.
    let mut pressed_parts = Vec::new();
    build_style_entries(
        text_declarations,
        &format!("{base_name}_text"),
        source,
        node,
        position,
        style_entries,
        &mut style_array_parts,
        &mut pressed_parts,
        diagnostics,
        runtime,
        interaction_context,
    );

    if interaction_context && !pressed_parts.is_empty() {
        style_array_parts.extend(pressed_parts);
        runtime.need_component("HozoText");
        return format!(
            "<HozoText style={{({{ pressed, hovered, focused }}) => [{}]}}>{content}</HozoText>",
            style_array_parts.join(", ")
        );
    }
    let style_prop = if style_array_parts.is_empty() {
        String::new()
    } else if style_array_parts.len() == 1 && !style_array_parts[0].contains("&&") {
        format!(" style={{{}}}", style_array_parts[0])
    } else {
        format!(" style={{[{}]}}", style_array_parts.join(", "))
    };
    format!("<Text{style_prop}>{content}</Text>")
}

/// Properties that style text itself. They matter separately on this
/// platform because React Native's `Text` inherits them from an enclosing
/// `Text` but not from a `View`, so they have to travel with the text
/// rather than stay on its container.
/// Whether a text style handed down from here can actually land on
/// something that renders text.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum TextReach {
    /// There is a `Text`, or a raw string that becomes one.
    Certain,
    /// No `Text` the compiler can see, but something opaque is in the way:
    /// an expression, or a component Hozo doesn't model. It may render
    /// text through code the compiler never reads.
    Opaque,
    /// Nothing that could hold text at all.
    None,
}

/// Where a text style handed down from `node` could land.
///
/// Stops at a `Text`, because that is where React Native's own inheritance
/// takes over -- anything below it is the platform's problem, not the
/// compiler's.
fn text_reach(node: &Node) -> TextReach {
    let mut reach = TextReach::None;
    for child in &node.children {
        match child {
            hozo_ir::Child::Text(_) => return TextReach::Certain,
            hozo_ir::Child::Node(child_node) => {
                if matches!(child_node.primitive, Primitive::Text | Primitive::Paragraph | Primitive::Heading) {
                    return TextReach::Certain;
                }
                match text_reach(child_node) {
                    TextReach::Certain => return TextReach::Certain,
                    TextReach::Opaque => reach = TextReach::Opaque,
                    TextReach::None => {}
                }
            }
            hozo_ir::Child::Verbatim { nested, .. } => {
                if nested.iter().any(|n| {
                    matches!(n.node.primitive, Primitive::Text | Primitive::Paragraph | Primitive::Heading)
                        || text_reach(&n.node) == TextReach::Certain
                }) {
                    return TextReach::Certain;
                }
                // `{name}` renders text and `{rows.map(..)}` may render a
                // Text through a component the compiler never reads. Either
                // way the compiler can't follow it.
                reach = TextReach::Opaque;
            }
        }
    }
    reach
}

fn is_text_property(property: &StyleProperty) -> bool {
    matches!(
        property,
        StyleProperty::FontSize(_)
            | StyleProperty::FontWeight(_)
            | StyleProperty::LineHeight(_)
            | StyleProperty::LetterSpacing(_)
            | StyleProperty::TextColor(_)
            | StyleProperty::TextAlign(_)
            | StyleProperty::TextTransform(_)
    )
}

/// A React hook the generated component needs in order to observe an
/// ambient condition -- one whose value is the same app-wide at any moment.
///
/// These are why `dark:` and `md:` work on Native without the reactive
/// engine Hozo doesn't ship: the value isn't per-element, so
/// `@hozo/runtime` keeps one subscription for the whole app and the hook
/// only exists to re-render *this* component when it changes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum RuntimeHook {
    Dark,
    Breakpoint(Breakpoint),
    /// Window size, for the viewport-relative sizes (`h-screen`).
    ///
    /// Unlike the other two, this one's value is *used* rather than guarded
    /// on, so it reports the numbers instead of a boolean -- and it
    /// re-renders on every window change rather than only when a breakpoint
    /// is crossed. That is the price of a size that has to track the window
    /// exactly, and it's why the breakpoints keep their coarse snapshot
    /// rather than being rebuilt on top of this.
    Viewport,
    /// One environment query, by Tailwind's name for it.
    ///
    /// Seven queries, four subscriptions: the runtime answers
    /// `motion-safe` from `motion-reduce` and `landscape` from
    /// `portrait`, so the pairs cost nothing extra.
    Environment(Environment),
    /// A width threshold that is not one of the five named breakpoints.
    ///
    /// Its own hook rather than a number handed to the bucketed one,
    /// because the buckets are the five and this is not one of them. Just
    /// as cheap, though: the hook's snapshot is the *predicate* rather
    /// than the width, so React bails out on every resize that doesn't
    /// cross the threshold -- which is the same guarantee the buckets give
    /// by rounding.
    WidthAtLeast(u32),
    /// One of Tailwind's four looping animations.
    ///
    /// Was `Spin` alone, because spin was the only one wired. The other
    /// three move only opacity and transform too, so they run on the
    /// same native driver and differ from it in nothing a separate hook
    /// would have expressed.
    Animation(hozo_ir::Animation),
}

impl RuntimeHook {
    /// The local binding the rendered JSX guards on.
    fn binding(&self) -> String {
        match self {
            RuntimeHook::Dark => "__hozoDark".to_string(),
            RuntimeHook::Breakpoint(bp) => format!("__hozoBp_{}", breakpoint_name(bp)),
            RuntimeHook::WidthAtLeast(px) => format!("__hozoWidth_{px}"),
            RuntimeHook::Viewport => "__hozoViewport".to_string(),
            RuntimeHook::Animation(name) => format!("__hozoAnim_{}", animation_name(*name)),
            RuntimeHook::Environment(query) => {
                format!("__hozoEnv_{}", environment_name(*query).replace('-', "_"))
            }
        }
    }

    fn import(&self) -> &'static str {
        match self {
            RuntimeHook::Dark => "useHozoDark",
            RuntimeHook::Breakpoint(_) => "useHozoBreakpoint",
            RuntimeHook::Viewport => "useHozoViewport",
            RuntimeHook::Animation(_) => "useHozoAnimation",
            RuntimeHook::Environment(_) => "useHozoEnvironment",
            RuntimeHook::WidthAtLeast(_) => "useHozoWidthAtLeast",
        }
    }

    fn declaration(&self) -> String {
        match self {
            RuntimeHook::Dark => format!("const {} = useHozoDark()", self.binding()),
            RuntimeHook::Breakpoint(bp) => format!(
                "const {} = useHozoBreakpoint('{}')",
                self.binding(),
                breakpoint_name(bp)
            ),
            RuntimeHook::WidthAtLeast(px) => {
                format!("const {} = useHozoWidthAtLeast({px})", self.binding())
            }
            RuntimeHook::Viewport => format!("const {} = useHozoViewport()", self.binding()),
            RuntimeHook::Animation(name) => format!(
                "const {} = useHozoAnimation('{}')",
                self.binding(),
                animation_name(*name)
            ),
            // The query goes through as Tailwind's name, the way the
            // breakpoint one does -- so the generated call reads as the
            // class it came from.
            RuntimeHook::Environment(query) => format!(
                "const {} = useHozoEnvironment('{}')",
                self.binding(),
                environment_name(*query)
            ),
        }
    }
}

/// Tailwind's own names, which `@hozo/runtime`'s breakpoint table also
/// uses. Distinct from `condition_suffix`, which needs an identifier-safe
/// form (`xl2`) for the generated style key.
fn breakpoint_name(bp: &Breakpoint) -> &'static str {
    match bp {
        Breakpoint::Sm => "sm",
        Breakpoint::Md => "md",
        Breakpoint::Lg => "lg",
        Breakpoint::Xl => "xl",
        Breakpoint::Xl2 => "2xl",
    }
}

fn unwired_variant(node: &Node, message: &str, severity: Severity) -> Diagnostic {
    Diagnostic {
        code: DiagnosticCode::NotWiredOnNative,
        severity,
        message: message.to_string(),
        span: node.span,
    }
}

/// Groups `declarations` by condition, registers a named style entry for
/// each group, and records how each should be referenced from the rendered
/// `style` prop. Shared by a node and any `Text` wrapper inserted inside
/// it, so both get identical condition handling.
///
/// Every condition that can't reach the rendered `style` prop reports
/// itself. Until 2026-08-15 they were computed into the StyleSheet and then
/// dropped in silence -- all eight variant-prefixed utilities in the
/// conformance suite, scored as covered because the entry existed.
#[allow(clippy::too_many_arguments)]
fn build_style_entries(
    declarations: &[StyleDeclaration],
    base_name: &str,
    source: &str,
    node: &Node,
    position: SiblingPosition,
    style_entries: &mut Vec<(String, Vec<StyleProperty>)>,
    style_array_parts: &mut Vec<String>,
    pressed_parts: &mut Vec<String>,
    diagnostics: &mut Vec<Diagnostic>,
    runtime: &mut RuntimeNeeds,
    interaction_context: bool,
) {
    // A conditional style must land after every unconditional one,
    // whatever order they were written in. On Web the cascade settles this
    // by specificity -- `.hozo-0:disabled` (0,2,0) beats `.hozo-0`
    // (0,1,0) no matter which rule comes first -- but a React Native style
    // array resolves purely last-wins, so position has to stand in for
    // specificity. Writing `disabled:p-8 p-4` used to render p-8 on Web and
    // p-4 on device.
    //
    // Within each half, source order is preserved: two conditions are the
    // same specificity on Web, so there it is source order that decides.
    let mut base_parts: Vec<String> = Vec::new();
    let mut conditional_parts: Vec<String> = Vec::new();

    for (condition, props) in hozo_ir::group_by_condition(declarations) {
        let props = hozo_ir::dedupe_last_wins(props);
        if props.is_empty() {
            continue;
        }
        // A viewport-relative size can't live in the StyleSheet: its value
        // is a number that changes when the device rotates. It becomes an
        // inline object read from a hook instead, so it stays in the same
        // style array -- and therefore in the same last-wins order -- as the
        // static entry it sits beside.
        let (viewport_props, props): (Vec<_>, Vec<_>) =
            props.into_iter().partition(is_viewport_sized);
        let viewport = viewport_object(&viewport_props);
        if viewport.is_some() {
            runtime.hooks.push(RuntimeHook::Viewport);
        }
        let (animation_props, props): (Vec<_>, Vec<_>) =
            props.into_iter().partition(|property| matches!(property, StyleProperty::Animation(_)));
        // `animate-none` asks for no hook: it turns an animation off
        // rather than being one.
        let animation_hook = animation_props.iter().find_map(|property| match property {
            StyleProperty::Animation(hozo_ir::Animation::None) => None,
            StyleProperty::Animation(name) => Some(RuntimeHook::Animation(*name)),
            _ => None,
        });
        let animation = animation_hook.as_ref().map(RuntimeHook::binding);
        if let Some(hook) = animation_hook {
            runtime.hooks.push(hook);
        }
        if props.is_empty() && viewport.is_none() && animation.is_none() {
            continue;
        }
        let name = match condition_suffix(&condition) {
            None => base_name.to_string(),
            Some(suffix) => format!("{base_name}_{suffix}"),
        };
        // The static entry and the inline object are separate array
        // elements rather than one combined string: a single part is emitted
        // as `style={part}` without the brackets, and `styles.a, {…}` there
        // would be a comma expression rather than two styles.
        let parts: Vec<String> = props
            .is_empty()
            .then(Vec::new)
            .unwrap_or_else(|| vec![format!("{STYLE_OBJECT}.{name}")])
            .into_iter()
            .chain(viewport.clone())
            .chain(animation.clone())
            .collect();
        // Each part carries the condition's guard. There may be two of them
        // (a StyleSheet entry and an inline viewport object), and both have
        // to be guarded, or `md:h-screen` would apply its height at every
        // width.
        let guarded = |prefix: &str| -> Vec<String> {
            parts.iter().map(|part| format!("{prefix}{part}")).collect()
        };
        match &condition {
            Condition::Always => base_parts.extend(parts.clone()),
            Condition::All(conditions) => {
                let mut atoms = Vec::new();
                let mut pending: Vec<_> = conditions.iter().rev().collect();
                while let Some(atom) = pending.pop() {
                    if let Condition::All(nested) = atom {
                        pending.extend(nested.iter().rev());
                    } else {
                        atoms.push(atom);
                    }
                }
                let supported = atoms.iter().all(|atom| {
                    matches!(
                        atom,
                        Condition::Always
                            | Condition::Disabled
                            | Condition::Aria(_)
                            | Condition::Enabled
                            | Condition::Group(_)
                            | Condition::Environment(_)
                            | Condition::Pressed
                            | Condition::Expr(_)
                            | Condition::Hover
                            | Condition::Focus
                            | Condition::FocusVisible
                            | Condition::Responsive(_)
                            | Condition::Width { .. }
                            | Condition::Container { .. }
                            | Condition::Dark
                            | Condition::FirstChild
                            | Condition::LastChild
                            | Condition::Structural(_)
                    )
                });
                if !supported {
                    diagnostics.push(unwired_variant(
                        node,
                        &format!(
                            "`{}`: this stacked variant contains a condition React Native \
                             doesn't have wired up yet, so the style is not applied.",
                            atoms
                                .iter()
                                .filter_map(|condition| condition_suffix(condition))
                                .collect::<Vec<_>>()
                                .join(":")
                        ),
                        Severity::Warning,
                    ));
                } else {
                    let mut guards = Vec::new();
                    let mut uses_interactive_state = false;
                    let mut applies = true;
                    for atom in atoms {
                        match atom {
                            Condition::Always => {}
                            Condition::Disabled => {
                                if let Some(disabled) = &node.props.disabled {
                                    guards.push(format!(
                                        "({})",
                                        render_condition_expr(source, disabled)
                                    ));
                                } else {
                                    diagnostics.push(unwired_variant(
                                        node,
                                        "`disabled:` in a stacked variant needs a `disabled` prop \
                                         on the same element to drive it, and this one has none.",
                                        Severity::Error,
                                    ));
                                    applies = false;
                                }
                            }
                            Condition::Group(inner) => match group_state(inner, interaction_context) {
                                Some(state) => {
                                    guards.push(state.to_string());
                                    uses_interactive_state = true;
                                }
                                None => {
                                    diagnostics.push(unwired_variant(
                                        node,
                                        &group_unwired_message(inner, interaction_context),
                                        Severity::Error,
                                    ));
                                    applies = false;
                                }
                            },
                            Condition::Enabled => match &node.props.disabled {
                                // The negation of the guard `disabled:`
                                // uses, from the same prop.
                                Some(disabled) => guards
                                    .push(format!("!({})", render_condition_expr(source, disabled))),
                                // Nothing can disable it, so it is always
                                // enabled and the variant is unconditional
                                // rather than unwired.
                                None => {}
                            },
                            Condition::Aria(state) => {
                                match aria_state_guard(node, source, state) {
                                    Some(guard) => guards.push(format!("({guard})")),
                                    None => {
                                        diagnostics.push(unwired_variant(
                                            node,
                                            &format!(
                                                "`aria-{state}:` in a stacked variant needs an `accessibilityState` on the same element to drive it on Native, and this one has none."
                                            ),
                                            Severity::Error,
                                        ));
                                        applies = false;
                                    }
                                }
                            }
                            Condition::Pressed => {
                                guards.push("pressed".to_string());
                                uses_interactive_state = true;
                            }
                            Condition::Hover => {
                                if interaction_context || matches!(node.primitive, Primitive::Pressable | Primitive::Button)
                                {
                                    guards.push("hovered".to_string());
                                    uses_interactive_state = true;
                                } else {
                                    diagnostics.push(unwired_variant(
                                        node,
                                        "`hover:` in a stacked variant is wired only on \
                                         Pressable and Button on React Native.",
                                        Severity::Error,
                                    ));
                                    applies = false;
                                }
                            }
                            Condition::Focus => {
                                if interaction_context || matches!(node.primitive, Primitive::Pressable | Primitive::Button)
                                {
                                    guards.push("focused".to_string());
                                    uses_interactive_state = true;
                                } else {
                                    diagnostics.push(unwired_variant(
                                        node,
                                        "`focus:` in a stacked variant is wired only on \
                                         Pressable and Button on React Native.",
                                        Severity::Error,
                                    ));
                                    applies = false;
                                }
                            }
                            Condition::FocusVisible => {
                                if interaction_context || matches!(node.primitive, Primitive::Pressable | Primitive::Button)
                                {
                                    guards.push("focusVisible".to_string());
                                    uses_interactive_state = true;
                                } else {
                                    diagnostics.push(unwired_variant(
                                        node,
                                        "`focus-visible:` in a stacked variant is wired only on Pressable and Button on React Native.",
                                        Severity::Error,
                                    ));
                                    applies = false;
                                }
                            }
                            Condition::Expr(expr) => {
                                guards.push(format!("({})", render_condition_expr(source, expr)));
                            }
                            Condition::Responsive(bp) => {
                                let hook = RuntimeHook::Breakpoint(*bp);
                                guards.push(hook.binding().to_string());
                                runtime.hooks.push(hook);
                            }
                            Condition::Container { name, at_least, value } => {
                                match container_guard(name, *at_least, value) {
                                    Some(guard) => guards.push(format!("({guard})")),
                                    None => {
                                        diagnostics.push(unwired_variant(
                                            node,
                                            &format!(
                                                "`{value}` in this stacked variant is not a pixel width, and React Native has nothing to resolve it against.",
                                            ),
                                            Severity::Error,
                                        ));
                                        applies = false;
                                    }
                                }
                            }
                            Condition::Width { at_least, value } => {
                                match width_threshold_px(value) {
                                    Some(px) => {
                                        let hook = RuntimeHook::WidthAtLeast(px);
                                        guards.push(if *at_least {
                                            hook.binding().to_string()
                                        } else {
                                            format!("!{}", hook.binding())
                                        });
                                        runtime.hooks.push(hook);
                                    }
                                    None => {
                                        diagnostics.push(unwired_variant(
                                            node,
                                            &format!(
                                                "`{value}` in this stacked variant is not a pixel width, and React Native has nothing to resolve it against.",
                                            ),
                                            Severity::Error,
                                        ));
                                        applies = false;
                                    }
                                }
                            }
                            Condition::Dark => {
                                let hook = RuntimeHook::Dark;
                                guards.push(hook.binding().to_string());
                                runtime.hooks.push(hook);
                            }
                            Condition::Environment(query) => match native_environment(*query) {
                                Some(query) => {
                                    let hook = RuntimeHook::Environment(query);
                                    guards.push(hook.binding().to_string());
                                    runtime.hooks.push(hook);
                                }
                                None => {
                                    diagnostics.push(unwired_variant(
                                        node,
                                        &environment_unwired_message(*query),
                                        Severity::Error,
                                    ));
                                    applies = false;
                                }
                            },
                            Condition::FirstChild
                            | Condition::LastChild
                            | Condition::Structural(_) => {
                                let known = match atom {
                                    Condition::FirstChild => position.first,
                                    Condition::LastChild => position.last,
                                    Condition::Structural(structural) => {
                                        structural_holds(structural, node, position)
                                    }
                                    _ => unreachable!("matched above"),
                                };
                                match known {
                                    Some(true) => {}
                                    Some(false) => applies = false,
                                    None => {
                                        diagnostics.push(unwired_variant(
                                            node,
                                            "a structural condition in this stacked variant \
                                             can't be resolved because the element's sibling \
                                             position isn't statically known.",
                                            Severity::Error,
                                        ));
                                        applies = false;
                                    }
                                }
                            }
                            _ => unreachable!("unsupported atoms were rejected above"),
                        }
                    }
                    if applies {
                        let prefix = if guards.is_empty() {
                            String::new()
                        } else {
                            format!("{} && ", guards.join(" && "))
                        };
                        if uses_interactive_state {
                            pressed_parts.extend(guarded(&prefix));
                        } else {
                            conditional_parts.extend(guarded(&prefix));
                        }
                    }
                }
            }
            Condition::Disabled => {
                if let Some(disabled) = &node.props.disabled {
                    let guard = render_condition_expr(source, disabled);
                    conditional_parts.extend(guarded(&format!("({guard}) && ")));
                } else {
                    // Nothing on this element drives the condition. On Web
                    // the same source is inert too (`:disabled` never
                    // matches a div), but there it's CSS behaving
                    // correctly; here it's a style that was computed and
                    // then had nowhere to go.
                    diagnostics.push(unwired_variant(
                        node,
                        "`disabled:` needs a `disabled` prop on the same element to drive it, and \
                         this one has none.",
                        Severity::Error,
                    ));
                }
            }
            Condition::Group(inner) => match group_state(inner, interaction_context) {
                // `pressed_parts`, not `conditional_parts`: these names
                // come from the render-prop the interaction context hands
                // down, and only that list makes the component take the
                // form where they are in scope. Putting them in the other
                // one emitted `hovered && …` against an identifier that
                // does not exist there.
                Some(state) => pressed_parts.extend(guarded(&format!("{state} && "))),
                None => diagnostics.push(unwired_variant(
                    node,
                    &group_unwired_message(inner, interaction_context),
                    Severity::Error,
                )),
            },
            Condition::Environment(query) => match native_environment(*query) {
                Some(query) => {
                    let hook = RuntimeHook::Environment(query);
                    conditional_parts.extend(guarded(&format!("{} && ", hook.binding())));
                    runtime.hooks.push(hook);
                }
                None => diagnostics.push(unwired_variant(
                    node,
                    &environment_unwired_message(*query),
                    Severity::Error,
                )),
            },
            // Negation is a guard like any other, so this is wired
            // wherever the thing it negates is -- but the inner condition
            // has to be resolved first, and that resolution lives in the
            // arms below rather than in a function this can call. Reported
            // for now, which is at least not silence.
            Condition::Not(inner) => diagnostics.push(unwired_variant(
                node,
                &format!(
                    "`not-{}:` is not wired on React Native yet. On Web the same class works.",
                    condition_suffix(inner).unwrap_or_default()
                ),
                Severity::Error,
            )),
            // `data-…:` selects on an attribute, and React Native views
            // have none: what the DOM keeps in an attribute a React Native
            // component keeps in a prop, and Hozo cannot read a prop it
            // does not model. `has-…:` and `supports-…:` are a descendant
            // selector and a CSS feature query, neither of which exists
            // here at all.
            Condition::DataAttribute(_)
            | Condition::Supports(_)
            | Condition::Has(_)
            | Condition::HasSelector(_) => diagnostics.push(unwired_variant(
                node,
                &format!(
                    "`{}:` has no React Native equivalent -- it selects on an attribute, a descendant or a CSS feature, and there are no selectors here. On Web the same class works.",
                    condition_suffix(&condition).unwrap_or_default()
                ),
                Severity::Error,
            )),
            // Focus on a *descendant*, which is a relation, and relations
            // on Native are the one thing this backend keeps having to
            // refuse -- see `peer-` below. `focus:` works because an
            // element knows its own focus; nothing here knows a subtree's.
            Condition::FocusWithin => diagnostics.push(unwired_variant(
                node,
                "`focus-within:` asks whether anything *inside* this element has focus, and React Native gives an element no way to know that. `focus:` on the element that actually takes focus is the version that works on both platforms.",
                Severity::Error,
            )),
            // Two that are not gaps in this backend so much as questions
            // the platform cannot be asked. A link the user has been to
            // needs links and a history to have been in them, and neither
            // is a thing React Native has. `@starting-style` needs a
            // declarative first frame, and React Native's transitions take
            // their starting value as an argument instead -- which is not
            // a worse answer, only one the author writes rather than one
            // a class can.
            Condition::Visited => diagnostics.push(unwired_variant(
                node,
                "`visited:` styles a link the user has already been to. React Native has no browsing history and no links to have been in one, so there is nothing here for this to be true of. On Web the same class works -- for colours; the browser discards the rest.",
                Severity::Error,
            )),
            Condition::StartingStyle => diagnostics.push(unwired_variant(
                node,
                "`starting:` is the value a property has for its first frame, so a transition has somewhere to start. React Native transitions through `Animated` and Reanimated, which take that starting value as an argument rather than reading it off a rule -- write it there. On Web the same class works.",
                Severity::Error,
            )),
            Condition::Target => diagnostics.push(unwired_variant(
                node,
                "`target:` matches the element the document's URL fragment points at. React Native has no document and no URL to point with, so there is nothing for this to be true of. On Web the same class works.",
                Severity::Error,
            )),
            // `read-only:` is the one the compiler can answer: React Native
            // has the state, under two names, as a prop it is looking at.
            // The other ten are the DOM's constraint validation, and
            // React Native has no such thing -- no `required`, no
            // `pattern`, no `:invalid` for them to be true of.
            Condition::FormState(FormState::ReadOnly) => {
                match native_read_only(&node.props.text_input) {
                    // A value known at build time decides the style rather
                    // than guarding it, the same way `first:` does: `true
                    // && style` in the output would be a condition that
                    // was already resolved, written out anyway.
                    Some(ConditionExpr::Static(true)) => conditional_parts.extend(guarded("")),
                    Some(ConditionExpr::Static(false)) => {}
                    Some(guard) => {
                        conditional_parts.extend(guarded(&format!("{} && ", render_condition_expr(source, &guard))))
                    }
                    None => diagnostics.push(unwired_variant(
                        node,
                        "`read-only:` needs this element to say whether it is read-only, and it doesn't. Add `readOnly` or `editable` -- either spelling -- and the style resolves at build time.",
                        Severity::Error,
                    )),
                }
            }
            // Not a gap that could be closed. React Native's styles are
            // objects handed to components, and a pseudo-element is a box
            // the browser makes that has no component to hand one to.
            // `placeholder:` is the near miss: React Native carries a
            // placeholder's colour on `TextInput`'s own
            // `placeholderTextColor` prop, which is a colour and not a
            // style object, so it cannot take the rest of what
            // `placeholder:` is allowed to set.
            Condition::PseudoElement(pseudo) => diagnostics.push(unwired_variant(
                node,
                &format!(
                    "`{}:` styles a pseudo-element, which React Native does not have -- its styles go to components, and there is no component here to give one to. Render the content as a real element instead. On Web the same class works.",
                    pseudo.variant_name(),
                ),
                Severity::Error,
            )),
            Condition::FormState(state) => diagnostics.push(unwired_variant(
                node,
                &format!(
                    "`{}:` is the DOM's constraint validation, which React Native does not have -- there is no `required`, no `pattern`, and nothing for `:invalid` to be true of. Validate in your own code and drive the style from a `className` guard. On Web the same class works.",
                    state.variant_name(),
                ),
                Severity::Error,
            )),
            // The width comes from an ancestor that measured itself, read
            // through the render prop `HozoContainerQuery` puts in the way.
            Condition::Container { name, at_least, value } => {
                match container_guard(name, *at_least, value) {
                    Some(guard) => conditional_parts.extend(guarded(&format!("{guard} && "))),
                    None => diagnostics.push(unwired_variant(
                        node,
                        &format!(
                            "`{value}` is not a pixel width, and React Native has nothing to resolve it against -- no root font size for `rem`. Write the threshold in `px`, or use one of Tailwind's container sizes. On Web the same class works.",
                        ),
                        Severity::Error,
                    )),
                }
            }
            // A subtree marker that survived the partition above, which
            // means it is wrapped in something -- `not-*:` and the like.
            // Handing a style down is the answer to `*:`; there is no
            // answer to the negation of one, because the set it names is
            // "everything that is not a child of this", which React Native
            // has no way to enumerate.
            Condition::Subtree { .. } => diagnostics.push(unwired_variant(
                node,
                "`*:`/`**:` is handed to this element's children at build time, and this one is wrapped in a variant that cannot be. On Web the same class works from the selector.",
                Severity::Error,
            )),
            Condition::Peer(_) => diagnostics.push(unwired_variant(
                node,
                "`peer-…:` has no React Native equivalent. A sibling relationship is a selector, \
                 and there are none here -- a parent can hand its state down through context, and \
                 a sibling has nowhere to hand it. On Web the same class works.",
                Severity::Error,
            )),
            Condition::Enabled => match &node.props.disabled {
                Some(disabled) => {
                    let guard = render_condition_expr(source, disabled);
                    conditional_parts.extend(guarded(&format!("!({guard}) && ")));
                }
                // An element with no `disabled` prop cannot become
                // disabled, so `enabled:` on it is simply always true --
                // unlike `disabled:`, where nothing driving it means the
                // style had nowhere to go.
                None => base_parts.extend(parts.clone()),
            },
            Condition::Aria(state) => {
                match aria_state_guard(node, source, state) {
                    Some(guard) => conditional_parts.extend(guarded(&format!("({guard}) && "))),
                    // Web needs nothing from the props here -- the selector
                    // matches whatever the element carries. Native has no
                    // selector engine, so the state has to be readable as
                    // an expression or the style has nowhere to go.
                    None => diagnostics.push(unwired_variant(
                        node,
                        &format!(
                            "`aria-{state}:` needs an `accessibilityState` on the same element to drive it on Native, and this one has none. On Web the same class works from the attribute alone."
                        ),
                        Severity::Error,
                    )),
                }
            }
            Condition::Pressed => pressed_parts.extend(guarded("pressed && ")),
            Condition::Expr(expr) => {
                let guard = render_condition_expr(source, expr);
                conditional_parts.extend(guarded(&format!("({guard}) && ")));
            }
            // Each of these produced a style object that the rendered JSX
            // never referenced -- computed, then dropped, with nothing
            // said. That silence is the bug being fixed here; the styles
            // still don't apply, but no longer without saying so.
            Condition::Hover | Condition::Focus
                if interaction_context || matches!(node.primitive, Primitive::Pressable | Primitive::Button) =>
            {
                let guard = match condition {
                    Condition::Hover => "hovered && ",
                    _ => "focused && ",
                };
                pressed_parts.extend(guarded(guard));
            }
            Condition::Hover | Condition::Focus => diagnostics.push(unwired_variant(
                node,
                "`hover:` and `focus:` are wired only on Pressable and Button on React Native, \
                 because those elements own the interaction events that drive the state.",
                Severity::Error,
            )),
            Condition::FocusVisible
                if interaction_context || matches!(node.primitive, Primitive::Pressable | Primitive::Button) =>
            {
                pressed_parts.extend(guarded("focusVisible && "));
            }
            Condition::FocusVisible => diagnostics.push(unwired_variant(
                node,
                "`focus-visible:` is wired only on Pressable and Button on React Native, because those elements own the pointer and keyboard events used to infer modality.",
                Severity::Error,
            )),
            // Ambient conditions: one app-wide value, observed through a
            // hook so this component re-renders when it changes. The hook
            // declaration goes to the caller rather than into the JSX --
            // see `LowerOutput::prelude` for why inlining it is unsafe.
            // `max-…:` is the same question read from the other side, so
            // it is the same hook negated rather than a second one.
            Condition::Width { at_least, value } => match width_threshold_px(value) {
                Some(px) => {
                    let hook = RuntimeHook::WidthAtLeast(px);
                    let guard = if *at_least {
                        format!("{} && ", hook.binding())
                    } else {
                        format!("!{} && ", hook.binding())
                    };
                    conditional_parts.extend(guarded(&guard));
                    runtime.hooks.push(hook);
                }
                None => diagnostics.push(unwired_variant(
                    node,
                    &format!(
                        "`{value}` is not a pixel width, and React Native has nothing to resolve it against -- no root font size for `rem`, and a viewport unit compared against the viewport answers itself. Write the threshold in `px`. On Web the same class works.",
                    ),
                    Severity::Error,
                )),
            },
            Condition::Responsive(bp) => {
                let hook = RuntimeHook::Breakpoint(*bp);
                conditional_parts.extend(guarded(&format!("{} && ", hook.binding())));
                runtime.hooks.push(hook);
            }
            Condition::Dark => {
                let hook = RuntimeHook::Dark;
                conditional_parts.extend(guarded(&format!("{} && ", hook.binding())));
                runtime.hooks.push(hook);
            }
            // Resolved at build time rather than needing a selector
            // engine. Both decided answers are exact -- the same thing
            // `:first-child` would do on Web -- so neither reports
            // anything; only an undecidable position does.
            Condition::FirstChild | Condition::LastChild | Condition::Structural(_) => {
                let (end, known) = match condition {
                    Condition::FirstChild => ("first".to_string(), position.first),
                    Condition::LastChild => ("last".to_string(), position.last),
                    Condition::Structural(structural) => (
                        structural.variant_name(),
                        structural_holds(&structural, node, position),
                    ),
                    _ => unreachable!("matched above"),
                };
                match known {
                    Some(true) => conditional_parts.extend(guarded("")),
                    // The pseudo-class wouldn't match here either, so
                    // dropping the style is the correct outcome, not a gap.
                    Some(false) => {}
                    None => diagnostics.push(unwired_variant(
                        node,
                        &format!(
                            "`{end}:` can only be resolved when the compiler can see this \
                             element's position among its siblings, and here it can't -- it's \
                             either the root of a component (whose position its caller decides) \
                             or a sibling of something Hozo doesn't model, such as a custom \
                             component or a `{{...}}` expression."
                        ),
                        Severity::Error,
                    )),
                }
            }
            // Refused rather than shelved. React Native has no selector
            // engine at all -- not a missing feature but a different
            // architecture, since styles there are objects handed to
            // elements rather than rules matched against a tree. `[&>*]`
            // asks which elements match a pattern, and there is nothing on
            // that side of the compiler that could ever answer it.
            //
            // An error, not a warning: the author wrote a selector, and a
            // build that quietly rendered without it would look like it
            // worked.
            Condition::ArbitrarySelector(selector) => diagnostics.push(Diagnostic {
                code: DiagnosticCode::WebOnlyPropertyOnNative,
                severity: Severity::Error,
                message: format!(
                    "`[{selector}]:` is a CSS selector, and React Native has no selector engine \
                     to match it with -- styles there are objects attached to elements, not \
                     rules matched against a tree. Move the condition into JSX, or apply the \
                     style to the elements directly."
                ),
                span: node.span,
            }),
            // `@media` and `@supports` both ask the browser a question
            // about itself. The nearest Native equivalents are real but
            // unrelated -- `useWindowDimensions` for width, `Platform` for
            // capability -- and neither is a translation of the at-rule
            // the author wrote.
            Condition::ArbitraryAtRule(rule) => diagnostics.push(Diagnostic {
                code: DiagnosticCode::WebOnlyPropertyOnNative,
                severity: Severity::Error,
                message: format!(
                    "`[{rule}]:` is a CSS at-rule, which only a browser can evaluate. Hozo's \
                     own breakpoint variants do work on React Native -- they read \
                     `useWindowDimensions` -- so a width query is better written as `md:` than \
                     as a raw `@media`."
                ),
                span: node.span,
            }),
        }
        // No catch-all arm above, deliberately: a new `Condition` variant
        // must fail to compile here rather than quietly joining the set
        // that gets computed and dropped. That is exactly how the eight
        // variants this function now reports went unnoticed.
        if !props.is_empty() {
            style_entries.push((name, props));
        }
    }

    style_array_parts.append(&mut base_parts);
    style_array_parts.append(&mut conditional_parts);
    // `pressed_parts` is appended by the caller, after these, because only
    // there is it known whether the element can carry press state at all.
    // That puts `pressed:` last among the conditions rather than in source
    // order relative to them -- a divergence from Web only when a
    // `pressed:` utility and another conditional set the same property.
}

/// Rewrites the font-relative text metrics into absolute ones, against a
/// font size set on the same element.
///
/// CSS lets `line-height` be a bare multiplier and `letter-spacing` be a
/// length in `em`; React Native's `lineHeight` and `letterSpacing` are
/// absolute numbers. The conversion needs the font size, and the useful
/// observation is that the compiler often has it -- `text-lg leading-tight`
/// puts both on the same element, and Tailwind's own output does the same
/// multiplication.
///
/// Only a font size under the *same* condition is used, falling back to an
/// unconditional one. An inherited size is equally usable: Hozo already
/// carries text declarations through View nodes because RN itself does not.
/// Folding `leading-tight` against a `md:text-lg` would bake a size that only
/// applies above 768px into a style that always does.
fn fold_font_relative(
    declarations: &[StyleDeclaration],
    inherited: &[StyleDeclaration],
) -> Vec<StyleDeclaration> {
    let font_size = |condition: &Condition| -> Option<f64> {
        let find = |list: &[StyleDeclaration], want: &Condition| {
            list.iter().rev().find_map(|d| match (&d.property, &d.condition) {
                (StyleProperty::FontSize(Length::Px(px)), c) if c == want => Some(*px),
                _ => None,
            })
        };
        find(declarations, condition)
            .or_else(|| find(declarations, &Condition::Always))
            .or_else(|| find(inherited, condition))
            .or_else(|| find(inherited, &Condition::Always))
    };

    declarations
        .iter()
        .map(|declaration| {
            let Some(size) = font_size(&declaration.condition) else {
                return declaration.clone();
            };
            let property = match &declaration.property {
                StyleProperty::LineHeight(hozo_ir::LineHeight::Ratio(ratio)) => {
                    StyleProperty::LineHeight(hozo_ir::LineHeight::Length(Length::Px(
                        size * ratio,
                    )))
                }
                StyleProperty::LetterSpacing(hozo_ir::LetterSpacing::Em(em)) => {
                    StyleProperty::LetterSpacing(hozo_ir::LetterSpacing::Px(Length::Px(
                        size * em.0,
                    )))
                }
                _ => return declaration.clone(),
            };
            StyleDeclaration { property, condition: declaration.condition.clone() }
        })
        .collect()
}

/// Why a font-relative metric couldn't be honoured when `fold_font_relative`
/// found no font size to resolve it against.
///
/// Kept out of `StyleProperty::unsupported_on_native` because the answer
/// depends on the node, which that method can't see -- the same reason
/// `truncation_only_reason` lives here.
fn font_relative_reason(property: &StyleProperty) -> Option<String> {
    match property {
        StyleProperty::LetterSpacing(hozo_ir::LetterSpacing::Em(_)) => Some(
            "`tracking-*` in em: React Native's letterSpacing is absolute. Hozo resolves it \
             against a text size on the same element, and this element sets none -- add a \
             `text-*` utility here, or use an absolute tracking value."
                .to_string(),
        ),
        StyleProperty::LineHeight(hozo_ir::LineHeight::Ratio(_)) => Some(
            "`leading-*` as a ratio: React Native's lineHeight is absolute. Hozo resolves it \
             against a text size on the same element, and this element sets none -- add a \
             `text-*` utility here, or use `leading-<number>`."
                .to_string(),
        ),
        _ => None,
    }
}

/// Whether a property sizes something against the viewport (`h-screen`,
/// `min-w-screen`), which React Native can express but not statically.
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

/// `placeholder-*` as React Native carries it: a prop on `TextInput`,
/// not a style on anything.
///
/// Lives here rather than in `unsupported_on_native` because the answer
/// depends on the node -- on a `TextInput` it lowers, anywhere else there
/// is no placeholder for it to colour.
fn placeholder_props(node: &Node, theme: &Theme) -> Option<Vec<(&'static str, String)>> {
    let colour = node.style.iter().find_map(|d| match &d.property {
        StyleProperty::PlaceholderColor(c) => Some(c),
        _ => None,
    })?;
    (node.primitive == Primitive::TextInput)
        .then(|| vec![("placeholderTextColor", style::placeholder_color(colour, theme))])
}

fn placeholder_only_reason(property: &StyleProperty) -> Option<String> {
    matches!(property, StyleProperty::PlaceholderColor(_)).then(|| {
        "`placeholder-*`: React Native carries this as `TextInput`'s `placeholderTextColor` prop, so it only means something on a TextInput"
            .to_string()
    })
}

/// `caret-*` as React Native carries it: `cursorColor` on TextInput.
fn caret_props(node: &Node, theme: &Theme) -> Option<Vec<(&'static str, String)>> {
    let colour = node.style.iter().find_map(|d| match &d.property {
        StyleProperty::CaretColor(c) => Some(c),
        _ => None,
    })?;
    (node.primitive == Primitive::TextInput)
        .then(|| vec![("cursorColor", style::placeholder_color(colour, theme))])
}

fn caret_only_reason() -> String {
    "`caret-*`: React Native carries this as `TextInput`'s `cursorColor` prop, so it only means \
     something on a TextInput"
        .to_string()
}

/// React Native expresses text truncation as props on `Text` --
/// `numberOfLines` and `ellipsizeMode` -- where CSS uses `white-space` and
/// `text-overflow`. The mapping is from the *combination* of declarations
/// to one prop pair, not property-by-property, which is why it lives here
/// rather than in `style::property_and_value`.
///
/// `None` means this node can't absorb them (nothing asked for truncation,
/// or it isn't a `Text`), and the caller refuses them instead.
fn truncation_props(node: &Node) -> Option<Vec<(&'static str, String)>> {
    // `numberOfLines` exists on Text alone; on a View there's nothing to
    // put it on, so truncation there really is unsupported.
    if !matches!(node.primitive, Primitive::Text | Primitive::Paragraph | Primitive::Heading) {
        return None;
    }
    let has = |want: &StyleProperty| node.style.iter().any(|d| d.property == *want);
    // `line-clamp-<n>` is the same mechanism with a line count: React
    // Native has one prop for both, so the two utilities meet here.
    if let Some(lines) = node.style.iter().find_map(|d| match &d.property {
        StyleProperty::LineClamp(lines) => Some(lines),
        _ => None,
    }) {
        return match lines {
            // `line-clamp-none` means no clamping, which on this platform
            // is the absence of the prop rather than a value for it.
            None => Some(Vec::new()),
            // A clamp Hozo couldn't read as a count is refused by name in
            // `StyleProperty::native_gap`, so there is nothing to emit for
            // it here.
            Some(n) => Some(n.lines().map_or_else(Vec::new, |lines| {
                vec![("numberOfLines", lines.to_string())]
            })),
        };
    }
    if !has(&StyleProperty::WhiteSpace(WhiteSpace::NoWrap)) {
        return None;
    }

    let mut props = vec![("numberOfLines", "1".to_string())];
    if !has(&StyleProperty::TextOverflow(TextOverflow::Ellipsis)) {
        // RN's default `ellipsizeMode` is `tail`, i.e. an ellipsis. Nothing
        // asked for one here, so clipping is the closer match to plain
        // `white-space: nowrap`.
        props.push(("ellipsizeMode", "clip".to_string()));
    }
    Some(props)
}

fn is_truncation_declaration(property: &StyleProperty) -> bool {
    matches!(
        property,
        StyleProperty::WhiteSpace(WhiteSpace::NoWrap) | StyleProperty::TextOverflow(_) | StyleProperty::LineClamp(_)
    )
}

/// Why a truncation-related declaration can't be honoured when it wasn't
/// absorbed into props. Kept out of `StyleProperty::unsupported_on_native`
/// because the answer depends on the node, which that method can't see.
fn truncation_only_reason(property: &StyleProperty) -> Option<String> {
    match property {
        StyleProperty::TextOverflow(_) => Some(
            "`text-overflow`: React Native truncates via the `numberOfLines` prop on Text, which \
             needs `white-space: nowrap` (Tailwind's `truncate`) on a Text element."
                .to_string(),
        ),
        StyleProperty::WhiteSpace(WhiteSpace::NoWrap) => Some(
            "`white-space: nowrap`: React Native suppresses wrapping with the `numberOfLines` \
             prop, which only exists on Text."
                .to_string(),
        ),
        _ => None,
    }
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
