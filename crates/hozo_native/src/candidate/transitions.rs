//! Classes made only of transition properties, as `HozoTransitionSpec` parts.

use super::*;

/// A class made only of transition properties, unconditional or under
/// `motion-reduce:` / `motion-safe:`, as the condition it needs and the
/// part of a `HozoTransitionSpec` it sets. `None` for anything else, which
/// keeps the path it had.
pub(super) fn transition_part(
    groups: &[(Condition, Vec<StyleProperty>)],
) -> Option<(Option<&'static str>, String)> {
    let mut condition = None;
    let mut fields = Vec::new();
    for (group_condition, properties) in groups {
        let this = match group_condition {
            Condition::Always => None,
            Condition::Environment(hozo_ir::Environment::MotionReduce) => Some("motion-reduce"),
            Condition::Environment(hozo_ir::Environment::MotionSafe) => Some("motion-safe"),
            _ => return None,
        };
        if fields.is_empty() {
            condition = this;
        } else if condition != this {
            return None;
        }
        for property in properties {
            fields.push(match property {
                StyleProperty::TransitionProperty(list) => format!(
                    "properties: [{}]",
                    list.split(',')
                        .map(|name| quote(name.trim()))
                        .collect::<Vec<_>>()
                        .join(", ")
                ),
                StyleProperty::TransitionDuration(ms, _) => format!("duration: {ms}"),
                StyleProperty::TransitionDelay(ms, _) => format!("delay: {ms}"),
                StyleProperty::TransitionTimingFunction(timing, _) => {
                    format!("easing: {}", quote(crate::transition::easing_name(timing)))
                }
                _ => return None,
            });
        }
    }
    if fields.is_empty() {
        return None;
    }
    Some((condition, format!("{{ {} }}", fields.join(", "))))
}
