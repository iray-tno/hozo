//! A `{...spread}` on an element: StyleX styling input when it resolves to
//! one, and otherwise an opaque prop spread carried through as written.

use hozo_ir::{Diagnostic, DiagnosticCode, PassthroughProp, PropSet, Severity, StyleDeclaration};
use oxc_ast::ast::JSXSpreadAttribute;
use oxc_ast_visit::Visit;
use oxc_span::GetSpan;

use super::finder::PrimitiveFinder;
use super::scope::Scope;
use super::{to_expr_ref, to_span};

/// True when the spread was StyleX input and is now in `style` (and, for a
/// partial one, `props.stylex_residuals`); the caller then reads no further.
pub(super) fn stylex_spread(
    spread: &JSXSpreadAttribute,
    scope: &Scope,
    style: &mut Vec<StyleDeclaration>,
    props: &mut PropSet,
    diagnostics: &mut Vec<Diagnostic>,
) -> bool {
    match scope.stylex.resolve_props(&spread.argument) {
        crate::stylex::Resolution::Ready(declarations) => {
            // Styling input, not an opaque prop spread. Appending
            // here preserves order with className and reuses the
            // IR's normal last-wins behavior.
            style.extend(declarations.into_iter().map(|mut declaration| {
                declaration.source = hozo_ir::StyleSource::Stylex(spread.span.start);
                declaration
            }));
            return true;
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
            return true;
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
    false
}

/// The spread as a passthrough prop, with the names written after it and
/// the primitives written inside it.
pub(super) fn opaque_spread(
    spread: &JSXSpreadAttribute,
    scope: &Scope,
    named: &[(u32, String)],
    seen_class_name: bool,
    diagnostics: &mut Vec<Diagnostic>,
    consumed: &mut Vec<hozo_ir::SourceSpan>,
) -> PassthroughProp {
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
    PassthroughProp {
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
    }
}
