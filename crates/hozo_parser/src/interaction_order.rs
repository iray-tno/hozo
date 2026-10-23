//! Tailwind-only owner interaction cascade; never sort arbitrary StyleX IR.
use hozo_ir::{Condition, StyleDeclaration};

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

pub(crate) fn order_tailwind_interactions(declarations: &mut [StyleDeclaration]) {
    for region in declarations.chunk_by_mut(|a, b| a.source == b.source) {
        if !matches!(region[0].source, hozo_ir::StyleSource::Stylex(_)) {
            order_region(region);
        }
    }
}

fn order_region(declarations: &mut [StyleDeclaration]) {
    let mut positions = Vec::new();
    for (index, declaration) in declarations.iter().enumerate() {
        if declaration.condition == Condition::Always {
            continue;
        }
        // Backends group equal conditions across the whole node. Sorting a
        // local run around an unknown condition could cross it later, so the
        // entire conditional domain is a barrier until provenance is known.
        let Some(key) = interaction_cascade_key(&declaration.condition) else {
            return;
        };
        positions.push((index, key));
    }
    if positions.windows(2).any(|pair| pair[0].1 > pair[1].1) {
        let mut ordered: Vec<_> = positions
            .iter()
            .map(|&(index, key)| (key, declarations[index].clone()))
            .collect();
        ordered.sort_by_key(|(key, _)| *key);
        for ((index, _), (_, declaration)) in positions.into_iter().zip(ordered) {
            declarations[index] = declaration;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use hozo_ir::StyleProperty;

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
        let mut styles: Vec<_> = [
            Condition::Pressed,
            Condition::Always,
            Condition::Hover,
            Condition::Disabled,
            Condition::Pressed,
            Condition::Focus,
        ]
        .into_iter()
        .map(|condition| StyleDeclaration {
            source: Default::default(),
            condition,
            property: StyleProperty::Opacity(0.5),
        })
        .collect();
        order_tailwind_interactions(&mut styles);
        assert_eq!(
            styles
                .into_iter()
                .map(|item| item.condition)
                .collect::<Vec<_>>(),
            vec![
                Condition::Pressed,
                Condition::Always,
                Condition::Hover,
                Condition::Disabled,
                Condition::Pressed,
                Condition::Focus
            ]
        );
    }
}
