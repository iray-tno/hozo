//! Guards as opaque `ExprRef`s, and conjoining them onto a condition.

use super::*;

pub(super) fn to_expr_ref(span: Span) -> ExprRef {
    ExprRef(SourceSpan {
        start: span.start,
        end: span.end,
    })
}

pub(super) fn and_ref(current: &Option<ConditionExpr>, guard: Span) -> Option<ConditionExpr> {
    let guard = ConditionExpr::Ref(to_expr_ref(guard));
    match current {
        None => Some(guard),
        Some(existing) => Some(ConditionExpr::And(
            Box::new(existing.clone()),
            Box::new(guard),
        )),
    }
}

pub(super) fn and_not_ref(current: &Option<ConditionExpr>, guard: Span) -> Option<ConditionExpr> {
    let negated = ConditionExpr::Not(Box::new(ConditionExpr::Ref(to_expr_ref(guard))));
    match current {
        None => Some(negated),
        Some(existing) => Some(ConditionExpr::And(
            Box::new(existing.clone()),
            Box::new(negated),
        )),
    }
}

pub(super) fn to_condition(expr: Option<ConditionExpr>) -> Condition {
    match expr {
        None => Condition::Always,
        Some(expr) => Condition::Expr(expr),
    }
}

pub(super) fn conjoin_condition_with_guard(
    condition: Condition,
    guard: ConditionExpr,
) -> Condition {
    match condition {
        Condition::Always => Condition::Expr(guard),
        Condition::Expr(existing) => {
            Condition::Expr(ConditionExpr::And(Box::new(existing), Box::new(guard)))
        }
        Condition::All(mut items) => {
            if let Some(Condition::Expr(existing)) = items.first_mut() {
                let merged = ConditionExpr::And(Box::new(existing.clone()), Box::new(guard));
                *existing = merged;
                Condition::All(items)
            } else {
                let mut next = vec![Condition::Expr(guard)];
                next.extend(items);
                Condition::All(next)
            }
        }
        other => Condition::all(vec![Condition::Expr(guard), other]),
    }
}

pub(super) fn guard_nodes(guard: &ConditionExpr) -> usize {
    match guard {
        ConditionExpr::Not(inner) => 1 + guard_nodes(inner),
        ConditionExpr::And(left, right) | ConditionExpr::Or(left, right) => {
            1 + guard_nodes(left) + guard_nodes(right)
        }
        _ => 1,
    }
}
