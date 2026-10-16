//! A root binding must enclose inherited styles, not just the root's prop.
//! Moving JSX into an arrow is safe only when it keeps lexical operations
//! and the class input's position relative to other evaluated props intact.

use super::*;
use oxc_ast::ast::{AwaitExpression, CallExpression, Expression, YieldExpression};

pub(super) fn can_wrap(element: &JSXElement, class_attribute: Span) -> bool {
    let mut found = false;
    for item in &element.opening_element.attributes {
        let JSXAttributeItem::Attribute(attribute) = item else {
            if !found {
                return false;
            }
            continue;
        };
        if matches!(&attribute.name, JSXAttributeName::Identifier(name) if name.name == "className")
        {
            if found {
                return false;
            }
            found = true;
            continue;
        }
        if !found && !inert(attribute.value.as_ref()) {
            return false;
        }
    }
    let mut safety = Safety {
        class_attribute,
        safe: true,
    };
    safety.visit_jsx_element(element);
    found && safety.safe
}

fn inert(value: Option<&JSXAttributeValue>) -> bool {
    match value {
        None | Some(JSXAttributeValue::StringLiteral(_)) => true,
        Some(JSXAttributeValue::ExpressionContainer(container)) => matches!(
            container.expression,
            JSXExpression::BooleanLiteral(_)
                | JSXExpression::NumericLiteral(_)
                | JSXExpression::StringLiteral(_)
                | JSXExpression::NullLiteral(_)
                | JSXExpression::ArrowFunctionExpression(_)
                | JSXExpression::FunctionExpression(_)
        ),
        _ => false,
    }
}

struct Safety {
    class_attribute: Span,
    safe: bool,
}

impl<'a> Visit<'a> for Safety {
    fn visit_jsx_attribute(&mut self, attribute: &JSXAttribute<'a>) {
        // The class inputs are arguments *outside* the new closure, so their
        // await/yield/direct-eval keep the author's scope and are allowed.
        if attribute.span != self.class_attribute {
            oxc_ast_visit::walk::walk_jsx_attribute(self, attribute);
        }
    }

    fn visit_await_expression(&mut self, _: &AwaitExpression<'a>) {
        self.safe = false;
    }
    fn visit_yield_expression(&mut self, _: &YieldExpression<'a>) {
        self.safe = false;
    }
    fn visit_call_expression(&mut self, expression: &CallExpression<'a>) {
        if matches!(&expression.callee, Expression::Identifier(id) if id.name == "eval") {
            self.safe = false;
        }
        oxc_ast_visit::walk::walk_call_expression(self, expression);
    }

    // A nested function keeps its own lexical boundary when the surrounding
    // JSX moves. Its suspension/direct eval does not run in the new arrow.
    fn visit_function(&mut self, _: &Function<'a>, _: ScopeFlags) {}
    fn visit_arrow_function_expression(&mut self, _: &ArrowFunctionExpression<'a>) {}
}

#[cfg(test)]
mod tests {
    #[test]
    fn roots_capture_before_children_but_not_before_evaluated_earlier_props() {
        for jsx in [
            "<View className={guard() ? 'p-2' : 'p-4'} testID={after()}><Text>Label</Text></View>",
            "<View onLayout={async () => {await later()}} className={guard() && 'p-2'} />",
        ] {
            let source = format!("import {{View,Text}} from '@hozo/core'; const el = {jsx}");
            let parsed = crate::parse_tsx(&source);
            assert!(
                parsed.roots[0].node.root_class_evaluation().is_some(),
                "{jsx}"
            );
        }
        for jsx in [
            "<View testID={before()} className={guard() && 'p-2'} />",
            "<View {...before()} className={guard() && 'p-2'} />",
            "<View className={guard() && 'p-2'}>{eval('thing')}</View>",
            "<View className={guard() ? 'p-2' : opaque()} />",
            "<View className={guard() && 'p-2'} className='p-4' />",
        ] {
            let source = format!("import {{View}} from '@hozo/core'; const el = {jsx}");
            let parsed = crate::parse_tsx(&source);
            assert!(
                parsed.roots[0].node.root_class_evaluation().is_none(),
                "{jsx}"
            );
        }
    }

    #[test]
    fn class_inputs_keep_suspension_outside_the_new_scope() {
        for (prefix, input, tail, captured) in [
            (
                "async function C()",
                "(await guard())",
                "<Text>Label</Text>",
                true,
            ),
            (
                "function* C()",
                "(yield 'guard')",
                "<Text>Label</Text>",
                true,
            ),
            ("async function C()", "guard()", "{await after()}", false),
            ("function* C()", "guard()", "{yield 'child'}", false),
        ] {
            let source = format!("import {{View,Text}} from '@hozo/core'; {prefix} {{return <View className={{{input} ? 'p-2' : 'p-4'}}>{tail}</View>}}");
            let parsed = crate::parse_tsx(&source);
            assert_eq!(
                parsed.roots[0].node.root_class_evaluation().is_some(),
                captured,
                "{source}"
            );
        }
    }

    #[test]
    fn opaque_boundaries_record_where_jsx_needs_an_expression_container() {
        let source = "import {View} from '@hozo/core'; const el = <View><Other><View className={guard() && 'p-2'} /></Other>{flag && <View className={guard() && 'p-2'} />}<Other item=<View className={guard() && 'p-2'} /> /><><View className={guard() && 'p-2'} /></></View>";
        let parsed = crate::parse_tsx(source);
        let nested = parsed.roots[0]
            .node
            .children
            .iter()
            .flat_map(|child| match child {
                hozo_ir::Child::Verbatim { nested, .. } => nested.as_slice(),
                _ => &[],
            })
            .collect::<Vec<_>>();
        assert_eq!(nested.len(), 4);
        assert!(nested
            .iter()
            .all(|entry| entry.node.root_class_evaluation().is_some()));
        assert_eq!(
            nested
                .iter()
                .map(|entry| entry
                    .node
                    .root_class_evaluation()
                    .unwrap()
                    .expression_container())
                .collect::<Vec<_>>(),
            [true, false, true, true]
        );
        let source = "import {View} from '@hozo/core'; const el = <Other item=<View className={guard() && 'p-2'} />><View className={guard() && 'p-2'} /></Other>";
        let parsed = crate::parse_tsx(source);
        assert_eq!(parsed.roots.len(), 2);
        assert!(parsed.roots.iter().all(|root| root
            .node
            .root_class_evaluation()
            .unwrap()
            .expression_container()));
    }
}
