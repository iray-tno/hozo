//! `Node` -> React Native component name/props, plus the same
//! accessibility diagnostic `hozo_web::markup` emits (proposal
//! §10.1/§10.2) -- the diagnosis is platform-independent even though the
//! actual props differ (RN has no `role`/`tabIndex`, it has
//! `accessibilityRole`/`accessible`).

use hozo_ir::{AccessibilityRole, Diagnostic, DiagnosticCode, Node, Primitive, Severity, SvgElement};

/// `(RN component name, extra props beyond `style`)`.
///
/// `Button` maps to RN's `Pressable` with an explicit `accessibilityRole`
/// (proposal §10.1's own example), not RN's built-in `Button` component --
/// that component can't be styled the way a Hozo-compiled Button needs to
/// be (no `style` prop covering layout/typography, only a handful of color
/// props). `Pressable` gets the same interactive-without-role diagnostic as
/// the Web backend, using RN's actual accessibility prop names.
/**
 * The word a ruby annotation annotates, when the compiler can read it.
 *
 * React Native flattens nested `Text` into one accessibility node, so a
 * screen reader reads the base and then the reading: 「漢字かんじ」, the
 * word twice and the second time spelled out. The lever that stops it is
 * the parent's own `accessibilityLabel`, which replaces the children
 * rather than being assembled from them.
 *
 * `None` when any part of the base is an expression -- that is a string
 * only React Native will ever hold, and `HozoRuby` reads it there.
 */
/// Whether a `<Separator>` was marked decorative.
///
/// A JSX shorthand (`<Separator decorative>`) is the literal `"true"`,
/// which is what the attribute means. A value the compiler cannot read is
/// treated as not set: one role goes into the file, and guessing at an
/// expression would be choosing it wrongly half the time.
fn separator_is_decorative(node: &Node) -> bool {
    node.props
        .passthrough
        .iter()
        .find(|prop| prop.name.as_deref() == Some("decorative"))
        .is_some_and(|prop| prop.literal.as_deref() != Some("false"))
}
fn static_ruby_base(node: &Node) -> Option<String> {
    let mut base = String::new();
    for child in &node.children {
        match child {
            hozo_ir::Child::Text(text) => base.push_str(text),
            hozo_ir::Child::Node(child) if child.primitive == Primitive::RubyText => {}
            // A styled base (`<Ruby><Strong>漢</Strong>…`) is still
            // readable, as long as everything under it is.
            hozo_ir::Child::Node(child) => base.push_str(&static_ruby_base(child)?),
            _ => return None,
        }
    }
    (!base.trim().is_empty()).then_some(base)
}
pub fn native_component(node: &Node, diagnostics: &mut Vec<Diagnostic>) -> (&'static str, Vec<(&'static str, String)>) {
    let (component, attrs) = native_component_inner(node, diagnostics);
    (component, apply_authored_role(node, attrs))
}

