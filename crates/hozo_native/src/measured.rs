//! Opt-in layout-measured CSS math expressions on React Native:
//!
//! 1. Container query length units (`cqw`, `cqh`, `cqi`, `cqb`, `cqmin`, `cqmax`)
//!    and container-backed `calc()` / `min()` / `max()` / `clamp()`, resolved
//!    against `HozoContainerSizeQuery` (`__hozoCqs[""]`).
//! 2. Self-sized `%`-mixed CSS math expressions whose percentages resolve
//!    against the element's own border-box (`translate*-[calc(...)]`,
//!    `rounded*-[calc(...)]`, `gap*-[calc(...)]`), resolved via `HozoSelfMeasured`
//!    (`onLayout` on the element itself, with zero wrapper Views).

use hozo_ir::{
    parse_calc_length, CalcBindings, CalcExpr, CalcNeeds, ContainerCalcUnit, Dimension, Length,
    LengthUnit, PropertyValue, Radius, StyleProperty, Theme,
};

use super::conditions::RuntimeHook;
use super::context::RuntimeNeeds;
use super::layout::window_layout_keys;

const CONTAINER_BINDING: &str = "__hozoCqs[\"\"]";
const SELF_WIDTH: &str = "__hozoSelf.width";
const SELF_HEIGHT: &str = "__hozoSelf.height";
const SELF_MIN: &str = "Math.min(__hozoSelf.width, __hozoSelf.height)";

/// RN StyleSheet key for a border-radius variant.
pub(super) fn radius_key(prop: &StyleProperty) -> Option<&'static str> {
    Some(match prop {
        StyleProperty::BorderRadius(_) => "borderRadius",
        StyleProperty::BorderTopLeftRadius(_) => "borderTopLeftRadius",
        StyleProperty::BorderTopRightRadius(_) => "borderTopRightRadius",
        StyleProperty::BorderBottomRightRadius(_) => "borderBottomRightRadius",
        StyleProperty::BorderBottomLeftRadius(_) => "borderBottomLeftRadius",
        StyleProperty::BorderStartStartRadius(_) => "borderStartStartRadius",
        StyleProperty::BorderStartEndRadius(_) => "borderStartEndRadius",
        StyleProperty::BorderEndStartRadius(_) => "borderEndStartRadius",
        StyleProperty::BorderEndEndRadius(_) => "borderEndEndRadius",
        _ => return None,
    })
}

fn non_negative_layout_prop(prop: &StyleProperty) -> bool {
    matches!(
        prop,
        StyleProperty::Width(_)
            | StyleProperty::Height(_)
            | StyleProperty::MinWidth(_)
            | StyleProperty::MinHeight(_)
            | StyleProperty::MaxWidth(_)
            | StyleProperty::MaxHeight(_)
            | StyleProperty::InlineSize(_)
            | StyleProperty::BlockSize(_)
            | StyleProperty::MinInlineSize(_)
            | StyleProperty::MinBlockSize(_)
            | StyleProperty::MaxInlineSize(_)
            | StyleProperty::MaxBlockSize(_)
            | StyleProperty::FlexBasis(_)
            | StyleProperty::PaddingTop(_)
            | StyleProperty::PaddingRight(_)
            | StyleProperty::PaddingBottom(_)
            | StyleProperty::PaddingLeft(_)
            | StyleProperty::PaddingInlineStart(_)
            | StyleProperty::PaddingInlineEnd(_)
            | StyleProperty::PaddingBlockStart(_)
            | StyleProperty::PaddingBlockEnd(_)
            | StyleProperty::Gap(_)
            | StyleProperty::RowGap(_)
            | StyleProperty::ColumnGap(_)
            | StyleProperty::BorderRadius(_)
            | StyleProperty::BorderTopLeftRadius(_)
            | StyleProperty::BorderTopRightRadius(_)
            | StyleProperty::BorderBottomRightRadius(_)
            | StyleProperty::BorderBottomLeftRadius(_)
            | StyleProperty::BorderStartStartRadius(_)
            | StyleProperty::BorderStartEndRadius(_)
            | StyleProperty::BorderEndStartRadius(_)
            | StyleProperty::BorderEndEndRadius(_)
    )
}

