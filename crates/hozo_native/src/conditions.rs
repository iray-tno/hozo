//! Runtime condition evaluation and conditional style entry construction.
//!
//! This module owns the bridge from IR conditions to React Native runtime
//! hooks, diagnostics, and guarded `style` array entries.

use super::*;

/// A React hook the generated component needs in order to observe an
/// ambient condition -- one whose value is the same app-wide at any moment.
///
/// These are why `dark:` and `md:` work on Native without the reactive
/// engine Hozo doesn't ship: the value isn't per-element, so
/// `@hozo/runtime` keeps one subscription for the whole app and the hook
/// only exists to re-render *this* component when it changes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum RuntimeHook {
    Dark,
    Breakpoint(Breakpoint),
    /// Window size, for the viewport-relative sizes (`h-screen`).
    ///
    /// Unlike the other two, this one's value is *used* rather than guarded
    /// on, so it reports the numbers instead of a boolean -- and it
    /// re-renders on every window change rather than only when a breakpoint
    /// is crossed. That is the price of a size that has to track the window
    /// exactly, and it's why the breakpoints keep their coarse snapshot
    /// rather than being rebuilt on top of this.
    Viewport,
    /// One environment query, by Tailwind's name for it.
    ///
    /// Seven queries, four subscriptions: the runtime answers
    /// `motion-safe` from `motion-reduce` and `landscape` from
    /// `portrait`, so the pairs cost nothing extra.
    Environment(Environment),
    /// A width threshold that is not one of the five named breakpoints.
    ///
    /// Its own hook rather than a number handed to the bucketed one,
    /// because the buckets are the five and this is not one of them. Just
    /// as cheap, though: the hook's snapshot is the *predicate* rather
    /// than the width, so React bails out on every resize that doesn't
    /// cross the threshold -- which is the same guarantee the buckets give
    /// by rounding.
    WidthAtLeast(u32),
    /// One of Tailwind's four looping animations.
    ///
    /// Was `Spin` alone, because spin was the only one wired. The other
    /// three move only opacity and transform too, so they run on the
    /// same native driver and differ from it in nothing a separate hook
    /// would have expressed.
    Animation(hozo_ir::Animation),
}

impl RuntimeHook {
    /// The local binding the rendered JSX guards on.
    pub(super) fn binding(&self) -> String {
        match self {
            RuntimeHook::Dark => "__hozoDark".to_string(),
            RuntimeHook::Breakpoint(bp) => format!("__hozoBp_{}", breakpoint_name(bp)),
            RuntimeHook::WidthAtLeast(px) => format!("__hozoWidth_{px}"),
            RuntimeHook::Viewport => "__hozoViewport".to_string(),
            RuntimeHook::Animation(name) => format!("__hozoAnim_{}", animation_name(*name)),
            RuntimeHook::Environment(query) => {
                format!("__hozoEnv_{}", environment_name(*query).replace('-', "_"))
            }
        }
    }

    pub(super) fn import(&self) -> &'static str {
        match self {
            RuntimeHook::Dark => "useHozoDark",
            RuntimeHook::Breakpoint(_) => "useHozoBreakpoint",
            RuntimeHook::Viewport => "useHozoViewport",
            RuntimeHook::Animation(_) => "useHozoAnimation",
            RuntimeHook::Environment(_) => "useHozoEnvironment",
            RuntimeHook::WidthAtLeast(_) => "useHozoWidthAtLeast",
        }
    }

    pub(super) fn declaration(&self) -> String {
        match self {
            RuntimeHook::Dark => format!("const {} = useHozoDark()", self.binding()),
            RuntimeHook::Breakpoint(bp) => format!(
                "const {} = useHozoBreakpoint('{}')",
                self.binding(),
                breakpoint_name(bp)
            ),
            RuntimeHook::WidthAtLeast(px) => {
                format!("const {} = useHozoWidthAtLeast({px})", self.binding())
            }
            RuntimeHook::Viewport => format!("const {} = useHozoViewport()", self.binding()),
            RuntimeHook::Animation(name) => format!(
                "const {} = useHozoAnimation('{}')",
                self.binding(),
                animation_name(*name)
            ),
            // The query goes through as Tailwind's name, the way the
            // breakpoint one does -- so the generated call reads as the
            // class it came from.
            RuntimeHook::Environment(query) => format!(
                "const {} = useHozoEnvironment('{}')",
                self.binding(),
                environment_name(*query)
            ),
        }
    }
}

