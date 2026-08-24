//! Decomposes dynamic `className` expressions (proposal §7).
//!
//! The real dividing line isn't "how complex is the condition" -- it's
//! whether the set of possible output strings is enumerable at compile
//! time. A condition is never evaluated or interpreted here, only
//! delimited: it's captured as an opaque `ExprRef` and re-emitted verbatim
//! by a later lowering stage. Anything that isn't one of the recognized
//! shapes below (a literal, a `&&`-guard, a ternary, or a call to a
//! verified `cn`/`clsx`/`classnames` import) becomes a fallback leaf rather
//! than failing the whole node -- fallback is per-leaf, not per-node.

use hozo_ir::{Condition, ConditionExpr, ExprRef, SourceSpan, StyleDeclaration};
use oxc_ast::ast::{
    Argument, CallExpression, ConditionalExpression, Expression, IdentifierReference,
    JSXExpression, LogicalExpression, LogicalOperator, StringLiteral,
};
use oxc_span::{GetSpan, Span};
use oxc_syntax::module_record::ModuleRecord;

use crate::tailwind;

/// Import sources whose default export/named exports are trusted to behave
/// like `clsx` (join truthy string arguments with a space) when recognized
/// as a call. Not scope-aware: a *local* binding that happens to share the
/// same name as an import elsewhere in the file (shadowing) is not
/// detected, since this checks the module's top-level import table rather
/// than doing full scope resolution. Rare in practice; falls back safely if
/// the name isn't imported from one of these packages at all.
const RECOGNIZED_CX_MODULES: [&str; 3] = ["clsx", "classnames", "tailwind-merge"];

#[derive(Default)]
pub struct Decomposed {
    pub declarations: Vec<StyleDeclaration>,
    pub fallback: Vec<ExprRef>,
    /// Source ranges whose classes are now fully accounted for by
    /// `declarations`, so the candidate scan can leave them alone (see
    /// `crate::scan`). Recorded per string literal and only when *every*
    /// token in it compiled -- one fallback token makes the whole literal
    /// scannable again, which costs an unused rule rather than a missing
    /// one.
    pub consumed: Vec<SourceSpan>,
    /// Tokens whose variant Tailwind defines and Hozo does not compile.
    ///
    /// Collected rather than reported here, because this module has no
    /// diagnostics and the reason is worth keeping: it decomposes an
    /// expression and knows nothing about what a message should say.
    pub unsupported_variants: Vec<UnsupportedVariant>,
}

/// A class the author wrote that Hozo could not compile, and why.
///
/// The span is the whole string literal, not the token: a literal is what
/// the source has an offset for, and pointing at `'p-4 open:p-4'` is more
/// use than pointing inside it.
pub struct UnsupportedVariant {
    pub variant: String,
    pub token: String,
    pub span: SourceSpan,
}

pub fn decompose_class_name(expr: &JSXExpression, module_record: &ModuleRecord) -> Decomposed {
    let mut out = Decomposed::default();
    decompose(classify_jsx_expression(expr), None, None, &mut out, module_record);
    out
}

/// The handful of expression shapes `decompose` understands, regardless of
/// which wrapper enum (`Expression`, `Argument`, `JSXExpression`) they were
/// extracted from -- those wrappers differ only at the outermost level;
/// everything nested below is a plain `Expression`.
enum Target<'a, 'b> {
    StringLiteral(&'b StringLiteral<'a>),
    Logical(&'b LogicalExpression<'a>),
    Conditional(&'b ConditionalExpression<'a>),
    Call(&'b CallExpression<'a>),
    Spread(Span),
    Other(Span),
}

fn classify_expression<'a, 'b>(expr: &'b Expression<'a>) -> Target<'a, 'b> {
    match expr {
        Expression::StringLiteral(lit) => Target::StringLiteral(lit),
        Expression::LogicalExpression(logical) if logical.operator == LogicalOperator::And => {
            Target::Logical(logical)
        }
        Expression::ConditionalExpression(cond) => Target::Conditional(cond),
        Expression::CallExpression(call) => Target::Call(call),
        other => Target::Other(other.span()),
    }
}

