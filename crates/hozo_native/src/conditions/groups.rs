//! The element's declarations as the condition groups its style entries
//! are written from: planned, deduplicated, with the leading register and
//! font-default metrics projected and conflicting inline edges expanded.

use super::*;

/// The groups in the order their entries are written, each with whether it
/// is a resting-direction copy, and the two facts naming depends on.
pub(super) struct Groups {
    pub(super) groups: Vec<(Condition, Vec<StyleProperty>, bool)>,
    pub(super) canonical_input: bool,
    pub(super) projects_metrics: bool,
}

pub(super) fn plan_groups(
    declarations: &[StyleDeclaration],
    edge_conflicts: &crate::edge_projection::PreparedEdgeConflicts,
    target: &StyleTarget<'_>,
    theme: &Theme,
) -> Groups {
    let node = target.node;
    // Mixed text owners must still order the raw register against the
    // caller's writes. Only fold it into defaults on the static path.
    let mixed_text = matches!(
        node.primitive,
        hozo_ir::Primitive::Text | hozo_ir::Primitive::TextInput
    ) && !node.class_name_fallback.is_empty();
    let register = declarations
        .iter()
        .rev()
        .find_map(|declaration| match declaration.property {
            StyleProperty::LeadingRegister(px)
                if !mixed_text && declaration.condition == Condition::Always =>
            {
                Some(px)
            }
            _ => None,
        });
    let hozo_ir::NativeConditionGroupPlan {
        mut groups,
        canonical_input,
    } = hozo_ir::plan_native_condition_groups(declarations, target.composition);
    for (_, props) in &mut groups {
        *props = hozo_ir::dedupe_last_wins(theme.resolve_shadow_tokens(std::mem::take(props)));
        if let Some(px) = register {
            for property in props.iter_mut() {
                if let StyleProperty::LineHeight(hozo_ir::LineHeight::FontDefault(length)) =
                    property
                {
                    *length = hozo_ir::Length::Px(px);
                }
            }
        }
    }
    let is_default = |property: &StyleProperty| {
        matches!(
            property,
            StyleProperty::LineHeight(hozo_ir::LineHeight::FontDefault(_))
        )
    };
    let projects_metrics = groups.iter().any(|(_, props)| props.iter().any(is_default))
        && groups.iter().any(|(_, props)| {
            props.iter().any(|property| {
                matches!(
                    property,
                    StyleProperty::LineHeight(hozo_ir::LineHeight::Length(_))
                )
            })
        });
    if projects_metrics {
        // This is CSS register projection, after authored input precedence
        // has been decided: a font default reads an explicit --tw-leading
        // even from a less-specific rule or another frontend input. Keep
        // normal writes in their established order and move only fallbacks.
        let mut defaults = Vec::new();
        let mut writes = Vec::new();
        for (condition, props) in groups {
            let (fallback, rest): (Vec<_>, Vec<_>) = props.into_iter().partition(is_default);
            if !fallback.is_empty() {
                defaults.push((condition.clone(), fallback));
            }
            if !rest.is_empty() {
                writes.push((condition, rest));
            }
        }
        defaults.extend(writes);
        groups = defaults;
    }
    let expanded_groups: Vec<(Condition, Vec<StyleProperty>, bool)> = if edge_conflicts.is_empty() {
        groups
            .into_iter()
            .map(|(condition, props)| (condition, props, false))
            .collect()
    } else {
        groups
            .iter()
            .flat_map(|(condition, props)| {
                crate::edge_projection::expand_group(condition, props, edge_conflicts)
            })
            .collect()
    };
    Groups {
        groups: expanded_groups,
        canonical_input,
        projects_metrics,
    }
}
