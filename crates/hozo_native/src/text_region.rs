//! A deliberately small first static proof. Class resolution and Native
//! scalar conversion remain owned by the existing parser/style lowering.
//! Failure means the unchanged inheritance helper, not an authoring error.
use std::collections::HashSet;

use hozo_ir::{
    Child, Condition, Length, LetterSpacing, LineHeight, Node, Primitive, StyleProperty, Theme,
};

const FIELDS: [&str; 7] = [
    "color",
    "fontSize",
    "fontWeight",
    "lineHeight",
    "letterSpacing",
    "textAlign",
    "textTransform",
];

// Both routes assess the same protocol domain. A static proof must not
// bypass an unassessed animation/relative CSS declaration just because ordinary
// output happens to need no generated adapter for one value of it.
pub(super) fn passive(node: &Node) -> bool {
    matches!(
        node.primitive,
        Primitive::View
            | Primitive::Text
            | Primitive::Paragraph
            | Primitive::Strong
            | Primitive::Heading
            | Primitive::Small
            | Primitive::Sub
            | Primitive::Sup
            | Primitive::Mark
            | Primitive::NoBreak
            | Primitive::Button
            | Primitive::Pressable
    ) && !matches!(
        node.props.heading_level,
        Some(hozo_ir::HeadingLevel::Dynamic(_))
    ) && node.class_name_fallback.is_empty()
        && node.style.iter().all(|style| {
            style.condition == Condition::Always
                && !matches!(
                    style.property,
                    StyleProperty::TransitionProperty(..)
                        | StyleProperty::TransitionDuration(..)
                        | StyleProperty::TransitionDelay(..)
                        | StyleProperty::TransitionTimingFunction(..)
                        | StyleProperty::AnimationName(..)
                        | StyleProperty::Animation(..)
                        | StyleProperty::ThemeAnimation(..)
                        | StyleProperty::FontFamily(..)
                        | StyleProperty::Keyword("font-style", _)
                        | StyleProperty::FontVariant(..)
                        | StyleProperty::LineHeight(LineHeight::Ratio(..))
                        | StyleProperty::LetterSpacing(LetterSpacing::Em(..))
                        | StyleProperty::FontSize(Length::Unit(_, hozo_ir::LengthUnit::Em))
                        | StyleProperty::LineHeight(LineHeight::Length(Length::Unit(
                            _,
                            hozo_ir::LengthUnit::Em
                        )))
                        | StyleProperty::LetterSpacing(LetterSpacing::Px(Length::Unit(
                            _,
                            hozo_ir::LengthUnit::Em
                        )))
                )
        })
        && node.children.iter().all(|child| match child {
            Child::Node(node) => passive(node),
            Child::Verbatim { nested, .. } => nested.iter().all(|nested| passive(&nested.node)),
            Child::Text(_) => true,
        })
}

