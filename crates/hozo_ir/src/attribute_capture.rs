//! Copies of source text that read a captured attribute value instead.
//!
//! An element whose attributes would otherwise run out of order, or more
//! than once, evaluates them in its `ClassEvaluation` plan (#1879). Every
//! backend site that copies an attribute's expression then has to write the
//! plan's slot (`__hozoClassPlan12[3]`) in place of the source text.
//!
//! There are some sixty such sites across the two backends, each slicing
//! the source by a span, and an explicit argument at each would have to be
//! threaded through every helper between them. So the substitutions are
//! scoped to the rendering of one element instead: `enter` installs them,
//! the guard it returns removes them, and `text` is the one place a backend
//! slices source. Spans are byte ranges of one source, so a nested
//! element's own plan never collides with its parent's.

use std::borrow::Cow;
use std::cell::RefCell;

use crate::{ClassEvaluation, SourceSpan};

thread_local! {
    static ACTIVE: RefCell<Vec<(SourceSpan, String)>> = const { RefCell::new(Vec::new()) };
}

/// Removes the substitutions `enter` installed when dropped.
#[must_use]
pub struct Scope {
    installed: usize,
}

impl Drop for Scope {
    fn drop(&mut self) {
        ACTIVE.with(|active| {
            let mut active = active.borrow_mut();
            let keep = active.len() - self.installed;
            active.truncate(keep);
        });
    }
}

/// Makes every copy of `evaluation`'s attribute spans read the captured
/// value until the returned scope is dropped.
pub fn enter(evaluation: Option<&ClassEvaluation>, source: &str) -> Scope {
    let attributes = evaluation.map_or_else(Vec::new, |evaluation| evaluation.attributes(source));
    let installed = attributes.len();
    if installed > 0 {
        ACTIVE.with(|active| active.borrow_mut().extend(attributes));
    }
    Scope { installed }
}

/// `source[start..end]`, with each captured span inside it replaced.
///
/// A copy of only part of a captured span would evaluate that part a second
/// time, which is the defect the capture exists to prevent; the parser
/// captures only attributes the backends copy whole, and this asserts it.
pub fn text(source: &str, start: usize, end: usize) -> Cow<'_, str> {
    ACTIVE.with(|active| {
        let active = active.borrow();
        if active.is_empty() {
            return Cow::Borrowed(&source[start..end]);
        }
        let mut inside: Vec<&(SourceSpan, String)> = active
            .iter()
            .filter(|(span, _)| {
                let (from, to) = (span.start as usize, span.end as usize);
                debug_assert!(
                    !(from < end && start < to) || (start <= from && to <= end),
                    "a copy of {start}..{end} splits the captured attribute {from}..{to}"
                );
                start <= from && to <= end
            })
            .collect();
        if inside.is_empty() {
            return Cow::Borrowed(&source[start..end]);
        }
        inside.sort_by_key(|(span, _)| span.start);
        let mut out = String::with_capacity(end - start);
        let mut cursor = start;
        for (span, value) in inside {
            let from = span.start as usize;
            if from < cursor {
                continue;
            }
            out.push_str(&source[cursor..from]);
            out.push_str(value);
            cursor = span.end as usize;
        }
        out.push_str(&source[cursor..end]);
        Cow::Owned(out)
    })
}

/// `part`, a slice of `source` read off an attribute's text, substituted.
pub fn slice<'a>(source: &'a str, part: &'a str) -> Cow<'a, str> {
    let start = part.as_ptr() as usize - source.as_ptr() as usize;
    text(source, start, start + part.len())
}

/// The captured spans inside `start..end`, for a copy that records where
/// source text landed: those parts are no longer the source's.
pub fn spans_within(start: usize, end: usize) -> Vec<SourceSpan> {
    ACTIVE.with(|active| {
        let mut spans: Vec<SourceSpan> = active
            .borrow()
            .iter()
            .map(|(span, _)| *span)
            .filter(|span| start <= span.start as usize && span.end as usize <= end)
            .collect();
        spans.sort_by_key(|span| span.start);
        spans
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{ClassCaptureScope, ClassEvaluationStep, ExprRef};

    fn span(start: u32, end: u32) -> SourceSpan {
        SourceSpan { start, end }
    }

    #[test]
    fn copies_read_the_plan_only_while_the_element_renders() {
        let source = "<V a={f()} b={g()} />";
        let plan = ClassEvaluation {
            span: span(0, 21),
            steps: vec![
                ClassEvaluationStep::Attribute(ExprRef(span(6, 9))),
                ClassEvaluationStep::Attribute(ExprRef(span(14, 17))),
            ],
            scope: ClassCaptureScope::Subtree {
                expression_container: false,
            },
        };
        assert_eq!(text(source, 6, 9), "f()");
        {
            let _scope = enter(Some(&plan), source);
            assert_eq!(text(source, 6, 9), "__hozoClassPlan0[0]");
            assert_eq!(
                text(source, 3, 18),
                "a={__hozoClassPlan0[0]} b={__hozoClassPlan0[1]}"
            );
            assert_eq!(spans_within(3, 18), vec![span(6, 9), span(14, 17)]);
        }
        assert_eq!(text(source, 6, 9), "f()");
    }
}
