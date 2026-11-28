//! Layout values React Native takes in another form: inline flex, safe-area
//! insets and viewport units.

use hozo_ir::{
    AlignSelf, Axis, Color, Dimension, Display, Edge, Length, LengthUnit, LetterSpacing,
    LineHeight, PropertyValue, Radius, StyleDeclaration, StyleProperty, Theme,
};

use super::conditions::RuntimeHook;

/// Yoga has no inline formatting context, but an inline-flex box's useful
/// layout characteristic can be approximated by a flex container that does
/// not stretch across its parent's cross axis. Keep the authored `self-*`
/// authoritative across every condition: synthesizing a base or conditional
/// flex-start beside one could otherwise win only while that condition is on.
pub(super) fn lower_inline_flex(mut declarations: Vec<StyleDeclaration>) -> Vec<StyleDeclaration> {
    let has_authored_align_self = declarations
        .iter()
        .any(|declaration| matches!(declaration.property, StyleProperty::AlignSelf(_)));
    if has_authored_align_self {
        return declarations;
    }

    let synthetic: Vec<_> = declarations
        .iter()
        .enumerate()
        .filter(|(index, declaration)| {
            matches!(
                declaration.property,
                StyleProperty::Display(Display::InlineFlex)
            ) && !declarations[index + 1..].iter().any(|later| {
                later.condition == declaration.condition
                    && matches!(later.property, StyleProperty::Display(_))
            })
        })
        .map(|(_, declaration)| StyleDeclaration {
            source: declaration.source,
            property: StyleProperty::AlignSelf(AlignSelf::Start),
            condition: declaration.condition.clone(),
        })
        .collect();
    declarations.extend(synthetic);
    declarations
}

pub(super) fn is_safe_area_inset(prop: &StyleProperty) -> bool {
    matches!(prop, StyleProperty::Arbitrary(property, value)
        if hozo_ir::safe_area_inset(property, value).is_some())
}

/// The inline style object for a group's safe-area insets, if it has any.
///
/// Like viewport styles, this cannot go in the StyleSheet: the
/// number is not knowable at build time and changes with the device --
/// rotate a phone and the notch moves from the top to the side.
///
/// The value comes from `react-native-safe-area-context`, wrapped by
/// `useHozoSafeArea` in `@hozo/engine`. Hozo does not ship native code and
/// this is the one place that decision is visible: reading the real inset
/// needs `UIView.safeAreaInsets` and Android's `WindowInsets`, and React
/// Native's core exposes neither to JavaScript -- only a deprecated
/// iOS-only `SafeAreaView` and an Android-only `StatusBar.currentHeight`.
/// So the choice was a native module of our own or a wrapper around the
/// one every React Native app already has, and the wrapper keeps `@hozo/*`
/// installable without a rebuild.
pub(super) fn safe_area_object(props: &[StyleProperty]) -> Option<String> {
    let mut pairs: Vec<String> = Vec::new();
    for prop in props {
        let StyleProperty::Arbitrary(property, value) = prop else {
            continue;
        };
        let Some((key, side)) = hozo_ir::safe_area_inset(property, value) else {
            continue;
        };
        pairs.push(format!("{key}: {}.{side}", RuntimeHook::SafeArea.binding()));
    }
    (!pairs.is_empty()).then(|| format!("{{ {} }}", pairs.join(", ")))
}

pub(super) fn is_viewport_sized(prop: &StyleProperty) -> bool {
    viewport_value(prop).is_some()
        || is_viewport_translate(prop)
        || is_viewport_space_or_divide(prop)
        || is_viewport_ring(prop)
}

