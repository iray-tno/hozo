//! Each utility prefix's reading of a bracketed value.

use hozo_ir::{
    Angle, BorderStyle, Clamp, Color, ColumnCount, Dimension, Edge, FlexShorthand, GradientKind,
    GradientStop, GridSpan, GridTracks, LetterSpacing, LineHeight, MaskSlot, Radius, Scale,
    StrokeWidth, StyleProperty,
};

use super::color::{is_color, looks_like_color};
use super::families::{
    border_width, corner_radius, filter, logical_side, mask_stop, or_raw, scroll_offset, sizing,
    spacing,
};
use super::length::{
    is_length_percentage, is_line_width, is_percentage, parse_dimension, parse_length,
    parse_non_negative_percent,
};

pub(super) fn from_prefix(
    prefix: &str,
    value: &str,
    hint: Option<&str>,
) -> Option<Vec<StyleProperty>> {
    let length = || parse_length(value);
    let dimension = || parse_dimension(value);
    let color = || Color::Css(value.to_string());
    let angle = || Angle::Css(value.to_string());
    let number = || value.parse::<f64>().ok();
    let integer = || value.parse::<i32>().ok();
    let one = |property: StyleProperty| Some(vec![property]);

    if prefix == "columns" && hint.is_none() {
        // Counts and widths share the columns shorthand with named utilities.
        // Preserve that ownership so they dedupe and rank together. Unknown
        // variables, two-value shorthands and hinted values remain raw below.
        let columns = if value == "auto" {
            Some(ColumnCount::Auto)
        } else if let Ok(count) = value.parse::<u32>() {
            (count > 0).then_some(ColumnCount::Count(count))
        } else {
            length().map(|value| ColumnCount::Width(Dimension::Length(value)))
        };
        if let Some(columns) = columns {
            return one(StyleProperty::Columns(columns));
        }
    }

    // Its own arm because it is two declarations, and the custom property
    // is the whole point: a `before:` rule elsewhere in the stylesheet
    // reads `content: var(--hozo-content)`, so the two compose without
    // either knowing about the other.
    if prefix == "content" {
        return one(StyleProperty::Content(value.to_string()));
    }
    // The families where one prefix means one property and the value is a
    // size. Grouped rather than spelled out because the mapping is
    // mechanical: every one of them takes the same value vocabulary.
    if let Some(properties) = sizing(prefix, value) {
        return Some(properties);
    }
    if let Some(properties) = spacing(prefix, value) {
        return Some(properties);
    }
    if let Some(properties) = scroll_offset(prefix, value) {
        return Some(properties);
    }
    if let Some(properties) = corner_radius(prefix, value) {
        return Some(properties);
    }
    if let Some(properties) = filter(prefix, value) {
        return Some(properties);
    }
    if let Some(properties) = mask_stop(prefix, value, hint) {
        return Some(properties);
    }

    match prefix {
        // The ambiguous one. `text-[14px]` is a font size and
        // `text-[#fff]` is a colour, and before this existed both compiled
        // to a colour -- so a font size became `color: var(--hozo-color-[14px])`.
        // A `length` hint says so outright, which matters for `var()`:
        // `text-[length:var(--s)]` is a font size whatever `--s` holds.
        "text"
            if hint == Some("length") || (hint != Some("color") && is_length_percentage(value)) =>
        {
            Some(or_raw(
                "font-size",
                value,
                length().map(StyleProperty::FontSize),
            ))
        }
        "text" => one(StyleProperty::TextColor(color())),
        // A background is an image, a position, a size or a colour, and
        // only the value says which. The length case is the surprising
        // one: a bare `bg-[10px]` is a background *position*, not a size
        // and not a colour -- so the obvious reading (colour, like
        // `bg-red-500`) is wrong for every numeric value.
        "bg" => {
            if matches!(hint, Some("image") | Some("url")) || value.starts_with("url(") {
                one(StyleProperty::Arbitrary(
                    "background-image".to_string(),
                    value.to_string(),
                ))
            } else if matches!(hint, Some("bg-size") | Some("length")) || value == "auto" {
                one(StyleProperty::Arbitrary(
                    "background-size".to_string(),
                    value.to_string(),
                ))
            } else if hint == Some("position") || length().is_some() || value.ends_with('%') {
                one(StyleProperty::Arbitrary(
                    "background-position".to_string(),
                    value.to_string(),
                ))
            } else {
                one(StyleProperty::BackgroundColor(color()))
            }
        }
        // A border is a width or a colour, decided the same way. Tailwind
        // also emits `border-style: var(--tw-border-style)` alongside a
        // width; Hozo resolves that at compile time instead, so the style
        // is set explicitly here.
        // A border with a width and no style draws nothing, so Tailwind
        // sets `solid` alongside every width. Hozo resolves that at
        // compile time rather than through `--tw-border-style`, which
        // means writing it here -- omitting it left every arbitrary border
        // width invisible in the browser while looking correct in the CSS.
        "border" if hint != Some("color") && is_line_width(value) => Some(vec![
            StyleProperty::BorderTopStyle(BorderStyle::Solid),
            StyleProperty::BorderRightStyle(BorderStyle::Solid),
            StyleProperty::BorderBottomStyle(BorderStyle::Solid),
            StyleProperty::BorderLeftStyle(BorderStyle::Solid),
            border_width("border-top-width", value),
            border_width("border-right-width", value),
            border_width("border-bottom-width", value),
            border_width("border-left-width", value),
        ]),
        "border" => one(StyleProperty::BorderColor(color())),
        "border-t" | "border-r" | "border-b" | "border-l"
            if hint != Some("color") && is_line_width(value) =>
        {
            let (style, width) = match prefix {
                "border-t" => (
                    StyleProperty::BorderTopStyle(BorderStyle::Solid),
                    "border-top-width",
                ),
                "border-r" => (
                    StyleProperty::BorderRightStyle(BorderStyle::Solid),
                    "border-right-width",
                ),
                "border-b" => (
                    StyleProperty::BorderBottomStyle(BorderStyle::Solid),
                    "border-bottom-width",
                ),
                _ => (
                    StyleProperty::BorderLeftStyle(BorderStyle::Solid),
                    "border-left-width",
                ),
            };
            Some(vec![style, border_width(width, value)])
        }
        "border-t" => one(StyleProperty::BorderTopColor(color())),
        "border-r" => one(StyleProperty::BorderRightColor(color())),
        "border-b" => one(StyleProperty::BorderBottomColor(color())),
        "border-l" => one(StyleProperty::BorderLeftColor(color())),
        // The axis forms are logical properties, not pairs of physical
        // ones -- `border-inline-width`, which follows writing direction,
        // rather than a left and a right that don't.
        "border-x" | "border-y" if hint != Some("color") && is_line_width(value) => {
            let edge = if prefix == "border-x" {
                Edge::Inline
            } else {
                Edge::Block
            };
            Some(vec![
                StyleProperty::BorderLogicalStyle(edge, BorderStyle::Solid),
                match length() {
                    Some(l) => StyleProperty::BorderLogicalWidth(edge, l),
                    None => StyleProperty::Arbitrary(
                        format!(
                            "border-{}-width",
                            if edge == Edge::Inline {
                                "inline"
                            } else {
                                "block"
                            }
                        ),
                        value.to_string(),
                    ),
                },
            ])
        }
        "border-x" => one(StyleProperty::BorderInlineColor(color())),
        "border-y" => one(StyleProperty::BorderBlockColor(color())),

        // Colour-only families.
        // An outline width takes the `line-width` type, which allows a
        // bare number as well as a length -- so `outline-[1.5]` is a width
        // and not, as the colour fallback would have it, a colour. The
        // style comes with it: an outline with a width and no style draws
        // nothing, and Tailwind sets `solid` for exactly that reason.
        // And an outline width takes a percentage where a border width
        // does not. Not a rule, just what the engine does.
        "outline" if hint != Some("color") && (is_line_width(value) || is_percentage(value)) => {
            Some(vec![
                StyleProperty::OutlineStyle(BorderStyle::Solid),
                match length() {
                    Some(l) => StyleProperty::OutlineWidth(l),
                    None => {
                        StyleProperty::Arbitrary("outline-width".to_string(), value.to_string())
                    }
                },
            ])
        }
        "outline" => one(StyleProperty::OutlineColor(color())),
        // Three declarations, so it cannot join the raw-property table
        // above the way `duration-[…]` and `ease-[…]` do: a `transition-*`
        // sets the property list *and* Tailwind's default timing and
        // duration, and an `ease-*` written after it overrides one of them
        // under last-wins flattening. Exactly what the named forms
        // (`transition-colors`, `transition-opacity`) already expand to;
        // the arbitrary form was the only one of the family missing, and
        // reported as `UNREADABLE_ARBITRARY_VALUE` rather than compiled.
        "transition" => Some(vec![
            StyleProperty::TransitionProperty(value.to_string()),
            StyleProperty::TransitionTimingFunction(
                crate::tailwind::DEFAULT_TRANSITION_TIMING.to_string(),
                hozo_ir::Origin::Default,
            ),
            StyleProperty::TransitionDuration(
                crate::tailwind::DEFAULT_TRANSITION_DURATION_MS,
                hozo_ir::Origin::Default,
            ),
        ]),
        "ring" if is_color(value, hint) => one(StyleProperty::RingColor(color())),
        "ring" => one(StyleProperty::RingWidth(length()?)),
        "ring-offset" if is_color(value, hint) => one(StyleProperty::RingOffsetColor(color())),
        "ring-offset" => one(StyleProperty::RingOffsetWidth(length()?)),
        "placeholder" => one(StyleProperty::PlaceholderColor(color())),
        "accent" => one(StyleProperty::AccentColor(color())),
        "caret" => one(StyleProperty::CaretColor(color())),
        "fill" => one(StyleProperty::Fill(color())),
        // A stroke width is the widest of the three: length, number *and*
        // percentage all count.
        "stroke" if hint != Some("color") && (is_line_width(value) || is_percentage(value)) => {
            Some(or_raw(
                "stroke-width",
                value,
                number()
                    .filter(|n| n.is_finite() && *n >= 0.0)
                    .map(StrokeWidth::Number)
                    .or_else(|| {
                        length()
                            .filter(|l| {
                                l.unresolved_unit().is_none() && l.css_expression().is_none()
                            })
                            .map(StrokeWidth::Length)
                    })
                    .map(StyleProperty::StrokeWidth),
            ))
        }
        "stroke" => one(StyleProperty::Stroke(color())),
        "divide" => one(StyleProperty::DivideColor(color())),
        "decoration" if hint == Some("color") || !is_length_percentage(value) => {
            one(StyleProperty::TextDecorationColor(color()))
        }
        "decoration" => Some(or_raw(
            "text-decoration-thickness",
            value,
            length().map(StyleProperty::TextDecorationThickness),
        )),

        // Typography.
        "leading" => Some(or_raw(
            "line-height",
            value,
            // A percent is a CSS length here, not an inherited ratio.
            // Keep its spelling on Web and let Native use a known font size.
            match length().or_else(|| {
                let percent = value.strip_suffix('%')?.parse::<f64>().ok()?;
                (percent.is_finite() && percent >= 0.0)
                    .then(|| hozo_ir::Length::Css(value.to_string()))
            }) {
                Some(l) => Some(StyleProperty::LineHeight(LineHeight::Length(l))),
                // Unitless, which CSS reads as a multiple of the font size.
                None => number().map(|n| StyleProperty::LineHeight(LineHeight::Ratio(n))),
            },
        )),
        "tracking" => Some(or_raw(
            "letter-spacing",
            value,
            length().map(|l| StyleProperty::LetterSpacing(LetterSpacing::Px(l))),
        )),
        "indent" => one(StyleProperty::TextIndent(dimension())),
        "underline-offset" => one(StyleProperty::TextUnderlineOffset(dimension())),

        // Corners.
        "rounded" => Some(or_raw(
            "border-radius",
            value,
            length()
                .map(Radius::Length)
                .or_else(|| parse_non_negative_percent(value).map(Radius::Percent))
                .map(StyleProperty::BorderRadius),
        )),

        // Plain numbers, each with the same escape: Tailwind emits
        // `z-index: abc` for `z-[abc]` rather than nothing, so refusing
        // would generate less than the engine being matched against.
        "opacity" => Some(or_raw(
            "opacity",
            value,
            number()
                .filter(|n| n.is_finite())
                .or_else(|| parse_non_negative_percent(value).map(|pct| pct / 100.0))
                .map(StyleProperty::Opacity),
        )),
        // Integers only. `ZIndex` and `Order` hold an `i32`, so `z-[1.5]`
        // went in as `1` -- a plausible number that isn't the one written,
        // which is the failure mode this whole module exists to stop.
        "z" => Some(or_raw(
            "z-index",
            value,
            integer().map(|n| StyleProperty::ZIndex(Some(n))),
        )),
        "order" => Some(or_raw("order", value, integer().map(StyleProperty::Order))),
        "grow" => Some(or_raw(
            "flex-grow",
            value,
            number().map(StyleProperty::FlexGrow),
        )),
        "shrink" => Some(or_raw(
            "flex-shrink",
            value,
            number().map(StyleProperty::FlexShrink),
        )),
        "flex" => match value {
            "auto" => one(StyleProperty::Flex(FlexShorthand::Auto)),
            "initial" => one(StyleProperty::Flex(FlexShorthand::Initial)),
            "none" => one(StyleProperty::Flex(FlexShorthand::None)),
            _ => match number().filter(|n| n.is_finite() && *n >= 0.0) {
                Some(grow) => one(StyleProperty::Flex(FlexShorthand::Grow(grow))),
                None => one(StyleProperty::Arbitrary(
                    "flex".to_string(),
                    value.to_string(),
                )),
            },
        },
        "align" => match value {
            "auto" => one(StyleProperty::Keyword("vertical-align", "auto")),
            "top" => one(StyleProperty::Keyword("vertical-align", "top")),
            "bottom" => one(StyleProperty::Keyword("vertical-align", "bottom")),
            "middle" => one(StyleProperty::Keyword("vertical-align", "middle")),
            _ => one(StyleProperty::Arbitrary(
                "vertical-align".to_string(),
                value.to_string(),
            )),
        },
        "cursor" => match value {
            "auto" | "pointer" => one(StyleProperty::Cursor(value.to_string())),
            _ => one(StyleProperty::Arbitrary(
                "cursor".to_string(),
                value.to_string(),
            )),
        },
        "aspect" if hozo_ir::parse_native_aspect_ratio(value).is_some() => {
            one(StyleProperty::AspectRatio(value.to_string()))
        }
        "aspect" => one(StyleProperty::Arbitrary(
            "aspect-ratio".to_string(),
            value.to_string(),
        )),
        "outline-offset" => Some(or_raw(
            "outline-offset",
            value,
            length().map(StyleProperty::OutlineOffset),
        )),

        // Track lists, which the named scale can't express at all: it
        // counts equal columns, and the interesting layouts are unequal.
        "grid-cols" => one(StyleProperty::GridTemplateColumns(GridTracks::Css(
            value.to_string(),
        ))),
        "grid-rows" => one(StyleProperty::GridTemplateRows(GridTracks::Css(
            value.to_string(),
        ))),

        // Two-axis families: one written value, two written out. CSS
        // defaults the second axis to the first for `translate` but *not*
        // for `border-spacing`, and Tailwind writes both in every case, so
        // matching means writing both here too.
        "translate" => {
            let parsed = dimension();
            let promotable = match &parsed {
                Dimension::Percent(pct) => pct.is_finite(),
                Dimension::Length(length) => {
                    length.unresolved_unit().is_none() && length.css_expression().is_none()
                        || matches!(
                            length,
                            hozo_ir::Length::Unit(
                                _,
                                hozo_ir::LengthUnit::Vw
                                    | hozo_ir::LengthUnit::Vh
                                    | hozo_ir::LengthUnit::Vmin
                                    | hozo_ir::LengthUnit::Vmax
                                    | hozo_ir::LengthUnit::Cqw
                                    | hozo_ir::LengthUnit::Cqh
                                    | hozo_ir::LengthUnit::Cqi
                                    | hozo_ir::LengthUnit::Cqb
                                    | hozo_ir::LengthUnit::Cqmin
                                    | hozo_ir::LengthUnit::Cqmax
                            )
                        )
                }
                Dimension::Css(css) => hozo_ir::parse_calc_length(css).is_some(),
                _ => false,
            };
            if promotable {
                one(StyleProperty::Translate(vec![parsed.clone(), parsed]))
            } else {
                one(StyleProperty::Arbitrary(
                    "translate".to_string(),
                    format!("{value} {value}"),
                ))
            }
        }
        "border-spacing" => one(StyleProperty::Arbitrary(
            "border-spacing".to_string(),
            format!("{value} {value}"),
        )),
        "skew" => one(StyleProperty::Arbitrary(
            "transform".to_string(),
            format!("skewX({value}) skewY({value})"),
        )),
        // A `font-[...]` is a weight when it reads as one and a family
        // otherwise -- the same value-shaped decision `text-` makes, with
        // the roles of the two answers swapped.
        //
        // A `var()` reads as one. Nothing about `font-[var(--x)]` says
        // which it holds, and Tailwind resolves that ambiguity towards the
        // weight: it emits `font-weight: var(--x)` and expects
        // `font-[family-name:var(--x)]` from anyone who meant the family.
        // Hozo read it the other way, which is a `font-family` where the
        // author's variable holds `600`.
        "font"
            if hint != Some("family-name")
                && (is_line_width(value) || is_percentage(value) || value.starts_with("var(")) =>
        {
            one(StyleProperty::Arbitrary(
                "font-weight".to_string(),
                value.to_string(),
            ))
        }
        // Not just the line count: a clamp needs `display: -webkit-box`
        // and `-webkit-box-orient: vertical` to do anything at all, which
        // is why this is a variant rather than a pass-through.
        // Integers only. A fractional clamp is not a line count, and
        // `as u32` turned `line-clamp-[1.5]` into a clamp of one -- a
        // number that looks deliberate and isn't the one written. Refused
        // rather than rounded: emitting nothing is visible, emitting the
        // wrong count is not.
        // Integers stay integers, because React Native's `numberOfLines`
        // takes one and rounding `1.5` to `1` would be a clamp that looks
        // deliberate. Anything else is still the four declarations
        // Tailwind writes, with the value untouched.
        "line-clamp" => one(StyleProperty::LineClamp(Some(match value.parse::<u32>() {
            Ok(lines) => Clamp::Lines(lines),
            Err(_) => Clamp::Css(value.to_string()),
        }))),

        // The transform functions. Held as text rather than parsed into
        // degrees: `rotate-x-[1.5em]` is not an angle, and Tailwind emits
        // `rotateX(1.5em)` for it rather than refusing -- see
        // `hozo_ir::Angle` for why the text has to live in the type
        // instead of escaping to a raw declaration.
        "rotate-x" => one(StyleProperty::RotateX(angle())),
        "rotate-y" => one(StyleProperty::RotateY(angle())),
        "rotate-z" => one(StyleProperty::RotateZ(angle())),
        "skew-x" => one(StyleProperty::SkewX(angle())),
        "skew-y" => one(StyleProperty::SkewY(angle())),
        // An arbitrary scale is a ratio or percentage (`scale-x-[1.5]` is
        // `scale: 1.5`, `scale-x-[50%]` is `scale: 50%`), unlike the named
        // scale which always means a percentage. Parsing finite ratios and
        // percentages into `Scale::Ratio`/`Scale::Percent` preserves the
        // exact CSS spelling on Web and lets Native emit numeric ratios.
        "scale" => match parse_scale(value) {
            Scale::Css(_) => one(StyleProperty::Arbitrary(
                "scale".to_string(),
                value.to_string(),
            )),
            scale => one(StyleProperty::Scale(vec![scale])),
        },
        "scale-x" => one(StyleProperty::ScaleX(parse_scale(value))),
        "scale-y" => one(StyleProperty::ScaleY(parse_scale(value))),
        // Writing the z axis also switches the declaration to its
        // three-value form -- see `StyleProperty::Scale3d`.
        "scale-z" => Some(vec![
            StyleProperty::ScaleZ(Scale::Css(value.to_string())),
            StyleProperty::Scale3d,
        ]),
        "translate-z" => one(StyleProperty::TranslateZ(dimension())),

        // Both axes of `border-spacing`, which is one declaration taking
        // two values, so each utility writes half of it.
        "border-spacing-x" => one(StyleProperty::BorderSpacingX(dimension())),
        "border-spacing-y" => one(StyleProperty::BorderSpacingY(dimension())),

        // The mask gradient slots' own arguments: an angle for two of
        // them, a size for the third. All three become the gradient's
        // whole argument when no stop utility supplied one -- see
        // `StyleProperty::MaskSlotArgument`.
        // The gradient constructors' arbitrary form. Tailwind puts the
        // value straight into `--tw-gradient-position`, so it is the
        // gradient's whole prelude -- `bg-radial-[at_top]` is
        // `radial-gradient(at top, …)`, with no interpolation clause
        // appended. Writing one would be adding a colour space the author
        // didn't ask for.
        "bg-linear" => one(StyleProperty::Gradient(
            GradientKind::Linear,
            value.to_string(),
        )),
        "bg-radial" => one(StyleProperty::Gradient(
            GradientKind::Radial,
            value.to_string(),
        )),
        "bg-conic" => one(StyleProperty::Gradient(
            GradientKind::Conic,
            value.to_string(),
        )),
        "from" if looks_like_color(value, hint) => one(StyleProperty::GradientStopColor(
            GradientStop::From,
            color(),
        )),
        "from" => one(StyleProperty::GradientStopPosition(
            GradientStop::From,
            dimension(),
        )),
        "via" if looks_like_color(value, hint) => {
            one(StyleProperty::GradientStopColor(GradientStop::Via, color()))
        }
        "via" => one(StyleProperty::GradientStopPosition(
            GradientStop::Via,
            dimension(),
        )),
        "to" if looks_like_color(value, hint) => {
            one(StyleProperty::GradientStopColor(GradientStop::To, color()))
        }
        "to" => one(StyleProperty::GradientStopPosition(
            GradientStop::To,
            dimension(),
        )),

        "mask-linear" => one(StyleProperty::MaskSlotArgument(MaskSlot::Linear, angle())),
        "mask-conic" => one(StyleProperty::MaskSlotArgument(MaskSlot::Conic, angle())),
        "mask-radial" => one(StyleProperty::MaskSlotArgument(MaskSlot::Radial, angle())),

        // The logical border sides. Same width-or-colour decision the
        // physical ones make; the only difference is which longhand it
        // lands in, and that the width form has no typed colour sibling
        // for values `Length` can't hold.
        "border-s" | "border-e" | "border-bs" | "border-be"
            if hint != Some("color") && is_line_width(value) =>
        {
            let edge = match prefix {
                "border-s" => Edge::InlineStart,
                "border-e" => Edge::InlineEnd,
                "border-bs" => Edge::BlockStart,
                _ => Edge::BlockEnd,
            };
            Some(vec![
                StyleProperty::BorderLogicalStyle(edge, BorderStyle::Solid),
                match length() {
                    Some(l) => StyleProperty::BorderLogicalWidth(edge, l),
                    None => StyleProperty::Arbitrary(
                        format!("{}-width", logical_side(edge)),
                        value.to_string(),
                    ),
                },
            ])
        }
        "border-s" => one(StyleProperty::BorderInlineStartColor(color())),
        "border-e" => one(StyleProperty::BorderInlineEndColor(color())),
        "border-bs" => one(StyleProperty::BorderBlockStartColor(color())),
        "border-be" => one(StyleProperty::BorderBlockEndColor(color())),

        // `block-[…]`/`inline-[…]` are sizes on the logical axes, not the
        // display keywords the same two words name elsewhere. The bracket
        // is what tells them apart, which is why they only appear here.
        "block" => one(StyleProperty::BlockSize(dimension())),
        "inline" => one(StyleProperty::InlineSize(dimension())),

        // A span is written to both edges, so the item spans n tracks
        // wherever it lands rather than being pinned to a line. Integers
        // go through typed; anything else is still the declaration
        // Tailwind writes, which is where `span nonsense / span nonsense`
        // comes from.
        "col-span" | "row-span" => {
            let property = if prefix == "col-span" {
                "grid-column"
            } else {
                "grid-row"
            };
            Some(match value.parse::<u32>().ok() {
                Some(n) if prefix == "col-span" => {
                    vec![StyleProperty::GridColumn(GridSpan::Span(n))]
                }
                Some(n) => vec![StyleProperty::GridRow(GridSpan::Span(n))],
                None => vec![StyleProperty::Arbitrary(
                    property.to_string(),
                    format!("span {value} / span {value}"),
                )],
            })
        }

        // The shadow layers, carried as the CSS text they are:
        // `shadow-[0_0_4px_red]` is a whole `box-shadow` value, and
        // parsing it into offsets would only be printing it back.
        //
        // No colour arm here on purpose. `shadow-<colour>` sets a register
        // that paints nothing on its own, so Tailwind's own output for it
        // isn't a declaration and the harness classes it as
        // composition-only -- there is nothing here for it to be measured
        // against, and inventing a variant would be inventing meaning.
        "shadow" => one(StyleProperty::BoxShadow(value.to_string())),
        // Tailwind writes the `inset` keyword itself rather than expecting
        // it in the value, so an author's `inset-shadow-[0_0_4px_red]`
        // becomes `inset 0 0 4px red`.
        "inset-shadow" => one(StyleProperty::InsetShadow(format!("inset {value}"))),
        "inset-ring" if is_color(value, hint) => one(StyleProperty::InsetRingColor(color())),
        "inset-ring" => one(StyleProperty::InsetRingWidth(length()?)),

        // `scrollbar-color` takes both halves at once, so these two
        // utilities compose in the backend rather than each emitting a
        // declaration.
        "scrollbar-thumb" => one(StyleProperty::ScrollbarThumbColor(color())),
        "scrollbar-track" => one(StyleProperty::ScrollbarTrackColor(color())),

        // A bare `mask-[…]` is a size, a position or an image, decided the
        // same way `bg-[…]` is -- and with the same surprise: a length is
        // a *position*, while the keyword `auto` is a size.
        "mask" if hint == Some("bg-size") || value == "auto" => one(StyleProperty::Arbitrary(
            "mask-size".to_string(),
            value.to_string(),
        )),
        "mask" if hint == Some("position") || length().is_some() || is_percentage(value) => one(
            StyleProperty::Arbitrary("mask-position".to_string(), value.to_string()),
        ),
        "mask" => one(StyleProperty::Arbitrary(
            "mask-image".to_string(),
            value.to_string(),
        )),

        "origin" => one(StyleProperty::TransformOrigin(value.to_string())),

        // The long tail, where the prefix names one CSS property and the
        // value goes through untouched. Everything here is Web-only by
        // construction: `StyleProperty::Arbitrary` is refused on Native,
        // which is right for most of these (there is no `will-change` or
        // `perspective-origin` on a device) and a real gap for the few
        // React Native does have. Those are worth promoting to typed
        // variants one at a time; guessing a camelCase spelling for all of
        // them is how a build error becomes a style that silently does
        // nothing.
        _ => PASSTHROUGH
            .iter()
            .find(|(name, _)| *name == prefix)
            .map(|(_, property)| {
                vec![StyleProperty::Arbitrary(
                    property.to_string(),
                    value.to_string(),
                )]
            }),
    }
}

