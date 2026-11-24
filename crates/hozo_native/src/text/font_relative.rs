//! Line heights and letter spacing relative to the font size, resolved
//! against it.

use crate::*;

/// Rewrites the font-relative text metrics into absolute ones, against a
/// font size set on the same element.
///
/// CSS lets `line-height` be a bare multiplier and `letter-spacing` be a
/// length in `em`; React Native's `lineHeight` and `letterSpacing` are
/// absolute numbers. The conversion needs the font size, and the useful
/// observation is that the compiler often has it -- `text-lg leading-tight`
/// puts both on the same element, and Tailwind's own output does the same
/// multiplication.
///
/// Only a font size under the *same* condition is used, falling back to an
/// unconditional one. An inherited size is equally usable: Hozo already
/// carries text declarations through View nodes because RN itself does not.
/// Folding `leading-tight` against a `md:text-lg` would bake a size that only
/// applies above 768px into a style that always does.
pub(crate) fn fold_font_relative(
    declarations: &[StyleDeclaration],
    inherited: &[StyleDeclaration],
) -> Vec<StyleDeclaration> {
    let font_size = |condition: &Condition| -> Option<f64> {
        let find = |list: &[StyleDeclaration], want: &Condition| {
            list.iter()
                .rev()
                .find_map(|d| match (&d.property, &d.condition) {
                    (StyleProperty::FontSize(Length::Px(px)), c) if c == want => Some(*px),
                    _ => None,
                })
        };
        find(declarations, condition)
            .or_else(|| find(declarations, &Condition::Always))
            .or_else(|| find(inherited, condition))
            .or_else(|| find(inherited, &Condition::Always))
    };

    let explicit_leading = |condition: &Condition| {
        declarations.iter().any(|d| {
            matches!(
                d.property,
                StyleProperty::LineHeight(
                    hozo_ir::LineHeight::Length(_) | hozo_ir::LineHeight::Ratio(_)
                )
            ) && (&d.condition == condition || d.condition == Condition::Always)
        })
    };
    let mut folded: Vec<_> = declarations
        .iter()
        .filter(|d| {
            !matches!(
                d.property,
                StyleProperty::LineHeight(hozo_ir::LineHeight::FontDefault(_))
            ) || !explicit_leading(&d.condition)
        })
        .map(|declaration| {
            let Some(size) = font_size(&declaration.condition) else {
                return declaration.clone();
            };
            let property = match &declaration.property {
                StyleProperty::LineHeight(hozo_ir::LineHeight::Ratio(ratio)) => {
                    StyleProperty::LineHeight(hozo_ir::LineHeight::Length(Length::Px(size * ratio)))
                }
                StyleProperty::LetterSpacing(hozo_ir::LetterSpacing::Em(em)) => {
                    StyleProperty::LetterSpacing(hozo_ir::LetterSpacing::Px(Length::Px(
                        size * em.0,
                    )))
                }
                _ => return declaration.clone(),
            };
            StyleDeclaration {
                source: declaration.source,
                property,
                condition: declaration.condition.clone(),
            }
        })
        .collect();

    // Relative values are multiplied at used-value time in CSS. RN needs
    // an absolute number under the intersection of both existing guards.
    // Tracking and leading use the same projection, but a competing write
    // must belong to the same metric family to suppress it.
    let mut tracking_projections = Vec::new();
    for metric in declarations {
        let (scale, leading) = match &metric.property {
            StyleProperty::LineHeight(hozo_ir::LineHeight::Ratio(ratio)) => (*ratio, true),
            StyleProperty::LetterSpacing(hozo_ir::LetterSpacing::Em(em))
                if metric.condition == Condition::Always =>
            {
                (em.0, false)
            }
            _ => continue,
        };
        if font_size(&metric.condition).is_none() {
            continue;
        }
        for font in declarations {
            let StyleProperty::FontSize(Length::Px(size)) = &font.property else {
                continue;
            };
            if font.condition == Condition::Always || metric.condition == font.condition {
                continue;
            }
            if metric.condition == Condition::Always
                && declarations.iter().any(|d| {
                    d.condition == font.condition
                        && if leading {
                            matches!(
                                d.property,
                                StyleProperty::LineHeight(
                                    hozo_ir::LineHeight::Length(_) | hozo_ir::LineHeight::Ratio(_)
                                )
                            )
                        } else {
                            matches!(d.property, StyleProperty::LetterSpacing(_))
                        }
                })
            {
                continue;
            }
            let condition = if metric.condition == Condition::Always {
                font.condition.clone()
            } else {
                Condition::all(vec![metric.condition.clone(), font.condition.clone()])
            };
            let projected = StyleDeclaration {
                source: metric.source,
                property: if leading {
                    StyleProperty::LineHeight(hozo_ir::LineHeight::Length(Length::Px(size * scale)))
                } else {
                    StyleProperty::LetterSpacing(hozo_ir::LetterSpacing::Px(Length::Px(
                        size * scale,
                    )))
                },
                condition,
            };
            if leading {
                folded.push(projected);
            } else {
                tracking_projections.push(projected);
            }
        }
    }
    if !tracking_projections.is_empty() {
        // These are recomputations of the *base* tracking, not new
        // declarations at the font-size variant's cascade priority.
        // Keep their font-size order, but let explicitly guarded tracking
        // win even if its breakpoint is narrower than the font's.
        if let Some(base) = folded.iter().rposition(|entry| {
            entry.condition == Condition::Always
                && matches!(entry.property, StyleProperty::LetterSpacing(_))
        }) {
            folded.splice(base + 1..base + 1, tracking_projections);
        }
    }
    folded
}

/// Why a font-relative metric couldn't be honoured when `fold_font_relative`
/// found no font size to resolve it against.
///
/// Kept out of `StyleProperty::unsupported_on_native` because the answer
/// depends on the node, which that method can't see -- the same reason
/// `truncation_only_reason` lives here.
pub(crate) fn font_relative_reason(property: &StyleProperty) -> Option<String> {
    match property {
        StyleProperty::LetterSpacing(hozo_ir::LetterSpacing::Em(_)) => Some(
            "`tracking-*` in em: React Native's letterSpacing is absolute. Hozo resolves it \
             against a text size on the same element, and this element sets none -- add a \
             `text-*` utility here, or use an absolute tracking value."
                .to_string(),
        ),
        StyleProperty::LineHeight(hozo_ir::LineHeight::Ratio(_)) => Some(
            "`leading-*` as a ratio: React Native's lineHeight is absolute. Hozo resolves it \
             against a text size on the same element, and this element sets none -- add a \
             `text-*` utility here, or use `leading-<number>`."
                .to_string(),
        ),
        _ => None,
    }
}
