//! RFC010's explicit style-only preparation seam. Reuse the actual renderer's
//! carrier; never parse generated JSX or reconstruct its declaration ordering.
use super::*;

/// Bounded interaction events supplied by an existing owner when the host is
/// not itself a Pressable or TextInput (for example a focusable/hoverable
/// `View` spinbutton with no press responder).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[doc(hidden)]
pub enum OwnerEvent {
    Pressed,
    Hovered,
    Focused,
    FocusVisible,
}

impl OwnerEvent {
    pub fn key(self) -> &'static str {
        match self {
            Self::Pressed => "pressed",
            Self::Hovered => "hovered",
            Self::Focused => "focused",
            Self::FocusVisible => "focusVisible",
        }
    }
}

/// Bounded inputs supplied by an existing owner, never inferred from a
/// synthetic primitive's missing props or loaded as executable manifest text.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[doc(hidden)]
pub enum OwnerFact {
    Disabled,
    ReadOnly,
    AriaSelected,
    AriaDisabled,
    AriaInvalid,
    AriaRequired,
    AriaExpanded,
    DataHozoOutside,
    DataHozoDisabled,
    DataHozoRangeStart,
    DataHozoRangeEnd,
    DataHozoInRange,
    DataHozoStep,
    DataHozoStepIncrease,
    DataHozoStepDecrease,
}

impl OwnerFact {
    pub fn key(self) -> &'static str {
        match self {
            Self::Disabled => "disabled",
            Self::ReadOnly => "readOnly",
            Self::AriaSelected => "aria-selected",
            Self::AriaDisabled => "aria-disabled",
            Self::AriaInvalid => "aria-invalid",
            Self::AriaRequired => "aria-required",
            Self::AriaExpanded => "aria-expanded",
            Self::DataHozoOutside => "data-hozo-outside",
            Self::DataHozoDisabled => "data-hozo-disabled",
            Self::DataHozoRangeStart => "data-hozo-range-start",
            Self::DataHozoRangeEnd => "data-hozo-range-end",
            Self::DataHozoInRange => "data-hozo-in-range",
            Self::DataHozoStep => "data-hozo-step",
            Self::DataHozoStepIncrease => "data-hozo-step=increase",
            Self::DataHozoStepDecrease => "data-hozo-step=decrease",
        }
    }

    pub(crate) fn alias(self) -> &'static str {
        match self {
            Self::Disabled => "__hozoOwnerDisabled",
            Self::ReadOnly => "__hozoOwnerReadOnly",
            Self::AriaSelected => "__hozoOwnerAriaSelected",
            Self::AriaDisabled => "__hozoOwnerAriaDisabled",
            Self::AriaInvalid => "__hozoOwnerAriaInvalid",
            Self::AriaRequired => "__hozoOwnerAriaRequired",
            Self::AriaExpanded => "__hozoOwnerAriaExpanded",
            Self::DataHozoOutside => "__hozoOwnerDataHozoOutside",
            Self::DataHozoDisabled => "__hozoOwnerDataHozoDisabled",
            Self::DataHozoRangeStart => "__hozoOwnerDataHozoRangeStart",
            Self::DataHozoRangeEnd => "__hozoOwnerDataHozoRangeEnd",
            Self::DataHozoInRange => "__hozoOwnerDataHozoInRange",
            Self::DataHozoStep => "__hozoOwnerDataHozoStep",
            Self::DataHozoStepIncrease => "__hozoOwnerDataHozoStepIncrease",
            Self::DataHozoStepDecrease => "__hozoOwnerDataHozoStepDecrease",
        }
    }

    pub(crate) fn parameter(self) -> String {
        format!("{:?}: {}", self.key(), self.alias())
    }
}

