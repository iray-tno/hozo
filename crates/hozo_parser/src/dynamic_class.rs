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
use oxc_syntax::module_record::{ImportEntry, ImportImportName, ModuleRecord};

use crate::tailwind;

mod classify;
mod closed_call;
mod evaluation;
mod guards;
mod helpers;

use classify::{classify_argument, classify_expression, classify_jsx_expression, Target};
use closed_call::decompose_closed_call;
pub(crate) use evaluation::{capture_evaluation, capture_template_parts};
use guards::{
    and_not_ref, and_ref, conjoin_condition_with_guard, guard_nodes, to_condition, to_expr_ref,
};
use helpers::is_recognized_cx_call;
pub(crate) use helpers::{helper_import, helper_import_offsets};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum HelperKind {
    Join,
    StrictJoin,
    Merge,
}

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
    /// Tokens that compiled, with what each writes: what a carried
    /// variant is compared against, to say which of them it loses to on Web
    /// (#1752).
    pub compiled: Vec<CompiledToken>,
    /// The optional guarded-template proof is irrelevant to other legacy
    /// failures; do not decompose ordinary opaque branches a second time.
    pub guarded_template: bool,
    /// Authored predicates still run when their branch emits no classes.
    pub evaluation_refs: Vec<ExprRef>,
    /// A closed helper may disappear entirely, so its predicates are collected
    /// from the expression before utility expansion or conflict elimination.
    capture_predicates: bool,
    /// Per-declaration token metadata for `twMerge` conflict resolution.
    pub(crate) declaration_tokens: Vec<Option<crate::tw_merge::ClassifiedToken>>,
    pub(crate) declaration_guards: Vec<Option<ConditionExpr>>,
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
    /// Not under a guard of the expression's own, so it applies whenever
    /// the element renders.
    pub unconditional: bool,
}

/// A token that compiled, and what it writes.
///
/// `span` and `unconditional` mean what they do on `UnsupportedVariant`.
/// Two tokens in different branches of a ternary may never apply together,
/// so a conflict is claimed only when one side is unconditional or both
/// are in the same string.
pub struct CompiledToken {
    pub token: String,
    pub properties: Vec<hozo_ir::StyleProperty>,
    pub span: SourceSpan,
    pub unconditional: bool,
}

/// A function the project says joins class strings as `clsx` or `twMerge`
/// does, by the specifier its callers import it from and the name they
/// import (#964, #1676). `name` is `default` for a default import.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ClassHelper {
    pub module: String,
    pub name: String,
    /// The caller has verified the resolved merger uses this compiler's default table.
    pub merge: bool,
}

/// Which calls in a file are read argument by argument: the imports above,
/// and whatever the project added.
pub(crate) struct Joiners<'r, 'a> {
    pub module_record: &'r ModuleRecord<'a>,
    pub helpers: &'r [ClassHelper],
    pub import_refs: &'r crate::rest::ImportReferences,
    /// Module-level string constants, by reference offset.
    pub constants: &'r crate::rest::ConstantStrings,
    pub units: &'r std::cell::RefCell<hozo_ir::TailwindUnitsBuilder>,
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
    units: &std::cell::RefCell<hozo_ir::TailwindUnitsBuilder>,
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
                    unconditional: condition.is_none(),
                });
            }
            continue;
        }
        if token_condition == Condition::Always || condition.is_none() {
            out.compiled.push(CompiledToken {
                token: token.to_string(),
                properties: properties.clone(),
                span: SourceSpan {
                    start: span.start,
                    end: span.end,
                },
                unconditional: condition.is_none(),
            });
        }
        let classified = crate::tw_merge::classify_token(token);
        if token_condition == Condition::Always {
            let final_condition = to_condition(condition.clone());
            let source = utility_source(token, units);
            for property in properties {
                out.declarations.push(StyleDeclaration {
                    source,
                    property,
                    condition: final_condition.clone(),
                });
                out.declaration_tokens.push(classified.clone());
                out.declaration_guards.push(condition.clone());
            }
        } else if condition.is_none() {
            // No surrounding dynamic guard, so the token's own
            // variant-derived condition (hover:/md:/etc.) applies
            // directly -- e.g. `cn('hover:bg-blue-500')`.
            let source = utility_source(token, units);
            for property in properties {
                out.declarations.push(StyleDeclaration {
                    source,
                    property,
                    condition: token_condition.clone(),
                });
                out.declaration_tokens.push(classified.clone());
                out.declaration_guards.push(None);
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

fn utility_source(
    token: &str,
    units: &std::cell::RefCell<hozo_ir::TailwindUnitsBuilder>,
) -> hozo_ir::StyleSource {
    hozo_ir::StyleSource::TailwindUtility {
        input: 0,
        utility: units.borrow_mut().intern(token),
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
            decompose_literal(
                &lit.value,
                lit.span,
                condition,
                guard,
                out,
                true,
                module_record.units,
            );
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
                    module_record.units,
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
                    let mut part = Decomposed {
                        capture_predicates: out.capture_predicates,
                        ..Decomposed::default()
                    };
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
                    out.compiled.push(CompiledToken {
                        token: token.to_string(),
                        properties: properties.clone(),
                        span: SourceSpan {
                            start: quasi.span.start,
                            end: quasi.span.end,
                        },
                        unconditional: condition.is_none(),
                    });
                    let classified = crate::tw_merge::classify_token(token);
                    let source = utility_source(token, module_record.units);
                    for property in properties {
                        out.declarations.push(StyleDeclaration {
                            source,
                            property,
                            condition: token_condition.clone(),
                        });
                        out.declaration_tokens.push(classified.clone());
                        out.declaration_guards.push(condition.clone());
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
                    out.declaration_tokens.extend(part.declaration_tokens);
                    out.declaration_guards.extend(part.declaration_guards);
                    out.evaluation_refs.extend(part.evaluation_refs);
                    out.fallback.extend(part.fallback);
                    out.consumed.extend(part.consumed);
                    out.unsupported_variants.extend(part.unsupported_variants);
                    out.compiled.extend(part.compiled);
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
            if out.capture_predicates {
                out.evaluation_refs.push(to_expr_ref(logical.left.span()));
            }
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
            if out.capture_predicates {
                out.evaluation_refs.push(to_expr_ref(cond.test.span()));
            }
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
            let kind = is_recognized_cx_call(&call.callee, module_record).unwrap();
            if kind == HelperKind::Join {
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
            } else {
                decompose_closed_call(
                    call,
                    condition,
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
mod tests;
