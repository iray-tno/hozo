//! Decomposes dynamic `className` expressions (proposal §7).
//!
//! The real dividing line isn't "how complex is the condition" -- it's
//! whether the set of possible output strings is enumerable at compile
//! time. A condition is never evaluated or interpreted here, only
//! delimited: it's captured as an opaque `ExprRef` and re-emitted verbatim
//! by a later lowering stage. Anything that isn't one of the recognized
//! shapes below (a literal, a `&&`-guard, a ternary, a template literal whose
//! interpolations stand between classes, or a call to a
//! verified `cn`/`clsx`/`classnames` import) becomes a fallback leaf rather
//! than failing the whole node -- fallback is per-leaf, not per-node.

use hozo_ir::{Condition, ConditionExpr, ExprRef, SourceSpan, StyleDeclaration};
use oxc_ast::ast::{
    Argument, CallExpression, ConditionalExpression, Expression, IdentifierReference,
    JSXExpression, LogicalExpression, LogicalOperator, StringLiteral, TemplateLiteral,
};
use oxc_span::{GetSpan, Span};
use oxc_syntax::module_record::{ImportImportName, ModuleRecord};

use crate::tailwind;

mod evaluation;
pub(crate) use evaluation::{capture_evaluation, capture_template_parts};

/// Import sources whose default export/named exports are trusted to behave
/// like `clsx` (join truthy string arguments with a space) when recognized
/// as a call. Not scope-aware: a *local* binding that happens to share the
/// same name as an import elsewhere in the file (shadowing) is not
/// detected, since this checks the module's top-level import table rather
/// than doing full scope resolution. Rare in practice; falls back safely if
/// the name isn't imported from one of these packages at all.
const RECOGNIZED_CX_MODULES: [&str; 3] = ["clsx", "classnames", "tailwind-merge"];

/// Hozo's own helper (#873), so merging a caller's `className` needs no
/// dependency. Engine owns it and core re-exports it, so both are read.
/// Only the `cx` export is: anything else imported from them, such as a
/// component, is not a class joiner.
const HOZO_CX_MODULES: [&str; 2] = ["@hozo/core", "@hozo/engine"];
const HOZO_CX_NAME: &str = "cx";

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
    /// The optional guarded-template proof is irrelevant to other legacy
    /// failures; do not decompose ordinary opaque branches a second time.
    pub guarded_template: bool,
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

/// A function the project says joins class strings as `clsx` does, by the
/// specifier its callers import it from and the name they import (#964).
/// `name` is `default` for a default import.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ClassHelper {
    pub module: String,
    pub name: String,
}

/// Which calls in a file are read argument by argument: the imports above,
/// and whatever the project added.
pub(crate) struct Joiners<'r, 'a> {
    pub module_record: &'r ModuleRecord<'a>,
    pub helpers: &'r [ClassHelper],
    /// Module-level string constants, by reference offset.
    pub constants: &'r crate::rest::ConstantStrings,
}

pub(crate) fn decompose_class_name(expr: &JSXExpression, module_record: &Joiners) -> Decomposed {
    let mut out = Decomposed::default();
    decompose(
        classify_jsx_expression(expr),
        None,
        None,
        &mut out,
        module_record,
        false,
    );
    out
}

/// Secondary props already have an opaque passthrough path. Avoid building
/// and discarding a fallback vector for a bare prop/member/untrusted call;
/// recognized inputs still use exactly the root's classifier/decomposer.
pub(crate) fn decompose_class_pieces(
    expr: &JSXExpression,
    joiners: &Joiners,
) -> Option<Decomposed> {
    let target = classify_jsx_expression(expr);
    match &target {
        Target::Other(_) | Target::Spread(_) => return None,
        Target::Identifier(span) if !joiners.constants.contains_key(&span.start) => return None,
        Target::Call(call) if is_recognized_cx_call(&call.callee, joiners).is_none() => {
            return None
        }
        _ => {}
    }
    let mut out = Decomposed::default();
    decompose(target, None, None, &mut out, joiners, false);
    Some(out)
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
    Template(&'b TemplateLiteral<'a>),
    Identifier(Span),
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
        Expression::TemplateLiteral(template) => Target::Template(template),
        Expression::Identifier(id) => Target::Identifier(id.span),
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
        Argument::TemplateLiteral(template) => Target::Template(template),
        Argument::Identifier(id) => Target::Identifier(id.span),
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
        JSXExpression::TemplateLiteral(template) => Target::Template(template),
        JSXExpression::Identifier(id) => Target::Identifier(id.span),
        other => Target::Other(other.span()),
    }
}

