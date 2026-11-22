//! Which properties overlap, so a later longhand is not lost to a shorthand.

use hozo_ir::{Edge, StyleProperty};

use super::priority::canonical_property;

pub(super) fn directional_overlap_one_way(left: &StyleProperty, right: &StyleProperty) -> bool {
    let typed_overlap = matches!(
        (left, right),
        (
            StyleProperty::PaddingInlineStart(_),
            StyleProperty::PaddingLeft(_)
        ) | (
            StyleProperty::PaddingInlineStart(_),
            StyleProperty::PaddingRight(_)
        ) | (
            StyleProperty::PaddingInlineEnd(_),
            StyleProperty::PaddingLeft(_)
        ) | (
            StyleProperty::PaddingInlineEnd(_),
            StyleProperty::PaddingRight(_)
        ) | (
            StyleProperty::MarginInlineStart(_),
            StyleProperty::MarginLeft(_)
        ) | (
            StyleProperty::MarginInlineStart(_),
            StyleProperty::MarginRight(_)
        ) | (
            StyleProperty::MarginInlineEnd(_),
            StyleProperty::MarginLeft(_)
        ) | (
            StyleProperty::MarginInlineEnd(_),
            StyleProperty::MarginRight(_)
        ) | (
            StyleProperty::InsetInlineStart(_),
            StyleProperty::InsetLeft(_)
        ) | (
            StyleProperty::InsetInlineStart(_),
            StyleProperty::InsetRight(_)
        ) | (
            StyleProperty::InsetInlineEnd(_),
            StyleProperty::InsetLeft(_)
        ) | (
            StyleProperty::InsetInlineEnd(_),
            StyleProperty::InsetRight(_)
        ) | (
            StyleProperty::ScrollMargin(Edge::InlineStart | Edge::InlineEnd, _),
            StyleProperty::ScrollMargin(Edge::Left | Edge::Right, _),
        ) | (
            StyleProperty::ScrollPadding(Edge::InlineStart | Edge::InlineEnd, _),
            StyleProperty::ScrollPadding(Edge::Left | Edge::Right, _),
        ) | (
            StyleProperty::ScrollMargin(Edge::BlockStart | Edge::BlockEnd, _),
            StyleProperty::ScrollMargin(Edge::Top | Edge::Bottom, _),
        ) | (
            StyleProperty::ScrollPadding(Edge::BlockStart | Edge::BlockEnd, _),
            StyleProperty::ScrollPadding(Edge::Top | Edge::Bottom, _),
        ) | (
            StyleProperty::BorderLogicalWidth(Edge::InlineStart | Edge::InlineEnd, _),
            StyleProperty::BorderLeftWidth(_) | StyleProperty::BorderRightWidth(_),
        ) | (
            StyleProperty::BorderLogicalWidth(Edge::BlockStart | Edge::BlockEnd, _),
            StyleProperty::BorderTopWidth(_) | StyleProperty::BorderBottomWidth(_),
        ) | (
            StyleProperty::BorderInlineStartColor(_) | StyleProperty::BorderInlineEndColor(_),
            StyleProperty::BorderLeftColor(_) | StyleProperty::BorderRightColor(_),
        ) | (
            StyleProperty::BorderStartStartRadius(_),
            StyleProperty::BorderTopLeftRadius(_)
        ) | (
            StyleProperty::BorderStartStartRadius(_),
            StyleProperty::BorderTopRightRadius(_)
        ) | (
            StyleProperty::BorderStartEndRadius(_),
            StyleProperty::BorderTopLeftRadius(_)
        ) | (
            StyleProperty::BorderStartEndRadius(_),
            StyleProperty::BorderTopRightRadius(_)
        ) | (
            StyleProperty::BorderEndStartRadius(_),
            StyleProperty::BorderBottomLeftRadius(_)
        ) | (
            StyleProperty::BorderEndStartRadius(_),
            StyleProperty::BorderBottomRightRadius(_)
        ) | (
            StyleProperty::BorderEndEndRadius(_),
            StyleProperty::BorderBottomLeftRadius(_)
        ) | (
            StyleProperty::BorderEndEndRadius(_),
            StyleProperty::BorderBottomRightRadius(_)
        )
    );
    let style_overlap = match (left, right) {
        (
            StyleProperty::BorderLogicalStyle(Edge::InlineStart | Edge::InlineEnd, _),
            StyleProperty::WebOnly(property, _),
        ) => matches!(
            property.as_str(),
            "border-left-style" | "border-right-style"
        ),
        (
            StyleProperty::BorderLogicalStyle(Edge::BlockStart | Edge::BlockEnd, _),
            StyleProperty::WebOnly(property, _),
        ) => matches!(
            property.as_str(),
            "border-top-style" | "border-bottom-style"
        ),
        _ => false,
    };
    typed_overlap || style_overlap
}

