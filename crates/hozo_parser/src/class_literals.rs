//! The class lists a value can be, when they are written in the file.
//!
//! A pattern's secondary class prop that the compiler does not lower --
//! `sheetClassName={sheet}` on a `BottomSheet` -- reaches React Native as a
//! string the runtime resolver reads. The compiler never looked inside it,
//! so a `before:` in it was reported nowhere and drew nothing (#1165). The
//! value is usually a module constant, a template joining two of them, or a
//! ternary between them, all of which the file spells out; this collects
//! those strings so a backend can check the classes in them.
//!
//! Over- rather than under-collecting is safe here: a string that is not a
//! class list (a ternary's condition, a template's partial token) yields no
//! recognized utility and is skipped by whoever reads the result.

use oxc_ast::ast::{
    Argument, ArrayExpressionElement, Expression, JSXAttributeValue, JSXExpression,
};

use crate::rest::ConstantStrings;

/// Every string the attribute's value can contribute to its class list.
pub(crate) fn class_literals(
    value: &Option<JSXAttributeValue>,
    constants: &ConstantStrings,
) -> Vec<String> {
    let mut out = Vec::new();
    match value {
        Some(JSXAttributeValue::StringLiteral(literal)) => out.push(literal.value.to_string()),
        Some(JSXAttributeValue::ExpressionContainer(container)) => {
            if let Some(expression) = jsx_expression(&container.expression) {
                collect(expression, constants, &mut out);
            }
        }
        _ => {}
    }
    out
}

fn jsx_expression<'a, 'b>(expression: &'b JSXExpression<'a>) -> Option<&'b Expression<'a>> {
    expression.as_expression()
}

fn collect(expression: &Expression, constants: &ConstantStrings, out: &mut Vec<String>) {
    match expression.without_parentheses() {
        Expression::StringLiteral(literal) => out.push(literal.value.to_string()),
        Expression::TemplateLiteral(template) => {
            for quasi in &template.quasis {
                let text = quasi.value.cooked.as_ref().unwrap_or(&quasi.value.raw);
                out.push(text.to_string());
            }
            for expression in &template.expressions {
                collect(expression, constants, out);
            }
        }
        Expression::Identifier(identifier) => {
            if let Some((value, _)) = constants.get(&identifier.span.start) {
                out.push(value.clone());
            }
        }
        Expression::ConditionalExpression(conditional) => {
            collect(&conditional.consequent, constants, out);
            collect(&conditional.alternate, constants, out);
        }
        Expression::LogicalExpression(logical) => {
            collect(&logical.left, constants, out);
            collect(&logical.right, constants, out);
        }
        Expression::BinaryExpression(binary) => {
            collect(&binary.left, constants, out);
            collect(&binary.right, constants, out);
        }
        // A joiner (`cx(a, b)`, `plus(own, className)`): its arguments are
        // the class lists.
        Expression::CallExpression(call) => {
            for argument in &call.arguments {
                if let Argument::SpreadElement(_) = argument {
                    continue;
                }
                if let Some(expression) = argument.as_expression() {
                    collect(expression, constants, out);
                }
            }
        }
        Expression::ArrayExpression(array) => {
            for element in &array.elements {
                if let ArrayExpressionElement::SpreadElement(_) = element {
                    continue;
                }
                if let Some(expression) = element.as_expression() {
                    collect(expression, constants, out);
                }
            }
        }
        _ => {}
    }
}

/// One class prop written in a module, with the class lists its value can be.
#[derive(Debug, Clone, PartialEq)]
pub struct RuntimeClassList {
    /// The element it is written on, as written: `BottomSheetPattern`.
    pub element: String,
    /// `className`, or a secondary one such as `sheetClassName`.
    pub prop: String,
    pub span: hozo_ir::SourceSpan,
    pub literals: Vec<String>,
}

/// Every `className` and `*ClassName` attribute in the module, on any
/// element, with the class lists the file spells out for it.
///
/// Any element rather than the primitives the compiler lowers: most
/// patterns -- `BottomSheet`, `Drawer`, `Tree` -- are ordinary components to
/// it, so their class props were never looked at on either platform. The
/// Native backend reads this to say which of those classes React Native
/// cannot draw (#1165).
pub fn runtime_class_lists(source_text: &str) -> Vec<RuntimeClassList> {
    use oxc_ast::ast::{JSXAttributeItem, JSXAttributeName, JSXElementName, JSXOpeningElement};
    use oxc_ast_visit::Visit;

    struct Walk<'s> {
        source: &'s str,
        constants: &'s ConstantStrings,
        out: Vec<RuntimeClassList>,
    }
    impl<'a> Visit<'a> for Walk<'_> {
        fn visit_jsx_opening_element(&mut self, element: &JSXOpeningElement<'a>) {
            let name = match &element.name {
                JSXElementName::Identifier(id) => id.name.to_string(),
                JSXElementName::IdentifierReference(id) => id.name.to_string(),
                other => {
                    let span = oxc_span::GetSpan::span(other);
                    self.source[span.start as usize..span.end as usize].to_string()
                }
            };
            for item in &element.attributes {
                let JSXAttributeItem::Attribute(attr) = item else {
                    continue;
                };
                let JSXAttributeName::Identifier(prop) = &attr.name else {
                    continue;
                };
                if prop.name != "className" && !prop.name.ends_with("ClassName") {
                    continue;
                }
                let literals = class_literals(&attr.value, self.constants);
                if literals.is_empty() {
                    continue;
                }
                self.out.push(RuntimeClassList {
                    element: name.clone(),
                    prop: prop.name.to_string(),
                    span: hozo_ir::SourceSpan {
                        start: attr.span.start,
                        end: attr.span.end,
                    },
                    literals,
                });
            }
            oxc_ast_visit::walk::walk_jsx_opening_element(self, element);
        }
    }

    let allocator = oxc_allocator::Allocator::default();
    let source_type = oxc_span::SourceType::from_extension("tsx").expect("tsx is known");
    let ret = oxc_parser::Parser::new(&allocator, source_text, source_type).parse();
    let bindings = crate::rest::analyze(&ret.program);
    let mut walk = Walk {
        source: source_text,
        constants: &bindings.constants,
        out: Vec::new(),
    };
    walk.visit_program(&ret.program);
    walk.out
}
