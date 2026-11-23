//! Converts oxc's JSX AST into `hozo_ir::Node` trees.
//!
//! Phase 0 scope: static and dynamic `className` (see
//! `crate::dynamic_class`), `View`/`Text`/`Pressable`/`Button` primitives,
//! text and element children, and `onPress`/`disabled`/`accessibilityRole`
//! props.
//!
//! Everything outside that scope is *carried*, not dropped: unmodeled
//! attributes go to `PropSet::passthrough`, and unmodeled children become
//! `Child::Verbatim` to be re-emitted from source. Not understanding
//! something is a reason to leave it alone, not a reason to delete it.

use hozo_ir::{
    Condition, ConditionExpr, Diagnostic, EnclosingComponent, ExprRef, Node, PropSet, SourceSpan,
    StyleDeclaration,
};
use oxc_ast::ast::{
    ArrowFunctionExpression, Function, JSXAttribute, JSXAttributeItem, JSXAttributeName,
    JSXAttributeValue, JSXChild, JSXElement, JSXExpression,
};
use oxc_ast_visit::walk::{
    walk_arrow_function_expression, walk_function, walk_jsx_element, walk_method_definition,
    walk_property_definition,
};
use oxc_ast_visit::Visit;
use oxc_span::{GetSpan, Span};
use oxc_syntax::scope::ScopeFlags;

use build::build_node;
use enclosing::enclosing_component;

mod atoms;
mod build;
mod children;
mod class_expr;
mod class_name;
mod element_name;
mod enclosing;
mod finder;
mod messages;
mod primitives;
mod props;
mod responder;
mod role;
mod root_capture;
mod scope;
mod scroll_props;
mod spread;
mod text;
mod validate;

pub use primitives::is_primitive_name;
pub(crate) use primitives::is_react_native_compat_name;
pub(crate) use scope::Scope;

fn to_span(span: Span) -> SourceSpan {
    SourceSpan {
        start: span.start,
        end: span.end,
    }
}

fn to_expr_ref(span: Span) -> ExprRef {
    ExprRef(to_span(span))
}

/// Collects every top-level (i.e. not nested inside another already-visited
/// JSX element) `Node` tree found while walking a `Program`.
/// A top-level JSX element, plus where a hook declaration for it could go.
#[derive(Clone)]
pub struct Root {
    pub node: Node,
    /// One compilation-owned table shared by all roots and their nested/slot
    /// adaptations. Keep it with detached nodes when inspecting utility IDs.
    pub tailwind_units: Option<std::sync::Arc<hozo_ir::TailwindUnits>>,
    /// Byte offset just inside the enclosing function's opening `{`, where
    /// a generated `const x = useSomething()` can be spliced.
    ///
    /// `None` when there is nowhere to put one -- JSX at module scope, or
    /// inside a concise arrow body. Conditions that need a hook must be
    /// refused there rather than compiled into something invalid.
    ///
    /// A statement is the only safe position for these. Calling a hook
    /// inline in the JSX (`style={[a, useDark() && b]}`) looks tempting and
    /// breaks the rules of hooks as soon as the element itself sits behind
    /// a conditional -- the call order then changes between renders, which
    /// React treats as a hard error.
    pub hook_slot: Option<u32>,
    /// The components written around this root, outermost first. See
    /// `hozo_ir::EnclosingComponent`.
    pub enclosing: Vec<EnclosingComponent>,
    /// Text styles they hand down, once a manifest has been applied (#950).
    pub forwarded: Vec<StyleDeclaration>,
}

pub struct JsxCollector<'r, 'a> {
    pub roots: Vec<Root>,
    /// Source-level diagnostics (things true of the written JSX itself,
    /// independent of which backend it later lowers to) -- as opposed to
    /// the lowering-level ones each backend raises during `lower()`.
    pub diagnostics: Vec<Diagnostic>,
    /// See `dynamic_class::Decomposed::consumed`.
    pub consumed: Vec<SourceSpan>,
    /// The innermost enclosing function body's insertion point, maintained
    /// as the walk descends. See `Root::hook_slot`.
    hook_slot: Option<u32>,
    /// The components the walk is inside, outermost first.
    enclosing: Vec<EnclosingComponent>,
    expression_container: bool,
    /// Set while entering a class method, so the function that is its body
    /// gets no hook slot. See `visit_method_definition`.
    method_body: bool,
    scope: &'r Scope<'r, 'a>,
}

