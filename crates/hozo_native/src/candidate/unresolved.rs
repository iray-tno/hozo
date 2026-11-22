//! Candidates refused because their colour token is not in the theme (#2127).

/// Metadata stays beside the emitted style object, never inside RN styles.
/// The colour token a candidate's style names but the theme does not define
/// (#2127).
///
/// A candidate is what discovery *might* see as a class, not what an author
/// wrote in a `className`: `boxSizing: 'border-box'` in a Web-only file
/// yields `border-box`, which parses as a border colour `box`. Static
/// compilation keeps the unresolved marker, because there the author did
/// write the class and a loud wrong value is the point. Here it would put a
/// made-up colour into every app's map. Refused instead, so the class still
/// warns if something does use it, and a theme that defines `--color-box`
/// resolves it like any other colour.
///
/// Read from the emitted values because `resolve_theme_color` is the only
/// writer of the marker: that covers every colour property, and a modifier
/// on a theme colour that is not a hex triple, without a second list of them.
pub(super) fn unresolved_colour(pairs: &[(String, String)]) -> Option<&str> {
    pairs.iter().find_map(|(_, value)| {
        value
            .strip_prefix("'hozo-unresolved:")
            .and_then(|rest| rest.strip_suffix('\''))
    })
}

pub(super) fn unresolved_reason(name: &str, token: &str) -> String {
    // `brand/50` when the theme's `brand` is not a hex triple; the theme
    // variable is still `--color-brand`.
    let token = token.split('/').next().unwrap_or(token);
    format!(
        "`{name}` names the colour `{token}`, which this project's theme does not define \
         -- add `--color-{token}` to the theme, or this is not a class."
    )
}