fn container_unit_expr(value: f64, unit: LengthUnit) -> Option<CalcExpr> {
    if !value.is_finite() {
        return None;
    }
    let cq = match unit {
        LengthUnit::Cqw => ContainerCalcUnit::Cqw,
        LengthUnit::Cqh => ContainerCalcUnit::Cqh,
        LengthUnit::Cqi => ContainerCalcUnit::Cqi,
        LengthUnit::Cqb => ContainerCalcUnit::Cqb,
        LengthUnit::Cqmin => ContainerCalcUnit::Cqmin,
        LengthUnit::Cqmax => ContainerCalcUnit::Cqmax,
        _ => return None,
    };
    Some(CalcExpr::Container(cq, value))
}

fn container_keys(prop: &StyleProperty) -> Option<&'static [&'static str]> {
    if let Some(keys) = window_layout_keys(prop) {
        return Some(keys);
    }
    if matches!(prop, StyleProperty::FlexBasis(_)) {
        return Some(&["flexBasis"]);
    }
    match prop {
        StyleProperty::BorderRadius(_) => Some(&["borderRadius"]),
        StyleProperty::BorderTopLeftRadius(_) => Some(&["borderTopLeftRadius"]),
        StyleProperty::BorderTopRightRadius(_) => Some(&["borderTopRightRadius"]),
        StyleProperty::BorderBottomRightRadius(_) => Some(&["borderBottomRightRadius"]),
        StyleProperty::BorderBottomLeftRadius(_) => Some(&["borderBottomLeftRadius"]),
        StyleProperty::BorderStartStartRadius(_) => Some(&["borderStartStartRadius"]),
        StyleProperty::BorderStartEndRadius(_) => Some(&["borderStartEndRadius"]),
        StyleProperty::BorderEndStartRadius(_) => Some(&["borderEndStartRadius"]),
        StyleProperty::BorderEndEndRadius(_) => Some(&["borderEndEndRadius"]),
        _ => None,
    }
}

fn container_expr_for_prop(prop: &StyleProperty) -> Option<CalcExpr> {
    container_keys(prop)?;
    let expr = match prop.value() {
        PropertyValue::Length(Length::Unit(v, unit))
        | PropertyValue::Dimension(Dimension::Length(Length::Unit(v, unit)))
        | PropertyValue::Radius(Radius::Length(Length::Unit(v, unit))) => {
            if non_negative_layout_prop(prop) && *v < 0.0 {
                return None;
            }
            container_unit_expr(*v, *unit)?
        }
        PropertyValue::Length(Length::Css(text))
        | PropertyValue::Dimension(Dimension::Length(Length::Css(text)))
        | PropertyValue::Dimension(Dimension::Css(text))
        | PropertyValue::Radius(Radius::Length(Length::Css(text))) => {
            let parsed = parse_calc_length(text)?;
            let needs = parsed.needs();
            if !needs.needs_container() || needs.percent {
                return None;
            }
            parsed
        }
        _ => return None,
    };
    Some(expr)
}

/// Whether `prop` uses container query length units (`cqw`/`cqh`/etc.) that
/// lower via `HozoContainerSizeQuery`.
pub(super) fn is_container_sized(prop: &StyleProperty) -> bool {
    container_expr_for_prop(prop).is_some()
}

fn container_guard(needs_width: bool, needs_height: bool) -> Option<String> {
    match (needs_width, needs_height) {
        (true, true) => Some(format!(
            "{CONTAINER_BINDING}?.width !== undefined && {CONTAINER_BINDING}?.height !== undefined"
        )),
        (true, false) => Some(format!("{CONTAINER_BINDING}?.width !== undefined")),
        (false, true) => Some(format!("{CONTAINER_BINDING}?.height !== undefined")),
        (false, false) => None,
    }
}

