//! Which kind of class expression a backend carries to run time (#2048).
//!
//! Three situations used to share one diagnostic. They differ in what the
//! author can do about them, so each gets its own code:
//!
//! - **passed through**: `className={className}`, the classes a component
//!   was handed. Whoever wrote them is the place to compile them.
//! - **assembled**: `` `bg-${color}-500` `` or `'p-' + size`. A whole class
//!   name exists only at run time, so it has a rule only when that exact
//!   name is written somewhere else in the project.
//! - **opaque**: any other value the build cannot enumerate.
//!
//! Read from the expression's own syntax, not from bindings: the parse that
//! carried it already decided it could not be read, and this only names why.
use hozo_ir::DiagnosticCode;
use oxc_allocator::Allocator;
use oxc_ast::ast::{BinaryOperator, Expression};
use oxc_parser::Parser;
use oxc_span::SourceType;

/// The diagnostic code for a carried class expression, by its source text,
/// filling `attribute`.
pub fn class_fallback_code(text: &str, attribute: &str) -> DiagnosticCode {
    let allocator = Allocator::default();
    let Ok(expression) = Parser::new(&allocator, text, SourceType::tsx()).parse_expression() else {
        return DiagnosticCode::DynamicClassNameNotResolved;
    };
    if assembled(&expression) {
        DiagnosticCode::ClassNameAssembled
    } else if passed_through(&expression, attribute) {
        DiagnosticCode::ClassNamePassedThrough
    } else {
        DiagnosticCode::DynamicClassNameNotResolved
    }
}

/// What to add to a carried expression's message, by its code.
pub fn class_fallback_note(code: DiagnosticCode) -> &'static str {
    match code {
        DiagnosticCode::ClassNamePassedThrough => {
            " It is the component's own class prop passed on, so its classes compile where the \
             caller writes them as a static string."
        }
        DiagnosticCode::ClassNameAssembled => {
            " It assembles class names from pieces, so a name has a rule only when that exact \
             name is written literally somewhere in the project; map each value to a whole class \
             instead."
        }
        _ => "",
    }
}

fn assembled(expression: &Expression) -> bool {
    match expression.without_parentheses() {
        Expression::TemplateLiteral(template) => !template.expressions.is_empty(),
        Expression::BinaryExpression(binary) if binary.operator == BinaryOperator::Addition => {
            textual(&binary.left) || textual(&binary.right)
        }
        _ => false,
    }
}

/// A `+` builds a string only when a side is one.
fn textual(expression: &Expression) -> bool {
    match expression.without_parentheses() {
        Expression::StringLiteral(_) | Expression::TemplateLiteral(_) => true,
        Expression::BinaryExpression(binary) if binary.operator == BinaryOperator::Addition => {
            textual(&binary.left) || textual(&binary.right)
        }
        _ => false,
    }
}

/// The attribute's own name, bare or as a member: `className`,
/// `props.className`, `this.props.handleClassName`.
fn passed_through(expression: &Expression, attribute: &str) -> bool {
    match expression.without_parentheses() {
        Expression::Identifier(identifier) => identifier.name == attribute,
        Expression::StaticMemberExpression(member) => member.property.name == attribute,
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn code(text: &str, attribute: &str) -> DiagnosticCode {
        class_fallback_code(text, attribute)
    }

    #[test]
    fn names_each_kind_by_syntax() {
        use DiagnosticCode::*;
        assert_eq!(code("className", "className"), ClassNamePassedThrough);
        assert_eq!(code("props.className", "className"), ClassNamePassedThrough);
        assert_eq!(
            code("(this.props.handleClassName)", "handleClassName"),
            ClassNamePassedThrough
        );
        assert_eq!(code("`bg-${color}-500`", "className"), ClassNameAssembled);
        assert_eq!(code("'p-' + size", "className"), ClassNameAssembled);
        assert_eq!(code("size + ('-' + 'x')", "className"), ClassNameAssembled);
        // Not the attribute's own name, or no string being built.
        assert_eq!(code("cls", "className"), DynamicClassNameNotResolved);
        assert_eq!(code("props.cls", "className"), DynamicClassNameNotResolved);
        assert_eq!(
            code("styles[variant]", "className"),
            DynamicClassNameNotResolved
        );
        assert_eq!(code("a + b", "className"), DynamicClassNameNotResolved);
        assert_eq!(code("`p-4`", "className"), DynamicClassNameNotResolved);
        assert_eq!(code("pick()", "className"), DynamicClassNameNotResolved);
    }
}
