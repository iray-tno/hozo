//! Composing unconditional shadow, filter and gradient layers into the
//! conditions that also write those families.

use super::*;

/// Families whose independent registers are composed after state selection.
pub(crate) struct ComposedLayers {
    pub filters: bool,
    pub gradients: bool,
    pub shadows: bool,
}

/// Copy the unconditional `boxShadow`, `filter` and `backgroundImage` writes
/// into every other condition that writes the same family.
///
/// Each condition's style object carries one whole `boxShadow`, `filter` and
/// `backgroundImage` string, and RN lets the later object replace the earlier one.
/// Tailwind keeps every layer and function in its own register instead, so
/// `focus:ring-2 shadow-sm` keeps the shadow while focused and
/// `md:blur-sm grayscale` keeps the grayscale at md, and a conditional
/// gradient constructor keeps the base stops. An unconditional style
/// is active whenever a conditional one is, so composing it into the
/// conditional object is exactly Tailwind's result when one condition
/// touches the family. Two conditions active at once still lose each
/// other's part -- that needs a runtime composer, as transforms have -- but
/// neither loses the base any more. The copies go before the condition's own
/// writes, so its own layer or function still wins.
/// Split effect boundaries use their composer instead: copying the base
/// there would overwrite a different active condition's slot value.
pub fn fold_base_layers(
    declarations: Vec<hozo_ir::StyleDeclaration>,
    composed: ComposedLayers,
) -> Vec<hozo_ir::StyleDeclaration> {
    fn filter(p: &StyleProperty) -> bool {
        matches!(
            p,
            StyleProperty::Filter(..)
                | StyleProperty::FilterRaw(..)
                | StyleProperty::DropShadowColor(_)
        )
    }
    fn gradient(p: &StyleProperty) -> bool {
        matches!(
            p,
            StyleProperty::BackgroundImageNone
                | StyleProperty::BackgroundImage(..)
                | StyleProperty::Gradient(..)
                | StyleProperty::GradientStopColor(..)
                | StyleProperty::GradientStopPosition(..)
        )
    }
    let mut declarations = declarations;
    for (family, composed) in [
        (
            crate::shadows::is_slot as fn(&StyleProperty) -> bool,
            composed.shadows,
        ),
        (filter, composed.filters),
        (gradient, composed.gradients),
    ] {
        if composed {
            continue;
        }
        let base: Vec<hozo_ir::StyleDeclaration> = declarations
            .iter()
            .filter(|d| d.condition == hozo_ir::Condition::Always && family(&d.property))
            .cloned()
            .collect();
        if base.is_empty() {
            continue;
        }
        let mut folded = Vec::with_capacity(declarations.len());
        let mut seen: Vec<hozo_ir::Condition> = Vec::new();
        for declaration in declarations {
            if declaration.condition != hozo_ir::Condition::Always
                && family(&declaration.property)
                && !seen.contains(&declaration.condition)
            {
                seen.push(declaration.condition.clone());
                folded.extend(base.iter().map(|copy| hozo_ir::StyleDeclaration {
                    condition: declaration.condition.clone(),
                    ..copy.clone()
                }));
            }
            folded.push(declaration);
        }
        declarations = folded;
    }
    declarations
}
