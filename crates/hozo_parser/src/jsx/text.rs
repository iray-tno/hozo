//! JSX text children, with entities decoded and whitespace collapsed.

use oxc_allocator::{Allocator, ArenaStringBuilder};

/// Applies JSX's whitespace rules to a text child, matching what Babel and
/// TypeScript do so Hozo's output says what the source said.
///
/// The rules are not "trim". Whitespace *containing a newline* at either
/// end is dropped, which is what makes indented markup work; whitespace
/// within a line is significant, which is what makes `Hello {name}` keep
/// its space. Trimming instead -- as this did until 2026-08-15 -- silently
/// glued that pair together.
/// Resolves the character references in JSX text.
///
/// `&lt;` in a JSX child is the character `<` -- that is the whole reason
/// an author writes it, since a bare `<` would open a tag. Both backends
/// re-emit text as a string literal, which skips the step JSX would have
/// taken, so the entity survived all the way to the DOM and the browser
/// escaped the `&` on the way in: a page reading "a semantic
/// &amp;lt;article&amp;gt; element". A bare `&` was always fine, which is
/// why this stayed invisible.
///
/// The table is oxc's, which is TypeScript's JSX transformer's, rather than
/// a list of the entities that happened to come to mind. Numeric references
/// (`&#60;` and `&#x3C;`) come with it, and so does the rule for an
/// unrecognised name, which is to leave it exactly as written.
///
/// Runs after `clean_jsx_text` and not before. JSX trims literal
/// whitespace and then resolves references, so `&#32;` is a space that
/// survives trimming and `&nbsp;` is not whitespace at all.
///
/// The arena is built only when there is something to decode. Most text
/// has no `&` in it, and the check costs one scan against an allocation.
pub(super) fn decode_jsx_entities(text: &str) -> String {
    if !text.contains('&') {
        return text.to_string();
    }
    let allocator = Allocator::default();
    let mut decoded: Option<ArenaStringBuilder> = None;
    oxc_syntax::xml_entities::decode_entities(text, &mut decoded, text.len(), &allocator);
    decoded.map_or_else(|| text.to_string(), |builder| builder.to_string())
}

pub(super) fn clean_jsx_text(raw: &str) -> String {
    let lines: Vec<&str> = raw.split(['\r', '\n']).collect();
    let last_non_empty = lines
        .iter()
        .rposition(|line| line.contains(|c: char| c != ' ' && c != '\t'))
        .unwrap_or(0);

    let mut out = String::new();
    for (index, line) in lines.iter().enumerate() {
        let mut trimmed = line.replace('\t', " ");
        if index != 0 {
            trimmed = trimmed.trim_start_matches(' ').to_string();
        }
        if index != lines.len() - 1 {
            trimmed = trimmed.trim_end_matches(' ').to_string();
        }
        if trimmed.is_empty() {
            continue;
        }
        out.push_str(&trimmed);
        // Lines that ran together in the source are joined by one space,
        // except after the last one that had content.
        if index != last_non_empty {
            out.push(' ');
        }
    }
    out
}
