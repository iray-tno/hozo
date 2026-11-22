//! The component an element is written inside, and its props.

use hozo_ir::{EnclosingComponent, EnclosingProp, EnclosingValue};
use oxc_ast::ast::{
    JSXAttributeItem, JSXAttributeName, JSXAttributeValue, JSXElement, JSXElementName,
    JSXExpression,
};
use oxc_span::GetSpan;

use super::to_expr_ref;

/// The call-site facts of a component the compiler does not model, for a
/// package's manifest to be applied to later (#950). `None` for a tag that
/// is not a plain binding, such as `<ui.Button>`.
pub(super) fn enclosing_component(element: &JSXElement) -> Option<EnclosingComponent> {
    let JSXElementName::IdentifierReference(tag) = &element.opening_element.name else {
        return None;
    };
    let mut props = Vec::new();
    let mut spread = false;
    for attribute in &element.opening_element.attributes {
        match attribute {
            JSXAttributeItem::SpreadAttribute(_) => spread = true,
            JSXAttributeItem::Attribute(attribute) => {
                let JSXAttributeName::Identifier(name) = &attribute.name else {
                    continue;
                };
                let value = match &attribute.value {
                    None => EnclosingValue::True,
                    Some(JSXAttributeValue::StringLiteral(lit)) => {
                        EnclosingValue::Literal(lit.value.to_string())
                    }
                    Some(JSXAttributeValue::ExpressionContainer(container)) => {
                        match &container.expression {
                            JSXExpression::StringLiteral(lit) => {
                                EnclosingValue::Literal(lit.value.to_string())
                            }
                            other => EnclosingValue::Expr(to_expr_ref(other.span())),
                        }
                    }
                    Some(other) => EnclosingValue::Expr(to_expr_ref(other.span())),
                };
                props.push(EnclosingProp {
                    name: name.name.to_string(),
                    value,
                });
            }
        }
    }
    Some(EnclosingComponent {
        local: tag.name.to_string(),
        props,
        spread,
    })
}
