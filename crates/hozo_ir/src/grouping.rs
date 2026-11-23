//! Grouping and flattening declarations by condition, shared by every
//! lowering backend.

use super::*;

/// Groups conditions within each source input, not across cascade boundaries.
/// Source order is stable; a bounded mixed owner-interaction domain also
/// respects CSS specificity, which Native arrays cannot supply themselves.
///
/// Flattening ("last declaration wins") only applies *within* a group of
/// declarations sharing the identical `Condition` -- declarations under
/// different conditions are separate output rules (a CSS rule on Web, a
/// separate style object on Native), not competing values to resolve at
/// compile time.
pub fn group_by_condition(
    declarations: &[StyleDeclaration],
) -> Vec<(Condition, Vec<StyleProperty>)> {
    plan_native_condition_groups(declarations, OwnerSlotComposition::default()).groups
}

/// CSS handles selector specificity itself. Preserve source order between
/// groups, particularly the input order that breaks equal-specificity ties.
pub fn group_by_condition_for_css(
    declarations: &[StyleDeclaration],
) -> Vec<(Condition, Vec<StyleProperty>)> {
    let (groups, needs_composition) = condition_groups(
        declarations,
        OwnerSlotComposition {
            filters: true,
            shadows: true,
            gradients: true,
        },
    );
    if needs_composition {
        coalesce_adjacent_conditions(groups)
    } else {
        groups
    }
}

pub(super) type ConditionGroup = (Condition, Vec<StyleProperty>);

/// The ordered groups and the single-ranked-input proof used by Native
/// emission. The same proof must govern both this projection and the
/// subsequent construction of the style array.
pub struct NativeConditionGroupPlan {
    pub groups: Vec<ConditionGroup>,
    pub canonical_input: bool,
}

/// Effect families that the caller composes after selecting guarded objects.
/// Other slots and animation frames still use whole strings.
#[derive(Default, Clone, Copy)]
pub struct OwnerSlotComposition {
    pub filters: bool,
    pub shadows: bool,
    pub gradients: bool,
}

pub fn plan_native_condition_groups(
    declarations: &[StyleDeclaration],
    composition: OwnerSlotComposition,
) -> NativeConditionGroupPlan {
    let (mut groups, needs_composition) = condition_groups(declarations, composition);
    let canonical_input = has_canonical_tailwind_input(declarations);
    if needs_composition {
        // An input whose shared order was assessed is already linearized.
        // This includes backend projections that inserted register fallbacks
        // ahead of explicit writes without changing their guards.
        if !canonical_input {
            linearize_native_specificity(&mut groups);
        }
        groups = coalesce_adjacent_conditions(groups);
    }
    NativeConditionGroupPlan {
        groups,
        canonical_input,
    }
}

