//! Canvas-specific TSX analysis.
//!
//! Canvas is intentionally not represented as `hozo_ir::Node`: pixels do
//! not have DOM semantics, and the retained scene has different composition
//! and interaction rules from SVG. This small side channel recognizes only
//! paint classes on `@hozo/canvas` shape members and returns source edits to
//! the JS integration. Layout and semantic lowering remain untouched.

use std::collections::HashSet;

use hozo_ir::{dedupe_last_wins, Condition, SourceSpan, StyleProperty};
use oxc_allocator::Allocator;
use oxc_ast::ast::{
    JSXAttributeItem, JSXAttributeName, JSXAttributeValue, JSXElement, JSXElementName,
    JSXExpression,
};
use oxc_ast_visit::{walk::walk_jsx_element, Visit};
use oxc_parser::Parser;
use oxc_span::{GetSpan, SourceType};

use crate::tailwind;

const CANVAS_MODULE: &str = "@hozo/canvas";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CanvasShapeKind {
    Rect,
    RoundedRect,
    Circle,
    Ellipse,
    Line,
    Path,
    Text,
    Group,
}

impl CanvasShapeKind {
    fn from_member(name: &str) -> Option<Self> {
        Some(match name {
            "Rect" => Self::Rect,
            "RoundedRect" => Self::RoundedRect,
            "Circle" => Self::Circle,
            "Ellipse" => Self::Ellipse,
            "Line" => Self::Line,
            "Path" => Self::Path,
            "Text" => Self::Text,
            "Group" => Self::Group,
            _ => return None,
        })
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct CanvasClassPaint {
    /// The complete `className=...` attribute, ready to replace in source.
    pub span: SourceSpan,
    /// Which `@hozo/canvas` member element carried the `className`.
    pub shape: CanvasShapeKind,
    /// `None` means the value is dynamic and cannot be compiled safely.
    pub static_classes: Option<Vec<String>>,
    pub paint: Vec<StyleProperty>,
    /// Static classes that do not map to a Canvas prop on this shape.
    pub remaining: Vec<String>,
}

fn supports_canvas_color(color: &hozo_ir::Color, theme: &hozo_ir::Theme) -> bool {
    hozo_ir::resolve_canvas_color(color, theme, false).is_some()
        && hozo_ir::resolve_canvas_color(color, theme, true).is_some()
}

fn accept_shape_properties(
    shape: CanvasShapeKind,
    properties: Vec<StyleProperty>,
    theme: &hozo_ir::Theme,
    text_has_font_size: bool,
) -> Option<Vec<StyleProperty>> {
    if properties.is_empty() {
        return None;
    }
    match shape {
        CanvasShapeKind::Group => {
            // Reject 3D scale utilities (`scale-z-*`, `scale-3d`), while keeping
            // uniform `scale-*` (`[ScaleX, ScaleY, ScaleZ]` without `Scale3d`)
            // as its 2D `scaleX`/`scaleY` pair.
            if properties
                .iter()
                .any(|property| matches!(property, StyleProperty::Scale3d))
            {
                return None;
            }
            if let [StyleProperty::ScaleX(sx), StyleProperty::ScaleY(sy), StyleProperty::ScaleZ(_)] =
                properties.as_slice()
            {
                return (sx.ratio().is_some() && sy.ratio().is_some()).then(|| {
                    vec![
                        StyleProperty::ScaleX(sx.clone()),
                        StyleProperty::ScaleY(sy.clone()),
                    ]
                });
            }
            let supported = properties.iter().all(|property| match property {
                StyleProperty::Opacity(_) => true,
                StyleProperty::TranslateX(dim) | StyleProperty::TranslateY(dim) => {
                    hozo_ir::resolve_canvas_dimension_px(dim, theme).is_some()
                }
                StyleProperty::Translate(values) => {
                    matches!(values.len(), 1 | 2)
                        && values
                            .iter()
                            .all(|dim| hozo_ir::resolve_canvas_dimension_px(dim, theme).is_some())
                }
                StyleProperty::ScaleX(scale) | StyleProperty::ScaleY(scale) => {
                    scale.ratio().is_some()
                }
                StyleProperty::Scale(values) => {
                    matches!(values.len(), 1 | 2)
                        && values.iter().all(|scale| scale.ratio().is_some())
                }
                StyleProperty::Rotate(angle) => angle.degrees().is_some(),
                StyleProperty::TranslateNone
                | StyleProperty::ScaleNone
                | StyleProperty::RotateNone
                | StyleProperty::TransformNone => true,
                _ => false,
            });
            supported.then_some(properties)
        }
        CanvasShapeKind::Text => {
            let mut normalized = Vec::with_capacity(properties.len());
            for property in properties {
                match property {
                    StyleProperty::Fill(color) | StyleProperty::TextColor(color)
                        if supports_canvas_color(&color, theme) =>
                    {
                        normalized.push(StyleProperty::Fill(color));
                    }
                    StyleProperty::Stroke(color) if supports_canvas_color(&color, theme) => {
                        normalized.push(StyleProperty::Stroke(color));
                    }
                    StyleProperty::Opacity(value) => {
                        normalized.push(StyleProperty::Opacity(value));
                    }
                    StyleProperty::StrokeWidth(width) if width.px(theme).is_some() => {
                        normalized.push(StyleProperty::StrokeWidth(width));
                    }
                    StyleProperty::FontSize(length)
                        if hozo_ir::resolve_canvas_length_px(&length, theme)
                            .is_some_and(|px| px > 0.0) =>
                    {
                        normalized.push(StyleProperty::FontSize(length));
                    }
                    StyleProperty::FontFamily(family)
                        if hozo_ir::resolve_canvas_font_family(&family, theme, false).is_some()
                            && hozo_ir::resolve_canvas_font_family(&family, theme, true)
                                .is_some() =>
                    {
                        normalized.push(StyleProperty::FontFamily(family));
                    }
                    StyleProperty::FontWeight(weight) if weight.native(theme).is_some() => {
                        normalized.push(StyleProperty::FontWeight(weight));
                    }
                    StyleProperty::Arbitrary(ref name, ref value) if name == "font-weight" => {
                        let weight = hozo_ir::resolve_canvas_font_weight_literal(value)?;
                        normalized.push(StyleProperty::FontWeight(hozo_ir::FontWeight::Absolute(
                            weight,
                        )));
                    }
                    StyleProperty::Keyword("font-style", value @ ("italic" | "normal")) => {
                        normalized.push(StyleProperty::Keyword("font-style", value));
                    }
                    StyleProperty::TextAlign(
                        align @ (hozo_ir::TextAlign::Left
                        | hozo_ir::TextAlign::Center
                        | hozo_ir::TextAlign::Right),
                    ) => {
                        normalized.push(StyleProperty::TextAlign(align));
                    }
                    StyleProperty::LineHeight(hozo_ir::LineHeight::Ratio(ratio))
                        if ratio.is_finite() && ratio > 0.0 =>
                    {
                        normalized
                            .push(StyleProperty::LineHeight(hozo_ir::LineHeight::Ratio(ratio)));
                    }
                    StyleProperty::LineHeight(hozo_ir::LineHeight::FontDefault(length))
                        if text_has_font_size
                            && hozo_ir::resolve_canvas_length_px(&length, theme)
                                .is_some_and(|px| px > 0.0) =>
                    {
                        normalized.push(StyleProperty::LineHeight(
                            hozo_ir::LineHeight::FontDefault(length),
                        ));
                    }
                    StyleProperty::LineHeight(hozo_ir::LineHeight::Length(length))
                        if text_has_font_size
                            && hozo_ir::resolve_canvas_length_px(&length, theme)
                                .is_some_and(|px| px > 0.0) =>
                    {
                        normalized.push(StyleProperty::LineHeight(hozo_ir::LineHeight::Length(
                            length,
                        )));
                    }
                    StyleProperty::MaxWidth(dim)
                        if hozo_ir::resolve_canvas_dimension_px(&dim, theme)
                            .is_some_and(|px| px >= 0.0) =>
                    {
                        normalized.push(StyleProperty::MaxWidth(dim));
                    }
                    _ => return None,
                }
            }
            Some(normalized)
        }
        _ => {
            let supported = properties.iter().all(|property| match property {
                StyleProperty::Fill(color) | StyleProperty::Stroke(color) => {
                    supports_canvas_color(color, theme)
                }
                StyleProperty::Opacity(_) => true,
                StyleProperty::StrokeWidth(width) => width.px(theme).is_some(),
                StyleProperty::BorderRadius(radius) if shape == CanvasShapeKind::RoundedRect => {
                    hozo_ir::resolve_canvas_radius_px(radius, theme).is_some()
                }
                _ => false,
            });
            supported.then_some(properties)
        }
    }
}

struct CanvasCollector<'t> {
    namespaces: HashSet<String>,
    theme: &'t hozo_ir::Theme,
    paints: Vec<CanvasClassPaint>,
}

impl<'a> Visit<'a> for CanvasCollector<'_> {
    fn visit_jsx_element(&mut self, element: &JSXElement<'a>) {
        let JSXElementName::MemberExpression(member) = &element.opening_element.name else {
            walk_jsx_element(self, element);
            return;
        };
        let Some(object) = member.object.get_identifier() else {
            walk_jsx_element(self, element);
            return;
        };
        let Some(shape) = self
            .namespaces
            .contains(object.name.as_str())
            .then(|| CanvasShapeKind::from_member(member.property.name.as_str()))
            .flatten()
        else {
            walk_jsx_element(self, element);
            return;
        };

        for item in &element.opening_element.attributes {
            let JSXAttributeItem::Attribute(attribute) = item else {
                continue;
            };
            let JSXAttributeName::Identifier(name) = &attribute.name else {
                continue;
            };
            if name.name.as_str() != "className" {
                continue;
            }

            let static_value = match &attribute.value {
                Some(JSXAttributeValue::StringLiteral(literal)) => Some(literal.value.as_str()),
                Some(JSXAttributeValue::ExpressionContainer(container)) => {
                    match &container.expression {
                        JSXExpression::StringLiteral(literal) => Some(literal.value.as_str()),
                        _ => None,
                    }
                }
                _ => None,
            };
            let Some(value) = static_value else {
                self.paints.push(CanvasClassPaint {
                    span: SourceSpan {
                        start: attribute.span().start,
                        end: attribute.span().end,
                    },
                    shape,
                    static_classes: None,
                    paint: Vec::new(),
                    remaining: Vec::new(),
                });
                continue;
            };

            let classes: Vec<String> = value.split_ascii_whitespace().map(str::to_string).collect();
            let expanded: Vec<(Condition, Vec<StyleProperty>)> = classes
                .iter()
                .map(|token| tailwind::expand_utility(token))
                .collect();
            // `Canvas.Text.lineHeight` is a multiple of `fontSize`, so pixel
            // line heights (`leading-6`, `text-lg`'s default, `text-lg/7`) can
            // only be converted when this `className` also resolves `fontSize`.
            let text_has_font_size = shape == CanvasShapeKind::Text
                && expanded.iter().any(|(condition, properties)| {
                    *condition == Condition::Always
                        && properties.iter().any(|property| {
                            matches!(
                                property,
                                StyleProperty::FontSize(length)
                                    if hozo_ir::resolve_canvas_length_px(length, self.theme)
                                        .is_some_and(|px| px > 0.0)
                            )
                        })
                });
            let mut paint = Vec::new();
            let mut remaining = Vec::new();
            for (token, (condition, properties)) in classes.iter().zip(expanded) {
                if condition == Condition::Always {
                    if let Some(accepted) =
                        accept_shape_properties(shape, properties, self.theme, text_has_font_size)
                    {
                        paint.extend(accepted);
                        continue;
                    }
                }
                remaining.push(token.clone());
            }
            // Group transforms fold authored resets (`rotate-45 rotate-none`,
            // `scale-110 scale-none`) in source order rather than deduping by
            // enum variant.
            let paint = if shape == CanvasShapeKind::Group {
                paint
            } else {
                dedupe_last_wins(paint)
            };
            self.paints.push(CanvasClassPaint {
                span: SourceSpan {
                    start: attribute.span().start,
                    end: attribute.span().end,
                },
                shape,
                static_classes: Some(classes),
                paint,
                remaining,
            });
        }

        // Custom components, fragments and expressions inside the Canvas
        // tree remain ordinary React. Keep walking so a nested shape still
        // gets its paint compiled.
        walk_jsx_element(self, element);
    }
}

