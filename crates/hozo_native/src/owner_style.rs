//! RFC010's explicit style-only preparation seam. Reuse the actual renderer's
//! carrier; never parse generated JSX or reconstruct its declaration ordering.
use super::*;

mod facts;
pub use facts::{OwnerEvent, OwnerFact};

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
    let interactive_view = root.primitive == Primitive::View
        && (!inputs.events.is_empty()
            || (!facts.is_empty() && facts.iter().all(|fact| fact.is_data_fact())));
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
mod tests;
