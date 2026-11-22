//! Reading an element's class attributes: the root `className`, as a
//! literal or an expression, and a runtime component's other class lists
//! (`ClassSlot`). What each returns, the caller writes into the node.

use hozo_ir::{
    ClassEvaluation, Condition, Diagnostic, DiagnosticCode, Primitive, Severity, SlotStyle,
    SourceSpan, StyleDeclaration, StyleProperty,
};
use oxc_ast::ast::{JSXElement, JSXExpression, StringLiteral};
use oxc_span::{GetSpan, Span};

use super::atoms::{control_atom, form_state_atom, open_atom};
use super::class_expr::{
    capture_class_expression, capture_condition_in_place, class_expression, has_authored_guard,
};
use super::messages::{
    loses_to, private_attribute_message, unsupported_variant_message, web_tag_hint,
};
use super::scope::Scope;
use super::{root_capture, to_expr_ref, to_span};
use crate::{dynamic_class, tailwind};

/// A root `className` string, token by token: the declarations it
/// compiles to, and the classes carried to the element as written.
pub(super) fn read_literal(
    literal: &StringLiteral,
    primitive: Primitive,
    scope: &Scope,
    attr_start: u32,
    diagnostics: &mut Vec<Diagnostic>,
) -> (Vec<StyleDeclaration>, Vec<String>) {
    let mut style = Vec::new();
    let mut carried = Vec::new();
    // What each token Hozo compiles writes, for a
    // carried variant to be compared against: it loses
    // to any of them on Web wherever both match (#1752).
    // The whole list, because the token it loses to may
    // come after it; and only once something is
    // carried, which most class lists never are.
    let compiled_here = std::cell::OnceCell::<Vec<(&str, Vec<StyleProperty>)>>::new();
    let compiled_here = || {
        compiled_here.get_or_init(|| {
            literal
                .value
                .split_whitespace()
                .filter(|token| !tailwind::has_unstripped_variant(token))
                .map(|token| {
                    let properties = tailwind::expand_class(token)
                        .into_iter()
                        .flat_map(|(_, properties)| properties)
                        .collect();
                    (token, properties)
                })
                .collect()
        })
    };
    for token in literal.value.split_whitespace() {
        // Several groups only for a shorthand like
        // `container`, which is a width plus a
        // max-width at each breakpoint.
        // Asked before the utility parser sees the
        // token, not after. An unrecognised variant
        // leaves its own text in front of the utility,
        // and the utility parser will read that text as
        // a value: `placeholder-shown:bg-blue-500`
        // became a `placeholder-<colour>` whose colour
        // was `shown:bg-blue-500`, emitting
        // `.hozo-0::placeholder { color:
        // var(--hozo-color-shown:bg-blue-500) }` --
        // a rule that should not exist, naming a custom
        // property that cannot exist.
        //
        // Worse than a missing style, because it is the
        // one failure the author cannot see: no
        // diagnostic fires when properties come back
        // non-empty, so Hozo reported success.
        let groups = if tailwind::has_unstripped_variant(token) {
            Vec::new()
        } else {
            tailwind::expand_class(token)
        };
        let properties: Vec<_> = groups.iter().flat_map(|(_, p)| p.clone()).collect();
        // Nothing recognised, so it goes back into the
        // element rather than being deleted from it.
        // "Hozo leaves it alone" is what the comment
        // below has always said and was not true: an
        // unknown class was dropped, taking a
        // project's own `my-card` with it, and
        // Tailwind's `group` and `peer` -- marker
        // classes with no styles of their own, whose
        // whole purpose is to be selected against by a
        // descendant.
        let unsupported = properties
            .is_empty()
            .then(|| tailwind::unsupported_variant_name(token))
            .flatten();
        // A theme animation is carried as well as read:
        // a backend whose theme lacks the name emits
        // nothing for it, and the class is then what lets
        // the project's own CSS run it.
        // A theme radius likewise: `rounded-<name>` is a
        // radius only if the project's theme says so.
        let theme_animation = properties.iter().any(|property| {
            matches!(property, StyleProperty::ThemeAnimation(_))
                || property.theme_radius().is_some()
        });
        if properties.is_empty() || theme_animation {
            carried.push(token.to_string());
        }
        report_unmatchable(
            token,
            &groups,
            primitive,
            to_span(literal.span()),
            diagnostics,
        );
        if let Some(variant) = unsupported {
            diagnostics.push(Diagnostic {
                code: DiagnosticCode::TailwindVariantNotSupported,
                severity: Severity::Warning,
                message: unsupported_variant_message(
                    variant,
                    token,
                    loses_to(
                        token,
                        compiled_here()
                            .iter()
                            .map(|(token, properties)| (*token, properties.as_slice())),
                    ),
                ),
                span: to_span(literal.span()),
            });
        }
        // Reported only for brackets. An unknown bare
        // class is ordinary -- projects have their own
        // CSS -- but a bracket is unambiguously
        // Tailwind being asked for something, so
        // failing to read one is worth saying out
        // loud. It stayed silent until 2026-08-16,
        // which is how `w-[32px]` came to compile to
        // nothing at all.
        // Skipped when the variant was already named:
        // one problem, one report. `data-[state=open]:`
        // has brackets *and* a variant Hozo lacks, and
        // the variant is the accurate half.
        if unsupported.is_none()
            && properties.is_empty()
            && tailwind::is_arbitrary(token)
            && !crate::resolve_class_name(token).is_some_and(|utility| utility.important)
        {
            diagnostics.push(Diagnostic {
                code: DiagnosticCode::UnreadableArbitraryValue,
                severity: Severity::Warning,
                message: format!(
                    "`{token}` uses Tailwind's arbitrary syntax and Hozo \
                     couldn't read it, so no style is generated for it. The \
                     class still reaches the DOM, so a hand-written rule for \
                     it will still apply."
                ),
                span: to_span(literal.span()),
            });
        }
        for (condition, properties) in groups {
            if properties.is_empty() {
                continue;
            }
            let source = scope.utility_source(token, attr_start);
            for property in properties {
                style.push(StyleDeclaration {
                    property,
                    condition: condition.clone(),
                    source,
                });
            }
        }
    }
    (style, carried)
}

