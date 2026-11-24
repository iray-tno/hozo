//! Source spans and diagnostics, with the names and UTF-16 offsets a
//! binding hands them out under.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SourceSpan {
    pub start: u32,
    pub end: u32,
}

/// Exact bytes copied by an emitting branch, not a search in generated output.
/// Offsets are bytes in the authored source and the component's emitted JSX.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SourceCopy {
    pub span: SourceSpan,
    pub emitted_start: usize,
    pub emitted_end: usize,
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
    /// An accessible name on an element whose host never passes it on.
    ///
    /// React Native's `Modal` types accept View props, and the native
    /// modal host forwards none of them; the Web runtime matches it so the
    /// two platforms agree. The name type-checks, renders nothing and is
    /// announced nowhere -- the same silent absence as
    /// `AriaNameProhibited`, for a reason that has nothing to do with ARIA.
    A11yNameNotForwarded,
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
    /// Recognized important utility whose cascade semantics are not enabled.
    TailwindImportantNotLowered,
    /// Two classes in one list write the same property under the same
    /// condition, and the one written last applies, not the one Tailwind's
    /// stylesheet order would choose.
    ///
    /// Hozo orders a class list as Tailwind does, except around a class it
    /// cannot rank (an arbitrary value, a class the project's own CSS
    /// defines), where the writes it cannot prove independent keep the order
    /// they were written in. That boundary is deliberate (decision 012); this
    /// is what stops it being silent.
    TailwindOrderAsWritten,
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
    /// Two props on one element that compile to the same one.
    ///
    /// `onPress` is React Native's spelling and becomes `onClick` on Web,
    /// so an element carrying both asks for one thing twice. The author's
    /// own prop wins, because they wrote the platform's name and meant it
    /// -- but the other one was written too, and dropping it in silence is
    /// the shape this compiler exists to avoid.
    PropCollidesWithPlatformName,
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
    ///
    /// Native also raises it where it cannot compose a spread's style after
    /// the compiled one (#1054) -- a prop between two spreads it does not
    /// take apart -- because the emission it falls back to lets the spread
    /// replace the compiled style.
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
    /// §7's third tier), and it is a value the build cannot enumerate. The
    /// expression is preserved so its classes still reach the DOM, but Hozo
    /// generates no CSS for whatever they turn out to be -- only for classes
    /// it could read at build time. A class prop passed on unchanged and a
    /// class name assembled from pieces have codes of their own.
    DynamicClassNameNotResolved,
    /// A class prop a component received and hands on unchanged:
    /// `className={className}`. Its classes are the caller's, and they compile
    /// where the caller writes them as a static string.
    ClassNamePassedThrough,
    /// A class name assembled from pieces at run time: `` `bg-${color}-500` ``
    /// or `'p-' + size`. The whole name exists only at run time, so it has a
    /// rule only when that exact name is written literally somewhere else in
    /// the project. Mapping each value to a whole class makes it compile.
    ClassNameAssembled,
    /// A class a file hands to the run-time resolver that the on-device class
    /// map does not hold, so it does not apply. The map is built from the
    /// project scan at startup; a file outside the scan's `content`, or one
    /// edited since, can carry a class that is not in it. Reported by the
    /// bundler integration, which holds that map, not by the compiler.
    /// `@hozo/vite` does not report it when `content.include` is empty, or
    /// when Tailwind's own Vite plugin (`@tailwindcss/vite`) is in the
    /// config, because other CSS then styles those classes. A file that
    /// plugin is configured not to scan is not reported either.
    ClassNotInRuntimeMap,
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
    /// A prop React Native has no equivalent for, on an element that
    /// behaves differently without it.
    ///
    /// Distinct from `WebOnlyPropertyOnNative`, which is about style
    /// utilities: this is about props, and the difference that matters is
    /// that a style silently not applying is usually visible while a prop
    /// silently not applying is usually not.
    ///
    /// The case it exists for is `<Button href download>`. On the Web that
    /// is a file the browser saves; React Native has no download in it at
    /// all -- the whole public surface is `Linking` and `Share`, and
    /// fetching a file to a path needs `expo-file-system` or
    /// `react-native-blob-util`, a dependency Hozo should not choose for
    /// anyone. So the link opens and the OS decides, which on Android is
    /// a download and on iOS is a viewer.
    ///
    /// Not raised for `target`, `rel` or `external`. Those are browser
    /// concepts whose absence changes nothing observable here: a link on
    /// this platform leaves the app whatever they say.
    PropHasNoNativeEquivalent,
    /// Something React Native could express that Hozo does not lower there
    /// yet, so it is left out of the Native output.
    ///
    /// The other half of `WebOnlyPropertyOnNative`, and kept apart from it
    /// on purpose: that one says the platform cannot, this one says Hozo
    /// has not, and a gap filed as impossible is a gap nobody revisits. A
    /// Tailwind variant with no React Native signal wired yet, such as
    /// `contrast-less:`, is one; the same class still works on Web.
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
    /// `flex` on one of React Native's boxes, with no direction said.
    ///
    /// Tailwind's `flex` is `display: flex` and nothing else -- the row
    /// everyone associates with it comes from CSS's initial value, which
    /// applies to a `<div>` and not to one of these. Every Hozo box is a
    /// column flex container on both platforms, because React Native's is
    /// and the Web base follows it. So `<View className="flex">` is two
    /// things at once: redundant, since the box is already a flex
    /// container, and almost always a defect, since the author who wrote
    /// it was thinking of a row.
    ///
    /// Quiet in the way that matters: the page renders, nothing throws,
    /// and the content is simply stacked the other way.
    FlexDirectionUnsaid,
    /// An element that moves as it enters or leaves and says nothing about
    /// reduced motion: `starting:translate-y-4` or
    /// `data-[state=closed]:translate-y-4` with no `motion-safe:` or
    /// `motion-reduce:` on it.
    ///
    /// A hint, not a warning (decision 007). The animation is what the
    /// author wrote and plays the same on both platforms, as Tailwind's
    /// does; what is missing is a choice only the author can make, and
    /// `motion-safe:` is how they make it.
    MotionIgnoresReducedMotion,
    /// A class React Native cannot draw, in a class prop the Native backend
    /// does not lower: one handed to a pattern -- `handleClassName` on a
    /// `BottomSheet` -- which reaches the runtime resolver and is dropped
    /// there (#1166). A primitive the compiler lowers says the same thing
    /// through `WebOnlyPropertyOnNative` and its neighbours.
    ///
    /// A warning, not an error: the pattern still works, and the Web half
    /// of the same file is right to use the class. Only what is missing is
    /// reported -- a cursor or a transition, which nobody on a touch screen
    /// would miss, is not.
    ClassNotDrawnOnNative,
}

