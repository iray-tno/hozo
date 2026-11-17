//! Native logical-vs-physical inline edge projection (#2018).
//!
//! Yoga resolves `paddingStart`/`paddingEnd`, `marginStart`/`marginEnd`,
//! `start`/`end`, and logical border edges with higher priority than their
//! physical `Left`/`Right` counterparts regardless of style array order.
//! After `TailwindWritePlan` has already settled CSS cascade order (marking
//! ordered declarations with `StyleSource::TailwindOrdered`), any ordered
//! logical edge that precedes an ordered physical edge in the same family is
//! projected to physical edges so CSS precedence survives Yoga.

use hozo_ir::{
    Color, Condition, Dimension, Edge, Environment, Length, StyleDeclaration, StyleProperty,
    StyleSource,
};
use std::collections::HashSet;

#[derive(Clone, Copy, PartialEq, Eq, Hash)]
pub(crate) enum InlineFamily {
    Padding,
    Margin,
    Inset,
    BorderWidth,
    BorderColor,
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum EdgeKind {
    Start,
    End,
    Both,
    Left,
    Right,
}

#[derive(Clone, Copy, PartialEq, Eq, Hash)]
pub(crate) enum PhysicalSide {
    Left,
    Right,
}

#[derive(Default)]
pub(crate) struct PreparedEdgeConflicts {
    /// Logical edge properties whose ordered declaration had a later ordered
    /// physical override in the same family and input without an intervening
    /// barrier.
    props: Vec<StyleProperty>,
}

impl PreparedEdgeConflicts {
    pub(crate) fn is_empty(&self) -> bool {
        self.props.is_empty()
    }

