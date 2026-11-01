//! RFC010's explicit style-only preparation seam. Reuse the actual renderer's
//! carrier; never parse generated JSX or reconstruct its declaration ordering.
use super::*;

/// Bounded inputs supplied by an existing owner, never inferred from a
/// synthetic primitive's missing props or loaded as executable manifest text.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[doc(hidden)]
pub enum OwnerFact {
    Disabled,
    AriaSelected,
    AriaDisabled,
}

impl OwnerFact {
    pub fn key(self) -> &'static str {
        match self {
            Self::Disabled => "disabled",
            Self::AriaSelected => "aria-selected",
            Self::AriaDisabled => "aria-disabled",
        }
    }

    pub(crate) fn alias(self) -> &'static str {
        match self {
            Self::Disabled => "__hozoOwnerDisabled",
            Self::AriaSelected => "__hozoOwnerAriaSelected",
            Self::AriaDisabled => "__hozoOwnerAriaDisabled",
        }
    }

    pub(crate) fn parameter(self) -> String {
        format!("{:?}: {}", self.key(), self.alias())
    }
}

pub struct OwnerStyle {
    pub facts: Vec<OwnerFact>,
    /// Requires an existing destination that splits box and owned label styles.
    pub split_text: bool,
    /// Original IR has only unconditional declarations and no residuals.
    /// A condition folded for a synthetic host is not proof about a pattern.
    pub literal_resting: bool,
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
                facts: cx.owner_inputs.facts.to_vec(),
                split_text: cx.owner_inputs.split_text,
                literal_resting: false,
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
    lower_owner_style_with_inputs(root, forwarded, source, theme, OwnerStyleInputs::default())
}

#[derive(Clone, Copy, Default)]
#[doc(hidden)]
pub struct OwnerStyleInputs<'a> {
    pub facts: &'a [OwnerFact],
    pub split_text: bool,
}

fn absolute(length: &Length) -> bool {
    matches!(
        length,
        Length::Px(_) | Length::Spacing(_) | Length::Unit(_, hozo_ir::LengthUnit::Rem)
    )
}

fn split_text_supported(property: &StyleProperty, theme: &Theme) -> bool {
    match property {
        StyleProperty::FontSize(length) => absolute(length),
        StyleProperty::FontWeight(weight) => weight.native(theme).is_some(),
        StyleProperty::LineHeight(
            hozo_ir::LineHeight::Length(length) | hozo_ir::LineHeight::FontDefault(length),
        ) => absolute(length),
        StyleProperty::LetterSpacing(hozo_ir::LetterSpacing::Px(length)) => absolute(length),
        StyleProperty::TextColor(_)
        | StyleProperty::TextAlign(_)
        | StyleProperty::TextTransform(_) => true,
        // No contextual fallback selection or parent-relative metrics are
        // certified by a synthetic class contribution.
        StyleProperty::FirstThatWorks(_) => false,
        other => !crate::text::is_text_property(other),
    }
}