/// The stable name a diagnostic goes by outside this crate.
///
/// Lifted out of `hozo_napi` when a second binding needed it. A code
/// arriving at a build tool as `A11Y_INTERACTIVE_WITHOUT_ROLE` and at a
/// browser as something else would be two names for one rule, and the
/// mapping is long enough that nobody would notice the day they drifted.
impl DiagnosticCode {
    pub fn as_str(self) -> &'static str {
        match self {
            DiagnosticCode::A11yInteractiveWithoutRole => "A11Y_INTERACTIVE_WITHOUT_ROLE",
            DiagnosticCode::RoleHasNoWebEquivalent => "ROLE_HAS_NO_WEB_EQUIVALENT",
            DiagnosticCode::AriaIncompletePattern => "ARIA_INCOMPLETE_PATTERN",
            DiagnosticCode::AriaPropNotAllowed => "ARIA_PROP_NOT_ALLOWED",
            DiagnosticCode::AriaNameProhibited => "ARIA_NAME_PROHIBITED",
            DiagnosticCode::A11yNameNotForwarded => "A11Y_NAME_NOT_FORWARDED",
            DiagnosticCode::FocusableDisabledUnsupported => "FOCUSABLE_DISABLED_UNSUPPORTED",
            DiagnosticCode::TailwindVariantNotSupported => "TAILWIND_VARIANT_NOT_SUPPORTED",
            DiagnosticCode::TailwindImportantNotLowered => "TAILWIND_IMPORTANT_NOT_LOWERED",
            DiagnosticCode::TailwindOrderAsWritten => "TAILWIND_ORDER_AS_WRITTEN",
            DiagnosticCode::A11yMissingAccessibleName => "A11Y_MISSING_ACCESSIBLE_NAME",
            DiagnosticCode::A11yDialogWithoutDismiss => "A11Y_DIALOG_WITHOUT_DISMISS",
            DiagnosticCode::InvalidSemanticNesting => "INVALID_SEMANTIC_NESTING",
            DiagnosticCode::UnsafePropSpreadAfterStyle => "UNSAFE_PROP_SPREAD_AFTER_STYLE",
            DiagnosticCode::WebOnlyPropertyOnNative => "WEB_ONLY_PROPERTY_ON_NATIVE",
            DiagnosticCode::DynamicClassNameNotResolved => "DYNAMIC_CLASS_NAME_NOT_RESOLVED",
            DiagnosticCode::ClassNamePassedThrough => "CLASS_NAME_PASSED_THROUGH",
            DiagnosticCode::ClassNameAssembled => "CLASS_NAME_ASSEMBLED",
            DiagnosticCode::ClassNotInRuntimeMap => "CLASS_NOT_IN_RUNTIME_MAP",
            DiagnosticCode::DynamicPropNotResolved => "DYNAMIC_PROP_NOT_RESOLVED",
            DiagnosticCode::TailwindVariantCannotMatch => "TAILWIND_VARIANT_CANNOT_MATCH",
            DiagnosticCode::VisitedStyleIgnored => "VISITED_STYLE_IGNORED",
            DiagnosticCode::A11yHiddenButFocusable => "A11Y_HIDDEN_BUT_FOCUSABLE",
            DiagnosticCode::A11yPositiveTabIndex => "A11Y_POSITIVE_TAB_INDEX",
            DiagnosticCode::A11yHeadingLevelSkipped => "A11Y_HEADING_LEVEL_SKIPPED",
            DiagnosticCode::NotWiredOnWeb => "NOT_WIRED_ON_WEB",
            DiagnosticCode::PropCollidesWithPlatformName => "PROP_COLLIDES_WITH_PLATFORM_NAME",
            DiagnosticCode::HozoAttributeIsPrivate => "HOZO_ATTRIBUTE_IS_PRIVATE",
            DiagnosticCode::A11yDuplicateId => "A11Y_DUPLICATE_ID",
            DiagnosticCode::A11yInteractiveNesting => "A11Y_INTERACTIVE_NESTING",
            DiagnosticCode::A11yPressWithoutKeyboard => "A11Y_PRESS_WITHOUT_KEYBOARD",
            DiagnosticCode::PropHasNoNativeEquivalent => "PROP_HAS_NO_NATIVE_EQUIVALENT",
            DiagnosticCode::NotWiredOnNative => "NOT_WIRED_ON_NATIVE",
            DiagnosticCode::PrimitiveNotLowered => "PRIMITIVE_NOT_LOWERED",
            DiagnosticCode::UnreadableArbitraryValue => "UNREADABLE_ARBITRARY_VALUE",
            DiagnosticCode::StylexNotLowered => "STYLEX_NOT_LOWERED",
            DiagnosticCode::FlexDirectionUnsaid => "FLEX_DIRECTION_UNSAID",
            DiagnosticCode::MotionIgnoresReducedMotion => "MOTION_IGNORES_REDUCED_MOTION",
            DiagnosticCode::ClassNotDrawnOnNative => "CLASS_NOT_DRAWN_ON_NATIVE",
        }
    }
}