pub(super) fn condition_groups(
    declarations: &[StyleDeclaration],
    composition: OwnerSlotComposition,
) -> (Vec<ConditionGroup>, bool) {
    let mut groups: Vec<ConditionGroup> = Vec::new();
    let mut source = None;
    let mut start = 0;
    let mut ordered = false;
    let mut unranked_tailwind = false;
    let mut preserve_runs = false;
    let mut compatible_filter_runs = None;
    let mut compatible_shadow_runs = None;
    let mut compatible_gradient_runs = None;
    for (index, decl) in declarations.iter().enumerate() {
        // A later styling input can revisit a condition after another
        // condition. Merging it into the earlier rule would move its write
        // backwards across that rule, losing JSX tie order.
        let next_ordered = matches!(decl.source, StyleSource::TailwindOrdered { .. });
        let authored = matches!(decl.source, StyleSource::TailwindUtility { .. });
        unranked_tailwind |= authored;
        let next_source = Some(decl.source.input());
        if source != next_source || ordered != next_ordered {
            source = next_source;
            start = groups.len();
            // Preserve consecutive guard runs only for values that both
            // backends can emit or compose as independent writes.
            preserve_runs = authored
                && independent_owner_guard_runs(&declarations[index..], &mut |property| {
                    match property {
                        StyleProperty::Filter(..) => {
                            composition.filters
                                && *compatible_filter_runs
                                    .get_or_insert_with(|| filter_runs_can_split(declarations))
                        }
                        StyleProperty::Gradient(..)
                        | StyleProperty::GradientStopColor(..)
                        | StyleProperty::GradientStopPosition(..) => {
                            composition.gradients
                                && *compatible_gradient_runs
                                    .get_or_insert_with(|| gradient_runs_can_split(declarations))
                        }
                        property if is_shadow_slot(property) => {
                            match compatible_shadow_runs
                                .get_or_insert_with(|| shadow_runs(declarations))
                            {
                                ShadowRuns::Independent | ShadowRuns::OneGuard => true,
                                ShadowRuns::SeveralGuards => composition.shadows,
                                ShadowRuns::Blocked => false,
                            }
                        }
                        _ => false,
                    }
                });
        } else if next_ordered
            && groups
                .last()
                .is_some_and(|(condition, _)| *condition != decl.condition)
        {
            start = groups.len();
        }
        ordered = next_ordered;
        let region = &mut groups[start..];
        // A box-shadow register can rejoin its only conditional writer
        // without moving any of the independent properties in that rule.
        let coalesce_shadow =
            compatible_shadow_runs == Some(ShadowRuns::OneGuard) && is_shadow_slot(&decl.property);
        let existing = if preserve_runs && decl.condition != Condition::Always && !coalesce_shadow {
            region
                .last_mut()
                .filter(|(condition, _)| *condition == decl.condition)
        } else {
            region
                .iter_mut()
                .find(|(condition, _)| *condition == decl.condition)
        };
        match existing {
            Some((_, props)) => props.push(decl.property.clone()),
            None => groups.push((decl.condition.clone(), vec![decl.property.clone()])),
        }
    }
    // A single input is already in its frontend's order unless a Tailwind
    // barrier kept that input in authored order.
    (groups, start != 0 || unranked_tailwind)
}

pub(super) fn filter_runs_can_split(declarations: &[StyleDeclaration]) -> bool {
    let mut base_reset = false;
    let mut base_slots = false;
    for d in declarations {
        match d.property {
            StyleProperty::FilterRaw(_)
            | StyleProperty::DropShadowColor(_)
            | StyleProperty::Filter(FilterFunction::DropShadow, _) => return false,
            StyleProperty::Filter(FilterFunction::None, _) => {
                // An isolated base reset is just a resting value; a guarded
                // reset can compete with the same run's register reader.
                if d.condition != Condition::Always || base_slots {
                    return false;
                }
                base_reset = true;
            }
            StyleProperty::Filter(..) if d.condition == Condition::Always => {
                // Retain the existing whole-rule reset when resting
                // functions and a reset share the input.
                if base_reset {
                    return false;
                }
                base_slots = true;
            }
            _ => {}
        }
    }
    true
}

pub(super) fn gradient_runs_can_split(declarations: &[StyleDeclaration]) -> bool {
    // A resting reset can coexist with stops; it just has no image to
    // draw. Competing constructors at rest or guarded resets still need
    // a proof for whole-property precedence.
    let mut base_reset = false;
    let mut base_constructor = false;
    !declarations.iter().any(|d| match &d.property {
        StyleProperty::BackgroundImageNone => {
            base_reset = true;
            d.condition != Condition::Always || base_constructor
        }
        StyleProperty::BackgroundImage(_) | StyleProperty::Gradient(GradientKind::Conic, _) => true,
        StyleProperty::Gradient(..) if d.condition == Condition::Always => {
            base_constructor = true;
            base_reset
        }
        StyleProperty::GradientStopColor(_, color) => color.is_initial(),
        StyleProperty::GradientStopPosition(_, position) => {
            !matches!(position, Dimension::Percent(_))
        }
        StyleProperty::Arbitrary(name, _) => {
            matches!(name.as_str(), "background-image" | "backgroundImage")
        }
        _ => false,
    })
}