fn native_component_inner(node: &Node, diagnostics: &mut Vec<Diagnostic>) -> (&'static str, Vec<(&'static str, String)>) {
    match node.primitive {
        // `react-native-svg` exports these under exactly the names SVG
        // gives them, which is why the JSX spelling is a namespace rather
        // than a prefix: the name that reaches the output here is the same
        // name the author wrote after `Svg.`.
        // The Native half of the same contract the Web backend states for
        // `role="img"`: a named drawing announces itself as an image with
        // that name. `accessible` is what makes the subtree one element
        // rather than a pile of unlabelled shapes, which is also what
        // `@hozo/canvas` does for its own surface.
        Primitive::Svg(SvgElement::Root) if node.props.has_accessible_name() == Some(true) => {
            // The Native half of the same distinction the Web backend
            // draws. `accessible` is what collapses a subtree into one
            // element, so it belongs with `image` and not with the case
            // where the point is that the subtree stays reachable.
            if node.has_exposable_content() {
                ("Svg", vec![("role", "group".to_string())])
            } else {
                (
                    "Svg",
                    vec![
                        ("accessible", String::new()),
                        ("accessibilityRole", "image".to_string()),
                    ],
                )
            }
        }
        Primitive::Svg(element) => (element.runtime_name(), Vec::new()),
        Primitive::View => ("View", Vec::new()),
        Primitive::Text => ("Text", Vec::new()),
        Primitive::Paragraph => ("Text", Vec::new()),
        Primitive::Heading => ("Text", vec![("accessibilityRole", "header".to_string())]),
        Primitive::Section => ("View", Vec::new()),
        Primitive::Article => ("View", vec![("role", "article".to_string())]),
        Primitive::Nav => ("View", vec![("role", "navigation".to_string())]),
        Primitive::Main => ("View", vec![("role", "main".to_string())]),
        Primitive::Header => ("View", vec![("role", "banner".to_string())]),
        Primitive::Footer => ("View", vec![("role", "contentinfo".to_string())]),
        Primitive::Aside => ("View", vec![("role", "complementary".to_string())]),
        // No role. React Native's `Role` carries every other landmark in
        // this file -- banner, complementary, contentinfo, navigation, main,
        // figure, group, list, separator -- and for search it has
        // `searchbox`, which is the field rather than the region around it.
        // `accessibilityRole: 'search'` means the field too.
        //
        // So this emitted a value the platform does not accept, and the
        // component in `@hozo/semantics` already said so and emitted none.
        // The two disagreed, and this was the half that was wrong.
        Primitive::Search => ("View", Vec::new()),
        Primitive::Figure => ("View", vec![("role", "figure".to_string())]),
        Primitive::Figcaption => ("Text", Vec::new()),
        Primitive::Time => ("Text", Vec::new()),
        Primitive::Address => ("View", Vec::new()),
        Primitive::Fieldset => ("View", vec![("role", "group".to_string())]),
        Primitive::Legend => ("Text", Vec::new()),
        // A disclosure is behaviour, and React Native has no element for
        // it. These used to be a View holding a Pressable with a button
        // role and then the body, always: no toggle on the button and the
        // body visible whether it was open or not. The behaviour lives in
        // `@hozo/behaviors`, for the reason `Dialog` does.
        Primitive::Details => ("HozoDetails", Vec::new()),
        Primitive::Summary => ("HozoSummary", Vec::new()),
        Primitive::TermList => ("View", vec![("role", "list".to_string())]),
        Primitive::Term => ("Text", Vec::new()),
        Primitive::Description => ("View", Vec::new()),
        // `decorative` decides the role, and it was not being read: every
        // rule announced itself as a separator, including the ones drawn
        // purely to look like a line. The uncompiled fallback in
        // `@hozo/semantics` has always read it.
        //
        // `role` rather than `accessibilityRole` for the separator case,
        // because React Native's `AccessibilityRole` has no such value.
        // Android throws the `role` away too --
        // `ReactAccessibilityDelegate.kt` has no `Role.SEPARATOR` arm and
        // falls to "No mapping from ARIA role to AccessibilityRole" -- so
        // this is what the platform allows to be said rather than what it
        // will repeat. `none` it does have, and silencing a decorative
        // rule is the half that works (#309).
        Primitive::Separator if separator_is_decorative(node) => (
            "View",
            vec![
                ("role", "none".to_string()),
                ("accessibilityRole", "none".to_string()),
            ],
        ),
        Primitive::Separator => ("View", vec![("role", "separator".to_string())]),
        // The role is a role React Native has. The *value* is the part
        // that needs translating, and it happens in `render.rs`, where the
        // source is in reach: `value` and `max` are props of `<progress>`
        // and mean nothing on a View, so a compiled progress bar announced
        // itself as one and reported no position at all.
        Primitive::Progress => ("View", vec![("role", "progressbar".to_string())]),
        Primitive::List => ("View", vec![("accessibilityRole", "list".to_string())]),
        Primitive::ListItem => ("View", vec![("role", "listitem".to_string())]),
        Primitive::ActivityIndicator => ("ActivityIndicator", Vec::new()),
        Primitive::TouchableOpacity => ("TouchableOpacity", Vec::new()),
        Primitive::TouchableWithoutFeedback => ("TouchableWithoutFeedback", Vec::new()),
        Primitive::Button | Primitive::Pressable
            if node
                .props
                .passthrough
                .iter()
                .any(|p| p.name.as_deref() == Some("href")) =>
        {
            // `download` is the one of the four Web-only props whose absence
            // is felt. See `DiagnosticCode::PropHasNoNativeEquivalent`.
            if let Some(prop) = node
                .props
                .passthrough
                .iter()
                .find(|prop| prop.name.as_deref() == Some("download"))
            {
                diagnostics.push(Diagnostic {
                    code: DiagnosticCode::PropHasNoNativeEquivalent,
                    severity: Severity::Warning,
                    message: "`download` has no equivalent on React Native: the platform has no \
                              download at all, so this link opens and the operating system \
                              decides -- a download on Android, a viewer on iOS. Fetch the file \
                              with a file-system library and hand it to `Share` if it has to be \
                              saved."
                        .to_string(),
                    span: prop.span.0,
                });
            }
            // The primitive controls appearance; following an `href` is
            // still navigation, so let `HozoLink` keep its link-role default.
            ("HozoLink", Vec::new())
        }
        Primitive::Button => ("Pressable", vec![("accessibilityRole", "button".to_string())]),
        Primitive::Link => ("HozoLink", Vec::new()),
        Primitive::Image => ("Image", image_attrs(node, diagnostics)),
        Primitive::ScrollView => ("ScrollView", Vec::new()),
        Primitive::FlatList => ("FlatList", vec![("accessibilityRole", "list".to_string())]),
        Primitive::Strong => ("Text", Vec::new()),
        Primitive::Emphasis => ("Text", Vec::new()),
        Primitive::Underline => ("Text", Vec::new()),
        Primitive::Strikethrough => ("Text", Vec::new()),
        Primitive::Sub => ("Text", Vec::new()),
        Primitive::Sup => ("Text", Vec::new()),
        Primitive::Code => ("Text", Vec::new()),
        Primitive::Small => ("Text", Vec::new()),
        Primitive::Mark => ("Text", Vec::new()),
        Primitive::NoBreak => ("Text", Vec::new()),
        // The label is the base text, so the reading is not announced
        // after it. Written here when it is static, which is most ruby,
        // and by `HozoRuby` when it is not -- see `static_ruby_base`.
        // An author who wrote their own label knows what the word is;
        // `render.rs` emits that one and this must not add a second.
        Primitive::Ruby if node.props.accessibility_label.is_some() => ("Text", Vec::new()),
        Primitive::Ruby => match static_ruby_base(node) {
            Some(base) => ("Text", vec![("accessibilityLabel", base)]),
            None => ("HozoRuby", Vec::new()),
        },
        Primitive::RubyText => ("Text", Vec::new()),
        Primitive::Pressable => {
            let mut props = Vec::new();
            match &node.props.accessibility_role {
                Some(AccessibilityRole::Button) => {
                    props.push(("accessibilityRole", "button".to_string()));
                }
                Some(AccessibilityRole::Link) => {
                    props.push(("accessibilityRole", "link".to_string()));
                }
                // `role` rather than `accessibilityRole`: React Native has
                // taken the ARIA spelling since 0.71, and it is the one
                // vocabulary both platforms share.
                Some(AccessibilityRole::Aria(role)) => {
                    props.push(("role", role.clone()));
                }
                // Its own vocabulary, which only this platform has.
                Some(AccessibilityRole::NativeOnly(role)) => {
                    props.push(("accessibilityRole", role.clone()));
                }
                None => {
                    if node.props.on_press.is_some() {
                        diagnostics.push(Diagnostic {
                            code: DiagnosticCode::A11yInteractiveWithoutRole,
                            severity: Severity::Warning,
                            message: "Interactive Pressable has no accessible role. Consider: \
                                      accessibilityRole=\"button\""
                                .to_string(),
                            span: node.span,
                        });
                    }
                }
            }
            ("Pressable", props)
        }
        // Same diagnosis as the Web backend, which is the point: the
        // accessibility question doesn't change between platforms even
        // though the prop names do.
        Primitive::TextInput => ("TextInput", missing_label(node, diagnostics)),
        Primitive::Dialog => ("HozoDialog", dialog_attrs(node, diagnostics)),
    }
}

