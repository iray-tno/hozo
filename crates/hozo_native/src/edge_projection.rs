//! Native logical-vs-physical inline edge projection (#2018).
//!
//! Tailwind settles `px-8 pl-1` by cascade order: the later physical
//! `padding-left` beats the earlier logical `padding-inline-start`. React
//! Native does not use order for this. Without `swapLeftAndRightInRTL`, Yoga
//! lets `paddingStart` beat `paddingLeft` whatever the order; with it -- the
//! default on both Android and iOS -- an RTL layout first rewrites `Left` to
//! `Start` and `Right` to `End`, so the physical write wins whatever the
//! order and lands on the opposite side.
//!
//! Only `Start`/`End` mean the same thing under both settings. So when an
//! element writes one inline family both ways, its physical writes are
//! rewritten as logical ones for the current direction (`Left` is `Start` in
//! LTR and `End` in RTL). Everything in the family is then logical, and the
//! order the plan already settled decides, as it does on the Web.
//!
//! The swap also moves a physical utility on its own: `pl-4` lands on the
//! right in RTL, where Tailwind keeps it on the left (#2050). Hozo follows
//! Tailwind, so a family is rewritten too when one utility writes its two
//! physical sides differently, or only one of them. A utility that writes
//! both sides alike (`p-4`) looks the same under the swap and stays
//! physical, unless something else already rewrites its family.

use hozo_ir::{Condition, Edge, Environment, StyleDeclaration, StyleProperty};

#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum InlineFamily {
    Padding,
    Margin,
    Inset,
    BorderWidth,
    BorderColor,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum EdgeKind {
    Logical,
    Physical,
}

#[derive(Default)]
pub(crate) struct PreparedEdgeConflicts {
    /// Physical edge properties, without a direction of their own, that share
    /// an element with a logical write of the same family. Each needs an LTR
    /// and an RTL form.
    props: Vec<StyleProperty>,
}

impl PreparedEdgeConflicts {
    pub(crate) fn is_empty(&self) -> bool {
        self.props.is_empty()
    }

    fn contains(&self, prop: &StyleProperty) -> bool {
        self.props.contains(prop)
    }
}

fn classify_property(property: &StyleProperty) -> Option<(InlineFamily, EdgeKind)> {
    use EdgeKind::{Logical, Physical};
    Some(match property {
        StyleProperty::PaddingInlineStart(_) | StyleProperty::PaddingInlineEnd(_) => {
            (InlineFamily::Padding, Logical)
        }
        StyleProperty::PaddingLeft(_) | StyleProperty::PaddingRight(_) => {
            (InlineFamily::Padding, Physical)
        }
        StyleProperty::MarginInlineStart(_) | StyleProperty::MarginInlineEnd(_) => {
            (InlineFamily::Margin, Logical)
        }
        StyleProperty::MarginLeft(_) | StyleProperty::MarginRight(_) => {
            (InlineFamily::Margin, Physical)
        }
        StyleProperty::InsetInlineStart(_)
        | StyleProperty::InsetInlineEnd(_)
        | StyleProperty::InsetInline(_) => (InlineFamily::Inset, Logical),
        StyleProperty::InsetLeft(_) | StyleProperty::InsetRight(_) => {
            (InlineFamily::Inset, Physical)
        }
        StyleProperty::BorderLogicalWidth(
            Edge::InlineStart | Edge::InlineEnd | Edge::Inline,
            _,
        ) => (InlineFamily::BorderWidth, Logical),
        StyleProperty::BorderLeftWidth(_) | StyleProperty::BorderRightWidth(_) => {
            (InlineFamily::BorderWidth, Physical)
        }
        StyleProperty::BorderInlineStartColor(_)
        | StyleProperty::BorderInlineEndColor(_)
        | StyleProperty::BorderInlineColor(_) => (InlineFamily::BorderColor, Logical),
        StyleProperty::BorderLeftColor(_) | StyleProperty::BorderRightColor(_) => {
            (InlineFamily::BorderColor, Physical)
        }
        _ => return None,
    })
}

