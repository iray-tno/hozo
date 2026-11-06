//! Children carried through Native rendering. Generated props are deliberately
//! not certified here: equal text alone cannot prove an authored expression.

use hozo_ir::{SourceCopy, SourceSpan};

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
        if let (Some(copies), Some(incoming)) = (&mut self.copies, other.copies) {
            copies.extend(incoming.into_iter().map(|copy| SourceCopy {
                emitted_start: copy.emitted_start + self.text.len(),
                emitted_end: copy.emitted_end + self.text.len(),
                ..copy
            }));
        }
        self.text.push_str(&other.text);
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
