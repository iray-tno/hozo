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
//!
//! A captured value can hold elements of its own (`footer={make(<Text />)}`),
//! which a backend lowers where it copies the value. The plan evaluates the
//! value, so it has to hold that lowered text rather than the source's:
//! `lower_captured` records it while the element renders, and the plan's
//! steps and `unplan` read it back.

use std::borrow::Cow;
use std::cell::RefCell;

use crate::{ClassEvaluation, SourceSpan};

thread_local! {
    static ACTIVE: RefCell<Vec<Captured>> = const { RefCell::new(Vec::new()) };
}

struct Captured {
    span: SourceSpan,
    /// What every copy of the span writes instead: the plan's slot.
    slot: String,
    /// The value with its elements lowered, once a backend has written it.
    lowered: Option<String>,
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
        ACTIVE.with(|active| {
            active
                .borrow_mut()
                .extend(attributes.into_iter().map(|(span, slot)| Captured {
                    span,
                    slot,
                    lowered: None,
                }))
        });
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
        let mut inside: Vec<(SourceSpan, &str)> = active
            .iter()
            .map(|captured| (captured.span, captured.slot.as_str()))
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
            .map(|captured| captured.span)
            .filter(|span| start <= span.start as usize && span.end as usize <= end)
            .collect();
        spans.sort_by_key(|span| span.start);
        spans
    })
}

/// Lowers the elements inside each captured value in `start..end`, for the
/// plan to evaluate, and says which of `nested` (the spans of the elements
/// a backend lowers in that range, in order) it rendered. The backend copies
/// the rest of the range as usual, which writes those values' slots.
///
/// `render` lowers one element, by its index in `nested`. Its copy
/// evidence is not kept: the value now sits in the plan, where nothing is
/// recorded as a copy of the source.
pub fn lower_captured(
    source: &str,
    start: usize,
    end: usize,
    nested: &[SourceSpan],
    mut render: impl FnMut(usize) -> String,
) -> Vec<bool> {
    let mut rendered = vec![false; nested.len()];
    for span in spans_within(start, end) {
        let inside: Vec<usize> = (0..nested.len())
            .filter(|&index| span.start <= nested[index].start && nested[index].end <= span.end)
            .collect();
        if inside.is_empty() {
            continue;
        }
        let mut text = String::new();
        let mut cursor = span.start as usize;
        for index in inside {
            text.push_str(&source[cursor..nested[index].start as usize]);
            text.push_str(&render(index));
            cursor = nested[index].end as usize;
            rendered[index] = true;
        }
        text.push_str(&source[cursor..span.end as usize]);
        ACTIVE.with(|active| {
            if let Some(captured) = active
                .borrow_mut()
                .iter_mut()
                .rev()
                .find(|captured| captured.span == span)
            {
                captured.lowered = Some(text);
            }
        });
    }
    rendered
}

/// A captured value as the plan evaluates it: lowered, if it holds
/// elements a backend lowered, or else as written.
pub fn value(source: &str, span: SourceSpan) -> Cow<'_, str> {
    ACTIVE.with(|active| {
        active
            .borrow()
            .iter()
            .rev()
            .find(|captured| captured.span == span)
            .and_then(|captured| captured.lowered.clone())
            .map_or(
                Cow::Borrowed(&source[span.start as usize..span.end as usize]),
                Cow::Owned,
            )
    })
}

