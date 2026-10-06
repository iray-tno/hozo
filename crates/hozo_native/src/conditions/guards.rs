//! One answer for a prop/environment/structural predicate, whether used
//! alone, in a stack, or negated. An unresolved predicate is not false:
//! negating an error must never make an unsupported style unconditional.

use super::*;

pub(super) enum Guard {
    Known(bool),
    Dynamic(String),
}

impl Guard {
    fn negate(self) -> Self {
        match self {
            Self::Known(value) => Self::Known(!value),
            Self::Dynamic(expression) => Self::Dynamic(format!("!({expression})")),
        }
    }
}

pub(super) fn resolve(
    condition: &Condition,
    node: &Node,
    source: &str,
    position: SiblingPosition,
    runtime: &mut RuntimeNeeds,
) -> Result<Guard, String> {
    match condition {
        Condition::Not(inner) => resolve(inner, node, source, position, runtime)
            .map(Guard::negate)
            .map_err(|reason| format!("`not-{}:` cannot be resolved: {reason}", condition_suffix(inner).unwrap_or_default())),
        Condition::Disabled => node.props.disabled.as_ref()
            .map(|disabled| Guard::Dynamic(format!("({})", render_condition_expr(source, disabled))))
            .ok_or_else(|| "`disabled:` needs a `disabled` prop on the same element to drive it, and this one has none.".into()),
        // Keep the established enabled contract: without this prop the
        // element cannot become disabled. Explicit disabled predicates,
        // including their negation, still require a readable driver.
        Condition::Enabled => Ok(node.props.disabled.as_ref().map_or(Guard::Known(true), |disabled| {
            Guard::Dynamic(format!("!({})", render_condition_expr(source, disabled)))
        })),
        Condition::Aria(state) => aria_state_guard(node, source, state)
            .map(|guard| Guard::Dynamic(format!("({guard})")))
            .ok_or_else(|| format!(
                "`aria-{state}:` needs an `accessibilityState` on the same element to drive it on Native, and this one has none. On Web the same class works from the attribute alone."
            )),
        Condition::Environment(query) => {
            let query = native_environment(*query).ok_or_else(|| environment_unwired_message(*query))?;
            let hook = RuntimeHook::Environment(query);
            let guard = hook.binding();
            runtime.hooks.push(hook);
            Ok(Guard::Dynamic(guard))
        }
        // Known positions are decided at build time: neither the positive
        // nor the negative half needs a selector engine or a subscription.
        Condition::FirstChild | Condition::LastChild | Condition::Structural(_) => {
            let (name, known) = match condition {
                Condition::FirstChild => ("first".into(), position.first),
                Condition::LastChild => ("last".into(), position.last),
                Condition::Structural(structural) => (
                    structural.variant_name(), structural_holds(structural, node, position),
                ),
                _ => unreachable!("matched above"),
            };
            known.map(Guard::Known).ok_or_else(|| format!(
                "`{name}:` can only be resolved when the compiler can see this element's position among its siblings, and here it can't -- it's either the root of a component (whose position its caller decides) or a sibling of something Hozo doesn't model, such as a custom component or a `{{...}}` expression."
            ))
        }
        // In particular hover includes both a media query and a selector
        // on Web. It is not safe to treat not-hover as just !hovered.
        _ => Err("this inner condition is not wired for Native negation yet. On Web the same class works.".into()),
    }
}
