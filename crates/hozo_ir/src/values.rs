//! The value types style properties carry: layout keywords, colours,
//! fonts, transforms, filters, grid tracks, animations and gradients.

use super::*;

#[derive(Debug, Clone, PartialEq)]
pub enum StrokeWidth {
    Number(f64),
    Length(Length),
}

impl StrokeWidth {
    /// Numeric width in density-independent pixels for React Native `<Svg>`
    /// and Canvas, or `None` when the length depends on runtime layout/font state.
    pub fn px(&self, theme: &Theme) -> Option<f64> {
        match self {
            StrokeWidth::Number(n) => Some(*n),
            StrokeWidth::Length(length)
                if length.unresolved_unit().is_none() && length.css_expression().is_none() =>
            {
                Some(length.px(theme))
            }
            StrokeWidth::Length(_) => None,
        }
    }
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
    /// Single-value `<length-percentage>` `flex` shorthand (`flex-[10px]`,
    /// `flex-[2rem]`, `flex-[50%]`), which CSS Flexbox expands to
    /// `flex-grow: 1; flex-shrink: 1; flex-basis: <value>`.
    BasisPx(f64),
    BasisUnit(f64, LengthUnit),
    BasisPercent(f64),
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

/// A colour token split from its opacity modifier: `blue-500/50` is
/// `("blue-500", Some(0.5))`.
///
/// Tailwind writes the modifier after a slash, and until now the slash
/// travelled with the token into the palette lookup, where nothing matched
/// it. The Web backend then emitted its unresolved-colour marker --
/// `var(--hozo-color-blue-500/50)`, which is not a valid custom property
/// name, so every browser drops the declaration and the element has no
/// colour. The Native backend emitted `hozo-unresolved:blue-500/50` into a
/// style object, which React Native cannot parse either.
///
/// Both were silent. The conformance suite did not catch it because its
/// candidate list contains no class with a modifier at all: the denominator
/// never asked.
///
/// Only the plain numeric form. Tailwind also accepts `/[0.5]` and
/// `/(--var)`, and those stay unresolved rather than guessed at -- an
/// arbitrary alpha is a value this has no way to evaluate, and the marker
/// they fall back to is at least honest about that.
pub fn split_color_alpha(token: &str) -> (&str, Option<f64>) {
    let Some((base, modifier)) = token.rsplit_once('/') else {
        return (token, None);
    };
    match modifier.parse::<f64>() {
        // Tailwind's modifier is a percentage, and the scale it documents
        // is 0-100. Anything outside that is not a modifier it would have
        // produced, so it goes through unsplit and stays unresolved.
        Ok(percent) if (0.0..=100.0).contains(&percent) => (base, Some(percent / 100.0)),
        _ => (token, None),
    }
}

/// The three sRGB channels of a `#rgb` or `#rrggbb` hex colour, which is the
/// shape both Tailwind's default palette and `@hozo/tailwind`'s theme
/// extraction produce.
pub fn hex_rgb_channels(hex: &str) -> Option<(u8, u8, u8)> {
    let digits = hex.strip_prefix('#')?;
    let pair = |at: usize| -> Option<u8> {
        match digits.len() {
            3 => {
                let digit = digits.get(at..at + 1)?;
                u8::from_str_radix(&format!("{digit}{digit}"), 16).ok()
            }
            6 => u8::from_str_radix(digits.get(at * 2..at * 2 + 2)?, 16).ok(),
            _ => None,
        }
    };
    Some((pair(0)?, pair(1)?, pair(2)?))
}

/// Resolves a colour for Canvas paint props (`fill` / `stroke`), or returns
/// `None` when neither Canvas 2D nor Skia can paint the value directly.
///
/// Canvas shapes sit outside the DOM cascade: CSS custom properties
/// (`var(--hozo-color-*)`), `currentcolor`, and `inherit` have no painting
/// target on Canvas 2D or Skia, and unresolved markers must never reach a
/// drawing prop silently. Opacity modifiers (`blue-500/50`, `black/25`) are
/// folded into a concrete CSS Color 4 / `rgba()` literal.
pub fn resolve_canvas_color(color: &Color, theme: &Theme, native: bool) -> Option<String> {
    match color {
        Color::Keyword(keyword) => {
            matches!(*keyword, "none" | "transparent").then(|| (*keyword).to_string())
        }
        Color::Css(value) => native_color_literal_valid(value).then(|| value.clone()),
        Color::Token(token) => {
            let (base, alpha) = split_color_alpha(token);
            if matches!(base, "current" | "inherit") {
                return None;
            }
            if base == "transparent" {
                return Some("transparent".to_string());
            }
            let resolved = theme.color(base)?;
            match alpha {
                None => {
                    if native {
                        native_color_literal_valid(&resolved.hex).then_some(resolved.hex)
                    } else if native_color_literal_valid(&resolved.oklch) {
                        Some(resolved.oklch)
                    } else {
                        native_color_literal_valid(&resolved.hex).then_some(resolved.hex)
                    }
                }
                Some(alpha) => {
                    if native {
                        hex_rgb_channels(&resolved.hex)
                            .map(|(r, g, b)| format!("rgba({r}, {g}, {b}, {alpha})"))
                    } else if let Some(inner) = resolved
                        .oklch
                        .strip_prefix("oklch(")
                        .and_then(|rest| rest.strip_suffix(')'))
                        .filter(|inner| {
                            !inner.contains('/') && native_color_literal_valid(&resolved.oklch)
                        })
                    {
                        Some(format!("oklch({inner} / {alpha})"))
                    } else {
                        hex_rgb_channels(&resolved.oklch)
                            .or_else(|| hex_rgb_channels(&resolved.hex))
                            .map(|(r, g, b)| format!("rgba({r}, {g}, {b}, {alpha})"))
                    }
                }
            }
        }
    }
}

/// Resolves a statically known pixel length for Canvas props, returning `None`
/// for viewport/font-relative units or CSS `calc()`/`var()` expressions.
pub fn resolve_canvas_length_px(length: &Length, theme: &Theme) -> Option<f64> {
    if length.unresolved_unit().is_some() || length.css_expression().is_some() {
        return None;
    }
    let px = length.px(theme);
    px.is_finite().then_some(px)
}

/// Resolves a statically known pixel dimension for Canvas props (`translate`,
/// `maxWidth`), rejecting percentages, `auto`, viewport units, and CSS text.
pub fn resolve_canvas_dimension_px(dimension: &Dimension, theme: &Theme) -> Option<f64> {
    match dimension {
        Dimension::Length(length) => resolve_canvas_length_px(length, theme),
        Dimension::Percent(_)
        | Dimension::Auto
        | Dimension::ViewportWidth(_)
        | Dimension::ViewportHeight(_)
        | Dimension::Css(_) => None,
    }
}

/// Resolves a uniform corner radius in pixels for `Canvas.RoundedRect`.
pub fn resolve_canvas_radius_px(radius: &Radius, theme: &Theme) -> Option<f64> {
    match radius {
        Radius::Length(length) => resolve_canvas_length_px(length, theme).filter(|px| *px >= 0.0),
        Radius::Scale { name, fallback_px } => {
            let px = theme.radius(name).unwrap_or(*fallback_px);
            (px.is_finite() && px >= 0.0).then_some(px)
        }
        Radius::Theme(name) => theme.radius(name).filter(|px| px.is_finite() && *px >= 0.0),
        // Matches React Native's pill sentinel; both Canvas2D `roundRect` and
        // Skia's `RoundedRect` clamp the corner radius to half the short side.
        Radius::Full => Some(9999.0),
        Radius::Percent(_) => None,
    }
}

/// The React Native style key and inset side an `env(safe-area-inset-*)`
/// arbitrary value asks for, if it is one.
///
/// The one CSS function React Native can answer. A notch, a home indicator
/// and a status bar are all real on both platforms; what differs is how the
/// number arrives -- the cascade on Web, a hook on Native -- and that is a
/// difference this compiler exists to absorb.
///
/// No new class names. `pt-[env(safe-area-inset-top)]` is a class Tailwind
/// itself produces, and the Web backend already emits exactly the CSS
/// Tailwind emits for it; inventing a `pt-safe` would put a spelling in
/// Hozo's mouth that the conformance suite's denominator has never heard
/// of.
///
/// The properties are the ones an inset is written on: padding, margin, and
/// the four insets. Not width or height -- `w-[env(safe-area-inset-left)]`
/// parses and means nothing -- and not the shorthands, because
/// `padding: env(safe-area-inset-top)` on Web sets all four sides to the
/// top inset, which nobody writes on purpose.
pub fn safe_area_inset(property: &str, value: &str) -> Option<(&'static str, &'static str)> {
    let side = value
        .strip_prefix("env(safe-area-inset-")
        .and_then(|rest| rest.strip_suffix(')'))
        .and_then(|side| match side {
            "top" | "right" | "bottom" | "left" => Some(side),
            // A fallback -- `env(safe-area-inset-top, 0px)` -- is the same
            // value with a default the runtime hook does not need, but
            // parsing it would mean deciding what a *non-zero* fallback
            // means on a platform where the value is never missing. Left
            // refused until somebody writes one.
            _ => None,
        })?;
    let side = match side {
        "top" => "top",
        "right" => "right",
        "bottom" => "bottom",
        _ => "left",
    };
    let key = match property {
        "padding-top" => "paddingTop",
        "padding-right" => "paddingRight",
        "padding-bottom" => "paddingBottom",
        "padding-left" => "paddingLeft",
        "margin-top" => "marginTop",
        "margin-right" => "marginRight",
        "margin-bottom" => "marginBottom",
        "margin-left" => "marginLeft",
        "top" => "top",
        "right" => "right",
        "bottom" => "bottom",
        "left" => "left",
        _ => return None,
    };
    Some((key, side))
}

/// One complete `text-shadow` declaration.
///
/// Tailwind's named sizes can contain several layers, which React Native
/// cannot represent. Static StyleX declarations get a narrower portable
/// form when they contain one px-based layer: Web retains the exact CSS
/// spelling while Native consumes the decomposed colour, offset and blur.
#[derive(Debug, Clone, PartialEq)]
pub enum TextShadowValue {
    Web(String),
    Portable {
        css: String,
        color: Color,
        offset_x: Length,
        offset_y: Length,
        radius: Length,
    },
}

impl TextShadowValue {
    pub fn css(&self) -> &str {
        match self {
            Self::Web(css) | Self::Portable { css, .. } => css,
        }
    }

