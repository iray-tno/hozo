//! `StyleProperty`/`Condition` -> CSS text.
//!
//! Grouping/flattening declarations by `Condition` lives in `hozo_ir`
//! (shared with `hozo_native`, which needs the identical rule -- "last
//! wins" only within one condition group). This module is just the
//! Web-specific value/selector formatting on top of that.
//!
//! `Color` stays a Tailwind token through the whole IR (proposal §16 still
//! defers *theme-aware* resolution to a later pass -- custom colors,
//! arbitrary values), but the default Tailwind palette is resolved here via
//! `hozo_ir::resolve_color_token`, emitted as the exact `oklch(...)`
//! string Tailwind's own CSS would produce. A token outside the default
//! palette still falls back to a CSS custom property reference
//! (`var(--hozo-color-x)`, never actually defined anywhere) --
//! correct-but-unresolved, not silently wrong.

use hozo_ir::{
    Align, AlignSelf, Angle, Axis, BorderStyle, Breakpoint, Clamp, Color, ColumnCount, Condition,
    ConditionExpr, DecorationStyle, Dimension, Display, Edge, Em, Environment, FilterFunction,
    FlexDirection, FlexShorthand, GradientKind, GradientStop, GridLine, GridSpan, GridTracks,
    Justify, Length, LetterSpacing, LineHeight, MaskSlot, MaskStop, Overflow, Position, Radius,
    Scale, StyleProperty, TextAlign, TextOverflow, TextTransform, Theme, TransformFunction,
    WhiteSpace,
};

/// A length as CSS text, against the project's spacing scale.
///
/// Takes the theme because a spacing step's width is the project's to
/// decide -- see `Length::Spacing`.
fn length_px(length: &Length, theme: &Theme) -> String {
    match length {
        // Printed in the unit it was written in, not converted. `w-[2rem]`
        // is `width: 2rem` in Tailwind's output, and the difference from
        // `32px` is not cosmetic -- a reader who has scaled up their
        // browser's font size gets a wider element from one and the same
        // element from the other. Converting here silently opted every
        // arbitrary `rem` out of that.
        Length::Unit(value, unit) => format!("{value}{}", unit.css()),
        // Printed as written, for the same reason and one step further:
        // there is nothing here to convert. Tailwind splices the expression
        // into its own output untouched, and so does this.
        Length::Css(css) => css.to_string(),
        _ => format!("{}px", length.px(theme)),
    }
}

fn dimension_value(dim: &Dimension, theme: &Theme) -> String {
    match dim {
        Dimension::Length(length) => length_px(length, theme),
        Dimension::Percent(pct) => format!("{pct}%"),
        Dimension::Auto => "auto".to_string(),
        Dimension::ViewportWidth(pct) => format!("{pct}vw"),
        Dimension::ViewportHeight(pct) => format!("{pct}vh"),
        Dimension::Css(text) => text.to_string(),
    }
}

/// Tailwind writes equal tracks as `repeat(n, minmax(0, 1fr))`, not
/// `repeat(n, 1fr)`. The `minmax` floor is what stops an oversized item
/// from widening its own track, so the two behave differently under
/// overflow and this is not a formatting choice.
fn grid_tracks(tracks: &GridTracks) -> String {
    match tracks {
        GridTracks::Count(n) => format!("repeat({n}, minmax(0, 1fr))"),
        GridTracks::None => "none".to_string(),
        GridTracks::Subgrid => "subgrid".to_string(),
        GridTracks::Css(list) => list.clone(),
    }
}

fn grid_line(line: &GridLine) -> String {
    match line {
        GridLine::Line(n) => n.to_string(),
        GridLine::Auto => "auto".to_string(),
    }
}

fn grid_span(span: &GridSpan) -> String {
    match span {
        // Both edges, so the item spans n tracks wherever it lands rather
        // than being pinned to a line.
        GridSpan::Span(n) => format!("span {n} / span {n}"),
        GridSpan::Full => "1 / -1".to_string(),
        GridSpan::Auto => "auto".to_string(),
    }
}

fn justify_keyword(justify: &Justify) -> &'static str {
    match justify {
        Justify::Start => "flex-start",
        Justify::Center => "center",
        Justify::End => "flex-end",
        Justify::Between => "space-between",
        Justify::Around => "space-around",
        Justify::Evenly => "space-evenly",
        Justify::Stretch => "stretch",
        Justify::Baseline => "baseline",
        Justify::Css(v) => v,
    }
}

/// The CSS longhand each logical edge writes. Spelled out rather than
/// built, because `property_and_value` returns `&'static str`.
fn border_width_property(edge: Edge) -> &'static str {
    match edge {
        Edge::Inline => "border-inline-width",
        Edge::Block => "border-block-width",
        Edge::InlineStart => "border-inline-start-width",
        Edge::InlineEnd => "border-inline-end-width",
        Edge::BlockStart => "border-block-start-width",
        Edge::BlockEnd => "border-block-end-width",
        // The physical edges have their own properties; see
        // `StyleProperty::BorderLogicalWidth`.
        _ => "border-width",
    }
}

fn border_style_property(edge: Edge) -> &'static str {
    match edge {
        Edge::Inline => "border-inline-style",
        Edge::Block => "border-block-style",
        Edge::InlineStart => "border-inline-start-style",
        Edge::InlineEnd => "border-inline-end-style",
        Edge::BlockStart => "border-block-start-style",
        Edge::BlockEnd => "border-block-end-style",
        _ => "border-style",
    }
}

/// The four declarations `line-clamp-*` is, as one group.
///
/// Tailwind writes all four because the `-webkit-line-clamp` mechanism
/// only works inside a `-webkit-box` with a vertical orientation and
/// hidden overflow -- they are one thing, not four choices.
fn line_clamp_declarations(lines: Option<&Clamp>) -> Vec<(&'static str, String)> {
    match lines {
        Some(n) => vec![
            ("overflow", "hidden".to_string()),
            ("display", "-webkit-box".to_string()),
            ("-webkit-box-orient", "vertical".to_string()),
            ("-webkit-line-clamp", n.css()),
        ],
        None => vec![
            ("overflow", "visible".to_string()),
            ("display", "block".to_string()),
            ("-webkit-box-orient", "horizontal".to_string()),
            ("-webkit-line-clamp", "unset".to_string()),
        ],
    }
}

fn overflow_keyword(overflow: &Overflow) -> &'static str {
    match overflow {
        Overflow::Visible => "visible",
        Overflow::Hidden => "hidden",
        Overflow::Scroll => "scroll",
        Overflow::Css(v) => v,
    }
}

fn border_style_keyword(style: &BorderStyle) -> &'static str {
    match style {
        BorderStyle::Solid | BorderStyle::Default => "solid",
        BorderStyle::Dashed => "dashed",
        BorderStyle::Dotted => "dotted",
        BorderStyle::Double => "double",
        BorderStyle::Hidden => "hidden",
        BorderStyle::None => "none",
    }
}

fn radius_value(radius: &Radius, theme: &Theme) -> Option<String> {
    match radius {
        Radius::Length(l) => Some(length_px(l, theme)),
        Radius::Scale { name, fallback_px } => Some(length_px(
            &Length::Px(theme.radius_or(name, *fallback_px)),
            theme,
        )),
        // Exactly what Tailwind emits -- CSS can state this, so there's no
        // reason to approximate it here.
        Radius::Full => Some("calc(infinity * 1px)".to_string()),
        Radius::Theme(name) => theme
            .radius(name)
            .map(|px| length_px(&Length::Px(px), theme)),
    }
}

/// A radius declaration, or nothing when it names a token the theme does
/// not define: the class is carried, so the project's own CSS still applies,
/// as with a theme animation.
fn radius_pair<'a>(property: &'a str, radius: &Radius, theme: &Theme) -> (&'a str, String) {
    radius_value(radius, theme).map_or(("", String::new()), |value| (property, value))
}

/// The CSS longhand for each edge. Spelled out rather than concatenated
/// because `property_and_value` returns `&'static str`, and a built string
/// would have to be leaked to satisfy that.
fn scroll_margin_property(edge: Edge) -> &'static str {
    match edge {
        Edge::All => "scroll-margin",
        Edge::Top => "scroll-margin-top",
        Edge::Right => "scroll-margin-right",
        Edge::Bottom => "scroll-margin-bottom",
        Edge::Left => "scroll-margin-left",
        Edge::Inline => "scroll-margin-inline",
        Edge::Block => "scroll-margin-block",
        Edge::InlineStart => "scroll-margin-inline-start",
        Edge::InlineEnd => "scroll-margin-inline-end",
        Edge::BlockStart => "scroll-margin-block-start",
        Edge::BlockEnd => "scroll-margin-block-end",
    }
}

fn scroll_padding_property(edge: Edge) -> &'static str {
    match edge {
        Edge::All => "scroll-padding",
        Edge::Top => "scroll-padding-top",
        Edge::Right => "scroll-padding-right",
        Edge::Bottom => "scroll-padding-bottom",
        Edge::Left => "scroll-padding-left",
        Edge::Inline => "scroll-padding-inline",
        Edge::Block => "scroll-padding-block",
        Edge::InlineStart => "scroll-padding-inline-start",
        Edge::InlineEnd => "scroll-padding-inline-end",
        Edge::BlockStart => "scroll-padding-block-start",
        Edge::BlockEnd => "scroll-padding-block-end",
    }
}

/// Tailwind's unset-slot filler: opaque, so `mask-composite: intersect`
/// leaves whatever the other slots paint untouched.
const MASK_OPAQUE: &str = "linear-gradient(#fff, #fff)";

fn is_mask_gradient(prop: &StyleProperty) -> bool {
    matches!(
        prop,
        StyleProperty::MaskStopColor(..)
            | StyleProperty::MaskStopPosition(..)
            | StyleProperty::MaskSlotArgument(..)
            | StyleProperty::MaskRadialShape(_)
            | StyleProperty::MaskRadialSize(_)
            | StyleProperty::MaskRadialPosition(_)
            | StyleProperty::MaskComposite(_)
    )
}

/// One slot's stops, or `None` if no utility touched it.
struct MaskGradient {
    from_color: Option<String>,
    from_position: Option<String>,
    to_color: Option<String>,
    to_position: Option<String>,
    angle: Option<Angle>,
}

/// A mask gradient's angle, defaulting to the `0deg` Tailwind's
/// `--tw-mask-*-position` register starts at.
fn mask_angle(angle: &Option<Angle>) -> String {
    angle
        .as_ref()
        .map_or_else(|| "0deg".to_string(), Angle::css)
}

impl MaskGradient {
    /// Whether any utility contributed to this slot at all.
    fn is_set(&self) -> bool {
        self.from_color.is_some()
            || self.from_position.is_some()
            || self.to_color.is_some()
            || self.to_position.is_some()
            || self.angle.is_some()
    }

    /// Whether a stop list should be written. An angle alone produces
    /// `linear-gradient(45deg)` with no stops, matching Tailwind's
    /// `var(--tw-mask-linear-stops, var(--tw-mask-linear-position))`
    /// fallback.
    fn has_stops(&self) -> bool {
        self.from_color.is_some()
            || self.from_position.is_some()
            || self.to_color.is_some()
            || self.to_position.is_some()
    }

    /// The `<from> <pos>, <to> <pos>` half, with Tailwind's register
    /// defaults filled in.
    fn stops(&self) -> String {
        format!(
            "{} {}, {} {}",
            self.from_color.as_deref().unwrap_or("black"),
            self.from_position.as_deref().unwrap_or("0%"),
            self.to_color.as_deref().unwrap_or("transparent"),
            self.to_position.as_deref().unwrap_or("100%"),
        )
    }
}

/// Resolves the whole `mask-image` layer list at compile time.
///
/// Tailwind assembles it from `--tw-mask-*` registers, so the same
/// `mask-image: var(--tw-mask-linear), var(--tw-mask-radial),
/// var(--tw-mask-conic)` appears on every gradient utility and the
/// difference lives in which registers each one sets. Hozo has the whole
/// set in hand, so it writes the resolved list and ships no custom
/// properties.
///
/// The first slot is overloaded in Tailwind too: a side utility makes it a
/// four-layer list (left, right, bottom, top), a `mask-linear-*` makes it a
/// single gradient. Using both kinds together is therefore
/// order-dependent in Tailwind and resolved here as "sides win", which is
/// the only case where the two can disagree.
fn mask_declarations(props: &[&StyleProperty], theme: &Theme) -> Vec<(&'static str, String)> {
    let color_var = |color: &Color| resolve_theme_color(color, theme);
    let slot_gradient = |slot: MaskSlot| {
        let mut g = MaskGradient {
            from_color: None,
            from_position: None,
            to_color: None,
            to_position: None,
            angle: None,
        };
        for prop in props {
            match prop {
                StyleProperty::MaskStopColor(s, stop, c) if *s == slot => match stop {
                    MaskStop::From => g.from_color = Some(color_var(c)),
                    MaskStop::To => g.to_color = Some(color_var(c)),
                },
                StyleProperty::MaskStopPosition(s, stop, d) if *s == slot => match stop {
                    MaskStop::From => g.from_position = Some(dimension_value(d, theme)),
                    MaskStop::To => g.to_position = Some(dimension_value(d, theme)),
                },
                StyleProperty::MaskSlotArgument(s, degrees) if *s == slot => {
                    g.angle = Some(degrees.clone())
                }
                _ => {}
            }
        }
        g
    };
    let keyword = |find: fn(&StyleProperty) -> Option<&'static str>, default: &'static str| {
        props.iter().find_map(|p| find(p)).unwrap_or(default)
    };

    let sides = [
        MaskSlot::Left,
        MaskSlot::Right,
        MaskSlot::Bottom,
        MaskSlot::Top,
    ];
    let side_gradients: Vec<(MaskSlot, MaskGradient)> =
        sides.iter().map(|s| (*s, slot_gradient(*s))).collect();
    let any_side = side_gradients.iter().any(|(_, g)| g.is_set());

    let linear = slot_gradient(MaskSlot::Linear);
    let radial = slot_gradient(MaskSlot::Radial);
    let conic = slot_gradient(MaskSlot::Conic);

    let composite = props.iter().find_map(|p| match p {
        StyleProperty::MaskComposite(c) => Some(*c),
        _ => None,
    });

    let paints = any_side || linear.is_set() || radial.is_set() || conic.is_set();
    if !paints {
        // `mask-add` on its own, or only radial shaping -- Tailwind emits
        // the composite alone and no `mask-image`.
        return composite.map_or_else(Vec::new, |c| vec![("mask-composite", c.to_string())]);
    }

    let mut layers: Vec<String> = Vec::new();
    if any_side {
        for (slot, g) in &side_gradients {
            layers.push(if g.is_set() {
                format!("linear-gradient(to {}, {})", side_keyword(*slot), g.stops())
            } else {
                MASK_OPAQUE.to_string()
            });
        }
    } else {
        layers.push(match (linear.is_set(), linear.has_stops()) {
            (false, _) => MASK_OPAQUE.to_string(),
            (true, false) => format!("linear-gradient({})", mask_angle(&linear.angle)),
            (true, true) => {
                format!(
                    "linear-gradient({}, {})",
                    mask_angle(&linear.angle),
                    linear.stops()
                )
            }
        });
    }

    layers.push(if radial.is_set() && !radial.has_stops() {
        // An arbitrary size with nothing to shape: the size *is* the
        // gradient, the same way an angle alone is for the other two
        // slots.
        format!("radial-gradient({})", mask_angle(&radial.angle))
    } else if radial.is_set() {
        format!(
            "radial-gradient({} {} at {}, {})",
            keyword(
                |p| match p {
                    StyleProperty::MaskRadialShape(v) => Some(*v),
                    _ => None,
                },
                "ellipse"
            ),
            // Not through `keyword`, which returns `&'static str`: this
            // one carries an arbitrary size (`mask-radial-[10px]`) and so
            // has to be owned.
            props
                .iter()
                .find_map(|p| match p {
                    StyleProperty::MaskRadialSize(v) => Some(v.clone()),
                    _ => None,
                })
                .unwrap_or_else(|| "farthest-corner".to_string()),
            keyword(
                |p| match p {
                    StyleProperty::MaskRadialPosition(v) => Some(*v),
                    _ => None,
                },
                "center"
            ),
            radial.stops(),
        )
    } else {
        MASK_OPAQUE.to_string()
    });

    layers.push(match (conic.is_set(), conic.has_stops()) {
        (false, _) => MASK_OPAQUE.to_string(),
        (true, false) => format!("conic-gradient({})", mask_angle(&conic.angle)),
        (true, true) => {
            format!(
                "conic-gradient(from {}, {})",
                mask_angle(&conic.angle),
                conic.stops()
            )
        }
    });

    vec![
        ("mask-image", layers.join(", ")),
        (
            "mask-composite",
            composite.unwrap_or("intersect").to_string(),
        ),
    ]
}

fn is_border_spacing(prop: &StyleProperty) -> bool {
    matches!(
        prop,
        StyleProperty::BorderSpacingX(_) | StyleProperty::BorderSpacingY(_)
    )
}

fn is_translate(prop: &StyleProperty) -> bool {
    matches!(
        prop,
        StyleProperty::Translate(_)
            | StyleProperty::TranslateX(_)
            | StyleProperty::TranslateY(_)
            | StyleProperty::TranslateZ(_)
    )
}

/// The `filter`/`backdrop-filter` chain, in the same order as its registers.
///
/// Sorted by the function rather than by the order the utilities were
/// written, because filter functions don't commute -- `grayscale invert`
/// and `invert grayscale` render differently -- and Tailwind's own order is
/// fixed by the order its registers appear in the value. A slot cleared by
/// a `-none` utility contributes an empty register there and so nothing
/// here.
fn filter_value(props: &[&StyleProperty], backdrop: bool, theme: &Theme) -> Option<String> {
    if !backdrop {
        let last_raw = props
            .iter()
            .rposition(|p| matches!(p, StyleProperty::FilterRaw(_)));
        let last_slots = props
            .iter()
            .rposition(|p| matches!(p, StyleProperty::Filter(..)));
        if last_raw > last_slots {
            return props.iter().rev().find_map(|p| match p {
                StyleProperty::FilterRaw(value) => Some(value.clone()),
                _ => None,
            });
        }
    }
    let mut functions: Vec<(FilterFunction, String)> = Vec::new();
    // The colour `drop-shadow-<colour>` set, if a second utility set one.
    // Only for the element's own filter: Tailwind has no
    // `backdrop-drop-shadow-<colour>`, so there is nothing to repaint on
    // that side.
    let drop_shadow_color = (!backdrop)
        .then(|| {
            props.iter().find_map(|p| match p {
                StyleProperty::DropShadowColor(c) => Some(c),
                _ => None,
            })
        })
        .flatten()
        .filter(|color| !color.is_initial());
    let drop_none = !backdrop
        && props.iter().any(|p| {
            matches!(p, StyleProperty::Filter(FilterFunction::DropShadow, value) if value.is_empty())
        });
    for prop in props {
        let (function, value) = match (prop, backdrop) {
            (StyleProperty::Filter(f, v), false) | (StyleProperty::BackdropFilter(f, v), true) => {
                (*f, v.as_str())
            }
            _ => continue,
        };
        // `filter-none` is the whole chain off, not one slot cleared.
        if function == FilterFunction::None {
            return Some("none".to_string());
        }
        // Tailwind's fixed order is size, then `drop-shadow-none`, then
        // colour, and a colour rule rebuilds the shadow from the size
        // register. So a colour keeps the size's shadow, `none` without one
        // turns it off, and `none` itself draws nothing.
        let value = if function == FilterFunction::DropShadow {
            if value.is_empty() || (drop_none && drop_shadow_color.is_none()) {
                String::new()
            } else {
                repaint_shadow(value, drop_shadow_color, theme)
            }
        } else {
            value.to_string()
        };
        functions.push((function, value));
    }
    if functions.is_empty() {
        return None;
    }
    // Backdrop opacity precedes saturation, unlike the enum's shared order.
    // Read the same slots used by conditional register emission; drop-shadow
    // is outside that register form and remains the final own-filter function.
    functions.sort_by_key(|(function, _)| filter_slot(*function, backdrop).unwrap_or(usize::MAX));
    let chain: Vec<&str> = functions
        .iter()
        .map(|(_, v)| v.as_str())
        .filter(|v| !v.is_empty())
        .collect();
    // Every slot cleared still leaves a declaration. Tailwind's is a chain
    // of empty registers, which computes to `none`; a literal empty value
    // would be an invalid declaration and leave an earlier filter standing
    // (`md:drop-shadow-none drop-shadow-lg` at md).
    Some(if chain.is_empty() {
        "none".to_string()
    } else {
        chain.join(" ")
    })
}

