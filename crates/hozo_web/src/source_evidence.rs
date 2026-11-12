pub use hozo_ir::SourceCopy;
use hozo_ir::SourceSpan;

pub(crate) struct Rendered {
    pub text: String,
    pub copies: Option<Vec<SourceCopy>>,
}

impl Rendered {
    pub fn new(evidence: bool) -> Self {
        Self {
            text: String::new(),
            copies: evidence.then(Vec::new),
        }
    }

    pub fn copy(&mut self, source: &str, start: usize, end: usize) {
        if start == end {
            return;
        }
        // A captured attribute (#1879) is written as its plan slot, and
        // the source on either side of it is still copied as itself.
        let mut cursor = start;
        for span in hozo_ir::attribute_capture::spans_within(start, end) {
            let (from, to) = (span.start as usize, span.end as usize);
            if from < cursor {
                continue;
            }
            self.copy_verbatim(source, cursor, from);
            self.text
                .push_str(&hozo_ir::attribute_capture::text(source, from, to));
            cursor = to;
        }
        self.copy_verbatim(source, cursor, end);
    }

    fn copy_verbatim(&mut self, source: &str, start: usize, end: usize) {
        if start == end {
            return;
        }
        let emitted_start = self.text.len();
        self.text.push_str(&source[start..end]);
        if let Some(copies) = &mut self.copies {
            copies.push(SourceCopy {
                span: SourceSpan {
                    start: start as u32,
                    end: end as u32,
                },
                emitted_start,
                emitted_end: self.text.len(),
            });
        }
    }

    pub fn append(&mut self, other: Self) {
        append(&mut self.text, &mut self.copies, other);
    }
}

pub(crate) fn append(text: &mut String, copies: &mut Option<Vec<SourceCopy>>, other: Rendered) {
    if let (Some(copies), Some(incoming)) = (copies, other.copies) {
        shift_into(copies, incoming, text.len());
    }
    text.push_str(&other.text);
}

pub(crate) fn shift_into(copies: &mut Vec<SourceCopy>, incoming: Vec<SourceCopy>, offset: usize) {
    copies.extend(incoming.into_iter().map(|copy| SourceCopy {
        emitted_start: copy.emitted_start + offset,
        emitted_end: copy.emitted_end + offset,
        ..copy
    }));
}

/// Only a value already sliced from the source may reach this helper. Added
/// syntax must not enclose it in a new lexical binder: normalizer/interactive
/// calls take a value, and a disabled anchor's callback is in the sibling arm.
pub(crate) fn expression(
    text: &mut String,
    copies: &mut Option<Vec<SourceCopy>>,
    source: &str,
    value: &str,
    prefix: &str,
    suffix: &str,
) {
    text.push_str(prefix);
    let emitted_start = text.len();
    text.push_str(value);
    // A value that reads a captured attribute (#1879) is no longer the
    // source's text, and is not recorded as a copy of it.
    let from_source = (value.as_ptr() as usize)
        .checked_sub(source.as_ptr() as usize)
        .is_some_and(|start| start + value.len() <= source.len());
    if let Some(copies) = copies.as_mut().filter(|_| from_source) {
        if !value.is_empty() {
            let start = value.as_ptr() as usize - source.as_ptr() as usize;
            copies.push(SourceCopy {
                span: SourceSpan {
                    start: start as u32,
                    end: (start + value.len()) as u32,
                },
                emitted_start,
                emitted_end: text.len(),
            });
        }
    }
    text.push_str(suffix);
}
