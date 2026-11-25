//! Which CSS property a write owns, and which properties it covers when
//! another write to the same element competes with it.

use super::*;

#[derive(Debug)]
pub enum TailwindWriteOwnership<'a> {
    Unique {
        rule_id: u32,
        css_property: &'a str,
        specificity: [u32; 3],
    },
    Unknown(&'static str),
}

/// This bounded mapping names the CSS write *before* platform expansion.
/// It is not a property-order table. Shorthand/axis ownership does not prove
/// that Yoga and CSS resolve logical/physical conflicts in the same way.
pub(crate) fn covers(property: &str, write: &StyleProperty) -> bool {
    use StyleProperty::*;
    // `inset-2` writes all four physical edges from one `inset` declaration.
    // Each edge is still one Native key, so it stays a scalar projection.
    match write {
        InsetTop(_) => return matches!(property, "inset" | "top"),
        InsetRight(_) => return matches!(property, "inset" | "right"),
        InsetBottom(_) => return matches!(property, "inset" | "bottom"),
        InsetLeft(_) => return matches!(property, "inset" | "left"),
        // The parser has no theme, so `shadow-<name>` is a colour token
        // until a backend finds a theme shadow of that name
        // (`Theme::resolve_shadow_tokens`). Tailwind's own rule has already
        // decided: a size rule declares `--tw-shadow`, a colour rule
        // `--tw-shadow-color`. Either owns the write; a rule declaring both
        // is ambiguous and stays a barrier.
        ShadowColor(crate::Color::Token(_)) => {
            return matches!(property, "--tw-shadow" | "--tw-shadow-color")
        }
        _ => {}
    }
    if let Some(expected) = scalar_css_property(write) {
        return property == expected;
    }
    if let Some(owners) = border_edge_properties(write) {
        return owners.contains(&property);
    }
    match write {
        PaddingTop(_) => matches!(property, "padding" | "padding-block" | "padding-top"),
        PaddingBottom(_) => matches!(property, "padding" | "padding-block" | "padding-bottom"),
        PaddingLeft(_) => matches!(property, "padding" | "padding-inline" | "padding-left"),
        PaddingRight(_) => matches!(property, "padding" | "padding-inline" | "padding-right"),
        PaddingInlineStart(_) => matches!(
            property,
            "padding" | "padding-inline" | "padding-inline-start"
        ),
        PaddingInlineEnd(_) => matches!(
            property,
            "padding" | "padding-inline" | "padding-inline-end"
        ),
        MarginTop(_) => matches!(property, "margin" | "margin-block" | "margin-top"),
        MarginBottom(_) => matches!(property, "margin" | "margin-block" | "margin-bottom"),
        MarginLeft(_) => matches!(property, "margin" | "margin-inline" | "margin-left"),
        MarginRight(_) => matches!(property, "margin" | "margin-inline" | "margin-right"),
        MarginInlineStart(_) => {
            matches!(property, "margin" | "margin-inline" | "margin-inline-start")
        }
        MarginInlineEnd(_) => matches!(property, "margin" | "margin-inline" | "margin-inline-end"),
        InsetInline(_) => property == "inset-inline",
        InsetInlineStart(_) => property == "inset-inline-start",
        InsetInlineEnd(_) => property == "inset-inline-end",
        InsetBlock(_) => property == "inset-block",
        InsetBlockStart(_) => property == "inset-block-start",
        InsetBlockEnd(_) => property == "inset-block-end",
        Gap(_) => property == "gap",
        RowGap(_) => matches!(property, "gap" | "row-gap"),
        ColumnGap(_) => matches!(property, "gap" | "column-gap"),
        _ => false,
    }
}