    pub(crate) fn contains(&self, prop: &StyleProperty) -> bool {
        self.props.contains(prop)
    }
}

pub(crate) fn classify_property(property: &StyleProperty) -> Option<(InlineFamily, EdgeKind)> {
    Some(match property {
        StyleProperty::PaddingInlineStart(_) => (InlineFamily::Padding, EdgeKind::Start),
        StyleProperty::PaddingInlineEnd(_) => (InlineFamily::Padding, EdgeKind::End),
        StyleProperty::PaddingLeft(_) => (InlineFamily::Padding, EdgeKind::Left),
        StyleProperty::PaddingRight(_) => (InlineFamily::Padding, EdgeKind::Right),
        StyleProperty::MarginInlineStart(_) => (InlineFamily::Margin, EdgeKind::Start),
        StyleProperty::MarginInlineEnd(_) => (InlineFamily::Margin, EdgeKind::End),
        StyleProperty::MarginLeft(_) => (InlineFamily::Margin, EdgeKind::Left),
        StyleProperty::MarginRight(_) => (InlineFamily::Margin, EdgeKind::Right),
        StyleProperty::InsetInlineStart(_) => (InlineFamily::Inset, EdgeKind::Start),
        StyleProperty::InsetInlineEnd(_) => (InlineFamily::Inset, EdgeKind::End),
        StyleProperty::InsetInline(_) => (InlineFamily::Inset, EdgeKind::Both),
        StyleProperty::InsetLeft(_) => (InlineFamily::Inset, EdgeKind::Left),
        StyleProperty::InsetRight(_) => (InlineFamily::Inset, EdgeKind::Right),
        StyleProperty::BorderLogicalWidth(Edge::InlineStart, _) => {
            (InlineFamily::BorderWidth, EdgeKind::Start)
        }
        StyleProperty::BorderLogicalWidth(Edge::InlineEnd, _) => {
            (InlineFamily::BorderWidth, EdgeKind::End)
        }
        StyleProperty::BorderLogicalWidth(Edge::Inline, _) => {
            (InlineFamily::BorderWidth, EdgeKind::Both)
        }
        StyleProperty::BorderLeftWidth(_) => (InlineFamily::BorderWidth, EdgeKind::Left),
        StyleProperty::BorderRightWidth(_) => (InlineFamily::BorderWidth, EdgeKind::Right),
        StyleProperty::BorderInlineStartColor(_) => (InlineFamily::BorderColor, EdgeKind::Start),
        StyleProperty::BorderInlineEndColor(_) => (InlineFamily::BorderColor, EdgeKind::End),
        StyleProperty::BorderInlineColor(_) => (InlineFamily::BorderColor, EdgeKind::Both),
        StyleProperty::BorderLeftColor(_) => (InlineFamily::BorderColor, EdgeKind::Left),
        StyleProperty::BorderRightColor(_) => (InlineFamily::BorderColor, EdgeKind::Right),
        _ => return None,
    })
}

fn to_physical_pair(property: &StyleProperty) -> Option<(StyleProperty, StyleProperty)> {
    Some(match property {
        StyleProperty::InsetInline(dim) => (
            StyleProperty::InsetLeft(dim.clone()),
            StyleProperty::InsetRight(dim.clone()),
        ),
        StyleProperty::BorderLogicalWidth(Edge::Inline, len) => (
            StyleProperty::BorderLeftWidth(len.clone()),
            StyleProperty::BorderRightWidth(len.clone()),
        ),
        StyleProperty::BorderInlineColor(color) => (
            StyleProperty::BorderLeftColor(color.clone()),
            StyleProperty::BorderRightColor(color.clone()),
        ),
        _ => return None,
    })
}

pub(crate) fn map_logical_edge(property: &StyleProperty, side: PhysicalSide) -> StyleProperty {
    let pick_length = |len: &Length| match side {
        PhysicalSide::Left => len.clone(),
        PhysicalSide::Right => len.clone(),
    };
    let pick_dim = |dim: &Dimension| dim.clone();
    let pick_color = |color: &Color| color.clone();
    match (property, side) {
        (
            StyleProperty::PaddingInlineStart(l) | StyleProperty::PaddingInlineEnd(l),
            PhysicalSide::Left,
        ) => StyleProperty::PaddingLeft(pick_length(l)),
        (
            StyleProperty::PaddingInlineStart(l) | StyleProperty::PaddingInlineEnd(l),
            PhysicalSide::Right,
        ) => StyleProperty::PaddingRight(pick_length(l)),
        (
            StyleProperty::MarginInlineStart(d) | StyleProperty::MarginInlineEnd(d),
            PhysicalSide::Left,
        ) => StyleProperty::MarginLeft(pick_dim(d)),
        (
            StyleProperty::MarginInlineStart(d) | StyleProperty::MarginInlineEnd(d),
            PhysicalSide::Right,
        ) => StyleProperty::MarginRight(pick_dim(d)),
        (
            StyleProperty::InsetInlineStart(d) | StyleProperty::InsetInlineEnd(d),
            PhysicalSide::Left,
        ) => StyleProperty::InsetLeft(pick_dim(d)),
        (
            StyleProperty::InsetInlineStart(d) | StyleProperty::InsetInlineEnd(d),
            PhysicalSide::Right,
        ) => StyleProperty::InsetRight(pick_dim(d)),
        (
            StyleProperty::BorderLogicalWidth(Edge::InlineStart | Edge::InlineEnd, l),
            PhysicalSide::Left,
        ) => StyleProperty::BorderLeftWidth(pick_length(l)),
        (
            StyleProperty::BorderLogicalWidth(Edge::InlineStart | Edge::InlineEnd, l),
            PhysicalSide::Right,
        ) => StyleProperty::BorderRightWidth(pick_length(l)),
        (
            StyleProperty::BorderInlineStartColor(c) | StyleProperty::BorderInlineEndColor(c),
            PhysicalSide::Left,
        ) => StyleProperty::BorderLeftColor(pick_color(c)),
        (
            StyleProperty::BorderInlineStartColor(c) | StyleProperty::BorderInlineEndColor(c),
            PhysicalSide::Right,
        ) => StyleProperty::BorderRightColor(pick_color(c)),
        _ => property.clone(),
    }
}

fn symmetric_start_end(a: &StyleDeclaration, b: &StyleDeclaration) -> bool {
    if a.source != b.source || a.condition != b.condition {
        return false;
    }
    match (&a.property, &b.property) {
        (StyleProperty::PaddingInlineStart(x), StyleProperty::PaddingInlineEnd(y))
        | (StyleProperty::PaddingInlineEnd(x), StyleProperty::PaddingInlineStart(y)) => x == y,
        (StyleProperty::MarginInlineStart(x), StyleProperty::MarginInlineEnd(y))
        | (StyleProperty::MarginInlineEnd(x), StyleProperty::MarginInlineStart(y)) => x == y,
        (StyleProperty::InsetInlineStart(x), StyleProperty::InsetInlineEnd(y))
        | (StyleProperty::InsetInlineEnd(x), StyleProperty::InsetInlineStart(y)) => x == y,
        (
            StyleProperty::BorderLogicalWidth(Edge::InlineStart, x),
            StyleProperty::BorderLogicalWidth(Edge::InlineEnd, y),
        )
        | (
            StyleProperty::BorderLogicalWidth(Edge::InlineEnd, x),
            StyleProperty::BorderLogicalWidth(Edge::InlineStart, y),
        ) => x == y,
        (StyleProperty::BorderInlineStartColor(x), StyleProperty::BorderInlineEndColor(y))
        | (StyleProperty::BorderInlineEndColor(x), StyleProperty::BorderInlineStartColor(y)) => {
            x == y
        }
        _ => false,
    }
}

fn physical_side_for(kind: EdgeKind, rtl: bool) -> PhysicalSide {
    match (kind, rtl) {
        (EdgeKind::Start, false) | (EdgeKind::End, true) => PhysicalSide::Left,
        (EdgeKind::Start, true) | (EdgeKind::End, false) => PhysicalSide::Right,
        (EdgeKind::Left, _) => PhysicalSide::Left,
        (EdgeKind::Right, _) => PhysicalSide::Right,
        (EdgeKind::Both, _) => PhysicalSide::Left,
    }
}

fn condition_direction(condition: &Condition) -> Option<Environment> {
    match condition {
        Condition::Environment(Environment::Ltr) => Some(Environment::Ltr),
        Condition::Environment(Environment::Rtl) => Some(Environment::Rtl),
        Condition::All(items) => {
            let mut found = None;
            for item in items {
                if let Some(dir) = condition_direction(item) {
                    if let Some(prev) = found {
                        if prev != dir {
                            return None;
                        }
                    } else {
                        found = Some(dir);
                    }
                }
            }
            found
        }
        _ => None,
    }
}

fn same_ordering_tier(a: &Condition, b: &Condition) -> bool {
    if a == b {
        return true;
    }
    matches!(
        (a, b),
        (
            Condition::Hover | Condition::Pressed | Condition::Focus | Condition::FocusVisible,
            Condition::Hover | Condition::Pressed | Condition::Focus | Condition::FocusVisible,
        )
    )
}

fn has_later_ordered_physical(
    declarations: &[StyleDeclaration],
    start: usize,
    family: InlineFamily,
) -> bool {
    let StyleSource::TailwindOrdered { input, .. } = declarations[start].source else {
        return false;
    };
    let start_input = declarations[start].source.input();
    let start_cond = &declarations[start].condition;
    declarations
        .iter()
        .enumerate()
        .skip(start + 1)
        .any(|(j, later)| {
            let StyleSource::TailwindOrdered {
                input: later_input, ..
            } = later.source
            else {
                return false;
            };
            if later_input != input {
                return false;
            }
            let Some((later_family, later_kind)) = classify_property(&later.property) else {
                return false;
            };
            if later_family != family || !matches!(later_kind, EdgeKind::Left | EdgeKind::Right) {
                return false;
            }
            // Do not bridge an unassessed barrier in the same ordering tier.
            !(start + 1..j).any(|mid| {
                let mid_decl = &declarations[mid];
                mid_decl.source.input() == start_input
                    && !matches!(mid_decl.source, StyleSource::TailwindOrdered { .. })
                    && (same_ordering_tier(&mid_decl.condition, start_cond)
                        || same_ordering_tier(&mid_decl.condition, &later.condition))
            })
        })
}

/// Projects ordered inline logical edges (`px-*`, `ps-*`, `pe-*`, and the
/// margin/inset/border counterparts) when an ordered physical edge follows in
/// the same input. Symmetric shorthands and already-directional conditions are
/// lowered immediately; direction-neutral asymmetric writes record their family
/// so `build_style_entries` splits LTR/RTL edges without perturbing IR groups.
pub(crate) fn prepare_declarations(
    declarations: &[StyleDeclaration],
) -> (Vec<StyleDeclaration>, PreparedEdgeConflicts) {
    let mut out = Vec::with_capacity(declarations.len());
    let mut conflicts = PreparedEdgeConflicts::default();
    let mut i = 0;
    while i < declarations.len() {
        let decl = &declarations[i];
        let Some((family, kind)) = classify_property(&decl.property) else {
            out.push(decl.clone());
            i += 1;
            continue;
        };
        if matches!(kind, EdgeKind::Both) && has_later_ordered_physical(declarations, i, family) {
            if let Some((left, right)) = to_physical_pair(&decl.property) {
                out.push(StyleDeclaration {
                    source: decl.source,
                    property: left,
                    condition: decl.condition.clone(),
                });
                out.push(StyleDeclaration {
                    source: decl.source,
                    property: right,
                    condition: decl.condition.clone(),
                });
                i += 1;
                continue;
            }
        }
        if matches!(kind, EdgeKind::Start | EdgeKind::End)
            && i + 1 < declarations.len()
            && symmetric_start_end(decl, &declarations[i + 1])
            && (has_later_ordered_physical(declarations, i, family)
                || has_later_ordered_physical(declarations, i + 1, family))
        {
            out.push(StyleDeclaration {
                source: decl.source,
                property: map_logical_edge(&decl.property, PhysicalSide::Left),
                condition: decl.condition.clone(),
            });
            out.push(StyleDeclaration {
                source: decl.source,
                property: map_logical_edge(&declarations[i + 1].property, PhysicalSide::Right),
                condition: decl.condition.clone(),
            });
            i += 2;
            continue;
        }
        if matches!(kind, EdgeKind::Start | EdgeKind::End)
            && has_later_ordered_physical(declarations, i, family)
        {
            if let Some(dir) = condition_direction(&decl.condition) {
                let side = physical_side_for(kind, dir == Environment::Rtl);
                out.push(StyleDeclaration {
                    source: decl.source,
                    property: map_logical_edge(&decl.property, side),
                    condition: decl.condition.clone(),
                });
                i += 1;
                continue;
            }
            conflicts.props.push(decl.property.clone());
        }
        out.push(decl.clone());
        i += 1;
    }
    (out, conflicts)
}

fn has_later_physical_in_groups_or_props(
    groups: &[(Condition, Vec<StyleProperty>)],
    group_index: usize,
    prop_index: usize,
    family: InlineFamily,
) -> bool {
    let in_rest_of_group = groups[group_index].1[prop_index + 1..].iter().any(|later| {
        matches!(
            classify_property(later),
            Some((f, EdgeKind::Left | EdgeKind::Right)) if f == family
        )
    });
    if in_rest_of_group {
        return true;
    }
    groups[group_index + 1..].iter().any(|(_, later_props)| {
        later_props.iter().any(|later| {
            matches!(
                classify_property(later),
                Some((f, EdgeKind::Left | EdgeKind::Right)) if f == family
            )
        })
    })
}

fn project_props_for_direction(
    groups: &[(Condition, Vec<StyleProperty>)],
    group_index: usize,
    conflicts: &PreparedEdgeConflicts,
    rtl: bool,
) -> Vec<StyleProperty> {
    let props = &groups[group_index].1;
    let mapped = props
        .iter()
        .enumerate()
        .map(|(prop_idx, prop)| match classify_property(prop) {
            Some((family, kind @ (EdgeKind::Start | EdgeKind::End)))
                if conflicts.contains(prop)
                    && has_later_physical_in_groups_or_props(
                        groups,
                        group_index,
                        prop_idx,
                        family,
                    ) =>
            {
                map_logical_edge(prop, physical_side_for(kind, rtl))
            }
            _ => prop.clone(),
        })
        .collect();
    hozo_ir::dedupe_last_wins(mapped)
}

pub(crate) fn conjoin_direction(condition: &Condition, dir: Environment) -> Condition {
    match condition {
        Condition::Always => Condition::Environment(dir),
        other => Condition::all(vec![other.clone(), Condition::Environment(dir)]),
    }
}

/// Expands a group containing unresolved asymmetric logical edges into
/// `(condition, props, is_resting_direction)` tuples: properties shared across
/// LTR and RTL stay under `condition`, while direction-specific deltas are
/// emitted under `Ltr` / `Rtl` within the same tier.
pub(crate) fn expand_group(
    groups: &[(Condition, Vec<StyleProperty>)],
    group_index: usize,
    conflicts: &PreparedEdgeConflicts,
) -> Vec<(Condition, Vec<StyleProperty>, bool)> {
    let (condition, props) = &groups[group_index];
    if conflicts.is_empty() || !props.iter().enumerate().any(|(prop_idx, prop)| {
        matches!(
            classify_property(prop),
            Some((family, EdgeKind::Start | EdgeKind::End))
                if conflicts.contains(prop)
                    && has_later_physical_in_groups_or_props(groups, group_index, prop_idx, family)
        )
    }) {
        return vec![(condition.clone(), props.clone(), false)];
    }

    let mut ltr = project_props_for_direction(groups, group_index, conflicts, false);
    let mut rtl = project_props_for_direction(groups, group_index, conflicts, true);

    // If an `Always` group has a later `Always` group overriding Left or Right,
    // drop that shadowed physical side so we do not emit dead direction guards.
    if *condition == Condition::Always {
        let mut later_sides = HashSet::new();
        for (later_cond, later_props) in &groups[group_index + 1..] {
            if *later_cond != Condition::Always {
                continue;
            }
            for prop in later_props {
                if let Some((family, kind)) = classify_property(prop) {
                    match kind {
                        EdgeKind::Left => {
                            later_sides.insert((family, PhysicalSide::Left));
                        }
                        EdgeKind::Right => {
                            later_sides.insert((family, PhysicalSide::Right));
                        }
                        _ => {}
                    }
                }
            }
        }
        if !later_sides.is_empty() {
            let retain_unshadowed = |list: &mut Vec<StyleProperty>| {
                list.retain(|prop| match classify_property(prop) {
                    Some((family, EdgeKind::Left))
                        if later_sides.contains(&(family, PhysicalSide::Left)) =>
                    {
                        false
                    }
                    Some((family, EdgeKind::Right))
                        if later_sides.contains(&(family, PhysicalSide::Right)) =>
                    {
                        false
                    }
                    _ => true,
                });
            };
            retain_unshadowed(&mut ltr);
            retain_unshadowed(&mut rtl);
        }
    }

    let common: Vec<StyleProperty> = ltr
        .iter()
        .filter(|prop| rtl.contains(prop))
        .cloned()
        .collect();
    let ltr_only: Vec<StyleProperty> = ltr
        .into_iter()
        .filter(|prop| !common.contains(prop))
        .collect();
    let rtl_only: Vec<StyleProperty> = rtl
        .into_iter()
        .filter(|prop| !common.contains(prop))
        .collect();

    let is_resting_dir = matches!(condition, Condition::Always | Condition::Expr(_));
    let mut result = Vec::new();
    if !common.is_empty() {
        result.push((condition.clone(), common, false));
    }
    if !ltr_only.is_empty() {
        result.push((
            conjoin_direction(condition, Environment::Ltr),
            ltr_only,
            is_resting_dir,
        ));
    }
    if !rtl_only.is_empty() {
        result.push((
            conjoin_direction(condition, Environment::Rtl),
            rtl_only,
            is_resting_dir,
        ));
    }
    result
}

#[cfg(test)]
mod tests {
    use hozo_ir::Theme;