pub(super) fn property_name_family(property: &str) -> Option<&'static str> {
    let property = canonical_property(property);
    if property.starts_with("padding") {
        Some("padding")
    } else if property.starts_with("margin") {
        Some("margin")
    } else if matches!(property, "top" | "right" | "bottom" | "left")
        || property.starts_with("inset")
    {
        Some("inset")
    } else if matches!(property, "gap" | "rowGap" | "columnGap") {
        Some("gap")
    } else if property == "borderImage" || property.starts_with("borderImage") {
        Some("border-image")
    } else if property.starts_with("corner") && property.ends_with("Shape") {
        Some("corner-shape")
    } else if property == "borderRadius" || property.ends_with("Radius") {
        Some("border-radius")
    } else if property == "borderColor"
        || property.ends_with("Color") && property.starts_with("border")
    {
        Some("border-color")
    } else if property == "borderWidth"
        || property.ends_with("Width") && property.starts_with("border")
    {
        Some("border-width")
    } else if property == "borderStyle"
        || property.ends_with("Style") && property.starts_with("border")
    {
        Some("border-style")
    } else if property == "flex" || matches!(property, "flexGrow" | "flexShrink" | "flexBasis") {
        Some("flex")
    } else if property == "font" || property.starts_with("font") {
        Some("font")
    } else if property.starts_with("gridColumn") {
        Some("grid-column")
    } else if property.starts_with("gridRow") {
        Some("grid-row")
    } else if property == "overflow"
        || matches!(
            property,
            "overflowX" | "overflowY" | "overflowBlock" | "overflowBlockX"
        )
    {
        Some("overflow")
    } else if property.starts_with("scrollMargin") {
        Some("scroll-margin")
    } else if property.starts_with("scrollPadding") {
        Some("scroll-padding")
    } else if property == "container" || property.starts_with("container") {
        Some("container")
    } else if property == "columns" || matches!(property, "columnCount" | "columnWidth") {
        Some("columns")
    } else if property == "columnRule" || property.starts_with("columnRule") {
        Some("column-rule")
    } else if property == "listStyle" || property.starts_with("listStyle") {
        Some("list-style")
    } else if property == "transition" || property.starts_with("transition") {
        Some("transition")
    } else if property == "background" || property.starts_with("background") {
        Some("background")
    } else if property == "animation" || property.starts_with("animation") {
        Some("animation")
    } else if property == "textDecoration" || property.starts_with("textDecoration") {
        Some("text-decoration")
    } else if property == "textEmphasis" || property.starts_with("textEmphasis") {
        Some("text-emphasis")
    } else if property == "caret" || property.starts_with("caret") {
        Some("caret")
    } else if property == "mask" || property.starts_with("mask") {
        Some("mask")
    } else if property == "offset" || property.starts_with("offset") {
        Some("offset")
    } else if property == "positionTry" || property.starts_with("positionTry") {
        Some("position-try")
    } else if property == "outline" || property.starts_with("outline") {
        Some("outline")
    } else if matches!(property, "placeContent" | "alignContent" | "justifyContent") {
        Some("place-content")
    } else if matches!(property, "placeItems" | "alignItems" | "justifyItems") {
        Some("place-items")
    } else {
        None
    }
}

pub(super) fn property_names_overlap(left: &str, right: &str) -> bool {
    let left = canonical_property(left);
    let right = canonical_property(right);
    left == right
        || property_name_family(left)
            .is_some_and(|family| property_name_family(right) == Some(family))
}
