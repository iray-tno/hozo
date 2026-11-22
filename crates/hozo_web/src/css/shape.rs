//! A condition as the at-rules and selector template its rule is written in.

use hozo_ir::{Condition, Environment};

use super::selector::{
    breakpoint_min_width_px, condition_expr_selector, has_argument, negate_at_rule,
};

/// One rule's worth of shape: the at-rules around it, and the selector
/// suffix with `&` standing for the element.
pub type Shape = (Vec<String>, String);

/// The shape a condition takes, or the shapes -- some conditions are more
/// than one rule.
///
/// This returned a single shape until `marker:` needed four. Tailwind
/// writes it as `::marker`, a descendant `::marker`, and both again for
/// `::-webkit-details-marker`; `selection:` is two; and `not-hover:` is
/// the selector negated *plus* `@media not (hover: hover)` for a device
/// where nothing is ever hovered.
///
/// `not-hover:` was refused for exactly this reason and is the reason the
/// signature changed: the gap was never in the variant, it was in what a
/// backend could say.
/// One shape, as a list of one. Most conditions are this.
pub(super) fn one(at_rules: Vec<String>, selector: impl Into<String>) -> Vec<Shape> {
    vec![(at_rules, selector.into())]
}

/// The first shape a condition takes.
///
/// For everything except `marker:`, `selection:` and `not-…:` that is the
/// only one. Kept for callers that genuinely want a single answer -- the
/// emitter uses `condition_shapes`.
#[allow(dead_code)]
pub fn condition_shape(condition: &Condition) -> Shape {
    condition_shapes(condition)
        .into_iter()
        .next()
        .unwrap_or_default()
}

pub fn condition_shapes(condition: &Condition) -> Vec<Shape> {
    condition_shapes_for(condition, true, None)
}

