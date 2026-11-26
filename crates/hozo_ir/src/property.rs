//! A style declaration: the property it sets, under which condition,
//! and where it came from.

use super::*;

#[derive(Debug, Clone, PartialEq)]
pub struct StyleDeclaration {
    pub property: StyleProperty,
    pub condition: Condition,
    pub source: StyleSource,
}

/// A styling input is a cascade boundary, not another predicate. Tailwind
/// orders utilities within its class list; StyleX resolves atomic priority
/// within its props call. Neither may reorder the other's declarations.
/// The input ID is the JSX attribute's source offset; optional candidate IDs
/// belong to its root's unit table. Neither is emitted at runtime.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum StyleSource {
    #[default]
    Unspecified,
    Tailwind(u32),
    /// Candidate identity before expansion. Its upstream rule binding is not
    /// yet known; the ID is scoped to the parser root's shared unit table.
    TailwindUtility {
        input: u32,
        utility: TailwindUtilityId,
    },
    /// The common planner has ordered these writes. Downstream grouping may
    /// coalesce adjacent equal guards, never reach back across another guard.
    TailwindOrdered {
        input: u32,
        utility: TailwindUtilityId,
    },
    Stylex(u32),
}

impl StyleSource {
    /// Utility identity must not create another JSX input region. This layer
    /// retains the existing cascade while a later planner can inspect IDs.
    pub fn input(self) -> Self {
        match self {
            Self::TailwindUtility { input, .. } | Self::TailwindOrdered { input, .. } => {
                Self::Tailwind(input)
            }
            source => source,
        }
    }

    pub fn with_tailwind_input(self, input: u32) -> Self {
        match self {
            Self::TailwindUtility { utility, .. } => Self::TailwindUtility { input, utility },
            Self::TailwindOrdered { utility, .. } => Self::TailwindOrdered { input, utility },
            _ => Self::Tailwind(input),
        }
    }

    pub fn utility(self) -> Option<TailwindUtilityId> {
        match self {
            Self::TailwindUtility { utility, .. } | Self::TailwindOrdered { utility, .. } => {
                Some(utility)
            }
            _ => None,
        }
    }
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
    Gap(Dimension),
    RowGap(Dimension),
    ColumnGap(Dimension),
    // Margin/padding/inset are per-side longhand properties, not a single
    // EdgeInsets-bundling property: Tailwind utilities like `px-4`/`py-2`
    // set disjoint sides independently, and only per-side variants let
    // "last declaration for a property wins" flattening compose them
    // correctly instead of one clobbering the other.
    MarginTop(Dimension),
    MarginRight(Dimension),
    MarginBottom(Dimension),
    MarginLeft(Dimension),
    PaddingTop(Dimension),
    PaddingRight(Dimension),
    PaddingBottom(Dimension),
    PaddingLeft(Dimension),
    // Writing-direction-relative counterparts, kept as their own variants
    // rather than resolved to a physical side: which side "start" means
    // isn't known until runtime (the document's direction on Web,
    // `I18nManager.isRTL` on Native), so collapsing them here would bake in
    // LTR and silently break RTL layouts. Both platforms have real
    // equivalents to lower onto -- CSS `*-inline-start/end`, RN
    // `paddingStart`/`marginEnd`/etc.
    MarginInlineStart(Dimension),
    MarginInlineEnd(Dimension),
    PaddingInlineStart(Dimension),
    PaddingInlineEnd(Dimension),
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
    AspectRatio(String),
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
    /// A static declaration accepted by StyleX's published Web surface but
    /// absent from React Native's style interface.
    ///
    /// Unlike `Arbitrary`, both the property and its value were checked by
    /// the StyleX frontend. Keeping this lane explicit lets Web emit it
    /// directly while Native produces an intentional, actionable refusal.
    WebOnly(String, String),
    /// StyleX `firstThatWorks(...)`: candidates in authored preference
    /// order. Web emits them in reverse because CSS's last supported
    /// declaration wins; Native selects the first value it can represent.
    ///
    /// The StyleX frontend only constructs this when every candidate maps
    /// to one typed declaration for the same final property slot.
    FirstThatWorks(Vec<StyleProperty>),
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

    /// An authored standalone `scale` property. Unlike Tailwind's axis
    /// utilities, StyleX may write one, two, or three components and that
    /// arity is observable in the generated CSS. React Native receives the
    /// equivalent scale entries (and a matrix for the optional Z axis).
    Scale(Vec<Scale>),

    /// An authored standalone `translate` property. Keeping the components
    /// together preserves whether StyleX wrote one or two values on Web;
    /// Native lowers them to translateX/translateY in CSS application order.
    Translate(Vec<Dimension>),

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
    TextShadow(TextShadowValue),
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
    /// A font-family value. Static StyleX declarations use one portable
    /// family name; Tailwind's named utilities keep their theme token.
    FontFamily(FontFamily),
    /// The intersection of CSS font-variant keywords and React Native's
    /// `FontVariant[]`, retained in authored order.
    FontVariant(Vec<&'static str>),
    FontSize(Length),
    FontWeight(FontWeight),
    LineHeight(LineHeight),
    /// A CSS leading register write, not a direct line-height declaration.
    LeadingRegister(f64),
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
    TransitionDelay(u32, Origin),
    TransitionTimingFunction(String, Origin),
    /// A static `stylex.keyframes(...)` referenced by `animationName`.
    /// The Web backend hoists and deduplicates the carried frames; Native
    /// refuses them because arbitrary CSS keyframes have no StyleSheet form.
    AnimationName(Keyframes),
    /// Carries the named animation rather than its shorthand text so Web
    /// can emit the matching `@keyframes` and Native can select a dedicated
    /// runtime lowering. Native currently wires Spin and refuses the other
    /// motion shapes rather than approximating them.
    Animation(Animation),
    /// `animate-<name>` for a name that is not one of Tailwind's four: an
    /// animation only the project's theme can define (decision 007, slice
    /// 3). Held by name because the parser has no theme; each backend looks
    /// it up in its own and does nothing when the theme does not have it --
    /// the class is carried too, so a project's CSS can still run it.
    ThemeAnimation(String),
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
    PaddingBlockStart(Dimension),
    PaddingBlockEnd(Dimension),
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
    StrokeWidth(StrokeWidth),
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
    /// The browser-only high-contrast fallback of Tailwind's outline-hidden.
    /// Separate from outline-style so an ordinary outline writer cannot
    /// erase the forced-colors branch by replacing the base declaration.
    OutlineHiddenForcedColors,
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
