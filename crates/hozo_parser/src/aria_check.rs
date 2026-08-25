// Compile-time checks against the ARIA specification.
//
// Proposal §10.2, for the part of the surface Hozo's semantic primitives
// cannot reach. `<Section>` becomes `<section>` and carries its role for
// free; a combobox, a tab strip or a tree has no element to become, so the
// author writes ARIA by hand -- and hand-written ARIA is where the
// mistakes are. An incomplete pattern is not a crash and not a visual
// defect: it renders perfectly and is simply wrong to anyone using a
// screen reader, which is the least likely thing to be noticed in review.
//
// What is checked comes from `aria.rs`, generated from the specification
// itself, so the list is not a set of rules somebody thought of. Three
// kinds are derivable from a source file:
//
//   - a role's required states and properties
//   - the role it must be contained by
//   - the roles it must contain
//   - the states and properties it accepts, and the ones it refuses
//
// The second and third need the tree, and the tree is only sometimes
// knowable: a `Child::Verbatim` between two elements may render nothing,
// one element, or a hundred. Where that happens this says nothing at all
// rather than guessing, which is the same rule the rest of the compiler
// follows.

use hozo_ir::{
    AccessibilityRole, Child, ConditionExpr, Diagnostic, DiagnosticCode, HeadingLevel, Node,
    Primitive, Severity,
};

use crate::aria;

/// Whether `accessibilityState` is the prop that would carry `property`.
///
/// Read from `ARIA_STATE_KEYS` rather than restated. It was restated, and
/// the copy was missing `aria-checked` -- so a `role="checkbox"` written
/// with `accessibilityState={{ checked }}` was reported as missing the one
/// state it had.
fn is_state_prop(property: &str) -> bool {
    ARIA_STATE_KEYS.iter().any(|(aria_name, _)| *aria_name == property)
}

pub fn check(root: &Node, diagnostics: &mut Vec<Diagnostic>) {
    walk(root, &[], diagnostics);
    check_heading_levels(root, diagnostics);
    check_duplicate_ids(root, diagnostics);
}

/// Two elements in one tree with the same `nativeID`.
///
/// Not a tidiness complaint. Every `aria-labelledby`, `aria-controls` and
/// `aria-describedby` naming that id resolves to the first element, so one
/// of the two references silently points at the wrong thing -- and it
/// points somewhere, which is why nothing about it looks broken. A field
/// labelled by the second of two `id="label"` elements announces the
/// first's text.
///
/// Only literals, and only within one file. Anything the compiler is
/// carrying may render an id it cannot see, but that can only *add* a
/// collision this does not report -- it cannot make one of these two into
/// a false positive, because both of these are here.
fn check_duplicate_ids(root: &Node, diagnostics: &mut Vec<Diagnostic>) {
    let mut seen: Vec<String> = Vec::new();
    collect_ids(root, &mut seen, diagnostics);
}

fn collect_ids(node: &Node, seen: &mut Vec<String>, diagnostics: &mut Vec<Diagnostic>) {
    if let Some(id) = node.props.native_id_literal.as_deref() {
        if seen.iter().any(|earlier| earlier == id) {
            diagnostics.push(Diagnostic {
                code: DiagnosticCode::A11yDuplicateId,
                severity: Severity::Warning,
                message: format!(
                    "`nativeID=\"{id}\"` is already used earlier in this file. Every \
                     `aria-labelledby` or `aria-controls` naming it resolves to the first one, \
                     so a reference meant for this element points at that one instead -- and it \
                     points somewhere, which is why nothing looks wrong."
                ),
                span: node.span,
            });
        } else {
            seen.push(id.to_string());
        }
    }
    for child in &node.children {
        if let Child::Node(child_node) = child {
            collect_ids(child_node, seen, diagnostics);
        }
    }
}

/// Heading levels that jump.
///
/// The levels are the document's outline, and a screen reader's "next
/// heading" and heading-list navigation are built on it. A jump from 1 to
/// 3 says there is a level-2 section the reader has been moved out of
/// without being told, which is why WCAG treats the outline as structure
/// rather than as typography -- the visual size is a separate decision
/// and `text-2xl` is how you make a level-2 look big.
///
/// Sound in one file despite the outline being a whole-document idea:
/// whatever wraps this component, two headings adjacent in *its* document
/// order are adjacent in the page's, and a jump between them is a jump.
/// Starting at 3 says nothing -- a component that renders a subsection is
/// doing the right thing, and only its caller knows what came before.
///
/// Anything the compiler is merely carrying resets the comparison. A
/// `{sections.map(...)}` between two headings may render any number of
/// them at any level, so the two on either side are not adjacent and
/// nothing can be said about the pair.
fn check_heading_levels(root: &Node, diagnostics: &mut Vec<Diagnostic>) {
    let mut previous: Option<u8> = None;
    collect_heading_levels(root, &mut previous, diagnostics);
}

fn collect_heading_levels(
    node: &Node,
    previous: &mut Option<u8>,
    diagnostics: &mut Vec<Diagnostic>,
) {
    if node.primitive == Primitive::Heading {
        // A dynamic level is a level nobody here knows.
        let level = match node.props.heading_level {
            Some(HeadingLevel::Static(level)) => Some(level),
            // `<Heading>` with no level is `h1`, which is what the Web
            // backend emits for it.
            None => Some(1),
            Some(HeadingLevel::Dynamic(_)) => None,
        };
        match level {
            Some(level) => {
                if let Some(before) = *previous {
                    if level > before + 1 {
                        diagnostics.push(Diagnostic {
                            code: DiagnosticCode::A11yHeadingLevelSkipped,
                            severity: Severity::Warning,
                            message: format!(
                                "This heading is level {level} and the one before it is level \
                                 {before}, so the outline skips level {}. Screen readers navigate \
                                 by that outline, and a jump reads as a section the listener was \
                                 moved out of without being told. Levels are structure; use a \
                                 type utility if what you wanted was a smaller heading.",
                                before + 1,
                            ),
                            span: node.span,
                        });
                    }
                }
                *previous = Some(level);
            }
            None => *previous = None,
        }
    }
    for child in &node.children {
        match child {
            Child::Node(child_node) => collect_heading_levels(child_node, previous, diagnostics),
            // Any number of headings, at any level, may come out of this.
            // The two on either side are not adjacent and the pair says
            // nothing.
            Child::Verbatim { .. } => *previous = None,
            _ => {}
        }
    }
}

fn walk(node: &Node, ancestors: &[&str], diagnostics: &mut Vec<Diagnostic>) {
    walk_inner(node, ancestors, None, diagnostics)
}

/// `interactive` is the nearest interactive ancestor, once one has been
/// seen on the way down.
fn walk_inner(
    node: &Node,
    ancestors: &[&str],
    interactive: Option<&str>,
    diagnostics: &mut Vec<Diagnostic>,
) {
    let own_role = aria_role(node);
    if let Some(name) = own_role {
        if let Some(spec) = aria::role(name) {
            check_props(node, spec, diagnostics);
            check_context(node, spec, ancestors, diagnostics);
            check_owned(node, spec, diagnostics);
            check_allowed(node, spec, diagnostics);
        }
    }
    // The name check also applies where no role was written, because the
    // role is then whatever the element is -- and for `View`, `Text` and
    // an unrolled `Pressable` that is `generic`, which prohibits a name.
    if let Some(spec) = own_role.or_else(|| implicit_role(node)).and_then(aria::role) {
        check_name_allowed(node, spec, diagnostics);
    }
    check_hidden_focusable(node, diagnostics);
    check_tab_order(node, diagnostics);
    check_interactive_nesting(node, interactive, diagnostics);
    check_press_without_keyboard(node, diagnostics);

    let mut inner: Vec<&str> = ancestors.to_vec();
    if let Some(name) = own_role {
        inner.push(name);
    }
    // The nearest interactive ancestor for the children. Once one is
    // found it stays: a button three levels down inside a link is the same
    // problem as one directly inside it.
    let enclosing = interactive_role(node).or(interactive);
    for child in &node.children {
        if let Child::Node(child_node) = child {
            walk_inner(child_node, &inner, enclosing, diagnostics);
        }
    }
}

