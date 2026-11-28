//! The element's declarations that are neither a React Native style nor
//! lowered elsewhere: each is reported, as Web-only or as not yet wired.

use super::*;

/// What earlier steps of `render_node` already lowered into props or
/// another channel, so their declarations are neither styles nor refusals.
#[derive(Clone, Copy)]
pub(super) struct Lowered {
    pub(super) svg_paint: bool,
    pub(super) grid: bool,
    pub(super) grid_item: bool,
    pub(super) transition: bool,
    pub(super) truncation: bool,
    pub(super) text_break: bool,
    pub(super) ios_line_break: bool,
    pub(super) keyframes: bool,
    pub(super) self_measured: bool,
    pub(super) parent_measured: bool,
    pub(super) parent_measured_space: bool,
}

pub(super) fn native_backdrop_filter(
    declaration: &StyleDeclaration,
    runtime: &mut RuntimeNeeds,
) -> Option<NativeBackdropFilter> {
    if declaration.condition != Condition::Always {
        return None;
    }
    match &declaration.property {
        StyleProperty::BackdropFilter(FilterFunction::None, _) => Some(NativeBackdropFilter::None),
        StyleProperty::BackdropFilter(FilterFunction::Blur, value) => {
            let inner = value.strip_prefix("blur(")?.strip_suffix(')')?;
            if let Some(px) = hozo_ir::resolve_native_length_px(inner).filter(|px| *px >= 0.0) {
                return Some(NativeBackdropFilter::Blur(px.to_string()));
            }
            let expr = crate::layout::viewport_length_str(inner, true)?;
            runtime.hooks.push(RuntimeHook::Viewport);
            Some(NativeBackdropFilter::Blur(expr))
        }
        _ => None,
    }
}

/// Reports every declaration in `style` this platform cannot hold, and
/// returns the unconditional backdrop filter, which is rendered as a host.
pub(super) fn report_refused(
    style: &[StyleDeclaration],
    elsewhere: Lowered,
    node: &Node,
    theme: &Theme,
    runtime: &mut RuntimeNeeds,
    diagnostics: &mut Vec<Diagnostic>,
) -> Option<NativeBackdropFilter> {
    let mut backdrop_filter = None;

    for declaration in style {
        if is_viewport_sized(&declaration.property)
            || crate::measured::is_container_sized(&declaration.property)
            || (elsewhere.self_measured && crate::measured::is_self_measured(&declaration.property))
            || (elsewhere.parent_measured
                && crate::measured::is_parent_measured(&declaration.property))
            || (elsewhere.parent_measured_space
                && crate::measured::is_parent_measured_space(&declaration.property))
        {
            continue;
        }
        // Parent-relative `%`-mixed `calc()` without a measurable same-component
        // parent (component root, custom component boundary, ScrollView/FlatList,
        // HozoGrid cell, or `display: contents`). See Decision 015.
        if !elsewhere.parent_measured {
            if let Some(css) = crate::measured::parent_measured_css_text(&declaration.property) {
                diagnostics.push(Diagnostic {
                    code: DiagnosticCode::WebOnlyPropertyOnNative,
                    severity: Severity::Error,
                    message: format!(
                        "`{css}` resolves `%` against a parent box Hozo cannot measure from this \
                         component (component root, custom component boundary, `ScrollView`/`FlatList`, \
                         `HozoGrid` cell, or `display: contents`). Put `@container` on the ancestor \
                         and use `cqw`/`cqh` (e.g. `calc(100cqw - 2rem)`), keep the parent `<View>` \
                         in the same component, or use flex/viewport sizing -- see \
                         docs/decisions/015-parent-calc-stays-within-the-component.md."
                    ),
                    span: node.span,
                });
                continue;
            }
        }
        // Lowered as a prop just above, so it must not also be reported as
        // a style this platform cannot hold.
        if elsewhere.svg_paint
            && match &declaration.property {
                StyleProperty::Fill(c) | StyleProperty::Stroke(c) => c.is_valid_native_color(),
                StyleProperty::StrokeWidth(width) => width.px(theme).is_some(),
                _ => false,
            }
        {
            continue;
        }
        if elsewhere.grid && grid_absorbs(&declaration.property) {
            continue;
        }
        if !elsewhere.grid
            && matches!(declaration.property, StyleProperty::GridTemplateRows(_))
            && crate::grid::grid_rows_needs_definite_height(style)
        {
            diagnostics.push(Diagnostic {
                code: DiagnosticCode::WebOnlyPropertyOnNative,
                severity: Severity::Error,
                message: "`grid-template-rows` with `%` or `%`-mixed `calc()` requires a definite \
                          height on the grid container on React Native (e.g. `h-64`, `h-screen`, \
                          or `h-full`); on an auto-height grid, percentage row tracks are indefinite."
                    .to_string(),
                span: node.span,
            });
            continue;
        }
        if let Some(filter) = native_backdrop_filter(declaration, runtime) {
            backdrop_filter = Some(filter);
            continue;
        }
        if elsewhere.grid_item
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
        if elsewhere.transition
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
        if elsewhere.truncation && is_truncation_declaration(&declaration.property) {
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
                let lowered = elsewhere.text_break
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
                    let keep_all_on_text = elsewhere.ios_line_break
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
                    diagnostics.push(Diagnostic {
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
        if elsewhere.keyframes && crate::keyframes::is_timing(&declaration.property) {
            continue;
        }
        if let StyleProperty::PlaceholderColor(color) = &declaration.property {
            if color.is_valid_native_color() {
                if let Some(reason) = placeholder_only_reason(&declaration.property) {
                    let reason = if node.primitive == Primitive::TextInput {
                        "this condition cannot drive TextInput's placeholderTextColor prop on React Native".to_string()
                    } else {
                        reason
                    };
                    diagnostics.push(unwired_variant(node, &reason, Severity::Error));
                    continue;
                }
            }
        }
        if let StyleProperty::CaretColor(color) = &declaration.property {
            if color.is_valid_native_color() {
                let reason = if node.primitive == Primitive::TextInput {
                    "this condition cannot drive TextInput's cursorColor prop on React Native"
                        .to_string()
                } else {
                    caret_only_reason()
                };
                diagnostics.push(unwired_variant(node, &reason, Severity::Error));
                continue;
            }
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
        if let Some(reason) = declaration.property.unsupported_on_native_with_theme(theme) {
            diagnostics.push(Diagnostic {
                code: DiagnosticCode::WebOnlyPropertyOnNative,
                severity: Severity::Error,
                message: format!("{reason} -- this utility is Web-only."),
                span: node.span,
            });
        }
    }
    backdrop_filter
}
