//! Sorting an expression into the shapes the decomposer recognises.

use super::*;

/// The handful of expression shapes `decompose` understands, regardless of
/// which wrapper enum (`Expression`, `Argument`, `JSXExpression`) they were
/// extracted from -- those wrappers differ only at the outermost level;
/// everything nested below is a plain `Expression`.
pub(super) enum Target<'a, 'b> {
    StringLiteral(&'b StringLiteral<'a>),
    Logical(&'b LogicalExpression<'a>),
    Conditional(&'b ConditionalExpression<'a>),
    Call(&'b CallExpression<'a>),
    Template(&'b TemplateLiteral<'a>),
    Identifier(Span),
    Spread(Span),
    Other(Span),
}

pub(super) fn classify_expression<'a, 'b>(expr: &'b Expression<'a>) -> Target<'a, 'b> {
    match expr {
        Expression::StringLiteral(lit) => Target::StringLiteral(lit),
        Expression::LogicalExpression(logical) if logical.operator == LogicalOperator::And => {
            Target::Logical(logical)
        }
        Expression::ConditionalExpression(cond) => Target::Conditional(cond),
        Expression::CallExpression(call) => Target::Call(call),
        Expression::TemplateLiteral(template) => Target::Template(template),
        Expression::Identifier(id) => Target::Identifier(id.span),
        other => Target::Other(other.span()),
    }
}

pub(super) fn classify_argument<'a, 'b>(arg: &'b Argument<'a>) -> Target<'a, 'b> {
    match arg {
        Argument::StringLiteral(lit) => Target::StringLiteral(lit),
        Argument::LogicalExpression(logical) if logical.operator == LogicalOperator::And => {
            Target::Logical(logical)
        }
        Argument::ConditionalExpression(cond) => Target::Conditional(cond),
        Argument::CallExpression(call) => Target::Call(call),
        Argument::TemplateLiteral(template) => Target::Template(template),
        Argument::Identifier(id) => Target::Identifier(id.span),
        Argument::SpreadElement(spread) => Target::Spread(spread.span()),
        other => Target::Other(other.span()),
    }
}

pub(super) fn classify_jsx_expression<'a, 'b>(expr: &'b JSXExpression<'a>) -> Target<'a, 'b> {
    match expr {
        JSXExpression::StringLiteral(lit) => Target::StringLiteral(lit),
        JSXExpression::LogicalExpression(logical) if logical.operator == LogicalOperator::And => {
            Target::Logical(logical)
        }
        JSXExpression::ConditionalExpression(cond) => Target::Conditional(cond),
        JSXExpression::CallExpression(call) => Target::Call(call),
        JSXExpression::TemplateLiteral(template) => Target::Template(template),
        JSXExpression::Identifier(id) => Target::Identifier(id.span),
        other => Target::Other(other.span()),
    }
}
