//! One answer for a prop/ambient/structural/focus predicate, whether used
//! alone, in a stack, or negated. An unresolved predicate is not false:
//! negating an error must never make an unsupported style unconditional.

use super::*;

pub(super) enum Guard {
    Known(bool),
    Dynamic(String),
    // Unlike a prop or ambient hook, this binding exists only inside the
    // interaction style callback. Negation must keep that ownership.
    Interactive(String),
}

impl Guard {
    fn negate(self) -> Self {
        match self {
            Self::Known(value) => Self::Known(!value),
            Self::Dynamic(expression) => Self::Dynamic(format!("!({expression})")),
            Self::Interactive(expression) => Self::Interactive(format!("!({expression})")),
        }
    }
}

pub(super) fn resolve(
    condition: &Condition,
    node: &Node,
    source: &str,
    position: SiblingPosition,
    runtime: &mut RuntimeNeeds,
    interaction_context: bool,
) -> Result<Guard, String> {
    match condition {
        Condition::Not(inner) => resolve(inner, node, source, position, runtime, interaction_context)
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
        Condition::Focus | Condition::FocusVisible => {
            if interaction_context || matches!(node.primitive, Primitive::Pressable | Primitive::Button) {
                Ok(Guard::Interactive(focus_state(condition).unwrap().to_string()))
            } else {
                Err(format!(
                    "`{}:` is wired only on Pressable and Button, or Text in their interaction context, on React Native; no readable focus state exists on this element.",
                    condition_suffix(condition).unwrap_or_default()
                ))
            }
        }
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
        // Positive, stacked and negated ambient predicates all observe the
        // same hook. Its declaration belongs in the component prelude, not
        // inside a potentially conditional JSX expression.
        Condition::Responsive(bp) => Ok(ambient(RuntimeHook::Breakpoint(*bp), runtime)),
        Condition::Dark => Ok(ambient(RuntimeHook::Dark, runtime)),
        Condition::Width { at_least, value } => {
            // max- is the same threshold read from the other side, so its
            // negation shares the min- hook too, including at the boundary.
            let px = width_threshold_px(value).ok_or_else(|| format!(
                "`{value}` is not a pixel width, and React Native has nothing to resolve it against -- no root font size for `rem`, and a viewport unit compared against the viewport answers itself. Write the threshold in `px`. On Web the same class works."
            ))?;
            let hook = RuntimeHook::WidthAtLeast(px);
            let guard = if *at_least { hook.binding() } else { format!("!{}", hook.binding()) };
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

fn ambient(hook: RuntimeHook, runtime: &mut RuntimeNeeds) -> Guard {
    let binding = hook.binding();
    runtime.hooks.push(hook);
    Guard::Dynamic(binding)
}