/// Tailwind's own names, which `@hozo/runtime`'s breakpoint table also
/// uses. Distinct from `condition_suffix`, which needs an identifier-safe
/// form (`xl2`) for the generated style key.
fn breakpoint_name(bp: &Breakpoint) -> &'static str {
    match bp {
        Breakpoint::Sm => "sm",
        Breakpoint::Md => "md",
        Breakpoint::Lg => "lg",
        Breakpoint::Xl => "xl",
        Breakpoint::Xl2 => "2xl",
    }
}

pub(super) fn unwired_variant(node: &Node, message: &str, severity: Severity) -> Diagnostic {
    Diagnostic {
        code: DiagnosticCode::NotWiredOnNative,
        severity,
        message: message.to_string(),
        span: node.span,
    }
}

/// Groups `declarations` by condition, registers a named style entry for
/// each group, and records how each should be referenced from the rendered
/// `style` prop. Shared by a node and any `Text` wrapper inserted inside
/// it, so both get identical condition handling.
///
/// Every condition that can't reach the rendered `style` prop reports
/// itself. Until 2026-08-15 they were computed into the StyleSheet and then
/// dropped in silence -- all eight variant-prefixed utilities in the
/// conformance suite, scored as covered because the entry existed.
#[allow(clippy::too_many_arguments)]
pub(super) fn build_style_entries(
    declarations: &[StyleDeclaration],
    base_name: &str,
    source: &str,
    node: &Node,
    position: SiblingPosition,
    style_entries: &mut Vec<(String, Vec<StyleProperty>)>,
    style_array_parts: &mut Vec<String>,
    pressed_parts: &mut Vec<String>,
    diagnostics: &mut Vec<Diagnostic>,
    runtime: &mut RuntimeNeeds,
    interaction_context: bool,
) {
    // A conditional style must land after every unconditional one,
    // whatever order they were written in. On Web the cascade settles this
    // by specificity -- `.hozo-0:disabled` (0,2,0) beats `.hozo-0`
    // (0,1,0) no matter which rule comes first -- but a React Native style
    // array resolves purely last-wins, so position has to stand in for
    // specificity. Writing `disabled:p-8 p-4` used to render p-8 on Web and
    // p-4 on device.
    //
    // Within each half, source order is preserved: two conditions are the
    // same specificity on Web, so there it is source order that decides.
    let mut base_parts: Vec<String> = Vec::new();
    let mut conditional_parts: Vec<String> = Vec::new();

    for (condition, props) in hozo_ir::group_by_condition(declarations) {
        let props = hozo_ir::dedupe_last_wins(props);
        if props.is_empty() {
            continue;
        }
        // A viewport-relative size can't live in the StyleSheet: its value
        // is a number that changes when the device rotates. It becomes an
        // inline object read from a hook instead, so it stays in the same
        // style array -- and therefore in the same last-wins order -- as the
        // static entry it sits beside.
        let (viewport_props, props): (Vec<_>, Vec<_>) =
            props.into_iter().partition(is_viewport_sized);
        let viewport = viewport_object(&viewport_props);
        if viewport.is_some() {
            runtime.hooks.push(RuntimeHook::Viewport);
        }
        let (animation_props, props): (Vec<_>, Vec<_>) =
            props.into_iter().partition(|property| matches!(property, StyleProperty::Animation(_)));
        // `animate-none` asks for no hook: it turns an animation off
        // rather than being one.
        let animation_hook = animation_props.iter().find_map(|property| match property {
            StyleProperty::Animation(hozo_ir::Animation::None) => None,
            StyleProperty::Animation(name) => Some(RuntimeHook::Animation(*name)),
            _ => None,
        });
        let animation = animation_hook.as_ref().map(RuntimeHook::binding);
        if let Some(hook) = animation_hook {
            runtime.hooks.push(hook);
        }
        if props.is_empty() && viewport.is_none() && animation.is_none() {
            continue;
        }
        let name = match condition_suffix(&condition) {
            None => base_name.to_string(),
            Some(suffix) => format!("{base_name}_{suffix}"),
        };
        // The static entry and the inline object are separate array
        // elements rather than one combined string: a single part is emitted
        // as `style={part}` without the brackets, and `styles.a, {…}` there
        // would be a comma expression rather than two styles.
        let parts: Vec<String> = props
            .is_empty()
            .then(Vec::new)
            .unwrap_or_else(|| vec![format!("{STYLE_OBJECT}.{name}")])
            .into_iter()
            .chain(viewport.clone())
            .chain(animation.clone())
            .collect();
        // Each part carries the condition's guard. There may be two of them
        // (a StyleSheet entry and an inline viewport object), and both have
        // to be guarded, or `md:h-screen` would apply its height at every
        // width.
        let guarded = |prefix: &str| -> Vec<String> {
            parts.iter().map(|part| format!("{prefix}{part}")).collect()
        };
        match &condition {
            Condition::Always => base_parts.extend(parts.clone()),
            Condition::All(conditions) => {
                let mut atoms = Vec::new();
                let mut pending: Vec<_> = conditions.iter().rev().collect();
                while let Some(atom) = pending.pop() {
                    if let Condition::All(nested) = atom {
                        pending.extend(nested.iter().rev());
                    } else {
                        atoms.push(atom);
                    }
                }
                let supported = atoms.iter().all(|atom| {
                    matches!(
                        atom,
                        Condition::Always
                            | Condition::Disabled
                            | Condition::Aria(_)
                            | Condition::Enabled
                            | Condition::Group(_)
                            | Condition::Environment(_)
                            | Condition::Pressed
                            | Condition::Expr(_)
                            | Condition::Hover
                            | Condition::Focus
                            | Condition::FocusVisible
                            | Condition::Responsive(_)
                            | Condition::Width { .. }
                            | Condition::Container { .. }
                            | Condition::Dark
                            | Condition::FirstChild
                            | Condition::LastChild
                            | Condition::Structural(_)
                    )
                });
                if !supported {
                    diagnostics.push(unwired_variant(
                        node,
                        &format!(
                            "`{}`: this stacked variant contains a condition React Native \
                             doesn't have wired up yet, so the style is not applied.",
                            atoms
                                .iter()
                                .filter_map(|condition| condition_suffix(condition))
                                .collect::<Vec<_>>()
                                .join(":")
                        ),
                        Severity::Warning,
                    ));
                } else {
                    let mut guards = Vec::new();
                    let mut uses_interactive_state = false;
                    let mut applies = true;
                    for atom in atoms {
                        match atom {
                            Condition::Always => {}
                            Condition::Disabled => {
                                if let Some(disabled) = &node.props.disabled {
                                    guards.push(format!(
                                        "({})",
                                        render_condition_expr(source, disabled)
                                    ));
                                } else {
                                    diagnostics.push(unwired_variant(
                                        node,
                                        "`disabled:` in a stacked variant needs a `disabled` prop \
                                         on the same element to drive it, and this one has none.",
                                        Severity::Error,
                                    ));
                                    applies = false;
                                }
                            }
                            Condition::Group(inner) => match group_state(inner, interaction_context) {
                                Some(state) => {
                                    guards.push(state.to_string());
                                    uses_interactive_state = true;
                                }
                                None => {
                                    diagnostics.push(unwired_variant(
                                        node,
                                        &group_unwired_message(inner, interaction_context),
                                        Severity::Error,
                                    ));
                                    applies = false;
                                }
                            },
                            Condition::Enabled => {
                                // The negation of the guard `disabled:`
                                // uses, from the same prop.
                                if let Some(disabled) = &node.props.disabled {
                                    guards.push(format!("!({})", render_condition_expr(source, disabled)));
                                }
                            },
                            Condition::Aria(state) => {
                                match aria_state_guard(node, source, state) {
                                    Some(guard) => guards.push(format!("({guard})")),
                                    None => {
                                        diagnostics.push(unwired_variant(
                                            node,
                                            &format!(
                                                "`aria-{state}:` in a stacked variant needs an `accessibilityState` on the same element to drive it on Native, and this one has none."
                                            ),
                                            Severity::Error,
                                        ));
                                        applies = false;
                                    }
                                }
                            }
                            Condition::Pressed => {
                                guards.push("pressed".to_string());
                                uses_interactive_state = true;
                            }
                            Condition::Hover => {
                                if interaction_context || matches!(node.primitive, Primitive::Pressable | Primitive::Button)
                                {
                                    guards.push("hovered".to_string());
                                    uses_interactive_state = true;
                                } else {
                                    diagnostics.push(unwired_variant(
                                        node,
                                        "`hover:` in a stacked variant is wired only on \
                                         Pressable and Button on React Native.",
                                        Severity::Error,
                                    ));
                                    applies = false;
                                }
                            }
                            Condition::Focus => {
                                if interaction_context || matches!(node.primitive, Primitive::Pressable | Primitive::Button)
                                {
                                    guards.push("focused".to_string());
                                    uses_interactive_state = true;
                                } else {
                                    diagnostics.push(unwired_variant(
                                        node,
                                        "`focus:` in a stacked variant is wired only on \
                                         Pressable and Button on React Native.",
                                        Severity::Error,
                                    ));
                                    applies = false;
                                }
                            }
                            Condition::FocusVisible => {
                                if interaction_context || matches!(node.primitive, Primitive::Pressable | Primitive::Button)
                                {
                                    guards.push("focusVisible".to_string());
                                    uses_interactive_state = true;
                                } else {
                                    diagnostics.push(unwired_variant(
                                        node,
                                        "`focus-visible:` in a stacked variant is wired only on Pressable and Button on React Native.",
                                        Severity::Error,
                                    ));
                                    applies = false;
                                }
                            }
                            Condition::Expr(expr) => {
                                guards.push(format!("({})", render_condition_expr(source, expr)));
                            }
                            Condition::Responsive(bp) => {
                                let hook = RuntimeHook::Breakpoint(*bp);
                                guards.push(hook.binding().to_string());
                                runtime.hooks.push(hook);
                            }
                            Condition::Container { name, at_least, value } => {
                                match container_guard(name, *at_least, value) {
                                    Some(guard) => guards.push(format!("({guard})")),
                                    None => {
                                        diagnostics.push(unwired_variant(
                                            node,
                                            &format!(
                                                "`{value}` in this stacked variant is not a pixel width, and React Native has nothing to resolve it against.",
                                            ),
                                            Severity::Error,
                                        ));
                                        applies = false;
                                    }
                                }
                            }
                            Condition::Width { at_least, value } => {
                                match width_threshold_px(value) {
                                    Some(px) => {
                                        let hook = RuntimeHook::WidthAtLeast(px);
                                        guards.push(if *at_least {
                                            hook.binding().to_string()
                                        } else {
                                            format!("!{}", hook.binding())
                                        });
                                        runtime.hooks.push(hook);
                                    }
                                    None => {
                                        diagnostics.push(unwired_variant(
                                            node,
                                            &format!(
                                                "`{value}` in this stacked variant is not a pixel width, and React Native has nothing to resolve it against.",
                                            ),
                                            Severity::Error,
                                        ));
                                        applies = false;
                                    }
                                }
                            }
                            Condition::Dark => {
                                let hook = RuntimeHook::Dark;
                                guards.push(hook.binding().to_string());
                                runtime.hooks.push(hook);
                            }
                            Condition::Environment(query) => match native_environment(*query) {
                                Some(query) => {
                                    let hook = RuntimeHook::Environment(query);
                                    guards.push(hook.binding().to_string());
                                    runtime.hooks.push(hook);
                                }
                                None => {
                                    diagnostics.push(unwired_variant(
                                        node,
                                        &environment_unwired_message(*query),
                                        Severity::Error,
                                    ));
                                    applies = false;
                                }
                            },
                            Condition::FirstChild
                            | Condition::LastChild
                            | Condition::Structural(_) => {
                                let known = match atom {
                                    Condition::FirstChild => position.first,
                                    Condition::LastChild => position.last,
                                    Condition::Structural(structural) => {
                                        structural_holds(structural, node, position)
                                    }
                                    _ => unreachable!("matched above"),
                                };
                                match known {
                                    Some(true) => {}
                                    Some(false) => applies = false,
                                    None => {
                                        diagnostics.push(unwired_variant(
                                            node,
                                            "a structural condition in this stacked variant \
                                             can't be resolved because the element's sibling \
                                             position isn't statically known.",
                                            Severity::Error,
                                        ));
                                        applies = false;
                                    }
                                }
                            }
                            _ => unreachable!("unsupported atoms were rejected above"),
                        }
                    }
                    if applies {
                        let prefix = if guards.is_empty() {
                            String::new()
                        } else {
                            format!("{} && ", guards.join(" && "))
                        };
                        if uses_interactive_state {
                            pressed_parts.extend(guarded(&prefix));
                        } else {
                            conditional_parts.extend(guarded(&prefix));
                        }
                    }
                }
            }
            Condition::Disabled => {
                if let Some(disabled) = &node.props.disabled {
                    let guard = render_condition_expr(source, disabled);
                    conditional_parts.extend(guarded(&format!("({guard}) && ")));
                } else {
                    // Nothing on this element drives the condition. On Web
                    // the same source is inert too (`:disabled` never
                    // matches a div), but there it's CSS behaving
                    // correctly; here it's a style that was computed and
                    // then had nowhere to go.
                    diagnostics.push(unwired_variant(
                        node,
                        "`disabled:` needs a `disabled` prop on the same element to drive it, and \
                         this one has none.",
                        Severity::Error,
                    ));
                }
            }
            Condition::Group(inner) => match group_state(inner, interaction_context) {
                // `pressed_parts`, not `conditional_parts`: these names
                // come from the render-prop the interaction context hands
                // down, and only that list makes the component take the
                // form where they are in scope. Putting them in the other
                // one emitted `hovered && …` against an identifier that
                // does not exist there.
                Some(state) => pressed_parts.extend(guarded(&format!("{state} && "))),
                None => diagnostics.push(unwired_variant(
                    node,
                    &group_unwired_message(inner, interaction_context),
                    Severity::Error,
                )),
            },
            Condition::Environment(query) => match native_environment(*query) {
                Some(query) => {
                    let hook = RuntimeHook::Environment(query);
                    conditional_parts.extend(guarded(&format!("{} && ", hook.binding())));
                    runtime.hooks.push(hook);
                }
                None => diagnostics.push(unwired_variant(
                    node,
                    &environment_unwired_message(*query),
                    Severity::Error,
                )),
            },
            // Negation is a guard like any other, so this is wired
            // wherever the thing it negates is -- but the inner condition
            // has to be resolved first, and that resolution lives in the
            // arms below rather than in a function this can call. Reported
            // for now, which is at least not silence.
            Condition::Not(inner) => diagnostics.push(unwired_variant(
                node,
                &format!(
                    "`not-{}:` is not wired on React Native yet. On Web the same class works.",
                    condition_suffix(inner).unwrap_or_default()
                ),
                Severity::Error,
            )),
            // `data-…:` selects on an attribute, and React Native views
            // have none: what the DOM keeps in an attribute a React Native
            // component keeps in a prop, and Hozo cannot read a prop it
            // does not model. `has-…:` and `supports-…:` are a descendant
            // selector and a CSS feature query, neither of which exists
            // here at all.
            Condition::DataAttribute(_)
            | Condition::Supports(_)
            | Condition::Has(_)
            | Condition::HasSelector(_) => diagnostics.push(unwired_variant(
                node,
                &format!(
                    "`{}:` has no React Native equivalent -- it selects on an attribute, a descendant or a CSS feature, and there are no selectors here. On Web the same class works.",
                    condition_suffix(&condition).unwrap_or_default()
                ),
                Severity::Error,
            )),
            // Focus on a *descendant*, which is a relation, and relations
            // on Native are the one thing this backend keeps having to
            // refuse -- see `peer-` below. `focus:` works because an
            // element knows its own focus; nothing here knows a subtree's.
            Condition::FocusWithin => diagnostics.push(unwired_variant(
                node,
                "`focus-within:` asks whether anything *inside* this element has focus, and React Native gives an element no way to know that. `focus:` on the element that actually takes focus is the version that works on both platforms.",
                Severity::Error,
            )),
            // Two that are not gaps in this backend so much as questions
            // the platform cannot be asked. A link the user has been to
            // needs links and a history to have been in them, and neither
            // is a thing React Native has. `@starting-style` needs a
            // declarative first frame, and React Native's transitions take
            // their starting value as an argument instead -- which is not
            // a worse answer, only one the author writes rather than one
            // a class can.
            Condition::Visited => diagnostics.push(unwired_variant(
                node,
                "`visited:` styles a link the user has already been to. React Native has no browsing history and no links to have been in one, so there is nothing here for this to be true of. On Web the same class works -- for colours; the browser discards the rest.",
                Severity::Error,
            )),
            Condition::StartingStyle => diagnostics.push(unwired_variant(
                node,
                "`starting:` is the value a property has for its first frame, so a transition has somewhere to start. React Native transitions through `Animated` and Reanimated, which take that starting value as an argument rather than reading it off a rule -- write it there. On Web the same class works.",
                Severity::Error,
            )),
            Condition::Target => diagnostics.push(unwired_variant(
                node,
                "`target:` matches the element the document's URL fragment points at. React Native has no document and no URL to point with, so there is nothing for this to be true of. On Web the same class works.",
                Severity::Error,
            )),
            // `read-only:` is the one the compiler can answer: React Native
            // has the state, under two names, as a prop it is looking at.
            // The other ten are the DOM's constraint validation, and
            // React Native has no such thing -- no `required`, no
            // `pattern`, no `:invalid` for them to be true of.
            Condition::FormState(FormState::ReadOnly) => {
                match native_read_only(&node.props.text_input) {
                    // A value known at build time decides the style rather
                    // than guarding it, the same way `first:` does: `true
                    // && style` in the output would be a condition that
                    // was already resolved, written out anyway.
                    Some(ConditionExpr::Static(true)) => conditional_parts.extend(guarded("")),
                    Some(ConditionExpr::Static(false)) => {}
                    Some(guard) => {
                        conditional_parts.extend(guarded(&format!("{} && ", render_condition_expr(source, &guard))))
                    }
                    None => diagnostics.push(unwired_variant(
                        node,
                        "`read-only:` needs this element to say whether it is read-only, and it doesn't. Add `readOnly` or `editable` -- either spelling -- and the style resolves at build time.",
                        Severity::Error,
                    )),
                }
            }
            // Not a gap that could be closed. React Native's styles are
            // objects handed to components, and a pseudo-element is a box
            // the browser makes that has no component to hand one to.
            // `placeholder:` is the near miss: React Native carries a
            // placeholder's colour on `TextInput`'s own
            // `placeholderTextColor` prop, which is a colour and not a
            // style object, so it cannot take the rest of what
            // `placeholder:` is allowed to set.
            Condition::PseudoElement(pseudo) => diagnostics.push(unwired_variant(
                node,
                &format!(
                    "`{}:` styles a pseudo-element, which React Native does not have -- its styles go to components, and there is no component here to give one to. Render the content as a real element instead. On Web the same class works.",
                    pseudo.variant_name(),
                ),
                Severity::Error,
            )),
            Condition::FormState(state) => diagnostics.push(unwired_variant(
                node,
                &format!(
                    "`{}:` is the DOM's constraint validation, which React Native does not have -- there is no `required`, no `pattern`, and nothing for `:invalid` to be true of. Validate in your own code and drive the style from a `className` guard. On Web the same class works.",
                    state.variant_name(),
                ),
                Severity::Error,
            )),
            // The width comes from an ancestor that measured itself, read
            // through the render prop `HozoContainerQuery` puts in the way.
            Condition::Container { name, at_least, value } => {
                match container_guard(name, *at_least, value) {
                    Some(guard) => conditional_parts.extend(guarded(&format!("{guard} && "))),
                    None => diagnostics.push(unwired_variant(
                        node,
                        &format!(
                            "`{value}` is not a pixel width, and React Native has nothing to resolve it against -- no root font size for `rem`. Write the threshold in `px`, or use one of Tailwind's container sizes. On Web the same class works.",
                        ),
                        Severity::Error,
                    )),
                }
            }
            // A subtree marker that survived the partition above, which
            // means it is wrapped in something -- `not-*:` and the like.
            // Handing a style down is the answer to `*:`; there is no
            // answer to the negation of one, because the set it names is
            // "everything that is not a child of this", which React Native
            // has no way to enumerate.
            Condition::Subtree { .. } => diagnostics.push(unwired_variant(
                node,
                "`*:`/`**:` is handed to this element's children at build time, and this one is wrapped in a variant that cannot be. On Web the same class works from the selector.",
                Severity::Error,
            )),
            Condition::Peer(_) => diagnostics.push(unwired_variant(
                node,
                "`peer-…:` has no React Native equivalent. A sibling relationship is a selector, \
                 and there are none here -- a parent can hand its state down through context, and \
                 a sibling has nowhere to hand it. On Web the same class works.",
                Severity::Error,
            )),
            Condition::Enabled => match &node.props.disabled {
                Some(disabled) => {
                    let guard = render_condition_expr(source, disabled);
                    conditional_parts.extend(guarded(&format!("!({guard}) && ")));
                }
                // An element with no `disabled` prop cannot become
                // disabled, so `enabled:` on it is simply always true --
                // unlike `disabled:`, where nothing driving it means the
                // style had nowhere to go.
                None => base_parts.extend(parts.clone()),
            },
            Condition::Aria(state) => {
                match aria_state_guard(node, source, state) {
                    Some(guard) => conditional_parts.extend(guarded(&format!("({guard}) && "))),
                    // Web needs nothing from the props here -- the selector
                    // matches whatever the element carries. Native has no
                    // selector engine, so the state has to be readable as
                    // an expression or the style has nowhere to go.
                    None => diagnostics.push(unwired_variant(
                        node,
                        &format!(
                            "`aria-{state}:` needs an `accessibilityState` on the same element to drive it on Native, and this one has none. On Web the same class works from the attribute alone."
                        ),
                        Severity::Error,
                    )),
                }
            }
            Condition::Pressed => pressed_parts.extend(guarded("pressed && ")),
            Condition::Expr(expr) => {
                let guard = render_condition_expr(source, expr);
                conditional_parts.extend(guarded(&format!("({guard}) && ")));
            }
            // Each of these produced a style object that the rendered JSX
            // never referenced -- computed, then dropped, with nothing
            // said. That silence is the bug being fixed here; the styles
            // still don't apply, but no longer without saying so.
            Condition::Hover | Condition::Focus
                if interaction_context || matches!(node.primitive, Primitive::Pressable | Primitive::Button) =>
            {
                let guard = match condition {
                    Condition::Hover => "hovered && ",
                    _ => "focused && ",
                };
                pressed_parts.extend(guarded(guard));
            }
            Condition::Hover | Condition::Focus => diagnostics.push(unwired_variant(
                node,
                "`hover:` and `focus:` are wired only on Pressable and Button on React Native, \
                 because those elements own the interaction events that drive the state.",
                Severity::Error,
            )),
            Condition::FocusVisible
                if interaction_context || matches!(node.primitive, Primitive::Pressable | Primitive::Button) =>
            {
                pressed_parts.extend(guarded("focusVisible && "));
            }
            Condition::FocusVisible => diagnostics.push(unwired_variant(
                node,
                "`focus-visible:` is wired only on Pressable and Button on React Native, because those elements own the pointer and keyboard events used to infer modality.",
                Severity::Error,
            )),
            // Ambient conditions: one app-wide value, observed through a
            // hook so this component re-renders when it changes. The hook
            // declaration goes to the caller rather than into the JSX --
            // see `LowerOutput::prelude` for why inlining it is unsafe.
            // `max-…:` is the same question read from the other side, so
            // it is the same hook negated rather than a second one.
            Condition::Width { at_least, value } => match width_threshold_px(value) {
                Some(px) => {
                    let hook = RuntimeHook::WidthAtLeast(px);
                    let guard = if *at_least {
                        format!("{} && ", hook.binding())
                    } else {
                        format!("!{} && ", hook.binding())
                    };
                    conditional_parts.extend(guarded(&guard));
                    runtime.hooks.push(hook);
                }
                None => diagnostics.push(unwired_variant(
                    node,
                    &format!(
                        "`{value}` is not a pixel width, and React Native has nothing to resolve it against -- no root font size for `rem`, and a viewport unit compared against the viewport answers itself. Write the threshold in `px`. On Web the same class works.",
                    ),
                    Severity::Error,
                )),
            },
            Condition::Responsive(bp) => {
                let hook = RuntimeHook::Breakpoint(*bp);
                conditional_parts.extend(guarded(&format!("{} && ", hook.binding())));
                runtime.hooks.push(hook);
            }
            Condition::Dark => {
                let hook = RuntimeHook::Dark;
                conditional_parts.extend(guarded(&format!("{} && ", hook.binding())));
                runtime.hooks.push(hook);
            }
            // Resolved at build time rather than needing a selector
            // engine. Both decided answers are exact -- the same thing
            // `:first-child` would do on Web -- so neither reports
            // anything; only an undecidable position does.
            Condition::FirstChild | Condition::LastChild | Condition::Structural(_) => {
                let (end, known) = match condition {
                    Condition::FirstChild => ("first".to_string(), position.first),
                    Condition::LastChild => ("last".to_string(), position.last),
                    Condition::Structural(structural) => (
                        structural.variant_name(),
                        structural_holds(&structural, node, position),
                    ),
                    _ => unreachable!("matched above"),
                };
                match known {
                    Some(true) => conditional_parts.extend(guarded("")),
                    // The pseudo-class wouldn't match here either, so
                    // dropping the style is the correct outcome, not a gap.
                    Some(false) => {}
                    None => diagnostics.push(unwired_variant(
                        node,
                        &format!(
                            "`{end}:` can only be resolved when the compiler can see this \
                             element's position among its siblings, and here it can't -- it's \
                             either the root of a component (whose position its caller decides) \
                             or a sibling of something Hozo doesn't model, such as a custom \
                             component or a `{{...}}` expression."
                        ),
                        Severity::Error,
                    )),
                }
            }
            // Refused rather than shelved. React Native has no selector
            // engine at all -- not a missing feature but a different
            // architecture, since styles there are objects handed to
            // elements rather than rules matched against a tree. `[&>*]`
            // asks which elements match a pattern, and there is nothing on
            // that side of the compiler that could ever answer it.
            //
            // An error, not a warning: the author wrote a selector, and a
            // build that quietly rendered without it would look like it
            // worked.
            Condition::ArbitrarySelector(selector) => diagnostics.push(Diagnostic {
                code: DiagnosticCode::WebOnlyPropertyOnNative,
                severity: Severity::Error,
                message: format!(
                    "`[{selector}]:` is a CSS selector, and React Native has no selector engine \
                     to match it with -- styles there are objects attached to elements, not \
                     rules matched against a tree. Move the condition into JSX, or apply the \
                     style to the elements directly."
                ),
                span: node.span,
            }),
            // `@media` and `@supports` both ask the browser a question
            // about itself. The nearest Native equivalents are real but
            // unrelated -- `useWindowDimensions` for width, `Platform` for
            // capability -- and neither is a translation of the at-rule
            // the author wrote.
            Condition::ArbitraryAtRule(rule) => diagnostics.push(Diagnostic {
                code: DiagnosticCode::WebOnlyPropertyOnNative,
                severity: Severity::Error,
                message: format!(
                    "`[{rule}]:` is a CSS at-rule, which only a browser can evaluate. Hozo's \
                     own breakpoint variants do work on React Native -- they read \
                     `useWindowDimensions` -- so a width query is better written as `md:` than \
                     as a raw `@media`."
                ),
                span: node.span,
            }),
        }
        // No catch-all arm above, deliberately: a new `Condition` variant
        // must fail to compile here rather than quietly joining the set
        // that gets computed and dropped. That is exactly how the eight
        // variants this function now reports went unnoticed.
        if !props.is_empty() {
            style_entries.push((name, props));
        }
    }

    style_array_parts.append(&mut base_parts);
    style_array_parts.append(&mut conditional_parts);
    // `pressed_parts` is appended by the caller, after these, because only
    // there is it known whether the element can carry press state at all.
    // That puts `pressed:` last among the conditions rather than in source
    // order relative to them -- a divergence from Web only when a
    // `pressed:` utility and another conditional set the same property.
}
