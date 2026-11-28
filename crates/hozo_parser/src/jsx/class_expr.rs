//! A `className` expression lowered to conditional style declarations.

use hozo_ir::{Condition, ConditionExpr, Diagnostic, DiagnosticCode, Severity};
use oxc_ast::ast::JSXExpression;

use super::messages::{loses_to, unsupported_variant_message};
use super::scope::Scope;
use crate::dynamic_class;

/// Both root and secondary expressions use the same classifier and reports;
/// neither backend reparses a joiner to recover its static pieces.
pub(super) fn class_expression(
    expression: &JSXExpression,
    scope: &Scope,
    diagnostics: &mut Vec<Diagnostic>,
    skip_opaque: bool,
) -> Option<dynamic_class::Decomposed> {
    let joiners = dynamic_class::Joiners {
        module_record: scope.module_record,
        helpers: scope.class_helpers,
        import_refs: scope.helper_import_refs,
        constants: scope.constants,
        units: &scope.tailwind_units,
    };
    let decomposed = if skip_opaque {
        dynamic_class::decompose_class_pieces(expression, &joiners)?
    } else {
        dynamic_class::decompose_class_name(expression, &joiners)
    };
    // A helper call must not make an unsupported variant disappear without
    // the diagnostic its literal spelling would have produced.
    for report in &decomposed.unsupported_variants {
        let compiled = decomposed
            .compiled
            .iter()
            .filter(|compiled| {
                report.unconditional || compiled.unconditional || compiled.span == report.span
            })
            .map(|compiled| (compiled.token.as_str(), compiled.properties.as_slice()));
        diagnostics.push(Diagnostic {
            code: DiagnosticCode::TailwindVariantNotSupported,
            severity: Severity::Warning,
            message: unsupported_variant_message(
                &report.variant,
                &report.token,
                loses_to(&report.token, compiled),
            ),
            span: report.span,
        });
    }
    Some(decomposed)
}

pub(super) fn capture_condition_in_place(
    condition: &mut Condition,
    evaluation: &hozo_ir::ClassEvaluation,
) {
    match condition {
        Condition::Expr(expression) => evaluation.capture_condition(expression),
        Condition::All(conditions) => {
            for inner in conditions {
                capture_condition_in_place(inner, evaluation);
            }
        }
        _ => {}
    }
}

pub(super) fn has_authored_guard_expr(expression: &ConditionExpr) -> bool {
    match expression {
        ConditionExpr::Ref(_) | ConditionExpr::Captured(_) => true,
        ConditionExpr::Not(inner) => has_authored_guard_expr(inner),
        ConditionExpr::And(a, b) | ConditionExpr::Or(a, b) => {
            has_authored_guard_expr(a) || has_authored_guard_expr(b)
        }
        ConditionExpr::Static(_)
        | ConditionExpr::StateDisabled(_)
        | ConditionExpr::ClassConflict(_)
        | ConditionExpr::RawJs(_) => false,
    }
}

pub(super) fn has_authored_guard(condition: &Condition) -> bool {
    match condition {
        Condition::Expr(expression) => has_authored_guard_expr(expression),
        Condition::All(conditions) => conditions.iter().any(has_authored_guard),
        _ => false,
    }
}

pub(super) fn capture_class_expression(
    expression: &JSXExpression,
    scope: &Scope,
    decomposed: &mut dynamic_class::Decomposed,
) -> Option<hozo_ir::ClassEvaluation> {
    if let Some(evaluation) = dynamic_class::capture_evaluation(expression, decomposed) {
        return Some(evaluation);
    }
    if !decomposed.guarded_template {
        return None;
    }
    let joiners = dynamic_class::Joiners {
        module_record: scope.module_record,
        helpers: scope.class_helpers,
        import_refs: scope.helper_import_refs,
        constants: scope.constants,
        units: &scope.tailwind_units,
    };
    let (replacement, evaluation) = dynamic_class::capture_template_parts(expression, &joiners)?;
    *decomposed = replacement;
    Some(evaluation)
}