/// The logical property that writes the same physical side in this direction:
/// `Left` is the inline start in LTR and the inline end in RTL. Anything that
/// is not a physical inline edge is returned unchanged.
fn to_logical(property: &StyleProperty, rtl: bool) -> StyleProperty {
    use StyleProperty as P;
    let is_left = matches!(
        property,
        P::PaddingLeft(_)
            | P::MarginLeft(_)
            | P::InsetLeft(_)
            | P::BorderLeftWidth(_)
            | P::BorderLeftColor(_)
    );
    let start = is_left != rtl;
    match property {
        P::PaddingLeft(l) | P::PaddingRight(l) if start => P::PaddingInlineStart(l.clone()),
        P::PaddingLeft(l) | P::PaddingRight(l) => P::PaddingInlineEnd(l.clone()),
        P::MarginLeft(d) | P::MarginRight(d) if start => P::MarginInlineStart(d.clone()),
        P::MarginLeft(d) | P::MarginRight(d) => P::MarginInlineEnd(d.clone()),
        P::InsetLeft(d) | P::InsetRight(d) if start => P::InsetInlineStart(d.clone()),
        P::InsetLeft(d) | P::InsetRight(d) => P::InsetInlineEnd(d.clone()),
        P::BorderLeftWidth(l) | P::BorderRightWidth(l) => {
            let edge = if start {
                Edge::InlineStart
            } else {
                Edge::InlineEnd
            };
            P::BorderLogicalWidth(edge, l.clone())
        }
        P::BorderLeftColor(c) | P::BorderRightColor(c) if start => {
            P::BorderInlineStartColor(c.clone())
        }
        P::BorderLeftColor(c) | P::BorderRightColor(c) => P::BorderInlineEndColor(c.clone()),
        other => other.clone(),
    }
}

/// The direction a condition already fixes, if it names exactly one.
fn condition_direction(condition: &Condition) -> Option<Environment> {
    match condition {
        Condition::Environment(dir @ (Environment::Ltr | Environment::Rtl)) => Some(*dir),
        Condition::All(items) => {
            let mut found = None;
            for dir in items.iter().filter_map(condition_direction) {
                if found.is_some_and(|seen| seen != dir) {
                    return None;
                }
                found = Some(dir);
            }
            found
        }
        _ => None,
    }
}

/// Rewrites the physical inline edges of a family that this element also
/// writes logically. A write whose condition already names a direction
/// (`rtl:pl-1`) is rewritten here; the others are recorded, so
/// `expand_group` can give them an LTR and an RTL form once the declarations
/// are grouped.
///
/// A family is rewritten if any declaration on the element writes it
/// logically, or one utility writes its physical sides unevenly, in any input
/// or state: Yoga resolves the element's final style, not one class string.
/// An element that writes a family only logically, or only with even physical
/// sides, is returned unchanged.
pub(crate) fn prepare_declarations(
    declarations: &[StyleDeclaration],
) -> (Vec<StyleDeclaration>, PreparedEdgeConflicts) {
    let mut conflicts = PreparedEdgeConflicts::default();
    let mut logical: Vec<InlineFamily> = declarations
        .iter()
        .filter_map(|decl| match classify_property(&decl.property) {
            Some((family, EdgeKind::Logical)) => Some(family),
            _ => None,
        })
        .collect();
    logical.extend(uneven_physical(declarations));
    if logical.is_empty() {
        return (declarations.to_vec(), conflicts);
    }
    let out = declarations
        .iter()
        .map(|decl| {
            let Some((family, EdgeKind::Physical)) = classify_property(&decl.property) else {
                return decl.clone();
            };
            if !logical.contains(&family) {
                return decl.clone();
            }
            match condition_direction(&decl.condition) {
                Some(dir) => StyleDeclaration {
                    source: decl.source,
                    property: to_logical(&decl.property, dir == Environment::Rtl),
                    condition: decl.condition.clone(),
                },
                None => {
                    if !conflicts.contains(&decl.property) {
                        conflicts.props.push(decl.property.clone());
                    }
                    decl.clone()
                }
            }
        })
        .collect();
    (out, conflicts)
}