/// Finds paint-bearing shape attributes from a trusted `@hozo/canvas` import,
/// validating tokens against Tailwind's default theme.
pub fn parse_canvas_paints(source_text: &str) -> Vec<CanvasClassPaint> {
    parse_canvas_paints_with_theme(source_text, &hozo_ir::Theme::default())
}

/// Finds paint-bearing shape attributes from a trusted `@hozo/canvas` import,
/// validating theme colour tokens and spacing-backed lengths against `theme`.
pub fn parse_canvas_paints_with_theme(
    source_text: &str,
    theme: &hozo_ir::Theme,
) -> Vec<CanvasClassPaint> {
    let allocator = Allocator::default();
    let source_type = SourceType::from_extension("tsx").expect("tsx is a known extension");
    let parsed = Parser::new(&allocator, source_text, source_type).parse();
    let namespaces: HashSet<String> = parsed
        .module_record
        .import_entries
        .iter()
        .filter(|entry| !entry.is_type && entry.module_request.name.as_str() == CANVAS_MODULE)
        .map(|entry| entry.local_name.name.to_string())
        .collect();
    if namespaces.is_empty() {
        return Vec::new();
    }

    let mut collector = CanvasCollector {
        namespaces,
        theme,
        paints: Vec::new(),
    };
    collector.visit_program(&parsed.program);
    collector.paints
}