pub(super) fn condition_shapes_for(
    condition: &Condition,
    portable_disabled: bool,
    dark: Option<&str>,
) -> Vec<Shape> {
    match condition {
        // Stacked variants. The at-rules nest in written order, outermost
        // first, and the selector suffixes append in the same order --
        // `first:hover:` is `:first-child:hover`, not the reverse.
        //
        // Which is why the fold substitutes the accumulated selector *into*
        // each new template rather than the other way round: a template's
        // `&` is where the thing it qualifies goes, so the later variant
        // wraps the earlier one.
        // A product where more than one variant is more than one rule,
        // which is what `hover:marker:` is: hover's single shape times
        // marker's four, all inside the one `@media (hover: hover)`.
        Condition::All(conditions) => {
            let mut shapes: Vec<Shape> = vec![(Vec::new(), "&".to_string())];
            for condition in conditions {
                let mut next = Vec::new();
                for (preludes, selector) in &shapes {
                    for (inner, template) in
                        condition_shapes_for(condition, portable_disabled, dark)
                    {
                        let mut preludes = preludes.clone();
                        preludes.extend(inner);
                        next.push((preludes, template.replace('&', selector)));
                    }
                }
                shapes = next;
            }
            shapes
        }
        Condition::Always => one(Vec::new(), "&"),
        // The capability query is not decoration. Without it a `:hover`
        // style sticks on a touch device after a tap -- the element keeps
        // matching until something else is tapped -- which is why Tailwind
        // v4 wraps every hover utility this way. Hozo emitted the bare
        // pseudo-class until 2026-08-17, and nothing noticed because no
        // comparison here looked at at-rules.
        Condition::Hover => one(vec!["@media (hover: hover)".to_string()], "&:hover"),
        Condition::Focus => one(Vec::new(), "&:focus"),
        Condition::FocusVisible => one(Vec::new(), "&:focus-visible"),
        Condition::LastChild => one(Vec::new(), "&:last-child"),
        // Hozo's own attribute rather than `:disabled`, because `:disabled`
        // matches form controls and nothing else. `Pressable` is a `<div>`,
        // so `disabled:opacity-50` on one used to compile to a rule that
        // could never match -- CSS emitted, nothing applied, no diagnostic.
        // The limitation was known and written down here; what it cost was
        // not.
        //
        // Emitted wherever Hozo marks something disabled, which decouples
        // the styling hook from how the state is *said* on each element:
        // `<button disabled>`, `<div aria-disabled="true">` and a plain
        // dimmed region all carry it, so one selector covers all three and
        // the ARIA question and the CSS question stop being the same
        // question. Specificity is (0,1,0), exactly what `:disabled` was.
        Condition::Disabled => one(
            Vec::new(),
            if portable_disabled {
                "&[data-hozo-disabled]"
            } else {
                "&:disabled"
            },
        ),
        // Exactly what Tailwind generates, checked against it rather than
        // recalled: `.aria-checked\:p-4[aria-checked="true"]`. Which means
        // it needs nothing from the element's props -- the selector matches
        // whatever the element actually carries, whether that came from
        // `accessibilityState`, an `aria-checked` prop, or a spread the
        // compiler never read.
        Condition::Aria(state) => one(Vec::new(), format!("&[aria-{state}=\"true\"]")),
        // The negation of the same attribute, so `disabled:` and
        // `enabled:` cannot disagree. Specificity matches what Tailwind's
        // `:enabled` gives -- `:not()` takes its argument's, which is one
        // attribute, exactly as a pseudo-class is one.
        Condition::Enabled => one(
            Vec::new(),
            if portable_disabled {
                "&:not([data-hozo-disabled])"
            } else {
                "&:enabled"
            },
        ),
        // Read from Tailwind's output rather than recalled. Direction is
        // the odd one: a selector rather than a query, and wrapped in
        // `:where()` so it weighs nothing -- an `rtl:` utility orders
        // against its unprefixed twin by source position, not by winning.
        Condition::Environment(query) => match query {
            Environment::Ltr => one(
                Vec::new(),
                "&:where(:dir(ltr), [dir=\"ltr\"], [dir=\"ltr\"] *)",
            ),
            Environment::Rtl => one(
                Vec::new(),
                "&:where(:dir(rtl), [dir=\"rtl\"], [dir=\"rtl\"] *)",
            ),
            _ => one(vec![query.web_at_rule().to_string()], "&"),
        },
        // `:is(:where(.group):hover *)`, which is Tailwind's own shape --
        // read from it rather than reconstructed. `:where()` is what keeps
        // the ancestor's class out of the specificity, so `group-hover:`
        // weighs the same as `hover:` and the two order by source position
        // like every other pair.
        //
        // The inner condition supplies its own suffix, so this composes
        // with anything that has one: `group-aria-checked:` needs no entry
        // of its own here, and neither will the next variant added.
        //
        // A condition that produces at-rules instead is refused, as
        // Tailwind refuses `group-dark:` -- a media query around the
        // ancestor says nothing about the descendant.
        // Whichever form the inner has, negated -- and it has exactly one,
        // which is what `is_negatable` guarantees at parse time.
        //
        // `:not()` takes its argument's specificity, and so does the
        // negated at-rule's absence of one, so `not-first:` weighs what
        // `first:` weighs. Which is the same reason Tailwind's version
        // does.
        Condition::DataAttribute(selector) => one(Vec::new(), format!("&{selector}")),
        // Parenthesised unless the author already did it, which is what
        // Tailwind emits: `supports-[display:grid]:` is
        // `@supports (display:grid)`.
        Condition::Supports(query) => {
            let query = if query.starts_with('(') {
                query.clone()
            } else {
                format!("({query})")
            };
            one(vec![format!("@supports {query}")], "&")
        }
        // `:is()` around the inner selector is Tailwind's, and it is what
        // keeps `has-[:focus]:` weighing the same as `has-[.a.b.c]:`.
        Condition::HasSelector(selector) => {
            one(Vec::new(), format!("&:has({})", has_argument(selector)))
        }
        Condition::Has(inner) => condition_shapes_for(inner, portable_disabled, dark)
            .into_iter()
            .filter_map(|(at_rules, suffix)| {
                // Not wrapped: a variant's suffix is one compound already,
                // and Tailwind writes `has-hover:` as `:has(:hover)`.
                let rest = suffix.strip_prefix('&').filter(|rest| !rest.is_empty())?;
                Some((at_rules, format!("&:has({rest})")))
            })
            .collect(),
        // The one condition that turns a single rule into two, and the
        // reason this function returns a list. `not-hover:` is the
        // selector negated -- with the capability query *dropped*, since
        // an element on a hover-less device is never hovered and the
        // negation holds there too -- plus a rule for that device.
        Condition::Not(inner) => condition_shapes_for(inner, portable_disabled, dark)
            .into_iter()
            .flat_map(|(at_rules, suffix)| {
                let mut shapes = Vec::new();
                if let Some(rest) = suffix.strip_prefix('&').filter(|rest| !rest.is_empty()) {
                    shapes.push((Vec::new(), format!("&:not({rest})")));
                }
                if !at_rules.is_empty() {
                    shapes.push((
                        at_rules.iter().map(|rule| negate_at_rule(rule)).collect(),
                        "&".to_string(),
                    ));
                }
                shapes
            })
            .collect(),
        Condition::Group(inner) | Condition::Peer(inner) => {
            let marker = if matches!(condition, Condition::Group(_)) {
                "group"
            } else {
                "peer"
            };
            let combinator = if matches!(condition, Condition::Group(_)) {
                " "
            } else {
                " ~ "
            };
            // The at-rules are the inner variant's and survive the
            // relation -- `group-hover:` is inside `@media (hover: hover)`
            // exactly as `hover:` is. Only the selector moves.
            condition_shapes_for(inner, portable_disabled, dark)
                .into_iter()
                .filter_map(|(at_rules, suffix)| {
                    // Refused at parse time, so the `None` is unreachable
                    // -- kept so a future condition with no selector form
                    // degrades to no rule rather than to a malformed one.
                    let rest = suffix.strip_prefix('&').filter(|rest| !rest.is_empty())?;
                    Some((
                        at_rules,
                        format!("&:is(:where(.{marker}){rest}{combinator}*)"),
                    ))
                })
                .collect()
        }
        // Known gotcha, not fixed here: iOS Safari doesn't reliably fire
        // `:active` from a tap unless the element has some touch-event
        // listener attached (a long-documented WebKit quirk). Hozo's
        // compiled onClick doesn't count. Fine for the common desktop/
        // Android case; tracked as a real gap, not silently "handled."
        Condition::Pressed => one(Vec::new(), "&:active"),
        // Range syntax, which is what Tailwind v4 writes and what
        // `max-…:` needs: the old spelling has no exact opposite, only the
        // `(max-width: 767.98px)` convention that leaves a hundredth of a
        // pixel unstyled. Within Tailwind v4's own browser baseline, which
        // is the baseline Hozo is compatible with.
        Condition::Responsive(bp) => one(
            vec![format!(
                "@media (width >= {}px)",
                breakpoint_min_width_px(*bp)
            )],
            "&",
        ),
        Condition::Width { at_least, value } => one(
            vec![format!(
                "@media (width {} {value})",
                if *at_least { ">=" } else { "<" }
            )],
            "&",
        ),
        // The same query asked of an ancestor. A name narrows which
        // ancestor answers; without one it is the nearest container.
        Condition::Container {
            name,
            at_least,
            value,
        } => one(
            vec![format!(
                "@container {}(width {} {value})",
                name.as_ref().map(|n| format!("{n} ")).unwrap_or_default(),
                if *at_least { ">=" } else { "<" },
            )],
            "&",
        ),
        // Tailwind v4's default dark strategy, and the one whose meaning
        // React Native's `useColorScheme()` shares -- unless the project
        // declared its own with `@custom-variant dark (...)`, which Tailwind
        // honours for the classes it generates and so must Hozo for the ones
        // it compiles, or one `dark:` follows two rules on one page (#1654).
        // A selector there has `&` for the element; one starting `@` is an
        // at-rule around it, which is the other form Tailwind accepts.
        Condition::Dark => match dark {
            Some(rule) if rule.starts_with('@') => one(vec![rule.to_string()], "&"),
            Some(selector) => one(Vec::new(), selector.to_string()),
            None => one(vec!["@media (prefers-color-scheme: dark)".to_string()], "&"),
        },
        Condition::FirstChild => one(Vec::new(), "&:first-child"),
        // One arm for eight variants, because the difference between them
        // is entirely in the pseudo-class text -- see `Structural`.
        Condition::Structural(structural) => one(Vec::new(), format!("&{}", structural.selector())),
        Condition::FormState(state) => one(Vec::new(), format!("&{}", state.selector())),
        // The only condition whose *count* varies: `marker:` is four
        // rules and `selection:` two, because a selection and a list
        // marker both cross into descendants and Safari spells a
        // `<details>` marker its own way.
        Condition::PseudoElement(pseudo) => pseudo
            .suffixes()
            .into_iter()
            .map(|s| (Vec::new(), s.to_string()))
            .collect(),
        // `:is()` around it is Tailwind's, and it is what keeps the
        // specificity at the parent's rather than the parent-plus-child
        // it would otherwise be.
        Condition::Subtree { direct } => {
            one(Vec::new(), if *direct { ":is(& > *)" } else { ":is(& *)" })
        }
        Condition::FocusWithin => one(Vec::new(), "&:focus-within"),
        Condition::Target => one(Vec::new(), "&:target"),
        Condition::Open => one(Vec::new(), "&:is([open], :popover-open, :open)"),
        Condition::Control(state) => one(Vec::new(), format!("&{}", state.selector())),
        Condition::Inert => one(Vec::new(), "&:is([inert], [inert] *)"),
        // Tailwind writes `:where(*:hover) &`. This is the same match and
        // the same weight -- `:is()` takes its argument's, which `:where()`
        // makes nothing -- spelled from `&` so `has-` and `not-` can wrap
        // it the way they wrap `group-`.
        Condition::In(inner) => condition_shapes_for(inner, portable_disabled, dark)
            .into_iter()
            .filter_map(|(at_rules, suffix)| {
                let rest = suffix.strip_prefix('&').filter(|rest| !rest.is_empty())?;
                Some((at_rules, format!("&:is(:where(*{rest}) *)")))
            })
            .collect(),
        Condition::Visited => one(Vec::new(), "&:visited"),
        // The only at-rule here that is not a query, and the only reason
        // that matters to this function is that it still has to nest in
        // written order like one: `md:starting:` is `@media` around
        // `@starting-style` and `starting:md:` is the reverse, which the
        // fold in `All` already gets right.
        Condition::StartingStyle => one(vec!["@starting-style".to_string()], "&"),
        // Passed through exactly as written. Hozo does not parse it and
        // deliberately so: a selector it doesn't recognise is one the
        // browser may well support, and the author reached past the design
        // system on purpose. Validating it here would mean maintaining a
        // second, worse copy of the CSS selector grammar.
        //
        // One exception, which is Tailwind v4's: a selector with no `&` is
        // a condition on the element, `&:is(…)`. Passed through bare,
        // `[.x]:` was a rule on every `.x` on the page and `[:hover]:` on
        // everything hovered; and `group-`, `peer-`, `in-` and `not-`,
        // which need the `&` to find the element, wrote nothing (#1781).
        Condition::ArbitrarySelector(selector) if !selector.contains('&') => {
            one(Vec::new(), format!("&:is({selector})"))
        }
        Condition::ArbitrarySelector(selector) => one(Vec::new(), selector.clone()),
        Condition::ArbitraryAtRule(rule) => one(vec![rule.clone()], "&"),
        Condition::Expr(expr) => one(Vec::new(), format!("&{}", condition_expr_selector(expr))),
    }
}

/// Fills a selector template in for one element.
///
/// `&` is replaced everywhere it appears, not just once: `[&+&]` is a
/// legitimate selector for "this element following another of itself".
pub(super) fn fill_selector(template: &str, class_name: &str) -> String {
    template.replace('&', &format!(".{class_name}"))
}
