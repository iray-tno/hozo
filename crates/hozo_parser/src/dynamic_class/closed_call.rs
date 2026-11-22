//! A joiner call whose every argument is known, decomposed argument by argument.

use super::*;

pub(super) fn decompose_closed_call(
    call: &CallExpression,
    condition: Option<ConditionExpr>,
    guard: Option<Span>,
    out: &mut Decomposed,
    module_record: &Joiners,
    capture_templates: bool,
) {
    let merge_conflicts =
        is_recognized_cx_call(&call.callee, module_record) == Some(HelperKind::Merge);
    let whole_span = guard.unwrap_or(call.span);
    let mut sub = Decomposed {
        capture_predicates: true,
        ..Decomposed::default()
    };
    for arg in &call.arguments {
        decompose(
            classify_argument(arg),
            None,
            None,
            &mut sub,
            module_record,
            capture_templates,
        );
    }
    // An opaque list can contain custom tokens, ambiguous arbitrary values,
    // or tokens removed by other tokens in that list. A prefix regex cannot
    // reproduce the merger's right-to-left decisions; keep the real call.
    if !sub.fallback.is_empty() {
        fall_back_to(out, whole_span);
        return;
    }
    let n = sub.declarations.len();
    let mut dropped = vec![false; n];
    let mut extra_guards: Vec<Vec<ConditionExpr>> = vec![Vec::new(); n];

    // Part 1: Static & conditional conflict resolution (including intra-literal
    // conflicts like `twMerge('px-3 px-2')` and cross-argument conflicts like
    // `cn('px-3', active && 'px-2')`).
    let mut effective_guards = sub.declaration_guards.clone();
    // IR conditions are trees. Bound the added nodes before cloning them so a
    // short source expression cannot grow exponentially through cross-group conflicts.
    let mut remaining_guard_nodes = 1024usize;
    for i in (0..n).rev() {
        if !merge_conflicts {
            continue;
        }
        let Some(ref earlier_tok) = sub.declaration_tokens[i] else {
            continue;
        };
        let mut overriding_conds: Vec<ConditionExpr> = Vec::new();
        for j in (i + 1)..n {
            // A removed intermediate token cannot suppress an earlier token.
            if dropped[j] {
                continue;
            }
            // Declarations expanded from the same utility token (e.g. `px-3` ->
            // paddingLeft + paddingRight) share the same `StyleSource` and must
            // not override each other.
            if sub.declarations[i].source == sub.declarations[j].source
                && sub.declaration_guards[i] == sub.declaration_guards[j]
            {
                continue;
            }
            let Some(ref later_tok) = sub.declaration_tokens[j] else {
                continue;
            };
            if !crate::tw_merge::overrides(later_tok, earlier_tok) {
                continue;
            }
            // Any surviving token that removes a later member of the same
            // group also removes this one, so its authored guard suffices.
            // Across different groups this implication need not hold.
            let later_guard = if later_tok.class_group_id == earlier_tok.class_group_id {
                &sub.declaration_guards[j]
            } else {
                &effective_guards[j]
            };
            match later_guard {
                None => {
                    dropped[i] = true;
                    break;
                }
                Some(later_guard) if sub.declaration_guards[i].as_ref() == Some(later_guard) => {
                    dropped[i] = true;
                    break;
                }
                Some(later_guard) => {
                    if !overriding_conds.contains(later_guard) {
                        let Some(remaining) =
                            remaining_guard_nodes.checked_sub(guard_nodes(later_guard) + 2)
                        else {
                            fall_back_to(out, whole_span);
                            return;
                        };
                        remaining_guard_nodes = remaining;
                        overriding_conds.push(later_guard.clone());
                    }
                }
            }
        }
        if !dropped[i] && !overriding_conds.is_empty() {
            // Check whether the union of later guards is exhaustive (e.g. `cond` and `!cond`
            // from both branches of a ternary overriding the same group).
            let exhaustive = overriding_conds.iter().any(|c| {
                overriding_conds
                    .iter()
                    .any(|other| matches!(other, ConditionExpr::Not(inner) if **inner == *c))
            });
            if exhaustive {
                dropped[i] = true;
            } else {
                for cond in overriding_conds {
                    extra_guards[i].push(ConditionExpr::Not(Box::new(cond)));
                }
            }
        }
        for extra in &extra_guards[i] {
            effective_guards[i] = Some(match effective_guards[i].take() {
                None => extra.clone(),
                Some(own) => ConditionExpr::And(Box::new(own), Box::new(extra.clone())),
            });
        }
    }

    // Apply enclosing call condition (`condition`) if the `cn(...)` call itself is
    // inside a branch (`cond && cn(...)`), and emit surviving declarations.
    for i in 0..n {
        if dropped[i] {
            continue;
        }
        let mut decl = sub.declarations[i].clone();
        let mut combined_guard = condition.clone();
        for g in &extra_guards[i] {
            combined_guard = Some(match combined_guard {
                None => g.clone(),
                Some(prev) => ConditionExpr::And(Box::new(prev), Box::new(g.clone())),
            });
        }
        if let Some(g) = combined_guard {
            decl.condition = conjoin_condition_with_guard(decl.condition, g);
        }
        let effective_guard = match (&condition, &effective_guards[i]) {
            (None, g) => g.clone(),
            (Some(c), None) => Some(c.clone()),
            (Some(c), Some(g)) => {
                Some(ConditionExpr::And(Box::new(c.clone()), Box::new(g.clone())))
            }
        };
        out.declarations.push(decl);
        out.declaration_tokens
            .push(sub.declaration_tokens[i].clone());
        out.declaration_guards.push(effective_guard);
    }

    for fb in sub.fallback {
        let fb_span = guard.unwrap_or(Span::new(fb.0.start, fb.0.end));
        fall_back_to(out, fb_span);
    }
    out.consumed.extend(sub.consumed);
    out.unsupported_variants.extend(sub.unsupported_variants);
    out.compiled.extend(sub.compiled);
    out.guarded_template |= sub.guarded_template;
    out.evaluation_refs.extend(sub.evaluation_refs);
}