/// The CSS declarations that write a border width, or the style Tailwind
/// writes beside every width (`border-style: var(--tw-border-style)`).
///
/// A width utility's style reads the `--tw-border-style` register, so it is
/// `solid` unless a style utility sets the register. Hozo writes it as
/// `BorderStyle::Default`, which never beats a written style, so both rank.
/// Widths in font-relative units fold through the font size and are left
/// out, as `font-size` is.
pub(crate) fn border_edge_properties(write: &StyleProperty) -> Option<[&'static str; 2]> {
    use crate::Edge;
    use StyleProperty::*;
    fn absolute(length: &crate::Length) -> bool {
        match length {
            crate::Length::Px(_) | crate::Length::Spacing(_) => true,
            crate::Length::Unit(_, unit) => unit.px().is_some(),
            crate::Length::Css(_) => false,
        }
    }
    fn logical(edge: Edge, suffix: &'static str) -> Option<&'static str> {
        Some(match (edge, suffix) {
            (Edge::Inline, "width") => "border-inline-width",
            (Edge::Block, "width") => "border-block-width",
            (Edge::InlineStart, "width") => "border-inline-start-width",
            (Edge::InlineEnd, "width") => "border-inline-end-width",
            (Edge::BlockStart, "width") => "border-block-start-width",
            (Edge::BlockEnd, "width") => "border-block-end-width",
            (Edge::Inline, _) => "border-inline-style",
            (Edge::Block, _) => "border-block-style",
            (Edge::InlineStart, _) => "border-inline-start-style",
            (Edge::InlineEnd, _) => "border-inline-end-style",
            (Edge::BlockStart, _) => "border-block-start-style",
            (Edge::BlockEnd, _) => "border-block-end-style",
            _ => return None,
        })
    }
    Some(match write {
        BorderTopWidth(length) if absolute(length) => ["border-width", "border-top-width"],
        BorderRightWidth(length) if absolute(length) => ["border-width", "border-right-width"],
        BorderBottomWidth(length) if absolute(length) => ["border-width", "border-bottom-width"],
        BorderLeftWidth(length) if absolute(length) => ["border-width", "border-left-width"],
        BorderTopStyle(_) => ["border-style", "border-top-style"],
        BorderRightStyle(_) => ["border-style", "border-right-style"],
        BorderBottomStyle(_) => ["border-style", "border-bottom-style"],
        BorderLeftStyle(_) => ["border-style", "border-left-style"],
        BorderLogicalWidth(edge, length) if absolute(length) => {
            let property = logical(*edge, "width")?;
            [property, property]
        }
        BorderLogicalStyle(edge, _) => {
            let property = logical(*edge, "style")?;
            [property, property]
        }
        _ => return None,
    })
}

/// Single-key projections with no shorthand/longhand alias, font-relative
/// folding or shared register composition. This is write ownership, never a
/// utility precedence table: priority still comes from the captured CSS rule.
/// Keep this definition shared by static planning and candidate generation.
pub(super) fn filter_register(
    function: crate::FilterFunction,
    backdrop: bool,
) -> Option<&'static str> {
    use crate::FilterFunction::*;
    Some(match (function, backdrop) {
        (Blur, false) => "--tw-blur",
        (Brightness, false) => "--tw-brightness",
        (Contrast, false) => "--tw-contrast",
        (Grayscale, false) => "--tw-grayscale",
        (HueRotate, false) => "--tw-hue-rotate",
        (Invert, false) => "--tw-invert",
        (Saturate, false) => "--tw-saturate",
        (Sepia, false) => "--tw-sepia",
        (Blur, true) => "--tw-backdrop-blur",
        (Brightness, true) => "--tw-backdrop-brightness",
        (Contrast, true) => "--tw-backdrop-contrast",
        (Grayscale, true) => "--tw-backdrop-grayscale",
        (HueRotate, true) => "--tw-backdrop-hue-rotate",
        (Invert, true) => "--tw-backdrop-invert",
        (Saturate, true) => "--tw-backdrop-saturate",
        (Sepia, true) => "--tw-backdrop-sepia",
        (Opacity, true) => "--tw-backdrop-opacity",
        (DropShadow | None | Opacity, _) => return Option::None,
    })
}