/// Extracts container-unit styles (`cqw`/`cqh`/`calc(100cqw - 2rem)`) from a
/// condition group into a guarded inline style object reading `__hozoCqs[""]`.
pub(super) fn take_container_object(
    props: &mut Vec<StyleProperty>,
    runtime: &mut RuntimeNeeds,
) -> Option<String> {
    if !props.iter().any(is_container_sized) {
        return None;
    }
    let vp_binding = RuntimeHook::Viewport.binding();
    let bindings = CalcBindings {
        viewport: Some(&vp_binding),
        container: Some(CONTAINER_BINDING),
        percent: None,
    };
    let mut seen = std::collections::HashSet::new();
    let mut remaining = Vec::new();
    let mut pairs = Vec::new();
    let mut needs = CalcNeeds::default();

    for prop in props.drain(..).rev() {
        if let Some(keys) = container_keys(&prop) {
            if let Some(expr) = container_expr_for_prop(&prop) {
                let expr_needs = expr.needs();
                if let Some(mut js) = expr.to_js(&bindings) {
                    if non_negative_layout_prop(&prop) {
                        js = format!("Math.max(0, {js})");
                    }
                    let mut wrote = false;
                    for &key in keys.iter().rev() {
                        if seen.insert(key) {
                            pairs.push(format!("{key}: {js}"));
                            wrote = true;
                        }
                    }
                    if wrote {
                        needs.viewport |= expr_needs.viewport;
                        needs.container_width |= expr_needs.container_width;
                        needs.container_height |= expr_needs.container_height;
                    }
                    continue;
                }
            }
            if prop.unsupported_on_native().is_none() {
                seen.extend(keys.iter().copied());
            }
        }
        remaining.push(prop);
    }
    pairs.reverse();
    remaining.reverse();
    *props = remaining;
    if pairs.is_empty() {
        return None;
    }
    if needs.viewport {
        runtime.hooks.push(RuntimeHook::Viewport);
    }
    let object = format!("{{ {} }}", pairs.join(", "));
    match container_guard(needs.container_width, needs.container_height) {
        Some(guard) => Some(format!("({guard} && {object})")),
        None => Some(object),
    }
}

/// Whether `prop` is a self-sized `%`-mixed CSS math expression whose percentage
/// resolves against the element's own border-box (`translate*`, `rounded*`, `gap*`).
pub(super) fn is_self_measured(prop: &StyleProperty) -> bool {
    self_measured_needs(prop).is_some()
}

fn dimension_css(dim: &Dimension) -> Option<&str> {
    match dim {
        Dimension::Css(css) | Dimension::Length(Length::Css(css)) => Some(css.as_str()),
        _ => None,
    }
}

pub(super) fn self_measured_needs(prop: &StyleProperty) -> Option<CalcNeeds> {
    match prop {
        StyleProperty::TranslateX(dim) | StyleProperty::TranslateY(dim) => {
            let expr = parse_calc_length(dimension_css(dim)?)?;
            let needs = expr.needs();
            needs.percent.then_some(needs)
        }
        StyleProperty::Translate(values) if !values.is_empty() && values.len() <= 2 => {
            let mut combined = CalcNeeds::default();
            for value in values {
                if let Some(css) = dimension_css(value) {
                    let expr = parse_calc_length(css)?;
                    let needs = expr.needs();
                    combined.viewport |= needs.viewport;
                    combined.container_width |= needs.container_width;
                    combined.container_height |= needs.container_height;
                    combined.percent |= needs.percent;
                } else {
                    match value {
                        Dimension::Percent(pct) if pct.is_finite() => {}
                        Dimension::Length(length)
                            if length.unresolved_unit().is_none()
                                && length.css_expression().is_none() => {}
                        _ => return None,
                    }
                }
            }
            combined.percent.then_some(combined)
        }
        StyleProperty::BorderRadius(Radius::Length(Length::Css(css)))
        | StyleProperty::BorderTopLeftRadius(Radius::Length(Length::Css(css)))
        | StyleProperty::BorderTopRightRadius(Radius::Length(Length::Css(css)))
        | StyleProperty::BorderBottomRightRadius(Radius::Length(Length::Css(css)))
        | StyleProperty::BorderBottomLeftRadius(Radius::Length(Length::Css(css)))
        | StyleProperty::BorderStartStartRadius(Radius::Length(Length::Css(css)))
        | StyleProperty::BorderStartEndRadius(Radius::Length(Length::Css(css)))
        | StyleProperty::BorderEndStartRadius(Radius::Length(Length::Css(css)))
        | StyleProperty::BorderEndEndRadius(Radius::Length(Length::Css(css))) => {
            let expr = parse_calc_length(css)?;
            let needs = expr.needs();
            needs.percent.then_some(needs)
        }
        StyleProperty::Gap(dim) | StyleProperty::RowGap(dim) | StyleProperty::ColumnGap(dim) => {
            let expr = parse_calc_length(dimension_css(dim)?)?;
            let needs = expr.needs();
            needs.percent.then_some(needs)
        }
        _ => None,
    }
}