impl<'r, 'a> JsxCollector<'r, 'a> {
    pub fn new(scope: &'r Scope<'r, 'a>) -> Self {
        Self {
            roots: Vec::new(),
            diagnostics: Vec::new(),
            consumed: Vec::new(),
            hook_slot: None,
            enclosing: Vec::new(),
            expression_container: false,
            method_body: false,
            scope,
        }
    }

    /// Runs `body` with `slot` as the current innermost function body,
    /// restoring the previous one afterwards. Nested functions therefore
    /// shadow their parent, which is what a hook needs: it belongs to the
    /// function that actually renders the JSX.
    fn within_function<F: FnOnce(&mut Self)>(&mut self, slot: Option<u32>, body: F) {
        let outer = self.hook_slot;
        self.hook_slot = slot;
        body(self);
        self.hook_slot = outer;
    }
}

impl<'r, 'a> Visit<'a> for JsxCollector<'r, 'a> {
    fn visit_jsx_element(&mut self, it: &JSXElement<'a>) {
        if let Some(node) = build_node(
            it,
            self.scope,
            &mut self.diagnostics,
            &mut self.consumed,
            self.expression_container,
        ) {
            // Deliberately does not walk: `build_node` already recursed
            // into the children itself, so falling through to the generic
            // walker would visit (and re-collect) them a second time.
            self.roots.push(Root {
                node,
                tailwind_units: None,
                hook_slot: self.hook_slot,
                enclosing: self.enclosing.clone(),
                forwarded: Vec::new(),
            });
        } else {
            // But when nothing was built, nothing was visited either -- and
            // an element Hozo does not model is a boundary, not a wall.
            //
            // `<Card><View className="p-4"/></Card>` used to compile to
            // nothing at all: the outermost element is someone else's
            // component, so no root was collected, and the walk stopped
            // there rather than looking inside. Every Hozo primitive under
            // any wrapper the author wrote silently fell back to the
            // runtime components -- working, but with the compiler's whole
            // contribution quietly absent. Passing children into your own
            // component is ordinary React, not an edge case.
            //
            // The sibling form already worked (`<><Card/><View/></>`
            // collects the View), which is the same behaviour this gives
            // the nested one.
            let component = enclosing_component(it);
            let pushed = component.is_some();
            self.enclosing.extend(component);
            let previous = std::mem::replace(&mut self.expression_container, false);
            walk_jsx_element(self, it);
            self.expression_container = previous;
            if pushed {
                self.enclosing.pop();
            }
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

    fn visit_function(&mut self, it: &Function<'a>, flags: ScopeFlags) {
        // A class method's body is a function too, and a hook there -- a
        // class component's `render()` -- is an invalid hook call on every
        // render (#1183). No slot, so a condition that needs one is refused
        // at build time instead of crashing on the device.
        let method = std::mem::replace(&mut self.method_body, false);
        let slot = if method {
            None
        } else {
            it.body.as_ref().map(|body| body.span.start + 1)
        };
        self.within_function(slot, |this| walk_function(this, it, flags));
    }

    fn visit_method_definition(&mut self, it: &oxc_ast::ast::MethodDefinition<'a>) {
        self.method_body = true;
        walk_method_definition(self, it);
        self.method_body = false;
    }

    fn visit_arrow_function_expression(&mut self, it: &ArrowFunctionExpression<'a>) {
        // A concise body (`() => <View/>`) is an expression, not a block,
        // so there is no statement position to splice into. Reported as
        // "no slot" rather than silently producing invalid code.
        let method = std::mem::replace(&mut self.method_body, false);
        let slot = match &it.body {
            oxc_ast::ast::ArrowFunctionBody::FunctionBody(body) if !method => {
                Some(body.span.start + 1)
            }
            _ => None,
        };
        self.within_function(slot, |this| walk_arrow_function_expression(this, it));
    }

    // `render = () => { ... }` on a class: the same as a method.
    fn visit_property_definition(&mut self, it: &oxc_ast::ast::PropertyDefinition<'a>) {
        self.method_body = true;
        walk_property_definition(self, it);
        self.method_body = false;
    }
}

#[cfg(test)]
mod class_slot_expression_tests;

#[cfg(test)]
mod tests;

#[cfg(test)]
mod flex_direction_tests;

#[cfg(test)]
mod enter_motion_tests;

#[cfg(test)]
mod literal_in_braces_tests;