#[cfg(test)]
mod tests {
    use super::*;
    use hozo_ir::{Color, StyleProperty};

    #[test]
    fn collects_only_members_of_the_imported_canvas_namespace() {
        let source = r#"
            import { Canvas as Drawing } from '@hozo/canvas'
            const chart = <Drawing.Rect className="fill-blue-500 stroke-red-500 stroke-2 opacity-50 rounded" width={20} height={10} />
            const foreign = <Chart.Rect className="fill-green-500" />
        "#;
        let paints = parse_canvas_paints(source);
        assert_eq!(paints.len(), 1);
        assert_eq!(paints[0].remaining, vec!["rounded"]);
        assert_eq!(
            paints[0].paint,
            vec![
                StyleProperty::Fill(Color::Token("blue-500".to_string())),
                StyleProperty::Stroke(Color::Token("red-500".to_string())),
                StyleProperty::StrokeWidth(hozo_ir::StrokeWidth::Number(2.0)),
                StyleProperty::Opacity(0.5),
            ]
        );
    }

    #[test]
    fn reports_dynamic_classes_without_trying_to_evaluate_them() {
        let source = r#"
            import { Canvas } from '@hozo/canvas'
            const chart = <Canvas.Circle className={selected ? 'fill-blue-500' : 'fill-gray-500'} cx={5} cy={5} radius={5} />
        "#;
        let paints = parse_canvas_paints(source);
        assert_eq!(paints.len(), 1);
        assert_eq!(paints[0].static_classes, None);
        assert!(paints[0].paint.is_empty());
    }

