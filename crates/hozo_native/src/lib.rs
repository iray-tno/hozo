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

mod markup;
mod style;

use hozo_ir::{
    AlignSelf, Axis, Breakpoint, Condition, ConditionExpr, Diagnostic, DiagnosticCode, Display, Environment, ExprRef,
    FormState, GridLine, GridSpan, GridTracks, Length, Node, Primitive,
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

struct NativeGrid {
    tracks_js: String,
    column_gap: String,
    row_gap: String,
    /// Static only when every responsive branch has the same count. Item
    /// line resolution needs a compile-time explicit grid; auto-placement
    /// itself does not.
    track_count: Option<usize>,
    row_tracks_js: Option<String>,
    row_track_count: Option<usize>,
}

fn grid_absorbs(property: &StyleProperty) -> bool {
    matches!(
        property,
        StyleProperty::Display(Display::Grid)
            | StyleProperty::GridTemplateColumns(_)
            | StyleProperty::GridTemplateRows(_)
    )
}

/// Builds the supported subset of the Native grid solver input. Columns can
/// stay on the measurement-free path; explicit rows select its measured path.
/// Responsive track and gap changes reuse the same coarse breakpoint hooks
/// as ordinary Native variants. The ordinary column-only branch still stays
/// measurement-free: changing `tracks` only rebuilds Yoga flex rows.
fn native_grid(
    declarations: &[StyleDeclaration],
    theme: &Theme,
    runtime: &mut RuntimeNeeds,
) -> Option<NativeGrid> {
    if declarations.iter().any(|declaration| {
        !matches!(declaration.condition, Condition::Always | Condition::Responsive(_))
            && matches!(
                declaration.property,
                StyleProperty::Display(_)
                    | StyleProperty::GridTemplateColumns(_)
                    | StyleProperty::GridTemplateRows(_)
                    | StyleProperty::Gap(_)
                    | StyleProperty::ColumnGap(_)
                    | StyleProperty::RowGap(_)
            )
    }) {
        return None;
    }

    let display = declarations.iter().rev().find_map(|declaration| {
        matches!(declaration.condition, Condition::Always)
            .then_some(&declaration.property)
            .and_then(|property| match property {
                StyleProperty::Display(display) => Some(*display),
                _ => None,
            })
    });
    if display != Some(Display::Grid) {
        return None;
    }

    let (tracks_js, track_count) = responsive_grid_value(
        declarations,
        |property| match property {
            StyleProperty::GridTemplateColumns(tracks) => Some(parse_grid_tracks(tracks)),
            _ => None,
        },
        Some(vec![NativeTrack::Fr(1.0)]),
        runtime,
    )?;
    let has_rows = declarations.iter().any(|declaration|
        matches!(declaration.property, StyleProperty::GridTemplateRows(_)));
    let (row_tracks_js, row_track_count) = if has_rows {
        let (value, count) = responsive_grid_value(
            declarations,
            |property| match property {
                StyleProperty::GridTemplateRows(tracks) => Some(parse_grid_tracks(tracks)),
                _ => None,
            },
            Some(Vec::new()),
            runtime,
        )?;
        (Some(value), count)
    } else {
        (None, None)
    };
    let column_gap = responsive_gap(declarations, theme, true, runtime);
    let row_gap = responsive_gap(declarations, theme, false, runtime);
    Some(NativeGrid {
        tracks_js,
        column_gap,
        row_gap,
        track_count,
        row_tracks_js,
        row_track_count,
    })
}

#[derive(Clone)]
enum NativeTrack {
    Fr(f64),
    Points(f64),
    Minmax { min: f64, fr: f64 },
}

type NativeTracks = Vec<NativeTrack>;

fn parse_grid_tracks(tracks: &GridTracks) -> Option<NativeTracks> {
    match tracks {
        GridTracks::Count(count) if *count > 0 => Some(vec![NativeTrack::Fr(1.0); *count as usize]),
        GridTracks::Css(css) => {
            parse_equal_grid_repeat(css).or_else(|| parse_native_grid_tracks(css))
        }
        GridTracks::None | GridTracks::Subgrid | GridTracks::Count(_) => None,
    }
}

fn parse_equal_grid_repeat(css: &str) -> Option<NativeTracks> {
    let compact = css
        .chars()
        .filter(|character| !character.is_whitespace())
        .collect::<String>();
    let count = compact
        .strip_prefix("repeat(")?
        .strip_suffix(",minmax(0,1fr))")?
        .parse::<usize>()
        .ok()?;
    (count > 0).then(|| vec![NativeTrack::Fr(1.0); count])
}

fn tracks_js(tracks: &NativeTracks) -> String {
    format!(
        "[{}]",
        tracks
            .iter()
            .map(|track| match track {
                NativeTrack::Fr(value) => format!("{{ kind: 'fr', value: {value} }}"),
                NativeTrack::Points(value) => format!("{{ kind: 'points', value: {value} }}"),
                NativeTrack::Minmax { min, fr } => {
                    format!("{{ kind: 'minmax', min: {min}, value: {fr} }}")
                }
            })
            .collect::<Vec<_>>()
            .join(", ")
    )
}

fn breakpoint_rank(bp: &Breakpoint) -> u8 {
    match bp {
        Breakpoint::Sm => 0,
        Breakpoint::Md => 1,
        Breakpoint::Lg => 2,
        Breakpoint::Xl => 3,
        Breakpoint::Xl2 => 4,
    }
}

fn responsive_grid_value<F>(
    declarations: &[StyleDeclaration],
    pick: F,
    default: Option<NativeTracks>,
    runtime: &mut RuntimeNeeds,
) -> Option<(String, Option<usize>)>
where
    F: Fn(&StyleProperty) -> Option<Option<NativeTracks>>,
{
    let mut base = default;
    let mut responsive: Vec<(Breakpoint, NativeTracks)> = Vec::new();
    for declaration in declarations {
        let Some(parsed) = pick(&declaration.property) else { continue };
        let parsed = parsed?;
        match declaration.condition {
            Condition::Always => base = Some(parsed),
            Condition::Responsive(bp) => {
                if let Some(entry) = responsive.iter_mut().find(|(known, _)| known == &bp) {
                    entry.1 = parsed;
                } else {
                    responsive.push((bp, parsed));
                }
            }
            _ => return None,
        }
    }
    let base = base?;
    let mut counts = vec![base.len()];
    // Hooks are min-width predicates and therefore overlap. Wrap from the
    // smallest to the largest so the largest active breakpoint is outermost
    // and wins, matching Tailwind's media-query ordering.
    responsive.sort_by_key(|(bp, _)| breakpoint_rank(bp));
    let mut value = tracks_js(&base);
    for (bp, tracks) in &responsive {
        runtime.hooks.push(RuntimeHook::Breakpoint(*bp));
        counts.push(tracks.len());
        value = format!("{} ? {} : ({value})", RuntimeHook::Breakpoint(*bp).binding(), tracks_js(tracks));
    }
    let count = counts.iter().all(|count| *count == counts[0]).then_some(counts[0]);
    Some((value, count))
}

fn responsive_gap(
    declarations: &[StyleDeclaration],
    theme: &Theme,
    column: bool,
    runtime: &mut RuntimeNeeds,
) -> String {
    let mut base = 0.0;
    let mut responsive: Vec<(Breakpoint, f64)> = Vec::new();
    for declaration in declarations {
        let value = match &declaration.property {
            StyleProperty::Gap(length) => Some(length.px(theme)),
            StyleProperty::ColumnGap(length) if column => Some(length.px(theme)),
            StyleProperty::RowGap(length) if !column => Some(length.px(theme)),
            _ => None,
        };
        let Some(value) = value else { continue };
        match declaration.condition {
            Condition::Always => base = value,
            Condition::Responsive(bp) => {
                if let Some(entry) = responsive.iter_mut().find(|(known, _)| known == &bp) {
                    entry.1 = value;
                } else {
                    responsive.push((bp, value));
                }
            }
            _ => return base.to_string(),
        }
    }
    responsive.sort_by_key(|(bp, _)| breakpoint_rank(bp));
    let mut value = base.to_string();
    for (bp, gap) in responsive {
        runtime.hooks.push(RuntimeHook::Breakpoint(bp));
        value = format!("{} ? {gap} : ({value})", RuntimeHook::Breakpoint(bp).binding());
    }
    value
}

struct NativeGridItem {
    span: usize,
    column_start: Option<usize>,
    row_span: usize,
    row_start: Option<usize>,
}

fn native_grid_item(
    declarations: &[StyleDeclaration],
    grid_columns: Option<usize>,
    grid_rows: Option<usize>,
) -> Option<NativeGridItem> {
    let columns = grid_columns?;
    if declarations.iter().any(|declaration| {
        !matches!(declaration.condition, Condition::Always)
            && matches!(
                declaration.property,
                StyleProperty::GridColumn(_)
                    | StyleProperty::GridColumnStart(_)
                    | StyleProperty::GridColumnEnd(_)
                    | StyleProperty::GridRow(_)
                    | StyleProperty::GridRowStart(_)
                    | StyleProperty::GridRowEnd(_)
            )
    }) {
        return None;
    }
    let find = |pick: fn(&StyleProperty) -> Option<GridLine>| {
        declarations.iter().rev().find_map(|declaration| {
            matches!(declaration.condition, Condition::Always)
                .then(|| pick(&declaration.property))
                .flatten()
        })
    };
    let mut start = find(|property| match property {
        StyleProperty::GridColumnStart(line) => Some(*line),
        _ => None,
    })
    .and_then(|line| resolve_grid_line(line, columns));
    let end = find(|property| match property {
        StyleProperty::GridColumnEnd(line) => Some(*line),
        _ => None,
    })
    .and_then(|line| resolve_grid_line(line, columns));
    let shorthand = declarations.iter().rev().find_map(|declaration| {
        if !matches!(declaration.condition, Condition::Always) {
            return None;
        }
        match declaration.property {
            StyleProperty::GridColumn(value) => Some(value),
            _ => None,
        }
    });
    let row_start_line = find(|property| match property {
        StyleProperty::GridRowStart(line) => Some(*line),
        _ => None,
    });
    let row_end_line = find(|property| match property {
        StyleProperty::GridRowEnd(line) => Some(*line),
        _ => None,
    });
    let row_shorthand = declarations.iter().rev().find_map(|declaration| {
        if !matches!(declaration.condition, Condition::Always) {
            return None;
        }
        match declaration.property {
            StyleProperty::GridRow(value) => Some(value),
            _ => None,
        }
    });
    if start.is_none()
        && end.is_none()
        && shorthand.is_none()
        && row_start_line.is_none()
        && row_end_line.is_none()
        && row_shorthand.is_none()
    {
        return None;
    }

    let mut span = match shorthand {
        Some(GridSpan::Span(span)) => span as usize,
        Some(GridSpan::Full) => {
            start = Some(0);
            columns
        }
        Some(GridSpan::Auto) | None => 1,
    };
    if let (Some(start), Some(end)) = (start, end) {
        span = end.checked_sub(start)?;
    } else if let (None, Some(end)) = (start, end) {
        start = end.checked_sub(span);
    }
    let start_fits = start.map_or(true, |start| start + span <= columns);
    let mut row_start = row_start_line.and_then(|line| resolve_row_line(line, grid_rows));
    let row_end = row_end_line.and_then(|line| resolve_row_line(line, grid_rows));
    let mut row_span = match row_shorthand {
        Some(GridSpan::Span(span)) => span as usize,
        Some(GridSpan::Auto) | None => 1,
        Some(GridSpan::Full) => {
            row_start = Some(0);
            grid_rows?
        }
    };
    if let (Some(start), Some(end)) = (row_start, row_end) {
        row_span = end.checked_sub(start)?;
    } else if let (None, Some(end)) = (row_start, row_end) {
        row_start = end.checked_sub(row_span);
    }
    (span > 0 && span <= columns && start_fits && row_span > 0).then_some(NativeGridItem {
        span,
        column_start: start,
        row_span,
        row_start,
    })
}

fn resolve_row_line(line: GridLine, rows: Option<usize>) -> Option<usize> {
    match line {
        GridLine::Line(line) if line > 0 => Some(line as usize - 1),
        GridLine::Line(line) => {
            let rows = rows?;
            (rows as i32 + 1 + line)
                .try_into()
                .ok()
                .filter(|line: &usize| *line <= rows)
        }
        GridLine::Auto => None,
    }
}

fn resolve_grid_line(line: GridLine, columns: usize) -> Option<usize> {
    match line {
        GridLine::Auto => None,
        GridLine::Line(line) if line > 0 => Some(line as usize - 1),
        GridLine::Line(line) => (columns as i32 + 1 + line)
            .try_into()
            .ok()
            .filter(|line: &usize| *line <= columns),
    }
}

fn parse_native_grid_tracks(css: &str) -> Option<NativeTracks> {
    let tracks: Option<Vec<_>> = css
        .split_whitespace()
        .map(|token| {
            if let Some(inner) = token.strip_prefix("minmax(").and_then(|value| value.strip_suffix(')')) {
                let (min, max) = inner.split_once(',')?;
                let min = min.strip_suffix("px")?.parse::<f64>().ok()?;
                let fr = max.strip_suffix("fr")?.parse::<f64>().ok()?;
                return (min >= 0.0 && fr > 0.0).then_some(NativeTrack::Minmax { min, fr });
            }
            if let Some(value) = token.strip_suffix("fr") {
                let value = value.parse::<f64>().ok()?;
                return (value > 0.0).then_some(NativeTrack::Fr(value));
            }
            if let Some(value) = token.strip_suffix("px") {
                let value = value.parse::<f64>().ok()?;
                return (value >= 0.0).then_some(NativeTrack::Points(value));
            }
            None
        })
        .collect();
    tracks.filter(|tracks| !tracks.is_empty())
}

fn condition_contains(condition: &Condition, predicate: impl Fn(&Condition) -> bool + Copy) -> bool {
    predicate(condition)
        || matches!(condition, Condition::All(conditions) if conditions.iter().any(|condition| condition_contains(condition, predicate)))
}

fn native_driver_transition(
    node: &Node,
    declarations: &[StyleDeclaration],
) -> Option<(u32, &'static str, bool, bool, bool)> {
    if !matches!(node.primitive, Primitive::Pressable | Primitive::Button) {
        return None;
    }
    let interactive = |property: fn(&StyleProperty) -> bool| {
        declarations.iter().any(|declaration| {
            property(&declaration.property)
                && condition_contains(&declaration.condition, |condition| {
                matches!(condition, Condition::Hover | Condition::Focus | Condition::FocusVisible | Condition::Pressed)
            })
        })
    };
    let interactive_opacity = interactive(|property| matches!(property, StyleProperty::Opacity(_)));
    let interactive_transform = interactive(|property| matches!(
        property,
        StyleProperty::TranslateX(_)
            | StyleProperty::TranslateY(_)
            | StyleProperty::Rotate(_)
            | StyleProperty::RotateX(_)
            | StyleProperty::RotateY(_)
            | StyleProperty::RotateZ(_)
            | StyleProperty::ScaleX(_)
            | StyleProperty::ScaleY(_)
    ));
    let has_base_text_color = declarations.iter().any(|declaration| {
        matches!(declaration.property, StyleProperty::TextColor(_))
            && matches!(declaration.condition, Condition::Always)
    });
    let interactive_colors = interactive(|property| matches!(property, StyleProperty::BackgroundColor(_)))
        || (has_base_text_color
            && interactive(|property| matches!(property, StyleProperty::TextColor(_))));
    if !interactive_opacity && !interactive_transform && !interactive_colors {
        return None;
    }
    let properties = declarations.iter().rev().find_map(|declaration| match &declaration.property {
        StyleProperty::TransitionProperty(properties) => Some(properties.as_str()),
        _ => None,
    })?;
    if properties == "none" {
        return None;
    }
    let includes = |wanted: &[&str]| {
        properties == "all"
            || properties.split(',').any(|property| wanted.contains(&property.trim()))
    };
    let opacity = interactive_opacity && includes(&["opacity"]);
    let transform = interactive_transform && includes(&["transform", "translate", "scale", "rotate"]);
    let colors = interactive_colors && includes(&["color", "background-color"]);
    if !opacity && !transform && !colors { return None; }
    let duration = declarations.iter().rev().find_map(|declaration| match declaration.property {
        StyleProperty::TransitionDuration(duration, _) => Some(duration),
        _ => None,
    }).unwrap_or(150);
    let timing = declarations.iter().rev().find_map(|declaration| match &declaration.property {
        StyleProperty::TransitionTimingFunction(timing, _) => Some(timing.as_str()),
        _ => None,
    }).unwrap_or("cubic-bezier(0.4, 0, 0.2, 1)");
    let easing = match timing {
        "linear" => "linear",
        "cubic-bezier(0.4, 0, 1, 1)" => "ease-in",
        "cubic-bezier(0, 0, 0.2, 1)" => "ease-out",
        _ => "ease-in-out",
    };
    Some((duration, easing, opacity, transform, colors))
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
mod tests {
    use super::*;

    const LOGIN_EXAMPLE: &str = r#"
import { View, Text, Button } from '@hozo/core'

export function Login() {
  return (
    <View className="flex-1 items-center justify-center p-6">
      <Text className="text-xl font-bold">
        Welcome
      </Text>

      <Button className="mt-4 px-4 py-2">
        Continue
      </Button>
    </View>
  )
}
"#;

    #[test]
    fn lowers_the_login_example_to_rn_jsx_and_styles() {
        let parsed = hozo_parser::parse_tsx(LOGIN_EXAMPLE);
        let root = &parsed.roots[0].node;
        let output = lower(root, LOGIN_EXAMPLE, &Theme::default());

        assert!(output.jsx.starts_with("<View style={hozoStyles.hozo0}>"));
        assert!(output.jsx.contains("<Text style={hozoStyles.hozo1}>Welcome</Text>"));
        // The label is wrapped: React Native crashes on a raw string inside
        // a Pressable, even though the same source is fine on Web.
        assert!(output.jsx.contains(
            r#"<Pressable style={hozoStyles.hozo2} accessibilityRole="button"><Text>Continue</Text></Pressable>"#
        ));

        assert!(output.styles.contains("hozo0: {"));
        assert!(output.styles.contains("flex: 1,"));
        assert!(output.styles.contains("paddingTop: 24,"));
        assert!(output.styles.contains("hozo1: {"));
        assert!(output.styles.contains("fontSize: 20,"));
        assert!(output.styles.contains("fontWeight: '700',"));
        assert!(output.styles.contains("hozo2: {"));
        // `px-4` is Tailwind's logical inline axis, so this lowers to RN's
        // direction-relative props rather than paddingLeft/paddingRight.
        assert!(output.styles.contains("paddingStart: 16,"));
        assert!(output.styles.contains("paddingEnd: 16,"));
        // No `px`/CSS units anywhere -- these are unitless RN numbers.
        assert!(!output.styles.contains("px"));

        assert!(output.diagnostics.is_empty());
    }

    #[test]
    fn disabled_condition_merges_into_a_conditional_style_array_when_a_disabled_prop_exists() {
        let source = r#"
            import { Button } from '@hozo/core'
            const el = <Button disabled={isLoading} className="p-2 disabled:opacity-50">Save</Button>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.styles.contains("hozo0_disabled: {"));
        assert!(output.styles.contains("opacity: 0.5,"));
        assert!(output.jsx.contains("style={[hozoStyles.hozo0, (isLoading) && hozoStyles.hozo0_disabled]}"));
        assert!(output.jsx.contains("disabled={isLoading}"));
    }

    #[test]
    fn boolean_disabled_drives_its_conditional_style() {
        let source = r#"
            import { Button } from '@hozo/core'
            const el = <Button disabled className="p-2 disabled:opacity-50">Save</Button>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(output.jsx.contains("disabled={true}"), "{}", output.jsx);
        assert!(output.jsx.contains("(true) && hozoStyles.hozo0_disabled"), "{}", output.jsx);
    }

    #[test]
    fn unmodeled_props_and_spreads_reach_the_output() {
        let source = r#"
            import { View } from '@hozo/core'
            const el = <View className="p-4" {...rest} onLayout={onLayout} testID="row" />
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(output.jsx.contains("{...rest}"));
        assert!(output.jsx.contains("onLayout={onLayout}"));
        assert!(output.jsx.contains(r#"testID={"row"}"#));
    }

    #[test]
    fn universal_props_keep_their_native_contract() {
        let source = r#"
            import { ScrollView } from '@hozo/core'
            const el = <ScrollView testID="feed" nativeID="feed-view" pointerEvents="auto"
              accessibilityState={{ busy }} accessibilityValue={{ now: progress }}
              accessibilityLiveRegion="polite" onLayout={measure}
              onScroll={remember} scrollEventThrottle={16} />
        "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        for expected in [
            r#"testID={"feed"}"#,
            r#"nativeID={"feed-view"}"#,
            r#"pointerEvents={"auto"}"#,
            "accessibilityState={{ busy }}",
            "accessibilityValue={{ now: progress }}",
            r#"accessibilityLiveRegion={"polite"}"#,
            "onLayout={measure}",
            "onScroll={remember}",
            "scrollEventThrottle={16}",
        ] {
            assert!(output.jsx.contains(expected), "missing {expected}: {}", output.jsx);
        }
    }

    #[test]
    fn responder_callbacks_keep_the_react_native_contract() {
        let source = r#"
            import { View } from '@hozo/core'
            const el = <View onStartShouldSetResponder={wantStart}
              onStartShouldSetResponderCapture={captureStart}
              onMoveShouldSetResponder={wantMove}
              onMoveShouldSetResponderCapture={captureMove}
              onResponderGrant={grant} onResponderStart={start}
              onResponderMove={move} onResponderEnd={end}
              onResponderRelease={release} onResponderReject={reject}
              onResponderTerminate={terminate}
              onResponderTerminationRequest={allowTermination} />
        "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        for expected in [
            "onStartShouldSetResponder={wantStart}",
            "onStartShouldSetResponderCapture={captureStart}",
            "onMoveShouldSetResponder={wantMove}",
            "onMoveShouldSetResponderCapture={captureMove}",
            "onResponderGrant={grant}",
            "onResponderStart={start}",
            "onResponderMove={move}",
            "onResponderEnd={end}",
            "onResponderRelease={release}",
            "onResponderReject={reject}",
            "onResponderTerminate={terminate}",
            "onResponderTerminationRequest={allowTermination}",
        ] {
            assert!(output.jsx.contains(expected), "missing {expected}: {}", output.jsx);
        }
        assert!(output.runtime_imports.is_empty(), "{:?}", output.runtime_imports);
    }

    #[test]
    fn image_default_source_uses_the_same_native_normalizer() {
        let source = r#"
            import { Image } from '@hozo/core'
            const el = <Image src={remote} defaultSource={require('./fallback.png')} alt="Cover" />
        "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(output.jsx.contains("source={hozoImageSource(remote)}"), "{}", output.jsx);
        assert!(output.jsx.contains("defaultSource={hozoImageSource(require('./fallback.png'))}"), "{}", output.jsx);
        assert!(output.runtime_imports.contains(&"hozoImageSource"));
    }

    #[test]
    fn pressed_condition_wraps_style_in_rn_pressable_render_prop() {
        let source = r#"
            import { Button } from '@hozo/core'
            const el = <Button className="p-2 pressed:opacity-50">Save</Button>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.styles.contains("hozo0_pressed: {"));
        assert!(output.styles.contains("opacity: 0.5,"));
        assert!(output.jsx.contains("style={({ pressed }) => [hozoStyles.hozo0, pressed && hozoStyles.hozo0_pressed]}"));
    }

    #[test]
    fn pressed_condition_stays_unmerged_on_view_since_style_cannot_be_a_function_there() {
        let source = r#"
            import { View } from '@hozo/core'
            const el = <View className="p-2 pressed:opacity-50" />
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.styles.contains("hozo0_pressed: {"));
        assert!(output.jsx.contains("style={hozoStyles.hozo0}"));
        assert!(!output.jsx.contains("pressed"));
    }

    #[test]
    fn disabled_condition_stays_unmerged_without_a_disabled_prop() {
        // Nothing drives "disabled-ness" here -- the className has a
        // disabled: variant but the component never actually received a
        // `disabled` prop, so there's no guard to merge with. Computed,
        // not silently dropped, but also not merged into anything.
        let source = r#"
            import { View } from '@hozo/core'
            const el = <View className="disabled:opacity-50" />
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(output.styles.contains("hozo0_disabled: {"));
        assert!(!output.jsx.contains("hozo0_disabled"));
    }

    #[test]
    fn dynamic_class_name_guard_merges_into_the_style_array() {
        // A layout utility rather than `text-xl`: text styles are handed
        // down to children now, and a View with none has nowhere to put
        // them -- which would make this test about that instead of about
        // the guard it is checking.
        let source = r#"
            import { View } from '@hozo/core'
            import { cn } from 'clsx'
            const el = <View className={cn('p-4', active && 'p-8')} />
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(output.jsx.contains("style={[hozoStyles.hozo0, (active) && hozoStyles.hozo0_cond_"));
    }

    #[test]
    fn hover_and_focus_still_do_not_merge_into_anything() {
        // No RN mechanism for either (see module docs) -- still computed,
        // still not merged, unlike Disabled/Expr which now are.
        let node = hozo_ir::Node {
            primitive: hozo_ir::Primitive::View,
            style: vec![
                hozo_ir::StyleDeclaration {
                    property: hozo_ir::StyleProperty::Opacity(1.0),
                    condition: hozo_ir::Condition::Always,
                },
                hozo_ir::StyleDeclaration {
                    property: hozo_ir::StyleProperty::Opacity(0.5),
                    condition: hozo_ir::Condition::Hover,
                },
            ],
            props: hozo_ir::PropSet::default(),
            children: Vec::new(),
            class_name_fallback: Vec::new(),
            carried_classes: Vec::new(),
            span: hozo_ir::SourceSpan { start: 0, end: 0 },
        };
        let output = lower(&node, "", &Theme::default());
        assert!(output.jsx.contains("style={hozoStyles.hozo0}"));
        assert!(output.styles.contains("hozo0_hover: {"));
        assert!(!output.jsx.contains("hozo0_hover"));
    }

    #[test]
    fn transforms_compose_into_rn_single_transform_array() {
        // RN has no standalone rotate/scale/translate, so several IR
        // properties collapse into one entry -- ordered translate, rotate,
        // scale to match how CSS applies its standalone equivalents.
        let source = r#"
            import { View } from '@hozo/core'
            const el = <View className="scale-95 rotate-45 translate-x-2" />
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(output.styles.contains(
            "transform: [{ translateX: 8 }, { rotate: '45deg' }, { scale: 0.95 }],"
        ));
        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);

        let explicit_z = r#"
            import { View } from '@hozo/core'
            const el = <View className="scale-z-95" />
            "#;
        let parsed = hozo_parser::parse_tsx(explicit_z);
        let output = lower(&parsed.roots[0].node, explicit_z, &Theme::default());
        assert!(output.styles.contains(
            "transform: [{ matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0.95, 0, 0, 0, 0, 1] }],"
        ));
        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);

        let all_axes = r#"
            import { View } from '@hozo/core'
            const el = <View className="scale-x-50 scale-y-75 scale-z-95" />
            "#;
        let parsed = hozo_parser::parse_tsx(all_axes);
        let output = lower(&parsed.roots[0].node, all_axes, &Theme::default());
        assert!(output.styles.contains(
            "transform: [{ scaleX: 0.5 }, { scaleY: 0.75 }, { matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0.95, 0, 0, 0, 0, 1] }],"
        ));
        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    }

    #[test]
    fn shadow_and_filter_carry_across_as_strings() {
        let source = r#"
            import { View } from '@hozo/core'
            const el = <View className="shadow-lg blur-sm" />
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(output.styles.contains("boxShadow: '0 10px 15px -3px"));
        assert!(output.styles.contains("filter: 'blur(8px)',"));
    }

    #[test]
    fn inline_flex_lowers_to_a_shrink_wrapped_flex_container() {
        let source = r#"
            import { View } from '@hozo/core'
            const el = <View className="inline-flex" />
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(output.styles.contains("display: 'flex',"), "{}", output.styles);
        assert!(output.styles.contains("alignSelf: 'flex-start',"), "{}", output.styles);
    }

    #[test]
    fn inline_flex_never_overrides_an_authored_align_self() {
        let source = r#"
            import { View } from '@hozo/core'
            const el = <View className="self-center md:inline-flex" />
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(output.styles.contains("alignSelf: 'center',"), "{}", output.styles);
        assert!(!output.styles.contains("alignSelf: 'flex-start',"), "{}", output.styles);
        assert!(output.styles.contains("display: 'flex',"), "{}", output.styles);
    }

    #[test]
    fn grid_lowers_equal_tracks_and_gap_to_the_solver_boundary() {
        let source = r#"
            import { View } from '@hozo/core'
            const el = <View className="grid grid-cols-3 gap-4"><View /><View /></View>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(output.runtime_imports.contains(&"HozoGrid"));
        assert!(output.jsx.contains("<HozoGrid tracks={[{ kind: 'fr', value: 1 }, { kind: 'fr', value: 1 }, { kind: 'fr', value: 1 }]} columnGap={16} rowGap={16}>"), "{}", output.jsx);
        assert!(output.styles.contains("gap: 16,"), "{}", output.styles);
    }

    #[test]
    fn grid_accepts_simple_unequal_fr_and_fixed_tracks_without_measurement() {
        let source = r#"
            import { View } from '@hozo/core'
            const el = <View className="grid grid-cols-[120px_2fr_1fr]"><View /></View>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(output.jsx.contains("{ kind: 'points', value: 120 }"), "{}", output.jsx);
        assert!(output.jsx.contains("{ kind: 'fr', value: 2 }"), "{}", output.jsx);
        assert!(output.jsx.contains("{ kind: 'fr', value: 1 }"), "{}", output.jsx);
    }

    #[test]
    fn grid_accepts_fixed_minimum_fractional_tracks_without_measurement() {
        let source = r#"
            import { View } from '@hozo/core'
            const el = <View className="grid grid-cols-[minmax(120px,2fr)_1fr]"><View /></View>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(output.jsx.contains("{ kind: 'minmax', min: 120, value: 2 }"), "{}", output.jsx);
        assert!(output.jsx.contains("{ kind: 'fr', value: 1 }"), "{}", output.jsx);
    }

    #[test]
    fn grid_column_span_is_passed_to_the_auto_placer() {
        let source = r#"
            import { View } from '@hozo/core'
            const el = <View className="grid grid-cols-3"><View className="col-span-2" /><View /></View>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(output.jsx.contains("<HozoGridItem columnSpan={2}><View"), "{}", output.jsx);
        assert!(output.runtime_imports.contains(&"HozoGridItem"));
    }

    #[test]
    fn grid_column_lines_become_zero_based_placer_coordinates() {
        let source = r#"
            import { View } from '@hozo/core'
            const el = <View className="grid grid-cols-3"><View className="col-start-2 col-end-4" /></View>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(
            output.jsx.contains("<HozoGridItem columnSpan={2} columnStart={1}>"),
            "{}",
            output.jsx
        );
    }

    #[test]
    fn grid_row_span_selects_the_measured_placer_path() {
        let source = r#"
            import { View } from '@hozo/core'
            const el = <View className="grid grid-cols-2 gap-2"><View className="row-span-2" /><View /><View /></View>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(output.jsx.contains("rowSpan={2}"), "{}", output.jsx);
        assert!(output.jsx.contains("rowGap={8}"), "{}", output.jsx);
    }

    #[test]
    fn explicit_grid_rows_resolve_full_row_spans() {
        let source = r#"
            import { View } from '@hozo/core'
            const el = <View className="grid grid-cols-2 grid-rows-3"><View className="row-span-full" /></View>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(output.jsx.contains("rowTracks={[{ kind: 'fr', value: 1 }, { kind: 'fr', value: 1 }, { kind: 'fr', value: 1 }]}"), "{}", output.jsx);
        assert!(output.jsx.contains("rowSpan={3} rowStart={0}"), "{}", output.jsx);
        assert_eq!(resolve_row_line(GridLine::Line(-1), Some(3)), Some(3));
        assert_eq!(resolve_row_line(GridLine::Line(-2), Some(3)), Some(2));
        assert_eq!(resolve_row_line(GridLine::Line(-1), None), None);
    }

    #[test]
    fn grid_declines_tracks_that_need_the_future_measured_solver() {
        let source = r#"
            import { View } from '@hozo/core'
            const el = <View className="grid grid-cols-[auto_1fr]" />
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(!output.diagnostics.is_empty());
        assert!(!output.runtime_imports.contains(&"HozoGrid"));
    }

    #[test]
    fn responsive_grid_tracks_and_gaps_reuse_breakpoint_hooks() {
        let source = r#"
            import { View } from '@hozo/core'
            function Cards() {
              return <View className="grid grid-cols-1 gap-2 md:grid-cols-3 md:gap-4 lg:grid-cols-4"><View /><View /></View>
            }
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(output.jsx.contains("tracks={__hozoBp_lg ?"), "{}", output.jsx);
        assert!(output.jsx.contains("__hozoBp_md ?"), "{}", output.jsx);
        assert!(output.jsx.contains("columnGap={__hozoBp_md ? 16 : (8)}"), "{}", output.jsx);
        assert!(output.jsx.contains("rowGap={__hozoBp_md ? 16 : (8)}"), "{}", output.jsx);
        assert!(output.prelude.contains(&"const __hozoBp_md = useHozoBreakpoint('md')".to_string()));
        assert!(output.prelude.contains(&"const __hozoBp_lg = useHozoBreakpoint('lg')".to_string()));
    }

    #[test]
    fn block_restores_a_hidden_yoga_node_as_a_flex_container() {
        let source = r#"
            import { View } from '@hozo/core'
            const el = <View className="hidden md:block" />
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(output.styles.contains("display: 'none',"), "{}", output.styles);
        assert!(output.styles.contains("hozo0_md:"), "{}", output.styles);
        assert_eq!(output.styles.matches("display: 'flex',").count(), 1, "{}", output.styles);
    }

    /// Every variant that can't reach the `style` prop, with the severity
    /// it should report. Until 2026-08-15 all of these produced a
    /// StyleSheet entry the JSX never referenced, and said nothing -- the
    /// conformance suite scored them covered because the entry existed.
    #[test]
    fn no_variant_is_dropped_without_saying_so() {
        let cases: &[(&str, hozo_ir::Severity)] = &[
            // Real on pointer/desktop targets, but a bare View has no
            // interaction wrapper to drive either state.
            ("hover:bg-blue-500", hozo_ir::Severity::Error),
            ("focus:p-4", hozo_ir::Severity::Error),
            // Undecidable position, so nothing can resolve it here.
            ("first:mt-0", hozo_ir::Severity::Error),
            // Nothing on a bare View drives these at all.
            ("disabled:p-4", hozo_ir::Severity::Error),
            ("pressed:p-4", hozo_ir::Severity::Error),
        ];

        for (candidate, severity) in cases {
            let source = format!(
                "import {{ View }} from '@hozo/core'\nconst el = <View className=\"{candidate}\" />\n"
            );
            let parsed = hozo_parser::parse_tsx(&source);
            let output = lower(&parsed.roots[0].node, &source, &Theme::default());

            let reported: Vec<_> = output
                .diagnostics
                .iter()
                .filter(|d| d.code == hozo_ir::DiagnosticCode::NotWiredOnNative)
                .collect();
            assert_eq!(reported.len(), 1, "{candidate}: {:?}", output.diagnostics);
            assert_eq!(reported[0].severity, *severity, "{candidate}");
        }
    }

    #[test]
    fn ambient_conditions_compile_to_a_hook_the_caller_must_splice() {
        // `dark:` and the breakpoints are the same value app-wide at any
        // moment, so `@hozo/runtime` keeps one subscription for the whole
        // app; the hook exists only to re-render *this* component when it
        // changes. The declaration is returned rather than inlined into
        // the JSX -- a hook inside `style={[a, useHozoDark() && b]}`
        // breaks the rules of hooks as soon as the element sits behind a
        // conditional.
        let source = r#"
            import { View } from '@hozo/core'
            const el = <View className="p-4 dark:bg-black md:flex-row" />
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert_eq!(
            output.prelude,
            vec![
                "const __hozoDark = useHozoDark()",
                "const __hozoBp_md = useHozoBreakpoint('md')",
            ]
        );
        assert_eq!(output.runtime_imports, vec!["useHozoDark", "useHozoBreakpoint"]);
        assert!(output.jsx.contains("__hozoDark && hozoStyles.hozo0_dark"), "{}", output.jsx);
        assert!(output.jsx.contains("__hozoBp_md && hozoStyles.hozo0_md"), "{}", output.jsx);
    }

    #[test]
    fn supported_stacked_variants_and_their_guards_together() {
        let source = r#"
            import { View, Pressable } from '@hozo/core'
            const el = (
              <View className="md:dark:p-4">
                <Pressable className="disabled:pressed:opacity-50" disabled={isOff}
                  accessibilityRole="button">Save</Pressable>
              </View>
            )
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(
            output
                .jsx
                .contains("__hozoBp_md && __hozoDark && hozoStyles.hozo0_md_dark"),
            "{}",
            output.jsx
        );
        assert!(
            output
                .jsx
                .contains("(isOff) && pressed && hozoStyles.hozo1_disabled_pressed"),
            "{}",
            output.jsx
        );
        assert_eq!(
            output.prelude,
            vec![
                "const __hozoBp_md = useHozoBreakpoint('md')",
                "const __hozoDark = useHozoDark()",
            ]
        );
    }

    #[test]
    fn pressable_hover_and_focus_use_the_interaction_wrapper() {
        let source = r#"
            import { Pressable } from '@hozo/core'
            const el = (
              <Pressable className="hover:bg-blue-500 focus:p-4 pressed:opacity-50"
                onHoverIn={noticeHover} onFocus={noticeFocus}
                accessibilityRole="button">Save</Pressable>
            )
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(output.jsx.starts_with("<HozoPressable"), "{}", output.jsx);
        assert!(!output.jsx.contains("hozoFocusVisible"), "{}", output.jsx);
        assert!(
            output.jsx.contains("({ pressed, hovered, focused }) =>"),
            "{}",
            output.jsx
        );
        assert!(output.jsx.contains("hovered && hozoStyles.hozo0_hover"), "{}", output.jsx);
        assert!(output.jsx.contains("focused && hozoStyles.hozo0_focus"), "{}", output.jsx);
        assert!(output.jsx.contains("pressed && hozoStyles.hozo0_pressed"), "{}", output.jsx);
        assert!(output.jsx.contains("onHoverIn={noticeHover}"), "{}", output.jsx);
        assert!(output.jsx.contains("onFocus={noticeFocus}"), "{}", output.jsx);
        assert!(output.runtime_imports.contains(&"HozoPressable"));
    }

    #[test]
    fn focus_visible_uses_pressable_input_modality_state() {
        let source = r#"
            import { Pressable } from '@hozo/core'
            function Save() {
              return <Pressable className="opacity-100 focus-visible:opacity-50 md:focus-visible:p-4"
                accessibilityRole="button">Save</Pressable>
            }
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(output.jsx.starts_with("<HozoPressable"), "{}", output.jsx);
        assert!(output.jsx.contains("hozoFocusVisible"), "{}", output.jsx);
        assert!(output.jsx.contains("{ pressed, hovered, focused, focusVisible }"), "{}", output.jsx);
        assert!(output.jsx.contains("focusVisible && hozoStyles.hozo0_focusvisible"), "{}", output.jsx);
        assert!(output.jsx.contains("__hozoBp_md && focusVisible &&"), "{}", output.jsx);
    }

    #[test]
    fn interactive_opacity_transition_uses_the_native_driver_config() {
        let source = r#"
            import { Pressable } from '@hozo/core'
            const el = (
              <Pressable className="opacity-100 transition duration-200 ease-in-out hover:opacity-50"
                accessibilityRole="button">Save</Pressable>
            )
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(output.jsx.starts_with("<HozoPressable"), "{}", output.jsx);
        assert!(
            output.jsx.contains("hozoTransition={{ duration: 200, easing: 'ease-in-out', opacity: true, transform: false, colors: false }}"),
            "{}",
            output.jsx
        );
        assert!(output.jsx.contains("hovered && hozoStyles.hozo0_hover"), "{}", output.jsx);
    }

    #[test]
    fn interactive_color_transition_uses_the_js_driver_config() {
        let source = r#"
            import { Pressable } from '@hozo/core'
            const el = (
              <Pressable className="bg-white text-gray-500 transition duration-200 hover:bg-blue-500 focus:bg-red-500 hover:text-blue-500"
                accessibilityRole="button">Save</Pressable>
            )
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(output.jsx.contains("colors: true"), "{}", output.jsx);
        assert!(output.jsx.contains("<HozoText style={({ pressed, hovered, focused }) =>"), "{}", output.jsx);
        assert!(output.runtime_imports.contains(&"HozoText"));
    }

    #[test]
    fn explicit_text_inherits_the_pressables_animated_color_state() {
        let source = r#"
            import { Pressable, Text } from '@hozo/core'
            const el = (
              <Pressable className="text-gray-500 transition hover:text-blue-500"
                accessibilityRole="button"><Text>Save</Text></Pressable>
            )
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(output.jsx.contains("<HozoText style={({ pressed, hovered, focused }) =>"), "{}", output.jsx);
    }

    #[test]
    fn interactive_transform_transition_stays_on_the_native_driver() {
        let source = r#"
            import { Pressable } from '@hozo/core'
            const el = (
              <Pressable className="transition duration-200 hover:scale-95 focus:translate-x-2 hover:rotate-45"
                accessibilityRole="button">Save</Pressable>
            )
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(
            output.jsx.contains("opacity: false, transform: true"),
            "{}",
            output.jsx
        );
    }

    #[test]
    fn hover_composes_with_an_ambient_guard_on_pressable() {
        let source = r#"
            import { Button } from '@hozo/core'
            const el = <Button className="md:hover:bg-blue-500">Save</Button>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(output.jsx.starts_with("<HozoPressable"), "{}", output.jsx);
        assert!(
            output
                .jsx
                .contains("__hozoBp_md && hovered && hozoStyles.hozo0_md_hover"),
            "{}",
            output.jsx
        );
    }

    #[test]
    fn stacked_structural_variants_are_resolved_before_runtime_guards() {
        let source = r#"
            import { View, Text } from '@hozo/core'
            const el = (
              <View>
                <Text className="first:md:mt-0">a</Text>
                <Text className="first:md:mt-0">b</Text>
              </View>
            )
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(
            output.jsx.contains("__hozoBp_md && hozoStyles.hozo1_first_md"),
            "{}",
            output.jsx
        );
        assert!(!output.jsx.contains("hozoStyles.hozo2_first_md"), "{}", output.jsx);
    }

    #[test]
    fn one_hook_declaration_however_many_elements_guard_on_it() {
        // Two calls would redeclare the binding and change the hook order
        // between renders.
        let source = r#"
            import { View, Text } from '@hozo/core'
            const el = (
              <View className="dark:bg-black">
                <Text className="dark:text-white">a</Text>
              </View>
            )
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert_eq!(output.prelude, vec!["const __hozoDark = useHozoDark()"]);
    }

    #[test]
    fn a_conditional_style_outranks_the_base_whatever_order_it_was_written_in() {
        // Web settles this by specificity: `.hozo-0:disabled` (0,2,0)
        // beats `.hozo-0` (0,1,0) regardless of which rule comes first. A
        // React Native style array only resolves last-wins, so position has
        // to stand in for specificity -- otherwise `disabled:p-8 p-4`
        // renders p-8 on Web and p-4 on device.
        let source = r#"
            import { Pressable } from '@hozo/core'
            const el = (
              <Pressable className="disabled:p-8 p-4" disabled={off}
                accessibilityRole="button">x</Pressable>
            )
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        let base = output.jsx.find("hozoStyles.hozo0,").expect("base style");
        let conditional = output.jsx.find("hozoStyles.hozo0_disabled").expect("conditional style");
        assert!(base < conditional, "{}", output.jsx);
    }

    #[test]
    fn first_child_is_decided_at_compile_time() {
        // Web asks `:first-child` at match time; here the compiler is
        // looking straight at the JSX tree and already knows. Both answers
        // are exact, so neither reports anything.
        let source = r#"
            import { View, Text } from '@hozo/core'
            const el = (
              <View>
                <Text className="first:mt-0">a</Text>
                <Text className="first:mt-0">b</Text>
              </View>
            )
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        // The first child gets it applied unconditionally...
        assert!(output.jsx.contains("hozoStyles.hozo1_first"), "{}", output.jsx);
        // ...and the second doesn't get one at all, which is exactly what
        // `:first-child` would do.
        assert!(!output.jsx.contains("hozoStyles.hozo2_first"), "{}", output.jsx);
    }

    /// Compiles one tree and returns its JSX.
    fn native_jsx(source: &str) -> LowerOutput {
        let parsed = hozo_parser::parse_tsx(source);
        lower(&parsed.roots[0].node, source, &Theme::default())
    }

    #[test]
    fn a_style_for_the_children_is_handed_to_each_of_them() {
        // React Native has no selector, so the parent cannot say
        // "my children". The compiler is looking at those children, which
        // is what makes this answerable at all -- the same trade `first:`
        // and `odd:` already make.
        let output = native_jsx(
            r#"
            import { View, Text } from '@hozo/core'
            const el = (
              <View className="*:mt-2">
                <Text>a</Text>
                <Text>b</Text>
              </View>
            )
            "#,
        );
        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        // On the children, and not on the parent.
        assert!(output.jsx.contains("hozo1"), "{}", output.jsx);
        assert!(output.jsx.contains("hozo2"), "{}", output.jsx);
        assert!(output.styles.contains("marginTop: 8"), "{}", output.styles);
    }

    #[test]
    fn a_direct_child_style_stops_at_the_children_and_a_descendant_one_does_not() {
        let source = r#"
            import { View, Text } from '@hozo/core'
            const el = (
              <View className="CLASS">
                <View>
                  <Text>deep</Text>
                </View>
              </View>
            )
            "#;
        // `*:` reaches the inner View and stops.
        let direct = native_jsx(&source.replace("CLASS", "*:mt-2"));
        assert_eq!(direct.styles.matches("marginTop: 8").count(), 1, "{}", direct.styles);
        // `**:` reaches the inner View *and* the Text below it.
        let all = native_jsx(&source.replace("CLASS", "**:mt-2"));
        assert_eq!(all.styles.matches("marginTop: 8").count(), 2, "{}", all.styles);
    }

    #[test]
    fn which_element_the_condition_is_about_survives_the_handing_down() {
        // The half of this that a selector states and a style object
        // cannot. `md:*:` is answerable because a breakpoint is a hook
        // declared once for the component, so a child reads the same
        // binding. `hover:*:` is not: that is the parent's own state, and
        // handing it down would silently turn it into `*:hover:`, which is
        // a different rule.
        let source = r#"
            import { View, Text } from '@hozo/core'
            const el = <View className="CLASS"><Text>a</Text></View>
            "#;
        let responsive = native_jsx(&source.replace("CLASS", "md:*:mt-2"));
        assert!(responsive.diagnostics.is_empty(), "{:?}", responsive.diagnostics);
        assert!(responsive.jsx.contains("__hozoBp_md"), "{}", responsive.jsx);

        let hovered = native_jsx(&source.replace("CLASS", "hover:*:mt-2"));
        assert_eq!(hovered.diagnostics.len(), 1, "{:?}", hovered.diagnostics);
        assert!(
            hovered.diagnostics[0].message.contains("hand an element's own state down"),
            "{}",
            hovered.diagnostics[0].message,
        );

        // And the other order is the children's own state, which needs
        // nothing from the parent.
        let child_hover = native_jsx(&source.replace("CLASS", "*:hover:mt-2"));
        assert!(
            !child_hover.diagnostics.iter().any(|d| d.message.contains("own state down")),
            "{:?}",
            child_hover.diagnostics,
        );
    }

    #[test]
    fn a_child_the_compiler_cannot_read_is_named_rather_than_skipped() {
        // "Every child" reaching some of them is the divergence worth a
        // build message: the selector reaches all of them on Web.
        let output = native_jsx(
            r#"
            import { View, Text } from '@hozo/core'
            const el = (
              <View className="*:mt-2">
                <Text>a</Text>
                {items.map((i) => <Text key={i}>x</Text>)}
              </View>
            )
            "#,
        );
        assert!(
            output.diagnostics.iter().any(|d| d.message.contains("doesn't read")),
            "{:?}",
            output.diagnostics,
        );
    }

    #[test]
    fn the_elements_own_style_wins_over_what_it_was_handed() {
        // Last-wins, which is where CSS specificity lands too.
        let output = native_jsx(
            r#"
            import { View, Text } from '@hozo/core'
            const el = <View className="*:mt-2"><Text className="mt-8">a</Text></View>
            "#,
        );
        assert!(output.styles.contains("marginTop: 32"), "{}", output.styles);
        assert!(!output.styles.contains("marginTop: 8"), "{}", output.styles);
    }

    #[test]
    fn a_container_measures_itself_and_its_subtree_reads_the_width() {
        // The one width the runtime cannot already know. A window has one
        // and `useHozoViewport` reports it; a container's is whatever
        // layout gave that element, so the element has to say.
        let source = r#"
            import { View, Text } from '@hozo/core'
            const el = (
              <View className="@container">
                <Text className="@sm:mt-0">a</Text>
              </View>
            )
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(output.jsx.starts_with("<HozoContainer"), "{}", output.jsx);
        // A render prop, because the querying element is in the same
        // component as the container and a hook there would read the
        // context from outside the provider.
        assert!(output.jsx.contains("<HozoContainerQuery>{(__hozoCq) =>"), "{}", output.jsx);
        assert!(output.jsx.contains(r#"__hozoCq[""] >= 384"#), "{}", output.jsx);
    }

    #[test]
    fn no_container_in_scope_matches_nothing_in_either_direction() {
        // CSS says a query with no container matches nothing at all, so
        // the guard tests for a width before comparing one -- otherwise
        // `@max-md:` would fire on every element that has no container,
        // which is the majority of them.
        let source = r#"
            import { Text } from '@hozo/core'
            const el = <Text className="@max-md:mt-0">a</Text>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(output.jsx.contains(r#"__hozoCq[""] !== undefined"#), "{}", output.jsx);
    }

    #[test]
    fn a_named_container_answers_under_its_name_and_the_nearest_one() {
        let source = r#"
            import { View, Text } from '@hozo/core'
            const el = (
              <View className="@container/main">
                <Text className="@sm/main:mt-0">a</Text>
              </View>
            )
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(output.jsx.contains(r#"hozoContainerName="main""#), "{}", output.jsx);
        assert!(output.jsx.contains(r#"__hozoCq["main"]"#), "{}", output.jsx);
    }

    #[test]
    fn declaring_a_container_is_not_a_style_react_native_is_asked_to_hold() {
        // `container-type` is consumed by the component, not emitted --
        // and not refused either, which it was until the component
        // existed.
        let source = r#"
            import { View } from '@hozo/core'
            const el = <View className="@container">a</View>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(!output.styles.contains("containerType"), "{}", output.styles);
        // `@container-normal` declares nothing, so it stays a View.
        let normal = r#"
            import { View } from '@hozo/core'
            const el = <View className="@container-normal">a</View>
            "#;
        let parsed = hozo_parser::parse_tsx(normal);
        let output = lower(&parsed.roots[0].node, normal, &Theme::default());
        assert!(output.jsx.starts_with("<View"), "{}", output.jsx);
    }

    #[test]
    fn an_arbitrary_width_gets_its_own_hook_and_max_reuses_it() {
        // The buckets are the five named breakpoints and this is not one
        // of them, so it needs a threshold of its own. `max-` is the same
        // question from the other side, so it is that hook negated rather
        // than a second one.
        let source = r#"
            import { View } from '@hozo/core'
            const el = <View className="min-[500px]:p-4 max-md:m-2">x</View>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(output.prelude.iter().any(|line| line.contains("useHozoWidthAtLeast(500)")));
        assert!(output.prelude.iter().any(|line| line.contains("useHozoWidthAtLeast(768)")));
        assert!(output.jsx.contains("__hozoWidth_500 &&"), "{}", output.jsx);
        assert!(output.jsx.contains("!__hozoWidth_768 &&"), "{}", output.jsx);
    }

    #[test]
    fn a_threshold_react_native_cannot_resolve_is_named() {
        // `rem` has no root font size on a device and a viewport unit
        // compared against the viewport answers itself. Guessing 16px per
        // rem would disagree with the browser for anyone who changed their
        // font size, which is the reader this project is for.
        let source = r#"
            import { View } from '@hozo/core'
            const el = <View className="min-[40rem]:p-4">x</View>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert_eq!(output.diagnostics.len(), 1, "{:?}", output.diagnostics);
        assert!(output.diagnostics[0].message.contains("40rem"), "{}", output.diagnostics[0].message);
    }

    #[test]
    fn read_only_is_the_one_form_state_native_can_answer() {
        // React Native has the state -- under two names -- as a prop the
        // compiler is looking at, so `read-only:` resolves the same way
        // `disabled:` does rather than being reported.
        let cases = [
            (r#"<TextInput accessibilityLabel="N" readOnly className="read-only:p-4" />"#, "true"),
            (
                r#"<TextInput accessibilityLabel="N" editable={canEdit} className="read-only:p-4" />"#,
                "false",
            ),
        ];
        for (element, kind) in cases {
            let source =
                format!("import {{ TextInput }} from '@hozo/core'
const el = {element}
");
            let parsed = hozo_parser::parse_tsx(&source);
            let output = lower(&parsed.roots[0].node, &source, &Theme::default());
            assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
            assert!(output.jsx.contains("hozo0_readonly"), "{}", output.jsx);
            if kind == "true" {
                // Known at build time, so it decides the style instead of
                // guarding it -- no `true &&` in the output.
                assert!(!output.jsx.contains("true &&"), "{}", output.jsx);
            } else {
                assert!(output.jsx.contains("!(canEdit)"), "{}", output.jsx);
            }
        }
    }

    #[test]
    fn the_rest_of_the_form_states_are_named_absent() {
        // Constraint validation is a DOM feature. React Native has no
        // `required`, no `pattern`, and nothing for `:invalid` to be true
        // of -- so this is a refusal with a reason, not an unbuilt gap.
        for class_name in ["invalid:p-4", "required:p-4", "placeholder-shown:p-4"] {
            let source = format!(
                "import {{ TextInput }} from '@hozo/core'
                 const el = <TextInput accessibilityLabel=\"N\" className=\"{class_name}\" />
"
            );
            let parsed = hozo_parser::parse_tsx(&source);
            let output = lower(&parsed.roots[0].node, &source, &Theme::default());
            assert_eq!(output.diagnostics.len(), 1, "{class_name}: {:?}", output.diagnostics);
        }
    }

    #[test]
    fn the_text_input_props_come_back_exactly_as_written() {
        // Modelling a prop means both backends own it. Web needed these
        // because the DOM spells them differently; Native needs them
        // *unchanged*, and the moment they moved out of `passthrough`
        // they stopped being emitted here at all.
        let source = r#"
            import { TextInput } from '@hozo/core'
            const el = (
              <TextInput
                accessibilityLabel="Notes"
                onChangeText={handle}
                multiline
                numberOfLines={4}
                editable={canEdit}
                secureTextEntry={false}
                keyboardType="email-address"
              />
            )
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        for expected in [
            "onChangeText={handle}",
            // Bare, the way it was written and the way React Native's own
            // code reads -- not `multiline={true}`.
            " multiline",
            "numberOfLines={4}",
            "editable={canEdit}",
            "secureTextEntry={false}",
            "keyboardType=\"email-address\"",
        ] {
            assert!(output.jsx.contains(expected), "{expected} missing from {}", output.jsx);
        }
    }

    #[test]
    fn the_structural_family_is_decided_at_compile_time_too() {
        // Same trade `first:` already made, applied to the rest of the
        // family: React Native has no selector engine, but the compiler is
        // reading the tree and a sibling position is a fact about it.
        //
        // Striped rows are the reason this is worth having. `odd:bg-…` is
        // one class on Web and a manual index check in React Native.
        let source = r#"
            import { View, Text } from '@hozo/core'
            const el = (
              <View>
                <Text className="odd:mt-0">a</Text>
                <Text className="odd:mt-0">b</Text>
                <Text className="odd:mt-0">c</Text>
              </View>
            )
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(output.jsx.contains("hozo1_odd"), "{}", output.jsx);
        assert!(!output.jsx.contains("hozo2_odd"), "{}", output.jsx);
        assert!(output.jsx.contains("hozo3_odd"), "{}", output.jsx);
    }

    #[test]
    fn only_child_counts_the_siblings_rather_than_assuming_one() {
        // `:only-child` needs the total, which is a stricter question than
        // `first:` asks -- a `Verbatim` *after* this element changes the
        // answer without changing the position.
        let one = r#"
            import { View, Text } from '@hozo/core'
            const el = <View><Text className="only:mt-0">a</Text></View>
            "#;
        let two = r#"
            import { View, Text } from '@hozo/core'
            const el = <View><Text className="only:mt-0">a</Text><Text>b</Text></View>
            "#;
        for (source, applies) in [(one, true), (two, false)] {
            let parsed = hozo_parser::parse_tsx(source);
            let output = lower(&parsed.roots[0].node, source, &Theme::default());
            assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
            assert_eq!(output.jsx.contains("hozo1_only"), applies, "{}", output.jsx);
        }
    }

    #[test]
    fn empty_asks_about_this_elements_own_children() {
        // The one in the family that isn't about siblings at all.
        let childless = r#"
            import { View } from '@hozo/core'
            const el = <View><View className="empty:mt-0" /></View>
            "#;
        let occupied = r#"
            import { View, Text } from '@hozo/core'
            const el = <View><View className="empty:mt-0"><Text>a</Text></View></View>
            "#;
        for (source, applies) in [(childless, true), (occupied, false)] {
            let parsed = hozo_parser::parse_tsx(source);
            let output = lower(&parsed.roots[0].node, source, &Theme::default());
            assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
            assert_eq!(output.jsx.contains("hozo1_empty"), applies, "{}", output.jsx);
        }
    }

    #[test]
    fn of_type_is_named_absent_rather_than_answered_wrongly() {
        // React Native has no tags to count, and the tag this element
        // would have taken on Web is a lowering decision that was never
        // made here. Deciding it from the position would be a guess that
        // happens to be right whenever the siblings are homogeneous.
        let source = r#"
            import { View, Text } from '@hozo/core'
            const el = <View><Text className="first-of-type:mt-0">a</Text></View>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert_eq!(output.diagnostics.len(), 1, "{:?}", output.diagnostics);
        assert!(
            output.diagnostics[0].message.contains("first-of-type"),
            "{}",
            output.diagnostics[0].message,
        );
    }

    #[test]
    fn first_child_is_refused_when_a_sibling_is_unmodeled() {
        // `<Avatar/>` renders and occupies the first slot, but never
        // becomes a Node -- so the Text is index 0 in `children` and second
        // on screen. Deciding from that index would apply the style to the
        // wrong element, silently.
        let source = r#"
            import { View, Text } from '@hozo/core'
            const el = (
              <View>
                <Avatar />
                <Text className="first:mt-0">b</Text>
              </View>
            )
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        let reported: Vec<_> = output
            .diagnostics
            .iter()
            .filter(|d| d.code == hozo_ir::DiagnosticCode::NotWiredOnNative)
            .collect();
        assert_eq!(reported.len(), 1, "{:?}", output.diagnostics);
        assert!(reported[0].message.contains("position"), "{}", reported[0].message);
    }

    #[test]
    fn first_child_is_refused_on_a_component_root() {
        // Where this element sits is its caller's decision, not something
        // visible from here.
        let source = r#"
            import { View } from '@hozo/core'
            const el = <View className="first:mt-0" />
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(output
            .diagnostics
            .iter()
            .any(|d| d.code == hozo_ir::DiagnosticCode::NotWiredOnNative));
    }

    #[test]
    fn a_semantic_prop_the_author_already_wrote_is_not_emitted_twice() {
        // Ordinary in a React Native file, and unreachable while the
        // integrations required a rewrite to `@hozo/core`: the author sets
        // the role their own `<FlatList>` needs, and Hozo adds the same
        // one to every FlatList it lowers.
        let source = "import { FlatList } from 'react-native'
export const C = () => <FlatList accessibilityRole=\"list\" data={[]} renderItem={() => null} />
";
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        // One role, in ARIA's spelling: React Native has taken `role`
        // since 0.71, and it is the vocabulary both platforms share.
        assert_eq!(output.jsx.matches("role=").count(), 1, "{}", output.jsx);
        assert!(output.jsx.contains(r#"role="list""#), "{}", output.jsx);
    }

    #[test]
    fn the_authors_value_is_the_one_that_survives() {
        // Dropping ours rather than theirs. JSX resolves duplicates
        // last-wins and passthrough props are emitted last, so this was
        // already the effective answer -- now it is also the written one.
        let source = "import { List } from '@hozo/core'
export const C = () => <List accessibilityRole=\"menu\">x</List>
";
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(output.jsx.contains(r#"role="menu""#), "{}", output.jsx);
        assert!(!output.jsx.contains(r#""list""#), "{}", output.jsx);
    }

    #[test]
    fn a_spread_does_not_suppress_the_semantic_prop() {
        // Its contents are not knowable here, and it lands after ours --
        // so if it does carry the prop it still wins, and if it doesn't
        // the element still has its role.
        let source = "import { List } from '@hozo/core'
export const C = (p) => <List {...p}>x</List>
";
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(output.jsx.contains(r#"accessibilityRole="list""#), "{}", output.jsx);
    }

    #[test]
    fn a_wired_variant_reports_nothing() {
        // The two that do work must not have been swept up in the above.
        let source = r#"
            import { Pressable } from '@hozo/core'
            const el = (
              <Pressable className="pressed:p-4 disabled:opacity-50" disabled={isOff}
                accessibilityRole="button">x</Pressable>
            )
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(
            output.diagnostics.is_empty(),
            "{:?}",
            output.diagnostics.iter().map(|d| &d.message).collect::<Vec<_>>()
        );
        assert!(output.jsx.contains("pressed && hozoStyles."), "{}", output.jsx);
        assert!(output.jsx.contains("(isOff) && hozoStyles."), "{}", output.jsx);
    }

    #[test]
    fn an_unresolvable_class_name_is_handed_to_the_runtime_resolver() {
        // Web concatenates it back on and lets the browser's CSS engine
        // match it. RN has neither a className nor a CSS engine, so the
        // expression goes to the generated resolver instead -- warned
        // about, since only unconditional classes survive that path.
        let source = r#"
            import { View } from '@hozo/core'
            const el = <View className={classNameFromProps} />
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert_eq!(output.diagnostics.len(), 1);
        assert_eq!(
            output.diagnostics[0].code,
            hozo_ir::DiagnosticCode::DynamicClassNameNotResolved
        );
        assert_eq!(output.diagnostics[0].severity, hozo_ir::Severity::Warning);
        assert!(output.jsx.contains("hozoClasses(classNameFromProps)"), "{}", output.jsx);
    }

    #[test]
    fn the_runtime_resolved_part_comes_last_so_it_wins() {
        // `cn('p-4', getDynamic())` puts the opaque part last in the
        // source, and RN merges a style array last-wins -- so the compiled
        // styles must not be able to override it.
        let source = r#"
            import { View } from '@hozo/core'
            import { cn } from 'clsx'
            const el = <View className={cn('p-4', getDynamic())} />
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        let compiled = output.jsx.find("hozoStyles.hozo0").expect("compiled styles");
        let dynamic = output.jsx.find("hozoClasses(").expect("resolver call");
        assert!(compiled < dynamic, "{}", output.jsx);
    }

    #[test]
    fn the_candidate_module_maps_class_names_to_style_objects() {
        let module = render_candidate_module(&["p-4".to_string(), "bg-blue-500".to_string()], &Theme::default());
        assert!(module.contains(r#""p-4": {"#), "{module}");
        assert!(module.contains("paddingTop: 16,"), "{module}");
        assert!(module.contains(r#""bg-blue-500": {"#), "{module}");
        assert!(module.contains("createClassResolver(styles, unsupported)"), "{module}");
    }

    #[test]
    fn conditional_candidates_are_named_rather_than_silently_missing() {
        // A style object can't carry `hover:`, and making it able to means
        // per-component state tracking -- the engine this design is
        // choosing not to ship. Reported when used, not at build time:
        // appearing in the scan doesn't prove anything produces it.
        let module = render_candidate_module(&["hover:bg-blue-500".to_string()], &Theme::default());
        assert!(!module.contains("styles = { \"hover"), "{module}");
        assert!(module.contains(r#""hover:bg-blue-500": "`hover:bg-blue-500` is conditional"#), "{module}");
    }

    #[test]
    fn web_only_candidates_are_named_too() {
        let module = render_candidate_module(&["grid".to_string()], &Theme::default());
        assert!(module.contains(r#""grid": ""#), "{module}");
        assert!(module.contains("Web-only"), "{module}");
    }

    #[test]
    fn unrecognized_candidates_are_skipped_entirely() {
        // Scanning is imprecise by design; a token that only looked like a
        // class is neither a style nor a problem to report.
        let module = render_candidate_module(&["useState".to_string()], &Theme::default());
        assert!(!module.contains("useState"), "{module}");
    }

    #[test]
    fn raw_text_in_a_view_is_wrapped_and_takes_its_text_styles_with_it() {
        // Two separate hazards, both invisible on Web: a raw string inside
        // a View crashes React Native, and `fontSize` left on the View
        // would do nothing there because Text doesn't inherit from View.
        let source = r#"
            import { View } from '@hozo/core'
            const el = <View className="p-4 text-xl font-bold">Hello</View>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.jsx.contains("<Text style={hozoStyles.hozo0_text}>Hello</Text>"));
        // Layout stays on the View, text styling moves to the Text.
        assert!(output.styles.contains("paddingTop: 16,"));
        assert!(output.styles.contains("hozo0_text: {"));
        assert!(output.styles.contains("fontSize: 20,"));
        assert!(output.styles.contains("fontWeight: '700',"));
        // Not left behind on the container, where RN would ignore it.
        let container = output.styles.split("hozo0_text").next().unwrap();
        assert!(!container.contains("fontSize"));
    }

    #[test]
    fn a_text_node_is_not_double_wrapped() {
        let source = r#"
            import { Text } from '@hozo/core'
            const el = <Text className="text-xl">Hello</Text>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert_eq!(output.jsx.matches("<Text").count(), 1);
        assert!(output.styles.contains("fontSize: 20,"));
    }

    #[test]
    fn truncation_lowers_to_props_rather_than_styles() {
        // RN has no white-space/text-overflow; it truncates via props.
        // `truncate` asks for an ellipsis, which is `ellipsizeMode`'s
        // default, so only `numberOfLines` is needed.
        let source = r#"
            import { Text } from '@hozo/core'
            const el = <Text className="truncate">x</Text>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(output.diagnostics.is_empty());
        assert!(output.jsx.contains("numberOfLines={1}"));
        assert!(!output.jsx.contains("ellipsizeMode"));
        // The `overflow` half of `truncate` is a real RN style and still
        // lowers as one.
        assert!(output.styles.contains("overflow: 'hidden',"));
    }

    #[test]
    fn nowrap_without_ellipsis_clips_instead() {
        let source = r#"
            import { Text } from '@hozo/core'
            const el = <Text className="whitespace-nowrap">x</Text>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(output.diagnostics.is_empty());
        assert!(output.jsx.contains("numberOfLines={1}"));
        // Nothing asked for an ellipsis, and RN's default would add one.
        assert!(output.jsx.contains(r#"ellipsizeMode="clip""#));
    }

    #[test]
    fn truncation_on_a_non_text_node_is_refused() {
        // `numberOfLines` only exists on Text, so there's nothing to
        // absorb it into here -- and silently dropping it would lose the
        // author's intent.
        let source = r#"
            import { View } from '@hozo/core'
            const el = <View className="truncate" />
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(!output.diagnostics.is_empty());
        assert_eq!(output.diagnostics[0].severity, hozo_ir::Severity::Error);
    }

    #[test]
    fn whitespace_normal_stays_a_genuine_no_op() {
        // RN's Text already wraps, so this asks for what happens anyway.
        let source = r#"
            import { Text } from '@hozo/core'
            const el = <Text className="whitespace-normal">x</Text>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(output.diagnostics.is_empty());
        assert!(!output.jsx.contains("numberOfLines"));
    }

    #[test]
    fn text_styles_reach_a_text_the_author_wrote() {
        // The long-standing divergence this fixes: CSS inherits `text-xl`
        // to the span, React Native inherits nothing from a View, so the
        // same source rendered 20px on Web and the default size on device
        // with nothing said about it.
        let source = r#"
            import { View, Text } from '@hozo/core'
            const el = <View className="text-xl text-red-500"><Text>Hi</Text></View>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(output.styles.contains("fontSize: 20,"), "{}", output.styles);
        assert!(output.styles.contains("color: '#fb2c36',"), "{}", output.styles);
        // And they leave the View, which has no `fontSize` to put them in.
        assert!(!output.jsx.contains("<View style="), "{}", output.jsx);
    }

    #[test]
    fn an_inherited_text_style_loses_to_the_child_that_sets_its_own() {
        // Only the property the child sets: `text-sm` replaces the size and
        // leaves the colour and weight alone, which is what CSS would do.
        // `dedupe_last_wins` gets this right only because the inherited
        // declarations are placed *before* the child's own.
        let source = r#"
            import { View, Text } from '@hozo/core'
            const el = (
              <View className="text-xl text-red-500 font-bold">
                <Text className="text-sm">x</Text>
              </View>
            )
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(output.styles.contains("fontSize: 14,"), "{}", output.styles);
        assert!(!output.styles.contains("fontSize: 20,"), "{}", output.styles);
        assert!(output.styles.contains("color: '#fb2c36',"), "{}", output.styles);
        assert!(output.styles.contains("fontWeight: '700',"), "{}", output.styles);
    }

    #[test]
    fn inheritance_passes_through_an_intermediate_view_and_stops_at_a_text() {
        let source = r#"
            import { View, Text } from '@hozo/core'
            const el = (
              <View className="text-xl">
                <View className="p-2"><Text>Deep</Text></View>
              </View>
            )
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(output.styles.contains("fontSize: 20,"), "{}", output.styles);

        // A Text inside a Text needs nothing from the compiler: React
        // Native inherits there, so pushing a copy down would be noise.
        let nested = r#"
            import { Text } from '@hozo/core'
            const el = <Text className="text-xl"><Text>nested</Text></Text>
            "#;
        let parsed = hozo_parser::parse_tsx(nested);
        let output = lower(&parsed.roots[0].node, nested, &Theme::default());
        assert_eq!(output.styles.matches("fontSize: 20,").count(), 1, "{}", output.styles);
    }

    #[test]
    fn text_styles_with_nowhere_to_land_are_reported_rather_than_dropped() {
        // Handing them down is only half the job. A text size that reaches
        // no text is a style that renders on Web and does nothing on
        // device, which is the divergence worth a build message -- and
        // exactly what silently happened when the push-down was added.
        for (source, expected) in [
            (
                r#"
                import { View } from '@hozo/core'
                const el = <View className="text-xl p-4" />
                "#,
                "contains no text",
            ),
            (
                r#"
                import { View } from '@hozo/core'
                const el = <View className="text-xl">{rows}</View>
                "#,
                "doesn't read",
            ),
        ] {
            let parsed = hozo_parser::parse_tsx(source);
            let output = lower(&parsed.roots[0].node, source, &Theme::default());
            let warning = output
                .diagnostics
                .iter()
                .find(|d| d.code == DiagnosticCode::NotWiredOnNative)
                .unwrap_or_else(|| panic!("expected a diagnostic for: {source}"));
            assert!(warning.message.contains(expected), "{}", warning.message);
        }
    }

    #[test]
    fn a_dialog_is_lowered_with_its_styles_and_its_two_diagnostics() {
        // A primitive rather than a component the compiler walks past:
        // otherwise its className never compiles and neither of these
        // checks ever runs. The behaviour itself is `@hozo/a11y`'s.
        let source = r#"
            import { Dialog, Text } from '@hozo/core'
            const el = (
              <Dialog className="p-6" open={showing} onClose={dismiss} accessibilityLabel="Confirm">
                <Text>Delete?</Text>
              </Dialog>
            )
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(output.jsx.contains("<HozoDialog style={hozoStyles.hozo0}"), "{}", output.jsx);
        assert!(output.jsx.contains("open={showing}"), "{}", output.jsx);
        assert!(output.runtime_imports.contains(&"HozoDialog"), "{:?}", output.runtime_imports);
        assert!(output.styles.contains("paddingTop: 24,"), "{}", output.styles);
    }

    #[test]
    fn a_dialog_with_no_way_out_is_diagnosed() {
        // The one part of §10.3's quality bar a compiler can see: focus
        // trapping and restoration are behaviours, but "there is no
        // onClose" is a missing prop -- and without it Escape and the
        // Android back button both do nothing.
        let source = r#"
            import { Dialog } from '@hozo/core'
            const el = <Dialog open={showing} accessibilityLabel="Confirm" />
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert_eq!(output.diagnostics.len(), 1, "{:?}", output.diagnostics);
        assert_eq!(output.diagnostics[0].code, DiagnosticCode::A11yDialogWithoutDismiss);
        assert!(output.diagnostics[0].message.contains("trap"), "{}", output.diagnostics[0].message);
    }

    #[test]
    fn placeholder_colour_lowers_to_the_prop_that_carries_it() {
        // 291 candidates were refused for want of a `TextInput` to put this
        // on. React Native keeps the colour as a prop rather than a style,
        // which is why it needed a primitive rather than a style arm.
        let source = r#"
            import { TextInput } from '@hozo/core'
            const el = <TextInput className="placeholder-red-500" accessibilityLabel="Email" />
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(output.jsx.contains("placeholderTextColor={'#fb2c36'}"), "{}", output.jsx);
        // No children, so no closing tag to put them between.
        assert!(output.jsx.ends_with("/>"), "{}", output.jsx);
    }

    #[test]
    fn placeholder_colour_on_something_that_has_no_placeholder_is_refused() {
        // The colour is only meaningful where a placeholder exists. On a
        // View it has nothing to colour, and saying so beats emitting a
        // style React Native would ignore.
        let source = r#"
            import { View } from '@hozo/core'
            const el = <View className="placeholder-red-500" />
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert_eq!(output.diagnostics.len(), 1, "{:?}", output.diagnostics);
        assert_eq!(output.diagnostics[0].code, DiagnosticCode::NotWiredOnNative);
    }

    #[test]
    fn caret_colour_lowers_to_text_inputs_cursor_prop() {
        let source = r#"
            import { TextInput } from '@hozo/core'
            const el = <TextInput className="caret-blue-500" accessibilityLabel="Email" />
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(output.jsx.contains("cursorColor={'#2b7fff'}"), "{}", output.jsx);
    }

    #[test]
    fn a_text_input_without_an_accessible_name_is_diagnosed() {
        // The whole reason `TextInput` was added with a rule attached: a
        // placeholder reads like a label and isn't one.
        let source = r#"
            import { TextInput } from '@hozo/core'
            const el = <TextInput placeholder="you@example.com" />
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        let warning = output
            .diagnostics
            .iter()
            .find(|d| d.code == DiagnosticCode::A11yMissingAccessibleName)
            .expect("a nameless field must be diagnosed");
        assert!(warning.message.contains("placeholder is not a"), "{}", warning.message);

        // ...and the label, however it was spelled in source, is written
        // under React Native's name for it.
        let named = r#"
            import { TextInput } from '@hozo/core'
            const el = <TextInput aria-label="Email" />
            "#;
        let parsed = hozo_parser::parse_tsx(named);
        let output = lower(&parsed.roots[0].node, named, &Theme::default());
        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(output.jsx.contains(r#"accessibilityLabel={"Email"}"#), "{}", output.jsx);
    }

    #[test]
    fn colour_families_react_native_has_no_home_for_are_refused_by_name() {
        // Each of these is a perfectly ordinary CSS colour that React
        // Native either doesn't have (SVG paint, form-control accents) or
        // keeps on a component prop rather than in a style. On the wrong
        // primitive those prop-backed colours are named, not dropped.
        //
        // The code each is filed under is part of the assertion. Only the
        // first three are impossible on the platform; the last two work on
        // TextInput and are therefore filed as a target mismatch instead.
        for (candidate, expected, code) in [
            ("fill-red-500", "SVG", DiagnosticCode::WebOnlyPropertyOnNative),
            ("stroke-red-500", "SVG", DiagnosticCode::WebOnlyPropertyOnNative),
            ("accent-red-500", "form controls", DiagnosticCode::WebOnlyPropertyOnNative),
            ("caret-red-500", "TextInput", DiagnosticCode::NotWiredOnNative),
            ("placeholder-red-500", "TextInput", DiagnosticCode::NotWiredOnNative),
        ] {
            let source = format!(
                "import {{ View }} from '@hozo/core'\nconst el = <View className=\"{candidate}\" />\n"
            );
            let parsed = hozo_parser::parse_tsx(&source);
            let output = lower(&parsed.roots[0].node, &source, &Theme::default());
            let refusal = output
                .diagnostics
                .iter()
                .find(|d| d.code == code)
                .unwrap_or_else(|| panic!("{candidate} must be refused as {code:?}, not dropped"));
            assert!(refusal.message.contains(expected), "{candidate}: {}", refusal.message);
        }
    }

    #[test]
    fn every_text_decoration_style_lowers_including_wavy() {
        // React Native's `textDecorationStyle` takes the same five values
        // CSS does. `decoration-wavy` was refused here until the refusal
        // audit checked that claim against RN's own types and found it
        // false; this test is what stops it coming back.
        let source = r#"
            import { Text } from '@hozo/core'
            const el = <Text className="decoration-red-500 decoration-double">x</Text>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(output.styles.contains("textDecorationColor: '#fb2c36',"), "{}", output.styles);
        assert!(output.styles.contains("textDecorationStyle: 'double',"), "{}", output.styles);

        for (candidate, expected) in [
            ("decoration-solid", "'solid'"),
            ("decoration-double", "'double'"),
            ("decoration-dotted", "'dotted'"),
            ("decoration-dashed", "'dashed'"),
            ("decoration-wavy", "'wavy'"),
        ] {
            let source = format!(
                "import {{ Text }} from '@hozo/core'\nconst el = <Text className=\"{candidate}\">x</Text>\n"
            );
            let parsed = hozo_parser::parse_tsx(&source);
            let output = lower(&parsed.roots[0].node, &source, &Theme::default());
            assert!(output.diagnostics.is_empty(), "{candidate}: {:?}", output.diagnostics);
            assert!(
                output.styles.contains(&format!("textDecorationStyle: {expected},")),
                "{candidate}: {}",
                output.styles
            );
        }
    }

    #[test]
    fn outline_none_becomes_zero_width_not_a_solid_outline() {
        // React Native's `outlineStyle` accepts only solid/dotted/dashed,
        // so the border path's None -> 'solid' mapping would say the
        // opposite of what was asked. Zero width is how you hide one.
        let source = r#"
            import { View } from '@hozo/core'
            const el = <View className="outline-none" />
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(output.styles.contains("outlineWidth: 0,"), "{}", output.styles);
        assert!(!output.styles.contains("outlineStyle"), "{}", output.styles);
    }

    #[test]
    fn space_and_divide_reach_the_children_through_hozo_spaced() {
        // These were refused ("React Native has no selector engine") until
        // the refusal audit pointed out that the CSS they produce is
        // entirely expressible -- the selector was never the obstacle, since
        // the styles are ordinary margins and border widths. What is
        // genuinely unknowable at build time is *which* child is last when
        // one of them is `{items.map(..)}`, and that is the only thing
        // `HozoSpaced` decides.
        let source = r#"
            import { View, Text } from '@hozo/core'
            const el = (
              <View className="divide-y-4 space-y-2">
                <Text>a</Text>
                <Text>b</Text>
              </View>
            )
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(output.jsx.contains("<HozoSpaced style={hozoStyles.hozo0Children}>"), "{}", output.jsx);
        assert!(output.jsx.contains("</HozoSpaced>"), "{}", output.jsx);
        assert!(output.runtime_imports.contains(&"HozoSpaced"), "{:?}", output.runtime_imports);

        // The child style, not the parent's: the element itself gets no
        // border or margin from these.
        assert!(output.styles.contains("hozo0Children: {"), "{}", output.styles);
        assert!(output.styles.contains("borderTopWidth: 0,"), "{}", output.styles);
        assert!(output.styles.contains("borderBottomWidth: 4,"), "{}", output.styles);
        assert!(output.styles.contains("marginTop: 0,"), "{}", output.styles);
        assert!(output.styles.contains("marginBottom: 8,"), "{}", output.styles);
    }

    #[test]
    fn space_x_uses_the_logical_margins_and_divide_x_the_logical_border_widths() {
        // React Native takes the CSS logical names for margins
        // (`marginInlineStart`) but its own for border widths
        // (`borderStartWidth`, not `borderInlineStartWidth`). Emitting the
        // CSS spelling for the border would be silently ignored on device.
        let source = r#"
            import { View, Text } from '@hozo/core'
            const el = (
              <View className="space-x-3 divide-x-2 divide-red-500">
                <Text>a</Text>
              </View>
            )
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(output.styles.contains("marginInlineStart: 0,"), "{}", output.styles);
        assert!(output.styles.contains("marginInlineEnd: 12,"), "{}", output.styles);
        assert!(output.styles.contains("borderStartWidth: 0,"), "{}", output.styles);
        assert!(output.styles.contains("borderEndWidth: 2,"), "{}", output.styles);
        assert!(output.styles.contains("borderColor: '#fb2c36',"), "{}", output.styles);
    }

    #[test]
    fn font_relative_metrics_resolve_against_a_text_size_on_the_same_element() {
        // Refused as "the font size isn't known at compile time" until the
        // refusal audit questioned it. Often it *is* known -- `text-lg`
        // right there on the element -- and Tailwind's own output does the
        // same multiplication.
        let source = r#"
            import { Text } from '@hozo/core'
            const el = <Text className="text-lg leading-tight tracking-wide">x</Text>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        // text-lg is 18px; leading-tight is 1.25; tracking-wide is 0.025em.
        assert!(output.styles.contains("lineHeight: 22.5,"), "{}", output.styles);
        assert!(output.styles.contains("letterSpacing: 0.45,"), "{}", output.styles);
    }

    #[test]
    fn font_relative_metrics_resolve_against_an_inherited_text_size() {
        let source = r#"
            import { View, Text } from '@hozo/core'
            const el = (
              <View className="text-lg">
                <Text className="leading-tight tracking-wide">x</Text>
              </View>
            )
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(output.styles.contains("lineHeight: 22.5,"), "{}", output.styles);
        assert!(output.styles.contains("letterSpacing: 0.45,"), "{}", output.styles);
    }

    #[test]
    fn conditional_inherited_font_sizes_only_resolve_the_same_condition() {
        let source = r#"
            import { View, Text } from '@hozo/core'
            const el = (
              <View className="md:text-lg">
                <Text className="md:leading-tight leading-loose">x</Text>
              </View>
            )
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.styles.contains("lineHeight: 22.5,"), "{}", output.styles);
        assert!(
            output.diagnostics.iter().any(|diagnostic| diagnostic.code
                == DiagnosticCode::NotWiredOnNative),
            "{:?}",
            output.diagnostics
        );
    }

    #[test]
    fn a_font_relative_metric_with_no_text_size_is_named_as_unwired_not_web_only() {
        // The distinction is the whole point of the two codes: the platform
        // can hold this value, so calling it Web-only would be false, and
        // the fix is one utility away.
        let source = r#"
            import { Text } from '@hozo/core'
            const el = <Text className="leading-tight">x</Text>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert_eq!(output.diagnostics.len(), 1, "{:?}", output.diagnostics);
        assert_eq!(output.diagnostics[0].code, DiagnosticCode::NotWiredOnNative);
        assert!(output.diagnostics[0].message.contains("text-*"), "{}", output.diagnostics[0].message);
        assert!(!output.styles.contains("lineHeight"), "{}", output.styles);
    }

    #[test]
    fn a_conditional_text_size_does_not_resolve_an_unconditional_ratio() {
        // Folding `leading-tight` against `md:text-lg` would bake a size
        // that only applies above 768px into a style that always applies.
        let source = r#"
            import { Text } from '@hozo/core'
            const el = <Text className="md:text-lg leading-tight">x</Text>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(
            output.diagnostics.iter().any(|d| d.code == DiagnosticCode::NotWiredOnNative
                && d.message.contains("text-*")),
            "{:?}",
            output.diagnostics
        );
        // `md:text-lg` still brings its own line height into the md entry;
        // what must not appear is the ratio folded against it.
        assert!(!output.styles.contains("lineHeight: 22.5"), "{}", output.styles);
    }

    #[test]
    fn an_element_without_space_or_divide_gets_no_wrapper() {
        // The wrapper is not free -- it is a component in the tree and a
        // runtime import -- so it must appear only where it does something.
        let source = r#"
            import { View, Text } from '@hozo/core'
            const el = (
              <View className="p-4">
                <Text>a</Text>
              </View>
            )
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(!output.jsx.contains("HozoSpaced"), "{}", output.jsx);
        assert!(output.runtime_imports.is_empty(), "{:?}", output.runtime_imports);
    }

    #[test]
    fn viewport_sizes_become_an_inline_style_read_from_a_hook() {
        // Refused as "React Native has no viewport unit" until the refusal
        // audit pointed out that `height` is an ordinary style key there.
        // The obstacle was never the unit; it was that the value changes on
        // rotation, so it can't sit in a `StyleSheet.create` object that is
        // evaluated once.
        let source = r#"
            import { View } from '@hozo/core'
            const el = <View className="h-screen p-4" />
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert_eq!(output.prelude, vec!["const __hozoViewport = useHozoViewport()"]);
        assert_eq!(output.runtime_imports, vec!["useHozoViewport"]);
        // Two array elements, not one comma expression: the static entry
        // and the live one.
        assert!(
            output.jsx.contains("style={[hozoStyles.hozo0, { height: __hozoViewport.height }]}"),
            "{}",
            output.jsx
        );
        // ...and the size stays out of the StyleSheet, where it would be
        // frozen at whatever the window was on the first render.
        assert!(!output.styles.contains("height"), "{}", output.styles);
        assert!(!output.styles.contains(": ,"), "{}", output.styles);
    }

    #[test]
    fn spin_animation_uses_one_native_driver_hook() {
        let source = r#"
            import { View } from '@hozo/core'
            const el = (
              <View className="animate-spin">
                <View className="md:animate-spin" />
              </View>
            )
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert_eq!(
            output.prelude.iter().filter(|line| line.contains("useHozoAnimation('spin')")).count(),
            1
        );
        assert!(output.jsx.contains("style={__hozoAnim_spin}"), "{}", output.jsx);
        assert!(
            output.jsx.contains("__hozoBp_md && __hozoAnim_spin"),
            "{}",
            output.jsx
        );
        assert!(output.runtime_imports.contains(&"useHozoAnimation"));
    }

    #[test]
    fn a_partial_viewport_size_multiplies_the_window() {
        // Tested at this level rather than through a utility because no
        // utility reaches it yet: `*-screen` is the only viewport size
        // Hozo parses, and it is always 100%. `Dimension` carries a
        // percentage because `h-dvh`/`h-lvh` and arbitrary values will land
        // here, so the branch is written and pinned rather than left to be
        // discovered later.
        assert_eq!(
            viewport_object(&[StyleProperty::Width(hozo_ir::Dimension::ViewportWidth(50.0))]),
            Some("{ width: __hozoViewport.width * 0.5 }".to_string())
        );
        assert_eq!(
            viewport_object(&[StyleProperty::MaxHeight(hozo_ir::Dimension::ViewportHeight(
                100.0
            ))]),
            Some("{ maxHeight: __hozoViewport.height }".to_string())
        );
        assert_eq!(viewport_object(&[StyleProperty::Opacity(0.5)]), None);
    }

    #[test]
    fn a_conditional_viewport_size_is_guarded_like_the_entry_beside_it() {
        // Both halves of the style have to carry the guard. Guarding only
        // the StyleSheet entry would apply the height at every width.
        let source = r#"
            import { View } from '@hozo/core'
            const el = <View className="md:h-screen md:p-4" />
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(output.jsx.contains("__hozoBp_md && hozoStyles.hozo0_md"), "{}", output.jsx);
        assert!(
            output.jsx.contains("__hozoBp_md && { height: __hozoViewport.height }"),
            "{}",
            output.jsx
        );
    }

    #[test]
    fn portable_display_values_lower_normally() {
        let source = r#"
            import { View } from '@hozo/core'
            const el = <View className="hidden" />
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(output.diagnostics.is_empty());
        assert!(output.styles.contains("display: 'none',"));
    }

    #[test]
    fn interactive_pressable_without_role_is_diagnosed_from_real_source() {
        // As with hozo_web: previously only reachable by hand-constructing
        // a `Node` -- the parser didn't populate on_press/accessibility_role
        // at all until hozo_parser::jsx gained that attribute parsing.
        let source = r#"
            import { Pressable } from '@hozo/core'
            const el = <Pressable onPress={handleTap}>Tap</Pressable>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert_eq!(output.diagnostics.len(), 1);
        assert_eq!(output.diagnostics[0].code, hozo_ir::DiagnosticCode::A11yInteractiveWithoutRole);
        assert!(output.jsx.contains("onPress={handleTap}"));

        let source_with_role = r#"
            import { Pressable } from '@hozo/core'
            const el = (
              <Pressable onPress={handleTap} accessibilityRole="button">Tap</Pressable>
            )
            "#;
        let parsed_with_role = hozo_parser::parse_tsx(source_with_role);
        let output_with_role = lower(&parsed_with_role.roots[0].node, source_with_role, &Theme::default());
        assert!(output_with_role.diagnostics.is_empty());
        assert!(output_with_role.jsx.contains(r#"role="button""#));
    }

    #[test]
    fn semantic_primitives_lower_to_native_text_and_view() {
        let source = r#"
            import { Section, Heading, Paragraph } from '@hozo/core'
            const el = <Section><Heading level={2}>Title</Heading><Paragraph>Body</Paragraph></Section>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert_eq!(
            output.jsx,
            "<View><Text accessibilityRole=\"header\">Title</Text><Text>Body</Text></View>"
        );
    }

    #[test]
    fn article_and_navigation_keep_roles_on_native() {
        let source = r#"
            import { Article, Nav, Heading } from '@hozo/core'
            const el = <Article><Heading>Title</Heading><Nav accessibilityLabel="Primary" /></Article>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert_eq!(
            output.jsx,
            "<View role=\"article\"><Text accessibilityRole=\"header\">Title</Text><View role=\"navigation\" accessibilityLabel={\"Primary\"}></View></View>"
        );
    }

    #[test]
    fn static_list_and_items_keep_native_roles() {
        let source = r#"
            import { List, ListItem } from '@hozo/core'
            const el = <List ordered><ListItem>First</ListItem></List>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert_eq!(
            output.jsx,
            "<View accessibilityRole=\"list\"><View role=\"listitem\"><Text>First</Text></View></View>"
        );
    }
}


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

/// A transition on an element whose condition is ambient rather than an
/// interaction.
///
/// `native_driver_transition` above serves `Pressable` and asks whether a
/// *press* changes something worth animating. This asks the other half of
/// the question: does a condition the whole app shares -- the colour
/// scheme, a breakpoint, an accessibility setting -- change something
/// worth animating on an element that is not a control.
///
/// Returns the duration and easing only. Which properties moved is not
/// decidable here in the way it is for a Pressable: there the compiler
/// evaluates the style for each interaction state and can compare them,
/// and here the guard is a runtime value, so what the style *becomes* is
/// only known once it has. `HozoAnimated` diffs it at render instead.
fn ambient_transition(node: &Node, declarations: &[StyleDeclaration]) -> Option<(u32, &'static str)> {
    if matches!(node.primitive, Primitive::Pressable | Primitive::Button) {
        return None;
    }
    let properties = declarations.iter().rev().find_map(|declaration| match &declaration.property {
        StyleProperty::TransitionProperty(properties) => Some(properties.as_str()),
        _ => None,
    })?;
    if properties == "none" {
        return None;
    }
    // Something the runtime can interpolate, under a condition the runtime
    // can change its mind about. Both halves matter: `transition` beside a
    // `dark:rounded-lg` is a rule that flips and a property nothing can
    // animate between, and wrapping the element for it would add a
    // component and an animation that never shows.
    let animatable = declarations.iter().any(|declaration| {
        let interpolatable = matches!(
            declaration.property,
            StyleProperty::Opacity(_)
                | StyleProperty::BackgroundColor(_)
                | StyleProperty::TextColor(_)
                | StyleProperty::BorderColor(_)
                | StyleProperty::TranslateX(_)
                | StyleProperty::TranslateY(_)
                | StyleProperty::Rotate(_)
                | StyleProperty::ScaleX(_)
                | StyleProperty::ScaleY(_)
        );
        interpolatable && condition_contains(&declaration.condition, runtime_variable)
    });
    if !animatable {
        return None;
    }
    let duration = declarations
        .iter()
        .rev()
        .find_map(|declaration| match declaration.property {
            StyleProperty::TransitionDuration(duration, _) => Some(duration),
            _ => None,
        })
        .unwrap_or(150);
    let timing = declarations
        .iter()
        .rev()
        .find_map(|declaration| match &declaration.property {
            StyleProperty::TransitionTimingFunction(timing, _) => Some(timing.as_str()),
            _ => None,
        })
        .unwrap_or("cubic-bezier(0.4, 0, 0.2, 1)");
    let easing = match timing {
        "linear" => "linear",
        "cubic-bezier(0.4, 0, 1, 1)" => "ease-in",
        "cubic-bezier(0, 0, 0.2, 1)" => "ease-out",
        _ => "ease-in-out",
    };
    Some((duration, easing))
}

#[cfg(test)]
mod ambient_transition_tests {
    use super::*;

    fn compile(class_name: &str) -> LowerOutput {
        let source = format!(
            "import {{ View }} from '@hozo/core'\nconst el = <View className=\"{class_name}\" />\n"
        );
        let parsed = hozo_parser::parse_tsx(&source);
        lower(&parsed.roots[0].node, &source, &Theme::default())
    }

    #[test]
    fn a_colour_that_changes_with_the_theme_is_animated() {
        // The case the whole path exists for: an ambient condition flips
        // and the element crossfades instead of jumping.
        let out = compile("transition bg-white dark:bg-black");
        assert!(out.jsx.starts_with("<HozoAnimated"), "{}", out.jsx);
        assert!(out.jsx.contains("hozoTransition={{ duration: 150"), "{}", out.jsx);
        assert!(out.runtime_imports.contains(&"HozoAnimated"), "{:?}", out.runtime_imports);
        // The transition properties are consumed rather than refused --
        // they are Web-only on an element with nothing to animate and
        // lowered on one with something.
        assert!(out.diagnostics.is_empty(), "{:?}", out.diagnostics);
    }

    #[test]
    fn the_duration_and_easing_come_from_the_classes() {
        let out = compile("transition duration-500 ease-linear opacity-100 md:opacity-50");
        assert!(
            out.jsx.contains("hozoTransition={{ duration: 500, easing: 'linear' }}"),
            "{}",
            out.jsx,
        );
    }

    #[test]
    fn a_property_nothing_can_interpolate_is_left_alone() {
        // `transition` beside a `dark:rounded-lg` is a rule that flips and
        // a property nothing can animate between. Wrapping the element
        // would add a component and an animation that never shows.
        let out = compile("transition dark:rounded-lg");
        assert!(out.jsx.starts_with("<View"), "{}", out.jsx);
        assert!(!out.runtime_imports.contains(&"HozoAnimated"), "{:?}", out.runtime_imports);
    }

    #[test]
    fn a_change_with_no_transition_asked_for_is_not_animated() {
        for class_name in ["bg-white dark:bg-black", "transition-none bg-white dark:bg-black"] {
            let out = compile(class_name);
            assert!(out.jsx.starts_with("<View"), "{class_name}: {}", out.jsx);
        }
    }

    #[test]
    fn a_pressable_keeps_the_interaction_path() {
        // Two transitions on one element would be two animations of the
        // same properties, and `Pressable`'s knows which ones moved
        // because it can evaluate both states.
        let source = "import { Pressable } from '@hozo/core'\n\
                      const el = <Pressable className=\"transition opacity-100 hover:opacity-50\" \
                      accessibilityRole=\"button\" onPress={go} />\n";
        let parsed = hozo_parser::parse_tsx(source);
        let out = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(out.jsx.contains("opacity: true"), "{}", out.jsx);
        assert_eq!(out.jsx.matches("hozoTransition").count(), 1, "{}", out.jsx);
    }
}

/// Whether this condition is one the React Native runtime can change its
/// mind about while the app is running.
///
/// Not `Condition::is_ambient`, which was the first version and is a
/// question about CSS: it asks whether the condition becomes an at-rule,
/// and `Hover` answers yes because on Web it is both a media query and a
/// pseudo-class. On a device there is no hover on a plain View at all --
/// the compiler reports it as unwired a few lines above -- so treating it
/// as a reason to animate wrapped every `hover:` element in a component
/// that would never see its style change.
///
/// These five are exactly the ones with a runtime hook behind them, which
/// is the same thing said from the other side: a condition Hozo subscribes
/// to is a condition that can flip.
fn runtime_variable(condition: &Condition) -> bool {
    matches!(
        condition,
        Condition::Dark
            | Condition::Responsive(_)
            | Condition::Width { .. }
            | Condition::Container { .. }
            | Condition::Environment(_)
    )
}
