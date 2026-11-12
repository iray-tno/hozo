//! A root binding must enclose inherited styles, not just the root's prop.
//! Moving JSX into an arrow is safe only when it keeps lexical operations
//! and the class input's position relative to other evaluated props intact.
//!
//! An evaluated prop before the class input used to refuse the capture. It
//! is now evaluated in the same plan, in its place (#1879): see
//! `plan_attributes`.

use super::*;
use oxc_ast::ast::{
    ArrayExpressionElement, AwaitExpression, CallExpression, Expression, JSXFragment,
    ObjectPropertyKind, YieldExpression,
};

pub(super) fn can_wrap(element: &JSXElement, class_attribute: Span) -> bool {
    let mut found = false;
    for item in &element.opening_element.attributes {
        if let JSXAttributeItem::Attribute(attribute) = item {
            if matches!(&attribute.name, JSXAttributeName::Identifier(name) if name.name == "className")
            {
                if found {
                    return false;
                }
                found = true;
                continue;
            }
        }
        // An evaluated value before the class joins the plan; one the plan
        // cannot hold keeps the legacy route.
        if !found && !inert_item(item) && captured_value(item).is_none() {
            return false;
        }
    }
    let mut skip = vec![class_attribute];
    skip.extend(attribute_values(element).into_iter().map(|(span, _)| span));
    let mut safety = Safety { skip, safe: true };
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

fn inert_item(item: &JSXAttributeItem) -> bool {
    match item {
        JSXAttributeItem::Attribute(attribute) => inert(attribute.value.as_ref()),
        JSXAttributeItem::SpreadAttribute(spread) => pure(&spread.argument),
    }
}

/// Props whose one value a backend writes into more than one attribute
/// (`disabled` is Web's `aria-disabled` and `data-hozo-disabled`; Native's
/// `disabled` and `accessibilityState`). Alone on an element, an evaluated
/// one still runs once only from a plan. `attribute-order.test.ts` emits
/// every prop of every primitive with a call as its value and fails on any
/// call written twice that this list does not name.
const WRITTEN_MORE_THAN_ONCE: &[&str] = &[
    "disabled",
    "accessibilityState",
    "accessibilityValue",
    "accessibilityLiveRegion",
    "external",
    "target",
    // A `<Meter>`'s `aria-valuetext` on Web is worked out from it too.
    "value",
];

/// The value an attribute's plan step evaluates, if the plan can hold it:
/// a value that runs code and contains no element of its own (whose lowering
/// would be lost to the plan's copy of the source). With it, whether a
/// backend writes it more than once.
fn captured_value(item: &JSXAttributeItem) -> Option<(Span, bool)> {
    let (expression, name) = match item {
        JSXAttributeItem::SpreadAttribute(spread) => (&spread.argument, None),
        JSXAttributeItem::Attribute(attribute) => {
            let JSXAttributeName::Identifier(name) = &attribute.name else {
                return None;
            };
            let name = name.name.as_str();
            // The class plan reads the root list itself. A secondary list
            // the compiler read is planned from its leaves; one it carries
            // whole is a value like any other.
            if name == "className" {
                return None;
            }
            let Some(JSXAttributeValue::ExpressionContainer(container)) = &attribute.value else {
                return None;
            };
            (container.expression.as_expression()?, Some(name))
        }
    };
    if pure(expression) || contains_element(expression) {
        return None;
    }
    Some((
        expression.span(),
        name.is_some_and(|name| WRITTEN_MORE_THAN_ONCE.contains(&name)),
    ))
}

/// Every attribute value a plan could evaluate, in source order.
fn attribute_values(element: &JSXElement) -> Vec<(Span, bool)> {
    element
        .opening_element
        .attributes
        .iter()
        .filter_map(captured_value)
        .collect()
}

/// A value whose evaluation runs no code: reading it twice, or in another
/// order, cannot be told apart. A getter on a member chain could, and is
/// assumed not to, as React itself assumes of the props it reads.
fn pure(expression: &Expression) -> bool {
    use oxc_syntax::operator::UnaryOperator;
    match expression.without_parentheses() {
        Expression::BooleanLiteral(_)
        | Expression::NullLiteral(_)
        | Expression::NumericLiteral(_)
        | Expression::BigIntLiteral(_)
        | Expression::StringLiteral(_)
        | Expression::RegExpLiteral(_)
        | Expression::Identifier(_)
        | Expression::ThisExpression(_)
        | Expression::ArrowFunctionExpression(_)
        | Expression::FunctionExpression(_)
        | Expression::JSXElement(_)
        | Expression::JSXFragment(_) => true,
        Expression::TemplateLiteral(template) => template.expressions.iter().all(pure),
        Expression::StaticMemberExpression(member) => pure(&member.object),
        // A fresh object or array is not a side effect, and a backend reads
        // a literal's keys (`accessibilityState={{ busy }}`) at build time.
        Expression::ObjectExpression(object) => {
            object.properties.iter().all(|property| match property {
                ObjectPropertyKind::ObjectProperty(property) => {
                    !property.computed && pure(&property.value)
                }
                ObjectPropertyKind::SpreadProperty(spread) => pure(&spread.argument),
            })
        }
        Expression::ArrayExpression(array) => array.elements.iter().all(|element| match element {
            ArrayExpressionElement::SpreadElement(spread) => pure(&spread.argument),
            ArrayExpressionElement::Elision(_) => true,
            other => other.as_expression().is_some_and(pure),
        }),
        Expression::ConditionalExpression(conditional) => {
            pure(&conditional.test) && pure(&conditional.consequent) && pure(&conditional.alternate)
        }
        Expression::LogicalExpression(logical) => pure(&logical.left) && pure(&logical.right),
        Expression::BinaryExpression(binary) => pure(&binary.left) && pure(&binary.right),
        Expression::UnaryExpression(unary) => {
            matches!(
                unary.operator,
                UnaryOperator::LogicalNot | UnaryOperator::Typeof | UnaryOperator::Void
            ) && pure(&unary.argument)
        }
        _ => false,
    }
}

fn contains_element(expression: &Expression) -> bool {
    struct Finder(bool);
    impl<'a> Visit<'a> for Finder {
        fn visit_jsx_element(&mut self, _: &JSXElement<'a>) {
            self.0 = true;
        }
        fn visit_jsx_fragment(&mut self, _: &JSXFragment<'a>) {
            self.0 = true;
        }
    }
    let mut finder = Finder(false);
    finder.visit_expression(expression);
    finder.0
}

/// One thing an element's plan evaluates, in source order.
enum Entry {
    /// A whole attribute value.
    Value(Span),
    /// The root class list.
    Root,
    /// A secondary class list the compiler read (`props.class_slots[i]`).
    Slot(usize),
}

/// Evaluates the element's attribute values once each, in the order they
/// were written, when a backend would otherwise run them out of order or
/// more than once (#1879). The backends write attributes grouped by kind,
/// not as authored -- `testID` before `accessibilityLabel`, the class list
/// first -- and copy some values into several attributes.
///
/// The values join the class plan where there is one, around its steps in
/// source order; otherwise they make a plan of their own. A secondary class
/// list joins it too, and keeps a view of it (`ClassCaptureScope::Shared`)
/// instead of a plan written where the list is. Every copy of a captured
/// span then reads its slot (`hozo_ir::attribute_capture`).
pub(super) fn plan_attributes(
    element: &JSXElement,
    props: &mut PropSet,
    style: &mut [StyleDeclaration],
    class_name_fallback: &[ExprRef],
    expression_container: bool,
) {
    let class_plan = props
        .class_slots
        .iter()
        .position(|slot| slot.slot == hozo_ir::ClassSlot::ROOT && slot.evaluation.is_some());
    // An opaque class input with no plan of its own is one more value: the
    // backends copy its leaves whole, so they can read slots as well.
    let opaque_class: &[ExprRef] = if class_plan.is_none() {
        class_name_fallback
    } else {
        &[]
    };
    let mut entries = Vec::new();
    let mut repeated = false;
    let mut skip = Vec::new();
    let mut root_start = u32::MAX;
    for item in &element.opening_element.attributes {
        if let JSXAttributeItem::SpreadAttribute(spread) = item {
            // A spread StyleX resolved is styling the compiler read, not a
            // value the output evaluates: only a spread still carried is one.
            let carried = props
                .passthrough
                .iter()
                .any(|prop| prop.is_spread && prop.span == to_expr_ref(spread.span));
            if !carried {
                continue;
            }
        }
        if let JSXAttributeItem::Attribute(attribute) = item {
            let name = match &attribute.name {
                JSXAttributeName::Identifier(name) => name.name.as_str(),
                _ => "",
            };
            if name == "className" {
                if class_plan.is_some() || !opaque_class.is_empty() {
                    root_start = attribute.span.start;
                    entries.push(Entry::Root);
                    skip.push(attribute.span);
                }
                continue;
            }
            let read = props.class_slots.iter().position(|slot| {
                slot.slot != hozo_ir::ClassSlot::ROOT && slot.span == to_span(attribute.span)
            });
            if let Some(index) = read {
                let slot = &props.class_slots[index];
                if slot.evaluation.is_some() || !slot.fallback.is_empty() {
                    entries.push(Entry::Slot(index));
                    skip.push(attribute.span);
                }
                continue;
            }
        }
        if let Some((span, more)) = captured_value(item) {
            repeated |= more;
            entries.push(Entry::Value(span));
            skip.push(span);
        }
    }
    let before_root = entries.iter().any(|entry| match entry {
        Entry::Value(span) => span.start < root_start,
        Entry::Slot(index) => props.class_slots[*index].span.start < root_start,
        Entry::Root => false,
    });
    let needed = entries.len() >= 2 || repeated || (class_plan.is_some() && before_root);
    if !needed {
        return;
    }
    // The values leave the arrow; whatever stays must keep its meaning there.
    let mut safety = Safety { skip, safe: true };
    safety.visit_jsx_element(element);
    if !safety.safe {
        return;
    }

    let mut steps = Vec::new();
    let mut root_offset = 0;
    let mut slot_offsets = Vec::new();
    for entry in &entries {
        match entry {
            Entry::Value(span) => {
                steps.push(hozo_ir::ClassEvaluationStep::Attribute(to_expr_ref(*span)))
            }
            Entry::Root => {
                root_offset = steps.len();
                match class_plan {
                    Some(index) => steps.extend(
                        props.class_slots[index]
                            .evaluation
                            .as_ref()
                            .expect("found above")
                            .steps
                            .iter()
                            .cloned(),
                    ),
                    None => steps.extend(
                        opaque_class
                            .iter()
                            .map(|reference| hozo_ir::ClassEvaluationStep::Attribute(*reference)),
                    ),
                }
            }
            Entry::Slot(index) => {
                let slot = &props.class_slots[*index];
                match &slot.evaluation {
                    Some(plan) => {
                        slot_offsets.push((*index, plan.span, steps.len()));
                        steps.extend(plan.steps.iter().cloned());
                    }
                    None => steps.extend(
                        slot.fallback
                            .iter()
                            .map(|reference| hozo_ir::ClassEvaluationStep::Attribute(*reference)),
                    ),
                }
            }
        }
    }
    let span = match class_plan {
        Some(index) => {
            let plan = props.class_slots[index]
                .evaluation
                .as_mut()
                .expect("found above");
            plan.steps = steps.clone();
            // The class plan's own slots moved past the values before them.
            let span = plan.span;
            for declaration in style.iter_mut() {
                rebase_captures(&mut declaration.condition, span, span, root_offset);
            }
            span
        }
        None => {
            let span = to_span(element.opening_element.span);
            props.class_slots.push(hozo_ir::SlotStyle {
                slot: hozo_ir::ClassSlot::ROOT,
                style: Vec::new(),
                carried: Vec::new(),
                fallback: Vec::new(),
                evaluation: Some(Box::new(hozo_ir::ClassEvaluation {
                    span,
                    steps: steps.clone(),
                    scope: hozo_ir::ClassCaptureScope::Subtree {
                        expression_container,
                    },
                })),
                span,
            });
            span
        }
    };
    // A secondary list's guards and values now name the element's plan.
    for (index, from, offset) in slot_offsets {
        let slot = &mut props.class_slots[index];
        for declaration in &mut slot.style {
            rebase_captures(&mut declaration.condition, from, span, offset);
        }
        slot.evaluation = Some(Box::new(hozo_ir::ClassEvaluation {
            span,
            steps: steps.clone(),
            scope: hozo_ir::ClassCaptureScope::Shared,
        }));
    }
}

/// Moves the captures of the plan at `from` to the plan at `to`, `by` slots on.
fn rebase_captures(condition: &mut Condition, from: SourceSpan, to: SourceSpan, by: usize) {
    fn rebase(
        capture: &mut hozo_ir::ClassPredicateCapture,
        from: SourceSpan,
        to: SourceSpan,
        by: usize,
    ) {
        if capture.plan == from {
            capture.plan = to;
            capture.index += by;
        }
    }
    fn walk(expression: &mut ConditionExpr, from: SourceSpan, to: SourceSpan, by: usize) {
        match expression {
            ConditionExpr::Captured(capture) => rebase(capture, from, to, by),
            ConditionExpr::ClassConflict(conflict) => {
                if let Some(capture) = conflict.capture.as_mut() {
                    rebase(capture, from, to, by);
                }
            }
            ConditionExpr::Not(inner) => walk(inner, from, to, by),
            ConditionExpr::And(a, b) | ConditionExpr::Or(a, b) => {
                walk(a, from, to, by);
                walk(b, from, to, by);
            }
            _ => {}
        }
    }
    match condition {
        Condition::Expr(inner) => walk(inner, from, to, by),
        Condition::All(conditions) => {
            for inner in conditions {
                rebase_captures(inner, from, to, by);
            }
        }
        _ => {}
    }
}

struct Safety {
    /// Values evaluated outside the new arrow, so free to suspend.
    skip: Vec<Span>,
    safe: bool,
}

impl<'a> Visit<'a> for Safety {
    fn visit_jsx_attribute(&mut self, attribute: &JSXAttribute<'a>) {
        // The class inputs are arguments *outside* the new closure, so their
        // await/yield/direct-eval keep the author's scope and are allowed.
        if !self.skip.contains(&attribute.span) {
            oxc_ast_visit::walk::walk_jsx_attribute(self, attribute);
        }
    }

    fn visit_expression(&mut self, expression: &Expression<'a>) {
        if !self.skip.contains(&expression.span()) {
            oxc_ast_visit::walk::walk_expression(self, expression);
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
    fn mixed_templates_capture_only_opaque_parts_in_the_authored_branch() {
        for host in ["View", "Text"] {
            let source = format!("import {{{host}}} from '@hozo/core'; const own='p-2 rounded-md'; const el=<{host} className={{choose() ? `${{own}} ${{extra()}} ${{last()}}` : own}} />");
            let parsed = crate::parse_tsx(&source);
            let root = &parsed.roots[0].node;
            let plan = root
                .root_class_evaluation()
                .expect("guarded template capture");
            let residuals = root
                .class_name_fallback
                .iter()
                .map(|r| &source[r.0.start as usize..r.0.end as usize])
                .collect::<Vec<_>>();
            assert_eq!(residuals, ["extra()", "last()"]);
            let input = plan.render(&source);
            assert_eq!(input.matches("choose()").count(), 1);
            assert!(input.contains("`${(extra())}`"), "{input}");
            assert!(input.contains("`${(last())}`"), "{input}");
            assert!(
                !input.contains("own"),
                "compiled constants do not reenter candidates"
            );
        }
        let source = "import {Chip} from '@hozo/core'; const own='p-2'; const el=<Chip label='x' removeClassName={choose() ? `${own} ${extra()}` : own} />";
        let parsed = crate::parse_tsx(source);
        let slot = &parsed.roots[0].node.props.class_slots[0];
        assert!(
            slot.evaluation.is_some(),
            "secondary slots share the same plan"
        );
        assert_eq!(slot.fallback.len(), 1);
        let span = slot.fallback[0].0;
        assert_eq!(&source[span.start as usize..span.end as usize], "extra()");
    }

    #[test]
    fn incomplete_or_lexically_unsafe_templates_keep_the_legacy_route() {
        for jsx in [
            "<View className={choose() ? `p-${extra()}` : own} />",
            "<View className={choose() ? `${own} ${inner() ? 'p-4' : 'p-8'}` : own} />",
        ] {
            let source =
                format!("import {{View}} from '@hozo/core'; const own='p-2'; const el={jsx}");
            let parsed = crate::parse_tsx(&source);
            assert!(
                parsed.roots[0].node.root_class_evaluation().is_none(),
                "{jsx}"
            );
        }
        let source = "import {View} from '@hozo/core';const own='p-2 project-custom';const el=<View className={choose() ? `${own} ${extra()}` : own} />";
        let parsed = crate::parse_tsx(source);
        assert!(parsed.roots[0].node.root_class_evaluation().is_none());
        let fallback = &parsed.roots[0].node.class_name_fallback;
        assert_eq!(fallback.len(), 1);
        assert!(
            source[fallback[0].0.start as usize..fallback[0].0.end as usize].contains("choose()")
        );
    }

    #[test]
    fn roots_capture_before_children_and_evaluate_earlier_props_in_place() {
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
        // An evaluated prop before the class joins the plan ahead of it
        // (#1879), rather than refusing the capture.
        for (jsx, values) in [
            (
                "<View testID={before()} className={guard() && 'p-2'} />",
                ["(before())", "...((guard()) ? [true] : [false])"],
            ),
            (
                "<View {...before()} className={guard() && 'p-2'} />",
                ["(before())", "...((guard()) ? [true] : [false])"],
            ),
            (
                "<View testID={before()} className={choose() ? `${own} ${extra()}` : own} />",
                [
                    "(before())",
                    "...((choose()) ? [true, `${(extra())}`] : [false, void 0])",
                ],
            ),
        ] {
            let source =
                format!("import {{View}} from '@hozo/core'; const own='p-2'; const el = {jsx}");
            let parsed = crate::parse_tsx(&source);
            let plan = parsed.roots[0]
                .node
                .root_class_evaluation()
                .unwrap_or_else(|| panic!("{jsx}"));
            assert_eq!(
                plan.render(&source),
                format!("[{}]", values.join(", ")),
                "{jsx}"
            );
        }
        for jsx in [
            "<View className={guard() && 'p-2'}>{eval('thing')}</View>",
            // An element in the earlier value would lose its lowering to
            // the plan's copy of the source.
            "<View footer={render(<Text />)} className={guard() && 'p-2'} />",
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
