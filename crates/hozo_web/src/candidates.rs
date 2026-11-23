//! The project-wide candidate stylesheet: the CSS for classes the source
//! could not decompose, scanned or built in.

use crate::*;

pub(super) fn portable_candidate_selector(
    selector: &str,
    real_form: bool,
) -> std::borrow::Cow<'_, str> {
    if real_form {
        std::borrow::Cow::Owned(format!(
            "{selector}:not(:where(.hozo-candidate-slot-owner))"
        ))
    } else {
        std::borrow::Cow::Borrowed(selector)
    }
}

/// One stylesheet for every candidate class in the project, written under
/// the classes' real Tailwind names.
///
/// This is what makes proposal §7's third tier do something: a `className`
/// the compiler couldn't read is passed through, evaluates to a class
/// string at runtime, and finds a matching rule here. No runtime code is
/// involved -- the browser's CSS engine does the resolution.
///
/// Project-wide rather than per-file because the union is: a class written
/// in one module can be produced by an expression in another. Emitting it
/// per file would ship the whole set once per file that needs any of it.
///
/// Unrecognized names are skipped rather than reported. The candidate list
/// comes from scanning, so it's expected to contain tokens that only
/// looked like classes.
/// So is a name whose colour resolves to nothing. `resolve_class_name`
/// asks only whether a token has the *shape* of a utility, and by that
/// test `accent-height` is one -- it compiled to
/// `accent-color: var(--hozo-color-height)`, a reference to a variable no
/// theme defines and nothing else declares. React's DOM attribute table is
/// full of such names, and so is any minified bundle; Tailwind rejects
/// them because it validates the value against the theme rather than the
/// name against a grammar.
///
/// The looser rule stays where it belongs. For a class the author wrote,
/// `var(--hozo-color-brand)` is correct-but-unresolved: the token may well
/// be defined in a stylesheet Hozo was not given, and a dangling reference
/// beats dropping a style someone asked for. A scanned token asked for
/// nothing, so the same output is instead the evidence that it was never a
/// class -- which is why this test lives here and not in
/// `resolve_theme_color`.
pub fn render_candidate_stylesheet(class_names: &[String], theme: &Theme) -> String {
    render_scanned_candidates(
        class_names
            .iter()
            .filter_map(|name| hozo_parser::resolve_class_name(name)),
        theme,
    )
}

/// When a project did not supply its own candidate order, use the same
/// built-in Tailwind descriptors as the static compiler. Order the rules,
/// not their CSS specificity: the browser still decides which match wins.
pub fn render_builtin_candidate_stylesheet(class_names: &[String], theme: &Theme) -> String {
    let mut utilities: Vec<_> = class_names
        .iter()
        .filter_map(|name| {
            hozo_parser::resolve_class_name(name).map(|utility| (name.as_str(), utility))
        })
        .collect();
    if utilities.len() > 1 {
        // Reuse the parsed utilities for rendering; ordering and emitting
        // the sheet must not each parse the whole universe.
        let ranks: std::collections::HashMap<_, _> =
            hozo_ir::builtin_tailwind_emission_order(utilities.iter().map(|(name, utility)| {
                (
                    *name,
                    utility
                        .groups
                        .iter()
                        .flat_map(|(_, writes)| writes.iter().cloned())
                        .collect(),
                )
            }))
            .into_iter()
            .enumerate()
            .map(|(rank, name)| (name, rank))
            .collect();
        // Built-in facts describe at most one rule per candidate. An
        // undescribed form still renders in its original order after them.
        utilities.sort_by_cached_key(|(name, _)| ranks.get(name).copied().unwrap_or(usize::MAX));
    }
    render_scanned_candidates(utilities.into_iter().map(|(_, utility)| utility), theme)
}

