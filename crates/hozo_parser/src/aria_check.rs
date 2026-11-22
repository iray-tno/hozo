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

use hozo_ir::{Child, Diagnostic, Node};

use crate::aria;

mod document;
mod focus;
mod interaction;
mod naming;
mod roles;

use document::{check_duplicate_ids, check_heading_levels};
use focus::{check_hidden_focusable, check_tab_order};
use interaction::{check_interactive_nesting, check_press_without_keyboard, interactive_role};
use naming::{check_name_allowed, check_name_forwarded, check_pattern_named};
use roles::{
    aria_role, check_allowed, check_context, check_owned, check_props, implicit_role,
    ARIA_STATE_KEYS,
};

/// Whether `accessibilityState` is the prop that would carry `property`.
///
/// Read from `ARIA_STATE_KEYS` rather than restated. It was restated, and
/// the copy was missing `aria-checked` -- so a `role="checkbox"` written
/// with `accessibilityState={{ checked }}` was reported as missing the one
/// state it had.
fn is_state_prop(property: &str) -> bool {
    ARIA_STATE_KEYS
        .iter()
        .any(|(aria_name, _)| *aria_name == property)
}

pub fn check(root: &Node, diagnostics: &mut Vec<Diagnostic>) {
    walk(root, &[], diagnostics);
    check_heading_levels(root, diagnostics);
    check_duplicate_ids(root, diagnostics);
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
        }
    }
    // The name check also applies where no role was written, because the
    // role is then whatever the element is -- and for `View`, `Text` and
    // an unrolled `Pressable` that is `generic`, which prohibits a name.
    if let Some(spec) = own_role
        .or_else(|| implicit_role(node))
        .and_then(aria::role)
    {
        // A button's native element already supplies its role; making the
        // author spell it out must not decide whether an invalid state is
        // found. Required/context/owned checks above stay explicit-only:
        // native elements can supply those properties/relationships themselves.
        check_allowed(node, spec, diagnostics);
        check_name_allowed(node, spec, diagnostics);
    }
    check_name_forwarded(node, diagnostics);
    check_pattern_named(node, diagnostics);
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

fn list(items: &[&str]) -> String {
    let quoted: Vec<String> = items.iter().map(|item| format!("`{item}`")).collect();
    match quoted.split_last() {
        Some((last, [])) => last.clone(),
        Some((last, rest)) => format!("{} and {last}", rest.join(", ")),
        None => String::new(),
    }
}

#[cfg(test)]
mod tests;

#[cfg(test)]
mod focus_tests;

#[cfg(test)]
mod variant_tests;

#[cfg(test)]
mod aria_variant_tests;

#[cfg(test)]
mod enabled_tests;

#[cfg(test)]
mod relational_tests;

#[cfg(test)]
mod environment_tests;

#[cfg(test)]
mod negation_tests;

#[cfg(test)]
mod container_tests;

#[cfg(test)]
mod width_tests;

#[cfg(test)]
mod form_state_tests;

#[cfg(test)]
mod compositional_tests;

#[cfg(test)]
mod reachability_tests;

#[cfg(test)]
mod outline_tests;

#[cfg(test)]
mod structure_tests;

#[cfg(test)]
mod private_attribute_tests;

#[cfg(test)]
mod carried_conflict_tests;