/// Variants in `token` that compile but can never apply on this element,
/// or that the browser will discard.
fn report_unmatchable(
    token: &str,
    groups: &[(Condition, Vec<StyleProperty>)],
    primitive: Primitive,
    span: SourceSpan,
    diagnostics: &mut Vec<Diagnostic>,
) {
    // A selector that matches a form control, on
    // an element that is not one. Rule 2 in
    // decision 003 refuses a variant that can
    // never match *anything* Hozo emits; these can
    // match, but only here, so the refusal is per
    // element rather than per variant.
    // A rule the browser will filter. Not about
    // Hozo and not about the element: `:visited`
    // could leak the user's history, so engines
    // apply a handful of colour properties there
    // and drop everything else. The CSS is emitted
    // regardless, to match Tailwind; this is the
    // only warning the author will get that it
    // does nothing.
    for (condition, properties) in groups {
        if !condition.contains_visited() {
            continue;
        }
        if properties.iter().all(StyleProperty::survives_visited) {
            continue;
        }
        diagnostics.push(Diagnostic {
            code: DiagnosticCode::VisitedStyleIgnored,
            severity: Severity::Warning,
            message: format!(
                "`{token}` styles something the browser will discard. A page that could see a `:visited` style could read the user's history, so engines apply only `color`, `background-color`, the border and outline colours, `text-decoration-color`, `caret-color`, `fill` and `stroke` there -- and paint even those fully opaque. The CSS is emitted to match Tailwind; nothing will apply."
            ),
            span,
        });
    }
    // Hozo's own attributes, selected on from the
    // outside. They work today, which is why this
    // is a warning and not silence: the ones that
    // look stable are reachable through a variant
    // that compiles to the identical selector, and
    // one of them is named after byte offsets and
    // is not stable at all.
    for (condition, _) in groups {
        let Some(attribute) = condition.hozo_private_attribute() else {
            continue;
        };
        diagnostics.push(Diagnostic {
            code: DiagnosticCode::HozoAttributeIsPrivate,
            severity: Severity::Warning,
            message: private_attribute_message(attribute),
            span,
        });
    }
    for (condition, _) in groups {
        if let Some(state) = form_state_atom(condition) {
            if primitive != Primitive::TextInput {
                diagnostics.push(Diagnostic {
                    code: DiagnosticCode::TailwindVariantCannotMatch,
                    severity: Severity::Warning,
                    message: format!(
                        "`{}:` compiles to `{}`, which matches a form control. This is a <{}>, so the rule is generated and can never apply. Hozo's `TextInput` is a real `<input>`; nothing else is.",
                        state.variant_name(),
                        state.selector(),
                        web_tag_hint(primitive),
                    ),
                    span,
                });
            }
        }
    }
    // `Details` is the one primitive that is a
    // `<details>`, and no primitive is a `<dialog>`
    // or a popover, so `open:` and
    // `details-content:` anywhere else are the
    // form-state case again. `group-open:` is the
    // useful spelling and is not looked through.
    if primitive != Primitive::Details
        && groups.iter().any(|(condition, _)| {
            condition.pseudo_element() == Some(hozo_ir::PseudoElement::DetailsContent)
        })
    {
        diagnostics.push(Diagnostic {
            code: DiagnosticCode::TailwindVariantCannotMatch,
            severity: Severity::Warning,
            message: format!(
                "`details-content:` compiles to `::details-content`, the part of a `<details>` that opens and closes. This is a <{}>, so the rule is generated and can never apply. Write it on the `Details` itself.",
                web_tag_hint(primitive),
            ),
            span,
        });
    }
    if primitive != Primitive::Details && groups.iter().any(|(condition, _)| open_atom(condition)) {
        diagnostics.push(Diagnostic {
            code: DiagnosticCode::TailwindVariantCannotMatch,
            severity: Severity::Warning,
            message: format!(
                "`open:` compiles to `:is([open], :popover-open, :open)`, which matches an open `<details>`, `<dialog>` or popover. This is a <{}>, so the rule is generated and can never apply. To style something inside an open `Details`, put `group` on the `Details` and write `group-open:` here.",
                web_tag_hint(primitive),
            ),
            span,
        });
    }
    // No primitive is a checkbox, a radio or a
    // submit button, so these are the `open:` case
    // again (#1752). A `Progress` is a real
    // `<progress>`, which is `:indeterminate` while
    // it has no `value`.
    for (condition, _) in groups {
        let Some(state) = control_atom(condition) else {
            continue;
        };
        if state == hozo_ir::ControlState::Indeterminate && primitive == Primitive::Progress {
            continue;
        }
        diagnostics.push(Diagnostic {
            code: DiagnosticCode::TailwindVariantCannotMatch,
            severity: Severity::Warning,
            message: format!(
                "`{}:` compiles to `{}`, which matches a checkbox, a radio, a selected option or a form's default button. This is a <{}>, so the rule is generated and can never apply. To style by a real control, write `peer-{}:` after one that has `peer`, or `has-{}:` on an element around it; for a control that says its state through ARIA, write `aria-checked:`.",
                state.variant_name(),
                state.selector(),
                web_tag_hint(primitive),
                state.variant_name(),
                state.variant_name(),
            ),
            span,
        });
        break;
    }
}