fn is_gradient(prop: &StyleProperty) -> bool {
    matches!(
        prop,
        StyleProperty::Gradient(..)
            | StyleProperty::GradientStopColor(..)
            | StyleProperty::GradientStopPosition(..)
            | StyleProperty::BackgroundImageNone
            | StyleProperty::BackgroundImage(..)
    )
}

/// The `background-image` a gradient constructor and its stops make.
///
/// `None` without a constructor, which is the whole reason the stops are
/// separate properties: `from-red-500` alone paints nothing in Tailwind
/// either -- it fills a register that no `background-image` reads until a
/// `bg-linear-*` writes one.
///
/// Unwritten halves fall back to the `initial-value`s of Tailwind's own
/// registers: a missing colour is `#0000` and a missing position is
/// 0%/50%/100%. So `bg-linear-to-r from-red-500` really is a red-to-
/// transparent ramp rather than a half-specified gradient.
///
/// One difference from Tailwind, deliberate: it writes the prelude twice,
/// once plain and once inside `@supports (background-image:
/// linear-gradient(in lab, red, red))`, so an engine without colour-space
/// interpolation still gets a gradient. Hozo emits only the modern form,
/// the same call `Radius::Full` makes with `calc(infinity * 1px)`.
fn gradient_value(props: &[&StyleProperty], theme: &Theme) -> Option<String> {
    enum Image<'a> {
        None,
        Raw(&'a str),
        Gradient(GradientKind, String),
    }
    // `bg-none` and a gradient constructor write the same declaration, so
    // whichever came last wins -- which means scanning from the end. The
    // inner `Option` is the answer, the outer one is "did anything here
    // set a background image at all".
    let latest = props.iter().rev().find_map(|p| match p {
        StyleProperty::Gradient(kind, prelude) => Some(Image::Gradient(*kind, prelude.clone())),
        StyleProperty::BackgroundImageNone => Some(Image::None),
        StyleProperty::BackgroundImage(value) => Some(Image::Raw(value)),
        _ => None,
    })?;
    let (kind, prelude) = match latest {
        Image::None => return Some("none".to_string()),
        Image::Raw(value) => return Some(value.to_string()),
        Image::Gradient(kind, prelude) => (kind, prelude),
    };

    // `via-none` sets the stop to `initial`, which takes it back out of
    // the list rather than painting it. Kept as a stop that resolves to
    // nothing rather than never parsed, so it still overrides a
    // `via-red-500` written before it.
    let color = |stop: GradientStop| {
        props.iter().find_map(|p| match p {
            StyleProperty::GradientStopColor(s, c) if *s == stop && !c.is_initial() => {
                Some(resolve_theme_color(c, theme))
            }
            _ => None,
        })
    };
    let position = |stop: GradientStop| {
        props
            .iter()
            .find_map(|p| match p {
                StyleProperty::GradientStopPosition(s, d) if *s == stop => {
                    Some(dimension_value(d, theme))
                }
                _ => None,
            })
            .unwrap_or_else(|| stop.default_position().to_string())
    };
    let stop = |s: GradientStop| {
        format!(
            "{} {}",
            color(s).unwrap_or_else(|| "#0000".to_string()),
            position(s)
        )
    };

    // No stop *colour* anywhere means no stop list at all -- the prelude
    // is the whole value. That is Tailwind's register model rather than a
    // shortcut: only a `from-*`/`via-*`/`to-*` colour writes
    // `--tw-gradient-stops`, so a lone `bg-conic-[10px]` really is
    // `conic-gradient(10px)`, and a lone `bg-linear-to-r` really is a
    // gradient with nothing in it that the browser then drops.
    //
    // A stop *position* doesn't count, which is why the check is on
    // colours: `via-30%` sets a position for a stop that isn't in the
    // list, and changes nothing in Tailwind either.
    let stops: Vec<String> = if [GradientStop::From, GradientStop::Via, GradientStop::To]
        .iter()
        .all(|s| color(*s).is_none())
    {
        Vec::new()
    } else {
        let mut stops = vec![stop(GradientStop::From)];
        if color(GradientStop::Via).is_some() {
            stops.push(stop(GradientStop::Via));
        }
        stops.push(stop(GradientStop::To));
        stops
    };

    if stops.is_empty() {
        return Some(format!("{}({prelude})", kind.css()));
    }
    Some(format!("{}({prelude}, {})", kind.css(), stops.join(", ")))
}

/// Turn gradient writes into Tailwind's registers when conditions write
/// different ones. Returns whether it did.
///
/// `gradient_value` joins constructor and stops per condition, so
/// `md:from-red-500 bg-linear-to-r from-blue-500` painted nothing new at md:
/// the md rule had a colour and no constructor. Tailwind writes the position
/// and a `background-image` reading `--tw-gradient-stops` from the
/// constructor, and each colour and position into its own register; this
/// writes the same structure under `--hozo-` names. `bg-none` keeps its
/// literal declaration, as Tailwind's does. An arbitrary `bg-[…]`, or a
/// constructor beside `bg-none` in one condition keeps the
/// old output for the whole element.
pub fn register_split_gradients(
    groups: &mut [(Condition, Vec<StyleProperty>)],
    theme: &Theme,
) -> bool {
    register_gradients(groups, theme, false)
}

/// A literal declaration replaces all its slots. If separate emitted rules
/// write different slots, keep those writes independent even under the same
/// selector. Candidate rules can also compose with writers in another sheet.
fn split_register_writers(masks: impl Iterator<Item = u16>, candidate: bool) -> bool {
    let mut writers = masks.filter(|&mask| mask != 0);
    let Some(first) = writers.next() else {
        return false;
    };
    candidate || writers.any(|mask| mask != first)
}

fn register_gradients(
    groups: &mut [(Condition, Vec<StyleProperty>)],
    theme: &Theme,
    candidate: bool,
) -> bool {
    fn slot(p: &StyleProperty) -> u16 {
        match p {
            StyleProperty::Gradient(..) => 1,
            StyleProperty::BackgroundImageNone => 1 << 1,
            StyleProperty::GradientStopColor(stop, _) => 1 << (2 + *stop as u16),
            StyleProperty::GradientStopPosition(stop, _) => 1 << (5 + *stop as u16),
            _ => 0,
        }
    }
    let blocked = groups.iter().any(|(_, props)| {
        props.iter().any(|p| {
            matches!(p, StyleProperty::BackgroundImage(_))
                || matches!(p, StyleProperty::GradientStopColor(stop, c)
                    if c.is_initial() && *stop != GradientStop::Via)
        }) || props
            .iter()
            .filter(|p| {
                matches!(
                    p,
                    StyleProperty::Gradient(..) | StyleProperty::BackgroundImageNone
                )
            })
            .count()
            > 1
    });
    if blocked {
        return false;
    }
    let masks = groups
        .iter()
        .map(|(_, props)| props.iter().fold(0, |slots, p| slots | slot(p)));
    if !split_register_writers(masks, candidate) {
        return false;
    }
    let set = |name: &str, value: String| StyleProperty::Arbitrary(format!("--hozo-{name}"), value);
    const STOPS: &str = "var(--hozo-gradient-via-stops, var(--hozo-gradient-position), \
         var(--hozo-gradient-from) var(--hozo-gradient-from-position), \
         var(--hozo-gradient-to) var(--hozo-gradient-to-position))";
    const VIA_STOPS: &str = "var(--hozo-gradient-position), \
         var(--hozo-gradient-from) var(--hozo-gradient-from-position), \
         var(--hozo-gradient-via) var(--hozo-gradient-via-position), \
         var(--hozo-gradient-to) var(--hozo-gradient-to-position)";
    let mut changed = false;
    for (_, props) in groups.iter_mut() {
        if !props
            .iter()
            .any(|p| slot(p) != 0 && !matches!(p, StyleProperty::BackgroundImageNone))
        {
            continue;
        }
        changed = true;
        let mut rewritten = Vec::with_capacity(props.len() + 2);
        for property in props.drain(..) {
            match &property {
                StyleProperty::Gradient(kind, prelude) => {
                    rewritten.push(set("gradient-position", prelude.clone()));
                    rewritten.push(StyleProperty::Arbitrary(
                        "background-image".to_string(),
                        format!(
                            "{}(var(--hozo-gradient-stops, var(--hozo-gradient-position)))",
                            kind.css()
                        ),
                    ));
                }
                // `via-none`: Tailwind's `--tw-gradient-via-stops: initial`,
                // which sends every `--tw-gradient-stops` that reads it back
                // to the from/to fallback.
                StyleProperty::GradientStopColor(GradientStop::Via, color)
                    if color.is_initial() =>
                {
                    rewritten.push(set("gradient-via-stops", "initial".to_string()));
                }
                StyleProperty::GradientStopColor(stop, color) => {
                    let name = match stop {
                        GradientStop::From => "gradient-from",
                        GradientStop::Via => "gradient-via",
                        GradientStop::To => "gradient-to",
                    };
                    rewritten.push(set(name, resolve_theme_color(color, theme)));
                    if *stop == GradientStop::Via {
                        rewritten.push(set("gradient-via-stops", VIA_STOPS.to_string()));
                        rewritten.push(set(
                            "gradient-stops",
                            "var(--hozo-gradient-via-stops)".to_string(),
                        ));
                    } else {
                        rewritten.push(set("gradient-stops", STOPS.to_string()));
                    }
                }
                StyleProperty::GradientStopPosition(stop, position) => {
                    let name = match stop {
                        GradientStop::From => "gradient-from-position",
                        GradientStop::Via => "gradient-via-position",
                        GradientStop::To => "gradient-to-position",
                    };
                    rewritten.push(set(name, dimension_value(position, theme)));
                }
                _ => rewritten.push(property),
            }
        }
        *props = rewritten;
    }
    changed
}

fn is_scroll_snap(prop: &StyleProperty) -> bool {
    matches!(
        prop,
        StyleProperty::ScrollSnapType(_) | StyleProperty::ScrollSnapStrictness(_)
    )
}

/// The `scroll-snap-type` an axis and a strictness make between them.
///
/// `proximity` is the strictness Tailwind declares as the register's
/// initial value, so an axis on its own still means something -- and a
/// strictness on its own means nothing, which is why the axis is what this
/// requires.
fn scroll_snap_value(props: &[&StyleProperty]) -> Option<String> {
    let axis = props.iter().find_map(|p| match p {
        StyleProperty::ScrollSnapType(axis) => Some(*axis),
        _ => None,
    })?;
    if axis == "none" {
        return Some("none".to_string());
    }
    let strictness = props
        .iter()
        .find_map(|p| match p {
            StyleProperty::ScrollSnapStrictness(s) => Some(*s),
            _ => None,
        })
        .unwrap_or("proximity");
    Some(format!("{axis} {strictness}"))
}

/// `text-shadow` and the colour utility that repaints it.
fn is_text_shadow(prop: &StyleProperty) -> bool {
    matches!(
        prop,
        StyleProperty::TextShadow(_) | StyleProperty::TextShadowColor(_)
    )
}

/// The `text-shadow` a size and a colour make between them.
fn text_shadow_value(props: &[&StyleProperty], theme: &Theme) -> Option<String> {
    let shadow = props.iter().find_map(|p| match p {
        StyleProperty::TextShadow(value) => Some(value.css()),
        _ => None,
    })?;
    // `text-shadow-none` is the property off, and there is nothing in it
    // to paint.
    if shadow == "none" {
        return Some(shadow.to_string());
    }
    let color = props
        .iter()
        .find_map(|p| match p {
            StyleProperty::TextShadowColor(c) => Some(c),
            _ => None,
        })
        .filter(|color| !color.is_initial());
    Some(repaint_shadow(shadow, color, theme))
}

fn is_filter(prop: &StyleProperty) -> bool {
    matches!(
        prop,
        StyleProperty::Filter(..)
            | StyleProperty::FilterRaw(..)
            | StyleProperty::BackdropFilter(..)
            // Partitioned with the chain because it is composed into one
            // of its functions rather than emitted: `drop-shadow-blue-500`
            // is a colour for whatever `drop-shadow-lg` drew.
            | StyleProperty::DropShadowColor(_)
    )
}

fn is_scale_axis(prop: &StyleProperty) -> bool {
    matches!(
        prop,
        StyleProperty::Scale(_)
            | StyleProperty::ScaleX(_)
            | StyleProperty::ScaleY(_)
            | StyleProperty::ScaleZ(_)
            | StyleProperty::Scale3d
    )
}

fn is_transform_function(prop: &StyleProperty) -> bool {
    matches!(
        prop,
        StyleProperty::Transform(_)
            | StyleProperty::RotateX(_)
            | StyleProperty::RotateY(_)
            | StyleProperty::RotateZ(_)
            | StyleProperty::SkewX(_)
            | StyleProperty::SkewY(_)
    )
}

/// The per-axis scales as one `scale` declaration.
///
/// An unwritten axis is `1`, not `100%` -- that is the literal
/// `initial-value` of Tailwind's `--tw-scale-*` registers, and since a
/// written axis is a percentage the two spellings sit side by side in the
/// same declaration (`scale-x-50` is `50% 1`). They mean the same thing to
/// CSS; a differential test compares strings.
///
/// The third component appears only when a z-form utility was written --
/// see `StyleProperty::Scale3d` for why that isn't the same question as
/// whether the z axis has a value.
fn scale_value(props: &[&StyleProperty]) -> Option<String> {
    if props.is_empty() {
        return None;
    }
    // A whole value (`scale-[…]`, `scale-none`) written after every axis
    // replaces the declaration, as the later rule does in Tailwind.
    let whole = |property: &&StyleProperty| {
        matches!(property, StyleProperty::Scale(_) | StyleProperty::ScaleNone)
    };
    let last_authored = props.iter().rposition(whole);
    let last_axes = props.iter().rposition(|property| !whole(property));
    if last_authored > last_axes {
        return props.iter().rev().find_map(|property| match property {
            StyleProperty::ScaleNone => Some("none".to_string()),
            StyleProperty::Scale(values) => {
                Some(values.iter().map(Scale::css).collect::<Vec<_>>().join(" "))
            }
            _ => None,
        });
    }
    let axis = |f: fn(&StyleProperty) -> Option<&Scale>| {
        props
            .iter()
            .find_map(|p| f(p))
            .map_or_else(|| "1".to_string(), Scale::css)
    };
    let x = axis(|p| match p {
        StyleProperty::ScaleX(v) => Some(v),
        _ => None,
    });
    let y = axis(|p| match p {
        StyleProperty::ScaleY(v) => Some(v),
        _ => None,
    });
    // The three-value form is the last `scale` declaration's, as in
    // Tailwind: a later 2D utility (`scale-x-*`, `scale-*`, both of which
    // write an x or y axis) writes the two-value form back.
    let last_3d = props
        .iter()
        .rposition(|p| matches!(p, StyleProperty::Scale3d));
    let last_2d = props
        .iter()
        .rposition(|p| matches!(p, StyleProperty::ScaleX(_) | StyleProperty::ScaleY(_)));
    if last_3d.is_none() || last_3d < last_2d {
        return Some(format!("{x} {y}"));
    }
    let z = axis(|p| match p {
        StyleProperty::ScaleZ(v) => Some(v),
        _ => None,
    });
    Some(format!("{x} {y} {z}"))
}

/// The 3D rotations and skews as one `transform` declaration.
///
/// Order matters and is Tailwind's: `rotateX rotateY rotateZ skewX skewY`,
/// which is the order its `--tw-*` registers appear in the value. Transform
/// functions don't commute, so a different order is a different rendering
/// rather than a different spelling.
fn transform_value(props: &[&StyleProperty], theme: &Theme) -> Option<String> {
    // `transform-none`, `transform`/`-cpu` and `transform-gpu` write the
    // declaration's form; every function rule writes the plain chain. The
    // last of them decides, as the later rule does in Tailwind.
    let control = |property: &&StyleProperty| {
        matches!(
            property,
            StyleProperty::Transform(_)
                | StyleProperty::TransformNone
                | StyleProperty::TransformEmpty
                | StyleProperty::TransformGpu
        )
    };
    let last_control = props.iter().rposition(control);
    let last_slots = props.iter().rposition(|property| !control(property));
    let gpu = if last_control > last_slots {
        match props[last_control?] {
            StyleProperty::Transform(functions) => {
                return Some(authored_transform_value(functions, theme))
            }
            StyleProperty::TransformNone => return Some("none".to_string()),
            StyleProperty::TransformGpu => true,
            _ => false,
        }
    } else {
        false
    };
    let chain = transform_chain(props);
    Some(match (gpu, chain) {
        (true, Some(chain)) => format!("translateZ(0) {chain}"),
        (true, None) => "translateZ(0)".to_string(),
        (false, Some(chain)) => chain,
        // Only a control with nothing after it: `transform` is the empty
        // chain, which is still a declaration a later utility overrides.
        (false, None) if last_control.is_some() => String::new(),
        (false, None) => return None,
    })
}

/// The 3D rotations and skews, in Tailwind's register order.
fn transform_chain(props: &[&StyleProperty]) -> Option<String> {
    let mut parts: Vec<String> = Vec::new();
    let mut push = |name: &str, angle: Option<&Angle>| {
        if let Some(a) = angle {
            parts.push(format!("{name}({})", a.css()));
        }
    };
    let find = |f: fn(&StyleProperty) -> Option<&Angle>| props.iter().find_map(|p| f(p));
    push(
        "rotateX",
        find(|p| match p {
            StyleProperty::RotateX(a) => Some(a),
            _ => None,
        }),
    );
    push(
        "rotateY",
        find(|p| match p {
            StyleProperty::RotateY(a) => Some(a),
            _ => None,
        }),
    );
    push(
        "rotateZ",
        find(|p| match p {
            StyleProperty::RotateZ(a) => Some(a),
            _ => None,
        }),
    );
    push(
        "skewX",
        find(|p| match p {
            StyleProperty::SkewX(a) => Some(a),
            _ => None,
        }),
    );
    push(
        "skewY",
        find(|p| match p {
            StyleProperty::SkewY(a) => Some(a),
            _ => None,
        }),
    );
    (!parts.is_empty()).then(|| parts.join(" "))
}