pub(super) fn is_shadow_modifier(property: &StyleProperty) -> bool {
    matches!(
        property,
        StyleProperty::ShadowColor(_)
            | StyleProperty::InsetShadow(_)
            | StyleProperty::InsetShadowColor(_)
            | StyleProperty::RingWidth(_)
            | StyleProperty::RingColor(_)
            | StyleProperty::InsetRingWidth(_)
            | StyleProperty::InsetRingColor(_)
            | StyleProperty::RingOffsetWidth(_)
            | StyleProperty::RingOffsetColor(_)
            | StyleProperty::RingInset
    )
}

pub(super) fn is_shadow_slot(property: &StyleProperty) -> bool {
    matches!(property, StyleProperty::BoxShadow(_)) || is_shadow_modifier(property)
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) enum ShadowRuns {
    Independent,
    OneGuard,
    SeveralGuards,
    Blocked,
}

pub(super) fn shadow_runs(declarations: &[StyleDeclaration]) -> ShadowRuns {
    let mut first = None;
    let mut left_first_run = false;
    let mut left_first_input = false;
    let mut split_shadow_writers = false;
    let mut different_shadow_guard = false;
    let mut different_shadow_input = false;
    let mut has_modifier = false;
    for d in declarations {
        if matches!(&d.property, StyleProperty::Arbitrary(name, _)
            if matches!(name.as_str(), "box-shadow" | "boxShadow"))
        {
            return ShadowRuns::Blocked;
        }
        let input = (
            d.source.input(),
            matches!(d.source, StyleSource::TailwindOrdered { .. }),
        );
        if let Some((first_input, first_condition)) = first {
            left_first_input |= first_input != input;
            left_first_run |= left_first_input || first_condition != &d.condition;
        }
        let modifier = is_shadow_modifier(&d.property);
        has_modifier |= modifier;
        if d.condition != Condition::Always
            && (modifier || matches!(d.property, StyleProperty::BoxShadow(_)))
        {
            let (_, first_condition) = *first.get_or_insert((input, &d.condition));
            split_shadow_writers |= left_first_run;
            different_shadow_guard |= first_condition != &d.condition;
            different_shadow_input |= left_first_input;
        }
        if different_shadow_input && has_modifier {
            return ShadowRuns::Blocked;
        }
    }
    if different_shadow_guard && has_modifier {
        ShadowRuns::SeveralGuards
    } else if split_shadow_writers && has_modifier {
        // No other guard or input competes for boxShadow, so only this
        // family can go back to its first run and keep the whole value.
        ShadowRuns::OneGuard
    } else {
        ShadowRuns::Independent
    }
}

pub(super) fn independent_owner_guard_runs(
    declarations: &[StyleDeclaration],
    can_split_effect: &mut impl FnMut(&StyleProperty) -> bool,
) -> bool {
    let input = declarations[0].source.input();
    declarations
        .iter()
        .take_while(|item| {
            item.source.input() == input
                && !matches!(item.source, StyleSource::TailwindOrdered { .. })
        })
        .all(|item| {
            if !matches!(item.source, StyleSource::TailwindUtility { .. }) {
                return false;
            }
            if item.condition == Condition::Always {
                return true;
            }
            if !item
                .condition
                .owner_interaction_specificity()
                .is_some_and(|weight| weight > 0)
            {
                return false;
            }
            match &item.property {
                StyleProperty::Opacity(_)
                | StyleProperty::FontWeight(_)
                | StyleProperty::FontFamily(_)
                | StyleProperty::PaddingTop(_)
                | StyleProperty::PaddingRight(_)
                | StyleProperty::PaddingBottom(_)
                | StyleProperty::PaddingLeft(_)
                | StyleProperty::MarginTop(_)
                | StyleProperty::MarginRight(_)
                | StyleProperty::MarginBottom(_)
                | StyleProperty::MarginLeft(_)
                | StyleProperty::PaddingInlineStart(_)
                | StyleProperty::PaddingInlineEnd(_)
                | StyleProperty::MarginInlineStart(_)
                | StyleProperty::MarginInlineEnd(_)
                | StyleProperty::Gap(_)
                | StyleProperty::RowGap(_)
                | StyleProperty::ColumnGap(_)
                | StyleProperty::TranslateX(_)
                | StyleProperty::TranslateY(_) => true,
                // Absolute text metrics can keep their runs. The emitters
                // already project font defaults separately from explicit
                // leading; relative metrics can need more context on Native.
                StyleProperty::FontSize(length)
                | StyleProperty::LineHeight(
                    LineHeight::Length(length) | LineHeight::FontDefault(length),
                )
                | StyleProperty::LetterSpacing(LetterSpacing::Px(length)) => {
                    length.css_expression().is_none() && length.unresolved_unit().is_none()
                }
                property => can_split_effect(property),
            }
        })
}