    fn compile_ordered(source: &str) -> crate::LowerOutput {
        let mut parsed = hozo_parser::parse_tsx(source);
        hozo_parser::order_module_tailwind_builtin(&mut parsed);
        crate::lower(&parsed.roots[0].node, source, &Theme::default())
    }

    fn compile_passthrough(source: &str) -> crate::LowerOutput {
        let parsed = hozo_parser::parse_tsx(source);
        crate::lower(&parsed.roots[0].node, source, &Theme::default())
    }

    #[test]
    fn symmetric_px_before_pl_projects_to_physical_without_hooks_in_either_order() {
        for classes in ["px-8 pl-1", "pl-1 px-8"] {
            let source = format!(
                "import {{ View }} from '@hozo/core'\nconst el = <View className=\"{classes}\" />\n"
            );
            let out = compile_ordered(&source);
            assert!(out.prelude.is_empty(), "{classes}: {:?}", out.prelude);
            assert!(
                !out.styles.contains("paddingStart"),
                "{classes}: {}",
                out.styles
            );
            assert!(
                !out.styles.contains("paddingEnd"),
                "{classes}: {}",
                out.styles
            );
            assert!(
                out.styles.contains("paddingRight: 32"),
                "{classes}: {}",
                out.styles
            );
            assert!(
                out.styles.contains("paddingLeft: 4"),
                "{classes}: {}",
                out.styles
            );
        }
    }

