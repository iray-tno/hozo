//! `StyleProperty` -> React Native `StyleSheet` property/value text.
//!
//! Several platform differences from `hozo_web::css` that aren't just
//! "different syntax for the same idea":
//! - RN style values are unitless numbers (density-independent pixels), not
//!   CSS length strings -- no `px` suffix.
//! - RN's `flex` is a single number (roughly flex-grow), not a CSS
//!   `grow shrink basis` shorthand string -- `FlexShorthand::Auto`/
//!   `Initial`/`None` have no single-number equivalent, so they expand to
//!   `flexGrow`/`flexShrink` pairs instead.
//! - RN's `fontWeight` is a *string* (`'700'`), not a number, unlike CSS.
//! - `Color` resolves against the default Tailwind palette via
//!   `hozo_ir::resolve_color_token` (hex, since RN's style system doesn't
//!   understand `oklch()`). A token outside the default palette (custom
//!   theme colors, arbitrary values -- still proposal §16/Phase 4 territory)
//!   falls back to a placeholder marker string, deliberately not
//!   real-color-shaped so a missed resolution fails loudly instead of
//!   rendering a plausible-but-wrong color. RN has nothing like a CSS custom
//!   property to defer to the way Web's `var(--hozo-color-x)` does.

mod children;
mod color;
mod effects;
mod layers;
mod values;

pub use children::{child_property_and_value, is_child_scoped};
pub use color::placeholder_color;
pub(crate) use color::resolve_theme_color;
pub use layers::fold_base_layers;
pub(super) use layers::ComposedLayers;
pub use values::js_string;
use values::{
    aspect_number, border_style_literal, dimension_value, justify_literal, number, radius_pair,
};

pub(super) use effects::{
    background_image_entry, box_shadow_entry, filter_entry, gradient_prelude, shadow_paint_parts,
    split_shadow_layers, transform_entry, GRADIENT_EMPTY_COLOR, RING_COLOR, RING_OFFSET_COLOR,
};

use hozo_ir::{
    Align, AlignSelf, Axis, BorderStyle, Color, DecorationStyle, Dimension, Display, Edge,
    FilterFunction, FlexDirection, FlexShorthand, GradientKind, GradientStop, Justify, Length,
    LetterSpacing, LineHeight, Overflow, Position, Radius, StyleProperty, TextAlign, TextTransform,
    Theme, TransformFunction,
};

