//! The visitor that finds the outermost primitives in a component body.

use hozo_ir::{Diagnostic, DiagnosticCode, EnclosingComponent, NestedNode, Severity, SourceSpan};
use oxc_ast::ast::{JSXAttributeValue, JSXChild, JSXElement, JSXElementName};
use oxc_ast_visit::Visit;
use oxc_span::GetSpan;

use super::build::build_node;
use super::enclosing::enclosing_component;
use super::scope::Scope;
use super::to_span;

/// Finds and lowers Hozo primitives nested inside something the compiler
/// is only carrying, not reading -- an expression container, or an
/// unmodeled component's children.
///
/// The compiler can read these perfectly well; what it can't read is the
/// expression *around* them. So `show &&` is carried untouched while the
/// `<Text>` beside it compiles exactly as a top-level one would.
///
/// Lowers on the spot rather than collecting references to come back to:
/// the borrow the walk hands out doesn't outlive it, and threading the
/// build through the visitor is simpler than any way of extending it.
pub(super) struct PrimitiveFinder<'r, 'a, 'd> {
    pub(super) scope: &'r Scope<'r, 'a>,
    pub(super) diagnostics: &'d mut Vec<Diagnostic>,
    pub(super) consumed: &'d mut Vec<SourceSpan>,
    pub(super) nested: Vec<NestedNode>,
    /// The components the walk is inside, outermost first.
    pub(super) enclosing: Vec<EnclosingComponent>,
    pub(super) expression_container: bool,
}

impl<'r, 'a, 'd> Visit<'a> for PrimitiveFinder<'r, 'a, 'd> {
    fn visit_jsx_element(&mut self, it: &JSXElement<'a>) {
        if let JSXElementName::IdentifierReference(ident) = &it.opening_element.name {
            if self.scope.foreign.contains(ident.name.as_str()) {
                // Carried, not lowered -- and its own children are visited
                // by the walk that continues below, so a Hozo primitive
                // inside a foreign component still compiles.
            } else if self
                .scope
                .primitive_for_local(ident.name.as_str())
                .is_some()
            {
                let name = ident.name.as_str();
                match build_node(
                    it,
                    self.scope,
                    self.diagnostics,
                    self.consumed,
                    self.expression_container,
                ) {
                    Some(node) => self.nested.push(NestedNode {
                        span: to_span(it.span()),
                        node,
                        enclosing: self.enclosing.clone(),
                        forwarded: Vec::new(),
                    }),
                    // Unreachable through this finder, which only matches
                    // identifier bindings `build_node` accepts --
                    // kept so a future widening of one and not the other
                    // degrades to a named gap rather than a silently
                    // uncompiled element.
                    None => self.diagnostics.push(Diagnostic {
                        code: DiagnosticCode::PrimitiveNotLowered,
                        severity: Severity::Warning,
                        message: format!(
                            "This `<{name}>` is inside an expression the compiler doesn't read \
                             and couldn't be compiled in place. It falls back to the runtime \
                             component and gets its CSS from the project-wide candidate \
                             stylesheet instead of a scoped class."
                        ),
                        span: to_span(it.span()),
                    }),
                }
                // The outermost primitive on this branch. `build_node`
                // recurses into its children itself, so descending further
                // would compile them a second time.
                return;
            }
        } else if matches!(it.opening_element.name, JSXElementName::MemberExpression(_)) {
            // `<Svg.Rect>`, `<TermList.Term>`: `build_node` is what knows
            // which members are primitives, so it is asked directly. These
            // used to be passed over here, so `{rows.map(() => <Svg.Text/>)}`
            // inside an `<Svg>` reached the DOM with its classes raw and no
            // diagnostic, while the same element written at the top of a
            // component compiled. A member it does not model is someone
            // else's component, and the walk below looks inside it.
            if let Some(node) = build_node(
                it,
                self.scope,
                self.diagnostics,
                self.consumed,
                self.expression_container,
            ) {
                self.nested.push(NestedNode {
                    span: to_span(it.span()),
                    node,
                    enclosing: self.enclosing.clone(),
                    forwarded: Vec::new(),
                });
                return;
            }
        }
        // Keeps descending otherwise: `<ProfileCard><Text/></ProfileCard>` and
        // `{rows.map(() => <Text/>)}` both hide one further down.
        let component = enclosing_component(it);
        let pushed = component.is_some();
        self.enclosing.extend(component);
        let previous = std::mem::replace(&mut self.expression_container, false);
        oxc_ast_visit::walk::walk_jsx_element(self, it);
        self.expression_container = previous;
        if pushed {
            self.enclosing.pop();
        }
    }

    fn visit_jsx_child(&mut self, child: &JSXChild<'a>) {
        let previous = std::mem::replace(
            &mut self.expression_container,
            matches!(child, JSXChild::Element(_)),
        );
        oxc_ast_visit::walk::walk_jsx_child(self, child);
        self.expression_container = previous;
    }

    fn visit_jsx_attribute_value(&mut self, value: &JSXAttributeValue<'a>) {
        let previous = std::mem::replace(
            &mut self.expression_container,
            matches!(value, JSXAttributeValue::Element(_)),
        );
        oxc_ast_visit::walk::walk_jsx_attribute_value(self, value);
        self.expression_container = previous;
    }
}