    #[test]
    fn asymmetric_ps_and_pe_preserve_rtl_mirrored_overrides() {
        for classes in ["ps-8 pl-1", "pl-1 ps-8"] {
            let source = format!(
                "import {{ View }} from '@hozo/core'\nconst el = <View className=\"{classes}\" />\n"
            );
            let out = compile_ordered(&source);
            assert!(
                out.prelude
                    .iter()
                    .any(|line| line.contains("useHozoEnvironment('rtl')")),
                "{classes}: {:?}",
                out.prelude
            );
            assert!(!out.jsx.contains("__hozoEnv_ltr"), "{classes}: {}", out.jsx);
            assert!(out.jsx.contains("__hozoEnv_rtl"), "{classes}: {}", out.jsx);
            assert!(
                out.styles.contains("paddingLeft: 4"),
                "{classes}: {}",
                out.styles
            );
            assert!(
                out.styles.contains("paddingRight: 32"),
                "{classes}: {}",
                out.styles
            );
        }
        for classes in ["pe-8 pl-1", "pl-1 pe-8"] {
            let source = format!(
                "import {{ View }} from '@hozo/core'\nconst el = <View className=\"{classes}\" />\n"
            );
            let out = compile_ordered(&source);
            assert!(out.jsx.contains("__hozoEnv_ltr"), "{classes}: {}", out.jsx);
            assert!(!out.jsx.contains("__hozoEnv_rtl"), "{classes}: {}", out.jsx);
            assert!(
                out.styles.contains("paddingLeft: 4"),
                "{classes}: {}",
                out.styles
            );
            assert!(
                out.styles.contains("paddingRight: 32"),
                "{classes}: {}",
                out.styles
            );
        }
    }