pub(super) fn is_viewport_translate(prop: &StyleProperty) -> bool {
    match prop {
        StyleProperty::TranslateX(dim) | StyleProperty::TranslateY(dim) => {
            viewport_dim_js(dim, false).is_some()
        }
        StyleProperty::Translate(values) if !values.is_empty() && values.len() <= 2 => {
            values.iter().any(|v| viewport_dim_js(v, false).is_some())
                && values.iter().all(|v| {
                    viewport_dim_js(v, false).is_some()
                        || matches!(v, Dimension::Percent(p) if p.is_finite())
                        || matches!(
                            v,
                            Dimension::Length(l)
                                if l.unresolved_unit().is_none() && l.css_expression().is_none()
                        )
                })
        }
        _ => false,
    }
}

pub(super) fn is_viewport_space_or_divide(prop: &StyleProperty) -> bool {
    match prop {
        StyleProperty::SpaceX(dim) | StyleProperty::SpaceY(dim) => {
            viewport_dim_js(dim, false).is_some()
        }
        StyleProperty::DivideX(dim) | StyleProperty::DivideY(dim) => {
            viewport_dim_js(dim, true).is_some()
        }
        _ => false,
    }
}

pub(super) fn is_viewport_ring(prop: &StyleProperty) -> bool {
    match prop {
        StyleProperty::RingWidth(l)
        | StyleProperty::InsetRingWidth(l)
        | StyleProperty::RingOffsetWidth(l) => viewport_length_js(l, true).is_some(),
        _ => false,
    }
}

/// Keys shared by the StyleSheet and viewport paths. React Native has no
/// vertical writing mode; inline edges still follow layout direction.
pub(super) fn window_layout_keys(prop: &StyleProperty) -> Option<&'static [&'static str]> {
    use StyleProperty::*;
    Some(match prop {
        Width(_) | InlineSize(_) => &["width"],
        Height(_) | BlockSize(_) => &["height"],
        MinWidth(_) | MinInlineSize(_) => &["minWidth"],
        MinHeight(_) | MinBlockSize(_) => &["minHeight"],
        MaxWidth(_) | MaxInlineSize(_) => &["maxWidth"],
        MaxHeight(_) | MaxBlockSize(_) => &["maxHeight"],
        MarginTop(_) | MarginBlockStart(_) => &["marginTop"],
        MarginBottom(_) | MarginBlockEnd(_) => &["marginBottom"],
        MarginLeft(_) => &["marginLeft"],
        MarginRight(_) => &["marginRight"],
        MarginInlineStart(_) => &["marginStart"],
        MarginInlineEnd(_) => &["marginEnd"],
        PaddingTop(_) | PaddingBlockStart(_) => &["paddingTop"],
        PaddingBottom(_) | PaddingBlockEnd(_) => &["paddingBottom"],
        PaddingLeft(_) => &["paddingLeft"],
        PaddingRight(_) => &["paddingRight"],
        PaddingInlineStart(_) => &["paddingStart"],
        PaddingInlineEnd(_) => &["paddingEnd"],
        InsetTop(_) | InsetBlockStart(_) => &["top"],
        InsetBottom(_) | InsetBlockEnd(_) => &["bottom"],
        InsetLeft(_) => &["left"],
        InsetRight(_) => &["right"],
        InsetInlineStart(_) => &["start"],
        InsetInlineEnd(_) => &["end"],
        InsetInline(_) => &["start", "end"],
        InsetBlock(_) => &["top", "bottom"],
        // Native arrays merge keys, not shorthands. Use the same slots so
        // an ordered gap can replace either earlier axis and vice versa.
        Gap(_) => &["rowGap", "columnGap"],
        RowGap(_) => &["rowGap"],
        ColumnGap(_) => &["columnGap"],
        _ => return None,
    })
}

