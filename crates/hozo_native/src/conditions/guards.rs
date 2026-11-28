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
            Condition::FormState(FormState::ReadOnly) => Some(OwnerFact::ReadOnly),
            Condition::Aria(state) if state == "selected" => Some(OwnerFact::AriaSelected),
            Condition::Aria(state) if state == "checked" => Some(OwnerFact::AriaChecked),
            Condition::Aria(state) if state == "disabled" => Some(OwnerFact::AriaDisabled),
            Condition::Aria(state) if state == "invalid" => Some(OwnerFact::AriaInvalid),
            Condition::Aria(state) if state == "required" => Some(OwnerFact::AriaRequired),
            Condition::Aria(state) if state == "expanded" => Some(OwnerFact::AriaExpanded),
            Condition::Aria(state) => {
                return Err(format!(
                    "Owner preparation has no declared aria-{state} fact."
                ))
            }
            Condition::DataAttribute(selector) => {
                let Some(fact) = crate::candidate::data_fact_key(selector)
                    .as_deref()
                    .and_then(OwnerFact::from_data_key)
                else {
                    return Err(format!(
                        "Owner preparation has no declared data attribute fact for `{selector}`."
                    ));
                };
                Some(fact)
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
            .map_err(|reason| format!("`not-{}:` cannot be resolved: {reason}", variant_spelling(inner).unwrap_or_default())),
        Condition::Group(inner) => resolve_group(inner, target, source, runtime),
        Condition::Peer(inner) => resolve_peer(inner, target, source, runtime),
        Condition::FocusWithin => resolve_focus_within(node),
        Condition::Has(inner) => resolve_has(inner, node),
        Condition::HasSelector(selector) => resolve_has_selector(selector, node),
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
        Condition::FormState(FormState::PlaceholderShown) => placeholder_shown(node, source),
        Condition::Pressed | Condition::Hover | Condition::Focus | Condition::FocusVisible => {
            if pattern_slot.is_some_and(|slot| crate::pattern::events_unavailable(node.primitive, slot)) {
                return Err(format!(
                    "`{}:` has no readable events on this decorative class owner on Native. A surrounding control's hover/press/focus does not locate interaction on its child; negation cannot make an unavailable fact true.",
                    variant_spelling(condition).unwrap_or_default(),
                ));
            }
            if matches!(node.primitive, Primitive::View | Primitive::Pressable)
                && !target.owner_events.is_empty()
            {
                let event = match condition {
                    Condition::Pressed => OwnerEvent::Pressed,
                    Condition::Hover => OwnerEvent::Hovered,
                    Condition::Focus => OwnerEvent::Focused,
                    Condition::FocusVisible => OwnerEvent::FocusVisible,
                    _ => unreachable!("matched above"),
                };
                return if target.owner_events.contains(&event) {
                    let state = match condition {
                        Condition::Pressed => "pressed",
                        Condition::Hover => "hovered",
                        _ => focus_state(condition).unwrap(),
                    };
                    Ok(Guard::Interactive(state.to_string()))
                } else {
                    Err(format!(
                        "`{}:` is not declared in this owner's delivered events on Native.",
                        variant_spelling(condition).unwrap_or_default(),
                    ))
                };
            }
            if node.primitive == Primitive::TextInput {
                return match condition {
                    Condition::Focus | Condition::FocusVisible => Ok(Guard::Interactive(focus_state(condition).unwrap().to_string())),
                    _ => Err(format!(
                        "`{}:` on TextInput is not wired on Native: the field observes its own focus, not a Pressable's hover/press. An outer control's state is not borrowed.",
                        variant_spelling(condition).unwrap_or_default(),
                    )),
                };
            }
            let pattern_owner = pattern_slot.and_then(|slot| crate::pattern::interaction_slot(node.primitive, slot));
            if let Some(owner) = pattern_owner.as_ref().and_then(|slot| slot.optional_owner) {
                if !node.props.passthrough.iter().any(|prop| prop.name.as_deref() == Some(owner)) {
                    return Err(format!(
                        "`{}:` on Stepper's step slots needs an authored `{owner}`: without it the step is descriptive, not a button. No button interaction is borrowed by its indicator or description.",
                        variant_spelling(condition).unwrap_or_default(),
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
                    variant_spelling(condition).unwrap_or_default(),
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
                    variant_spelling(condition).unwrap_or_default(),
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
                    variant_spelling(condition).unwrap_or_default()
                ))
            }
        }
        Condition::Aria(state) => aria_state_guard(node, source, state)
            .map(|guard| Guard::Dynamic(format!("({guard})")))
            .ok_or_else(|| format!(
                "`aria-{state}:` needs {} on the same element to drive it on Native, and this one has none. On Web the same class works from the attribute alone.",
                if state == "invalid" { "an `aria-invalid` prop" } else { "an `accessibilityState`" }
            )),
        Condition::DataAttribute(selector) => data_attribute_guard(node, source, selector, None),
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
        // Before the position check, because no position answers it: the
        // position message sent authors to restructure JSX whose position
        // the compiler could already see, and the error came back unchanged.
        Condition::Structural(structural) if structural.counts_by_type() => {
            let name = structural.variant_name();
            Err(format!(
                "`{name}:` counts only the siblings that share this element's tag, and React Native has no tags -- the tag it would have had is a choice Hozo makes on Web, never made here. So the `-of-type` variants are not compiled on React Native. `first:`, `last:`, `only:` and `nth-*:` count every sibling and work on both platforms; where every sibling is the same kind of element, they select the same one. On Web the same class works."
            ))
        }
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

fn resolve_group(
    inner: &Condition,
    target: &super::StyleTarget<'_>,
    source: &str,
    runtime: &mut RuntimeNeeds,
) -> Result<Guard, String> {
    let interaction_context = target.interaction_context;
    match inner {
        Condition::Not(nested) => resolve_group(nested, target, source, runtime)
            .map(Guard::negate)
            .map_err(|reason| {
                format!(
                    "`group-not-{}:` cannot be resolved: {reason}",
                    variant_spelling(nested).unwrap_or_default()
                )
            }),
        Condition::Hover | Condition::Focus | Condition::FocusVisible | Condition::Pressed => {
            if let Some(state) = group_state(inner, target.group_interaction_query) {
                Ok(Guard::Dynamic(format!("__hozoGroup.{state}")))
            } else if let Some(state) = group_state(inner, interaction_context) {
                Ok(Guard::Interactive(state.to_string()))
            } else {
                Err(group_unwired_message(inner, interaction_context))
            }
        }
        Condition::Aria(state) => {
            let driver = if state == "invalid" {
                "an `aria-invalid` prop"
            } else {
                "an `accessibilityState`"
            };
            let Some(group) = target.group_ancestor else {
                return Err(format!(
                    "`group-aria-{state}:` needs an enclosing `group` ancestor in the same component with {driver} to drive it on Native, and none was found. On Web the same class works from the selector."
                ));
            };
            aria_state_guard(group.node, source, state)
                .map(|guard| Guard::Dynamic(format!("({guard})")))
                .ok_or_else(|| {
                    format!(
                        "`group-aria-{state}:` needs {driver} on the enclosing `group` ancestor to drive it on Native, and this one has none. On Web the same class works from the selector."
                    )
                })
        }
        Condition::DataAttribute(selector) => {
            let written = variant_spelling(&Condition::Group(Box::new(Condition::DataAttribute(
                selector.clone(),
            ))))
            .unwrap_or_else(|| "group-data-…".to_string());
            let Some(group) = target.group_ancestor else {
                return Err(format!(
                    "`{written}:` needs an enclosing `group` ancestor in the same component with the matching `data-*` prop to drive it on Native, and none was found. On Web the same class works from the selector."
                ));
            };
            data_attribute_guard(group.node, source, selector, Some(&written))
        }
        Condition::Disabled => {
            let Some(group) = target.group_ancestor else {
                return Err(
                    "`group-disabled:` needs an enclosing `group` ancestor with a `disabled` prop in the same component, and none was found. On Web the same class works from the selector."
                        .into(),
                );
            };
            group
                .node
                .props
                .effective_disabled()
                .as_ref()
                .map(|disabled| {
                    Guard::Dynamic(format!("({})", render_condition_expr(source, disabled)))
                })
                .ok_or_else(|| {
                    "`group-disabled:` needs a `disabled` prop on the enclosing `group` ancestor to drive it, and this one has none."
                        .into()
                })
        }
        Condition::Enabled => {
            let Some(group) = target.group_ancestor else {
                return Err(
                    "`group-enabled:` needs an enclosing `group` ancestor in the same component, and none was found. On Web the same class works from the selector."
                        .into(),
                );
            };
            Ok(group.node.props.effective_disabled().as_ref().map_or(
                Guard::Known(true),
                |disabled| {
                    Guard::Dynamic(format!("!({})", render_condition_expr(source, disabled)))
                },
            ))
        }
        Condition::Environment(query @ (Environment::Rtl | Environment::Ltr)) => {
            let name = environment_name(*query);
            let Some(group) = target.group_ancestor else {
                return Err(format!(
                    "`group-{name}:` needs an enclosing `group` ancestor in the same component, and none was found. On Web the same class works from the selector."
                ));
            };
            match authored(group.node, source, "dir") {
                Some(Authored::Literal(dir)) if dir.eq_ignore_ascii_case("rtl") => {
                    Ok(Guard::Known(*query == Environment::Rtl))
                }
                Some(Authored::Literal(dir)) if dir.eq_ignore_ascii_case("ltr") => {
                    Ok(Guard::Known(*query == Environment::Ltr))
                }
                Some(Authored::Literal(other)) => Err(format!(
                    "`group-{name}:` cannot resolve `dir=\"{other}\"` on the enclosing `group` ancestor on Native at build time. On Web the same class works from the selector."
                )),
                Some(Authored::Expr(expr)) => Ok(Guard::Dynamic(format!(
                    "(({expr}) === '{}')",
                    if *query == Environment::Rtl {
                        "rtl"
                    } else {
                        "ltr"
                    }
                ))),
                None => {
                    let hook = RuntimeHook::Environment(*query);
                    let guard = hook.binding();
                    runtime.hooks.push(hook);
                    Ok(Guard::Dynamic(guard))
                }
            }
        }
        Condition::Structural(structural) if structural.counts_by_type() => {
            let name = structural.variant_name();
            Err(format!(
                "`group-{name}:` counts only siblings that share the `group` ancestor's tag, and React Native has no tags -- the `-of-type` variants are not compiled on React Native. On Web the same class works."
            ))
        }
        Condition::FirstChild | Condition::LastChild | Condition::Structural(_) => {
            let name = match inner {
                Condition::FirstChild => "first".into(),
                Condition::LastChild => "last".into(),
                Condition::Structural(structural) => structural.variant_name(),
                _ => unreachable!("matched above"),
            };
            let Some(group) = target.group_ancestor else {
                return Err(format!(
                    "`group-{name}:` needs an enclosing `group` ancestor in the same component, and none was found. On Web the same class works from the selector."
                ));
            };
            let known = match inner {
                Condition::FirstChild => group.position.first,
                Condition::LastChild => group.position.last,
                Condition::Structural(structural) => {
                    structural_holds(structural, group.node, group.position)
                }
                _ => unreachable!("matched above"),
            };
            known.map(Guard::Known).ok_or_else(|| {
                format!(
                    "`group-{name}:` can only be resolved when the compiler can see the enclosing `group` ancestor's position among its siblings, and here it can't -- it's either the root of a component or a sibling of something Hozo doesn't model."
                )
            })
        }
        Condition::FormState(FormState::ReadOnly) => {
            let Some(group) = target.group_ancestor else {
                return Err(
                    "`group-read-only:` needs an enclosing `group` TextInput ancestor in the same component, and none was found. On Web the same class works from the selector."
                        .into(),
                );
            };
            read_only(group.node, source).map_err(|reason| {
                format!("`group-read-only:` on the enclosing `group` ancestor: {reason}")
            })
        }
        Condition::FormState(FormState::PlaceholderShown) => {
            let Some(group) = target.group_ancestor else {
                return Err(
                    "`group-placeholder-shown:` needs an enclosing `group` TextInput ancestor in the same component, and none was found. On Web the same class works from the selector."
                        .into(),
                );
            };
            placeholder_shown(group.node, source).map_err(|reason| {
                format!("`group-placeholder-shown:` on the enclosing `group` ancestor: {reason}")
            })
        }
        _ => Err(group_unwired_message(inner, interaction_context)),
    }
}

fn resolve_peer(
    inner: &Condition,
    target: &super::StyleTarget<'_>,
    source: &str,
    runtime: &mut RuntimeNeeds,
) -> Result<Guard, String> {
    if let Condition::Structural(structural) = inner {
        if structural.counts_by_type() {
            let name = structural.variant_name();
            return Err(format!(
                "`peer-{name}:` counts only siblings that share the `peer` sibling's tag, and React Native has no tags -- the `-of-type` variants are not compiled on React Native. On Web the same class works."
            ));
        }
    }
    let written = variant_spelling(&Condition::Peer(Box::new(inner.clone())))
        .unwrap_or_else(|| "peer-…".to_string());
    if target.peers.is_empty() {
        return Err(format!(
            "`{written}:` needs a preceding `peer` sibling in the same parent on Native, and none was found. On Web the same class works from the selector."
        ));
    }
    let mut dynamic_guards: Vec<String> = Vec::new();
    let mut saw_known_false = false;
    let mut first_error: Option<String> = None;
    for peer in target.peers {
        match resolve_single_peer(inner, *peer, source, runtime, &written) {
            Ok(Guard::Known(true)) => return Ok(Guard::Known(true)),
            Ok(Guard::Known(false)) => saw_known_false = true,
            Ok(Guard::Dynamic(expr)) => dynamic_guards.push(expr),
            Ok(Guard::Interactive(expr)) => dynamic_guards.push(expr),
            Ok(Guard::Scoped {
                available,
                predicate,
            })
            | Ok(Guard::InteractiveScoped {
                available,
                predicate,
            }) => dynamic_guards.push(format!("({available} && {predicate})")),
            Err(err) => {
                if first_error.is_none() {
                    first_error = Some(err);
                }
            }
        }
    }
    if !dynamic_guards.is_empty() {
        let combined = if dynamic_guards.len() == 1 {
            dynamic_guards.remove(0)
        } else {
            format!("({})", dynamic_guards.join(" || "))
        };
        Ok(Guard::Dynamic(combined))
    } else if saw_known_false {
        Ok(Guard::Known(false))
    } else {
        Err(first_error.unwrap_or_else(|| {
            format!(
                "`{written}:` has no readable driver on the preceding `peer` sibling on Native. On Web the same class works from the selector."
            )
        }))
    }
}

fn resolve_single_peer(
    inner: &Condition,
    peer: PeerSibling<'_>,
    source: &str,
    runtime: &mut RuntimeNeeds,
    written: &str,
) -> Result<Guard, String> {
    match inner {
        Condition::Not(nested) => resolve_single_peer(nested, peer, source, runtime, written)
            .map(Guard::negate),
        Condition::Hover | Condition::Focus | Condition::FocusVisible | Condition::Pressed => {
            let field = match inner {
                Condition::Hover => "hovered",
                Condition::Focus => "focused",
                Condition::FocusVisible => "focusVisible",
                Condition::Pressed => "pressed",
                _ => unreachable!(),
            };
            if peer.node.primitive == Primitive::TextInput
                && matches!(inner, Condition::Hover | Condition::Pressed)
            {
                return Err(format!(
                    "`{written}:` on a `TextInput` peer is not wired on Native: the field observes its focus, not hover/press. On Web the same class works from the selector."
                ));
            }
            match peer.interactive_id {
                Some(id) => Ok(Guard::Dynamic(format!("__hozoPeer[{id}].{field}"))),
                None => Err(format!(
                    "`{written}:` needs a preceding interactive `peer` sibling (`Pressable`, `Button`, `Link`, or `TextInput` for focus) in the same parent on Native. On Web the same class works from the selector."
                )),
            }
        }
        Condition::Aria(state) => {
            let driver = if state == "invalid" {
                "an `aria-invalid` prop"
            } else {
                "an `accessibilityState`"
            };
            aria_state_guard(peer.node, source, state)
                .map(|guard| Guard::Dynamic(format!("({guard})")))
                .ok_or_else(|| {
                    format!(
                        "`{written}:` needs {driver} on the preceding `peer` sibling to drive it on Native, and this one has none. On Web the same class works from the selector."
                    )
                })
        }
        Condition::DataAttribute(selector) => {
            data_attribute_guard(peer.node, source, selector, Some(written))
        }
        Condition::Disabled => peer
            .node
            .props
            .effective_disabled()
            .as_ref()
            .map(|disabled| {
                Guard::Dynamic(format!("({})", render_condition_expr(source, disabled)))
            })
            .ok_or_else(|| {
                format!(
                    "`{written}:` needs a `disabled` prop on the preceding `peer` sibling to drive it, and this one has none."
                )
            }),
        Condition::Enabled => Ok(peer
            .node
            .props
            .effective_disabled()
            .as_ref()
            .map_or(Guard::Known(true), |disabled| {
                Guard::Dynamic(format!("!({})", render_condition_expr(source, disabled)))
            })),
        Condition::Environment(query @ (Environment::Rtl | Environment::Ltr)) => {
            match authored(peer.node, source, "dir") {
                Some(Authored::Literal(dir)) if dir.eq_ignore_ascii_case("rtl") => {
                    Ok(Guard::Known(*query == Environment::Rtl))
                }
                Some(Authored::Literal(dir)) if dir.eq_ignore_ascii_case("ltr") => {
                    Ok(Guard::Known(*query == Environment::Ltr))
                }
                Some(Authored::Literal(other)) => Err(format!(
                    "`{written}:` cannot resolve `dir=\"{other}\"` on the preceding `peer` sibling on Native at build time. On Web the same class works from the selector."
                )),
                Some(Authored::Expr(expr)) => Ok(Guard::Dynamic(format!(
                    "(({expr}) === '{}')",
                    if *query == Environment::Rtl {
                        "rtl"
                    } else {
                        "ltr"
                    }
                ))),
                None => {
                    let hook = RuntimeHook::Environment(*query);
                    let guard = hook.binding();
                    runtime.hooks.push(hook);
                    Ok(Guard::Dynamic(guard))
                }
            }
        }
        Condition::Structural(structural) if structural.counts_by_type() => {
            Err(format!(
                "`{written}:` counts only siblings that share the `peer` sibling's tag, and React Native has no tags -- the `-of-type` variants are not compiled on React Native. On Web the same class works."
            ))
        }
        Condition::FirstChild | Condition::LastChild | Condition::Structural(_) => {
            let known = match inner {
                Condition::FirstChild => peer.position.first,
                Condition::LastChild => peer.position.last,
                Condition::Structural(structural) => {
                    structural_holds(structural, peer.node, peer.position)
                }
                _ => unreachable!("matched above"),
            };
            known.map(Guard::Known).ok_or_else(|| {
                format!(
                    "`{written}:` can only be resolved when the compiler can see the preceding `peer` sibling's position among its siblings, and here it can't."
                )
            })
        }
        Condition::FormState(FormState::ReadOnly) => read_only(peer.node, source)
            .map_err(|reason| format!("`{written}:` on the preceding `peer` sibling: {reason}")),
        Condition::FormState(FormState::PlaceholderShown) => placeholder_shown(peer.node, source)
            .map_err(|reason| format!("`{written}:` on the preceding `peer` sibling: {reason}")),
        _ => Err(format!(
            "`{written}:` reads a state React Native does not carry for a preceding `peer` sibling. On Web the same class works from the selector."
        )),
    }
}

fn resolve_focus_within(node: &Node) -> Result<Guard, String> {
    if !interaction::has_focusable_descendant(node) {
        return Err(
            "`focus-within:` asks whether a focusable descendant inside this element has focus, and this element has none on Native. Put `focus:` on the focusable element itself, or wrap a focusable child such as `TextInput`, `Pressable`, `Button`, or `Link`. On Web the same class works."
                .into(),
        );
    }
    if interaction::owns_events(node) {
        Ok(Guard::Interactive(
            "(focused || __hozoSubtree.focused)".into(),
        ))
    } else {
        Ok(Guard::Dynamic("__hozoSubtree.focused".into()))
    }
}

fn resolve_has(inner: &Condition, node: &Node) -> Result<Guard, String> {
    let written = variant_spelling(&Condition::Has(Box::new(inner.clone())))
        .unwrap_or_else(|| "has-…".to_string());
    match inner {
        Condition::Hover => {
            if !interaction::has_hoverable_descendant(node) {
                return Err(format!(
                    "`{written}:` asks whether a descendant inside this element is hovered, and this element has no hoverable descendant on Native. On Web the same class works."
                ));
            }
            Ok(Guard::Dynamic("__hozoSubtree.hovered".into()))
        }
        Condition::Pressed => {
            if !interaction::has_hoverable_descendant(node) {
                return Err(format!(
                    "`{written}:` asks whether a descendant inside this element is pressed, and this element has no pressable descendant on Native. On Web the same class works."
                ));
            }
            Ok(Guard::Dynamic("__hozoSubtree.pressed".into()))
        }
        Condition::Focus | Condition::FocusWithin => {
            if !interaction::has_focusable_descendant(node) {
                return Err(format!(
                    "`{written}:` asks whether a descendant inside this element has focus, and this element has no focusable descendant on Native. On Web the same class works."
                ));
            }
            Ok(Guard::Dynamic("__hozoSubtree.focused".into()))
        }
        Condition::FocusVisible => {
            if !interaction::has_focusable_descendant(node) {
                return Err(format!(
                    "`{written}:` asks whether a descendant inside this element has focus-visible, and this element has no focusable descendant on Native. On Web the same class works."
                ));
            }
            Ok(Guard::Dynamic("__hozoSubtree.focusVisible".into()))
        }
        _ => Err(format!(
            "`{written}:` has no React Native equivalent -- only descendant interaction states (`hover`, `focus`, `focus-visible`, `active`, `focus-within`) are tracked on Native. On Web the same class works."
        )),
    }
}

fn resolve_has_selector(selector: &str, node: &Node) -> Result<Guard, String> {
    let trimmed = selector.trim();
    match trimmed {
        ":focus" | "*:focus" | ":focus-within" | "*:focus-within" => {
            if !interaction::has_focusable_descendant(node) {
                return Err(format!(
                    "`has-[{selector}]:` asks whether a descendant inside this element has focus, and this element has no focusable descendant on Native. On Web the same class works."
                ));
            }
            Ok(Guard::Dynamic("__hozoSubtree.focused".into()))
        }
        ":focus-visible" | "*:focus-visible" => {
            if !interaction::has_focusable_descendant(node) {
                return Err(format!(
                    "`has-[{selector}]:` asks whether a descendant inside this element has focus-visible, and this element has no focusable descendant on Native. On Web the same class works."
                ));
            }
            Ok(Guard::Dynamic("__hozoSubtree.focusVisible".into()))
        }
        ":hover" | "*:hover" => {
            if !interaction::has_hoverable_descendant(node) {
                return Err(format!(
                    "`has-[{selector}]:` asks whether a descendant inside this element is hovered, and this element has no hoverable descendant on Native. On Web the same class works."
                ));
            }
            Ok(Guard::Dynamic("__hozoSubtree.hovered".into()))
        }
        ":active" | "*:active" => {
            if !interaction::has_hoverable_descendant(node) {
                return Err(format!(
                    "`has-[{selector}]:` asks whether a descendant inside this element is active, and this element has no pressable descendant on Native. On Web the same class works."
                ));
            }
            Ok(Guard::Dynamic("__hozoSubtree.pressed".into()))
        }
        _ => Err(format!(
            "`has-[{selector}]:` has no React Native equivalent -- it selects on a descendant CSS selector, and there are no selectors here. On Web the same class works."
        )),
    }
}

enum DataAttrOp<'a> {
    Present,
    Equals(&'a str),
    IncludesWord(&'a str),
    DashMatch(&'a str),
    Prefix(&'a str),
    Suffix(&'a str),
    Substring(&'a str),
}

struct ParsedDataSelector<'a> {
    attr_name: &'a str,
    op: DataAttrOp<'a>,
    case_insensitive: bool,
}

fn parse_data_selector(selector: &str) -> Option<ParsedDataSelector<'_>> {
    let body = selector.strip_prefix('[')?.strip_suffix(']')?.trim();
    if !body.starts_with("data-") {
        return None;
    }
    let name_end = body
        .find(|c: char| !c.is_ascii_alphanumeric() && c != '-' && c != '_')
        .unwrap_or(body.len());
    let attr_name = &body[..name_end];
    if attr_name == "data-"
        || attr_name.starts_with("data-hozo-")
        || !attr_name
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-' || b == b'_')
    {
        return None;
    }
    let rest = body[name_end..].trim();
    if rest.is_empty() {
        return Some(ParsedDataSelector {
            attr_name,
            op: DataAttrOp::Present,
            case_insensitive: false,
        });
    }
    let (op_kind, after_op) = if let Some(v) = rest.strip_prefix("~=") {
        ("~=", v)
    } else if let Some(v) = rest.strip_prefix("|=") {
        ("|=", v)
    } else if let Some(v) = rest.strip_prefix("^=") {
        ("^=", v)
    } else if let Some(v) = rest.strip_prefix("$=") {
        ("$=", v)
    } else if let Some(v) = rest.strip_prefix("*=") {
        ("*=", v)
    } else {
        let v = rest.strip_prefix('=')?;
        ("=", v)
    };
    let after_op = after_op.trim();
    let (value, trailing) =
        if let Some(quote) = after_op.chars().next().filter(|c| *c == '"' || *c == '\'') {
            let rest = &after_op[1..];
            let close = rest.find(quote)?;
            let val = &rest[..close];
            if val.contains('\\') {
                return None;
            }
            (val, rest[close + 1..].trim())
        } else {
            let mut parts = after_op.split_whitespace();
            let val = parts.next()?;
            if val.is_empty() || val.contains(['\\', '"', '\'', '[', ']']) {
                return None;
            }
            let remainder = after_op[val.len()..].trim();
            (val, remainder)
        };
    let case_insensitive = match trailing {
        "" | "s" | "S" => false,
        "i" | "I" => true,
        _ => return None,
    };
    let op = match op_kind {
        "=" => DataAttrOp::Equals(value),
        "~=" => DataAttrOp::IncludesWord(value),
        "|=" => DataAttrOp::DashMatch(value),
        "^=" => DataAttrOp::Prefix(value),
        "$=" => DataAttrOp::Suffix(value),
        "*=" => DataAttrOp::Substring(value),
        _ => unreachable!(),
    };
    Some(ParsedDataSelector {
        attr_name,
        op,
        case_insensitive,
    })
}

pub(super) fn has_authored_data_prop(node: &Node, condition: &Condition) -> bool {
    let Condition::DataAttribute(selector) = condition else {
        return false;
    };
    let Some(parsed) = parse_data_selector(selector) else {
        return false;
    };
    node.props
        .passthrough
        .iter()
        .any(|prop| prop.name.as_deref() == Some(parsed.attr_name))
}

fn js_single_quoted(value: &str) -> String {
    let mut out = String::with_capacity(value.len() + 2);
    out.push('\'');
    for ch in value.chars() {
        match ch {
            '\\' => out.push_str("\\\\"),
            '\'' => out.push_str("\\'"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            _ => out.push(ch),
        }
    }
    out.push('\'');
    out
}

fn static_data_matches(actual: &str, op: &DataAttrOp<'_>, case_insensitive: bool) -> bool {
    let cmp = |s: &str| {
        if case_insensitive {
            s.to_ascii_lowercase()
        } else {
            s.to_string()
        }
    };
    let a = cmp(actual);
    match op {
        DataAttrOp::Present => true,
        DataAttrOp::Equals(expected) => a == cmp(expected),
        DataAttrOp::IncludesWord(expected) => {
            !expected.is_empty() && a.split_whitespace().any(|w| w == cmp(expected))
        }
        DataAttrOp::DashMatch(expected) => {
            let e = cmp(expected);
            a == e || a.strip_prefix(&e).is_some_and(|rest| rest.starts_with('-'))
        }
        DataAttrOp::Prefix(expected) => !expected.is_empty() && a.starts_with(&cmp(expected)),
        DataAttrOp::Suffix(expected) => !expected.is_empty() && a.ends_with(&cmp(expected)),
        DataAttrOp::Substring(expected) => !expected.is_empty() && a.contains(&cmp(expected)),
    }
}

fn data_attribute_guard(
    node: &Node,
    source: &str,
    selector: &str,
    written_override: Option<&str>,
) -> Result<Guard, String> {
    let written = written_override.map(str::to_string).unwrap_or_else(|| {
        variant_spelling(&Condition::DataAttribute(selector.to_string()))
            .unwrap_or_else(|| "data-…".to_string())
    });
    let Some(parsed) = parse_data_selector(selector) else {
        return Err(format!(
            "`{written}:` has no React Native equivalent -- its attribute selector syntax cannot be evaluated against an authored prop here. On Web the same class works."
        ));
    };
    let location = if written_override.is_some() {
        "on the enclosing `group` ancestor"
    } else {
        "on the same element"
    };
    let Some(prop) = authored(node, source, parsed.attr_name) else {
        return Err(format!(
            "`{written}:` needs a `{}` prop {location} to drive it on Native, and this one has none. On Web the same class works from the attribute.",
            parsed.attr_name
        ));
    };
    match (prop, &parsed.op) {
        (Authored::Literal(_), DataAttrOp::Present) => Ok(Guard::Known(true)),
        (Authored::Expr(expr), DataAttrOp::Present) if expr == "true" => Ok(Guard::Known(true)),
        (Authored::Expr(expr), DataAttrOp::Present) if expr == "undefined" || expr == "null" => {
            Ok(Guard::Known(false))
        }
        (Authored::Expr(expr), DataAttrOp::Present) => {
            Ok(Guard::Dynamic(format!("(({expr}) != null)")))
        }
        (Authored::Literal(actual), op) => Ok(Guard::Known(static_data_matches(
            &actual,
            op,
            parsed.case_insensitive,
        ))),
        (Authored::Expr(expr), op) => {
            let norm = if parsed.case_insensitive {
                format!("String({expr}).toLowerCase()")
            } else {
                format!("String({expr})")
            };
            let target_str = |expected: &str| {
                if parsed.case_insensitive {
                    js_single_quoted(&expected.to_ascii_lowercase())
                } else {
                    js_single_quoted(expected)
                }
            };
            let check = match op {
                DataAttrOp::Present => unreachable!(),
                DataAttrOp::Equals(expected) => format!("{norm} === {}", target_str(expected)),
                DataAttrOp::IncludesWord(expected) => {
                    if expected.is_empty() {
                        return Ok(Guard::Known(false));
                    }
                    format!("{norm}.split(/\\s+/).includes({})", target_str(expected))
                }
                DataAttrOp::DashMatch(expected) => {
                    let t = target_str(expected);
                    let prefix = target_str(&format!("{expected}-"));
                    format!("({norm} === {t} || {norm}.startsWith({prefix}))")
                }
                DataAttrOp::Prefix(expected) => {
                    if expected.is_empty() {
                        return Ok(Guard::Known(false));
                    }
                    format!("{norm}.startsWith({})", target_str(expected))
                }
                DataAttrOp::Suffix(expected) => {
                    if expected.is_empty() {
                        return Ok(Guard::Known(false));
                    }
                    format!("{norm}.endsWith({})", target_str(expected))
                }
                DataAttrOp::Substring(expected) => {
                    if expected.is_empty() {
                        return Ok(Guard::Known(false));
                    }
                    format!("{norm}.includes({})", target_str(expected))
                }
            };
            Ok(Guard::Dynamic(format!("(({expr}) != null && {check})")))
        }
    }
}

fn ambient(hook: RuntimeHook, runtime: &mut RuntimeNeeds) -> Guard {
    let binding = hook.binding();
    runtime.hooks.push(hook);
    Guard::Dynamic(binding)
}

/// A prop the author wrote on this element, as the parser kept it.
enum Authored {
    /// `name="text"`.
    Literal(String),
    /// `name={expr}`, as the expression's source.
    Expr(String),
}

fn authored(node: &Node, source: &str, name: &str) -> Option<Authored> {
    let prop = node
        .props
        .passthrough
        .iter()
        .find(|prop| prop.name.as_deref() == Some(name))?;
    let text = &source[prop.span.0.start as usize..prop.span.0.end as usize];
    let Some((_, value)) = text.split_once('=') else {
        // A bare attribute is `true`, which is not text at all.
        return Some(Authored::Expr("true".into()));
    };
    let value = value.trim();
    if let Some(inner) = value.strip_prefix('{').and_then(|v| v.strip_suffix('}')) {
        return Some(Authored::Expr(
            hozo_ir::attribute_capture::slice(source, inner.trim()).into_owned(),
        ));
    }
    value
        .strip_prefix('"')
        .and_then(|v| v.strip_suffix('"'))
        .or_else(|| value.strip_prefix('\'').and_then(|v| v.strip_suffix('\'')))
        .map(|inner| Authored::Literal(inner.to_string()))
}

/// `placeholder-shown:`: the field has a placeholder and no text, which on
/// React Native is two props the compiler can read -- the question the
/// browser answers from the element's state is answered here from the
/// expressions that drive it.
///
/// - No `placeholder`, or an empty one, is never shown, on either platform.
/// - No `value` is an uncontrolled field: what was typed lives inside the
///   native view, and React Native gives nothing to read it with. That is
///   refused rather than guessed.
/// - A `value` that is `null` or `undefined` is counted as empty, which is
///   what the field shows while it holds one.
fn placeholder_shown(node: &Node, source: &str) -> Result<Guard, String> {
    if node.primitive != Primitive::TextInput {
        return Err("`placeholder-shown:` asks whether a TextInput is showing its placeholder, and this element is not a TextInput. On Web the same class works.".into());
    }
    let placeholder = match authored(node, source, "placeholder") {
        None => return Ok(Guard::Known(false)),
        Some(Authored::Literal(text)) if text.is_empty() => return Ok(Guard::Known(false)),
        Some(Authored::Literal(_)) => None,
        Some(Authored::Expr(expr)) => Some(format!("!!({expr})")),
    };
    let empty = match authored(node, source, "value") {
        None => return Err("`placeholder-shown:` needs a `value` prop on the same TextInput: without one the field is uncontrolled, and React Native gives no way to read what was typed into it. Pass the text as `value` (with `onChangeText`) to drive the style. On Web the same class works.".into()),
        Some(Authored::Literal(text)) => {
            if !text.is_empty() {
                return Ok(Guard::Known(false));
            }
            None
        }
        Some(Authored::Expr(expr)) => Some(format!("(({expr}) ?? '') === ''")),
    };
    Ok(match (placeholder, empty) {
        (None, None) => Guard::Known(true),
        (Some(guard), None) | (None, Some(guard)) => Guard::Dynamic(format!("({guard})")),
        (Some(placeholder), Some(empty)) => Guard::Dynamic(format!("({placeholder} && {empty})")),
    })
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
