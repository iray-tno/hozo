//! The theme JS passes in, converted to `hozo_ir::Theme`.

use napi_derive::napi;

/// A project's design tokens, as `@hozo/tailwind` extracts them.
///
/// Colours only for now. The rest of the scales -- spacing, containers,
/// fonts, breakpoints -- are resolved at parse time rather than at
/// lowering, so they need the theme threaded through a different path and
/// are a separate piece of work. Colours are the one that actually breaks
/// a project today: a `--color-brand` in a `@theme` compiled to a CSS
/// variable nothing defined.
#[napi(object)]
pub struct JsTheme {
    /// One spacing step in pixels (Tailwind's `--spacing`, 0.25rem by
    /// default). Absent means the default, which is what every project
    /// that does not change it has.
    pub spacing_px: Option<f64>,
    /// Build-time spellings of a color for CSS/Canvas and React Native.
    pub colors: Vec<JsThemeColor>,
    pub web_colors: Option<Vec<JsWebThemeColor>>,
    pub web_variables: Option<Vec<JsWebThemeVariable>>,
    /// Whether this project ships a CSS reset over the browser’s own
    /// stylesheet -- the resolved `preflight` option, not `usesTailwind`.
    ///
    /// The Native backend has no user-agent stylesheet to match, so it
    /// supplies defaults chosen against a browser; this says which browser
    /// rendering it should match. Absent means no reset, which is what a
    /// caller that has never heard of the question should get (#315).
    pub preflight: Option<bool>,
    /// The project's own animations: `--animate-<name>` and the
    /// `@keyframes` it names (decision 007, slice 3). Tailwind's four are
    /// left out by `@hozo/tailwind`; Hozo has its own.
    pub animations: Option<Vec<JsThemeAnimation>>,
    /// The project's own radius tokens: `--radius-<name>`, resolved to
    /// pixels by `@hozo/tailwind`.
    pub radii: Option<Vec<JsThemeRadius>>,
    /// The project's own shadow tokens: `--shadow-<name>`, as the value its
    /// `var()` chain reaches.
    pub shadows: Option<Vec<JsThemeShadow>>,
    pub font_weights: Option<Vec<JsThemeFontWeight>>,
    /// `--font-<name>`, which `font-sans`, `font-serif` and `font-mono`
    /// read (#1691).
    pub font_families: Option<Vec<JsThemeFontFamily>>,
    pub utility_leading_registers: Option<Vec<JsUtilityLeadingRegister>>,
    /// The selector of the project's `@custom-variant dark (...)`, with `&`
    /// for the element. Absent means `prefers-color-scheme` (#1654).
    pub dark_selector: Option<String>,
}

#[napi(object)]
pub struct JsWebThemeColor {
    pub token: String,
    pub value: String,
    pub dark: Option<String>,
}

#[napi(object)]
pub struct JsWebThemeVariable {
    pub name: String,
    pub value: String,
}

#[napi(object)]
pub struct JsThemeFontWeight {
    pub name: String,
    pub value: String,
}

#[napi(object)]
pub struct JsThemeFontFamily {
    pub name: String,
    /// What a Web rule writes: a `var()` when Tailwind delivers the variable.
    pub web: String,
    /// The declaration's value, for a backend with no CSS variables.
    pub value: String,
}

#[napi(object)]
pub struct JsUtilityLeadingRegister {
    pub name: String,
    pub px: f64,
}

#[napi(object)]
pub struct JsThemeShadow {
    /// `surface`, for `--shadow-surface` and `shadow-surface`.
    pub name: String,
    pub value: String,
}

#[napi(object)]
pub struct JsThemeRadius {
    /// `control`, for `--radius-control` and `rounded-control`.
    pub name: String,
    pub px: f64,
}

#[napi(object)]
pub struct JsThemeAnimation {
    /// `wiggle`, for `--animate-wiggle` and `animate-wiggle`.
    pub name: String,
    /// The `animation` shorthand the theme wrote.
    pub shorthand: String,
    /// The `@keyframes` rule as CSS, for the Web to emit as it is.
    pub keyframes_css: Option<String>,
    /// The same rule's frames, for Native to read into typed properties.
    pub frames: Option<Vec<JsThemeKeyframe>>,
}

