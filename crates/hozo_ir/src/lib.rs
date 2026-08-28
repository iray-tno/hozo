//! Platform-independent IR shared across the Hozo compiler pipeline.
//!
//! `Node` (semantic tree) plus `StyleDeclaration` (per-node style, each
//! gated by a `Condition`) together form the Hozo IR described in the
//! proposal's architecture section. Values here are the compiler's output
//! shape, not its parsing shape -- `hozo_parser` builds this from
//! TSX/Tailwind source.

mod colors;
pub use colors::{resolve_color_token, ResolvedColor};

mod theme;
pub use theme::{Theme, ThemeColor};

// ---------------------------------------------------------------------------
// Source spans / diagnostics
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SourceSpan {
    pub start: u32,
    pub end: u32,
}

/// Reference to a source expression Hozo does not evaluate or interpret --
/// only re-emits verbatim into generated output (an event handler, a prop
/// value the compiler doesn't model, or the leaf of a `ConditionExpr`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ExprRef(pub SourceSpan);

#[derive(Debug, Clone, PartialEq)]
pub struct Diagnostic {
    pub code: DiagnosticCode,
    pub severity: Severity,
    pub message: String,
    pub span: SourceSpan,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Severity {
    /// Build-stopping. Reserved for cases where continuing would ship
    /// something silently wrong -- e.g. a Web-only utility reaching the
    /// Native backend, where dropping it would leave a layout that looks
    /// right on Web and is broken on device with no signal.
    Error,
    Warning,
    Info,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DiagnosticCode {
    /// Interactive Pressable/Button with no accessible role (proposal §10.2).
    A11yInteractiveWithoutRole,
    /// A role only React Native has, on a target that is the DOM.
    ///
    /// React Native's own vocabulary carries Android container names --
    /// `drawerlayout`, `viewgroup`, `pager`, `keyboardkey` -- that ARIA
    /// has no word for. Guessing the nearest one would announce something
    /// the author never wrote, so the attribute is dropped and named.
    RoleHasNoWebEquivalent,
    /// An ARIA role written without what the specification says it needs.
    ///
    /// The failure this names is quiet in every way that usually catches a
    /// defect: the element renders, nothing throws, and the page looks
    /// finished. What is wrong is only audible.
    AriaIncompletePattern,
    /// A state or property the element's role does not accept.
    ///
    /// `role="button"` takes `aria-expanded`, `aria-busy` and
    /// `aria-disabled` and nothing else, so `accessibilityState={{ selected
    /// }}` on one is an attribute assistive technology has no use for.
    /// Derived from the specification's own table rather than a list
    /// somebody thought of.
    AriaPropNotAllowed,
    /// An accessible name on an element whose role forbids one.
    ///
    /// Eleven ARIA roles prohibit `aria-label`, and `generic` -- what a
    /// bare `<div>` or `<span>` is -- is one of them, as is `paragraph`.
    /// The name is not merely redundant there; assistive technology may
    /// ignore it, so the element is announced as if it had none. Which is
    /// exactly the shape of defect nobody notices: written, rendered, and
    /// silently absent where it was supposed to be heard.
    AriaNameProhibited,
    /// `focusable` written on an element that is also `disabled`.
    ///
    /// The ARIA APG's "focusable disabled" pattern -- reachable, announced
    /// unavailable, explains itself when activated -- and Hozo does not
    /// offer it, because Android cannot produce it. React Native routes
    /// `disabled` to `View.setEnabled(false)`, and an Android view that is
    /// not enabled cannot take input focus however `focusable` is set.
    /// See `docs/decisions/001-disabled-and-focus.md`.
    FocusableDisabledUnsupported,
    /// A Tailwind class Hozo does not compile.
    ///
    /// Distinguished from a class that was never Tailwind's -- a project's
    /// own `my-card` is not a gap in Hozo and gets no diagnostic, while
    /// `group-hover:bg-blue-500` is one. Both are carried into the output;
    /// only one of them was expected to do something there.
    ///
    /// Named against Tailwind's own variant list rather than a set of
    /// prefixes somebody remembered.
    TailwindVariantNotSupported,
    /// A `Dialog` that can't be dismissed (proposal §10.3).
    ///
    /// Escape on Web and the hardware back button on Android both arrive
    /// as a request to close, and a modal that ignores them is a trap --
    /// the one failure in §10.3's quality bar that a compiler *can* see,
    /// since it is a missing prop rather than a runtime behaviour.
    A11yDialogWithoutDismiss,
    /// An element that needs an accessible name and has none (proposal
    /// §10.2): a `TextInput`, a `Dialog`.
    ///
    /// One code rather than one per element, because the fix is the same
    /// sentence every time -- give it a name -- and the message says which
    /// element it is.
    ///
    /// Separate from the role diagnostic because the fix is different and
    /// the wrong fix is so common: a `placeholder` looks like a label,
    /// and is not one. Screen readers may not announce it, and it
    /// vanishes the moment the user types -- which is exactly when they
    /// would want to check what the field was for.
    A11yMissingAccessibleName,
    /// A semantic text container has a statically-known child that its Web
    /// element cannot contain (for example a Section inside a Paragraph).
    InvalidSemanticNesting,
    /// Hidden from assistive technology and still in the tab order.
    ///
    /// `aria-hidden` removes a subtree from the accessibility tree and
    /// removes nothing from the tab order, so a keyboard user can land on
    /// a control a screen reader has been told does not exist and be told
    /// nothing about where they are. WCAG 4.1.2, and one of the commonest
    /// ways a page becomes unusable while looking entirely correct.
    ///
    /// Decidable here because both halves are in the same tree: the
    /// attribute is on this element and the focusable thing is under it.
    A11yHiddenButFocusable,
    /// Heading levels that jump.
    ///
    /// The levels are the document's outline and a screen reader navigates
    /// by it: "next heading", and a list of them all. A jump from 1 to 3
    /// says there is a level-2 section the listener has been moved out of
    /// without being told.
    ///
    /// Reported per pair rather than per document, which is what makes it
    /// decidable in one file: two headings adjacent here are adjacent on
    /// the page whatever wraps them. Starting at 3 says nothing.
    A11yHeadingLevelSkipped,
    /// A class selecting on one of Hozo's own `data-hozo-*` attributes.
    ///
    /// They are working state, not an interface. Every state worth
    /// selecting on is reachable through a variant that compiles to the
    /// identical selector, and one member of the family is named after
    /// source byte offsets -- so the namespace already contains something
    /// that cannot be depended on. See
    /// `Condition::hozo_private_attribute`.
    HozoAttributeIsPrivate,
    /// A Tailwind variant this platform cannot express, on Web.
    ///
    /// The mirror of `NotWiredOnNative`, and the first diagnostic to point
    /// that way: until the React Native accessibility settings were added,
    /// every variant Hozo compiled could be asked of a browser. Three of
    /// those four cannot, and one of them never will be -- see
    /// `Environment::web_gap_message`.
    NotWiredOnWeb,
    /// Two elements in one file with the same id.
    ///
    /// Every reference naming it -- `aria-labelledby`, `aria-controls`,
    /// `aria-describedby` -- resolves to the first, so one of the two
    /// points at the wrong element. It points *somewhere*, which is
    /// exactly why nothing about it looks broken.
    A11yDuplicateId,
    /// One interactive element inside another.
    ///
    /// Not a style question: the DOM does not allow it, and a browser
    /// meeting one reparents the markup -- so what renders is not what
    /// was written, and the inner control ends up beside the outer one.
    /// Before that it is ambiguous to everyone, since a press goes to
    /// whichever handler is closer and a screen reader announces two
    /// controls occupying one place.
    A11yInteractiveNesting,
    /// A press handler on something no keyboard can press.
    ///
    /// Two shapes that fail differently. `onClick` on a `View` works
    /// with a pointer and is not in the tab order and announces as
    /// nothing -- proposal §10.2's own example. `onPress` on a `View` is
    /// quieter and worse: neither platform has that prop on a plain
    /// view, so it reaches the output and does nothing at all.
    A11yPressWithoutKeyboard,
    /// A `tabIndex` greater than zero.
    ///
    /// Not a local choice, which is what makes it worth a diagnostic
    /// rather than a style note: a positive value orders this element
    /// ahead of every element on the page without one, so a component
    /// reorders documents it has never met and the result depends on what
    /// else happens to be rendered.
    A11yPositiveTabIndex,
    /// A class carries square brackets or a `(--var)` -- Tailwind's
    /// arbitrary syntax -- and Hozo couldn't read it.
    ///
    /// This exists because the alternative is so much worse than silence.
    /// Hozo's utility parsing ends in a colour catch-all: whatever the
    /// specific forms decline becomes a palette token. Before this code
    /// existed, `text-[14px]` -- a font size -- came out the other end as
    /// `color: var(--hozo-color-[14px])`, and `w-[32px]` was dropped with
    /// no trace at all. Neither failed; both produced a page that was
    /// simply wrong somewhere the author would have to find by eye.
    ///
    /// Brackets are what makes this detectable. A bare unknown class is
    /// ordinary -- projects have their own CSS and Hozo must leave it
    /// alone -- but a bracket is unambiguously Tailwind asking for
    /// something, so failing to read one is worth saying out loud.
    UnreadableArbitraryValue,
    /// A prop spread appears after a statically compiled className/style and
    /// could silently override it at runtime; that node's className is not
    /// compiled and falls back instead of failing silently.
    UnsafePropSpreadAfterStyle,
    /// A utility with no React Native equivalent reached the Native
    /// backend. Verified against Yoga (RN's layout engine), whose `display`
    /// is only Flex/None/Contents and which has no grid implementation at
    /// all. Hozo maps `block` and `inline-flex` to their closest Yoga
    /// layouts. Grid properties cannot live in a React Native style object;
    /// the Native backend only accepts its supported subset when it can see
    /// the grid container and children together and lower them to Hozo's
    /// contextual solver.
    WebOnlyPropertyOnNative,
    /// Part of a `className` couldn't be decomposed statically (proposal
    /// §7's third tier). The expression is preserved so its classes still
    /// reach the DOM, but Hozo generates no CSS for whatever they turn out
    /// to be -- only for classes it could read at build time.
    DynamicClassNameNotResolved,
    /// A prop whose value decides something the compiler has to write down
    /// once, and whose value isn't known until runtime.
    ///
    /// Rare, because Hozo carries an expression it can't read rather than
    /// evaluating it -- `disabled={busy}` becomes a ternary in the output
    /// and needs nothing decided. This is for the case where there is no
    /// ternary to write: `multiline` chooses between `<textarea>` and
    /// `<input>`, and only one element goes into the file.
    DynamicPropNotResolved,
    /// A Tailwind variant Hozo compiles, on an element its selector cannot
    /// reach.
    ///
    /// Distinct from `TailwindVariantNotSupported`, which is about Hozo
    /// and says "not built yet". This one is about the element: the
    /// variant is built, the CSS is generated, and the rule will simply
    /// never apply here. `required:` on a `<div>` is the case -- a
    /// perfectly good selector pointed at something that can never be
    /// required.
    TailwindVariantCannotMatch,
    /// A `visited:` utility the browser will refuse to apply.
    ///
    /// The third shape of "this will not do anything", and distinct from
    /// both of the others. `TailwindVariantNotSupported` is about Hozo and
    /// `TailwindVariantCannotMatch` is about the element; this one is
    /// about the *browser*. The variant is compiled, the selector matches
    /// the link it was written for, and the declaration is discarded
    /// anyway -- because a page that could observe a `:visited` style
    /// could read the user's browsing history, so engines apply a short
    /// list of colour properties there and nothing else.
    ///
    /// Worth its own code because the fix is unlike either neighbour's:
    /// there is nothing to add and nothing to build, only a different
    /// utility to reach for.
    VisitedStyleIgnored,
    /// A utility React Native could express, that Hozo doesn't lower yet.
    ///
    /// Distinct from `WebOnlyPropertyOnNative`, and the distinction is the
    /// point: those utilities are impossible on this platform (Yoga has no
    /// grid), whereas these are merely unbuilt. Keeping them apart is what
    /// stops "not built yet" from hardening into "can't be built" -- and
    /// the refusal audit (`@hozo/tailwind-conformance`) leans on it, since
    /// only the Web-only claims are ones React Native's types can contradict.
    ///
    /// Covers a variant with nothing to drive it (`hover:`/`focus:`, which
    /// are real on tablets with a pointer and on the desktop/visionOS
    /// targets; `disabled:` with no `disabled` prop), a metric that needs a
    /// font size the element doesn't set (`leading-tight` alone), and a
    /// utility whose target primitive Hozo doesn't have yet
    /// (`placeholder-*`, which React Native carries as `TextInput`'s
    /// `placeholderTextColor`).
    NotWiredOnNative,
    /// A Hozo primitive sits inside something the compiler carries but
    /// doesn't read -- an expression container, or an unmodeled component's
    /// children -- so it reaches output as source rather than as compiled
    /// markup.
    ///
    /// Not an error: on Web `@hozo/core`'s real components render it and
    /// the candidate stylesheet supplies its CSS, and on Native `View`/
    /// `Text`/`Pressable` resolve to the same react-native components Hozo
    /// lowers to. It costs the compile-time benefit for that element, which
    /// is worth saying out loud rather than leaving the user to wonder why
    /// one element behaves differently.
    PrimitiveNotLowered,
    /// A StyleX expression was recognized, but was outside the deliberately
    /// static subset the StyleX frontend can lower without changing meaning.
    /// It is carried verbatim so the official StyleX compiler can still
    /// handle it; Native gets a named gap instead of an empty style object.
    StylexNotLowered,
}

// ---------------------------------------------------------------------------
// Node tree (semantic IR)
// ---------------------------------------------------------------------------

/// Phase 0 primitive set (proposal §13). Image/Link land in a later phase.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Primitive {
    View,
    Text,
    /// A block of prose: `<p>` on Web and `Text` on React Native.
    Paragraph,
    /// A document heading: `<h1>`...`<h6>` on Web and an accessible
    /// header `Text` on React Native.
    Heading,
    /// A thematic document region: `<section>` on Web and `View` on
    /// React Native, where there is no corresponding layout primitive.
    Section,
    /// A self-contained document composition: `<article>` on Web and a
    /// role-bearing `View` on React Native.
    Article,
    /// A navigation landmark: `<nav>` on Web and a role-bearing `View` on
    /// React Native.
    Nav,
    /// A static semantic list: `<ul>`/`<ol>` on Web and a list-role
    /// `View` on React Native. Data-heavy lists remain `FlatList`.
    List,
    /// One static list entry: `<li>` on Web and a listitem-role `View` on
    /// React Native.
    ListItem,
    Pressable,
    Button,
    /// A destination-bearing interaction: `<a>` on Web and Hozo's
    /// `Linking.openURL` wrapper on React Native.
    Link,
    /// A modal dialog (proposal §10.3, v1's first hard primitive).
    ///
    /// A primitive rather than a component the compiler walks past,
    /// because otherwise its `className` never compiles and its missing
    /// accessible name is never noticed -- both backends lower it to
    /// `/a11y`'s `HozoDialog`, which owns the runtime behaviour.
    Dialog,
    /// A single-line text field. `<input>` on Web, `TextInput` on React
    /// Native -- and the reason `placeholder-*` can lower at all, since
    /// React Native carries that colour as a prop on this component
    /// rather than as a style on anything.
    TextInput,
    /// An image with a universal string `src`: `<img src>` on Web and
    /// React Native's `<Image source={{ uri }}>` on Native.
    Image,
    /// A viewport that scrolls vertically by default and horizontally when
    /// `horizontal` is set. Its content layout stays explicit in children.
    ScrollView,
    /// A data-driven list. Web keeps the lightweight core renderer while
    /// Native lowers to React Native's virtualized FlatList.
    FlatList,
    /// An SVG element, by its own name: `Svg`, `Rect`, `Path`, `G`.
    ///
    /// One variant rather than fourteen because the lowering really is
    /// uniform -- Web writes the lowercase tag, React Native imports the
    /// capitalised component of the same name from `react-native-svg` --
    /// so a variant each would be fourteen identical match arms in every
    /// backend and one more place to forget an element.
    ///
    /// The name is the SVG one, and the JSX spelling is `<Svg.Rect>`: a
    /// namespace rather than a prefix, because `Text` is both an SVG
    /// element and a Hozo primitive and `SvgText` would be a name neither
    /// the specification nor `react-native-svg` uses.
    Svg(SvgElement),
}

/// The SVG elements Hozo lowers.
///
/// Chosen for what a chart needs to exist -- shapes, grouping, gradients,
/// clipping, text -- rather than for coverage of the specification. SVG
/// has around eighty elements and most of them are filters, which are a
/// different problem and one `react-native-svg` answers differently.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SvgElement {
    /// The root. Also the namespace object, so `<Svg>` and `<Svg.Rect>`
    /// come from one import.
    Root,
    G,
    Rect,
    Circle,
    Ellipse,
    Line,
    Path,
    Polygon,
    Polyline,
    Text,
    Defs,
    LinearGradient,
    RadialGradient,
    Stop,
    ClipPath,
    Use,
}

