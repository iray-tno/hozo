//! Accessible names: where a role allows one, and where one must be given or
//! forwarded.

use hozo_ir::{Diagnostic, DiagnosticCode, Node, Primitive, Severity};

use crate::aria;

/// A name on a role that forbids one.
pub(super) fn check_name_allowed(
    node: &Node,
    spec: &aria::AriaRole,
    diagnostics: &mut Vec<Diagnostic>,
) {
    if node.props.accessibility_label.is_none() {
        return;
    }
    if aria::allows_prop(spec, "aria-label") {
        return;
    }
    diagnostics.push(Diagnostic {
        code: DiagnosticCode::AriaNameProhibited,
        severity: Severity::Warning,
        message: format!(
            "`role=\"{}\"` cannot carry an accessible name, so this `accessibilityLabel` may \
             never be announced. Name something that can be named instead -- a `Section` \
             becomes a region, an `Article` and a `Nav` are landmarks -- or give this element \
             a role that takes one.",
            spec.name,
        ),
        span: node.span,
    });
}

/// A name on an element that drops it before it reaches the platform.
///
/// Only `Modal` today (#1015). A spread may hold anything, so only a name
/// that is written out is reported.
pub(super) fn check_name_forwarded(node: &Node, diagnostics: &mut Vec<Diagnostic>) {
    if node.primitive != Primitive::Modal || node.props.has_accessible_name() != Some(true) {
        return;
    }
    diagnostics.push(Diagnostic {
        code: DiagnosticCode::A11yNameNotForwarded,
        severity: Severity::Warning,
        message: "`Modal` passes no accessibility props to the platform, on React Native or \
                  on Web, so this name is never announced. Use a `Dialog`, which is named \
                  and announced as a dialog, or put the name on a `View` inside the modal."
            .to_string(),
        span: node.span,
    });
}

/// A pattern that has nothing to announce but the name it was given.
///
/// `OtpInput` is one text field and `ColorPicker` one group, and neither
/// has a default name the way `Pagination`, `Stepper` and
/// `CommandPalette` fall back to a translated one (#1014). Their types
/// require `accessibilityLabel`, but Vite and Metro strip types without
/// checking them, so a build is where the omission has to be said.
/// `Listbox` is the same on both platforms -- a list of options under no
/// name -- though its type leaves the label optional. (`Menu` is not: its
/// trigger's text names it.) A spread may hold the name, so it is not
/// guessed at.
pub(super) fn check_pattern_named(node: &Node, diagnostics: &mut Vec<Diagnostic>) {
    let message = match node.primitive {
        Primitive::OtpInput => {
            "OtpInput has no accessible name, so a screen reader announces only a text field \
             and how many characters it takes. Add `accessibilityLabel`."
        }
        Primitive::ColorPicker => {
            "ColorPicker has no accessible name, so its swatches and channels are announced \
             as an unnamed group. Add `accessibilityLabel`."
        }
        Primitive::Listbox => {
            "Listbox has no accessible name, so a screen reader announces its options with \
             nothing to say what they choose. Add `accessibilityLabel`."
        }
        _ => return,
    };
    if node.props.has_accessible_name() != Some(false) {
        return;
    }
    diagnostics.push(Diagnostic {
        code: DiagnosticCode::A11yMissingAccessibleName,
        severity: Severity::Warning,
        message: message.to_string(),
        span: node.span,
    });
}