/// All scalar RN numeric style keys that accept viewport length units via
/// `useHozoViewport()`. Extends `window_layout_keys` with flex-basis, border
/// radii/widths, outlines, and absolute typography lengths.
fn viewport_style_keys(prop: &StyleProperty) -> Option<&'static [&'static str]> {
    if let Some(keys) = window_layout_keys(prop) {
        return Some(keys);
    }
    use StyleProperty::*;
    Some(match prop {
        FlexBasis(_) => &["flexBasis"],
        BorderRadius(_) => &["borderRadius"],
        BorderTopLeftRadius(_) => &["borderTopLeftRadius"],
        BorderTopRightRadius(_) => &["borderTopRightRadius"],
        BorderBottomRightRadius(_) => &["borderBottomRightRadius"],
        BorderBottomLeftRadius(_) => &["borderBottomLeftRadius"],
        BorderStartStartRadius(_) => &["borderStartStartRadius"],
        BorderStartEndRadius(_) => &["borderStartEndRadius"],
        BorderEndStartRadius(_) => &["borderEndStartRadius"],
        BorderEndEndRadius(_) => &["borderEndEndRadius"],
        BorderTopWidth(_) => &["borderTopWidth"],
        BorderRightWidth(_) => &["borderRightWidth"],
        BorderBottomWidth(_) => &["borderBottomWidth"],
        BorderLeftWidth(_) => &["borderLeftWidth"],
        BorderLogicalWidth(edge, _) => match edge {
            Edge::InlineStart => &["borderStartWidth"],
            Edge::InlineEnd => &["borderEndWidth"],
            Edge::BlockStart => &["borderTopWidth"],
            Edge::BlockEnd => &["borderBottomWidth"],
            Edge::Inline => &["borderStartWidth", "borderEndWidth"],
            Edge::Block => &["borderTopWidth", "borderBottomWidth"],
            _ => return None,
        },
        OutlineWidth(_) => &["outlineWidth"],
        OutlineOffset(_) => &["outlineOffset"],
        FontSize(_) => &["fontSize"],
        LineHeight(hozo_ir::LineHeight::Length(_) | hozo_ir::LineHeight::FontDefault(_)) => {
            &["lineHeight"]
        }
        LetterSpacing(hozo_ir::LetterSpacing::Px(_)) => &["letterSpacing"],
        _ => return None,
    })
}

fn viewport_non_negative(prop: &StyleProperty) -> bool {
    use StyleProperty::*;
    matches!(
        prop,
        Gap(_)
            | RowGap(_)
            | ColumnGap(_)
            | FlexBasis(_)
            | BorderRadius(_)
            | BorderTopLeftRadius(_)
            | BorderTopRightRadius(_)
            | BorderBottomRightRadius(_)
            | BorderBottomLeftRadius(_)
            | BorderStartStartRadius(_)
            | BorderStartEndRadius(_)
            | BorderEndStartRadius(_)
            | BorderEndEndRadius(_)
            | BorderTopWidth(_)
            | BorderRightWidth(_)
            | BorderBottomWidth(_)
            | BorderLeftWidth(_)
            | BorderLogicalWidth(..)
            | OutlineWidth(_)
            | FontSize(_)
            | LineHeight(_)
    )
}

fn viewport_length_js(length: &Length, non_negative: bool) -> Option<String> {
    match length {
        // A negative literal isn't valid CSS for non-negative properties. A valid
        // calculation that evaluates below zero is clamped at used-value time.
        Length::Unit(pct, _) if non_negative && *pct < 0.0 => None,
        Length::Unit(pct, LengthUnit::Vw) if pct.is_finite() => Some(viewport_share("width", *pct)),
        Length::Unit(pct, LengthUnit::Vh) if pct.is_finite() => {
            Some(viewport_share("height", *pct))
        }
        Length::Unit(pct, LengthUnit::Vmin) if pct.is_finite() => {
            Some(viewport_extremum("min", *pct))
        }
        Length::Unit(pct, LengthUnit::Vmax) if pct.is_finite() => {
            Some(viewport_extremum("max", *pct))
        }
        Length::Css(text) => viewport_calc(text).map(|expr| {
            if non_negative {
                format!("Math.max(0, {expr})")
            } else {
                expr
            }
        }),
        _ => None,
    }
}

