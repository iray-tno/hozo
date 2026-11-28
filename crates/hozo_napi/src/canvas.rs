//! Canvas paint props lowered to color strings.

use hozo_ir::{Color, StyleProperty, Theme, Utf16Offsets};
use hozo_parser::CanvasShapeKind;
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

fn shape_dynamic_message(shape: CanvasShapeKind) -> &'static str {
    match shape {
        CanvasShapeKind::RoundedRect => {
            "A dynamic Canvas.RoundedRect `className` cannot be converted to shape props. Use dynamic `fill`, `stroke`, `strokeWidth`, `opacity` or `radius` props instead."
        }
        CanvasShapeKind::Group => {
            "A dynamic Canvas.Group `className` cannot be converted to group props. Use dynamic `opacity` or `transform` props instead."
        }
        _ => {
            "A dynamic Canvas shape `className` cannot be converted to paint props. Use dynamic `fill`, `stroke`, `strokeWidth` or `opacity` props instead."
        }
    }
}

fn shape_remaining_message(shape: CanvasShapeKind, remaining: &[String]) -> String {
    match shape {
        CanvasShapeKind::RoundedRect => format!(
            "These Canvas.RoundedRect classes do not map to shape props and have no pixel target: {}. Canvas.RoundedRect accepts fill, stroke, stroke width, opacity and uniform border-radius utilities.",
            remaining.join(", ")
        ),
        CanvasShapeKind::Group => format!(
            "These Canvas.Group classes do not map to group props and have no pixel target: {}. Canvas.Group accepts opacity and 2D translate, scale and rotate utilities.",
            remaining.join(", ")
        ),
        _ => format!(
            "These Canvas shape classes do not map to paint props and have no pixel target: {}. Canvas shapes currently accept fill, stroke, stroke width and opacity utilities.",
            remaining.join(", ")
        ),
    }
}

#[derive(Default)]
struct GroupTransform {
    translate_x: Option<f64>,
    translate_y: Option<f64>,
    scale_x: Option<f64>,
    scale_y: Option<f64>,
    rotate: Option<f64>,
}