fn authored_transform_value(functions: &[TransformFunction], theme: &Theme) -> String {
    if functions.is_empty() {
        return "none".to_string();
    }
    functions
        .iter()
        .map(|function| match function {
            TransformFunction::Perspective(value) => {
                format!("perspective({})", length_px(value, theme))
            }
            TransformFunction::Rotate(value) => format!("rotate({})", value.css()),
            TransformFunction::RotateX(value) => format!("rotateX({})", value.css()),
            TransformFunction::RotateY(value) => format!("rotateY({})", value.css()),
            TransformFunction::RotateZ(value) => format!("rotateZ({})", value.css()),
            TransformFunction::Scale(value) => format!("scale({})", compact_number(*value)),
            TransformFunction::ScaleX(value) => format!("scaleX({})", compact_number(*value)),
            TransformFunction::ScaleY(value) => format!("scaleY({})", compact_number(*value)),
            TransformFunction::TranslateX(value) => {
                format!("translateX({})", dimension_value(value, theme))
            }
            TransformFunction::TranslateY(value) => {
                format!("translateY({})", dimension_value(value, theme))
            }
            TransformFunction::SkewX(value) => format!("skewX({})", value.css()),
            TransformFunction::SkewY(value) => format!("skewY({})", value.css()),
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn compact_number(value: f64) -> String {
    let value = value.to_string();
    value
        .strip_prefix("0.")
        .map(|rest| format!(".{rest}"))
        .or_else(|| value.strip_prefix("-0.").map(|rest| format!("-.{rest}")))
        .unwrap_or(value)
}

/// CSS's `translate` is one property taking up to three values, so the
/// three axes have to become one declaration. Emitting them separately --
/// which this did until 2026-08-15 -- made `translate-x-4 translate-y-8`
/// write two `translate:` declarations, and last-wins threw the x away.
///
/// The z value is only written when present, matching Tailwind: the
/// two-value form is what `translate-x-*`/`translate-y-*` produce.
fn translate_value(props: &[&StyleProperty], theme: &Theme) -> Option<String> {
    if props.is_empty() {
        return None;
    }
    // A whole value (`translate-[…]`, `translate-none`) written after every
    // axis replaces the declaration, as the later rule does in Tailwind.
    let whole = |property: &&StyleProperty| {
        matches!(
            property,
            StyleProperty::Translate(_) | StyleProperty::TranslateNone
        )
    };
    let last_authored = props.iter().rposition(whole);
    let last_axes = props.iter().rposition(|property| !whole(property));
    if last_authored > last_axes {
        return props.iter().rev().find_map(|property| match property {
            StyleProperty::TranslateNone => Some("none".to_string()),
            StyleProperty::Translate(values) => Some(
                values
                    .iter()
                    .map(|value| dimension_value(value, theme))
                    .collect::<Vec<_>>()
                    .join(" "),
            ),
            _ => None,
        });
    }
    // A trait object rather than a fn pointer: the closures below capture
    // `theme` now, so they aren't plain functions any more.
    let axis = |f: &dyn Fn(&StyleProperty) -> Option<String>| {
        props
            .iter()
            .find_map(|p| f(p))
            .unwrap_or_else(|| "0".to_string())
    };
    let x = axis(&|p: &StyleProperty| match p {
        StyleProperty::TranslateX(d) => Some(dimension_value(d, theme)),
        _ => None,
    });
    let y = axis(&|p: &StyleProperty| match p {
        StyleProperty::TranslateY(d) => Some(dimension_value(d, theme)),
        _ => None,
    });
    let z = props.iter().find_map(|p| match p {
        StyleProperty::TranslateZ(d) => Some(dimension_value(d, theme)),
        _ => None,
    });
    Some(match z {
        Some(z) => format!("{x} {y} {z}"),
        None => format!("{x} {y}"),
    })
}

/// The `@property` rules [`register_split_axes`] relies on.
///
/// Non-inheriting, as Tailwind declares its own `--tw-translate-*`,
/// `--tw-scale-*` and function registers: an ancestor's axis must not reach
/// a child that writes another one. An initial value is what an unwritten
/// axis means; a function register has none, so `var(--r,)` reads nothing.
pub fn axis_register_css() -> &'static str {
    static CSS: std::sync::OnceLock<String> = std::sync::OnceLock::new();
    CSS.get_or_init(|| render_register_css(None))
}

/// Candidate sheets need the registers their actual readers use, not every
/// unrelated static family. Values/order still come from the single registry.
pub fn candidate_register_css(required: &std::collections::BTreeSet<&str>) -> String {
    render_register_css(Some(required))
}

const GRADIENT_REGISTERS: &[(&str, Option<&str>)] = &[
    ("gradient-position", None),
    ("gradient-from", Some("#0000")),
    ("gradient-via", Some("#0000")),
    ("gradient-to", Some("#0000")),
    ("gradient-stops", None),
    ("gradient-via-stops", None),
    ("gradient-from-position", Some("0%")),
    ("gradient-via-position", Some("50%")),
    ("gradient-to-position", Some("100%")),
];

const SHADOW_REGISTERS: &[(&str, Option<&str>)] = &[
    ("shadow", Some("0 0 #0000")),
    ("shadow-color", None),
    ("inset-shadow", Some("0 0 #0000")),
    ("inset-shadow-color", None),
    ("ring-shadow", Some("0 0 #0000")),
    ("ring-color", None),
    ("inset-ring-shadow", Some("0 0 #0000")),
    ("inset-ring-color", None),
    ("ring-inset", None),
    ("ring-offset-width", Some("0px")),
    ("ring-offset-color", Some("#fff")),
    ("ring-offset-shadow", Some("0 0 #0000")),
];

fn render_register_css(required: Option<&std::collections::BTreeSet<&str>>) -> String {
    const REGISTERS: &[(&str, Option<&str>)] = &[
        ("translate-x", Some("0")),
        ("translate-y", Some("0")),
        ("translate-z", Some("0")),
        ("scale-x", Some("1")),
        ("scale-y", Some("1")),
        ("scale-z", Some("1")),
        ("rotate-x", None),
        ("rotate-y", None),
        ("rotate-z", None),
        ("skew-x", None),
        ("skew-y", None),
        ("blur", None),
        ("brightness", None),
        ("contrast", None),
        ("grayscale", None),
        ("hue-rotate", None),
        ("invert", None),
        ("saturate", None),
        ("sepia", None),
        ("backdrop-blur", None),
        ("backdrop-brightness", None),
        ("backdrop-contrast", None),
        ("backdrop-grayscale", None),
        ("backdrop-hue-rotate", None),
        ("backdrop-invert", None),
        ("backdrop-opacity", None),
        ("backdrop-saturate", None),
        ("backdrop-sepia", None),
    ];
    REGISTERS
        .iter()
        .chain(SHADOW_REGISTERS)
        .chain(GRADIENT_REGISTERS)
        .filter(|(name, _)| required.is_none_or(|required| required.contains(*name)))
        .map(|(name, initial)| {
            let initial = initial.map_or(String::new(), |value| {
                format!("  initial-value: {value};\n")
            });
            format!(
                "@property --hozo-{name} {{\n  syntax: \"*\";\n  inherits: false;\n{initial}}}\n\n"
            )
        })
        .collect()
}

/// A filter function's place in Tailwind's `filter`/`backdrop-filter` value.
fn filter_slot(function: FilterFunction, backdrop: bool) -> Option<usize> {
    use FilterFunction::*;
    Some(match (function, backdrop) {
        (Blur, _) => 0,
        (Brightness, _) => 1,
        (Contrast, _) => 2,
        (Grayscale, _) => 3,
        (HueRotate, _) => 4,
        (Invert, _) => 5,
        (Saturate, false) => 6,
        (Sepia, false) => 7,
        (Opacity, true) => 6,
        (Saturate, true) => 7,
        (Sepia, true) => 8,
        (Opacity, false) | (DropShadow | None, _) => return Option::None,
    })
}

/// Turn transform axes into registers when an element writes them under
/// more than one condition. Returns whether it did.
///
/// One condition's rule carries the whole joined declaration, so
/// `md:translate-x-8 translate-y-2` was `translate: 32px 0` at md, dropping
/// the y axis the base rule wrote, where Tailwind gives `32px 8px`; and
/// `md:skew-x-12 skew-y-6` lost the base `skewY` from `transform`. Tailwind
/// keeps each axis in its own register and reads them all in one
/// declaration; this does the same, but only where conditions write
/// different axes, so an element whose axes share one condition keeps its
/// literal `translate: 16px 8px`, and `scale-100 hover:scale-95` its two. A family with an authored whole value or a reset
/// (`translate-[…]`, `translate-none`) is left as it was.
pub fn register_split_axes(groups: &mut [(Condition, Vec<StyleProperty>)], theme: &Theme) -> bool {
    register_axes(groups, theme, false, None)
}

/// Separate runtime classes cannot be inspected together at build time.
/// Transforms, ordinary filter/backdrop functions and gradients use the same
/// registers as split static nodes. Whole-value/drop-shadow boundaries stay
/// unchanged. This adds no Native syntax admission.
pub fn register_candidate_slots(
    groups: &mut [(Condition, Vec<StyleProperty>)],
    theme: &Theme,
    required: &mut std::collections::BTreeSet<&'static str>,
) -> bool {
    let axes = register_axes(groups, theme, true, Some(required));
    let gradients = register_gradients(groups, theme, true);
    if gradients {
        required.extend(GRADIENT_REGISTERS.iter().map(|(name, _)| *name));
    }
    let shadows = register_shadows(groups, theme, true);
    if shadows {
        required.extend(SHADOW_REGISTERS.iter().map(|(name, _)| *name));
    }
    axes || gradients || shadows
}

fn register_axes(
    groups: &mut [(Condition, Vec<StyleProperty>)],
    theme: &Theme,
    candidate: bool,
    mut required: Option<&mut std::collections::BTreeSet<&'static str>>,
) -> bool {
    struct Family {
        name: &'static str,
        axes: &'static [&'static str],
        axis: fn(&StyleProperty) -> Option<usize>,
        value: fn(&StyleProperty, &Theme) -> String,
        blocks: fn(&StyleProperty) -> bool,
        /// A z-form marker that adds the third axis to the declaration.
        three: fn(&StyleProperty) -> bool,
        /// Every register is read, an unset one as nothing (`var(--r,)`),
        /// as Tailwind's `transform` reads its function registers.
        optional: bool,
    }
    let families = [
        Family {
            name: "translate",
            axes: &[
                "--hozo-translate-x",
                "--hozo-translate-y",
                "--hozo-translate-z",
            ],
            axis: |p| match p {
                StyleProperty::TranslateX(_) => Some(0),
                StyleProperty::TranslateY(_) => Some(1),
                StyleProperty::TranslateZ(_) => Some(2),
                _ => None,
            },
            value: |p, theme| match p {
                StyleProperty::TranslateX(d)
                | StyleProperty::TranslateY(d)
                | StyleProperty::TranslateZ(d) => dimension_value(d, theme),
                _ => unreachable!(),
            },
            blocks: |p| {
                matches!(
                    p,
                    StyleProperty::Translate(_) | StyleProperty::TranslateNone
                )
            },
            three: |p| matches!(p, StyleProperty::TranslateZ(_)),
            optional: false,
        },
        Family {
            name: "scale",
            axes: &["--hozo-scale-x", "--hozo-scale-y", "--hozo-scale-z"],
            axis: |p| match p {
                StyleProperty::ScaleX(_) => Some(0),
                StyleProperty::ScaleY(_) => Some(1),
                StyleProperty::ScaleZ(_) => Some(2),
                _ => None,
            },
            value: |p, _| match p {
                StyleProperty::ScaleX(s) | StyleProperty::ScaleY(s) | StyleProperty::ScaleZ(s) => {
                    s.css()
                }
                _ => unreachable!(),
            },
            blocks: |p| matches!(p, StyleProperty::Scale(_) | StyleProperty::ScaleNone),
            three: |p| matches!(p, StyleProperty::Scale3d),
            optional: false,
        },
        Family {
            name: "transform",
            axes: &[
                "--hozo-rotate-x",
                "--hozo-rotate-y",
                "--hozo-rotate-z",
                "--hozo-skew-x",
                "--hozo-skew-y",
            ],
            axis: |p| match p {
                StyleProperty::RotateX(_) => Some(0),
                StyleProperty::RotateY(_) => Some(1),
                StyleProperty::RotateZ(_) => Some(2),
                StyleProperty::SkewX(_) => Some(3),
                StyleProperty::SkewY(_) => Some(4),
                _ => None,
            },
            value: |p, _| match p {
                StyleProperty::RotateX(a) => format!("rotateX({})", a.css()),
                StyleProperty::RotateY(a) => format!("rotateY({})", a.css()),
                StyleProperty::RotateZ(a) => format!("rotateZ({})", a.css()),
                StyleProperty::SkewX(a) => format!("skewX({})", a.css()),
                StyleProperty::SkewY(a) => format!("skewY({})", a.css()),
                _ => unreachable!(),
            },
            blocks: |p| {
                matches!(
                    p,
                    StyleProperty::Transform(_)
                        | StyleProperty::TransformNone
                        | StyleProperty::TransformEmpty
                        | StyleProperty::TransformGpu
                )
            },
            three: |_| false,
            optional: true,
        },
        // Tailwind's `filter` reads its function registers in this order.
        Family {
            name: "filter",
            axes: &[
                "--hozo-blur",
                "--hozo-brightness",
                "--hozo-contrast",
                "--hozo-grayscale",
                "--hozo-hue-rotate",
                "--hozo-invert",
                "--hozo-saturate",
                "--hozo-sepia",
            ],
            axis: |p| match p {
                StyleProperty::Filter(function, _) => filter_slot(*function, false),
                _ => None,
            },
            value: |p, _| match p {
                StyleProperty::Filter(_, value) => value.clone(),
                _ => unreachable!(),
            },
            // A drop shadow repaints with its own colour register. Raw
            // values do not participate in the ordinary register family.
            blocks: |p| {
                matches!(
                    p,
                    StyleProperty::FilterRaw(_)
                        | StyleProperty::DropShadowColor(_)
                        | StyleProperty::Filter(FilterFunction::DropShadow, _)
                )
            },
            three: |_| false,
            optional: true,
        },
        // And `backdrop-filter` in this one, with opacity before saturate.
        Family {
            name: "backdrop-filter",
            axes: &[
                "--hozo-backdrop-blur",
                "--hozo-backdrop-brightness",
                "--hozo-backdrop-contrast",
                "--hozo-backdrop-grayscale",
                "--hozo-backdrop-hue-rotate",
                "--hozo-backdrop-invert",
                "--hozo-backdrop-opacity",
                "--hozo-backdrop-saturate",
                "--hozo-backdrop-sepia",
            ],
            axis: |p| match p {
                StyleProperty::BackdropFilter(function, _) => filter_slot(*function, true),
                _ => None,
            },
            value: |p, _| match p {
                StyleProperty::BackdropFilter(_, value) => value.clone(),
                _ => unreachable!(),
            },
            blocks: |p| {
                matches!(p, StyleProperty::BackdropFilter(FilterFunction::DropShadow, _))
                    // StyleX's literal `none` is an authored CSS value, not
                    // Tailwind's empty-sentinel whole-property reset.
                    || matches!(p, StyleProperty::BackdropFilter(FilterFunction::None, value) if !value.is_empty())
            },
            three: |_| false,
            optional: true,
        },
    ];
    let mut used = false;
    for family in &families {
        let touches = |props: &[StyleProperty]| {
            props
                .iter()
                .any(|p| (family.axis)(p).is_some() || (family.three)(p))
        };
        let masks = groups.iter().map(|(_, props)| {
            props.iter().fold(0u16, |axes, p| {
                axes | (family.axis)(p).map_or(0, |index| 1 << index)
                    | if (family.three)(p) { 1 << 2 } else { 0 }
            })
        });
        if !split_register_writers(masks, candidate)
            || groups
                .iter()
                .any(|(_, props)| props.iter().any(|p| (family.blocks)(p)))
        {
            continue;
        }
        if let Some(required) = required.as_deref_mut() {
            // Record the whole reader family, not only today's writers: an
            // unwritten register must stay non-inheriting on a child too.
            required.extend(family.axes.iter().map(|name| {
                name.strip_prefix("--hozo-")
                    .expect("internal family register prefix")
            }));
        }
        let reader = if family.optional {
            family
                .axes
                .iter()
                .map(|register| format!("var({register},)"))
                .collect::<Vec<_>>()
                .join(" ")
        } else {
            let three = groups
                .iter()
                .any(|(_, props)| props.iter().any(|p| (family.three)(p)));
            family.axes[..if three { 3 } else { 2 }]
                .iter()
                .map(|register| format!("var({register})"))
                .collect::<Vec<_>>()
                .join(" ")
        };
        for (_, props) in groups.iter_mut() {
            if !touches(props) {
                continue;
            }
            // A Tailwind reset replaces the filter declaration, not the
            // variables. Keep writes in the same condition, but do not add
            // a reader over the reset. A later rule can read them again.
            let resets_filter = props.iter().any(|p| {
                matches!(
                    (family.name, p),
                    ("filter", StyleProperty::Filter(FilterFunction::None, _))
                        | (
                            "backdrop-filter",
                            StyleProperty::BackdropFilter(FilterFunction::None, _)
                        )
                )
            });
            let mut rewritten = Vec::with_capacity(props.len() + 1);
            for property in props.drain(..) {
                match (family.axis)(&property) {
                    Some(index) => rewritten.push(StyleProperty::Arbitrary(
                        family.axes[index].to_string(),
                        (family.value)(&property, theme),
                    )),
                    None if (family.three)(&property) => {}
                    None => rewritten.push(property),
                }
            }
            if resets_filter {
                *props = rewritten;
                continue;
            }
            if family.name == "backdrop-filter" {
                rewritten.push(StyleProperty::Arbitrary(
                    "-webkit-backdrop-filter".to_string(),
                    reader.clone(),
                ));
            }
            rewritten.push(StyleProperty::Arbitrary(
                family.name.to_string(),
                reader.clone(),
            ));
            *props = rewritten;
        }
        used = true;
    }
    used
}

/// `border-spacing` takes a horizontal and a vertical value in one
/// declaration, so the two axes compose. An unset axis is `0`, matching
/// what Tailwind writes for `border-spacing-x-*`.
fn border_spacing_value(props: &[&StyleProperty], theme: &Theme) -> Option<String> {
    if props.is_empty() {
        return None;
    }
    let axis = |f: fn(&StyleProperty) -> Option<&Dimension>| {
        props
            .iter()
            .find_map(|p| f(p))
            .map(|d| dimension_value(d, theme))
            .unwrap_or_else(|| "0".to_string())
    };
    Some(format!(
        "{} {}",
        axis(|p| match p {
            StyleProperty::BorderSpacingX(d) => Some(d),
            _ => None,
        }),
        axis(|p| match p {
            StyleProperty::BorderSpacingY(d) => Some(d),
            _ => None,
        }),
    ))
}

fn is_scrollbar_color(prop: &StyleProperty) -> bool {
    matches!(
        prop,
        StyleProperty::ScrollbarThumbColor(_) | StyleProperty::ScrollbarTrackColor(_)
    )
}

/// `scrollbar-color` takes both halves at once, so `scrollbar-thumb-*` and
/// `scrollbar-track-*` compose into one declaration. Tailwind's registers
/// default to `#0000`, so an unset half is transparent rather than the UA
/// default -- which is why writing only one still names both.
fn scrollbar_color_value(props: &[&StyleProperty], theme: &Theme) -> Option<String> {
    let find = |f: fn(&StyleProperty) -> Option<&Color>| {
        props
            .iter()
            .find_map(|p| f(p))
            .map(|color| resolve_theme_color(color, theme))
            .unwrap_or_else(|| "#0000".to_string())
    };
    if props.is_empty() {
        return None;
    }
    Some(format!(
        "{} {}",
        find(|p| match p {
            StyleProperty::ScrollbarThumbColor(c) => Some(c),
            _ => None,
        }),
        find(|p| match p {
            StyleProperty::ScrollbarTrackColor(c) => Some(c),
            _ => None,
        }),
    ))
}

fn side_keyword(slot: MaskSlot) -> &'static str {
    match slot {
        MaskSlot::Left => "left",
        MaskSlot::Right => "right",
        MaskSlot::Bottom => "bottom",
        MaskSlot::Top => "top",
        _ => "top",
    }
}

/// What `resolve_theme_color` writes for a token nothing defines.
///
/// Spelled once rather than twice because it is load-bearing in two
/// places now: written below, and read by `render_candidate_stylesheet` as
/// its evidence that a *scanned* token was never a utility at all.
pub const UNRESOLVED_COLOR_PREFIX: &str = "var(--hozo-color-";