pub struct OwnerStyle {
    pub facts: Vec<OwnerFact>,
    pub events: Vec<OwnerEvent>,
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
            .or_else(|| attribute.strip_prefix(" hozoStyle={"))
            .and_then(|value| value.strip_suffix('}'))
            .map(|expression| OwnerStyle {
                facts: cx.owner_inputs.facts.to_vec(),
                events: cx.owner_inputs.events.to_vec(),
                split_text: cx.owner_inputs.split_text,
                literal_resting: false,
                expression: expression.to_string(),
                callback,
                focus_visible: false,
                attribute: attribute.to_string(),
            });
    }
}

pub(super) fn mark_focus_visible(cx: &mut NativeRenderContext<'_>, base: &str) {
    if base == "hozo0" {
        if let Some(Some(style)) = cx.owner_style.as_deref_mut() {
            style.focus_visible = true;
        }
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
    pub events: &'a [OwnerEvent],
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
    let interactive_view = root.primitive == Primitive::View && !inputs.events.is_empty();
    let eligible = matches!(
        root.primitive,
        Primitive::View | Primitive::Pressable | Primitive::Text | Primitive::TextInput
    )
        && facts.iter().enumerate().all(|(at, fact)| !facts[..at].contains(fact))
        && inputs
            .events
            .iter()
            .enumerate()
            .all(|(at, event)| !inputs.events[..at].contains(event))
        && ((facts.is_empty() && inputs.events.is_empty() && !inputs.split_text)
            || (root.primitive == Primitive::View
                && facts.is_empty()
                && inputs.events.is_empty()
                && inputs.split_text)
            || interactive_view
            || root.primitive == Primitive::Pressable
            || (root.primitive == Primitive::TextInput
                && inputs.events.is_empty()
                && !inputs.split_text))
        // The residual resolver's semantic inputs need their own delivery proof.
        && ((facts.is_empty() && inputs.events.is_empty() && !inputs.split_text)
            || root.class_name_fallback.is_empty())
        && (!inputs.split_text || root.style.iter().all(|d| split_text_supported(&d.property, theme) && d.condition.split_subtree().is_none()))
        && root.children.is_empty()
        && root.props.passthrough.is_empty()
        && root.props.stylex_residuals.is_empty()
        && root.root_class_evaluation().is_none()
        // A class Hozo did not compile has no style here to carry, and is
        // not this preparation's to drop. Callers' lists arrive as
        // `className={"…"}`, which used to send such a class back whole as
        // a fallback; read like the attribute form now, it arrives here.
        && root.carried_classes.is_empty()
        && root
            .class_name_fallback
            .iter()
            .all(|expression| binding_only(&source_text(source, *expression)))
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
        RenderOptions::default(),
        eligible.then_some((&mut carrier, inputs)),
    );
    // A synthetic leaf TextInput prepares styles only; the real owner
    // component owns its accessible name.
    if eligible && root.primitive == Primitive::TextInput {
        output
            .diagnostics
            .retain(|d| d.code != DiagnosticCode::A11yMissingAccessibleName);
    }
    // These are the existing owner's supplied state and residual resolver,
    // not wrappers to install. Every other helper/hook needs separate evidence.
    let style_only = output.prelude.is_empty()
        && output
            .runtime_imports
            .iter()
            .all(|name| matches!(*name, "HozoPressable" | "HozoTextInput" | "hozoClasses"));
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
            message: "Internal ownerStyle currently requires a leaf View/Pressable/Text/TextInput with only class input, no inherited context, expression capture, extra host props, wrappers or hooks. Ordinary output is retained; no partial style plan is certified.".into(),
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
            "const el=<ScrollView className=\"p-2\"/>",
            "const el=<Text className=\"hover:text-red-500\"/>",
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
    fn text_and_text_input_leaf_hosts_compile_explicit_owner_carriers() {
        let (text_output, text_carrier) =
            compile("const el=<Text className=\"text-sm font-bold text-red-500\"/>");
        let text_carrier = text_carrier.expect("leaf Text compiles resting carrier");
        assert!(
            text_output.diagnostics.is_empty(),
            "{:?}",
            text_output.diagnostics
        );
        assert!(text_carrier.literal_resting && !text_carrier.callback);
        assert!(text_output.styles.contains("fontSize: 14"));

        let source = "const el=<TextInput className=\"border p-2 focus:border-blue-500 focus-visible:border-purple-500 disabled:opacity-50 read-only:bg-gray-100 aria-[invalid=true]:border-red-500 aria-required:border-amber-500\"/>";
        let parsed = hozo_parser::parse_tsx(source);
        let facts = [
            OwnerFact::Disabled,
            OwnerFact::ReadOnly,
            OwnerFact::AriaInvalid,
            OwnerFact::AriaRequired,
        ];
        let (output, carrier) = lower_owner_style_with_inputs(
            &parsed.roots[0].node,
            &[],
            source,
            &Theme::default(),
            OwnerStyleInputs {
                facts: &facts,
                split_text: false,
                ..Default::default()
            },
        );
        let carrier =
            carrier.expect("leaf TextInput compiles stateful carrier with declared facts");
        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(carrier.callback && !carrier.literal_resting);
        for fact in facts {
            assert!(
                carrier.expression.contains(&fact.parameter()),
                "{}",
                carrier.expression
            );
        }
        assert!(carrier.expression.contains("focused"));
        assert!(carrier.expression.contains("focusVisible"));

        for rejected in [
            "const el=<TextInput className=\"hover:border-blue-500\"/>",
            "const el=<TextInput className=\"active:border-blue-500\"/>",
            "const el=<TextInput className=\"placeholder:text-gray-400\"/>",
        ] {
            let parsed = hozo_parser::parse_tsx(rejected);
            let (_, carrier) = lower_owner_style_with_inputs(
                &parsed.roots[0].node,
                &[],
                rejected,
                &Theme::default(),
                OwnerStyleInputs {
                    facts: &facts,
                    split_text: false,
                    ..Default::default()
                },
            );
            assert!(carrier.is_none(), "{rejected}");
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
                ..Default::default()
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
            "<View className=\"text-[2em]\"/>",
            "<View className=\"hover:text-red-500\"/>",
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

        // Stateless split-text Views compile box + text declarations into a resting carrier.
        let view_source = "const el=<View className=\"p-2 text-[#112233] font-bold\"/>";
        let view_parsed = hozo_parser::parse_tsx(view_source);
        let (view_output, view_carrier) = lower_owner_style_with_inputs(
            &view_parsed.roots[0].node,
            &[],
            view_source,
            &Theme::default(),
            OwnerStyleInputs {
                split_text: true,
                ..Default::default()
            },
        );
        let view_carrier =
            view_carrier.expect("stateless split-text View compiles resting carrier");
        assert!(view_output.diagnostics.is_empty());
        assert!(view_carrier.split_text && view_carrier.literal_resting && !view_carrier.callback);
        assert!(view_output.styles.contains("color: '#112233'"));
        assert!(
            !compile(view_source).0.styles.contains("#112233"),
            "View without split_text must not emit text styles"
        );
        assert!(
            compile("const el=<View className=\"text-[#112233]\"/>")
                .1
                .is_none(),
            "text-only View without split_text has no carrier"
        );

        // Data-attribute owner facts compile standalone, negated, and stacked guards.
        let day_source = "const el=<Pressable className=\"p-1 data-[hozo-outside]:opacity-50 data-[hozo-range-start]:bg-[#112233] not-data-[hozo-disabled]:text-[#ffffff] hover:data-[hozo-in-range]:bg-[#223344]\"/>";
        let day_parsed = hozo_parser::parse_tsx(day_source);
        let day_facts = [
            OwnerFact::DataHozoOutside,
            OwnerFact::DataHozoDisabled,
            OwnerFact::DataHozoRangeStart,
            OwnerFact::DataHozoRangeEnd,
            OwnerFact::DataHozoInRange,
        ];
        let (day_output, day_carrier) = lower_owner_style_with_inputs(
            &day_parsed.roots[0].node,
            &[],
            day_source,
            &Theme::default(),
            OwnerStyleInputs {
                facts: &day_facts,
                split_text: true,
                ..Default::default()
            },
        );
        let day_carrier = day_carrier.expect("Calendar day data-hozo-* facts compile");
        assert!(
            day_output.diagnostics.is_empty(),
            "{:?}",
            day_output.diagnostics
        );
        assert!(day_carrier.callback && day_carrier.split_text);
        for fact in day_facts {
            assert!(day_carrier.expression.contains(&fact.parameter()));
        }

        // Interactive split-text View (e.g. TimePicker.value spinbutton) delivers
        // hovered/focused/focusVisible and declared facts, while refusing pressed.
        let value_source = "const el=<View className=\"px-2 text-[#112233] hover:bg-[#101010] focus:bg-[#202020] focus-visible:bg-[#303030] aria-disabled:opacity-50 data-[hozo-disabled]:text-[#404040]\"/>";
        let value_parsed = hozo_parser::parse_tsx(value_source);
        let value_events = [
            OwnerEvent::Hovered,
            OwnerEvent::Focused,
            OwnerEvent::FocusVisible,
        ];
        let value_facts = [OwnerFact::AriaDisabled, OwnerFact::DataHozoDisabled];
        let (value_output, value_carrier) = lower_owner_style_with_inputs(
            &value_parsed.roots[0].node,
            &[],
            value_source,
            &Theme::default(),
            OwnerStyleInputs {
                facts: &value_facts,
                events: &value_events,
                split_text: true,
            },
        );
        let value_carrier = value_carrier.expect("interactive split-text View compiles");
        assert!(
            value_output.diagnostics.is_empty(),
            "{:?}",
            value_output.diagnostics
        );
        assert!(value_carrier.callback && value_carrier.split_text && value_carrier.focus_visible);
        assert_eq!(value_carrier.events, value_events);
        assert!(value_carrier
            .expression
            .contains("hovered, focused, focusVisible"));
        assert!(!value_carrier.expression.contains("pressed"));
        for fact in value_facts {
            assert!(value_carrier.expression.contains(&fact.parameter()));
        }
        for rejected in [
            "const el=<View className=\"active:bg-[#505050]\"/>",
            "const el=<View className=\"not-active:bg-[#505050]\"/>",
        ] {
            let parsed = hozo_parser::parse_tsx(rejected);
            let (_, carrier) = lower_owner_style_with_inputs(
                &parsed.roots[0].node,
                &[],
                rejected,
                &Theme::default(),
                OwnerStyleInputs {
                    facts: &value_facts,
                    events: &value_events,
                    split_text: true,
                },
            );
            assert!(carrier.is_none(), "{rejected}");
        }

        // TimePicker.step data-hozo-step presence and equality facts compile with distinct keys.
        let step_source = "const el=<Pressable className=\"p-1 data-[hozo-step]:opacity-90 data-[hozo-step=increase]:bg-[#111111] data-[hozo-step=decrease]:bg-[#222222] data-[hozo-disabled]:opacity-40\"/>";
        let step_parsed = hozo_parser::parse_tsx(step_source);
        let step_facts = [
            OwnerFact::Disabled,
            OwnerFact::DataHozoStep,
            OwnerFact::DataHozoStepIncrease,
            OwnerFact::DataHozoStepDecrease,
            OwnerFact::DataHozoDisabled,
        ];
        let (step_output, step_carrier) = lower_owner_style_with_inputs(
            &step_parsed.roots[0].node,
            &[],
            step_source,
            &Theme::default(),
            OwnerStyleInputs {
                facts: &step_facts,
                split_text: true,
                ..Default::default()
            },
        );
        let step_carrier = step_carrier.expect("TimePicker.step data-hozo-step facts compile");
        assert!(
            step_output.diagnostics.is_empty(),
            "{:?}",
            step_output.diagnostics
        );
        assert!(step_output.styles.contains("data_hozo_step_eq_increase"));
        assert!(step_output.styles.contains("data_hozo_step_eq_decrease"));
        for fact in step_facts {
            assert!(step_carrier.expression.contains(&fact.parameter()));
        }

        // NativeSelect.indicator: box-only View with full trigger events/facts refuses text styles.
        let ind_source = "const el=<View className=\"w-2 h-2 border-b-2 border-[#111111] active:border-[#222222] hover:border-[#333333] focus-visible:border-[#444444] disabled:opacity-50 aria-[invalid=true]:border-[#555555]\"/>";
        let ind_parsed = hozo_parser::parse_tsx(ind_source);
        let ind_events = [
            OwnerEvent::Pressed,
            OwnerEvent::Hovered,
            OwnerEvent::Focused,
            OwnerEvent::FocusVisible,
        ];
        let ind_facts = [
            OwnerFact::Disabled,
            OwnerFact::AriaInvalid,
            OwnerFact::AriaRequired,
        ];
        let (ind_output, ind_carrier) = lower_owner_style_with_inputs(
            &ind_parsed.roots[0].node,
            &[],
            ind_source,
            &Theme::default(),
            OwnerStyleInputs {
                facts: &ind_facts,
                events: &ind_events,
                split_text: false,
            },
        );
        let ind_carrier = ind_carrier.expect("box-only interactive View compiles");
        assert!(
            ind_output.diagnostics.is_empty(),
            "{:?}",
            ind_output.diagnostics
        );
        assert!(ind_carrier.callback && !ind_carrier.split_text && ind_carrier.focus_visible);
        let ind_text_parsed =
            hozo_parser::parse_tsx("const el=<View className=\"text-[#111111]\"/>");
        assert!(
            lower_owner_style_with_inputs(
                &ind_text_parsed.roots[0].node,
                &[],
                "const el=<View className=\"text-[#111111]\"/>",
                &Theme::default(),
                OwnerStyleInputs {
                    facts: &ind_facts,
                    events: &ind_events,
                    split_text: false,
                },
            )
            .1
            .is_none(),
            "box-only interactive View must refuse text utilities"
        );

        // NativeSelect.option: press-only Pressable compiles pressed/facts and refuses hover/focus.
        let opt_source = "const el=<Pressable className=\"p-2 text-[#111111] active:bg-[#222222] aria-selected:bg-[#333333] disabled:opacity-50\"/>";
        let opt_parsed = hozo_parser::parse_tsx(opt_source);
        let opt_events = [OwnerEvent::Pressed];
        let opt_facts = [
            OwnerFact::Disabled,
            OwnerFact::AriaSelected,
            OwnerFact::AriaDisabled,
        ];
        let (opt_output, opt_carrier) = lower_owner_style_with_inputs(
            &opt_parsed.roots[0].node,
            &[],
            opt_source,
            &Theme::default(),
            OwnerStyleInputs {
                facts: &opt_facts,
                events: &opt_events,
                split_text: true,
            },
        );
        let opt_carrier = opt_carrier.expect("press-only Pressable compiles");
        assert!(
            opt_output.diagnostics.is_empty(),
            "{:?}",
            opt_output.diagnostics
        );
        assert!(opt_carrier.callback && opt_carrier.split_text);
        assert!(opt_carrier.expression.contains("{ pressed,"));
        assert!(!opt_carrier.expression.contains("hovered"));
        for rejected in [
            "const el=<Pressable className=\"hover:bg-[#444444]\"/>",
            "const el=<Pressable className=\"focus:bg-[#444444]\"/>",
            "const el=<Pressable className=\"focus-visible:bg-[#444444]\"/>",
        ] {
            let parsed = hozo_parser::parse_tsx(rejected);
            assert!(
                lower_owner_style_with_inputs(
                    &parsed.roots[0].node,
                    &[],
                    rejected,
                    &Theme::default(),
                    OwnerStyleInputs {
                        facts: &opt_facts,
                        events: &opt_events,
                        split_text: true,
                    },
                )
                .1
                .is_none(),
                "press-only Pressable must refuse {rejected}"
            );
        }
    }
}
