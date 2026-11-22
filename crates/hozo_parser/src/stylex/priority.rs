//! StyleX's property priority, which orders shorthands before longhands.

use std::collections::{HashMap, HashSet};

use hozo_ir::{Condition, Keyframes, StyleDeclaration, StyleProperty};
use oxc_ast::ast::{ArrayExpressionElement, Expression};

use super::overlap::directional_overlap_one_way;
use super::static_value::first_that_works_call;
use super::{Entry, ResolvedEntry};

/// The aliases StyleX's default `property-specificity` mode normalizes before
/// it gives a declaration a property key. Exact-key last-wins must therefore
/// see `paddingBlockStart` and `paddingTop` as the same namespace too.
pub(super) fn canonical_property(property: &str) -> &str {
    match property {
        "borderBlockStartColor" => "borderTopColor",
        "borderBlockEndColor" => "borderBottomColor",
        "borderBlockStartStyle" => "borderTopStyle",
        "borderBlockEndStyle" => "borderBottomStyle",
        "borderBlockStartWidth" => "borderTopWidth",
        "borderBlockEndWidth" => "borderBottomWidth",
        "insetBlockStart" => "top",
        "insetBlockEnd" => "bottom",
        "marginBlockStart" => "marginTop",
        "marginBlockEnd" => "marginBottom",
        "paddingBlockStart" => "paddingTop",
        "paddingBlockEnd" => "paddingBottom",
        "scrollMarginBlockStart" => "scrollMarginTop",
        "scrollMarginBlockEnd" => "scrollMarginBottom",
        "gridGap" => "gap",
        "gridRowGap" => "rowGap",
        "gridColumnGap" => "columnGap",
        "start" => "insetInlineStart",
        "end" => "insetInlineEnd",
        _ => property,
    }
}

/// StyleX 0.19's published property-priority table has four CSS tiers. The
/// frontend expands the supported shorthands into final typed slots, but keeps
/// this rank so a longhand still wins independently of `props()` argument
/// order on both backends.
pub(super) fn property_priority(property: &str) -> u16 {
    let property = canonical_property(property);
    if matches!(
        property,
        "padding"
            | "margin"
            | "inset"
            | "scrollMargin"
            | "scrollPadding"
            | "grid"
            | "gridArea"
            | "gridTemplate"
            | "font"
    ) {
        return 1000;
    }
    if matches!(
        property,
        "borderColor"
            | "borderStyle"
            | "borderWidth"
            | "borderRadius"
            | "borderBlockStyle"
            | "borderBlockWidth"
            | "borderInlineColor"
            | "borderInlineStyle"
            | "borderInlineWidth"
            | "borderImage"
            | "columnRule"
            | "columns"
            | "flex"
            | "flexFlow"
            | "fontVariant"
            | "gap"
            | "gridColumn"
            | "gridRow"
            | "gridTemplateAreas"
            | "container"
            | "insetBlock"
            | "insetInline"
            | "marginBlock"
            | "marginInline"
            | "listStyle"
            | "transition"
            | "animationRange"
            | "scrollTimeline"
            | "viewTimeline"
            | "caret"
            | "mask"
            | "maskBorder"
            | "offset"
            | "outline"
            | "textDecoration"
            | "textEmphasis"
            | "overflow"
            | "placeContent"
            | "placeItems"
            | "paddingBlock"
            | "paddingInline"
            | "scrollMarginBlock"
            | "scrollMarginInline"
            | "scrollPaddingBlock"
            | "scrollPaddingInline"
            | "cornerShape"
    ) {
        return 2000;
    }
    if matches!(
        property,
        "borderTopColor"
            | "borderRightColor"
            | "borderBottomColor"
            | "borderLeftColor"
            | "borderTopWidth"
            | "borderRightWidth"
            | "borderBottomWidth"
            | "borderLeftWidth"
            | "borderTopStyle"
            | "borderRightStyle"
            | "borderBottomStyle"
            | "cornerTopLeftShape"
            | "cornerTopRightShape"
            | "cornerBottomLeftShape"
            | "cornerBottomRightShape"
            | "borderLeftStyle"
            | "borderInlineStartColor"
            | "borderInlineEndColor"
            | "borderInlineStartStyle"
            | "borderInlineEndStyle"
            | "borderInlineStartWidth"
            | "borderInlineEndWidth"
            | "borderTopLeftRadius"
            | "borderTopRightRadius"
            | "borderBottomRightRadius"
            | "borderBottomLeftRadius"
            | "bottom"
            | "height"
            | "left"
            | "marginTop"
            | "marginRight"
            | "marginBottom"
            | "marginLeft"
            | "maxHeight"
            | "maxWidth"
            | "minHeight"
            | "minWidth"
            | "paddingTop"
            | "paddingRight"
            | "paddingBottom"
            | "paddingLeft"
            | "scrollMarginTop"
            | "scrollMarginRight"
            | "scrollMarginBottom"
            | "scrollMarginLeft"
            | "scrollPaddingTop"
            | "scrollPaddingRight"
            | "scrollPaddingBottom"
            | "scrollPaddingLeft"
            | "right"
            | "top"
            | "width"
    ) {
        return 4000;
    }
    3000
}

