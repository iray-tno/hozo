//! Dark copies of declarations a paired theme token changes.

use super::*;

/// The declarations again, with a dark copy of every one a paired token
/// changes.
///
/// The Web half of this renders each rule twice and keeps the second when it
/// differs (see `render_node`). That shape does not fit here: a rule on this
/// platform is an entry in a `StyleSheet` plus a guarded reference to it in a
/// style array, and the guard is built by a five-hundred-line match over the
/// condition. Rendering twice would mean running that match twice with
/// different names.
///
/// So the dark copy is made a *condition group* instead, before the match
/// runs, and the match handles it the way it already handles `dark:bg-red-500`
/// written by hand -- including registering `RuntimeHook::Dark`, which is what
/// binds `__hozoDark`. A group that guarded on a binding nothing declares
/// would be the free identifier #653 cost a day to.
///
/// Each copy is inserted **immediately after its own declaration**, not
/// appended, and that is the whole of the ordering argument.
/// `group_by_condition` keeps conditions in first-appearance order, and a
/// React Native style array resolves last-wins, so position here is
/// specificity. Inserted in place, a dark copy of an unconditional rule sorts
/// among the conditionals *before* `disabled:` -- which is what the Web does,
/// where `.a:disabled` at (0,2,0) beats `@media dark { .a }` at (0,1,0)
/// whatever order they are written in. Appended at the end it would beat
/// `disabled:`, and a disabled control would take its enabled colour after
/// dark.
///
/// `None` when the theme has no pairs, which is every project that has not
/// written one: no clone, no second pass, no extra entry.
pub(super) fn with_dark_copies(
    declarations: &[StyleDeclaration],
    theme: &Theme,
) -> Option<Vec<StyleDeclaration>> {
    let dark = theme.dark()?;
    let mut out: Vec<StyleDeclaration> = Vec::with_capacity(declarations.len());
    let mut copied = false;
    for declaration in declarations {
        out.push(declaration.clone());
        // A rule the author already marked `dark:` is only for dark mode; a
        // copy of it would say the same thing twice and win on a tie.
        if declaration.condition.mentions_dark() || light_only(&declaration.condition) {
            continue;
        }
        let property = std::slice::from_ref(&declaration.property);
        if crate::candidate::style_pairs(property, theme)
            == crate::candidate::style_pairs(property, &dark)
        {
            continue;
        }
        out.push(StyleDeclaration {
            source: declaration.source,
            property: declaration.property.clone(),
            condition: declaration.condition.and_dark(),
        });
        copied = true;
    }
    if copied {
        Some(out)
    } else {
        None
    }
}

// A not-dark token stays in its light palette. Appending a dark copy would
// manufacture a contradictory guard and a permanently unreachable entry.
pub(super) fn light_only(condition: &Condition) -> bool {
    match condition {
        Condition::Not(inner) => matches!(inner.as_ref(), Condition::Dark),
        Condition::All(conditions) => conditions.iter().any(light_only),
        _ => false,
    }
}

// `mentions_dark` and `and_dark` are `hozo_ir`'s, not this file's. Both
// backends ask the same two questions of a condition, and when the Web asked
// them slightly differently -- equality against `Condition::Dark`, and a copy
// that *replaced* the condition instead of extending it -- the two lowerings
// disagreed about `hover:` in the dark. One answer in the IR is the fix that
// cannot drift.
