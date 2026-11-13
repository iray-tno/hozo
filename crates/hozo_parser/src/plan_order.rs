//! Whether an element's emitted JSX already reads its attribute values once
//! each, in source order (#1879).
//!
//! The parser cannot know the order each backend writes attributes in, so it
//! plans every element with two or more evaluated values. A backend that
//! happens to write them in their authored order needs no plan: it reads the
//! output it rendered against the plan, and if every slot is read exactly
//! once, in plan order, eagerly, the plan can be taken out and the values
//! written back where they were.
//!
//! "Eagerly" is the point of parsing rather than matching text. A slot inside
//! a function (`style={({ pressed }) => [hozoClasses(plan[0], …)]}`) runs when
//! the callback does, maybe many times; one in a conditional branch or on the
//! right of `&&` may not run at all. Either needs the plan.

use oxc_allocator::Allocator;
use oxc_ast::ast::{
    ArrowFunctionExpression, ComputedMemberExpression, ConditionalExpression, Expression, Function,
    LogicalExpression,
};
use oxc_ast_visit::{walk, Visit};
use oxc_parser::Parser;
use oxc_span::SourceType;
use oxc_syntax::scope::ScopeFlags;

/// Whether `jsx` reads `binding[0]` … `binding[count - 1]` exactly once each,
/// in that order, outside any function, branch or short circuit.
pub fn plan_reads_in_order(jsx: &str, binding: &str, count: usize) -> bool {
    let allocator = Allocator::default();
    let text = format!("({jsx});");
    let source_type = SourceType::from_extension("tsx").expect("\"tsx\" is a known extension");
    let parsed = Parser::new(&allocator, &text, source_type).parse();
    if !parsed.diagnostics.is_empty() || parsed.panicked {
        return false;
    }
    let mut reads = Reads {
        binding,
        deferred: 0,
        order: Vec::new(),
        lazy: false,
    };
    reads.visit_program(&parsed.program);
    !reads.lazy && reads.order == (0..count).collect::<Vec<_>>()
}

struct Reads<'b> {
    binding: &'b str,
    /// Inside a function, a branch or a short circuit's right side.
    deferred: usize,
    order: Vec<usize>,
    lazy: bool,
}

impl<'a> Visit<'a> for Reads<'_> {
    fn visit_computed_member_expression(&mut self, member: &ComputedMemberExpression<'a>) {
        if let (Expression::Identifier(object), Expression::NumericLiteral(index)) =
            (&member.object, &member.expression)
        {
            if object.name == self.binding {
                if self.deferred > 0 {
                    self.lazy = true;
                }
                self.order.push(index.value as usize);
                return;
            }
        }
        walk::walk_computed_member_expression(self, member);
    }

    fn visit_function(&mut self, function: &Function<'a>, flags: ScopeFlags) {
        self.deferred += 1;
        walk::walk_function(self, function, flags);
        self.deferred -= 1;
    }

    fn visit_arrow_function_expression(&mut self, arrow: &ArrowFunctionExpression<'a>) {
        self.deferred += 1;
        walk::walk_arrow_function_expression(self, arrow);
        self.deferred -= 1;
    }

    fn visit_conditional_expression(&mut self, conditional: &ConditionalExpression<'a>) {
        self.visit_expression(&conditional.test);
        self.deferred += 1;
        self.visit_expression(&conditional.consequent);
        self.visit_expression(&conditional.alternate);
        self.deferred -= 1;
    }

    fn visit_logical_expression(&mut self, logical: &LogicalExpression<'a>) {
        self.visit_expression(&logical.left);
        self.deferred += 1;
        self.visit_expression(&logical.right);
        self.deferred -= 1;
    }
}

#[cfg(test)]
mod tests {
    use super::plan_reads_in_order;

    #[test]
    fn reads_in_order_once_each_and_eagerly_or_not_at_all() {
        let ok = [
            "<div aria-label={p[0]} data-testid={p[1]}></div>",
            "<div style={hozoDomStyle(p[0])} {...hozoInteractive(p[1], p[2])}>x</div>",
            "<V a={(p[0])?.selected === true} b={p[1]} />",
        ];
        for jsx in ok {
            let count = jsx.matches("p[").count();
            assert!(plan_reads_in_order(jsx, "p", count), "{jsx}");
        }
        for (jsx, count) in [
            // Written out of order: the plan is what fixes it.
            ("<div data-testid={p[1]} aria-label={p[0]}></div>", 2),
            // Twice: `disabled` as aria-disabled and data-hozo-disabled.
            ("<div a={p[0]} b={(p[0]) ? '' : undefined}></div>", 1),
            // Deferred to a callback, or behind a branch or short circuit.
            (
                "<V style={({ pressed }) => [hozoClasses(p[0], pressed)]} b={p[1]} />",
                2,
            ),
            ("<V a={x ? p[0] : null} b={p[1]} />", 2),
            ("<V a={x && p[0]} b={p[1]} />", 2),
            // Not read at all.
            ("<V a={p[0]} />", 2),
            // Not JSX the parser can read.
            ("<V a={p[0]}", 1),
        ] {
            assert!(!plan_reads_in_order(jsx, "p", count), "{jsx}");
        }
    }
}