fn image_attrs(node: &Node, diagnostics: &mut Vec<Diagnostic>) -> Vec<(&'static str, String)> {
    // `alt` names an image and nothing else, so it is added here rather
    // than to the shared list. An empty one is a name: it says the image
    // is decorative, which is a claim and not an omission.
    let alt = node.props.passthrough.iter().any(|p| p.name.as_deref() == Some("alt"));
    if !alt && node.props.has_accessible_name() == Some(false) {
        diagnostics.push(Diagnostic {
            code: DiagnosticCode::A11yMissingAccessibleName,
            severity: Severity::Warning,
            message: "Image has no alternative text. Add `alt` (use an empty string for a decorative image) or `accessibilityLabel`."
                .to_string(),
            span: node.span,
        });
    }
    Vec::new()
}

/// Diagnoses a text field with no accessible name (proposal §10.2). The
/// Web counterpart carries the reasoning; this is the same check with
/// React Native's prop names in the message.
/// A dialog's own diagnostics (proposal §10.3): it needs a name, and it
/// needs a way out.
///
/// The dismissal check is the one part of §10.3's quality bar a compiler
/// can see -- focus trapping and restoration are behaviours, but "there is
/// no `onClose`" is a missing prop. Escape on Web and the hardware back
/// button on Android both arrive there, so without it the modal ignores
/// both and reads as a trap.
fn dialog_attrs(node: &Node, diagnostics: &mut Vec<Diagnostic>) -> Vec<(&'static str, String)> {
    if node.props.has_accessible_name() == Some(false) {
        diagnostics.push(Diagnostic {
            code: DiagnosticCode::A11yMissingAccessibleName,
            severity: Severity::Warning,
            message: "Dialog has no accessible name, so a screen reader announces only that a dialog opened. Add `accessibilityLabel`."
                .to_string(),
            span: node.span,
        });
    }
    if !node.props.has_on_close {
        diagnostics.push(Diagnostic {
            code: DiagnosticCode::A11yDialogWithoutDismiss,
            severity: Severity::Warning,
            message: "Dialog has no `onClose`, so Escape and the Android back button do nothing and the modal is a trap. Add `onClose`."
                .to_string(),
            span: node.span,
        });
    }
    Vec::new()
}

