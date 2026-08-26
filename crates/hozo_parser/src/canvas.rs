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
const PAINTED_SHAPES: &[&str] = &["Rect", "RoundedRect", "Circle", "Ellipse", "Line", "Path"];

#[derive(Debug, Clone, PartialEq)]
pub struct CanvasClassPaint {
    /// The complete `className=...` attribute, ready to replace in source.
    pub span: SourceSpan,
    /// `None` means the value is dynamic and cannot be compiled safely.
    pub static_classes: Option<Vec<String>>,
    pub paint: Vec<StyleProperty>,
    /// Static classes that do not map to a Canvas paint prop.
    pub remaining: Vec<String>,
}

struct CanvasCollector {
    namespaces: HashSet<String>,
    paints: Vec<CanvasClassPaint>,
}

impl<'a> Visit<'a> for CanvasCollector {
    fn visit_jsx_element(&mut self, element: &JSXElement<'a>) {
        let JSXElementName::MemberExpression(member) = &element.opening_element.name else {
            walk_jsx_element(self, element);
            return;
        };
        let Some(object) = member.object.get_identifier() else {
            walk_jsx_element(self, element);
            return;
        };
        if !self.namespaces.contains(object.name.as_str())
            || !PAINTED_SHAPES.contains(&member.property.name.as_str())
        {
            walk_jsx_element(self, element);
            return;
        }

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
                    static_classes: None,
                    paint: Vec::new(),
                    remaining: Vec::new(),
                });
                continue;
            };

            let classes: Vec<String> = value.split_ascii_whitespace().map(str::to_string).collect();
            let mut paint = Vec::new();
            let mut remaining = Vec::new();
            for token in &classes {
                let (condition, properties) = tailwind::expand_utility(token);
                let is_paint = condition == Condition::Always
                    && !properties.is_empty()
                    && properties.iter().all(|property| {
                        matches!(
                            property,
                            StyleProperty::Fill(_)
                                | StyleProperty::Stroke(_)
                                | StyleProperty::StrokeWidth(_)
                                | StyleProperty::Opacity(_)
                        )
                    });
                if is_paint {
                    paint.extend(properties);
                } else {
                    remaining.push(token.clone());
                }
            }
            self.paints.push(CanvasClassPaint {
                span: SourceSpan {
                    start: attribute.span().start,
                    end: attribute.span().end,
                },
                static_classes: Some(classes),
                paint: dedupe_last_wins(paint),
                remaining,
            });
        }

        // Custom components, fragments and expressions inside the Canvas
        // tree remain ordinary React. Keep walking so a nested shape still
        // gets its paint compiled.
        walk_jsx_element(self, element);
    }
}

/// Finds paint-bearing shape attributes from a trusted `@hozo/canvas` import.
pub fn parse_canvas_paints(source_text: &str) -> Vec<CanvasClassPaint> {
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
                StyleProperty::StrokeWidth(2.0),
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
}
