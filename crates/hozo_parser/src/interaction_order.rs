//! Tailwind-only owner interaction cascade key, read by the runtime state
//! rank. The compile-time sort that used it is gone: the shared plan orders
//! every rankable input (#1230).
use hozo_ir::Condition;

/// Specificity first (Native has no CSS cascade), then Tailwind's variant
/// bit order. None is a provenance/domain barrier, not a lowest priority.
pub fn interaction_cascade_key(condition: &Condition) -> Option<u32> {
    fn parts(condition: &Condition) -> Option<(u16, u8)> {
        let name = match condition {
            Condition::Hover => "hover",
            Condition::Focus => "focus",
            Condition::FocusVisible => "focus-visible",
            Condition::Pressed => "active",
            Condition::All(conditions) if !conditions.is_empty() => {
                return conditions
                    .iter()
                    .try_fold((0_u16, 0_u8), |(count, mask), condition| {
                        let (n, bits) = parts(condition)?;
                        Some((count.checked_add(n)?, mask | bits))
                    });
            }
            _ => return None,
        };
        let rank = crate::tailwind_variants::OWNER_INTERACTION_ORDER
            .iter()
            .position(|item| *item == name)?;
        Some((1, 1 << rank))
    }
    let (count, mask) = parts(condition)?;
    Some(u32::from(count) * 256 + u32::from(mask))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn own_state_order_and_conjunction_specificity_come_before_source_order() {
        let key = |condition| interaction_cascade_key(&condition).unwrap();
        assert!(key(Condition::Hover) < key(Condition::Focus));
        assert!(key(Condition::Focus) < key(Condition::FocusVisible));
        assert!(key(Condition::FocusVisible) < key(Condition::Pressed));
        assert!(
            key(Condition::Pressed) < key(Condition::All(vec![Condition::Hover, Condition::Focus]))
        );
        assert_eq!(interaction_cascade_key(&Condition::Disabled), None);
    }
}