fn to_expr_ref(span: Span) -> ExprRef {
    ExprRef(SourceSpan {
        start: span.start,
        end: span.end,
    })
}

fn and_ref(current: &Option<ConditionExpr>, guard: Span) -> Option<ConditionExpr> {
    let guard = ConditionExpr::Ref(to_expr_ref(guard));
    match current {
        None => Some(guard),
        Some(existing) => Some(ConditionExpr::And(
            Box::new(existing.clone()),
            Box::new(guard),
        )),
    }
}

fn and_not_ref(current: &Option<ConditionExpr>, guard: Span) -> Option<ConditionExpr> {
    let negated = ConditionExpr::Not(Box::new(ConditionExpr::Ref(to_expr_ref(guard))));
    match current {
        None => Some(negated),
        Some(existing) => Some(ConditionExpr::And(
            Box::new(existing.clone()),
            Box::new(negated),
        )),
    }
}

fn to_condition(expr: Option<ConditionExpr>) -> Condition {
    match expr {
        None => Condition::Always,
        Some(expr) => Condition::Expr(expr),
    }
}

fn is_recognized_cx_call(callee: &Expression, module_record: &Joiners) -> Option<()> {
    let Expression::Identifier(ident) = callee else {
        return None;
    };
    is_recognized_cx_identifier(ident, module_record)
}

