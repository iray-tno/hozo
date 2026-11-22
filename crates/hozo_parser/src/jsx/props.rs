//! Props read from attributes, or carried through unread.

use hozo_ir::{Child, ConditionExpr, Diagnostic, ExprRef, PassthroughProp, SourceSpan};
use oxc_ast::ast::{
    JSXAttribute, JSXAttributeName, JSXAttributeValue, JSXChild, JSXExpression, ObjectPropertyKind,
    PropertyKey,
};
use oxc_ast_visit::Visit;
use oxc_span::{GetSpan, Span};

use super::finder::PrimitiveFinder;
use super::scope::Scope;
use super::to_expr_ref;

/// Builds a `Child::Verbatim` for a child the compiler carries rather than
/// reads, lowering any Hozo primitives nested inside it.
///
/// The expression is opaque; the primitives in it are not. So `show &&` is
/// left alone while the `<Text>` beside it compiles normally.
pub(super) fn carry_verbatim(
    child: &JSXChild,
    span: Span,
    scope: &Scope,
    diagnostics: &mut Vec<Diagnostic>,
    consumed: &mut Vec<SourceSpan>,
) -> Child {
    let mut finder = PrimitiveFinder {
        scope,
        diagnostics,
        consumed,
        nested: Vec::new(),
        enclosing: Vec::new(),
        expression_container: false,
    };
    finder.visit_jsx_child(child);
    Child::Verbatim {
        source: to_expr_ref(span),
        nested: finder.nested,
    }
}

pub(super) fn passthrough_prop(
    attr: &JSXAttribute,
    scope: &Scope,
    diagnostics: &mut Vec<Diagnostic>,
    consumed: &mut Vec<SourceSpan>,
) -> PassthroughProp {
    let mut finder = PrimitiveFinder {
        scope,
        diagnostics,
        consumed,
        nested: Vec::new(),
        enclosing: Vec::new(),
        expression_container: false,
    };
    finder.visit_jsx_attribute(attr);
    PassthroughProp {
        span: to_expr_ref(attr.span()),
        is_spread: false,
        spread_excludes: Vec::new(),
        later_names: Vec::new(),
        class_literals: match &attr.name {
            JSXAttributeName::Identifier(name) if name.name.ends_with("ClassName") => {
                crate::class_literals::class_literals(&attr.value, scope.constants)
            }
            _ => Vec::new(),
        },
        // A namespaced name (`xlink:href`) is not something Hozo emits a
        // semantic counterpart for, so leaving it `None` costs nothing and
        // avoids inventing a spelling for it.
        name: match &attr.name {
            JSXAttributeName::Identifier(name) => Some(name.name.to_string()),
            JSXAttributeName::NamespacedName(_) => None,
        },
        literal: attribute_literal(&attr.value),
        nested: finder.nested,
    }
}

/// An attribute's value, when it is one the compiler can read.
///
/// The three shapes JSX writes a constant in: a bare string, a literal
/// inside an expression container, and the boolean shorthand. Everything
/// else is a value only the runtime knows, and the checks that read this
/// stay silent rather than guess.
pub(super) fn attribute_literal(value: &Option<JSXAttributeValue>) -> Option<String> {
    match value {
        Some(JSXAttributeValue::StringLiteral(literal)) => Some(literal.value.to_string()),
        Some(JSXAttributeValue::ExpressionContainer(container)) => match &container.expression {
            JSXExpression::StringLiteral(literal) => Some(literal.value.to_string()),
            JSXExpression::NumericLiteral(literal) => Some(literal.value.to_string()),
            JSXExpression::BooleanLiteral(literal) => Some(literal.value.to_string()),
            _ => None,
        },
        // `<View hidden />`, which JSX reads as `hidden={true}`.
        None => Some("true".to_string()),
        _ => None,
    }
}