fn missing_label(node: &Node, diagnostics: &mut Vec<Diagnostic>) -> Vec<(&'static str, String)> {
    if node.props.has_accessible_name() == Some(false) {
        diagnostics.push(Diagnostic {
            code: DiagnosticCode::A11yMissingAccessibleName,
            severity: Severity::Warning,
            message: if node.props.has_placeholder {
                "TextInput has a placeholder but no accessible name. A placeholder is not a label: it may not be announced as one, and it disappears as soon as the user types. Add `accessibilityLabel`."
                    .to_string()
            } else {
                "TextInput has no accessible name, so a screen reader announces only that it is a text field. Add `accessibilityLabel`."
                    .to_string()
            },
            span: node.span,
        });
    }
    Vec::new()
}

/// Applies an author-written role over the primitive's own.
///
/// `role` and `accessibilityRole` are two spellings of one concept, so a
/// primitive that supplies its own must not also emit it when the author
/// has said otherwise -- `<List role="menu">` is a menu built on a list,
/// and announcing both is announcing neither.
///
/// The author's role is never dropped for being redundant. `<ul role="list">`
/// looks redundant and is a deliberate, documented workaround: Safari
/// removes list semantics from a `<ul>` styled `list-style: none`, and the
/// explicit role is what puts them back.
fn apply_authored_role(
    node: &Node,
    mut attrs: Vec<(&'static str, String)>,
) -> Vec<(&'static str, String)> {
    let Some(role) = &node.props.accessibility_role else { return attrs };
    attrs.retain(|(key, _)| *key != "role" && *key != "accessibilityRole");
    match role {
        AccessibilityRole::Button => attrs.push(("role", "button".to_string())),
        AccessibilityRole::Link => attrs.push(("role", "link".to_string())),
        AccessibilityRole::Aria(name) => attrs.push(("role", name.clone())),
        // Its own vocabulary, which only this platform has.
        AccessibilityRole::NativeOnly(name) => {
            attrs.push(("accessibilityRole", name.clone()))
        }
    }
    attrs
}

#[cfg(test)]
mod tests {
    use super::*;
    use hozo_ir::{ExprRef, PropSet, SourceSpan};

    fn empty_span() -> SourceSpan {
        SourceSpan { start: 0, end: 0 }
    }

    #[test]
    fn button_maps_to_pressable_with_explicit_role() {
        let node = Node {
            primitive: Primitive::Button,
            style: Vec::new(),
            props: PropSet::default(),
            children: Vec::new(),
            class_name_fallback: Vec::new(),
            carried_classes: Vec::new(),
            span: empty_span(),
        };
        let mut diagnostics = Vec::new();
        let (component, props) = native_component(&node, &mut diagnostics);
        assert_eq!(component, "Pressable");
        assert!(props.iter().any(|(k, v)| *k == "accessibilityRole" && v == "button"));
        assert!(diagnostics.is_empty());
    }

    #[test]
    fn interactive_pressable_without_role_gets_diagnosed() {
        let node = Node {
            primitive: Primitive::Pressable,
            style: Vec::new(),
            props: PropSet {
                on_press: Some(ExprRef(empty_span())),
                test_id: None,
                native_id: None,
                pointer_events: None,
                accessibility_state: None,
                accessibility_value: None,
                accessibility_live_region: None,
                on_layout: None,
                heading_level: None,
                list_ordered: None,
                on_scroll: None,
                scroll_event_throttle: None,
                disabled: None,
                accessibility_role: None,
                accessibility_label: None,
                accessibility_hint: None,
                image_src: None,
                image_default_source: None,
                scroll_horizontal: None,
                refreshing: None,
                on_refresh: None,
                keyboard_should_persist_taps: None,
                shows_vertical_scroll_indicator: None,
                shows_horizontal_scroll_indicator: None,
                has_placeholder: false,
                open: None,
                has_on_close: false,
                passthrough: Vec::new(),
                ..PropSet::default()
            },
            children: Vec::new(),
            class_name_fallback: Vec::new(),
            carried_classes: Vec::new(),
            span: empty_span(),
        };
        let mut diagnostics = Vec::new();
        let (component, _) = native_component(&node, &mut diagnostics);
        assert_eq!(component, "Pressable");
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].code, DiagnosticCode::A11yInteractiveWithoutRole);
    }
}