#[napi(object)]
pub struct JsThemeKeyframe {
    /// `from`, `50%`, `0%, 100%`.
    pub selector: String,
    /// `[property, value]` pairs, in the order written.
    pub declarations: Vec<Vec<String>>,
}

#[napi(object)]
pub struct JsThemeColor {
    pub token: String,
    pub oklch: String,
    pub hex: String,
    /// What this token becomes under `prefers-color-scheme: dark`.
    ///
    /// Absent for every token a project does not pair, which is all of them
    /// until it writes one. `@hozo/tailwind` reads the pair off the theme's
    /// own entries; see `loadTheme`.
    pub dark: Option<JsThemeColorValue>,
}

#[napi(object)]
pub struct JsThemeColorValue {
    pub oklch: String,
    pub hex: String,
}

pub(super) fn to_theme(theme: Option<JsTheme>) -> hozo_ir::Theme {
    let Some(theme) = theme else {
        return hozo_ir::Theme::default();
    };
    let spacing_px = theme.spacing_px;
    let preflight = theme.preflight.unwrap_or(false);
    let mut colors = std::collections::HashMap::new();
    let mut dark_colors = std::collections::HashMap::new();
    for color in theme.colors {
        if let Some(dark) = color.dark {
            dark_colors.insert(
                color.token.clone(),
                hozo_ir::ThemeColor {
                    oklch: dark.oklch,
                    hex: dark.hex,
                },
            );
        }
        colors.insert(
            color.token,
            hozo_ir::ThemeColor {
                oklch: color.oklch,
                hex: color.hex,
            },
        );
    }
    let mut animations = std::collections::HashMap::new();
    for animation in theme.animations.unwrap_or_default() {
        // Read the way a StyleX keyframe body is. A declaration with no
        // typed form is left out of the Native frames -- the Native backend
        // says which -- and stays in the CSS the Web emits.
        let mut unread = Vec::new();
        let keyframes = animation.frames.map(|frames| hozo_ir::Keyframes {
            name: animation.name.clone(),
            frames: frames
                .into_iter()
                .map(|frame| hozo_ir::Keyframe {
                    selector: frame.selector,
                    properties: frame
                        .declarations
                        .iter()
                        .filter_map(|pair| match pair.as_slice() {
                            [property, value] => {
                                let typed = hozo_parser::css_declaration(property, value);
                                if typed.is_none() {
                                    let declaration = format!("{property}: {value}");
                                    if !unread.contains(&declaration) {
                                        unread.push(declaration);
                                    }
                                }
                                typed
                            }
                            _ => None,
                        })
                        .flatten()
                        .collect(),
                })
                .collect(),
        });
        animations.insert(
            animation.name,
            hozo_ir::ThemeAnimation {
                shorthand: animation.shorthand,
                keyframes_css: animation.keyframes_css,
                keyframes,
                unread,
            },
        );
    }
    let radii = theme
        .radii
        .unwrap_or_default()
        .into_iter()
        .map(|radius| (radius.name, radius.px))
        .collect();
    let font_weights = theme
        .font_weights
        .unwrap_or_default()
        .into_iter()
        .map(|weight| (weight.name, weight.value))
        .collect();
    hozo_ir::Theme::with_dark(colors, dark_colors, spacing_px, preflight)
        .with_animations(animations)
        .with_radii(radii)
        .with_shadows(
            theme
                .shadows
                .unwrap_or_default()
                .into_iter()
                .map(|shadow| (shadow.name, shadow.value))
                .collect(),
        )
        .with_font_weights(font_weights)
        .with_font_families(
            theme
                .font_families
                .unwrap_or_default()
                .into_iter()
                .map(|family| (family.name, (family.web, family.value)))
                .collect(),
        )
        .with_dark_selector(theme.dark_selector)
        .with_utility_leading_registers(
            theme
                .utility_leading_registers
                .unwrap_or_default()
                .into_iter()
                .map(|register| (register.name, register.px))
                .collect(),
        )
        .with_web_colors(
            theme
                .web_colors
                .unwrap_or_default()
                .into_iter()
                .map(|color| (color.token, (color.value, color.dark)))
                .collect(),
        )
        .with_web_variables(
            theme
                .web_variables
                .unwrap_or_default()
                .into_iter()
                .map(|variable| (variable.name, variable.value))
                .collect(),
        )
}