/// Families in which one utility, under one condition, writes the left and
/// right sides differently or writes only one of them. The swap would move
/// such a write to the other side in RTL.
fn uneven_physical(declarations: &[StyleDeclaration]) -> Vec<InlineFamily> {
    use StyleProperty as P;
    // (source, condition, family) -> (left, right) values, last write wins.
    let mut sides: Vec<(_, &Condition, InlineFamily, Option<P>, Option<P>)> = Vec::new();
    for decl in declarations {
        let Some((family, EdgeKind::Physical)) = classify_property(&decl.property) else {
            continue;
        };
        let is_left = matches!(
            decl.property,
            P::PaddingLeft(_)
                | P::MarginLeft(_)
                | P::InsetLeft(_)
                | P::BorderLeftWidth(_)
                | P::BorderLeftColor(_)
        );
        // Compare values, not keys: the right side's value written as if
        // it were the left one.
        let value = to_logical(&decl.property, false);
        let index = match sides.iter().position(|(source, condition, seen, ..)| {
            *source == decl.source && **condition == decl.condition && *seen == family
        }) {
            Some(index) => index,
            None => {
                sides.push((decl.source, &decl.condition, family, None, None));
                sides.len() - 1
            }
        };
        let slot = if is_left {
            &mut sides[index].3
        } else {
            &mut sides[index].4
        };
        *slot = Some(value);
    }
    let mut uneven = Vec::new();
    for (_, _, family, left, right) in sides {
        let even = match (left, right) {
            (Some(left), Some(right)) => same_value(&left, &right),
            _ => false,
        };
        if !even && !uneven.contains(&family) {
            uneven.push(family);
        }
    }
    uneven
}

/// Whether two logical writes (one per side) carry the same value.
fn same_value(start: &StyleProperty, end: &StyleProperty) -> bool {
    use StyleProperty as P;
    match (start, end) {
        (P::PaddingInlineStart(a), P::PaddingInlineEnd(b)) => a == b,
        (P::MarginInlineStart(a), P::MarginInlineEnd(b)) => a == b,
        (P::InsetInlineStart(a), P::InsetInlineEnd(b)) => a == b,
        (P::BorderLogicalWidth(_, a), P::BorderLogicalWidth(_, b)) => a == b,
        (P::BorderInlineStartColor(a), P::BorderInlineEndColor(b)) => a == b,
        _ => false,
    }
}

pub(crate) fn conjoin_direction(condition: &Condition, dir: Environment) -> Condition {
    match condition {
        Condition::Always => Condition::Environment(dir),
        other => Condition::all(vec![other.clone(), Condition::Environment(dir)]),
    }
}

