//! `Node` -> HTML element tag/attributes, plus the accessibility
//! diagnostics that fall out of that mapping (proposal §10.1/§10.2).

use hozo_ir::{AccessibilityRole, Diagnostic, DiagnosticCode, HeadingLevel, Node, Primitive, Severity, SvgElement};

/// How an attribute's value is written into the generated JSX.
///
/// The distinction is not cosmetic. Hozo splices its output back into the
/// author's own `.tsx`, so their `tsc` checks it -- and React types
/// `tabIndex` as a `number`. Emitting every attribute as `name="text"`
/// produced `tabIndex="0"`, which is a type error in any project that
/// type-checks its build. `next build` does, by default.
#[derive(Debug, Clone, PartialEq)]
pub enum AttrValue {
    /// `name="text"`.
    Text(String),
    /// `name={expr}`, for props React does not type as a string.
    Expression(String),
}

impl AttrValue {
    pub fn text(value: impl Into<String>) -> Self {
        AttrValue::Text(value.into())
    }
}

/// `(tag, extra attributes beyond class)`.
///
/// `Button` maps straight to `<button>` -- real semantic HTML beats an
/// ARIA role emulation (proposal's "prefer platform semantics" principle).
/// `Pressable` has no such native equivalent, so it stays a `<div>`: with
/// an explicit `accessibility_role` override it gets the matching ARIA
/// role; with none *and* an `on_press` handler (i.e. it's presented as
/// interactive) it's exactly the case proposal §10.2's diagnostic example
/// warns about, so that diagnostic is emitted here rather than silently
/// shipping an inaccessible interactive `<div>`.
pub fn element_shape(node: &Node, diagnostics: &mut Vec<Diagnostic>) -> (&'static str, Vec<(&'static str, AttrValue)>) {
    let (component, attrs) = element_shape_inner(node, diagnostics);
    (component, apply_authored_role(node, attrs, diagnostics))
}

