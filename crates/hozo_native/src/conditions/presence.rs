//! Enter and exit frames: `starting:` and `data-[state=closed]:` (decision 007).

use super::*;

pub(super) const STARTING_WITHOUT_TRANSITION: &str = "`starting:` is the first frame of an enter animation. On React Native it works on a `View` that also has a `transition-*` class -- `HozoAnimated` starts the element from these values and animates to its style. Here it has nothing to animate from, so it does nothing on this platform. On Web, too, `@starting-style` needs a transition on the same element to be seen.";

pub(super) const EXIT_WITHOUT_TRANSITION: &str = "`data-[state=closed]:` is the style an element leaves to inside `Presence`. On React Native it works on a `View` that also has a `transition-*` class -- `HozoAnimated` animates to these values before `Presence` removes the element. Here there is nothing to animate with, so the element is removed at once. On Web, too, without a transition the element is removed at once.";

/// The first and last frames of an element that animates in and out
/// (decision 007): `starting:` and `data-[state=closed]:`, each a list of
/// guarded style parts.
#[derive(Debug, Default)]
pub(crate) struct AnimatedFrames {
    pub(crate) starting: Vec<String>,
    pub(crate) exit: Vec<String>,
}

/// `data-[state=closed]:`, the one attribute selector Native can answer:
/// `Presence` keeps the state, and `HozoAnimated` reads it.
pub(crate) fn presence_closed(condition: &Condition) -> bool {
    matches!(condition, Condition::DataAttribute(selector) if selector == "[data-state=\"closed\"]")
}