    pub fn portable_parts(&self) -> Option<(&Color, &Length, &Length, &Length)> {
        match self {
            Self::Web(_) => None,
            Self::Portable {
                color,
                offset_x,
                offset_y,
                radius,
                ..
            } => Some((color, offset_x, offset_y, radius)),
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
    /// The `solid` a border width utility implies (`border-2`), as
    /// Tailwind's width rules read it from `--tw-border-style`: it applies
    /// only where no written style does, whatever the order or condition.
    /// Web emits it at zero specificity; Native writes nothing, since React
    /// Native's own default is `solid`. It loses to a written style in
    /// `dedupe_last_wins` (`Origin::Default`).
    Default,
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
pub enum FontWeight {
    /// Authored numeric/StyleX weight or a semantic default, not a theme alias.
    Absolute(u16),
    /// A named Tailwind utility retains its token until backend theme resolution.
    Theme { name: &'static str, fallback: u16 },
}

#[derive(Debug, Clone, PartialEq)]
pub enum FontFamily {
    /// A family written out, which no theme changes.
    Literal(String),
    /// `font-sans`, `font-serif`, `font-mono`: `--font-<name>` from the
    /// project's theme, or Tailwind's default stack when there is no theme
    /// to ask. A project's `@theme` override of the token is what
    /// Tailwind's own utility follows (#1691).
    Theme {
        name: &'static str,
        fallback: &'static str,
    },
}

impl FontFamily {
    pub fn css(&self, theme: &Theme) -> String {
        match self {
            Self::Literal(value) => value.clone(),
            Self::Theme { name, fallback } => theme
                .font_family(name)
                .map_or(*fallback, |(web, _)| web)
                .to_owned(),
        }
    }

    pub fn native(&self, theme: &Theme) -> String {
        match self {
            Self::Literal(value) => value.clone(),
            Self::Theme { name, fallback } => theme
                .font_family(name)
                .map_or(*fallback, |(_, native)| native)
                .to_owned(),
        }
    }
}

impl FontWeight {
    pub fn css(self, theme: &Theme) -> String {
        match self {
            Self::Absolute(weight) => weight.to_string(),
            Self::Theme { name, fallback } => theme
                .font_weight(name)
                .map(str::to_owned)
                .unwrap_or_else(|| fallback.to_string()),
        }
    }

    /// Stock RN's font-weight parser accepts the nine 100-step weights.
    /// Do not silently round a CSS variable-font weight such as 650.
    pub fn native(self, theme: &Theme) -> Option<u16> {
        let value = match self {
            Self::Absolute(weight) => {
                return ((100..=900).contains(&weight) && weight.is_multiple_of(100))
                    .then_some(weight)
            }
            Self::Theme { name, fallback } => match theme.font_weight(name) {
                Some(value) => value,
                None => return Self::Absolute(fallback).native(theme),
            },
        };
        match value.trim() {
            "normal" => Some(400),
            "bold" => Some(700),
            value => value
                .parse::<f64>()
                .ok()
                .filter(|weight| {
                    weight.is_finite() && (100.0..=900.0).contains(weight) && weight % 100.0 == 0.0
                })
                .map(|weight| weight as u16),
        }
    }
}

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
    Ratio(f64),
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
            Scale::Ratio(value) => value.to_string(),
            Scale::Css(text) => text.clone(),
        }
    }

    /// The scale as the ratio React Native's `transform` wants.
    pub fn ratio(&self) -> Option<f64> {
        match self {
            Scale::Percent(value) => Some(value / 100.0),
            Scale::Ratio(value) => Some(*value),
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
    /// A text-size utility's fallback, not an authored `leading-*` value.
    /// Keep the provenance: an explicit leading wins even when a responsive
    /// text size is active, and even when that size appears later in a list.
    FontDefault(Length),
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

/// One static StyleX keyframe animation and its stable CSS identifier.
#[derive(Debug, Clone, PartialEq)]
pub struct Keyframes {
    pub name: String,
    pub frames: Vec<Keyframe>,
}

/// One selector group inside a `@keyframes` rule.
#[derive(Debug, Clone, PartialEq)]
pub struct Keyframe {
    pub selector: String,
    pub properties: Vec<StyleProperty>,
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
/// Used when a utility supplies a fallback that loses to a separate explicit
/// utility: transition timing and a text size's default line height.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Origin {
    /// A utility that exists to set this: `duration-75`, `ease-in`.
    Written,
    /// The fallback a `transition-*` or text-size utility carries.
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