pub(super) fn viewport_dim_js(dim: &Dimension, non_negative: bool) -> Option<String> {
    match dim {
        Dimension::Length(length) => viewport_length_js(length, non_negative),
        Dimension::ViewportWidth(pct) if pct.is_finite() && (!non_negative || *pct >= 0.0) => {
            Some(viewport_share("width", *pct))
        }
        Dimension::ViewportHeight(pct) if pct.is_finite() && (!non_negative || *pct >= 0.0) => {
            Some(viewport_share("height", *pct))
        }
        Dimension::Css(text) => viewport_calc(text).map(|expr| {
            if non_negative {
                format!("Math.max(0, {expr})")
            } else {
                expr
            }
        }),
        _ => None,
    }
}

/// Parses a raw CSS length token (`100vh`, `50vw`, `10vmin`, `2.5vmax`, or a
/// viewport-only `calc()`/`min()`/`max()`/`clamp()`) into a JS expression
/// reading `__hozoViewport`. Used by string-backed Native channels such as
/// `backdrop-blur-[...]` and `grid-cols-[...]`/`grid-rows-[...]`.
pub(super) fn viewport_length_str(raw: &str, non_negative: bool) -> Option<String> {
    let trimmed = raw.trim();
    for (suffix, unit) in [
        ("vmin", LengthUnit::Vmin),
        ("vmax", LengthUnit::Vmax),
        ("vw", LengthUnit::Vw),
        ("vh", LengthUnit::Vh),
    ] {
        if let Some(num) = trimmed.strip_suffix(suffix) {
            if let Ok(value) = num.trim().parse::<f64>() {
                return viewport_length_js(&Length::Unit(value, unit), non_negative);
            }
        }
    }
    viewport_calc(trimmed).map(|expr| {
        if non_negative {
            format!("Math.max(0, {expr})")
        } else {
            expr
        }
    })
}

/// Only style slots with an explicit Native projection use the window.
/// The unit itself does not decide which style keys can accept it.
pub(super) fn viewport_value(prop: &StyleProperty) -> Option<String> {
    viewport_style_keys(prop)?;
    let non_negative = viewport_non_negative(prop);
    match prop.value() {
        PropertyValue::Dimension(dim) => viewport_dim_js(dim, non_negative),
        PropertyValue::Length(length)
        | PropertyValue::Radius(Radius::Length(length))
        | PropertyValue::LineHeight(LineHeight::Length(length) | LineHeight::FontDefault(length))
        | PropertyValue::LetterSpacing(LetterSpacing::Px(length)) => {
            viewport_length_js(length, non_negative)
        }
        _ => None,
    }
}

fn viewport_extremum(op: &str, pct: f64) -> String {
    let binding = RuntimeHook::Viewport.binding();
    let base = format!("Math.{op}({binding}.width, {binding}.height)");
    if (pct - 100.0).abs() < f64::EPSILON {
        base
    } else {
        format!("{base} * {}", pct / 100.0)
    }
}

/// `pct` percent of the window along `axis`, as the runtime expression.
pub(super) fn viewport_share(axis: &str, pct: f64) -> String {
    let binding = RuntimeHook::Viewport.binding();
    // The common case is a whole viewport (`h-screen`), where the
    // multiplication is noise in the output.
    if (pct - 100.0).abs() < f64::EPSILON {
        format!("{binding}.{axis}")
    } else {
        format!("{binding}.{axis} * {}", pct / 100.0)
    }
}

/// A CSS math expression (`calc()`, `min()`, `max()`, `clamp()`) of viewport
/// lengths and fixed lengths, as the runtime expression:
/// `calc(100vw - 2rem)` -> `__hozoViewport.width - 32` (#1312).
///
/// Expressions with percentages or container units are left to the layout-
/// measured paths (`measured.rs`); expressions with no viewport terms return
/// `None` so this path does not inject `useHozoViewport` unnecessarily.
pub(super) fn viewport_calc(text: &str) -> Option<String> {
    let expr = hozo_ir::parse_calc_length(text)?;
    let needs = expr.needs();
    if !needs.viewport || needs.percent || needs.needs_container() {
        return None;
    }
    let binding = RuntimeHook::Viewport.binding();
    expr.to_js(&hozo_ir::CalcBindings {
        viewport: Some(&binding),
        ..Default::default()
    })
}

