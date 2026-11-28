//! Colours resolved against the theme, to the hex React Native understands.

use super::*;

/// Resolves against the default Tailwind palette where possible (see module
/// docs); otherwise falls back to a marker string deliberately not
/// real-color-shaped, so a missed resolution fails loudly instead of
/// rendering a plausible-but-wrong color.
pub(crate) fn resolve_theme_color(color: &Color, theme: &Theme) -> String {
    let token = match color {
        Color::Token(token) => token,
        Color::Keyword(keyword) => return js_string(keyword),
        // Written out rather than named, so there is nothing to resolve.
        // Whether React Native can actually read it is a separate question
        // and asked separately -- `native_color_reason` refuses the ones it
        // can't before anything reaches here.
        Color::Css(text) => return js_string(text),
    };
    // Split before the lookup: the opacity modifier is part of the class,
    // not part of the token Tailwind's palette defines. Left joined,
    // `blue-500/50` matched nothing and produced the marker below -- an
    // unparseable string reaching a React Native style object, with no
    // diagnostic, which is the silent-wrong-answer case this file's own
    // header says the marker exists to prevent.
    let (token, alpha) = hozo_ir::split_color_alpha(token);
    let resolved = match theme.color(token) {
        Some(resolved) => resolved.hex,
        // Not in the project's theme either. Still deliberately not
        // colour-shaped, so a missed resolution fails loudly rather than
        // rendering something plausible.
        None => return format!("'hozo-unresolved:{token}'"),
    };
    match alpha {
        None => js_string(&resolved),
        // `color-mix` is CSS; React Native has no equivalent, so the alpha
        // is folded into the colour itself. `rgba()` rather than an
        // eight-digit hex because React Native accepts both and this one
        // survives a glance in a style object.
        Some(alpha) => match rgb_channels(&resolved) {
            Some((r, g, b)) => js_string(&format!("rgba({r}, {g}, {b}, {alpha})")),
            // A theme colour that is not a hex triple -- a project can put
            // anything in `--color-*`. Refusing here rather than emitting
            // half of it.
            None => format!("'hozo-unresolved:{token}/{}'", alpha * 100.0),
        },
    }
}

/// The three channels of a `#rrggbb`, which is the shape both the palette
/// and `@hozo/tailwind`'s theme extraction produce.
pub(super) fn rgb_channels(hex: &str) -> Option<(u8, u8, u8)> {
    hozo_ir::hex_rgb_channels(hex)
}

/// A placeholder colour as `placeholderTextColor` wants it -- the same
/// resolution every other colour gets, since it is an ordinary colour that
/// happens to travel as a prop.
pub fn placeholder_color(color: &Color, theme: &Theme) -> String {
    resolve_theme_color(color, theme)
}