pub(super) fn capture_prop_expr(
    attr: &JSXAttribute,
    target: &mut Option<ExprRef>,
    passthrough: &mut Vec<PassthroughProp>,
    scope: &Scope,
    diagnostics: &mut Vec<Diagnostic>,
    consumed: &mut Vec<SourceSpan>,
) {
    *target = match &attr.value {
        Some(JSXAttributeValue::ExpressionContainer(container)) => {
            Some(to_expr_ref(container.expression.span()))
        }
        Some(JSXAttributeValue::StringLiteral(literal)) => Some(to_expr_ref(literal.span)),
        _ => {
            passthrough.push(passthrough_prop(attr, scope, diagnostics, consumed));
            None
        }
    };
}

/// A boolean-shaped prop: bare (`multiline`), or an expression Hozo
/// carries without reading (`editable={canEdit}`).
///
/// The same shape `disabled` and `horizontal` already use, factored out
/// because `TextInput` brought four more of them at once.
pub(super) fn capture_flag(
    attr: &JSXAttribute,
    target: &mut Option<ConditionExpr>,
    passthrough: &mut Vec<PassthroughProp>,
    scope: &Scope,
    diagnostics: &mut Vec<Diagnostic>,
    consumed: &mut Vec<SourceSpan>,
) {
    match &attr.value {
        None => *target = Some(ConditionExpr::Static(true)),
        Some(JSXAttributeValue::ExpressionContainer(container)) => {
            // `multiline={true}` is the bare form written out, and a
            // backend that has to *decide* something from it -- Web picks
            // `<textarea>` or `<input>` and writes one of them into the
            // file -- can only do that for a value it knows. Reading the
            // literal is the difference between compiling that and
            // reporting it.
            *target = Some(match &container.expression {
                JSXExpression::BooleanLiteral(literal) => ConditionExpr::Static(literal.value),
                other => ConditionExpr::Ref(to_expr_ref(other.span())),
            });
        }
        _ => passthrough.push(passthrough_prop(attr, scope, diagnostics, consumed)),
    }
}

/// A prop whose *value* Hozo has to read, not just delimit.
///
/// `keyboardType` and `inputMode` pick a DOM attribute between them, so a
/// span is not enough -- unlike every other prop here, the compiler needs
/// to know which string was written. A dynamic value is carried instead,
/// because the mapping cannot be made at build time from an expression.
pub(super) fn capture_literal(
    attr: &JSXAttribute,
    target: &mut Option<String>,
    passthrough: &mut Vec<PassthroughProp>,
    scope: &Scope,
    diagnostics: &mut Vec<Diagnostic>,
    consumed: &mut Vec<SourceSpan>,
) {
    let literal = match &attr.value {
        Some(JSXAttributeValue::StringLiteral(lit)) => Some(lit.value.to_string()),
        Some(JSXAttributeValue::ExpressionContainer(container)) => match &container.expression {
            JSXExpression::StringLiteral(lit) => Some(lit.value.to_string()),
            _ => None,
        },
        _ => None,
    };
    match literal {
        Some(value) => *target = Some(value),
        None => passthrough.push(passthrough_prop(attr, scope, diagnostics, consumed)),
    }
}

/// The property names an object-literal attribute writes, if all of them
/// can be read from the source.
///
/// Returns `None` for anything that leaves the set open -- a spread, a
/// computed key, or an expression that is not an object literal at all.
/// Guessing there would be worse than not knowing: the caller uses this to
/// decide which attributes are safe to read off the value.
pub(super) fn object_literal_keys(attr: &JSXAttribute) -> Option<Vec<String>> {
    let Some(JSXAttributeValue::ExpressionContainer(container)) = &attr.value else {
        return None;
    };
    let JSXExpression::ObjectExpression(object) = &container.expression else {
        return None;
    };
    let mut keys = Vec::new();
    for property in &object.properties {
        let ObjectPropertyKind::ObjectProperty(property) = property else {
            return None;
        };
        if property.computed {
            return None;
        }
        match &property.key {
            PropertyKey::StaticIdentifier(name) => keys.push(name.name.to_string()),
            PropertyKey::StringLiteral(literal) => keys.push(literal.value.to_string()),
            _ => return None,
        }
    }
    Some(keys)
}
