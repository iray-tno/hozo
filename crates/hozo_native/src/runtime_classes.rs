//! Which classes in a module's class props React Native cannot draw (#1165).
//!
//! The static backend reports a Web-only class on an element it lowers. A
//! class list handed to a pattern -- `sheetClassName={sheet}` on a
//! `BottomSheet`, which is an ordinary component to the compiler -- went to
//! the runtime resolver unexamined, so a `before:` grabber or a `backdrop:`
//! scrim was missing on Native and nothing said so.
//!
//! The verdict is deliberately narrow: only what no route can supply.
//! `hover:`, `aria-*:`, `data-*:` and `disabled:` are left alone, because a
//! pattern's Native half may hand its resolver exactly that state (#886,
//! `hozoClasses(rowClassName, { 'aria-selected': ... })`); calling them
//! missing would be wrong for the components that do. What is reported is
//! a pseudo-element (but `placeholder:`, which a `TextInput` carries as
//! a prop), a relation to another element (`peer-`, `has-`, `focus-within:`),
//! a question only a browser can answer (`supports-`, `visited:`, `target:`,
//! form validation, an arbitrary selector or at-rule), and a property
//! React Native has no style for.

use hozo_ir::{Condition, FormState, PseudoElement, StyleProperty};

/// How much a class's absence matters on Native.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NativeClassKind {
    /// Something the Web draws and Native does not: a marker, a scrim, a
    /// position.
    Missing,
    /// Something with no meaning on a touch screen or no declarative form
    /// on Native: a cursor shape, a CSS transition. Nothing is missing that
    /// the reader would see as broken.
    Cosmetic,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NativeClassVerdict {
    pub kind: NativeClassKind,
    pub reason: String,
}

/// Why a condition can never be true on React Native, whatever renders it.
fn never_on_native(condition: &Condition) -> Option<String> {
    match condition {
        Condition::PseudoElement(PseudoElement::Placeholder) => None,
        Condition::PseudoElement(pseudo) => Some(format!(
            "`{}:` styles a pseudo-element, which React Native does not have",
            pseudo.variant_name()
        )),
        Condition::Peer(_) => {
            Some("`peer-…:` is a sibling selector, and React Native has none".into())
        }
        Condition::Has(_) | Condition::HasSelector(_) => {
            Some("`has-…:` asks about descendants, which React Native cannot".into())
        }
        Condition::FocusWithin => Some(
            "`focus-within:` asks about focus inside an element, which React Native cannot".into(),
        ),
        Condition::Supports(_) => Some("`supports-…:` is a CSS feature query".into()),
        Condition::Visited => Some("`visited:` needs a browsing history".into()),
        Condition::Target => Some("`target:` needs a document URL fragment".into()),
        Condition::FormState(FormState::ReadOnly) => None,
        Condition::FormState(state) => Some(format!(
            "`{}:` is the DOM's constraint validation, which React Native does not have",
            state.variant_name()
        )),
        Condition::ArbitrarySelector(selector) => Some(format!(
            "`[{selector}]:` is a CSS selector, and React Native has none"
        )),
        Condition::ArbitraryAtRule(rule) => Some(format!("`[{rule}]:` is a CSS at-rule")),
        Condition::All(conditions) => conditions.iter().find_map(never_on_native),
        Condition::Not(inner) | Condition::Group(inner) => never_on_native(inner),
        _ => None,
    }
}

fn cosmetic(property: &StyleProperty) -> bool {
    matches!(
        property,
        StyleProperty::Cursor(..)
            | StyleProperty::TransitionProperty(..)
            | StyleProperty::TransitionDuration(..)
            | StyleProperty::TransitionDelay(..)
            | StyleProperty::TransitionTimingFunction(..)
    )
}

/// What React Native makes of one class: `None` when it can draw it, or
/// when it may, given state its owner supplies.
pub fn native_class_verdict(class_name: &str) -> Option<NativeClassVerdict> {
    let utility = hozo_parser::resolve_class_name(class_name)?;
    let mut found: Option<NativeClassVerdict> = None;
    for (condition, properties) in &utility.groups {
        if let Some(reason) = never_on_native(condition) {
            return Some(NativeClassVerdict {
                kind: NativeClassKind::Missing,
                reason,
            });
        }
        for property in properties {
            let Some(reason) = property.unsupported_on_native() else {
                continue;
            };
            let kind = if cosmetic(property) {
                NativeClassKind::Cosmetic
            } else {
                NativeClassKind::Missing
            };
            if kind == NativeClassKind::Missing {
                return Some(NativeClassVerdict { kind, reason });
            }
            found.get_or_insert(NativeClassVerdict { kind, reason });
        }
    }
    found
}