/// The ARIA role a node carries, if it is one the specification names.
fn aria_role(node: &Node) -> Option<&str> {
    match &node.props.accessibility_role {
        Some(AccessibilityRole::Button) => Some("button"),
        Some(AccessibilityRole::Link) => Some("link"),
        Some(AccessibilityRole::Aria(name)) => Some(name.as_str()),
        Some(AccessibilityRole::NativeOnly(_)) | None => None,
    }
}

/// Whether the node supplies an ARIA property, under any of its spellings.
///
/// `None` means "cannot tell", which is this module's answer wherever the
/// source stops being readable.
fn supplies(node: &Node, property: &str) -> Option<bool> {
    if node.props.accessibility_state.is_some() && is_state_prop(property) {
        match node.props.accessibility_state_keys.as_ref() {
            // An object literal says exactly which states it carries, so
            // the ones it does not name are genuinely absent rather than
            // unknown -- and a required state that is missing from a
            // literal is now a finding instead of a shrug.
            Some(_) if written_props(node).contains(&property) => return Some(true),
            Some(_) => {}
            // A variable or a spread could carry anything.
            None => return None,
        }
    }
    let modelled = match property {
        "aria-label" => node.props.accessibility_label.is_some(),
        "aria-description" => node.props.accessibility_hint.is_some(),
        _ => false,
    };
    if modelled {
        return Some(true);
    }
    // A `{...spread}` may carry anything, so it is the same "cannot tell".
    if node.props.passthrough.iter().any(|prop| prop.is_spread) {
        return None;
    }
    Some(
        node.props
            .passthrough
            .iter()
            .filter_map(|prop| prop.name.as_deref())
            .any(|name| name == property),
    )
}

fn check_props(node: &Node, spec: &aria::AriaRole, diagnostics: &mut Vec<Diagnostic>) {
    let missing: Vec<&str> = spec
        .required_props
        .iter()
        .copied()
        .filter(|property| supplies(node, property) == Some(false))
        .collect();
    if missing.is_empty() {
        return;
    }
    diagnostics.push(Diagnostic {
        code: DiagnosticCode::AriaIncompletePattern,
        severity: Severity::Warning,
        message: format!(
            "`role=\"{}\"` needs {} to mean anything, and this element has {} none of them. \
             The element renders correctly either way; what changes is what a screen reader \
             announces.",
            spec.name,
            list(spec.required_props),
            if missing.len() == spec.required_props.len() { "" } else { "only some of " },
        ),
        span: node.span,
    });
}

fn check_context(
    node: &Node,
    spec: &aria::AriaRole,
    ancestors: &[&str],
    diagnostics: &mut Vec<Diagnostic>,
) {
    if spec.required_context.is_empty() {
        return;
    }
    if spec.required_context.iter().any(|role| ancestors.contains(role)) {
        return;
    }
    // An unreadable expression anywhere above could be supplying the
    // container, so a missing one is only a finding when the whole chain
    // was visible.
    diagnostics.push(Diagnostic {
        code: DiagnosticCode::AriaIncompletePattern,
        severity: Severity::Warning,
        message: format!(
            "`role=\"{}\"` has to be inside {}, and nothing above it here is. Assistive \
             technology reads the two together; on its own this announces as ordinary content.",
            spec.name,
            list(spec.required_context),
        ),
        span: node.span,
    });
}

fn check_owned(node: &Node, spec: &aria::AriaRole, diagnostics: &mut Vec<Diagnostic>) {
    if spec.required_owned.is_empty() {
        return;
    }
    // Anything the compiler only carries may render the missing role, so
    // its presence makes the answer unknowable rather than negative.
    if node.children.iter().any(|child| matches!(child, Child::Verbatim { .. })) {
        return;
    }
    let owned: Vec<&str> = node
        .children
        .iter()
        .filter_map(|child| match child {
            Child::Node(child_node) => aria_role(child_node),
            _ => None,
        })
        .collect();
    if spec.required_owned.iter().any(|role| owned.contains(role)) {
        return;
    }
    diagnostics.push(Diagnostic {
        code: DiagnosticCode::AriaIncompletePattern,
        severity: Severity::Warning,
        message: format!(
            "`role=\"{}\"` has to contain {}, and none of its children carry that role. An \
             empty one of these is announced as an empty {}.",
            spec.name,
            list(spec.required_owned),
            spec.name,
        ),
        span: node.span,
    });
}

/// The role a primitive means when the author wrote none.
///
/// Only the ones that become an element with no role of its own. Every
/// other primitive lowers to something that carries one -- `Section` to
/// `<section>`, `Heading` to `<h2>` -- and the specification's entry for
/// that role is what applies.
fn implicit_role(node: &Node) -> Option<&'static str> {
    match node.primitive {
        Primitive::View | Primitive::Text | Primitive::ScrollView => Some("generic"),
        Primitive::Pressable if node.props.accessibility_role.is_none() => Some("generic"),
        Primitive::Paragraph => Some("paragraph"),
        _ => None,
    }
}

/// States and properties written by name, and the ARIA spelling of each.
///
/// `accessibilityState`'s keys are readable when it is an object literal;
/// `accessibility_state_keys` is `None` when it is not, and then nothing
/// here is claimed.
fn written_props(node: &Node) -> Vec<&'static str> {
    let mut written = Vec::new();
    if let Some(keys) = node.props.accessibility_state_keys.as_ref() {
        for (aria_name, key) in ARIA_STATE_KEYS {
            if keys.iter().any(|written_key| written_key == key) {
                written.push(*aria_name);
            }
        }
    }
    written
}

/// `accessibilityState`'s keys and the ARIA property each becomes. The
/// same mapping the Web backend emits from; it is one to one.
const ARIA_STATE_KEYS: &[(&str, &str)] = &[
    ("aria-disabled", "disabled"),
    ("aria-selected", "selected"),
    ("aria-checked", "checked"),
    ("aria-busy", "busy"),
    ("aria-expanded", "expanded"),
];

/// A state the role does not accept.
///
/// Only for states written out by name. An opaque `accessibilityState`
/// could carry anything, and the rest of this module's rule is that an
/// unreadable expression means "cannot tell" rather than "no".
fn check_allowed(node: &Node, spec: &aria::AriaRole, diagnostics: &mut Vec<Diagnostic>) {
    let refused: Vec<&str> = written_props(node)
        .into_iter()
        .filter(|prop| !aria::allows_prop(spec, prop))
        .collect();
    if refused.is_empty() {
        return;
    }
    diagnostics.push(Diagnostic {
        code: DiagnosticCode::AriaPropNotAllowed,
        severity: Severity::Warning,
        message: format!(
            "`role=\"{}\"` does not take {}. Assistive technology has nothing to do with {} \
             here, so the state is carried into the output and never announced.",
            spec.name,
            list(&refused),
            if refused.len() == 1 { "it" } else { "them" },
        ),
        span: node.span,
    });
}

/// The literal value of a prop the compiler could read, if it is there.
fn literal<'a>(node: &'a Node, name: &str) -> Option<&'a str> {
    node.props
        .passthrough
        .iter()
        .find(|prop| prop.name.as_deref() == Some(name))
        .and_then(|prop| prop.literal.as_deref())
}

/// Whether this element takes keyboard focus.
///
/// Only what the element itself says. A `Pressable` is focusable because
/// Hozo makes it a `<button>`; anything else needs `focusable` or a
/// `tabIndex` that is not `-1`.
fn is_focusable(node: &Node) -> bool {
    if matches!(node.props.focusable, Some(ConditionExpr::Static(false))) {
        return false;
    }
    if node.props.focusable.is_some() || node.props.on_press.is_some() {
        return true;
    }
    matches!(literal(node, "tabIndex"), Some(value) if value != "-1")
}

