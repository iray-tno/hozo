//! JSX tree rendering for the React Native backend.
//!
//! Kept as a child module of the backend so rendering can use the lowering
//! helpers without widening their visibility outside this crate.

use super::text::*;
use super::*;

mod authored_style;
mod child_list;
mod class_slots;
mod effects;
mod frames;
mod host;
mod host_props;
mod motion_props;
mod passthrough;
mod progress;
mod refusals;
mod semantic_defaults;
mod spreads;
mod style_attribute;
mod style_props;
mod text_handoff;

enum NativeBackdropFilter {
    None,
    Blur(String),
}

fn has_gap(style: &[StyleDeclaration]) -> bool {
    style.iter().any(|declaration| {
        matches!(
            declaration.property,
            StyleProperty::Gap(_) | StyleProperty::RowGap(_) | StyleProperty::ColumnGap(_)
        )
    })
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

    // Web concatenates an unresolvable `className` back on and lets the
    // browser's CSS engine match it. React Native has no className and no
    // CSS engine, so the string is handed to the generated resolver
    // instead (see `render_candidate_module`), which looks each class up in
    // the project-wide candidate map. Warning rather than error: the styles
    // do arrive for supported candidates scanned somewhere in the project.
    // Registered patterns resolve with their actual owner's state; ordinary
    // primitives keep their existing callback/prop state path below.
    for expr_ref in &node.class_name_fallback {
        let code = hozo_parser::class_fallback_code(&source_text(source, *expr_ref), "className");
        let message = if crate::pattern::interaction_slot(node.primitive, "className").is_some() {
            "`className` can't be resolved at build time. Its pattern slot resolves it on device \
             from the project-wide candidate map with that owner's available state. \
             Use a static string for build-time validation; runtime condition support remains limited."
                .to_string()
        } else {
            format!(
                "`{}` can't be resolved at build time, so it's resolved on device from the \
                 project-wide candidate map. Conditional utilities (`hover:`, `md:`, `pressed:`) \
                 can't be carried that way and will warn at runtime -- write those as a static \
                 className so they compile to a real style variant.",
                source_text(source, *expr_ref)
            )
        };
        cx.diagnostics.push(Diagnostic {
            code,
            severity: Severity::Warning,
            message: message + hozo_parser::class_fallback_note(code),
            span: node.span,
        });
    }

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
    let placeholder = placeholder_props(node, theme, cx.runtime);
    // The caret colour is another TextInput prop rather than a style. Kept
    // separate from placeholder because React Native names the two props
    // independently and either utility may appear alone.
    let caret = caret_props(node, theme, cx.runtime);
    // The selection highlight is a third TextInput colour prop.
    let selection = selection_props(node, theme, cx.runtime);

    // `leading-tight`/`tracking-wide` are relative to the font size, which
    // React Native's equivalents aren't. Resolved here, before the refusal
    // check, so only the ones that genuinely can't be resolved are refused.
    // A placeholder colour travels as a prop, never as the field's own text
    // colour or a pseudo-element StyleSheet entry. Consume only declarations
    // the prop adapter actually handles, leaving every other pseudo/style
    // stack visible to the usual diagnostics.
    let field_style: Option<Vec<_>> = (placeholder.is_some() || selection.is_some()).then(|| {
        node.style
            .iter()
            .filter(|declaration| {
                (placeholder.is_none() || placeholder_colour(declaration).is_none())
                    && (selection.is_none() || selection_colour(declaration).is_none())
            })
            .cloned()
            .collect()
    });
    let style = lower_inline_flex(fold_font_relative(
        field_style.as_deref().unwrap_or(&node.style),
        inherited,
    ));
    let layout = crate::pattern_layout::adapt(node.primitive, "className", style);
    let style = layout.style;
    // A skeleton's animation runs only when motion is allowed, whatever the
    // class said: `animate-pulse` on one is read as
    // `motion-safe:animate-pulse` (decision 007, section 5). The Web half is
    // a base CSS rule; here it is the same guard a written `motion-safe:`
    // gets. The Web rule covers the skeleton's descendants too, so this
    // does.
    let style = if node.primitive == Primitive::Skeleton || from_ancestor.in_skeleton {
        style
            .into_iter()
            .map(|declaration| match declaration.property {
                // Already said, so not said twice.
                _ if condition_contains(&declaration.condition, |condition| {
                    matches!(
                        condition,
                        Condition::Environment(hozo_ir::Environment::MotionSafe)
                    )
                }) =>
                {
                    declaration
                }
                StyleProperty::Animation(_)
                | StyleProperty::AnimationName(_)
                | StyleProperty::ThemeAnimation(_) => StyleDeclaration {
                    condition: Condition::all(vec![
                        Condition::Environment(hozo_ir::Environment::MotionSafe),
                        declaration.condition.clone(),
                    ]),
                    ..declaration
                },
                _ => declaration,
            })
            .collect()
    } else {
        style
    };
    let grid = native_grid(&style, theme, cx.runtime);
    let grid_item = native_grid_item(&style, grid_columns, grid_rows);
    // The fast Native transition path is deliberately narrow: opacity on
    // Pressable interaction state can stay entirely on the native driver.
    let transition = native_driver_transition(node, &style);
    // Computed here rather than beside its use below, because the loop
    // that follows has to know not to refuse the transition properties it
    // consumes -- they are Web-only on an element with nothing to animate
    // and lowered on one with something.
    let ambient_transition = ambient_transition(node, &style);
    // A keyframe animation's `animation-*` longhands are its timing, read
    // into `useHozoKeyframes` -- Web-only on an element with no keyframes
    // and lowered on one with them, as the transition ones above are.
    let has_keyframes = style.iter().any(|declaration| match &declaration.property {
        StyleProperty::AnimationName(_) => true,
        // Only one the theme can run: an unresolved name renders nothing
        // animated, so the element stays what it was.
        StyleProperty::ThemeAnimation(name) => theme
            .animation(name)
            .is_some_and(|animation| animation.keyframes.is_some()),
        _ => false,
    });
    // A style holding `Animated` values only moves on an `Animated`
    // component: a plain `View` or `Text` is handed objects it cannot read. Tailwind's
    // four loops and a project's own keyframes both produce one.
    let animated_style = has_keyframes
        || style.iter().any(|declaration| {
            matches!(&declaration.property, StyleProperty::Animation(name) if *name != hozo_ir::Animation::None)
        });

    // `react-native-svg` takes paint as *props*, not as style, so on an
    // SVG element these three stop being Web-only and become something to
    // lower. The refusal that used to name them said the library "is a
    // separate dependency with its own props, not a style Hozo can lower
    // to" -- true about the style and beside the point about the props,
    // which is exactly the sort of asymmetry the compiler is for: one
    // class, `fill-blue-500`, becomes a CSS declaration on Web and an
    // attribute here.
    let svg_paint: Vec<(&'static str, String)> = if matches!(node.primitive, Primitive::Svg(_)) {
        style
            .iter()
            .filter_map(|declaration| match &declaration.property {
                // Trimmed: the style resolver returns a JavaScript string
                // literal, quotes included, because that is what a
                // StyleSheet entry needs. A JSX attribute brings its own.
                StyleProperty::Fill(color) => Some((
                    "fill",
                    crate::style::resolve_theme_color(color, theme)
                        .trim_matches('\'')
                        .to_string(),
                )),
                StyleProperty::Stroke(color) => Some((
                    "stroke",
                    crate::style::resolve_theme_color(color, theme)
                        .trim_matches('\'')
                        .to_string(),
                )),
                StyleProperty::StrokeWidth(width) => Some(("strokeWidth", format!("{{{width}}}"))),
                _ => None,
            })
            .collect()
    } else {
        Vec::new()
    };
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
            caret: caret.is_some(),
        },
        node,
        theme,
        cx.diagnostics,
    );

    let (mut component, extra_props) = markup::native_component(node, cx.diagnostics);
    // A ruby whose word only React Native can read hands the label to a
    // component, and the reading has to be identifiable there -- a plain
    // `Text` is not, since `HozoRuby` compares by identity to decide what
    // the word is. Before `rendered_component`, which reads `component`.
    if node.primitive == Primitive::Ruby && component == "HozoRuby" {
        cx.runtime.need_component("HozoRuby");
    }
    if in_dynamic_ruby && node.primitive == Primitive::RubyText {
        component = "HozoRubyText";
        cx.runtime.need_component("HozoRubyText");
    }
    // Recorded here, where the tag is decided, and only for the primitives
    // Hozo lowered: a carried `Child::Verbatim` keeps whatever the author
    // imported and must not be imported over.
    if !matches!(node.primitive, Primitive::Svg(_)) {
        cx.runtime.need_native(component);
    }
    // A transition on something that is not a control. `Pressable` has its
    // own path above, driven by the four interaction booleans; this one is
    // driven by the style changing, which is the shape an ambient
    // condition arrives in -- `dark:bg-black` is already resolved to a
    // guarded array by the time it renders, and what the element sees is
    // the array becoming a different array.
    if ambient_transition.is_some() && component == "View" {
        component = "HozoAnimated";
        cx.runtime.need_component("HozoAnimated");
    }
    if animated_style {
        let animated = match component {
            "View" => Some("Animated.View"),
            "Text" => Some("Animated.Text"),
            _ => None,
        };
        if let Some(animated) = animated {
            component = animated;
            cx.runtime.need_native("Animated");
        }
    }

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
    let semantic_defaults = semantic_defaults::semantic_defaults(
        node,
        theme,
        &style,
        inherited,
        parent_font_size,
        parent_size_opaque,
    );

    // `inherited` is text inheritance and belongs to `Text`. The semantic
    // defaults do not: every one of them happened to be a text property
    // until `Separator` needed a height, and the gate was quietly deciding
    // that a default could only ever be about type. Widening it changes
    // nothing above -- each of those arms matches a primitive that lowers
    // to `Text` anyway -- and it is what makes a rule one pixel tall.
    let style: Vec<StyleDeclaration> = if renders_text(component) {
        // Provenance resolves competing utilities on the *same* element.
        // A child's own font fallback still outranks an inherited leading;
        // do not let the parent's Written marker reverse CSS inheritance.
        // Context is the reference's source of inherited values. A copied
        // class size/color could mask the parent's later inline override
        // or replace a relative helper's computed size. Normal lowering
        // keeps its existing iterator with no per-declaration extra test.
        let inherited = if cx.text_reference {
            &[][..]
        } else {
            inherited
        };
        let inherited: Vec<_> = inherited
            .iter()
            .filter(|parent| {
                !matches!(parent.property, StyleProperty::LineHeight(_))
                    || !style.iter().any(|own| {
                        own.condition == parent.condition
                            && matches!(own.property, StyleProperty::LineHeight(_))
                    })
            })
            .cloned()
            .collect();
        inherited
            .into_iter()
            .chain(semantic_defaults)
            .chain(style)
            .collect()
    } else {
        semantic_defaults.into_iter().chain(style).collect()
    };

    // What an ancestor's `*:`/`**:` wrote for this element, before its
    // own, so the element's own win -- `dedupe_last_wins` keeps the last
    // of a property, which is where CSS specificity would land too.
    let style: Vec<StyleDeclaration> = from_ancestor
        .direct
        .iter()
        .cloned()
        .chain(from_ancestor.all.iter().cloned())
        .chain(style)
        .collect();
    // And what this element writes for its own subtree, taken out before
    // anything tries to apply it here.
    let (subtree, style): (Vec<_>, Vec<_>) = style
        .into_iter()
        .partition(|d| d.condition.split_subtree().is_some());
    let (to_children, to_descendants) = subtree_for_children(&subtree, node, cx.diagnostics);
    // An ancestor's `**:` keeps going; a parent's `*:` stops here.
    let descendants: Vec<StyleDeclaration> = from_ancestor
        .all
        .iter()
        .cloned()
        .chain(to_descendants)
        .collect();
    // A child the compiler cannot read may render anything, so a style
    // meant for "every child" would reach some of them and not others.
    if !(to_children.is_empty() && descendants.is_empty())
        && node
            .children
            .iter()
            .any(|c| matches!(c, hozo_ir::Child::Verbatim { .. }))
    {
        cx.diagnostics.push(unwired_variant(
            node,
            "`*:`/`**:` hands a style to each child, and one of this element's children is an expression or a component the compiler doesn't read. It reaches the children it can see and not that one. On Web the selector reaches all of them.",
            Severity::Warning,
        ));
    }

    let text_handoff::TextHandoff {
        text_declarations,
        own_declarations,
        current_font_size,
        descend,
        forwards_label,
        unified_scope,
    } = text_handoff::hand_down_text(node, component, &style, inherited, parent_font_size, cx);

    // `space-*`/`divide-*` belong to the children, not here. Web gives them
    // their own rule with a child-scoped selector; the equivalent on this
    // platform is a style handed to `HozoSpaced`, which decides at render
    // time which children receive it -- see that component for why the
    // decision can't be made here.
    let own_declarations = own_declarations.into_iter().filter(|d| {
        if grid.is_some() && grid_absorbs(&d.property) {
            return false;
        }
        if grid_item.is_some()
            && matches!(
                d.property,
                StyleProperty::GridColumn(_)
                    | StyleProperty::GridColumnStart(_)
                    | StyleProperty::GridColumnEnd(_)
                    | StyleProperty::GridRow(_)
                    | StyleProperty::GridRowStart(_)
                    | StyleProperty::GridRowEnd(_)
            )
        {
            return false;
        }
        !matches!(
            d.property,
            StyleProperty::TransitionProperty(_)
                | StyleProperty::TransitionDuration(..)
                | StyleProperty::TransitionDelay(..)
                | StyleProperty::TransitionTimingFunction(..)
        )
    });
    let (child_declarations, own_declarations): (Vec<_>, Vec<_>) =
        own_declarations.partition(|d| style::is_child_scoped(&d.property));
    let mixed_effect_boundary = matches!(node.primitive, Primitive::View | Primitive::Pressable)
        && component != "HozoAnimated"
        && !node.props.has_spread()
        && !node.class_name_fallback.is_empty();
    let mixed_shadows = mixed_effect_boundary && crate::shadows::can_mix(&own_declarations);
    let mixed_gradients = mixed_effect_boundary && crate::gradients::can_mix(&own_declarations);
    let mixed_transforms = mixed_effect_boundary && crate::transforms::can_mix(&own_declarations);
    let project_filter_slots =
        component != "HozoAnimated" && crate::filters::can_compose(&own_declarations);
    let mixed_filters =
        mixed_effect_boundary && project_filter_slots && crate::filters::can_mix(&own_declarations);
    let compose_gradients = mixed_gradients
        || (component != "HozoAnimated"
            && crate::gradients::split_across_conditions(&own_declarations));
    let compose_shadows = mixed_shadows
        || (component != "HozoAnimated"
            && crate::shadows::split_across_conditions(&own_declarations));
    // Copying base effect registers into every condition would overwrite a
    // different active condition's value when the runtime joins the slots.
    let own_declarations = style::fold_base_layers(
        own_declarations,
        style::ComposedLayers {
            // If the emitted objects write identical slots, the conditional
            // literal already replaces all the base slots. Otherwise the
            // composer reads them independently, so no base copy is needed.
            filters: project_filter_slots,
            gradients: compose_gradients,
            shadows: compose_shadows,
        },
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
        pattern_slot: Some("className"),
        composition: hozo_ir::OwnerSlotComposition {
            filters: project_filter_slots,
            shadows: compose_shadows,
            gradients: compose_gradients,
        },
    };
    let state_start = build_style_entries(
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
        animates.then_some(&mut frames),
        cx,
    );
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
    // The label's text styles, by state, for `HozoPressable` to hand to a
    // label that arrives as `children`. Compiled here like any other entry;
    // only which element they land on waits for runtime.
    let label_style = if forwards_label {
        let mut parts = Vec::new();
        let mut pressed = Vec::new();
        let target = crate::conditions::StyleTarget {
            owner_facts: &[],
            owner_events: &[],
            node,
            position,
            interaction_context: true,
            pattern_slot: None,
            composition: Default::default(),
        };
        build_style_entries(
            &text_declarations,
            &format!("{base_name}_label"),
            &target,
            &mut parts,
            &mut pressed,
            None,
            cx,
        );
        parts.extend(pressed);
        (!parts.is_empty()).then_some(parts)
    } else {
        None
    };
    let (effects, deferred_effects) = effects::plan(
        effects::Mixing {
            mixed_shadows,
            mixed_gradients,
            mixed_transforms,
            mixed_filters,
            project_filter_slots,
            compose_gradients,
            compose_shadows,
        },
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

    // After the compiled resting styles, so it wins the same way it would in
    // the source: `cn('p-4', getDynamic())` puts the opaque part last, and RN
    // resolves a style array last-wins just like JSX's own duplicate-prop
    // rule. Before the element's state styles, which a caller's class does
    // not beat on Web either: a disabled button looks disabled whatever
    // colour it was given (#881).
    //
    // A pressable hands the resolver the state it tracks, so a runtime
    // `active:` or `hover:` class applies as a compiled one does (#886).
    let runtime_states = !node.class_name_fallback.is_empty()
        && matches!(component, "Pressable" | "HozoLink" | "TextInput");
    if runtime_states {
        cx.runtime_states.push(crate::OwnerCallback {
            span: node.span,
            class_prop: "className",
        });
    }
    let class_state = runtime_class_state(node, source, runtime_states);
    let pattern_classes = if crate::pattern::interaction_slot(node.primitive, "className").is_some()
    {
        crate::class_route::PatternClasses::new(
            node.primitive,
            "className",
            node.class_name_fallback
                .iter()
                .map(|expr| {
                    node.root_class_evaluation().map_or_else(
                        || source_text(source, *expr).to_string(),
                        |evaluation| evaluation.value(source, *expr),
                    )
                })
                .collect(),
            !style_array_parts.is_empty() || !pressed_parts.is_empty(),
            source,
            None,
        )
    } else {
        None
    };
    let fallback: Vec<String> = if let Some(route) = &pattern_classes {
        route.residuals()
    } else {
        node.class_name_fallback
            .iter()
            .map(|expr_ref| {
                let captured = node
                    .root_class_evaluation()
                    .map(|evaluation| evaluation.value(source, *expr_ref));
                let value = captured.unwrap_or_else(|| source_text(source, *expr_ref).into_owned());
                match (&class_state, deferred_effects) {
                    (Some(state), 0) => format!("hozoClasses({value}, {state})"),
                    (None, 0) => format!("hozoClasses({value})"),
                    (state, effects) => format!(
                        "hozoClasses({value}, {}, {effects})",
                        state.as_deref().unwrap_or("undefined")
                    ),
                }
            })
            .collect()
    };
    style_array_parts.splice(state_start..state_start, fallback);

    // The owner collects events for both inherited styles and child-authored
    // styles. A Text reads context; putting modality handlers on it does not
    // update the state its callback consumes.
    let needs_focus_visible = own_declarations
        .iter()
        .chain(text_declarations.iter())
        .any(|declaration| interaction::uses_focus_visible(&declaration.condition))
        || (interaction::owns_events(node)
            && interaction::descendant_uses(node, interaction::uses_focus_visible))
        || runtime_states;
    let needs_hover_or_focus =
        own_declarations
            .iter()
            .chain(text_declarations.iter())
            .any(|declaration| {
                condition_contains(&declaration.condition, |condition| {
                    uses_hover(condition) || focus_state(condition).is_some()
                })
            })
            || (interaction::owns_events(node)
                && interaction::descendant_uses(node, interaction::uses_interaction))
            || runtime_states;
    // Navigation stays in HozoLink; the compiler selects the existing state
    // provider underneath it. A plain link imports no animation machinery.
    // A host-only pressed style can stay in RN's cheap style callback. Text
    // needs a provider even for raw children, otherwise its emitted pressed
    // style is never referenced (or borrows an unrelated outer owner).
    let needs_interaction_host = needs_hover_or_focus
        || transition.is_some()
        || label_style.is_some()
        || text_declarations
            .iter()
            .any(|declaration| interaction::uses_interaction(&declaration.condition));
    let link_interaction = component == "HozoLink" && needs_interaction_host;
    if link_interaction {
        cx.runtime.need_component("HozoPressable");
    }
    // `@container`, which on Web is a property and here is a component:
    // an element has to measure itself before anything below it can query
    // its width.
    let container_name =
        own_declarations
            .iter()
            .find_map(|declaration| match &declaration.property {
                StyleProperty::ContainerName(name) => Some(name.clone()),
                _ => None,
            });
    let declares_container = own_declarations.iter().any(|declaration| {
        matches!(&declaration.property, StyleProperty::Keyword("container-type", kind) if *kind != "normal")
    });
    // And the other half: an element whose styles ask about a container's
    // width has to read that width from a component boundary away, which
    // is what `HozoContainerQuery` is for.
    let raw_text_reads_container = node
        .children
        .iter()
        .any(|child| matches!(child, hozo_ir::Child::Text(_)))
        && descend
            .iter()
            .any(|declaration| condition_contains(&declaration.condition, uses_container_width));
    let uses_container_query = raw_text_reads_container
        || own_declarations
            .iter()
            .any(|declaration| condition_contains(&declaration.condition, uses_container_width));
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
        },
        node,
        cx,
    );
    let measures_host =
        host::measures_host(declares_container, rendered_component, node, cx.diagnostics);
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

    // The official StyleX residue lands before Hozo's generated `style`, so
    // it cannot replace the declarations that were successfully lowered.
    let mut props_text = node
        .props
        .stylex_residuals
        .iter()
        .map(|residual| format!(" {{...({})}}", residual.render_expression(source)))
        .collect::<String>();
    if let Some(prop) = layout.scroll_prop {
        props_text.push_str(&format!(" {prop}={{true}}"));
    }
    if !backdrop_parts.is_empty() {
        let prop = crate::pattern::backdrop_style_prop(node.primitive, "className")
            .expect("a backdrop style must have a catalogued owner");
        props_text.push_str(&format!(" {prop}={{[{}]}}", backdrop_parts.join(", ")));
    }
    if let Some(radius) = &layout.backdrop_blur {
        props_text.push_str(&format!(" hozoBackdropBlur={{{radius}}}"));
    }
    if link_interaction {
        props_text.push_str(" hozoLinkComponent={HozoPressable}");
    }
    if rendered_component == "HozoBackdropFilter" {
        if let Some(NativeBackdropFilter::Blur(radius)) = &backdrop_filter {
            props_text.push_str(&format!(" hozoBlurRadius={{{radius}}}"));
        }
    }
    if node.primitive == Primitive::Progress {
        if let Some(value) = progress::accessibility_value(node, source) {
            props_text.push_str(&value);
        }
    }

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
    if (needs_pressed_fn || pattern_classes.is_some()) && pattern_style_prop.is_some() {
        if !authored_style.is_empty() {
            held.emit(
                &mut props_text,
                &format!(" style={{[{}]}}", authored_style.join(", ")),
            );
        }
    } else if !authored_style.is_empty()
        && !style_array_parts.is_empty()
        && (!node.class_name_fallback.is_empty()
            || crate::edge_projection::writes_logical_inline(&node.style))
    {
        // Yoga prefers a class's `paddingEnd` to the author's `paddingRight`
        // whatever the order; the helper lets the author's edge win, on the
        // side React Native would give it alone (#2050). An opaque class may
        // write any edge, so it takes the same boundary.
        cx.runtime.need_component("hozoAuthoredEdges");
        cx.runtime.need_native("I18nManager");
        style_array_parts = vec![format!(
            "hozoAuthoredEdges([{}], [{}], I18nManager.isRTL, I18nManager.doLeftAndRightSwapInRTL)",
            style_array_parts.join(", "),
            authored_style.join(", ")
        )];
    } else {
        style_array_parts.extend(authored_style);
    }

    style_array_parts = effects::compose_unmixed(style_array_parts, &effects, cx.runtime);

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
    project_spread_gap |=
        class_slots::class_slot_props(node, position, &mut held, &mut props_text, cx);
    // Everything Hozo doesn't model, re-emitted verbatim and last so JSX's
    // last-wins duplicate resolution keeps matching the source's own
    // ordering semantics.
    let rendered = passthrough::render_passthrough(node, &descend, child_interaction_context, cx);
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
    };
    let inner = child_list::render_child_list(
        node,
        component,
        for_children,
        child_interaction_context,
        &base_name,
        position,
        cx,
    );

    if encloses_text {
        cx.text_depth -= 1;
    }

    let inner = if let Some(grid) = grid {
        if !child_declarations.is_empty() {
            cx.diagnostics.push(unwired_variant(
                node,
                "grid combined with `space-*`/`divide-*` needs the grid placer to merge those child styles; use `gap-*` for grid spacing",
                Severity::Error,
            ));
        }
        cx.runtime.need_component("HozoGrid");
        let row_tracks = grid
            .row_tracks_js
            .as_ref()
            .map(|tracks| format!(" rowTracks={{{tracks}}}"))
            .unwrap_or_default();
        let text = format!(
            "<HozoGrid tracks={{{}}}{row_tracks} columnGap={{{}}} rowGap={{{}}}>{}</HozoGrid>",
            grid.tracks_js, grid.column_gap, grid.row_gap, inner.text
        );
        inner.wrap(text, "</HozoGrid>".len())
    } else {
        spaced_children(inner, &child_declarations, &base_name, node, position, cx)
    };

    let inner = if unified_scope.is_empty() {
        inner
    } else {
        // Outside any grid or spacing wrapper, which must keep the authored
        // children as their direct children. The scope renders no host.
        let target = crate::conditions::StyleTarget {
            owner_facts: &[],
            owner_events: &[],
            node,
            position,
            interaction_context,
            pattern_slot: None,
            composition: Default::default(),
        };
        let mut parts = Vec::new();
        let mut pressed = Vec::new();
        build_style_entries(
            &unified_scope,
            &format!("{base_name}_scope"),
            &target,
            &mut parts,
            &mut pressed,
            None,
            cx,
        );
        let style = if parts.len() == 1 {
            parts.remove(0)
        } else {
            format!("[{}]", parts.join(", "))
        };
        cx.runtime.need_component("HozoInheritedScope");
        let close = "</HozoInheritedScope>";
        let text = format!(
            "<HozoInheritedScope style={{{style}}}>{}{close}",
            inner.text
        );
        inner.wrap(text, close.len())
    };

    // React Native's TextInput takes no children either.
    let tag = if measures_host {
        "HozoContainer"
    } else if cx.text_unified && rendered_component == "Text" && outermost_text {
        // Decision 013. Everything that reaches this Text from the file is
        // already in its own style; it reads only what an ancestor outside
        // the file could still supply. Its own style is applied last.
        let handed_down = inherited.iter().chain(node.style.iter());
        let opaque = crate::text_region::has_opaque(node);
        if !opaque && crate::text_region::covers_protocol(handed_down, theme) {
            "Text"
        } else {
            if opaque {
                // A Text rendered in there inherits natively from this host.
                props_text.push_str(" hozoOpaque");
            }
            cx.runtime.need_component("HozoInheritedLeafText");
            "HozoInheritedLeafText"
        }
    } else {
        rendered_component
    };
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
    // Inside the grid item rather than outside it: `HozoGrid` reads its
    // children's types to place them, so anything between the two would
    // make a grid item stop looking like one.
    let rendered = if uses_container_query {
        cx.runtime.need_component("HozoContainerQuery");
        let text = format!(
            "<HozoContainerQuery>{{(__hozoCq) => ({})}}</HozoContainerQuery>",
            rendered.text
        );
        let mut rendered = rendered.wrap(text, ")}</HozoContainerQuery>".len());
        rendered.forget_scope();
        rendered
    } else {
        rendered
    };
    let rendered = if let Some(item) = grid_item {
        cx.runtime.need_component("HozoGridItem");
        let start = item
            .column_start
            .map(|start| format!(" columnStart={{{start}}}"))
            .unwrap_or_default();
        let row_span = if item.row_span > 1 {
            format!(" rowSpan={{{}}}", item.row_span)
        } else {
            String::new()
        };
        let row_start = item
            .row_start
            .map(|start| format!(" rowStart={{{start}}}"))
            .unwrap_or_default();
        let text = format!(
            "<HozoGridItem columnSpan={{{}}}{start}{row_span}{row_start}>{}</HozoGridItem>",
            item.span, rendered.text
        );
        rendered.wrap(text, "</HozoGridItem>".len())
    } else {
        rendered
    };
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
