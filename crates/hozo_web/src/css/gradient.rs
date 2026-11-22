//! Background gradients and the registers that let them interpolate.

use hozo_ir::{Condition, GradientKind, GradientStop, StyleProperty, Theme};

use super::color::resolve_theme_color;
use super::values::dimension_value;

pub(super) fn is_gradient(prop: &StyleProperty) -> bool {
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
pub(super) fn gradient_value(props: &[&StyleProperty], theme: &Theme) -> Option<String> {
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
pub(super) fn split_register_writers(masks: impl Iterator<Item = u16>, candidate: bool) -> bool {
    let mut writers = masks.filter(|&mask| mask != 0);
    let Some(first) = writers.next() else {
        return false;
    };
    candidate || writers.any(|mask| mask != first)
}

pub(super) fn register_gradients(
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
