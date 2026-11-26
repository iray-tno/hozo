//! Lengths and dimensions: units, radii, and how each resolves to pixels.

use super::*;

/// Corner radius. `Full` ("pill shape", Tailwind's `rounded-full`) is its
/// own variant rather than a large `Length`, because it's a distinct
/// intent and the platforms express it differently: CSS has a literal
/// `infinity`, React Native does not and needs a finite stand-in. Baking
/// the finite value into the IR would force the Web backend to emit an
/// approximation of something it can state exactly.
#[derive(Debug, Clone, PartialEq)]
pub enum Radius {
    Length(Length),
    Percent(f64),
    Full,
    /// A built-in Tailwind scale name, not an authored numeric length.
    /// Keep its identity until the theme is available: `--radius-lg` can
    /// override `rounded-lg` without changing `rounded-[8px]` or StyleX.
    /// The fallback preserves theme-free output. A scale is always known,
    /// unlike `Theme` below, so it need not carry the original class for CSS.
    Scale {
        name: &'static str,
        fallback_px: f64,
    },
    /// A name only the project's theme can define: `control` for
    /// `rounded-control` and `--radius-control`. The parser has no theme, so
    /// it holds the name for each backend to look up, as it does for a
    /// theme animation. A name the theme does not define emits nothing.
    Theme(String),
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

pub(super) fn round(value: f64) -> f64 {
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
