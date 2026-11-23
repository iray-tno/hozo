//! A write plan owns the declaration allocation. Scalar ordering moves IR
//! writes, never source expressions, and is shared by both platform emitters.
//! Explicit pass-through remains available as an unassessed-domain control.
use crate::{
    owner_colour_independent_scalar, Condition, StyleDeclaration, StyleProperty, StyleSource,
    TailwindRuleBinding, TailwindUnitBindings,
};
use std::ops::Range;

mod order;
use order::*;

/// Output-cache identity changes when the eligible projection domain changes,
/// even if the underlying CSS descriptors and comparator are unchanged.
pub const TAILWIND_SCALAR_ORDER_POLICY: &str = "scalar-order-v71";

/// Shared platform-projection boundary, not a utility order table. Single-key
/// projections share their ownership definition; padding, margin, gap and
/// inset also admit their already-assessed shorthand expansion, and a border
/// width admits the style its rule writes beside it. Registers (a border
/// style utility's `--tw-border-style`) and compound text still need
/// separate evidence.
///
/// Logical and physical edges are both admitted. Yoga still gives
/// `paddingStart` priority over `paddingLeft` by key. Native projects both
/// gap shorthands and longhands to the axis keys, so their order decides
/// the same axes as in the Web cascade.
pub fn scalar_tailwind_property(property: &crate::StyleProperty) -> bool {
    use crate::StyleProperty::*;
    crate::tailwind_assessment::scalar_css_property(property).is_some()
        || crate::tailwind_assessment::border_edge_properties(property).is_some()
        || matches!(
            property,
            PaddingTop(_)
                | PaddingRight(_)
                | PaddingBottom(_)
                | PaddingLeft(_)
                | MarginTop(_)
                | MarginRight(_)
                | MarginBottom(_)
                | MarginLeft(_)
                | PaddingInlineStart(_)
                | PaddingInlineEnd(_)
                | MarginInlineStart(_)
                | MarginInlineEnd(_)
                | Gap(_)
                | RowGap(_)
                | ColumnGap(_)
                | InsetInline(_)
                | InsetInlineStart(_)
                | InsetInlineEnd(_)
                | InsetBlock(_)
                | InsetBlockStart(_)
                | InsetBlockEnd(_)
        )
}

pub struct TailwindWritePlan<'a> {
    declarations: Vec<StyleDeclaration>,
    bindings: &'a TailwindUnitBindings<'a>,
}

pub struct TailwindWriteBlock<'a> {
    pub range: Range<usize>,
    pub source: StyleSource,
    pub condition: &'a Condition,
    pub declarations: &'a [StyleDeclaration],
    /// None means no retained utility identity; not a default rule/rank.
    pub binding: Option<TailwindRuleBinding<'a>>,
}

impl<'a> TailwindWritePlan<'a> {
    pub fn passthrough(
        declarations: Vec<StyleDeclaration>,
        bindings: &'a TailwindUnitBindings<'a>,
    ) -> Self {
        Self {
            declarations,
            bindings,
        }
    }

    /// Plan within a contiguous frontend input. Unassessed writes are
    /// barriers unless their entire captured footprint proves independence.
    /// The caller must use a compatible complete namespace.
    pub fn order_scalars(mut self) -> Self {
        let mut dominated = vec![false; self.declarations.len()];
        let mut offset = 0;
        for region in self
            .declarations
            .chunk_by_mut(|a, b| a.source.input() == b.source.input())
        {
            let start = offset;
            offset += region.len();
            if region.len() < 2 {
                continue;
            }
            // A supplemental register and its resting colour do not
            // compete with font-size priority. Only keep this exception
            // for a region of default readers, not other register writers
            // or a second colour rule with unproven ownership.
            let supplemental = region.iter().find_map(|declaration| {
                matches!(
                    declaration.property,
                    crate::StyleProperty::LeadingRegister(_)
                )
                .then_some(declaration.source)
            });
            let can_keep_metric_order = supplemental.is_some_and(|source| {
                region.iter().all(|declaration| {
                    use crate::StyleProperty::*;
                    match declaration.property {
                        LeadingRegister(_) | TextColor(_) => {
                            declaration.source == source
                                && declaration.condition == Condition::Always
                        }
                        FontSize(_) | LineHeight(crate::LineHeight::FontDefault(_)) => true,
                        _ => false,
                    }
                })
            });
            let ranks: Option<Vec<_>> = region
                .iter()
                .enumerate()
                .map(|(index, decl)| {
                    if can_keep_metric_order && Some(decl.source) == supplemental {
                        // Neither write participates in the metric race.
                        // Sort them last rather than assigning Tailwind rank zero.
                        return Some((usize::MAX, index, [0; 3]));
                    }
                    write_rank(self.bindings, decl, index)
                })
                .collect();
            let Some(mut ranks) = ranks
                .or_else(|| scalars_beside_owner_background(self.bindings, region))
                .or_else(|| scalars_beside_disjoint_writes(self.bindings, region))
            else {
                order_partial_input(self.bindings, region);
                continue;
            };
            apply_ranked_order(region, &mut ranks);
            // A breakpoint branch of an unprefixed rule (`container`'s
            // `max-width` at each width) sits at that rule's place in the
            // order, which can be before an unprefixed write of the same
            // property (`max-w-5xl`). Tailwind's cascade then never lets the
            // branch win: same weight, earlier. Both backends apply a
            // conditional style after the unconditional ones whatever its
            // place, so such a branch is dropped here instead. A variant's
            // rule always sorts after every unprefixed one, so this never
            // touches `md:` and the like.
            let specificity: Vec<[u32; 3]> = {
                let mut by_position = vec![[0; 3]; ranks.len()];
                for (new, &(_, _, weight)) in ranks.iter().enumerate() {
                    by_position[new] = weight;
                }
                by_position
            };
            for (index, declaration) in region.iter().enumerate() {
                if !matches!(declaration.condition, Condition::Responsive(_)) {
                    continue;
                }
                dominated[start + index] = region[index + 1..]
                    .iter()
                    .zip(&specificity[index + 1..])
                    .any(|(later, weight)| {
                        later.condition == Condition::Always
                            && later.property.same_property_as(&declaration.property)
                            && *weight >= specificity[index]
                    });
            }
        }
        if dominated.contains(&true) {
            let mut keep = dominated.into_iter().map(|dropped| !dropped);
            self.declarations.retain(|_| keep.next().unwrap_or(true));
        }
        self
    }