pub(super) fn linearize_native_specificity(groups: &mut [ConditionGroup]) {
    // Native arrays cannot express CSS specificity. Only project this
    // bounded domain when every guard has known weight; unknown is not zero.
    let mut previous = 0;
    let mut inverted = false;
    for (condition, _) in groups.iter() {
        let Some(weight) = condition.owner_interaction_specificity() else {
            return;
        };
        inverted |= weight < previous;
        previous = weight;
    }
    if inverted {
        groups.sort_by_cached_key(|(condition, _)| condition.owner_interaction_specificity());
    }
}

pub(super) fn coalesce_adjacent_conditions(mut groups: Vec<ConditionGroup>) -> Vec<ConditionGroup> {
    // Consecutive equal rules are safe to coalesce, including resting
    // transforms from two inputs. Never merge across an intervening rule.
    groups.dedup_by(|later, earlier| {
        if later.0 == earlier.0 {
            earlier.1.append(&mut later.1);
            true
        } else {
            false
        }
    });
    groups
}

/// Backend projections may preserve one assessed input's established order,
/// but cannot borrow that permission across authored inputs or foreign guards.
/// Unconditional semantic defaults add no selector weight.
pub fn has_canonical_tailwind_input(declarations: &[StyleDeclaration]) -> bool {
    let mut input = None;
    for declaration in declarations {
        match declaration.source {
            StyleSource::TailwindOrdered { input: next, .. } => {
                if input.is_some_and(|previous| previous != next) {
                    return false;
                }
                input = Some(next);
            }
            StyleSource::Unspecified if declaration.condition == Condition::Always => {}
            _ => return false,
        }
    }
    input.is_some()
}

/// Within one condition group, the last declaration for a given property
/// wins -- resolved by discriminant (the property's *kind*, ignoring its
/// value), keeping only the last occurrence of each while preserving
/// overall relative order.
pub fn dedupe_last_wins(props: Vec<StyleProperty>) -> Vec<StyleProperty> {
    // Written order decides everything except values a text-size or
    // `transition-*` utility carries as fallbacks. Those lose to their own
    // utility wherever it appears, because Tailwind reads them through a
    // register rather than a declaration: `duration-75 transition` is 75ms
    // and so is `transition duration-75`. Resolving the indirection at
    // build time turned the fallback into an ordinary declaration, and it
    // beat the explicit one whenever `transition` was written second.
    let written: std::collections::HashSet<_> = props
        .iter()
        .filter(|prop| prop.origin() == Some(Origin::Written))
        .map(StyleProperty::dedupe_key)
        .collect();
    let props: Vec<StyleProperty> = props
        .into_iter()
        .filter(|prop| {
            prop.origin() != Some(Origin::Default) || !written.contains(&prop.dedupe_key())
        })
        .collect();

    let mut seen = std::collections::HashSet::new();
    let mut kept: Vec<StyleProperty> = Vec::new();
    for prop in props.into_iter().rev() {
        if seen.insert(prop.dedupe_key()) {
            kept.push(prop);
        }
    }
    kept.reverse();
    kept
}

impl StyleProperty {
    /// Whether two declarations write the same final style slot.
    ///
    /// StyleX needs this above `dedupe_last_wins`: a later unconditional
    /// argument removes an earlier conditional value for the same property.
    /// The key itself stays private so its tuple shape is not frontend API.
    pub fn same_property_as(&self, other: &Self) -> bool {
        self.dedupe_key() == other.dedupe_key()
    }

