//! Explicit class-only preparation. Capture the real renderer's class name,
//! not a generated JSX attribute parsed back into a second representation.
use super::*;
use hozo_ir::{ClassSlot, Condition, DiagnosticCode, PropSet, Severity};

fn needs_capture(condition: &Condition) -> bool {
    match condition {
        Condition::Expr(_) => true,
        Condition::All(parts) => parts.iter().any(needs_capture),
        Condition::Not(inner) => needs_capture(inner),
        _ => false,
    }
}

/// Internal preparation only. A caller still owns real host/fact delivery,
/// class namespacing, authored composition and the independent owner audit.
/// Unsupported input retains ordinary output plus an error, never a partial
/// carrier. In particular an unknown class is not deleted from an author.
#[doc(hidden)]
pub fn lower_owner_class(root: &Node, source: &str, theme: &Theme, evidence: bool) -> LowerOutput {
    let mut props = root.props.clone();
    props.class_slots.clear();
    let eligible = matches!(root.primitive, Primitive::View | Primitive::Pressable)
        && root.children.is_empty()
        && props == PropSet::default()
        && root
            .props
            .class_slots
            .iter()
            .all(|slot| slot.slot == ClassSlot::ROOT)
        && root.root_class_evaluation().is_none()
        && root.class_name_fallback.is_empty()
        && root.carried_classes.is_empty()
        && root
            .style
            .iter()
            .all(|declaration| !needs_capture(&declaration.condition));
    let mut carrier = None;
    let mut output = lower_capturing(
        root,
        source,
        theme,
        evidence,
        eligible.then_some(&mut carrier),
    );
    if !output.diagnostics.is_empty() || !output.runtime_imports.is_empty() {
        carrier = None;
    }
    if carrier.is_none() {
        output.diagnostics.push(Diagnostic {
            code: DiagnosticCode::NotWiredOnWeb,
            severity: Severity::Error,
            message: "Internal ownerClass requires a leaf View/Pressable with only complete class input, no expressions, residuals, carried classes, other props or runtime effects. Ordinary output is retained; no partial class carrier is certified.".into(),
            span: root.span,
        });
    }
    output.owner_class = carrier;
    output
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn captures_the_existing_class_without_synthetic_base_or_host_changes() {
        for tag in ["View", "Pressable"] {
            let source = format!("const el=<{tag} className=\"p-2 hover:opacity-50 aria-selected:bg-red-500 disabled:font-bold\"/>");
            let parsed = hozo_parser::parse_tsx(&source);
            let root = &parsed.roots[0].node;
            let ordinary = lower(root, &source, &Theme::default());
            let prepared = lower_owner_class(root, &source, &Theme::default(), false);
            assert_eq!(prepared.jsx, ordinary.jsx);
            assert_eq!(prepared.css, ordinary.css);
            assert_eq!(prepared.owner_class.as_deref(), Some("hozo-0"));
            assert!(ordinary.owner_class.is_none());
            assert!(
                prepared.diagnostics.is_empty(),
                "{:?}",
                prepared.diagnostics
            );
            assert!(prepared.runtime_imports.is_empty());
        }
    }

    #[test]
    fn rejects_capture_residuals_children_host_effects_and_carried_classes_whole() {
        for source in [
            "const el=<View className={`p-2 ${value}`}/>",
            "const el=<View className={on ? 'p-2' : 'p-4'}/>",
            "const el=<View className=\"p-2 my-class\"/>",
            "const el=<View className=\"p-2\" style={style}/>",
            "const el=<View className=\"p-2\" {...rest}/>",
            "const el=<Pressable className=\"p-2\" disabled/>",
            "const el=<Pressable className=\"p-2\" onPress={act}/>",
            "const el=<View className=\"p-2\"><Text>Label</Text></View>",
            "const el=<Text className=\"text-red-500\"/>",
        ] {
            let parsed = hozo_parser::parse_tsx(source);
            let root = &parsed.roots[0].node;
            let ordinary = lower(root, source, &Theme::default());
            let prepared = lower_owner_class(root, source, &Theme::default(), false);
            assert!(prepared.owner_class.is_none(), "{source}");
            assert_eq!(prepared.jsx, ordinary.jsx);
            assert_eq!(prepared.css, ordinary.css);
            assert!(prepared
                .diagnostics
                .iter()
                .any(|d| d.severity == Severity::Error));
        }
    }
}
