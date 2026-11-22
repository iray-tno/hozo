//! One JSX element converted into a `Node`.

use hozo_ir::{
    Child, ConditionExpr, Diagnostic, DiagnosticCode, HeadingLevel, Node, PassthroughProp,
    Primitive, PropSet, Severity, SourceSpan, StyleDeclaration, SvgElement,
};
use oxc_ast::ast::{
    JSXAttributeItem, JSXAttributeName, JSXAttributeValue, JSXChild, JSXElement, JSXElementName,
    JSXExpression,
};
use oxc_ast_visit::Visit;
use oxc_span::GetSpan;

use super::class_name;
use super::finder::PrimitiveFinder;
use super::props::{
    attribute_literal, capture_flag, capture_literal, capture_prop_expr, carry_verbatim,
    object_literal_keys, passthrough_prop,
};
use super::role::accessibility_role_from_value;
use super::scope::Scope;
use super::text::{clean_jsx_text, decode_jsx_entities};
use super::validate::{
    validate_enter_motion, validate_flex_direction, validate_focusable_disabled,
    validate_semantic_children,
};
use super::{root_capture, to_expr_ref, to_span};

/// Builds a `Node` from a JSX element recognized as a Hozo primitive.
/// Returns `None` for elements Hozo doesn't model in Phase 0 (unknown
/// components, intrinsic HTML tags, namespaced/member-expression names).
pub(super) fn build_node(
    el: &JSXElement,
    scope: &Scope,
    diagnostics: &mut Vec<Diagnostic>,
    consumed: &mut Vec<SourceSpan>,
    expression_container: bool,
) -> Option<Node> {
    let (local, primitive) = match &el.opening_element.name {
        JSXElementName::IdentifierReference(ident) => (
            ident.name.as_str(),
            scope.primitive_for_local(ident.name.as_str())?,
        ),
        // `<Svg.Rect>` and `<TermList.Term>`. Member expressions Hozo reads.
        JSXElementName::MemberExpression(member) => {
            let object = member.object.get_identifier()?;
            if object.name.as_str() == "Svg" {
                let element = SvgElement::from_name(member.property.name.as_str())?;
                (object.name.as_str(), Primitive::Svg(element))
            } else if object.name.as_str() == "Ruby" {
                // `<Ruby.RubyText>` as well as `<RubyText>`, the way
                // `TermList` reads both spellings. The member keeps the
                // full name rather than shortening to `Text`: the flat
                // export has to be readable on its own, and a `<Text>`
                // that meant the annotation would not be.
                let prim = match member.property.name.as_str() {
                    "RubyText" => Primitive::RubyText,
                    _ => return None,
                };
                (object.name.as_str(), prim)
            } else if object.name.as_str() == "TermList" {
                let prim = match member.property.name.as_str() {
                    "Term" => Primitive::Term,
                    "Description" => Primitive::Description,
                    _ => return None,
                };
                (object.name.as_str(), prim)
            } else if scope.animated_namespaces.contains(object.name.as_str())
                && member.property.name.as_str() == "View"
            {
                (object.name.as_str(), Primitive::AnimatedView)
            } else {
                return None;
            }
        }
        _ => return None,
    };
    // A name the project's own components own. Declining here is what
    // turns it into a `Child::Verbatim` at the call site -- carried and
    // re-emitted from source, the same treatment any unmodeled component
    // gets -- so the tree around it still compiles.
    if scope.foreign.contains(local) {
        return None;
    }

    let mut style: Vec<StyleDeclaration> = Vec::new();
    let mut class_name_fallback = Vec::new();
    let mut carried_classes: Vec<String> = Vec::new();
    let mut props = PropSet::default();
    let mut seen_class_name = false;
    // Every named attribute and where it starts, so a spread can know which
    // of them come after it (`PassthroughProp::later_names`).
    let named: Vec<(u32, String)> = el
        .opening_element
        .attributes
        .iter()
        .filter_map(|item| match item {
            JSXAttributeItem::Attribute(attr) => match &attr.name {
                JSXAttributeName::Identifier(name) => {
                    Some((attr.span.start, name.name.to_string()))
                }
                JSXAttributeName::NamespacedName(_) => None,
            },
            JSXAttributeItem::SpreadAttribute(_) => None,
        })
        .collect();
    for attr_item in &el.opening_element.attributes {
        let attr = match attr_item {
            JSXAttributeItem::Attribute(attr) => attr,
            JSXAttributeItem::SpreadAttribute(spread) => {
                match scope.stylex.resolve_props(&spread.argument) {
                    crate::stylex::Resolution::Ready(declarations) => {
                        // Styling input, not an opaque prop spread. Appending
                        // here preserves order with className and reuses the
                        // IR's normal last-wins behavior.
                        style.extend(declarations.into_iter().map(|mut declaration| {
                            declaration.source = hozo_ir::StyleSource::Stylex(spread.span.start);
                            declaration
                        }));
                        continue;
                    }
                    crate::stylex::Resolution::Partial {
                        declarations,
                        residual,
                        gaps,
                    } => {
                        style.extend(declarations.into_iter().map(|mut declaration| {
                            declaration.source = hozo_ir::StyleSource::Stylex(spread.span.start);
                            declaration
                        }));
                        props.stylex_residuals.push(residual);
                        diagnostics.extend(gaps.into_iter().map(|gap| Diagnostic {
                            code: DiagnosticCode::StylexNotLowered,
                            severity: Severity::Warning,
                            message: gap.message,
                            span: gap.span,
                        }));
                        continue;
                    }
                    crate::stylex::Resolution::Gap { message, span } => {
                        diagnostics.push(Diagnostic {
                            code: DiagnosticCode::StylexNotLowered,
                            severity: Severity::Warning,
                            message,
                            span,
                        });
                    }
                    crate::stylex::Resolution::NotStylex => {}
                }
                if seen_class_name {
                    // JSX resolves duplicate props last-wins, so a spread
                    // *after* className can override Hozo's compiled
                    // classes at runtime with whatever the spread carries.
                    // The spread is still emitted (dropping it would be
                    // worse) -- this just refuses to let it happen silently.
                    diagnostics.push(Diagnostic {
                        code: DiagnosticCode::UnsafePropSpreadAfterStyle,
                        severity: Severity::Warning,
                        message: "Prop spread appears after className and may override Hozo's \
                                  compiled styles at runtime. Move the spread before className."
                            .to_string(),
                        span: to_span(spread.span()),
                    });
                }
                // The spread is opaque; the primitives written inside it
                // (`{...withFooter(<Text className="p-2" />)}`) are not, and
                // lower like those in any other carried expression.
                let mut finder = PrimitiveFinder {
                    scope,
                    diagnostics,
                    consumed,
                    nested: Vec::new(),
                    enclosing: Vec::new(),
                    expression_container: false,
                };
                finder.visit_expression(&spread.argument);
                let nested = finder.nested;
                props.passthrough.push(PassthroughProp {
                    span: to_expr_ref(spread.span()),
                    is_spread: true,
                    class_literals: Vec::new(),
                    later_names: named
                        .iter()
                        .filter(|(start, _)| *start > spread.span.start)
                        .map(|(_, name)| name.clone())
                        .collect(),
                    name: None,
                    literal: None,
                    nested,
                    spread_excludes: match &spread.argument {
                        oxc_ast::ast::Expression::Identifier(id) => scope
                            .rest_exclusions
                            .get(&id.span.start)
                            .cloned()
                            .unwrap_or_default(),
                        _ => Vec::new(),
                    },
                });
                continue;
            }
        };
        let JSXAttributeName::Identifier(attr_name) = &attr.name else {
            // Namespaced names (`xlink:href`) aren't modeled, but must
            // still survive to output rather than being dropped.
            props
                .passthrough
                .push(passthrough_prop(attr, scope, diagnostics, consumed));
            continue;
        };
        match attr_name.name.as_str() {
            "className" => {
                seen_class_name = true;
                // `className={"p-2 group"}` is the same list as
                // `className="p-2 group"`, and is read the same way. Read
                // as an expression, one class Hozo does not compile sent
                // the whole literal back to runtime -- the compiled ones
                // with it -- where the attribute form carries just that
                // class. The owner-class path builds every caller's list in
                // this form, so it refused `group` and `peer`.
                let literal = match &attr.value {
                    Some(JSXAttributeValue::StringLiteral(literal)) => Some(&**literal),
                    Some(JSXAttributeValue::ExpressionContainer(container)) => {
                        match &container.expression {
                            JSXExpression::StringLiteral(literal) => Some(&**literal),
                            _ => None,
                        }
                    }
                    _ => None,
                };
                match (literal, &attr.value) {
                    (Some(literal), _) => {
                        // Every token here is compiled unconditionally, so
                        // the whole literal is accounted for and the
                        // candidate scan skips it (see `crate::scan`).
                        consumed.push(to_span(literal.span()));
                        let (declarations, carried) = class_name::read_literal(
                            literal,
                            primitive,
                            scope,
                            attr.span.start,
                            diagnostics,
                        );
                        style.extend(declarations);
                        carried_classes.extend(carried);
                    }
                    (None, Some(JSXAttributeValue::ExpressionContainer(container))) => {
                        let (decomposed, capture) = class_name::read_expression(
                            &container.expression,
                            attr.span,
                            el,
                            scope,
                            expression_container,
                            diagnostics,
                        );
                        props.class_slots.extend(capture);
                        style.extend(decomposed.declarations.into_iter().map(|mut declaration| {
                            declaration.source =
                                declaration.source.with_tailwind_input(attr.span.start);
                            declaration
                        }));
                        class_name_fallback.extend(decomposed.fallback);
                        consumed.extend(decomposed.consumed);
                    }
                    _ => {}
                }
            }
            // Opaque, like a className-guard condition: never evaluated,
            // just threaded through by span for a later codegen stage to
            // re-emit verbatim. `disabled` below additionally has a static
            // shorthand form, which needs no source expression span.
            // A runtime component's second class list (`ClassSlot`), read
            // the way a static `className` is. Expressions below share the
            // root decomposer, retaining opaque leaves rather than losing
            // either AOT declarations or the actual slot owner's state.
            name if primitive
                .class_slots()
                .iter()
                .any(|slot| slot.class_prop == name)
                && matches!(&attr.value, Some(JSXAttributeValue::StringLiteral(_))) =>
            {
                let Some(JSXAttributeValue::StringLiteral(literal)) = &attr.value else {
                    unreachable!("matched as a string literal above")
                };
                let slot = *primitive
                    .class_slots()
                    .iter()
                    .find(|slot| slot.class_prop == name)
                    .expect("matched as a slot above");
                consumed.push(to_span(literal.span()));
                let (style, carried) =
                    class_name::read_slot_literal(literal, scope, attr.span.start);
                props.class_slots.push(hozo_ir::SlotStyle {
                    slot,
                    style,
                    carried,
                    fallback: Vec::new(),
                    evaluation: None,
                    span: to_span(attr.span()),
                });
            }
            name if primitive
                .class_slots()
                .iter()
                .any(|slot| slot.class_prop == name) =>
            {
                let Some(JSXAttributeValue::ExpressionContainer(container)) = &attr.value else {
                    props
                        .passthrough
                        .push(passthrough_prop(attr, scope, diagnostics, consumed));
                    continue;
                };
                let Some((decomposed, evaluation)) =
                    class_name::read_slot_expression(&container.expression, scope, diagnostics)
                else {
                    props
                        .passthrough
                        .push(passthrough_prop(attr, scope, diagnostics, consumed));
                    continue;
                };
                consumed.extend(decomposed.consumed);
                let slot = *primitive
                    .class_slots()
                    .iter()
                    .find(|slot| slot.class_prop == name)
                    .expect("matched above");
                props.class_slots.push(hozo_ir::SlotStyle {
                    slot,
                    style: decomposed.declarations,
                    carried: Vec::new(),
                    fallback: decomposed.fallback,
                    evaluation: evaluation.map(Box::new),
                    span: to_span(attr.span()),
                });
            }
            "onPress" => match &attr.value {
                Some(JSXAttributeValue::ExpressionContainer(container)) => {
                    props.on_press = Some(to_expr_ref(container.expression.span()));
                }
                _ => props
                    .passthrough
                    .push(passthrough_prop(attr, scope, diagnostics, consumed)),
            },
            "onStartShouldSetResponder"
                if matches!(
                    primitive,
                    Primitive::View
                        | Primitive::Pressable
                        | Primitive::TouchableOpacity
                        | Primitive::TouchableWithoutFeedback
                ) =>
            {
                capture_prop_expr(
                    attr,
                    &mut props.on_start_should_set_responder,
                    &mut props.passthrough,
                    scope,
                    diagnostics,
                    consumed,
                )
            }
            "onStartShouldSetResponderCapture"
                if matches!(
                    primitive,
                    Primitive::View
                        | Primitive::Pressable
                        | Primitive::TouchableOpacity
                        | Primitive::TouchableWithoutFeedback
                ) =>
            {
                capture_prop_expr(
                    attr,
                    &mut props.on_start_should_set_responder_capture,
                    &mut props.passthrough,
                    scope,
                    diagnostics,
                    consumed,
                )
            }
            "onMoveShouldSetResponder"
                if matches!(
                    primitive,
                    Primitive::View
                        | Primitive::Pressable
                        | Primitive::TouchableOpacity
                        | Primitive::TouchableWithoutFeedback
                ) =>
            {
                capture_prop_expr(
                    attr,
                    &mut props.on_move_should_set_responder,
                    &mut props.passthrough,
                    scope,
                    diagnostics,
                    consumed,
                )
            }
            "onMoveShouldSetResponderCapture"
                if matches!(
                    primitive,
                    Primitive::View
                        | Primitive::Pressable
                        | Primitive::TouchableOpacity
                        | Primitive::TouchableWithoutFeedback
                ) =>
            {
                capture_prop_expr(
                    attr,
                    &mut props.on_move_should_set_responder_capture,
                    &mut props.passthrough,
                    scope,
                    diagnostics,
                    consumed,
                )
            }
            "onResponderGrant"
                if matches!(
                    primitive,
                    Primitive::View
                        | Primitive::Pressable
                        | Primitive::TouchableOpacity
                        | Primitive::TouchableWithoutFeedback
                ) =>
            {
                capture_prop_expr(
                    attr,
                    &mut props.on_responder_grant,
                    &mut props.passthrough,
                    scope,
                    diagnostics,
                    consumed,
                )
            }
            "onResponderStart"
                if matches!(
                    primitive,
                    Primitive::View
                        | Primitive::Pressable
                        | Primitive::TouchableOpacity
                        | Primitive::TouchableWithoutFeedback
                ) =>
            {
                capture_prop_expr(
                    attr,
                    &mut props.on_responder_start,
                    &mut props.passthrough,
                    scope,
                    diagnostics,
                    consumed,
                )
            }
            "onResponderMove"
                if matches!(
                    primitive,
                    Primitive::View
                        | Primitive::Pressable
                        | Primitive::TouchableOpacity
                        | Primitive::TouchableWithoutFeedback
                ) =>
            {
                capture_prop_expr(
                    attr,
                    &mut props.on_responder_move,
                    &mut props.passthrough,
                    scope,
                    diagnostics,
                    consumed,
                )
            }
            "onResponderEnd"
                if matches!(
                    primitive,
                    Primitive::View
                        | Primitive::Pressable
                        | Primitive::TouchableOpacity
                        | Primitive::TouchableWithoutFeedback
                ) =>
            {
                capture_prop_expr(
                    attr,
                    &mut props.on_responder_end,
                    &mut props.passthrough,
                    scope,
                    diagnostics,
                    consumed,
                )
            }
            "onResponderRelease"
                if matches!(
                    primitive,
                    Primitive::View
                        | Primitive::Pressable
                        | Primitive::TouchableOpacity
                        | Primitive::TouchableWithoutFeedback
                ) =>
            {
                capture_prop_expr(
                    attr,
                    &mut props.on_responder_release,
                    &mut props.passthrough,
                    scope,
                    diagnostics,
                    consumed,
                )
            }
            "onResponderReject"
                if matches!(
                    primitive,
                    Primitive::View
                        | Primitive::Pressable
                        | Primitive::TouchableOpacity
                        | Primitive::TouchableWithoutFeedback
                ) =>
            {
                capture_prop_expr(
                    attr,
                    &mut props.on_responder_reject,
                    &mut props.passthrough,
                    scope,
                    diagnostics,
                    consumed,
                )
            }
            "onResponderTerminate"
                if matches!(
                    primitive,
                    Primitive::View
                        | Primitive::Pressable
                        | Primitive::TouchableOpacity
                        | Primitive::TouchableWithoutFeedback
                ) =>
            {
                capture_prop_expr(
                    attr,
                    &mut props.on_responder_terminate,
                    &mut props.passthrough,
                    scope,
                    diagnostics,
                    consumed,
                )
            }
            "onResponderTerminationRequest"
                if matches!(
                    primitive,
                    Primitive::View
                        | Primitive::Pressable
                        | Primitive::TouchableOpacity
                        | Primitive::TouchableWithoutFeedback
                ) =>
            {
                capture_prop_expr(
                    attr,
                    &mut props.on_responder_termination_request,
                    &mut props.passthrough,
                    scope,
                    diagnostics,
                    consumed,
                )
            }
            "testID" => capture_prop_expr(
                attr,
                &mut props.test_id,
                &mut props.passthrough,
                scope,
                diagnostics,
                consumed,
            ),
            "nativeID" => {
                // Kept as text as well as as a span: two elements sharing
                // an id break every reference to either, and the check for
                // that needs the value rather than where it was written.
                props.native_id_literal = attribute_literal(&attr.value);
                capture_prop_expr(
                    attr,
                    &mut props.native_id,
                    &mut props.passthrough,
                    scope,
                    diagnostics,
                    consumed,
                )
            }
            "pointerEvents" => capture_prop_expr(
                attr,
                &mut props.pointer_events,
                &mut props.passthrough,
                scope,
                diagnostics,
                consumed,
            ),
            "accessibilityState" => {
                props.accessibility_state_keys = object_literal_keys(attr);
                capture_prop_expr(
                    attr,
                    &mut props.accessibility_state,
                    &mut props.passthrough,
                    scope,
                    diagnostics,
                    consumed,
                )
            }
            "aria-invalid" => {
                props.aria_invalid = match &attr.value {
                    Some(JSXAttributeValue::ExpressionContainer(container)) => {
                        Some(to_expr_ref(container.expression.span()))
                    }
                    Some(JSXAttributeValue::StringLiteral(literal)) => {
                        Some(to_expr_ref(literal.span))
                    }
                    _ => None,
                };
                props
                    .passthrough
                    .push(passthrough_prop(attr, scope, diagnostics, consumed));
            }
            "accessibilityValue" => {
                props.accessibility_value_keys = object_literal_keys(attr);
                capture_prop_expr(
                    attr,
                    &mut props.accessibility_value,
                    &mut props.passthrough,
                    scope,
                    diagnostics,
                    consumed,
                )
            }
            "accessibilityLiveRegion" => capture_prop_expr(
                attr,
                &mut props.accessibility_live_region,
                &mut props.passthrough,
                scope,
                diagnostics,
                consumed,
            ),
            "focusable" => match &attr.value {
                None => props.focusable = Some(ConditionExpr::Static(true)),
                Some(JSXAttributeValue::ExpressionContainer(container)) => {
                    props.focusable = Some(match &container.expression {
                        // Read as the constant it is, so `focusable={false}`
                        // becomes `tabIndex={-1}` rather than a ternary over
                        // a literal -- and so the disabled check can tell it
                        // from an expression it cannot see into.
                        JSXExpression::BooleanLiteral(literal) => {
                            ConditionExpr::Static(literal.value)
                        }
                        expression => ConditionExpr::Ref(to_expr_ref(expression.span())),
                    });
                }
                _ => props
                    .passthrough
                    .push(passthrough_prop(attr, scope, diagnostics, consumed)),
            },
            "onLayout" => capture_prop_expr(
                attr,
                &mut props.on_layout,
                &mut props.passthrough,
                scope,
                diagnostics,
                consumed,
            ),
            "level" if primitive == Primitive::Heading => match &attr.value {
                Some(JSXAttributeValue::StringLiteral(literal)) => {
                    props.heading_level = literal
                        .value
                        .parse::<u8>()
                        .ok()
                        .filter(|level| (1..=6).contains(level))
                        .map(HeadingLevel::Static);
                    if props.heading_level.is_none() {
                        props.passthrough.push(passthrough_prop(
                            attr,
                            scope,
                            diagnostics,
                            consumed,
                        ));
                    }
                }
                Some(JSXAttributeValue::ExpressionContainer(container)) => {
                    props.heading_level = match &container.expression {
                        JSXExpression::NumericLiteral(literal)
                            if literal.value.fract() == 0.0
                                && (1.0..=6.0).contains(&literal.value) =>
                        {
                            Some(HeadingLevel::Static(literal.value as u8))
                        }
                        _ => Some(HeadingLevel::Dynamic(to_expr_ref(
                            container.expression.span(),
                        ))),
                    };
                }
                _ => props
                    .passthrough
                    .push(passthrough_prop(attr, scope, diagnostics, consumed)),
            },
            "ordered" if primitive == Primitive::List => match &attr.value {
                None => props.list_ordered = Some(ConditionExpr::Static(true)),
                Some(JSXAttributeValue::ExpressionContainer(container)) => {
                    props.list_ordered =
                        Some(ConditionExpr::Ref(to_expr_ref(container.expression.span())));
                }
                _ => props
                    .passthrough
                    .push(passthrough_prop(attr, scope, diagnostics, consumed)),
            },
            "onScroll" if matches!(primitive, Primitive::ScrollView | Primitive::FlatList) => {
                capture_prop_expr(
                    attr,
                    &mut props.on_scroll,
                    &mut props.passthrough,
                    scope,
                    diagnostics,
                    consumed,
                )
            }
            "scrollEventThrottle"
                if matches!(primitive, Primitive::ScrollView | Primitive::FlatList) =>
            {
                capture_prop_expr(
                    attr,
                    &mut props.scroll_event_throttle,
                    &mut props.passthrough,
                    scope,
                    diagnostics,
                    consumed,
                )
            }
            // Not on a chip, whose `disabled` is a prop of the pattern rather
            // than a host element's state to translate.
            "disabled" if primitive != Primitive::Chip => capture_flag(
                attr,
                &mut props.disabled,
                &mut props.passthrough,
                scope,
                diagnostics,
                consumed,
            ),
            "replace"
                if matches!(
                    primitive,
                    Primitive::Link
                        | Primitive::Button
                        | Primitive::Pressable
                        | Primitive::Svg(SvgElement::Link)
                ) =>
            {
                capture_flag(
                    attr,
                    &mut props.navigation_replace,
                    &mut props.passthrough,
                    scope,
                    diagnostics,
                    consumed,
                )
            }
            "prefetch"
                if matches!(
                    primitive,
                    Primitive::Link
                        | Primitive::Button
                        | Primitive::Pressable
                        | Primitive::Svg(SvgElement::Link)
                ) =>
            {
                capture_flag(
                    attr,
                    &mut props.navigation_prefetch,
                    &mut props.passthrough,
                    scope,
                    diagnostics,
                    consumed,
                )
            }
            "horizontal" if matches!(primitive, Primitive::ScrollView | Primitive::FlatList) => {
                match &attr.value {
                    None => props.scroll_horizontal = Some(ConditionExpr::Static(true)),
                    Some(JSXAttributeValue::ExpressionContainer(container)) => {
                        props.scroll_horizontal =
                            Some(ConditionExpr::Ref(to_expr_ref(container.expression.span())));
                    }
                    _ => {
                        props
                            .passthrough
                            .push(passthrough_prop(attr, scope, diagnostics, consumed))
                    }
                }
            }
            "refreshing"
                if matches!(
                    primitive,
                    Primitive::ScrollView | Primitive::FlatList | Primitive::RefreshControl
                ) =>
            {
                match &attr.value {
                    None => props.refreshing = Some(ConditionExpr::Static(true)),
                    Some(JSXAttributeValue::ExpressionContainer(container)) => {
                        props.refreshing =
                            Some(ConditionExpr::Ref(to_expr_ref(container.expression.span())));
                    }
                    _ => {
                        props
                            .passthrough
                            .push(passthrough_prop(attr, scope, diagnostics, consumed))
                    }
                }
            }
            "onRefresh"
                if matches!(
                    primitive,
                    Primitive::ScrollView | Primitive::FlatList | Primitive::RefreshControl
                ) =>
            {
                match &attr.value {
                    Some(JSXAttributeValue::ExpressionContainer(container)) => {
                        props.on_refresh = Some(to_expr_ref(container.expression.span()));
                    }
                    _ => {
                        props
                            .passthrough
                            .push(passthrough_prop(attr, scope, diagnostics, consumed))
                    }
                }
            }
            "keyboardShouldPersistTaps"
                if matches!(primitive, Primitive::ScrollView | Primitive::FlatList) =>
            {
                match &attr.value {
                    Some(JSXAttributeValue::ExpressionContainer(container)) => {
                        props.keyboard_should_persist_taps =
                            Some(to_expr_ref(container.expression.span()));
                    }
                    Some(JSXAttributeValue::StringLiteral(literal)) => {
                        props.keyboard_should_persist_taps = Some(to_expr_ref(literal.span));
                    }
                    _ => {
                        props
                            .passthrough
                            .push(passthrough_prop(attr, scope, diagnostics, consumed))
                    }
                }
            }
            "showsVerticalScrollIndicator"
                if matches!(primitive, Primitive::ScrollView | Primitive::FlatList) =>
            {
                match &attr.value {
                    None => {
                        props.shows_vertical_scroll_indicator = Some(ConditionExpr::Static(true))
                    }
                    Some(JSXAttributeValue::ExpressionContainer(container)) => {
                        props.shows_vertical_scroll_indicator =
                            Some(ConditionExpr::Ref(to_expr_ref(container.expression.span())));
                    }
                    _ => {
                        props
                            .passthrough
                            .push(passthrough_prop(attr, scope, diagnostics, consumed))
                    }
                }
            }
            "showsHorizontalScrollIndicator"
                if matches!(primitive, Primitive::ScrollView | Primitive::FlatList) =>
            {
                match &attr.value {
                    None => {
                        props.shows_horizontal_scroll_indicator = Some(ConditionExpr::Static(true))
                    }
                    Some(JSXAttributeValue::ExpressionContainer(container)) => {
                        props.shows_horizontal_scroll_indicator =
                            Some(ConditionExpr::Ref(to_expr_ref(container.expression.span())));
                    }
                    _ => {
                        props
                            .passthrough
                            .push(passthrough_prop(attr, scope, diagnostics, consumed))
                    }
                }
            }
            // Both spellings are accepted and neither is passed through:
            // the two platforms name this prop differently, so the value is
            // captured here and each backend writes it under its own name.
            // Re-emitting the source spelling verbatim would put
            // `accessibilityLabel` on a DOM `<input>`, where React drops it
            // and the field ends up with no accessible name at all -- the
            // exact failure the diagnostic exists to prevent.
            //
            // The *value* is never touched. Hozo diagnoses the absence of
            // a name and never invents or rewrites one: a name guessed from
            // a placeholder or a nearby heading is how a field comes to be
            // announced as something it isn't, which is worse than being
            // announced as nothing.
            "accessibilityLabel" | "aria-label" => match &attr.value {
                Some(JSXAttributeValue::ExpressionContainer(container)) => {
                    props.accessibility_label = Some(to_expr_ref(container.expression.span()));
                }
                Some(JSXAttributeValue::StringLiteral(literal)) => {
                    props.accessibility_label = Some(to_expr_ref(literal.span));
                }
                _ => props
                    .passthrough
                    .push(passthrough_prop(attr, scope, diagnostics, consumed)),
            },
            "accessibilityHint" | "aria-description" => match &attr.value {
                Some(JSXAttributeValue::ExpressionContainer(container)) => {
                    props.accessibility_hint = Some(to_expr_ref(container.expression.span()));
                }
                Some(JSXAttributeValue::StringLiteral(literal)) => {
                    props.accessibility_hint = Some(to_expr_ref(literal.span));
                }
                _ => props
                    .passthrough
                    .push(passthrough_prop(attr, scope, diagnostics, consumed)),
            },
            "src" if primitive == Primitive::Image => match &attr.value {
                Some(JSXAttributeValue::ExpressionContainer(container)) => {
                    props.image_src = Some(to_expr_ref(container.expression.span()));
                }
                Some(JSXAttributeValue::StringLiteral(literal)) => {
                    props.image_src = Some(to_expr_ref(literal.span));
                }
                _ => props
                    .passthrough
                    .push(passthrough_prop(attr, scope, diagnostics, consumed)),
            },
            "defaultSource" if primitive == Primitive::Image => capture_prop_expr(
                attr,
                &mut props.image_default_source,
                &mut props.passthrough,
                scope,
                diagnostics,
                consumed,
            ),
            "alt" if primitive == Primitive::Image => match &attr.value {
                Some(JSXAttributeValue::ExpressionContainer(container)) => {
                    props.accessibility_label = Some(to_expr_ref(container.expression.span()));
                }
                Some(JSXAttributeValue::StringLiteral(literal)) => {
                    props.accessibility_label = Some(to_expr_ref(literal.span));
                }
                _ => props
                    .passthrough
                    .push(passthrough_prop(attr, scope, diagnostics, consumed)),
            },
            "open" => match &attr.value {
                Some(JSXAttributeValue::ExpressionContainer(container)) => {
                    props.open = Some(ConditionExpr::Ref(to_expr_ref(container.expression.span())));
                }
                _ => props
                    .passthrough
                    .push(passthrough_prop(attr, scope, diagnostics, consumed)),
            },
            "onClose" => {
                props.has_on_close = true;
                props
                    .passthrough
                    .push(passthrough_prop(attr, scope, diagnostics, consumed));
            }
            "onChangeText" if primitive == Primitive::TextInput => capture_prop_expr(
                attr,
                &mut props.text_input.on_change_text,
                &mut props.passthrough,
                scope,
                diagnostics,
                consumed,
            ),
            "editable" if primitive == Primitive::TextInput => capture_flag(
                attr,
                &mut props.text_input.editable,
                &mut props.passthrough,
                scope,
                diagnostics,
                consumed,
            ),
            "readOnly" if primitive == Primitive::TextInput => capture_flag(
                attr,
                &mut props.text_input.read_only,
                &mut props.passthrough,
                scope,
                diagnostics,
                consumed,
            ),
            "autoCorrect" if primitive == Primitive::TextInput => capture_flag(
                attr,
                &mut props.text_input.auto_correct,
                &mut props.passthrough,
                scope,
                diagnostics,
                consumed,
            ),
            "multiline" if primitive == Primitive::TextInput => capture_flag(
                attr,
                &mut props.text_input.multiline,
                &mut props.passthrough,
                scope,
                diagnostics,
                consumed,
            ),
            "secureTextEntry" if primitive == Primitive::TextInput => capture_flag(
                attr,
                &mut props.text_input.secure_text_entry,
                &mut props.passthrough,
                scope,
                diagnostics,
                consumed,
            ),
            "numberOfLines" if primitive == Primitive::TextInput => capture_prop_expr(
                attr,
                &mut props.text_input.number_of_lines,
                &mut props.passthrough,
                scope,
                diagnostics,
                consumed,
            ),
            "keyboardType" if primitive == Primitive::TextInput => capture_literal(
                attr,
                &mut props.text_input.keyboard_type,
                &mut props.passthrough,
                scope,
                diagnostics,
                consumed,
            ),
            "inputMode" if primitive == Primitive::TextInput => capture_literal(
                attr,
                &mut props.text_input.input_mode,
                &mut props.passthrough,
                scope,
                diagnostics,
                consumed,
            ),
            "placeholder" => {
                props.has_placeholder = true;
                props
                    .passthrough
                    .push(passthrough_prop(attr, scope, diagnostics, consumed));
            }
            "role" | "accessibilityRole" => {
                props.accessibility_role =
                    accessibility_role_from_value(&attr.value, attr_name.name.as_str() == "role");
                if props.accessibility_role.is_none() {
                    // A dynamic/unrecognized role isn't modeled, but must
                    // still reach the output -- Hozo only declines to
                    // *reason* about it, not to emit it.
                    props
                        .passthrough
                        .push(passthrough_prop(attr, scope, diagnostics, consumed));
                }
            }
            _ => props
                .passthrough
                .push(passthrough_prop(attr, scope, diagnostics, consumed)),
        }
    }

    // Every child, in source order. Anything the compiler doesn't model
    // becomes `Child::Verbatim` and is re-emitted from source rather than
    // dropped -- an unmodeled component, an expression container, a
    // fragment, a child spread.
    let mut children: Vec<Child> = Vec::new();
    for child in &el.children {
        match child {
            JSXChild::Element(child_el) => {
                match build_node(child_el, scope, diagnostics, consumed, true) {
                    Some(child_node) => children.push(Child::Node(child_node)),
                    // A component Hozo doesn't model still renders, and
                    // still occupies a position among its siblings.
                    None => children.push(carry_verbatim(
                        child,
                        child_el.span(),
                        scope,
                        diagnostics,
                        consumed,
                    )),
                }
            }
            JSXChild::Text(t) => {
                let cleaned = decode_jsx_entities(&clean_jsx_text(t.value.as_str()));
                if !cleaned.is_empty() {
                    children.push(Child::Text(cleaned));
                }
            }
            other => children.push(carry_verbatim(
                other,
                other.span(),
                scope,
                diagnostics,
                consumed,
            )),
        }
    }

    // Each input keeps its own ordering semantics; grouping must retain
    // these boundaries rather than merge a later input back into an old rule.
    // Tailwind's order within an input is the shared plan's (#1230); an input
    // the plan cannot rank keeps the order it was written in.
    for slot in &mut props.class_slots {
        for declaration in &mut slot.style {
            declaration.source = declaration.source.with_tailwind_input(slot.span.start);
        }
    }
    root_capture::plan_attributes(
        el,
        &mut props,
        &mut style,
        &class_name_fallback,
        expression_container,
    );
    validate_semantic_children(primitive, &children, diagnostics);
    validate_focusable_disabled(&props, to_span(el.span()), diagnostics);
    validate_flex_direction(primitive, &style, to_span(el.span()), diagnostics);
    validate_enter_motion(&style, to_span(el.span()), diagnostics);

    Some(Node {
        primitive,
        style,
        props,
        children,
        class_name_fallback,
        carried_classes,
        span: to_span(el.span()),
        opening_tag_span: to_span(el.opening_element.name.span()),
        closing_tag_span: el
            .closing_element
            .as_ref()
            .map(|closing| to_span(closing.name.span())),
    })
}