    #[test]
    fn stronger_logical_variant_stays_logical_and_beats_physical() {
        for classes in ["hover:ps-8 pl-1", "pl-1 hover:ps-8"] {
            let source = format!(
                "import {{ Pressable }} from '@hozo/core'\nconst el = <Pressable className=\"{classes}\" />\n"
            );
            let out = compile_ordered(&source);
            assert!(out.prelude.is_empty(), "{classes}: {:?}", out.prelude);
            assert!(
                out.styles.contains("paddingLeft: 4"),
                "{classes}: {}",
                out.styles
            );
            assert!(
                out.styles.contains("paddingStart: 32"),
                "{classes}: {}",
                out.styles
            );
        }
    }

    #[test]
    fn weaker_ps_before_hover_pl_keeps_resting_order_in_base_parts() {
        let source = "import { Pressable } from '@hozo/core'\nconst el = <Pressable className=\"ps-8 hover:pl-1\" />\n";
        let out = compile_ordered(source);
        let ltr = out.jsx.find("__hozoEnv_ltr").unwrap();
        let rtl = out.jsx.find("__hozoEnv_rtl").unwrap();
        let hover = out.jsx.find("hovered &&").unwrap();
        assert!(ltr < hover && rtl < hover, "{}", out.jsx);
        assert!(out.styles.contains("paddingLeft: 32"), "{}", out.styles);
        assert!(out.styles.contains("paddingRight: 32"), "{}", out.styles);
        assert!(out.styles.contains("paddingLeft: 4"), "{}", out.styles);
    }

