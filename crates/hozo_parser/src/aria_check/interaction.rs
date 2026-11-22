//! Interactive elements nested in each other, and press handlers with no
//! keyboard equivalent.

use hozo_ir::{AccessibilityRole, Diagnostic, DiagnosticCode, Node, Primitive, Severity};

/// What this element is, for the purpose of "can it be pressed".
///
/// `Button` and `Link` are interactive by being what they are; a
/// `Pressable` is interactive once it has a handler or a role saying so.
/// A plain `View` with an `onClick` counts too -- that is the case
/// proposal §10.2 is written about.
pub(super) fn interactive_role(node: &Node) -> Option<&'static str> {
    match node.primitive {
        Primitive::Button => return Some("button"),
        Primitive::Link => return Some("link"),
        Primitive::TextInput => return Some("textbox"),
        _ => {}
    }
    match &node.props.accessibility_role {
        Some(AccessibilityRole::Button) => return Some("button"),
        Some(AccessibilityRole::Link) => return Some("link"),
        _ => {}
    }
    if node.props.on_press.is_some() {
        return Some("button");
    }
    if node
        .props
        .passthrough
        .iter()
        .any(|prop| prop.name.as_deref() == Some("onClick"))
    {
        return Some("button");
    }
    None
}

/// One interactive element inside another.
///
/// Not a style question. The DOM does not allow it -- a `<button>` inside
/// a `<button>`, or anything interactive inside an `<a>` -- and a browser
/// meeting one *reparents* the markup, so what renders is not what was
/// written and the inner control ends up beside the outer one rather than
/// in it. Before that it is ambiguous to everyone: a screen reader
/// announces two controls occupying the same place, a keyboard user gets
/// one tab stop or two depending on the engine, and a press is claimed by
/// whichever handler happens to be closer.
///
/// Decidable here because both are in the same tree. Anything the compiler
/// is only carrying between them means nothing is claimed, the same rule
/// the rest of this file follows.
pub(super) fn check_interactive_nesting(
    node: &Node,
    outer: Option<&str>,
    diagnostics: &mut Vec<Diagnostic>,
) {
    let (Some(outer), Some(inner)) = (outer, interactive_role(node)) else {
        return;
    };
    diagnostics.push(Diagnostic {
        code: DiagnosticCode::A11yInteractiveNesting,
        severity: Severity::Warning,
        message: format!(
            "This is a `{inner}` inside a `{outer}`, which the DOM does not allow: a browser \
             meeting one moves the inner element out, so what renders is not what is written \
             here. Before that it is ambiguous to everyone -- a screen reader announces two \
             controls in one place, and a press goes to whichever handler is closer. Put them \
             side by side, or make the outer one a plain container."
        ),
        span: node.span,
    });
}

/// A press handler on something nobody can press with a keyboard.
///
/// Two shapes, and they fail differently. `onClick` on a `View` is the
/// case proposal §10.2 is written about: it works with a mouse, it is not
/// in the tab order, it announces as nothing, and it is invisible to
/// whoever built it because they have a pointer. `onPress` on a `View` is
/// worse and quieter -- neither platform has such a prop on a plain view,
/// so it is carried to the output and does nothing at all, on Web *and* on
/// device.
///
/// `Pressable` is exempt: it is Hozo's interactive primitive, it gets a
/// `tabIndex` from the Web backend, and the role it is missing is already
/// reported as `A11yInteractiveWithoutRole`.
pub(super) fn check_press_without_keyboard(node: &Node, diagnostics: &mut Vec<Diagnostic>) {
    if !matches!(node.primitive, Primitive::View | Primitive::Text) {
        return;
    }
    // `onPress` is modelled rather than carried, so it is on the props
    // and not in the passthrough list -- looking only at the latter found
    // `onClick` and missed the worse of the two.
    let handler = if node.props.on_press.is_some() {
        Some("onPress")
    } else {
        node.props
            .passthrough
            .iter()
            .filter_map(|prop| prop.name.as_deref())
            .find(|name| *name == "onPress" || *name == "onClick")
    };
    let Some(handler) = handler else { return };

    let message = if handler == "onPress" {
        "`onPress` is not a prop a plain View has, on either platform: React Native puts it on \
         `Pressable` and the DOM has no such event at all. It is carried into the output and \
         does nothing there -- not a missing keyboard path but a missing press. Use `Pressable`."
            .to_string()
    } else {
        "This View has an `onClick` and nothing that makes it a control: it is not in the tab \
         order, it announces as a group rather than as a button, and Enter and Space do \
         nothing. It works with a pointer, which is why this is easy to ship. Use `Pressable` \
         with an `accessibilityRole`, which gives all three."
            .to_string()
    };
    diagnostics.push(Diagnostic {
        code: DiagnosticCode::A11yPressWithoutKeyboard,
        severity: Severity::Warning,
        message,
        span: node.span,
    });
}
