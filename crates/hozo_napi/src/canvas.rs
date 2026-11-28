//! Canvas paint props lowered to color strings.

use hozo_ir::{Color, StyleProperty, Theme, Utf16Offsets};
use napi_derive::napi;

use super::diagnostics::CompileDiagnostic;

#[napi(object)]
pub struct CompiledCanvasPaint {
    /// Complete replacement for the source attribute at this span.
    pub replacement: String,
    pub diagnostics: Vec<CompileDiagnostic>,
    pub span_start: u32,
    pub span_end: u32,
}

pub(super) fn canvas_color(color: &Color, theme: &Theme, native: bool) -> Option<String> {
    hozo_ir::resolve_canvas_color(color, theme, native)
}

pub(super) fn js_string(value: &str) -> String {
    // Rust's debug string escaping is valid JavaScript for the ASCII paint
    // values and class tokens emitted here (quotes, slashes and newlines are
    // escaped rather than pasted into the generated JSX).
    format!("{value:?}")
}

/// Compiles Canvas shape paint utilities without routing Canvas through the
/// semantic/SVG node tree. Each result is one source attribute edit.
#[napi]
pub fn compile_canvas_paints(source: String, native: bool) -> Vec<CompiledCanvasPaint> {
    lower_canvas_paints(&source, &hozo_ir::Theme::default(), native)
}

pub(super) fn lower_canvas_paints(
    source: &str,
    theme: &hozo_ir::Theme,
    native: bool,
) -> Vec<CompiledCanvasPaint> {
    // Built once for the file. The `source.get(..)` below keeps the byte
    // offsets, because it indexes a Rust string; only what crosses into
    // JavaScript is translated.
    let offsets = Utf16Offsets::new(source);
    hozo_parser::parse_canvas_paints_with_theme(source, theme)
        .into_iter()
        .map(|paint| {
            let original = source
                .get(paint.span.start as usize..paint.span.end as usize)
                .unwrap_or("className")
                .to_string();
            let mut diagnostics = Vec::new();
            let replacement = match paint.static_classes {
                None => {
                    diagnostics.push(CompileDiagnostic {
                        code: "CANVAS_CLASS_NOT_LOWERED".to_string(),
                        severity: "warning".to_string(),
                        message: "A dynamic Canvas shape `className` cannot be converted to paint props. Use dynamic `fill`, `stroke`, `strokeWidth` or `opacity` props instead."
                            .to_string(),
                        span_start: offsets.at(paint.span.start),
                        span_end: offsets.at(paint.span.end),
                    });
                    original
                }
                Some(_) => {
                    if !paint.remaining.is_empty() {
                        diagnostics.push(CompileDiagnostic {
                            code: "CANVAS_CLASS_NOT_LOWERED".to_string(),
                            severity: "warning".to_string(),
                            message: format!(
                                "These Canvas shape classes do not map to paint props and have no pixel target: {}. Canvas shapes currently accept fill, stroke, stroke width and opacity utilities.",
                                paint.remaining.join(", ")
                            ),
                            span_start: offsets.at(paint.span.start),
                            span_end: offsets.at(paint.span.end),
                        });
                    }
                    if paint.paint.is_empty() {
                        original
                    } else {
                        let mut attributes = Vec::new();
                        if !paint.remaining.is_empty() {
                            attributes.push(format!(
                                "className={}",
                                js_string(&paint.remaining.join(" "))
                            ));
                        }
                        for property in paint.paint {
                            match property {
                                StyleProperty::Fill(color) => {
                                    if let Some(resolved) = canvas_color(&color, theme, native) {
                                        attributes.push(format!("fill={}", js_string(&resolved)));
                                    }
                                }
                                StyleProperty::Stroke(color) => {
                                    if let Some(resolved) = canvas_color(&color, theme, native) {
                                        attributes.push(format!("stroke={}", js_string(&resolved)));
                                    }
                                }
                                StyleProperty::StrokeWidth(width) => {
                                    if let Some(px) = width.px(theme) {
                                        attributes.push(format!("strokeWidth={{{px}}}"))
                                    }
                                }
                                StyleProperty::Opacity(opacity) => {
                                    attributes.push(format!("opacity={{{opacity}}}"))
                                }
                                _ => {}
                            }
                        }
                        attributes.join(" ")
                    }
                }
            };
            CompiledCanvasPaint {
                replacement,
                diagnostics,
                span_start: offsets.at(paint.span.start),
                span_end: offsets.at(paint.span.end),
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use hozo_ir::{Theme, ThemeColor};

    #[test]
    fn resolves_canvas_color_alpha_modifiers_on_web_and_native() {
        let source = r#"
            import { Canvas } from '@hozo/canvas'
            const el = <Canvas.Rect className="fill-blue-500/50 stroke-black/25" width={10} height={10} />
        "#;
        let web = lower_canvas_paints(source, &Theme::default(), false);
        assert_eq!(web.len(), 1);
        assert!(web[0].diagnostics.is_empty());
        assert_eq!(
            web[0].replacement,
            r#"fill="oklch(62.3% 0.214 259.815 / 0.5)" stroke="rgba(0, 0, 0, 0.25)""#
        );

        let native = lower_canvas_paints(source, &Theme::default(), true);
        assert_eq!(native.len(), 1);
        assert!(native[0].diagnostics.is_empty());
        assert_eq!(
            native[0].replacement,
            r#"fill="rgba(43, 127, 255, 0.5)" stroke="rgba(0, 0, 0, 0.25)""#
        );
    }

    #[test]
    fn refuses_unknown_and_inherited_canvas_color_tokens() {
        let source = r#"
            import { Canvas } from '@hozo/canvas'
            const el = <Canvas.Rect className="fill-unknown-999 stroke-brand/50 fill-current stroke-inherit" width={10} height={10} />
        "#;
        for native in [false, true] {
            let edits = lower_canvas_paints(source, &Theme::default(), native);
            assert_eq!(edits.len(), 1);
            assert_eq!(edits[0].diagnostics.len(), 1);
            assert_eq!(edits[0].diagnostics[0].code, "CANVAS_CLASS_NOT_LOWERED");
            assert!(!edits[0].replacement.contains("hozo-unresolved:"));
            assert!(!edits[0].replacement.contains("var(--hozo-color-"));
        }
    }

    #[test]
    fn resolves_custom_theme_colors_with_and_without_alpha_on_canvas() {
        let theme = Theme::new(
            std::collections::HashMap::from([(
                "brand".to_string(),
                ThemeColor {
                    oklch: "oklch(60% 0.2 250)".to_string(),
                    hex: "#112233".to_string(),
                },
            )]),
            None,
            false,
        );
        let source = r#"
            import { Canvas } from '@hozo/canvas'
            const el = <Canvas.Rect className="fill-brand stroke-brand/40" width={10} height={10} />
        "#;
        let web = lower_canvas_paints(source, &theme, false);
        assert!(web[0].diagnostics.is_empty());
        assert_eq!(
            web[0].replacement,
            r#"fill="oklch(60% 0.2 250)" stroke="oklch(60% 0.2 250 / 0.4)""#
        );

        let native = lower_canvas_paints(source, &theme, true);
        assert!(native[0].diagnostics.is_empty());
        assert_eq!(
            native[0].replacement,
            r##"fill="#112233" stroke="rgba(17, 34, 51, 0.4)""##
        );
    }
}