    /// Pairs of writes, in one input, to one property under one guard, whose
    /// final order Tailwind's ranks did not decide. Call after ordering.
    ///
    /// A fully ranked input never has one: its writes are sorted. They appear
    /// where an unrankable write made the plan keep authored order around it
    /// (decision 012, point 7). Reported so that boundary is never silent.
    pub fn authored_conflicts(&self) -> Vec<AuthoredConflict<'_>> {
        let mut found: Vec<AuthoredConflict<'_>> = Vec::new();
        for region in self
            .declarations
            .chunk_by(|a, b| a.source.input() == b.source.input())
        {
            if region.len() < 2 {
                continue;
            }
            let name = |declaration: &StyleDeclaration| {
                self.bindings
                    .units()
                    .candidate(declaration.source.utility()?)
            };
            for (index, later) in region.iter().enumerate().skip(1) {
                for earlier in &region[..index] {
                    if earlier.source.utility() == later.source.utility()
                        || earlier.condition != later.condition
                        || !writes_same_slot(&earlier.property, &later.property)
                        // Registers and compound text compose; two writes to
                        // one of those are not a pair with a single winner.
                        || !(scalar_tailwind_property(&earlier.property)
                            || scalar_tailwind_property(&later.property))
                    {
                        continue;
                    }
                    let (Some(first), Some(second)) = (name(earlier), name(later)) else {
                        continue;
                    };
                    let tailwind_applies_last = match (
                        write_rank(self.bindings, earlier, 0),
                        write_rank(self.bindings, later, 0),
                    ) {
                        // Written order is Tailwind's order: nothing decided.
                        (Some(a), Some(b)) if a.0 <= b.0 => continue,
                        (Some(_), Some(_)) => Some(first),
                        _ => None,
                    };
                    // A shorthand expands to several writes; one report.
                    if !found
                        .iter()
                        .any(|seen| seen.earlier == first && seen.later == second)
                    {
                        found.push(AuthoredConflict {
                            earlier: first,
                            later: second,
                            tailwind_applies_last,
                        });
                    }
                }
            }
        }
        found
    }

    /// Adjacent writes only. A repeated input/utility/guard after another
    /// block must not be merged backwards across that intervening write.
    pub fn blocks(&self) -> impl Iterator<Item = TailwindWriteBlock<'_>> {
        let mut start = 0;
        self.declarations
            .chunk_by(|a, b| a.source == b.source && a.condition == b.condition)
            .map(move |declarations| {
                let source = declarations[0].source;
                let range = start..start + declarations.len();
                start = range.end;
                TailwindWriteBlock {
                    range,
                    source,
                    condition: &declarations[0].condition,
                    declarations,
                    binding: source.utility().and_then(|id| self.bindings.get(id)),
                }
            })
    }

    /// Moving out returns the exact allocation and predicates, not expanded
    /// copies rebuilt from a report. No dedupe or folding is performed here.
    pub fn into_declarations(self) -> Vec<StyleDeclaration> {
        self.declarations
    }
}

/// Two classes of one input that write the same property under the same
/// guard, left in the order they were written.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AuthoredConflict<'a> {
    pub earlier: &'a str,
    /// The class that applies, because it was written later.
    pub later: &'a str,
    /// The class Tailwind's stylesheet would apply instead, when both rank.
    /// `None` when one of the two cannot be ranked, so its place in
    /// Tailwind's order is not known here.
    pub tailwind_applies_last: Option<&'a str>,
}

/// One property, or a logical and a physical edge of the same box side:
/// `px-4` writes the inline edges and `p-2` the physical ones, and on Web
/// the later of the two decides the left and right padding.
fn writes_same_slot(a: &StyleProperty, b: &StyleProperty) -> bool {
    use StyleProperty::*;
    let inline_edge = |property: &StyleProperty| match property {
        PaddingLeft(_) | PaddingRight(_) | PaddingInlineStart(_) | PaddingInlineEnd(_) => Some(0),
        MarginLeft(_) | MarginRight(_) | MarginInlineStart(_) | MarginInlineEnd(_) => Some(1),
        _ => None,
    };
    a.same_property_as(b)
        || (inline_edge(a).is_some()
            && inline_edge(a) == inline_edge(b)
            && matches!(
                a,
                PaddingInlineStart(_)
                    | PaddingInlineEnd(_)
                    | MarginInlineStart(_)
                    | MarginInlineEnd(_)
            ) != matches!(
                b,
                PaddingInlineStart(_)
                    | PaddingInlineEnd(_)
                    | MarginInlineStart(_)
                    | MarginInlineEnd(_)
            ))
}

#[cfg(test)]
mod tests;
