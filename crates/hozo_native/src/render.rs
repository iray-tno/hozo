//! JSX tree rendering for the React Native backend.
//!
//! Kept as a child module of the backend so rendering can use the lowering
//! helpers without widening their visibility outside this crate.

use super::text::*;
use super::*;

enum NativeBackdropFilter {
    None,
    Blur(String),
}

fn native_backdrop_filter(declaration: &StyleDeclaration) -> Option<NativeBackdropFilter> {
    if declaration.condition != Condition::Always {
        return None;
    }
    match &declaration.property {
        StyleProperty::BackdropFilter(FilterFunction::None, _) => Some(NativeBackdropFilter::None),
        StyleProperty::BackdropFilter(FilterFunction::Blur, value) => value
            .strip_prefix("blur(")?
            .strip_suffix("px)")
            .map(|radius| NativeBackdropFilter::Blur(radius.to_string())),
        _ => None,
    }
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
) -> String {
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

    let resolved_node = resolve_first_that_works(node);
    let node = resolved_node.as_ref().unwrap_or(node);
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
        cx.diagnostics.push(Diagnostic {
            code: DiagnosticCode::DynamicClassNameNotResolved,
            severity: Severity::Warning,
            message: if crate::pattern::interaction_slot(node.primitive, "className").is_some() {
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
            },
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
    let caret = caret_props(node, theme);

    // `leading-tight`/`tracking-wide` are relative to the font size, which
    // React Native's equivalents aren't. Resolved here, before the refusal
    // check, so only the ones that genuinely can't be resolved are refused.
    // A placeholder colour travels as a prop, never as the field's own text
    // colour or a pseudo-element StyleSheet entry. Consume only declarations
    // the prop adapter actually handles, leaving every other pseudo/style
    // stack visible to the usual diagnostics.
    let field_style: Option<Vec<_>> = placeholder.is_some().then(|| {
        node.style
            .iter()
            .filter(|declaration| placeholder_colour(declaration).is_none())
            .cloned()
            .collect()
    });
    let style = lower_inline_flex(fold_font_relative(
        field_style.as_deref().unwrap_or(&node.style),
        inherited,
    ));
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
    let mut backdrop_filter = None;

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
        if let Some(filter) = native_backdrop_filter(declaration) {
            backdrop_filter = Some(filter);
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
                    | StyleProperty::TransitionDelay(..)
                    | StyleProperty::TransitionTimingFunction(..)
            )
        {
            continue;
        }
        if truncation.is_some() && is_truncation_declaration(&declaration.property) {
            continue;
        }
        // How text breaks into lines. The Web has five properties for it and
        // React Native one Android prop, so most of these have nothing to
        // become here. That is a difference in where lines fall, not a layout
        // that is wrong, so it is a warning -- it used to be the Web-only
        // error, which stopped the Native build for a `text-balance` in a
        // component written once for both.
        if let Some((name, value)) = crate::text::line_breaking(&declaration.property) {
            {
                let lowered = text_break.is_some()
                    && name == "text-wrap"
                    && matches!(value.as_str(), "balance" | "pretty")
                    && declaration.condition == Condition::Always;
                // The platform's own behaviour already -- for Tailwind's
                // `break-normal` and `text-wrap`, which reset rather than ask.
                // A declaration written out (StyleX, `[line-break:normal]`) is
                // still reported: someone set it on purpose, and the StyleX
                // scorecard holds its Web-only properties to saying so.
                let default = match &declaration.property {
                    StyleProperty::KeywordPair(..) => value == "normal",
                    StyleProperty::Keyword("text-wrap", "wrap") => true,
                    _ => false,
                };
                if !lowered && !default {
                    let keep_all_on_text = ios_line_break.is_some()
                        && name == "word-break"
                        && value == "keep-all"
                        && declaration.condition == Condition::Always;
                    let reason = if keep_all_on_text {
                        "iOS keeps Korean words whole (`lineBreakStrategyIOS=\"hangul-word\"`, \
                         set here), but still breaks Chinese and Japanese between characters, \
                         and Android has no control for it -- see \
                         https://github.com/iray-tno/hozo/issues/813"
                    } else if name == "text-wrap" && matches!(value.as_str(), "balance" | "pretty")
                    {
                        if declaration.condition == Condition::Always {
                            "React Native sets it on the `Text` that holds the words (Android's \
                             `textBreakStrategy`), and this element is not one"
                        } else {
                            "React Native sets it as a `Text` prop, which a variant cannot switch"
                        }
                    } else {
                        "React Native's `Text` has no control over where lines break beyond \
                         Android's `textBreakStrategy`, so the platform decides. Its default \
                         already keeps closing punctuation off the start of a line; strict and \
                         loose rules, and breaking by phrase, wait on React Native -- see \
                         https://github.com/iray-tno/hozo/issues/813"
                    };
                    cx.diagnostics.push(Diagnostic {
                        code: DiagnosticCode::WebOnlyPropertyOnNative,
                        severity: Severity::Warning,
                        // A StyleX declaration keeps the reason its
                        // property is refused everywhere else (it names
                        // StyleX's Web surface); only the weight changes.
                        message: match declaration.property.unsupported_on_native() {
                            Some(refusal)
                                if matches!(declaration.property, StyleProperty::WebOnly(..)) =>
                            {
                                format!(
                                    "{refusal}. Lines fall where React Native puts them here; on \
                                     Web it applies as written."
                                )
                            }
                            _ => format!(
                                "`{name}: {value}`: {reason}. Lines fall where React Native puts \
                                 them here; on Web it applies as written."
                            ),
                        },
                        span: node.span,
                    });
                }
                continue;
            }
        }
        if has_keyframes && crate::keyframes::is_timing(&declaration.property) {
            continue;
        }
        if matches!(declaration.property, StyleProperty::PlaceholderColor(_)) {
            if let Some(reason) = placeholder_only_reason(&declaration.property) {
                let reason = if node.primitive == Primitive::TextInput {
                    "conditional placeholder colours beyond dark mode are not wired to TextInput's placeholderTextColor prop".to_string()
                } else {
                    reason
                };
                cx.diagnostics
                    .push(unwired_variant(node, &reason, Severity::Error));
                continue;
            }
        }
        if matches!(declaration.property, StyleProperty::CaretColor(_)) {
            if caret.is_some() {
                continue;
            }
            cx.diagnostics
                .push(unwired_variant(node, &caret_only_reason(), Severity::Error));
            continue;
        }
        if let Some(reason) = truncation_only_reason(&declaration.property) {
            cx.diagnostics.push(Diagnostic {
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
            cx.diagnostics
                .push(unwired_variant(node, &reason, Severity::Error));
            continue;
        }
        // Possible on the platform, unbuilt here. Named apart from the
        // Web-only refusals so the two don't blur together -- see
        // `DiagnosticCode::NotWiredOnNative`.
        if let Some(reason) = declaration.property.not_wired_on_native() {
            cx.diagnostics
                .push(unwired_variant(node, &reason, Severity::Error));
            continue;
        }
        // Refused rather than dropped: silently ignoring a `block`/`grid`
        // would leave a layout that looks right on Web and is wrong on
        // device with nothing pointing at the cause.
        if let Some(reason) = declaration.property.unsupported_on_native() {
            cx.diagnostics.push(Diagnostic {
                code: DiagnosticCode::WebOnlyPropertyOnNative,
                severity: Severity::Error,
                message: format!("{reason} -- this utility is Web-only."),
                span: node.span,
            });
        }
    }

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
    // The size a relative one scales against, per condition.
    //
    // `parent_font_size` before `inherited`, which is the other way round
    // from how this used to read. The parent's is the *nearer* of the two:
    // it is that element's own size with its semantic default folded in,
    // while `inherited` is whatever a View further up handed down. Reading
    // the farther one first is why a `Small` inside an `<Heading level={1}>`
    // scaled against the page's 16 rather than the heading's 32, and came
    // out smaller than the body text it was supposed to be smaller than.
    //
    // Conditions rather than one number, because a conditional size still
    // reaches the element -- `md:text-xl` is carried down like any other
    // text declaration -- and a ratio that exists only at `Always` left the
    // inherited value standing above the breakpoint. A `Small` under
    // `text-base md:text-xl` rendered at 20px on a tablet: the same size as
    // the body, with the shrink gone.
    let base_font_sizes = || -> Vec<(Condition, f64)> {
        let find = |list: &[StyleDeclaration], want: &Condition| {
            list.iter().rev().find_map(|d| match &d.property {
                StyleProperty::FontSize(Length::Px(px)) if &d.condition == want => Some(*px),
                _ => None,
            })
        };
        let mut conditions: Vec<Condition> = vec![Condition::Always];
        for declaration in style.iter().chain(inherited.iter()) {
            if matches!(declaration.property, StyleProperty::FontSize(_))
                && !conditions.contains(&declaration.condition)
            {
                conditions.push(declaration.condition.clone());
            }
        }
        conditions
            .into_iter()
            .filter_map(|condition| {
                let px = find(&style, &condition)
                    .or_else(|| {
                        // The unconditional fallbacks answer for a condition
                        // of their own only.
                        if condition == Condition::Always {
                            parent_font_size
                        } else {
                            None
                        }
                    })
                    .or_else(|| find(inherited, &condition))
                    .or_else(|| {
                        if condition == Condition::Always {
                            None
                        } else {
                            // A conditional ratio still needs a base when the
                            // size at that breakpoint came from further up.
                            find(&style, &Condition::Always)
                                .or(parent_font_size)
                                .or_else(|| find(inherited, &Condition::Always))
                        }
                    })
                    .or_else(|| {
                        // Nothing named a size anywhere, so React Native's own
                        // default is the size this will be drawn at.
                        //
                        // This used to emit nothing, and `<Text>a<Small>x</Small></Text>`
                        // -- the commonest shape there is -- rendered small
                        // print at the size of the print around it. Three
                        // answers to one source: 13.6 on the Web, 12 through
                        // the components in `@hozo/typography`, and no
                        // reduction at all here.
                        //
                        // Not a guess. `RCTFont.mm` reads
                        // `const CGFloat defaultFontSize = 14`, and
                        // `packages/typography/src/text-size.ts` already scales
                        // against it -- the constants it replaced, 11 and 12,
                        // are these ratios applied to exactly this number.
                        //
                        // Only for a condition of its own, like the fallbacks
                        // above: a base invented for `md:` would apply a ratio
                        // at a breakpoint where nothing set a size.
                        (condition == Condition::Always).then_some(DEFAULT_FONT_SIZE)
                    })?;
                Some((condition, px))
            })
            .collect()
    };

    // One `fontSize` per condition a base is known for.
    let scaled = |ratio: f64, bases: Vec<(Condition, f64)>| -> Vec<StyleDeclaration> {
        bases
            .into_iter()
            .map(|(condition, base)| StyleDeclaration {
                property: StyleProperty::FontSize(Length::Px((base * ratio).round())),
                condition,
            })
            .collect()
    };

    let semantic_defaults: Vec<StyleDeclaration> = match node.primitive {
        Primitive::Strong | Primitive::Legend | Primitive::Term => vec![StyleDeclaration {
            property: StyleProperty::FontWeight(hozo_ir::FontWeight(700)),
            condition: Condition::Always,
        }],
        Primitive::Emphasis => vec![StyleDeclaration {
            property: StyleProperty::Keyword("font-style", "italic"),
            condition: Condition::Always,
        }],
        Primitive::Underline => vec![StyleDeclaration {
            property: StyleProperty::TextDecorationLine("underline"),
            condition: Condition::Always,
        }],
        Primitive::Strikethrough => vec![StyleDeclaration {
            property: StyleProperty::TextDecorationLine("line-through"),
            condition: Condition::Always,
        }],
        // The browser gives `<pre>` a monospace face from its own
        // stylesheet; a `Text` has none to give.
        Primitive::Code | Primitive::Preformatted => vec![StyleDeclaration {
            property: StyleProperty::FontFamily("monospace".to_string()),
            condition: Condition::Always,
        }],
        // The rule itself, which the browser draws and React Native does
        // not. `<hr>` gets its line from the UA stylesheet; a `View` with
        // no size is zero pixels tall and draws nothing, so a compiled
        // separator was invisible while the uncompiled fallback -- which
        // has always set this -- drew one. Turning the compiler on removed
        // a divider from the screen (#309).
        //
        // No colour. The fallback sets none either, and a rule takes its
        // line from a `border-*` or `bg-*` utility the author writes; a
        // default here would be a colour nobody asked for that a theme
        // could not see coming.
        // The bar itself, which the browser sizes and React Native does
        // not. `<progress>` has an intrinsic box; a `View` has none, so a
        // compiled progress bar was zero pixels in both directions --
        // invisible on the screen, and absent from the accessibility tree
        // as well, because a zero-area view is not something Android
        // reports. A device found the second half first (#309).
        //
        // Measured rather than recalled, in headless Chrome with this
        // project's own preflight applied, which is the stylesheet a Hozo
        // page actually renders under:
        //
        //     <progress> -> 160 x 16
        //     <hr>       -> 1 tall (Tailwind sets border-top-width: 1px)
        //
        // The width is as literal as the height. It is an odd default for
        // a React Native layout -- a fixed-width bar in a flex column --
        // and it is what the Web half renders, which is the number that
        // matters: an author who overrides one overrides both, and an
        // author who overrides neither gets the same bar on both
        // platforms. Choosing a nicer number here would buy a divergence
        // that is invisible precisely when nobody is looking.
        // `<meter>`'s box, 80 x 16 in Chrome, is `HozoMeter`'s own, with the
        // track colour the same measurement found.
        Primitive::Progress => vec![
            StyleDeclaration {
                property: StyleProperty::Width(hozo_ir::Dimension::Length(Length::Px(160.0))),
                condition: Condition::Always,
            },
            StyleDeclaration {
                property: StyleProperty::Height(hozo_ir::Dimension::Length(Length::Px(16.0))),
                condition: Condition::Always,
            },
        ],
        Primitive::Separator => {
            let vertical = node
                .props
                .passthrough
                .iter()
                .find(|prop| prop.name.as_deref() == Some("orientation"))
                .is_some_and(|prop| prop.literal.as_deref() == Some("vertical"));
            // One pixel under a reset, two without one. Measured: the
            // preflight sets `hr { height: 0; border-top-width: 1px }` and
            // the bare user agent draws a 2px inset border (#315).
            let px = if theme.preflight() { 1.0 } else { 2.0 };
            let thickness = StyleDeclaration {
                property: if vertical {
                    StyleProperty::Width(hozo_ir::Dimension::Length(Length::Px(px)))
                } else {
                    StyleProperty::Height(hozo_ir::Dimension::Length(Length::Px(px)))
                },
                condition: Condition::Always,
            };
            vec![
                thickness,
                StyleDeclaration {
                    property: StyleProperty::AlignSelf(hozo_ir::AlignSelf::Stretch),
                    condition: Condition::Always,
                },
            ]
        }
        Primitive::Sub | Primitive::Sup | Primitive::Small | Primitive::RubyText => {
            match (parent_size_opaque, size_ratio(node, theme)) {
                // Answered at runtime instead; see `rendered_component`.
                (true, Some(_)) => Vec::new(),
                (false, Some(ratio)) => scaled(ratio, base_font_sizes()),
                (_, None) => Vec::new(),
            }
        }
        // The browser's UA stylesheet for h1...h6, which React Native has
        // no equivalent of. `heading_level` reached the Web backend and was
        // dropped here, so a level-1 and a level-6 heading rendered at the
        // same size and the same weight -- identical on a phone, an outline
        // on the Web.
        Primitive::Heading if theme.preflight() => {
            // Nothing, which is what the browser renders here.
            //
            // Tailwind’s preflight resets `h1`-`h6` to `font-size: inherit;
            // font-weight: inherit`, so in a project that ships it a heading
            // is body text until the author says otherwise -- measured at
            // 16px and weight 400, against 32px and 700 without it. Supplying
            // a size and a weight here would make the phone show an outline
            // the browser does not (#315).
            //
            // The level is not lost: `accessibilityRole="header"` carries it
            // to a screen reader either way, which is the half that is about
            // structure rather than about looks.
            Vec::new()
        }
        Primitive::Heading => {
            let mut defs = vec![StyleDeclaration {
                property: StyleProperty::FontWeight(hozo_ir::FontWeight(700)),
                condition: Condition::Always,
            }];
            // The weight holds for every level, so it is above rather than
            // here. The size is one of six, and `size_ratio` declines a
            // level chosen at runtime -- that one the compiler cannot pick.
            if let (false, Some(ratio)) = (parent_size_opaque, size_ratio(node, theme)) {
                defs.extend(scaled(ratio, base_font_sizes()));
            }
            defs
        }
        // Ruby annotation at half the size it annotates, which is what the
        // UA stylesheet says (`rt { font-size: 50% }`) and what JIS X 4051
        // says for 振り仮名. Missing entirely until now: the annotation
        // drew at the base size, so ruby and its text were the same size.
        // `mark` has no highlight without one. The UA stylesheet sets the
        // pair -- `background-color: Mark; color: MarkText` -- and both are
        // needed: a yellow ground under inherited light text is less
        // readable than no highlight at all.
        Primitive::Mark => vec![
            StyleDeclaration {
                property: StyleProperty::BackgroundColor(hozo_ir::Color::Css(
                    "#ffff00".to_string(),
                )),
                condition: Condition::Always,
            },
            StyleDeclaration {
                property: StyleProperty::TextColor(hozo_ir::Color::Css("#000000".to_string())),
                condition: Condition::Always,
            },
        ],
        _ => Vec::new(),
    };

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

    // Everything else hands its text properties down rather than keeping
    // them: React Native's View has no `fontSize`, so leaving them here
    // would be a style that renders nothing while the same source renders
    // correctly on Web.
    // TextInput paints its value, not JSX children. Its own font/colour
    // belongs on the field too; do not hand it to nonexistent child Text.
    let (text_declarations, own_declarations): (Vec<_>, Vec<_>) =
        if renders_text(component) || component == "TextInput" {
            (Vec::new(), style.clone())
        } else {
            style
                .iter()
                .cloned()
                .partition(|d| is_text_property(&d.property))
        };
    // Ambient font size for child relative typography:
    let current_font_size = style
        .iter()
        .rev()
        .find_map(|d| match &d.property {
            StyleProperty::FontSize(Length::Px(px)) if d.condition == Condition::Always => {
                Some(*px)
            }
            _ => None,
        })
        .or(parent_font_size);
    // Passed to every child, and to the `Text` wrapper a raw string gets.
    // The element's own come after what it inherited, for the same
    // last-wins reason.
    //
    // `disabled:` is this element's state, and a child has no `disabled`
    // of its own to drive it: handed down as it was, a nested Text was told
    // its `disabled` prop was missing and the style was never applied. So
    // it goes down already bound to this element's prop, the way a
    // package component's does to the caller's (#950).
    let disabled = node.props.disabled.as_ref();
    let descend: Vec<StyleDeclaration> = inherited
        .iter()
        .cloned()
        .chain(
            text_declarations
                .iter()
                .map(|d| bound_to_disabled(d, disabled)),
        )
        .collect();

    // Handing them down is only half the job: they have to land somewhere.
    // Reported here rather than dropped, because a text size that reaches
    // no text is precisely a style that renders correctly on Web and does
    // nothing on device -- which is the divergence worth a build message.
    //
    // Except on a pressable whose label the compiler cannot see: there it
    // reaches the label at runtime instead, through `hozoTextStyle` (#876).
    // A link is one too: `HozoLink` hands its props to the `HozoPressable`
    // it renders through, which is what a Button with an `href` becomes.
    let forwards_label = !text_declarations.is_empty()
        && matches!(component, "Pressable" | "HozoLink")
        && !matches!(text_reach(node), TextReach::Certain);
    if !text_declarations.is_empty() && !forwards_label {
        match text_reach(node) {
            TextReach::Certain => {}
            TextReach::Opaque => cx.diagnostics.push(unwired_variant(
                node,
                "this element's text styles are handed down to its children, and one of them is \
                 an expression or a component the compiler doesn't read. React Native doesn't \
                 inherit text styles from a View, so if the text is rendered in there it will \
                 come out at the default size. Put the `text-*` on the Text itself.",
                Severity::Warning,
            )),
            TextReach::None => cx.diagnostics.push(unwired_variant(
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
                | StyleProperty::TransitionDelay(..)
                | StyleProperty::TransitionTimingFunction(..)
        )
    });
    let (child_declarations, own_declarations): (Vec<_>, Vec<_>) =
        own_declarations.partition(|d| style::is_child_scoped(&d.property));

    let mut frames = crate::conditions::AnimatedFrames::default();
    let animates = component == "HozoAnimated";
    let pattern_style_prop = crate::pattern::interaction_style_prop(node.primitive, "className")
        .or_else(|| (node.primitive == Primitive::TextInput).then_some("hozoStyle"));
    let transform_entry_start = cx.style_entries.len();
    let target = crate::conditions::StyleTarget {
        node,
        position,
        interaction_context: interaction_context
            && renders_text(component)
            && pattern_style_prop.is_none(),
        pattern_slot: Some("className"),
    };
    let state_start = build_style_entries(
        &own_declarations,
        &base_name,
        &target,
        &mut style_array_parts,
        &mut pressed_parts,
        animates.then_some(&mut frames),
        cx,
    );
    // The label's text styles, by state, for `HozoPressable` to hand to a
    // label that arrives as `children`. Compiled here like any other entry;
    // only which element they land on waits for runtime.
    let label_style = if forwards_label {
        let mut parts = Vec::new();
        let mut pressed = Vec::new();
        let target = crate::conditions::StyleTarget {
            node,
            position,
            interaction_context: true,
            pattern_slot: None,
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
    let transform_specs = if own_declarations
        .iter()
        .any(|d| crate::transforms::is_control(&d.property))
        && own_declarations
            .iter()
            .any(|d| d.condition != Condition::Always)
    {
        crate::transforms::specs(&cx.style_entries[transform_entry_start..], theme)
    } else {
        String::new()
    };
    let starting_parts = frames.starting;
    let exit_parts = frames.exit;
    if own_declarations
        .iter()
        .any(|d| crate::transforms::is_control(&d.property))
        && (!starting_parts.is_empty() || !exit_parts.is_empty())
    {
        cx.diagnostics.push(unwired_variant(node,
            "Transform resets with starting/exit animation frames are not wired on Native yet. Use explicit transform values for these animation endpoints.",
            Severity::Error));
    }
    // What `HozoAnimated` can start from is what it can interpolate. A
    // `starting:w-0` is `@starting-style` on Web and animates there; here
    // the width would be applied as the first frame and then jump, which is
    // worse than not applying it -- so it is left out and named.
    if !starting_parts.is_empty() || !exit_parts.is_empty() {
        let mut fixed: Vec<String> = own_declarations
            .iter()
            .filter(|declaration| {
                crate::condition_contains(&declaration.condition, |condition| {
                    matches!(condition, Condition::StartingStyle)
                        || crate::conditions::presence_closed(condition)
                })
            })
            .filter(|declaration| !crate::transition::interpolatable(&declaration.property))
            .flat_map(|declaration| crate::style::property_and_value(&declaration.property, theme))
            .map(|(key, _)| format!("`{key}`"))
            .collect();
        fixed.dedup();
        if !fixed.is_empty() {
            cx.diagnostics.push(crate::conditions::unwired_variant(
                node,
                &format!(
                    "`starting:` and `data-[state=closed]:` on React Native animate opacity, \
                     transforms and colours -- what `HozoAnimated` can interpolate. {} would be a \
                     frame that jumps rather than moves, so it is not applied here. On Web the \
                     same class works.",
                    fixed.join(", ")
                ),
                hozo_ir::Severity::Warning,
            ));
        }
    }

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
                let value = captured
                    .as_deref()
                    .unwrap_or_else(|| source_text(source, *expr_ref));
                match &class_state {
                    Some(state) => format!("hozoClasses({value}, {state})"),
                    None => format!("hozoClasses({value})"),
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
    // Choose the actual host before adding measurement. Replacing it with a
    // View loses Pressable events, Text semantics and ScrollView behavior;
    // container measurement is a provider around this very same host.
    let rendered_component = if renders_backdrop_filter {
        cx.runtime.need_component("HozoBackdropFilter");
        "HozoBackdropFilter"
    } else if component == "TextInput"
        && (!pressed_parts.is_empty()
            || runtime_states
            || node.props.disabled.is_some()
            || node.props.aria_invalid.is_some())
    {
        cx.runtime.need_component("HozoTextInput");
        "HozoTextInput"
    } else if component == "Pressable" && needs_interaction_host {
        cx.runtime.need_component("HozoPressable");
        "HozoPressable"
    } else if renders_text(component) && interaction_context && !pressed_parts.is_empty() {
        cx.runtime.need_component("HozoText");
        "HozoText"
    } else if relative_at_runtime.is_some() {
        // The compiler could not see the size this scales against, so the
        // ratio travels to a component that can. Costs a context read, and
        // only here -- everything the compiler *can* resolve stays a plain
        // `Text` with a number in a stylesheet.
        cx.runtime.need_component("HozoRelativeText");
        "HozoRelativeText"
    } else if publishes_size {
        // The other half. This element holds the size the ratio above
        // needs and holds it in a form only React Native can evaluate, so
        // it says what it resolved to.
        cx.runtime.need_component("HozoTextSize");
        "HozoTextSize"
    } else {
        component
    };
    // Only a host with one forwarded layout event can publish its width.
    // Portals, non-layout SVG nodes, and identity-sensitive compound parts
    // need their own adapter; a provider must not invent a measurable box
    // for them or hide their identity from their owning component.
    let measures_host = declares_container
        && matches!(
            rendered_component,
            "View"
                | "Animated.View"
                | "Text"
                | "Animated.Text"
                | "TextInput"
                | "HozoTextInput"
                | "Image"
                | "ScrollView"
                | "Pressable"
                | "HozoPressable"
                | "HozoLink"
                | "HozoFlatList"
                | "HozoText"
                | "HozoTextSize"
                | "HozoRelativeText"
                | "HozoAnimated"
                | "HozoRuby"
                | "HozoDetails"
                | "HozoBadge"
                | "Svg"
        );
    if declares_container && !measures_host {
        cx.diagnostics.push(unwired_variant(
            node,
            &format!("`@container` needs a single layout-reporting host on Native; `{rendered_component}` cannot publish that width through this adapter. Put the container on a View inside or around it instead."),
            Severity::Error,
        ));
    }
    // An intervening control owns its own interaction. Neither an enhanced
    // nor a plain link may borrow an outer button's hover/focus context.
    let child_interaction_context = rendered_component == "HozoPressable"
        || link_interaction
        || (interaction_context
            && !matches!(
                node.primitive,
                Primitive::Pressable | Primitive::Button | Primitive::Link
            ));
    let needs_pressed_fn = (matches!(
        rendered_component,
        "Pressable" | "HozoPressable" | "HozoText" | "HozoLink"
    ) || pattern_style_prop.is_some())
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
    if link_interaction {
        props_text.push_str(" hozoLinkComponent={HozoPressable}");
    }
    if rendered_component == "HozoBackdropFilter" {
        if let Some(NativeBackdropFilter::Blur(radius)) = &backdrop_filter {
            props_text.push_str(&format!(" hozoBlurRadius={{{radius}}}"));
        }
    }
    // A progress bar's position, which React Native carries on
    // `accessibilityValue` rather than on `value` and `max`.
    //
    // Those two are `<progress>`'s own props, and Hozo passes them through
    // because on the Web they are exactly right. On a View they are two
    // props the platform ignores, so the element announced itself as a
    // progress bar and reported no position -- a screen reader saying
    // "progress bar" and nothing else. The expressions are re-used as
    // written, so a value that changes still changes.
    // A `<meter>`'s amount is `HozoMeter`'s to work out, with its bar.
    if node.primitive == Primitive::Progress {
        let authored = |name: &str| -> Option<String> {
            node.props
                .passthrough
                .iter()
                .filter(|prop| prop.name.as_deref() == Some(name))
                .find_map(|prop| {
                    let text = &source[prop.span.0.start as usize..prop.span.0.end as usize];
                    let value = text.split_once('=')?.1.trim();
                    value
                        .strip_prefix('{')
                        .and_then(|inner| inner.strip_suffix('}'))
                        .map(|inner| inner.trim().to_string())
                        .or_else(|| {
                            // `max="100"`, which JSX gives as a string.
                            value
                                .strip_prefix('"')?
                                .strip_suffix('"')
                                .map(|inner| format!("'{inner}'"))
                        })
                })
        };
        let now = authored("value");
        let max = authored("max");
        // Heard on a device (#789): React Native hands Android whole numbers,
        // so a value of 0.6 in 0..1 was read as "0". A progress bar keeps its
        // range -- "progress bar" is the right word for one -- scaled to
        // 0..100 when its `max` is known, so a fractional value is not
        // rounded to nothing.
        // Worked out here when all three are written as numbers, so the
        // ordinary case reads as a number in the output; otherwise the same
        // sum is emitted for the runtime.
        let literal = |text: &str| text.trim_matches('\'').parse::<f64>().ok();
        let percent =
            |now: &str, min: &str, max: &str| match (literal(now), literal(min), literal(max)) {
                (Some(now), Some(min), Some(max)) if max != min => {
                    Ok(((now - min) / (max - min) * 100.0).round() as i64)
                }
                _ => Err(format!(
                    "Math.round((({now}) - ({min})) / (({max}) - ({min})) * 100)"
                )),
            };
        if now.is_some() || max.is_some() {
            let fields = match (&now, &max) {
                (Some(now), Some(max)) => {
                    let now = match percent(now, "0", max) {
                        Ok(amount) => amount.to_string(),
                        Err(sum) => sum,
                    };
                    vec![
                        "min: 0".to_string(),
                        "max: 100".to_string(),
                        format!("now: {now}"),
                    ]
                }
                (Some(now), None) => vec!["min: 0".to_string(), format!("now: {now}")],
                (None, Some(max)) => vec!["min: 0".to_string(), format!("max: {max}")],
                (None, None) => unreachable!("one of the two was authored"),
            };
            props_text.push_str(&format!(
                " accessibilityValue={{{{ {} }}}}",
                fields.join(", ")
            ));
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
    let authored_style: Vec<String> = node
        .props
        .passthrough
        .iter()
        .filter(|prop| prop.name.as_deref() == Some("style"))
        .filter_map(|prop| {
            let text = &source[prop.span.0.start as usize..prop.span.0.end as usize];
            let value = text.split_once('=')?.1.trim();
            // `style={expr}`. A string is not a style React Native accepts,
            // so anything else is left where it was.
            let inner = value.strip_prefix('{')?.strip_suffix('}')?;
            Some(inner.trim().to_string())
        })
        .collect();
    // Pattern callbacks are a private generated-code ABI, not an authored
    // style function. Keep the caller's style separate and last, so a state
    // class cannot override it or put a function inside an RN style array.
    // Style attributes a spread could replace are held here and composed
    // with the spreads where those are emitted (`spread_style`).
    let mut held = crate::spread_style::HeldStyles::new(&node.props.passthrough);
    if (needs_pressed_fn || pattern_classes.is_some()) && pattern_style_prop.is_some() {
        if !authored_style.is_empty() {
            held.emit(
                &mut props_text,
                &format!(" style={{[{}]}}", authored_style.join(", ")),
            );
        }
    } else {
        style_array_parts.extend(authored_style);
    }

    if !transform_specs.is_empty() {
        cx.runtime.need_component("hozoTransformStyles");
        style_array_parts = vec![format!(
            "hozoTransformStyles([{}], [{}])",
            style_array_parts.join(", "),
            transform_specs
        )];
    }

    if let Some(route) = &pattern_classes {
        held.emit(&mut props_text, &route.prop(&style_array_parts));
    } else if needs_pressed_fn {
        let callback = if crate::pattern::interaction_slot(node.primitive, "className").is_some() {
            crate::class_route::static_callback(node.primitive, "className", &style_array_parts)
        } else {
            let state = if needs_focus_visible {
                "{ pressed, hovered, focused, focusVisible }".to_string()
            } else if needs_hover_or_focus || rendered_component == "HozoText" {
                "{ pressed, hovered, focused }".to_string()
            } else {
                "{ pressed }".to_string()
            };
            format!("({state}) => [{}]", style_array_parts.join(", "))
        };
        held.emit(
            &mut props_text,
            &format!(" {}={{{callback}}}", pattern_style_prop.unwrap_or("style")),
        );
    } else if style_array_parts.len() == 1 && !style_array_parts[0].contains("&&") {
        held.emit(
            &mut props_text,
            &format!(" style={{{}}}", style_array_parts[0]),
        );
    } else if !style_array_parts.is_empty() {
        held.emit(
            &mut props_text,
            &format!(" style={{[{}]}}", style_array_parts.join(", ")),
        );
    }
    if let Some((duration, delay, easing, opacity, transform, colors)) = transition {
        props_text.push_str(&format!(
            " hozoTransition={{{{ duration: {duration}, delay: {delay}, easing: '{easing}', opacity: {opacity}, transform: {transform}, colors: {colors} }}}}"
        ));
    }
    // The same prop name, deliberately, with fewer fields: `HozoAnimated`
    // works out which properties moved by comparing one render's style
    // with the last, so it needs no list of them. Sharing the name means
    // an element that becomes a `Pressable` later keeps the class working.
    if let Some((duration, delay, easing)) = ambient_transition {
        props_text.push_str(&format!(
            " hozoTransition={{{{ duration: {duration}, delay: {delay}, easing: '{easing}' }}}}"
        ));
    }
    // The first frame of an enter animation: `HozoAnimated` starts here and
    // transitions to `style` on mount (decision 007).
    match starting_parts.as_slice() {
        [] => {}
        [one] => props_text.push_str(&format!(" hozoStarting={{{one}}}")),
        many => props_text.push_str(&format!(" hozoStarting={{[{}]}}", many.join(", "))),
    }
    // The frame an element leaves to: `HozoAnimated` transitions to it when
    // `Presence` closes, and `Presence` removes the element when it ends.
    match exit_parts.as_slice() {
        [] => {}
        [one] => props_text.push_str(&format!(" hozoExit={{{one}}}")),
        many => props_text.push_str(&format!(" hozoExit={{[{}]}}", many.join(", "))),
    }
    // The ratio, for the component that resolves it.
    if let Some(ratio) = relative_at_runtime {
        props_text.push_str(&format!(" hozoRelative={{{ratio}}}"));
    }
    if needs_focus_visible && (rendered_component == "HozoPressable" || link_interaction) {
        props_text.push_str(" hozoFocusVisible");
    }
    if let Some(parts) = label_style
        .as_ref()
        .filter(|_| rendered_component == "HozoPressable" || link_interaction)
    {
        props_text.push_str(&format!(
            " hozoTextStyle={{({{ pressed, hovered, focused, focusVisible }}) => [{}]}}",
            parts.join(", ")
        ));
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
        // An empty value is a bare attribute, which in JSX is `true`.
        // The alternative was `accessible="{true}"`, a string that is
        // truthy by accident rather than a boolean.
        if value.is_empty() {
            props_text.push_str(&format!(" {key}"));
        } else {
            props_text.push_str(&format!(r#" {key}="{value}""#));
        }
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
        (
            "accessibilityLiveRegion",
            node.props.accessibility_live_region,
        ),
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
        if !authored.contains(&key) {
            props_text.push_str(&format!(" {key}={{{value}}}"));
        }
    }
    for (key, value) in caret.into_iter().flatten() {
        props_text.push_str(&format!(" {key}={{{value}}}"));
    }
    // Android only: iOS has no balanced strategy, and the prop is ignored
    // there rather than refused, which is the same answer as the Web giving
    // `text-wrap: balance` to a browser that predates it.
    if let Some(strategy) = text_break {
        props_text.push_str(&format!(r#" textBreakStrategy="{strategy}""#));
    }
    // iOS only, the mirror of the above: Android ignores the prop.
    if let Some(strategy) = ios_line_break {
        props_text.push_str(&format!(r#" lineBreakStrategyIOS="{strategy}""#));
    }
    for (key, value) in truncation.into_iter().flatten() {
        if value.parse::<u32>().is_ok() {
            props_text.push_str(&format!(" {key}={{{value}}}"));
        } else {
            props_text.push_str(&format!(r#" {key}="{value}""#));
        }
    }
    if let Some(label) = node.props.accessibility_label {
        props_text.push_str(&format!(
            " accessibilityLabel={{{}}}",
            source_text(source, label)
        ));
    }
    if let Some(hint) = node.props.accessibility_hint {
        props_text.push_str(&format!(
            " accessibilityHint={{{}}}",
            source_text(source, hint)
        ));
    }
    if let Some(src) = node.props.image_src {
        let value = source_text(source, src);
        let static_uri = value.starts_with(['\"', '\'']);
        if static_uri {
            props_text.push_str(&format!(" source={{{{ uri: {value} }}}}"));
        } else {
            cx.runtime.need_component("hozoImageSource");
            props_text.push_str(&format!(" source={{hozoImageSource({value})}}"));
        }
    }
    // React Native's `Image` reads `srcSet` itself and picks a candidate by
    // the screen's density -- but only density descriptors. A width
    // descriptor (`800w`) is skipped with a runtime warning, and a `srcSet`
    // made only of them draws nothing, where the browser would choose by
    // `sizes`. Said here, for a `srcSet` written as a string, rather than
    // left to a warning on the device.
    if node.primitive == Primitive::Image {
        let literal = |name: &str| {
            node.props
                .passthrough
                .iter()
                .find(|p| p.name.as_deref() == Some(name))
                .and_then(|p| {
                    let text = &source[p.span.0.start as usize..p.span.0.end as usize];
                    let value = text.split_once('=')?.1.trim();
                    value
                        .strip_prefix('"')?
                        .strip_suffix('"')
                        .map(str::to_string)
                })
        };
        if let Some(set) = literal("srcSet") {
            let widths = set
                .split(',')
                .filter_map(|candidate| candidate.split_whitespace().nth(1))
                .any(|descriptor| {
                    descriptor
                        .strip_suffix('w')
                        .is_some_and(|n| n.parse::<u32>().is_ok())
                });
            if widths {
                cx.diagnostics.push(unwired_variant(
                    node,
                    "React Native's Image reads `srcSet` by density only (`1x`, `2x`, `3x`). Its width descriptors (`800w`) are skipped on device with a warning, and `sizes` is not read at all, so the image may draw nothing there. Give density descriptors, or a `src` it can fall back to. On Web the same `srcSet` is chosen by `sizes`.",
                    Severity::Warning,
                ));
            }
        }
    }
    if let Some(src) = node.props.image_default_source {
        let value = source_text(source, src);
        let static_uri = value.starts_with(['\"', '\'']);
        if static_uri {
            props_text.push_str(&format!(" defaultSource={{{{ uri: {value} }}}}"));
        } else {
            cx.runtime.need_component("hozoImageSource");
            props_text.push_str(&format!(" defaultSource={{hozoImageSource({value})}}"));
        }
    }
    // Given back exactly as written. These props are React Native's own;
    // they are modelled only because the DOM spells them differently, and
    // there is nothing to translate on the platform they came from.
    if !node.props.text_input.is_empty() {
        let text_input = &node.props.text_input;
        if let Some(handler) = text_input.on_change_text {
            props_text.push_str(&format!(
                " onChangeText={{{}}}",
                source_text(source, handler)
            ));
        }
        for (name, value) in [
            ("editable", &text_input.editable),
            ("readOnly", &text_input.read_only),
            ("autoCorrect", &text_input.auto_correct),
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
    if measures_host {
        cx.runtime.need_component("HozoContainer");
        if rendered_component != "View" {
            props_text.push_str(&format!(" hozoContainerComponent={{{rendered_component}}}"));
        }
        if let Some(name) = &container_name {
            props_text.push_str(&format!(" hozoContainerName=\"{name}\""));
        }
    }

    if let Some(horizontal) = &node.props.scroll_horizontal {
        props_text.push_str(&format!(
            " horizontal={{{}}}",
            render_condition_expr(source, horizontal)
        ));
    }
    if let Some(value) = node.props.keyboard_should_persist_taps {
        props_text.push_str(&format!(
            " keyboardShouldPersistTaps={{{}}}",
            source_text(source, value)
        ));
    }
    if let Some(value) = &node.props.shows_vertical_scroll_indicator {
        props_text.push_str(&format!(
            " showsVerticalScrollIndicator={{{}}}",
            render_condition_expr(source, value)
        ));
    }
    if let Some(value) = &node.props.shows_horizontal_scroll_indicator {
        props_text.push_str(&format!(
            " showsHorizontalScrollIndicator={{{}}}",
            render_condition_expr(source, value)
        ));
    }
    if node.primitive == Primitive::ScrollView
        && (node.props.refreshing.is_some() || node.props.on_refresh.is_some())
    {
        let refreshing = node
            .props
            .refreshing
            .as_ref()
            .map(|value| render_condition_expr(source, value))
            .unwrap_or_else(|| "false".to_string());
        let on_refresh = node
            .props
            .on_refresh
            .map(|value| format!(" onRefresh={{{}}}", source_text(source, value)))
            .unwrap_or_default();
        // The one React Native component that reaches the output through a
        // prop rather than through `native_component`, so it has to be
        // recorded by hand here. Missing it means a bundle that builds and
        // dies on first render, which is exactly how `TextInput` was found
        // missing from Metro's list in the first place.
        cx.runtime.need_native("RefreshControl");
        props_text.push_str(&format!(
            " refreshControl={{<RefreshControl refreshing={{{refreshing}}}{on_refresh} />}}"
        ));
    } else {
        if let Some(refreshing) = &node.props.refreshing {
            props_text.push_str(&format!(
                " refreshing={{{}}}",
                render_condition_expr(source, refreshing)
            ));
        }
        if let Some(on_refresh) = node.props.on_refresh {
            props_text.push_str(&format!(
                " onRefresh={{{}}}",
                source_text(source, on_refresh)
            ));
        }
    }
    if let Some(open) = &node.props.open {
        props_text.push_str(&format!(
            " open={{{}}}",
            render_condition_expr(source, open)
        ));
    }
    if node.primitive == Primitive::Badge {
        cx.runtime.need_component("HozoBadge");
    }
    if node.primitive == Primitive::Meter {
        cx.runtime.need_component("HozoMeter");
    }
    if node.primitive == Primitive::Chip {
        cx.runtime.need_component("HozoChip");
    }
    if node.primitive == Primitive::Avatar {
        cx.runtime.need_component("HozoAvatar");
    }
    if node.primitive == Primitive::Pagination {
        cx.runtime.need_component("HozoPagination");
    }
    if node.primitive == Primitive::Stepper {
        cx.runtime.need_component("HozoStepper");
    }
    if node.primitive == Primitive::OtpInput {
        cx.runtime.need_component("HozoOtpInput");
    }
    if node.primitive == Primitive::CommandPalette {
        cx.runtime.need_component("HozoCommandPalette");
    }
    if node.primitive == Primitive::Combobox {
        cx.runtime.need_component("HozoCombobox");
    }
    if node.primitive == Primitive::Listbox {
        cx.runtime.need_component("HozoListbox");
    }
    if node.primitive == Primitive::Menu {
        cx.runtime.need_component("HozoMenu");
    }
    if node.primitive == Primitive::ColorPicker {
        cx.runtime.need_component("HozoColorPicker");
    }
    match node.primitive {
        Primitive::Table => cx.runtime.need_component("HozoTable"),
        Primitive::TableCaption => cx.runtime.need_component("HozoTableCaption"),
        Primitive::TableHeader | Primitive::TableBody | Primitive::TableFooter => {
            cx.runtime.need_component("HozoTableSection")
        }
        Primitive::TableRow => cx.runtime.need_component("HozoTableRow"),
        Primitive::TableHead | Primitive::TableCell => cx.runtime.need_component("HozoTableCell"),
        _ => {}
    }
    if matches!(node.primitive, Primitive::Details | Primitive::Summary) {
        cx.runtime
            .need_component(if node.primitive == Primitive::Details {
                "HozoDetails"
            } else {
                "HozoSummary"
            });
    }
    if node.primitive == Primitive::Dialog {
        // The behaviour lives in `@hozo/behaviors`; the compiler only lowers
        // the styles and checks the props.
        cx.runtime.need_component("HozoDialog");
    }
    if node.primitive == Primitive::FlatList {
        // The list itself is React Native's. What `@hozo/engine` adds is
        // the collection information Android needs and nothing computes on
        // its own -- see `markup.rs`.
        cx.runtime.need_component("HozoFlatList");
    }
    // Imported from the dedicated `@hozo/svg` owner rather than from
    // `react-native-svg` directly. The compiler keeps one import channel;
    // the integration sorts these names into the optional domain package.
    if let Primitive::Svg(element) = node.primitive {
        cx.runtime.need_component(element.runtime_name());
    }
    if node.primitive == Primitive::Link
        || (matches!(node.primitive, Primitive::Button | Primitive::Pressable)
            && node
                .props
                .passthrough
                .iter()
                .any(|p| p.name.as_deref() == Some("href")))
    {
        cx.runtime.need_component("HozoLink");
    }
    if let Some(on_press) = node.props.on_press {
        props_text.push_str(&format!(" onPress={{{}}}", source_text(source, on_press)));
    }
    for (name, value) in [
        (
            "onStartShouldSetResponder",
            node.props.on_start_should_set_responder,
        ),
        (
            "onStartShouldSetResponderCapture",
            node.props.on_start_should_set_responder_capture,
        ),
        (
            "onMoveShouldSetResponder",
            node.props.on_move_should_set_responder,
        ),
        (
            "onMoveShouldSetResponderCapture",
            node.props.on_move_should_set_responder_capture,
        ),
        ("onResponderGrant", node.props.on_responder_grant),
        ("onResponderStart", node.props.on_responder_start),
        ("onResponderMove", node.props.on_responder_move),
        ("onResponderEnd", node.props.on_responder_end),
        ("onResponderRelease", node.props.on_responder_release),
        ("onResponderReject", node.props.on_responder_reject),
        ("onResponderTerminate", node.props.on_responder_terminate),
        (
            "onResponderTerminationRequest",
            node.props.on_responder_termination_request,
        ),
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
        props_text.push_str(&format!(
            " focusable={{{}}}",
            render_condition_expr(source, focusable)
        ));
    }
    if let Some(disabled) = &node.props.disabled {
        let disabled = render_condition_expr(source, disabled);
        props_text.push_str(&format!(" disabled={{{disabled}}}"));
        if matches!(node.primitive, Primitive::Button | Primitive::Pressable) {
            props_text.push_str(&format!(
                " accessibilityState={{{{ disabled: Boolean({disabled}) }}}}"
            ));
        }
    }
    let destination_primitive = node.primitive == Primitive::Link
        || node.primitive == Primitive::Svg(SvgElement::Link)
        || (matches!(node.primitive, Primitive::Button | Primitive::Pressable)
            && node
                .props
                .passthrough
                .iter()
                .any(|prop| prop.name.as_deref() == Some("href")));
    if destination_primitive {
        if let Some(replace) = &node.props.navigation_replace {
            props_text.push_str(&format!(
                " replace={{{}}}",
                render_condition_expr(source, replace)
            ));
        }
        if let Some(prefetch) = &node.props.navigation_prefetch {
            props_text.push_str(&format!(
                " prefetch={{{}}}",
                render_condition_expr(source, prefetch)
            ));
        }
    }
    // A component's other class lists (`ClassSlot`), which on this platform
    // are style props: `removeClassName="p-2"` is `removeStyle={…}`. The same
    // lowering as `className`, so a breakpoint or `dark:` works here as it
    // does there and an interaction state is reported the same way. Written
    // as an expression, it is resolved on device from the candidate map,
    // as `className` is. Registered pattern slots must keep the expression
    // until their actual owner supplies its facts: resolving here would lose
    // that owner's hover/focus/semantic state. Other slots retain the plain
    // style fallback. An authored slot style still follows its class styles.
    let prop_expr = |prop: &hozo_ir::PassthroughProp| -> Option<String> {
        let text = &source[prop.span.0.start as usize..prop.span.0.end as usize];
        let value = text.split_once('=')?.1.trim();
        value
            .strip_prefix('{')
            .and_then(|inner| inner.strip_suffix('}'))
            .map(|inner| inner.trim().to_string())
    };
    for slot in node.primitive.class_slots() {
        let mut parts: Vec<String> = Vec::new();
        if let Some(written) = node
            .props
            .class_slots
            .iter()
            .find(|written| written.slot == *slot)
        {
            let mut pressed = Vec::new();
            // Only a catalogued real input can consume placeholder colour.
            // All other pseudo-element declarations still reach diagnostics;
            // this is a prop adaptation, not a general pseudo-style escape.
            // Not `Option::zip`, which clippy suggests: zip evaluates both
            // sides, and `placeholder_value` registers runtime needs (the
            // dark-scheme hook), which a slot with no placeholder prop must
            // not import.
            let placeholder = if let Some(prop) =
                crate::pattern::placeholder_color_prop(node.primitive, slot.class_prop)
            {
                crate::text::placeholder_value(&written.style, cx.theme, cx.runtime)
                    .map(|value| (prop, value))
            } else {
                None
            };
            let field_style: Option<Vec<_>> = placeholder.as_ref().map(|_| {
                written
                    .style
                    .iter()
                    .filter(|declaration| placeholder_colour(declaration).is_none())
                    .cloned()
                    .collect()
            });
            if let Some((prop, value)) = placeholder {
                props_text.push_str(&format!(" {prop}={{{value}}}"));
            }
            let target = crate::conditions::StyleTarget {
                node,
                position,
                interaction_context: false,
                pattern_slot: Some(slot.class_prop),
            };
            let state_start = build_style_entries(
                field_style.as_deref().unwrap_or(&written.style),
                &cx.allocator.alloc(),
                &target,
                &mut parts,
                &mut pressed,
                None,
                cx,
            );
            let expressions = written
                .fallback
                .iter()
                .map(|expr| {
                    written.evaluation.as_ref().map_or_else(
                        || source_text(source, *expr).to_string(),
                        |evaluation| evaluation.value(source, *expr),
                    )
                })
                .collect::<Vec<_>>();
            let route = crate::class_route::PatternClasses::new(
                node.primitive,
                slot.class_prop,
                expressions.clone(),
                !parts.is_empty() || !pressed.is_empty(),
                source,
                written.evaluation.as_deref(),
            );
            for _ in &expressions {
                cx.diagnostics.push(Diagnostic {
                    code: DiagnosticCode::DynamicClassNameNotResolved,
                    severity: Severity::Warning,
                    message: format!("`{}` retains an opaque class expression resolved from the project-wide candidate map{}; use a static string for build-time validation.", slot.class_prop, if route.is_some() { " with its owner's available state" } else { "" }),
                    span: written.span,
                });
            }
            let residuals = route.as_ref().map_or_else(
                || {
                    expressions
                        .iter()
                        .map(|expr| {
                            crate::class_route::residual(node.primitive, slot.class_prop, expr)
                        })
                        .collect()
                },
                |route| route.residuals(),
            );
            parts.splice(state_start..state_start, residuals);
            if let Some(route) = route {
                parts.extend(pressed);
                held.emit(&mut props_text, &route.prop(&parts));
                parts.clear();
            } else if !pressed.is_empty() {
                parts.extend(pressed);
                let style_prop =
                    crate::pattern::interaction_style_prop(node.primitive, slot.class_prop)
                        .expect("a pattern interaction guard requires a consuming slot");
                let callback =
                    crate::class_route::static_callback(node.primitive, slot.class_prop, &parts);
                held.emit(&mut props_text, &format!(" {style_prop}={{{callback}}}"));
                parts.clear();
            }
            if let Some(evaluation) = written.evaluation.as_ref().filter(|_| {
                crate::pattern::interaction_slot(node.primitive, slot.class_prop).is_none()
            }) {
                // No interactive owner: compute the slot's style now,
                // keeping authored predicates outside later callbacks.
                let result = evaluation.wrap(source, &format!("[{}]", parts.join(", ")));
                parts.clear();
                parts.push(result);
            }
        }
        for prop in node
            .props
            .passthrough
            .iter()
            .filter(|prop| prop.name.as_deref() == Some(slot.class_prop))
        {
            let Some(expr) = prop_expr(prop) else {
                continue;
            };
            let owned = crate::pattern::interaction_slot(node.primitive, slot.class_prop).is_some();
            let has_facts =
                crate::pattern::constant_facts(node.primitive, slot.class_prop).is_some();
            cx.diagnostics.push(Diagnostic {
                code: DiagnosticCode::DynamicClassNameNotResolved,
                severity: Severity::Warning,
                message: if owned || has_facts {
                    format!(
                        "`{}` can't be resolved at build time. Its pattern slot resolves it on device \
                         from the project-wide candidate map with that owner's available state. \
                         Unscanned candidates and unsupported conditions still warn at runtime; \
                         use a static string for build-time validation.",
                        slot.class_prop
                    )
                } else {
                    format!(
                        "`{}` can't be resolved at build time, so it's resolved on device from the \
                         project-wide candidate map. Conditional utilities can't be carried that way \
                         and will warn at runtime -- write those as a static string so they compile.",
                        slot.class_prop
                    )
                },
                span: node.span,
            });
            if owned {
                let route = crate::class_route::PatternClasses::new(
                    node.primitive,
                    slot.class_prop,
                    vec![expr],
                    false,
                    source,
                    None,
                )
                .expect("registered above");
                held.emit(&mut props_text, &route.prop(&[]));
            } else {
                parts.push(crate::class_route::residual(
                    node.primitive,
                    slot.class_prop,
                    &expr,
                ));
            }
        }
        parts.extend(
            node.props
                .passthrough
                .iter()
                .filter(|prop| prop.name.as_deref() == Some(slot.style_prop))
                .filter_map(prop_expr),
        );
        match parts.len() {
            0 => {}
            1 => held.emit(
                &mut props_text,
                &format!(" {}={{{}}}", slot.style_prop, parts[0]),
            ),
            _ => held.emit(
                &mut props_text,
                &format!(" {}={{[{}]}}", slot.style_prop, parts.join(", ")),
            ),
        }
    }
    // Everything Hozo doesn't model, re-emitted verbatim and last so JSX's
    // last-wins duplicate resolution keeps matching the source's own
    // ordering semantics.
    let mut rendered: Vec<(&hozo_ir::PassthroughProp, String)> = Vec::new();
    for prop in &node.props.passthrough {
        if node.primitive == Primitive::Button {
            if prop
                .name
                .as_deref()
                .is_some_and(|name| name.starts_with("data-"))
            {
                cx.diagnostics.push(Diagnostic {
                    code: DiagnosticCode::WebOnlyPropertyOnNative,
                    severity: Severity::Warning,
                    message: "Button `data-*` metadata requires a Web DOM dataset; React Native does not consume it. Use nativeID for a shared host identifier; metadata is not mapped to accessibility props.".to_string(),
                    span: prop.span.0,
                });
            }
            if prop.is_spread {
                let raw = source_text(source, prop.span);
                if let Some(expression) = raw
                    .trim()
                    .strip_prefix('{')
                    .and_then(|text| text.strip_suffix('}'))
                    .and_then(|text| text.trim().strip_prefix("..."))
                {
                    cx.runtime.need_component("hozoButtonProps");
                    rendered.push((prop, format!("{{...hozoButtonProps({expression})}}")));
                    continue;
                }
            }
        }
        // Already in the style array above.
        if prop.name.as_deref() == Some("style") {
            continue;
        }
        // Already lowered into a style prop just above.
        if node.primitive.class_slots().iter().any(|slot| {
            prop.name.as_deref() == Some(slot.class_prop)
                || prop.name.as_deref() == Some(slot.style_prop)
        }) {
            continue;
        }
        // Already translated into `accessibilityValue` above, and a View
        // does nothing with either.
        if node.primitive == Primitive::Progress
            && matches!(prop.name.as_deref(), Some("value") | Some("max"))
        {
            continue;
        }

        // A link's browser-only props. React Native's Pressable ignores
        // them, so they were harmless -- but still claimed behavior the
        // platform does not have. `external` is deliberately retained:
        // HozoLink uses it to bypass an installed application router.
        // `download` is diagnosed where the component is chosen.
        if matches!(node.primitive, Primitive::Button | Primitive::Pressable)
            && matches!(
                prop.name.as_deref(),
                Some("target") | Some("rel") | Some("download")
            )
        {
            continue;
        }
        // A rule's own two props, which are Hozo's words rather than React
        // Native's. `decorative` picks the role in `markup.rs` and
        // `orientation` picks which side gets the one pixel; a `View` does
        // nothing with either, and passing them on was two props claiming
        // something the platform does not read.
        if node.primitive == Primitive::Separator
            && matches!(
                prop.name.as_deref(),
                Some("decorative") | Some("orientation")
            )
        {
            continue;
        }
        rendered.push((
            prop,
            render_verbatim(
                prop.span,
                &prop.nested,
                &descend,
                child_interaction_context,
                cx,
            ),
        ));
    }
    // Held styles go through the spreads, with whatever sits between them,
    // in source order. A shape between the spreads that cannot be taken
    // apart keeps the old emission rather than a guessed one.
    let spreads: Vec<usize> = (0..rendered.len())
        .filter(|&index| rendered[index].0.is_spread)
        .collect();
    let group = match (held.held.is_empty(), spreads.first(), spreads.last()) {
        (false, Some(&first), Some(&last)) => rendered[first..=last]
            .iter()
            .map(|(prop, text)| {
                if prop.is_spread {
                    crate::spread_style::spread_expression(text).map(str::to_string)
                } else {
                    crate::spread_style::attribute_object(text)
                }
            })
            .collect::<Option<Vec<_>>>()
            .map(|args| (first, last, args)),
        _ => None,
    };
    match group {
        Some((first, last, args)) => {
            let after = rendered[last].0.span.0.start;
            let written_last: Vec<String> = held
                .held
                .iter()
                .map(|(name, _)| name.clone())
                .filter(|name| {
                    node.props.passthrough.iter().any(|prop| {
                        !prop.is_spread
                            && prop.name.as_deref() == Some(name.as_str())
                            && prop.span.0.start > after
                    })
                })
                .collect();
            cx.runtime.need_component("hozoSpreadStyles");
            for (_, text) in &rendered[..first] {
                props_text.push(' ');
                props_text.push_str(text);
            }
            props_text.push_str(&crate::spread_style::helper_call(
                &held.held,
                &written_last,
                &args,
            ));
            for (_, text) in &rendered[last + 1..] {
                props_text.push(' ');
                props_text.push_str(text);
            }
        }
        None => {
            for (name, value) in &held.held {
                props_text.push_str(&format!(" {name}={{{value}}}"));
            }
            for (_, text) in &rendered {
                props_text.push(' ');
                props_text.push_str(text);
            }
        }
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
                    child_interaction_context,
                    AncestorContext {
                        inherited: &descend,
                        parent_font_size: current_font_size,
                        parent_size_opaque: parent_size_opaque || opaque_here,
                        in_dynamic_ruby: node.primitive == Primitive::Ruby
                            && component == "HozoRuby",
                        from_ancestor: FromAncestor {
                            direct: &to_children,
                            all: &descendants,
                            in_skeleton: from_ancestor.in_skeleton
                                || node.primitive == Primitive::Skeleton,
                        },
                        grid_columns: grid.as_ref().and_then(|grid| grid.track_count),
                        grid_rows: grid.as_ref().and_then(|grid| grid.row_track_count),
                    },
                    cx,
                ));
            }
            hozo_ir::Child::Text(text) => {
                let text = if node.primitive == Primitive::NoBreak {
                    text.replace(' ', "\u{00A0}")
                } else {
                    text.clone()
                };
                let escaped = escape_jsx_text(&text);
                // `SvgText` holds a string itself, so wrapping one in React
                // Native's `Text` puts a text node where an SVG element
                // belongs -- the string vanishes rather than rendering.
                // The wrapper exists because a bare string inside a `View`
                // crashes; inside `<Svg.Text>` there is nothing to fix.
                let holds_text = renders_text(component) || component == "SvgText";
                inner.push_str(&if !holds_text {
                    wrap_in_text(
                        &escaped,
                        &descend,
                        &base_name,
                        node,
                        position,
                        child_interaction_context,
                        cx,
                    )
                } else {
                    escaped
                });
            }
            hozo_ir::Child::Verbatim {
                source: expr_ref,
                nested,
            } => {
                inner.push_str(&render_verbatim(
                    *expr_ref,
                    nested,
                    &descend,
                    child_interaction_context,
                    cx,
                ));
            }
        }
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
        format!(
            "<HozoGrid tracks={{{}}}{row_tracks} columnGap={{{}}} rowGap={{{}}}>{inner}</HozoGrid>",
            grid.tracks_js, grid.column_gap, grid.row_gap
        )
    } else {
        spaced_children(inner, &child_declarations, &base_name, node, position, cx)
    };

    // React Native's TextInput takes no children either.
    let tag = if measures_host {
        "HozoContainer"
    } else {
        rendered_component
    };
    let rendered = if component == "TextInput"
        || rendered_component == "HozoTextInput"
        || component == "Image"
    {
        format!("<{tag}{props_text} />")
    } else {
        format!("<{tag}{props_text}>{inner}</{tag}>")
    };
    // Inside the grid item rather than outside it: `HozoGrid` reads its
    // children's types to place them, so anything between the two would
    // make a grid item stop looking like one.
    let rendered = if uses_container_query {
        cx.runtime.need_component("HozoContainerQuery");
        format!("<HozoContainerQuery>{{(__hozoCq) => ({rendered})}}</HozoContainerQuery>")
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
        format!(
            "<HozoGridItem columnSpan={{{}}}{start}{row_span}{row_start}>{rendered}</HozoGridItem>",
            item.span
        )
    } else {
        rendered
    };
    if let Some(evaluation) = node.root_class_evaluation() {
        evaluation.wrap_subtree(source, &rendered)
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
        property: declaration.property.clone(),
        condition,
    }
}