fn is_recognized_cx_identifier(ident: &IdentifierReference, joiners: &Joiners) -> Option<()> {
    let name = ident.name.as_str();
    joiners
        .module_record
        .import_entries
        .iter()
        .find_map(|entry| {
            let module = entry.module_request.name.as_str();
            let imported = match &entry.import_name {
                ImportImportName::Name(n) => n.name.as_str(),
                ImportImportName::Default(_) => "default",
                ImportImportName::NamespaceObject => return None,
            };
            let is_project_helper = joiners
                .helpers
                .iter()
                .any(|helper| helper.module == module && helper.name == imported);
            let is_hozo_cx = HOZO_CX_MODULES.contains(&module)
                && matches!(
                    &entry.import_name,
                    ImportImportName::Name(n) if n.name.as_str() == HOZO_CX_NAME
                );
            (entry.local_name.name.as_str() == name
                && (RECOGNIZED_CX_MODULES.contains(&module) || is_hozo_cx || is_project_helper))
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

/// The tokens of one string literal, wherever its text came from.
fn decompose_literal(
    value: &str,
    span: Span,
    condition: Option<ConditionExpr>,
    guard: Option<Span>,
    out: &mut Decomposed,
    consume: bool,
) {
    let fallback_span = guard.unwrap_or(span);
    let mut fell_back = false;
    for token in value.split_whitespace() {
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
                    span: SourceSpan {
                        start: span.start,
                        end: span.end,
                    },
                });
            }
            continue;
        }
        if token_condition == Condition::Always {
            let final_condition = to_condition(condition.clone());
            for property in properties {
                out.declarations.push(StyleDeclaration {
                    property,
                    condition: final_condition.clone(),
                });
            }
        } else if condition.is_none() {
            // No surrounding dynamic guard, so the token's own
            // variant-derived condition (hover:/md:/etc.) applies
            // directly -- e.g. `cn('hover:bg-blue-500')`.
            for property in properties {
                out.declarations.push(StyleDeclaration {
                    property,
                    condition: token_condition.clone(),
                });
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
    if !fell_back && consume {
        out.consumed.push(SourceSpan {
            start: span.start,
            end: span.end,
        });
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
    module_record: &Joiners,
    capture_templates: bool,
) {
    match target {
        Target::StringLiteral(lit) => {
            decompose_literal(&lit.value, lit.span, condition, guard, out, true);
        }
        // A module-level `const` holding a string literal, read as that
        // literal. The declaration's text is not marked consumed: the same
        // constant may be read somewhere this cannot see, and its classes
        // still need their CSS there. What falls back is the reference.
        Target::Identifier(span) => match module_record.constants.get(&span.start) {
            Some((value, decl)) => {
                decompose_literal(
                    value,
                    *decl,
                    condition,
                    Some(guard.unwrap_or(span)),
                    out,
                    false,
                );
            }
            None => fall_back_to(out, guard.unwrap_or(span)),
        },
        // `` `p-4 hover:bg-blue-500 ${className}` ``, the way a merge is
        // written without a helper (#874). The text between interpolations
        // is classes, as a string literal's is; each interpolation is a
        // part of its own, decomposed as one, so only what cannot be read
        // falls back.
        //
        // The whole template falls back instead when that would split a
        // class: `` `bg-${tone}-500` `` is one class assembled at runtime, and
        // neither its text nor its interpolation is a class alone. Also when
        // the text holds a class Hozo cannot compile: a string literal is
        // carried as written in that case, and a template's text on its own
        // is not an expression that could be.
        Target::Template(template) => {
            out.guarded_template |= guard.is_some();
            let whole = guard.unwrap_or(template.span);
            let text = |index: usize| {
                let quasi = &template.quasis[index];
                quasi
                    .value
                    .cooked
                    .as_ref()
                    .map_or(quasi.value.raw.as_str(), |cooked| cooked.as_str())
            };
            // Every interpolation stands between whitespace or the ends.
            let separated = (0..template.expressions.len()).all(|index| {
                let before = text(index);
                let after = text(index + 1);
                (index == 0 && before.is_empty() || before.ends_with(char::is_whitespace))
                    && (index + 1 == template.quasis.len() - 1 && after.is_empty()
                        || after.starts_with(char::is_whitespace))
            });
            let compilable = (0..template.quasis.len()).all(|index| {
                text(index).split_whitespace().all(|token| {
                    if tailwind::has_unstripped_variant(token) {
                        return false;
                    }
                    let (token_condition, properties) = tailwind::expand_utility(token);
                    !properties.is_empty()
                        && (token_condition == Condition::Always || condition.is_none())
                })
            });
            if !separated || !compilable {
                fall_back_to(out, whole);
                return;
            }
            // Only a capture plan may separate guarded interpolations. Prove
            // each part first: fully compiled, or wholly opaque. A partial
            // literal must retain its original fallback/diagnostic route.
            let mut parts = Vec::new();
            if capture_templates {
                for expression in &template.expressions {
                    let mut part = Decomposed::default();
                    decompose(
                        classify_expression(expression),
                        condition.clone(),
                        None,
                        &mut part,
                        module_record,
                        true,
                    );
                    let wholly_opaque = part.declarations.is_empty()
                        && part.fallback == [to_expr_ref(expression.span())];
                    if !(part.fallback.is_empty() || wholly_opaque) {
                        fall_back_to(out, whole);
                        return;
                    }
                    parts.push(part);
                }
            }
            for (index, quasi) in template.quasis.iter().enumerate() {
                for token in text(index).split_whitespace() {
                    let (token_condition, properties) = tailwind::expand_utility(token);
                    let token_condition = if token_condition == Condition::Always {
                        to_condition(condition.clone())
                    } else {
                        token_condition
                    };
                    for property in properties {
                        out.declarations.push(StyleDeclaration {
                            property,
                            condition: token_condition.clone(),
                        });
                    }
                }
                if !text(index).trim().is_empty() {
                    out.consumed.push(SourceSpan {
                        start: quasi.span.start,
                        end: quasi.span.end,
                    });
                }
            }
            if capture_templates {
                for part in parts {
                    out.declarations.extend(part.declarations);
                    out.fallback.extend(part.fallback);
                    out.consumed.extend(part.consumed);
                    out.unsupported_variants.extend(part.unsupported_variants);
                }
            } else {
                for expression in &template.expressions {
                    decompose(
                        classify_expression(expression),
                        condition.clone(),
                        guard,
                        out,
                        module_record,
                        false,
                    );
                }
            }
        }
        Target::Logical(logical) => {
            let guarded = and_ref(&condition, logical.left.span());
            let guard = guard.or(Some(logical.span));
            decompose(
                classify_expression(&logical.right),
                guarded,
                guard,
                out,
                module_record,
                capture_templates,
            );
        }
        Target::Conditional(cond) => {
            let guard = guard.or(Some(cond.span));
            let when_true = and_ref(&condition, cond.test.span());
            decompose(
                classify_expression(&cond.consequent),
                when_true,
                guard,
                out,
                module_record,
                capture_templates,
            );
            let when_false = and_not_ref(&condition, cond.test.span());
            decompose(
                classify_expression(&cond.alternate),
                when_false,
                guard,
                out,
                module_record,
                capture_templates,
            );
        }
        Target::Call(call) if is_recognized_cx_call(&call.callee, module_record).is_some() => {
            for arg in &call.arguments {
                decompose(
                    classify_argument(arg),
                    condition.clone(),
                    guard,
                    out,
                    module_record,
                    capture_templates,
                );
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
        decompose_with_helpers(source, &[])
    }

    fn decompose_with_helpers(source: &str, helpers: &[ClassHelper]) -> Decomposed {
        let allocator = Allocator::default();
        let source_type = SourceType::from_extension("tsx").unwrap();
        let ret = Parser::new(&allocator, source, source_type).parse();

        struct Finder<'a, 'r> {
            module_record: &'r ModuleRecord<'a>,
            helpers: &'r [ClassHelper],
            result: Option<Decomposed>,
        }
        impl<'a> Visit<'a> for Finder<'a, '_> {
            fn visit_jsx_attribute(&mut self, it: &oxc_ast::ast::JSXAttribute<'a>) {
                if self.result.is_some() {
                    return;
                }
                if let Some(JSXAttributeValue::ExpressionContainer(container)) = &it.value {
                    let constants = crate::rest::ConstantStrings::new();
                    let joiners = Joiners {
                        module_record: self.module_record,
                        helpers: self.helpers,
                        constants: &constants,
                    };
                    self.result = Some(decompose_class_name(&container.expression, &joiners));
                }
            }
        }
        let mut finder = Finder {
            module_record: &ret.module_record,
            helpers,
            result: None,
        };
        finder.visit_program(&ret.program);
        finder
            .result
            .expect("no className expression container found in source")
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
        let flex_decl = out
            .declarations
            .iter()
            .find(|d| d.property == StyleProperty::Flex(FlexShorthand::Grow(1.0)));
        assert!(matches!(
            flex_decl.unwrap().condition,
            Condition::Expr(ConditionExpr::Ref(_))
        ));
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
    fn hozo_core_cx_is_recognized_as_clsx_is() {
        let source = "
import { View, cx } from '@hozo/core'
const el = <View className={cx('p-4 hover:bg-blue-500', className)} />
";
        let out = decompose_source(source);
        assert_eq!(carried(source), ["className"]);
        assert!(out
            .declarations
            .iter()
            .any(|d| d.condition != Condition::Always));
        // Renamed on import, it is still core's helper.
        let renamed = "import { cx as join } from '@hozo/core'
const el = <View className={join('p-4', className)} />";
        assert_eq!(carried(renamed), ["className"]);
        // Where it is owned, for the packages below core.
        let engine = "import { cx } from '@hozo/engine'
const el = <View className={cx('p-4', className)} />";
        assert_eq!(carried(engine), ["className"]);
    }

    fn helper(module: &str, name: &str) -> ClassHelper {
        ClassHelper {
            module: module.to_string(),
            name: name.to_string(),
        }
    }

    #[test]
    fn a_helper_the_project_declares_is_read_as_clsx_is() {
        // shadcn/ui's `cn`, which the compiler cannot see into (#964).
        let source = "import { View } from '@hozo/core'
import { cn } from '@/lib/utils'
const el = <View className={cn('p-4 hover:bg-blue-500', className)} />";
        let carried_with = |helpers: &[ClassHelper]| -> Vec<String> {
            decompose_with_helpers(source, helpers)
                .fallback
                .iter()
                .map(|r| source[r.0.start as usize..r.0.end as usize].to_string())
                .collect()
        };
        assert_eq!(carried_with(&[helper("@/lib/utils", "cn")]), ["className"]);
        // Undeclared, or declared for another module or name, it falls back whole.
        let whole = ["cn('p-4 hover:bg-blue-500', className)"];
        assert_eq!(carried_with(&[]), whole);
        assert_eq!(carried_with(&[helper("./utils", "cn")]), whole);
        assert_eq!(carried_with(&[helper("@/lib/utils", "cx")]), whole);
    }

    #[test]
    fn a_declared_default_export_matches_a_default_import() {
        let source = "import { View } from '@hozo/core'
import join from './join'
const el = <View className={join('p-4', className)} />";
        let out = decompose_with_helpers(source, &[helper("./join", "default")]);
        assert_eq!(out.fallback.len(), 1);
        assert!(!out.declarations.is_empty());
    }

    #[test]
    fn another_import_from_hozo_core_is_not_a_cx() {
        // A component imported from core, called like a function, is not
        // trusted to join classes just because of where it came from.
        let source = "import { View, Text } from '@hozo/core'
const el = <View className={Text('p-4', className)} />";
        assert_eq!(carried(source), ["Text('p-4', className)"]);
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
            .map(|expr_ref| source[expr_ref.0.start as usize..expr_ref.0.end as usize].to_string())
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
        assert_eq!(
            carried(&wrap("cond ? 'my-card' : 'p-8'")),
            ["cond ? 'my-card' : 'p-8'"]
        );
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
        assert!(decompose_source(&wrap("cn('my-card')"))
            .unsupported_variants
            .is_empty());
    }

    #[test]
    fn a_class_that_compiles_is_still_compiled_away() {
        // The carry is for what fails. Everything that worked before has to
        // keep producing no fallback at all, or this fix would have turned
        // every dynamic className into a runtime string.
        assert!(carried(&wrap("cond ? 'p-4' : 'p-8'")).is_empty());
        assert!(carried(&wrap("cn('p-4', 'bg-blue-500')")).is_empty());
    }

    // #874: a template literal, the merge written without a helper.

    #[test]
    fn a_template_compiles_its_text_and_carries_only_what_it_cannot_read() {
        let source = wrap("`p-4 hover:bg-blue-500 ${className}`");
        let out = decompose_source(&source);
        assert_eq!(carried(&source), ["className"]);
        // padding's four sides, and the hover background with its own condition.
        assert_eq!(out.declarations.len(), 5, "{:?}", out.declarations);
        assert!(out
            .declarations
            .iter()
            .any(|d| d.condition != Condition::Always));
    }

    #[test]
    fn an_interpolation_decomposes_as_any_other_part() {
        let source = wrap("`p-4 ${big ? 'px-8' : 'px-2'}`");
        let out = decompose_source(&source);
        assert!(out.fallback.is_empty(), "{:?}", carried(&source));
        let has_not = out
            .declarations
            .iter()
            .any(|d| matches!(&d.condition, Condition::Expr(ConditionExpr::Not(_))));
        assert!(has_not, "the ternary's false branch keeps its guard");
    }

    #[test]
    fn a_class_assembled_across_text_and_interpolation_falls_back_whole() {
        assert_eq!(carried(&wrap("`bg-${tone}-500`")), ["`bg-${tone}-500`"]);
        assert_eq!(carried(&wrap("`p-4 ${a}${b}`")), ["`p-4 ${a}${b}`"]);
        assert_eq!(carried(&wrap("`p-4${extra}`")), ["`p-4${extra}`"]);
    }

    #[test]
    fn a_template_whose_text_holds_a_class_hozo_cannot_compile_falls_back_whole() {
        // A string literal is carried as written; a template's text alone is
        // not an expression, so the template goes as a whole.
        assert_eq!(carried(&wrap("`p-4 my-card ${x}`")), ["`p-4 my-card ${x}`"]);
    }

    #[test]
    fn a_template_inside_clsx_decomposes_too() {
        let source = wrap("cn(`p-4 ${className}`, 'bg-blue-500')");
        assert_eq!(carried(&source), ["className"]);
    }
}