impl SvgElement {
    /// The name under `Svg.` in JSX, which is also `react-native-svg`'s
    /// export and the capitalised form of the SVG tag.
    pub fn name(self) -> &'static str {
        match self {
            SvgElement::Root => "Svg",
            SvgElement::G => "G",
            SvgElement::Rect => "Rect",
            SvgElement::Circle => "Circle",
            SvgElement::Ellipse => "Ellipse",
            SvgElement::Line => "Line",
            SvgElement::Path => "Path",
            SvgElement::Polygon => "Polygon",
            SvgElement::Polyline => "Polyline",
            SvgElement::Text => "Text",
            SvgElement::Defs => "Defs",
            SvgElement::LinearGradient => "LinearGradient",
            SvgElement::RadialGradient => "RadialGradient",
            SvgElement::Stop => "Stop",
            SvgElement::ClipPath => "ClipPath",
            SvgElement::Use => "Use",
        }
    }

    /// The name the emitted React Native code uses.
    ///
    /// The same as `name()` except for text. Generated files already
    /// import `Text` from `react-native` -- the compiler inserts one
    /// around any bare string, because a raw string outside a `Text` is a
    /// crash on that platform -- so an SVG `Text` imported beside it would
    /// be two bindings of one name in a file neither of them wrote.
    /// `@hozo/runtime` re-exports it under this name for the same reason.
    pub fn runtime_name(self) -> &'static str {
        match self {
            SvgElement::Text => "SvgText",
            other => other.name(),
        }
    }

    /// The DOM tag. Not `name().to_lowercase()`: three of these are
    /// camelCase in SVG and lowercasing them produces elements that parse
    /// and never render.
    pub fn tag(self) -> &'static str {
        match self {
            SvgElement::Root => "svg",
            SvgElement::LinearGradient => "linearGradient",
            SvgElement::RadialGradient => "radialGradient",
            SvgElement::ClipPath => "clipPath",
            other => match other {
                SvgElement::G => "g",
                SvgElement::Rect => "rect",
                SvgElement::Circle => "circle",
                SvgElement::Ellipse => "ellipse",
                SvgElement::Line => "line",
                SvgElement::Path => "path",
                SvgElement::Polygon => "polygon",
                SvgElement::Polyline => "polyline",
                SvgElement::Text => "text",
                SvgElement::Defs => "defs",
                SvgElement::Stop => "stop",
                SvgElement::Use => "use",
                _ => unreachable!("handled above"),
            },
        }
    }

    /// Reads the name after `Svg.`, or the bare `Svg` root.
    pub fn from_name(name: &str) -> Option<SvgElement> {
        Some(match name {
            "Svg" => SvgElement::Root,
            "G" => SvgElement::G,
            "Rect" => SvgElement::Rect,
            "Circle" => SvgElement::Circle,
            "Ellipse" => SvgElement::Ellipse,
            "Line" => SvgElement::Line,
            "Path" => SvgElement::Path,
            "Polygon" => SvgElement::Polygon,
            "Polyline" => SvgElement::Polyline,
            "Text" => SvgElement::Text,
            "Defs" => SvgElement::Defs,
            "LinearGradient" => SvgElement::LinearGradient,
            "RadialGradient" => SvgElement::RadialGradient,
            "Stop" => SvgElement::Stop,
            "ClipPath" => SvgElement::ClipPath,
            "Use" => SvgElement::Use,
            _ => return None,
        })
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct Node {
    pub primitive: Primitive,
    pub style: Vec<StyleDeclaration>,
    pub props: PropSet,
    /// Everything between this element's tags, in source order.
    ///
    /// Ordered and total: order matters (`<Text>Hello {name}</Text>` is not
    /// `<Text>{name} Hello</Text>`), and every JSX child is represented,
    /// including the ones the compiler doesn't understand. Before
    /// 2026-08-15 this was a `Vec<Node>` holding only Hozo primitives,
    /// with a separate `text` field -- which meant an unmodeled component,
    /// an expression, or a fragment had nowhere to go and was silently
    /// deleted from the output.
    pub children: Vec<Child>,
    /// Parts of a `className` expression that couldn't be statically
    /// decomposed into `style` (proposal §7's "truly dynamic" tier) --
    /// threaded through to `@hozo/runtime`'s `cx()` at render time.
    /// Populated per-leaf, not per-node: a `cn(...)` call can contribute
    /// some declarations to `style` and some entries here in the same call.
    pub class_name_fallback: Vec<ExprRef>,
    /// Class names from a static `className` that produced no style.
    ///
    /// Carried into the output rather than deleted, which is the rule the
    /// rest of this file already follows for props and children and did
    /// not follow here: an unrecognised class was simply gone. A project's
    /// own `my-card` vanished, and so did Tailwind's `group` and `peer`,
    /// which carry no styles themselves and exist to be selected against
    /// by something else.
    ///
    /// The diagnostic for an unreadable arbitrary value has always told
    /// authors "the class still reaches the DOM, so a hand-written rule
    /// for it will still apply". This is what makes that true.
    pub carried_classes: Vec<String>,
    pub span: SourceSpan,
}

/// One thing between an element's tags.
#[derive(Debug, Clone, PartialEq)]
pub enum Child {
    /// A Hozo primitive, lowered like any other element.
    Node(Node),
    /// Literal text, already trimmed of surrounding JSX whitespace.
    Text(String),
    /// Everything else that renders: a component Hozo doesn't model, an
    /// expression container (`{name}`, `{cond && <A/>}`, `{items.map(..)}`),
    /// a fragment, a child spread.
    ///
    /// Re-emitted from the original source -- the same treatment
    /// `PropSet::passthrough` and `class_name_fallback` already give the
    /// parts of a component the compiler doesn't claim to understand. Not
    /// understanding something is a reason to leave it alone, not a reason
    /// to drop it.
    ///
    /// "Doesn't understand" applies to the *expression*, not to what's
    /// inside it. A Hozo primitive nested in there is perfectly readable,
    /// so each one is lowered and spliced back into the re-emitted text at
    /// `nested` -- `{show && <Text className="p-4">hi</Text>}` compiles its
    /// `Text` exactly as a top-level one, while `show &&` stays untouched.
    Verbatim { source: ExprRef, nested: Vec<NestedNode> },
}

/// A Hozo primitive found inside a `Child::Verbatim`, with the source
/// range its lowered output replaces.
#[derive(Debug, Clone, PartialEq)]
pub struct NestedNode {
    pub span: SourceSpan,
    pub node: Node,
}

impl Child {
    /// Whether this occupies a position `:first-child` would count. CSS
    /// counts elements only, so literal text doesn't shift anything.
    ///
    /// `Verbatim` is the interesting case: it may render nothing, one
    /// element, or a hundred (`{items.map(..)}`), so a sibling after one
    /// has no compile-time position at all.
    pub fn is_element_position(&self) -> bool {
        matches!(self, Child::Node(_) | Child::Verbatim { .. })
    }
}

/// A JSX attribute Hozo doesn't model, carried through to output
/// untouched. Stored as the span of the *whole* attribute rather than a
/// name/value pair, because that one representation covers every form
/// uniformly -- `testID="row"`, `onLayout={fn}`, bare `autoFocus`, and
/// `{...rest}` (which has no name at all, so a name/value pair couldn't
/// represent it).
#[derive(Debug, Clone, PartialEq)]
pub struct PassthroughProp {
    pub span: ExprRef,
    /// The attribute's name, or `None` for a `{...spread}` whose contents
    /// are not knowable at compile time.
    ///
    /// Carried so a backend can tell whether the author already wrote a
    /// prop it was about to add. The Native backend emits semantic props
    /// like `accessibilityRole="list"` and re-emits passthrough ones after
    /// them, so a React Native file that already set the role got it
    /// twice: harmless, since JSX resolves duplicates last-wins and the
    /// author's is last, but wrong to read and noise in any snapshot of
    /// the output.
    pub name: Option<String>,
    /// The value, when it is a literal.
    ///
    /// `None` for anything the compiler cannot read at build time -- an
    /// expression, a template with a hole, a spread. Several
    /// accessibility checks are about a value rather than a presence:
    /// `aria-hidden="true"` hides a subtree and `aria-hidden="false"` does
    /// not, `tabIndex={3}` breaks the tab order and `tabIndex={0}` is how
    /// you join it. Carrying only the name meant those could not be told
    /// apart, and a check that cannot tell them apart is one that has to
    /// stay silent.
    ///
    /// A boolean shorthand (`<View hidden />`) reads as `"true"`, which is
    /// what JSX means by it.
    pub literal: Option<String>,
    /// True for `{...expr}`. Tracked separately because a spread's
    /// *position* matters: JSX resolves duplicate props last-wins, so a
    /// spread after Hozo's compiled className can silently override it at
    /// runtime (see `DiagnosticCode::UnsafePropSpreadAfterStyle`).
    pub is_spread: bool,
    /// Hozo primitives inside an opaque prop expression such as
    /// `renderItem={() => <View />}`.
    pub nested: Vec<NestedNode>,
}

#[derive(Debug, Clone, PartialEq, Default)]
pub struct PropSet {
    pub on_press: Option<ExprRef>,
    /// Gesture Responder System callbacks. Web lowers these through a
    /// lightweight fallback only when present; Native keeps RN's contract.
    pub on_start_should_set_responder: Option<ExprRef>,
    pub on_start_should_set_responder_capture: Option<ExprRef>,
    pub on_move_should_set_responder: Option<ExprRef>,
    pub on_move_should_set_responder_capture: Option<ExprRef>,
    pub on_responder_grant: Option<ExprRef>,
    pub on_responder_start: Option<ExprRef>,
    pub on_responder_move: Option<ExprRef>,
    pub on_responder_end: Option<ExprRef>,
    pub on_responder_release: Option<ExprRef>,
    pub on_responder_reject: Option<ExprRef>,
    pub on_responder_terminate: Option<ExprRef>,
    pub on_responder_termination_request: Option<ExprRef>,
    /// Cross-platform identity and interaction props whose spellings or
    /// event shapes differ between React Native and the DOM.
    pub test_id: Option<ExprRef>,
    pub native_id: Option<ExprRef>,
    /// The `nativeID`'s value, when it is a literal.
    ///
    /// Two elements in one file sharing an id is not a style question:
    /// every `aria-labelledby`, `aria-controls` and `aria-describedby`
    /// that names it resolves to the first one, so one of the two
    /// references silently points at the wrong element -- and the markup
    /// is invalid besides. The check needs the text; the span says only
    /// where it was written.
    pub native_id_literal: Option<String>,
    pub pointer_events: Option<ExprRef>,
    pub accessibility_state: Option<ExprRef>,
    /// The keys `accessibility_state`'s object literal writes, when it is
    /// one this can be read statically.
    ///
    /// `None` means the expression is opaque -- a variable, a spread, a
    /// computed key. The Web backend needs the difference: it turns
    /// `accessibilityState` into one ARIA attribute per key, and reading a
    /// key off an object literal that does not have it is a type error in
    /// the author's own project. `{ expanded: open }` compiled to five
    /// attributes, four of which did not type-check.
    pub accessibility_state_keys: Option<Vec<String>>,
    pub accessibility_value: Option<ExprRef>,
    /// The keys `accessibility_value`'s object literal writes, when it is
    /// one this can be read statically.
    ///
    /// Exactly what `accessibility_state_keys` is for, arrived at the same
    /// way and later: the Web backend turns this into four ARIA
    /// attributes, and reading a key off an object literal that does not
    /// have it is a type error in the author's own project. `{ min, max,
    /// now }` compiled to four attributes, the fourth of which did not
    /// type-check -- the identical defect `accessibilityState` had been
    /// fixed for, on the prop beside it.
    pub accessibility_value_keys: Option<Vec<String>>,
    pub accessibility_live_region: Option<ExprRef>,
    /// React Native's own name for the keyboard focus order.
    ///
    /// Modelled rather than carried because the two platforms spell it
    /// differently: React Native takes `focusable`, the DOM takes
    /// `tabIndex`, and passing `focusable` straight through left it doing
    /// nothing at all on Web. React Native also accepts `tabIndex: 0 | -1`
    /// and documents it against MDN, so that spelling needs no
    /// translation and stays a passthrough.
    pub focusable: Option<ConditionExpr>,
    pub on_layout: Option<ExprRef>,
    /// A Heading's 1...6 level. Static levels compile to a native HTML
    /// heading tag; dynamic expressions use the Web fallback component.
    pub heading_level: Option<HeadingLevel>,
    /// A List's unordered/ordered choice. Dynamic expressions select the
    /// lightweight Web fallback because an HTML tag cannot change inline.
    pub list_ordered: Option<ConditionExpr>,
    pub on_scroll: Option<ExprRef>,
    pub scroll_event_throttle: Option<ExprRef>,
    pub disabled: Option<ConditionExpr>,
    /// Explicit override; `None` means derive the role from `Primitive`
    /// (e.g. `Button` -> `AccessibilityRole::Button`).
    pub accessibility_role: Option<AccessibilityRole>,
    /// A `TextInput`'s accessible name, from `aria-label`/
    /// `accessibilityLabel`. Modelled rather than passed through because
    /// its *absence* is the diagnosis (proposal §10.2): a field with no
    /// name is unusable with a screen reader, and `placeholder` is the
    /// classic thing people reach for instead -- it disappears on first
    /// keystroke and is not announced as a label.
    pub accessibility_label: Option<ExprRef>,
    /// Supplemental screen-reader guidance. Lowered to `aria-description`
    /// on DOM elements and `accessibilityHint` on React Native.
    pub accessibility_hint: Option<ExprRef>,
    /// The universal `Image` source expression. Its spelling changes by
    /// platform, so it cannot be an opaque passthrough prop.
    pub image_src: Option<ExprRef>,
    /// Optional placeholder/fallback source. Like `image_src`, each
    /// backend normalizes this to its platform's Image contract.
    pub image_default_source: Option<ExprRef>,
    /// A ScrollView's axis switch, retained as an expression so Web can
    /// drive a scoped selector and Native can receive its boolean prop.
    pub scroll_horizontal: Option<ConditionExpr>,
    pub refreshing: Option<ConditionExpr>,
    pub on_refresh: Option<ExprRef>,
    pub keyboard_should_persist_taps: Option<ExprRef>,
    pub shows_vertical_scroll_indicator: Option<ConditionExpr>,
    pub shows_horizontal_scroll_indicator: Option<ConditionExpr>,
    /// A `Dialog`'s `open` guard, re-emitted verbatim like `disabled`.
    pub open: Option<ConditionExpr>,
    /// Whether a `Dialog` was given an `onClose`. A modal with no way to
    /// dismiss it reads as a trap, and that is worth naming at build time
    /// rather than discovering with a screen reader.
    pub has_on_close: bool,
    /// Whether a `TextInput` was given a `placeholder`. Only whether, not
    /// what: the value is passed through untouched, and all the compiler
    /// needs to know is that a name-less field has one, which is the case
    /// worth naming.
    pub has_placeholder: bool,
    /// The `TextInput` props whose Web spelling differs from React
    /// Native's. Empty on every other primitive.
    pub text_input: TextInputProps,
    /// Props Hozo doesn't model explicitly -- re-emitted unchanged, in
    /// source order (which JSX's last-wins duplicate resolution depends on).
    pub passthrough: Vec<PassthroughProp>,
}

/// React Native `TextInput` props that the DOM has under another name.
///
/// Modelled rather than passed through, which is a narrower rule than it
/// sounds: the passthrough default is right for a prop that is *only*
/// React Native's, because a visible React warning beats silently deleting
/// behaviour. It is wrong for a prop the DOM has and spells differently,
/// and every field here is one of those.
///
/// `onChangeText` is the one that mattered. Passed through, it reached
/// `<input onChangeText={…}>` -- a prop the DOM does not have, on the
/// element whose entire job is to report what was typed. The field
/// rendered and did nothing, which the fallback `TextInput` in
/// `@hozo/core` had handled correctly all along; compiling made it worse.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct TextInputProps {
    /// `onChangeText={f}`, which the DOM spells `onChange` and hands an
    /// event rather than a string.
    pub on_change_text: Option<ExprRef>,
    /// `editable={false}`, React Native's older spelling of `readOnly`.
    ///
    /// Kept as its own field rather than folded into `read_only`: React
    /// Native 0.87 has both, an author may write either, and Native has to
    /// get back the one that was written.
    pub editable: Option<ConditionExpr>,
    pub read_only: Option<ConditionExpr>,
    /// `multiline`, which on Web is not a prop but a different element.
    pub multiline: Option<ConditionExpr>,
    /// `numberOfLines`, which a `<textarea>` calls `rows`.
    pub number_of_lines: Option<ExprRef>,
    /// `secureTextEntry`, which on Web is `type="password"`.
    pub secure_text_entry: Option<ConditionExpr>,
    /// `keyboardType`, as written. React Native's own values, which map
    /// onto the DOM's `inputmode` for the seven that are cross-platform
    /// and have no answer for the iOS- and Android-only ones.
    pub keyboard_type: Option<String>,
    /// `inputMode`. React Native took the DOM's attribute and its values
    /// verbatim, and documents it as taking precedence over
    /// `keyboardType` -- so Web follows that precedence rather than
    /// inventing one.
    pub input_mode: Option<String>,
}

/// The props that give an element an accessible name, in either
/// vocabulary.
///
/// `alt` is not here: it names an image and nothing else, so the image
/// check adds it rather than every check carrying it.
const NAMING_PROPS: &[&str] = &[
    "aria-label",
    "aria-labelledby",
    "accessibilityLabelledBy",
    "title",
];

impl PropSet {
    /// Whether this element has an accessible name.
    ///
    /// `None` means "cannot tell": a `{...spread}` may carry any of these,
    /// and a diagnostic about a name that might be there is a diagnostic
    /// people learn to ignore.
    ///
    /// The naming props matter as much as `accessibilityLabel` and were
    /// not consulted at all. A field labelled the correct way --
    /// a `<Text nativeID="lbl">` beside a
    /// `<TextInput accessibilityLabelledBy="lbl" />`
    /// -- was told it had no accessible name and advised to add
    /// `accessibilityLabel`, which is the *worse* answer: a label and a
    /// labelledby on one element are not additive, `aria-labelledby` wins,
    /// and following the advice either does nothing or replaces a name
    /// that was already right. A wrong diagnostic costs more than a
    /// missing one, because it is the whole channel that stops being
    /// believed.
    pub fn has_accessible_name(&self) -> Option<bool> {
        if self.accessibility_label.is_some() {
            return Some(true);
        }
        if self
            .passthrough
            .iter()
            .filter_map(|prop| prop.name.as_deref())
            .any(|name| NAMING_PROPS.contains(&name))
        {
            return Some(true);
        }
        if self.passthrough.iter().any(|prop| prop.is_spread) {
            return None;
        }
        Some(false)
    }

