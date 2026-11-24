//! Line heights and letter spacing relative to the font size, resolved
//! against it.

use crate::*;

/// The scalar used by the Native compiler and the generated candidate map.
/// Leave the IR spelling alone: a CSS em length, unlike a line-height ratio,
/// is inherited as its computed length on Web.
pub(crate) fn relative_metric(property: &StyleProperty) -> Option<(&'static str, f64)> {
    use hozo_ir::{LengthUnit::Em, LetterSpacing, LineHeight};
    let (key, scale) = match property {
        StyleProperty::LineHeight(LineHeight::Ratio(scale))
        | StyleProperty::LineHeight(LineHeight::Length(Length::Unit(scale, Em))) => {
            ("lineHeight", *scale)
        }
        StyleProperty::LetterSpacing(LetterSpacing::Em(scale)) => ("letterSpacing", scale.0),
        StyleProperty::LetterSpacing(LetterSpacing::Px(Length::Unit(scale, Em))) => {
            ("letterSpacing", *scale)
        }
        _ => return None,
    };
    scale.is_finite().then_some((key, scale))
}

fn metric_in_px(key: &str, length: f64) -> StyleProperty {
    if key == "lineHeight" {
        StyleProperty::LineHeight(hozo_ir::LineHeight::Length(Length::Px(length)))
    } else {
        StyleProperty::LetterSpacing(hozo_ir::LetterSpacing::Px(Length::Px(length)))
    }
}

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
    theme: &Theme,
) -> Vec<StyleDeclaration> {
    let absolute_size = |length: &Length| {
        if length.css_expression().is_some() || length.unresolved_unit().is_some() {
            return None;
        }
        let size = length.px(theme);
        size.is_finite().then_some(size)
    };
    let font_size = |condition: &Condition| -> Option<f64> {
        let find = |list: &[StyleDeclaration], want: &Condition| {
            list.iter().rev().find_map(|d| {
                let StyleProperty::FontSize(length) = &d.property else {
                    return None;
                };
                // A winning but not computable size is not the absence of
                // a write. Do not fold against an earlier/ancestor size.
                (&d.condition == want).then(|| absolute_size(length))
            })
        };
        find(declarations, condition)
            .or_else(|| find(declarations, &Condition::Always))
            .or_else(|| find(inherited, condition))
            .or_else(|| find(inherited, &Condition::Always))
            .flatten()
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
            let Some((key, scale)) = relative_metric(&declaration.property) else {
                return declaration.clone();
            };
            let Some(size) = font_size(&declaration.condition) else {
                return declaration.clone();
            };
            StyleDeclaration {
                source: declaration.source,
                property: metric_in_px(key, size * scale),
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
        let Some((key, scale)) = relative_metric(&metric.property) else {
            continue;
        };
        let leading = key == "lineHeight";
        if !leading && metric.condition != Condition::Always {
            continue;
        }
        if font_size(&metric.condition).is_none() {
            continue;
        }
        for font in declarations {
            let StyleProperty::FontSize(length) = &font.property else {
                continue;
            };
            let Some(size) = absolute_size(length) else {
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
                property: metric_in_px(key, size * scale),
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