pub(super) fn needs_platform_priority(left: &Entry, right: &ResolvedEntry) -> bool {
    let grid_overlap = (left.css_name == "gridColumn" && right.css_name.starts_with("gridColumn"))
        || (right.css_name == "gridColumn" && left.css_name.starts_with("gridColumn"))
        || (left.css_name == "gridRow" && right.css_name.starts_with("gridRow"))
        || (right.css_name == "gridRow" && left.css_name.starts_with("gridRow"));
    grid_overlap
        || left.properties.iter().any(|left| {
            directional_overlap_one_way(left, &right.declaration.property)
                || directional_overlap_one_way(&right.declaration.property, left)
        })
}

pub(super) fn animation_name_candidate(
    expression: &Expression<'_>,
    keyframes: &HashMap<String, Keyframes>,
) -> Option<StyleProperty> {
    let Expression::Identifier(identifier) = expression else {
        return None;
    };
    keyframes
        .get(identifier.name.as_str())
        .cloned()
        .map(StyleProperty::AnimationName)
}

pub(super) fn stylex_animation_name(
    expression: &Expression<'_>,
    namespaces: &HashSet<String>,
    keyframes: &HashMap<String, Keyframes>,
) -> Option<Vec<StyleProperty>> {
    if let Some(candidate) = animation_name_candidate(expression, keyframes) {
        return Some(vec![candidate]);
    }
    if let Some(call) = first_that_works_call(expression, namespaces) {
        let candidates = call
            .arguments
            .iter()
            .map(|argument| animation_name_candidate(argument.as_expression()?, keyframes))
            .collect::<Option<Vec<_>>>()?;
        return (!candidates.is_empty()).then(|| vec![StyleProperty::FirstThatWorks(candidates)]);
    }
    let Expression::ArrayExpression(array) = expression else {
        return None;
    };
    let mut candidates = array
        .elements
        .iter()
        .map(|element| match element {
            ArrayExpressionElement::Elision(_) | ArrayExpressionElement::SpreadElement(_) => None,
            element => animation_name_candidate(element.as_expression()?, keyframes),
        })
        .collect::<Option<Vec<_>>>()?;
    if candidates.is_empty() {
        return None;
    }
    // A plain StyleX value array is emitted in source order, so its last
    // supported declaration wins. `FirstThatWorks` stores preferred-first
    // and the Web renderer reverses it; reversing here preserves StyleX's
    // distinct array fallback order without adding another IR wrapper.
    candidates.reverse();
    Some(vec![StyleProperty::FirstThatWorks(candidates)])
}

pub(super) fn resolve_property_priority(mut entries: Vec<ResolvedEntry>) -> Vec<StyleDeclaration> {
    // A higher-priority unconditional declaration makes a lower-priority
    // value for the same final slot unreachable, even when that lower value
    // has a runtime guard. Removing it is necessary on Web because Hozo's
    // guard selector is more specific than its base selector; leaving it in
    // would let selector specificity undo StyleX's property priority.
    let unconditional = entries
        .iter()
        .filter(|entry| entry.declaration.condition == Condition::Always)
        .map(|entry| (entry.priority, entry.declaration.property.clone()))
        .collect::<Vec<_>>();
    entries.retain(|entry| {
        !unconditional.iter().any(|(priority, property)| {
            *priority > entry.priority && property.same_property_as(&entry.declaration.property)
        })
    });

    // Stable sort: priority decides across different StyleX property keys;
    // source/argument order remains the tiebreaker within one tier. Both Web
    // declaration order and Native style-array order then inherit the same
    // already-resolved cascade without runtime work.
    entries.sort_by_key(|entry| entry.priority);
    entries.into_iter().map(|entry| entry.declaration).collect()
}