/// Move a group's viewport-relative styles out of its StyleSheet entry.
///
/// These can't go in the StyleSheet: `StyleSheet.create` is evaluated once
/// at module load, and the value changes when the device rotates. The object
/// is rebuilt each render instead, from a hook that re-renders the component
/// when the window changes -- so a rotation resizes the element, which is
/// what `h-screen` means on Web.
///
/// Measured against the *window*, not the screen: window excludes the system
/// UI the app can't draw under, which is the closer analogue of the Web
/// viewport. It does not account for notches or a home indicator -- a
/// full-bleed layout still wants a safe-area inset on top of this, exactly
/// as it does on Web.
pub(super) fn take_viewport_object(
    props: &mut Vec<StyleProperty>,
    all_declarations: &[StyleDeclaration],
    theme: &Theme,
) -> Option<String> {
    // Check without allocation on the ordinary path. The group is already
    // ordered; do not let the inline object (after the static entry) give
    // an earlier write priority over a later alias for the same Native key.
    if !props.iter().any(is_viewport_sized) {
        return None;
    }
    let mut composed_pairs: Vec<String> = Vec::new();

    // 1. Viewport translates compose with sibling transforms in the same group
    //    unless a self-measured `%`-calc translate already claims the group's
    //    transform array in `measured.rs`.
    let has_viewport_translate = props.iter().any(is_viewport_translate);
    let has_self_measured_translate = props.iter().any(|p| {
        matches!(
            p,
            StyleProperty::Translate(_)
                | StyleProperty::TranslateX(_)
                | StyleProperty::TranslateY(_)
        ) && crate::measured::is_self_measured(p)
    });
    if has_viewport_translate && !has_self_measured_translate {
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
        if let Some(transform_js) = compose_viewport_transform(&transform_props, theme) {
            composed_pairs.push(format!("transform: {transform_js}"));
        }
    }

    // 2. Viewport rings compose with sibling box-shadow/ring layers in the same
    //    group into one inline template literal `boxShadow`.
    if props.iter().any(is_viewport_ring) {
        let mut shadow_props = Vec::new();
        let mut rest = Vec::new();
        for prop in props.drain(..) {
            if crate::shadows::is_slot(&prop) {
                shadow_props.push(prop);
            } else {
                rest.push(prop);
            }
        }
        *props = rest;
        if let Some(shadow_js) = compose_viewport_box_shadow(&shadow_props, theme) {
            composed_pairs.push(format!("boxShadow: {shadow_js}"));
        }
    }

    // 3. Scalar viewport style keys plus child-scoped `space-*`/`divide-*`.
    let space_x_reversed = all_declarations
        .iter()
        .any(|d| matches!(d.property, StyleProperty::SpaceReverse(Axis::X)));
    let space_y_reversed = all_declarations
        .iter()
        .any(|d| matches!(d.property, StyleProperty::SpaceReverse(Axis::Y)));
    let divide_x_reversed = all_declarations
        .iter()
        .any(|d| matches!(d.property, StyleProperty::DivideReverse(Axis::X)));
    let divide_y_reversed = all_declarations
        .iter()
        .any(|d| matches!(d.property, StyleProperty::DivideReverse(Axis::Y)));

    let mut seen = std::collections::HashSet::new();
    let mut remaining = Vec::new();
    let mut pairs: Vec<String> = Vec::new();
    for prop in props.drain(..).rev() {
        if matches!(
            prop,
            StyleProperty::SpaceX(_)
                | StyleProperty::SpaceY(_)
                | StyleProperty::DivideX(_)
                | StyleProperty::DivideY(_)
        ) {
            let (dim, start_key, end_key, reversed, non_negative) = match &prop {
                StyleProperty::SpaceX(dim) => (
                    dim,
                    "marginInlineStart",
                    "marginInlineEnd",
                    space_x_reversed,
                    false,
                ),
                StyleProperty::SpaceY(dim) => {
                    (dim, "marginTop", "marginBottom", space_y_reversed, false)
                }
                StyleProperty::DivideX(dim) => (
                    dim,
                    "borderStartWidth",
                    "borderEndWidth",
                    divide_x_reversed,
                    true,
                ),
                StyleProperty::DivideY(dim) => (
                    dim,
                    "borderTopWidth",
                    "borderBottomWidth",
                    divide_y_reversed,
                    true,
                ),
                _ => unreachable!(),
            };
            if let Some(js) = viewport_dim_js(dim, non_negative) {
                let (start_val, end_val) = if reversed {
                    (js.as_str(), "0")
                } else {
                    ("0", js.as_str())
                };
                if seen.insert(end_key) {
                    pairs.push(format!("{end_key}: {end_val}"));
                }
                if seen.insert(start_key) {
                    pairs.push(format!("{start_key}: {start_val}"));
                }
                continue;
            }
            if prop.unsupported_on_native().is_none() {
                seen.insert(start_key);
                seen.insert(end_key);
            }
        } else if let Some(keys) = viewport_style_keys(&prop) {
            if let Some(value) = viewport_value(&prop) {
                for &key in keys.iter().rev() {
                    if seen.insert(key) {
                        pairs.push(format!("{key}: {value}"));
                    }
                }
                continue;
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
    composed_pairs.extend(pairs);
    (!composed_pairs.is_empty()).then(|| format!("{{ {} }}", composed_pairs.join(", ")))
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

fn viewport_translate_dim_js(dim: &Dimension, theme: &Theme) -> Option<String> {
    if let Some(js) = viewport_dim_js(dim, false) {
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

fn compose_viewport_transform(props: &[StyleProperty], theme: &Theme) -> Option<String> {
    let mut parts: Vec<String> = Vec::new();
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
                    if let Some(js) = viewport_translate_dim_js(x, theme) {
                        parts.push(format!("{{ translateX: {js} }}"));
                    }
                }
                if let Some(y) = values.get(1) {
                    if let Some(js) = viewport_translate_dim_js(y, theme) {
                        parts.push(format!("{{ translateY: {js} }}"));
                    }
                }
            }
        } else {
            if let Some(x) = props.iter().rev().find_map(|p| match p {
                StyleProperty::TranslateX(d) => Some(d),
                _ => None,
            }) {
                if let Some(js) = viewport_translate_dim_js(x, theme) {
                    parts.push(format!("{{ translateX: {js} }}"));
                }
            }
            if let Some(y) = props.iter().rev().find_map(|p| match p {
                StyleProperty::TranslateY(d) => Some(d),
                _ => None,
            }) {
                if let Some(js) = viewport_translate_dim_js(y, theme) {
                    parts.push(format!("{{ translateY: {js} }}"));
                }
            }
        }
    }

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

enum RingWidthExpr {
    Static(f64),
    Viewport(String),
}

fn ring_width_expr(length: &Length, theme: &Theme) -> Option<RingWidthExpr> {
    if let Some(js) = viewport_length_js(length, true) {
        return Some(RingWidthExpr::Viewport(js));
    }
    if length.unresolved_unit().is_none() && length.css_expression().is_none() {
        return Some(RingWidthExpr::Static(length.px(theme)));
    }
    None
}

fn compose_viewport_box_shadow(props: &[StyleProperty], theme: &Theme) -> Option<String> {
    let resolve_color = |color: &Color| crate::style::resolve_theme_color(color, theme);
    let paint = |c: Option<&Color>, fallback: &str| {
        c.filter(|c| !c.is_initial()).map_or_else(
            || fallback.to_string(),
            |c| resolve_color(c).trim_matches('\'').to_string(),
        )
    };
    let color_of = |find: fn(&StyleProperty) -> Option<&Color>| {
        props
            .iter()
            .find_map(find)
            .filter(|c| !c.is_initial())
            .map(|c| resolve_color(c).trim_matches('\'').to_string())
    };
    let ring = props.iter().rev().find_map(|p| match p {
        StyleProperty::RingWidth(l) => ring_width_expr(l, theme),
        _ => None,
    });
    let inset_ring = props.iter().rev().find_map(|p| match p {
        StyleProperty::InsetRingWidth(l) => ring_width_expr(l, theme),
        _ => None,
    });
    let ring_offset = props.iter().rev().find_map(|p| match p {
        StyleProperty::RingOffsetWidth(l) => ring_width_expr(l, theme),
        _ => None,
    });
    let ring_color = props.iter().rev().find_map(|p| match p {
        StyleProperty::RingColor(c) => Some(c),
        _ => None,
    });
    let inset_ring_color = props.iter().rev().find_map(|p| match p {
        StyleProperty::InsetRingColor(c) => Some(c),
        _ => None,
    });
    let inset = if props.iter().any(|p| matches!(p, StyleProperty::RingInset)) {
        "inset "
    } else {
        ""
    };

    let format_px = |expr: &RingWidthExpr| match expr {
        RingWidthExpr::Static(px) => format!("{px}px"),
        RingWidthExpr::Viewport(js) => format!("${{{js}}}px"),
    };

    let mut layers: Vec<String> = Vec::new();
    if let Some((_, static_shadow)) = crate::style::box_shadow_entry(
        &props
            .iter()
            .filter(|p| {
                matches!(
                    p,
                    StyleProperty::InsetShadow(_) | StyleProperty::InsetShadowColor(_)
                )
            })
            .cloned()
            .collect::<Vec<_>>(),
        theme,
    ) {
        layers.push(static_shadow.trim_matches('\'').to_string());
    }
    if let Some(width) = &inset_ring {
        layers.push(format!(
            "inset 0 0 0 {} {}",
            format_px(width),
            paint(inset_ring_color, crate::style::RING_COLOR)
        ));
    }
    if let Some(width) = &ring_offset {
        layers.push(format!(
            "{inset}0 0 0 {} {}",
            format_px(width),
            color_of(|p| match p {
                StyleProperty::RingOffsetColor(c) => Some(c),
                _ => None,
            })
            .unwrap_or_else(|| crate::style::RING_OFFSET_COLOR.to_string()),
        ));
    }
    if let Some(width) = &ring {
        let total = match (width, &ring_offset) {
            (RingWidthExpr::Static(w), Some(RingWidthExpr::Static(o))) => format!("{}px", w + o),
            (RingWidthExpr::Static(w), Some(RingWidthExpr::Viewport(o))) => {
                format!("${{{w} + ({o})}}px")
            }
            (RingWidthExpr::Viewport(w), Some(RingWidthExpr::Static(o))) if *o != 0.0 => {
                format!("${{({w}) + {o}}}px")
            }
            (RingWidthExpr::Viewport(w), Some(RingWidthExpr::Viewport(o))) => {
                format!("${{({w}) + ({o})}}px")
            }
            (other, _) => format_px(other),
        };
        layers.push(format!(
            "{inset}0 0 0 {total} {}",
            paint(ring_color, crate::style::RING_COLOR)
        ));
    }
    if let Some((_, static_shadow)) = crate::style::box_shadow_entry(
        &props
            .iter()
            .filter(|p| {
                matches!(
                    p,
                    StyleProperty::BoxShadow(_) | StyleProperty::ShadowColor(_)
                )
            })
            .cloned()
            .collect::<Vec<_>>(),
        theme,
    ) {
        let trimmed = static_shadow.trim_matches('\'');
        if trimmed != "none" {
            layers.push(trimmed.to_string());
        }
    }
    (!layers.is_empty()).then(|| format!("`{}`", layers.join(", ")))
}