fn element_shape_inner(node: &Node, diagnostics: &mut Vec<Diagnostic>) -> (&'static str, Vec<(&'static str, AttrValue)>) {
    match node.primitive {
        // The DOM tag, which is the lowercase name except for the three
        // SVG spells in camelCase -- `linearGradient` lowercased is an
        // element that parses and never renders.
        // `role="img"` on a *named* root, and only there.
        //
        // An accessible name on an `<svg>` is not reliably a name: the
        // element's implicit role varies by browser and screen reader, and
        // several combinations compute no name at all without an explicit
        // one. `role="img"` is the settled fix, and it is the same one
        // `@hozo/canvas` already makes for its own surface -- so a named
        // drawing was announced by one of Hozo's two drawing primitives
        // and not the other.
        //
        // Only when named. `role="img"` on an unnamed root is worse than
        // nothing: it promises a graphic with a name and delivers a
        // nameless one, where the bare element at least degrades to
        // whatever the author did with `<title>`.
        Primitive::Svg(SvgElement::Root) if node.props.has_accessible_name() == Some(true) => {
            // `img` for a picture, `group` for a drawing with content.
            //
            // `aria-query` records that `img` makes its children
            // presentational, and Hozo's generated table carries that fact
            // -- so putting it on a drawing with a pressable shape or a
            // word in it would take away every control and every line of
            // text inside, in exchange for a name. `group` names the thing
            // and leaves its children exposed; the same table says its
            // children are not presentational and that it prohibits no
            // properties, the name included.
            let role = if node.has_exposable_content() { "group" } else { "img" };
            ("svg", vec![("role", AttrValue::text(role))])
        }
        Primitive::Svg(element) => (element.tag(), Vec::new()),
        Primitive::View if node.props.on_layout.is_some() || node.props.has_responder_handlers() => ("View", Vec::new()),
        Primitive::View => ("div", Vec::new()),
        Primitive::Text if node.props.on_layout.is_some() => ("Text", Vec::new()),
        Primitive::Text => ("span", Vec::new()),
        Primitive::Paragraph if node.props.on_layout.is_some() => ("Paragraph", Vec::new()),
        Primitive::Paragraph => ("p", Vec::new()),
        Primitive::Heading if node.props.on_layout.is_some()
            || matches!(node.props.heading_level, Some(HeadingLevel::Dynamic(_))) => ("Heading", Vec::new()),
        Primitive::Heading => match node.props.heading_level {
            Some(HeadingLevel::Static(2)) => ("h2", Vec::new()),
            Some(HeadingLevel::Static(3)) => ("h3", Vec::new()),
            Some(HeadingLevel::Static(4)) => ("h4", Vec::new()),
            Some(HeadingLevel::Static(5)) => ("h5", Vec::new()),
            Some(HeadingLevel::Static(6)) => ("h6", Vec::new()),
            _ => ("h1", Vec::new()),
        },
        Primitive::Section if node.props.on_layout.is_some() => ("Section", Vec::new()),
        Primitive::Section => ("section", Vec::new()),
        Primitive::Article if node.props.on_layout.is_some() => ("Article", Vec::new()),
        Primitive::Article => ("article", Vec::new()),
        Primitive::Nav if node.props.on_layout.is_some() => ("Nav", Vec::new()),
        Primitive::Nav => ("nav", Vec::new()),
        Primitive::List if node.props.on_layout.is_some()
            || matches!(node.props.list_ordered, Some(hozo_ir::ConditionExpr::Ref(_))) => ("List", Vec::new()),
        Primitive::List if matches!(node.props.list_ordered, Some(hozo_ir::ConditionExpr::Static(true))) =>
            ("ol", Vec::new()),
        Primitive::List => ("ul", Vec::new()),
        Primitive::ListItem if node.props.on_layout.is_some() => ("ListItem", Vec::new()),
        Primitive::ListItem => ("li", Vec::new()),
        Primitive::Main if node.props.on_layout.is_some() => ("Main", Vec::new()),
        Primitive::Main => ("main", Vec::new()),
        Primitive::Header if node.props.on_layout.is_some() => ("Header", Vec::new()),
        Primitive::Header => ("header", Vec::new()),
        Primitive::Footer if node.props.on_layout.is_some() => ("Footer", Vec::new()),
        Primitive::Footer => ("footer", Vec::new()),
        Primitive::Aside if node.props.on_layout.is_some() => ("Aside", Vec::new()),
        Primitive::Aside => ("aside", Vec::new()),
        Primitive::Search if node.props.on_layout.is_some() => ("Search", Vec::new()),
        Primitive::Search => ("search", Vec::new()),
        Primitive::Figure if node.props.on_layout.is_some() => ("Figure", Vec::new()),
        Primitive::Figure => ("figure", Vec::new()),
        Primitive::Figcaption if node.props.on_layout.is_some() => ("Figcaption", Vec::new()),
        Primitive::Figcaption => ("figcaption", Vec::new()),
        Primitive::Time if node.props.on_layout.is_some() => ("Time", Vec::new()),
        Primitive::Time => ("time", Vec::new()),
        Primitive::Address if node.props.on_layout.is_some() => ("Address", Vec::new()),
        Primitive::Address => ("address", Vec::new()),
        Primitive::Fieldset if node.props.on_layout.is_some() => ("Fieldset", Vec::new()),
        Primitive::Fieldset => ("fieldset", Vec::new()),
        Primitive::Legend if node.props.on_layout.is_some() => ("Legend", Vec::new()),
        Primitive::Legend => ("legend", Vec::new()),
        Primitive::Details if node.props.on_layout.is_some() => ("Details", Vec::new()),
        Primitive::Details => ("details", Vec::new()),
        Primitive::Summary if node.props.on_layout.is_some() => ("Summary", Vec::new()),
        Primitive::Summary => ("summary", Vec::new()),
        Primitive::TermList if node.props.on_layout.is_some() => ("TermList", Vec::new()),
        Primitive::TermList => ("dl", Vec::new()),
        Primitive::Term if node.props.on_layout.is_some() => ("Term", Vec::new()),
        Primitive::Term => ("dt", Vec::new()),
        Primitive::Description if node.props.on_layout.is_some() => ("Description", Vec::new()),
        Primitive::Description => ("dd", Vec::new()),
        Primitive::Separator if node.props.on_layout.is_some() => ("Separator", Vec::new()),
        Primitive::Separator => ("hr", Vec::new()),
        Primitive::Progress if node.props.on_layout.is_some() => ("Progress", Vec::new()),
        Primitive::Progress => ("progress", Vec::new()),
        // When a `<Button>` carries `href`, lower it to `<a role="button">` so it retains
        // full browser navigation capabilities (SEO, middle-click, context menu) while
        // expressing button visual semantics.
        Primitive::Button if node.props.passthrough.iter().any(|p| p.name.as_deref() == Some("href")) => {
            ("a", vec![("role", AttrValue::text("button"))])
        }
        // `type="button"`, always. A `<button>` inside a `<form>` defaults
        // to `type="submit"`, and React Native has no forms -- so a
        // `<Button onPress={save} />` that happened to be rendered inside
        // one submitted the form as well as calling `save`, which is not
        // what any of its source says. Not an accessibility fix: the
        // author's stated intent was being changed by its surroundings.
        //
        // A project that genuinely wants a submit button is expressing a
        // Web-only idea, and can say so on a plain `<button>`.
        Primitive::Button => ("button", vec![("type", AttrValue::text("button"))]),
        Primitive::Link => ("a", Vec::new()),
        Primitive::Image if node.props.on_layout.is_some() || node.props.image_default_source.is_some() =>
            ("Image", image_attrs(node, diagnostics)),
        Primitive::Image => ("img", image_attrs(node, diagnostics)),
        Primitive::ScrollView if node.props.on_refresh.is_some()
            || node.props.refreshing.is_some()
            || node.props.on_layout.is_some()
            || node.props.on_scroll.is_some() =>
            ("ScrollView", Vec::new()),
        Primitive::ScrollView => ("div", Vec::new()),
        Primitive::FlatList => ("FlatList", Vec::new()),
        Primitive::Strong => ("strong", Vec::new()),
        Primitive::Emphasis => ("em", Vec::new()),
        Primitive::Underline => ("u", Vec::new()),
        Primitive::Strikethrough => ("s", Vec::new()),
        Primitive::Sub => ("sub", Vec::new()),
        Primitive::Sup => ("sup", Vec::new()),
        Primitive::Code => ("code", Vec::new()),
        Primitive::Small => ("small", Vec::new()),
        Primitive::Mark => ("mark", Vec::new()),
        Primitive::NoBreak => ("span", vec![("style", AttrValue::Expression("{ whiteSpace: 'nowrap' }".to_string()))]),
        Primitive::Ruby => ("ruby", Vec::new()),
        Primitive::Rt => ("rt", Vec::new()),
        Primitive::Pressable => {
            let mut attrs = Vec::new();
            match &node.props.accessibility_role {
                Some(AccessibilityRole::Button) => attrs.push((if node.props.has_responder_handlers() { "accessibilityRole" } else { "role" }, AttrValue::text("button"))),
                Some(AccessibilityRole::Link) => attrs.push((if node.props.has_responder_handlers() { "accessibilityRole" } else { "role" }, AttrValue::text("link"))),
                // Any other ARIA role goes through as written. Hozo does
                // not have an opinion about `combobox` beyond carrying it
                // to the platform that understands it.
                Some(AccessibilityRole::Aria(role)) => attrs.push(("role", AttrValue::text(role.clone()))),
                // A React Native container role. The DOM has nothing that
                // means it, and inventing the nearest ARIA role would be
                // announcing something the author did not write -- so it
                // is reported by `role_diagnostics` and no attribute is
                // emitted.
                Some(AccessibilityRole::NativeOnly(_)) => {}
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
            if node.props.on_press.is_some() && !node.props.has_responder_handlers() {
                // `tabIndex`, not `tabindex` -- this output is JSX, so DOM
                // props take React's camelCase spellings (same reason the
                // class attribute is emitted as `className`). React warns
                // on the all-lowercase form and drops it.
                attrs.push(("tabIndex", AttrValue::Expression("0".to_string())));
            }
            (if node.props.has_responder_handlers() { "Pressable" } else { "div" }, attrs)
        }
        // `multiline` is a prop on React Native and an element on the
        // DOM, so it is decided here rather than added as an attribute.
        Primitive::TextInput => (text_input_tag(node, diagnostics), missing_label(node, diagnostics)),
        // Lowered to `@hozo/a11y`'s component, not to a bare `<dialog>`:
        // the element gives the trap and the inert background, but only
        // once something calls `showModal()`, and keeping `open` in step
        // with the DOM is exactly the runtime behaviour §10.3 assigns to a
        // runtime.
        Primitive::Dialog => ("HozoDialog", dialog_attrs(node, diagnostics)),
    }
}

fn image_attrs(node: &Node, diagnostics: &mut Vec<Diagnostic>) -> Vec<(&'static str, AttrValue)> {
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

/// Diagnoses a text field with no accessible name (proposal §10.2).
///
/// Returns no attributes -- the label itself is passed through from source,
/// since Hozo never invents an accessible name. Guessing one from a
/// `placeholder` or a nearby heading is how a field ends up announced as
/// something it isn't, which is worse than being announced as nothing.
///
/// A `placeholder` in place of a label is called out specifically because
/// it is the common wrong answer: it is not reliably announced as a name,
/// and it disappears on the first keystroke -- exactly when someone would
/// want to check what the field was for.
/// A dialog's own diagnostics (proposal §10.3): it needs a name, and it
/// needs a way out.
///
/// The dismissal check is the one part of §10.3's quality bar a compiler
/// can see -- focus trapping and restoration are behaviours, but "there is
/// no `onClose`" is a missing prop. Escape on Web and the hardware back
/// button on Android both arrive there, so without it the modal ignores
/// both and reads as a trap.
fn dialog_attrs(node: &Node, diagnostics: &mut Vec<Diagnostic>) -> Vec<(&'static str, AttrValue)> {
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

/// `<textarea>` or `<input>`.
///
/// The one place a React Native prop decides a DOM *element*, which is
/// why a runtime value cannot be honoured: the compiler writes one tag
/// into the file. `multiline={isLong}` is reported and falls back to
/// `<input>`, because a single-line field that should have wrapped is a
/// visible problem, and the alternative -- silently choosing -- makes the
/// same field wrong with nothing said.
fn text_input_tag(node: &Node, diagnostics: &mut Vec<Diagnostic>) -> &'static str {
    match &node.props.text_input.multiline {
        Some(hozo_ir::ConditionExpr::Static(true)) => "textarea",
        None | Some(hozo_ir::ConditionExpr::Static(false)) => "input",
        Some(_) => {
            diagnostics.push(Diagnostic {
                code: DiagnosticCode::DynamicPropNotResolved,
                severity: Severity::Warning,
                message: "`multiline` decides which element this becomes on Web -- `<textarea>` or `<input>` -- and its value isn't known until runtime, so the compiler cannot write one. It falls back to `<input>`. Render two elements, or make `multiline` a constant."
                    .to_string(),
                span: node.span,
            });
            "input"
        }
    }
}

fn missing_label(node: &Node, diagnostics: &mut Vec<Diagnostic>) -> Vec<(&'static str, AttrValue)> {
    if node.props.has_accessible_name() == Some(false) {
        diagnostics.push(Diagnostic {
            code: DiagnosticCode::A11yMissingAccessibleName,
            severity: Severity::Warning,
            message: if node.props.has_placeholder {
                "TextInput has a placeholder but no accessible name. A placeholder is not a \
                 label: it may not be announced as one, and it disappears as soon as the user \
                 types. Add `accessibilityLabel`, or associate a visible <label>."
                    .to_string()
            } else {
                "TextInput has no accessible name, so a screen reader announces only that it is \
                 a text field. Add `accessibilityLabel`, or associate a visible <label>."
                    .to_string()
            },
            span: node.span,
        });
    }
    Vec::new()
}

pub fn html_escape(text: &str) -> String {
    text.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;")
}

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
    mut attrs: Vec<(&'static str, AttrValue)>,
    diagnostics: &mut Vec<Diagnostic>,
) -> Vec<(&'static str, AttrValue)> {
    let Some(role) = &node.props.accessibility_role else { return attrs };
    attrs.retain(|(key, _)| *key != "role" && *key != "accessibilityRole");
    // An element carrying responder handlers is rendered by a runtime
    // component that takes React Native's prop names, not by a DOM element
    // -- so the role has to keep the spelling that component reads.
    let key = if node.props.has_responder_handlers() { "accessibilityRole" } else { "role" };
    match role {
        AccessibilityRole::Button => attrs.push((key, AttrValue::text("button"))),
        AccessibilityRole::Link => attrs.push((key, AttrValue::text("link"))),
        AccessibilityRole::Aria(name) => attrs.push((key, AttrValue::text(name.clone()))),
        // The DOM has nothing that means a React Native container role,
        // and the nearest ARIA one would be announcing something the
        // author did not write.
        AccessibilityRole::NativeOnly(name) => diagnostics.push(Diagnostic {
            code: DiagnosticCode::RoleHasNoWebEquivalent,
            severity: Severity::Warning,
            message: if hozo_parser::aria::is_abstract_role(name) {
                format!("`{name}` is one of ARIA's abstract roles, which describe the ontology rather than any element -- the specification says not to write one. Nothing is emitted here, so the element is announced as whatever its tag says.")
            } else {
                format!("`{name}` is not a role ARIA defines, so nothing is emitted here and the element is announced as whatever its tag says. React Native has its own role vocabulary with names like this one; the two overlap for most roles and not for this.")
            },
            span: node.span,
        }),
    }
    attrs
}

#[cfg(test)]
mod tests {
    use super::*;
    use hozo_ir::{Child, ExprRef, PassthroughProp, PropSet, SourceSpan};

    fn empty_span() -> SourceSpan {
        SourceSpan { start: 0, end: 0 }
    }

    /// A `TextInput` whose only props are the passthrough ones named.
    fn text_input_named_by(props: &[&str]) -> Vec<DiagnosticCode> {
        let node = Node {
            primitive: Primitive::TextInput,
            style: Vec::new(),
            props: PropSet {
                passthrough: props
                    .iter()
                    .map(|name| PassthroughProp {
                        span: ExprRef(empty_span()),
                        is_spread: *name == "spread",
                        name: (*name != "spread").then(|| (*name).to_string()),
                        literal: Some("lbl".to_string()),
                        nested: Vec::new(),
                    })
                    .collect(),
                ..PropSet::default()
            },
            children: Vec::new(),
            class_name_fallback: Vec::new(),
            carried_classes: Vec::new(),
            span: empty_span(),
        };
        let mut diagnostics = Vec::new();
        element_shape(&node, &mut diagnostics);
        diagnostics.into_iter().map(|d| d.code).collect()
    }

    #[test]
    fn a_labelledby_reference_is_an_accessible_name() {
        // It was not counted as one. A field labelled the correct way --
        // a `<Text nativeID="lbl">` beside a
        // `<TextInput accessibilityLabelledBy="lbl" />` -- was told it had
        // no accessible name and advised to add an `accessibilityLabel`,
        // which either does nothing or replaces a name that was already
        // right: the two are not additive and `aria-labelledby` wins.
        //
        // A wrong diagnostic costs more than a missing one. It is the
        // channel that stops being believed, and this one is warning
        // people away from the correct answer.
        for prop in ["accessibilityLabelledBy", "aria-labelledby", "aria-label", "title"] {
            assert!(
                !text_input_named_by(&[prop]).contains(&DiagnosticCode::A11yMissingAccessibleName),
                "{prop}"
            );
        }
        // Still said where there is genuinely nothing.
        assert!(text_input_named_by(&[]).contains(&DiagnosticCode::A11yMissingAccessibleName));
        // And not said where a spread might be carrying one: a diagnostic
        // about a name that might be there is one people learn to ignore.
        assert!(!text_input_named_by(&["spread"])
            .contains(&DiagnosticCode::A11yMissingAccessibleName));
    }

    fn svg_root(label: Option<&str>) -> Node {
        let mut props = PropSet::default();
        if label.is_some() {
            props.accessibility_label = Some(ExprRef(empty_span()));
        }
        Node {
            primitive: Primitive::Svg(SvgElement::Root),
            style: Vec::new(),
            props,
            children: Vec::new(),
            class_name_fallback: Vec::new(),
            carried_classes: Vec::new(),
            span: empty_span(),
        }
    }

    #[test]
    fn a_named_drawing_says_it_is_an_image() {
        // An accessible name on an `<svg>` is not reliably a name: the
        // implicit role varies by browser and screen reader, and several
        // combinations compute none at all without an explicit one.
        let mut diagnostics = Vec::new();
        let (tag, attrs) = element_shape(&svg_root(Some("Chart")), &mut diagnostics);
        assert_eq!(tag, "svg");
        assert_eq!(attrs, vec![("role", AttrValue::text("img"))]);
    }

    #[test]
    fn an_unnamed_drawing_is_left_alone() {
        // `role="img"` without a name is worse than nothing: it promises a
        // graphic with a name and delivers a nameless one, where the bare
        // element at least degrades to whatever the author did with
        // `<title>`.
        let mut diagnostics = Vec::new();
        let (tag, attrs) = element_shape(&svg_root(None), &mut diagnostics);
        assert_eq!(tag, "svg");
        assert!(attrs.is_empty());
    }

    #[test]
    fn a_drawing_with_a_control_in_it_is_not_an_image() {
        // `img` makes its children presentational -- `aria-query` says so
        // and the generated table carries it -- so it would take the
        // control away in exchange for the name.
        let mut node = svg_root(Some("Revenue"));
        let mut rect = svg_root(None);
        rect.primitive = Primitive::Svg(SvgElement::Rect);
        rect.props.passthrough.push(PassthroughProp {
            span: ExprRef(empty_span()),
            is_spread: false,
            name: Some("onClick".to_string()),
            literal: None,
            nested: Vec::new(),
        });
        node.children.push(Child::Node(rect));
        let mut diagnostics = Vec::new();
        let (_, attrs) = element_shape(&node, &mut diagnostics);
        assert_eq!(attrs, vec![("role", AttrValue::text("group"))]);
    }

    #[test]
    fn a_drawing_with_words_in_it_is_not_an_image() {
        // Same reason, other content. A label that repeated the words
        // would not need them drawn.
        let mut node = svg_root(Some("Revenue"));
        let mut text = svg_root(None);
        text.primitive = Primitive::Svg(SvgElement::Text);
        node.children.push(Child::Node(text));
        let mut diagnostics = Vec::new();
        let (_, attrs) = element_shape(&node, &mut diagnostics);
        assert_eq!(attrs, vec![("role", AttrValue::text("group"))]);
    }

    #[test]
    fn a_picture_is_still_an_image() {
        // Shapes are what a picture is made of, and hiding them is the
        // point. Only a control or a word changes the answer.
        let mut node = svg_root(Some("Search"));
        let mut path = svg_root(None);
        path.primitive = Primitive::Svg(SvgElement::Path);
        node.children.push(Child::Node(path));
        let mut diagnostics = Vec::new();
        let (_, attrs) = element_shape(&node, &mut diagnostics);
        assert_eq!(attrs, vec![("role", AttrValue::text("img"))]);
    }

    #[test]
    fn a_named_child_element_is_not_a_root() {
        // Only the root. A named `<rect>` inside one is part of a picture,
        // not a picture.
        let mut node = svg_root(Some("Chart"));
        node.primitive = Primitive::Svg(SvgElement::Rect);
        let mut diagnostics = Vec::new();
        let (tag, attrs) = element_shape(&node, &mut diagnostics);
        assert_eq!(tag, "rect");
        assert!(attrs.is_empty());
    }

    #[test]
    fn button_maps_to_native_button_element() {
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
        let (tag, attrs) = element_shape(&node, &mut diagnostics);
        assert_eq!(tag, "button");
        // `type="button"` and nothing else: React Native has no forms, so
        // a Button rendered inside one must not also submit it.
        assert_eq!(attrs, vec![("type", AttrValue::text("button"))]);
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
        let (tag, attrs) = element_shape(&node, &mut diagnostics);
        assert_eq!(tag, "div");
        // `{0}`, not `"0"`: React types `tabIndex` as a number, so the
        // string form is a type error in the author's own project.
        assert!(attrs.iter().any(|(k, v)| *k == "tabIndex" && *v == AttrValue::Expression("0".to_string())));
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].code, DiagnosticCode::A11yInteractiveWithoutRole);
    }

    #[test]
    fn pressable_with_explicit_role_is_not_diagnosed() {
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
                accessibility_role: Some(AccessibilityRole::Button),
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
        let (_, attrs) = element_shape(&node, &mut diagnostics);
        assert!(attrs.iter().any(|(k, v)| *k == "role" && *v == AttrValue::text("button")));
        assert!(diagnostics.is_empty());
    }
}
