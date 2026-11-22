//! Which suffixes of a color family are not colors, and register colors.

use hozo_ir::Color;

#[derive(Clone, Copy)]
pub(super) enum ColorFamily {
    Background,
    Text,
    Border,
}

/// Whether a `bg-`/`text-`/`border-` suffix is Tailwind's name for
/// something that isn't a colour.
///
/// These families end in a catch-all: whatever the earlier arms declined is
/// treated as a colour token, and an unrecognized one becomes
/// `var(--hozo-color-<token>)` so a project's own theme colour still
/// reaches CSS. That is the right behaviour for `bg-brand-primary`, and
/// quietly wrong for everything else -- `bg-auto` is a background *size*,
/// and it was compiling to `background-color: var(--hozo-color-auto)`, a
/// custom property nothing defines. Inert output, and Hozo claiming the
/// utility while producing it.
///
/// So the catch-all is now guarded by the list below, derived from
/// Tailwind's own class list by asking which entries in each family it does
/// *not* give a colour property to (523 candidates did this). Matching one
/// means "not supported yet", not "not a colour utility Hozo will ever
/// have" -- these are the implementation targets.
pub(super) fn is_non_color_suffix(family: ColorFamily, suffix: &str) -> bool {
    // Without the modifier, because it is not part of the name being
    // classified. Left on, `text-white/70` asked whether `white/70` is a
    // colour, got no for a reason that has nothing to do with colour, and
    // was reported as an unwired utility -- while `bg-blue-500/50` took
    // the other branch and reached the backend as a token nothing could
    // resolve. One class, two different wrong answers.
    let (suffix, _) = hozo_ir::split_color_alpha(suffix);
    let head = suffix.split('-').next().unwrap_or(suffix);
    match family {
        // background-size / -position / -repeat / -attachment / -clip /
        // -origin / -blend-mode, and the gradient constructors.
        ColorFamily::Background => matches!(
            head,
            "auto"
                | "blend"
                | "bottom"
                | "center"
                | "clip"
                | "conic"
                | "contain"
                | "cover"
                | "fixed"
                | "left"
                | "linear"
                | "local"
                | "no"
                | "none"
                | "origin"
                | "radial"
                | "repeat"
                | "right"
                | "scroll"
                | "top"
        ),
        // text-wrap / text-align's logical keywords / text-shadow.
        ColorFamily::Text => {
            matches!(
                head,
                "balance" | "end" | "justify" | "nowrap" | "pretty" | "shadow" | "start" | "wrap"
            )
        }
        ColorFamily::Border => {
            // Table borders, plus the two border-styles the width/style arms
            // above don't recognize.
            if matches!(head, "collapse" | "separate" | "spacing") {
                return true;
            }
            // Anything still carrying a side keyword by the time it reaches
            // the colour catch-all is unsupported. The widths that *are*
            // supported (`border-t-4`) matched an earlier arm and never get
            // here; what's left is per-side colours, which would otherwise
            // become `border-color` -- all four sides, from a token that
            // isn't a colour name (`border-b-red-500` was compiling to
            // `border-color: var(--hozo-color-b-red-500)`) -- plus the
            // logical/axis widths Hozo doesn't lower yet.
            matches!(
                head,
                "t" | "r" | "b" | "l" | "x" | "y" | "s" | "e" | "bs" | "be"
            )
        }
    }
}

/// A colour suffix from one of the register families.
///
/// `initial` is the odd one: Tailwind's `shadow-initial` and its siblings
/// set the register to `initial` so the shadow falls back to its own
/// default, which is not a colour to paint with. Reading it as a palette
/// token produced `var(--hozo-color-initial)` -- a custom property naming
/// something the theme has never heard of, which renders as nothing and
/// says nothing. The same catch-all once turned `placeholder-shown:` into
/// a colour; it swallows whatever the specific forms decline, so anything
/// it can be handed that is not a colour has to be named before it.
pub(super) fn register_color(suffix: &str) -> Color {
    match suffix {
        "initial" => Color::Keyword("initial"),
        _ => Color::Token(suffix.to_string()),
    }
}
