//! JSX tree rendering for the React Native backend.
//!
//! Kept as a child module of the backend so rendering can use the lowering
//! helpers without widening their visibility outside this crate.

use super::text::*;
use super::*;

mod authored_style;
mod child_list;
mod class_fallback;
mod class_slots;
mod effects;
mod frames;
mod host;
mod host_props;
mod inheritance;
mod motion_props;
mod passthrough;
mod prepare;
mod progress;
mod refusals;
mod semantic_defaults;
mod spreads;
mod style_attribute;
mod style_props;
mod text_handoff;
mod wrappers;

enum NativeBackdropFilter {
    None,
    Blur(String),
}

fn condition_subtree_report(condition: &Condition) -> SubtreeReport {
    let mut out = SubtreeReport::default();
    fn visit(condition: &Condition, out: &mut SubtreeReport) {
        match condition {
            Condition::FocusWithin => out.focus = true,
            Condition::Has(inner) => match inner.as_ref() {
                Condition::Hover | Condition::Pressed => out.hover = true,
                Condition::Focus | Condition::FocusWithin => out.focus = true,
                Condition::FocusVisible => out.focus_visible = true,
                _ => {}
            },
            Condition::HasSelector(selector) => match selector.trim() {
                ":focus" | "*:focus" | ":focus-within" | "*:focus-within" => out.focus = true,
                ":focus-visible" | "*:focus-visible" => out.focus_visible = true,
                ":hover" | "*:hover" | ":active" | "*:active" => out.hover = true,
                _ => {}
            },
            Condition::Not(inner) => visit(inner, out),
            Condition::All(list) => {
                for item in list {
                    visit(item, out);
                }
            }
            _ => {}
        }
    }
    visit(condition, &mut out);
    out
}

fn has_gap(style: &[StyleDeclaration]) -> bool {
    style.iter().any(|declaration| {
        matches!(
            declaration.property,
            StyleProperty::Gap(_) | StyleProperty::RowGap(_) | StyleProperty::ColumnGap(_)
        )
    })
}

fn has_display_contents(style: &[StyleDeclaration]) -> bool {
    style
        .iter()
        .any(|d| matches!(d.property, StyleProperty::Display(Display::Contents)))
}

fn child_uses_parent_measured(
    child: &Node,
    to_children: &[StyleDeclaration],
    descendants: &[StyleDeclaration],
) -> bool {
    child
        .style
        .iter()
        .chain(to_children.iter())
        .chain(descendants.iter())
        .any(|d| crate::measured::is_parent_measured(&d.property))
}

/// Resolve StyleX's browser feature fallback before any contextual Native
/// lowering looks at the node. Keeping the wrapper until the backend is
/// important for Web's duplicate declarations, but TextInput props, text
/// truncation, SVG paint, transitions, and grid all classify concrete IR
/// variants here and must see the selected candidate rather than a wrapper.
fn resolve_first_that_works(node: &Node) -> Option<Node> {
    node.style
        .iter()
        .any(|declaration| matches!(declaration.property, StyleProperty::FirstThatWorks(_)))
        .then(|| {
            let mut resolved = node.clone();
            for declaration in &mut resolved.style {
                let StyleProperty::FirstThatWorks(candidates) = &declaration.property else {
                    continue;
                };
                if let Some(candidate) = candidates.iter().find(|candidate| {
                    candidate.not_wired_on_native().is_none()
                        && (candidate.unsupported_on_native().is_none()
                            // These are implemented by element wrappers,
                            // not by a React Native StyleSheet value.
                            || matches!(
                                candidate,
                                StyleProperty::Display(Display::Grid | Display::InlineFlex)
                            )
                            // These two are props on TextInput. Resolving
                            // before `caret_props`/`placeholder_props`
                            // lets those contextual adapters see the
                            // concrete colour they already know how to use.
                            || (node.primitive == Primitive::TextInput
                                && matches!(
                                    candidate,
                                    StyleProperty::CaretColor(_)
                                        | StyleProperty::PlaceholderColor(_)
                                )))
                }) {
                    declaration.property = candidate.clone();
                }
            }
            resolved
        })
}