/// Hidden from assistive technology, and still in the tab order.
///
/// The failure is that the two do not agree: `aria-hidden` takes a subtree
/// out of the accessibility tree, and it does not take anything out of the
/// tab order. A keyboard user tabs into a control a screen reader has been
/// told does not exist, and is told nothing about where they are -- WCAG
/// 4.1.2, and one of the most common ways a page becomes unusable while
/// looking correct.
///
/// Only when both halves are visible here. `aria-hidden` on something
/// whose children the compiler is merely carrying says nothing, the same
/// rule the rest of this file follows.
fn check_hidden_focusable(node: &Node, diagnostics: &mut Vec<Diagnostic>) {
    let hidden = literal(node, "aria-hidden") == Some("true")
        || literal(node, "accessibilityElementsHidden") == Some("true")
        || literal(node, "importantForAccessibility") == Some("no-hide-descendants");
    if !hidden {
        return;
    }
    if !focusable_within(node) {
        return;
    }
    diagnostics.push(Diagnostic {
        code: DiagnosticCode::A11yHiddenButFocusable,
        severity: Severity::Warning,
        message: "This is hidden from assistive technology and still reachable by keyboard. \
                  `aria-hidden` takes the subtree out of the accessibility tree and leaves it \
                  in the tab order, so someone tabbing lands on a control a screen reader has \
                  been told is not there. Hide it from both -- `display: none`, or `hidden`, \
                  or `tabIndex={-1}` on what can be focused -- or from neither."
            .to_string(),
        span: node.span,
    });
}

/// Whether anything the compiler can see in this subtree takes focus.
fn focusable_within(node: &Node) -> bool {
    if is_focusable(node) {
        return true;
    }
    node.children.iter().any(|child| match child {
        Child::Node(child_node) => focusable_within(child_node),
        // An expression the compiler is carrying may render anything,
        // including a button. Saying nothing is the answer everywhere else
        // in this file and it is the answer here.
        _ => false,
    })
}

/// A `tabIndex` above zero.
///
/// It does not order this element relative to its neighbours; it lifts it
/// in front of *every* element that has no positive one, on the whole
/// page. So one component's choice reorders documents it has never met,
/// and the order it produces depends on what else happens to be rendered.
/// `tabIndex={0}` joins the natural order and is what almost every use of
/// a positive value was reaching for.
fn check_tab_order(node: &Node, diagnostics: &mut Vec<Diagnostic>) {
    let Some(value) = literal(node, "tabIndex") else { return };
    let Ok(index) = value.parse::<i32>() else { return };
    if index <= 0 {
        return;
    }
    diagnostics.push(Diagnostic {
        code: DiagnosticCode::A11yPositiveTabIndex,
        severity: Severity::Warning,
        message: format!(
            "`tabIndex={{{index}}}` puts this in front of every element on the page that has no \
             positive tabIndex, not just the ones around it -- so the tab order it produces \
             depends on what else is rendered, including from components this one has never \
             met. Use `tabIndex={{0}}` to join the natural order, and put the element where it \
             belongs in the markup."
        ),
        span: node.span,
    });
}