/// Style-only preparation: its carrier is applied by the existing destination,
/// not permission to replace that destination with this synthetic leaf's JSX.
#[doc(hidden)]
pub fn lower_owner_style_with_inputs(
    root: &Node,
    forwarded: &[StyleDeclaration],
    source: &str,
    theme: &Theme,
    inputs: OwnerStyleInputs<'_>,
) -> (LowerOutput, Option<OwnerStyle>) {
    let facts = inputs.facts;
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
        && facts.iter().enumerate().all(|(at, fact)| !facts[..at].contains(fact))
        && ((facts.is_empty() && !inputs.split_text) || root.primitive == Primitive::Pressable)
        // The residual resolver's semantic inputs need their own delivery proof.
        && ((facts.is_empty() && !inputs.split_text) || root.class_name_fallback.is_empty())
        && (!inputs.split_text || root.style.iter().all(|d| split_text_supported(&d.property, theme) && d.condition.split_subtree().is_none()))
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
        eligible.then_some((&mut carrier, inputs)),
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
    if let Some(style) = &mut carrier {
        style.literal_resting = root.class_name_fallback.is_empty()
            && root
                .style
                .iter()
                .all(|declaration| declaration.condition == Condition::Always);
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
            assert_eq!(carrier.literal_resting, !source.contains("hover:"));
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

    #[test]
    fn explicit_owner_facts_are_callback_inputs_not_synthetic_host_props() {
        let source = "const el=<Pressable className=\"p-2 aria-selected:disabled:p-3 aria-disabled:opacity-50\"/>";
        let parsed = hozo_parser::parse_tsx(source);
        let facts = [
            OwnerFact::Disabled,
            OwnerFact::AriaSelected,
            OwnerFact::AriaDisabled,
        ];
        let (output, carrier) = lower_owner_style_with_inputs(
            &parsed.roots[0].node,
            &[],
            source,
            &Theme::default(),
            OwnerStyleInputs {
                facts: &facts,
                ..Default::default()
            },
        );
        let carrier = carrier.expect("declared boolean inputs supply these guards");
        assert_eq!(carrier.facts, facts);
        assert!(carrier.callback);
        assert!(!carrier.literal_resting);
        for fact in facts {
            assert!(carrier.expression.contains(&fact.parameter()));
            assert!(carrier
                .expression
                .contains(&format!("typeof {} === 'boolean'", fact.alias())));
        }
        assert!(!output.jsx.contains(" disabled="));
        assert!(!output.jsx.contains(" accessibilityState="));
        assert!(
            compile(source).1.is_none(),
            "ordinary leaf cannot invent semantic state"
        );
    }

    #[test]
    fn semantic_preparation_keeps_refusals_and_unavailable_negation() {
        let facts = [OwnerFact::Disabled];
        for source in [
            "const el=<View className=\"p-2\"/>",
            "const el=<Pressable className={`p-2 ${extra}`}/>",
            "const el=<Pressable className=\"aria-selected:p-2\"/>",
            "const el=<Pressable className=\"not-aria-selected:p-2\"/>",
            "const el=<Pressable className=\"aria-checked:p-2\"/>",
            "const el=<Pressable className=\"text-red-500\"/>",
            "const el=<Pressable className=\"dark:p-2\"/>",
            "const el=<Pressable disabled className=\"p-2\"/>",
        ] {
            let parsed = hozo_parser::parse_tsx(source);
            let (output, carrier) = lower_owner_style_with_inputs(
                &parsed.roots[0].node,
                &[],
                source,
                &Theme::default(),
                OwnerStyleInputs {
                    facts: &facts,
                    ..Default::default()
                },
            );
            assert!(carrier.is_none(), "{source}");
            assert!(
                output
                    .diagnostics
                    .iter()
                    .any(|d| d.severity == Severity::Error),
                "{source}"
            );
        }
        for candidate in ["not-disabled:p-3", "enabled:p-3", "hover:not-disabled:p-3"] {
            let source = format!("const el=<Pressable className=\"p-2 {candidate}\"/>");
            let parsed = hozo_parser::parse_tsx(&source);
            let (_, carrier) = lower_owner_style_with_inputs(
                &parsed.roots[0].node,
                &[],
                &source,
                &Theme::default(),
                OwnerStyleInputs {
                    facts: &facts,
                    ..Default::default()
                },
            );
            let expression = carrier
                .expect("negative boolean guard is scoped")
                .expression;
            assert!(expression.contains("typeof __hozoOwnerDisabled === 'boolean'"));
            assert!(expression.contains("!"));
        }
        let source = "const el=<Pressable className=\"disabled:opacity-50\"/>";
        let parsed = hozo_parser::parse_tsx(source);
        let (_, carrier) = lower_owner_style_with_inputs(
            &parsed.roots[0].node,
            &[],
            source,
            &Theme::default(),
            OwnerStyleInputs {
                facts: &[OwnerFact::Disabled, OwnerFact::Disabled],
                ..Default::default()
            },
        );
        assert!(
            carrier.is_none(),
            "Rust callers cannot produce duplicate callback bindings"
        );
    }

    #[test]
    fn split_label_carrier_reuses_style_generation_without_inventing_a_text_host() {
        let source = "const el=<Pressable className=\"p-2 text-[#112233] aria-selected:text-[#223344] text-[18px] disabled:font-bold\"/>";
        let parsed = hozo_parser::parse_tsx(source);
        let root = &parsed.roots[0];
        let facts = [OwnerFact::Disabled, OwnerFact::AriaSelected];
        let (output, carrier) = lower_owner_style_with_inputs(
            &root.node,
            &[],
            source,
            &Theme::default(),
            OwnerStyleInputs {
                facts: &facts,
                split_text: true,
            },
        );
        let carrier = carrier.unwrap_or_else(|| {
            panic!(
                "split-label carrier: {}; {:?}; {:?}; {:?}",
                output.jsx, output.runtime_imports, output.diagnostics, root.node.style
            )
        });
        assert!(carrier.split_text && carrier.callback);
        assert!(output.styles.contains("fontSize: 18"));
        assert!(output.styles.contains("color:"));
        assert!(!output.jsx.contains("hozoTextStyle"));
        assert!(!output.native_imports.contains(&"Text"));
        let (_, ordinary) = lower_owner_style_with_inputs(
            &root.node,
            &[],
            source,
            &Theme::default(),
            OwnerStyleInputs {
                facts: &facts,
                ..Default::default()
            },
        );
        assert!(
            ordinary.is_none(),
            "old preparation must not infer a label destination"
        );
    }

    #[test]
    fn split_text_cannot_certify_parent_metrics_residuals_or_child_selectors() {
        for element in [
            "<Pressable className=\"p-2 text-[2em]\"/>",
            "<Pressable className=\"p-2 leading-tight\"/>",
            "<Pressable className=\"p-2 tracking-wide\"/>",
            "<Pressable className=\"p-2 *:text-red-500\"/>",
            "<Pressable className={`p-2 ${extra}`}/>",
            "<Pressable className=\"text-red-500\"><Text/></Pressable>",
            "<View className=\"text-red-500\"/>",
        ] {
            let source = format!("const el={element}");
            let parsed = hozo_parser::parse_tsx(&source);
            let (output, carrier) = lower_owner_style_with_inputs(
                &parsed.roots[0].node,
                &[],
                &source,
                &Theme::default(),
                OwnerStyleInputs {
                    split_text: true,
                    ..Default::default()
                },
            );
            assert!(carrier.is_none(), "{element}");
            assert!(
                output
                    .diagnostics
                    .iter()
                    .any(|d| d.severity == Severity::Error),
                "{element}"
            );
        }
    }
}