pub(super) fn render_node(
    node: &Node,
    position: SiblingPosition,
    interaction_context: bool,
    ancestor: AncestorContext<'_>,
    peer: PeerContext<'_>,
    cx: &mut NativeRenderContext<'_>,
) -> Rendered {
    let AncestorContext {
        inherited,
        parent_font_size,
        parent_size_opaque,
        in_dynamic_ruby,
        from_ancestor,
        grid_columns,
        grid_rows,
        parent_measured,
        group_ancestor,
        subtree_report,
    } = ancestor;
    let source = cx.source;
    let theme = cx.theme;
    // Decision 013: only a Text no other text host encloses can inherit from
    // outside this file. Read before this element's own children raise it.
    let outermost_text = cx.text_depth == 0;

    let resolved_node = resolve_first_that_works(node);
    let node = resolved_node.as_ref().unwrap_or(node);
    // Every copy of an attribute this element's plan evaluates reads the
    // plan's value instead, for as long as the element renders (#1879).
    let _captured = hozo_ir::attribute_capture::enter(node.root_class_evaluation(), source);
    let base_name = cx.allocator.alloc();
    let mut style_array_parts: Vec<String> = Vec::new();
    // Held separately from `style_array_parts` because they can only be
    // merged once `component` is known (below) -- RN's pressed-render-prop
    // form of `style` only exists on Pressable; on View/Text a function
    // isn't a valid style value at all, so it must not be used there.
    let mut pressed_parts: Vec<String> = Vec::new();

    class_fallback::warn_unresolved(node, source, cx.diagnostics);

    // Some CSS concepts are props on this platform rather than styles, so
    // they're absorbed before the refusal check below -- otherwise the
    // thing that *does* express them would be reported as impossible.
    let truncation = truncation_props(node);
    // `text-balance` and `text-pretty` are a Text prop here, Android's
    // `textBreakStrategy`, the way `truncate` is `numberOfLines`.
    let text_break = text_break_strategy(node);
    // `break-keep` on iOS: `lineBreakStrategyIOS`, for Korean.
    let ios_line_break = crate::text::line_break_strategy_ios(node);
    // Same shape as truncation: a CSS concept React Native keeps on a prop,
    // absorbed before the refusal check so the thing that *does* express it
    // isn't reported as impossible.
    let field_target = crate::conditions::StyleTarget {
        owner_facts: cx.owner_inputs.facts,
        owner_events: cx.owner_inputs.events,
        node,
        position,
        interaction_context: false,
        group_ancestor,
        peers: peer.preceding,
        pattern_slot: None,
        composition: Default::default(),
    };
    let FieldColours {
        placeholder,
        caret,
        selection,
        interactive_callback: field_colors_callback,
        consumed: field_consumed,
    } = resolve_field_colours(node, &field_target, source, theme, cx.runtime);

    // `leading-tight`/`tracking-wide` are relative to the font size, which
    // React Native's equivalents aren't. Resolved here, before the refusal
    // check, so only the ones that genuinely can't be resolved are refused.
    // Field colours travel as props (or `hozoFieldColors` when focus-driven),
    // never as StyleSheet entries. Consume only declarations the prop adapter
    // actually lowered, leaving every other pseudo/style stack visible to the
    // usual diagnostics.
    let field_style: Option<Vec<_>> = field_consumed.iter().any(|&used| used).then(|| {
        node.style
            .iter()
            .enumerate()
            .filter(|(index, _)| !field_consumed[*index])
            .map(|(_, declaration)| declaration.clone())
            .collect()
    });
    let style = lower_inline_flex(fold_font_relative(
        field_style.as_deref().unwrap_or(&node.style),
        inherited,
        theme,
    ));
    let layout = crate::pattern_layout::adapt(node.primitive, "className", style);
    let style = layout.style;
    let style = prepare::motion_safe_skeleton(style, node, from_ancestor.in_skeleton);
    let can_measure_grid_height = !has_display_contents(&style)
        && host::primitive_can_measure_parent(node.primitive)
        && crate::grid::has_definite_grid_height(&style, parent_measured);
    let grid = native_grid(&style, theme, can_measure_grid_height, cx.runtime);
    let grid_item = native_grid_item(&style, grid_columns, grid_rows);
    // The fast Native transition path is deliberately narrow: opacity on
    // Pressable interaction state can stay entirely on the native driver.
    let transition = native_driver_transition(node, &style);
    // Computed here rather than beside its use below, because the loop
    // that follows has to know not to refuse the transition properties it
    // consumes -- they are Web-only on an element with nothing to animate
    // and lowered on one with something.
    let ambient_transition = ambient_transition(node, &style);
    let (has_keyframes, animated_style) = prepare::animation(&style, theme);

    let svg_paint = prepare::svg_paint(node, &style, theme);
    let can_self_measure = !matches!(node.primitive, Primitive::Modal | Primitive::Dialog)
        && !matches!(node.primitive, Primitive::Svg(svg) if svg != hozo_ir::SvgElement::Root);
    let can_measure_space = grid.is_none()
        && !has_display_contents(&style)
        && host::primitive_can_measure_parent(node.primitive);
    let backdrop_filter = refusals::report_refused(
        &style,
        refusals::Lowered {
            svg_paint: !svg_paint.is_empty(),
            grid: grid.is_some(),
            grid_item: grid_item.is_some(),
            transition: transition.is_some() || ambient_transition.is_some(),
            truncation: truncation.is_some(),
            text_break: text_break.is_some(),
            ios_line_break: ios_line_break.is_some(),
            keyframes: has_keyframes,
            self_measured: can_self_measure,
            parent_measured,
            parent_measured_space: can_measure_space,
        },
        node,
        theme,
        cx.diagnostics,
    );

    let (component, extra_props) = host::base_component(
        node,
        in_dynamic_ruby,
        ambient_transition.is_some(),
        animated_style,
        cx,
    );

    // Only `Text` can hold text on this platform -- a raw string inside a
    // View or Pressable is a runtime crash there ("Text strings must be
    // rendered within a <Text> component"), while the same source is fine
    // on Web. So one is inserted. Its styles have to move with it: React
    // Native's Text inherits from an enclosing Text but *not* from a View,
    // so leaving `fontSize` on the parent would silently render at the
    // default size instead.
    // A `Text` is where inheritance stops: React Native takes over from
    // here, so its descendants need nothing from the compiler. What it
    // Semantic typography default styles on Native:
    // Whether this element answers its own ratio at runtime, and whether
    // it has to publish a size for one below it that does.
    let relative_at_runtime = if parent_size_opaque {
        size_ratio(node, theme)
    } else {
        None
    };
    let opaque_here = size_is_opaque(node);
    let publishes_size =
        opaque_here && renders_text(component) && has_relative_descendant(node, theme);
    let inheritance::Inheritance {
        style,
        to_children,
        descendants,
    } = inheritance::inherit(node, component, style, ancestor, cx);

    let text_handoff::TextHandoff {
        text_declarations,
        own_declarations,
        current_font_size,
        descend,
        forwards_label,
        unified_scope,
    } = text_handoff::hand_down_text(node, component, &style, inherited, parent_font_size, cx);

    let (child_declarations, own_declarations, mixing) = effects::own_declarations(
        own_declarations,
        node,
        component,
        grid.is_some(),
        grid_item.is_some(),
    );

    let mut frames = crate::conditions::AnimatedFrames::default();
    let animates = component == "HozoAnimated";
    let pattern_style_prop = crate::pattern::interaction_style_prop(node.primitive, "className")
        .or_else(|| (node.primitive == Primitive::TextInput).then_some("hozoStyle"));
    let own_entry_start = cx.style_entries.len();
    let target = crate::conditions::StyleTarget {
        owner_facts: cx.owner_inputs.facts,
        owner_events: cx.owner_inputs.events,
        node,
        position,
        // A View joins its owner's context only for a `group-*:`. Once it
        // has, a plain `hover:` beside it reads that owner too, as on Text;
        // without one it stays refused rather than borrowing a state.
        interaction_context: interaction_context
            && (renders_text(component)
                || (component == "View"
                    && own_declarations
                        .iter()
                        .any(|declaration| interaction::uses_group_state(&declaration.condition))))
            && pattern_style_prop.is_none(),
        group_ancestor,
        peers: peer.preceding,
        pattern_slot: Some("className"),
        composition: hozo_ir::OwnerSlotComposition {
            filters: mixing.project_filter_slots,
            shadows: mixing.compose_shadows,
            gradients: mixing.compose_gradients,
        },
    };
    let is_absolute = own_declarations
        .iter()
        .rev()
        .find_map(|d| match d.property {
            StyleProperty::Position(pos) if d.condition == Condition::Always => Some(pos),
            _ => None,
        })
        == Some(hozo_ir::Position::Absolute);
    let mut self_style_parts: Vec<String> = Vec::new();
    let state_start = build_style_entries_with_measured(
        // RN View cannot inherit these fields. Experimental ReferenceView
        // consumes them before rendering its host, including opaque labels.
        // Do not change normal output until RFC 006's rollout gates pass.
        if cx.text_reference && component == "View" {
            &style
        } else {
            &own_declarations
        },
        &base_name,
        &target,
        &mut style_array_parts,
        &mut pressed_parts,
        can_self_measure.then_some(&mut self_style_parts),
        MeasuredOptions {
            allow_self_measured: can_self_measure,
            allow_parent_measured: parent_measured,
            parent_inset_absolute: is_absolute,
        },
        animates.then_some(&mut frames),
        cx,
    );
    let uses_parent_size_query = parent_measured
        && style_array_parts
            .iter()
            .chain(pressed_parts.iter())
            .any(|part| part.contains("__hozoParent"));
    // Backdrop and label entries below have their own style arrays.
    let own_entry_end = cx.style_entries.len();
    let mut backdrop_parts = Vec::new();
    if !layout.backdrop.is_empty() {
        build_style_entries(
            &layout.backdrop,
            &format!("{base_name}_backdrop"),
            &target,
            &mut backdrop_parts,
            &mut Vec::new(),
            None,
            cx,
        );
    }
    let label_style = text_handoff::label_style(
        forwards_label,
        &text_declarations,
        &base_name,
        node,
        position,
        group_ancestor,
        peer.preceding,
        cx,
    );
    let (effects, deferred_effects) = effects::plan(
        mixing,
        component,
        node,
        &own_declarations,
        own_entry_start,
        own_entry_end,
        cx,
    );
    let starting_parts = frames.starting;
    let exit_parts = frames.exit;
    frames::refuse_unmovable_frames(
        node,
        &own_declarations,
        &starting_parts,
        &exit_parts,
        theme,
        cx.diagnostics,
    );

    let (runtime_states, pattern_classes) = class_fallback::class_fallback(
        node,
        component,
        !style_array_parts.is_empty() || !pressed_parts.is_empty(),
        deferred_effects,
        &mut style_array_parts,
        state_start,
        cx,
    );

    let reports_subtree_pressable = interaction::owns_events(node)
        && (subtree_report.focus || subtree_report.hover || subtree_report.focus_visible);
    let reports_subtree_input = node.primitive == Primitive::TextInput
        && (subtree_report.focus || subtree_report.focus_visible);
    let host::InteractionNeeds {
        needs_focus_visible,
        needs_hover_or_focus,
        needs_interaction_host,
        link_interaction,
    } = host::interaction_needs(
        node,
        component,
        &own_declarations,
        &text_declarations,
        runtime_states,
        transition.is_some() || label_style.is_some(),
        peer.publish_id.is_some() || reports_subtree_pressable,
        peer.publish_focus_visible
            || (interaction::owns_events(node) && subtree_report.focus_visible),
        cx.runtime,
    );
    let host::ContainerUse {
        container_name,
        declares_container,
        uses_container_query,
        uses_container_size_query,
    } = host::container_use(node, &own_declarations, &descend);
    let renders_backdrop_filter = matches!(backdrop_filter, Some(NativeBackdropFilter::Blur(_)))
        && component == "View"
        && !declares_container;
    if matches!(backdrop_filter, Some(NativeBackdropFilter::Blur(_))) && !renders_backdrop_filter {
        cx.diagnostics.push(unwired_variant(
            node,
            "`backdropFilter` needs an ordinary View on Native; it cannot replace an interactive, text, animated, or container-query component.",
            Severity::Error,
        ));
    }
    let rendered_component = host::rendered_component(
        host::HostChoice {
            component,
            renders_backdrop_filter,
            has_pressed_parts: !pressed_parts.is_empty(),
            runtime_states,
            needs_interaction_host,
            interaction_context,
            relative_at_runtime: relative_at_runtime.is_some(),
            publishes_size,
            publishes_peer_state: peer.publish_id.is_some() || reports_subtree_input,
            has_field_colors_callback: field_colors_callback.is_some(),
        },
        node,
        cx,
    );
    if !self_style_parts.is_empty() && !host::supports_layout_measurement_host(rendered_component) {
        cx.diagnostics.push(unwired_variant(
            node,
            &format!(
                "self-measured `%`-mixed `calc()` needs a single layout-reporting host on Native; \
                 `{rendered_component}` cannot supply `onLayout` through this adapter."
            ),
            Severity::Error,
        ));
        self_style_parts.clear();
    }
    let measures_host =
        host::measures_host(declares_container, rendered_component, node, cx.diagnostics);
    let has_parent_measured_child = node.children.iter().any(|child| {
        matches!(
            child,
            hozo_ir::Child::Node(child_node)
                if child_uses_parent_measured(child_node, &to_children, &descendants)
        )
    });
    let has_parent_measured_space = grid.is_none()
        && child_declarations
            .iter()
            .any(|d| crate::measured::is_parent_measured_space(&d.property));
    let can_measure_parent = grid.is_none()
        && !has_display_contents(&own_declarations)
        && host::supports_parent_measurement_host(rendered_component);
    if has_parent_measured_space && !can_measure_parent {
        cx.diagnostics.push(unwired_variant(
            node,
            &format!(
                "`space-*` with `%`-mixed `calc()` needs a single layout-reporting host on Native; \
                 `{rendered_component}` cannot supply `onLayout` through this adapter."
            ),
            Severity::Error,
        ));
    }
    let measures_parent =
        can_measure_parent && (has_parent_measured_child || has_parent_measured_space);
    let measures_grid_height = grid.as_ref().is_some_and(|grid| grid.uses_measured_height)
        && !has_display_contents(&own_declarations)
        && host::supports_parent_measurement_host(rendered_component);
    // An intervening control owns its own interaction. Neither an enhanced
    // nor a plain link may borrow an outer button's hover/focus context.
    let owns_pressable_interaction = rendered_component == "HozoPressable";
    let child_interaction_context = owns_pressable_interaction
        || link_interaction
        || (interaction_context
            && !matches!(
                node.primitive,
                Primitive::Pressable | Primitive::Button | Primitive::Link
            ));
    let owner_view_callback = node.primitive == Primitive::View
        && (!cx.owner_inputs.events.is_empty() || !cx.owner_inputs.facts.is_empty());
    let needs_pressed_fn = (matches!(
        rendered_component,
        "Pressable" | "HozoPressable" | "HozoText" | "HozoInteractionView" | "HozoLink"
    ) || pattern_style_prop.is_some()
        || owner_view_callback)
        && (!pressed_parts.is_empty() || runtime_states);
    if needs_pressed_fn {
        style_array_parts.extend(pressed_parts);
    } else if !pressed_parts.is_empty() {
        // `pressed` comes from Pressable's render-prop `style` form, which
        // only Pressable has. On a View or Text a function isn't a valid
        // `style` value at all, so there's nowhere for these to go.
        cx.diagnostics.push(unwired_variant(
            node,
            &format!(
                "`pressed:` needs an element that tracks press state, and `{rendered_component}` doesn't. \
                 Move it to a Pressable or Button."
            ),
            Severity::Error,
        ));
    }

    let mut props_text = host_props::leading_props(
        node,
        host_props::Leading {
            scroll_prop: layout.scroll_prop,
            backdrop_parts: &backdrop_parts,
            backdrop_blur: layout.backdrop_blur.as_ref(),
            backdrop_filter: backdrop_filter.as_ref(),
            link_interaction,
        },
        rendered_component,
        source,
    );

    // An authored `style` joins the array instead of becoming a second
    // `style` attribute.
    //
    // It used to be re-emitted verbatim with everything else Hozo does not
    // model, which put two `style` props on one element:
    //
    //     <Text style={hozoStyles.hozo0} style={{ fontSize: 20 }}>
    //
    // JSX resolves duplicates last-wins, so *every compiled class on that
    // element was dropped* -- silently, and only on the elements where
    // someone reached for an inline style. A spread in the same position
    // already had a diagnostic for exactly this; a named `style` had
    // nothing. In the array it composes the way React Native composes
    // styles, and the author's still wins, because it is still last.
    // Gap's generic Yoga gutter cannot override a compiled axis gutter.
    // Resolve the author's own contribution before composing it with those
    // class styles. Known unrelated static classes keep their direct path;
    // an opaque class may carry gap, so it needs the same bounded boundary.
    let project_authored_gap = !node.class_name_fallback.is_empty() || has_gap(&node.style);
    let mut project_spread_gap = project_authored_gap;
    let authored_style =
        authored_style::authored_style(node, project_authored_gap, source, cx.runtime);
    // Pattern callbacks are a private generated-code ABI, not an authored
    // style function. Keep the caller's style separate and last, so a state
    // class cannot override it or put a function inside an RN style array.
    // Style attributes a spread could replace are held here and composed
    // with the spreads where those are emitted (`spread_style`).
    let mut held = crate::spread_style::HeldStyles::new(&node.props.passthrough);
    style_array_parts = effects::compose_mixed(style_array_parts, &effects, cx.runtime);
    style_array_parts = authored_style::compose(
        style_array_parts,
        authored_style,
        (needs_pressed_fn || pattern_classes.is_some()) && pattern_style_prop.is_some(),
        node,
        &mut held,
        &mut props_text,
        cx.runtime,
    );

    style_array_parts = effects::compose_unmixed(style_array_parts, &effects, cx.runtime);
    if component == "Text"
        && !node.class_name_fallback.is_empty()
        && !node
            .props
            .passthrough
            .iter()
            .any(|prop| prop.is_spread && !prop.spread_excludes.iter().any(|key| key == "style"))
    {
        let defaults = effects
            .metric_defaults
            .as_ref()
            .filter(|(defaults, _)| !defaults.is_empty())
            .map_or_else(
                || "undefined".to_string(),
                |(defaults, _)| format!("[{defaults}]"),
            );
        let styles = match style_array_parts.as_slice() {
            [single] => single.clone(),
            parts => format!("[{}]", parts.join(", ")),
        };
        cx.runtime.need_component("hozoRelativeTextMetricStyles");
        style_array_parts = vec![format!(
            "hozoRelativeTextMetricStyles({styles}, hozoClasses.relativeTextMetrics, {defaults}, hozoClasses.fontDefaults)",
        )];
    }

    style_attribute::write_style_attribute(
        style_attribute::StyleAttribute {
            pattern_classes: pattern_classes.as_ref(),
            needs_pressed_fn,
            owner_view_callback,
            needs_focus_visible,
            needs_hover_or_focus,
            rendered_component,
            pattern_style_prop,
        },
        &style_array_parts,
        node,
        &base_name,
        &mut held,
        &mut props_text,
        cx,
    );
    motion_props::write_motion_props(
        transition,
        ambient_transition,
        &starting_parts,
        &exit_parts,
        &mut props_text,
    );
    // The ratio, for the component that resolves it.
    if let Some(ratio) = relative_at_runtime {
        props_text.push_str(&format!(" hozoRelative={{{ratio}}}"));
    }
    if needs_focus_visible && (owns_pressable_interaction || link_interaction) {
        props_text.push_str(" hozoFocusVisible");
    }
    if let Some(peer_id) = peer.publish_id.filter(|_| {
        owns_pressable_interaction || link_interaction || rendered_component == "HozoTextInput"
    }) {
        props_text.push_str(&format!(" hozoPeerId={{{peer_id}}}"));
    }
    if reports_subtree_input && rendered_component == "HozoTextInput" {
        props_text.push_str(" hozoReportSubtree");
    }
    if let Some(parts) = label_style
        .as_ref()
        .filter(|_| owns_pressable_interaction || link_interaction)
    {
        props_text.push_str(&format!(
            " hozoTextStyle={{({{ pressed, hovered, focused, focusVisible }}) => [{}]}}",
            parts.join(", ")
        ));
    }
    style_props::write_style_props(
        node,
        style_props::StyleProps {
            extra_props,
            svg_paint,
            placeholder,
            caret,
            selection,
            field_colors_callback,
            text_break,
            ios_line_break,
            truncation,
        },
        &mut props_text,
        cx,
    );
    host_props::write_host_props(
        node,
        rendered_component,
        measures_host,
        &container_name,
        &mut props_text,
        cx,
    );
    let child_group_ancestor = if node.carried_classes.iter().any(|class| class == "group") {
        Some(GroupAncestor { node, position })
    } else {
        group_ancestor
    };
    project_spread_gap |= class_slots::class_slot_props(
        node,
        position,
        group_ancestor,
        peer.preceding,
        &mut held,
        &mut props_text,
        cx,
    );
    let mut own_subtree = SubtreeReport {
        focus: props_text.contains("__hozoSubtree.focused")
            || self_style_parts
                .iter()
                .any(|part| part.contains("__hozoSubtree.focused")),
        hover: props_text.contains("__hozoSubtree.hovered")
            || props_text.contains("__hozoSubtree.pressed")
            || self_style_parts.iter().any(|part| {
                part.contains("__hozoSubtree.hovered") || part.contains("__hozoSubtree.pressed")
            }),
        focus_visible: props_text.contains("__hozoSubtree.focusVisible")
            || self_style_parts
                .iter()
                .any(|part| part.contains("__hozoSubtree.focusVisible")),
    };
    let has_raw_text = node
        .children
        .iter()
        .any(|child| matches!(child, hozo_ir::Child::Text(_)));
    for declaration in child_declarations
        .iter()
        .chain(descend.iter().filter(|_| has_raw_text))
    {
        let report = condition_subtree_report(&declaration.condition);
        own_subtree.focus |= report.focus;
        own_subtree.hover |= report.hover;
        own_subtree.focus_visible |= report.focus_visible;
    }
    let uses_subtree_scope = own_subtree.focus || own_subtree.hover || own_subtree.focus_visible;
    let child_subtree_report = SubtreeReport {
        focus: subtree_report.focus || own_subtree.focus,
        hover: subtree_report.hover || own_subtree.hover,
        focus_visible: subtree_report.focus_visible || own_subtree.focus_visible,
    };
    // Everything Hozo doesn't model, re-emitted verbatim and last so JSX's
    // last-wins duplicate resolution keeps matching the source's own
    // ordering semantics.
    let rendered = passthrough::render_passthrough(
        node,
        &descend,
        child_interaction_context,
        child_group_ancestor,
        child_subtree_report,
        cx,
    );
    let prop_copies = spreads::append_passthrough(
        node,
        rendered,
        &held,
        project_spread_gap,
        &mut props_text,
        cx,
    );

    crate::owner_style::validate_props(cx, &base_name, &props_text);

    // Everything below a text host inherits from it natively (decision 013).
    let encloses_text = is_text_primitive(node.primitive) || renders_text(rendered_component);
    if encloses_text {
        cx.text_depth += 1;
    }
    let for_children = AncestorContext {
        inherited: &descend,
        parent_font_size: current_font_size,
        parent_size_opaque: parent_size_opaque || opaque_here,
        in_dynamic_ruby: node.primitive == Primitive::Ruby && component == "HozoRuby",
        from_ancestor: FromAncestor {
            direct: &to_children,
            all: &descendants,
            in_skeleton: from_ancestor.in_skeleton || node.primitive == Primitive::Skeleton,
        },
        grid_columns: grid.as_ref().and_then(|grid| grid.track_count),
        grid_rows: grid.as_ref().and_then(|grid| grid.row_track_count),
        parent_measured: measures_parent,
        group_ancestor: child_group_ancestor,
        subtree_report: child_subtree_report,
    };
    let (inner, needs_peer_scope) = child_list::render_child_list(
        node,
        component,
        for_children,
        child_interaction_context,
        &base_name,
        position,
        group_ancestor,
        peer.preceding,
        cx,
    );

    if encloses_text {
        cx.text_depth -= 1;
    }

    let inner = wrappers::place_children(
        inner,
        grid,
        &child_declarations,
        &base_name,
        node,
        position,
        measures_parent,
        group_ancestor,
        peer.preceding,
        cx,
    );

    let inner = wrappers::peer_scope(inner, needs_peer_scope, cx);
    let inner = wrappers::subtree_boundary(inner, uses_subtree_scope, cx);

    let inner = wrappers::inherited_scope(
        inner,
        &unified_scope,
        &base_name,
        node,
        position,
        interaction_context,
        group_ancestor,
        peer.preceding,
        cx,
    );

    let tag = wrappers::host_tag(
        rendered_component,
        measures_host,
        measures_parent || measures_grid_height,
        &self_style_parts,
        outermost_text,
        inherited,
        node,
        &mut props_text,
        cx,
    );
    let raw_text_reads_peer = node
        .children
        .iter()
        .any(|child| matches!(child, hozo_ir::Child::Text(_)))
        && descend.iter().any(|declaration| {
            condition_contains(&declaration.condition, |c| {
                peer_interaction_state(c).is_some()
            })
        });
    let child_decls_read_peer = child_declarations.iter().any(|declaration| {
        condition_contains(&declaration.condition, |c| {
            peer_interaction_state(c).is_some()
        })
    });
    let queried_peer_ids: Vec<usize> = peer
        .preceding
        .iter()
        .filter_map(|p| p.interactive_id)
        .filter(|id| {
            raw_text_reads_peer
                || child_decls_read_peer
                || props_text.contains(&format!("__hozoPeer[{id}]"))
        })
        .collect();
    let mut rendered = if component == "TextInput"
        || rendered_component == "HozoTextInput"
        || component == "Image"
    {
        // These hosts discard children, including any evidence computed while
        // rendering them. The output, not the traversal, defines a copy.
        let mut rendered = Rendered::new(cx.source_evidence);
        rendered.text = format!("<{tag}{props_text} />");
        rendered
    } else {
        let text = format!("<{tag}{props_text}>{}</{tag}>", inner.text);
        inner.wrap(text, 3 + tag.len())
    };
    if let Some(mut copies) = prop_copies {
        for copy in &mut copies {
            copy.emitted_start += 1 + tag.len();
            copy.emitted_end += 1 + tag.len();
        }
        if let Some(children) = rendered.copies.take() {
            copies.extend(children);
        }
        rendered.copies = Some(copies);
    }
    let uses_container_query = uses_container_query || props_text.contains("__hozoCq[");
    let rendered = wrappers::subtree_scope(rendered, uses_subtree_scope, cx);
    let rendered = wrappers::peer_query(rendered, &queried_peer_ids, cx);
    let rendered = wrappers::parent_size_query(rendered, uses_parent_size_query, cx);
    let rendered = wrappers::container_query(rendered, uses_container_query, cx);
    let rendered = wrappers::container_size_query(rendered, uses_container_size_query, cx);
    let rendered = wrappers::grid_item(rendered, grid_item, cx);
    if let Some(evaluation) = node.root_class_evaluation() {
        let mut rendered = rendered;
        // Written in source order already: no plan needed (#1879).
        if hozo_ir::attribute_capture::unplan(
            evaluation,
            source,
            &mut rendered.text,
            rendered.copies.as_mut(),
            hozo_parser::plan_reads_in_order,
        ) {
            return rendered;
        }
        rendered.text = evaluation.wrap_subtree(source, &rendered.text);
        rendered.forget_scope();
        rendered
    } else {
        rendered
    }
}