fn resolve_theme_color(color: &Color, theme: &Theme) -> String {
    let token = match color {
        Color::Token(token) => token,
        // Not a colour at all, so it does not go through the palette.
        Color::Keyword(keyword) => return keyword.to_string(),
        // Already a colour. An arbitrary value is the author saying "not
        // the palette", so looking it up would be answering a question
        // nobody asked -- and answering it wrong, since `#ff0000` names
        // nothing in any theme and would come back as
        // `var(--hozo-color-#ff0000)`.
        Color::Css(text) => return text.clone(),
    };
    // The opacity modifier travels with the token -- `blue-500/50` -- and
    // is split off here rather than by the parser, so that the palette,
    // the project theme and the unresolved fallback all see the name
    // Tailwind actually defines.
    let (token, alpha) = hozo_ir::split_color_alpha(token);
    let resolved = theme
        .web_color(token)
        .map(str::to_owned)
        .or_else(|| theme.color(token).map(|resolved| resolved.oklch))
        // Not in the project's theme either. Still a reference rather than
        // a guess: correct-but-unresolved, which is what this has always
        // done for a token nothing defines.
        .unwrap_or_else(|| format!("{UNRESOLVED_COLOR_PREFIX}{token})"));
    match alpha {
        None => resolved,
        // Keep the variable inside the mix so opacity does not freeze the
        // color to the theme's build-time fallback.
        Some(alpha) => format!(
            "color-mix(in oklab, {resolved} {}%, transparent)",
            alpha * 100.0
        ),
    }
}

/// Maps one `StyleProperty` to a `(css-property-name, value)` pair. Values
/// mirror Tailwind's own generated CSS where there's a choice (e.g.
/// `align-items: flex-start` rather than the newer `start` keyword) so
/// output stays recognizable to anyone used to reading Tailwind's CSS.
pub fn property_and_value<'a>(prop: &'a StyleProperty, theme: &Theme) -> (&'a str, String) {
    // Bound once, so the thirty-odd colour arms below read exactly as they
    // did before a theme existed. Threading `theme` through each of them
    // would add a word to thirty lines and say nothing at any of them.
    let color_var = |color: &Color| resolve_theme_color(color, theme);
    match prop {
        // Rule rendering expands every candidate. Helper callers use the
        // preferred value rather than inventing a property for the wrapper.
        StyleProperty::FirstThatWorks(candidates) => property_and_value(
            candidates
                .first()
                .expect("firstThatWorks always has at least one candidate"),
            theme,
        ),
        // Straight through, both halves. Neither is checked against
        // anything -- see `StyleProperty::Arbitrary` for why that is the
        // deal an arbitrary property makes rather than an omission.
        StyleProperty::Arbitrary(property, value) => (property.as_str(), value.clone()),
        StyleProperty::WebOnly(property, value) => (property.as_str(), value.clone()),
        StyleProperty::Display(d) => (
            "display",
            match d {
                Display::Flex => "flex",
                Display::None => "none",
                Display::Contents => "contents",
                Display::Block => "block",
                Display::InlineFlex => "inline-flex",
                Display::Grid => "grid",
                Display::Css(keyword) => keyword,
            }
            .to_string(),
        ),
        StyleProperty::FlexDirection(dir) => (
            "flex-direction",
            match dir {
                FlexDirection::Row => "row",
                FlexDirection::Column => "column",
                FlexDirection::RowReverse => "row-reverse",
                FlexDirection::ColumnReverse => "column-reverse",
            }
            .to_string(),
        ),
        StyleProperty::Flex(shorthand) => (
            "flex",
            match shorthand {
                FlexShorthand::Grow(n) => format!("{n} 1 0%"),
                FlexShorthand::Fraction(n, d) => format!("calc({n}/{d} * 100%)"),
                FlexShorthand::Auto => "1 1 auto".to_string(),
                FlexShorthand::Initial => "0 1 auto".to_string(),
                FlexShorthand::None => "none".to_string(),
            },
        ),
        StyleProperty::AlignItems(align) => (
            "align-items",
            match align {
                Align::Start => "flex-start",
                Align::Center => "center",
                Align::End => "flex-end",
                Align::Stretch => "stretch",
                Align::Baseline => "baseline",
                Align::Css(v) => v,
            }
            .to_string(),
        ),
        StyleProperty::AlignSelf(align) => (
            "align-self",
            match align {
                AlignSelf::Auto => "auto",
                AlignSelf::Start => "flex-start",
                AlignSelf::Center => "center",
                AlignSelf::End => "flex-end",
                AlignSelf::Stretch => "stretch",
                AlignSelf::Baseline => "baseline",
                AlignSelf::Css(v) => v,
            }
            .to_string(),
        ),
        StyleProperty::AlignContent(justify) => {
            ("align-content", justify_keyword(justify).to_string())
        }
        // Two declarations, so `render_shape` writes it directly and this
        // arm is only here to keep the match exhaustive. Reached only if a
        // `Content` escapes that path, and the value it gives is the
        // useful half rather than a panic.
        StyleProperty::Content(value) => ("content", value.clone()),
        StyleProperty::ContainerName(name) => ("container-name", name.clone()),
        StyleProperty::JustifyContent(justify) => {
            ("justify-content", justify_keyword(justify).to_string())
        }
        StyleProperty::Gap(l) => ("gap", length_px(l, theme)),
        StyleProperty::RowGap(l) => ("row-gap", length_px(l, theme)),
        StyleProperty::ColumnGap(l) => ("column-gap", length_px(l, theme)),
        StyleProperty::MarginTop(d) => ("margin-top", dimension_value(d, theme)),
        StyleProperty::MarginRight(d) => ("margin-right", dimension_value(d, theme)),
        StyleProperty::MarginBottom(d) => ("margin-bottom", dimension_value(d, theme)),
        StyleProperty::MarginLeft(d) => ("margin-left", dimension_value(d, theme)),
        StyleProperty::PaddingTop(l) => ("padding-top", length_px(l, theme)),
        StyleProperty::PaddingRight(l) => ("padding-right", length_px(l, theme)),
        StyleProperty::PaddingBottom(l) => ("padding-bottom", length_px(l, theme)),
        StyleProperty::PaddingLeft(l) => ("padding-left", length_px(l, theme)),
        StyleProperty::MarginInlineStart(d) => ("margin-inline-start", dimension_value(d, theme)),
        StyleProperty::MarginInlineEnd(d) => ("margin-inline-end", dimension_value(d, theme)),
        StyleProperty::PaddingInlineStart(l) => ("padding-inline-start", length_px(l, theme)),
        StyleProperty::PaddingInlineEnd(l) => ("padding-inline-end", length_px(l, theme)),
        StyleProperty::Width(d) => ("width", dimension_value(d, theme)),
        StyleProperty::Height(d) => ("height", dimension_value(d, theme)),
        StyleProperty::MinWidth(d) => ("min-width", dimension_value(d, theme)),
        StyleProperty::MinHeight(d) => ("min-height", dimension_value(d, theme)),
        StyleProperty::MaxWidth(d) => ("max-width", dimension_value(d, theme)),
        StyleProperty::MaxHeight(d) => ("max-height", dimension_value(d, theme)),
        StyleProperty::ZIndex(z) => (
            "z-index",
            z.map_or_else(|| "auto".to_string(), |z| z.to_string()),
        ),
        StyleProperty::GridTemplateColumns(t) => ("grid-template-columns", grid_tracks(t)),
        StyleProperty::GridTemplateRows(t) => ("grid-template-rows", grid_tracks(t)),
        StyleProperty::GridColumnStart(l) => ("grid-column-start", grid_line(l)),
        StyleProperty::GridColumnEnd(l) => ("grid-column-end", grid_line(l)),
        StyleProperty::GridRowStart(l) => ("grid-row-start", grid_line(l)),
        StyleProperty::GridRowEnd(l) => ("grid-row-end", grid_line(l)),
        StyleProperty::GridColumn(s) => ("grid-column", grid_span(s)),
        StyleProperty::GridRow(s) => ("grid-row", grid_span(s)),
        StyleProperty::Position(pos) => (
            "position",
            match pos {
                Position::Relative => "relative",
                Position::Absolute => "absolute",
                Position::Static => "static",
                Position::Css(v) => v,
            }
            .to_string(),
        ),
        StyleProperty::InsetTop(d) => ("top", dimension_value(d, theme)),
        StyleProperty::InsetRight(d) => ("right", dimension_value(d, theme)),
        StyleProperty::InsetBottom(d) => ("bottom", dimension_value(d, theme)),
        StyleProperty::InsetLeft(d) => ("left", dimension_value(d, theme)),
        StyleProperty::InsetInlineStart(d) => ("inset-inline-start", dimension_value(d, theme)),
        StyleProperty::InsetInlineEnd(d) => ("inset-inline-end", dimension_value(d, theme)),
        StyleProperty::InsetInline(d) => ("inset-inline", dimension_value(d, theme)),
        StyleProperty::InsetBlock(d) => ("inset-block", dimension_value(d, theme)),
        StyleProperty::InsetBlockStart(d) => ("inset-block-start", dimension_value(d, theme)),
        StyleProperty::InsetBlockEnd(d) => ("inset-block-end", dimension_value(d, theme)),
        StyleProperty::BackgroundColor(c) => ("background-color", color_var(c)),
        StyleProperty::Opacity(o) => ("opacity", format!("{o}")),
        StyleProperty::BorderColor(c) => ("border-color", color_var(c)),
        StyleProperty::ScrollMargin(edge, l) => {
            (scroll_margin_property(*edge), length_px(l, theme))
        }
        StyleProperty::ScrollPadding(edge, l) => {
            (scroll_padding_property(*edge), length_px(l, theme))
        }
        StyleProperty::ScrollBehavior(value) => ("scroll-behavior", value.to_string()),
        StyleProperty::MaskClip(v) => ("mask-clip", v.to_string()),
        StyleProperty::MaskOrigin(v) => ("mask-origin", v.to_string()),
        StyleProperty::MaskMode(v) => ("mask-mode", v.to_string()),
        StyleProperty::MaskType(v) => ("mask-type", v.to_string()),
        StyleProperty::MaskSize(v) => ("mask-size", v.to_string()),
        StyleProperty::MaskPosition(v) => ("mask-position", v.to_string()),
        StyleProperty::MaskRepeat(v) => ("mask-repeat", v.to_string()),
        StyleProperty::MaskImageNone => ("mask-image", "none".to_string()),
        StyleProperty::ScrollbarWidth(v) => ("scrollbar-width", v.to_string()),
        StyleProperty::ScrollbarGutter(v) => ("scrollbar-gutter", v.to_string()),
        // Composed by `scrollbar_color_value`; partitioned out above.
        StyleProperty::ScrollbarThumbColor(_) | StyleProperty::ScrollbarTrackColor(_) => {
            ("scrollbar-color", String::new())
        }
        // Composed by `gradient_value`, partitioned out before this runs.
        StyleProperty::BackgroundImageNone
        | StyleProperty::BackgroundImage(..)
        | StyleProperty::Gradient(..)
        | StyleProperty::GradientStopColor(..)
        | StyleProperty::GradientStopPosition(..) => ("background-image", String::new()),
        // Composed by `mask_declarations`; `render_rule` partitions these
        // out before this runs.
        StyleProperty::MaskStopColor(..)
        | StyleProperty::MaskStopPosition(..)
        | StyleProperty::MaskSlotArgument(..)
        | StyleProperty::MaskRadialShape(_)
        | StyleProperty::MaskRadialSize(_)
        | StyleProperty::MaskRadialPosition(_)
        | StyleProperty::MaskComposite(_) => ("mask-image", String::new()),
        StyleProperty::Fill(c) => ("fill", color_var(c)),
        StyleProperty::Stroke(c) => ("stroke", color_var(c)),
        // SVG stroke-width is unitless, unlike every other length here.
        StyleProperty::StrokeWidth(n) => ("stroke-width", format!("{n}")),
        StyleProperty::AccentColor(c) => ("accent-color", color_var(c)),
        StyleProperty::CaretColor(c) => ("caret-color", color_var(c)),
        StyleProperty::TextDecorationColor(c) => ("text-decoration-color", color_var(c)),
        StyleProperty::TextDecorationStyle(s) => (
            "text-decoration-style",
            match s {
                DecorationStyle::Solid => "solid",
                DecorationStyle::Double => "double",
                DecorationStyle::Dotted => "dotted",
                DecorationStyle::Dashed => "dashed",
                DecorationStyle::Wavy => "wavy",
            }
            .to_string(),
        ),
        StyleProperty::TextDecorationThickness(l) => {
            ("text-decoration-thickness", length_px(l, theme))
        }
        // Emitted into its own `::placeholder` rule by `render_rule`.
        StyleProperty::PlaceholderColor(c) => ("color", color_var(c)),
        StyleProperty::OutlineWidth(l) => ("outline-width", length_px(l, theme)),
        StyleProperty::OutlineStyle(s) => ("outline-style", border_style_keyword(s).to_string()),
        StyleProperty::OutlineColor(c) => ("outline-color", color_var(c)),
        StyleProperty::OutlineOffset(l) => ("outline-offset", length_px(l, theme)),
        // Child-scoped; `render_rule` partitions these into their own rule
        // before this runs (see `space_declarations`).
        StyleProperty::DivideX(_)
        | StyleProperty::DivideY(_)
        | StyleProperty::DivideColor(_)
        | StyleProperty::DivideStyle(_) => ("border-color", String::new()),
        // One CSS longhand each, including the two axis shorthands, which
        // is exactly what Tailwind emits.
        StyleProperty::BorderTopColor(c) => ("border-top-color", color_var(c)),
        StyleProperty::BorderRightColor(c) => ("border-right-color", color_var(c)),
        StyleProperty::BorderBottomColor(c) => ("border-bottom-color", color_var(c)),
        StyleProperty::BorderLeftColor(c) => ("border-left-color", color_var(c)),
        StyleProperty::BorderInlineColor(c) => ("border-inline-color", color_var(c)),
        StyleProperty::BorderBlockColor(c) => ("border-block-color", color_var(c)),
        StyleProperty::BorderInlineStartColor(c) => ("border-inline-start-color", color_var(c)),
        StyleProperty::BorderInlineEndColor(c) => ("border-inline-end-color", color_var(c)),
        StyleProperty::BorderBlockStartColor(c) => ("border-block-start-color", color_var(c)),
        StyleProperty::BorderBlockEndColor(c) => ("border-block-end-color", color_var(c)),
        StyleProperty::BorderTopWidth(l) => ("border-top-width", length_px(l, theme)),
        StyleProperty::BorderRightWidth(l) => ("border-right-width", length_px(l, theme)),
        StyleProperty::BorderBottomWidth(l) => ("border-bottom-width", length_px(l, theme)),
        StyleProperty::BorderLeftWidth(l) => ("border-left-width", length_px(l, theme)),
        StyleProperty::BorderTopStyle(s) => {
            ("border-top-style", border_style_keyword(s).to_string())
        }
        StyleProperty::BorderRightStyle(s) => {
            ("border-right-style", border_style_keyword(s).to_string())
        }
        StyleProperty::BorderBottomStyle(s) => {
            ("border-bottom-style", border_style_keyword(s).to_string())
        }
        StyleProperty::BorderLeftStyle(s) => {
            ("border-left-style", border_style_keyword(s).to_string())
        }
        StyleProperty::BorderRadius(r) => radius_pair("border-radius", r, theme),
        StyleProperty::BorderTopLeftRadius(r) => radius_pair("border-top-left-radius", r, theme),
        StyleProperty::BorderTopRightRadius(r) => radius_pair("border-top-right-radius", r, theme),
        StyleProperty::BorderBottomRightRadius(r) => {
            radius_pair("border-bottom-right-radius", r, theme)
        }
        StyleProperty::BorderBottomLeftRadius(r) => {
            radius_pair("border-bottom-left-radius", r, theme)
        }
        StyleProperty::BorderStartStartRadius(r) => {
            radius_pair("border-start-start-radius", r, theme)
        }
        StyleProperty::BorderStartEndRadius(r) => radius_pair("border-start-end-radius", r, theme),
        StyleProperty::BorderEndStartRadius(r) => radius_pair("border-end-start-radius", r, theme),
        StyleProperty::BorderEndEndRadius(r) => radius_pair("border-end-end-radius", r, theme),
        StyleProperty::FontSize(l) => ("font-size", length_px(l, theme)),
        StyleProperty::FontWeight(w) => ("font-weight", w.css(theme)),
        StyleProperty::LineHeight(lh) => (
            "line-height",
            match lh {
                LineHeight::FontDefault(l) => format!("var(--tw-leading, {})", length_px(l, theme)),
                LineHeight::Length(l) => length_px(l, theme),
                LineHeight::Ratio(r) => format!("{r}"),
            },
        ),
        StyleProperty::TextUnderlineOffset(d) => {
            ("text-underline-offset", dimension_value(d, theme))
        }
        StyleProperty::OverflowX(o) => ("overflow-x", overflow_keyword(o).to_string()),
        StyleProperty::OverflowY(o) => ("overflow-y", overflow_keyword(o).to_string()),
        StyleProperty::BorderLogicalWidth(edge, l) => {
            (border_width_property(*edge), length_px(l, theme))
        }
        StyleProperty::BorderLogicalStyle(edge, s) => (
            border_style_property(*edge),
            border_style_keyword(s).to_string(),
        ),
        // Composed; see `line_clamp_declarations`.
        StyleProperty::RotateNone => ("rotate", "none".to_string()),
        StyleProperty::ScaleNone => ("scale", "none".to_string()),
        StyleProperty::TranslateNone => ("translate", "none".to_string()),
        StyleProperty::TransformNone => ("transform", "none".to_string()),
        StyleProperty::TransformEmpty => ("transform", String::new()),
        StyleProperty::TransformGpu => ("transform", "translateZ(0)".to_string()),
        StyleProperty::Transform(functions) => {
            ("transform", authored_transform_value(functions, theme))
        }
        StyleProperty::TransformOrigin(value) => ("transform-origin", value.clone()),
        StyleProperty::LineClamp(_) => ("-webkit-line-clamp", String::new()),
        StyleProperty::FlexGrow(n) => ("flex-grow", format!("{n}")),
        StyleProperty::FlexShrink(n) => ("flex-shrink", format!("{n}")),
        StyleProperty::AspectRatio(v) => ("aspect-ratio", v.to_string()),
        StyleProperty::ObjectFit(v) => ("object-fit", v.to_string()),
        // Composed above: it writes the -webkit- prefix too.
        StyleProperty::UserSelect(_) => ("user-select", String::new()),
        StyleProperty::TextDecorationLine(v) => ("text-decoration-line", v.to_string()),
        StyleProperty::Keyword(property, value) => (property, value.to_string()),
        // Composed: it writes both halves. See `KeywordPair`.
        StyleProperty::KeywordPair(..) => ("", String::new()),
        StyleProperty::MixBlendMode(m) => ("mix-blend-mode", m.to_string()),
        StyleProperty::BackgroundBlendMode(m) => ("background-blend-mode", m.to_string()),
        StyleProperty::Order(n) => ("order", n.to_string()),
        StyleProperty::Cursor(keyword) => ("cursor", keyword.clone()),
        StyleProperty::Columns(columns) => (
            "columns",
            match columns {
                ColumnCount::Count(n) => n.to_string(),
                ColumnCount::Width(d) => dimension_value(d, theme),
                ColumnCount::Auto => "auto".to_string(),
            },
        ),
        StyleProperty::LetterSpacing(ls) => (
            "letter-spacing",
            match ls {
                LetterSpacing::Em(Em(v)) => format!("{v}em"),
                LetterSpacing::Px(l) => length_px(l, theme),
            },
        ),
        StyleProperty::Overflow(o) => ("overflow", overflow_keyword(o).to_string()),
        StyleProperty::TextOverflow(t) => (
            "text-overflow",
            match t {
                TextOverflow::Clip => "clip",
                TextOverflow::Ellipsis => "ellipsis",
            }
            .to_string(),
        ),
        StyleProperty::WhiteSpace(w) => (
            "white-space",
            match w {
                WhiteSpace::Normal => "normal",
                WhiteSpace::NoWrap => "nowrap",
                WhiteSpace::Css(v) => v,
            }
            .to_string(),
        ),
        StyleProperty::TransitionProperty(p) => ("transition-property", p.clone()),
        StyleProperty::TransitionDuration(ms, _) => ("transition-duration", format!("{ms}ms")),
        StyleProperty::TransitionDelay(ms, _) => ("transition-delay", format!("{ms}ms")),
        StyleProperty::TransitionTimingFunction(f, _) => ("transition-timing-function", f.clone()),
        StyleProperty::AnimationName(keyframes) => ("animation-name", keyframes.name.clone()),
        StyleProperty::Animation(a) => ("animation", a.shorthand().to_string()),
        // The theme's own shorthand, as Tailwind writes it for
        // `animate-<name>`. A name the theme does not define emits nothing:
        // the class is carried, so the project's own CSS still applies.
        StyleProperty::ThemeAnimation(name) => match theme.animation(name) {
            Some(animation) => ("animation", animation.shorthand.clone()),
            None => ("", String::new()),
        },
        // Never reached: `render_rule` partitions these out into their own
        // child-scoped rule before calling this. Emitting the margin on the
        // element itself would be wrong, so there's nothing sensible to
        // return -- an empty name is filtered by the caller.
        StyleProperty::SpaceX(_)
        | StyleProperty::SpaceY(_)
        | StyleProperty::SpaceReverse(_)
        | StyleProperty::DivideReverse(_) => ("", String::new()),
        StyleProperty::TextAlign(align) => (
            "text-align",
            match align {
                TextAlign::Left => "left",
                TextAlign::Center => "center",
                TextAlign::Right => "right",
                TextAlign::Css(v) => v,
            }
            .to_string(),
        ),
        // Standalone properties, as CSS defines them and Tailwind emits
        // them -- the `transform` shorthand isn't used on either side.
        // Tailwind writes both axes explicitly for scale/translate, so
        // these do the same rather than relying on one-value expansion.
        StyleProperty::Rotate(a) => ("rotate", a.css()),
        // Composed, not emitted here -- see `scale_value` / `transform_value`.
        StyleProperty::Scale(_)
        | StyleProperty::ScaleX(_)
        | StyleProperty::ScaleY(_)
        | StyleProperty::ScaleZ(_)
        | StyleProperty::Scale3d => ("scale", String::new()),
        StyleProperty::RotateX(_)
        | StyleProperty::RotateY(_)
        | StyleProperty::RotateZ(_)
        | StyleProperty::SkewX(_)
        | StyleProperty::SkewY(_) => ("transform", String::new()),
        // Composed by `translate_value`; partitioned out above.
        StyleProperty::Translate(_)
        | StyleProperty::TranslateX(_)
        | StyleProperty::TranslateY(_)
        | StyleProperty::TranslateZ(_) => ("translate", String::new()),
        StyleProperty::FlexBasis(d) => ("flex-basis", dimension_value(d, theme)),
        StyleProperty::BlockSize(d) => ("block-size", dimension_value(d, theme)),
        StyleProperty::InlineSize(d) => ("inline-size", dimension_value(d, theme)),
        StyleProperty::MaxBlockSize(d) => ("max-block-size", dimension_value(d, theme)),
        StyleProperty::MaxInlineSize(d) => ("max-inline-size", dimension_value(d, theme)),
        StyleProperty::MinBlockSize(d) => ("min-block-size", dimension_value(d, theme)),
        StyleProperty::MinInlineSize(d) => ("min-inline-size", dimension_value(d, theme)),
        StyleProperty::TextIndent(d) => ("text-indent", dimension_value(d, theme)),
        StyleProperty::MarginBlockStart(d) => ("margin-block-start", dimension_value(d, theme)),
        StyleProperty::MarginBlockEnd(d) => ("margin-block-end", dimension_value(d, theme)),
        StyleProperty::PaddingBlockStart(l) => ("padding-block-start", length_px(l, theme)),
        StyleProperty::PaddingBlockEnd(l) => ("padding-block-end", length_px(l, theme)),
        // `border-spacing` takes both axes at once, so these compose.
        StyleProperty::BorderSpacingX(_) | StyleProperty::BorderSpacingY(_) => {
            ("border-spacing", String::new())
        }
        // Composed with any ring layers by `box_shadow_value`, not emitted
        // here -- `render_rule` partitions these out before this runs.
        StyleProperty::BoxShadow(s) => ("box-shadow", s.clone()),
        StyleProperty::RingWidth(_)
        | StyleProperty::RingColor(_)
        | StyleProperty::InsetRingWidth(_)
        | StyleProperty::RingOffsetWidth(_)
        | StyleProperty::RingOffsetColor(_)
        | StyleProperty::RingInset
        | StyleProperty::ShadowColor(_)
        | StyleProperty::InsetShadowColor(_)
        | StyleProperty::InsetRingColor(_)
        | StyleProperty::InsetShadow(_) => ("box-shadow", String::new()),
        // Composed, not emitted here -- see `filter_value` and
        // `text_shadow_value`.
        StyleProperty::DropShadowColor(_) => ("filter", String::new()),
        StyleProperty::TextShadowColor(_) | StyleProperty::TextShadow(_) => {
            ("text-shadow", String::new())
        }
        // Composed by `scroll_snap_value`; partitioned out above.
        StyleProperty::ScrollSnapType(_) | StyleProperty::ScrollSnapStrictness(_) => {
            ("scroll-snap-type", String::new())
        }
        StyleProperty::Filter(..) | StyleProperty::FilterRaw(..) => ("filter", String::new()),
        StyleProperty::BackdropFilter(..) => ("backdrop-filter", String::new()),
        StyleProperty::FontFamily(value) => ("font-family", value.css(theme)),
        StyleProperty::FontVariant(values) => ("font-variant", values.join(" ")),
        StyleProperty::TextTransform(t) => (
            "text-transform",
            match t {
                TextTransform::Uppercase => "uppercase",
                TextTransform::Lowercase => "lowercase",
                TextTransform::Capitalize => "capitalize",
                TextTransform::None => "none",
            }
            .to_string(),
        ),
        StyleProperty::TextColor(c) => ("color", color_var(c)),
    }
}