    /// The one CSS property this writes, when it is one Hozo can name.
    ///
    /// For a message, so `None` is an answer: shorthands and values that
    /// fold through a custom property are left out, as they are of the
    /// table this reads.
    pub fn css_property_name(&self) -> Option<&'static str> {
        tailwind_assessment::scalar_css_property(self)
    }

    /// What makes two declarations "the same property" for last-wins
    /// flattening.
    ///
    /// The enum discriminant, almost always -- which is why nearly every
    /// per-side property here has its own variant rather than carrying a
    /// side. The exception is the variants that carry their own target: for
    /// those the target is part of the identity, or `scroll-mt-4
    /// scroll-mb-8` (and `mask-t-from-4 mask-b-from-8`) would collapse into
    /// one.
    ///
    /// The extra discriminator is a plain integer because it has to cover
    /// an `Edge`, a `(MaskSlot, MaskStop)` pair, and a bare `MaskSlot`
    /// without those needing a common type. Only the variants listed here
    /// use it; everything else passes 0.
    ///
    /// `Keyword` needs a third component: every one of those shares a
    /// single discriminant, so the CSS property name is what tells two of
    /// them apart. It is a string rather than a number on purpose --
    /// hashing into the integer would make a collision silently drop a
    /// declaration, which is the failure this key exists to prevent.
    /// Whether a browser will apply this property inside `:visited`.
    ///
    /// History is private, and a `:visited` style that changed anything
    /// observable would leak it: layout would leak it through element
    /// sizes, `getComputedStyle` would hand it over outright, even a
    /// background image would leak it through the request. So engines
    /// resolve `:visited` against a short list of colour properties and
    /// discard the rest, and paint the survivors with the alpha channel
    /// forced opaque so a half-transparent colour cannot be told from an
    /// opaque one.
    ///
    /// The list is the union of what the Selectors spec names and what
    /// Chromium, Gecko and WebKit actually implement, taken wide on
    /// purpose: this decides whether Hozo *warns*, and warning about a
    /// property that does work is worse than staying quiet about one that
    /// doesn't.
    ///
    /// `RingColor` and `ShadowColor` are deliberately absent even though
    /// their names say colour. They reach `box-shadow`, which is not on
    /// the list, and they get there through a custom property, which is
    /// not on it either.
    pub fn survives_visited(&self) -> bool {
        if let StyleProperty::FirstThatWorks(candidates) = self {
            return candidates
                .first()
                .is_some_and(StyleProperty::survives_visited);
        }
        matches!(
            self,
            StyleProperty::TextColor(_)
                | StyleProperty::BackgroundColor(_)
                | StyleProperty::BorderColor(_)
                | StyleProperty::BorderTopColor(_)
                | StyleProperty::BorderRightColor(_)
                | StyleProperty::BorderBottomColor(_)
                | StyleProperty::BorderLeftColor(_)
                | StyleProperty::BorderInlineColor(_)
                | StyleProperty::BorderBlockColor(_)
                | StyleProperty::BorderInlineStartColor(_)
                | StyleProperty::BorderInlineEndColor(_)
                | StyleProperty::BorderBlockStartColor(_)
                | StyleProperty::BorderBlockEndColor(_)
                | StyleProperty::OutlineColor(_)
                | StyleProperty::TextDecorationColor(_)
                | StyleProperty::CaretColor(_)
                | StyleProperty::Fill(_)
                | StyleProperty::Stroke(_)
        )
    }

    /// Where this value came from, for properties that have an
    /// answer. See `Origin`.
    pub fn origin(&self) -> Option<Origin> {
        match self {
            StyleProperty::FirstThatWorks(candidates) => {
                candidates.first().and_then(StyleProperty::origin)
            }
            StyleProperty::TransitionDuration(_, origin)
            | StyleProperty::TransitionDelay(_, origin)
            | StyleProperty::TransitionTimingFunction(_, origin) => Some(*origin),
            StyleProperty::LineHeight(LineHeight::FontDefault(_)) => Some(Origin::Default),
            StyleProperty::LineHeight(_) => Some(Origin::Written),
            StyleProperty::BorderTopStyle(style)
            | StyleProperty::BorderRightStyle(style)
            | StyleProperty::BorderBottomStyle(style)
            | StyleProperty::BorderLeftStyle(style)
            | StyleProperty::BorderLogicalStyle(_, style)
            | StyleProperty::OutlineStyle(style) => Some(if *style == BorderStyle::Default {
                Origin::Default
            } else {
                Origin::Written
            }),
            _ => None,
        }
    }

    pub(crate) fn dedupe_key(&self) -> (std::mem::Discriminant<Self>, u32, String) {
        if let StyleProperty::FirstThatWorks(candidates) = self {
            return candidates
                .first()
                .expect("firstThatWorks always has at least one candidate")
                .dedupe_key();
        }
        if let StyleProperty::Keyword(property, _) = self {
            return (std::mem::discriminant(self), 0, (*property).to_string());
        }
        // Same reasoning as `Keyword`: one discriminant covers every
        // arbitrary property, so the name is the only thing that tells two
        // of them apart.
        if let StyleProperty::Arbitrary(property, _) = self {
            return (std::mem::discriminant(self), 0, property.clone());
        }
        if let StyleProperty::WebOnly(property, _) = self {
            return (std::mem::discriminant(self), 0, property.clone());
        }
        let target = match self {
            StyleProperty::ScrollMargin(edge, _) | StyleProperty::ScrollPadding(edge, _) => {
                *edge as u32
            }
            StyleProperty::MaskStopColor(slot, stop, _)
            | StyleProperty::MaskStopPosition(slot, stop, _) => (*slot as u32) * 2 + *stop as u32,
            StyleProperty::BorderLogicalWidth(edge, _)
            | StyleProperty::BorderLogicalStyle(edge, _) => *edge as u32,
            StyleProperty::MaskSlotArgument(slot, _) => *slot as u32,
            StyleProperty::GradientStopColor(stop, _)
            | StyleProperty::GradientStopPosition(stop, _) => *stop as u32,
            // `drop-shadow-none` is its own write, not a size: Tailwind sorts
            // it between the sizes and the colours, and a colour rebuilds the
            // shadow from the size register even after it. Keeping both lets
            // the backends do the same (`filter_value`, `filter_entry`).
            StyleProperty::Filter(FilterFunction::DropShadow, value) if value.is_empty() => {
                u32::MAX
            }
            StyleProperty::Filter(function, _) | StyleProperty::BackdropFilter(function, _) => {
                *function as u32
            }
            _ => 0,
        };
        (std::mem::discriminant(self), target, String::new())
    }
}

