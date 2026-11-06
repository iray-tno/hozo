//! Fragments carried through Native rendering. Generated/normalized props are
//! not certified here: equal text alone cannot prove an authored expression.

use hozo_ir::{SourceCopy, SourceSpan};
use std::ops::Range;

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
        other.append_into(&mut self.text, &mut self.copies);
    }

    /// Used by the existing prop writer too: generated prefix props retain
    /// their String path, while a surviving passthrough fragment carries its
    /// own emission evidence. Transformed spread arguments do not call this.
    pub fn append_into(self, text: &mut String, copies: &mut Option<Vec<SourceCopy>>) {
        if let (Some(copies), Some(incoming)) = (copies, self.copies) {
            copies.extend(incoming.into_iter().map(|copy| SourceCopy {
                emitted_start: copy.emitted_start + text.len(),
                emitted_end: copy.emitted_end + text.len(),
                ..copy
            }));
        }
        text.push_str(&self.text);
    }

    /// The branch supplies its complete output and known suffix length. This
    /// keeps ordinary formatting/allocation unchanged and never searches for
    /// the child (which can occur more than once with identical text).
    pub fn wrap(mut self, text: String, suffix_len: usize) -> Self {
        if let Some(copies) = &mut self.copies {
            let offset = text.len() - self.text.len() - suffix_len;
            for copy in copies {
                copy.emitted_start += offset;
                copy.emitted_end += offset;
            }
        }
        self.text = text;
        self
    }

    /// Project a range selected by the emitting branch into its new syntax.
    /// Only the intersections with already certified copies survive. The
    /// branch supplies the actual input range/output offset, not a text search.
    pub fn project(&self, text: String, input: Range<usize>, offset: usize) -> Self {
        let copies = self.copies.as_ref().map(|copies| {
            copies
                .iter()
                .filter_map(|copy| {
                    let start = copy.emitted_start.max(input.start);
                    let end = copy.emitted_end.min(input.end);
                    if start >= end {
                        return None;
                    }
                    let authored = copy.span.start + (start - copy.emitted_start) as u32;
                    Some(SourceCopy {
                        span: SourceSpan {
                            start: authored,
                            end: authored + (end - start) as u32,
                        },
                        emitted_start: offset + start - input.start,
                        emitted_end: offset + end - input.start,
                    })
                })
                .collect()
        });
        Self { text, copies }
    }

    /// A newly introduced lexical scope is not just an offset. Until its
    /// bindings are accounted for, none of the enclosed copies is certified.
    pub fn forget_scope(&mut self) {
        if let Some(copies) = &mut self.copies {
            copies.clear();
        }
    }
}

#[cfg(test)]
mod tests;