/// Takes the plan back out of an element whose emitted JSX already reads
/// its values once each, in order and eagerly: each slot is written back as
/// the source text it captured, which is the output the element had before
/// it was planned, its elements lowered. `reads_in_order` is the backend's reading of its own
/// output (`hozo_parser::plan_reads_in_order`).
///
/// Only a plan of attribute values alone: a class list's plan predates
/// #1879 and stays. A copy recorded in `copies` after a slot moves by what
/// replacing it added; the slots themselves were never recorded as copies,
/// so the values they hold come back without evidence, which a consumer
/// reads as "not known to be verbatim" rather than as anything wrong.
pub fn unplan(
    evaluation: &ClassEvaluation,
    source: &str,
    text: &mut String,
    copies: Option<&mut Vec<crate::SourceCopy>>,
    reads_in_order: impl FnOnce(&str, &str, usize) -> bool,
) -> bool {
    let attributes = evaluation.attributes(source);
    if attributes.is_empty() || attributes.len() != evaluation.references().len() {
        return false;
    }
    let name = evaluation.name(source);
    if !reads_in_order(text, &name, attributes.len()) {
        return false;
    }
    let mut edits: Vec<(usize, usize, Cow<'_, str>)> = Vec::new();
    for (span, slot) in &attributes {
        let Some(at) = text.find(slot.as_str()) else {
            return false;
        };
        edits.push((at, slot.len(), value(source, *span)));
    }
    edits.sort_by_key(|(at, _, _)| *at);
    let mut out = String::with_capacity(text.len());
    let mut cursor = 0;
    let mut shifts: Vec<(usize, isize)> = Vec::new();
    for (at, length, value) in &edits {
        out.push_str(&text[cursor..*at]);
        out.push_str(value);
        cursor = at + length;
        shifts.push((cursor, value.len() as isize - *length as isize));
    }
    out.push_str(&text[cursor..]);
    if let Some(copies) = copies {
        for copy in copies.iter_mut() {
            let delta: isize = shifts
                .iter()
                .filter(|(end, _)| *end <= copy.emitted_start)
                .map(|(_, delta)| delta)
                .sum();
            copy.emitted_start = (copy.emitted_start as isize + delta) as usize;
            copy.emitted_end = (copy.emitted_end as isize + delta) as usize;
        }
    }
    *text = out;
    true
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

    #[test]
    fn an_element_inside_a_captured_value_is_lowered_into_the_plan() {
        // `<V a={f(<T />)} b={<U />} c={g()} />`: `<T />` sits in a captured
        // value, `<U />` in one the plan leaves alone.
        let source = "<V a={f(<T />)} b={<U />} c={g()} />";
        let plan = ClassEvaluation {
            span: span(0, 36),
            steps: vec![
                ClassEvaluationStep::Attribute(ExprRef(span(6, 14))),
                ClassEvaluationStep::Attribute(ExprRef(span(29, 32))),
            ],
            scope: ClassCaptureScope::Subtree {
                expression_container: false,
            },
        };
        let nested = [span(8, 13), span(19, 24)];
        let _scope = enter(Some(&plan), source);
        let mut lowered = Vec::new();
        let planned = lower_captured(source, 3, 33, &nested, |index| {
            lowered.push(index);
            "<t />".to_string()
        });
        assert_eq!(planned, vec![true, false]);
        assert_eq!(lowered, vec![0]);
        assert_eq!(plan.render(source), "[(f(<t />)), (g())]");
        // Where the plan is taken out, the lowered value comes back.
        let mut text = "<v a={__hozoClassPlan0[0]} c={__hozoClassPlan0[1]} />".to_string();
        assert!(unplan(&plan, source, &mut text, None, |_, _, _| true));
        assert_eq!(text, "<v a={f(<t />)} c={g()} />");
    }

    #[test]
    fn an_element_read_in_order_gets_its_values_back_and_its_copies_moved() {
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
        let mut text = "<v a={__hozoClassPlan0[0]} k={x} b={__hozoClassPlan0[1]} />".to_string();
        let k = text.find('x').unwrap();
        let mut copies = vec![crate::SourceCopy {
            span: span(0, 1),
            emitted_start: k,
            emitted_end: k + 1,
        }];
        assert!(unplan(
            &plan,
            source,
            &mut text,
            Some(&mut copies),
            |_, name, count| { name == "__hozoClassPlan0" && count == 2 }
        ));
        assert_eq!(text, "<v a={f()} k={x} b={g()} />");
        assert_eq!(&text[copies[0].emitted_start..copies[0].emitted_end], "x");
        // Out of order, as the backend's reading says: the plan stays.
        let mut kept = "<v b={__hozoClassPlan0[1]} a={__hozoClassPlan0[0]} />".to_string();
        assert!(!unplan(&plan, source, &mut kept, None, |_, _, _| false));
        assert!(kept.contains("__hozoClassPlan0[1]"));
    }
}