fn breakpoint_min_width_px(bp: Breakpoint) -> u32 {
    match bp {
        Breakpoint::Sm => 640,
        Breakpoint::Md => 768,
        Breakpoint::Lg => 1024,
        Breakpoint::Xl => 1280,
        Breakpoint::Xl2 => 1536,
    }
}

/// A guard's class, keyed by the source span of the opaque expression it
/// wraps -- two `ConditionExpr::Ref`s pointing at the same span refer to the
/// same runtime value, so they must resolve to the same class.
///
/// A class rather than the `data-hozo-cond-*` attribute it was: a class goes
/// wherever `className` goes, and an attribute only as far as the element
/// renders it. An element the compiler keeps as a component -- `Button` with
/// a spread that may carry `href` -- passed the attribute to a component that
/// rendered only the props it names, so the guard never reached the DOM and
/// the negated branch always applied (#883).
pub fn expr_ref_class(expr_ref: hozo_ir::ExprRef) -> String {
    format!("hozo-cond-{}-{}", expr_ref.0.start, expr_ref.0.end)
}

pub fn state_disabled_ref_class(expr_ref: hozo_ir::ExprRef) -> String {
    format!(
        "hozo-state-disabled-{}-{}",
        expr_ref.0.start, expr_ref.0.end
    )
}

pub fn conflict_ref_class(conflict: &hozo_ir::ClassConflictGuard) -> String {
    let slug: String = conflict
        .group
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
        .collect();
    format!(
        "hozo-conflict-{}-{}-{}",
        conflict.reference.0.start, conflict.reference.0.end, slug
    )
}

fn condition_expr_selector(expr: &ConditionExpr) -> String {
    match expr {
        ConditionExpr::Static(true) => String::new(),
        ConditionExpr::Static(false) => ":not(*)".to_string(),
        // Weightless, because a branch the source picks is still the resting
        // look: `size === 'sm' ? 'px-3' : 'px-4'` is (0,1,0) like a plain
        // `px-4`, and so loses to a caller's class rather than beating it
        // (#881). `:not()` and `:is()` take their arguments' weight, so the
        // other arms stay weightless too.
        ConditionExpr::Ref(expr_ref) => format!(":where(.{})", expr_ref_class(*expr_ref)),
        ConditionExpr::StateDisabled(expr_ref) => {
            format!(":where(.{})", state_disabled_ref_class(*expr_ref))
        }
        ConditionExpr::Captured(capture) => {
            format!(":where(.{})", expr_ref_class(capture.reference))
        }
        ConditionExpr::ClassConflict(conflict) => {
            format!(":where(.{})", conflict_ref_class(conflict))
        }
        ConditionExpr::Not(inner) => format!(":not({})", condition_expr_selector(inner)),
        ConditionExpr::And(a, b) => format!(
            "{}{}",
            condition_expr_selector(a),
            condition_expr_selector(b)
        ),
        ConditionExpr::Or(a, b) => {
            format!(
                ":is({}, {})",
                condition_expr_selector(a),
                condition_expr_selector(b)
            )
        }
    }
}

/// A condition's shape as `(at-rule prelude, selector template)`.
///
/// The template carries `&` where the element's own class goes, the same
/// convention Tailwind and nested CSS use. It was a plain suffix until
/// arbitrary variants arrived, which a suffix cannot express: `[&>*]:p-4`
/// happens to append (`.hozo-0>*`) but `[.dark_&]:text-white` does not --
/// the element's class lands at the *end* there, and a suffix has no way
/// to say so.
///
/// The first half is a whole at-rule rather than a bare media query for
/// the same reason. `[@supports(display:grid)]:grid` is not a media query,
/// and hardcoding `@media` at the emission site would have made supports
/// queries unreachable by construction.
/// An arbitrary selector as `:has()` takes it, the way Tailwind writes it.
///
/// Wrapped in `:is()` unless it opens with a combinator: `has-[:focus]:`
/// is `:has(:is(:focus))` and `has-[>img]:` is `:has( > img)`. The
/// wrapper is what keeps a compound argument weighing what a simple one
/// does, and a combinator cannot go inside it.
fn has_argument(selector: &str) -> String {
    if selector.starts_with(['>', '+', '~']) {
        format!(" {selector}")
    } else {
        format!(":is({selector})")
    }
}

/// An at-rule with its condition negated, the way Tailwind writes it:
/// `@media (prefers-color-scheme: dark)` becomes `@media not
/// (prefers-color-scheme: dark)`.
fn negate_at_rule(rule: &str) -> String {
    if let Some(query) = rule.strip_prefix("@container ") {
        // The optional container name is a lookup scope, not part of the
        // boolean expression. `@container main not (width >= ...)` still
        // asks for main, and repeated negation keeps that same lookup.
        if let Some((scope, expression)) = query.split_once('(') {
            return match scope.strip_suffix("not ") {
                Some(scope) => format!("@container {scope}({expression}"),
                None => format!("@container {scope}not ({expression}"),
            };
        }
    }
    match rule.strip_prefix("@media ") {
        Some(query) => format!("@media not {query}"),
        // `@supports` and the arbitrary at-rules are not negated by this
        // path -- `is_negatable` lets them through, and Tailwind spells
        // their negation with the at-rule's own `not` operator, which is
        // where this will grow when one of them needs it.
        None => rule.to_string(),
    }
}

/// One rule's worth of shape: the at-rules around it, and the selector
/// suffix with `&` standing for the element.
pub type Shape = (Vec<String>, String);

/// The shape a condition takes, or the shapes -- some conditions are more
/// than one rule.
///
/// This returned a single shape until `marker:` needed four. Tailwind
/// writes it as `::marker`, a descendant `::marker`, and both again for
/// `::-webkit-details-marker`; `selection:` is two; and `not-hover:` is
/// the selector negated *plus* `@media not (hover: hover)` for a device
/// where nothing is ever hovered.
///
/// `not-hover:` was refused for exactly this reason and is the reason the
/// signature changed: the gap was never in the variant, it was in what a
/// backend could say.
/// One shape, as a list of one. Most conditions are this.
fn one(at_rules: Vec<String>, selector: impl Into<String>) -> Vec<Shape> {
    vec![(at_rules, selector.into())]
}

/// The first shape a condition takes.
///
/// For everything except `marker:`, `selection:` and `not-…:` that is the
/// only one. Kept for callers that genuinely want a single answer -- the
/// emitter uses `condition_shapes`.
#[allow(dead_code)]
pub fn condition_shape(condition: &Condition) -> Shape {
    condition_shapes(condition)
        .into_iter()
        .next()
        .unwrap_or_default()
}

pub fn condition_shapes(condition: &Condition) -> Vec<Shape> {
    condition_shapes_for(condition, true, None)
}

fn condition_shapes_for(
    condition: &Condition,
    portable_disabled: bool,
    dark: Option<&str>,
) -> Vec<Shape> {
    match condition {
        // Stacked variants. The at-rules nest in written order, outermost
        // first, and the selector suffixes append in the same order --
        // `first:hover:` is `:first-child:hover`, not the reverse.
        //
        // Which is why the fold substitutes the accumulated selector *into*
        // each new template rather than the other way round: a template's
        // `&` is where the thing it qualifies goes, so the later variant
        // wraps the earlier one.
        // A product where more than one variant is more than one rule,
        // which is what `hover:marker:` is: hover's single shape times
        // marker's four, all inside the one `@media (hover: hover)`.
        Condition::All(conditions) => {
            let mut shapes: Vec<Shape> = vec![(Vec::new(), "&".to_string())];
            for condition in conditions {
                let mut next = Vec::new();
                for (preludes, selector) in &shapes {
                    for (inner, template) in
                        condition_shapes_for(condition, portable_disabled, dark)
                    {
                        let mut preludes = preludes.clone();
                        preludes.extend(inner);
                        next.push((preludes, template.replace('&', selector)));
                    }
                }
                shapes = next;
            }
            shapes
        }
        Condition::Always => one(Vec::new(), "&"),
        // The capability query is not decoration. Without it a `:hover`
        // style sticks on a touch device after a tap -- the element keeps
        // matching until something else is tapped -- which is why Tailwind
        // v4 wraps every hover utility this way. Hozo emitted the bare
        // pseudo-class until 2026-08-17, and nothing noticed because no
        // comparison here looked at at-rules.
        Condition::Hover => one(vec!["@media (hover: hover)".to_string()], "&:hover"),
        Condition::Focus => one(Vec::new(), "&:focus"),
        Condition::FocusVisible => one(Vec::new(), "&:focus-visible"),
        Condition::LastChild => one(Vec::new(), "&:last-child"),
        // Hozo's own attribute rather than `:disabled`, because `:disabled`
        // matches form controls and nothing else. `Pressable` is a `<div>`,
        // so `disabled:opacity-50` on one used to compile to a rule that
        // could never match -- CSS emitted, nothing applied, no diagnostic.
        // The limitation was known and written down here; what it cost was
        // not.
        //
        // Emitted wherever Hozo marks something disabled, which decouples
        // the styling hook from how the state is *said* on each element:
        // `<button disabled>`, `<div aria-disabled="true">` and a plain
        // dimmed region all carry it, so one selector covers all three and
        // the ARIA question and the CSS question stop being the same
        // question. Specificity is (0,1,0), exactly what `:disabled` was.
        Condition::Disabled => one(
            Vec::new(),
            if portable_disabled {
                "&[data-hozo-disabled]"
            } else {
                "&:disabled"
            },
        ),
        // Exactly what Tailwind generates, checked against it rather than
        // recalled: `.aria-checked\:p-4[aria-checked="true"]`. Which means
        // it needs nothing from the element's props -- the selector matches
        // whatever the element actually carries, whether that came from
        // `accessibilityState`, an `aria-checked` prop, or a spread the
        // compiler never read.
        Condition::Aria(state) => one(Vec::new(), format!("&[aria-{state}=\"true\"]")),
        // The negation of the same attribute, so `disabled:` and
        // `enabled:` cannot disagree. Specificity matches what Tailwind's
        // `:enabled` gives -- `:not()` takes its argument's, which is one
        // attribute, exactly as a pseudo-class is one.
        Condition::Enabled => one(
            Vec::new(),
            if portable_disabled {
                "&:not([data-hozo-disabled])"
            } else {
                "&:enabled"
            },
        ),
        // Read from Tailwind's output rather than recalled. Direction is
        // the odd one: a selector rather than a query, and wrapped in
        // `:where()` so it weighs nothing -- an `rtl:` utility orders
        // against its unprefixed twin by source position, not by winning.
        Condition::Environment(query) => match query {
            Environment::Ltr => one(
                Vec::new(),
                "&:where(:dir(ltr), [dir=\"ltr\"], [dir=\"ltr\"] *)",
            ),
            Environment::Rtl => one(
                Vec::new(),
                "&:where(:dir(rtl), [dir=\"rtl\"], [dir=\"rtl\"] *)",
            ),
            _ => one(vec![query.web_at_rule().to_string()], "&"),
        },
        // `:is(:where(.group):hover *)`, which is Tailwind's own shape --
        // read from it rather than reconstructed. `:where()` is what keeps
        // the ancestor's class out of the specificity, so `group-hover:`
        // weighs the same as `hover:` and the two order by source position
        // like every other pair.
        //
        // The inner condition supplies its own suffix, so this composes
        // with anything that has one: `group-aria-checked:` needs no entry
        // of its own here, and neither will the next variant added.
        //
        // A condition that produces at-rules instead is refused, as
        // Tailwind refuses `group-dark:` -- a media query around the
        // ancestor says nothing about the descendant.
        // Whichever form the inner has, negated -- and it has exactly one,
        // which is what `is_negatable` guarantees at parse time.
        //
        // `:not()` takes its argument's specificity, and so does the
        // negated at-rule's absence of one, so `not-first:` weighs what
        // `first:` weighs. Which is the same reason Tailwind's version
        // does.
        Condition::DataAttribute(selector) => one(Vec::new(), format!("&{selector}")),
        // Parenthesised unless the author already did it, which is what
        // Tailwind emits: `supports-[display:grid]:` is
        // `@supports (display:grid)`.
        Condition::Supports(query) => {
            let query = if query.starts_with('(') {
                query.clone()
            } else {
                format!("({query})")
            };
            one(vec![format!("@supports {query}")], "&")
        }
        // `:is()` around the inner selector is Tailwind's, and it is what
        // keeps `has-[:focus]:` weighing the same as `has-[.a.b.c]:`.
        Condition::HasSelector(selector) => {
            one(Vec::new(), format!("&:has({})", has_argument(selector)))
        }
        Condition::Has(inner) => condition_shapes_for(inner, portable_disabled, dark)
            .into_iter()
            .filter_map(|(at_rules, suffix)| {
                // Not wrapped: a variant's suffix is one compound already,
                // and Tailwind writes `has-hover:` as `:has(:hover)`.
                let rest = suffix.strip_prefix('&').filter(|rest| !rest.is_empty())?;
                Some((at_rules, format!("&:has({rest})")))
            })
            .collect(),
        // The one condition that turns a single rule into two, and the
        // reason this function returns a list. `not-hover:` is the
        // selector negated -- with the capability query *dropped*, since
        // an element on a hover-less device is never hovered and the
        // negation holds there too -- plus a rule for that device.
        Condition::Not(inner) => condition_shapes_for(inner, portable_disabled, dark)
            .into_iter()
            .flat_map(|(at_rules, suffix)| {
                let mut shapes = Vec::new();
                if let Some(rest) = suffix.strip_prefix('&').filter(|rest| !rest.is_empty()) {
                    shapes.push((Vec::new(), format!("&:not({rest})")));
                }
                if !at_rules.is_empty() {
                    shapes.push((
                        at_rules.iter().map(|rule| negate_at_rule(rule)).collect(),
                        "&".to_string(),
                    ));
                }
                shapes
            })
            .collect(),
        Condition::Group(inner) | Condition::Peer(inner) => {
            let marker = if matches!(condition, Condition::Group(_)) {
                "group"
            } else {
                "peer"
            };
            let combinator = if matches!(condition, Condition::Group(_)) {
                " "
            } else {
                " ~ "
            };
            // The at-rules are the inner variant's and survive the
            // relation -- `group-hover:` is inside `@media (hover: hover)`
            // exactly as `hover:` is. Only the selector moves.
            condition_shapes_for(inner, portable_disabled, dark)
                .into_iter()
                .filter_map(|(at_rules, suffix)| {
                    // Refused at parse time, so the `None` is unreachable
                    // -- kept so a future condition with no selector form
                    // degrades to no rule rather than to a malformed one.
                    let rest = suffix.strip_prefix('&').filter(|rest| !rest.is_empty())?;
                    Some((
                        at_rules,
                        format!("&:is(:where(.{marker}){rest}{combinator}*)"),
                    ))
                })
                .collect()
        }
        // Known gotcha, not fixed here: iOS Safari doesn't reliably fire
        // `:active` from a tap unless the element has some touch-event
        // listener attached (a long-documented WebKit quirk). Hozo's
        // compiled onClick doesn't count. Fine for the common desktop/
        // Android case; tracked as a real gap, not silently "handled."
        Condition::Pressed => one(Vec::new(), "&:active"),
        // Range syntax, which is what Tailwind v4 writes and what
        // `max-…:` needs: the old spelling has no exact opposite, only the
        // `(max-width: 767.98px)` convention that leaves a hundredth of a
        // pixel unstyled. Within Tailwind v4's own browser baseline, which
        // is the baseline Hozo is compatible with.
        Condition::Responsive(bp) => one(
            vec![format!(
                "@media (width >= {}px)",
                breakpoint_min_width_px(*bp)
            )],
            "&",
        ),
        Condition::Width { at_least, value } => one(
            vec![format!(
                "@media (width {} {value})",
                if *at_least { ">=" } else { "<" }
            )],
            "&",
        ),
        // The same query asked of an ancestor. A name narrows which
        // ancestor answers; without one it is the nearest container.
        Condition::Container {
            name,
            at_least,
            value,
        } => one(
            vec![format!(
                "@container {}(width {} {value})",
                name.as_ref().map(|n| format!("{n} ")).unwrap_or_default(),
                if *at_least { ">=" } else { "<" },
            )],
            "&",
        ),
        // Tailwind v4's default dark strategy, and the one whose meaning
        // React Native's `useColorScheme()` shares -- unless the project
        // declared its own with `@custom-variant dark (...)`, which Tailwind
        // honours for the classes it generates and so must Hozo for the ones
        // it compiles, or one `dark:` follows two rules on one page (#1654).
        // A selector there has `&` for the element; one starting `@` is an
        // at-rule around it, which is the other form Tailwind accepts.
        Condition::Dark => match dark {
            Some(rule) if rule.starts_with('@') => one(vec![rule.to_string()], "&"),
            Some(selector) => one(Vec::new(), selector.to_string()),
            None => one(vec!["@media (prefers-color-scheme: dark)".to_string()], "&"),
        },
        Condition::FirstChild => one(Vec::new(), "&:first-child"),
        // One arm for eight variants, because the difference between them
        // is entirely in the pseudo-class text -- see `Structural`.
        Condition::Structural(structural) => one(Vec::new(), format!("&{}", structural.selector())),
        Condition::FormState(state) => one(Vec::new(), format!("&{}", state.selector())),
        // The only condition whose *count* varies: `marker:` is four
        // rules and `selection:` two, because a selection and a list
        // marker both cross into descendants and Safari spells a
        // `<details>` marker its own way.
        Condition::PseudoElement(pseudo) => pseudo
            .suffixes()
            .into_iter()
            .map(|s| (Vec::new(), s.to_string()))
            .collect(),
        // `:is()` around it is Tailwind's, and it is what keeps the
        // specificity at the parent's rather than the parent-plus-child
        // it would otherwise be.
        Condition::Subtree { direct } => {
            one(Vec::new(), if *direct { ":is(& > *)" } else { ":is(& *)" })
        }
        Condition::FocusWithin => one(Vec::new(), "&:focus-within"),
        Condition::Target => one(Vec::new(), "&:target"),
        Condition::Open => one(Vec::new(), "&:is([open], :popover-open, :open)"),
        Condition::Control(state) => one(Vec::new(), format!("&{}", state.selector())),
        Condition::Inert => one(Vec::new(), "&:is([inert], [inert] *)"),
        // Tailwind writes `:where(*:hover) &`. This is the same match and
        // the same weight -- `:is()` takes its argument's, which `:where()`
        // makes nothing -- spelled from `&` so `has-` and `not-` can wrap
        // it the way they wrap `group-`.
        Condition::In(inner) => condition_shapes_for(inner, portable_disabled, dark)
            .into_iter()
            .filter_map(|(at_rules, suffix)| {
                let rest = suffix.strip_prefix('&').filter(|rest| !rest.is_empty())?;
                Some((at_rules, format!("&:is(:where(*{rest}) *)")))
            })
            .collect(),
        Condition::Visited => one(Vec::new(), "&:visited"),
        // The only at-rule here that is not a query, and the only reason
        // that matters to this function is that it still has to nest in
        // written order like one: `md:starting:` is `@media` around
        // `@starting-style` and `starting:md:` is the reverse, which the
        // fold in `All` already gets right.
        Condition::StartingStyle => one(vec!["@starting-style".to_string()], "&"),
        // Passed through exactly as written. Hozo does not parse it and
        // deliberately so: a selector it doesn't recognise is one the
        // browser may well support, and the author reached past the design
        // system on purpose. Validating it here would mean maintaining a
        // second, worse copy of the CSS selector grammar.
        //
        // One exception, which is Tailwind v4's: a selector with no `&` is
        // a condition on the element, `&:is(…)`. Passed through bare,
        // `[.x]:` was a rule on every `.x` on the page and `[:hover]:` on
        // everything hovered; and `group-`, `peer-`, `in-` and `not-`,
        // which need the `&` to find the element, wrote nothing (#1781).
        Condition::ArbitrarySelector(selector) if !selector.contains('&') => {
            one(Vec::new(), format!("&:is({selector})"))
        }
        Condition::ArbitrarySelector(selector) => one(Vec::new(), selector.clone()),
        Condition::ArbitraryAtRule(rule) => one(vec![rule.clone()], "&"),
        Condition::Expr(expr) => one(Vec::new(), format!("&{}", condition_expr_selector(expr))),
    }
}