/// Whether `prop` requires `HozoContainerSizeQuery` (either directly or inside
/// a self-measured `%`-mixed expression like `translate-x-[calc(50%-10cqw)]`).
pub(super) fn uses_container_size(prop: &StyleProperty) -> bool {
    is_container_sized(prop) || self_measured_needs(prop).is_some_and(|n| n.needs_container())
}

fn translate_dim_js(
    dim: &Dimension,
    percent_ref: &str,
    vp_binding: &str,
    theme: &Theme,
    needs: &mut CalcNeeds,
) -> Option<String> {
    if let Some(css) = dimension_css(dim) {
        let expr = parse_calc_length(css)?;
        let expr_needs = expr.needs();
        let js = expr.to_js(&CalcBindings {
            viewport: Some(vp_binding),
            container: Some(CONTAINER_BINDING),
            percent: Some(percent_ref),
        })?;
        needs.viewport |= expr_needs.viewport;
        needs.container_width |= expr_needs.container_width;
        needs.container_height |= expr_needs.container_height;
        needs.percent |= expr_needs.percent;
        return Some(js);
    }
    match dim {
        Dimension::Percent(pct) if pct.is_finite() => Some(format!("'{pct}%'")),
        Dimension::Length(length)
            if length.unresolved_unit().is_none() && length.css_expression().is_none() =>
        {
            Some(format!("{}", length.px(theme)))
        }
        _ => None,
    }
}

fn is_transform_prop(prop: &StyleProperty) -> bool {
    matches!(
        prop,
        StyleProperty::Translate(_)
            | StyleProperty::TranslateX(_)
            | StyleProperty::TranslateY(_)
            | StyleProperty::TranslateZ(_)
            | StyleProperty::TranslateNone
            | StyleProperty::Rotate(_)
            | StyleProperty::RotateNone
            | StyleProperty::RotateX(_)
            | StyleProperty::RotateY(_)
            | StyleProperty::RotateZ(_)
            | StyleProperty::SkewX(_)
            | StyleProperty::SkewY(_)
            | StyleProperty::Scale(_)
            | StyleProperty::ScaleX(_)
            | StyleProperty::ScaleY(_)
            | StyleProperty::ScaleZ(_)
            | StyleProperty::Scale3d
            | StyleProperty::ScaleNone
            | StyleProperty::Transform(_)
            | StyleProperty::TransformNone
            | StyleProperty::TransformEmpty
            | StyleProperty::TransformGpu
    )
}

