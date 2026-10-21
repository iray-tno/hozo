//! Adds evaluation order to an already-decomposed class list. It does not
//! parse utilities or decide which helpers/expressions are compilable again.

use super::*;
use hozo_ir::{ClassEvaluation, ClassEvaluationStep as Step};

/// Retry only through the same decomposer. The caller must install this
/// replacement together with its plan, or keep its unchanged legacy result.
pub(crate) fn capture_template_parts(
    expression: &JSXExpression,
    joiners: &Joiners,
) -> Option<(Decomposed, ClassEvaluation)> {
    let mut decomposed = Decomposed::default();
    decompose(
        classify_jsx_expression(expression),
        None,
        None,
        &mut decomposed,
        joiners,
        true,
    );
    let evaluation = capture_evaluation(expression, &decomposed)?;
    Some((decomposed, evaluation))
}

fn collect_guards(expression: &ConditionExpr, out: &mut Vec<ExprRef>) {
    match expression {
        ConditionExpr::Ref(reference) => out.push(*reference),
        ConditionExpr::Not(inner) => collect_guards(inner, out),
        ConditionExpr::And(a, b) | ConditionExpr::Or(a, b) => {
            collect_guards(a, out);
            collect_guards(b, out);
        }
        ConditionExpr::Static(_) | ConditionExpr::Captured(_) => {}
    }
}

pub(crate) fn capture_evaluation(
    expression: &JSXExpression,
    decomposed: &Decomposed,
) -> Option<ClassEvaluation> {
    let mut references = decomposed.fallback.clone();
    for declaration in &decomposed.declarations {
        if let Condition::Expr(expression) = &declaration.condition {
            collect_guards(expression, &mut references);
        }
    }
    references.sort_by_key(|reference| (reference.0.start, reference.0.end));
    references.dedup();
    // A fallback containing a guard would evaluate it again alongside that
    // guard's AOT declarations. Keep the original expression whole instead.
    if references
        .windows(2)
        .any(|pair| pair[0].0.end > pair[1].0.start)
    {
        return None;
    }
    let steps = capture(classify_jsx_expression(expression), &references)?;
    let evaluation = ClassEvaluation {
        span: to_expr_ref(expression.span()).0,
        steps,
        scope: hozo_ir::ClassCaptureScope::Prop,
    };
    // No dependency may silently disappear through an unfamiliar AST shape.
    let mut captured = evaluation.references();
    captured.sort_by_key(|reference| (reference.0.start, reference.0.end));
    (captured == references).then_some(evaluation)
}

fn capture(target: Target, references: &[ExprRef]) -> Option<Vec<Step>> {
    let span = match &target {
        Target::StringLiteral(value) => value.span,
        Target::Logical(value) => value.span,
        Target::Conditional(value) => value.span,
        Target::Call(value) => value.span,
        Target::Template(value) => value.span,
        Target::Identifier(span) | Target::Other(span) => *span,
        // A spread invokes iteration rather than evaluating one class value.
        // Neither dropping iteration nor capturing `...xs` as a value is safe.
        Target::Spread(_) => return None,
    };
    if references.contains(&to_expr_ref(span)) {
        return Some(vec![Step::Value(to_expr_ref(span))]);
    }
    if !references
        .iter()
        .any(|reference| reference.0.start >= span.start && reference.0.end <= span.end)
    {
        return Some(Vec::new());
    }
    match target {
        Target::Logical(logical) => Some(vec![Step::Branch {
            test: to_expr_ref(logical.left.span()),
            consequent: capture(classify_expression(&logical.right), references)?,
            alternate: Vec::new(),
        }]),
        Target::Conditional(conditional) => Some(vec![Step::Branch {
            test: to_expr_ref(conditional.test.span()),
            consequent: capture(classify_expression(&conditional.consequent), references)?,
            alternate: capture(classify_expression(&conditional.alternate), references)?,
        }]),
        Target::Call(call) => {
            let mut out = Vec::new();
            for argument in &call.arguments {
                out.extend(capture(classify_argument(argument), references)?);
            }
            Some(out)
        }
        Target::Template(template) => {
            let mut out = Vec::new();
            for expression in &template.expressions {
                // Preserve conversion immediately after each expression,
                // before evaluating the next one. Complex partial expressions
                // remain legacy rather than guessing their conversion order.
                let part = capture(classify_expression(expression), references)?;
                match part.as_slice() {
                    [] => (),
                    [Step::Value(reference)] if *reference == to_expr_ref(expression.span()) => {
                        out.push(Step::TemplateValue(*reference));
                    }
                    _ => return None,
                }
            }
            Some(out)
        }
        _ => None,
    }
}
