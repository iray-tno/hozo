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

pub(super) fn canvas_color(color: &Color, theme: &Theme, native: bool) -> String {
    match color {
        Color::Keyword(keyword) => keyword.to_string(),
        Color::Css(value) => value.clone(),
        Color::Token(token) => theme.color(token).map_or_else(
            || {
                if native {
                    format!("hozo-unresolved:{token}")
                } else {
                    format!("var(--hozo-color-{token})")
                }
            },
            |resolved| if native { resolved.hex } else { resolved.oklch },
        ),
    }
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
    hozo_parser::parse_canvas_paints(source)
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
                                StyleProperty::Fill(color) => attributes.push(format!(
                                    "fill={}",
                                    js_string(&canvas_color(&color, theme, native))
                                )),
                                StyleProperty::Stroke(color) => attributes.push(format!(
                                    "stroke={}",
                                    js_string(&canvas_color(&color, theme, native))
                                )),
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