    #[test]
    fn other_inline_families_and_authored_style_survive_and_passthrough_stays_untouched() {
        for (classes, expected_a, expected_b) in [
            ("mx-8 ml-1", "marginRight: 32", "marginLeft: 4"),
            ("inset-x-4 left-1", "right: 16", "left: 4"),
            (
                "border-x-4 border-l-2",
                "borderRightWidth: 4",
                "borderLeftWidth: 2",
            ),
            (
                "border-x-blue-500 border-l-red-500",
                "borderRightColor: '#2b7fff'",
                "borderLeftColor: '#fb2c36'",
            ),
        ] {
            let source = format!(
                "import {{ View }} from '@hozo/core'\nconst el = <View className=\"{classes}\" />\n"
            );
            let out = compile_ordered(&source);
            assert!(out.styles.contains(expected_a), "{classes}: {}", out.styles);
            assert!(out.styles.contains(expected_b), "{classes}: {}", out.styles);
            assert!(!out.styles.contains("Start"), "{classes}: {}", out.styles);
            assert!(!out.styles.contains("start:"), "{classes}: {}", out.styles);
        }

        // Authored style override remains last alongside projected physical edges.
        let authored = compile_ordered(
            "import { View } from '@hozo/core'\nconst el = <View className=\"px-8 pl-1\" style={{ paddingRight: 99 }} />\n",
        );
        assert!(
            !authored.styles.contains("paddingEnd"),
            "{}",
            authored.styles
        );
        assert!(
            authored.jsx.contains("{ paddingRight: 99 }"),
            "{}",
            authored.jsx
        );

        // Unassessed passthrough stays untouched (keeps logical paddingStart/End).
        let passthrough = compile_passthrough(
            "import { View } from '@hozo/core'\nconst el = <View className=\"px-8 pl-1\" />\n",
        );
        assert!(
            passthrough.styles.contains("paddingStart: 32"),
            "{}",
            passthrough.styles
        );
        assert!(
            passthrough.styles.contains("paddingLeft: 4"),
            "{}",
            passthrough.styles
        );
    }
}