    #[test]
    fn refuses_unresolvable_and_invalid_arbitrary_canvas_colors() {
        let source = r#"
            import { Canvas } from '@hozo/canvas'
            const chart = <Canvas.Rect className="fill-[#ff0000] stroke-[rgb(0_0_0)] stroke-[2rem] opacity-[50%] fill-[var(--x)] fill-[calc(100%-2rem)] fill-[nonsense] fill-[10px] stroke-[auto] stroke-[var(--x)]" />
        "#;
        let paints = parse_canvas_paints(source);
        assert_eq!(paints.len(), 1);
        assert_eq!(
            paints[0].paint,
            vec![
                StyleProperty::Fill(Color::Css("#ff0000".to_string())),
                StyleProperty::Stroke(Color::Css("rgb(0 0 0)".to_string())),
                StyleProperty::StrokeWidth(hozo_ir::StrokeWidth::Length(hozo_ir::Length::Unit(
                    2.0,
                    hozo_ir::LengthUnit::Rem
                ))),
                StyleProperty::Opacity(0.5),
            ]
        );
        assert_eq!(
            paints[0].remaining,
            vec![
                "fill-[var(--x)]",
                "fill-[calc(100%-2rem)]",
                "fill-[nonsense]",
                "fill-[10px]",
                "stroke-[auto]",
                "stroke-[var(--x)]",
            ]
        );
    }
}