pub(super) fn prove(root: &Node, theme: &Theme) -> Result<(), &'static str> {
    fn prove_node(node: &Node, theme: &Theme, root: bool) -> Result<(), &'static str> {
        if node.primitive != Primitive::Text
            || !node.class_name_fallback.is_empty()
            || !node.carried_classes.is_empty()
            || !node.props.stylex_residuals.is_empty()
        {
            return Err("not a closed Text-only style region");
        }
        if node.props.passthrough.iter().any(|prop| {
            prop.is_spread
                || matches!(
                    prop.name.as_deref(),
                    Some("style" | "children" | "className")
                )
        }) {
            return Err("authored style, children or spread can override the static frame");
        }
        let mut fields = HashSet::new();
        for declaration in &node.style {
            if declaration.condition != Condition::Always {
                return Err("conditional declaration");
            }
            if matches!(
                declaration.property,
                StyleProperty::FontSize(Length::Unit(..))
                    | StyleProperty::LineHeight(LineHeight::Ratio(..))
                    | StyleProperty::LineHeight(LineHeight::Length(Length::Unit(..)))
                    | StyleProperty::LetterSpacing(LetterSpacing::Em(..))
                    | StyleProperty::LetterSpacing(LetterSpacing::Px(Length::Unit(..)))
            ) {
                return Err("relative or unresolved metric");
            }
            for (name, value) in super::style::property_and_value(&declaration.property, theme) {
                if matches!(name, "fontFamily" | "fontStyle" | "fontVariant") {
                    return Err("outside the seven-field protocol");
                }
                if FIELDS.contains(&name) {
                    if !scalar(name, &value) {
                        return Err("not a supported resolved scalar");
                    }
                    fields.insert(name.to_string());
                }
            }
        }
        if root && !FIELDS.iter().all(|name| fields.contains(*name)) {
            return Err("root does not own all seven fields");
        }
        for child in &node.children {
            match child {
                Child::Text(_) => (),
                Child::Node(child) => prove_node(child, theme, false)?,
                Child::Verbatim { .. } => return Err("opaque child may read or publish a frame"),
            }
        }
        Ok(())
    }
    prove_node(root, theme, true)
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

    #[test]
    fn complete_classes_delegate_to_existing_lowering_only_inside_the_proof() {
        let source = format!("import {{Text}} from '@hozo/core'; const el=<Text className=\"{COMPLETE}\">Parent<Text className=\"text-[#1355bb] font-medium\">Nested</Text></Text>");
        let parsed = hozo_parser::parse_tsx(&source);
        let root = &parsed.roots[0].node;
        assert_eq!(prove(root, &Theme::default()), Ok(()));
        let normal = crate::lower(root, &source, &Theme::default());
        let optimized =
            crate::lower_text_inheritance_static(root, &[], &source, &Theme::default(), true);
        assert_eq!(optimized.jsx, normal.jsx);
        assert_eq!(optimized.styles, normal.styles);
        assert!(optimized.runtime_imports.is_empty());
        let unproved =
            crate::lower_text_inheritance_static(root, &[], &source, &Theme::default(), false);
        assert!(unproved.runtime_imports.contains(&"HozoInheritedText"));
    }

    #[test]
    fn incomplete_dynamic_and_opaque_regions_keep_the_runtime_route() {
        for (attrs, children) in [
            ("className=\"text-red-500\"".to_string(), "Label"),
            (
                format!("className=\"{COMPLETE}\" style={{{{color:'#112233'}}}}"),
                "Label",
            ),
            (format!("className=\"{COMPLETE}\" {{...props}}"), "Label"),
            (
                format!("className=\"{COMPLETE}\" children={{children}}"),
                "Label",
            ),
            (format!("className=\"{COMPLETE}\""), "<Opaque/>"),
            (
                format!("className=\"{COMPLETE}\""),
                "<View><Text>Nested</Text></View>",
            ),
            (
                format!("className=\"{COMPLETE}\""),
                "<Text style={own}>Nested</Text>",
            ),
            (format!("className=\"{COMPLETE}\""), "{children}"),
        ] {
            let source = format!(
                "import {{Text,View}} from '@hozo/core'; const el=<Text {attrs}>{children}</Text>"
            );
            let parsed = hozo_parser::parse_tsx(&source);
            let root = &parsed.roots[0].node;
            assert!(prove(root, &Theme::default()).is_err(), "{source}");
            let runtime = crate::lower_text_inheritance(root, &[], &source, &Theme::default());
            let optimized =
                crate::lower_text_inheritance_static(root, &[], &source, &Theme::default(), true);
            assert_eq!(optimized.jsx, runtime.jsx);
            assert_eq!(optimized.styles, runtime.styles);
            assert_eq!(optimized.runtime_imports, runtime.runtime_imports);
        }
    }

    #[test]
    fn every_own_field_is_required_and_static_cannot_widen_the_protocol_domain() {
        let source = format!("import {{Text}} from '@hozo/core';const el=<Text className=\"{COMPLETE}\">Label</Text>");
        let parsed = hozo_parser::parse_tsx(&source);
        for field in FIELDS {
            let mut root = parsed.roots[0].node.clone();
            root.style.retain(|declaration| {
                !super::super::style::property_and_value(&declaration.property, &Theme::default())
                    .iter()
                    .any(|(name, _)| *name == field)
            });
            assert_eq!(
                prove(&root, &Theme::default()),
                Err("root does not own all seven fields"),
                "{field}"
            );
        }
        for extra in [
            "transition-none",
            "animate-none",
            "font-sans",
            "dark:text-red-500",
            "tracking-wide",
        ] {
            let source = source.replace(COMPLETE, &format!("{COMPLETE} {extra}"));
            let parsed = hozo_parser::parse_tsx(&source);
            let root = &parsed.roots[0].node;
            let runtime = crate::lower_text_inheritance(root, &[], &source, &Theme::default());
            let optimized =
                crate::lower_text_inheritance_static(root, &[], &source, &Theme::default(), true);
            assert_eq!(optimized.jsx, runtime.jsx, "{extra}");
            assert_eq!(optimized.diagnostics, runtime.diagnostics, "{extra}");
        }
    }
}
