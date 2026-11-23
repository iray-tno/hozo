//! One JSX element converted into a `Node`.

use hozo_ir::{ConditionExpr, Diagnostic, Node, Primitive, PropSet, SourceSpan, StyleDeclaration};
use oxc_ast::ast::{
    JSXAttributeItem, JSXAttributeName, JSXAttributeValue, JSXElement, JSXExpression,
};
use oxc_span::GetSpan;

use super::accessibility_props;
use super::children::build_children;
use super::class_name;
use super::element_name::element_primitive;
use super::label_props;
use super::navigation_props;
use super::props::{capture_flag, capture_prop_expr, passthrough_prop};
use super::responder;
use super::role::accessibility_role_from_value;
use super::scope::Scope;
use super::scroll_props;
use super::spread;
use super::text_input_props;
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
    let (local, primitive) = element_primitive(el, scope)?;
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
                if spread::stylex_spread(spread, scope, &mut style, &mut props, diagnostics) {
                    continue;
                }
                props.passthrough.push(spread::opaque_spread(
                    spread,
                    scope,
                    &named,
                    seen_class_name,
                    diagnostics,
                    consumed,
                ));
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
            name if responder::has_responder(primitive) && responder::NAMES.contains(&name) => {
                let (field, passthrough) =
                    responder::fields(&mut props, name).expect("a responder prop, checked above");
                capture_prop_expr(attr, field, passthrough, scope, diagnostics, consumed)
            }
            name if accessibility_props::reads(primitive, name) => {
                accessibility_props::capture(name, attr, &mut props, scope, diagnostics, consumed)
            }
            name if scroll_props::reads(primitive, name) => {
                scroll_props::capture(name, attr, &mut props, scope, diagnostics, consumed)
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
            name if navigation_props::reads(primitive, name) => {
                navigation_props::capture(name, attr, &mut props, scope, diagnostics, consumed)
            }
            name if label_props::reads(primitive, name) => {
                label_props::capture(name, attr, &mut props, scope, diagnostics, consumed)
            }
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
            name if text_input_props::reads(primitive, name) => {
                text_input_props::capture(name, attr, &mut props, scope, diagnostics, consumed)
            }
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

    let children = build_children(el, scope, diagnostics, consumed);

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