fn classify_argument<'a, 'b>(arg: &'b Argument<'a>) -> Target<'a, 'b> {
    match arg {
        Argument::StringLiteral(lit) => Target::StringLiteral(lit),
        Argument::LogicalExpression(logical) if logical.operator == LogicalOperator::And => {
            Target::Logical(logical)
        }
        Argument::ConditionalExpression(cond) => Target::Conditional(cond),
        Argument::CallExpression(call) => Target::Call(call),
        Argument::SpreadElement(spread) => Target::Spread(spread.span()),
        other => Target::Other(other.span()),
    }
}

fn classify_jsx_expression<'a, 'b>(expr: &'b JSXExpression<'a>) -> Target<'a, 'b> {
    match expr {
        JSXExpression::StringLiteral(lit) => Target::StringLiteral(lit),
        JSXExpression::LogicalExpression(logical) if logical.operator == LogicalOperator::And => {
            Target::Logical(logical)
        }
        JSXExpression::ConditionalExpression(cond) => Target::Conditional(cond),
        JSXExpression::CallExpression(call) => Target::Call(call),
        other => Target::Other(other.span()),
    }
}

fn to_expr_ref(span: Span) -> ExprRef {
    ExprRef(SourceSpan { start: span.start, end: span.end })
}

fn and_ref(current: &Option<ConditionExpr>, guard: Span) -> Option<ConditionExpr> {
    let guard = ConditionExpr::Ref(to_expr_ref(guard));
    match current {
        None => Some(guard),
        Some(existing) => Some(ConditionExpr::And(Box::new(existing.clone()), Box::new(guard))),
    }
}

fn and_not_ref(current: &Option<ConditionExpr>, guard: Span) -> Option<ConditionExpr> {
    let negated = ConditionExpr::Not(Box::new(ConditionExpr::Ref(to_expr_ref(guard))));
    match current {
        None => Some(negated),
        Some(existing) => Some(ConditionExpr::And(Box::new(existing.clone()), Box::new(negated))),
    }
}

fn to_condition(expr: Option<ConditionExpr>) -> Condition {
    match expr {
        None => Condition::Always,
        Some(expr) => Condition::Expr(expr),
    }
}

fn is_recognized_cx_call(callee: &Expression, module_record: &ModuleRecord) -> Option<()> {
    let Expression::Identifier(ident) = callee else { return None };
    is_recognized_cx_identifier(ident, module_record)
}

fn is_recognized_cx_identifier(
    ident: &IdentifierReference,
    module_record: &ModuleRecord,
) -> Option<()> {
    let name = ident.name.as_str();
    module_record.import_entries.iter().find_map(|entry| {
        (entry.local_name.name.as_str() == name
            && RECOGNIZED_CX_MODULES.contains(&entry.module_request.name.as_str()))
        .then_some(())
    })
}

/// Re-emits `span` verbatim, once.
///
/// Once, because a ternary whose branches both fail is one expression and
/// would otherwise be written into the output twice.
fn fall_back_to(out: &mut Decomposed, span: Span) {
    let expr_ref = to_expr_ref(span);
    if !out.fallback.contains(&expr_ref) {
        out.fallback.push(expr_ref);
    }
}

