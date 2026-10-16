//! Compile-time capture plans, not an application-time expression interpreter.
//! The emitted array evaluates source expressions in their original branch and
//! order. It is an argument to a generated closure, so `await`, `yield`, `this`
//! and `arguments` remain in the author's scope rather than a new function.

use crate::{ConditionExpr, ExprRef, SourceSpan};

/// Boxed in ConditionExpr so ordinary (uncaptured) guards keep their compact
/// representation. New capability must not enlarge every style declaration.
#[derive(Debug, Clone, PartialEq)]
pub struct ClassPredicateCapture {
    pub plan: SourceSpan,
    pub index: usize,
    pub reference: ExprRef,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ClassEvaluation {
    pub span: SourceSpan,
    pub steps: Vec<ClassEvaluationStep>,
    pub scope: ClassCaptureScope,
}

/// Prop captures enclose one value; root captures enclose JSX and its
/// consumers. The parser records replacement grammar across unknown tags.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ClassCaptureScope {
    Prop,
    Subtree { expression_container: bool },
}

impl ClassEvaluation {
    pub fn expression_container(&self) -> bool {
        matches!(
            self.scope,
            ClassCaptureScope::Subtree {
                expression_container: true
            }
        )
    }

    pub fn wrap_subtree(&self, source: &str, result: &str) -> String {
        let expression = self.wrap(source, result);
        if self.expression_container() {
            format!("{{{expression}}}")
        } else {
            expression
        }
    }

    pub fn wrapper_offset(&self, source: &str) -> usize {
        self.wrapper_prefix(source).len() + usize::from(self.expression_container())
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum ClassEvaluationStep {
    Value(ExprRef),
    Branch {
        test: ExprRef,
        consequent: Vec<Self>,
        alternate: Vec<Self>,
    },
}

impl ClassEvaluationStep {
    fn width(&self) -> usize {
        match self {
            Self::Value(_) => 1,
            Self::Branch {
                consequent,
                alternate,
                ..
            } => {
                1 + consequent.iter().map(Self::width).sum::<usize>()
                    + alternate.iter().map(Self::width).sum::<usize>()
            }
        }
    }

    fn references(&self, out: &mut Vec<ExprRef>) {
        match self {
            Self::Value(reference) => out.push(*reference),
            Self::Branch {
                test,
                consequent,
                alternate,
            } => {
                out.push(*test);
                for step in consequent.iter().chain(alternate) {
                    step.references(out);
                }
            }
        }
    }

    fn render(&self, source: &str) -> String {
        let text =
            |reference: ExprRef| &source[reference.0.start as usize..reference.0.end as usize];
        match self {
            Self::Value(reference) => format!("({})", text(*reference)),
            Self::Branch {
                test,
                consequent,
                alternate,
            } => {
                let on_true = std::iter::once("true".to_string())
                    .chain(consequent.iter().map(|step| step.render(source)))
                    .chain((0..alternate.iter().map(Self::width).sum()).map(|_| "void 0".into()))
                    .collect::<Vec<_>>()
                    .join(", ");
                let on_false = std::iter::once("false".to_string())
                    .chain((0..consequent.iter().map(Self::width).sum()).map(|_| "void 0".into()))
                    .chain(alternate.iter().map(|step| step.render(source)))
                    .collect::<Vec<_>>()
                    .join(", ");
                format!("...(({}) ? [{on_true}] : [{on_false}])", text(*test))
            }
        }
    }
}

impl ClassEvaluation {
    pub fn binding(source: &str, span: SourceSpan) -> String {
        let mut name = format!("__hozoClassPlan{}", span.start);
        while source.contains(&name) {
            name.push('_');
        }
        name
    }

    pub fn name(&self, source: &str) -> String {
        Self::binding(source, self.span)
    }

    pub fn references(&self) -> Vec<ExprRef> {
        let mut out = Vec::new();
        for step in &self.steps {
            step.references(&mut out);
        }
        out
    }

    pub fn value(&self, source: &str, reference: ExprRef) -> String {
        let index = self
            .references()
            .iter()
            .position(|r| *r == reference)
            .expect("every residual belongs to the capture plan");
        format!("{}[{index}]", self.name(source))
    }

    pub fn capture_condition(&self, expression: &mut ConditionExpr) {
        match expression {
            ConditionExpr::Ref(reference) => {
                let index = self
                    .references()
                    .iter()
                    .position(|r| r == reference)
                    .expect("every authored guard belongs to the capture plan");
                *expression = ConditionExpr::Captured(Box::new(ClassPredicateCapture {
                    plan: self.span,
                    index,
                    reference: *reference,
                }));
            }
            ConditionExpr::Not(inner) => self.capture_condition(inner),
            ConditionExpr::And(a, b) | ConditionExpr::Or(a, b) => {
                self.capture_condition(a);
                self.capture_condition(b);
            }
            ConditionExpr::Static(_) | ConditionExpr::Captured(_) => {}
        }
    }

    pub fn render(&self, source: &str) -> String {
        format!(
            "[{}]",
            self.steps
                .iter()
                .map(|step| step.render(source))
                .collect::<Vec<_>>()
                .join(", ")
        )
    }

    pub fn wrap(&self, source: &str, result: &str) -> String {
        format!(
            "{}{result}))({})",
            self.wrapper_prefix(source),
            self.render(source)
        )
    }

    /// Also lets source-evidence consumers shift copied ranges without
    /// searching generated code for a substring that may occur twice.
    pub fn wrapper_prefix(&self, source: &str) -> String {
        format!("(({}) => (", self.name(source))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn captures_keep_source_identity_without_capturing_authored_names() {
        let span = SourceSpan { start: 7, end: 12 };
        let source = "__hozoClassPlan7State __hozoClassPlan7_";
        assert_eq!(ClassEvaluation::binding(source, span), "__hozoClassPlan7__");
        let reference = ExprRef(SourceSpan { start: 0, end: 4 });
        let plan = ClassEvaluation {
            span,
            steps: vec![ClassEvaluationStep::Value(reference)],
            scope: ClassCaptureScope::Prop,
        };
        let mut condition = ConditionExpr::Not(Box::new(ConditionExpr::Ref(reference)));
        plan.capture_condition(&mut condition);
        assert_eq!(
            condition,
            ConditionExpr::Not(Box::new(ConditionExpr::Captured(Box::new(
                ClassPredicateCapture {
                    plan: span,
                    index: 0,
                    reference
                }
            ))))
        );
        assert_eq!(plan.value(source, reference), "__hozoClassPlan7__[0]");
    }

    #[test]
    fn capture_metadata_does_not_enlarge_the_ordinary_condition_payload() {
        assert!(std::mem::size_of::<ConditionExpr>() <= 3 * std::mem::size_of::<usize>());
        assert_eq!(
            std::mem::size_of::<Option<Box<ClassEvaluation>>>(),
            std::mem::size_of::<usize>()
        );
    }
}
