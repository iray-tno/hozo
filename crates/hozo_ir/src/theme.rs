//! The design tokens a project defines, which Hozo resolves against.
//!
//! Until now Hozo knew exactly one theme: Tailwind's default. That is a
//! reasonable place to start and a bad place to stop, because a project
//! defining `--color-brand` in its `@theme` gets `bg-brand` compiled to
//! `var(--hozo-color-brand)` on Web -- a variable nothing defines -- and
//! to a deliberately-not-a-colour marker on Native. Correct-but-unresolved
//! rather than silently wrong, which was the right call while nothing
//! could resolve it, and is not a substitute for resolving it.
//!
//! Extraction lives in `@hozo/tailwind`, which asks Tailwind itself what
//! the project's tokens are rather than parsing CSS here. This side only
//! holds the answer and looks things up in it.

use std::collections::HashMap;

/// A color resolved to both representations each backend needs: `oklch`
/// is emitted as-is on Web (byte-for-byte what Tailwind's own CSS would
/// produce), `hex` is what Native uses since RN's style system doesn't
/// understand the `oklch()` CSS function.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ThemeColor {
    pub oklch: String,
    pub hex: String,
}

/// A project's resolved design tokens.
///
/// Empty means "the default palette only", which is what every caller got
/// before this existed -- so an absent theme changes nothing rather than
/// turning every colour unresolved.
#[derive(Debug, Clone, PartialEq)]
pub struct Theme {
    colors: HashMap<String, ThemeColor>,
    /// One spacing step in pixels. Tailwind's `--spacing` is 0.25rem, and
    /// the root font size is 16px, so a step is 4px unless a project says
    /// otherwise.
    spacing_px: f64,
    /// Whether the project ships a CSS reset that flattens the browser’s
    /// own stylesheet.
    ///
    /// The Native backend supplies defaults for things React Native has no
    /// user-agent stylesheet for -- heading sizes, the rule a `<hr>` draws.
    /// Every one of them was chosen to match a browser, and *which* browser
    /// rendering depends on this: a project on Tailwind ships its preflight,
    /// which resets `h1`-`h6` to `font-size: inherit; font-weight: inherit`
    /// and turns `<hr>` into a 1px border, and a project without one gets the
    /// user agent’s 32px bold heading and 2px rule.
    ///
    /// Measured, in headless Chrome, with and without this repository’s own
    /// generated preflight:
    ///
    /// ```text
    /// h1     32px / 700     ->  16px / 400
    /// hr     2 tall         ->  1 tall
    /// ```
    ///
    /// So one number baked into the compiler cannot match both, and the
    /// default configuration -- Tailwind, preflight on -- was the one it did
    /// not match: a compiled `<Heading level={1}>` was 16px in the browser
    /// and 28 on a phone (#315).
    ///
    /// It rides on the theme because it is the same shape as the rest of it:
    /// one project-wide fact, resolved once at `buildStart`, crossing the
    /// addon boundary a single time. It follows the *resolved* `preflight`
    /// option rather than `usesTailwind` directly, so it is the author’s
    /// declared choice rather than an inference from whether some unrelated
    /// file happens to contain a utility class.
    preflight: bool,
}

/// Tailwind's own default, and what every caller got before a theme could
/// be supplied.
const DEFAULT_SPACING_PX: f64 = 4.0;

impl Default for Theme {
    fn default() -> Self {
        // No theme means no project, which is every unit test and every
        // caller that has not been told otherwise. `false` is the honest
        // answer there: nothing has said a reset is being shipped.
        Theme { colors: HashMap::new(), spacing_px: DEFAULT_SPACING_PX, preflight: false }
    }
}

impl Theme {
    pub fn new(
        colors: HashMap<String, ThemeColor>,
        spacing_px: Option<f64>,
        preflight: bool,
    ) -> Self {
        Theme { colors, spacing_px: spacing_px.unwrap_or(DEFAULT_SPACING_PX), preflight }
    }

    /// Whether a CSS reset is flattening the browser’s own stylesheet.
    ///
    /// The Native backend asks this before supplying a default the browser
    /// would otherwise have supplied. See the field.
    pub fn preflight(&self) -> bool {
        self.preflight
    }

    pub fn spacing_px(&self) -> f64 {
        self.spacing_px
    }

    /// Resolves a colour token, the project's theme first.
    ///
    /// The project wins over the default palette deliberately: Tailwind
    /// lets a `@theme` redefine `--color-blue-500`, and a compiler that
    /// quietly preferred its own built-in copy would render a colour the
    /// project had explicitly changed.
    pub fn color(&self, token: &str) -> Option<ThemeColor> {
        if let Some(color) = self.colors.get(token) {
            return Some(color.clone());
        }
        crate::colors::resolve_color_token(token).map(|resolved| ThemeColor {
            oklch: resolved.oklch.to_string(),
            hex: resolved.hex.to_string(),
        })
    }

}