/// Maps one `StyleProperty` to one or more `(rn-style-key, value)` pairs
/// (plural because e.g. `FlexShorthand::Auto` has no single-number RN
/// equivalent and must expand to two keys).
pub fn property_and_value<'a>(prop: &'a StyleProperty, theme: &Theme) -> Vec<(&'a str, String)> {
    let resolve_color = |color: &Color| resolve_theme_color(color, theme);
    match prop {
        StyleProperty::FirstThatWorks(candidates) => candidates
            .iter()
            .find(|candidate| {
                candidate.unsupported_on_native().is_none()
                    && candidate.not_wired_on_native().is_none()
            })
            .map_or_else(Vec::new, |candidate| property_and_value(candidate, theme)),
        // Refused by `unsupported_on_native`, so this is only reached if
        // something bypassed it. Emitting nothing is the safe end of
        // that: a CSS property name means nothing to React Native, and
        // inventing a camelCase spelling would turn a build error into a
        // style that silently does nothing on a device.
        //
        // The refusal was claimed here before it existed. Nothing matched
        // `Arbitrary` upstream, so this arm was the only thing that saw
        // one -- and it returns nothing, which is exactly the silence the
        // comment said could not happen.
        StyleProperty::Arbitrary(..)
        | StyleProperty::WebOnly(..)
        | StyleProperty::AnimationName(..)
        | StyleProperty::ThemeAnimation(..) => Vec::new(),
        // Composed into one background image by `background_image_entry`,
        // the same way the transform axes are.
        StyleProperty::BackgroundImageNone
        | StyleProperty::BackgroundImage(..)
        | StyleProperty::Gradient(..)
        | StyleProperty::GradientStopColor(..)
        | StyleProperty::GradientStopPosition(..) => Vec::new(),
        StyleProperty::Display(d) => match d {
            // Yoga has no block formatting context: every visible View is
            // a flex container. Emitting flex (rather than dropping block)
            // is important because it can override an earlier display:none.
            Display::Flex | Display::Block | Display::InlineFlex => {
                vec![("display", "'flex'".to_string())]
            }
            Display::None => vec![("display", "'none'".to_string())],
            Display::Contents => vec![("display", "'contents'".to_string())],
            // No RN equivalent (Yoga has only the three above). The caller
            // raises `WebOnlyPropertyOnNative` and fails the build; nothing
            // is emitted here so a build that ignored the error can't ship
            // an invalid style value either.
            Display::Grid | Display::Css(_) => Vec::new(),
        },
        StyleProperty::FlexDirection(dir) => vec![(
            "flexDirection",
            match dir {
                FlexDirection::Row => "'row'",
                FlexDirection::Column => "'column'",
                FlexDirection::RowReverse => "'row-reverse'",
                FlexDirection::ColumnReverse => "'column-reverse'",
            }
            .to_string(),
        )],
        StyleProperty::Flex(shorthand) => match shorthand {
            FlexShorthand::Grow(n) => vec![("flex", format!("{n}"))],
            // RN's `flex` is a grow factor, and a fraction of the parent is
            // not one -- refused upstream rather than divided into
            // something that would lay out differently.
            FlexShorthand::Fraction(..) => Vec::new(),
            FlexShorthand::Auto => vec![("flexGrow", "1".to_string()), ("flexShrink", "1".to_string())],
            FlexShorthand::Initial => vec![("flexGrow", "0".to_string()), ("flexShrink", "1".to_string())],
            FlexShorthand::None => vec![("flexGrow", "0".to_string()), ("flexShrink", "0".to_string())],
        },
        StyleProperty::AlignItems(align) => vec![(
            "alignItems",
            match align {
                Align::Start => "'flex-start'",
                Align::Center => "'center'",
                Align::End => "'flex-end'",
                Align::Stretch => "'stretch'",
                Align::Baseline => "'baseline'",
            Align::Css(_) => "",
            }
            .to_string(),
        )],
        StyleProperty::AlignSelf(align) => vec![(
            "alignSelf",
            match align {
                AlignSelf::Auto => "'auto'",
                AlignSelf::Start => "'flex-start'",
                AlignSelf::Center => "'center'",
                AlignSelf::End => "'flex-end'",
                AlignSelf::Stretch => "'stretch'",
                AlignSelf::Baseline => "'baseline'",
            AlignSelf::Css(_) => "",
            }
            .to_string(),
        )],
        // `stretch` is legal on alignContent and not on justifyContent, and
        // `baseline` on neither -- so which values are allowed is decided
        // here, per property, rather than inside `justify_literal`, which
        // can't see which of the two it is serving. Both are refused
        // upstream; emitting them anyway would put a value in the
        // StyleSheet that React Native's own types reject.
        StyleProperty::AlignContent(Justify::Baseline) => Vec::new(),
        StyleProperty::JustifyContent(Justify::Stretch | Justify::Baseline) => Vec::new(),
        StyleProperty::AlignContent(justify) => vec![("alignContent", justify_literal(justify))],
        StyleProperty::JustifyContent(justify) => vec![("justifyContent", justify_literal(justify))],
        // Native arrays merge keys, not shorthands. Emit the same axis
        // keys as gap-x/y so an ordered gap can replace an earlier axis.
        StyleProperty::Gap(l) => {
            let value = number(l, theme);
            vec![("rowGap", value.clone()), ("columnGap", value)]
        }
        StyleProperty::RowGap(l) => vec![("rowGap", number(l, theme))],
        StyleProperty::ColumnGap(l) => vec![("columnGap", number(l, theme))],
        StyleProperty::MarginTop(d) => vec![("marginTop", dimension_value(d, theme))],
        StyleProperty::MarginRight(d) => vec![("marginRight", dimension_value(d, theme))],
        StyleProperty::MarginBottom(d) => vec![("marginBottom", dimension_value(d, theme))],
        StyleProperty::MarginLeft(d) => vec![("marginLeft", dimension_value(d, theme))],
        StyleProperty::PaddingTop(l) => vec![("paddingTop", number(l, theme))],
        StyleProperty::PaddingRight(l) => vec![("paddingRight", number(l, theme))],
        StyleProperty::PaddingBottom(l) => vec![("paddingBottom", number(l, theme))],
        StyleProperty::PaddingLeft(l) => vec![("paddingLeft", number(l, theme))],
        // RN's own direction-relative props; they resolve against
        // `I18nManager.isRTL` at runtime, same role as CSS's inline-start/end.
        StyleProperty::MarginInlineStart(d) => vec![("marginStart", dimension_value(d, theme))],
        StyleProperty::MarginInlineEnd(d) => vec![("marginEnd", dimension_value(d, theme))],
        StyleProperty::PaddingInlineStart(l) => vec![("paddingStart", number(l, theme))],
        StyleProperty::PaddingInlineEnd(l) => vec![("paddingEnd", number(l, theme))],
        StyleProperty::Width(d) => vec![("width", dimension_value(d, theme))],
        StyleProperty::Height(d) => vec![("height", dimension_value(d, theme))],
        StyleProperty::MinWidth(d) => vec![("minWidth", dimension_value(d, theme))],
        StyleProperty::FlexBasis(d) => vec![("flexBasis", dimension_value(d, theme))],
        // The block/inline logical sizes only differ from height/width
        // under a vertical `writing-mode`, which React Native has no
        // concept of -- the same assumption `py-*` already lowers under.
        StyleProperty::BlockSize(d) => vec![("height", dimension_value(d, theme))],
        StyleProperty::InlineSize(d) => vec![("width", dimension_value(d, theme))],
        StyleProperty::MaxBlockSize(d) => vec![("maxHeight", dimension_value(d, theme))],
        StyleProperty::MaxInlineSize(d) => vec![("maxWidth", dimension_value(d, theme))],
        StyleProperty::MinBlockSize(d) => vec![("minHeight", dimension_value(d, theme))],
        StyleProperty::MinInlineSize(d) => vec![("minWidth", dimension_value(d, theme))],
        StyleProperty::MarginBlockStart(d) => vec![("marginTop", dimension_value(d, theme))],
        StyleProperty::MarginBlockEnd(d) => vec![("marginBottom", dimension_value(d, theme))],
        StyleProperty::PaddingBlockStart(l) => vec![("paddingTop", number(l, theme))],
        StyleProperty::PaddingBlockEnd(l) => vec![("paddingBottom", number(l, theme))],
        // Refused upstream by `unsupported_on_native`.
        StyleProperty::TranslateZ(_)
        | StyleProperty::TextIndent(_)
        | StyleProperty::BorderSpacingX(_)
        | StyleProperty::BorderSpacingY(_) => Vec::new(),
        StyleProperty::MinHeight(d) => vec![("minHeight", dimension_value(d, theme))],
        StyleProperty::MaxWidth(d) => vec![("maxWidth", dimension_value(d, theme))],
        StyleProperty::MaxHeight(d) => vec![("maxHeight", dimension_value(d, theme))],
        // RN's zIndex is a number; `auto` is refused upstream.
        StyleProperty::ZIndex(z) => z.map_or_else(Vec::new, |z| vec![("zIndex", z.to_string())]),
        // RN's `cursor` takes `auto` and `pointer`; every other keyword is
        // refused upstream by `unsupported_on_native`, so anything reaching
        // here is one of the two.
        // Only the two RN has; the rest are refused upstream, and emitting
        // them anyway would put a value in the StyleSheet that RN's own
        // types reject -- which is the convention every other refused
        // value here already follows.
        StyleProperty::Cursor(keyword) => match keyword.as_str() {
            "auto" | "pointer" => vec![("cursor", js_string(keyword))],
            _ => Vec::new(),
        },
        // RN has `mixBlendMode` and takes the same keywords;
        // `background-blend-mode` is refused upstream.
        // Only the three React Native has; the rest are refused upstream by
        // name. The key is the camelCase of the CSS property, which is how
        // RN spells all three.
        // Consumed by `HozoContainer`, which is what `@container` becomes
        // here. Emitting a `containerType` key would be a style React
        // Native drops on the floor.
        StyleProperty::Keyword("container-type", _) => Vec::new(),
        StyleProperty::Keyword("user-select", value) => {
            vec![("userSelect", js_string(value))]
        }
        StyleProperty::Keyword("vertical-align", value) => match *value {
            "auto" | "top" | "bottom" | "middle" => {
                vec![("verticalAlign", js_string(value))]
            }
            _ => Vec::new(),
        },
        StyleProperty::Keyword("transform-origin", value) => {
            vec![("transformOrigin", js_string(value))]
        }
        StyleProperty::TransformOrigin(value) => {
            vec![("transformOrigin", js_string(value))]
        }
        // The camelCase of the CSS name, which is how RN spells each of
        // these. `font-family` keeps the whole stack: RN takes one family
        // name, but a stack is a legal string there and the platform picks
        // the first it has, which is the same behaviour.
        StyleProperty::Keyword("backface-visibility", v) => {
            vec![("backfaceVisibility", js_string(v))]
        }
        StyleProperty::Keyword("box-sizing", v) => vec![("boxSizing", js_string(v))],
        StyleProperty::Keyword("isolation", v) => vec![("isolation", js_string(v))],
        StyleProperty::Keyword("pointer-events", v) => {
            vec![("pointerEvents", js_string(v))]
        }
        StyleProperty::Keyword("font-style", v) => vec![("fontStyle", js_string(v))],
        StyleProperty::Keyword("direction", v) => vec![("direction", js_string(v))],
        StyleProperty::Keyword("flex-wrap", v) => vec![("flexWrap", js_string(v))],
        // RN has `objectFit` with the same five keywords, `userSelect`, and
        // `textDecorationLine` with all but `overline`. The per-axis
        // overflows are refused upstream -- RN has only the combined one.
        // RN spells the two inline edges `borderStartWidth`/`borderEndWidth`
        // and has no combined inline/block width; the block edges are top
        // and bottom there, since it has no vertical writing mode. It has
        // no per-edge border style at all -- and needs none, because a
        // width renders on its own.
        StyleProperty::BorderLogicalWidth(edge, l) => match edge {
            Edge::InlineStart => vec![("borderStartWidth", number(l, theme))],
            Edge::InlineEnd => vec![("borderEndWidth", number(l, theme))],
            Edge::BlockStart => vec![("borderTopWidth", number(l, theme))],
            Edge::BlockEnd => vec![("borderBottomWidth", number(l, theme))],
            Edge::Inline => {
                vec![("borderStartWidth", number(l, theme)), ("borderEndWidth", number(l, theme))]
            }
            Edge::Block => {
                vec![("borderTopWidth", number(l, theme)), ("borderBottomWidth", number(l, theme))]
            }
            _ => Vec::new(),
        },
        StyleProperty::BorderLogicalStyle(..) => Vec::new(),
        // Absorbed into `numberOfLines` by `truncation_props`, the same way
        // `truncate` is -- React Native clamps lines with a prop, not a
        // style.
        // RN composes every transform into one array, so "off" is the
        // absence of an entry rather than a value; refused upstream so it
        // isn't silently a no-op when written after a transform.
        StyleProperty::RotateNone
        | StyleProperty::ScaleNone
        | StyleProperty::TranslateNone
        | StyleProperty::TransformNone
        | StyleProperty::TransformEmpty
        | StyleProperty::TransformGpu => Vec::new(),
        StyleProperty::LineClamp(_) => Vec::new(),
        StyleProperty::FlexGrow(n) => vec![("flexGrow", format!("{n}"))],
        StyleProperty::FlexShrink(n) => vec![("flexShrink", format!("{n}"))],
        // RN's aspectRatio takes a number, so the ratio is divided out. It
        // has no `auto`, which is refused upstream.
        StyleProperty::AspectRatio(v) => match aspect_number(v) {
            Some(n) => vec![("aspectRatio", n)],
            None => Vec::new(),
        },
        StyleProperty::ObjectFit(v) => vec![("objectFit", js_string(v))],
        StyleProperty::UserSelect(v) => vec![("userSelect", js_string(v))],
        // Underline, line-through and their combination; `overline` is
        // Web-only and refused upstream.
        StyleProperty::TextDecorationLine("overline") => Vec::new(),
        StyleProperty::TextDecorationLine(v) => vec![("textDecorationLine", js_string(v))],
        StyleProperty::OverflowX(_) | StyleProperty::OverflowY(_) => Vec::new(),
        // The platform has no drag handle to turn off. Other resize values
        // remain refused upstream, not converted to this reset.
        StyleProperty::Keyword("resize", "none") => Vec::new(),
        StyleProperty::Keyword(..) => Vec::new(),
        // Every one of these is a vendor-prefixed Web property or a text
        // shaping control React Native doesn't have; refused upstream.
        StyleProperty::KeywordPair(..)
        | StyleProperty::Content(_)
        | StyleProperty::ContainerName(_) => Vec::new(),
        StyleProperty::MixBlendMode(m) => match *m {
            "plus-darker" => Vec::new(),
            _ => vec![("mixBlendMode", js_string(m))],
        },
        StyleProperty::BackgroundBlendMode(_) => Vec::new(),
        // Both refused upstream: Yoga has no flex `order`, and React Native
        // has no multi-column layout.
        StyleProperty::Order(_) | StyleProperty::Columns(_) => Vec::new(),
        StyleProperty::Position(pos) => vec![(
            "position",
            match pos {
                Position::Relative => "'relative'",
                Position::Absolute => "'absolute'",
            Position::Static => "'static'",
            // RN's static is not CSS's; fixed and sticky have no equivalent.
            // All three refused upstream.
            Position::Css(_) => "",
            }
            .to_string(),
        )],
        StyleProperty::InsetTop(d) => vec![("top", dimension_value(d, theme))],
        StyleProperty::InsetRight(d) => vec![("right", dimension_value(d, theme))],
        StyleProperty::InsetBottom(d) => vec![("bottom", dimension_value(d, theme))],
        StyleProperty::InsetLeft(d) => vec![("left", dimension_value(d, theme))],
        StyleProperty::InsetInlineStart(d) => vec![("start", dimension_value(d, theme))],
        StyleProperty::InsetInlineEnd(d) => vec![("end", dimension_value(d, theme))],
        // No axis shorthand in React Native, so both edges are written.
        StyleProperty::InsetInline(d) => {
            vec![("start", dimension_value(d, theme)), ("end", dimension_value(d, theme))]
        }
        StyleProperty::InsetBlock(d) => {
            vec![("top", dimension_value(d, theme)), ("bottom", dimension_value(d, theme))]
        }
        // The block axis is only distinct from top/bottom under a vertical
        // `writing-mode`, which React Native has no concept of.
        StyleProperty::InsetBlockStart(d) => vec![("top", dimension_value(d, theme))],
        StyleProperty::InsetBlockEnd(d) => vec![("bottom", dimension_value(d, theme))],
        StyleProperty::BackgroundColor(c) => vec![("backgroundColor", resolve_color(c))],
        StyleProperty::Opacity(o) => vec![("opacity", format!("{o}"))],
        StyleProperty::BorderColor(c) => vec![("borderColor", resolve_color(c))],
        StyleProperty::BorderTopColor(c) => vec![("borderTopColor", resolve_color(c))],
        StyleProperty::BorderRightColor(c) => vec![("borderRightColor", resolve_color(c))],
        StyleProperty::BorderBottomColor(c) => vec![("borderBottomColor", resolve_color(c))],
        StyleProperty::BorderLeftColor(c) => vec![("borderLeftColor", resolve_color(c))],
        // React Native has no axis shorthand, so the two sides are written
        // out. It does have the inline-logical pair (`borderStartColor` /
        // `borderEndColor`), which is what keeps `border-s-*` correct under
        // RTL rather than being flattened to left/right.
        StyleProperty::BorderInlineColor(c) => vec![
            ("borderStartColor", resolve_color(c)),
            ("borderEndColor", resolve_color(c)),
        ],
        StyleProperty::BorderBlockColor(c) => vec![
            ("borderTopColor", resolve_color(c)),
            ("borderBottomColor", resolve_color(c)),
        ],
        StyleProperty::BorderInlineStartColor(c) => vec![("borderStartColor", resolve_color(c))],
        StyleProperty::BorderInlineEndColor(c) => vec![("borderEndColor", resolve_color(c))],
        // The block axis only diverges from top/bottom under a vertical
        // `writing-mode`, which React Native has no concept of -- the same
        // horizontal-only assumption `py-*` already lowers under.
        StyleProperty::BorderBlockStartColor(c) => vec![("borderTopColor", resolve_color(c))],
        StyleProperty::BorderBlockEndColor(c) => vec![("borderBottomColor", resolve_color(c))],
        // Unlike Web, RN defaults borderStyle to 'solid' and borderColor to
        // black, so a width alone already renders -- the opposite gotcha
        // from CSS's "invisible without border-style".
        StyleProperty::BorderTopWidth(l) => vec![("borderTopWidth", number(l, theme))],
        StyleProperty::BorderRightWidth(l) => vec![("borderRightWidth", number(l, theme))],
        StyleProperty::BorderBottomWidth(l) => vec![("borderBottomWidth", number(l, theme))],
        StyleProperty::BorderLeftWidth(l) => vec![("borderLeftWidth", number(l, theme))],
        // RN has no per-side border style -- one `borderStyle` covers all
        // four. Collapsing is safe here in a way it wouldn't be on Web:
        // RN defaults every border width to 0, so a style on a side with
        // no width renders nothing (whereas CSS would fall back to
        // `medium` and draw it).
        // A width's implied `solid` is React Native's own default, and
        // writing it would override a written style earlier in the array,
        // which Tailwind's register never does.
        StyleProperty::BorderTopStyle(BorderStyle::Default)
        | StyleProperty::BorderRightStyle(BorderStyle::Default)
        | StyleProperty::BorderBottomStyle(BorderStyle::Default)
        | StyleProperty::BorderLeftStyle(BorderStyle::Default) => Vec::new(),
        StyleProperty::BorderTopStyle(s)
        | StyleProperty::BorderRightStyle(s)
        | StyleProperty::BorderBottomStyle(s)
        | StyleProperty::BorderLeftStyle(s) => vec![("borderStyle", border_style_literal(s))],
        StyleProperty::BorderRadius(r) => radius_pair("borderRadius", r, theme),
        StyleProperty::BorderTopLeftRadius(r) => radius_pair("borderTopLeftRadius", r, theme),
        StyleProperty::BorderTopRightRadius(r) => radius_pair("borderTopRightRadius", r, theme),
        StyleProperty::BorderBottomRightRadius(r) => radius_pair("borderBottomRightRadius", r, theme),
        StyleProperty::BorderBottomLeftRadius(r) => radius_pair("borderBottomLeftRadius", r, theme),
        // React Native has the logical corner names too, so `rounded-s-*`
        // stays correct under RTL rather than being flattened to left/right.
        StyleProperty::BorderStartStartRadius(r) => radius_pair("borderStartStartRadius", r, theme),
        StyleProperty::BorderStartEndRadius(r) => radius_pair("borderStartEndRadius", r, theme),
        StyleProperty::BorderEndStartRadius(r) => radius_pair("borderEndStartRadius", r, theme),
        StyleProperty::BorderEndEndRadius(r) => radius_pair("borderEndEndRadius", r, theme),
        StyleProperty::FontSize(l) => vec![("fontSize", number(l, theme))],
        // RN's `fontWeight` type is a *string* ('100'..'900'/'normal'/
        // 'bold'), not a number -- unlike CSS's numeric font-weight.
        StyleProperty::FontWeight(w) => w.native(theme)
            .map(|weight| vec![("fontWeight", format!("'{weight}'"))])
            .unwrap_or_default(),
        // Both of these are absolute in React Native. A font-relative form
        // reaching here means `fold_font_relative` found no font size on the
        // element to resolve it against, and it was refused by name there --
        // emitting nothing keeps the object valid if that error is ignored.
        StyleProperty::LeadingRegister(_) => Vec::new(),
        StyleProperty::LineHeight(lh) => match lh {
            LineHeight::Length(l) | LineHeight::FontDefault(l) => vec![("lineHeight", number(l, theme))],
            LineHeight::Ratio(_) => Vec::new(),
        },
        StyleProperty::LetterSpacing(ls) => match ls {
            LetterSpacing::Px(l) => vec![("letterSpacing", number(l, theme))],
            LetterSpacing::Em(_) => Vec::new(),
        },
        StyleProperty::Overflow(o) => vec![(
            "overflow",
            match o {
                Overflow::Visible => "'visible'",
                Overflow::Hidden => "'hidden'",
                Overflow::Scroll => "'scroll'",
                // Refused upstream: RN's overflow has no auto or clip.
                Overflow::Css(_) => "",
            }
            .to_string(),
        )],
        // RN Text wraps by default, so `normal` is genuinely a no-op there.
        // `nowrap` is refused upstream -- suppressing wrapping needs the
        // `numberOfLines` prop, not a style.
        StyleProperty::WhiteSpace(_) => Vec::new(),
        // Refused upstream by `unsupported_on_native`, or absorbed by the
        // Native grid planner before style lowering for its supported subset.
        | StyleProperty::TextOverflow(_)
        | StyleProperty::GridTemplateColumns(_)
        | StyleProperty::GridTemplateRows(_)
        | StyleProperty::GridColumnStart(_)
        | StyleProperty::GridColumnEnd(_)
        | StyleProperty::GridRowStart(_)
        | StyleProperty::GridRowEnd(_)
        | StyleProperty::GridColumn(_)
        | StyleProperty::GridRow(_)
        | StyleProperty::TransitionProperty(_)
        | StyleProperty::TransitionDuration(..)
        | StyleProperty::TransitionDelay(..)
        | StyleProperty::TransitionTimingFunction(..)
        | StyleProperty::Animation(_)
        // Child-scoped: these mean something for the element's children, not
        // for the element, and are routed to `child_property_and_value`
        // before they reach here. Nothing to emit on the element itself.
        | StyleProperty::SpaceX(_)
        | StyleProperty::SpaceY(_)
        | StyleProperty::SpaceReverse(_)
        | StyleProperty::DivideX(_)
        | StyleProperty::DivideY(_)
        | StyleProperty::DivideReverse(_)
        | StyleProperty::DivideColor(_)
        | StyleProperty::DivideStyle(_)
        // No React Native equivalent at all; each refused by name upstream.
        | StyleProperty::Fill(_)
        | StyleProperty::Stroke(_)
        | StyleProperty::StrokeWidth(_)
        | StyleProperty::AccentColor(_)
        | StyleProperty::CaretColor(_)
        | StyleProperty::PlaceholderColor(_)
        | StyleProperty::TextDecorationThickness(_)
        // Refused upstream: RN has no text-decoration metrics at all.
        | StyleProperty::TextUnderlineOffset(_)
        | StyleProperty::ScrollMargin(..)
        | StyleProperty::ScrollPadding(..)
        | StyleProperty::ScrollBehavior(_)
        | StyleProperty::MaskClip(_)
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
        | StyleProperty::MaskComposite(_)
        | StyleProperty::ScrollbarWidth(_)
        | StyleProperty::ScrollbarGutter(_)
        | StyleProperty::ScrollbarThumbColor(_)
        | StyleProperty::ScrollbarTrackColor(_) => Vec::new(),
        StyleProperty::TextDecorationColor(c) => vec![("textDecorationColor", resolve_color(c))],
        // React Native's `textDecorationStyle` takes the same five values CSS
        // does. `wavy` was refused here until the refusal audit checked the
        // claim against RN's own types and found it false -- the whole union
        // is accepted, and the platform caveat (these render on iOS and are
        // ignored on Android) applies equally to `dotted` and `dashed`, which
        // were never refused.
        StyleProperty::TextDecorationStyle(s) => vec![(
            "textDecorationStyle",
            match s {
                DecorationStyle::Solid => "'solid'",
                DecorationStyle::Double => "'double'",
                DecorationStyle::Dotted => "'dotted'",
                DecorationStyle::Dashed => "'dashed'",
                DecorationStyle::Wavy => "'wavy'",
            }
            .to_string(),
        )],
        StyleProperty::OutlineWidth(l) => vec![("outlineWidth", number(l, theme))],
        // RN's `outlineStyle` accepts only solid/dotted/dashed -- verified
        // against react-native-css's own parser, which warns on anything
        // else. So `outline-none` is expressed the way a border is hidden:
        // zero width. Reusing `border_style_literal` here would emit
        // `'solid'`, which is the opposite of what was asked for.
        StyleProperty::OutlineStyle(BorderStyle::None) => {
            vec![("outlineWidth", "0".to_string())]
        }
        // A width's implied `solid` is React Native's own default
        // (`BaseViewProps`' `outlineStyle{OutlineStyle::Solid}`), and writing
        // it would override a written style earlier in the array.
        StyleProperty::OutlineStyle(BorderStyle::Default) => Vec::new(),
        // A CSS forced-colors fallback, not a request to read a Native
        // environment flag. The ordinary outline-none projection remains.
        StyleProperty::OutlineHiddenForcedColors => Vec::new(),
        StyleProperty::OutlineStyle(s) => vec![("outlineStyle", border_style_literal(s))],
        StyleProperty::OutlineColor(c) => vec![("outlineColor", resolve_color(c))],
        StyleProperty::OutlineOffset(l) => vec![("outlineOffset", number(l, theme))],
        StyleProperty::TextAlign(align) => vec![(
            "textAlign",
            match align {
                TextAlign::Left => "'left'",
                TextAlign::Center => "'center'",
                TextAlign::Right => "'right'",
                TextAlign::Css(v) => return vec![("textAlign", js_string(v))],
            }
            .to_string(),
        )],
        // Composed into a single `transform` by the caller, since RN has no
        // standalone rotate/scale/translate -- see `transform_entry`.
        StyleProperty::Rotate(_)
        | StyleProperty::Scale(_)
        | StyleProperty::Translate(_)
        | StyleProperty::ScaleX(_)
        | StyleProperty::ScaleY(_)
        | StyleProperty::ScaleZ(_)
        | StyleProperty::Scale3d
        | StyleProperty::RotateX(_)
        | StyleProperty::RotateY(_)
        | StyleProperty::RotateZ(_)
        | StyleProperty::SkewX(_)
        | StyleProperty::SkewY(_)
        | StyleProperty::TranslateX(_)
        | StyleProperty::TranslateY(_)
        | StyleProperty::Transform(_) => Vec::new(),
        // RN accepts a string for both, so the CSS text carries over as-is.
        // Composed with any ring layers by `box_shadow_entry`, not emitted
        // here -- `style_pairs` filters these out before this runs.
        StyleProperty::BoxShadow(_)
        | StyleProperty::RingWidth(_)
        | StyleProperty::RingColor(_)
        | StyleProperty::InsetRingWidth(_)
        | StyleProperty::RingOffsetWidth(_)
        | StyleProperty::RingOffsetColor(_)
        | StyleProperty::RingInset
        | StyleProperty::ShadowColor(_)
        | StyleProperty::InsetShadowColor(_)
        | StyleProperty::InsetRingColor(_)
        | StyleProperty::InsetShadow(_) => vec![],
        // Composed, not emitted here -- see `filter_entry`. `BackdropFilter`
        // is consumed by the contextual opt-in component adapter in render.rs.
        StyleProperty::Filter(..)
        | StyleProperty::FilterRaw(..)
        | StyleProperty::BackdropFilter(..)
        | StyleProperty::DropShadowColor(_) => vec![],
        StyleProperty::FontFamily(value) => vec![("fontFamily", js_string(&value.native(theme)))],
        StyleProperty::FontVariant(values) => vec![(
            "fontVariant",
            format!(
                "[{}]",
                values.iter().map(|value| js_string(value)).collect::<Vec<_>>().join(", ")
            ),
        )],
        // Tailwind's multi-layer text shadows and its separately composed
        // colour remain explicit refusals. A static single-layer StyleX
        // shadow is already decomposed into RN's three text-shadow slots.
        StyleProperty::TextShadow(value) => match value.portable_parts() {
            Some((color, offset_x, offset_y, radius)) => vec![
                ("textShadowColor", resolve_color(color)),
                (
                    "textShadowOffset",
                    format!(
                        "{{ width: {}, height: {} }}",
                        number(offset_x, theme),
                        number(offset_y, theme)
                    ),
                ),
                ("textShadowRadius", number(radius, theme)),
            ],
            None => vec![],
        },
        StyleProperty::TextShadowColor(_) => vec![],
        // Refused upstream: scroll snapping is a ScrollView prop on React
        // Native, not a style.
        StyleProperty::ScrollSnapType(_) | StyleProperty::ScrollSnapStrictness(_) => vec![],
        StyleProperty::TextTransform(t) => vec![(
            "textTransform",
            match t {
                TextTransform::Uppercase => "'uppercase'",
                TextTransform::Lowercase => "'lowercase'",
                TextTransform::Capitalize => "'capitalize'",
                TextTransform::None => "'none'",
            }
            .to_string(),
        )],
        StyleProperty::TextColor(c) => vec![("color", resolve_color(c))],
    }
}

#[cfg(test)]
mod tests;
