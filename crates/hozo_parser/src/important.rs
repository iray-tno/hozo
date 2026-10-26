//! Important syntax is a cascade fact, not part of a spacing/color value.
//! Until the common output plan owns its precedence, recognize it for
//! diagnostics without silently applying the normal utility instead.
use hozo_ir::{Child, Diagnostic, DiagnosticCode, Node, Severity};
use std::borrow::Cow;

pub const IMPORTANT_NOT_LOWERED: &str = "Tailwind important utilities are not lowered by Hozo yet. Removing `!` would lose their precedence; the shared static/fallback ordering implementation is still in progress.";

pub(crate) fn normalized(token: &str) -> Option<Cow<'_, str>> {
    // Most classes have no marker: don't run the variant parser for them.
    if !token.as_bytes().contains(&b'!') {
        return None;
    }
    let (_, base) = crate::tailwind::parse_variant_prefix(token);
    if crate::tailwind::has_unstripped_variant(token) {
        return None;
    }
    if let Some(base) = base.strip_suffix('!') {
        if base.is_empty() || base.starts_with('!') || base.ends_with('!') {
            return None;
        }
        return Some(Cow::Borrowed(&token[..token.len() - 1]));
    }
    let inner = base.strip_prefix('!')?;
    if inner.is_empty() || inner.starts_with('!') {
        return None;
    }
    Some(Cow::Owned(format!(
        "{}{inner}",
        &token[..token.len() - base.len()]
    )))
}

fn owner(node: &Node, start: u32) -> Option<&Node> {
    if node.opening_tag_span.start == start {
        return Some(node);
    }
    for prop in &node.props.passthrough {
        for nested in &prop.nested {
            if let Some(found) = owner(&nested.node, start) {
                return Some(found);
            }
        }
    }
    for child in &node.children {
        match child {
            Child::Node(child) => {
                if let Some(found) = owner(child, start) {
                    return Some(found);
                }
            }
            Child::Verbatim { nested, .. } => {
                for nested in nested {
                    if let Some(found) = owner(&nested.node, start) {
                        return Some(found);
                    }
                }
            }
            Child::Text(_) => {}
        }
    }
    None
}

/// Reuse the module's existing literal facts and lowered owners. Do not
/// reinterpret a foreign component's class contract or parse an AST again.
pub(crate) fn diagnose(
    roots: &[crate::Root],
    lists: &[crate::RuntimeClassList],
    out: &mut Vec<Diagnostic>,
) {
    for list in lists {
        if !list
            .literals
            .iter()
            .any(|literal| literal.as_bytes().contains(&b'!'))
        {
            continue;
        }
        let mut seen = std::collections::HashSet::new();
        for name in list
            .literals
            .iter()
            .flat_map(|literal| literal.split_whitespace())
        {
            if normalized(name).is_none()
                || !seen.insert(name)
                || !crate::resolve_class_name(name).is_some_and(|utility| utility.important)
            {
                continue;
            }
            let Some(node) = roots
                .iter()
                .find_map(|root| owner(&root.node, list.element_span.start))
            else {
                continue;
            };
            if list.prop != "className"
                && !node
                    .primitive
                    .class_slots()
                    .iter()
                    .any(|slot| slot.class_prop == list.prop)
            {
                continue;
            }
            out.push(Diagnostic {
                code: DiagnosticCode::TailwindImportantNotLowered,
                severity: Severity::Warning,
                message: format!("`{name}` in {}: {IMPORTANT_NOT_LOWERED}", list.prop),
                span: list.span,
            });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_outer_markers_on_the_base_are_important_syntax() {
        for (input, expected) in [
            ("p-2!", "p-2"),
            ("!p-2", "p-2"),
            ("hover:p-2!", "hover:p-2"),
            ("hover:!p-2", "hover:p-2"),
            ("bg-[url(a!)]!", "bg-[url(a!)]"),
        ] {
            assert_eq!(normalized(input).as_deref(), Some(expected));
        }
        for input in [
            "p-2",
            "!",
            "p-2!!",
            "!p-2!",
            "!!p-2",
            "!hover:p-2",
            "mystery:p-2!",
            "bg-[url(a!)]",
            "content-['!']",
        ] {
            assert!(normalized(input).is_none(), "{input}");
        }
    }

    #[test]
    fn lowered_root_slots_and_known_branches_report_once_but_foreign_components_do_not() {
        let source = r#"import {View,Avatar,cx} from '@hozo/core'; import {View as Foreign} from 'foreign';
            const el=<View className={cx('p-2!', ready && 'p-2!')}>
              <Avatar fallbackClassName="hover:!p-4"/>
              <Foreign className="p-2!"/>
            </View>;"#;
        let parsed = crate::parse_tsx_with(source, Some(&["@hozo/core".into()]));
        let found: Vec<_> = parsed
            .diagnostics
            .iter()
            .filter(|d| d.code == DiagnosticCode::TailwindImportantNotLowered)
            .collect();
        assert_eq!(found.len(), 2);
        assert!(found.iter().all(|d| d.severity == Severity::Warning));
    }
}
