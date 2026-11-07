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

/// Tailwind's `group` and `peer`, and their named forms. They write no style
/// of their own and exist to be selected against, so carrying one is safe:
/// it goes on the carrier as written. Any other carried class may be the
/// project's own CSS and still refuses the element. A name that could read
/// as a Hozo class would be renamed by the namespacer, so it refuses too.
fn is_relation_marker(class: &str) -> bool {
    let name = match class.split_once('/') {
        None => return class == "group" || class == "peer",
        Some(("group" | "peer", name)) => name,
        Some(_) => return false,
    };
    !name.is_empty()
        && !name.contains("hozo-")
        && name
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
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
        && root
            .carried_classes
            .iter()
            .all(|class| is_relation_marker(class))
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
    output.owner_class = carrier.map(|class_name| OwnerClass {
        // After the class Hozo generated, in the order the renderer puts
        // them on the element.
        class_name: std::iter::once(class_name.as_str())
            .chain(root.carried_classes.iter().map(String::as_str))
            .filter(|class| !class.is_empty())
            .collect::<Vec<_>>()
            .join(" "),
        // Remove the renderer's own synthetic-host defaults while keeping
        // required theme/content/leading/keyframe globals from the same emit.
        css: output.css.replacen(VIEW_BASE_CSS, "", 1),
    });
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
            let carrier = prepared.owner_class.as_ref().unwrap();
            assert_eq!(carrier.class_name, "hozo-0");
            assert!(carrier.css.starts_with(".hozo-0"));
            assert!(ordinary.css.ends_with(&carrier.css));
            assert!(!carrier.css.contains("hozo-view"));
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
    fn class_owned_css_matches_across_synthetic_host_shapes_and_keeps_required_globals() {
        let source = |tag| {
            format!("const el=<{tag} className=\"p-2 hover:opacity-50 leading-[24px] animate-pulse before:content-['x']\"/>")
        };
        let carrier = |source: &str| {
            let parsed = hozo_parser::parse_tsx(source);
            lower_owner_class(&parsed.roots[0].node, source, &Theme::default(), false)
                .owner_class
                .unwrap()
        };
        let view = carrier(&source("View"));
        let pressable = carrier(&source("Pressable"));
        assert_eq!(view.class_name, pressable.class_name);
        assert_eq!(view.css, pressable.css);
        assert!(view.css.contains("--hozo-content"));
        assert!(view.css.contains("@keyframes"));
        assert!(view.css.contains("24px"));
    }

    #[test]
    fn rejects_capture_residuals_children_host_effects_and_carried_classes_whole() {
        for source in [
            "const el=<View className={`p-2 ${value}`}/>",
            "const el=<View className={on ? 'p-2' : 'p-4'}/>",
            "const el=<View className=\"p-2 my-class\"/>",
            "const el=<View className=\"p-2 group my-class\"/>",
            "const el=<View className=\"p-2 group/hozo-1\"/>",
            "const el=<View className=\"p-2 groupy\"/>",
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

#[cfg(test)]
mod marker_tests {
    use super::*;

    fn prepared(class_name: &str) -> (LowerOutput, LowerOutput) {
        let source = format!("const el=<View className=\"{class_name}\"/>");
        let parsed = hozo_parser::parse_tsx(&source);
        let root = &parsed.roots[0].node;
        (
            lower(root, &source, &Theme::default()),
            lower_owner_class(root, &source, &Theme::default(), false),
        )
    }

    #[test]
    fn a_group_or_peer_marker_rides_on_the_carrier_as_written() {
        // Carried, these used to refuse the element whole, so a `View`
        // marked `group` or `peer` never reached this path. They write no
        // style; a descendant's `group-hover:` or a sibling's
        // `peer-checked:` selects against them, so they stay on it.
        for (class_name, carried) in [
            ("p-2 group", "hozo-0 group"),
            ("peer p-2", "hozo-0 peer"),
            ("p-2 group/item peer/field", "hozo-0 group/item peer/field"),
            ("group", "group"),
        ] {
            let (ordinary, prepared) = prepared(class_name);
            assert!(
                prepared.diagnostics.is_empty(),
                "{class_name}: {:?}",
                prepared.diagnostics
            );
            let carrier = prepared.owner_class.expect(class_name);
            assert_eq!(carrier.class_name, carried);
            // The same classes the ordinary renderer puts on the element,
            // without its synthetic host class.
            assert!(
                ordinary
                    .jsx
                    .contains(&format!("className=\"hozo-view {carried}\"")),
                "{class_name}: {}",
                ordinary.jsx
            );
            assert!(ordinary.css.ends_with(&carrier.css));
        }
    }
}
