//! Environment and width conditions React Native can answer.

use hozo_ir::{Condition, Environment};

/// Tailwind's name for an environment query, for the message and the
/// style-entry suffix.
/// The queries React Native can answer, and only those.
///
/// `contrast-less` is absent because neither platform has the setting:
/// iOS and Android both expose an *increase* contrast toggle and no
/// counterpart, so there is nothing to report. A printer, a
/// scripting-disabled page and Windows' forced-colours mode have no
/// meaning on a device at all.
///
/// `contrast-more` used to be absent beside it, on the stated grounds
/// that React Native's nearest was Android's high-contrast *text*
/// setting. That was half the surface: iOS reports Increase Contrast
/// through `isDarkerSystemColorsEnabled`, which is the same OS setting
/// Safari writes `prefers-contrast: more` from.
pub(super) fn native_environment(query: Environment) -> Option<Environment> {
    matches!(
        query,
        Environment::MotionReduce
            | Environment::MotionSafe
            | Environment::Portrait
            | Environment::Landscape
            | Environment::InvertedColors
            | Environment::Ltr
            | Environment::Rtl
            // The four React Native reports and Tailwind has no name for.
            // Three of them are iOS settings, which is the same shape
            // `inverted-colors` already has: absent on Android is a value
            // of `false` rather than an error, and a style that does not
            // fire on a platform without the setting is correct.
            | Environment::ReduceTransparency
            | Environment::BoldText
            | Environment::Grayscale
            | Environment::ScreenReader
            // Two settings behind one query, which none of the others
            // needs: iOS's Increase Contrast and Android's high-contrast
            // text. See `useHozoEnvironment` for why they are read as two
            // facts and combined rather than written into one store.
            | Environment::ContrastMore
    )
    .then_some(query)
}

pub(super) fn environment_unwired_message(query: Environment) -> String {
    format!(
        "`{}:` has no React Native equivalent, so the style is not applied there. On Web the same class works from a media query.",
        environment_name(query)
    )
}

pub(super) fn environment_name(query: Environment) -> &'static str {
    match query {
        Environment::MotionReduce => "motion-reduce",
        Environment::MotionSafe => "motion-safe",
        Environment::Portrait => "portrait",
        Environment::Landscape => "landscape",
        Environment::InvertedColors => "inverted-colors",
        Environment::Ltr => "ltr",
        Environment::Rtl => "rtl",
        Environment::ContrastMore => "contrast-more",
        Environment::ContrastLess => "contrast-less",
        Environment::ForcedColors => "forced-colors",
        Environment::Print => "print",
        Environment::Noscript => "noscript",
        Environment::PointerFine => "pointer-fine",
        Environment::PointerCoarse => "pointer-coarse",
        Environment::PointerNone => "pointer-none",
        Environment::AnyPointerFine => "any-pointer-fine",
        Environment::AnyPointerCoarse => "any-pointer-coarse",
        Environment::AnyPointerNone => "any-pointer-none",
        Environment::ReduceTransparency => "reduce-transparency",
        Environment::BoldText => "bold-text",
        Environment::Grayscale => "grayscale",
        Environment::ScreenReader => "screen-reader",
    }
}

/// Only the width predicate is transparent through negation. Discover its
/// query boundary without also treating an unwired condition as supported.
pub(super) fn uses_container_width(condition: &Condition) -> bool {
    match condition {
        Condition::Container { .. } => true,
        Condition::Not(inner) => uses_container_width(inner),
        _ => false,
    }
}

/// The pixel threshold a `Condition::Width` names, if React Native can be
/// asked about it.
///
/// `None` for a unit that has no fixed pixel value on a device -- `rem`
/// has no root font size to resolve against, and a viewport unit compared
/// against the viewport is a question that answers itself. Reported by
/// name rather than approximated: guessing 16px per rem would silently
/// disagree with the browser for anyone who changed their font size,
/// which is precisely the reader this project is for.
pub(super) fn width_threshold_px(value: &str) -> Option<u32> {
    let digits = value.strip_suffix("px")?;
    digits.parse::<f64>().ok().map(|px| px.round() as u32)
}
