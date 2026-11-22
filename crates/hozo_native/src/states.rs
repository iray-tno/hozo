//! The runtime state a condition reads: focus, hover, press, group, ARIA
//! and read-only guards, and animation hooks.

use hozo_ir::{Condition, ConditionExpr, Node, Primitive};

use super::expr::{render_condition_expr, source_text};
use super::pattern;
use super::variants::variant_spelling;

pub(super) fn condition_contains(
    condition: &Condition,
    predicate: impl Fn(&Condition) -> bool + Copy,
) -> bool {
    predicate(condition)
        || matches!(condition, Condition::All(conditions) if conditions.iter().any(|condition| condition_contains(condition, predicate)))
}

// Focus predicates are transparent through negation here. Walking every
// Not in condition_contains would also enable unrelated, unwired starting
// frames merely because their inner condition exists. Container reads use
// a similarly narrow helper below rather than widening that traversal.
pub(super) fn focus_state(condition: &Condition) -> Option<&'static str> {
    match condition {
        Condition::Focus => Some("focused"),
        Condition::FocusVisible => Some("focusVisible"),
        Condition::Not(inner) => focus_state(inner),
        _ => None,
    }
}

// Native hover is the interaction owner's event state, not CSS's primary
// input capability query. Its complement uses the same owner, including
// when only a descendant asks for it; unrelated negations stay opaque.
pub(super) fn uses_hover(condition: &Condition) -> bool {
    match condition {
        Condition::Hover => true,
        Condition::Not(inner) => uses_hover(inner),
        _ => false,
    }
}

// Negation changes the predicate, not which owner supplies its state.
// Keep this narrow: traversing every Not in condition_contains would also
// enable unrelated conditions whose ownership has not been implemented.
pub(super) fn uses_pressed(condition: &Condition) -> bool {
    match condition {
        Condition::Pressed => true,
        Condition::Not(inner) => uses_pressed(inner),
        _ => false,
    }
}

/// The runtime guard for `aria-<state>:` on Native.
///
/// Read off `accessibilityState`, which is the only place Hozo can see
/// the value: the `aria-checked` prop React Native also accepts is
/// carried through as a passthrough and never parsed. `None` when there
/// is nothing to read.
/// The runtime value `group-<inner>:` reads on Native, if there is one.
///
/// React Native has no selectors, so a condition on an ancestor can only
/// be answered by the ancestor handing it down -- which `HozoPressable`
/// already does for the four interaction states, through the context that
/// makes `hover:` work on a `Text` inside a button at all.
///
/// So `group-hover:` is not new machinery here; it is the existing
/// machinery finally being asked the question it was built to answer.
/// `hover:` on a descendant reads the ancestor's hover because a `Text`
/// has none of its own, which is a compromise. `group-hover:` reading the
/// same value is the literal meaning.
///
/// `None` for everything else: a condition on the ancestor's *props* --
/// `group-disabled:`, `group-aria-checked:` -- would need the context to
/// carry them, and it carries interaction state only.
pub(super) fn group_state(inner: &Condition, interaction_context: bool) -> Option<&'static str> {
    if !interaction_context {
        return None;
    }
    match inner {
        Condition::Hover => Some("hovered"),
        Condition::Focus => Some("focused"),
        Condition::FocusVisible => Some("focusVisible"),
        Condition::Pressed => Some("pressed"),
        _ => None,
    }
}

/// Why a `group-…:` could not be wired, in the terms the author can act on.
pub(super) fn group_unwired_message(inner: &Condition, interaction_context: bool) -> String {
    let name = variant_spelling(inner).unwrap_or_else(|| "…".to_string());
    // Which state, before where: `group-aria-checked:` under a Pressable was
    // told nothing above it was one, when the Pressable was right there and
    // the condition was simply not one it hands down.
    if interaction_context || group_state(inner, true).is_none() {
        format!(
            "`group-{name}:` reads a state React Native's Pressable context does not carry. Only `hover`, `focus`, `focus-visible` and `pressed` are handed down; a condition on the ancestor's own props is not. On Web the same class works from the selector."
        )
    } else {
        format!(
            "`group-{name}:` reads the state a `Pressable`, `Button` or `Link` hands to the `Text` and `View` inside it, and this element is not a Text or View inside one. On Web the same class works from the selector."
        )
    }
}

