//! Where a condition group's parts land once its guard is known: one of the
//! element's style lists behind a prefix, or a frame `HozoAnimated` reads.

use super::*;

/// The destination of a group's parts, each carrying the prefix every part
/// is written behind (`""` for none).
pub(super) enum Lands {
    /// Among the unconditional styles.
    Base(String),
    /// In the list the group's condition selects: base, element state or
    /// conditional.
    Conditional(String),
    /// In the list only the interaction callback's form puts in scope.
    Pressed(String),
    /// The frame an element leaves to, handed over as `hozoExit`.
    Exit(String),
    /// The first frame of an enter animation, handed over as `hozoStarting`.
    Starting(String),
    /// Nowhere: the guard can never hold.
    Nowhere,
}

/// Where a resolved guard puts the parts. A known-true `enabled:` is no
/// condition at all, so its parts join the base.
pub(super) fn from_guard(
    resolved: Result<guards::Guard, String>,
    enabled: bool,
    node: &Node,
) -> Result<Lands, Diagnostic> {
    match resolved {
        Ok(guards::Guard::Known(true)) if enabled => Ok(Lands::Base(String::new())),
        Ok(guards::Guard::Known(true)) => Ok(Lands::Conditional(String::new())),
        Ok(guards::Guard::Known(false)) => Ok(Lands::Nowhere),
        Ok(guards::Guard::Dynamic(guard)) => Ok(Lands::Conditional(format!("{guard} && "))),
        Ok(guards::Guard::Interactive(guard)) => Ok(Lands::Pressed(format!("{guard} && "))),
        Ok(guards::Guard::InteractiveScoped {
            available,
            predicate,
        }) => Ok(Lands::Pressed(format!("({available} && {predicate}) && "))),
        Ok(guards::Guard::Scoped {
            available,
            predicate,
        }) => Ok(Lands::Conditional(format!(
            "({available} && {predicate}) && "
        ))),
        Err(reason) => Err(unwired_variant(node, &reason, Severity::Error)),
    }
}

/// A frame for `HozoAnimated`, or the warning that nothing will animate it.
pub(super) fn frame(
    lands: Lands,
    animates: bool,
    without: &str,
    node: &Node,
) -> Result<Lands, Diagnostic> {
    if animates {
        Ok(lands)
    } else {
        Err(unwired_variant(node, without, Severity::Warning))
    }
}