impl GroupTransform {
    fn to_jsx_prop(&self) -> Option<String> {
        let mut fields = Vec::new();
        if let Some(x) = self.translate_x {
            fields.push(format!("translateX: {x}"));
        }
        if let Some(y) = self.translate_y {
            fields.push(format!("translateY: {y}"));
        }
        if let Some(sx) = self.scale_x {
            fields.push(format!("scaleX: {sx}"));
        }
        if let Some(sy) = self.scale_y {
            fields.push(format!("scaleY: {sy}"));
        }
        if let Some(rotate) = self.rotate {
            fields.push(format!("rotate: {rotate}"));
        }
        (!fields.is_empty()).then(|| format!("transform={{{{ {} }}}}", fields.join(", ")))
    }
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
                        message: shape_dynamic_message(paint.shape).to_string(),
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
                            message: shape_remaining_message(paint.shape, &paint.remaining),
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
                        if paint.shape == CanvasShapeKind::Group {
                            let mut opacity = None;
                            let mut transform = GroupTransform::default();
                            for property in paint.paint {
                                match property {
                                    StyleProperty::Opacity(value) => opacity = Some(value),
                                    StyleProperty::TranslateX(dim) => {
                                        if let Some(px) =
                                            hozo_ir::resolve_canvas_dimension_px(&dim, theme)
                                        {
                                            transform.translate_x = Some(px);
                                        }
                                    }
                                    StyleProperty::TranslateY(dim) => {
                                        if let Some(px) =
                                            hozo_ir::resolve_canvas_dimension_px(&dim, theme)
                                        {
                                            transform.translate_y = Some(px);
                                        }
                                    }
                                    StyleProperty::Translate(values) => {
                                        if let Some(x) = values.first().and_then(|d| {
                                            hozo_ir::resolve_canvas_dimension_px(d, theme)
                                        }) {
                                            transform.translate_x = Some(x);
                                        }
                                        if let Some(y) = values.get(1).and_then(|d| {
                                            hozo_ir::resolve_canvas_dimension_px(d, theme)
                                        }) {
                                            transform.translate_y = Some(y);
                                        }
                                    }
                                    StyleProperty::ScaleX(scale) => {
                                        if let Some(ratio) = scale.ratio() {
                                            transform.scale_x = Some(ratio);
                                        }
                                    }
                                    StyleProperty::ScaleY(scale) => {
                                        if let Some(ratio) = scale.ratio() {
                                            transform.scale_y = Some(ratio);
                                        }
                                    }
                                    StyleProperty::Scale(values) => match values.as_slice() {
                                        [both] => {
                                            if let Some(ratio) = both.ratio() {
                                                transform.scale_x = Some(ratio);
                                                transform.scale_y = Some(ratio);
                                            }
                                        }
                                        [x, y] => {
                                            if let (Some(rx), Some(ry)) = (x.ratio(), y.ratio()) {
                                                transform.scale_x = Some(rx);
                                                transform.scale_y = Some(ry);
                                            }
                                        }
                                        _ => {}
                                    },
                                    StyleProperty::Rotate(angle) => {
                                        if let Some(degrees) = angle.degrees() {
                                            transform.rotate = Some(degrees);
                                        }
                                    }
                                    StyleProperty::TranslateNone => {
                                        transform.translate_x = Some(0.0);
                                        transform.translate_y = Some(0.0);
                                    }
                                    StyleProperty::ScaleNone => {
                                        transform.scale_x = Some(1.0);
                                        transform.scale_y = Some(1.0);
                                    }
                                    StyleProperty::RotateNone => {
                                        transform.rotate = Some(0.0);
                                    }
                                    StyleProperty::TransformNone => {
                                        transform.translate_x = Some(0.0);
                                        transform.translate_y = Some(0.0);
                                        transform.scale_x = Some(1.0);
                                        transform.scale_y = Some(1.0);
                                        transform.rotate = Some(0.0);
                                    }
                                    _ => {}
                                }
                            }
                            if let Some(opacity) = opacity {
                                attributes.push(format!("opacity={{{opacity}}}"));
                            }
                            if let Some(transform_prop) = transform.to_jsx_prop() {
                                attributes.push(transform_prop);
                            }
                        } else {
                            for property in paint.paint {
                                match property {
                                    StyleProperty::Fill(color) => {
                                        if let Some(resolved) = canvas_color(&color, theme, native)
                                        {
                                            attributes
                                                .push(format!("fill={}", js_string(&resolved)));
                                        }
                                    }
                                    StyleProperty::Stroke(color) => {
                                        if let Some(resolved) = canvas_color(&color, theme, native)
                                        {
                                            attributes
                                                .push(format!("stroke={}", js_string(&resolved)));
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
                                    StyleProperty::BorderRadius(radius) => {
                                        if let Some(px) =
                                            hozo_ir::resolve_canvas_radius_px(&radius, theme)
                                        {
                                            attributes.push(format!("radius={{{px}}}"))
                                        }
                                    }
                                    _ => {}
                                }
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

    #[test]
    fn lowers_uniform_radius_on_rounded_rect_only() {
        let source = r#"
            import { Canvas } from '@hozo/canvas'
            const a = <Canvas.RoundedRect className="fill-blue-500 rounded-lg" width={20} height={10} />
            const b = <Canvas.RoundedRect className="rounded-full rounded-[2rem]" width={20} height={10} />
            const c = <Canvas.RoundedRect className="rounded-t-lg rounded-[50%]" width={20} height={10} />
            const d = <Canvas.Rect className="rounded-lg" width={20} height={10} />
        "#;
        let edits = lower_canvas_paints(source, &Theme::default(), true);
        assert_eq!(edits.len(), 4);
        assert!(edits[0].diagnostics.is_empty());
        assert_eq!(edits[0].replacement, r##"fill="#2b7fff" radius={8}"##);
        assert!(edits[1].diagnostics.is_empty());
        assert_eq!(edits[1].replacement, "radius={32}");
        assert_eq!(edits[2].diagnostics.len(), 1);
        assert_eq!(edits[3].diagnostics.len(), 1);
    }

    #[test]
    fn lowers_opacity_and_2d_transforms_on_canvas_group() {
        let source = r#"
            import { Canvas } from '@hozo/canvas'
            const a = <Canvas.Group className="opacity-50 translate-x-4 -translate-y-2 scale-110 scale-x-50 rotate-45"><Canvas.Rect width={10} height={10} /></Canvas.Group>
            const b = <Canvas.Group className="rotate-45 rotate-none scale-110 scale-none"><Canvas.Rect width={10} height={10} /></Canvas.Group>
            const c = <Canvas.Group className="fill-blue-500 translate-x-1/2 skew-x-6 scale-z-50 rotate-x-45"><Canvas.Rect width={10} height={10} /></Canvas.Group>
        "#;
        let edits = lower_canvas_paints(source, &Theme::default(), true);
        assert_eq!(edits.len(), 3);
        assert!(edits[0].diagnostics.is_empty());
        assert_eq!(
            edits[0].replacement,
            "opacity={0.5} transform={{ translateX: 16, translateY: -8, scaleX: 0.5, scaleY: 1.1, rotate: 45 }}"
        );
        assert!(edits[1].diagnostics.is_empty());
        assert_eq!(
            edits[1].replacement,
            "transform={{ scaleX: 1, scaleY: 1, rotate: 0 }}"
        );
        assert_eq!(edits[2].diagnostics.len(), 1);
        assert_eq!(edits[2].diagnostics[0].code, "CANVAS_CLASS_NOT_LOWERED");
    }
}