/// Extracts self-measured `%`-calc styles (`translate*`, `rounded*`, `gap*`)
/// from a condition group into a JS object expression reading `__hozoSelf`.
///
/// When the group contains a self-measured translate, sibling static transform
/// properties in the same group are composed into the same `transform: [...]`
/// entry so the static StyleSheet and `hozoSelfStyle` never fight over the
/// single React Native `transform` array.
pub(super) fn take_self_measured_object(
    props: &mut Vec<StyleProperty>,
    theme: &Theme,
    runtime: &mut RuntimeNeeds,
) -> Option<String> {
    if !props.iter().any(is_self_measured) {
        return None;
    }
    let vp_binding = RuntimeHook::Viewport.binding();
    let mut needs = CalcNeeds::default();
    let mut pairs: Vec<String> = Vec::new();

    // 1. Handle transforms as one composed `transform: [...]` if any translate
    //    in this group is self-measured.
    let has_self_translate = props.iter().any(|p| {
        matches!(
            p,
            StyleProperty::Translate(_)
                | StyleProperty::TranslateX(_)
                | StyleProperty::TranslateY(_)
        ) && is_self_measured(p)
    });
    if has_self_translate {
        let mut transform_props = Vec::new();
        let mut rest = Vec::new();
        for prop in props.drain(..) {
            if is_transform_prop(&prop) {
                transform_props.push(prop);
            } else {
                rest.push(prop);
            }
        }
        *props = rest;
        if let Some(transform_js) =
            compose_self_measured_transform(&transform_props, theme, &vp_binding, &mut needs)
        {
            pairs.push(format!("transform: {transform_js}"));
        }
    }

    // 2. Handle self-measured border radii and gaps, respecting last-wins per RN key.
    let mut seen = std::collections::HashSet::new();
    let mut scalar_pairs = Vec::new();
    let mut remaining = Vec::new();
    for prop in props.drain(..).rev() {
        if let Some(key) = radius_key(&prop) {
            if let PropertyValue::Radius(Radius::Length(Length::Css(css))) = prop.value() {
                if let Some(expr) = parse_calc_length(css) {
                    let expr_needs = expr.needs();
                    if expr_needs.percent {
                        if let Some(js) = expr.to_js(&CalcBindings {
                            viewport: Some(&vp_binding),
                            container: Some(CONTAINER_BINDING),
                            percent: Some(SELF_MIN),
                        }) {
                            if seen.insert(key) {
                                scalar_pairs.push(format!("{key}: Math.max(0, {js})"));
                                needs.viewport |= expr_needs.viewport;
                                needs.container_width |= expr_needs.container_width;
                                needs.container_height |= expr_needs.container_height;
                                needs.percent = true;
                            }
                            continue;
                        }
                    }
                }
            }
            if prop.unsupported_on_native().is_none() {
                seen.insert(key);
            }
        } else if matches!(
            prop,
            StyleProperty::Gap(_) | StyleProperty::RowGap(_) | StyleProperty::ColumnGap(_)
        ) {
            if let PropertyValue::Dimension(dim) = prop.value() {
                if let Some(css) = dimension_css(dim) {
                    if let Some(expr) = parse_calc_length(css) {
                        let expr_needs = expr.needs();
                        if expr_needs.percent {
                            let axes: &[(&str, &str)] = match prop {
                                StyleProperty::Gap(_) => {
                                    &[("columnGap", SELF_WIDTH), ("rowGap", SELF_HEIGHT)]
                                }
                                StyleProperty::RowGap(_) => &[("rowGap", SELF_HEIGHT)],
                                StyleProperty::ColumnGap(_) => &[("columnGap", SELF_WIDTH)],
                                _ => &[],
                            };
                            let mut wrote = false;
                            for &(key, axis_ref) in axes {
                                if let Some(js) = expr.to_js(&CalcBindings {
                                    viewport: Some(&vp_binding),
                                    container: Some(CONTAINER_BINDING),
                                    percent: Some(axis_ref),
                                }) {
                                    if seen.insert(key) {
                                        scalar_pairs.push(format!("{key}: Math.max(0, {js})"));
                                        wrote = true;
                                    }
                                }
                            }
                            if wrote {
                                needs.viewport |= expr_needs.viewport;
                                needs.container_width |= expr_needs.container_width;
                                needs.container_height |= expr_needs.container_height;
                                needs.percent = true;
                            }
                            continue;
                        }
                    }
                }
            }
            if prop.unsupported_on_native().is_none() {
                match prop {
                    StyleProperty::Gap(_) => {
                        seen.insert("rowGap");
                        seen.insert("columnGap");
                    }
                    StyleProperty::RowGap(_) => {
                        seen.insert("rowGap");
                    }
                    StyleProperty::ColumnGap(_) => {
                        seen.insert("columnGap");
                    }
                    _ => {}
                }
            }
        }
        remaining.push(prop);
    }
    scalar_pairs.reverse();
    remaining.reverse();
    *props = remaining;
    pairs.extend(scalar_pairs);

    if pairs.is_empty() {
        return None;
    }
    if needs.viewport {
        runtime.hooks.push(RuntimeHook::Viewport);
    }
    let object = format!("{{ {} }}", pairs.join(", "));
    match container_guard(needs.container_width, needs.container_height) {
        Some(guard) => Some(format!("({guard} && {object})")),
        None => Some(object),
    }
}