/// The severity as a build tool spells it.
impl Severity {
    pub fn as_str(self) -> &'static str {
        match self {
            // Build-stopping; callers are expected to fail on this
            // rather than print it (see `@hozo/metro`).
            Severity::Error => "error",
            Severity::Warning => "warning",
            Severity::Info => "info",
        }
    }
}

/// Translates UTF-8 byte offsets into UTF-16 code unit offsets.
///
/// oxc reports byte offsets and every backend here uses them; JavaScript
/// indexes a string by UTF-16 code unit. A binding is where the
/// representation changes, so the translation belongs beside them rather
/// than inside one of them -- a consumer that splices with an untranslated
/// offset cuts in the wrong place, and the error grows with every
/// non-ASCII character before it. Two code units per em dash, ten for
/// `こんにちは` -- enough to delete the rest of the file, which is how this
/// was found.
///
/// Marks only where the two counts diverge. An all-ASCII source -- every
/// fixture in this repository, which is why nothing caught this -- costs
/// one scan and no memory, and `at` returns its argument. Between two
/// marks every character is one byte and one code unit, and that is what
/// makes the interpolation exact rather than approximate.
pub struct Utf16Offsets {
    /// `(byte, utf16)` immediately after each character where they differ.
    marks: Vec<(u32, u32)>,
}

impl Utf16Offsets {
    pub fn new(source: &str) -> Self {
        let mut marks = Vec::new();
        let mut utf16: u32 = 0;
        for (byte, ch) in source.char_indices() {
            let bytes = ch.len_utf8() as u32;
            let units = ch.len_utf16() as u32;
            utf16 += units;
            if bytes != units {
                marks.push((byte as u32 + bytes, utf16));
            }
        }
        Utf16Offsets { marks }
    }

    pub fn at(&self, byte: u32) -> u32 {
        if self.marks.is_empty() {
            return byte;
        }
        match self.marks.binary_search_by_key(&byte, |&(mark, _)| mark) {
            Ok(index) => self.marks[index].1,
            Err(0) => byte,
            Err(index) => {
                let (mark, utf16) = self.marks[index - 1];
                utf16 + (byte - mark)
            }
        }
    }
}
