//! Decision 013's per-element assessment: what the run-time inheritance
//! protocol can carry, and when a Text needs no reader at all. Class
//! resolution and Native scalar conversion stay with the ordinary lowering.
use std::collections::HashSet;

use hozo_ir::{Child, Condition, Length, LetterSpacing, LineHeight, Node, StyleProperty, Theme};

const FIELDS: [&str; 7] = [
    "color",
    "fontSize",
    "fontWeight",
    "lineHeight",
    "letterSpacing",
    "textAlign",
    "textTransform",
];

/// Decision 013: a declaration the run-time protocol can carry as written.
/// Unconditional, resolved, and only the seven fields. Anything else stays
/// with ordinary lowering, which is what this route promises not to make
/// worse.
pub(super) fn protocol_scalar(declaration: &hozo_ir::StyleDeclaration, theme: &Theme) -> bool {
    if declaration.condition != Condition::Always
        || matches!(
            declaration.property,
            StyleProperty::FontSize(Length::Unit(..))
                | StyleProperty::LineHeight(LineHeight::Ratio(..))
                | StyleProperty::LineHeight(LineHeight::Length(Length::Unit(..)))
                | StyleProperty::LetterSpacing(LetterSpacing::Em(..))
                | StyleProperty::LetterSpacing(LetterSpacing::Px(Length::Unit(..)))
        )
    {
        return false;
    }
    let values = super::style::property_and_value(&declaration.property, theme);
    !values.is_empty()
        && values
            .iter()
            .all(|(name, value)| FIELDS.contains(name) && scalar(name, value))
}

/// Whether these declarations, written on or handed down to one Text, set
/// every protocol field unconditionally. Then nothing an ancestor outside
/// the file publishes can show through, and the Text needs no reader.
pub(super) fn covers_protocol<'a>(
    declarations: impl IntoIterator<Item = &'a hozo_ir::StyleDeclaration>,
    theme: &Theme,
) -> bool {
    let mut fields = HashSet::new();
    for declaration in declarations {
        if declaration.condition != Condition::Always {
            continue;
        }
        for (name, _) in super::style::property_and_value(&declaration.property, theme) {
            if FIELDS.contains(&name) {
                fields.insert(name);
            }
        }
    }
    FIELDS.iter().all(|name| fields.contains(name))
}

/// Whether anything inside this Text renders through code the compiler does
/// not read. A Text rendered there inherits natively from this host, so it
/// must not also apply a frame published further out.
pub(super) fn has_opaque(node: &Node) -> bool {
    node.children.iter().any(|child| match child {
        Child::Verbatim { .. } => true,
        Child::Node(node) => has_opaque(node),
        Child::Text(_) => false,
    })
}

