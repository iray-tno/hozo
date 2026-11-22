//! Checks across the whole tree: duplicate ids and skipped heading levels.

use hozo_ir::{Child, Diagnostic, DiagnosticCode, HeadingLevel, Node, Primitive, Severity};

/// Two elements in one tree with the same `nativeID`.
///
/// Not a tidiness complaint. Every `aria-labelledby`, `aria-controls` and
/// `aria-describedby` naming that id resolves to the first element, so one
/// of the two references silently points at the wrong thing -- and it
/// points somewhere, which is why nothing about it looks broken. A field
/// labelled by the second of two `id="label"` elements announces the
/// first's text.
///
/// Only literals, and only within one file. Anything the compiler is
/// carrying may render an id it cannot see, but that can only *add* a
/// collision this does not report -- it cannot make one of these two into
/// a false positive, because both of these are here.
pub(super) fn check_duplicate_ids(root: &Node, diagnostics: &mut Vec<Diagnostic>) {
    let mut seen: Vec<String> = Vec::new();
    collect_ids(root, &mut seen, diagnostics);
}

pub(super) fn collect_ids(node: &Node, seen: &mut Vec<String>, diagnostics: &mut Vec<Diagnostic>) {
    if let Some(id) = node.props.native_id_literal.as_deref() {
        if seen.iter().any(|earlier| earlier == id) {
            diagnostics.push(Diagnostic {
                code: DiagnosticCode::A11yDuplicateId,
                severity: Severity::Warning,
                message: format!(
                    "`nativeID=\"{id}\"` is already used earlier in this file. Every \
                     `aria-labelledby` or `aria-controls` naming it resolves to the first one, \
                     so a reference meant for this element points at that one instead -- and it \
                     points somewhere, which is why nothing looks wrong."
                ),
                span: node.span,
            });
        } else {
            seen.push(id.to_string());
        }
    }
    for child in &node.children {
        if let Child::Node(child_node) = child {
            collect_ids(child_node, seen, diagnostics);
        }
    }
}

/// Heading levels that jump.
///
/// The levels are the document's outline, and a screen reader's "next
/// heading" and heading-list navigation are built on it. A jump from 1 to
/// 3 says there is a level-2 section the reader has been moved out of
/// without being told, which is why WCAG treats the outline as structure
/// rather than as typography -- the visual size is a separate decision
/// and `text-2xl` is how you make a level-2 look big.
///
/// Sound in one file despite the outline being a whole-document idea:
/// whatever wraps this component, two headings adjacent in *its* document
/// order are adjacent in the page's, and a jump between them is a jump.
/// Starting at 3 says nothing -- a component that renders a subsection is
/// doing the right thing, and only its caller knows what came before.
///
/// Anything the compiler is merely carrying resets the comparison. A
/// `{sections.map(...)}` between two headings may render any number of
/// them at any level, so the two on either side are not adjacent and
/// nothing can be said about the pair.
pub(super) fn check_heading_levels(root: &Node, diagnostics: &mut Vec<Diagnostic>) {
    let mut previous: Option<u8> = None;
    collect_heading_levels(root, &mut previous, diagnostics);
}

pub(super) fn collect_heading_levels(
    node: &Node,
    previous: &mut Option<u8>,
    diagnostics: &mut Vec<Diagnostic>,
) {
    if node.primitive == Primitive::Heading {
        // A dynamic level is a level nobody here knows.
        let level = match node.props.heading_level {
            Some(HeadingLevel::Static(level)) => Some(level),
            // `<Heading>` with no level is `h1`, which is what the Web
            // backend emits for it.
            None => Some(1),
            Some(HeadingLevel::Dynamic(_)) => None,
        };
        match level {
            Some(level) => {
                if let Some(before) = *previous {
                    if level > before + 1 {
                        diagnostics.push(Diagnostic {
                            code: DiagnosticCode::A11yHeadingLevelSkipped,
                            severity: Severity::Warning,
                            message: format!(
                                "This heading is level {level} and the one before it is level \
                                 {before}, so the outline skips level {}. Screen readers navigate \
                                 by that outline, and a jump reads as a section the listener was \
                                 moved out of without being told. Levels are structure; use a \
                                 type utility if what you wanted was a smaller heading.",
                                before + 1,
                            ),
                            span: node.span,
                        });
                    }
                }
                *previous = Some(level);
            }
            None => *previous = None,
        }
    }
    for child in &node.children {
        match child {
            Child::Node(child_node) => collect_heading_levels(child_node, previous, diagnostics),
            // Any number of headings, at any level, may come out of this.
            // The two on either side are not adjacent and the pair says
            // nothing.
            Child::Verbatim { .. } => *previous = None,
            _ => {}
        }
    }
}