/// A root `className` expression, decomposed. A guarded one that the
/// element can be wrapped for also returns the root capture slot.
pub(super) fn read_expression(
    expression: &JSXExpression,
    attr_span: Span,
    el: &JSXElement,
    scope: &Scope,
    expression_container: bool,
    diagnostics: &mut Vec<Diagnostic>,
) -> (dynamic_class::Decomposed, Option<SlotStyle>) {
    let mut capture = None;
    let mut decomposed = class_expression(expression, scope, diagnostics, false)
        .expect("root className retains opaque fallback leaves");
    let mut captured = false;
    if (!decomposed.evaluation_refs.is_empty()
        || decomposed
            .declarations
            .iter()
            .any(|d| has_authored_guard(&d.condition)))
        && root_capture::can_wrap(el, attr_span)
    {
        if let Some(mut evaluation) = capture_class_expression(expression, scope, &mut decomposed) {
            captured = true;
            for declaration in &mut decomposed.declarations {
                capture_condition_in_place(&mut declaration.condition, &evaluation);
            }
            evaluation.scope = hozo_ir::ClassCaptureScope::Subtree {
                expression_container,
            };
            capture = Some(hozo_ir::SlotStyle {
                slot: hozo_ir::ClassSlot::ROOT,
                style: Vec::new(),
                carried: Vec::new(),
                fallback: Vec::new(),
                evaluation: Some(Box::new(evaluation)),
                span: to_span(attr_span),
            });
        }
    }
    if !decomposed.evaluation_refs.is_empty() && !captured {
        // Keeping the authored call is the only safe path when a
        // capture wrapper cannot preserve its predicate evaluation.
        decomposed = dynamic_class::Decomposed::default();
        decomposed.fallback.push(to_expr_ref(expression.span()));
    }
    (decomposed, capture)
}

/// A class slot's string: its declarations and the classes carried as written.
pub(super) fn read_slot_literal(
    literal: &StringLiteral,
    scope: &Scope,
    attr_start: u32,
) -> (Vec<StyleDeclaration>, Vec<String>) {
    let mut style = Vec::new();
    let mut carried = Vec::new();
    for token in literal.value.split_whitespace() {
        let groups = if tailwind::has_unstripped_variant(token) {
            Vec::new()
        } else {
            tailwind::expand_class(token)
        };
        let before = style.len();
        for (condition, properties) in groups {
            if properties.is_empty() {
                continue;
            }
            let source = scope.utility_source(token, attr_start);
            style.extend(properties.into_iter().map(|property| StyleDeclaration {
                property,
                condition: condition.clone(),
                source,
            }));
        }
        if style.len() == before {
            carried.push(token.to_string());
        }
    }
    (style, carried)
}

/// A class slot's expression, decomposed with its capture plan when guarded.
/// `None` when the attribute should pass through as written instead.
pub(super) fn read_slot_expression(
    expression: &JSXExpression,
    scope: &Scope,
    diagnostics: &mut Vec<Diagnostic>,
) -> Option<(dynamic_class::Decomposed, Option<ClassEvaluation>)> {
    let mut decomposed = class_expression(expression, scope, diagnostics, true)?;
    // Keep opaque forwarding cheap. Guarded AOT needs a capture
    // plan, not authored code run again by an owner's callback.
    let guarded = !decomposed.evaluation_refs.is_empty()
        || decomposed
            .declarations
            .iter()
            .any(|d| has_authored_guard(&d.condition));
    let evaluation = guarded
        .then(|| capture_class_expression(expression, scope, &mut decomposed))
        .flatten();
    if decomposed.declarations.is_empty() || (guarded && evaluation.is_none()) {
        return None;
    }
    if let Some(evaluation) = &evaluation {
        for declaration in &mut decomposed.declarations {
            capture_condition_in_place(&mut declaration.condition, evaluation);
        }
    }
    Some((decomposed, evaluation))
}