/// A class in a module's class prop that React Native cannot draw.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NativeClassFinding {
    pub element: String,
    pub prop: String,
    pub class_name: String,
    pub kind: NativeClassKind,
    pub reason: String,
    pub span: hozo_ir::SourceSpan,
}

/// Every class in the module's class props that React Native cannot draw,
/// once per element, prop and class.
pub fn native_class_report(source: &str) -> Vec<NativeClassFinding> {
    let mut out: Vec<NativeClassFinding> = Vec::new();
    for list in hozo_parser::runtime_class_lists(source) {
        for literal in &list.literals {
            for class_name in literal.split_whitespace() {
                let Some(verdict) = native_class_verdict(class_name) else {
                    continue;
                };
                let seen = out.iter().any(|finding| {
                    finding.element == list.element
                        && finding.prop == list.prop
                        && finding.class_name == class_name
                });
                if !seen {
                    out.push(NativeClassFinding {
                        element: list.element.clone(),
                        prop: list.prop.clone(),
                        class_name: class_name.to_string(),
                        kind: verdict.kind,
                        reason: verdict.reason,
                        span: list.span,
                    });
                }
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn kind(class_name: &str) -> Option<NativeClassKind> {
        native_class_verdict(class_name).map(|verdict| verdict.kind)
    }

    #[test]
    fn what_no_route_can_draw_is_missing_and_a_cursor_or_transition_is_cosmetic() {
        assert_eq!(kind("before:block"), Some(NativeClassKind::Missing));
        assert_eq!(kind("after:content-['']"), Some(NativeClassKind::Missing));
        assert_eq!(kind("backdrop:bg-black/50"), Some(NativeClassKind::Missing));
        assert_eq!(
            kind("peer-hover:bg-red-500"),
            Some(NativeClassKind::Missing)
        );
        assert_eq!(kind("[&>*]:p-2"), Some(NativeClassKind::Missing));
        assert_eq!(kind("cursor-not-allowed"), Some(NativeClassKind::Cosmetic));
        assert_eq!(kind("transition-colors"), Some(NativeClassKind::Cosmetic));
        assert_eq!(
            kind("aria-disabled:cursor-not-allowed"),
            Some(NativeClassKind::Cosmetic)
        );
    }

    #[test]
    fn state_an_owner_may_supply_and_ordinary_classes_are_not_reported() {
        for class_name in [
            "p-4",
            "bg-red-500",
            "cursor-pointer",
            "hover:bg-red-500",
            "aria-selected:font-semibold",
            "data-[state=closed]:opacity-0",
            "disabled:opacity-50",
            "placeholder:text-red-500",
            "starting:opacity-0",
            "not-a-class",
        ] {
            assert_eq!(kind(class_name), None, "{class_name}");
        }
    }

    #[test]
    fn a_pattern_class_prop_is_read_through_module_constants_and_ternaries() {
        // `BottomSheet` is an ordinary component to the compiler, so this
        // class list went to React Native's resolver unexamined (#1165).
        let source = r#"
            import { BottomSheet } from '@hozo/patterns'
            const handle = 'flex h-6 before:block before:h-1 cursor-grab'
            const open = 'p-4'
            export function Sheet({ wide }) {
              return <BottomSheet handleClassName={handle} className={wide ? `${open} backdrop:bg-black` : open} />
            }
        "#;
        let report = native_class_report(source);
        let found: Vec<(&str, &str, NativeClassKind)> = report
            .iter()
            .map(|f| (f.prop.as_str(), f.class_name.as_str(), f.kind))
            .collect();
        assert_eq!(
            found,
            vec![
                ("handleClassName", "before:block", NativeClassKind::Missing),
                ("handleClassName", "before:h-1", NativeClassKind::Missing),
                ("handleClassName", "cursor-grab", NativeClassKind::Cosmetic),
                ("className", "backdrop:bg-black", NativeClassKind::Missing),
            ]
        );
        assert!(report.iter().all(|f| f.element == "BottomSheet"));
    }
}