#[cfg(test)]
mod grouping_tests {
    use super::*;

    #[test]
    fn dedupe_keeps_last_value_per_property_kind() {
        let props = vec![
            StyleProperty::PaddingLeft(Length::Px(4.0)),
            StyleProperty::PaddingTop(Length::Px(4.0)),
            StyleProperty::PaddingLeft(Length::Px(16.0)),
        ];
        let deduped = dedupe_last_wins(props);
        assert_eq!(
            deduped,
            vec![
                StyleProperty::PaddingTop(Length::Px(4.0)),
                StyleProperty::PaddingLeft(Length::Px(16.0))
            ]
        );
    }

    #[test]
    fn an_edge_is_part_of_a_property_s_identity() {
        // `ScrollMargin` carries its edge instead of having eleven variants,
        // so the edge has to be in the dedupe key -- otherwise these two
        // would look like the same property and only the last would survive.
        let props = vec![
            StyleProperty::ScrollMargin(Edge::Top, Length::Px(16.0)),
            StyleProperty::ScrollMargin(Edge::Bottom, Length::Px(32.0)),
        ];
        assert_eq!(dedupe_last_wins(props).len(), 2);

        // ...while the same edge twice still resolves last-wins.
        let props = vec![
            StyleProperty::ScrollMargin(Edge::Top, Length::Px(16.0)),
            StyleProperty::ScrollMargin(Edge::Top, Length::Px(32.0)),
        ];
        assert_eq!(
            dedupe_last_wins(props),
            vec![StyleProperty::ScrollMargin(Edge::Top, Length::Px(32.0))]
        );
    }