/// Fills a selector template in for one element.
///
/// `&` is replaced everywhere it appears, not just once: `[&+&]` is a
/// legitimate selector for "this element following another of itself".
fn fill_selector(template: &str, class_name: &str) -> String {
    template.replace('&', &format!(".{class_name}"))
}

/// Renders one CSS rule (optionally media-wrapped) for a class + condition
/// group's already-deduped properties.
fn is_shadow_layer(prop: &StyleProperty) -> bool {
    matches!(
        prop,
        StyleProperty::BoxShadow(_)
            | StyleProperty::InsetShadow(_)
            | StyleProperty::RingWidth(_)
            | StyleProperty::RingColor(_)
            | StyleProperty::InsetRingWidth(_)
            | StyleProperty::RingOffsetWidth(_)
            | StyleProperty::RingOffsetColor(_)
            | StyleProperty::RingInset
            | StyleProperty::ShadowColor(_)
            | StyleProperty::InsetShadowColor(_)
            | StyleProperty::InsetRingColor(_)
    )
}

/// Joins whichever ring/shadow utilities are present into one `box-shadow`.
///
/// Tailwind does this at runtime with `--tw-*` registers spliced into a
/// fixed layer list; Hozo knows the whole set at compile time, so it
/// writes the resolved list directly and ships no custom properties. Layer
/// order follows Tailwind's: inset ring, then ring, then the shadow.
///
/// A ring colour with no width contributes nothing, which is correct --
/// `ring-blue-500` alone has nothing to paint, exactly as in Tailwind.
/// Repaints every layer of a shadow in `color`, or leaves it alone if no
/// `shadow-<colour>` was written.
///
/// The shadow's layers carry a default colour each (`rgb(0 0 0 / 0.1)` and
/// friends), and a colour utility replaces all of them at once -- which is
/// what makes `shadow-lg shadow-blue-500` one blue shadow rather than a
/// black one with a colour beside it. Tailwind does the same substitution
/// through `--tw-shadow-color`.
///
/// The colour is the tail of each layer, so it is cut at the last `rgb(`
/// rather than parsed. That holds because the table this reads from is in
/// this repository: every shadow Hozo knows is written with an `rgb()`
/// colour last. An arbitrary `shadow-[…]` has no default colour to
/// replace and is left as written.
fn repaint_shadow(shadow: &str, color: Option<&Color>, theme: &Theme) -> String {
    let Some(color) = color else {
        return shadow.to_string();
    };
    let paint = resolve_theme_color(color, theme);
    split_layers(shadow)
        .into_iter()
        .map(|layer| match layer.rfind("rgb(") {
            // The colour's own extent, not everything after it. A
            // `box-shadow` layer ends at the colour so truncating worked;
            // a `drop-shadow(…)` layer has the wrapper's `)` behind it,
            // and dropping that produced a filter one bracket short of
            // parsing.
            Some(cut) => {
                let end = close_paren(layer, cut + "rgb(".len() - 1);
                format!("{}{paint}{}", &layer[..cut], &layer[end + 1..])
            }
            None => layer.to_string(),
        })
        .collect::<Vec<_>>()
        .join(", ")
}

/// The index of the `)` closing the `(` at `open`.
fn close_paren(value: &str, open: usize) -> usize {
    let mut depth = 0usize;
    for (index, ch) in value.char_indices().skip(open) {
        match ch {
            '(' => depth += 1,
            ')' => {
                depth -= 1;
                if depth == 0 {
                    return index;
                }
            }
            _ => {}
        }
    }
    value.len() - 1
}

/// A comma-separated shadow list, split on the commas *between* layers --
/// `rgb(0 0 0 / 0.1)` has none, but `color-mix(in oklab, …)` does.
fn split_layers(value: &str) -> Vec<&str> {
    let mut layers = Vec::new();
    let mut depth = 0usize;
    let mut start = 0usize;
    for (index, ch) in value.char_indices() {
        match ch {
            '(' => depth += 1,
            ')' => depth = depth.saturating_sub(1),
            ',' if depth == 0 => {
                layers.push(value[start..index].trim());
                start = index + 1;
            }
            _ => {}
        }
    }
    layers.push(value[start..].trim());
    layers
}

/// A shadow with each layer's default colour read through `register`, as
/// Tailwind writes `var(--tw-shadow-color, rgb(0 0 0 / 0.1))`.
fn shadow_through(shadow: &str, register: &str) -> String {
    if shadow == "none" {
        return "0 0 #0000".to_string();
    }
    split_layers(shadow)
        .into_iter()
        .map(|layer| match layer.rfind("rgb(") {
            Some(cut) => {
                let end = close_paren(layer, cut + "rgb(".len() - 1);
                format!(
                    "{}var({register}, {}){}",
                    &layer[..cut],
                    &layer[cut..=end],
                    &layer[end + 1..]
                )
            }
            None => layer.to_string(),
        })
        .collect::<Vec<_>>()
        .join(", ")
}

/// Turn shadow and ring writes into Tailwind's registers when conditions
/// write different ones. Returns whether it did.
///
/// `box_shadow_value` joins the layers per condition, so `focus:ring-2
/// shadow-sm` was `box-shadow: 0 0 0 2px currentcolor` while focused: the
/// focus rule replaced the whole declaration and the shadow went with it.
/// Tailwind keeps every layer, colour, the offset width and the inset flag
/// in a register and reads the five layers in one `box-shadow`; this writes
/// the same structure under `--hozo-*` names. Conditions that write the same
/// slots (`shadow-sm md:shadow-lg`) keep their literal declarations.
pub fn register_split_shadows(
    groups: &mut [(Condition, Vec<StyleProperty>)],
    theme: &Theme,
) -> bool {
    register_shadows(groups, theme, false)
}

fn register_shadows(
    groups: &mut [(Condition, Vec<StyleProperty>)],
    theme: &Theme,
    candidate: bool,
) -> bool {
    fn slot(p: &StyleProperty) -> u16 {
        match p {
            StyleProperty::BoxShadow(_) => 1,
            StyleProperty::ShadowColor(_) => 1 << 1,
            StyleProperty::InsetShadow(_) => 1 << 2,
            StyleProperty::InsetShadowColor(_) => 1 << 3,
            StyleProperty::RingWidth(_) => 1 << 4,
            StyleProperty::RingColor(_) => 1 << 5,
            StyleProperty::InsetRingWidth(_) => 1 << 6,
            StyleProperty::InsetRingColor(_) => 1 << 7,
            StyleProperty::RingOffsetWidth(_) => 1 << 8,
            StyleProperty::RingOffsetColor(_) => 1 << 9,
            StyleProperty::RingInset => 1 << 10,
            _ => 0,
        }
    }
    let masks = groups
        .iter()
        .map(|(_, props)| props.iter().fold(0, |slots, p| slots | slot(p)));
    if !split_register_writers(masks, candidate) {
        return false;
    }
    let color = |c: &Color| {
        if c.is_initial() {
            // Guaranteed-invalid, so the reader falls back to its default.
            "initial".to_string()
        } else {
            resolve_theme_color(c, theme)
        }
    };
    let set = |name: &str, value: String| StyleProperty::Arbitrary(format!("--hozo-{name}"), value);
    for (_, props) in groups.iter_mut() {
        if !props.iter().any(|p| slot(p) != 0) {
            continue;
        }
        // In the candidate cascade colour, offset and inset modifiers are
        // writers only. In particular a ring offset cannot create a shadow
        // on its own or take precedence over a caller's box-shadow.
        let reads = !candidate
            || props.iter().any(|p| {
                matches!(
                    p,
                    StyleProperty::BoxShadow(_)
                        | StyleProperty::InsetShadow(_)
                        | StyleProperty::RingWidth(_)
                        | StyleProperty::InsetRingWidth(_)
                )
            });
        let mut rewritten = Vec::with_capacity(props.len() + 2);
        for property in props.drain(..) {
            match &property {
                StyleProperty::BoxShadow(s) => {
                    rewritten.push(set("shadow", shadow_through(s, "--hozo-shadow-color")))
                }
                StyleProperty::ShadowColor(c) => rewritten.push(set("shadow-color", color(c))),
                StyleProperty::InsetShadow(s) => rewritten.push(set(
                    "inset-shadow",
                    shadow_through(s, "--hozo-inset-shadow-color"),
                )),
                StyleProperty::InsetShadowColor(c) => {
                    rewritten.push(set("inset-shadow-color", color(c)))
                }
                StyleProperty::RingWidth(width) => rewritten.push(set(
                    "ring-shadow",
                    format!(
                        "var(--hozo-ring-inset,) 0 0 0 calc({} + var(--hozo-ring-offset-width)) \
                         var(--hozo-ring-color, currentcolor)",
                        length_px(width, theme)
                    ),
                )),
                StyleProperty::RingColor(c) => rewritten.push(set("ring-color", color(c))),
                StyleProperty::InsetRingWidth(width) => rewritten.push(set(
                    "inset-ring-shadow",
                    format!(
                        "inset 0 0 0 {} var(--hozo-inset-ring-color, currentcolor)",
                        length_px(width, theme)
                    ),
                )),
                StyleProperty::InsetRingColor(c) => {
                    rewritten.push(set("inset-ring-color", color(c)))
                }
                StyleProperty::RingOffsetWidth(width) => {
                    rewritten.push(set("ring-offset-width", length_px(width, theme)));
                    rewritten.push(set(
                        "ring-offset-shadow",
                        "var(--hozo-ring-inset,) 0 0 0 var(--hozo-ring-offset-width) \
                         var(--hozo-ring-offset-color)"
                            .to_string(),
                    ));
                }
                StyleProperty::RingOffsetColor(c) => {
                    rewritten.push(set("ring-offset-color", color(c)))
                }
                StyleProperty::RingInset => rewritten.push(set("ring-inset", "inset".to_string())),
                _ => rewritten.push(property),
            }
        }
        if reads {
            rewritten.push(StyleProperty::Arbitrary(
                "box-shadow".to_string(),
                "var(--hozo-inset-shadow), var(--hozo-inset-ring-shadow), \
                 var(--hozo-ring-offset-shadow), var(--hozo-ring-shadow), var(--hozo-shadow)"
                    .to_string(),
            ));
        }
        *props = rewritten;
    }
    true
}

fn box_shadow_value(props: &[&StyleProperty], theme: &Theme) -> Option<String> {
    let find_length = |f: fn(&StyleProperty) -> Option<&Length>| props.iter().find_map(|p| f(p));
    // `shadow-initial` and its siblings *unset* the register, so the
    // layer keeps its own default. Found and then discarded rather than
    // never parsed, because it has to beat a `shadow-red-500` written
    // before it.
    let find_color = |f: fn(&StyleProperty) -> Option<&Color>| {
        props
            .iter()
            .find_map(|p| f(p))
            .filter(|color| !color.is_initial())
    };

    let ring = find_length(|p| match p {
        StyleProperty::RingWidth(l) => Some(l),
        _ => None,
    });
    let inset_ring = find_length(|p| match p {
        StyleProperty::InsetRingWidth(l) => Some(l),
        _ => None,
    });
    let ring_color = find_color(|p| match p {
        StyleProperty::RingColor(c) => Some(c),
        _ => None,
    });
    let inset_ring_color = find_color(|p| match p {
        StyleProperty::InsetRingColor(c) => Some(c),
        _ => None,
    });
    let shadow = props.iter().find_map(|p| match p {
        StyleProperty::BoxShadow(s) => Some(s.clone()),
        _ => None,
    });

    // Tailwind's default ring colour is `currentcolor`.
    let paint = |c: Option<&Color>| {
        c.map_or_else(
            || "currentcolor".to_string(),
            |color| resolve_theme_color(color, theme),
        )
    };

    let inset_shadow = props.iter().find_map(|p| match p {
        StyleProperty::InsetShadow(s) => Some(s.clone()),
        _ => None,
    });

    let ring_offset = find_length(|p| match p {
        StyleProperty::RingOffsetWidth(l) => Some(l),
        _ => None,
    });
    let ring_offset_color = find_color(|p| match p {
        StyleProperty::RingOffsetColor(c) => Some(c),
        _ => None,
    });
    let shadow_color = find_color(|p| match p {
        StyleProperty::ShadowColor(c) => Some(c),
        _ => None,
    });
    let inset_shadow_color = find_color(|p| match p {
        StyleProperty::InsetShadowColor(c) => Some(c),
        _ => None,
    });

    let mut layers: Vec<String> = Vec::new();
    // Innermost first, matching the order Tailwind splices its registers:
    // inset shadow, inset ring, ring offset, ring, outer shadow.
    if let Some(shadow) = inset_shadow {
        layers.push(repaint_shadow(&shadow, inset_shadow_color, theme));
    }
    if let Some(width) = inset_ring {
        layers.push(format!(
            "inset 0 0 0 {} {}",
            length_px(width, theme),
            paint(inset_ring_color)
        ));
    }
    // The offset is drawn *under* the ring, in the page's own colour, and
    // pushes the ring outwards by its own width. Tailwind's register
    // default is white, which is the assumption that the element sits on
    // a white page -- inherited here rather than second-guessed.
    // `ring-inset` moves the ring inside the box, and the offset with it:
    // Tailwind puts `var(--tw-ring-inset,)` at the head of *both* layers,
    // which are concentric and would come apart otherwise.
    let ring_inset = props.iter().any(|p| matches!(p, StyleProperty::RingInset));
    let inset = if ring_inset { "inset " } else { "" };
    if let Some(width) = ring_offset {
        layers.push(format!(
            "{inset}0 0 0 {} {}",
            length_px(width, theme),
            ring_offset_color.map_or_else(
                || "#fff".to_string(),
                |color| resolve_theme_color(color, theme)
            ),
        ));
    }
    if let Some(width) = ring {
        // The ring's spread includes the offset: the two layers are
        // concentric, so the outer one has to clear the inner.
        let spread = match ring_offset {
            // An expression cannot be added to a number, so the sum has to
            // stay an expression -- which is what Tailwind writes for every
            // ring anyway (`calc(2px + var(--tw-ring-offset-width))`). The
            // folded form is kept for the case where both sides are known,
            // because that is the one Hozo can state exactly and Tailwind's
            // own output normalises to.
            Some(offset)
                if width.css_expression().is_some() || offset.css_expression().is_some() =>
            {
                format!(
                    "calc({} + {})",
                    length_px(width, theme),
                    length_px(offset, theme)
                )
            }
            Some(offset) => length_px(&Length::Px(width.px(theme) + offset.px(theme)), theme),
            None => length_px(width, theme),
        };
        layers.push(format!("{inset}0 0 0 {spread} {}", paint(ring_color)));
    }
    if let Some(shadow) = shadow {
        // `shadow-none` removes the *shadow* layer, not the whole
        // declaration -- `shadow-none ring-2` still draws the ring, which is
        // what Tailwind does by clearing only its `--tw-shadow` register.
        if shadow != "none" {
            layers.push(repaint_shadow(&shadow, shadow_color, theme));
        } else if layers.is_empty() {
            return Some("none".to_string());
        }
    }
    (!layers.is_empty()).then(|| layers.join(", "))
}