fn parse_scale(value: &str) -> Scale {
    if let Some(percent) = value.strip_suffix('%') {
        if let Ok(number) = percent.parse::<f64>() {
            if number.is_finite() {
                return Scale::Percent(number);
            }
        }
    }
    if let Ok(number) = value.parse::<f64>() {
        if number.is_finite() {
            return Scale::Ratio(number);
        }
    }
    Scale::Css(value.to_string())
}

/// Prefixes that name one CSS property and pass their value straight
/// through.
///
/// Each pair is checked against Tailwind's own output by the arbitrary
/// conformance report, which is why the list can be this blunt: a wrong
/// property name here is not a silent gap, it is an immediate mismatch
/// against the reference engine.
pub(super) const PASSTHROUGH: &[(&str, &str)] = &[
    // Not a variant here, despite the `@`: `@container-[…]` sets the
    // property, where `@container/main:` and `@lg:` are the query forms.
    // The bracket is what separates them.
    ("@container", "container-type"),
    ("align", "vertical-align"),
    ("animate", "animation"),
    ("auto-cols", "grid-auto-columns"),
    ("auto-rows", "grid-auto-rows"),
    ("basis", "flex-basis"),
    ("border-spacing", "border-spacing"),
    ("col", "grid-column"),
    ("col-end", "grid-column-end"),
    ("col-start", "grid-column-start"),
    ("columns", "columns"),
    ("contain", "contain"),
    ("content", "content"),
    ("cursor", "cursor"),
    ("delay", "transition-delay"),
    ("duration", "transition-duration"),
    ("ease", "transition-timing-function"),
    ("flex", "flex"),
    ("font", "font-family"),
    ("font-stretch", "font-stretch"),
    ("line-clamp", "-webkit-line-clamp"),
    ("list", "list-style-type"),
    ("list-image", "list-style-image"),
    ("max-block", "max-block-size"),
    ("max-inline", "max-inline-size"),
    ("min-block", "min-block-size"),
    ("min-inline", "min-inline-size"),
    ("object", "object-position"),
    ("perspective", "perspective"),
    ("perspective-origin", "perspective-origin"),
    ("rotate", "rotate"),
    ("row", "grid-row"),
    ("row-end", "grid-row-end"),
    ("row-start", "grid-row-start"),
    ("scale", "scale"),
    ("skew", "transform"),
    ("tab", "tab-size"),
    ("text-shadow", "text-shadow"),
    ("transform", "transform"),
    ("translate", "translate"),
    ("will-change", "will-change"),
    ("zoom", "zoom"),
];