    #[test]
    fn condition_groups_stay_separate() {
        let decls = vec![
            StyleDeclaration {
                source: Default::default(),
                property: StyleProperty::BackgroundColor(Color::Token("red-500".to_string())),
                condition: Condition::Always,
            },
            StyleDeclaration {
                source: Default::default(),
                property: StyleProperty::BackgroundColor(Color::Token("blue-500".to_string())),
                condition: Condition::Hover,
            },
        ];
        let groups = group_by_condition(&decls);
        assert_eq!(groups.len(), 2);
    }

    #[test]
    fn coalescing_shadow_slots_requires_one_guard_in_one_input_region() {
        let mut declarations = [
            StyleDeclaration {
                condition: Condition::Hover,
                source: StyleSource::Tailwind(0),
                property: StyleProperty::BoxShadow("0 1px 2px #000".into()),
            },
            StyleDeclaration {
                condition: Condition::Pressed,
                source: StyleSource::Tailwind(0),
                property: StyleProperty::Opacity(0.5),
            },
            StyleDeclaration {
                condition: Condition::Hover,
                source: StyleSource::Tailwind(0),
                property: StyleProperty::RingWidth(Length::Px(2.0)),
            },
        ];
        assert!(matches!(shadow_runs(&declarations), ShadowRuns::OneGuard));
        declarations[2].condition = Condition::Pressed;
        assert!(matches!(
            shadow_runs(&declarations),
            ShadowRuns::SeveralGuards
        ));
        declarations[2].condition = Condition::Hover;
        declarations[1].source = StyleSource::Stylex(1);
        assert!(matches!(shadow_runs(&declarations), ShadowRuns::Blocked));
    }

    #[test]
    fn later_sources_do_not_merge_back_across_intervening_conditions() {
        let declaration = |condition, source, value| StyleDeclaration {
            condition,
            source,
            property: StyleProperty::Opacity(value),
        };
        let styles = [
            declaration(Condition::Focus, StyleSource::Tailwind(10), 0.1),
            declaration(Condition::Pressed, StyleSource::Tailwind(10), 0.2),
            declaration(Condition::Focus, StyleSource::Stylex(30), 0.3),
        ];
        let groups = group_by_condition(&styles);
        assert_eq!(groups.len(), 3);
        assert_eq!(groups[0].0, Condition::Focus);
        assert_eq!(groups[1].0, Condition::Pressed);
        assert_eq!(
            groups[2],
            (Condition::Focus, vec![StyleProperty::Opacity(0.3)])
        );
        let styles = [
            declaration(
                Condition::All(vec![Condition::Hover, Condition::Focus]),
                StyleSource::Tailwind(10),
                0.1,
            ),
            declaration(Condition::Pressed, StyleSource::Stylex(30), 0.2),
        ];
        let groups = group_by_condition(&styles);
        assert_eq!(groups[0].0, Condition::Pressed);
        assert!(matches!(groups[1].0, Condition::All(_)));
    }

    #[test]
    fn native_group_plan_projects_known_weights_and_keeps_unknown_guards_in_place() {
        let all = Condition::All(vec![Condition::Hover, Condition::Focus]);
        let style = |condition, input, opacity| StyleDeclaration {
            condition,
            source: StyleSource::Stylex(input),
            property: StyleProperty::Opacity(opacity),
        };
        let mut declarations = vec![
            style(all.clone(), 1, 0.1),
            style(Condition::Pressed, 2, 0.2),
            style(all.clone(), 3, 0.3),
        ];
        let known = plan_native_condition_groups(&declarations, OwnerSlotComposition::default());
        assert!(!known.canonical_input);
        assert_eq!(
            known.groups,
            vec![
                (Condition::Pressed, vec![StyleProperty::Opacity(0.2)]),
                (
                    all.clone(),
                    vec![StyleProperty::Opacity(0.1), StyleProperty::Opacity(0.3)]
                ),
            ],
        );
        declarations.push(style(Condition::Dark, 4, 0.4));
        let unknown = plan_native_condition_groups(&declarations, OwnerSlotComposition::default());
        assert_eq!(unknown.groups, group_by_condition_for_css(&declarations));
        assert_eq!(unknown.groups.len(), 4);
        assert_eq!(unknown.groups[0].0, all);
    }
}