pub(super) fn aria_state_guard(node: &Node, source: &str, state: &str) -> Option<String> {
    if state == "disabled" {
        return node
            .props
            .effective_disabled()
            .map(|fact| format!("Boolean({})", render_condition_expr(source, &fact)));
    }
    if state == "invalid" {
        // CSS matches the literal "true", not arbitrary truthy values or
        // the grammar/spelling tokens. Evaluate the prop expression once.
        return node
            .props
            .aria_invalid
            .map(|value| format!("String(({})) === 'true'", source_text(source, value)));
    }
    let value = node.props.accessibility_state?;
    // An object literal says which keys it has, so one that does not name
    // this state cannot drive it. An opaque expression could carry
    // anything and is taken at its word.
    if let Some(keys) = node.props.accessibility_state_keys.as_ref() {
        if !keys.iter().any(|key| key == state) {
            return None;
        }
    }
    // An opaque prop expression may evaluate to undefined/null (RN's
    // accessibilityState is optional). That means no active ARIA state,
    // not a JS exception in either the positive or the negative guard.
    // Tailwind's boolean aria variants match the literal true state;
    // checked="mixed" is a real RN state, but not aria-checked="true".
    Some(format!(
        "({})?.{state} === true",
        source_text(source, value)
    ))
}

/// One read-only predicate for static guards and runtime candidate states.
/// RN lets a defined readOnly override editable; absence is not false.
pub(super) fn read_only_guard(node: &Node, source: &str) -> Option<String> {
    let props = &node.props.text_input;
    let base = read_only_prop_guard(props, source);
    // A canonical disabled field cannot be edited, just as :read-only
    // matches a disabled HTML input. The disabled semantic fact is separate.
    if let Some(disabled) = node
        .props
        .effective_disabled()
        .filter(|_| node.primitive == Primitive::TextInput)
    {
        return Some(format!(
            "Boolean({}) || ({})",
            render_condition_expr(source, &disabled),
            base.unwrap_or_else(|| "false".to_string())
        ));
    }
    base
}

pub(super) fn read_only_prop_guard(
    props: &hozo_ir::TextInputProps,
    source: &str,
) -> Option<String> {
    if let Some(read_only) = props.read_only.as_ref() {
        let driver = render_condition_expr(source, read_only);
        return Some(match (read_only, props.editable.as_ref()) {
            (ConditionExpr::Static(_), _) | (_, None) => driver,
            (_, Some(editable)) => format!(
                "({driver}) !== undefined ? ({driver}) : ({}) === false",
                render_condition_expr(source, editable)
            ),
        });
    }
    props
        .editable
        .as_ref()
        .map(|editable| format!("({}) === false", render_condition_expr(source, editable)))
}

/// The state a runtime `className` is resolved against, as a JS object
/// literal, or `None` when the element has none to give (#886).
///
/// `interaction` uses the owner's readable facts, not a parent's context.
/// A field reports focus only: its tracker does not wire hover or press.
/// `disabled` and the ARIA states come from the element's props, the same
/// expressions a compiled `disabled:` or `aria-*:` reads, under the keys the
/// candidate module stores them by.
pub(super) fn runtime_class_state(node: &Node, source: &str, interaction: bool) -> Option<String> {
    if let Some(facts) = pattern::constant_facts(node.primitive, "className") {
        return Some(facts.into());
    }
    let mut fields: Vec<String> = Vec::new();
    if interaction {
        fields.push(
            if node.primitive == Primitive::TextInput {
                "focused, focusVisible"
            } else {
                "pressed, hovered, focused, focusVisible"
            }
            .to_string(),
        );
    }
    if let Some(disabled) = node.props.effective_disabled() {
        fields.push(format!(
            "disabled: Boolean({})",
            render_condition_expr(source, &disabled)
        ));
    }
    if let Some(guard) = aria_state_guard(node, source, "invalid") {
        fields.push(format!("'aria-invalid': {guard}"));
    }
    if node.primitive == Primitive::TextInput {
        if let Some(guard) = read_only_guard(node, source) {
            fields.push(format!("readOnly: Boolean({guard})"));
        }
    }
    if let Some(guard) = aria_state_guard(node, source, "disabled") {
        fields.push(format!("'aria-disabled': {guard}"));
    }
    if node.props.accessibility_state.is_some() {
        // A literal says which states it has; an opaque expression could
        // carry any of React Native's.
        let states: Vec<String> = match node.props.accessibility_state_keys.as_ref() {
            Some(keys) => keys.clone(),
            None => ["checked", "selected", "expanded", "busy", "disabled"]
                .map(String::from)
                .to_vec(),
        };
        for state in states {
            if state == "disabled" {
                continue;
            }
            if let Some(guard) = aria_state_guard(node, source, &state) {
                fields.push(format!("'aria-{state}': {guard}"));
            }
        }
    }
    (!fields.is_empty()).then(|| format!("{{ {} }}", fields.join(", ")))
}

/// Tailwind's name for an animation, which is also the runtime hook's
/// argument -- so the generated call reads as the class it came from.
pub(super) fn animation_name(animation: hozo_ir::Animation) -> &'static str {
    match animation {
        hozo_ir::Animation::Spin => "spin",
        hozo_ir::Animation::Pulse => "pulse",
        hozo_ir::Animation::Bounce => "bounce",
        hozo_ir::Animation::Ping => "ping",
        // Not an animation to run: `animate-none` turns one off, and the
        // hook is never asked for.
        hozo_ir::Animation::None => "none",
    }
}