pub(crate) fn scalar_css_property(write: &StyleProperty) -> Option<&'static str> {
    fn absolute(length: &crate::Length) -> bool {
        match length {
            crate::Length::Px(_) | crate::Length::Spacing(_) => true,
            crate::Length::Unit(_, unit) => unit.px().is_some(),
            crate::Length::Css(_) => false,
        }
    }
    use StyleProperty::*;
    Some(match write {
        BackgroundColor(_) => "background-color",
        TextColor(_) => "color",
        FontWeight(_) => "font-weight",
        // Any size, absolute or not, is one `font-size`. Native's relative
        // folds read only pixel sizes and run after ordering, so ranking an
        // em size decides which size wins without changing what they read.
        FontSize(_) => "font-size",
        LineHeight(crate::LineHeight::Length(length) | crate::LineHeight::FontDefault(length))
            if absolute(length) =>
        {
            "line-height"
        }
        LetterSpacing(crate::LetterSpacing::Px(length)) if absolute(length) => "letter-spacing",
        // Relative metrics are one declaration each too. Native turns them
        // into pixels against the font size after ordering
        // (`fold_font_relative`), so ranking decides which leading or
        // tracking wins and the fold then sizes the winner exactly as it
        // sized the authored-last one before.
        LineHeight(crate::LineHeight::Ratio(_)) => "line-height",
        LetterSpacing(crate::LetterSpacing::Em(_)) => "letter-spacing",
        Width(_) => "width",
        Height(_) => "height",
        MinWidth(_) => "min-width",
        MaxWidth(_) => "max-width",
        MinHeight(_) => "min-height",
        MaxHeight(_) => "max-height",
        Opacity(_) => "opacity",
        ZIndex(Some(_)) => "z-index",
        FlexDirection(_) => "flex-direction",
        FlexGrow(_) => "flex-grow",
        FlexShrink(_) => "flex-shrink",
        FlexBasis(_) => "flex-basis",
        // One `flex` declaration on Web. On Native it projects to `flex` or
        // to `flexGrow`/`flexShrink`, the same keys `grow-*`/`shrink-*`
        // write. Yoga lets an explicit `flexGrow` beat `flex` by key and
        // Tailwind emits `flex-grow` after `flex`, so the two agree; where
        // the keys coincide (`flex-auto grow-0`), the order decides.
        Flex(_) => "flex",
        // `Block` is one Native key too: Yoga has no block context, so it
        // projects to `display: 'flex'`, which still has to beat an earlier
        // `display: 'none'` in the same order Tailwind's rules do.
        // `InlineFlex` is also `display: 'flex'`; Native adds a synthetic
        // `alignSelf: 'flex-start'` after ordering, only when no `self-*`
        // is authored and no later display in the same condition replaces
        // it, so ranking decides which display is "later" as Tailwind does.
        Display(
            crate::Display::Flex
            | crate::Display::None
            | crate::Display::Contents
            | crate::Display::Block
            | crate::Display::InlineFlex
            // Grid goes to the Native grid wrapper, which reads the last
            // unconditional display, so the ranked winner is the one it
            // sees. The other keywords are refused on Native as before;
            // on Web each is one `display` declaration.
            | crate::Display::Grid
            | crate::Display::Css(_),
        ) => "display",
        // One declaration each. Native's grid solver reads the last write
        // of each, and combines a shorthand with a longhand edge by key, as
        // Tailwind's order (`grid-column` before `grid-column-start`) does.
        GridTemplateColumns(_) => "grid-template-columns",
        GridTemplateRows(_) => "grid-template-rows",
        GridColumn(_) => "grid-column",
        GridColumnStart(_) => "grid-column-start",
        GridColumnEnd(_) => "grid-column-end",
        GridRow(_) => "grid-row",
        GridRowStart(_) => "grid-row-start",
        GridRowEnd(_) => "grid-row-end",
        // One CSS property and, where Native has it, one Native key each.
        InsetTop(_) => "top",
        InsetRight(_) => "right",
        InsetBottom(_) => "bottom",
        InsetLeft(_) => "left",
        AspectRatio(_) => "aspect-ratio",
        Order(_) => "order",
        BorderRadius(_) => "border-radius",
        // Each corner is its own declaration in Tailwind and its own key on
        // Native. Yoga lets a corner beat `borderRadius` by key, and Tailwind
        // emits every corner after `border-radius`, so the two agree.
        BorderTopLeftRadius(_) => "border-top-left-radius",
        BorderTopRightRadius(_) => "border-top-right-radius",
        BorderBottomRightRadius(_) => "border-bottom-right-radius",
        BorderBottomLeftRadius(_) => "border-bottom-left-radius",
        BorderStartStartRadius(_) => "border-start-start-radius",
        BorderStartEndRadius(_) => "border-start-end-radius",
        BorderEndStartRadius(_) => "border-end-start-radius",
        BorderEndEndRadius(_) => "border-end-end-radius",
        // Border colours, one declaration each. An axis writes two Native
        // keys (`borderStartColor`/`borderEndColor`), as `px-*` does; a side
        // beats `borderColor` by key, and Tailwind emits every side after
        // `border-color`, so the class tier agrees either way.
        BorderColor(_) => "border-color",
        BorderTopColor(_) => "border-top-color",
        BorderRightColor(_) => "border-right-color",
        BorderBottomColor(_) => "border-bottom-color",
        BorderLeftColor(_) => "border-left-color",
        BorderInlineColor(_) => "border-inline-color",
        BorderBlockColor(_) => "border-block-color",
        BorderInlineStartColor(_) => "border-inline-start-color",
        BorderInlineEndColor(_) => "border-inline-end-color",
        BorderBlockStartColor(_) => "border-block-start-color",
        BorderBlockEndColor(_) => "border-block-end-color",
        // Outline widths write `outline-style: var(--tw-outline-style)`
        // beside the width, as border widths do; Hozo writes that as
        // `BorderStyle::Default`, which never beats a written style.
        // `outline-none`/`outline-hidden` (`None`) is a written style too;
        // Native has no `none` and writes `outlineWidth: 0` instead, which
        // a later width can override where Tailwind's register would not (a
        // known gap, not an ordering one).
        OutlineWidth(length) if absolute(length) => "outline-width",
        // The fallback is part of its originating outline-hidden rule,
        // not an independent Tailwind position.
        OutlineStyle(_) | OutlineHiddenForcedColors => "outline-style",
        OutlineColor(_) => "outline-color",
        OutlineOffset(length) if absolute(length) => "outline-offset",
        Position(
            crate::Position::Relative
            | crate::Position::Absolute
            | crate::Position::Static
            // `fixed` and `sticky` are refused on Native as before.
            | crate::Position::Css(_),
        ) => "position",
        // `auto`, `clip` and the axes have no Native key and are refused
        // there, as a cursor Native lacks is; on Web they still cascade in
        // Tailwind's order, `overflow` before `overflow-x` and `overflow-y`.
        Overflow(_) => "overflow",
        OverflowX(_) => "overflow-x",
        OverflowY(_) => "overflow-y",
        TextDecorationLine("none" | "underline" | "line-through" | "underline line-through") => {
            "text-decoration-line"
        }
        TextDecorationColor(_) => "text-decoration-color",
        TextDecorationStyle(_) => "text-decoration-style",
        UserSelect("auto" | "text" | "none" | "all") => "user-select",
        AlignItems(
            crate::Align::Start
            | crate::Align::Center
            | crate::Align::End
            | crate::Align::Stretch
            | crate::Align::Baseline,
        ) => "align-items",
        AlignSelf(
            crate::AlignSelf::Auto
            | crate::AlignSelf::Start
            | crate::AlignSelf::Center
            | crate::AlignSelf::End
            | crate::AlignSelf::Stretch
            | crate::AlignSelf::Baseline,
        ) => "align-self",
        AlignContent(
            crate::Justify::Start
            | crate::Justify::Center
            | crate::Justify::End
            | crate::Justify::Between
            | crate::Justify::Around
            | crate::Justify::Evenly
            | crate::Justify::Stretch,
        ) => "align-content",
        JustifyContent(
            crate::Justify::Start
            | crate::Justify::Center
            | crate::Justify::End
            | crate::Justify::Between
            | crate::Justify::Around
            | crate::Justify::Evenly,
        ) => "justify-content",
        // `start`, `end` and `justify` write the same `textAlign` key on
        // Native as `left`, `center` and `right` do.
        TextAlign(_) => "text-align",
        TextTransform(_) => "text-transform",
        Keyword("font-style", "normal" | "italic") => "font-style",
        Keyword("flex-wrap", "nowrap" | "wrap" | "wrap-reverse") => "flex-wrap",
        Keyword("backface-visibility", "visible" | "hidden") => "backface-visibility",
        Keyword("box-sizing", "border-box" | "content-box") => "box-sizing",
        Keyword("isolation", "auto" | "isolate") => "isolation",
        Keyword("pointer-events", "auto" | "none") => "pointer-events",
        Keyword("user-select", "auto" | "text" | "none" | "all") => "user-select",
        Keyword("vertical-align", "auto" | "top" | "bottom" | "middle") => "vertical-align",
        // Native has no resize handle: `none` writes nothing there and the
        // others are refused, whichever wins, as before.
        Keyword("resize", "none" | "both" | "horizontal" | "vertical") => "resize",
        // `cursorColor` on a Native `TextInput`, which takes the last light
        // and dark colour; refused elsewhere. `accent-*` is refused on
        // Native whatever wins.
        CaretColor(_) => "caret-color",
        // `color` on `::placeholder`, which ranking asks for as a selector
        // (`scalar_write_priority`), never on the element itself. Native's
        // `placeholderTextColor` takes the last colour per scheme.
        PlaceholderColor(_) => "color",
        // One `animation` declaration. Native runs the last one under each
        // condition as a hook; a project's own `animate-<name>` and the
        // `animation-*` longhands are not read yet.
        Animation(_) => "animation",
        // The logical sizes, one declaration each. Native writes them as the
        // physical key (`inline-*` is `width`), the same key `w-*` writes,
        // so ranking decides which one lands last, as CSS's logical property
        // group does.
        InlineSize(_) => "inline-size",
        BlockSize(_) => "block-size",
        MinInlineSize(_) => "min-inline-size",
        MinBlockSize(_) => "min-block-size",
        MaxInlineSize(_) => "max-inline-size",
        MaxBlockSize(_) => "max-block-size",
        TransformOrigin(_) => "transform-origin",
        // Native carries these as `numberOfLines`/`ellipsizeMode` on Text,
        // reading the last of each (`truncation_props`). A line clamp's rule
        // also declares `overflow` and `display`; Web emits all four where
        // the clamp is in the plan's order, so a later `flex` still wins.
        WhiteSpace(_) => "white-space",
        TextOverflow(_) => "text-overflow",
        LineClamp(_) => "-webkit-line-clamp",
        // `@container` and `@container/<name>`: a query container for its
        // descendants' `@<size>:` variants, one declaration each.
        Keyword("container-type", "inline-size" | "size" | "normal") => "container-type",
        ContainerName(_) => "container-name",
        AccentColor(_) => "accent-color",
        // On the children, through [`CHILD_SCOPE`]; see `child_scoped`.
        // Each backend joins the parent's last gap behind a child's own
        // margin, so ranking only decides which gap that is.
        SpaceX(_) => "margin-inline-start",
        SpaceY(_) => "margin-block-start",
        // Each reverse flag is its register; a gap's rule also declares it,
        // as 0, but a gap write owns its margin, not the flag.
        SpaceReverse(crate::Axis::X) => "--tw-space-x-reverse",
        SpaceReverse(crate::Axis::Y) => "--tw-space-y-reverse",
        DivideReverse(crate::Axis::X) => "--tw-divide-x-reverse",
        DivideReverse(crate::Axis::Y) => "--tw-divide-y-reverse",
        // A divider's width, colour and style on the children. Its style
        // (`divide-dashed`) sets `--tw-border-style`, which every divider
        // width reads; a width's own implied style is written beneath every
        // written one (the base layer on Web, nothing on Native), so the
        // written style ranks like the others.
        DivideX(_) => "border-inline-start-width",
        DivideY(_) => "border-top-width",
        DivideColor(_) => "border-color",
        DivideStyle(_) => "border-style",
        // Tailwind 4.3's block-logical spacing, one declaration each. Native
        // writes the physical key (`paddingTop`), the one `pt-*` writes, so
        // ranking decides which lands last, as the logical group does in CSS.
        PaddingBlockStart(_) => "padding-block-start",
        PaddingBlockEnd(_) => "padding-block-end",
        MarginBlockStart(_) => "margin-block-start",
        MarginBlockEnd(_) => "margin-block-end",
        // One declaration and, where Native has it, one key each. A cursor
        // Native lacks is refused there, as an unsupported display is.
        Cursor(_) => "cursor",
        FontFamily(_) => "font-family",
        // `transition` and `transition-colors` declare all three; `duration-*`
        // and `ease-*` declare their register and the one property. A
        // utility's own duration or easing still beats `transition`'s
        // fallback by provenance (`dedupe_last_wins`), as Tailwind's
        // `var(--tw-duration, 0s)` does, whichever is ranked later.
        TransitionProperty(_) => "transition-property",
        TransitionDuration(..) => "transition-duration",
        TransitionDelay(..) => "transition-delay",
        TransitionTimingFunction(..) => "transition-timing-function",
        ObjectFit(_) => "object-fit",
        // `mixBlendMode` on Native, apart from `plus-darker`, which is
        // refused there as before; `bg-blend-*` is refused there whole.
        MixBlendMode(_) => "mix-blend-mode",
        BackgroundBlendMode(_) => "background-blend-mode",
        // Native has neither multi-column layout nor text-decoration metrics,
        // so both are refused there as before; the gain is the Web cascade.
        Columns(_) => "columns",
        TextUnderlineOffset(_) => "text-underline-offset",
        // `rotate-*` writes `rotate` itself. Each translate and scale axis
        // writes its own register, which one `translate`/`scale` declaration
        // reads; that declaration is in every axis rule, so the register is
        // what decides which rule owns the axis. Hozo holds each axis as its
        // own write and joins them at emit time, on Native into one
        // `transform` in a fixed function order, so ranking only decides
        // which value each axis keeps.
        Rotate(_) => "rotate",
        TranslateX(_) => "--tw-translate-x",
        TranslateY(_) => "--tw-translate-y",
        TranslateZ(_) => "--tw-translate-z",
        ScaleX(_) => "--tw-scale-x",
        ScaleY(_) => "--tw-scale-y",
        ScaleZ(_) => "--tw-scale-z",
        // The same shape for the functions Tailwind reads in one
        // `transform`: each 3D rotation and skew writes its own register.
        RotateX(_) => "--tw-rotate-x",
        RotateY(_) => "--tw-rotate-y",
        RotateZ(_) => "--tw-rotate-z",
        SkewX(_) => "--tw-skew-x",
        SkewY(_) => "--tw-skew-y",
        // Every axis rule also writes the shared declaration (`translate`,
        // `scale`, `transform`) in its own form; the last such rule decides
        // the form. Hozo's axis writes own their registers, and these own
        // the declaration: a reset turns it off, `scale-3d` (and the z form
        // of `scale-z-*`) adds the third component, `transform`/`-cpu`/
        // `-gpu` write the chain. Each backend reads the last of them
        // against the last axis write, which ranking puts in Tailwind's order.
        TranslateNone => "translate",
        ScaleNone | Scale3d => "scale",
        RotateNone => "rotate",
        TransformNone | TransformEmpty | TransformGpu => "transform",
        // A reset writes the declaration itself without clearing registers.
        // Each ordinary function owns the register the declaration reads.
        Filter(crate::FilterFunction::None, _) => "filter",
        BackdropFilter(crate::FilterFunction::None, _) => "backdrop-filter",
        // A drop shadow is two registers in Tailwind: the size rule sets
        // `--tw-drop-shadow-size` (which reads the colour) and the colour
        // rule `--tw-drop-shadow-color`; each owns its own. `drop-shadow-none`
        // writes `--tw-drop-shadow` itself and stays a barrier.
        Filter(crate::FilterFunction::DropShadow, value) if !value.is_empty() => {
            "--tw-drop-shadow-size"
        }
        // `drop-shadow-none` writes the shadow itself; Tailwind sorts it
        // after every size and colour rule, and Hozo keeps the last drop
        // shadow write, so it turns the shadow off as the register does.
        Filter(crate::FilterFunction::DropShadow, _) => "--tw-drop-shadow",
        DropShadowColor(_) => "--tw-drop-shadow-color",
        Filter(function, _) => filter_register(*function, false)?,
        BackdropFilter(function, _) => filter_register(*function, true)?,
        // Shadows and rings are five layers in one `box-shadow`, and each
        // layer, colour, offset and the inset flag is a register of its own.
        // `ring-offset-*` also writes `--tw-ring-offset-shadow`, which reads
        // the width; the width register is the one Hozo's write sets.
        BoxShadow(_) => "--tw-shadow",
        ShadowColor(_) => "--tw-shadow-color",
        InsetShadow(_) => "--tw-inset-shadow",
        InsetShadowColor(_) => "--tw-inset-shadow-color",
        RingWidth(_) => "--tw-ring-shadow",
        RingColor(_) => "--tw-ring-color",
        InsetRingWidth(_) => "--tw-inset-ring-shadow",
        InsetRingColor(_) => "--tw-inset-ring-color",
        RingOffsetWidth(_) => "--tw-ring-offset-width",
        RingOffsetColor(_) => "--tw-ring-offset-color",
        RingInset => "--tw-ring-inset",
        // A constructor (`bg-linear-*`, `bg-radial`), `bg-none` and an
        // image all declare `background-image` itself; the constructor's
        // `--tw-gradient-position` rides along. Each stop's colour and
        // position is a register, read through `--tw-gradient-stops`, which
        // every colour rule also declares.
        Gradient(..) | BackgroundImageNone | BackgroundImage(_) => "background-image",
        GradientStopColor(crate::GradientStop::From, _) => "--tw-gradient-from",
        // `via-none` takes the middle stop back out through
        // `--tw-gradient-via-stops: initial`; Tailwind sorts it before every
        // `via-<colour>`, which Hozo's last-wins keeps.
        GradientStopColor(crate::GradientStop::Via, crate::Color::Keyword("initial")) => {
            "--tw-gradient-via-stops"
        }
        GradientStopColor(crate::GradientStop::Via, _) => "--tw-gradient-via",
        GradientStopColor(crate::GradientStop::To, _) => "--tw-gradient-to",
        GradientStopPosition(crate::GradientStop::From, _) => "--tw-gradient-from-position",
        GradientStopPosition(crate::GradientStop::Via, _) => "--tw-gradient-via-position",
        GradientStopPosition(crate::GradientStop::To, _) => "--tw-gradient-to-position",
        _ => return None,
    })
}

pub fn assess_tailwind_write<'a>(
    candidate: &'a OrderCandidateDescriptor,
    write: &StyleProperty,
) -> TailwindWriteOwnership<'a> {
    let mut found = None;
    for rule in &candidate.rules {
        let assessment = match assess_tailwind_rule(&candidate.candidate, rule) {
            Ok(assessment) => assessment,
            // An unassessed rule could also write this property. Do not
            // cherry-pick a unique-looking owner from the assessed remainder.
            Err(reason) => return TailwindWriteOwnership::Unknown(reason.reason()),
        };
        // A child-scoped write is owned only by a child-scoped rule, and an
        // element write never by one.
        if assessment.child_scope != child_scoped(write) {
            continue;
        }
        for property in assessment.properties {
            if covers(property, write) {
                if found.is_some() {
                    return TailwindWriteOwnership::Unknown("ambiguous-property-owner");
                }
                found = Some(TailwindWriteOwnership::Unique {
                    rule_id: rule.id,
                    css_property: property,
                    specificity: assessment.specificity,
                });
            }
        }
    }
    found.unwrap_or(TailwindWriteOwnership::Unknown("unmapped-property"))
}
