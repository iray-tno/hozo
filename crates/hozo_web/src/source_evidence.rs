use hozo_ir::SourceSpan;

/// Exact bytes copied by a rendering branch, not a search in its output.
pub struct SourceCopy {
    pub span: SourceSpan,
    pub emitted_start: usize,
    pub emitted_end: usize,
}

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
    if let Some(copies) = copies {
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
