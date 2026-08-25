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

use hozo_ir::{AccessibilityRole, Child, Diagnostic, DiagnosticCode, Node, Primitive, Severity};

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
}

fn walk(node: &Node, ancestors: &[&str], diagnostics: &mut Vec<Diagnostic>) {
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

    let mut inner: Vec<&str> = ancestors.to_vec();
    if let Some(name) = own_role {
        inner.push(name);
    }
    for child in &node.children {
        if let Child::Node(child_node) = child {
            walk(child_node, &inner, diagnostics);
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
            "visited:bg-blue-500",
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
