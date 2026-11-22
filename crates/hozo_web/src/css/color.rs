//! Theme colors, resolved or left as an unresolved custom property.

use hozo_ir::{Color, Theme};

/// What `resolve_theme_color` writes for a token nothing defines.
///
/// Spelled once rather than twice because it is load-bearing in two
/// places now: written below, and read by `render_candidate_stylesheet` as
/// its evidence that a *scanned* token was never a utility at all.
pub const UNRESOLVED_COLOR_PREFIX: &str = "var(--hozo-color-";

pub(super) fn resolve_theme_color(color: &Color, theme: &Theme) -> String {
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