/// Splits a group that holds a recorded physical edge into
/// `(condition, props, is_resting_direction)`: what both directions share
/// stays under `condition`, and each direction's logical form of the
/// physical edges follows under `Ltr` / `Rtl` in the same tier. The order
/// inside a group no longer matters once each list has one value per key,
/// so a split keeps the group's place among the others.
pub(crate) fn expand_group(
    condition: &Condition,
    props: &[StyleProperty],
    conflicts: &PreparedEdgeConflicts,
) -> Vec<(Condition, Vec<StyleProperty>, bool)> {
    if !props.iter().any(|prop| conflicts.contains(prop)) {
        return vec![(condition.clone(), props.to_vec(), false)];
    }
    let project = |rtl: bool| {
        hozo_ir::dedupe_last_wins(
            props
                .iter()
                .map(|prop| {
                    if conflicts.contains(prop) {
                        to_logical(prop, rtl)
                    } else {
                        prop.clone()
                    }
                })
                .collect(),
        )
    };
    let ltr = project(false);
    let rtl = project(true);
    let common: Vec<StyleProperty> = ltr.iter().filter(|p| rtl.contains(p)).cloned().collect();
    let only = |list: Vec<StyleProperty>| -> Vec<StyleProperty> {
        list.into_iter().filter(|p| !common.contains(p)).collect()
    };
    let (ltr_only, rtl_only) = (only(ltr), only(rtl));

    let is_resting_dir = matches!(condition, Condition::Always | Condition::Expr(_));
    let mut result = Vec::new();
    if !common.is_empty() {
        result.push((condition.clone(), common, false));
    }
    for (dir, list) in [(Environment::Ltr, ltr_only), (Environment::Rtl, rtl_only)] {
        if !list.is_empty() {
            result.push((conjoin_direction(condition, dir), list, is_resting_dir));
        }
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

    fn view(classes: &str) -> String {
        format!(
            "import {{ View }} from '@hozo/core'\nconst el = <View className=\"{classes}\" />\n"
        )
    }

    #[test]
    fn a_physical_edge_beside_a_logical_one_becomes_logical_for_each_direction() {
        for classes in ["px-8 pl-1", "pl-1 px-8", "ps-8 pl-1", "pe-8 pl-1"] {
            let out = compile_ordered(&view(classes));
            // `Left` would lose to `Start` without the RTL swap, and move to
            // the other side with it. Neither may reach React Native.
            assert!(
                !out.styles.contains("paddingLeft"),
                "{classes}: {}",
                out.styles
            );
            assert!(
                !out.styles.contains("paddingRight"),
                "{classes}: {}",
                out.styles
            );
            assert!(out.jsx.contains("__hozoEnv_ltr"), "{classes}: {}", out.jsx);
            assert!(out.jsx.contains("__hozoEnv_rtl"), "{classes}: {}", out.jsx);
            assert!(
                out.styles.contains("paddingStart: 4"),
                "{classes}: {}",
                out.styles
            );
            assert!(
                out.styles.contains("paddingEnd: 4"),
                "{classes}: {}",
                out.styles
            );
        }
    }

    #[test]
    fn a_physical_edge_with_its_own_direction_needs_no_runtime_branch() {
        let out = compile_ordered(&view("px-8 rtl:pl-1"));
        assert!(!out.styles.contains("paddingLeft"), "{}", out.styles);
        assert!(out.styles.contains("paddingEnd: 4"), "{}", out.styles);
        assert!(!out.jsx.contains("__hozoEnv_ltr"), "{}", out.jsx);
    }

    #[test]
    fn an_uneven_physical_utility_alone_keeps_its_side_in_both_directions() {
        // #2050: the swap would move `pl-1` to the right in RTL; Tailwind
        // keeps it on the left. Margin being logical does not matter.
        for classes in ["pl-1", "pl-1 pr-2", "pl-1 ms-2", "p-4 pl-1"] {
            let out = compile_ordered(&view(classes));
            assert!(
                !out.styles.contains("paddingLeft"),
                "{classes}: {}",
                out.styles
            );
            assert!(out.jsx.contains("__hozoEnv_ltr"), "{classes}: {}", out.jsx);
            assert!(out.jsx.contains("__hozoEnv_rtl"), "{classes}: {}", out.jsx);
        }
    }

    #[test]
    fn even_physical_sides_or_logical_only_writes_are_left_alone() {
        // The swap moves both sides of `p-4` alike, so nothing changes.
        for classes in ["p-4", "px-8", "m-2 p-1", "border-2"] {
            let out = compile_ordered(&view(classes));
            assert!(!out.jsx.contains("__hozoEnv_"), "{classes}: {}", out.jsx);
        }
        let out = compile_ordered(&view("p-4"));
        assert!(out.styles.contains("paddingLeft: 16"), "{}", out.styles);
    }

    #[test]
    fn a_stronger_logical_state_still_follows_the_projected_resting_edge() {
        let source = "import { Pressable } from '@hozo/core'\nconst el = <Pressable className=\"pl-1 hover:ps-8\" />\n";
        let out = compile_ordered(source);
        let ltr = out.jsx.find("__hozoEnv_ltr").unwrap();
        let hover = out.jsx.find("hovered &&").unwrap();
        assert!(ltr < hover, "{}", out.jsx);
        assert!(out.styles.contains("paddingStart: 32"), "{}", out.styles);
    }

    #[test]
    fn every_inline_family_is_projected() {
        for (classes, physical) in [
            ("mx-8 ml-1", "marginLeft"),
            ("inset-x-4 left-1", "left:"),
            ("border-x-4 border-l-2", "borderLeftWidth"),
            ("border-x-blue-500 border-l-red-500", "borderLeftColor"),
        ] {
            let out = compile_ordered(&view(classes));
            assert!(!out.styles.contains(physical), "{classes}: {}", out.styles);
            assert!(out.jsx.contains("__hozoEnv_rtl"), "{classes}: {}", out.jsx);
        }
    }
}