/// Whether `component` is a React Native `Text` underneath, so text styles
/// stay on it rather than moving to an inserted `Text`. `HozoBadge` is one:
/// it draws its count rather than its children, so a colour moved inside
/// would be on nothing. `HozoChip` is the same for another reason: it puts
/// its label in a `Text` of its own, and names its remove button from a
/// string label, so its children stay as written and its text styles go to
/// it to hand on. `HozoAvatar` draws its initials in a `Text` of its own in
/// the same way, `HozoPagination` its page numbers and `HozoStepper` its
/// step labels. A `HozoTableCell` wraps its own content too, because a cell
/// is nearly always written `{row.price}` -- an expression the compiler
/// cannot hand a text style to -- and because it reads a string cell's text
/// to name it for a reader.
fn renders_text(component: &str) -> bool {
    matches!(
        component,
        "Text"
            | "HozoBadge"
            | "HozoChip"
            | "HozoAvatar"
            | "HozoPagination"
            | "HozoStepper"
            | "HozoOtpInput"
            | "HozoCommandPalette"
            | "HozoCombobox"
            | "HozoListbox"
            | "HozoMenu"
            | "HozoTableCaption"
            | "HozoTableCell"
    )
}

/// `disabled:` and `enabled:` on a declaration handed to a child, rewritten
/// to the expression that drives them here. Left alone when this element
/// has no `disabled` prop: its own declaration already says so.
fn bound_to_disabled(
    declaration: &StyleDeclaration,
    disabled: Option<&ConditionExpr>,
) -> StyleDeclaration {
    let condition = match (&declaration.condition, disabled) {
        (Condition::Disabled, Some(expr)) => Condition::Expr(expr.clone()),
        (Condition::Enabled, Some(expr)) => {
            Condition::Expr(ConditionExpr::Not(Box::new(expr.clone())))
        }
        (condition, _) => condition.clone(),
    };
    StyleDeclaration {
        source: declaration.source,
        property: declaration.property.clone(),
        condition,
    }
}
