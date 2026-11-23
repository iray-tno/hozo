//! The props an animating element reads: the transition timing, and the
//! first and last frames `HozoAnimated` moves between.

pub(super) fn write_motion_props(
    transition: Option<(u32, u32, &'static str, bool, bool, bool)>,
    ambient_transition: Option<(u32, u32, &'static str)>,
    starting_parts: &[String],
    exit_parts: &[String],
    props_text: &mut String,
) {
    if let Some((duration, delay, easing, opacity, transform, colors)) = transition {
        props_text.push_str(&format!(
            " hozoTransition={{{{ duration: {duration}, delay: {delay}, easing: '{easing}', opacity: {opacity}, transform: {transform}, colors: {colors} }}}}"
        ));
    }
    // The same prop name, deliberately, with fewer fields: `HozoAnimated`
    // works out which properties moved by comparing one render's style
    // with the last, so it needs no list of them. Sharing the name means
    // an element that becomes a `Pressable` later keeps the class working.
    if let Some((duration, delay, easing)) = ambient_transition {
        props_text.push_str(&format!(
            " hozoTransition={{{{ duration: {duration}, delay: {delay}, easing: '{easing}' }}}}"
        ));
    }
    // The first frame of an enter animation: `HozoAnimated` starts here and
    // transitions to `style` on mount (decision 007).
    match starting_parts {
        [] => {}
        [one] => props_text.push_str(&format!(" hozoStarting={{{one}}}")),
        many => props_text.push_str(&format!(" hozoStarting={{[{}]}}", many.join(", "))),
    }
    // The frame an element leaves to: `HozoAnimated` transitions to it when
    // `Presence` closes, and `Presence` removes the element when it ends.
    match exit_parts {
        [] => {}
        [one] => props_text.push_str(&format!(" hozoExit={{{one}}}")),
        many => props_text.push_str(&format!(" hozoExit={{[{}]}}", many.join(", "))),
    }
}
