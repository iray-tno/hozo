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
    // An optional button supplies events only while it exists. Its absence
    // is not not-hover, but semantic predicates still describe the row.
    // Keep availability outside negation, not around the whole callback.
    InteractiveScoped {
        available: String,
        predicate: String,
    },
    // The availability check is not defensive: CSS matches nothing without
    // an applicable measured ancestor, in either direction. Negation flips
    // the width predicate, never that ancestor's existence.
    Scoped {
        available: String,
        predicate: String,
    },
}

impl Guard {
    fn negate(self) -> Self {
        match self {
            Self::Known(value) => Self::Known(!value),
            Self::Dynamic(expression) => Self::Dynamic(format!("!({expression})")),
            Self::Interactive(expression) => Self::Interactive(format!("!({expression})")),
            Self::InteractiveScoped {
                available,
                predicate,
            } => Self::InteractiveScoped {
                available,
                predicate: format!("!({predicate})"),
            },
            Self::Scoped {
                available,
                predicate,
            } => Self::Scoped {
                available,
                predicate: format!("!({predicate})"),
            },
        }
    }
}

pub(super) fn resolve(
    condition: &Condition,
    target: &super::StyleTarget<'_>,
    source: &str,
    runtime: &mut RuntimeNeeds,
) -> Result<Guard, String> {
    let node = target.node;
    let position = target.position;
    let interaction_context = target.interaction_context;
    let pattern_slot = target.pattern_slot;

    // Explicit preparation only. Unknown/missing supplied booleans are not
    // false, especially under negation. Keep availability outside the predicate
    // using the same scoped-guard machinery as optional existing owners.
    if !target.owner_facts.is_empty() {
        let fact = match condition {
            Condition::Disabled | Condition::Enabled => Some(OwnerFact::Disabled),
            Condition::Aria(state) if state == "selected" => Some(OwnerFact::AriaSelected),
            Condition::Aria(state) if state == "disabled" => Some(OwnerFact::AriaDisabled),
            Condition::Aria(state) => {
                return Err(format!(
                    "Owner preparation has no declared aria-{state} fact."
                ))
            }
            _ => None,
        };
        if let Some(fact) = fact {
            if !target.owner_facts.contains(&fact) {
                return Err(format!(
                    "Owner preparation requires the explicit {} fact.",
                    fact.key()
                ));
            }
            let alias = fact.alias();
            return Ok(Guard::InteractiveScoped {
                available: format!("typeof {alias} === 'boolean'"),
                predicate: if matches!(condition, Condition::Enabled) {
                    format!("!{alias}")
                } else {
                    alias.into()
                },
            });
        }
    }

    if let Some(binding) = pattern_slot
        .and_then(|slot| crate::pattern::semantic_binding(node.primitive, slot, condition))
    {
        return Ok(match binding {
            "false" => Guard::Known(false),
            "true" => Guard::Known(true),
            _ => Guard::Interactive(binding.to_string()),
        });
    }
    match condition {
        Condition::Not(inner) => resolve(inner, target, source, runtime)
            .map(Guard::negate)
            .map_err(|reason| format!("`not-{}:` cannot be resolved: {reason}", condition_suffix(inner).unwrap_or_default())),
        Condition::Disabled => node.props.effective_disabled().as_ref()
            .map(|disabled| Guard::Dynamic(format!("({})", render_condition_expr(source, disabled))))
            .ok_or_else(|| "`disabled:` needs a `disabled` prop on the same element to drive it, and this one has none.".into()),
        // Keep the established enabled contract: without this prop the
        // element cannot become disabled. Explicit disabled predicates,
        // including their negation, still require a readable driver.
        Condition::Enabled => Ok(node.props.effective_disabled().as_ref().map_or(Guard::Known(true), |disabled| {
            Guard::Dynamic(format!("!({})", render_condition_expr(source, disabled)))
        })),
        // This form state is a real TextInput prop, not DOM constraint
        // validation. Use one answer for the positive, stacked and negated
        // cases; a missing driver remains unknown, never false by default.
        Condition::FormState(FormState::ReadOnly) => read_only(node, source),
        Condition::Pressed | Condition::Hover | Condition::Focus | Condition::FocusVisible => {
            if pattern_slot.is_some_and(|slot| crate::pattern::events_unavailable(node.primitive, slot)) {
                return Err(format!(
                    "`{}:` has no readable events on this decorative class owner on Native. A surrounding control's hover/press/focus does not locate interaction on its child; negation cannot make an unavailable fact true.",
                    condition_suffix(condition).unwrap_or_default(),
                ));
            }
            if node.primitive == Primitive::TextInput {
                return match condition {
                    Condition::Focus | Condition::FocusVisible => Ok(Guard::Interactive(focus_state(condition).unwrap().to_string())),
                    _ => Err(format!(
                        "`{}:` on TextInput is not wired on Native: the field observes its own focus, not a Pressable's hover/press. An outer control's state is not borrowed.",
                        condition_suffix(condition).unwrap_or_default(),
                    )),
                };
            }
            let pattern_owner = pattern_slot.and_then(|slot| crate::pattern::interaction_slot(node.primitive, slot));
            if let Some(owner) = pattern_owner.as_ref().and_then(|slot| slot.optional_owner) {
                if !node.props.passthrough.iter().any(|prop| prop.name.as_deref() == Some(owner)) {
                    return Err(format!(
                        "`{}:` on Stepper's step slots needs an authored `{owner}`: without it the step is descriptive, not a button. No button interaction is borrowed by its indicator or description.",
                        condition_suffix(condition).unwrap_or_default(),
                    ));
                }
            }
            if pattern_owner.as_ref().is_some_and(|slot| !slot.focus)
                && matches!(condition, Condition::Focus | Condition::FocusVisible)
            {
                if node.primitive == Primitive::Combobox {
                    return Err("Combobox option focus is not wired on Native: DOM focus stays on the input; option highlight is aria-selected, not focus.".into());
                }
                return Err(format!(
                    "`{}:` on CommandPalette's item slots is not wired on Native: the Web input keeps focus, not its option. Native button focus is a different owner; use activeItemClassName for the return-key target instead of borrowing input focus.",
                    condition_suffix(condition).unwrap_or_default(),
                ));
            }
            if pattern_owner.as_ref().is_some_and(|slot| !slot.pointer)
                && matches!(condition, Condition::Pressed | Condition::Hover)
            {
                if node.primitive == Primitive::Combobox {
                    return Err("Combobox input pointer state is not wired on Native: only the actual field's focus/modality is observed; option hover/press is not borrowed.".into());
                }
                return Err(format!(
                    "`{}:` on OtpInput's input slot is not wired on Native: only input focus/modality is observed. Wrapper hover/press is a different owner and is not borrowed by the input or cells.",
                    condition_suffix(condition).unwrap_or_default(),
                ));
            }
            if pattern_owner.is_some()
                || interaction::owns_events(node)
                || (interaction_context && !matches!(node.primitive, Primitive::Link | Primitive::Pressable | Primitive::Button)) {
                // Both directions read the existing owner events. Web hover
                // additionally asks about the primary input's capability;
                // Native has no equivalent query and does not guess one.
                let state = match condition {
                    Condition::Pressed => "pressed",
                    Condition::Hover => "hovered",
                    _ => focus_state(condition).unwrap(),
                };
                Ok(if pattern_owner.is_some_and(|slot| slot.optional_owner.is_some()) {
                    Guard::InteractiveScoped { available: "interactionAvailable".into(), predicate: state.into() }
                } else {
                    Guard::Interactive(state.to_string())
                })
            } else {
                // A style object which the JSX never references is a silent
                // drop, not support. Refuse when no owner can drive it.
                Err(format!(
                    "`{}:` is wired only on Pressable, Button and Link, or Text in their interaction context, on React Native; no readable interaction state exists on this element.",
                    condition_suffix(condition).unwrap_or_default()
                ))
            }
        }
        Condition::Aria(state) => aria_state_guard(node, source, state)
            .map(|guard| Guard::Dynamic(format!("({guard})")))
            .ok_or_else(|| format!(
                "`aria-{state}:` needs {} on the same element to drive it on Native, and this one has none. On Web the same class works from the attribute alone.",
                if state == "invalid" { "an `aria-invalid` prop" } else { "an `accessibilityState`" }
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
        // Unlike viewport width, this binding belongs to the query render
        // prop. The renderer discovers it through supported negations too.
        Condition::Container { name, at_least, value } => {
            let px = width_threshold_px(value).ok_or_else(|| format!(
                "`{value}` is not a pixel width, and React Native has nothing to resolve it against -- no root font size for `rem`. Write the threshold in `px`, or use one of Tailwind's container sizes. On Web the same class works."
            ))?;
            let read = format!("__hozoCq[{:?}]", name.as_deref().unwrap_or(""));
            Ok(Guard::Scoped {
                available: format!("{read} !== undefined"),
                predicate: format!("{read} {} {px}", if *at_least { ">=" } else { "<" }),
            })
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
        // An unimplemented predicate must not become true by default merely
        // because the author negates it.
        _ => Err("this inner condition is not wired for Native negation yet. On Web the same class works.".into()),
    }
}

fn ambient(hook: RuntimeHook, runtime: &mut RuntimeNeeds) -> Guard {
    let binding = hook.binding();
    runtime.hooks.push(hook);
    Guard::Dynamic(binding)
}

/// Read the same input state as RN TextInput: a defined readOnly wins;
/// undefined falls back to editable. Prop presence alone is not precedence.
/// With neither spelling, preserve the diagnostic instead of guessing false.
fn read_only(node: &Node, source: &str) -> Result<Guard, String> {
    let props = &node.props.text_input;
    if node.props.effective_disabled().is_none() {
        match (props.read_only.as_ref(), props.editable.as_ref()) {
            (Some(ConditionExpr::Static(value)), _) => return Ok(Guard::Known(*value)),
            (None, Some(ConditionExpr::Static(value))) => return Ok(Guard::Known(!value)),
            _ => {}
        }
    }
    // Group the complete predicate: an OR or ternary must not escape a
    // stacked conjunction. Runtime classes consume this same answer.
    crate::read_only_guard(node, source)
        .map(|guard| Guard::Dynamic(format!("({guard})")))
        .ok_or_else(|| "`read-only:` needs a `readOnly` or `editable` prop on the same TextInput to drive it, and this one has neither.".into())
}
