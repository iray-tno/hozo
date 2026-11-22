//! Class names for expression references, and the selectors and at-rules
//! conditions turn into.

use hozo_ir::{Breakpoint, Condition, ConditionExpr, Environment};

pub(super) fn breakpoint_min_width_px(bp: Breakpoint) -> u32 {
    match bp {
        Breakpoint::Sm => 640,
        Breakpoint::Md => 768,
        Breakpoint::Lg => 1024,
        Breakpoint::Xl => 1280,
        Breakpoint::Xl2 => 1536,
    }
}

/// A guard's class, keyed by the source span of the opaque expression it
/// wraps -- two `ConditionExpr::Ref`s pointing at the same span refer to the
/// same runtime value, so they must resolve to the same class.
///
/// A class rather than the `data-hozo-cond-*` attribute it was: a class goes
/// wherever `className` goes, and an attribute only as far as the element
/// renders it. An element the compiler keeps as a component -- `Button` with
/// a spread that may carry `href` -- passed the attribute to a component that
/// rendered only the props it names, so the guard never reached the DOM and
/// the negated branch always applied (#883).
pub fn expr_ref_class(expr_ref: hozo_ir::ExprRef) -> String {
    format!("hozo-cond-{}-{}", expr_ref.0.start, expr_ref.0.end)
}

pub fn state_disabled_ref_class(expr_ref: hozo_ir::ExprRef) -> String {
    format!(
        "hozo-state-disabled-{}-{}",
        expr_ref.0.start, expr_ref.0.end
    )
}

pub fn conflict_ref_class(conflict: &hozo_ir::ClassConflictGuard) -> String {
    let slug: String = conflict
        .group
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
        .collect();
    format!(
        "hozo-conflict-{}-{}-{}",
        conflict.reference.0.start, conflict.reference.0.end, slug
    )
}

pub(super) fn condition_expr_selector(expr: &ConditionExpr) -> String {
    match expr {
        ConditionExpr::Static(true) => String::new(),
        ConditionExpr::Static(false) => ":not(*)".to_string(),
        // Weightless, because a branch the source picks is still the resting
        // look: `size === 'sm' ? 'px-3' : 'px-4'` is (0,1,0) like a plain
        // `px-4`, and so loses to a caller's class rather than beating it
        // (#881). `:not()` and `:is()` take their arguments' weight, so the
        // other arms stay weightless too.
        ConditionExpr::Ref(expr_ref) => format!(":where(.{})", expr_ref_class(*expr_ref)),
        ConditionExpr::StateDisabled(expr_ref) => {
            format!(":where(.{})", state_disabled_ref_class(*expr_ref))
        }
        ConditionExpr::Captured(capture) => {
            format!(":where(.{})", expr_ref_class(capture.reference))
        }
        ConditionExpr::ClassConflict(conflict) => {
            format!(":where(.{})", conflict_ref_class(conflict))
        }
        ConditionExpr::Not(inner) => format!(":not({})", condition_expr_selector(inner)),
        ConditionExpr::And(a, b) => format!(
            "{}{}",
            condition_expr_selector(a),
            condition_expr_selector(b)
        ),
        ConditionExpr::Or(a, b) => {
            format!(
                ":is({}, {})",
                condition_expr_selector(a),
                condition_expr_selector(b)
            )
        }
    }
}

/// A condition's shape as `(at-rule prelude, selector template)`.
///
/// The template carries `&` where the element's own class goes, the same
/// convention Tailwind and nested CSS use. It was a plain suffix until
/// arbitrary variants arrived, which a suffix cannot express: `[&>*]:p-4`
/// happens to append (`.hozo-0>*`) but `[.dark_&]:text-white` does not --
/// the element's class lands at the *end* there, and a suffix has no way
/// to say so.
///
/// The first half is a whole at-rule rather than a bare media query for
/// the same reason. `[@supports(display:grid)]:grid` is not a media query,
/// and hardcoding `@media` at the emission site would have made supports
/// queries unreachable by construction.
/// An arbitrary selector as `:has()` takes it, the way Tailwind writes it.
///
/// Wrapped in `:is()` unless it opens with a combinator: `has-[:focus]:`
/// is `:has(:is(:focus))` and `has-[>img]:` is `:has( > img)`. The
/// wrapper is what keeps a compound argument weighing what a simple one
/// does, and a combinator cannot go inside it.
pub(super) fn has_argument(selector: &str) -> String {
    if selector.starts_with(['>', '+', '~']) {
        format!(" {selector}")
    } else {
        format!(":is({selector})")
    }
}

/// An at-rule with its condition negated, the way Tailwind writes it:
/// `@media (prefers-color-scheme: dark)` becomes `@media not
/// (prefers-color-scheme: dark)`.
pub(super) fn negate_at_rule(rule: &str) -> String {
    if let Some(query) = rule.strip_prefix("@container ") {
        // The optional container name is a lookup scope, not part of the
        // boolean expression. `@container main not (width >= ...)` still
        // asks for main, and repeated negation keeps that same lookup.
        if let Some((scope, expression)) = query.split_once('(') {
            return match scope.strip_suffix("not ") {
                Some(scope) => format!("@container {scope}({expression}"),
                None => format!("@container {scope}not ({expression}"),
            };
        }
    }
    match rule.strip_prefix("@media ") {
        Some(query) => format!("@media not {query}"),
        // `@supports` and the arbitrary at-rules are not negated by this
        // path -- `is_negatable` lets them through, and Tailwind spells
        // their negation with the at-rule's own `not` operator, which is
        // where this will grow when one of them needs it.
        None => rule.to_string(),
    }
}

/// The environment query in `condition`, if the Web cannot express it.
///
/// Reaches inside an `All`, because a stacked variant is inexpressible the
/// moment any part of it is: `dark:screen-reader:flex` has no rule to
/// emit either.
pub fn inexpressible_on_web(condition: &Condition) -> Option<Environment> {
    match condition {
        Condition::Environment(query) if !query.web_query() => Some(*query),
        Condition::All(conditions) => conditions.iter().find_map(inexpressible_on_web),
        Condition::Not(inner)
        | Condition::Group(inner)
        | Condition::Peer(inner)
        | Condition::In(inner)
        | Condition::Has(inner) => inexpressible_on_web(inner),
        _ => None,
    }
}