    pub fn has_responder_handlers(&self) -> bool {
        self.on_start_should_set_responder.is_some()
            || self.on_start_should_set_responder_capture.is_some()
            || self.on_move_should_set_responder.is_some()
            || self.on_move_should_set_responder_capture.is_some()
            || self.on_responder_grant.is_some()
            || self.on_responder_start.is_some()
            || self.on_responder_move.is_some()
            || self.on_responder_end.is_some()
            || self.on_responder_release.is_some()
            || self.on_responder_reject.is_some()
            || self.on_responder_terminate.is_some()
            || self.on_responder_termination_request.is_some()
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum HeadingLevel {
    Static(u8),
    Dynamic(ExprRef),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AccessibilityRole {
    /// The two that decide an element, not just an attribute: a Pressable
    /// with one of these becomes a `<button>` or an `<a>` on Web.
    Button,
    Link,
    /// Any other ARIA role, as written.
    ///
    /// ARIA is the vocabulary because it is already the cross-platform
    /// one: React Native has taken `role` with ARIA values since 0.71,
    /// and the DOM has always had it. Translating React Native's older
    /// `accessibilityRole` vocabulary into ARIA would be a step *down* --
    /// its list has no `listbox`, `option`, `tree` or `tabpanel`, so a
    /// design-styled select box built out of plain elements cannot be
    /// described in it at all.
    Aria(String),
    /// A React Native role with no ARIA meaning: `drawerlayout`,
    /// `keyboardkey`, `viewgroup`, `pager` and the rest of the
    /// Android-specific container names.
    ///
    /// Kept rather than dropped at parse time so each backend can answer
    /// for itself -- React Native understands these and the DOM does not,
    /// which is a difference to report rather than to erase.
    NativeOnly(String),
}

// ---------------------------------------------------------------------------
// Style IR
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq)]
pub struct StyleDeclaration {
    pub property: StyleProperty,
    pub condition: Condition,
}

/// Universal Style Subset (proposal §6.3), Phase 0 scope only.
///
/// `display: flex` is not a variant here -- it's part of every `View`'s
/// shared base style (proposal §8.1), not a per-declaration property.
#[derive(Debug, Clone, PartialEq)]
pub enum StyleProperty {
    // Layout
    /// Originally left out on the grounds that `display: flex` is part of
    /// every `View`'s base style (proposal §8.1) rather than something a
    /// user sets. That reasoning didn't cover `hidden`, which is common and
    /// has a direct equivalent on both platforms.
    Display(Display),
    FlexDirection(FlexDirection),
    Flex(FlexShorthand),
    AlignItems(Align),
    AlignSelf(AlignSelf),
    /// Reuses `Justify` -- CSS's `align-content` takes the same keyword set
    /// as `justify-content`, and both platforms accept them there.
    AlignContent(Justify),
    JustifyContent(Justify),
    Gap(Length),
    RowGap(Length),
    ColumnGap(Length),
    // Margin/padding/inset are per-side longhand properties, not a single
    // EdgeInsets-bundling property: Tailwind utilities like `px-4`/`py-2`
    // set disjoint sides independently, and only per-side variants let
    // "last declaration for a property wins" flattening compose them
    // correctly instead of one clobbering the other.
    MarginTop(Dimension),
    MarginRight(Dimension),
    MarginBottom(Dimension),
    MarginLeft(Dimension),
    PaddingTop(Length),
    PaddingRight(Length),
    PaddingBottom(Length),
    PaddingLeft(Length),
    // Writing-direction-relative counterparts, kept as their own variants
    // rather than resolved to a physical side: which side "start" means
    // isn't known until runtime (the document's direction on Web,
    // `I18nManager.isRTL` on Native), so collapsing them here would bake in
    // LTR and silently break RTL layouts. Both platforms have real
    // equivalents to lower onto -- CSS `*-inline-start/end`, RN
    // `paddingStart`/`marginEnd`/etc.
    MarginInlineStart(Dimension),
    MarginInlineEnd(Dimension),
    PaddingInlineStart(Length),
    PaddingInlineEnd(Length),
    Width(Dimension),
    Height(Dimension),
    MinWidth(Dimension),
    MinHeight(Dimension),
    MaxWidth(Dimension),
    MaxHeight(Dimension),
    /// `None` is `z-auto`. One variant for both, not a separate `ZIndexAuto`
    /// or a `Keyword`: they are the same CSS property, and splitting them
    /// would stop them overriding each other.
    ZIndex(Option<i32>),
    /// `order-*`. Flex ordering, which Yoga doesn't implement -- React
    /// Native lays children out in tree order and has no way to say
    /// otherwise.
    Order(i32),
    /// `cursor-*`. Held as the CSS keyword rather than an enum: these are
    /// pass-through names with no structure to model, and thirty-odd
    /// variants would only restate the CSS spec. React Native accepts two
    /// of them (`auto`, `pointer`), which `unsupported_on_native` checks by
    /// name.
    Cursor(String),
    /// `columns-*`. CSS multi-column layout, which React Native has no
    /// equivalent for at all.
    Columns(ColumnCount),
    /// `rotate-none`/`scale-none`/`translate-none`/`transform-none`: the
    /// standalone transform properties turned off.
    ///
    /// Separate from the axes rather than a value of them, because each
    /// clears the whole property -- and separate from each other, because
    /// CSS has four properties here and turning off one leaves the rest.
    RotateNone,
    ScaleNone,
    TranslateNone,
    TransformNone,
    /// `transform`/`transform-cpu`: the composed `transform` with nothing
    /// in it. Tailwind writes the register chain here, which resolves to
    /// empty; the declaration exists so a later utility has something to
    /// override.
    TransformEmpty,
    /// `transform-gpu`: the same chain with a null 3D translation in
    /// front, the long-standing trick for forcing GPU compositing.
    TransformGpu,
    /// `line-clamp-*`. `None` is `line-clamp-none`.
    ///
    /// One property standing for four CSS declarations, composed at emit
    /// time like the ring and mask slots -- the `-webkit-box` display and
    /// the `overflow` it needs are part of the mechanism, not separate
    /// intentions, and routing them through `Display`/`Overflow` would
    /// make `line-clamp-2` silently fight an `overflow-visible` written
    /// beside it.
    ///
    /// React Native expresses the whole thing as `numberOfLines` on Text,
    /// which is why this is a property rather than a pile of keywords.
    LineClamp(Option<Clamp>),
    /// `grow`/`grow-0`/`shrink`/`shrink-0` and `aspect-*`. All three are
    /// real React Native styles, which is why they are properties rather
    /// than `Keyword`s -- the refusal audit caught them being refused as
    /// part of the keyword tail.
    FlexGrow(f64),
    FlexShrink(f64),
    AspectRatio(&'static str),
    /// `border-s/e/x/y/bs/be-*`: a border width and its style on a
    /// *logical* edge.
    ///
    /// Edge-keyed rather than one variant per edge, unlike the physical
    /// sides above -- `dedupe_key` already knows how to key on an `Edge`,
    /// and six more edges is twelve more variants for no gain. Restricted
    /// to the logical edges precisely so the two encodings can't describe
    /// the same declaration: `Edge::Top` here would be a second spelling
    /// of `BorderTopWidth` and the pair would stop overriding each other.
    BorderLogicalWidth(Edge, Length),
    BorderLogicalStyle(Edge, BorderStyle),
    /// `overflow-x-*` / `overflow-y-*`. Separate properties from
    /// `Overflow`, matching CSS -- React Native has only the combined one,
    /// so the per-axis forms are refused there.
    OverflowX(Overflow),
    OverflowY(Overflow),
    /// `object-*`. React Native has `objectFit` and takes the same five
    /// keywords, so the text is shared.
    ObjectFit(&'static str),
    /// `select-*`. Two declarations on Web (the -webkit- prefix is still
    /// load-bearing in Safari), one `userSelect` on React Native.
    UserSelect(&'static str),
    /// `underline`/`overline`/`line-through`/`no-underline`. React Native
    /// has `textDecorationLine` and takes underline, line-through and their
    /// combination; `overline` is Web-only.
    TextDecorationLine(&'static str),
    /// `underline-offset-*`. A length rather than a keyword, so it takes a
    /// real property: the negative forms have to go through `negated`,
    /// which has nothing sensible to do with a `Keyword`.
    TextUnderlineOffset(Dimension),
    /// `mix-blend-*` / `bg-blend-*`, as the CSS keyword. React Native has
    /// `mixBlendMode` and takes the same names, so the text is shared;
    /// `background-blend-mode` has no equivalent there.
    MixBlendMode(&'static str),
    BackgroundBlendMode(&'static str),
    /// A pair of declarations that are the same value under two property
    /// names -- `-webkit-hyphens` and `hyphens`, `-webkit-font-smoothing`
    /// and `-moz-osx-font-smoothing`. Held as one property because they
    /// are one intention, and because a `Keyword` can only carry one.
    KeywordPair(&'static str, &'static str, &'static str, &'static str),
    /// The `container-name` half of `@container/main`.
    ///
    /// Its own property because the name comes from the class and cannot
    /// be a `KeywordPair`, which holds `&'static str`. The
    /// `container-type` half is an ordinary keyword utility.
    ContainerName(String),
    /// `content-['x']` and `content-none`, as written.
    ///
    /// Two declarations rather than one, and they cannot be a
    /// `KeywordPair` because that holds `&'static str` and this value
    /// comes from the source. The custom property is what lets a
    /// `content-*` utility reach a `::before` rule written elsewhere in
    /// the stylesheet: every before/after rule reads
    /// `content: var(--hozo-content)`, so the two compose whatever order
    /// they land in.
    Content(String),
    /// One CSS declaration with a fixed value, as `(property, value)`.
    ///
    /// The deliberate escape hatch for the long tail: `touch-action`,
    /// `break-after`, `contain`, `color-scheme` and eighty-odd others are
    /// each a closed list of keywords that Hozo neither computes nor
    /// reinterprets, and giving every one its own variant would be ninety
    /// enum arms restating the CSS spec.
    ///
    /// Strictly for properties nothing else models. A property that *does*
    /// have a variant must not also arrive here: `dedupe_key` tells two
    /// `Keyword`s apart by property name but cannot see that
    /// `Keyword("align-items", ..)` and `AlignItems(..)` are the same
    /// declaration, so the two spellings would stop overriding each other.
    /// `keyword_utility` in `hozo_parser` is where that rule is kept.
    Keyword(&'static str, &'static str),
    /// A declaration the source wrote out in full: `[color:red]`,
    /// `[mask-type:luminance]`, `[--my-var:4px]`.
    ///
    /// Where `Keyword` is a closed list Hozo curates, this is whatever
    /// CSS the author reached for -- so both halves are runtime strings and
    /// neither is checked against anything. That is the deal an arbitrary
    /// property makes: it leaves the design system, and Hozo's job shrinks
    /// to putting it through unchanged.
    ///
    /// Native refuses every one of these. A CSS property name means nothing
    /// to React Native's style system, and guessing a camelCase equivalent
    /// would turn "this doesn't exist on Native" into "this exists and does
    /// nothing".
    ///
    /// Two of these collapse against each other by property name, the same
    /// way `Keyword` does. Neither collapses against a *typed* variant for
    /// the same property -- `[color:red]` and `text-blue-500` both survive
    /// into the rule, and CSS's own last-wins settles it. Correct, but it
    /// does mean the emitted rule can carry a declaration Tailwind would
    /// have dropped.
    Arbitrary(String, String),
    /// Column count for `grid-cols-<n>`. Native's initial grid solver can
    /// consume counts and simple fixed/fr lists when paired with `grid`;
    /// richer track functions remain an explicit refusal.
    GridTemplateColumns(GridTracks),
    GridTemplateRows(GridTracks),
    /// `col-start-*`/`col-end-*`/`row-start-*`/`row-end-*`: one edge of a
    /// grid item's placement.
    GridColumnStart(GridLine),
    GridColumnEnd(GridLine),
    GridRowStart(GridLine),
    GridRowEnd(GridLine),
    /// `col-span-*`/`col-auto`/`col-span-full`: both edges at once, which
    /// CSS spells as the `grid-column` shorthand rather than as a pair.
    GridColumn(GridSpan),
    GridRow(GridSpan),
    Position(Position),
    /// `Dimension` rather than `Length`: Tailwind offers `top-1/2` and
    /// `inset-x-auto` alongside the spacing scale, so a plain pixel length
    /// cannot represent the family.
    InsetTop(Dimension),
    InsetRight(Dimension),
    InsetBottom(Dimension),
    InsetLeft(Dimension),
    InsetInlineStart(Dimension),
    InsetInlineEnd(Dimension),
    /// The axis shorthands (`inset-x-*`/`inset-y-*`) and the block-logical
    /// pair, kept as their own properties for the same discriminant reason
    /// as the per-side border colours below.
    InsetInline(Dimension),
    InsetBlock(Dimension),
    InsetBlockStart(Dimension),
    InsetBlockEnd(Dimension),

    // Visual
    BackgroundColor(Color),
    Opacity(f64),
    BorderColor(Color),
    /// Per-side border colours, one variant per CSS longhand.
    ///
    /// Separate variants rather than one `BorderSideColor(Side, Color)`
    /// because `dedupe_last_wins` identifies a property by its enum
    /// discriminant -- a single variant would make `border-t-red-500` and
    /// `border-b-blue-500` collapse into one. Same reason the per-side
    /// widths above are spelled out.
    ///
    /// `Inline`/`Block` are CSS shorthands (start+end of that axis) and are
    /// emitted as such on Web to match Tailwind exactly; the Native backend
    /// expands them, since React Native has no shorthand form.
    BorderTopColor(Color),
    BorderRightColor(Color),
    BorderBottomColor(Color),
    BorderLeftColor(Color),
    BorderInlineColor(Color),
    BorderBlockColor(Color),
    BorderInlineStartColor(Color),
    BorderInlineEndColor(Color),
    BorderBlockStartColor(Color),
    BorderBlockEndColor(Color),
    // Per-side, for the same reason margin/padding are (see above):
    // `border-t-2` and `border-b-4` set disjoint sides and must compose.
    BorderTopWidth(Length),
    BorderRightWidth(Length),
    BorderBottomWidth(Length),
    BorderLeftWidth(Length),
    /// Needed for border widths to render at all on Web: CSS defaults
    /// `border-style` to `none`, so a width alone shows nothing. Tailwind
    /// emits a style declaration alongside every border-width utility for
    /// exactly this reason, and Hozo has no preflight/reset of its own to
    /// lean on instead.
    ///
    /// Per-side, and that matters more than it looks: an all-sides
    /// `border-style: solid` makes the three sides *without* an explicit
    /// width fall back to `border-width`'s initial value (`medium`) and
    /// render, so `border-t-2` would draw a full box instead of one edge.
    /// React Native has no per-side border style; its backend collapses
    /// these into its single `borderStyle` (harmless there, since RN
    /// defaults every border width to 0 rather than `medium`).
    BorderTopStyle(BorderStyle),
    BorderRightStyle(BorderStyle),
    BorderBottomStyle(BorderStyle),
    BorderLeftStyle(BorderStyle),
    BorderRadius(Radius),
    /// Per-corner radii. Tailwind's side forms (`rounded-t-*`) and logical
    /// side forms (`rounded-s-*`) each expand to the two corners on that
    /// edge, which is what Tailwind itself emits -- there is no CSS
    /// shorthand for one edge's pair.
    BorderTopLeftRadius(Radius),
    BorderTopRightRadius(Radius),
    BorderBottomRightRadius(Radius),
    BorderBottomLeftRadius(Radius),
    BorderStartStartRadius(Radius),
    BorderStartEndRadius(Radius),
    BorderEndStartRadius(Radius),
    BorderEndEndRadius(Radius),

    /// CSS states these as standalone properties (`rotate: 45deg`), which
    /// is also how Tailwind v4 emits them. React Native has no standalone
    /// equivalents -- only a combined `transform` -- so the Native backend
    /// composes whichever of these are present into one entry, in CSS's
    /// defined application order (translate, then rotate, then scale).
    Rotate(Angle),

    /// Per-axis scale, as a *percentage* the way Tailwind writes it
    /// (`scale-110` -> 110).
    ///
    /// Held in the authored unit rather than as a ratio so the Web lowering
    /// is exact: converting to a ratio at parse and back at emit made
    /// `scale-110` come out as `110.00000000000001%`. React Native wants
    /// the ratio and divides once, where the same rounding is invisible --
    /// it takes a number, not a string.
    ///
    /// Bare `scale-50` sets all three axes rather than being a fourth
    /// property, which is what makes `scale-50 scale-x-75` resolve the way
    /// Tailwind does: `dedupe_last_wins` keys on the property, so the axes
    /// have to be separate properties to override one another.
    ScaleX(Scale),
    ScaleY(Scale),
    ScaleZ(Scale),
    /// Whether the `scale` declaration writes its third component.
    ///
    /// Not the same question as "is the z register set": `scale-50` sets all
    /// three registers and still writes only two components, while
    /// `scale-3d` writes three without setting anything. Tailwind decides
    /// this by which utility was written, so the marker has to be its own
    /// property rather than inferred from `ScaleZ` being present.
    Scale3d,
    /// The 3D rotations and the skews. Separate from `Rotate` because CSS
    /// puts them in `transform` rather than in the standalone `rotate`
    /// property, and they compose into one declaration the same way the
    /// translate axes do.
    RotateX(Angle),
    RotateY(Angle),
    RotateZ(Angle),
    SkewX(Angle),
    SkewY(Angle),
    /// CSS's `translate` is one property taking up to three values, so
    /// these compose into a single declaration rather than one each --
    /// before 2026-08-15 `translate-x-4 translate-y-8` emitted two
    /// `translate:` declarations and the x was lost to last-wins.
    TranslateX(Dimension),
    TranslateY(Dimension),
    TranslateZ(Dimension),
    /// An authored `transform` declaration. Unlike Tailwind's standalone
    /// translate/rotate/scale slots, CSS transform functions are applied in
    /// source order, so the list stays ordered all the way to both backends.
    Transform(Vec<TransformFunction>),
    /// The complete transform-origin value, shared by Tailwind and StyleX.
    TransformOrigin(String),
    /// Kept as the already-composed CSS value rather than a structured
    /// list. React Native accepts a string for `boxShadow`/`filter` too, so
    /// both backends emit the same text and there's nothing for a
    /// structured form to buy here.
    BoxShadow(String),
    /// Ring layers, kept apart from `BoxShadow` because they *compose* with
    /// it rather than replace it: `shadow-lg ring-2` renders both, and a
    /// single property would make the later one win under
    /// `dedupe_last_wins`.
    ///
    /// Width and colour are separate for the same reason -- `ring-2` and
    /// `ring-blue-500` are two utilities that must combine, which is
    /// exactly what Tailwind uses its `--tw-ring-*` registers for. Hozo
    /// resolves the composition at compile time instead, so no custom
    /// properties reach the output.
    RingWidth(Length),
    RingColor(Color),
    /// `inset-shadow-*`: an inner shadow, a fourth layer beside the two
    /// rings and the outer shadow. Held as its composed CSS text for the
    /// same reason `BoxShadow` is.
    InsetShadow(String),
    InsetRingWidth(Length),
    InsetRingColor(Color),
    /// `ring-offset-*`: a gap between the element and its ring, drawn as a
    /// fifth layer in the same `box-shadow` rather than as a property of
    /// the ring. It also widens the ring's own spread by the same amount,
    /// which is why the two are composed together in
    /// `hozo_web::css::box_shadow_value` rather than each emitting text.
    RingOffsetWidth(Length),
    RingOffsetColor(Color),
    /// `snap-x` / `snap-y` / `snap-both` / `snap-none`, and the strictness
    /// that `snap-mandatory` / `snap-proximity` set beside them.
    ///
    /// One CSS property written by two utilities, so it cannot be a
    /// `Keyword` -- the axis was one, with `proximity` baked into its
    /// text, and `snap-mandatory` had nowhere to go. Tailwind keeps the
    /// strictness in a register with `proximity` as its declared initial
    /// value, which is why the axis alone still means something.
    ScrollSnapType(&'static str),
    ScrollSnapStrictness(&'static str),
    /// `ring-inset`: the ring drawn inside the element's box.
    ///
    /// A flag on the ring rather than a ring of its own -- Tailwind writes
    /// it as `var(--tw-ring-inset,)` at the head of the ring's own layer,
    /// with an empty fallback, so the layer reads `inset 0 0 0 …` when the
    /// utility is present and `0 0 0 …` when it is not. Distinct from
    /// `inset-ring-*`, which is a separate layer with its own width and
    /// colour.
    RingInset,
    /// `shadow-<colour>` / `inset-shadow-<colour>`: the colour every layer
    /// of the matching shadow is painted in.
    ///
    /// Separate from `BoxShadow` because they are separate utilities that
    /// must combine -- `shadow-lg shadow-blue-500` is one blue shadow, not
    /// a shadow and a colour. Which means the shadow's own text has to
    /// keep its layers' default colours *replaceable*, and it does: see
    /// `hozo_web::css::repaint_shadow`.
    ShadowColor(Color),
    InsetShadowColor(Color),
    /// `text-shadow-<size>`: the shadow list, as its composed CSS text.
    ///
    /// A `Keyword` until the colour utility existed. The invariant
    /// `Keyword` documents is that no CSS property may be reachable both
    /// as a keyword and as a variant of its own -- the two stop overriding
    /// each other when they are -- and adding the colour made
    /// `hozo_web::css` write `text-shadow` from a composition. The test
    /// that guards it caught this within the same minute; the property
    /// moving out of the table is what it was asking for.
    TextShadow(String),
    /// `drop-shadow-<colour>` / `text-shadow-<colour>`: the same idea for
    /// the other two shadow families.
    ///
    /// They were missing, and nothing could see it. Both compose across
    /// two utilities exactly as `shadow-*` does, and neither the
    /// one-utility catalogue nor the hand-written composition list
    /// contained the pair: `drop-shadow-lg drop-shadow-blue-500` came out
    /// the default black, and `drop-shadow-blue-500` on its own came out
    /// as nothing at all. 586 of the first 599 findings from the derived
    /// composition denominator were these two, which is one colour palette
    /// times two code paths.
    DropShadowColor(Color),
    TextShadowColor(Color),
    /// One function of the `filter` chain, and its already-formatted CSS
    /// argument (`blur(12px)` is `Blur` + `"blur(12px)"`).
    ///
    /// Per-function rather than one string, for the same reason the ring
    /// and mask slots are: Tailwind builds `filter` out of eight registers
    /// in a fixed order, and holding the whole chain as one value would
    /// make `blur-md grayscale` last-wins instead of composing. The
    /// `FilterFunction` is also the dedupe key, so `blur-sm blur-lg`
    /// replaces rather than stacks.
    Filter(FilterFunction, String),
    /// A complete authored `filter` value, as opposed to one Tailwind
    /// register-backed function above. Keeping it whole preserves function
    /// order, which is observable because filter functions do not commute.
    FilterRaw(String),
    /// The same chain applied to what's *behind* the element. A separate
    /// property, not a flag on `Filter`: an element can carry both, and
    /// they compose independently.
    BackdropFilter(FilterFunction, String),

    // Typography
    /// A complete font-family value. Static StyleX declarations use one
    /// portable family name; Tailwind's named utilities retain their CSS
    /// fallback stack for Web.
    FontFamily(String),
    /// The intersection of CSS font-variant keywords and React Native's
    /// `FontVariant[]`, retained in authored order.
    FontVariant(Vec<&'static str>),
    FontSize(Length),
    FontWeight(FontWeight),
    LineHeight(LineHeight),
    /// Letter spacing, always in `em` -- Tailwind's `tracking-*` scale is
    /// defined relative to the element's own font size. Web-only: React
    /// Native's `letterSpacing` is an absolute number, and the font size to
    /// resolve against isn't known at compile time.
    LetterSpacing(LetterSpacing),
    /// `overflow`/`text-overflow`/`white-space`, the three declarations
    /// `truncate` expands to.
    Overflow(Overflow),
    TextOverflow(TextOverflow),
    WhiteSpace(WhiteSpace),
    /// CSS transitions, kept as already-composed values. Web-only: React
    /// Native has no declarative transition in its StyleSheet -- animation
    /// there is imperative (Animated/Reanimated), which is a runtime
    /// dependency rather than a lowering.
    TransitionProperty(String),
    /// The duration and easing, with where the value came from.
    ///
    /// A `transition-*` utility supplies both as well as the property
    /// list, and Tailwind reads them through registers -- `transition`
    /// writes `transition-duration: var(--tw-duration, 150ms)` and
    /// `duration-75` writes the register. So an explicit `duration-*` wins
    /// wherever it is written, and `duration-75 transition` means 75ms
    /// just as much as `transition duration-75` does.
    ///
    /// Hozo resolves the indirection at build time, which erased that: the
    /// default was one more declaration in written order, so it won
    /// whenever `transition` came second. `Origin` is how the two stay
    /// distinguishable long enough for `dedupe_last_wins` to prefer the
    /// written one.
    TransitionDuration(u32, Origin),
    TransitionTimingFunction(String, Origin),
    /// Carries the named animation rather than its shorthand text so Web
    /// can emit the matching `@keyframes` and Native can select a dedicated
    /// runtime lowering. Native currently wires Spin and refuses the other
    /// motion shapes rather than approximating them.
    Animation(Animation),
    /// The odd one out: this styles the element's *children*, not the
    /// element. Tailwind's `space-x-*`/`space-y-*` are defined that way --
    /// a gap between siblings applied as a margin on all but the last --
    /// and there's no way to express it as a declaration on the parent.
    /// The Web backend emits a child-scoped rule for it; React Native has
    /// no selector engine, so it's refused there.
    /// The `mask-*` utilities that are one CSS property set to one keyword.
    ///
    /// These carry the CSS keyword as a string rather than getting an enum
    /// each, which is the opposite of how the rest of this file works. The
    /// reason is that nothing ever *reads* the value: masks don't exist in
    /// React Native at all, so there is no second lowering to map onto and
    /// no value transformation to perform. A typed enum here would be eight
    /// enums whose only use is to be turned straight back into the string
    /// they came from.
    ///
    /// One variant per CSS property, though, so `dedupe_last_wins` still
    /// resolves `mask-clip-border mask-clip-content` correctly.
    /// `bg-none`: no background image.
    ///
    /// A property rather than a `Keyword("background-image", "none")`,
    /// because the gradient utilities now write that same property from
    /// their own variant -- and a `Keyword` sharing a property with a
    /// variant is exactly the collision that stopped `z-auto` and `z-10`
    /// overriding each other. `dedupe_last_wins` keys on the variant, so
    /// the two have to be the same one to resolve.
    BackgroundImageNone,
    /// A complete static StyleX gradient. React Native accepts CSS strings
    /// for linear and radial gradients, so both backends can retain it
    /// without introducing a runtime gradient representation.
    BackgroundImage(String),
    /// A background gradient: which function, and everything before the
    /// stops.
    ///
    /// The prelude is one string rather than a direction plus an
    /// interpolation space, because Tailwind writes it as one
    /// (`--tw-gradient-position: to right in oklab`) and one utility sets
    /// all of it -- the space is a *modifier* on the same class,
    /// `bg-linear-to-r/srgb`. Splitting it would be two properties that
    /// can never be written apart.
    ///
    /// Paints nothing without stops, exactly as in Tailwind: this is the
    /// gradient's shape and `GradientStopColor` supplies its colours.
    Gradient(GradientKind, String),
    /// `from-*` / `via-*` / `to-*`. Colour and position are separate
    /// properties for the same reason ring width and colour are: they are
    /// separate utilities that must combine, and `from-red-500 from-20%`
    /// sets both halves of one stop.
    GradientStopColor(GradientStop, Color),
    GradientStopPosition(GradientStop, Dimension),
    MaskClip(&'static str),
    MaskOrigin(&'static str),
    MaskMode(&'static str),
    MaskType(&'static str),
    MaskSize(&'static str),
    MaskPosition(&'static str),
    MaskRepeat(&'static str),
    MaskImageNone,
    /// The gradient half of `mask-*`.
    ///
    /// Tailwind builds these from a fixed list of `--tw-mask-*` registers
    /// spliced into one `mask-image`, with every unset slot defaulting to an
    /// opaque `linear-gradient(#fff, #fff)` that the `intersect` composite
    /// then ignores. Hozo knows the whole set at compile time, so
    /// `hozo_web::css::mask_declarations` resolves the list directly.
    ///
    /// Each utility contributes one piece, which is why these are so
    /// granular: `mask-t-from-red-500 mask-t-to-80%` are two utilities that
    /// must combine into one gradient.
    MaskStopColor(MaskSlot, MaskStop, Color),
    MaskStopPosition(MaskSlot, MaskStop, Dimension),
    /// The argument a mask gradient slot carries on its own: an angle for
    /// `mask-linear-*` and `mask-conic-*`, a size for `mask-radial-[…]`.
    ///
    /// One variant for all three because they occupy the same position in
    /// Tailwind's output -- the fallback inside
    /// `var(--tw-mask-<slot>-stops, …)`, which is what the gradient becomes
    /// when no stop utility was written. `Angle` carries it because that is
    /// what it is for two of the three, and because the arbitrary case is
    /// unresolvable text in any of them.
    ///
    /// Only the *arbitrary* radial size lands here. `mask-radial-closest-side`
    /// is `MaskRadialSize` instead and paints nothing alone, which is
    /// Tailwind's own split: it emits no rule at all for the named form and
    /// a whole gradient for the bracketed one.
    MaskSlotArgument(MaskSlot, Angle),
    /// `mask-circle`/`mask-ellipse`, `mask-radial-closest-side`, and
    /// `mask-radial-at-*`. Each paints nothing alone -- they only shape a
    /// radial gradient some other utility supplies.
    MaskRadialShape(&'static str),
    MaskRadialSize(String),
    MaskRadialPosition(&'static str),
    MaskComposite(&'static str),
    ScrollbarWidth(&'static str),
    ScrollbarGutter(&'static str),
    /// `scrollbar-thumb-*` / `scrollbar-track-*`. Two utilities that write
    /// one `scrollbar-color: <thumb> <track>`, so they compose in the
    /// backend the way ring and mask layers do. An unset half is
    /// transparent, matching Tailwind's register default.
    ScrollbarThumbColor(Color),
    ScrollbarTrackColor(Color),
    /// The remaining one-property spacing families. Nothing subtle in any
    /// of them -- they were simply unimplemented.
    FlexBasis(Dimension),
    BlockSize(Dimension),
    InlineSize(Dimension),
    MaxBlockSize(Dimension),
    MaxInlineSize(Dimension),
    MinBlockSize(Dimension),
    MinInlineSize(Dimension),
    TextIndent(Dimension),
    /// `border-spacing` is one property taking a horizontal and a vertical
    /// value, so `border-spacing-x-*` and `-y-*` compose into it.
    BorderSpacingX(Dimension),
    BorderSpacingY(Dimension),
    /// Block-axis logical margins and paddings. Emitted as the logical CSS
    /// longhands on Web to match Tailwind exactly; the Native backend folds
    /// them to top/bottom, which is the horizontal-writing-mode assumption
    /// it already makes for `py-*`.
    MarginBlockStart(Dimension),
    MarginBlockEnd(Dimension),
    PaddingBlockStart(Length),
    PaddingBlockEnd(Length),
    /// `scroll-m-*` / `scroll-p-*`.
    ///
    /// These carry their edge rather than getting a variant each, unlike
    /// the per-side padding/margin/border-colour properties above: there
    /// are eleven edges and two families, so spelling them out would be 22
    /// variants and 66 match arms for one fairly niche corner of CSS.
    /// `dedupe_key` is what makes that safe -- see its doc comment.
    ScrollMargin(Edge, Length),
    ScrollPadding(Edge, Length),
    /// `scroll-smooth`/`scroll-auto`. One variant covering both values, not
    /// a `Smooth` marker: the two are the same CSS property, and splitting
    /// them across a variant and a `Keyword` would stop them overriding
    /// each other -- see `StyleProperty::Keyword`.
    ScrollBehavior(&'static str),
    /// SVG paint, plus the handful of colour properties that are neither
    /// text nor background. All plain declarations -- the work here was
    /// recognising the utilities, not lowering them.
    Fill(Color),
    Stroke(Color),
    StrokeWidth(f64),
    AccentColor(Color),
    CaretColor(Color),
    TextDecorationColor(Color),
    TextDecorationStyle(DecorationStyle),
    TextDecorationThickness(Length),
    /// `placeholder-*`. Scoped to the `::placeholder` pseudo-element, not
    /// the element itself -- so it gets its own rule, the same way
    /// `divide-*`/`space-*` do. Emitting it as a plain `color` would tint
    /// the real text instead, and would still *compare* equal to Tailwind,
    /// since the difference lives in the selector rather than the
    /// declaration.
    PlaceholderColor(Color),
    OutlineWidth(Length),
    OutlineStyle(BorderStyle),
    OutlineColor(Color),
    OutlineOffset(Length),
    /// `divide-*`: like `space-*`, these style the element's *children*
    /// rather than the element itself. Web emits a second rule with a
    /// child-scoped selector; Native has no selector engine and instead
    /// hands the style to `HozoSpaced`, which distributes it over the
    /// children at render time. Both target every child but the last.
    DivideX(Dimension),
    DivideY(Dimension),
    DivideColor(Color),
    DivideStyle(BorderStyle),
    /// `space-*-reverse` / `divide-*-reverse`: which edge of each child
    /// carries the gap.
    ///
    /// A separate utility from the width, and a composition like every
    /// other one here: `space-y-1` writes both edges, zeroing the leading
    /// one, precisely so this can flip them without a second rule. Both
    /// backends already emitted the zero side and said in a comment that
    /// it was for the reverse form -- which did not exist yet, and which
    /// nothing measured, because one utility on its own paints nothing and
    /// the other was never paired with it.
    SpaceReverse(Axis),
    DivideReverse(Axis),
    SpaceX(Dimension),
    SpaceY(Dimension),
    TextAlign(TextAlign),
    TextTransform(TextTransform),
    TextColor(Color),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FlexDirection {
    Row,
    Column,
    RowReverse,
    ColumnReverse,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum FlexShorthand {
    Initial,
    Auto,
    None,
    Grow(f64),
    /// `flex-1/2`. Kept as the authored fraction, not folded to a
    /// percentage: Tailwind emits `calc(1/2 * 100%)` and the division is
    /// what keeps thirds exact rather than 33.33333333333333%.
    Fraction(u32, u32),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Align {
    Start,
    Center,
    End,
    Stretch,
    Baseline,
    /// The values React Native's alignment unions don't have: `normal`,
    /// and the `safe` overflow-alignment forms.
    Css(&'static str),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Justify {
    Start,
    Center,
    End,
    Between,
    Around,
    Evenly,
    /// `align-content` takes these and `justify-content` doesn't, on both
    /// platforms -- the two share this enum, so which one is legal is
    /// decided per property in `unsupported_on_native`.
    Stretch,
    Baseline,
    /// See `Align::Css`.
    Css(&'static str),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Position {
    Relative,
    Absolute,
    /// React Native has this too, and means what CSS means by it: the
    /// element is not a containing block for absolutely positioned
    /// descendants. Refusing it was wrong, and the refusal audit said so.
    Static,
    /// `fixed` and `sticky`, which React Native has no equivalent for.
    Css(&'static str),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Display {
    Flex,
    None,
    Contents,
    // A visible Yoga node is necessarily a flex container, so CSS block
    // lowers to display:flex. Inline-flex is approximated by the Native
    // backend with a flex container whose default alignSelf is flex-start;
    // Yoga still has no actual inline formatting context. Grid requires a
    // layout primitive Yoga does not implement.
    Block,
    InlineFlex,
    Grid,
    /// The rest of CSS's display keywords, as authored. Grouped rather than
    /// enumerated because Yoga implements none of them, so the only thing
    /// the Native backend does with any of them is name it in a refusal --
    /// there is no per-keyword behaviour to model.
    Css(&'static str),
}

impl Display {
    /// Whether React Native can express this at all -- see the variants'
    /// own note.
    pub fn is_supported_on_native(self) -> bool {
        matches!(
            self,
            Display::Flex
                | Display::Block
                | Display::InlineFlex
                | Display::None
                | Display::Contents
        )
    }
}

impl StyleProperty {
    /// `Some(description)` when React Native has no way to express this, so
    /// the Native backend can refuse it by name instead of dropping it. Kept
    /// here rather than in that backend so every such case is listed in one
    /// place as more are found.
    /// `Some(reason)` when React Native *could* express this and Hozo
    /// doesn't lower it yet -- `DiagnosticCode::NotWiredOnNative` rather
    /// than `WebOnlyPropertyOnNative`.
    ///
    /// Checked before `unsupported_on_native`, and separate from it because
    /// the two make different claims. Conflating them is not harmless: the
    /// refusal audit checks the Web-only claims against React Native's own
    /// types, and a gap filed as impossible is a gap nobody revisits.
    ///
    /// Only the cases decidable from the property alone live here. A gap
    /// that depends on the rest of the element -- a `leading-*` ratio with
    /// no font size beside it -- is decided in `hozo_native`, which can see
    /// the node.
    pub fn not_wired_on_native(&self) -> Option<String> {
        match self {
            // `placeholder-*` used to live here. It lowers now: React Native
            // carries that colour as `placeholderTextColor` on `TextInput`,
            // and `TextInput` exists. What remains is the case where it is
            // written on something that isn't one, which `hozo_native`
            // decides because it can see the node.
            _ => None,
        }
    }

    /// The `Dimension` this property carries, if it carries one.
    ///
    /// Exists so `unsupported_on_native` can ask about a *value* once
    /// instead of per property. Every size utility takes the same value
    /// vocabulary, so a value React Native can't hold (`fit-content`,
    /// `100dvh`) is unusable on all of them -- and listing the properties
    /// one at a time is how the last batch of those came to be dropped in
    /// silence rather than refused.
    /// The unit standing between this property's length and a pixel
    /// value, when one does.
    ///
    /// `Length::unresolved_unit` has existed for this since it was
    /// written and had no callers at all, so nothing ever asked. What
    /// happened instead is worse than a refusal: `Length::px` ends in
    /// `unwrap_or(0.0)`, so `p-[1.5em]` and `p-[100vh]` compiled to a
    /// padding of **zero** on React Native, with no diagnostic. A wrong
    /// number is not something the silence check can see -- a style was
    /// emitted -- and there is no oracle for the Native side to compare it
    /// against, so nothing in the report could have caught it either.
    ///
    /// `em` is answerable where a font size is on the same element and
    /// `vh`/`vw` where the viewport hook is in play; both of those resolve
    /// before this is asked. What reaches here is a length with nothing to
    /// resolve it against.
    pub fn unresolved_length_unit(&self) -> Option<LengthUnit> {
        self.length().and_then(Length::unresolved_unit)
    }

    /// The CSS expression this property's length is, when it is one.
    ///
    /// The other half of the same question `unresolved_length_unit` asks,
    /// split out because the answers are not interchangeable: a unit can
    /// sometimes be supplied from context, and `calc(100% - 2rem)` never
    /// can. Native refuses on this before it looks at units at all.
    pub fn css_expression_length(&self) -> Option<&str> {
        self.length().and_then(Length::css_expression)
    }

    /// The length this property carries, wherever it keeps it.
    ///
    /// Six shapes hold one, and `value()` is what knows which: the
    /// `Dimension`-typed properties, the ones typed directly as a length,
    /// and the three small enums that wrap one alongside something that is
    /// not a length at all -- a radius that may be `Full`, a line height
    /// that may be a ratio, a letter spacing that may be an `em`.
    ///
    /// The wildcard below is safe in a way the one this replaced was not.
    /// It falls through the seven kinds of value a property can hold, not
    /// the two hundred properties there are; a new property cannot reach it
    /// without `value()` having classified it first, and `value()` does not
    /// compile until someone does.
    fn length(&self) -> Option<&Length> {
        match self.value() {
            PropertyValue::Length(length) => Some(length),
            PropertyValue::Dimension(Dimension::Length(length)) => Some(length),
            PropertyValue::Radius(Radius::Length(length)) => Some(length),
            PropertyValue::LineHeight(LineHeight::Length(length)) => Some(length),
            PropertyValue::LetterSpacing(LetterSpacing::Px(length)) => Some(length),
            _ => None,
        }
    }

    /// The `Dimension` this property carries, if it carries one.
    ///
    /// Exists so `unsupported_on_native` can ask about a *value* once
    /// instead of per property. Every size utility takes the same value
    /// vocabulary, so a value React Native can't hold (`fit-content`,
    /// `100dvh`) is unusable on all of them.
    pub fn dimension(&self) -> Option<&Dimension> {
        match self.value() {
            PropertyValue::Dimension(dimension) => Some(dimension),
            _ => None,
        }
    }

    /// What this property holds, as a borrowed view.
    ///
    /// One list, and the only one. Three functions used to answer this
    /// question with three hand-written lists of variants, each ending in a
    /// `_ => None` that let a new property escape all of them -- and every
    /// one of the three was wrong at some point:
    ///
    /// - `dimension()` covered 17 of the 42 that carry one, so
    ///   `bottom-[calc(100%-2rem)]` was never refused and emitted nothing.
    /// - The direct length list did not exist until `p-[1.5em]` was found
    ///   compiling to a padding of **zero** on React Native, silently:
    ///   `Length::px` ends in `unwrap_or(0.0)`, and a wrong number looks
    ///   exactly like a right one.
    /// - It then still missed the three wrappers, so `rounded-[1.5em]` did
    ///   the same thing to a radius, months later.
    ///
    /// Three incidents of one shape: a list beside an enum of two hundred
    /// variants goes stale, and nothing says so, because adding a variant
    /// compiles.
    ///
    /// This match has no wildcard. Adding a variant to `StyleProperty` now
    /// fails to build until it is classified here, and every question about
    /// a property's value is asked through this instead of listing
    /// properties again. `unsupported_on_native` is deliberately left
    /// alone: its wildcards mean "nothing here is a problem on Native",
    /// which is a judgement about the platform rather than a fact about the
    /// shape of a variant, and mixing the two would make it unclear which
    /// kind of completeness the compiler was checking.
    pub fn value(&self) -> PropertyValue<'_> {
        match self {
            StyleProperty::MarginTop(v)
            | StyleProperty::MarginRight(v)
            | StyleProperty::MarginBottom(v)
            | StyleProperty::MarginLeft(v)
            | StyleProperty::MarginInlineStart(v)
            | StyleProperty::MarginInlineEnd(v)
            | StyleProperty::Width(v)
            | StyleProperty::Height(v)
            | StyleProperty::MinWidth(v)
            | StyleProperty::MinHeight(v)
            | StyleProperty::MaxWidth(v)
            | StyleProperty::MaxHeight(v)
            | StyleProperty::TextUnderlineOffset(v)
            | StyleProperty::InsetTop(v)
            | StyleProperty::InsetRight(v)
            | StyleProperty::InsetBottom(v)
            | StyleProperty::InsetLeft(v)
            | StyleProperty::InsetInlineStart(v)
            | StyleProperty::InsetInlineEnd(v)
            | StyleProperty::InsetInline(v)
            | StyleProperty::InsetBlock(v)
            | StyleProperty::InsetBlockStart(v)
            | StyleProperty::InsetBlockEnd(v)
            | StyleProperty::TranslateX(v)
            | StyleProperty::TranslateY(v)
            | StyleProperty::TranslateZ(v)
            | StyleProperty::GradientStopPosition(_, v)
            | StyleProperty::MaskStopPosition(_, _, v)
            | StyleProperty::FlexBasis(v)
            | StyleProperty::BlockSize(v)
            | StyleProperty::InlineSize(v)
            | StyleProperty::MaxBlockSize(v)
            | StyleProperty::MaxInlineSize(v)
            | StyleProperty::MinBlockSize(v)
            | StyleProperty::MinInlineSize(v)
            | StyleProperty::TextIndent(v)
            | StyleProperty::BorderSpacingX(v)
            | StyleProperty::BorderSpacingY(v)
            | StyleProperty::MarginBlockStart(v)
            | StyleProperty::MarginBlockEnd(v)
            | StyleProperty::DivideX(v)
            | StyleProperty::DivideY(v)
            | StyleProperty::SpaceX(v)
            | StyleProperty::SpaceY(v) => PropertyValue::Dimension(v),

            StyleProperty::Gap(v)
            | StyleProperty::RowGap(v)
            | StyleProperty::ColumnGap(v)
            | StyleProperty::PaddingTop(v)
            | StyleProperty::PaddingRight(v)
            | StyleProperty::PaddingBottom(v)
            | StyleProperty::PaddingLeft(v)
            | StyleProperty::PaddingInlineStart(v)
            | StyleProperty::PaddingInlineEnd(v)
            | StyleProperty::BorderLogicalWidth(_, v)
            | StyleProperty::BorderTopWidth(v)
            | StyleProperty::BorderRightWidth(v)
            | StyleProperty::BorderBottomWidth(v)
            | StyleProperty::BorderLeftWidth(v)
            | StyleProperty::RingWidth(v)
            | StyleProperty::InsetRingWidth(v)
            | StyleProperty::RingOffsetWidth(v)
            | StyleProperty::FontSize(v)
            | StyleProperty::PaddingBlockStart(v)
            | StyleProperty::PaddingBlockEnd(v)
            | StyleProperty::ScrollMargin(_, v)
            | StyleProperty::ScrollPadding(_, v)
            | StyleProperty::TextDecorationThickness(v)
            | StyleProperty::OutlineWidth(v)
            | StyleProperty::OutlineOffset(v) => PropertyValue::Length(v),

            StyleProperty::BorderRadius(v)
            | StyleProperty::BorderTopLeftRadius(v)
            | StyleProperty::BorderTopRightRadius(v)
            | StyleProperty::BorderBottomRightRadius(v)
            | StyleProperty::BorderBottomLeftRadius(v)
            | StyleProperty::BorderStartStartRadius(v)
            | StyleProperty::BorderStartEndRadius(v)
            | StyleProperty::BorderEndStartRadius(v)
            | StyleProperty::BorderEndEndRadius(v) => PropertyValue::Radius(v),

            StyleProperty::LineHeight(v) => PropertyValue::LineHeight(v),

            StyleProperty::LetterSpacing(v) => PropertyValue::LetterSpacing(v),

            StyleProperty::BackgroundColor(v)
            | StyleProperty::BorderColor(v)
            | StyleProperty::BorderTopColor(v)
            | StyleProperty::BorderRightColor(v)
            | StyleProperty::BorderBottomColor(v)
            | StyleProperty::BorderLeftColor(v)
            | StyleProperty::BorderInlineColor(v)
            | StyleProperty::BorderBlockColor(v)
            | StyleProperty::BorderInlineStartColor(v)
            | StyleProperty::BorderInlineEndColor(v)
            | StyleProperty::BorderBlockStartColor(v)
            | StyleProperty::BorderBlockEndColor(v)
            | StyleProperty::RingColor(v)
            | StyleProperty::InsetRingColor(v)
            | StyleProperty::RingOffsetColor(v)
            | StyleProperty::ShadowColor(v)
            | StyleProperty::InsetShadowColor(v)
            | StyleProperty::DropShadowColor(v)
            | StyleProperty::TextShadowColor(v)
            | StyleProperty::GradientStopColor(_, v)
            | StyleProperty::MaskStopColor(_, _, v)
            | StyleProperty::ScrollbarThumbColor(v)
            | StyleProperty::ScrollbarTrackColor(v)
            | StyleProperty::Fill(v)
            | StyleProperty::Stroke(v)
            | StyleProperty::AccentColor(v)
            | StyleProperty::CaretColor(v)
            | StyleProperty::TextDecorationColor(v)
            | StyleProperty::PlaceholderColor(v)
            | StyleProperty::OutlineColor(v)
            | StyleProperty::DivideColor(v)
            | StyleProperty::TextColor(v) => PropertyValue::Color(v),

            StyleProperty::Display(..)
            | StyleProperty::FlexDirection(..)
            | StyleProperty::Flex(..)
            | StyleProperty::AlignItems(..)
            | StyleProperty::AlignSelf(..)
            | StyleProperty::AlignContent(..)
            | StyleProperty::JustifyContent(..)
            | StyleProperty::ZIndex(..)
            | StyleProperty::Order(..)
            | StyleProperty::Cursor(..)
            | StyleProperty::Columns(..)
            | StyleProperty::RotateNone
            | StyleProperty::ScaleNone
            | StyleProperty::TranslateNone
            | StyleProperty::TransformNone
            | StyleProperty::TransformEmpty
            | StyleProperty::TransformGpu
            | StyleProperty::Transform(..)
            | StyleProperty::TransformOrigin(..)
            | StyleProperty::LineClamp(..)
            | StyleProperty::FlexGrow(..)
            | StyleProperty::FlexShrink(..)
            | StyleProperty::AspectRatio(..)
            | StyleProperty::BorderLogicalStyle(..)
            | StyleProperty::OverflowX(..)
            | StyleProperty::OverflowY(..)
            | StyleProperty::ObjectFit(..)
            | StyleProperty::UserSelect(..)
            | StyleProperty::TextDecorationLine(..)
            | StyleProperty::MixBlendMode(..)
            | StyleProperty::BackgroundBlendMode(..)
            | StyleProperty::KeywordPair(..)
            | StyleProperty::ContainerName(..)
            | StyleProperty::Content(..)
            | StyleProperty::Keyword(..)
            | StyleProperty::Arbitrary(..)
            | StyleProperty::GridTemplateColumns(..)
            | StyleProperty::GridTemplateRows(..)
            | StyleProperty::GridColumnStart(..)
            | StyleProperty::GridColumnEnd(..)
            | StyleProperty::GridRowStart(..)
            | StyleProperty::GridRowEnd(..)
            | StyleProperty::GridColumn(..)
            | StyleProperty::GridRow(..)
            | StyleProperty::Position(..)
            | StyleProperty::Opacity(..)
            | StyleProperty::BorderTopStyle(..)
            | StyleProperty::BorderRightStyle(..)
            | StyleProperty::BorderBottomStyle(..)
            | StyleProperty::BorderLeftStyle(..)
            | StyleProperty::Rotate(..)
            | StyleProperty::ScaleX(..)
            | StyleProperty::ScaleY(..)
            | StyleProperty::ScaleZ(..)
            | StyleProperty::Scale3d
            | StyleProperty::RotateX(..)
            | StyleProperty::RotateY(..)
            | StyleProperty::RotateZ(..)
            | StyleProperty::SkewX(..)
            | StyleProperty::SkewY(..)
            | StyleProperty::BoxShadow(..)
            | StyleProperty::InsetShadow(..)
            | StyleProperty::ScrollSnapType(..)
            | StyleProperty::ScrollSnapStrictness(..)
            | StyleProperty::RingInset
            | StyleProperty::TextShadow(..)
            | StyleProperty::Filter(..)
            | StyleProperty::FilterRaw(..)
            | StyleProperty::BackdropFilter(..)
            | StyleProperty::FontWeight(..)
            | StyleProperty::FontFamily(..)
            | StyleProperty::FontVariant(..)
            | StyleProperty::Overflow(..)
            | StyleProperty::TextOverflow(..)
            | StyleProperty::WhiteSpace(..)
            | StyleProperty::TransitionProperty(..)
            | StyleProperty::TransitionDuration(..)
            | StyleProperty::TransitionTimingFunction(..)
            | StyleProperty::Animation(..)
            | StyleProperty::BackgroundImageNone
            | StyleProperty::BackgroundImage(..)
            | StyleProperty::Gradient(..)
            | StyleProperty::MaskClip(..)
            | StyleProperty::MaskOrigin(..)
            | StyleProperty::MaskMode(..)
            | StyleProperty::MaskType(..)
            | StyleProperty::MaskSize(..)
            | StyleProperty::MaskPosition(..)
            | StyleProperty::MaskRepeat(..)
            | StyleProperty::MaskImageNone
            | StyleProperty::MaskSlotArgument(..)
            | StyleProperty::MaskRadialShape(..)
            | StyleProperty::MaskRadialSize(..)
            | StyleProperty::MaskRadialPosition(..)
            | StyleProperty::MaskComposite(..)
            | StyleProperty::ScrollbarWidth(..)
            | StyleProperty::ScrollbarGutter(..)
            | StyleProperty::ScrollBehavior(..)
            | StyleProperty::StrokeWidth(..)
            | StyleProperty::TextDecorationStyle(..)
            | StyleProperty::OutlineStyle(..)
            | StyleProperty::DivideStyle(..)
            | StyleProperty::SpaceReverse(..)
            | StyleProperty::DivideReverse(..)
            | StyleProperty::TextAlign(..)
            | StyleProperty::TextTransform(..) => PropertyValue::Other,
        }
    }

    pub fn unsupported_on_native(&self) -> Option<String> {
        // A length with nothing to resolve it against. Asked before the
        // property match because it is about the value rather than the
        // property: an `em` is unresolvable in a padding for the same
        // reason it is in a border width.
        //
        // What this replaces is not a gap but a wrong answer. `Length::px`
        // ends in `unwrap_or(0.0)`, so `p-[1.5em]` compiled to a padding
        // of zero and said nothing -- and a wrong number is invisible to
        // the silence check, since a style *was* emitted.
        // Before the unit question, because the two are not alternatives:
        // `calc(100% - 2rem)` may contain no unit at all, or several, and
        // naming one of them would describe the wrong obstacle. The
        // arithmetic is against layout state, which a `StyleSheet` computed
        // ahead of time does not have.
        if let Some(css) = self.css_expression_length() {
            return Some(format!(
                "`{css}`: a CSS expression is resolved against layout, and a React Native style \
                 is a value decided before there is any -- so there is nothing here to compute \
                 it from, and computing it to zero is a size that looks deliberate"
            ));
        }
        if let Some(unit) = self.unresolved_length_unit() {
            return Some(format!(
                "`{unit:?}`: React Native has no viewport units and no font-relative lengths \
                 outside text, so there is nothing here to resolve this against -- and resolving \
                 it to zero, which is what happened before this refusal existed, is a layout \
                 that looks deliberate"
            ));
        }
        // An arbitrary value is a CSS property written out by name, and
        // React Native's style keys are a different vocabulary -- there is
        // no rule that turns one into the other, and guessing a camelCase
        // spelling would produce a key the platform ignores.
        //
        // The Native emitter said this was "refused upstream by
        // `unsupported_on_native`" and it was not: nothing refused it, and
        // `animate-[wiggle_1s_infinite]` compiled to an empty style object
        // with no diagnostic at all. That is the "silent" category the
        // conformance report keeps at zero, and the report did not see it
        // because the arbitrary catalogue is checked for *fidelity* on Web
        // and never for silence on Native.
        if let StyleProperty::Arbitrary(property, value) = self {
            return Some(format!(
                "`{property}: {value}`: an arbitrary value is a CSS property by name, and React \
                 Native's style keys are a different vocabulary -- there is nothing to translate \
                 it into"
            ));
        }
        // Asked before the property-by-property match: a value React Native
        // has no way to hold is unusable whichever size carries it.
        if let Some(Dimension::Css(value)) = self.dimension() {
            return Some(format!(
                "`{value}`: React Native has no intrinsic sizing and no viewport unit that tracks \
                 browser chrome -- there is nothing to resolve it against"
            ));
        }
        // Viewport-relative sizes were refused here until 2026-08-15. They
        // are not impossible on React Native, only impossible *statically*:
        // the value changes when the device rotates, so it can't live in a
        // `StyleSheet.create` object. The Native backend lowers them to an
        // inline style read from a hook -- see
        // `hozo_native::viewport_object`.
        match self {
            StyleProperty::Content(_) => Some(
                "`content-*`: React Native has no generated content. `::before` and `::after` are boxes the browser makes, and there is nothing here to make one"
                    .to_string(),
            ),
            StyleProperty::Display(d) if !d.is_supported_on_native() => Some(format!(
                "`display: {}`: React Native's layout engine supports only flex, none and contents",
                match d {
                    Display::Block => "block",
                    Display::InlineFlex => "inline-flex",
                    Display::Grid => "grid",
                    Display::Css(keyword) => keyword,
                    _ => unreachable!("guarded by is_supported_on_native"),
                }
            )),
            StyleProperty::GridTemplateColumns(_)
            | StyleProperty::GridTemplateRows(_)
            | StyleProperty::GridColumnStart(_)
            | StyleProperty::GridColumnEnd(_)
            | StyleProperty::GridRowStart(_)
            | StyleProperty::GridRowEnd(_)
            | StyleProperty::GridColumn(_)
            | StyleProperty::GridRow(_) => {
                Some(
                    "grid placement has no standalone React Native style; use it inside a supported Hozo grid container"
                        .to_string(),
                )
            }
            StyleProperty::Order(_) => Some(
                "`order-*`: Yoga lays children out in tree order and has no flex `order`, so the \
                 only way to reorder on React Native is to reorder the elements"
                    .to_string(),
            ),
            StyleProperty::Position(Position::Css(value)) => Some(format!(
                "`position: {value}`: React Native's position is relative or absolute"
            )),
            StyleProperty::RotateNone
            | StyleProperty::ScaleNone
            | StyleProperty::TranslateNone
            | StyleProperty::TransformNone
            | StyleProperty::TransformEmpty
            | StyleProperty::TransformGpu => Some(
                "`rotate-none`/`scale-none`/`translate-none`/`transform-none`: React Native builds 
                 one transform array, so there is no property to switch off -- omit the transform 
                 instead"
                    .to_string(),
            ),
            StyleProperty::Flex(FlexShorthand::Fraction(n, d)) => Some(format!(
                "`flex-{n}/{d}`: React Native's `flex` is a grow factor, not a fraction of the 
                 parent -- use a percentage width instead"
            )),
            // Scale3d is metadata selecting the three-axis form. Native
            // lowers its Z component through RN's supported 4x4 matrix.
            StyleProperty::Scale3d => None,
            // The arbitrary transform cases. React Native's transform
            // array takes numbers -- a rotation is a number of degrees and
            // a scale is a ratio -- so a value that stayed CSS text has
            // nothing to become. Named here rather than left out of the
            // composed `transform`, which is where it would otherwise
            // vanish without a word.
            StyleProperty::Rotate(Angle::Css(value))
            | StyleProperty::RotateX(Angle::Css(value))
            | StyleProperty::RotateY(Angle::Css(value))
            | StyleProperty::RotateZ(Angle::Css(value))
            | StyleProperty::SkewX(Angle::Css(value))
            | StyleProperty::SkewY(Angle::Css(value)) => Some(format!(
                "`[{value}]`: React Native's transform takes a number of degrees, and this is CSS \
                 text that only a browser can resolve to one"
            )),
            StyleProperty::ScaleX(Scale::Css(value))
            | StyleProperty::ScaleY(Scale::Css(value))
            | StyleProperty::ScaleZ(Scale::Css(value)) => {
                Some(format!(
                    "`[{value}]`: React Native's scale is a ratio, and this is CSS text that only \
                     a browser can resolve to one"
                ))
            }
            StyleProperty::LineClamp(Some(Clamp::Css(value))) => Some(format!(
                "`line-clamp-[{value}]`: React Native's numberOfLines is a line count, and this \
                 isn't one"
            )),
            // React Native's `backgroundImage` parses CSS gradient syntax,
            // but only the linear and radial functions -- `BackgroundImageValue`
            // is `LinearGradientValue | RadialGradientValue` and there is no
            // conic one.
            StyleProperty::Gradient(GradientKind::Conic, _) => Some(
                "`bg-conic-*`: React Native's backgroundImage has linear and radial gradients \
                 and no conic one"
                    .to_string(),
            ),
            StyleProperty::ZIndex(None) => Some(
                "`z-auto`: React Native's zIndex is a number and has no auto".to_string(),
            ),
            StyleProperty::AspectRatio("auto") => Some(
                "`aspect-auto`: React Native's aspectRatio is a number and has no auto".to_string(),
            ),
            StyleProperty::Columns(_) => {
                Some("`columns-*`: React Native has no multi-column layout".to_string())
            }
            // A CSS value React Native's union for that property doesn't
            // have. Each one is a genuine keyword there is no equivalent
            // for -- `overflow: clip`, `justify-content: safe center` --
            // rather than a spelling difference, so approximating would
            // change the layout rather than the text.
            StyleProperty::Overflow(Overflow::Css(value)) => Some(format!(
                "`overflow: {value}`: React Native's overflow is visible, hidden or scroll"
            )),
            StyleProperty::AlignItems(Align::Css(value))
            | StyleProperty::AlignContent(Justify::Css(value))
            | StyleProperty::JustifyContent(Justify::Css(value)) => Some(format!(
                "`{value}` alignment: React Native's alignment values don't include it"
            )),
            // RN's alignContent has stretch but not baseline; its
            // justifyContent has neither. The two share `Justify`, so the
            // legality is per property rather than per value.
            StyleProperty::AlignContent(Justify::Baseline) => Some(
                "`content-baseline`: React Native's alignContent has no baseline".to_string(),
            ),
            StyleProperty::JustifyContent(Justify::Stretch | Justify::Baseline) => Some(
                "`justify-stretch`/`justify-baseline`: React Native's justifyContent has neither"
                    .to_string(),
            ),
            StyleProperty::AlignSelf(AlignSelf::Css(value)) => Some(format!(
                "`self-{value}`: React Native's alignSelf values don't include it"
            )),
            StyleProperty::WhiteSpace(WhiteSpace::Css(value)) => Some(format!(
                "`white-space: {value}`: React Native's Text has no white-space control beyond \
                 wrapping"
            )),
            // React Native has only the combined `overflow`.
            StyleProperty::OverflowX(_) | StyleProperty::OverflowY(_) => Some(
                "`overflow-x-*`/`overflow-y-*`: React Native has one `overflow` for both axes"
                    .to_string(),
            ),
            StyleProperty::TextDecorationLine("overline") => Some(
                "`overline`: React Native's textDecorationLine has underline and line-through, \
                 not overline"
                    .to_string(),
            ),
            // The long tail. React Native has three of these properties and
            // none of the rest -- checked against its own StyleSheet types
            // rather than assumed, the same way the refusal audit checks
            // everything else here.
            StyleProperty::KeywordPair(_, _, property, _) => {
                Some(format!("`{property}`: React Native has no such style"))
            }
            // Two keyword properties React Native has but narrower than CSS.
            // Found by type-checking the emitted styles against RN rather
            // than by reading its docs -- the allowlist above only asked
            // whether the *property* exists.
            StyleProperty::Keyword("vertical-align", value)
                if !matches!(*value, "auto" | "top" | "bottom" | "middle") =>
            {
                Some(format!(
                    "`align-{value}`: React Native's verticalAlign is auto, top, bottom or middle"
                ))
            }
            // The colour half of a family whose other half React Native
            // does not have. `text-shadow` is refused by the keyword arm
            // below and the colour has to be refused with it, or a rule
            // that says nothing on Native would quietly say nothing *and*
            // report nothing.
            // Was refused by the keyword arm below until it stopped being
            // a keyword; naming it here keeps the refusal it always had.
            StyleProperty::ScrollSnapType(_) | StyleProperty::ScrollSnapStrictness(_) => Some(
                "`snap-*`: React Native scroll-snaps through ScrollView's own props, not \
                 through a style"
                    .to_string(),
            ),
            StyleProperty::TextShadow(_) | StyleProperty::TextShadowColor(_) => Some(
                "`text-shadow-*`: React Native has textShadowColor, textShadowOffset and \
                 textShadowRadius on Text and no way to write more than one layer, which is \
                 what every size in this scale is"
                    .to_string(),
            ),
            StyleProperty::MixBlendMode("plus-darker") => Some(
                "`mix-blend-plus-darker`: React Native's blend modes have plus-lighter and not plus-darker"
                    .to_string(),
            ),
            StyleProperty::Keyword(property, _)
                if !matches!(*property, 
                    "user-select"
                        | "vertical-align"
                        | "transform-origin"
                        | "backface-visibility"
                        | "box-sizing"
                        | "isolation"
                        | "pointer-events"
                        | "font-style"
                        | "direction"
                        | "flex-wrap"
                        // Not a style on React Native, and not refused
                        // either: `@container` is honoured by rendering
                        // the element as a component that measures itself.
                        // The declaration is consumed there rather than
                        // emitted, the way the grid utilities are.
                        | "container-type"
                ) =>
            {
                Some(format!("`{property}`: React Native has no such style"))
            }
            StyleProperty::BackgroundBlendMode(_) => Some(
                "`bg-blend-*`: React Native has `mixBlendMode` but no background-blend-mode -- there is no separate background layer there to blend against"
                    .to_string(),
            ),
            // `filter` is real on React Native; `backdrop-filter` is not --
            // there is no such style key, and blurring what is *behind* a
            // view needs a native blur component (`@react-native-community/
            // blur`, Expo's BlurView) rather than a style.
            StyleProperty::BackdropFilter(..) => Some(
                "`backdrop-*`: React Native has no backdrop-filter style -- blurring what's \
                 behind a view needs a native blur component"
                    .to_string(),
            ),
            // React Native's `cursor` is real but narrow: `auto` and
            // `pointer` only, which is what a pointer-capable target
            // (tablet with a trackpad, macOS/Windows/visionOS) can act on.
            // The rest are refused by name rather than silently flattened
            // to `pointer`, which would claim an affordance the app doesn't
            // have.
            StyleProperty::Cursor(keyword) if keyword != "auto" && keyword != "pointer" => {
                Some(format!(
                    "`cursor-{keyword}`: React Native's cursor accepts only `auto` and `pointer`"
                ))
            }
            // `letter-spacing` in em and a unitless `line-height` are
            // deliberately absent here even though React Native has neither
            // form as a style. Both are relative to the font size, and when
            // a font size is set on the same element the compiler can
            // resolve them -- so whether they're expressible depends on the
            // node, which this method can't see. `hozo_native`'s
            // `font_relative_reason` answers it for the cases it can't fold.
            // `text-overflow` and `white-space: nowrap` are deliberately
            // absent here even though React Native has neither as a style.
            // Together they describe truncation, which RN expresses as
            // `numberOfLines`/`ellipsizeMode` *props* on `Text` -- so
            // whether they're supportable depends on the node they're on,
            // which this function can't see. `hozo_native` decides,
            // absorbing them into props where it can and refusing them
            // where it can't.
            StyleProperty::TransitionProperty(_)
            | StyleProperty::TransitionDuration(..)
            | StyleProperty::TransitionTimingFunction(..) => Some(
                "CSS transitions: React Native has no declarative transition in its StyleSheet"
                    .to_string(),
            ),
            // All four of Tailwind's loops are wired now. They move only
            // opacity and transform, which is what let them share one
            // native-driver hook -- and what keeps them running on the UI
            // thread while JavaScript is busy, the moment a spinner or a
            // skeleton is usually on screen.
            StyleProperty::Animation(_) => None,
            // Paint on an SVG element is lowered as a *prop*, which is
            // where `react-native-svg` takes it -- so it is not refused
            // there. This message is for paint on anything else, where
            // there is no SVG element under it to paint.
            StyleProperty::Fill(_) | StyleProperty::Stroke(_) | StyleProperty::StrokeWidth(_) => {
                Some(
                    "SVG paint on something that is not an SVG element. React Native has no SVG \
                     in core; inside `<Svg>` Hozo lowers this to a `react-native-svg` prop, and \
                     outside one there is nothing for it to paint"
                        .to_string(),
                )
            }
            StyleProperty::AccentColor(_) => Some(
                "`accent-*`: it tints native form controls, which React Native doesn't have"
                    .to_string(),
            ),
            StyleProperty::CaretColor(_) => Some(
                "`caret-*`: React Native carries this on `TextInput`'s `cursorColor` prop, not \
                 in a StyleSheet; a runtime-resolved class has no target primitive to put it on"
                    .to_string(),
            ),
            StyleProperty::MaskClip(_)
            | StyleProperty::MaskOrigin(_)
            | StyleProperty::MaskMode(_)
            | StyleProperty::MaskType(_)
            | StyleProperty::MaskSize(_)
            | StyleProperty::MaskPosition(_)
            | StyleProperty::MaskRepeat(_)
            | StyleProperty::MaskImageNone
            | StyleProperty::MaskStopColor(..)
            | StyleProperty::MaskStopPosition(..)
            | StyleProperty::MaskSlotArgument(..)
            | StyleProperty::MaskRadialShape(_)
            | StyleProperty::MaskRadialSize(_)
            | StyleProperty::MaskRadialPosition(_)
            | StyleProperty::MaskComposite(_) => Some(
                "`mask-*`: React Native has no masking of any kind -- no mask-image, no \
                 mask-clip, nothing to approximate it with"
                    .to_string(),
            ),
            StyleProperty::TranslateZ(_) => Some(
                "`translate-z-*`: React Native's transform has no 3D translation".to_string(),
            ),
            StyleProperty::TextIndent(_) => {
                Some("`indent-*`: React Native has no text-indent".to_string())
            }
            StyleProperty::BorderSpacingX(_) | StyleProperty::BorderSpacingY(_) => Some(
                "`border-spacing-*`: it applies to a separated-border table, which React Native \
                 has no equivalent of"
                    .to_string(),
            ),
            StyleProperty::ScrollbarWidth(_)
            | StyleProperty::ScrollbarGutter(_)
            | StyleProperty::ScrollbarThumbColor(_)
            | StyleProperty::ScrollbarTrackColor(_) => Some(
                "`scrollbar-*`: React Native's scroll indicators are configured with props on \
                 ScrollView (`indicatorStyle`, `showsVerticalScrollIndicator`), not styled"
                    .to_string(),
            ),
            StyleProperty::ScrollMargin(..)
            | StyleProperty::ScrollPadding(..)
            | StyleProperty::ScrollBehavior(_) => Some(
                "`scroll-m-*`/`scroll-p-*`/`scroll-smooth`: these tune CSS scroll-snap and \
                 smooth scrolling, neither of which React Native's ScrollView exposes as a style"
                    .to_string(),
            ),
            StyleProperty::TextDecorationThickness(_) | StyleProperty::TextUnderlineOffset(_) => {
                Some(
                    "`decoration-<n>`/`underline-offset-*`: React Native draws its text \
                     decorations at a fixed thickness and offset, and exposes neither"
                        .to_string(),
                )
            }
            StyleProperty::BorderTopStyle(BorderStyle::Double | BorderStyle::Hidden)
            | StyleProperty::BorderRightStyle(BorderStyle::Double | BorderStyle::Hidden)
            | StyleProperty::BorderBottomStyle(BorderStyle::Double | BorderStyle::Hidden)
            | StyleProperty::BorderLeftStyle(BorderStyle::Double | BorderStyle::Hidden)
            | StyleProperty::OutlineStyle(BorderStyle::Double | BorderStyle::Hidden) => Some(
                "`double`/`hidden` border styles: React Native accepts only solid, dotted and \
                 dashed"
                    .to_string(),
            ),
            StyleProperty::DivideStyle(BorderStyle::Double | BorderStyle::Hidden) => Some(
                "`divide-double`/`divide-hidden`: React Native's borderStyle accepts only solid, \
                 dotted and dashed"
                    .to_string(),
            ),
            _ => None,
        }
    }
}

/// `text-decoration-style`. Its own type rather than `BorderStyle`: the two
/// sets only look alike. Decorations add `double` and `wavy` and have no
/// `none` (that's `text-decoration-line`), and React Native accepts a
/// different subset again.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DecorationStyle {
    Solid,
    Double,
    Dotted,
    Dashed,
    Wavy,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BorderStyle {
    Solid,
    Dashed,
    Dotted,
    /// Real CSS styles React Native has no counterpart for -- its
    /// `borderStyle` accepts solid/dotted/dashed only, so both are refused
    /// there by `unsupported_on_native`.
    Double,
    Hidden,
    None,
}

/// Corner radius. `Full` ("pill shape", Tailwind's `rounded-full`) is its
/// own variant rather than a large `Length`, because it's a distinct
/// intent and the platforms express it differently: CSS has a literal
/// `infinity`, React Native does not and needs a finite stand-in. Baking
/// the finite value into the IR would force the Web backend to emit an
/// approximation of something it can state exactly.
#[derive(Debug, Clone, PartialEq)]
pub enum Radius {
    Length(Length),
    Full,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Length {
    Px(f64),
    /// A count of Tailwind spacing steps: `p-4` is `Spacing(4.0)`.
    ///
    /// Held as the step count rather than the pixels it works out to,
    /// because the step is what the source said and the multiplier is the
    /// project's (`--spacing`, 0.25rem by default). Resolving at parse time
    /// baked the default in, so a project that changed it got the right
    /// number of steps at the wrong size -- silently, since the output was
    /// a perfectly ordinary padding.
    ///
    /// The same reasoning `Color` already followed: keep what was written,
    /// resolve where the theme is.
    Spacing(f64),
    /// A length written with an explicit unit in an arbitrary value:
    /// `w-[2rem]`, `p-[3ch]`, `mt-[1.5em]`.
    ///
    /// The unit is kept rather than converted because Web has to match
    /// Tailwind byte for byte -- `w-[2rem]` is `width: 2rem` there, not
    /// `width: 32px`, and the difference is visible the moment a user
    /// changes their browser's font size. Native converts what it can and
    /// refuses the rest by name; see `LengthUnit::px`.
    Unit(f64, LengthUnit),
    /// A length CSS can state and only a browser can work out:
    /// `ring-[calc(100%-2rem)]`, `text-[min(1rem,2vw)]`.
    ///
    /// The same admission `Dimension::Css` makes, one level down. It exists
    /// because of a specific way its absence went wrong: a value like this
    /// failed `parse_length`, and every caller reads that failure as "then
    /// it must be a colour" -- so `ring-[calc(100%-2rem)]` became a ring
    /// *colour*, a colour alone paints nothing, and the class compiled to
    /// nothing while saying nothing about it.
    ///
    /// Holding the text keeps Web byte-identical to Tailwind, which splices
    /// the expression straight into its own output. Native cannot: the
    /// arithmetic is against layout state a `StyleSheet` does not have, so
    /// it refuses by name.
    ///
    /// This variant is what costs `Length` its `Copy`, and that is the
    /// price of the type staying closed: every consumer is still a `match`
    /// the compiler checks, which was the point of the units being an enum.
    Css(String),
}

/// The CSS length units an arbitrary value may carry.
///
/// A closed set rather than a kept string, so that every consumer is a
/// `match` the compiler checks. The alternative -- holding the unit as
/// text -- pushes the decision to whoever formats the value, and the
/// decision that matters (can React Native express this?) would then be
/// made by string comparison in the one place least able to explain
/// itself.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LengthUnit {
    /// Root-relative. Converted at 16px on Native, the same root size
    /// `@hozo/tailwind` already assumes when it reads `--spacing` out of
    /// a project's `@theme`. Two different answers for one unit inside one
    /// compiler would be worse than one documented assumption.
    Rem,
    /// Font-relative to the element. Folded against a known `font-size` on
    /// Native and refused where there isn't one.
    Em,
    /// Physically fixed ratios to the pixel, defined by CSS itself
    /// (1in = 96px, 1pc = 16px, 1pt = 96/72px, and the metric ones from
    /// 1in = 2.54cm). Converting these is exact arithmetic, not an
    /// assumption, so Native takes them.
    Cm,
    Mm,
    Q,
    In,
    Pt,
    Pc,
    /// Viewport-relative. Web resolves them; Native can, but only through
    /// the runtime viewport hook, so they're handled where that hook is.
    Vw,
    Vh,
    Vmin,
    Vmax,
    /// Resolved from font metrics the compiler doesn't have -- the width of
    /// a `0`, the height of an `x`, the computed line box. Only a browser
    /// knows these, so Native refuses them.
    Ch,
    Ex,
    Cap,
    Ic,
    Lh,
    Rlh,
    /// The viewport units that track browser chrome as it scrolls away.
    /// There is no such chrome on a device, and no static value that would
    /// be right, so these are Web-only.
    Dvh,
    Dvw,
    Lvh,
    Lvw,
    Svh,
    Svw,
}

impl LengthUnit {
    /// The unit as CSS spells it.
    pub fn css(self) -> &'static str {
        match self {
            LengthUnit::Rem => "rem",
            LengthUnit::Em => "em",
            LengthUnit::Cm => "cm",
            LengthUnit::Mm => "mm",
            LengthUnit::Q => "q",
            LengthUnit::In => "in",
            LengthUnit::Pt => "pt",
            LengthUnit::Pc => "pc",
            LengthUnit::Vw => "vw",
            LengthUnit::Vh => "vh",
            LengthUnit::Vmin => "vmin",
            LengthUnit::Vmax => "vmax",
            LengthUnit::Ch => "ch",
            LengthUnit::Ex => "ex",
            LengthUnit::Cap => "cap",
            LengthUnit::Ic => "ic",
            LengthUnit::Lh => "lh",
            LengthUnit::Rlh => "rlh",
            LengthUnit::Dvh => "dvh",
            LengthUnit::Dvw => "dvw",
            LengthUnit::Lvh => "lvh",
            LengthUnit::Lvw => "lvw",
            LengthUnit::Svh => "svh",
            LengthUnit::Svw => "svw",
        }
    }

    /// The unit this text names, or `None` if it isn't a CSS length unit.
    pub fn parse(text: &str) -> Option<LengthUnit> {
        Some(match text.to_ascii_lowercase().as_str() {
            "rem" => LengthUnit::Rem,
            "em" => LengthUnit::Em,
            "cm" => LengthUnit::Cm,
            "mm" => LengthUnit::Mm,
            "q" => LengthUnit::Q,
            "in" => LengthUnit::In,
            "pt" => LengthUnit::Pt,
            "pc" => LengthUnit::Pc,
            "vw" => LengthUnit::Vw,
            "vh" => LengthUnit::Vh,
            "vmin" => LengthUnit::Vmin,
            "vmax" => LengthUnit::Vmax,
            "ch" => LengthUnit::Ch,
            "ex" => LengthUnit::Ex,
            "cap" => LengthUnit::Cap,
            "ic" => LengthUnit::Ic,
            "lh" => LengthUnit::Lh,
            "rlh" => LengthUnit::Rlh,
            "dvh" => LengthUnit::Dvh,
            "dvw" => LengthUnit::Dvw,
            "lvh" => LengthUnit::Lvh,
            "lvw" => LengthUnit::Lvw,
            "svh" => LengthUnit::Svh,
            "svw" => LengthUnit::Svw,
            _ => return None,
        })
    }

    /// How many pixels one of this unit is, where that is knowable without
    /// asking a browser.
    ///
    /// `None` means the unit needs something the compiler doesn't have --
    /// the element's font metrics, or the size of a screen it can't see.
    /// Callers turn that into a refusal that names the unit rather than a
    /// number that would be wrong.
    pub fn px(self) -> Option<f64> {
        Some(match self {
            LengthUnit::Rem => ROOT_FONT_SIZE_PX,
            LengthUnit::In => 96.0,
            LengthUnit::Pc => 16.0,
            LengthUnit::Pt => 96.0 / 72.0,
            LengthUnit::Cm => 96.0 / 2.54,
            LengthUnit::Mm => 96.0 / 25.4,
            LengthUnit::Q => 96.0 / 101.6,
            _ => return None,
        })
    }
}

/// The root font size Hozo resolves `rem` against.
///
/// Browsers default to this and every major one lets a user change it, so
/// Web never converts -- it prints `rem` and lets the browser decide. This
/// constant exists for Native, which has no such concept and no browser to
/// ask.
pub const ROOT_FONT_SIZE_PX: f64 = 16.0;

fn round(value: f64) -> f64 {
    (value * 1e6).round() / 1e6
}

impl Length {
    /// The pixel value, against a project's spacing scale.
    ///
    /// `Px` is already absolute -- a `border-2` is two pixels whatever the
    /// spacing scale is, which is exactly why the two are different
    /// variants rather than one number with a flag.
    ///
    /// A `Unit` this can't convert reports zero, which is why no backend
    /// should reach here without having asked `resolvable` first. Web never
    /// does (it prints the unit); Native refuses first.
    pub fn px(&self, theme: &Theme) -> f64 {
        match self {
            Length::Px(value) => *value,
            // Rounded, because the product is written into the output as a
            // literal. Tailwind emits `calc(var(--spacing) * 3)` and lets
            // the browser do the arithmetic; Hozo resolves it, so binary
            // floating point surfaces as `9.600000000000001px` in a
            // stylesheet. Six decimals is far past any real length and
            // short of where the noise starts.
            Length::Spacing(steps) => round(steps * theme.spacing_px()),
            Length::Unit(value, unit) => round(value * unit.px().unwrap_or(0.0)),
            // The same contract an unconvertible `Unit` has, and reached
            // the same way: never, if the caller asked first. `Css` is
            // refused by `css_expression`, one question earlier than
            // `unresolved_unit`.
            Length::Css(_) => 0.0,
        }
    }

    /// The unit standing between this length and a pixel value, if one is.
    ///
    /// `Px` and `Spacing` always resolve. A `Unit` resolves when the unit
    /// has a fixed ratio to the pixel; otherwise this names it, and the
    /// caller decides whether it can supply what's missing (an `em` against
    /// a known font size, a `vh` against the viewport hook) or has to
    /// refuse.
    pub fn unresolved_unit(&self) -> Option<LengthUnit> {
        match self {
            Length::Px(_) | Length::Spacing(_) => None,
            Length::Unit(_, unit) => unit.px().map(|_| ()).map_or(Some(*unit), |()| None),
            // Not a unit problem. `calc(100% - 2rem)` has no single unit to
            // name, and naming one would send the caller looking for a
            // conversion that was never the obstacle.
            Length::Css(_) => None,
        }
    }

    /// The CSS expression this length is, if it is one.
    ///
    /// Asked before `unresolved_unit`, because the two refusals differ:
    /// that one says "this unit needs something I don't have", this one
    /// says "this is arithmetic against layout".
    pub fn css_expression(&self) -> Option<&str> {
        match self {
            Length::Css(css) => Some(css),
            _ => None,
        }
    }
}

/// What a `StyleProperty` holds, borrowed from it.
///
/// The kinds are the value vocabularies a property can be written in, not
/// the properties themselves -- which is the whole point: there are two
/// hundred properties and seven of these, so a question asked here stays
/// answerable as the enum grows. See `StyleProperty::value`.
///
/// `Other` is every property whose payload is not a value in this sense:
/// the typed keyword enums (`Display`, `Position`, `Overflow`), the raw
/// CSS text ones (`BoxShadow`, `Arbitrary`), the plain numbers, and the
/// variants with no payload at all. They are grouped rather than
/// enumerated because nothing asks them anything -- but each one still had
/// to be named in `value()` to get here, which is the property that
/// matters.
#[derive(Debug, Clone, PartialEq)]
pub enum PropertyValue<'a> {
    Dimension(&'a Dimension),
    Length(&'a Length),
    Radius(&'a Radius),
    LineHeight(&'a LineHeight),
    LetterSpacing(&'a LetterSpacing),
    Color(&'a Color),
    Other,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Dimension {
    Length(Length),
    Percent(f64),
    Auto,
    /// A percentage of the viewport (`h-screen` is `ViewportHeight(100.0)`).
    /// React Native has no viewport unit -- screen size there is a runtime
    /// value from `useWindowDimensions()`, which a static `StyleSheet`
    /// can't hold -- so these are Web-only and the Native backend refuses
    /// them rather than freezing a launch-time size that would go stale on
    /// rotation.
    ViewportWidth(f64),
    ViewportHeight(f64),
    /// A size CSS can state and React Native cannot compute: an intrinsic
    /// keyword (`fit-content`, `max-content`), or one of the viewport units
    /// that track browser chrome (`100dvh`, `100lvh`, `100svh`) and the
    /// line-height unit (`1lh`).
    ///
    /// Kept as the exact CSS text because there is nothing to compute --
    /// every one of them is resolved by the browser against state Hozo
    /// doesn't have, and React Native can express none of them. Unlike
    /// `ViewportWidth`/`ViewportHeight`, which the Native backend *can*
    /// answer from `Dimensions`, these have no runtime equivalent to read:
    /// `dvh` tracks a URL bar that doesn't exist there, and `fit-content`
    /// is a layout mode Yoga doesn't implement.
    Css(String),
}

impl Dimension {
    pub fn is_supported_on_native(self) -> bool {
        !matches!(
            self,
            Dimension::ViewportWidth(_) | Dimension::ViewportHeight(_) | Dimension::Css(_)
        )
    }
}

/// Kept as an unresolved Tailwind token (e.g. `"blue-500"`), not RGBA --
/// token resolution is a separate lowering/optimization pass (proposal §16)
/// that needs the token identity preserved this far.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Color {
    Token(String),
    /// A CSS keyword that stands where a colour goes but isn't one:
    /// `accent-color: auto`, `fill: none`. Kept apart from `Token` because
    /// the palette resolver can't resolve these and its fallback --
    /// `var(--hozo-color-none)` -- would be a plausible-looking wrong
    /// answer rather than an unresolved one.
    Keyword(&'static str),
    /// A colour the source wrote out instead of naming: `bg-[#ff0000]`,
    /// `text-[rgb(0_0_0)]`, `bg-(--brand)`.
    ///
    /// Apart from `Token` because there is nothing to look up -- sending
    /// this through the palette resolver would produce
    /// `var(--hozo-color-#ff0000)`, which is not a colour and not an
    /// error either. Held as the CSS text because that is exactly what the
    /// author asked for; the whole point of an arbitrary value is that it
    /// escapes the design system.
    Css(String),
}

impl Color {
    /// Whether this is `initial` -- the utility that *unsets* a colour
    /// rather than choosing one.
    ///
    /// Tailwind spells it `shadow-initial`, `inset-shadow-initial` and
    /// `text-shadow-initial`, each setting its register to `initial` so
    /// the shadow falls back to the colour it carries by default. It is
    /// not a colour to paint with: putting the keyword where a colour goes
    /// gives `box-shadow: … initial`, which a browser drops entirely.
    ///
    /// So the composers ask this and treat it as "no colour was set",
    /// which is the output the shadow would have had alone -- and, unlike
    /// simply declining to parse the utility, it still overrides a
    /// `shadow-red-500` written before it.
    pub fn is_initial(&self) -> bool {
        matches!(self, Color::Keyword("initial"))
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct FontWeight(pub u16);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TextAlign {
    Left,
    Center,
    Right,
    /// `start`, `end`, `justify`. React Native has all three.
    Css(&'static str),
}

/// An angle, in degrees where Hozo can resolve one.
///
/// `Css` is the arbitrary case, and it is not an edge case: Tailwind's
/// arbitrary values are unvalidated, so `rotate-x-[1.5em]` compiles to
/// `rotateX(1.5em)` there rather than being refused. The text has to live
/// inside this type rather than escaping to a raw declaration, because
/// transform functions *compose* -- `rotate-x-[…] skew-y-3` is one
/// `transform`, and a raw declaration beside a typed one would be two of
/// them, with last-wins silently dropping whichever came first.
#[derive(Debug, Clone, PartialEq)]
pub enum Angle {
    Deg(f64),
    Css(String),
}

impl Angle {
    /// The angle as CSS, which is where the two cases stop differing.
    pub fn css(&self) -> String {
        match self {
            Angle::Deg(degrees) => format!("{degrees}deg"),
            Angle::Css(text) => text.clone(),
        }
    }

    /// The angle in degrees, for the backends that need a number rather
    /// than a declaration. `None` is React Native's answer: it takes a
    /// numeric rotation, and there is nothing to hand it here.
    pub fn degrees(&self) -> Option<f64> {
        match self {
            Angle::Deg(degrees) => Some(*degrees),
            Angle::Css(_) => None,
        }
    }
}

/// A per-axis scale, as the percentage Tailwind writes (`scale-110` -> 110).
///
/// `Css` exists for the same reason `Angle::Css` does, with one extra
/// wrinkle: an arbitrary scale is a *ratio*, not a percentage.
/// `scale-x-[1.5]` is `scale: 1.5`, and putting that 1.5 in the numeric
/// case would print `1.5%` -- a scale of one sixty-sixth, which looks
/// deliberate and renders as nothing.
#[derive(Debug, Clone, PartialEq)]
pub enum Scale {
    Percent(f64),
    Css(String),
}

/// CSS transform functions with direct React Native array equivalents.
#[derive(Debug, Clone, PartialEq)]
pub enum TransformFunction {
    Perspective(Length),
    Rotate(Angle),
    RotateX(Angle),
    RotateY(Angle),
    RotateZ(Angle),
    Scale(f64),
    ScaleX(f64),
    ScaleY(f64),
    TranslateX(Dimension),
    TranslateY(Dimension),
    SkewX(Angle),
    SkewY(Angle),
}

impl Scale {
    pub fn css(&self) -> String {
        match self {
            Scale::Percent(value) => format!("{value}%"),
            Scale::Css(text) => text.clone(),
        }
    }

    /// The scale as the ratio React Native's `transform` wants.
    pub fn ratio(&self) -> Option<f64> {
        match self {
            Scale::Percent(value) => Some(value / 100.0),
            Scale::Css(_) => None,
        }
    }
}

/// A line clamp: a count, or text Hozo couldn't read as one.
///
/// `line-clamp-[1.5]` is neither a refusal nor a clamp of one. Tailwind
/// writes `-webkit-line-clamp: 1.5` and lets the browser discard it, and
/// `as u32` used to turn it into a clamp of a single line -- a number that
/// looks deliberate and isn't the one written.
#[derive(Debug, Clone, PartialEq)]
pub enum Clamp {
    Lines(u32),
    Css(String),
}

impl Clamp {
    pub fn css(&self) -> String {
        match self {
            Clamp::Lines(lines) => lines.to_string(),
            Clamp::Css(text) => text.clone(),
        }
    }

    /// The count React Native's `numberOfLines` takes.
    pub fn lines(&self) -> Option<u32> {
        match self {
            Clamp::Lines(lines) => Some(*lines),
            Clamp::Css(_) => None,
        }
    }
}

/// A length in `em` -- relative to the element's own font size, so it can't
/// be resolved to pixels at compile time.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Em(pub f64);

/// The functions of a `filter`/`backdrop-filter` chain.
///
/// Declared in the order Tailwind writes them, and that order is the
/// discriminant order deliberately: filter functions don't commute --
/// `grayscale(100%) invert(100%)` and `invert(100%) grayscale(100%)` render
/// differently -- so the chain is sorted by this enum rather than by the
/// order the utilities happened to appear in the class string.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum FilterFunction {
    Blur,
    Brightness,
    Contrast,
    Grayscale,
    HueRotate,
    Invert,
    Saturate,
    Sepia,
    DropShadow,
    /// `backdrop-opacity-*` only; there is no `opacity-*` filter utility,
    /// since bare `opacity-*` is the CSS property rather than the function.
    Opacity,
    /// `filter-none`/`backdrop-filter-none`, which clear the whole chain
    /// rather than contributing to it.
    None,
}

/// What `grid-template-columns`/`grid-template-rows` are set to.
///
/// `Count` is Tailwind's equal-track form, which it writes as
/// `repeat(n, minmax(0, 1fr))` rather than `repeat(n, 1fr)` -- the `minmax`
/// floor is what stops an oversized item from widening its track, and
/// dropping it would produce a grid that behaves differently under
/// overflow.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GridTracks {
    Count(u32),
    None,
    Subgrid,
    /// A track list written out: `grid-cols-[1fr_auto]`,
    /// `grid-cols-[repeat(3,minmax(0,1fr))]`.
    ///
    /// Tailwind's own scale only counts equal columns, which covers the
    /// common case and none of the interesting ones -- a sidebar beside a
    /// fluid main column is two unequal tracks and cannot be said any
    /// other way.
    Css(String),
}

/// One edge of a grid item's placement. A negative line counts back from
/// the end of the explicit grid, which is why this is signed.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GridLine {
    Line(i32),
    Auto,
}

/// Both edges at once, as the `grid-column`/`grid-row` shorthand.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GridSpan {
    /// `span n / span n` -- n tracks from wherever the item lands.
    Span(u32),
    /// `1 / -1` -- the first line to the last, however many tracks there are.
    Full,
    Auto,
}

/// `columns` takes either a number of columns or an ideal column *width*,
/// and the two mean opposite things -- `columns-3` fixes the count and lets
/// the width follow, `columns-md` fixes the width and lets the count
/// follow. Tailwind spells both as a bare suffix, so the distinction has to
/// survive into the IR or the output would be a plausible wrong answer.
#[derive(Debug, Clone, PartialEq)]
pub enum ColumnCount {
    Count(u32),
    Width(Dimension),
    Auto,
}

/// CSS lets a letter spacing be relative to the font size or absolute.
/// Tailwind writes the named scale in `em` (`tracking-wide` is `0.025em`);
/// the absolute form exists because React Native's `letterSpacing` is
/// absolute, so the Native backend resolves the `em` against a font size on
/// the same element and stores the result here (see
/// `hozo_native::fold_font_relative`).
///
/// One variant rather than a second `StyleProperty`, so that the two forms
/// still dedupe against each other -- `dedupe_last_wins` keys on the
/// property's discriminant.
#[derive(Debug, Clone, PartialEq)]
pub enum LetterSpacing {
    Em(Em),
    Px(Length),
}

/// CSS allows a line height to be an absolute length or a unitless
/// multiplier of the font size. Tailwind uses both: `leading-6` is the
/// spacing scale, `leading-tight` is a ratio.
#[derive(Debug, Clone, PartialEq)]
pub enum LineHeight {
    Length(Length),
    /// React Native has no unitless line height -- its `lineHeight` is an
    /// absolute number -- and the font size to multiply by isn't known at
    /// compile time, so this form is Web-only.
    Ratio(f64),
}

/// Tailwind's built-in animations. Named rather than stored as shorthand
/// text because emitting `animation: spin 1s linear infinite` is only half
/// the job -- the matching `@keyframes` has to reach the stylesheet too.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Animation {
    Spin,
    Ping,
    Pulse,
    Bounce,
    None,
}

impl Animation {
    /// The `animation` shorthand value.
    pub fn shorthand(self) -> &'static str {
        match self {
            Animation::Spin => "spin 1s linear infinite",
            Animation::Ping => "ping 1s cubic-bezier(0, 0, 0.2, 1) infinite",
            Animation::Pulse => "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
            Animation::Bounce => "bounce 1s infinite",
            Animation::None => "none",
        }
    }

    /// The `@keyframes` block this animation needs, or `None` for `none`.
    /// Verbatim from Tailwind's own definitions.
    pub fn keyframes(self) -> Option<&'static str> {
        Some(match self {
            Animation::Spin => "@keyframes spin { to { transform: rotate(360deg); }\n}",
            Animation::Ping => {
                "@keyframes ping { 75%, 100% { transform: scale(2); opacity: 0; }\n}"
            }
            Animation::Pulse => "@keyframes pulse { 50% { opacity: 0.5; }\n}",
            Animation::Bounce => {
                "@keyframes bounce { 0%, 100% { transform: translateY(-25%); \
                 animation-timing-function: cubic-bezier(0.8, 0, 1, 1);\n  }\n  50% {\n    \
                 transform: none;\n    animation-timing-function: cubic-bezier(0, 0, 0.2, 1);\n  }\n}"
            }
            Animation::None => return None,
        })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Overflow {
    Visible,
    Hidden,
    Scroll,
    /// `auto` and `clip`. React Native's overflow union has neither,
    /// so these are refused there rather than approximated.
    Css(&'static str),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TextOverflow {
    Clip,
    Ellipsis,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WhiteSpace {
    Normal,
    NoWrap,
    /// `pre`, `pre-line`, `pre-wrap`, `break-spaces`. React Native's Text
    /// has no white-space control beyond wrapping, so these are refused.
    Css(&'static str),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TextTransform {
    Uppercase,
    Lowercase,
    Capitalize,
    None,
}

/// `align-self` takes `Align`'s keywords plus `auto`, so it can't reuse
/// `Align` directly.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AlignSelf {
    Auto,
    Start,
    Center,
    End,
    Stretch,
    Baseline,
    /// See `Align::Css`.
    Css(&'static str),
}

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq)]
pub enum Condition {
    Always,
    /// Several conditions that must all hold: `md:hover:flex`.
    ///
    /// Written order, which is also the order the atoms nest in. Tailwind
    /// nests them the same way -- `md:hover:` is a width query around a
    /// hover query and `hover:md:` is the reverse -- and while the two
    /// render identically, matching the order keeps the output the same
    /// text rather than an equivalent one.
    ///
    /// Stacked variants compiled to *nothing* before this existed:
    /// `parse_variant_prefix` took `md:` and handed `hover:bg-blue-500` to
    /// the utility parser, which doesn't know what that is. No CSS, no
    /// diagnostic, for a class people write every day. It was invisible
    /// because Tailwind's `getClassList()` enumerates utilities and not
    /// the combinations of variants in front of them, so no denominator in
    /// this repository contained one.
    All(Vec<Condition>),
    Responsive(Breakpoint),
    /// `*:` and `**:` -- the direct children, and every descendant.
    ///
    /// The mirror of `Group`/`Peer`: those move the condition onto a
    /// different element and leave the styled one where it is, and this
    /// moves the *styled* element while the condition stays. Which is why
    /// it composes with the same fold and needs no list of combinations:
    /// `hover:*:` is the children of a hovered element and `*:hover:` is
    /// the hovered children, from the order alone.
    Subtree { direct: bool },
    /// `@sm:`, `@max-md:`, `@min-[400px]:`, and the `/name` forms of each.
    ///
    /// The same question as `Width`, asked of an ancestor rather than the
    /// window -- which is why the two are separate conditions rather than
    /// one with a flag. They resolve against different things, and on
    /// React Native they resolve through entirely different machinery: a
    /// window has one width the runtime already knows, and a container
    /// has a width only the element itself can report.
    ///
    /// The breakpoint names are Tailwind's container scale, which is not
    /// the viewport scale -- `@sm` is 24rem where `sm` is 40rem. Two
    /// scales sharing five names is a trap worth stating rather than
    /// discovering.
    Container { name: Option<String>, at_least: bool, value: String },
    /// `min-[500px]:`, `max-md:`, `max-[40rem]:` -- a width threshold that
    /// isn't one of the five named breakpoints, or is one read from the
    /// other side.
    ///
    /// `min-<bp>:` is not here: Tailwind emits exactly what the bare
    /// breakpoint emits, so it parses to `Responsive` and the two are the
    /// same condition rather than two spellings of one.
    ///
    /// The value is carried as written rather than parsed into a number.
    /// Tailwind does not validate it either -- `max-[min-width:500px]:`
    /// compiles to `@media (width < min-width:500px)`, which is nonsense
    /// the browser drops -- and a length is a length whatever unit it is
    /// in. React Native is where it has to become a number, and that is
    /// where the failure to be one is reported.
    Width { at_least: bool, value: String },
    /// Compiles straight to a real CSS pseudo-class on Web (zero runtime).
    Hover,
    Focus,
    Disabled,
    /// Tailwind's `aria-checked:`, `aria-expanded:` and the rest, holding
    /// the state name without its `aria-` prefix.
    ///
    /// On Web this is a plain attribute selector and needs nothing from
    /// the element's props: `[aria-checked="true"]` matches whatever the
    /// element actually carries, however it got there. Native has no
    /// selector engine, so there it has to be read off
    /// `accessibilityState` and become a runtime guard -- the same
    /// division `Disabled` already has.
    Aria(String),
    /// A condition about the environment the whole page is in.
    ///
    /// Grouped rather than given a variant each because they share
    /// everything that matters: none of them says anything about the
    /// element, all of them are one at-rule (or, for direction, one
    /// zero-specificity selector) on Web, and each is one subscription on
    /// Native. `Dark` predates this and is the same shape; it is left
    /// where it is because every backend already matches on it by name.
    Environment(Environment),
    /// Tailwind's `data-…:` -- an attribute selector, ready-formed.
    ///
    /// Holds the selector text (`[data-state="open"]`) rather than the
    /// name and value: the shapes Tailwind accepts include presence,
    /// equality and every other attribute operator, and re-deriving the
    /// selector from parts would be reimplementing a syntax CSS already
    /// has.
    DataAttribute(String),
    /// Tailwind's `supports-[…]:`, an `@supports` query as written.
    Supports(String),
    /// Tailwind's `has-…:` -- a condition on a *descendant*.
    ///
    /// The third relation, after `group-` (ancestor) and `peer-`
    /// (sibling), and like them it holds what the other element has to
    /// satisfy. Web only: `:has()` is a selector, and React Native has no
    /// selectors and no way for a child to hand state up.
    Has(Box<Condition>),
    /// An arbitrary selector inside `:has()`, as written: `has-[>img]:`.
    HasSelector(String),
    /// Tailwind's `not-…:` -- the inner condition, negated.
    ///
    /// Only conditions with one form. `hover:` is both a media query and
    /// a pseudo-class, so Tailwind's `not-hover:` is two rules -- the
    /// selector negated, and `@media not (hover: hover)` for a device
    /// where nothing is ever hovered. One condition producing two rules
    /// does not fit the shape the backends read, so that one is refused
    /// rather than half-answered.
    Not(Box<Condition>),
    /// Tailwind's `group-…:` -- a condition on a marked *ancestor*.
    ///
    /// Holds the inner condition rather than naming the states it can
    /// wrap, so `group-hover:`, `group-aria-checked:` and
    /// `group-first:` all come from the same rule and a variant added
    /// later is groupable the day it lands.
    ///
    /// Only conditions that produce a selector: Tailwind itself refuses
    /// `group-dark:`, because a media query around the ancestor says
    /// nothing about the descendant.
    Group(Box<Condition>),
    /// Tailwind's `peer-…:` -- the same, on a marked *preceding sibling*.
    ///
    /// Web only. A sibling relationship is a selector, and React Native
    /// has no selectors; a parent can hand state down through context and
    /// a sibling has nowhere to hand it.
    Peer(Box<Condition>),
    /// Tailwind's `enabled:`, the inverse of `Disabled`.
    ///
    /// Not `:enabled`, for the same reason `Disabled` is not `:disabled`:
    /// that pseudo-class matches form controls, and most of what Hozo
    /// emits is a `<div>`. It is the negation of the same attribute, so
    /// the two answers cannot disagree about what disabled means.
    Enabled,
    /// Tailwind's `pressed:` variant. Originally assumed this needed
    /// synthesized JS-tracked state (no CSS `:active` equivalent matches
    /// RN's touch semantics) and so should desugar into `Expr` -- wrong on
    /// both counts: Web has a perfectly good `:active` pseudo-class for
    /// this (same free-CSS treatment as Hover/Focus/Disabled), and RN's
    /// `Pressable` already tracks pressed state natively via its
    /// `style={({pressed}) => ...}` render-prop form. Neither platform
    /// needs anything synthesized; each just needs a different, still
    /// zero-extra-runtime, lowering.
    Pressed,
    /// `dark:`. Tailwind v4's default strategy is the
    /// `prefers-color-scheme` media query rather than a `.dark` class, and
    /// React Native's `useColorScheme()` reports the same OS-level
    /// preference -- so the two agree on meaning even though only Web can
    /// express it as a style condition.
    Dark,
    /// `first:`. A structural position, which only the DOM can match on
    /// its own; React Native has no selector engine. But Hozo sees the
    /// whole JSX tree, so Native resolves it at compile time -- and says
    /// so when it can't, which is whenever a `Child::Verbatim` sits
    /// before this element and may render nothing or a hundred.
    FirstChild,
    /// `last:`. The same question from the other end, resolved the same
    /// way and undecidable under the same condition.
    LastChild,
    /// `only:`, `empty:`, `odd:`, `even:`, `nth-3:`, `nth-[2n+1]:` and the
    /// `-last-` and `-of-type` spellings of those.
    ///
    /// One variant rather than eight, because every one of them is the same
    /// thing: a pseudo-class about where this element sits among its
    /// siblings, with no runtime state behind it. `FirstChild` and
    /// `LastChild` predate it and are the same idea; they stayed separate
    /// because renaming them touches every backend and buys nothing.
    Structural(Structural),
    /// `required:`, `invalid:`, `read-only:`, `placeholder-shown:` and
    /// the rest of the form-control pseudo-classes.
    ///
    /// These are the ones rule 2 in decision 003 was written about, and
    /// they are compiled rather than refused because Hozo's `TextInput`
    /// really is an `<input>`. On anything else they can never match, and
    /// that is diagnosed where the class is read rather than left to be
    /// discovered.
    FormState(FormState),
    /// `before:`, `after:`, `placeholder:`, `marker:` and the rest.
    ///
    /// A pseudo-element is not a state of the element but a box the
    /// browser makes beside it, which is why React Native has nothing
    /// resembling one: its styles are objects handed to components, and
    /// there is no component to hand these to.
    PseudoElement(PseudoElement),
    /// `focus-within:`. Grouped with `Focus` rather than with the
    /// structural pseudo-classes despite reading like one: it is a state
    /// that changes while the page is being used, and the DOM is what
    /// tracks it.
    FocusWithin,
    /// `target:`. The element whose `id` matches the document's URL
    /// fragment.
    ///
    /// The only condition here that is about the *document* rather than the
    /// element or its environment, which is also why React Native has
    /// nothing resembling it: there is no address bar to disagree with.
    Target,
    /// `visited:`. A link the user has been to before.
    ///
    /// The one condition whose *declarations* the browser censors. History
    /// is private, and a page that could read a `:visited` style back --
    /// through `getComputedStyle`, through layout, through anything
    /// observable -- could read the user's history. So engines apply a
    /// short list of colour properties and silently drop everything else,
    /// and paint even those with the alpha channel forced opaque.
    ///
    /// Hozo emits what Tailwind emits, including for the properties that
    /// will be dropped, and says so at compile time instead: see
    /// `StyleProperty::survives_visited`.
    ///
    /// React Native has no history, no links to have been to, and nothing
    /// to censor.
    Visited,
    /// `starting:` -- `@starting-style`, the value a property has for the
    /// first frame so a transition has somewhere to start.
    ///
    /// Ambient by the only test that matters to a backend: it is an
    /// at-rule around the rule rather than a condition on the selector.
    /// It is not a *query*, though, and that difference is why
    /// `not-starting:`, `has-starting:`, `group-starting:` and
    /// `peer-starting:` are all refused -- Tailwind emits nothing for any
    /// of them. There is no state to test for the absence of and no
    /// element to test it on; `@starting-style` describes a moment in the
    /// rendering process, and the only thing that can be said about that
    /// moment is what the value is during it.
    ///
    /// React Native transitions through `Animated`/Reanimated with an
    /// explicit starting value, which is the author's to write; there is
    /// no declarative first frame for this to lower to.
    StartingStyle,
    /// `focus-visible:`. Distinct from `Focus` and not a nicety: it is the
    /// one that doesn't put a ring around a button someone clicked, which
    /// is why it exists at all.
    FocusVisible,
    /// `[&>*]:p-4`, `[&_a]:underline`, `[&:nth-child(3)]:font-bold`. The
    /// selector as written, with `&` still standing for the element.
    ///
    /// Web substitutes the generated class for `&` and emits the result.
    /// Nothing is validated: a selector Hozo doesn't understand is one
    /// the browser might, and the author asked for it by name.
    ///
    /// Native refuses all of these, and not for want of effort -- React
    /// Native has no selector engine at all. `[&>*]` asks a question about
    /// the rendered tree that only a matching engine can answer, and there
    /// isn't one on the other side.
    ArbitrarySelector(String),
    /// `[@media(print)]:hidden`, `[@supports(display:grid)]:grid`. The
    /// at-rule prelude as written, `@` included.
    ///
    /// Kept apart from `ArbitrarySelector` because the lowering differs in
    /// kind: a selector rewrites the rule's head, an at-rule wraps the
    /// whole rule in a block. Folding them together would mean deciding
    /// which one this is by looking for a leading `@` at emit time, in the
    /// one place that has the least context for it.
    ArbitraryAtRule(String),
    /// Arbitrary structurally-dynamic condition (proposal §7): a prop,
    /// local variable, or `useState` value used as a guard.
    Expr(ConditionExpr),
}

/// Which gradient function a `bg-*` gradient utility starts.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GradientKind {
    Linear,
    Radial,
    Conic,
}

impl GradientKind {
    pub fn css(self) -> &'static str {
        match self {
            GradientKind::Linear => "linear-gradient",
            GradientKind::Radial => "radial-gradient",
            GradientKind::Conic => "conic-gradient",
        }
    }
}

/// Which stop of a gradient a `from-*`/`via-*`/`to-*` utility describes.
///
/// Declaration order is the order they appear in the value, which is what
/// `GradientStop as u32` is used for in `dedupe_key`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GradientStop {
    From,
    Via,
    To,
}

impl GradientStop {
    /// The position CSS uses when no `from-<n>%` was written. These are
    /// the `initial-value`s of Tailwind's own `--tw-gradient-*-position`
    /// registers.
    pub fn default_position(self) -> &'static str {
        match self {
            GradientStop::From => "0%",
            GradientStop::Via => "50%",
            GradientStop::To => "100%",
        }
    }
}

/// One slot in Tailwind's `mask-image` layer list.
///
/// The four sides compose into the first slot as a nested list, which is
/// why a side utility produces six layers and a shape utility three.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum MaskSlot {
    Left,
    Right,
    Bottom,
    Top,
    Linear,
    Radial,
    Conic,
}

/// Which end of a mask gradient a stop describes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum MaskStop {
    From,
    To,
}

/// Which edge (or edge pair) a per-side property targets, for the families
/// where the number of edges makes one variant each impractical.
///
/// Whether a value was asked for or came with something else.
///
/// Only for the two `transition-*` supplies, because they are the only
/// place Hozo resolves a Tailwind register whose fallback and whose
/// override live in different utilities. Everything else that composes
/// this way keeps both halves as separate properties.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Origin {
    /// A utility that exists to set this: `duration-75`, `ease-in`.
    Written,
    /// The fallback a `transition-*` utility carries.
    Default,
}

/// Which of the two directions a utility runs in.
///
/// `X` is the inline axis and `Y` the block one, following Tailwind's own
/// naming rather than CSS's -- these come from utilities spelled `-x-` and
/// `-y-`, and renaming them here would only put a translation step between
/// the class and the code.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Axis {
    X,
    Y,
}

/// Named to match the CSS longhand suffixes, so each backend's lookup table
/// reads as the property list it is.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Edge {
    /// No suffix -- the shorthand that sets every edge.
    All,
    Top,
    Right,
    Bottom,
    Left,
    Inline,
    Block,
    InlineStart,
    InlineEnd,
    BlockStart,
    BlockEnd,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Breakpoint {
    Sm,
    Md,
    Lg,
    Xl,
    Xl2,
}

/// A condition's leaves are opaque source references, not parsed
/// identifiers/comparisons: the compiler never evaluates a condition, it
/// only needs to know where one guard ends and the next begins so it can
/// re-emit the expression verbatim in generated output.
#[derive(Debug, Clone, PartialEq)]
pub enum ConditionExpr {
    /// A JSX boolean shorthand such as `<Button disabled />` has no source
    /// expression span to preserve, but is still a real constant guard.
    Static(bool),
    Ref(ExprRef),
    Not(Box<ConditionExpr>),
    And(Box<ConditionExpr>, Box<ConditionExpr>),
    Or(Box<ConditionExpr>, Box<ConditionExpr>),
}

/// Where an element sits among its siblings.
///
/// The distinctions are the DOM's, kept rather than flattened because they
/// are not interchangeable. `:nth-child` counts every sibling; `:nth-of-type`
/// counts only siblings with the same tag, which in a Hozo tree is the tag
/// Hozo chose. That dependency is real and is why `-of-type` was nearly
/// refused: see decision 003.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Structural {
    /// `only:` and `only-of-type:`.
    Only { of_type: bool },
    /// `first-of-type:` and `last-of-type:`. The plain `first:`/`last:` are
    /// `Condition::FirstChild`/`LastChild`.
    Edge { last: bool },
    /// `:empty` -- no children at all, including text and whitespace.
    ///
    /// Stricter than it looks, and the strictness is the DOM's: an element
    /// containing a single space does not match. Nothing here softens that,
    /// because a rule that matched more than `:empty` would be a different
    /// rule wearing its name.
    Empty,
    /// `odd:`, `even:`, `nth-3:`, `nth-[2n+1]:`, and the same four with
    /// `-last-` or `-of-type`.
    ///
    /// The formula is carried as written rather than parsed into a
    /// coefficient pair. `2n+1` and `odd` select the same elements and are
    /// not the same text, and the text is what Tailwind emits -- parsing it
    /// would mean choosing a spelling to emit and then defending the choice
    /// against Tailwind's.
    Nth { of_type: bool, from_end: bool, formula: String },
}

impl Structural {
    /// The pseudo-class, written out.
    pub fn selector(&self) -> String {
        match self {
            Structural::Only { of_type: false } => ":only-child".to_string(),
            Structural::Only { of_type: true } => ":only-of-type".to_string(),
            Structural::Edge { last: false } => ":first-of-type".to_string(),
            Structural::Edge { last: true } => ":last-of-type".to_string(),
            Structural::Empty => ":empty".to_string(),
            Structural::Nth { of_type, from_end, formula } => {
                let name = match (of_type, from_end) {
                    (false, false) => "nth-child",
                    (false, true) => "nth-last-child",
                    (true, false) => "nth-of-type",
                    (true, true) => "nth-last-of-type",
                };
                format!(":{name}({formula})")
            }
        }
    }

    /// Whether this selects the element at 1-based position `ordinal` out
    /// of `count` element siblings.
    ///
    /// `None` where the answer depends on something other than position --
    /// the `-of-type` spellings, which need to know which siblings share
    /// this element's tag, and a formula that isn't An+B.
    ///
    /// This is what lets React Native have the whole family for free.
    /// Native has no selector engine, but the compiler is looking at the
    /// JSX tree and a sibling position is a fact about that tree, so the
    /// question `:nth-child()` asks at runtime on Web is one that can be
    /// answered at build time here -- the same trade `first:` and `last:`
    /// already made.
    pub fn matches_position(&self, ordinal: usize, count: usize) -> Option<bool> {
        match self {
            // Which siblings share this element's tag is not a question
            // React Native can be asked: there are no tags, only
            // components, and the tag a Hozo element would have had is a
            // Web lowering decision.
            Structural::Only { of_type: true }
            | Structural::Edge { .. }
            | Structural::Nth { of_type: true, .. } => None,
            Structural::Only { of_type: false } => Some(count == 1),
            // Asked of the element's own children, not its siblings.
            Structural::Empty => None,
            Structural::Nth { of_type: false, from_end, formula } => {
                let position = if *from_end { count + 1 - ordinal } else { ordinal };
                nth_matches(formula, position)
            }
        }
    }

    /// How the author spelled it, for a message that has to name it back.
    pub fn variant_name(&self) -> String {
        match self {
            Structural::Only { of_type: false } => "only".to_string(),
            Structural::Only { of_type: true } => "only-of-type".to_string(),
            Structural::Edge { last: false } => "first-of-type".to_string(),
            Structural::Edge { last: true } => "last-of-type".to_string(),
            Structural::Empty => "empty".to_string(),
            Structural::Nth { of_type, from_end, formula } => {
                let stem = match (of_type, from_end) {
                    (false, false) => "nth",
                    (false, true) => "nth-last",
                    (true, false) => "nth-of-type",
                    (true, true) => "nth-last-of-type",
                };
                // `odd:` and `even:` are Tailwind's own names for two
                // formulas, not `nth-odd:`.
                match formula.as_str() {
                    "odd" | "even" if !of_type && !from_end => formula.clone(),
                    _ => format!("{stem}-{formula}"),
                }
            }
        }
    }
}

/// Whether an An+B formula selects the element at 1-based `position`.
///
/// `None` for anything that isn't An+B. The grammar has more in it than
/// this -- `of S` takes a whole selector list -- and a formula this cannot
/// read is reported rather than guessed at, because guessing here means
/// styling the wrong row.
fn nth_matches(formula: &str, position: usize) -> Option<bool> {
    let text: String = formula.chars().filter(|c| !c.is_whitespace()).collect();
    let (a, b) = match text.as_str() {
        "odd" => (2i64, 1i64),
        "even" => (2, 0),
        _ => parse_an_plus_b(&text)?,
    };
    let position = position as i64;
    // `an+b` selects `position` when some whole `n >= 0` produces it.
    Some(match a {
        0 => position == b,
        a if a > 0 => position >= b && (position - b) % a == 0,
        a => position <= b && (b - position) % -a == 0,
    })
}

/// `2n+1`, `-n+3`, `n`, `5`.
fn parse_an_plus_b(text: &str) -> Option<(i64, i64)> {
    let Some((before_n, after_n)) = text.split_once('n') else {
        // No `n` at all: a fixed position.
        return Some((0, text.parse().ok()?));
    };
    let a = match before_n {
        "" | "+" => 1,
        "-" => -1,
        other => other.parse().ok()?,
    };
    let b = match after_n {
        "" => 0,
        other => other.strip_prefix('+').unwrap_or(other).parse().ok()?,
    };
    Some((a, b))
}

/// The box a browser makes beside an element.
///
/// Two of these are more than one selector, which is the whole reason
/// `condition_shapes` returns a list: Tailwind writes `marker:` as four
/// rules -- the element's own `::marker`, a descendant's, and both again
/// under `::-webkit-details-marker` for Safari -- and `selection:` as two.
/// Read from its output rather than its documentation, which says none of
/// this.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PseudoElement {
    Before,
    After,
    Placeholder,
    Selection,
    Marker,
    FirstLetter,
    FirstLine,
    /// `file:`, which is `::file-selector-button`.
    File,
    Backdrop,
}

impl PseudoElement {
    /// The selector suffixes, in the order Tailwind emits them.
    ///
    /// Order matters because it is the order the rules come out in, and a
    /// later rule of equal specificity wins.
    pub fn suffixes(&self) -> Vec<&'static str> {
        match self {
            PseudoElement::Before => vec!["&::before"],
            PseudoElement::After => vec!["&::after"],
            PseudoElement::Placeholder => vec!["&::placeholder"],
            PseudoElement::FirstLetter => vec!["&::first-letter"],
            PseudoElement::FirstLine => vec!["&::first-line"],
            PseudoElement::File => vec!["&::file-selector-button"],
            PseudoElement::Backdrop => vec!["&::backdrop"],
            // A descendant's and the element's own, because a selection
            // crosses element boundaries and styling only the element
            // would leave its children unstyled mid-drag.
            PseudoElement::Selection => vec!["& ::selection", "&::selection"],
            // The same pair, twice: Safari renders a `<details>` marker as
            // `::-webkit-details-marker` and does not answer to `::marker`.
            PseudoElement::Marker => vec![
                "& ::marker",
                "&::marker",
                "& ::-webkit-details-marker",
                "&::-webkit-details-marker",
            ],
        }
    }

    /// Whether this one needs `content` to exist at all.
    ///
    /// `::before` and `::after` generate nothing without it, so Tailwind
    /// writes `content: var(--tw-content)` into every rule that targets
    /// them and registers the property with an initial value of `""`.
    /// Without that, `before:bg-red-500` would style a box that is never
    /// created.
    pub fn needs_content(&self) -> bool {
        matches!(self, PseudoElement::Before | PseudoElement::After)
    }

    pub fn variant_name(&self) -> &'static str {
        match self {
            PseudoElement::Before => "before",
            PseudoElement::After => "after",
            PseudoElement::Placeholder => "placeholder",
            PseudoElement::Selection => "selection",
            PseudoElement::Marker => "marker",
            PseudoElement::FirstLetter => "first-letter",
            PseudoElement::FirstLine => "first-line",
            PseudoElement::File => "file",
            PseudoElement::Backdrop => "backdrop",
        }
    }
}

/// A form control's state, as the DOM asks about it.
///
/// One variant per pseudo-class and no shared structure, because there is
/// none to share: these are eleven unrelated questions that happen to be
/// answerable only of a form control.
///
/// The three Tailwind ships that are missing -- `checked`, `indeterminate`
/// and `default` -- are refused under rule 2 of decision 003 rather than
/// unbuilt. They match a checkbox, a radio or a form's default button, and
/// Hozo has no primitive that becomes one; an author writing
/// `<Pressable accessibilityRole="checkbox">` would get a rule that could
/// never apply.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FormState {
    Required,
    Optional,
    Valid,
    Invalid,
    /// `:user-valid` and `:user-invalid`, which differ from the pair above
    /// by *when*: they hold only once the field has been interacted with,
    /// so an empty required field is not red before it has been visited.
    UserValid,
    UserInvalid,
    InRange,
    OutOfRange,
    ReadOnly,
    PlaceholderShown,
    Autofill,
}

impl FormState {
    pub fn selector(&self) -> &'static str {
        match self {
            FormState::Required => ":required",
            FormState::Optional => ":optional",
            FormState::Valid => ":valid",
            FormState::Invalid => ":invalid",
            FormState::UserValid => ":user-valid",
            FormState::UserInvalid => ":user-invalid",
            FormState::InRange => ":in-range",
            FormState::OutOfRange => ":out-of-range",
            FormState::ReadOnly => ":read-only",
            FormState::PlaceholderShown => ":placeholder-shown",
            FormState::Autofill => ":autofill",
        }
    }

    /// Tailwind's name for it, which is the selector without its colon.
    pub fn variant_name(&self) -> &'static str {
        &self.selector()[1..]
    }
}

/// The environment queries Tailwind names, as Tailwind names them.
///
/// Split by what each platform can answer rather than by what it is:
/// React Native reports reduced motion, inverted colours, orientation and
/// text direction, and has nothing for a printer, a scripting-disabled
/// page, or Windows' forced-colours mode. The ones it cannot answer are
/// still compiled for Web and reported on Native, which is the rule
/// `peer-` established -- a concept that exists on one platform is better
/// implemented there and named absent on the other than left out of both.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Environment {
    /// `@media (prefers-reduced-motion: reduce)`.
    MotionReduce,
    /// `@media (prefers-reduced-motion: no-preference)`.
    MotionSafe,
    /// `@media (orientation: portrait)`.
    Portrait,
    /// `@media (orientation: landscape)`.
    Landscape,
    /// `@media (inverted-colors: inverted)`.
    InvertedColors,
    /// A selector, not a query: `:where(:dir(ltr), [dir="ltr"], [dir="ltr"] *)`.
    Ltr,
    /// The same, right to left.
    Rtl,
    /// `@media (prefers-contrast: more)`. Web only -- React Native's
    /// nearest is Android's high-contrast *text* setting, which is a
    /// different thing wearing a similar name.
    ContrastMore,
    /// `@media (prefers-contrast: less)`. Web only, as above.
    ContrastLess,
    /// `@media (forced-colors: active)`. Web only.
    ForcedColors,
    /// `@media print`. Web only, and unambiguously so.
    Print,
    /// `@media (scripting: none)`. Web only.
    Noscript,
    /// `@media (prefers-reduced-transparency: reduce)`, and React Native's
    /// `isReduceTransparencyEnabled`.
    ///
    /// The four below are not Tailwind's -- they are the accessibility
    /// settings React Native reports and Tailwind has no name for, added
    /// through the extension point Tailwind ships for exactly this
    /// (`@custom-variant`), which is what makes them an extension rather
    /// than an invention. Decision 002 rejected inventing vocabulary; it
    /// did not reject using the vocabulary a project is invited to add.
    ///
    /// This first one is the only one of the four that both platforms
    /// have. The media query is real and Tailwind simply has no variant
    /// for it, so it was uncovered on Web as well.
    ReduceTransparency,
    /// React Native's `isBoldTextEnabled`. Native only: the Web has no
    /// media query for it, and the OS setting it reports is iOS's.
    BoldText,
    /// React Native's `isGrayscaleEnabled`. Native only.
    ///
    /// CSS's `monochrome` is not this. That asks how many bits per colour
    /// the *display* has -- an e-ink screen, a receipt printer -- and this
    /// is a person who has asked the system to drain the colour out of a
    /// full-colour one. Answering with `monochrome` would be right for
    /// almost nobody it fired for.
    Grayscale,
    /// React Native's `isScreenReaderEnabled`. Native only, and the only
    /// condition here the Web *refuses* rather than lacks.
    ///
    /// There is no media query for it and there deliberately never will
    /// be: whether assistive technology is running is a strong
    /// fingerprinting signal, and exposing it would let any page identify
    /// the people least able to avoid being identified. So the usual
    /// asymmetry inverts -- everywhere else Web has the richer vocabulary
    /// and Native is the platform that cannot answer.
    ///
    /// Rule 3 in decision 003 still decides it: a concept one platform has
    /// is better implemented there and named absent on the other than left
    /// out of both. The Web refusal message says *refuses* rather than
    /// *lacks*, because those are different facts and only one of them
    /// might change.
    ScreenReader,
}

impl Environment {
    /// Whether the Web can express this at all.
    ///
    /// Three of the four React Native settings cannot be asked from CSS.
    /// The Native backend has refused Web-only queries since it existed;
    /// this is the same refusal pointing the other way, and the first time
    /// it has pointed that way at all.
    pub fn web_query(self) -> bool {
        !matches!(
            self,
            Environment::BoldText | Environment::Grayscale | Environment::ScreenReader
        )
    }

    /// Why the Web cannot answer this one.
    ///
    /// Two different facts, and the wording keeps them apart because only
    /// one of them might change. `bold-text` and `grayscale` are settings
    /// CSS has no query for -- an absence. `screen-reader` is a refusal:
    /// there is no query and there deliberately will not be one, because
    /// whether assistive technology is running is a strong fingerprinting
    /// signal and exposing it would identify exactly the people least able
    /// to avoid being identified.
    pub fn web_gap_message(self) -> String {
        match self {
            Environment::ScreenReader => "`screen-reader:` cannot work on the Web, and not \
                 because nobody has built it: there is no media query for whether a screen \
                 reader is running and the platform declines to add one, since it would be a \
                 strong fingerprinting signal against the people least able to avoid being \
                 identified. On React Native the same class works. If the intent is content \
                 for screen readers only, `sr-only` says that on both platforms."
                .to_string(),
            Environment::BoldText => "`bold-text:` reports an iOS setting, and CSS has no query \
                 for it, so the style is not applied on Web. On React Native the same class \
                 works. A `prefers-contrast` or a larger type scale is the nearest thing the \
                 Web can be asked."
                .to_string(),
            Environment::Grayscale => "`grayscale:` reports an iOS setting, and CSS has no query \
                 for it. `monochrome` is not it -- that asks how many bits of colour the \
                 *display* has, which is an e-ink screen rather than a person who has asked the \
                 system to drain the colour out of a full-colour one. On React Native the same \
                 class works."
                .to_string(),
            _ => String::new(),
        }
    }
}

impl Condition {
    /// Whether this condition is expressed as a *selector* rather than as
    /// a query around one.
    ///
    /// Which is what decides whether `group-` and `peer-` can relate it
    /// to another element: relating means moving the condition onto a
    /// different subject, and only a selector has a subject to move. A
    /// media query wraps the rule and names nobody.
    ///
    /// Read as "is it about the element" first, which is nearly the same
    /// answer and wrong in one place: text direction is inherited, so
    /// `ltr:` is about the environment *and* is a selector -- and
    /// Tailwind does allow `group-rtl:`, an ancestor in a right-to-left
    /// subtree, while refusing `group-motion-reduce:`. Checked against it
    /// rather than reasoned about, which is how the criterion turned out
    /// to be the form and not the subject.
    /// Whether this condition is expressed as an at-rule *around* the
    /// rule, rather than as part of its selector.
    ///
    /// Not the complement of `is_elemental`, and the one place they
    /// overlap is the interesting one: `hover:` is both, because a
    /// pointer that can hover is an environment fact and being hovered is
    /// an element fact. Everything else is one or the other.
    pub fn is_ambient(&self) -> bool {
        match self {
            Condition::Dark
            | Condition::Responsive(_)
            | Condition::Width { .. }
            | Condition::Container { .. }
            | Condition::ArbitraryAtRule(_) => true,
            // An at-rule around the rule, so ambient by the test that
            // decides what a backend has to do with it -- though not a
            // query, which is what `is_queryable` is for.
            Condition::StartingStyle => true,
            // The one condition that is both.
            Condition::Hover => true,
            Condition::Environment(query) => {
                !matches!(query, Environment::Ltr | Environment::Rtl)
            }
            // A relation carries its inner condition's at-rules through.
            Condition::Group(inner) | Condition::Peer(inner) | Condition::Not(inner) => {
                inner.is_ambient()
            }
            Condition::All(conditions) => conditions.iter().any(Condition::is_ambient),
            Condition::Supports(_) => true,
            // `has-hover:` carries the media query the hover it wraps has.
            Condition::Has(inner) => inner.is_ambient(),
            _ => false,
        }
    }

    /// The pseudo-element this condition targets, if it targets one.
    ///
    /// Looks through the wrappers, because `hover:before:` still writes
    /// into a `::before` and still needs its `content`.
    pub fn pseudo_element(&self) -> Option<PseudoElement> {
        match self {
            Condition::PseudoElement(pseudo) => Some(*pseudo),
            Condition::All(conditions) => conditions.iter().find_map(Condition::pseudo_element),
            _ => None,
        }
    }

    /// Splits a condition at its subtree marker.
    ///
    /// Returns what qualifies the *parent*, what qualifies the *child*,
    /// and which of the two markers it was. `None` when there is no
    /// marker, which is nearly every condition.
    ///
    /// The split matters only off the Web. A selector says which element
    /// each half is about -- `:is(.x:hover > *)` and `:is(.x > *):hover`
    /// are different rules. Handing the style down to the children loses
    /// that, so a backend without selectors has to know which half it is
    /// holding.
    pub fn split_subtree(&self) -> Option<(Vec<Condition>, Vec<Condition>, bool)> {
        match self {
            Condition::Subtree { direct } => Some((Vec::new(), Vec::new(), *direct)),
            Condition::All(conditions) => {
                let at = conditions
                    .iter()
                    .position(|c| matches!(c, Condition::Subtree { .. }))?;
                let direct = matches!(conditions[at], Condition::Subtree { direct: true });
                Some((conditions[..at].to_vec(), conditions[at + 1..].to_vec(), direct))
            }
            _ => None,
        }
    }

    /// One condition from a list, as the backends want it.
    pub fn all(mut conditions: Vec<Condition>) -> Condition {
        match conditions.len() {
            0 => Condition::Always,
            1 => conditions.pop().expect("length checked"),
            _ => Condition::All(conditions),
        }
    }

    /// Whether `not-` can negate this condition.
    ///
    /// Everything with a form to negate, which is everything except
    /// `Always`. It used to exclude a condition that is *both* a query and
    /// a selector -- `hover:` and nothing else -- because negating both is
    /// two rules and `condition_shape` returned one. That was a limit of
    /// the backend rather than a fact about the variant, and the backend
    /// returns a list now.
    pub fn is_negatable(&self) -> bool {
        self.is_queryable() || self.is_elemental()
    }

    /// Whether `:visited` appears anywhere in this condition.
    ///
    /// Anywhere, because the browser's restriction is on the *rule*, not
    /// on the element: a selector that mentions `:visited` at all has its
    /// declarations filtered, and that includes the ones that mention it
    /// on some other element. `group-visited:p-4` styles a descendant of a
    /// visited link and is filtered just the same, and so is
    /// `not-visited:p-4` -- if the negation were unrestricted, the two
    /// halves could be compared and the history read back out of the
    /// difference.
    /// The `data-hozo-*` attribute this condition selects on, if any.
    ///
    /// Those are Hozo's own working state rather than an interface. What
    /// settles it is not a preference: the namespace already contains
    /// `data-hozo-cond-142-197`, whose name is a pair of byte offsets into
    /// the source file, so adding a blank line above the element renames
    /// it. A namespace holding something that cannot be depended on is not
    /// one anything should be depended on from.
    ///
    /// And nothing is lost by saying so. Every state an author could want
    /// is reachable through a variant that compiles to the *identical*
    /// selector -- `disabled:` and `data-[hozo-disabled]:` are the same
    /// `.hozo-0[data-hozo-disabled]` -- so the migration for anyone who
    /// used the attribute is one token.
    pub fn hozo_private_attribute(&self) -> Option<&str> {
        match self {
            Condition::DataAttribute(selector) => selector
                .strip_prefix("[data-")
                .and_then(|rest| rest.split(['=', ']']).next())
                .filter(|name| name.starts_with("hozo-")),
            Condition::All(conditions) => {
                conditions.iter().find_map(Condition::hozo_private_attribute)
            }
            Condition::Not(inner)
            | Condition::Group(inner)
            | Condition::Peer(inner)
            | Condition::Has(inner) => inner.hozo_private_attribute(),
            _ => None,
        }
    }

    pub fn contains_visited(&self) -> bool {
        match self {
            Condition::Visited => true,
            Condition::All(conditions) => conditions.iter().any(Condition::contains_visited),
            Condition::Not(inner)
            | Condition::Group(inner)
            | Condition::Peer(inner)
            | Condition::Has(inner) => inner.contains_visited(),
            _ => false,
        }
    }

    /// Whether this is a *question* -- something that can be true or false
    /// of an element or its environment.
    ///
    /// Every ambient condition except one. `@starting-style` is the
    /// exception: it is an at-rule, so it is ambient, but it asks nothing.
    /// Negating it, or putting it inside `:has()`, would have to mean
    /// "when the element is *not* being rendered for the first frame",
    /// which is every other frame -- the unprefixed utility. Tailwind
    /// emits nothing for `not-starting:` or `has-starting:` and this is
    /// how that refusal is spelled here.
    pub fn is_queryable(&self) -> bool {
        !matches!(self, Condition::StartingStyle) && self.is_ambient()
    }

    pub fn is_elemental(&self) -> bool {
        match self {
            Condition::Always
            | Condition::StartingStyle
            | Condition::Dark
            | Condition::Responsive(_)
            | Condition::Width { .. }
            | Condition::Container { .. }
            | Condition::ArbitraryAtRule(_) => false,
            Condition::Environment(query) => {
                matches!(query, Environment::Ltr | Environment::Rtl)
            }
            // Negating a selector is a selector; negating a query is a
            // query. So this follows whatever it wraps.
            Condition::Not(inner) => inner.is_elemental(),
            Condition::Supports(_) => false,
            Condition::Has(inner) => inner.is_elemental(),
            // A pseudo-element is a box, not a condition on one, so there
            // is nothing to move onto an ancestor -- Tailwind refuses
            // `group-marker:` for the same reason.
            Condition::PseudoElement(_) => false,
            _ => true,
        }
    }
}

// ---------------------------------------------------------------------------
// Grouping/flattening (shared by every lowering backend)
// ---------------------------------------------------------------------------

/// Groups declarations by `Condition`, preserving first-occurrence order
/// (deterministic output, not hashmap-random) -- a linear scan is fine at
/// the sizes a single node's style list reaches in practice.
///
/// Flattening ("last declaration wins") only applies *within* a group of
/// declarations sharing the identical `Condition` -- declarations under
/// different conditions are separate output rules (a CSS rule on Web, a
/// separate style object on Native), not competing values to resolve at
/// compile time.
pub fn group_by_condition(declarations: &[StyleDeclaration]) -> Vec<(Condition, Vec<StyleProperty>)> {
    let mut groups: Vec<(Condition, Vec<StyleProperty>)> = Vec::new();
    for decl in declarations {
        match groups.iter_mut().find(|(condition, _)| *condition == decl.condition) {
            Some((_, props)) => props.push(decl.property.clone()),
            None => groups.push((decl.condition.clone(), vec![decl.property.clone()])),
        }
    }
    groups
}

/// Within one condition group, the last declaration for a given property
/// wins -- resolved by discriminant (the property's *kind*, ignoring its
/// value), keeping only the last occurrence of each while preserving
/// overall relative order.
pub fn dedupe_last_wins(props: Vec<StyleProperty>) -> Vec<StyleProperty> {
    // Written order decides everything except the two values a
    // `transition-*` utility carries as fallbacks. Those lose to their own
    // utility wherever it appears, because Tailwind reads them through a
    // register rather than a declaration: `duration-75 transition` is 75ms
    // and so is `transition duration-75`. Resolving the indirection at
    // build time turned the fallback into an ordinary declaration, and it
    // beat the explicit one whenever `transition` was written second.
    let written: std::collections::HashSet<_> = props
        .iter()
        .filter(|prop| prop.origin() == Some(Origin::Written))
        .map(StyleProperty::dedupe_key)
        .collect();
    let props: Vec<StyleProperty> = props
        .into_iter()
        .filter(|prop| {
            prop.origin() != Some(Origin::Default) || !written.contains(&prop.dedupe_key())
        })
        .collect();

    let mut seen = std::collections::HashSet::new();
    let mut kept: Vec<StyleProperty> = Vec::new();
    for prop in props.into_iter().rev() {
        if seen.insert(prop.dedupe_key()) {
            kept.push(prop);
        }
    }
    kept.reverse();
    kept
}

impl StyleProperty {
    /// Whether two declarations write the same final style slot.
    ///
    /// StyleX needs this above `dedupe_last_wins`: a later unconditional
    /// argument removes an earlier conditional value for the same property.
    /// The key itself stays private so its tuple shape is not frontend API.
    pub fn same_property_as(&self, other: &Self) -> bool {
        self.dedupe_key() == other.dedupe_key()
    }

    /// What makes two declarations "the same property" for last-wins
    /// flattening.
    ///
    /// The enum discriminant, almost always -- which is why nearly every
    /// per-side property here has its own variant rather than carrying a
    /// side. The exception is the variants that carry their own target: for
    /// those the target is part of the identity, or `scroll-mt-4
    /// scroll-mb-8` (and `mask-t-from-4 mask-b-from-8`) would collapse into
    /// one.
    ///
    /// The extra discriminator is a plain integer because it has to cover
    /// an `Edge`, a `(MaskSlot, MaskStop)` pair, and a bare `MaskSlot`
    /// without those needing a common type. Only the variants listed here
    /// use it; everything else passes 0.
    ///
    /// `Keyword` needs a third component: every one of those shares a
    /// single discriminant, so the CSS property name is what tells two of
    /// them apart. It is a string rather than a number on purpose --
    /// hashing into the integer would make a collision silently drop a
    /// declaration, which is the failure this key exists to prevent.
    /// Whether a browser will apply this property inside `:visited`.
    ///
    /// History is private, and a `:visited` style that changed anything
    /// observable would leak it: layout would leak it through element
    /// sizes, `getComputedStyle` would hand it over outright, even a
    /// background image would leak it through the request. So engines
    /// resolve `:visited` against a short list of colour properties and
    /// discard the rest, and paint the survivors with the alpha channel
    /// forced opaque so a half-transparent colour cannot be told from an
    /// opaque one.
    ///
    /// The list is the union of what the Selectors spec names and what
    /// Chromium, Gecko and WebKit actually implement, taken wide on
    /// purpose: this decides whether Hozo *warns*, and warning about a
    /// property that does work is worse than staying quiet about one that
    /// doesn't.
    ///
    /// `RingColor` and `ShadowColor` are deliberately absent even though
    /// their names say colour. They reach `box-shadow`, which is not on
    /// the list, and they get there through a custom property, which is
    /// not on it either.
    pub fn survives_visited(&self) -> bool {
        matches!(
            self,
            StyleProperty::TextColor(_)
                | StyleProperty::BackgroundColor(_)
                | StyleProperty::BorderColor(_)
                | StyleProperty::BorderTopColor(_)
                | StyleProperty::BorderRightColor(_)
                | StyleProperty::BorderBottomColor(_)
                | StyleProperty::BorderLeftColor(_)
                | StyleProperty::BorderInlineColor(_)
                | StyleProperty::BorderBlockColor(_)
                | StyleProperty::BorderInlineStartColor(_)
                | StyleProperty::BorderInlineEndColor(_)
                | StyleProperty::BorderBlockStartColor(_)
                | StyleProperty::BorderBlockEndColor(_)
                | StyleProperty::OutlineColor(_)
                | StyleProperty::TextDecorationColor(_)
                | StyleProperty::CaretColor(_)
                | StyleProperty::Fill(_)
                | StyleProperty::Stroke(_)
        )
    }

    /// Where this value came from, for the two properties that have an
    /// answer. See `Origin`.
    pub fn origin(&self) -> Option<Origin> {
        match self {
            StyleProperty::TransitionDuration(_, origin)
            | StyleProperty::TransitionTimingFunction(_, origin) => Some(*origin),
            _ => None,
        }
    }

    pub(crate) fn dedupe_key(&self) -> (std::mem::Discriminant<Self>, u32, String) {
        if let StyleProperty::Keyword(property, _) = self {
            return (std::mem::discriminant(self), 0, (*property).to_string());
        }
        // Same reasoning as `Keyword`: one discriminant covers every
        // arbitrary property, so the name is the only thing that tells two
        // of them apart.
        if let StyleProperty::Arbitrary(property, _) = self {
            return (std::mem::discriminant(self), 0, property.clone());
        }
        let target = match self {
            StyleProperty::ScrollMargin(edge, _) | StyleProperty::ScrollPadding(edge, _) => {
                *edge as u32
            }
            StyleProperty::MaskStopColor(slot, stop, _)
            | StyleProperty::MaskStopPosition(slot, stop, _) => {
                (*slot as u32) * 2 + *stop as u32
            }
            StyleProperty::BorderLogicalWidth(edge, _) | StyleProperty::BorderLogicalStyle(edge, _) => {
                *edge as u32
            }
            StyleProperty::MaskSlotArgument(slot, _) => *slot as u32,
            StyleProperty::GradientStopColor(stop, _) | StyleProperty::GradientStopPosition(stop, _) => {
                *stop as u32
            }
            StyleProperty::Filter(function, _) | StyleProperty::BackdropFilter(function, _) => {
                *function as u32
            }
            _ => 0,
        };
        (std::mem::discriminant(self), target, String::new())
    }
}

#[cfg(test)]
mod grouping_tests {
    use super::*;

    #[test]
    fn dedupe_keeps_last_value_per_property_kind() {
        let props = vec![
            StyleProperty::PaddingLeft(Length::Px(4.0)),
            StyleProperty::PaddingTop(Length::Px(4.0)),
            StyleProperty::PaddingLeft(Length::Px(16.0)),
        ];
        let deduped = dedupe_last_wins(props);
        assert_eq!(
            deduped,
            vec![StyleProperty::PaddingTop(Length::Px(4.0)), StyleProperty::PaddingLeft(Length::Px(16.0))]
        );
    }

    #[test]
    fn an_edge_is_part_of_a_property_s_identity() {
        // `ScrollMargin` carries its edge instead of having eleven variants,
        // so the edge has to be in the dedupe key -- otherwise these two
        // would look like the same property and only the last would survive.
        let props = vec![
            StyleProperty::ScrollMargin(Edge::Top, Length::Px(16.0)),
            StyleProperty::ScrollMargin(Edge::Bottom, Length::Px(32.0)),
        ];
        assert_eq!(dedupe_last_wins(props).len(), 2);

        // ...while the same edge twice still resolves last-wins.
        let props = vec![
            StyleProperty::ScrollMargin(Edge::Top, Length::Px(16.0)),
            StyleProperty::ScrollMargin(Edge::Top, Length::Px(32.0)),
        ];
        assert_eq!(
            dedupe_last_wins(props),
            vec![StyleProperty::ScrollMargin(Edge::Top, Length::Px(32.0))]
        );
    }

    #[test]
    fn condition_groups_stay_separate() {
        let decls = vec![
            StyleDeclaration {
                property: StyleProperty::BackgroundColor(Color::Token("red-500".to_string())),
                condition: Condition::Always,
            },
            StyleDeclaration {
                property: StyleProperty::BackgroundColor(Color::Token("blue-500".to_string())),
                condition: Condition::Hover,
            },
        ];
        let groups = group_by_condition(&decls);
        assert_eq!(groups.len(), 2);
    }
}

#[cfg(test)]
mod property_value_tests {
    use super::*;

    #[test]
    fn a_length_is_found_in_every_shape_that_wraps_one() {
        let em = Length::Unit(1.5, LengthUnit::Em);
        // Typed as a length, inside a `Dimension`, and inside each of the
        // three small enums that carry one beside something that is not a
        // length. The last three are the ones a hand-written list kept
        // missing, and each miss was a zero emitted in silence.
        for property in [
            StyleProperty::PaddingTop(em.clone()),
            StyleProperty::Width(Dimension::Length(em.clone())),
            StyleProperty::BorderRadius(Radius::Length(em.clone())),
            StyleProperty::LineHeight(LineHeight::Length(em.clone())),
            StyleProperty::LetterSpacing(LetterSpacing::Px(em.clone())),
            // The value is the last field wherever a property carries more
            // than one, which is what lets `value()` group them.
            StyleProperty::ScrollMargin(Edge::Top, em.clone()),
        ] {
            assert_eq!(
                property.unresolved_length_unit(),
                Some(LengthUnit::Em),
                "{property:?} hides its length from `value()`"
            );
        }
    }

    #[test]
    fn the_alternatives_inside_those_wrappers_carry_no_length() {
        // `Full` and `Ratio` are the halves that are not lengths, and
        // answering for them would be worse than answering nothing.
        assert_eq!(StyleProperty::BorderRadius(Radius::Full).unresolved_length_unit(), None);
        let ratio = StyleProperty::LineHeight(LineHeight::Ratio(1.5));
        assert_eq!(ratio.unresolved_length_unit(), None);
    }

    #[test]
    fn a_gradient_stop_position_is_a_dimension_like_any_other() {
        // Both of these carry a `Dimension` and neither was in the list
        // `dimension()` used to keep, which is what the exhaustive match
        // found the moment it was written.
        let css = Dimension::Css("calc(100% - 2rem)".to_string());
        let stop = StyleProperty::GradientStopPosition(GradientStop::From, css.clone());
        assert_eq!(stop.dimension(), Some(&css));
        let mask =
            StyleProperty::MaskStopPosition(MaskSlot::Top, MaskStop::From, css.clone());
        assert_eq!(mask.dimension(), Some(&css));
    }

    #[test]
    fn a_property_that_holds_no_value_says_so() {
        assert_eq!(StyleProperty::Display(Display::Flex).value(), PropertyValue::Other);
        assert_eq!(StyleProperty::TransformNone.value(), PropertyValue::Other);
        assert_eq!(
            StyleProperty::Arbitrary("z-index".to_string(), "3".to_string()).value(),
            PropertyValue::Other
        );
    }
}

#[cfg(test)]
mod structural_tests {
    use super::*;

    /// Which of `count` siblings a variant selects.
    fn selected(structural: &Structural, count: usize) -> Vec<usize> {
        (1..=count)
            .filter(|ordinal| structural.matches_position(*ordinal, count) == Some(true))
            .collect()
    }

    fn nth(formula: &str) -> Structural {
        Structural::Nth { of_type: false, from_end: false, formula: formula.to_string() }
    }

    #[test]
    fn the_named_formulas_are_the_ones_they_name() {
        assert_eq!(selected(&nth("odd"), 5), vec![1, 3, 5]);
        assert_eq!(selected(&nth("even"), 5), vec![2, 4]);
        // `2n+1` and `odd` select the same elements. They are still two
        // different strings, which is why the formula is carried as
        // written rather than parsed into a pair and re-spelled.
        assert_eq!(selected(&nth("2n+1"), 5), selected(&nth("odd"), 5));
    }

    #[test]
    fn an_plus_b_is_read_the_way_css_reads_it() {
        // `n` starts at zero and counts up, so `b` is a floor and not an
        // offset -- `3n+2` selects the 2nd, not the 5th onwards only.
        assert_eq!(selected(&nth("3n+2"), 9), vec![2, 5, 8]);
        assert_eq!(selected(&nth("n"), 3), vec![1, 2, 3]);
        assert_eq!(selected(&nth("3"), 5), vec![3]);
        // A negative coefficient counts down instead, which is how CSS
        // spells "the first three".
        assert_eq!(selected(&nth("-n+3"), 6), vec![1, 2, 3]);
    }

    #[test]
    fn counting_from_the_end_is_the_same_formula_on_a_flipped_position() {
        let last_two =
            Structural::Nth { of_type: false, from_end: true, formula: "-n+2".to_string() };
        assert_eq!(selected(&last_two, 5), vec![4, 5]);
    }

    #[test]
    fn a_formula_that_is_not_an_plus_b_is_not_guessed_at() {
        // The grammar has more in it than An+B -- `odd of .visible` is
        // legal CSS. Answering "no match" for one of those would style the
        // wrong rows silently, so it answers "I don't know" and Native
        // reports it.
        assert_eq!(nth("odd of .visible").matches_position(1, 3), None);
        assert_eq!(nth("").matches_position(1, 3), None);
        assert_eq!(nth("2x+1").matches_position(1, 3), None);
    }

    #[test]
    fn of_type_is_unanswerable_without_element_types() {
        // Not a gap to fill later: React Native has no tags, and the tag a
        // Hozo element would have had on Web is a lowering decision that
        // was never made here.
        assert_eq!(Structural::Edge { last: false }.matches_position(1, 3), None);
        assert_eq!(Structural::Only { of_type: true }.matches_position(1, 1), None);
        assert_eq!(
            Structural::Nth { of_type: true, from_end: false, formula: "1".to_string() }
                .matches_position(1, 3),
            None,
        );
        // The plain spelling of the same position is answerable.
        assert_eq!(Structural::Only { of_type: false }.matches_position(1, 1), Some(true));
        assert_eq!(Structural::Only { of_type: false }.matches_position(1, 2), Some(false));
    }

    #[test]
    fn every_variant_names_itself_the_way_tailwind_spells_it() {
        // The name goes into a diagnostic, so it has to be the string the
        // author typed rather than the selector it became.
        assert_eq!(nth("odd").variant_name(), "odd");
        assert_eq!(nth("3").variant_name(), "nth-3");
        assert_eq!(nth("2n+1").variant_name(), "nth-2n+1");
        assert_eq!(Structural::Empty.variant_name(), "empty");
        assert_eq!(Structural::Edge { last: true }.variant_name(), "last-of-type");
    }

    #[test]
    fn the_selectors_are_the_ones_tailwind_emits() {
        assert_eq!(nth("odd").selector(), ":nth-child(odd)");
        assert_eq!(Structural::Only { of_type: false }.selector(), ":only-child");
        assert_eq!(Structural::Only { of_type: true }.selector(), ":only-of-type");
        assert_eq!(Structural::Empty.selector(), ":empty");
        assert_eq!(
            Structural::Nth { of_type: true, from_end: true, formula: "3".to_string() }.selector(),
            ":nth-last-of-type(3)",
        );
    }
}

impl TextInputProps {
    /// The DOM `inputmode` this asks for, if the DOM has one.
    ///
    /// `inputMode` wins where both are written, which is React Native's own
    /// documented precedence rather than a choice made here.
    ///
    /// `None` covers three different situations and deliberately does not
    /// distinguish them: nothing was asked for, `default` was asked for
    /// (which is the absence of a request), or one of the five values only
    /// one platform's keyboard has. `ascii-capable`, `twitter` and
    /// `visible-password` describe a keyboard layout, and the DOM has no
    /// vocabulary for that at all -- `inputmode` names the *kind of data*
    /// and lets the platform choose a keyboard.
    pub fn dom_input_mode(&self) -> Option<&'static str> {
        if let Some(mode) = self.input_mode.as_deref() {
            return match mode {
                "none" | "text" | "decimal" | "numeric" | "tel" | "search" | "email" | "url" => {
                    Some(match mode {
                        "none" => "none",
                        "text" => "text",
                        "decimal" => "decimal",
                        "numeric" => "numeric",
                        "tel" => "tel",
                        "search" => "search",
                        "email" => "email",
                        _ => "url",
                    })
                }
                _ => None,
            };
        }
        match self.keyboard_type.as_deref()? {
            "number-pad" | "numeric" => Some("numeric"),
            "decimal-pad" => Some("decimal"),
            "email-address" => Some("email"),
            "phone-pad" => Some("tel"),
            "url" => Some("url"),
            "web-search" => Some("search"),
            _ => None,
        }
    }

    /// Whether anything here was written at all.
    pub fn is_empty(&self) -> bool {
        *self == TextInputProps::default()
    }
}