pub fn render_rule(
    class_name: &str,
    condition: &Condition,
    props: &[StyleProperty],
    theme: &Theme,
) -> String {
    render_rule_for(class_name, condition, props, theme, true)
}

/// Only form predicates differ between portable root markers and real
/// secondary DOM owners. Other candidates keep their existing two rules.
pub(super) fn needs_form_owner(condition: &Condition) -> bool {
    match condition {
        Condition::Disabled | Condition::Enabled => true,
        Condition::All(conditions) => conditions.iter().any(needs_form_owner),
        Condition::Not(inner)
        | Condition::Group(inner)
        | Condition::Peer(inner)
        | Condition::In(inner)
        | Condition::Has(inner) => needs_form_owner(inner),
        _ => false,
    }
}

/// A pattern's secondary class list lands on a real child DOM element, not
/// a synthesized root control. Let CSS ask that owner's actual capability:
/// a disabled descendant does not make a decorative span :disabled or
/// :enabled. This policy propagates through stacking and negation; replacing
/// marker text afterwards cannot distinguish :enabled from not-disabled.
pub(super) fn render_slot_rule(
    class_name: &str,
    condition: &Condition,
    props: &[StyleProperty],
    theme: &Theme,
) -> String {
    render_rule_for(class_name, condition, props, theme, false)
}

fn render_rule_for(
    class_name: &str,
    condition: &Condition,
    props: &[StyleProperty],
    theme: &Theme,
    portable_disabled: bool,
) -> String {
    // One condition can be several rules -- `marker:` is four and
    // `not-hover:` is two -- so this is a loop rather than a call. In
    // written order, which is the order Tailwind emits them and therefore
    // the order the conformance suite compares them in.
    // `::before` and `::after` generate no box at all without `content`,
    // so a rule targeting one carries it whether or not the author wrote
    // a `content-*` utility -- which is what makes `before:bg-red-500`
    // paint anything.
    //
    // At the level of the pseudo-element itself, not at the end. Tailwind
    // writes `before:md:flex` with native nesting --
    // `::before { content: …; @media … { display: flex } }` -- so the box
    // exists at every width and only the style is conditional. Putting the
    // content inside the query instead would mean no `::before` at all
    // below the breakpoint, which is a different thing to have written.
    let chain = match condition {
        Condition::All(conditions) => conditions.as_slice(),
        single => std::slice::from_ref(single),
    };
    let generates: Vec<usize> = chain
        .iter()
        .enumerate()
        .filter(|(_, c)| matches!(c, Condition::PseudoElement(p) if p.needs_content()))
        .map(|(index, _)| index)
        .collect();

    let mut rules: Vec<String> = Vec::new();
    // One content-only rule per pseudo-element that something follows.
    // `before:after:flex` is two of them nested, and each box needs its
    // own `content` -- the outer one is not inherited by the inner.
    for index in generates
        .iter()
        .copied()
        .filter(|index| index + 1 < chain.len())
    {
        rules.push(render_rule_shapes(
            class_name,
            &prefix_of(chain, index),
            &[],
            theme,
            true,
            portable_disabled,
        ));
    }
    let ends_in_content = generates
        .last()
        .is_some_and(|index| index + 1 == chain.len());
    rules.push(render_rule_shapes(
        class_name,
        condition,
        props,
        theme,
        ends_in_content,
        portable_disabled,
    ));
    rules.join("\n\n")
}

/// The chain up to and including `index`, as a condition.
fn prefix_of(chain: &[Condition], index: usize) -> Condition {
    match &chain[..=index] {
        [single] => single.clone(),
        many => Condition::All(many.to_vec()),
    }
}

fn render_rule_shapes(
    class_name: &str,
    condition: &Condition,
    props: &[StyleProperty],
    theme: &Theme,
    needs_content: bool,
    portable_disabled: bool,
) -> String {
    condition_shapes_for(condition, portable_disabled, theme.dark_selector())
        .into_iter()
        .map(|shape| render_shape(class_name, shape, props, theme, needs_content))
        .collect::<Vec<_>>()
        .join(
            "

",
        )
}

fn render_shape(
    class_name: &str,
    (at_rule, selector): Shape,
    props: &[StyleProperty],
    theme: &Theme,
    needs_content: bool,
) -> String {
    let target = fill_selector(&selector, class_name);

    // A width's implied `solid` goes in its own rule at zero specificity, so
    // any written style that applies beats it, whatever the order or
    // condition -- as Tailwind's widths read `--tw-border-style`. A
    // pseudo-element cannot sit inside `:where()`; there it stays inline.
    let (default_styles, props): (Vec<StyleProperty>, Vec<StyleProperty>) =
        props.iter().cloned().partition(|p| {
            !target.contains("::")
                && matches!(
                    p,
                    StyleProperty::BorderTopStyle(BorderStyle::Default)
                        | StyleProperty::BorderRightStyle(BorderStyle::Default)
                        | StyleProperty::BorderBottomStyle(BorderStyle::Default)
                        | StyleProperty::BorderLeftStyle(BorderStyle::Default)
                        | StyleProperty::BorderLogicalStyle(_, BorderStyle::Default)
                        | StyleProperty::OutlineStyle(BorderStyle::Default)
                )
        });
    let props = props.as_slice();

    // Some utilities target something other than the element itself, so
    // they become their own rule with a different selector rather than a
    // declaration here. `space-*`/`divide-*` reach the children;
    // `placeholder-*` reaches the `::placeholder` pseudo-element.
    let (scoped_props, own_props): (Vec<_>, Vec<_>) = props.iter().partition(|p| {
        matches!(
            p,
            StyleProperty::SpaceX(_)
                | StyleProperty::SpaceY(_)
                | StyleProperty::SpaceReverse(_)
                | StyleProperty::DivideX(_)
                | StyleProperty::DivideY(_)
                | StyleProperty::DivideReverse(_)
                | StyleProperty::DivideColor(_)
                | StyleProperty::DivideStyle(_)
                | StyleProperty::PlaceholderColor(_)
        )
    });
    let (placeholder_props, child_props): (Vec<_>, Vec<_>) = scoped_props
        .iter()
        .partition(|p| matches!(p, StyleProperty::PlaceholderColor(_)));

    // Rings and shadows are several utilities that share one CSS property,
    // so they're composed rather than emitted one declaration each.
    let (shadow_props, rest): (Vec<&StyleProperty>, Vec<&StyleProperty>) =
        own_props.into_iter().partition(|p| is_shadow_layer(p));
    let (mask_props, rest): (Vec<&StyleProperty>, Vec<&StyleProperty>) =
        rest.into_iter().partition(|p| is_mask_gradient(p));
    let (gradient_props, rest): (Vec<&StyleProperty>, Vec<&StyleProperty>) =
        rest.into_iter().partition(|p| is_gradient(p));
    let (scrollbar_props, rest): (Vec<&StyleProperty>, Vec<&StyleProperty>) =
        rest.into_iter().partition(|p| is_scrollbar_color(p));
    let (translate_props, rest): (Vec<&StyleProperty>, Vec<&StyleProperty>) = rest
        .into_iter()
        .partition(|p| is_translate(p) || matches!(p, StyleProperty::TranslateNone));
    let (keyword_pair_props, rest): (Vec<&StyleProperty>, Vec<&StyleProperty>) = rest
        .into_iter()
        .partition(|p| matches!(p, StyleProperty::KeywordPair(..)));
    let (user_select_props, rest): (Vec<&StyleProperty>, Vec<&StyleProperty>) = rest
        .into_iter()
        .partition(|p| matches!(p, StyleProperty::UserSelect(_)));
    let (filter_props, rest): (Vec<&StyleProperty>, Vec<&StyleProperty>) =
        rest.into_iter().partition(|p| is_filter(p));
    let (scale_props, rest): (Vec<&StyleProperty>, Vec<&StyleProperty>) = rest
        .into_iter()
        .partition(|p| is_scale_axis(p) || matches!(p, StyleProperty::ScaleNone));
    let (transform_props, rest): (Vec<&StyleProperty>, Vec<&StyleProperty>) =
        rest.into_iter().partition(|p| {
            is_transform_function(p)
                || matches!(
                    p,
                    StyleProperty::TransformNone
                        | StyleProperty::TransformEmpty
                        | StyleProperty::TransformGpu
                )
        });
    let (spacing_props, rest): (Vec<&StyleProperty>, Vec<&StyleProperty>) =
        rest.into_iter().partition(|p| is_border_spacing(p));
    let (text_shadow_props, rest): (Vec<&StyleProperty>, Vec<&StyleProperty>) =
        rest.into_iter().partition(|p| is_text_shadow(p));
    let (snap_props, own_props): (Vec<&StyleProperty>, Vec<&StyleProperty>) =
        rest.into_iter().partition(|p| is_scroll_snap(p));

    let mut rules: Vec<String> = Vec::new();
    // `needs_content` on its own is a rule: the hoisted `::before` that
    // exists only to make the box, whose whole body is one declaration.
    if needs_content
        || !own_props.is_empty()
        || !shadow_props.is_empty()
        || !mask_props.is_empty()
        || !gradient_props.is_empty()
        || !scrollbar_props.is_empty()
        || !translate_props.is_empty()
        || !keyword_pair_props.is_empty()
        || !user_select_props.is_empty()
        || !filter_props.is_empty()
        || !scale_props.is_empty()
        || !transform_props.is_empty()
        || !spacing_props.is_empty()
        || !text_shadow_props.is_empty()
        || !snap_props.is_empty()
    {
        let mut body = String::new();
        // First, as Tailwind writes it -- and the order matters: a
        // `content-none` beside it sets `content` again, and the last
        // declaration is the one that wins.
        if needs_content {
            body.push_str("  content: var(--hozo-content);\n");
        }
        for prop in own_props {
            // A line clamp's four declarations go where the clamp is, so a
            // `display` or `overflow` written after it in the plan's order
            // still wins, as in Tailwind (`line-clamp-2 flex` is `flex`).
            if let StyleProperty::LineClamp(lines) = prop {
                for (name, value) in line_clamp_declarations(lines.as_ref()) {
                    body.push_str(&format!(
                        "  {name}: {value};
"
                    ));
                }
                continue;
            }
            if let StyleProperty::FirstThatWorks(candidates) = prop {
                // StyleX's first argument has the highest preference. CSS
                // chooses the last declaration it understands, so the
                // official transform writes the candidates in reverse.
                for candidate in candidates.iter().rev() {
                    let (name, value) = property_and_value(candidate, theme);
                    body.push_str(&format!("  {name}: {value};\n"));
                }
                continue;
            }
            if let StyleProperty::Content(value) = prop {
                body.push_str(&format!("  --hozo-content: {value};\n"));
                let resolved = if value == "none" {
                    "none"
                } else {
                    "var(--hozo-content)"
                };
                body.push_str(&format!("  content: {resolved};\n"));
                continue;
            }
            let (name, value) = property_and_value(prop, theme);
            if matches!(
                prop,
                StyleProperty::LineHeight(LineHeight::Length(_) | LineHeight::Ratio(_))
            ) {
                // Same register as Tailwind so an authored leading also
                // survives font-size rules in other breakpoint groups and
                // classes supplied by the caller's candidate sheet.
                body.push_str(&format!("  --tw-leading: {value};\n"));
            }
            // A theme animation the theme does not define has no declaration
            // to write; its class is carried instead.
            if name.is_empty() {
                continue;
            }
            body.push_str(&format!("  {name}: {value};\n"));
        }
        if let Some(value) = box_shadow_value(&shadow_props, theme) {
            body.push_str(&format!("  box-shadow: {value};\n"));
        }
        if let Some(value) = gradient_value(&gradient_props, theme) {
            body.push_str(&format!(
                "  background-image: {value};
"
            ));
        }
        for (name, value) in mask_declarations(&mask_props, theme) {
            body.push_str(&format!("  {name}: {value};\n"));
        }
        if let Some(value) = scrollbar_color_value(&scrollbar_props, theme) {
            body.push_str(&format!("  scrollbar-color: {value};\n"));
        }
        if let Some(value) = translate_value(&translate_props, theme) {
            body.push_str(&format!("  translate: {value};\n"));
        }
        if let Some(value) = text_shadow_value(&text_shadow_props, theme) {
            body.push_str(&format!("  text-shadow: {value};\n"));
        }
        if let Some(value) = scroll_snap_value(&snap_props) {
            body.push_str(&format!(
                "  scroll-snap-type: {value};
"
            ));
        }
        if let Some(value) = filter_value(&filter_props, false, theme) {
            body.push_str(&format!(
                "  filter: {value};
"
            ));
        }
        if let Some(value) = filter_value(&filter_props, true, theme) {
            // The unprefixed property is not enough: Safari still ships
            // backdrop-filter only behind the -webkit- prefix, and Tailwind
            // emits both.
            body.push_str(&format!(
                "  -webkit-backdrop-filter: {value};
"
            ));
            body.push_str(&format!(
                "  backdrop-filter: {value};
"
            ));
        }
        for prop in &keyword_pair_props {
            if let StyleProperty::KeywordPair(p1, v1, p2, v2) = prop {
                body.push_str(&format!(
                    "  {p1}: {v1};
"
                ));
                body.push_str(&format!(
                    "  {p2}: {v2};
"
                ));
            }
        }
        // Safari still needs the prefix for user-select, and Tailwind emits
        // both, so this is one utility writing two declarations rather than
        // a value formatting choice.
        for prop in &user_select_props {
            if let StyleProperty::UserSelect(value) = prop {
                body.push_str(&format!(
                    "  -webkit-user-select: {value};
"
                ));
                body.push_str(&format!(
                    "  user-select: {value};
"
                ));
            }
        }
        if let Some(value) = scale_value(&scale_props) {
            body.push_str(&format!("  scale: {value};\n"));
        }
        if let Some(value) = transform_value(&transform_props, theme) {
            body.push_str(&format!("  transform: {value};\n"));
        }
        if let Some(value) = border_spacing_value(&spacing_props, theme) {
            body.push_str(&format!("  border-spacing: {value};\n"));
        }
        rules.push(format!("{target} {{\n{body}}}"));
    }
    if !default_styles.is_empty() {
        let mut body = String::new();
        for prop in &default_styles {
            let (name, value) = property_and_value(prop, theme);
            body.push_str(&format!("  {name}: {value};\n"));
        }
        rules.push(format!(":where({target}) {{\n{body}}}"));
    }
    if !child_props.is_empty() {
        let mut body = String::new();
        // Which axes the sibling `-reverse` utilities flipped, read before
        // the widths are written because it decides which edge each one
        // goes on.
        let flipped = |axis: Axis| {
            child_props.iter().any(|p: &&&StyleProperty| {
                matches!(
                    ***p,
                    StyleProperty::SpaceReverse(a) | StyleProperty::DivideReverse(a) if a == axis
                )
            })
        };
        let reversed = [flipped(Axis::X), flipped(Axis::Y)];
        for prop in &child_props {
            for (name, value) in space_declarations(prop, theme, reversed) {
                body.push_str(&format!("  {name}: {value};\n"));
            }
        }
        // `:where()` keeps the specificity at zero, matching Tailwind, so
        // a child's own utilities still win over the parent's spacing.
        rules.push(format!(":where({target} > :not(:last-child)) {{\n{body}}}"));
        let defaults = divider_default_styles(&child_props);
        if !defaults.is_empty() {
            rules.push(format!(
                "@layer base {{\n  :where({target} > :not(:last-child)) {{\n{defaults}  }}\n}}"
            ));
        }
    }
    if !placeholder_props.is_empty() {
        let mut body = String::new();
        for prop in placeholder_props {
            let (name, value) = property_and_value(prop, theme);
            body.push_str(&format!("  {name}: {value};\n"));
        }
        rules.push(format!("{target}::placeholder {{\n{body}}}"));
    }

    // Nested innermost-last, so the first variant written is the outermost
    // wrapper -- `md:hover:` is a width query around a hover query, which
    // is how Tailwind writes it too.
    //
    // Each level indents what it wraps. Whitespace means nothing to a
    // browser, but this text is what a person reads -- in the REPL, in a
    // generated `.hozo.css` -- and a query around an unindented rule reads
    // as two rules one after the other.
    at_rule
        .into_iter()
        .rev()
        .fold(rules.join("\n\n"), |rule, prelude| {
            format!("{prelude} {{\n{}\n}}", indent_block(&rule))
        })
}

/// The `solid` a divider width implies, which Tailwind reads from
/// `--tw-border-style`: it applies only where no written style does, the
/// divider's own (`divide-dashed`, also at zero specificity) or the child's.
/// So it goes in the base layer, which every unlayered rule beats whatever
/// its order or condition.
fn divider_default_styles(props: &[&&StyleProperty]) -> String {
    let mut body = String::new();
    for prop in props {
        let names: &[&str] = match ***prop {
            StyleProperty::DivideX(_) => &["border-inline-style"],
            StyleProperty::DivideY(_) => &["border-top-style", "border-bottom-style"],
            _ => continue,
        };
        for name in names {
            body.push_str(&format!("    {name}: solid;\n"));
        }
    }
    body
}