fn scalar(name: &str, value: &str) -> bool {
    let string = value.strip_prefix('\'').and_then(|s| s.strip_suffix('\''));
    match name {
        "color" => string.and_then(|s| s.strip_prefix('#')).is_some_and(|s| {
            [3, 4, 6, 8].contains(&s.len()) && s.bytes().all(|c| c.is_ascii_hexdigit())
        }),
        "fontWeight" => string
            .and_then(|s| s.parse::<u16>().ok())
            .is_some_and(|n| (100..=900).contains(&n) && n % 100 == 0),
        "fontSize" | "lineHeight" | "letterSpacing" => {
            value.parse::<f64>().is_ok_and(f64::is_finite)
        }
        "textAlign" => matches!(
            string,
            Some("left" | "center" | "right" | "auto" | "justify")
        ),
        "textTransform" => matches!(
            string,
            Some("none" | "uppercase" | "lowercase" | "capitalize")
        ),
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    const COMPLETE: &str = "text-[#111111] text-[22px] leading-[32px] tracking-[1px] font-semibold text-left uppercase";

    fn unified(body: &str) -> crate::LowerOutput {
        let source = format!("import {{Text,View}} from '@hozo/core'; const el={body}");
        let parsed = hozo_parser::parse_tsx(&source);
        crate::lower_text_unified(
            &parsed.roots[0].node,
            &[],
            &source,
            &Theme::default(),
            false,
        )
    }

    #[test]
    fn unified_reads_only_at_the_outermost_text_and_publishes_only_around_opaque_children() {
        // Outermost reads; nested inherits natively from it.
        let out = unified("<Text>a<Text className=\"font-bold\">b</Text></Text>");
        assert!(out.jsx.starts_with("<HozoInheritedLeafText"), "{}", out.jsx);
        assert!(out.jsx.contains("<Text style="), "{}", out.jsx);
        assert!(!out.jsx.contains("hozoOpaque"), "{}", out.jsx);
        // A child the compiler cannot read inherits from this host natively.
        let out = unified("<Text>Hi {name}</Text>");
        assert!(out.jsx.contains(" hozoOpaque"), "{}", out.jsx);
        // Every field set: nothing from outside can show through.
        let out = unified(&format!("<Text className=\"{COMPLETE}\">x</Text>"));
        assert!(out.runtime_imports.is_empty(), "{}", out.jsx);
        // A visible Text gets the container's values copied; no scope.
        let out = unified("<View className=\"text-lg\"><Text>x</Text></View>");
        assert!(!out.jsx.contains("HozoInheritedScope"), "{}", out.jsx);
        // An opaque child gets a scope and the warning goes.
        let out = unified("<View className=\"text-lg text-red-500\"><Label/></View>");
        assert!(
            out.jsx.contains("<View><HozoInheritedScope style="),
            "{}",
            out.jsx
        );
        assert!(out.diagnostics.is_empty(), "{:?}", out.diagnostics);
    }

    #[test]
    fn unified_keeps_the_warning_for_what_the_protocol_cannot_carry() {
        // Conditional: not carried, so the ordinary warning stays and no
        // scope claims to have handled it.
        let out = unified("<View className=\"hover:text-red-500\"><Label/></View>");
        assert!(!out.jsx.contains("HozoInheritedScope"), "{}", out.jsx);
        assert!(!out.diagnostics.is_empty());
        // Partly carried: the scope publishes the size; the warning remains
        // for the rest.
        let out = unified("<View className=\"text-lg hover:text-red-500\"><Label/></View>");
        assert!(out.jsx.contains("HozoInheritedScope"), "{}", out.jsx);
        assert!(!out.diagnostics.is_empty());
    }

    #[test]
    fn unified_scope_sits_outside_layout_wrappers_that_read_their_children() {
        let out = unified("<View className=\"grid grid-cols-2 text-lg\"><Label/><Label/></View>");
        let scope = out.jsx.find("<HozoInheritedScope").expect("scope");
        let grid = out.jsx.find("<HozoGrid").expect("grid");
        assert!(scope < grid, "{}", out.jsx);
    }

    #[test]
    fn unified_scope_never_hides_children_from_a_component_that_reads_them() {
        // A table section clones its rows; a ScrollView counts its children.
        for source in [
            "<Table className=\"text-sm\"><TableBody>{rows}</TableBody></Table>",
            "<ScrollView className=\"text-sm\">{rows}</ScrollView>",
        ] {
            let out = unified(source);
            assert!(!out.jsx.contains("HozoInheritedScope"), "{}", out.jsx);
        }
    }

    #[test]
    fn every_field_is_required_before_a_text_needs_no_reader() {
        let source = format!("import {{Text}} from '@hozo/core';const el=<Text className=\"{COMPLETE}\">Label</Text>");
        let parsed = hozo_parser::parse_tsx(&source);
        let theme = Theme::default();
        assert!(covers_protocol(&parsed.roots[0].node.style, &theme));
        for field in FIELDS {
            let mut root = parsed.roots[0].node.clone();
            root.style.retain(|declaration| {
                !super::super::style::property_and_value(&declaration.property, &theme)
                    .iter()
                    .any(|(name, _)| *name == field)
            });
            assert!(!covers_protocol(&root.style, &theme), "{field}");
        }
        // A conditional value can be absent when it matters.
        let dark = source.replace("text-[#111111]", "dark:text-[#111111]");
        let parsed = hozo_parser::parse_tsx(&dark);
        assert!(!covers_protocol(&parsed.roots[0].node.style, &theme));
    }
}
