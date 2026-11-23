//! The enter and exit frames `HozoAnimated` cannot move between, refused
//! with the reason: a transform reset, or a property it cannot interpolate.

use super::*;

pub(super) fn refuse_unmovable_frames(
    node: &Node,
    own_declarations: &[StyleDeclaration],
    starting_parts: &[String],
    exit_parts: &[String],
    theme: &Theme,
    diagnostics: &mut Vec<Diagnostic>,
) {
    if own_declarations
        .iter()
        .any(|d| crate::transforms::is_control(&d.property))
        && (!starting_parts.is_empty() || !exit_parts.is_empty())
    {
        diagnostics.push(unwired_variant(node,
            "Transform resets with starting/exit animation frames are not wired on Native yet. Use explicit transform values for these animation endpoints.",
            Severity::Error));
    }
    // What `HozoAnimated` can start from is what it can interpolate. A
    // `starting:w-0` is `@starting-style` on Web and animates there; here
    // the width would be applied as the first frame and then jump, which is
    // worse than not applying it -- so it is left out and named.
    if !starting_parts.is_empty() || !exit_parts.is_empty() {
        let mut fixed: Vec<String> = own_declarations
            .iter()
            .filter(|declaration| {
                crate::condition_contains(&declaration.condition, |condition| {
                    matches!(condition, Condition::StartingStyle)
                        || crate::conditions::presence_closed(condition)
                })
            })
            .filter(|declaration| !crate::transition::interpolatable(&declaration.property))
            .flat_map(|declaration| crate::style::property_and_value(&declaration.property, theme))
            .map(|(key, _)| format!("`{key}`"))
            .collect();
        fixed.dedup();
        if !fixed.is_empty() {
            diagnostics.push(crate::conditions::unwired_variant(
                node,
                &format!(
                    "`starting:` and `data-[state=closed]:` on React Native animate opacity, \
                     transforms and colours -- what `HozoAnimated` can interpolate. {} would be a \
                     frame that jumps rather than moves, so it is not applied here. On Web the \
                     same class works.",
                    fixed.join(", ")
                ),
                hozo_ir::Severity::Warning,
            ));
        }
    }
}