/// What this element is, for the purpose of "can it be pressed".
///
/// `Button` and `Link` are interactive by being what they are; a
/// `Pressable` is interactive once it has a handler or a role saying so.
/// A plain `View` with an `onClick` counts too -- that is the case
/// proposal §10.2 is written about.
fn interactive_role(node: &Node) -> Option<&'static str> {
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
    if node.props.passthrough.iter().any(|prop| prop.name.as_deref() == Some("onClick")) {
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
fn check_interactive_nesting(node: &Node, outer: Option<&str>, diagnostics: &mut Vec<Diagnostic>) {
    let (Some(outer), Some(inner)) = (outer, interactive_role(node)) else { return };
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
fn check_press_without_keyboard(node: &Node, diagnostics: &mut Vec<Diagnostic>) {
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

/// A name on a role that forbids one.
fn check_name_allowed(node: &Node, spec: &aria::AriaRole, diagnostics: &mut Vec<Diagnostic>) {
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

fn list(items: &[&str]) -> String {
    let quoted: Vec<String> = items.iter().map(|item| format!("`{item}`")).collect();
    match quoted.split_last() {
        Some((last, [])) => last.clone(),
        Some((last, rest)) => format!("{} and {last}", rest.join(", ")),
        None => String::new(),
    }
}

#[cfg(test)]
mod tests {
    use hozo_ir::DiagnosticCode;

    fn codes(element: &str) -> Vec<DiagnosticCode> {
        let source = format!(
            "import {{ Pressable, View, Text, Paragraph, Section }} from '@hozo/core'\n\
             const el = {element}\n"
        );
        crate::parse_tsx(&source).diagnostics.into_iter().map(|d| d.code).collect()
    }

    #[test]
    fn a_state_the_role_does_not_take_is_reported() {
        // `role="button"` accepts `aria-expanded`, `aria-busy` and
        // `aria-disabled`. Not `aria-selected` -- and the state was going
        // into the output regardless, where nothing would read it.
        assert_eq!(
            codes(r#"<Pressable accessibilityRole="button" accessibilityState={{ selected: s }} onPress={go}>x</Pressable>"#),
            vec![DiagnosticCode::AriaPropNotAllowed],
        );
        assert!(
            codes(r#"<Pressable accessibilityRole="button" accessibilityState={{ expanded: o }} onPress={go}>x</Pressable>"#)
                .is_empty()
        );
    }

    #[test]
    fn an_opaque_state_is_not_guessed_at() {
        // The rule the rest of this module follows: where the source stops
        // being readable, say nothing rather than something.
        assert!(
            codes(r#"<Pressable accessibilityRole="button" accessibilityState={state} onPress={go}>x</Pressable>"#)
                .is_empty()
        );
    }

    #[test]
    fn a_name_on_something_that_cannot_be_named_is_reported() {
        // `generic` is what a bare `<div>` or `<span>` is, and ARIA
        // prohibits naming it -- so the label is written, rendered, and
        // may never be announced.
        for element in [
            r#"<View accessibilityLabel="Sidebar" className="p-4">x</View>"#,
            r#"<Text accessibilityLabel="Hint">x</Text>"#,
            r#"<Paragraph accessibilityLabel="Intro">x</Paragraph>"#,
            r#"<Pressable accessibilityLabel="Open">x</Pressable>"#,
        ] {
            assert_eq!(codes(element), vec![DiagnosticCode::AriaNameProhibited], "{element}");
        }
    }

    #[test]
    fn a_name_on_something_that_can_be_named_is_not() {
        // Which is the whole point of the semantic primitives: `Section`
        // becomes a region, and a region takes a name.
        assert!(codes(r#"<Section accessibilityLabel="Messages">x</Section>"#).is_empty());
        assert!(
            codes(r#"<Pressable accessibilityRole="button" accessibilityLabel="Save" onPress={go}>x</Pressable>"#)
                .is_empty()
        );
    }

    #[test]
    fn a_required_state_written_as_a_literal_key_counts_as_supplied() {
        // `aria-checked` was missing from the hand-copied list of which
        // properties `accessibilityState` can carry, so a checkbox written
        // with the one state it needs was reported as missing it.
        assert!(
            codes(r#"<Pressable accessibilityRole="checkbox" accessibilityState={{ checked: c }} onPress={go}>x</Pressable>"#)
                .is_empty()
        );
        assert_eq!(
            codes(r#"<Pressable accessibilityRole="checkbox" onPress={go}>x</Pressable>"#),
            vec![DiagnosticCode::AriaIncompletePattern],
        );
    }
}

#[cfg(test)]
mod focus_tests {
    use hozo_ir::DiagnosticCode;

    fn codes(element: &str) -> Vec<DiagnosticCode> {
        let source = format!(
            "import {{ Pressable }} from '@hozo/core'\nconst el = {element}\n"
        );
        crate::parse_tsx(&source).diagnostics.into_iter().map(|d| d.code).collect()
    }

    #[test]
    fn focusable_on_a_disabled_element_is_reported() {
        // Someone reaching for the APG's "focusable disabled" pattern,
        // which Hozo does not offer because Android cannot produce it.
        // See docs/decisions/001.
        assert_eq!(
            codes(r#"<Pressable accessibilityRole="button" disabled={d} focusable onPress={go}>x</Pressable>"#),
            vec![DiagnosticCode::FocusableDisabledUnsupported],
        );
    }

    #[test]
    fn focusable_false_on_a_disabled_element_is_not() {
        // It agrees with what `disabled` already does, so there is nothing
        // to say. Only reachable because a boolean literal is read as the
        // constant it is rather than as an expression.
        assert!(
            codes(r#"<Pressable accessibilityRole="button" disabled={d} focusable={false} onPress={go}>x</Pressable>"#)
                .is_empty()
        );
    }

    #[test]
    fn focusable_on_its_own_is_not_reported() {
        assert!(
            codes(r#"<Pressable accessibilityRole="button" focusable onPress={go}>x</Pressable>"#)
                .is_empty()
        );
    }
}

#[cfg(test)]
mod variant_tests {
    use hozo_ir::DiagnosticCode;

    fn codes(class_name: &str) -> Vec<DiagnosticCode> {
        let source = format!(
            "import {{ View }} from '@hozo/core'\nconst el = <View className=\"{class_name}\">x</View>\n"
        );
        crate::parse_tsx(&source).diagnostics.into_iter().map(|d| d.code).collect()
    }

    #[test]
    fn a_tailwind_variant_hozo_does_not_compile_is_named() {
        // These produced no CSS, reached the DOM as nothing, and said
        // nothing. `group-hover:` is not an exotic class.
        for class_name in [
            "checked:bg-blue-500",
            "open:bg-blue-500",
            "indeterminate:bg-blue-500",
        ] {
            assert_eq!(
                codes(class_name),
                vec![DiagnosticCode::TailwindVariantNotSupported],
                "{class_name}",
            );
        }
    }

    #[test]
    fn implementing_a_variant_is_what_removes_its_diagnostic() {
        // `aria-expanded:` was in the list above until it was
        // implemented. That is the whole shape of this: the diagnostic
        // names a gap, and closing the gap closes the diagnostic, rather
        // than someone remembering to edit a list.
        assert!(codes("aria-expanded:bg-blue-500").is_empty());
        assert!(codes("aria-checked:bg-blue-500").is_empty());
        assert!(codes("enabled:bg-blue-500").is_empty());
        assert!(codes("group-hover:bg-blue-500").is_empty());
        assert!(codes("peer-hover:bg-blue-500").is_empty());
        // `visited:` was in that list until the browser's own restriction
        // became something Hozo could report rather than a reason not to
        // compile the variant at all. A background colour is one of the
        // few properties `:visited` keeps, so this one is silent.
        assert!(codes("visited:bg-blue-500").is_empty());
        assert!(codes("starting:opacity-0").is_empty());
        // `empty:`, `odd:` and `nth-[2n+1]:` were in that list until the
        // structural family landed.
        assert!(codes("empty:bg-blue-500").is_empty());
        assert!(codes("odd:bg-blue-500").is_empty());
        assert!(codes("nth-[2n+1]:bg-blue-500").is_empty());
    }

    #[test]
    fn a_class_that_was_never_tailwinds_is_not_mentioned() {
        // The whole value of asking Tailwind for its own variant list:
        // a project's own class is not a gap in Hozo.
        for class_name in ["my-card", "group", "peer", "p-4", "hover:bg-blue-500", "md:hover:p-4"] {
            assert!(codes(class_name).is_empty(), "{class_name}");
        }
    }

    #[test]
    fn one_problem_gets_one_report() {
        // A token with brackets *and* a variant Hozo lacks would otherwise
        // draw two reports -- the unreadable-arbitrary one and the
        // unsupported-variant one. The variant is the accurate half.
        assert_eq!(
            codes("in-range-[2]:bg-blue-500"),
            vec![DiagnosticCode::TailwindVariantNotSupported],
        );
    }
}

#[cfg(test)]
mod aria_variant_tests {
    use hozo_ir::{Condition, StyleDeclaration};

    fn conditions(class_name: &str) -> Vec<Condition> {
        let source = format!(
            "import {{ View }} from '@hozo/core'\nconst el = <View className=\"{class_name}\">x</View>\n"
        );
        crate::parse_tsx(&source).roots[0]
            .node
            .style
            .iter()
            .map(|StyleDeclaration { condition, .. }| condition.clone())
            .collect()
    }

    #[test]
    fn tailwinds_aria_states_are_recognised() {
        // The nine Tailwind names, read from Tailwind rather than
        // remembered. Each one used to compile to nothing and say nothing.
        for state in crate::tailwind_variants::ARIA_VARIANT_STATES {
            let conditions = conditions(&format!("aria-{state}:p-4"));
            assert!(
                conditions.iter().any(|c| matches!(c, Condition::Aria(name) if name == state)),
                "aria-{state}: was not recognised",
            );
        }
    }

    #[test]
    fn a_state_tailwind_does_not_name_is_not_invented() {
        // `aria-sort` takes four words and has no boolean form, so
        // Tailwind spells it `aria-[sort=ascending]:`. Accepting
        // `aria-sort:` would be Hozo inventing a variant.
        assert!(conditions("aria-sort:p-4").is_empty());
        assert!(conditions("aria-nonsense:p-4").is_empty());
    }
}

#[cfg(test)]
mod enabled_tests {
    use hozo_ir::{Condition, DiagnosticCode, StyleDeclaration};

    fn conditions(class_name: &str) -> Vec<Condition> {
        let source = format!(
            "import {{ View }} from '@hozo/core'\nconst el = <View className=\"{class_name}\">x</View>\n"
        );
        crate::parse_tsx(&source).roots[0]
            .node
            .style
            .iter()
            .map(|StyleDeclaration { condition, .. }| condition.clone())
            .collect()
    }

    #[test]
    fn enabled_is_the_inverse_of_disabled_rather_than_a_second_opinion() {
        assert!(conditions("enabled:p-4").contains(&Condition::Enabled));
        assert!(conditions("disabled:p-4").contains(&Condition::Disabled));
    }

    #[test]
    fn a_variant_whose_selector_could_never_match_is_still_reported() {
        // `open:` and `checked:` are real Tailwind and deliberately not
        // implemented: they compile to `:open` and `:checked`, which match
        // form controls and a `<details>`, and Hozo emits neither. A
        // faithful implementation would generate CSS that cannot apply,
        // which is precisely the bug `disabled:` used to be. The
        // diagnostic is the more useful answer.
        let source = |class_name: &str| {
            format!("import {{ View }} from '@hozo/core'\nconst el = <View className=\"{class_name}\">x</View>\n")
        };
        for class_name in ["open:p-4", "checked:p-4"] {
            let codes: Vec<_> = crate::parse_tsx(&source(class_name))
                .diagnostics
                .into_iter()
                .map(|d| d.code)
                .collect();
            assert_eq!(codes, vec![DiagnosticCode::TailwindVariantNotSupported], "{class_name}");
        }
    }
}

#[cfg(test)]
mod relational_tests {
    use hozo_ir::{Condition, DiagnosticCode, StyleDeclaration};

    fn source(class_name: &str) -> String {
        format!("import {{ View }} from '@hozo/core'\nconst el = <View className=\"{class_name}\">x</View>\n")
    }

    fn conditions(class_name: &str) -> Vec<Condition> {
        crate::parse_tsx(&source(class_name)).roots[0]
            .node
            .style
            .iter()
            .map(|StyleDeclaration { condition, .. }| condition.clone())
            .collect()
    }

    fn codes(class_name: &str) -> Vec<DiagnosticCode> {
        crate::parse_tsx(&source(class_name)).diagnostics.into_iter().map(|d| d.code).collect()
    }

    #[test]
    fn group_and_peer_wrap_whatever_variant_follows() {
        // Parsed by recursion rather than by a list of combinations, so a
        // variant added later is groupable the day it lands. These four
        // needed no entry of their own anywhere.
        assert!(conditions("group-hover:p-4")
            .contains(&Condition::Group(Box::new(Condition::Hover))));
        assert!(conditions("group-aria-checked:p-4")
            .contains(&Condition::Group(Box::new(Condition::Aria("checked".to_string())))));
        assert!(conditions("peer-hover:p-4")
            .contains(&Condition::Peer(Box::new(Condition::Hover))));
        assert!(conditions("group-first:p-4")
            .contains(&Condition::Group(Box::new(Condition::FirstChild))));
    }

    #[test]
    fn a_condition_about_the_environment_cannot_be_related() {
        // Tailwind refuses `group-dark:` too: a colour-scheme preference
        // or a viewport width is true of the page, so asking it of an
        // *ancestor* says nothing the element does not already know.
        //
        // Refused at parse time rather than dropped later, so the class
        // falls through whole to the unsupported-variant diagnostic
        // instead of compiling to nothing in silence.
        assert!(conditions("group-dark:p-4").is_empty());
        assert_eq!(codes("group-dark:p-4"), vec![DiagnosticCode::TailwindVariantNotSupported]);
        assert!(conditions("group-md:p-4").is_empty());
    }

    #[test]
    fn an_inner_variant_hozo_lacks_is_reported_rather_than_swallowed() {
        // `checked:` is deliberately unimplemented, so `peer-checked:` is
        // too -- and says so.
        assert_eq!(codes("peer-checked:p-4"), vec![DiagnosticCode::TailwindVariantNotSupported]);
    }
}

#[cfg(test)]
mod environment_tests {
    use hozo_ir::{Condition, Environment, StyleDeclaration};

    fn conditions(class_name: &str) -> Vec<Condition> {
        let source = format!(
            "import {{ View }} from '@hozo/core'\nconst el = <View className=\"{class_name}\">x</View>\n"
        );
        crate::parse_tsx(&source).roots[0]
            .node
            .style
            .iter()
            .map(|StyleDeclaration { condition, .. }| condition.clone())
            .collect()
    }

    #[test]
    fn every_environment_variant_is_recognised() {
        for (class_name, query) in [
            ("motion-safe:p-4", Environment::MotionSafe),
            ("motion-reduce:p-4", Environment::MotionReduce),
            ("portrait:p-4", Environment::Portrait),
            ("landscape:p-4", Environment::Landscape),
            ("inverted-colors:p-4", Environment::InvertedColors),
            ("ltr:p-4", Environment::Ltr),
            ("rtl:p-4", Environment::Rtl),
            ("contrast-more:p-4", Environment::ContrastMore),
            ("contrast-less:p-4", Environment::ContrastLess),
            ("forced-colors:p-4", Environment::ForcedColors),
            ("print:p-4", Environment::Print),
            ("noscript:p-4", Environment::Noscript),
        ] {
            assert!(
                conditions(class_name).contains(&Condition::Environment(query)),
                "{class_name}",
            );
        }
    }

    #[test]
    fn an_environment_query_cannot_be_related_to_another_element() {
        // Same rule `group-dark:` falls under: a preference is true of the
        // page, so asking it of an ancestor says nothing new. Tailwind
        // refuses these too.
        assert!(conditions("group-motion-reduce:p-4").is_empty());
        assert!(conditions("peer-print:p-4").is_empty());
        // Except direction, which is inherited and therefore has a subject
        // an ancestor can differ on. Tailwind allows this one too.
        assert!(conditions("group-rtl:p-4")
            .contains(&Condition::Group(Box::new(Condition::Environment(Environment::Rtl)))));
    }

}

#[cfg(test)]
mod negation_tests {
    use hozo_ir::{Condition, DiagnosticCode, Environment, StyleDeclaration};

    fn source(class_name: &str) -> String {
        format!("import {{ View }} from '@hozo/core'\nconst el = <View className=\"{class_name}\">x</View>\n")
    }

    fn conditions(class_name: &str) -> Vec<Condition> {
        crate::parse_tsx(&source(class_name)).roots[0]
            .node
            .style
            .iter()
            .map(|StyleDeclaration { condition, .. }| condition.clone())
            .collect()
    }

    #[test]
    fn not_negates_whatever_follows_it() {
        for (class_name, inner) in [
            ("not-first:p-4", Condition::FirstChild),
            ("not-disabled:p-4", Condition::Disabled),
            ("not-dark:p-4", Condition::Dark),
            ("not-motion-reduce:p-4", Condition::Environment(Environment::MotionReduce)),
            ("not-aria-checked:p-4", Condition::Aria("checked".to_string())),
        ] {
            assert!(
                conditions(class_name).contains(&Condition::Not(Box::new(inner))),
                "{class_name}",
            );
        }
    }

    #[test]
    fn a_condition_with_both_forms_negates_into_two_rules() {
        // `hover:` is a media query *and* a pseudo-class -- a pointer that
        // can hover is an environment fact, being hovered is an element
        // fact. So `not-hover:` is two rules: the selector negated, and
        // a rule for a device where nothing is ever hovered.
        //
        // It was refused for a year of commits because `condition_shape`
        // returned one shape per condition. That was a limit of the
        // backend and not a fact about the variant, and `marker:` -- four
        // rules -- is what finally made it worth lifting.
        assert!(codes("not-hover:p-4").is_empty());
        // One condition, on each of the four declarations `p-4` writes.
        assert!(conditions("not-hover:p-4")
            .iter()
            .all(|c| *c == Condition::Not(Box::new(Condition::Hover))));
        assert!(!conditions("not-hover:p-4").is_empty());
    }

    fn codes(class_name: &str) -> Vec<DiagnosticCode> {
        crate::parse_tsx(&source(class_name)).diagnostics.into_iter().map(|d| d.code).collect()
    }

    #[test]
    fn negation_follows_the_form_of_what_it_wraps() {
        // A negated selector is still a selector, so `group-not-first:`
        // relates; a negated query is still a query, so
        // `group-not-dark:` does not.
        assert!(Condition::Not(Box::new(Condition::FirstChild)).is_elemental());
        assert!(!Condition::Not(Box::new(Condition::Dark)).is_elemental());
    }
}

#[cfg(test)]
mod container_tests {
    use hozo_ir::{Condition, StyleDeclaration, StyleProperty};

    fn conditions(class_name: &str) -> Vec<Condition> {
        let source = format!(
            "import {{ View }} from '@hozo/core'
const el = <View className=\"{class_name}\">x</View>
"
        );
        crate::parse_tsx(&source).roots[0]
            .node
            .style
            .iter()
            .map(|StyleDeclaration { condition, .. }| condition.clone())
            .collect()
    }

    fn container(name: Option<&str>, at_least: bool, value: &str) -> Condition {
        Condition::Container {
            name: name.map(str::to_string),
            at_least,
            value: value.to_string(),
        }
    }

    #[test]
    fn the_container_scale_is_not_the_viewport_scale() {
        // Five names are shared and none of them mean the same width.
        // `@sm` is 24rem where `sm` is 40rem, which is the whole reason
        // this is a separate table rather than a reuse of the other one.
        assert_eq!(conditions("@sm:flex"), vec![container(None, true, "384px")]);
        assert_eq!(conditions("sm:flex"), vec![Condition::Responsive(hozo_ir::Breakpoint::Sm)]);
        assert_eq!(conditions("@md:flex"), vec![container(None, true, "448px")]);
        // The two-character names have to be tried before the
        // one-character ones they end with.
        assert_eq!(conditions("@2xl:flex"), vec![container(None, true, "672px")]);
        assert_eq!(conditions("@3xs:flex"), vec![container(None, true, "256px")]);
    }

    #[test]
    fn min_and_max_read_the_same_way_they_do_on_the_viewport() {
        assert_eq!(conditions("@min-md:flex"), conditions("@md:flex"));
        assert_eq!(conditions("@max-md:flex"), vec![container(None, false, "448px")]);
        assert_eq!(conditions("@min-[400px]:flex"), vec![container(None, true, "400px")]);
        assert_eq!(conditions("@[400px]:flex"), vec![container(None, true, "400px")]);
    }

    #[test]
    fn a_name_says_which_ancestor_answers() {
        assert_eq!(conditions("@sm/main:flex"), vec![container(Some("main"), true, "384px")]);
        assert_eq!(
            conditions("@max-md/sidebar:flex"),
            vec![container(Some("sidebar"), false, "448px")],
        );
        // Including on the bracketed form, where the name sits between the
        // bracket and the colon -- which is why the bracket is split here
        // rather than by the arbitrary-value helper that eats the colon.
        assert_eq!(
            conditions("@min-[400px]/main:flex"),
            vec![container(Some("main"), true, "400px")],
        );
    }

    #[test]
    fn declaring_a_container_is_a_utility_and_naming_it_is_two_declarations() {
        let props = |class_name: &str| -> Vec<StyleProperty> {
            let source = format!(
                "import {{ View }} from '@hozo/core'
const el = <View className=\"{class_name}\">x</View>
"
            );
            crate::parse_tsx(&source).roots[0]
                .node
                .style
                .iter()
                .map(|StyleDeclaration { property, .. }| property.clone())
                .collect()
        };
        assert_eq!(
            props("@container"),
            vec![StyleProperty::Keyword("container-type", "inline-size")],
        );
        assert_eq!(
            props("@container/main"),
            vec![
                StyleProperty::Keyword("container-type", "inline-size"),
                StyleProperty::ContainerName("main".to_string()),
            ],
        );
    }

    #[test]
    fn a_container_query_is_a_query_and_relates_to_nothing() {
        // Same rule that refuses `group-dark:` and `group-max-md:`: an
        // at-rule wraps the rule and names nobody, so there is no subject
        // to move onto an ancestor.
        assert!(!container(None, true, "384px").is_elemental());
        assert!(container(None, true, "384px").is_ambient());
    }
}

#[cfg(test)]
mod width_tests {
    use hozo_ir::{Breakpoint, Condition, DiagnosticCode, StyleDeclaration};

    fn conditions(class_name: &str) -> Vec<Condition> {
        let source = format!(
            "import {{ View }} from '@hozo/core'
const el = <View className=\"{class_name}\">x</View>
"
        );
        crate::parse_tsx(&source).roots[0]
            .node
            .style
            .iter()
            .map(|StyleDeclaration { condition, .. }| condition.clone())
            .collect()
    }

    #[test]
    fn min_at_a_named_breakpoint_is_the_breakpoint() {
        // Tailwind emits identical CSS for `sm:` and `min-sm:`, so they
        // are one condition rather than two that agree -- which is what
        // lets React Native answer both from its cheap bucketed hook.
        assert_eq!(conditions("min-sm:flex"), conditions("sm:flex"));
        assert_eq!(conditions("min-md:flex"), vec![Condition::Responsive(Breakpoint::Md)]);
    }

    #[test]
    fn max_at_a_named_breakpoint_is_that_width_from_the_other_side() {
        assert_eq!(
            conditions("max-md:flex"),
            vec![Condition::Width { at_least: false, value: "768px".to_string() }],
        );
        // `2xl` before `xl`, or the longer name would never be reached.
        assert_eq!(
            conditions("max-2xl:flex"),
            vec![Condition::Width { at_least: false, value: "1536px".to_string() }],
        );
    }

    #[test]
    fn an_arbitrary_threshold_is_carried_as_written() {
        // Not parsed into a number here. Tailwind doesn't validate it
        // either, and a length is a length whatever unit it is in --
        // React Native is where it has to become a number, and that is
        // where failing to be one gets reported.
        assert_eq!(
            conditions("min-[500px]:flex"),
            vec![Condition::Width { at_least: true, value: "500px".to_string() }],
        );
        assert_eq!(
            conditions("max-[40rem]:flex"),
            vec![Condition::Width { at_least: false, value: "40rem".to_string() }],
        );
    }

    #[test]
    fn the_sizing_utilities_that_share_the_prefix_are_untouched() {
        // `min-w-0` and `max-h-[50px]` start with the same four
        // characters. Neither has a top-level colon after the prefix,
        // which is what keeps them out.
        assert!(!conditions("min-w-0").is_empty());
        assert_eq!(conditions("min-w-0"), vec![Condition::Always]);
        assert_eq!(conditions("max-h-[50px]"), vec![Condition::Always]);
    }

    #[test]
    fn a_width_is_a_query_and_therefore_relates_to_nothing() {
        // The same rule that refuses `group-dark:`: a media query is true
        // of the browser, so an ancestor cannot differ on it.
        let codes: Vec<DiagnosticCode> = {
            let source = "import { View } from '@hozo/core'
                          const el = <View className=\"group-max-md:flex\">x</View>
";
            crate::parse_tsx(source).diagnostics.into_iter().map(|d| d.code).collect()
        };
        assert_eq!(codes, vec![DiagnosticCode::TailwindVariantNotSupported]);
    }
}

#[cfg(test)]
mod form_state_tests {
    use hozo_ir::DiagnosticCode;

    fn codes(element: &str, class_name: &str) -> Vec<DiagnosticCode> {
        // Only the field gets a name. A `<div>` is `generic`, which
        // *prohibits* one -- so labelling it would add a second, unrelated
        // report and hide what these tests are about.
        let name = if element == "TextInput" { " accessibilityLabel=\"N\"" } else { "" };
        let source = format!(
            "import {{ View, Text, TextInput }} from '@hozo/core'
             const el = <{element}{name} className=\"{class_name}\" />
"
        );
        crate::parse_tsx(&source).diagnostics.into_iter().map(|d| d.code).collect()
    }

    #[test]
    fn a_form_state_variant_is_reported_on_an_element_it_cannot_reach() {
        // Not the same report as an unimplemented variant, and the
        // difference is which thing is at fault. These are built, the CSS
        // is correct, and the rule will never apply because a `<div>`
        // cannot be required.
        for class_name in ["required:flex", "invalid:flex", "read-only:flex"] {
            assert_eq!(
                codes("View", class_name),
                vec![DiagnosticCode::TailwindVariantCannotMatch],
                "{class_name}",
            );
        }
        // Including under a wrapper that doesn't change which element is
        // being talked about.
        assert_eq!(
            codes("View", "md:required:flex"),
            vec![DiagnosticCode::TailwindVariantCannotMatch],
        );
        assert_eq!(
            codes("View", "not-invalid:flex"),
            vec![DiagnosticCode::TailwindVariantCannotMatch],
        );
    }

    #[test]
    fn a_visited_utility_the_browser_will_discard_is_reported() {
        // The third shape of "this will not do anything", and the only one
        // that is nobody's fault: the variant is built, the selector
        // matches the link it was written for, and the browser throws the
        // declaration away because keeping it would leak the user's
        // history.
        for class_name in ["visited:flex", "visited:p-4", "visited:shadow-lg"] {
            assert_eq!(
                codes("View", class_name),
                vec![DiagnosticCode::VisitedStyleIgnored],
                "{class_name}",
            );
        }
        // The colours it does keep say nothing.
        for class_name in ["visited:text-red-500", "visited:bg-blue-500", "visited:border-red-500"] {
            assert!(codes("View", class_name).is_empty(), "{class_name}");
        }
        // The restriction is on the *rule*, so it follows `:visited`
        // wherever in the selector it lands -- including onto an ancestor,
        // and including through a negation. If `not-visited:` were
        // unrestricted, the two halves could be compared and the history
        // read back out of the difference.
        for class_name in ["group-visited:p-4", "peer-visited:p-4", "not-visited:p-4"] {
            assert_eq!(
                codes("View", class_name),
                vec![DiagnosticCode::VisitedStyleIgnored],
                "{class_name}",
            );
        }
    }

    #[test]
    fn a_relation_is_about_another_element_so_it_is_not_reported() {
        // `group-invalid:` and `has-[:invalid]:` ask about an ancestor and
        // a descendant. Whether *those* are form controls is not something
        // this element's primitive can answer, so saying anything would be
        // a guess.
        assert!(codes("View", "group-invalid:flex").is_empty());
        assert!(codes("View", "has-[:invalid]:flex").is_empty());
    }

    #[test]
    fn on_the_one_primitive_that_is_a_form_control_nothing_is_said() {
        for class_name in ["required:flex", "invalid:flex", "placeholder-shown:flex"] {
            assert!(codes("TextInput", class_name).is_empty(), "{class_name}");
        }
    }

    #[test]
    fn the_three_that_need_a_control_hozo_does_not_have_stay_refused() {
        // Rule 2 of decision 003, unchanged: no primitive becomes a
        // checkbox, a radio, or a form's default button.
        for class_name in ["checked:flex", "indeterminate:flex", "default:flex"] {
            assert_eq!(
                codes("TextInput", class_name),
                vec![DiagnosticCode::TailwindVariantNotSupported],
                "{class_name}",
            );
        }
    }
}

#[cfg(test)]
mod compositional_tests {
    use hozo_ir::{Condition, StyleDeclaration};

    fn conditions(class_name: &str) -> Vec<Condition> {
        let source = format!(
            "import {{ View }} from '@hozo/core'\nconst el = <View className={{'{class_name}'}}>x</View>\n"
        );
        crate::parse_tsx(&source).roots[0]
            .node
            .style
            .iter()
            .map(|StyleDeclaration { condition, .. }| condition.clone())
            .collect()
    }

    #[test]
    fn data_takes_the_three_shapes_tailwind_writes() {
        // Presence bare, presence bracketed, and an equality that is
        // quoted unless the author quoted it. Read out of Tailwind's
        // output rather than guessed, because the quoting is the part
        // that would have been guessed wrongly.
        for (class_name, selector) in [
            ("data-open:p-4", "[data-open]"),
            ("data-[foo]:p-4", "[data-foo]"),
            ("data-[state=open]:p-4", "[data-state=\"open\"]"),
        ] {
            assert!(
                conditions(class_name)
                    .contains(&Condition::DataAttribute(selector.to_string())),
                "{class_name}",
            );
        }
    }

    #[test]
    fn has_is_the_third_relation_and_composes_like_the_other_two() {
        // A descendant, after an ancestor (`group-`) and a sibling
        // (`peer-`). Wrapping a variant rather than only a selector is
        // what makes `has-hover:` carry the media query hover has.
        assert!(conditions("has-hover:p-4").contains(&Condition::Has(Box::new(Condition::Hover))));
        assert!(conditions("has-[:focus]:p-4")
            .contains(&Condition::HasSelector(":focus".to_string())));
        assert!(Condition::Has(Box::new(Condition::Hover)).is_ambient());
    }

    #[test]
    fn supports_is_a_query_and_therefore_relates_to_nothing() {
        assert!(conditions("supports-[display:grid]:p-4")
            .contains(&Condition::Supports("display:grid".to_string())));
        // A feature query is true of the browser, so an ancestor cannot
        // differ on it -- the same rule that refuses `group-dark:`.
        assert!(!Condition::Supports("display:grid".to_string()).is_elemental());
        assert!(conditions("group-supports-[display:grid]:p-4").is_empty());
    }
}

#[cfg(test)]
mod reachability_tests {
    use hozo_ir::DiagnosticCode;

    fn codes(element: &str) -> Vec<DiagnosticCode> {
        let source = format!(
            "import {{ View, Text, Pressable, TextInput }} from '@hozo/core'\nconst el = {element}\n"
        );
        crate::parse_tsx(&source).diagnostics.into_iter().map(|d| d.code).collect()
    }

    #[test]
    fn hidden_from_screen_readers_and_still_tabbable_is_reported() {
        // The two halves disagree: `aria-hidden` takes the subtree out of
        // the accessibility tree and takes nothing out of the tab order.
        assert!(codes(
            r#"<View aria-hidden="true"><Pressable accessibilityRole="button" onPress={go}>Tap</Pressable></View>"#
        )
        .contains(&DiagnosticCode::A11yHiddenButFocusable));
        // React Native spells it two other ways, and both mean the same
        // thing to the platform they are for.
        assert!(codes(
            r#"<View accessibilityElementsHidden={true}><Pressable accessibilityRole="button" onPress={go}>Tap</Pressable></View>"#
        )
        .contains(&DiagnosticCode::A11yHiddenButFocusable));
        assert!(codes(
            r#"<View importantForAccessibility="no-hide-descendants"><Pressable accessibilityRole="button" onPress={go}>Tap</Pressable></View>"#
        )
        .contains(&DiagnosticCode::A11yHiddenButFocusable));
    }

    #[test]
    fn hidden_with_nothing_focusable_under_it_is_not() {
        // The usual and correct use: a decorative subtree with no
        // controls in it.
        assert!(!codes(r#"<View aria-hidden="true"><Text>decorative</Text></View>"#)
            .contains(&DiagnosticCode::A11yHiddenButFocusable));
        // `aria-hidden="false"` is not hiding anything, and reading the
        // name without the value could not tell the two apart.
        assert!(!codes(
            r#"<View aria-hidden="false"><Pressable accessibilityRole="button" onPress={go}>Tap</Pressable></View>"#
        )
        .contains(&DiagnosticCode::A11yHiddenButFocusable));
        // Taken out of the tab order as well, which is the fix.
        assert!(!codes(
            r#"<View aria-hidden="true"><Pressable accessibilityRole="button" focusable={false}>Tap</Pressable></View>"#
        )
        .contains(&DiagnosticCode::A11yHiddenButFocusable));
    }

    #[test]
    fn a_positive_tab_index_is_reported_and_zero_is_not() {
        assert!(codes(r#"<Pressable accessibilityRole="button" tabIndex={3} onPress={go}>x</Pressable>"#)
            .contains(&DiagnosticCode::A11yPositiveTabIndex));
        // The two values that are ordinary: join the natural order, and
        // leave it while staying focusable from script.
        for element in [
            r#"<Pressable accessibilityRole="button" tabIndex={0} onPress={go}>x</Pressable>"#,
            r#"<Pressable accessibilityRole="button" tabIndex={-1} onPress={go}>x</Pressable>"#,
        ] {
            assert!(
                !codes(element).contains(&DiagnosticCode::A11yPositiveTabIndex),
                "{element}"
            );
        }
        // A value only the runtime knows says nothing.
        assert!(!codes(r#"<Pressable accessibilityRole="button" tabIndex={n} onPress={go}>x</Pressable>"#)
            .contains(&DiagnosticCode::A11yPositiveTabIndex));
    }

}

#[cfg(test)]
mod outline_tests {
    use hozo_ir::DiagnosticCode;

    fn codes(element: &str) -> Vec<DiagnosticCode> {
        let source = format!(
            "import {{ View, Heading, Section, Text }} from '@hozo/core'\nconst el = {element}\n"
        );
        crate::parse_tsx(&source).diagnostics.into_iter().map(|d| d.code).collect()
    }

    #[test]
    fn a_skipped_level_is_reported() {
        assert!(codes(
            r#"<View><Heading level={1}>A</Heading><Heading level={3}>B</Heading></View>"#
        )
        .contains(&DiagnosticCode::A11yHeadingLevelSkipped));
        // Nesting does not change document order, so the jump is the same
        // jump when the second heading is deeper in the tree.
        assert!(codes(
            r#"<View><Heading level={1}>A</Heading><Section><Heading level={4}>B</Heading></Section></View>"#
        )
        .contains(&DiagnosticCode::A11yHeadingLevelSkipped));
    }

    #[test]
    fn descending_or_stepping_by_one_is_not() {
        for element in [
            r#"<View><Heading level={1}>A</Heading><Heading level={2}>B</Heading></View>"#,
            r#"<View><Heading level={2}>A</Heading><Heading level={2}>B</Heading></View>"#,
            // Coming back up is how a document leaves a subsection.
            r#"<View><Heading level={3}>A</Heading><Heading level={1}>B</Heading></View>"#,
            // Starting deep says nothing: only the caller knows what came
            // before a component that renders a subsection.
            r#"<View><Heading level={4}>A</Heading><Heading level={5}>B</Heading></View>"#,
        ] {
            assert!(
                !codes(element).contains(&DiagnosticCode::A11yHeadingLevelSkipped),
                "{element}"
            );
        }
    }

    #[test]
    fn something_the_compiler_only_carries_ends_the_comparison() {
        // `{sections.map(...)}` may render any number of headings at any
        // level, so the two on either side of it are not adjacent and the
        // pair says nothing -- the same rule the rest of this file follows
        // wherever the tree stops being knowable.
        assert!(!codes(
            r#"<View><Heading level={1}>A</Heading>{rest}<Heading level={3}>B</Heading></View>"#
        )
        .contains(&DiagnosticCode::A11yHeadingLevelSkipped));
        // And a level only the runtime knows is a level nobody here knows.
        assert!(!codes(
            r#"<View><Heading level={1}>A</Heading><Heading level={n}>B</Heading><Heading level={6}>C</Heading></View>"#
        )
        .contains(&DiagnosticCode::A11yHeadingLevelSkipped));
    }
}

#[cfg(test)]
mod structure_tests {
    use hozo_ir::DiagnosticCode;

    fn codes(element: &str) -> Vec<DiagnosticCode> {
        let source = format!(
            "import {{ View, Text, Pressable, Button, Heading }} from '@hozo/core'\nconst el = {element}\n"
        );
        crate::parse_tsx(&source).diagnostics.into_iter().map(|d| d.code).collect()
    }

    #[test]
    fn one_control_inside_another_is_reported() {
        // The DOM does not allow it, and a browser meeting one moves the
        // inner element out -- so what renders is not what was written.
        for element in [
            r#"<Pressable accessibilityRole="button" onPress={a}><Pressable accessibilityRole="button" onPress={b}>x</Pressable></Pressable>"#,
            r#"<Pressable accessibilityRole="link" onPress={a}><Button onPress={b}>x</Button></Pressable>"#,
            // Depth does not matter: a button three levels inside a link
            // is the same problem as one directly inside it.
            r#"<Pressable accessibilityRole="link" onPress={a}><View><View><Button onPress={b}>x</Button></View></View></Pressable>"#,
        ] {
            assert!(
                codes(element).contains(&DiagnosticCode::A11yInteractiveNesting),
                "{element}",
            );
        }
    }

    #[test]
    fn controls_beside_each_other_are_not() {
        assert!(!codes(
            r#"<View><Button onPress={a}>x</Button><Button onPress={b}>y</Button></View>"#
        )
        .contains(&DiagnosticCode::A11yInteractiveNesting));
        // A container inside a control is ordinary -- that is how a button
        // gets an icon and a label.
        assert!(!codes(r#"<Button onPress={a}><View><Text>x</Text></View></Button>"#)
            .contains(&DiagnosticCode::A11yInteractiveNesting));
    }

    #[test]
    fn a_press_handler_with_no_keyboard_path_is_reported() {
        // `onClick` on a View works with a pointer, is not in the tab
        // order and announces as nothing -- proposal 10.2's own example.
        assert!(codes(r#"<View onClick={go}>Tap</View>"#)
            .contains(&DiagnosticCode::A11yPressWithoutKeyboard));
        // `onPress` on a View is quieter and worse: neither platform has
        // that prop on a plain view, so it does nothing at all.
        assert!(codes(r#"<View onPress={go}>Tap</View>"#)
            .contains(&DiagnosticCode::A11yPressWithoutKeyboard));
        assert!(codes(r#"<Text onPress={go}>Tap</Text>"#)
            .contains(&DiagnosticCode::A11yPressWithoutKeyboard));
    }

    #[test]
    fn the_primitive_that_is_a_control_is_not_reported() {
        // `Pressable` is Hozo's interactive primitive: the Web backend
        // gives it a `tabIndex`, and the role it is missing is reported
        // separately as `A11yInteractiveWithoutRole`.
        assert!(!codes(r#"<Pressable accessibilityRole="button" onPress={go}>Tap</Pressable>"#)
            .contains(&DiagnosticCode::A11yPressWithoutKeyboard));
        assert!(!codes(r#"<Button onPress={go}>Tap</Button>"#)
            .contains(&DiagnosticCode::A11yPressWithoutKeyboard));
    }

    #[test]
    fn two_elements_with_one_id_are_reported() {
        // Every reference naming it resolves to the first, so one of the
        // two points at the wrong element -- and it points somewhere,
        // which is why nothing looks broken.
        assert!(codes(r#"<View><Text nativeID="x">A</Text><Text nativeID="x">B</Text></View>"#)
            .contains(&DiagnosticCode::A11yDuplicateId));
        // Different ids, and a repeated id in an expression the compiler
        // is only carrying, say nothing.
        assert!(!codes(r#"<View><Text nativeID="x">A</Text><Text nativeID="y">B</Text></View>"#)
            .contains(&DiagnosticCode::A11yDuplicateId));
        assert!(!codes(r#"<View><Text nativeID={id}>A</Text><Text nativeID={id}>B</Text></View>"#)
            .contains(&DiagnosticCode::A11yDuplicateId));
    }
}

#[cfg(test)]
mod private_attribute_tests {
    use hozo_ir::DiagnosticCode;

    fn codes(class_name: &str) -> Vec<DiagnosticCode> {
        let source = format!(
            "import {{ View }} from '@hozo/core'\nconst el = <View className=\"{class_name}\">x</View>\n"
        );
        crate::parse_tsx(&source).diagnostics.into_iter().map(|d| d.code).collect()
    }

    #[test]
    fn selecting_on_hozos_own_state_is_reported() {
        // It works today, which is why this is a warning and not silence.
        for class_name in [
            "data-[hozo-disabled]:opacity-50",
            "data-[hozo-cond-10-20]:flex",
            "data-[hozo-pointer-events=box-none]:flex",
            // Through a relation as well: the attribute is Hozo's wherever
            // in the selector it lands.
            "group-data-[hozo-disabled]:opacity-50",
            "not-data-[hozo-disabled]:opacity-50",
        ] {
            assert!(
                codes(class_name).contains(&DiagnosticCode::HozoAttributeIsPrivate),
                "{class_name}",
            );
        }
    }

    #[test]
    fn a_projects_own_data_attribute_is_not() {
        // `data-…:` is a real Tailwind variant and most of what it selects
        // on belongs to the project. Only the `hozo-` prefix is claimed.
        for class_name in [
            "data-[state=open]:flex",
            "data-open:flex",
            // Not a prefix match on the word: `data-hozolike` is someone
            // else's attribute that happens to start with the same
            // letters, and taking it would be claiming a namespace wider
            // than the one Hozo writes.
            "data-[hozolike]:flex",
        ] {
            assert!(
                !codes(class_name).contains(&DiagnosticCode::HozoAttributeIsPrivate),
                "{class_name}",
            );
        }
    }

    #[test]
    fn the_variant_that_replaces_it_is_silent_and_identical() {
        // The migration this diagnostic points at: `disabled:` compiles to
        // the same `.hozo-0[data-hozo-disabled]` selector, so nobody loses
        // anything by taking the advice.
        assert!(!codes("disabled:opacity-50").contains(&DiagnosticCode::HozoAttributeIsPrivate));
    }
}
