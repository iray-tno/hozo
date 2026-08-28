//! JSX tree rendering for the React Native backend.
//!
//! Kept as a child module of the backend so rendering can use the lowering
//! helpers without widening their visibility outside this crate.

use super::*;

pub(super) fn render_node(
    node: &Node,
    position: SiblingPosition,
    interaction_context: bool,
    grid_columns: Option<usize>,
    grid_rows: Option<usize>,
    theme: &Theme,
    // Text properties inherited from an ancestor. CSS inherits these;
    // React Native inherits them only from a `Text` to a `Text`. So a
    // `text-xl` on a View has to be carried down by the compiler, or it
    // renders at the default size on device while looking right on Web --
    // the silent divergence this backend exists to avoid.
    inherited: &[StyleDeclaration],
    // Styles an ancestor wrote for this element with `*:` or `**:`.
    from_ancestor: FromAncestor,
    source: &str,
    allocator: &mut NameAllocator,
    style_entries: &mut Vec<(String, Vec<StyleProperty>)>,
    diagnostics: &mut Vec<Diagnostic>,
    runtime: &mut RuntimeNeeds,
) -> String {
    let base_name = allocator.alloc();
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
    // do arrive, but only for classes whose text appears literally
    // somewhere in the project and that aren't conditional.
    for expr_ref in &node.class_name_fallback {
        diagnostics.push(Diagnostic {
            code: DiagnosticCode::DynamicClassNameNotResolved,
            severity: Severity::Warning,
            message: format!(
                "`{}` can't be resolved at build time, so it's resolved on device from the \
                 project-wide candidate map. Conditional utilities (`hover:`, `md:`, `pressed:`) \
                 can't be carried that way and will warn at runtime -- write those as a static \
                 className so they compile to a real style variant.",
                source_text(source, *expr_ref)
            ),
            span: node.span,
        });
    }

    // Some CSS concepts are props on this platform rather than styles, so
    // they're absorbed before the refusal check below -- otherwise the
    // thing that *does* express them would be reported as impossible.
    let truncation = truncation_props(node);
    // Same shape as truncation: a CSS concept React Native keeps on a prop,
    // absorbed before the refusal check so the thing that *does* express it
    // isn't reported as impossible.
    let placeholder = placeholder_props(node, theme);
    // The caret colour is another TextInput prop rather than a style. Kept
    // separate from placeholder because React Native names the two props
    // independently and either utility may appear alone.
    let caret = caret_props(node, theme);

    // `leading-tight`/`tracking-wide` are relative to the font size, which
    // React Native's equivalents aren't. Resolved here, before the refusal
    // check, so only the ones that genuinely can't be resolved are refused.
    let style = lower_inline_flex(fold_font_relative(&node.style, inherited));
    let grid = native_grid(&style, theme, runtime);
    let grid_item = native_grid_item(&style, grid_columns, grid_rows);
    // The fast Native transition path is deliberately narrow: opacity on
    // Pressable interaction state can stay entirely on the native driver.
    let transition = native_driver_transition(node, &style);
    // Computed here rather than beside its use below, because the loop
    // that follows has to know not to refuse the transition properties it
    // consumes -- they are Web-only on an element with nothing to animate
    // and lowered on one with something.
    let ambient_transition = ambient_transition(node, &style);

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
                    crate::style::resolve_theme_color(color, theme).trim_matches('\'').to_string(),
                )),
                StyleProperty::Stroke(color) => Some((
                    "stroke",
                    crate::style::resolve_theme_color(color, theme).trim_matches('\'').to_string(),
                )),
                StyleProperty::StrokeWidth(width) => Some(("strokeWidth", format!("{{{width}}}"))),
                _ => None,
            })
            .collect()
    } else {
        Vec::new()
    };

    for declaration in &style {
        // Lowered as a prop just above, so it must not also be reported as
        // a style this platform cannot hold.
        if !svg_paint.is_empty()
            && matches!(
                declaration.property,
                StyleProperty::Fill(_) | StyleProperty::Stroke(_) | StyleProperty::StrokeWidth(_)
            )
        {
            continue;
        }
        if grid.is_some() && grid_absorbs(&declaration.property) {
            continue;
        }
        if grid_item.is_some()
            && matches!(
                declaration.property,
                StyleProperty::GridColumn(_)
                    | StyleProperty::GridColumnStart(_)
                    | StyleProperty::GridColumnEnd(_)
                    | StyleProperty::GridRow(_)
                    | StyleProperty::GridRowStart(_)
                    | StyleProperty::GridRowEnd(_)
            )
        {
            continue;
        }
        if (transition.is_some() || ambient_transition.is_some())
            && matches!(
                declaration.property,
                StyleProperty::TransitionProperty(_)
                    | StyleProperty::TransitionDuration(..)
                    | StyleProperty::TransitionTimingFunction(..)
            )
        {
            continue;
        }
        if truncation.is_some() && is_truncation_declaration(&declaration.property) {
            continue;
        }
        if matches!(declaration.property, StyleProperty::PlaceholderColor(_)) {
            if placeholder.is_some() {
                continue;
            }
            if let Some(reason) = placeholder_only_reason(&declaration.property) {
                diagnostics.push(unwired_variant(node, &reason, Severity::Error));
                continue;
            }
        }
        if matches!(declaration.property, StyleProperty::CaretColor(_)) {
            if caret.is_some() {
                continue;
            }
            diagnostics.push(unwired_variant(
                node,
                &caret_only_reason(),
                Severity::Error,
            ));
            continue;
        }
        if let Some(reason) = truncation_only_reason(&declaration.property) {
            diagnostics.push(Diagnostic {
                code: DiagnosticCode::WebOnlyPropertyOnNative,
                severity: Severity::Error,
                message: reason,
                span: node.span,
            });
            continue;
        }
        // Survived the fold above, so there was no font size to resolve it
        // against. Reported as unwired rather than Web-only: the platform
        // can hold the value, and writing a `text-*` on the same element is
        // all it takes.
        if let Some(reason) = font_relative_reason(&declaration.property) {
            diagnostics.push(unwired_variant(node, &reason, Severity::Error));
            continue;
        }
        // Possible on the platform, unbuilt here. Named apart from the
        // Web-only refusals so the two don't blur together -- see
        // `DiagnosticCode::NotWiredOnNative`.
        if let Some(reason) = declaration.property.not_wired_on_native() {
            diagnostics.push(unwired_variant(node, &reason, Severity::Error));
            continue;
        }
        // Refused rather than dropped: silently ignoring a `block`/`grid`
        // would leave a layout that looks right on Web and is wrong on
        // device with nothing pointing at the cause.
        if let Some(reason) =
            declaration.property.unsupported_on_native()
        {
            diagnostics.push(Diagnostic {
                code: DiagnosticCode::WebOnlyPropertyOnNative,
                severity: Severity::Error,
                message: format!("{reason} -- this utility is Web-only."),
                span: node.span,
            });
        }
    }

    let (mut component, extra_props) = markup::native_component(node, diagnostics);
    // Recorded here, where the tag is decided, and only for the primitives
    // Hozo lowered: a carried `Child::Verbatim` keeps whatever the author
    // imported and must not be imported over.
    if !matches!(node.primitive, Primitive::Svg(_)) {
        runtime.need_native(component);
    }
    // A transition on something that is not a control. `Pressable` has its
    // own path above, driven by the four interaction booleans; this one is
    // driven by the style changing, which is the shape an ambient
    // condition arrives in -- `dark:bg-black` is already resolved to a
    // guarded array by the time it renders, and what the element sees is
    // the array becoming a different array.
    if ambient_transition.is_some() && component == "View" {
        component = "HozoAnimated";
        runtime.need_component("HozoAnimated");
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
    // inherited goes *before* its own declarations, so its own win --
    // `dedupe_last_wins` keeps the last of a property, which is the same
    // order CSS specificity would settle on.
    let style: Vec<StyleDeclaration> = if component == "Text" {
        inherited.iter().cloned().chain(style).collect()
    } else {
        style
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
    let (subtree, style): (Vec<_>, Vec<_>) =
        style.into_iter().partition(|d| d.condition.split_subtree().is_some());
    let (to_children, to_descendants) = subtree_for_children(&subtree, node, diagnostics);
    // An ancestor's `**:` keeps going; a parent's `*:` stops here.
    let descendants: Vec<StyleDeclaration> =
        from_ancestor.all.iter().cloned().chain(to_descendants).collect();
    // A child the compiler cannot read may render anything, so a style
    // meant for "every child" would reach some of them and not others.
    if !(to_children.is_empty() && descendants.is_empty())
        && node.children.iter().any(|c| matches!(c, hozo_ir::Child::Verbatim { .. }))
    {
        diagnostics.push(unwired_variant(
            node,
            "`*:`/`**:` hands a style to each child, and one of this element's children is an expression or a component the compiler doesn't read. It reaches the children it can see and not that one. On Web the selector reaches all of them.",
            Severity::Warning,
        ));
    }

    // Everything else hands its text properties down rather than keeping
    // them: React Native's View has no `fontSize`, so leaving them here
    // would be a style that renders nothing while the same source renders
    // correctly on Web.
    let (text_declarations, own_declarations): (Vec<_>, Vec<_>) = if component == "Text" {
        (Vec::new(), style.clone())
    } else {
        style.iter().cloned().partition(|d| is_text_property(&d.property))
    };
    // Passed to every child, and to the `Text` wrapper a raw string gets.
    // The element's own come after what it inherited, for the same
    // last-wins reason.
    let descend: Vec<StyleDeclaration> =
        inherited.iter().cloned().chain(text_declarations.iter().cloned()).collect();

    // Handing them down is only half the job: they have to land somewhere.
    // Reported here rather than dropped, because a text size that reaches
    // no text is precisely a style that renders correctly on Web and does
    // nothing on device -- which is the divergence worth a build message.
    if !text_declarations.is_empty() {
        match text_reach(node) {
            TextReach::Certain => {}
            TextReach::Opaque => diagnostics.push(unwired_variant(
                node,
                "this element's text styles are handed down to its children, and one of them is \
                 an expression or a component the compiler doesn't read. React Native doesn't \
                 inherit text styles from a View, so if the text is rendered in there it will \
                 come out at the default size. Put the `text-*` on the Text itself.",
                Severity::Warning,
            )),
            TextReach::None => diagnostics.push(unwired_variant(
                node,
                "this element sets text styles and contains no text. React Native has no \
                 `fontSize` on a View, so there is nothing for them to apply to -- on Web the \
                 same source would style whatever is put inside later.",
                Severity::Warning,
            )),
        }
    }

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
                | StyleProperty::TransitionTimingFunction(..)
        )
    });
    let (child_declarations, own_declarations): (Vec<_>, Vec<_>) =
        own_declarations.partition(|d| style::is_child_scoped(&d.property));

    build_style_entries(
        &own_declarations,
        &base_name,
        source,
        node,
        position,
        style_entries,
        &mut style_array_parts,
        &mut pressed_parts,
        diagnostics,
        runtime,
        interaction_context && component == "Text",
    );

    // After the compiled styles, so it wins the same way it would in the
    // source: `cn('p-4', getDynamic())` puts the opaque part last, and RN
    // resolves a style array last-wins just like JSX's own duplicate-prop
    // rule.
    for expr_ref in &node.class_name_fallback {
        style_array_parts.push(format!("hozoClasses({})", source_text(source, *expr_ref)));
    }

    let needs_focus_visible = own_declarations.iter().any(|declaration| {
        condition_contains(&declaration.condition, |condition| {
            matches!(condition, Condition::FocusVisible)
        })
    });
    let needs_hover_or_focus = own_declarations.iter().any(|declaration| {
        condition_contains(&declaration.condition, |condition| {
            matches!(condition, Condition::Hover | Condition::Focus | Condition::FocusVisible)
        })
    });
    // `@container`, which on Web is a property and here is a component:
    // an element has to measure itself before anything below it can query
    // its width.
    let container_name = own_declarations.iter().find_map(|declaration| {
        match &declaration.property {
            StyleProperty::ContainerName(name) => Some(name.clone()),
            _ => None,
        }
    });
    let declares_container = own_declarations.iter().any(|declaration| {
        matches!(&declaration.property, StyleProperty::Keyword("container-type", kind) if *kind != "normal")
    });
    // And the other half: an element whose styles ask about a container's
    // width has to read that width from a component boundary away, which
    // is what `HozoContainerQuery` is for.
    let uses_container_query = own_declarations.iter().any(|declaration| {
        condition_contains(&declaration.condition, |condition| {
            matches!(condition, Condition::Container { .. })
        })
    });
    let rendered_component = if declares_container {
        runtime.need_component("HozoContainer");
        "HozoContainer"
    } else if component == "Pressable" && (needs_hover_or_focus || transition.is_some()) {
        runtime.need_component("HozoPressable");
        "HozoPressable"
    } else if component == "Text" && interaction_context && !pressed_parts.is_empty() {
        runtime.need_component("HozoText");
        "HozoText"
    } else {
        component
    };
    let needs_pressed_fn = (component == "Pressable" || rendered_component == "HozoText")
        && !pressed_parts.is_empty();
    if needs_pressed_fn {
        style_array_parts.extend(pressed_parts);
    } else if !pressed_parts.is_empty() {
        // `pressed` comes from Pressable's render-prop `style` form, which
        // only Pressable has. On a View or Text a function isn't a valid
        // `style` value at all, so there's nowhere for these to go.
        diagnostics.push(unwired_variant(
            node,
            &format!(
                "`pressed:` needs an element that tracks press state, and `{component}` doesn't. \
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
    if needs_pressed_fn {
        let state = if needs_focus_visible {
            "{ pressed, hovered, focused, focusVisible }"
        } else if needs_hover_or_focus || rendered_component == "HozoText" {
            "{ pressed, hovered, focused }"
        } else {
            "{ pressed }"
        };
        props_text.push_str(&format!(
            " style={{({state}) => [{}]}}",
            style_array_parts.join(", ")
        ));
    } else if style_array_parts.len() == 1 && !style_array_parts[0].contains("&&") {
        props_text.push_str(&format!(" style={{{}}}", style_array_parts[0]));
    } else if !style_array_parts.is_empty() {
        props_text.push_str(&format!(" style={{[{}]}}", style_array_parts.join(", ")));
    }
    if let Some((duration, easing, opacity, transform, colors)) = transition {
        props_text.push_str(&format!(
            " hozoTransition={{{{ duration: {duration}, easing: '{easing}', opacity: {opacity}, transform: {transform}, colors: {colors} }}}}"
        ));
    }
    // The same prop name, deliberately, with fewer fields: `HozoAnimated`
    // works out which properties moved by comparing one render's style
    // with the last, so it needs no list of them. Sharing the name means
    // an element that becomes a `Pressable` later keeps the class working.
    if let Some((duration, easing)) = ambient_transition {
        props_text.push_str(&format!(
            " hozoTransition={{{{ duration: {duration}, easing: '{easing}' }}}}"
        ));
    }
    if needs_focus_visible {
        props_text.push_str(" hozoFocusVisible");
    }
    // Skipping the ones the author already wrote.
    //
    // These are re-emitted verbatim further down, after everything here,
    // so JSX's last-wins resolution already meant the author's value was
    // the one that applied -- emitting both was noise rather than a wrong
    // answer. It only started happening when the integrations stopped
    // requiring a rewrite to `@hozo/core`: a React Native file that sets
    // `accessibilityRole="list"` on its own `<FlatList>` is ordinary, and
    // Hozo adds the same role to every one.
    //
    // A `{...spread}` keeps the semantic prop, because its contents are
    // not knowable here -- and if it does carry the prop it still lands
    // last and still wins.
    let authored: Vec<&str> = node
        .props
        .passthrough
        .iter()
        .filter_map(|prop| prop.name.as_deref())
        .collect();
    for (key, value) in &extra_props {
        if authored.contains(key) {
            continue;
        }
        props_text.push_str(&format!(r#" {key}="{value}""#));
    }
    // The paint from `fill-*`/`stroke-*`, which is a prop here and a CSS
    // declaration on Web. A `fill` the author wrote themselves wins: they
    // said it later and more specifically than a class did.
    for (key, value) in &svg_paint {
        if authored.contains(key) {
            continue;
        }
        if value.starts_with('{') {
            props_text.push_str(&format!(" {key}={value}"));
        } else {
            props_text.push_str(&format!(r#" {key}="{value}""#));
        }
    }
    for (name, value) in [
        ("testID", node.props.test_id),
        ("nativeID", node.props.native_id),
        ("pointerEvents", node.props.pointer_events),
        ("accessibilityState", node.props.accessibility_state),
        ("accessibilityValue", node.props.accessibility_value),
        ("accessibilityLiveRegion", node.props.accessibility_live_region),
        ("onLayout", node.props.on_layout),
        ("onScroll", node.props.on_scroll),
        ("scrollEventThrottle", node.props.scroll_event_throttle),
    ] {
        if let Some(value) = value {
            props_text.push_str(&format!(" {name}={{{}}}", source_text(source, value)));
        }
    }
    // Styles that RN expresses as props (see `truncation_props`).
    // `numberOfLines` takes a number, so it's braced rather than quoted.
    for (key, value) in placeholder.into_iter().flatten() {
        props_text.push_str(&format!(" {key}={{{value}}}"));
    }
    for (key, value) in caret.into_iter().flatten() {
        props_text.push_str(&format!(" {key}={{{value}}}"));
    }
    for (key, value) in truncation.into_iter().flatten() {
        if value.parse::<u32>().is_ok() {
            props_text.push_str(&format!(" {key}={{{value}}}"));
        } else {
            props_text.push_str(&format!(r#" {key}="{value}""#));
        }
    }
    if let Some(label) = node.props.accessibility_label {
        props_text.push_str(&format!(" accessibilityLabel={{{}}}", source_text(source, label)));
    }
    if let Some(hint) = node.props.accessibility_hint {
        props_text.push_str(&format!(" accessibilityHint={{{}}}", source_text(source, hint)));
    }
    if let Some(src) = node.props.image_src {
        let value = source_text(source, src);
        let static_uri = value.starts_with(['\"', '\'']);
        if static_uri {
            props_text.push_str(&format!(" source={{{{ uri: {value} }}}}"));
        } else {
            runtime.need_component("hozoImageSource");
            props_text.push_str(&format!(" source={{hozoImageSource({value})}}"));
        }
    }
    if let Some(src) = node.props.image_default_source {
        let value = source_text(source, src);
        let static_uri = value.starts_with(['\"', '\'']);
        if static_uri {
            props_text.push_str(&format!(" defaultSource={{{{ uri: {value} }}}}"));
        } else {
            runtime.need_component("hozoImageSource");
            props_text.push_str(&format!(" defaultSource={{hozoImageSource({value})}}"));
        }
    }
    // Given back exactly as written. These props are React Native's own;
    // they are modelled only because the DOM spells them differently, and
    // there is nothing to translate on the platform they came from.
    if !node.props.text_input.is_empty() {
        let text_input = &node.props.text_input;
        if let Some(handler) = text_input.on_change_text {
            props_text.push_str(&format!(" onChangeText={{{}}}", source_text(source, handler)));
        }
        for (name, value) in [
            ("editable", &text_input.editable),
            ("readOnly", &text_input.read_only),
            ("multiline", &text_input.multiline),
            ("secureTextEntry", &text_input.secure_text_entry),
        ] {
            if let Some(value) = value {
                props_text.push_str(&native_flag(name, value, source));
            }
        }
        if let Some(rows) = text_input.number_of_lines {
            props_text.push_str(&format!(" numberOfLines={{{}}}", source_text(source, rows)));
        }
        for (name, value) in [
            ("keyboardType", &text_input.keyboard_type),
            ("inputMode", &text_input.input_mode),
        ] {
            if let Some(value) = value {
                props_text.push_str(&format!(" {name}=\"{value}\""));
            }
        }
    }

    // `@container/main`. The unnamed form needs nothing: the component
    // registers under the empty key either way, which is what an unnamed
    // `@sm:` reads.
    if let Some(name) = &container_name {
        props_text.push_str(&format!(" hozoContainerName=\"{name}\""));
    }

    if let Some(horizontal) = &node.props.scroll_horizontal {
        props_text.push_str(&format!(" horizontal={{{}}}", render_condition_expr(source, horizontal)));
    }
    if let Some(value) = node.props.keyboard_should_persist_taps {
        props_text.push_str(&format!(" keyboardShouldPersistTaps={{{}}}", source_text(source, value)));
    }
    if let Some(value) = &node.props.shows_vertical_scroll_indicator {
        props_text.push_str(&format!(" showsVerticalScrollIndicator={{{}}}", render_condition_expr(source, value)));
    }
    if let Some(value) = &node.props.shows_horizontal_scroll_indicator {
        props_text.push_str(&format!(" showsHorizontalScrollIndicator={{{}}}", render_condition_expr(source, value)));
    }
    if node.primitive == Primitive::ScrollView
        && (node.props.refreshing.is_some() || node.props.on_refresh.is_some())
    {
        let refreshing = node.props.refreshing.as_ref()
            .map(|value| render_condition_expr(source, value))
            .unwrap_or_else(|| "false".to_string());
        let on_refresh = node.props.on_refresh
            .map(|value| format!(" onRefresh={{{}}}", source_text(source, value)))
            .unwrap_or_default();
        // The one React Native component that reaches the output through a
        // prop rather than through `native_component`, so it has to be
        // recorded by hand here. Missing it means a bundle that builds and
        // dies on first render, which is exactly how `TextInput` was found
        // missing from Metro's list in the first place.
        runtime.need_native("RefreshControl");
        props_text.push_str(&format!(
            " refreshControl={{<RefreshControl refreshing={{{refreshing}}}{on_refresh} />}}"
        ));
    } else {
        if let Some(refreshing) = &node.props.refreshing {
            props_text.push_str(&format!(" refreshing={{{}}}", render_condition_expr(source, refreshing)));
        }
        if let Some(on_refresh) = node.props.on_refresh {
            props_text.push_str(&format!(" onRefresh={{{}}}", source_text(source, on_refresh)));
        }
    }
    if let Some(open) = &node.props.open {
        props_text.push_str(&format!(" open={{{}}}", render_condition_expr(source, open)));
    }
    if node.primitive == Primitive::Dialog {
        // The behaviour lives in `@hozo/a11y`; the compiler only lowers
        // the styles and checks the props.
        runtime.need_component("HozoDialog");
    }
    // Re-exported by `@hozo/runtime` from `react-native-svg` rather than
    // imported from there directly, so the one import channel the emitter
    // already has keeps working -- and so the optional peer dependency is
    // declared in one package instead of appearing in generated files.
    if let Primitive::Svg(element) = node.primitive {
        runtime.need_component(element.runtime_name());
    }
    if node.primitive == Primitive::Link {
        runtime.need_component("HozoLink");
    }
    if let Some(on_press) = node.props.on_press {
        props_text.push_str(&format!(" onPress={{{}}}", source_text(source, on_press)));
    }
    for (name, value) in [
        ("onStartShouldSetResponder", node.props.on_start_should_set_responder),
        ("onStartShouldSetResponderCapture", node.props.on_start_should_set_responder_capture),
        ("onMoveShouldSetResponder", node.props.on_move_should_set_responder),
        ("onMoveShouldSetResponderCapture", node.props.on_move_should_set_responder_capture),
        ("onResponderGrant", node.props.on_responder_grant),
        ("onResponderStart", node.props.on_responder_start),
        ("onResponderMove", node.props.on_responder_move),
        ("onResponderEnd", node.props.on_responder_end),
        ("onResponderRelease", node.props.on_responder_release),
        ("onResponderReject", node.props.on_responder_reject),
        ("onResponderTerminate", node.props.on_responder_terminate),
        ("onResponderTerminationRequest", node.props.on_responder_termination_request),
    ] {
        if let Some(value) = value {
            props_text.push_str(&format!(" {name}={{{}}}", source_text(source, value)));
        }
    }
    // React Native's own name for it, unchanged. Modelling this prop was
    // about giving the Web backend something to translate; on Native there
    // is nothing to translate, and losing it here would be a regression
    // from when it was merely carried.
    if let Some(focusable) = &node.props.focusable {
        props_text.push_str(&format!(" focusable={{{}}}", render_condition_expr(source, focusable)));
    }
    if let Some(disabled) = &node.props.disabled {
        let disabled = render_condition_expr(source, disabled);
        props_text.push_str(&format!(" disabled={{{disabled}}}"));
        if matches!(node.primitive, Primitive::Button | Primitive::Pressable) {
            props_text.push_str(&format!(" accessibilityState={{{{ disabled: Boolean({disabled}) }}}}"));
        }
    }
    // Everything Hozo doesn't model, re-emitted verbatim and last so JSX's
    // last-wins duplicate resolution keeps matching the source's own
    // ordering semantics.
    for prop in &node.props.passthrough {
        props_text.push(' ');
        props_text.push_str(&render_verbatim(
            prop.span,
            &prop.nested,
            theme,
            &descend,
            source,
            allocator,
            style_entries,
            diagnostics,
            runtime,
            interaction_context || rendered_component == "HozoPressable",
        ));
    }

    // Every child, in source order. A `Verbatim` is re-emitted from source
    // rather than dropped; a bare string on a non-Text element gets the
    // wrapper described above.
    let mut inner = String::new();
    // Tracks whether any earlier sibling could occupy an element position.
    // A `Verbatim` may render nothing, one element, or a hundred
    // (`{items.map(..)}`), so everything after one has no compile-time
    // position at all.
    // Both ends are decided up front, because "is anything after this one"
    // can't be answered while walking forwards.
    let is_verbatim = |c: &hozo_ir::Child| matches!(c, hozo_ir::Child::Verbatim { .. });
    let is_element = |c: &hozo_ir::Child| matches!(c, hozo_ir::Child::Node(_));
    let positions: Vec<SiblingPosition> = node
        .children
        .iter()
        .enumerate()
        .map(|(index, _)| {
            let before = &node.children[..index];
            let after = &node.children[index + 1..];
            SiblingPosition {
                first: (!before.iter().any(is_verbatim)).then(|| !before.iter().any(is_element)),
                last: (!after.iter().any(is_verbatim)).then(|| !after.iter().any(is_element)),
                ordinal: (!before.iter().any(is_verbatim))
                    .then(|| before.iter().filter(|c| is_element(c)).count() + 1),
                count: (!node.children.iter().any(is_verbatim))
                    .then(|| node.children.iter().filter(|c| is_element(c)).count()),
            }
        })
        .collect();

    for (index, child) in node.children.iter().enumerate() {
        match child {
            hozo_ir::Child::Node(child_node) => {
                let child_position = positions[index];
                inner.push_str(&render_node(
                    child_node,
                    child_position,
                    interaction_context || rendered_component == "HozoPressable",
                    grid.as_ref().and_then(|grid| grid.track_count),
                    grid.as_ref().and_then(|grid| grid.row_track_count),
                    theme,
                    &descend,
                    FromAncestor { direct: &to_children, all: &descendants },
                    source,
                    allocator,
                    style_entries,
                    diagnostics,
                    runtime,
                ));
            }
            hozo_ir::Child::Text(text) => {
                let escaped = escape_jsx_text(text);
                // `SvgText` holds a string itself, so wrapping one in React
                // Native's `Text` puts a text node where an SVG element
                // belongs -- the string vanishes rather than rendering.
                // The wrapper exists because a bare string inside a `View`
                // crashes; inside `<Svg.Text>` there is nothing to fix.
                let holds_text = component == "Text" || component == "SvgText";
                inner.push_str(&if !holds_text {
                    wrap_in_text(
                        &escaped,
                        &descend,
                        &base_name,
                        source,
                        node,
                        position,
                        style_entries,
                        diagnostics,
                        runtime,
                        interaction_context || rendered_component == "HozoPressable",
                    )
                } else {
                    escaped
                });
            }
            hozo_ir::Child::Verbatim { source: expr_ref, nested } => {
                inner.push_str(&render_verbatim(
                    *expr_ref,
                    nested,
                    theme,
                    &descend,
                    source,
                    allocator,
                    style_entries,
                    diagnostics,
                    runtime,
                    interaction_context || rendered_component == "HozoPressable",
                ));
            }
        }
    }

    let inner = if let Some(grid) = grid {
        if !child_declarations.is_empty() {
            diagnostics.push(unwired_variant(
                node,
                "grid combined with `space-*`/`divide-*` needs the grid placer to merge those child styles; use `gap-*` for grid spacing",
                Severity::Error,
            ));
        }
        runtime.need_component("HozoGrid");
        let row_tracks = grid
            .row_tracks_js
            .as_ref()
            .map(|tracks| format!(" rowTracks={{{tracks}}}"))
            .unwrap_or_default();
        format!(
            "<HozoGrid tracks={{{}}}{row_tracks} columnGap={{{}}} rowGap={{{}}}>{inner}</HozoGrid>",
            grid.tracks_js, grid.column_gap, grid.row_gap
        )
    } else {
        spaced_children(
            inner,
            &child_declarations,
            &base_name,
            source,
            node,
            position,
            style_entries,
            diagnostics,
            runtime,
        )
    };

    // React Native's TextInput takes no children either.
    let rendered = if component == "TextInput" || component == "Image" {
        format!("<{rendered_component}{props_text} />")
    } else {
        format!("<{rendered_component}{props_text}>{inner}</{rendered_component}>")
    };
    // Inside the grid item rather than outside it: `HozoGrid` reads its
    // children's types to place them, so anything between the two would
    // make a grid item stop looking like one.
    let rendered = if uses_container_query {
        runtime.need_component("HozoContainerQuery");
        format!("<HozoContainerQuery>{{(__hozoCq) => ({rendered})}}</HozoContainerQuery>")
    } else {
        rendered
    };
    if let Some(item) = grid_item {
        runtime.need_component("HozoGridItem");
        let start = item
            .column_start
            .map(|start| format!(" columnStart={{{start}}}"))
            .unwrap_or_default();
        let row_span = (item.row_span > 1)
            .then(|| format!(" rowSpan={{{}}}", item.row_span))
            .unwrap_or_default();
        let row_start = item
            .row_start
            .map(|start| format!(" rowStart={{{start}}}"))
            .unwrap_or_default();
        format!(
            "<HozoGridItem columnSpan={{{}}}{start}{row_span}{row_start}>{rendered}</HozoGridItem>",
            item.span
        )
    } else {
        rendered
    }
}