/// Two spaces in front of every non-empty line. A CSS string cannot hold a
/// raw newline, so no line break here is inside a value.
fn indent_block(text: &str) -> String {
    text.lines()
        .map(|line| {
            if line.is_empty() {
                String::new()
            } else {
                format!("  {line}")
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// Escapes a class name for use in a CSS selector. Tailwind class names
/// contain characters that are selector syntax -- `hover:bg-blue-500`,
/// `w-1/2`, `p-1.5` -- and must be backslash-escaped to be matched
/// literally.
///
/// A leading digit is the case a backslash cannot carry. CSS forbids an
/// identifier that begins with one, and the escape is the code point in
/// hex followed by a space that terminates it: `2xl:block` is
/// `.\32 xl\:block`. Writing `.2xl\:block` produces a selector no
/// browser matches and that a minifier rejects outright -- which is how
/// this was found, as a build failure in the Storybook example the first
/// time a `2xl:` class reached the candidate stylesheet.
///
/// Only the candidate stylesheet spells a Tailwind name; a class the
/// compiler reads becomes `hozo-…` and never touches this. That is why
/// the conformance audit's variant section, which compiles
/// `<View className="2xl:block" />` and reads back `.hozo-0`, reported a
/// match for every one of them.
pub fn escape_class_selector(class_name: &str) -> String {
    let mut out = String::with_capacity(class_name.len());
    for (index, c) in class_name.chars().enumerate() {
        if index == 0 && c.is_ascii_digit() {
            out.push_str(&format!("\\{:x} ", c as u32));
            continue;
        }
        // Everything that is not an identifier character, rather than a list
        // of the punctuation somebody remembered. The list form was wrong the
        // moment the scanner learned to keep a quote (#676): a candidate
        // `before:content-['']` came out as `.before\:content-\[''\]::before`,
        // which is not a selector -- lightningcss refused the whole stylesheet
        // with `Unexpected token String("")` and the build stopped.
        //
        // A minifier rejecting it is the good case. The bad one is a browser
        // parsing `.a\[b='c'\]` as far as it can and matching nothing, which
        // is what every unescaped character in the old list would have done
        // quietly. CSS says an identifier is `[A-Za-z0-9_-]` plus non-ASCII,
        // so that is the test, and non-ASCII is left alone because CSS allows
        // it unescaped and Tailwind emits it that way.
        if !(c.is_ascii_alphanumeric() || c == '-' || c == '_' || !c.is_ascii()) {
            out.push('\\');
        }
        out.push(c);
    }
    out
}

/// The declarations `space-x-*`/`space-y-*` put on each non-last child.
/// Both sides are written, not just the gap-bearing one, because Tailwind
/// does the same -- its reverse-direction support needs the zero side to
/// be explicit.
fn space_declarations(
    prop: &StyleProperty,
    theme: &Theme,
    reversed: [bool; 2],
) -> Vec<(&'static str, String)> {
    let color_var = |color: &Color| resolve_theme_color(color, theme);
    // The gap and the zero, in the order the two edges are written. Both
    // are always written, which is the whole reason a separate `-reverse`
    // utility can work at all.
    let split = |axis: Axis, l: &Dimension| {
        let gap = dimension_value(l, theme);
        if reversed[axis as usize] {
            (gap, "0".to_string())
        } else {
            ("0".to_string(), gap)
        }
    };
    match prop {
        StyleProperty::SpaceX(l) => {
            let (start, end) = split(Axis::X, l);
            vec![("margin-inline-start", start), ("margin-inline-end", end)]
        }
        StyleProperty::SpaceY(l) => {
            let (start, end) = split(Axis::Y, l);
            vec![("margin-top", start), ("margin-bottom", end)]
        }
        // Tailwind writes both edges, zeroing the leading one, so that
        // `divide-x-reverse` can flip which edge carries the border without
        // a different rule. Matching that shape keeps the output identical.
        // A divider's style is not here: Tailwind's reads
        // `--tw-border-style`, so a written style beats it wherever it
        // applies; see `divider_default_styles`.
        StyleProperty::DivideX(l) => {
            let (start, end) = split(Axis::X, l);
            vec![
                ("border-inline-start-width", start),
                ("border-inline-end-width", end),
            ]
        }
        StyleProperty::DivideY(l) => {
            let (start, end) = split(Axis::Y, l);
            vec![("border-top-width", start), ("border-bottom-width", end)]
        }
        // The flip itself writes nothing: it is read by the width above,
        // which is the only thing that knows how big the gap is.
        StyleProperty::SpaceReverse(_) | StyleProperty::DivideReverse(_) => Vec::new(),
        StyleProperty::DivideColor(c) => vec![("border-color", color_var(c))],
        StyleProperty::DivideStyle(s) => {
            let keyword = border_style_keyword(s).to_string();
            vec![
                ("border-top-style", keyword.clone()),
                ("border-right-style", keyword.clone()),
                ("border-bottom-style", keyword.clone()),
                ("border-left-style", keyword),
            ]
        }
        _ => Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use hozo_ir::{ExprRef, SourceSpan};

    #[test]
    fn not_and_compose_into_a_selector() {
        let a = ConditionExpr::Ref(ExprRef(SourceSpan { start: 0, end: 1 }));
        let b = ConditionExpr::Ref(ExprRef(SourceSpan { start: 2, end: 3 }));
        let expr = ConditionExpr::And(Box::new(a), Box::new(ConditionExpr::Not(Box::new(b))));
        let (at_rule, selector) = condition_shape(&Condition::Expr(expr));
        assert!(at_rule.is_empty());
        assert_eq!(
            selector,
            "&:where(.hozo-cond-0-1):not(:where(.hozo-cond-2-3))"
        );
    }

    #[test]
    fn an_arbitrary_selector_places_the_element_where_the_ampersand_is() {
        // The reason `condition_shape` returns a template rather than a
        // suffix: here the element's class lands at the end, and there is
        // no suffix that can say that.
        let (at_rule, selector) =
            condition_shape(&Condition::ArbitrarySelector(".dark &".to_string()));
        assert!(at_rule.is_empty());
        assert_eq!(fill_selector(&selector, "hozo-0"), ".dark .hozo-0");
    }

    #[test]
    fn an_arbitrary_at_rule_wraps_the_whole_rule() {
        let (at_rule, selector) = condition_shape(&Condition::ArbitraryAtRule(
            "@supports (display:grid)".to_string(),
        ));
        assert_eq!(at_rule, vec!["@supports (display:grid)"]);
        assert_eq!(fill_selector(&selector, "hozo-0"), ".hozo-0");
    }

    #[test]
    fn the_filter_chain_is_ordered_by_function_not_by_how_it_was_written() {
        // Filter functions don't commute: grayscale-then-invert and
        // invert-then-grayscale render differently. Tailwind fixes the
        // order by where each register sits in the value, so writing
        // `invert grayscale` must still come out grayscale-first.
        let props = [
            StyleProperty::Filter(FilterFunction::Invert, "invert(100%)".to_string()),
            StyleProperty::Filter(FilterFunction::Grayscale, "grayscale(100%)".to_string()),
            StyleProperty::Filter(FilterFunction::Blur, "blur(8px)".to_string()),
        ];
        let refs: Vec<&StyleProperty> = props.iter().collect();
        assert_eq!(
            filter_value(&refs, false, &Theme::default()),
            Some("blur(8px) grayscale(100%) invert(100%)".to_string())
        );
        // The element's own chain and the backdrop's are independent.
        assert_eq!(filter_value(&refs, true, &Theme::default()), None);
    }

    #[test]
    fn separate_writers_under_the_same_guard_still_need_registers() {
        let theme = Theme::default();
        for (first, last, writer) in [
            (
                StyleProperty::Filter(FilterFunction::Blur, "blur(8px)".into()),
                StyleProperty::Filter(FilterFunction::Sepia, "sepia(100%)".into()),
                register_split_axes as fn(&mut [(Condition, Vec<StyleProperty>)], &Theme) -> bool,
            ),
            (
                StyleProperty::TranslateX(Dimension::Length(Length::Px(8.0))),
                StyleProperty::TranslateY(Dimension::Length(Length::Px(12.0))),
                register_split_axes,
            ),
            (
                StyleProperty::BoxShadow("0 1px 2px #123".into()),
                StyleProperty::RingWidth(Length::Px(2.0)),
                register_split_shadows,
            ),
            (
                StyleProperty::Gradient(GradientKind::Linear, "to right".into()),
                StyleProperty::GradientStopColor(GradientStop::From, Color::Keyword("red")),
                register_split_gradients,
            ),
        ] {
            let mut one = vec![(Condition::Hover, vec![first.clone(), last.clone()])];
            assert!(
                !writer(&mut one, &theme),
                "a single rule can write a literal"
            );
            let mut same_slots = vec![
                (Condition::Hover, vec![first.clone()]),
                (Condition::Hover, vec![first.clone()]),
            ];
            assert!(
                !writer(&mut same_slots, &theme),
                "identical slot masks need no registers"
            );
            let mut repeated = vec![
                (Condition::Hover, vec![first]),
                (Condition::Pressed, vec![StyleProperty::Opacity(0.5)]),
                (Condition::Hover, vec![last]),
            ];
            assert!(writer(&mut repeated, &theme), "{repeated:?}");
            assert_eq!(repeated[1].1, vec![StyleProperty::Opacity(0.5)]);
            for (_, props) in [&repeated[0], &repeated[2]] {
                assert!(props.iter().any(|prop| matches!(
                    prop, StyleProperty::Arbitrary(name, _) if name.starts_with("--hozo-")
                )));
            }
        }

        let mut raw = vec![
            (
                Condition::Hover,
                vec![StyleProperty::Filter(
                    FilterFunction::Blur,
                    "blur(8px)".into(),
                )],
            ),
            (
                Condition::Pressed,
                vec![StyleProperty::FilterRaw("url(#external)".into())],
            ),
            (
                Condition::Hover,
                vec![StyleProperty::Filter(
                    FilterFunction::Sepia,
                    "sepia(100%)".into(),
                )],
            ),
        ];
        assert!(
            !register_split_axes(&mut raw, &theme),
            "raw filters still block register lowering"
        );
    }

    #[test]
    fn literal_backdrop_functions_share_the_conditional_register_order() {
        let props = [
            StyleProperty::BackdropFilter(FilterFunction::Sepia, "sepia(100%)".into()),
            StyleProperty::BackdropFilter(FilterFunction::Saturate, "saturate(150%)".into()),
            StyleProperty::BackdropFilter(FilterFunction::Opacity, "opacity(50%)".into()),
        ];
        for refs in [
            props.iter().collect::<Vec<_>>(),
            props.iter().rev().collect::<Vec<_>>(),
        ] {
            assert_eq!(
                filter_value(&refs, true, &Theme::default()),
                Some("opacity(50%) saturate(150%) sepia(100%)".into())
            );
        }
    }

    #[test]
    fn a_cleared_filter_slot_drops_out_but_filter_none_clears_everything() {
        let cleared = [
            StyleProperty::Filter(FilterFunction::Blur, String::new()),
            StyleProperty::Filter(FilterFunction::Invert, "invert(100%)".to_string()),
        ];
        let refs: Vec<&StyleProperty> = cleared.iter().collect();
        assert_eq!(
            filter_value(&refs, false, &Theme::default()),
            Some("invert(100%)".to_string())
        );

        let off = [
            StyleProperty::Filter(FilterFunction::Invert, "invert(100%)".to_string()),
            StyleProperty::Filter(FilterFunction::None, String::new()),
        ];
        let refs: Vec<&StyleProperty> = off.iter().collect();
        assert_eq!(
            filter_value(&refs, false, &Theme::default()),
            Some("none".to_string())
        );
    }

    #[test]
    fn a_raw_filter_keeps_authored_order_and_replaces_the_earlier_chain() {
        let props = [
            StyleProperty::Filter(FilterFunction::Blur, "blur(8px)".to_string()),
            StyleProperty::FilterRaw("sepia(60%) hue-rotate(20deg)".to_string()),
        ];
        let refs: Vec<&StyleProperty> = props.iter().collect();
        assert_eq!(
            filter_value(&refs, false, &Theme::default()),
            Some("sepia(60%) hue-rotate(20deg)".to_string())
        );
    }

    #[test]
    fn known_color_token_resolves_to_real_oklch() {
        let prop = StyleProperty::BackgroundColor(Color::Token("blue-500".to_string()));
        let (name, value) = property_and_value(&prop, &Theme::default());
        assert_eq!(name, "background-color");
        assert_eq!(value, "oklch(62.3% 0.214 259.815)");
    }

    #[test]
    fn an_opacity_modifier_becomes_a_color_mix() {
        // Tailwind's own output for `bg-blue-500/50` is two declarations:
        // an `in srgb` fallback holding the literal colour and an
        // `in oklab` holding the theme variable. Hozo resolves the literal
        // already, so one declaration says the same thing -- and the later
        // of Tailwind's two is the one a declaration map keeps.
        let prop = StyleProperty::BackgroundColor(Color::Token("blue-500/50".to_string()));
        let (name, value) = property_and_value(&prop, &Theme::default());
        assert_eq!(name, "background-color");
        assert_eq!(
            value,
            "color-mix(in oklab, oklch(62.3% 0.214 259.815) 50%, transparent)"
        );
    }

    #[test]
    fn a_modifier_that_is_not_a_percentage_stays_unresolved() {
        // The marker is the honest answer for something this cannot
        // evaluate. Tailwind also accepts `/[0.5]` and `/(--var)`, and
        // guessing at either would be worse than saying nothing.
        let prop = StyleProperty::BackgroundColor(Color::Token("blue-500/[0.5]".to_string()));
        let (_, value) = property_and_value(&prop, &Theme::default());
        assert_eq!(value, "var(--hozo-color-blue-500/[0.5])");
    }

    #[test]
    fn unknown_color_token_falls_back_to_a_css_custom_property() {
        let (_, value) = property_and_value(
            &StyleProperty::TextColor(Color::Token("brand-primary".to_string())),
            &Theme::default(),
        );
        assert_eq!(value, "var(--hozo-color-brand-primary)");
    }
}

#[cfg(test)]
mod variant_tests {
    use super::*;

    #[test]
    fn stacked_variants_nest_their_at_rules_and_join_their_selectors() {
        let (at_rules, selector) = condition_shape(&Condition::All(vec![
            Condition::Responsive(hozo_ir::Breakpoint::Md),
            Condition::FirstChild,
            Condition::Hover,
        ]));
        // Written order, outermost first, and `hover:` brings its own.
        assert_eq!(
            at_rules,
            vec!["@media (width >= 768px)", "@media (hover: hover)"]
        );
        // Suffixes append in written order: `:first-child:hover`, not the
        // reverse. Which is why the fold substitutes the accumulated
        // selector *into* each new template.
        assert_eq!(
            fill_selector(&selector, "hozo-0"),
            ".hozo-0:first-child:hover"
        );
    }

    #[test]
    fn starting_style_nests_in_written_order_like_a_query() {
        // The only at-rule here that is not a query, and it still has to
        // nest where it was written: Tailwind puts `@media` outside for
        // `md:starting:` and inside for `starting:md:`, and the two mean
        // different things to a browser resolving the first frame.
        let md = Condition::Responsive(hozo_ir::Breakpoint::Md);
        let (outer, _) =
            condition_shape(&Condition::All(vec![md.clone(), Condition::StartingStyle]));
        assert_eq!(outer, vec!["@media (width >= 768px)", "@starting-style"]);
        let (inner, selector) =
            condition_shape(&Condition::All(vec![Condition::StartingStyle, md]));
        assert_eq!(inner, vec!["@starting-style", "@media (width >= 768px)"]);
        // It qualifies the rule rather than the element, so the selector
        // is untouched.
        assert_eq!(fill_selector(&selector, "hozo-0"), ".hozo-0");
    }

    #[test]
    fn hover_carries_the_capability_query() {
        // Not decoration: without it a `:hover` style sticks on a touch
        // device after a tap.
        let (at_rules, selector) = condition_shape(&Condition::Hover);
        assert_eq!(at_rules, vec!["@media (hover: hover)"]);
        assert_eq!(selector, "&:hover");
    }
}

/// The environment query in `condition`, if the Web cannot express it.
///
/// Reaches inside an `All`, because a stacked variant is inexpressible the
/// moment any part of it is: `dark:screen-reader:flex` has no rule to
/// emit either.
pub fn inexpressible_on_web(condition: &Condition) -> Option<Environment> {
    match condition {
        Condition::Environment(query) if !query.web_query() => Some(*query),
        Condition::All(conditions) => conditions.iter().find_map(inexpressible_on_web),
        Condition::Not(inner)
        | Condition::Group(inner)
        | Condition::Peer(inner)
        | Condition::In(inner)
        | Condition::Has(inner) => inexpressible_on_web(inner),
        _ => None,
    }
}

#[cfg(test)]
mod platform_setting_tests {
    use super::*;

    #[test]
    fn the_one_setting_the_web_can_ask_becomes_a_media_query() {
        // Tailwind has no variant for it, so it was uncovered on this
        // platform too -- the query is real and nothing was reaching it.
        let (at_rules, selector) =
            condition_shape(&Condition::Environment(Environment::ReduceTransparency));
        assert_eq!(
            at_rules,
            vec!["@media (prefers-reduced-transparency: reduce)"]
        );
        assert_eq!(selector, "&");
    }

    #[test]
    fn the_three_it_cannot_ask_are_refused_rather_than_guessed() {
        // An empty prelude would be a rule with no condition, which
        // applies to *everyone* -- worse than one that never applies.
        for query in [
            Environment::BoldText,
            Environment::Grayscale,
            Environment::ScreenReader,
        ] {
            assert_eq!(
                inexpressible_on_web(&Condition::Environment(query)),
                Some(query),
                "{query:?}",
            );
        }
        assert_eq!(
            inexpressible_on_web(&Condition::Environment(Environment::ReduceTransparency)),
            None,
        );
    }

    #[test]
    fn a_stacked_variant_is_inexpressible_the_moment_any_part_is() {
        // `dark:screen-reader:flex` has no rule to emit either, and
        // emitting the dark half alone would apply it to everyone in dark
        // mode.
        assert_eq!(
            inexpressible_on_web(&Condition::All(vec![
                Condition::Dark,
                Condition::Environment(Environment::ScreenReader),
            ])),
            Some(Environment::ScreenReader),
        );
        assert_eq!(
            inexpressible_on_web(&Condition::Not(Box::new(Condition::Environment(
                Environment::BoldText
            )))),
            Some(Environment::BoldText),
        );
    }

    #[test]
    fn the_refusal_says_refuses_rather_than_lacks_where_that_is_the_fact() {
        // Two different facts, and only one of them might change.
        assert!(Environment::ScreenReader
            .web_gap_message()
            .contains("declines"));
        assert!(Environment::BoldText.web_gap_message().contains("no query"));
    }
}

#[cfg(test)]
mod escape_tests {
    use super::escape_class_selector;

    #[test]
    fn selector_syntax_is_escaped_with_a_backslash() {
        assert_eq!(
            escape_class_selector("hover:bg-blue-500"),
            "hover\\:bg-blue-500"
        );
        assert_eq!(escape_class_selector("w-1/2"), "w-1\\/2");
        assert_eq!(escape_class_selector("p-1.5"), "p-1\\.5");
        assert_eq!(escape_class_selector("flex"), "flex");
    }

    #[test]
    fn an_arbitrary_value_escapes_every_character_it_holds() {
        // The case that broke the build once the scanner stopped losing these
        // (#676): a quote is not selector syntax in any list somebody writes
        // from memory, and it ends a CSS string when it arrives unescaped.
        // lightningcss refused the whole stylesheet with
        // `Unexpected token String("")`.
        assert_eq!(
            escape_class_selector("before:content-['']"),
            "before\\:content-\\[\\'\\'\\]"
        );
        assert_eq!(
            escape_class_selector("data-[hozo-state=checked]:bg-red-500"),
            "data-\\[hozo-state\\=checked\\]\\:bg-red-500"
        );
        assert_eq!(escape_class_selector("text-[#fff]"), "text-\\[\\#fff\\]");
        assert_eq!(
            escape_class_selector("bg-[url(/a.png)]"),
            "bg-\\[url\\(\\/a\\.png\\)\\]"
        );
        assert_eq!(escape_class_selector("[&_p]:mt-4"), "\\[\\&_p\\]\\:mt-4");
    }

    #[test]
    fn a_leading_digit_becomes_a_code_point() {
        // CSS forbids an identifier beginning with a digit, and a
        // backslash does not fix it: the escape is the code point in hex
        // with a space to end it. `.2xl\:block` is a selector no browser
        // matches, and lightningcss refuses to minify it -- which is how
        // this was found, as a build failure in the Storybook example the
        // first time a `2xl:` class reached the candidate stylesheet.
        assert_eq!(escape_class_selector("2xl:block"), "\\32 xl\\:block");
        assert_eq!(
            escape_class_selector("2xl:grid-cols-4"),
            "\\32 xl\\:grid-cols-4"
        );
        // Only when it leads. Every other digit is an ordinary character,
        // which is most of Tailwind's scale.
        assert_eq!(escape_class_selector("gap-2"), "gap-2");
        assert_eq!(
            escape_class_selector("hover:2xl:block"),
            "hover\\:2xl\\:block"
        );
    }

    #[test]
    fn every_breakpoint_produces_a_selector_css_accepts() {
        // The rule rather than the one case: a name may start with a digit
        // and nothing else may, so this is the whole condition.
        for name in ["sm:flex", "md:flex", "lg:flex", "xl:flex", "2xl:flex"] {
            let escaped = escape_class_selector(name);
            let first = escaped.chars().next().unwrap();
            assert!(
                first.is_alphabetic() || first == '_' || first == '\\',
                "{name} escaped to {escaped}, which cannot begin a CSS identifier"
            );
        }
    }
}