fn compose_self_measured_transform(
    props: &[StyleProperty],
    theme: &Theme,
    vp_binding: &str,
    needs: &mut CalcNeeds,
) -> Option<String> {
    let mut parts: Vec<String> = Vec::new();

    // Translate entries (CSS order: first in the combined transform array).
    let last_authored_translate = props
        .iter()
        .rposition(|p| matches!(p, StyleProperty::Translate(_)));
    let last_translate_axes = props.iter().rposition(|p| {
        matches!(
            p,
            StyleProperty::TranslateX(_) | StyleProperty::TranslateY(_)
        )
    });
    let translate_off = props
        .iter()
        .rposition(|p| matches!(p, StyleProperty::TranslateNone))
        > last_authored_translate.max(last_translate_axes);

    if !translate_off {
        if last_authored_translate > last_translate_axes {
            if let Some(values) = props.iter().rev().find_map(|p| match p {
                StyleProperty::Translate(values) => Some(values),
                _ => None,
            }) {
                if let Some(x) = values.first() {
                    if let Some(js) = translate_dim_js(x, SELF_WIDTH, vp_binding, theme, needs) {
                        parts.push(format!("{{ translateX: {js} }}"));
                    }
                }
                if let Some(y) = values.get(1) {
                    if let Some(js) = translate_dim_js(y, SELF_HEIGHT, vp_binding, theme, needs) {
                        parts.push(format!("{{ translateY: {js} }}"));
                    }
                }
            }
        } else {
            if let Some(x) = props.iter().rev().find_map(|p| match p {
                StyleProperty::TranslateX(d) => Some(d),
                _ => None,
            }) {
                if let Some(js) = translate_dim_js(x, SELF_WIDTH, vp_binding, theme, needs) {
                    parts.push(format!("{{ translateX: {js} }}"));
                }
            }
            if let Some(y) = props.iter().rev().find_map(|p| match p {
                StyleProperty::TranslateY(d) => Some(d),
                _ => None,
            }) {
                if let Some(js) = translate_dim_js(y, SELF_HEIGHT, vp_binding, theme, needs) {
                    parts.push(format!("{{ translateY: {js} }}"));
                }
            }
        }
    }

    // Append any non-translate transforms from the same condition group by
    // reusing `style::transform_entry` on the remaining transform properties.
    let non_translate: Vec<_> = props
        .iter()
        .filter(|p| {
            !matches!(
                p,
                StyleProperty::Translate(_)
                    | StyleProperty::TranslateX(_)
                    | StyleProperty::TranslateY(_)
                    | StyleProperty::TranslateZ(_)
                    | StyleProperty::TranslateNone
            )
        })
        .cloned()
        .collect();
    if let Some((_, rest_array)) = super::style::transform_entry(&non_translate, theme) {
        let inner = rest_array
            .strip_prefix('[')
            .and_then(|s| s.strip_suffix(']'))
            .unwrap_or("")
            .trim();
        if !inner.is_empty() {
            parts.push(inner.to_string());
        }
    }

    (!parts.is_empty()).then(|| format!("[{}]", parts.join(", ")))
}
