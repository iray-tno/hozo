//! RFC010's explicit style-only preparation seam. Reuse the actual renderer's
//! carrier; never parse generated JSX or reconstruct its declaration ordering.
use super::*;

pub struct OwnerStyle {
    pub expression: String,
    pub callback: bool,
    /// A requirement on the existing destination, never invented state.
    pub focus_visible: bool,
    // Used only while lowering to reject classes absorbed into other host props.
    attribute: String,
}

pub(super) fn record(
    cx: &mut NativeRenderContext<'_>,
    base: &str,
    attribute: &str,
    callback: bool,
) {
    if base != "hozo0" {
        return;
    }
    if let Some(target) = cx.owner_style.as_deref_mut() {
        *target = attribute
            .strip_prefix(" style={")
            .and_then(|value| value.strip_suffix('}'))
            .map(|expression| OwnerStyle {
                expression: expression.to_string(),
                callback,
                focus_visible: false,
                attribute: attribute.to_string(),
            });
    }
}

pub(super) fn validate_props(cx: &mut NativeRenderContext<'_>, base: &str, props: &str) {
    if base == "hozo0" {
        if let Some(target) = cx.owner_style.as_deref_mut() {
            if let Some(style) = target {
                if props.strip_suffix(" hozoFocusVisible") == Some(style.attribute.as_str()) {
                    style.focus_visible = true;
                } else if style.attribute != props {
                    *target = None;
                }
            }
        }
    }
}

/// Internal preparation, not permission to replace a component. Its caller
/// still owns shape selection, expression capture and the explicit-style tier.
/// Unsupported roots retain ordinary output plus an error, never a partial plan.
#[doc(hidden)]
pub fn lower_owner_style(
    root: &Node,
    forwarded: &[StyleDeclaration],
    source: &str,
    theme: &Theme,
) -> (LowerOutput, Option<OwnerStyle>) {
    fn binding_only(value: &str) -> bool {
        if matches!(
            value.trim(),
            "pressed" | "hovered" | "focused" | "focusVisible" | "hozoStyles"
        ) {
            return false;
        }
        let mut chars = value.trim().chars();
        chars
            .next()
            .is_some_and(|c| c.is_ascii_alphabetic() || matches!(c, '_' | '$'))
            && chars.all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '$'))
    }
    fn needs_capture(condition: &Condition) -> bool {
        match condition {
            Condition::Expr(_) => true,
            Condition::All(parts) => parts.iter().any(needs_capture),
            Condition::Not(inner) => needs_capture(inner),
            _ => false,
        }
    }
    let eligible = matches!(root.primitive, Primitive::View | Primitive::Pressable)
        && root.children.is_empty()
        && root.props.passthrough.is_empty()
        && root.props.stylex_residuals.is_empty()
        && root.root_class_evaluation().is_none()
        && root
            .class_name_fallback
            .iter()
            .all(|expression| binding_only(source_text(source, *expression)))
        && !root
            .style
            .iter()
            .any(|declaration| needs_capture(&declaration.condition))
        && forwarded.is_empty();
    let mut carrier = None;
    let mut output = lower_forwarded_capturing(
        root,
        forwarded,
        source,
        theme,
        false,
        false,
        eligible.then_some(&mut carrier),
    );
    // These are the existing owner's supplied state and residual resolver,
    // not wrappers to install. Every other helper/hook needs separate evidence.
    let style_only = output.prelude.is_empty()
        && output
            .runtime_imports
            .iter()
            .all(|name| matches!(*name, "HozoPressable" | "hozoClasses"));
    if !style_only {
        carrier = None;
    }
    if output
        .diagnostics
        .iter()
        .any(|d| d.severity == Severity::Error)
    {
        carrier = None;
    } else if carrier.is_none() {
        output.diagnostics.push(Diagnostic {
            code: DiagnosticCode::NotWiredOnNative,
            severity: Severity::Error,
            message: "Internal ownerStyle currently requires a leaf View/Pressable with only class input, no inherited context, expression capture, extra host props, wrappers or hooks. Ordinary output is retained; no partial style plan is certified.".into(),
            span: root.span,
        });
    }
    (output, carrier)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn compile(source: &str) -> (LowerOutput, Option<OwnerStyle>) {
        let parsed = hozo_parser::parse_tsx(source);
        let root = &parsed.roots[0];
        lower_owner_style(&root.node, &root.forwarded, source, &Theme::default())
    }

    #[test]
    fn captures_the_exact_existing_carrier_without_changing_ordinary_output() {
        for source in [
            "const el=<View className=\"p-2 opacity-50\"/>",
            "const el=<Pressable className=\"p-2 hover:opacity-50 focus:p-3 active:bg-red-500\"/>",
            "const el=<Pressable className={`p-2 hover:opacity-50 ${extra}`} />",
        ] {
            let parsed = hozo_parser::parse_tsx(source);
            let ordinary = lower(&parsed.roots[0].node, source, &Theme::default());
            let (output, carrier) = compile(source);
            let carrier = carrier.unwrap_or_else(|| {
                panic!(
                    "assessed leaf carrier: {source}; {}; {:?}",
                    output.jsx, output.runtime_imports
                )
            });
            assert!(output.jsx.contains(&carrier.attribute));
            assert_eq!(output.jsx, ordinary.jsx);
            assert_eq!(output.styles, ordinary.styles);
            assert_eq!(output.runtime_imports, ordinary.runtime_imports);
            assert_eq!(carrier.callback, source.contains("Pressable"));
        }
    }

    #[test]
    fn refuses_non_style_effects_and_unavailable_owner_state() {
        for source in [
            "const el=<Text className=\"text-red-500\"/>",
            "const el=<View className=\"p-2\"><View/></View>",
            "const el=<View style={{opacity:0.5}} className=\"p-2\"/>",
            "const el=<Pressable className={`p-2 ${input.value}`}/>",
            "const el=<Pressable className={`p-2 ${pressed}`}/>",
            "const el=<Pressable className={hot ? 'p-2' : 'p-3'}/>",
            "const el=<Pressable disabled className=\"p-2\"/>",
            "const el=<View className=\"grid grid-cols-2\"/>",
            "const el=<View className=\"md:p-3\"/>",
            "const el=<View className=\"hover:opacity-50\"/>",
            "const el=<Pressable className=\"text-red-500\"/>",
        ] {
            let (output, carrier) = compile(source);
            assert!(carrier.is_none(), "{source}");
            assert!(
                output
                    .diagnostics
                    .iter()
                    .any(|d| d.severity == Severity::Error),
                "{source}"
            );
        }
    }
}