fn decompose(
    target: Target,
    condition: Option<ConditionExpr>,
    // The expression the condition came from, and therefore what has to be
    // re-emitted when something inside it cannot be compiled.
    //
    // Falling back the string literal alone would drop the guard around it:
    // `cond ? 'my-card' : 'p-8'` would put `my-card` on the element
    // unconditionally, which is a different wrong answer from deleting it
    // and not obviously a better one. The outermost guard is the one kept,
    // since an inner one re-emitted alone loses everything above it.
    guard: Option<Span>,
    out: &mut Decomposed,
    module_record: &ModuleRecord,
) {
    match target {
        Target::StringLiteral(lit) => {
            let fallback_span = guard.unwrap_or(lit.span);
            let mut fell_back = false;
            for token in lit.value.split_whitespace() {
                // The same question the `className` path asks, and for the
                // same reason: an unrecognised variant leaves its own text
                // in front of the utility, and the utility parser will read
                // that text as a value.
                let (token_condition, properties) = if tailwind::has_unstripped_variant(token) {
                    (Condition::Always, Vec::new())
                } else {
                    tailwind::expand_utility(token)
                };
                if properties.is_empty() {
                    // Nothing compiled, so the literal has to reach the DOM
                    // as written -- a project's own `my-card` carries no
                    // styles Hozo could have produced, and a variant Hozo
                    // does not compile is the author's to see.
                    //
                    // This was a `continue`, which deleted the token. The
                    // static path was taught to carry back when `group` and
                    // `peer` turned out to be vanishing from it; this path
                    // was not, so `cn('open:p-4')` still compiled to
                    // nothing and said nothing about it.
                    //
                    // A token has no expression of its own, so what gets
                    // carried is the literal -- or whatever guards it, so
                    // the guard survives with it.
                    if !fell_back {
                        fall_back_to(out, fallback_span);
                        fell_back = true;
                    }
                    if let Some(variant) = tailwind::unsupported_variant_name(token) {
                        out.unsupported_variants.push(UnsupportedVariant {
                            variant: variant.to_string(),
                            token: token.to_string(),
                            span: SourceSpan { start: lit.span.start, end: lit.span.end },
                        });
                    }
                    continue;
                }
                if token_condition == Condition::Always {
                    let final_condition = to_condition(condition.clone());
                    for property in properties {
                        out.declarations.push(StyleDeclaration { property, condition: final_condition.clone() });
                    }
                } else if condition.is_none() {
                    // No surrounding dynamic guard, so the token's own
                    // variant-derived condition (hover:/md:/etc.) applies
                    // directly -- e.g. `cn('hover:bg-blue-500')`.
                    for property in properties {
                        out.declarations.push(StyleDeclaration { property, condition: token_condition.clone() });
                    }
                } else {
                    // A variant-prefixed literal nested inside a dynamic
                    // guard (`active && 'hover:bg-blue-500'`) would need to
                    // combine a CSS-native condition with a JS-tracked one
                    // -- Condition doesn't support that composition yet.
                    // Falls back rather than silently dropping either half.
                    //
                    // Guarded, because a literal with two such tokens would
                    // otherwise be re-emitted twice.
                    if !fell_back {
                        fall_back_to(out, fallback_span);
                        fell_back = true;
                    }
                }
            }
            if !fell_back {
                out.consumed.push(SourceSpan { start: lit.span.start, end: lit.span.end });
            }
        }
        Target::Logical(logical) => {
            let guarded = and_ref(&condition, logical.left.span());
            let guard = guard.or(Some(logical.span));
            decompose(classify_expression(&logical.right), guarded, guard, out, module_record);
        }
        Target::Conditional(cond) => {
            let guard = guard.or(Some(cond.span));
            let when_true = and_ref(&condition, cond.test.span());
            decompose(classify_expression(&cond.consequent), when_true, guard, out, module_record);
            let when_false = and_not_ref(&condition, cond.test.span());
            decompose(classify_expression(&cond.alternate), when_false, guard, out, module_record);
        }
        Target::Call(call) if is_recognized_cx_call(&call.callee, module_record).is_some() => {
            for arg in &call.arguments {
                decompose(classify_argument(arg), condition.clone(), guard, out, module_record);
            }
        }
        Target::Call(call) => {
            // Unrecognized callee: opaque leaf, same as `Other` below.
            fall_back_to(out, guard.unwrap_or(call.span));
        }
        Target::Spread(span) | Target::Other(span) => {
            // Opaque leaf: a spread argument or any other expression shape.
            // Falls back regardless of `condition` -- if this leaf is
            // itself already inside a recognized guard, the guard was
            // applied to the *literals* it selects between, not to whether
            // the leaf needs runtime evaluation at all.
            //
            // But the guard still has to come with it. `a ? (b ? 'x' : 'p-4')
            // : 'p-8'` reaches here on the parenthesised inner ternary, and
            // re-emitting that alone put `x` on the element whenever `b`
            // held, whether or not `a` did.
            fall_back_to(out, guard.unwrap_or(span));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use hozo_ir::{Color, FlexShorthand, StyleProperty};
    use oxc_allocator::Allocator;
    use oxc_ast::ast::JSXAttributeValue;
    use oxc_ast_visit::Visit;
    use oxc_parser::Parser;
    use oxc_span::SourceType;

    /// Finds the first JSX element's `className` `ExpressionContainer` in
    /// `source` and runs it through `decompose_class_name`.
    fn decompose_source(source: &str) -> Decomposed {
        let allocator = Allocator::default();
        let source_type = SourceType::from_extension("tsx").unwrap();
        let ret = Parser::new(&allocator, source, source_type).parse();

        struct Finder<'a, 'r> {
            module_record: &'r ModuleRecord<'a>,
            result: Option<Decomposed>,
        }
        impl<'a> Visit<'a> for Finder<'a, '_> {
            fn visit_jsx_attribute(&mut self, it: &oxc_ast::ast::JSXAttribute<'a>) {
                if self.result.is_some() {
                    return;
                }
                if let Some(JSXAttributeValue::ExpressionContainer(container)) = &it.value {
                    self.result = Some(decompose_class_name(&container.expression, self.module_record));
                }
            }
        }
        let mut finder = Finder { module_record: &ret.module_record, result: None };
        finder.visit_program(&ret.program);
        finder.result.expect("no className expression container found in source")
    }

    #[test]
    fn decomposes_logical_and_guard() {
        let out = decompose_source(
            r#"
            import { View } from '@hozo/core'
            import { cn } from 'clsx'
            const el = <View className={cn('p-4', active && 'flex-1')} />
            "#,
        );
        assert_eq!(out.fallback.len(), 0);
        // 'p-4' -> 4 padding longhands under Always, 'flex-1' -> 1 declaration under Expr(active)
        assert_eq!(out.declarations.len(), 5);
        let flex_decl =
            out.declarations.iter().find(|d| d.property == StyleProperty::Flex(FlexShorthand::Grow(1.0)));
        assert!(matches!(flex_decl.unwrap().condition, Condition::Expr(ConditionExpr::Ref(_))));
    }

    #[test]
    fn decomposes_ternary_into_true_and_false_branches() {
        let out = decompose_source(
            r#"
            import { View } from '@hozo/core'
            import { cn } from 'clsx'
            const el = <View className={cn(size === 'lg' ? 'p-6' : 'p-2')} />
            "#,
        );
        assert_eq!(out.fallback.len(), 0);
        assert_eq!(out.declarations.len(), 8); // 4 padding sides x 2 branches
        let has_not = out
            .declarations
            .iter()
            .any(|d| matches!(&d.condition, Condition::Expr(ConditionExpr::Not(_))));
        assert!(has_not, "the false branch should carry a Not(..) condition");
    }

    #[test]
    fn variant_prefixed_literal_under_a_dynamic_guard_falls_back() {
        let out = decompose_source(
            r#"
            import { View } from '@hozo/core'
            import { cn } from 'clsx'
            const el = <View className={cn('p-4', active && 'hover:bg-blue-500')} />
            "#,
        );
        // 'p-4' still compiles normally (4 padding longhands, Always).
        assert_eq!(out.declarations.len(), 4);
        // The `hover:` literal can't combine with the `active &&` guard yet
        // (Condition doesn't compose a CSS pseudo-class with a JS-tracked
        // one), so it falls back rather than silently dropping either half.
        assert_eq!(out.fallback.len(), 1);
    }

    #[test]
    fn falls_back_on_unverified_cx_import() {
        let out = decompose_source(
            r#"
            const cn = (a) => a
            import { View } from '@hozo/core'
            const el = <View className={cn('p-4', active && 'flex-1')} />
            "#,
        );
        // `cn` is locally defined here, not imported from clsx/classnames/
        // tailwind-merge, so the whole call must fall back rather than be
        // silently (mis)compiled as if it behaved like clsx.
        assert_eq!(out.declarations.len(), 0);
        assert_eq!(out.fallback.len(), 1);
    }

    #[test]
    fn falls_back_on_opaque_class_name() {
        let out = decompose_source(
            r#"
            import { View } from '@hozo/core'
            const el = <View className={classNameFromProps} />
            "#,
        );
        assert_eq!(out.declarations.len(), 0);
        assert_eq!(out.fallback.len(), 1);
    }

    #[test]
    fn parses_color_token() {
        let out = decompose_source(
            r#"
            import { View } from '@hozo/core'
            import { cn } from 'clsx'
            const el = <View className={cn('bg-blue-500')} />
            "#,
        );
        assert_eq!(
            out.declarations,
            vec![StyleDeclaration {
                property: StyleProperty::BackgroundColor(Color::Token("blue-500".to_string())),
                condition: Condition::Always,
            }]
        );
    }

    /// The source text of everything this decomposition gave up on.
    fn carried(source: &str) -> Vec<String> {
        decompose_source(source)
            .fallback
            .iter()
            .map(|expr_ref| {
                source[expr_ref.0.start as usize..expr_ref.0.end as usize].to_string()
            })
            .collect()
    }

    fn wrap(expression: &str) -> String {
        format!(
            "
import {{ View }} from '@hozo/core'
import cn from 'clsx'
const el = <View className={{{expression}}} />
"
        )
    }

    #[test]
    fn a_class_it_cannot_compile_is_carried_rather_than_deleted() {
        // The static path learned this when `group` and `peer` turned out
        // to be vanishing from it. This path kept the `continue`, so a
        // project's own class written under a condition was deleted and
        // nothing said so.
        assert_eq!(carried(&wrap("cond ? 'my-card' : 'p-8'")), ["cond ? 'my-card' : 'p-8'"]);
        assert_eq!(carried(&wrap("cn('p-4', 'open:p-4')")), ["'open:p-4'"]);
    }

    #[test]
    fn what_is_carried_keeps_the_condition_around_it() {
        // The reason the whole guarded expression goes back rather than the
        // literal inside it. Carrying `'my-card'` alone would put the class
        // on the element unconditionally -- a different wrong answer from
        // deleting it, and not a better one.
        assert!(carried(&wrap("cond ? 'my-card' : 'p-8'"))[0].starts_with("cond ?"));
        assert!(carried(&wrap("cond && 'my-card'"))[0].starts_with("cond &&"));
        // Including the guard that is not the nearest one. An inner ternary
        // re-emitted alone applies whenever *it* holds, whether or not the
        // outer test did.
        assert_eq!(
            carried(&wrap("a ? (b ? 'my-card' : 'p-4') : 'p-8'")),
            ["a ? (b ? 'my-card' : 'p-4') : 'p-8'"],
        );
    }

    #[test]
    fn one_expression_is_carried_once() {
        // Both branches fail, and they are one expression.
        assert_eq!(carried(&wrap("cond ? 'my-card' : 'other-card'")).len(), 1);
        // Two failing tokens in one literal, likewise.
        assert_eq!(carried(&wrap("cn('my-card other-card')")).len(), 1);
    }

    #[test]
    fn a_variant_tailwind_defines_and_hozo_does_not_is_named() {
        let out = decompose_source(&wrap("cn('open:p-4')"));
        assert_eq!(out.unsupported_variants.len(), 1);
        assert_eq!(out.unsupported_variants[0].variant, "open");
        // A project's own class is not a gap in Hozo, so it gets carried
        // without being reported.
        assert!(decompose_source(&wrap("cn('my-card')")).unsupported_variants.is_empty());
    }

    #[test]
    fn a_class_that_compiles_is_still_compiled_away() {
        // The carry is for what fails. Everything that worked before has to
        // keep producing no fallback at all, or this fix would have turned
        // every dynamic className into a runtime string.
        assert!(carried(&wrap("cond ? 'p-4' : 'p-8'")).is_empty());
        assert!(carried(&wrap("cn('p-4', 'bg-blue-500')")).is_empty());
    }
}