pub(super) fn render_scanned_candidates(
    utilities: impl Iterator<Item = hozo_parser::ScannedUtility>,
    theme: &Theme,
) -> String {
    let mut out = String::new();
    let mut owned = String::new();
    let mut uses_leading = false;
    let mut uses_content = false;
    let mut register_names = std::collections::BTreeSet::new();
    for mut utility in utilities {
        for (_, props) in &mut utility.groups {
            *props = theme.resolve_shadow_tokens(std::mem::take(props));
        }
        if utility.important {
            // Emitting the normalized value without its importance would be
            // a different utility. Static owners diagnose the original token.
            continue;
        }
        css::register_candidate_slots(&mut utility.groups, theme, &mut register_names);
        let selector = css::escape_class_selector(&utility.class_name);
        // The owner class adds nothing (`:where`), so this never reaches
        // ordinary HTML or a target's descendants. `:not(hozo-none)` -- an
        // element nothing is called -- adds one type's worth, (0,0,1), and
        // that is the whole cascade between a component and its caller
        // (#881): above the component's resting look at (0,1,0), whichever
        // stylesheet the bundler emits first, and below its state rules at
        // (0,2,0), as on Native, where the caller's styles go between the two.
        // Append before render_rule adds conditions and pseudo-elements,
        // including group/peer and arbitrary selectors.
        let owned_selector = format!("{selector}:where(.hozo-candidate-owner):not(hozo-none)");
        // One rule per group: a `container` is a width plus a max-width at
        // each breakpoint, which cannot be one rule.
        let mut rules = String::new();
        let mut owned_rules = String::new();
        let mut slot_rules = String::new();
        // A theme animation: nothing to write when the theme does not
        // define it (the class reaches the page for the project's own CSS),
        // and its `@keyframes` beside the rule when it does, since this
        // sheet is the only CSS a dynamic class gets.
        let theme_animation = utility
            .groups
            .iter()
            .flat_map(|(_, properties)| properties)
            .find_map(|property| match property {
                hozo_ir::StyleProperty::ThemeAnimation(name) => Some(name),
                _ => None,
            });
        if let Some(name) = theme_animation {
            let Some(animation) = theme.animation(name) else {
                continue;
            };
            if let Some(keyframes) = &animation.keyframes_css {
                rules.push_str(keyframes);
                rules.push_str("\n\n");
            }
        }
        // Tailwind's four need theirs here too, for the same reason: an
        // `animation: spin 1s linear infinite` with no `@keyframes spin`
        // anywhere on the page is a spinner that does not turn.
        let built_in = utility
            .groups
            .iter()
            .flat_map(|(_, properties)| properties)
            .find_map(|property| match property {
                hozo_ir::StyleProperty::Animation(animation) => animation.keyframes(),
                _ => None,
            });
        if let Some(keyframes) = built_in {
            rules.push_str(keyframes);
            rules.push_str("\n\n");
        }
        let shaded_theme = theme.dark();
        // The captured literal rule writes only the register. Use the
        // existing owner selectors, but don't manufacture line-height.
        let leading = theme
            .utility_leading_register(&utility.class_name)
            .filter(|_| {
                utility.groups.len() == 1 && utility.groups[0].0 == hozo_ir::Condition::Always
            });
        if let Some(px) = leading {
            uses_leading = true;
            rules.push_str(&format!(".{selector} {{ --tw-leading: {px}px; }}\n\n"));
            owned_rules.push_str(&format!(
                ".{owned_selector} {{ --tw-leading: {px}px; }}\n\n"
            ));
        }
        for (condition, properties) in &utility.groups {
            uses_leading |= properties
                .iter()
                .any(|p| matches!(p, hozo_ir::StyleProperty::LineHeight(_)));
            uses_content |= condition
                .pseudo_element()
                .is_some_and(|pseudo| pseudo.needs_content())
                || properties
                    .iter()
                    .any(|p| matches!(p, hozo_ir::StyleProperty::Content(_)));
            // The same pairing `render_node` does, on the other path a class
            // can reach the output by. A utility in this sheet is written
            // once and used by every element that names it, so a project
            // whose tokens are paired and whose stylesheet is not would have
            // dark mode on the elements the compiler lowered and not on the
            // ones it emitted a class for -- which is the same class name
            // behaving two ways in one page.
            let palette = match (condition.mentions_dark(), &shaded_theme) {
                (true, Some(shaded)) => shaded,
                _ => theme,
            };
            let real_form = css::needs_form_owner(condition);
            // Portable rules must not leak into a real secondary owner's
            // :enabled/:disabled (not even from the lower-priority layer).
            let legacy_selector = portable_candidate_selector(&selector, real_form);
            let legacy_owned = portable_candidate_selector(&owned_selector, real_form);
            let slot_selector = real_form
                .then(|| format!("{selector}:where(.hozo-candidate-slot-owner):not(hozo-none)"));
            for (enabled, target, output, actual_owner) in [
                (true, legacy_selector.as_ref(), &mut rules, false),
                (true, legacy_owned.as_ref(), &mut owned_rules, false),
                (
                    real_form,
                    slot_selector.as_deref().unwrap_or(""),
                    &mut slot_rules,
                    true,
                ),
            ] {
                if !enabled {
                    continue;
                }
                let render = |condition, palette| {
                    if actual_owner {
                        css::render_slot_rule(target, condition, properties, palette)
                    } else {
                        css::render_rule(target, condition, properties, palette)
                    }
                };
                let light = render(condition, palette);
                output.push_str(&light);
                output.push_str("\n\n");
                if !condition.mentions_dark() {
                    if let Some(dark) = &shaded_theme {
                        let shaded = render(condition, dark);
                        if shaded != light {
                            output.push_str(&render(&condition.and_dark(), dark));
                            output.push_str("\n\n");
                        }
                    }
                }
            }
        }
        // The whole candidate, not the one rule: a name is a utility or it
        // is not, and half of `accent-height` is not a style anyone wants.
        if rules.contains(css::UNRESOLVED_COLOR_PREFIX) {
            continue;
        }
        out.push_str(&rules);
        owned.push_str(&owned_rules);
        owned.push_str(&slot_rules);
    }
    if out.is_empty() {
        return out;
    }
    if uses_leading {
        out.insert_str(0, LEADING_BASE_CSS);
    }
    // The rules above write `content: var(--hozo-content)` for a `before:`
    // or `after:` class, and a lowered file that uses one carries the
    // register. A class that reaches the page only through this sheet --
    // a component's class list passed to a plain element at runtime -- has
    // no such file, so without it the pseudo-element is never generated.
    if uses_content {
        out.insert_str(0, CONTENT_BASE_CSS);
    }
    if !register_names.is_empty() {
        out.insert_str(0, &css::candidate_register_css(&register_names));
    }
    // A named sublayer loses to Tailwind's direct utilities regardless of
    // which stylesheet loads first. Declare the standard layer order too:
    // candidates can arrive before the view's base styles in runtime hosts.
    // The unlayered, marked copy preserves compiled + fallback precedence on
    // Hozo targets; a bare layered copy would let compiled static declarations
    // beat Native's later dynamic style. Keyframes are shared, not duplicated.
    let variables = theme_variables::render(&format!("{out}{owned}"), theme);
    format!(
        "{TAILWIND_LAYER_ORDER}{variables}@layer utilities.hozo-candidates {{\n{out}}}\n\n{owned}"
    )
}
