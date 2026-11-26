//! Layout values React Native takes in another form: inline flex, safe-area
//! insets and viewport units.

use hozo_ir::{
    AlignSelf, Dimension, Display, Length, LengthUnit, PropertyValue, StyleDeclaration,
    StyleProperty,
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

/// Only layout slots with an explicit Native projection use the window.
/// The unit itself does not decide which style keys can accept it.
pub(super) fn viewport_value(prop: &StyleProperty) -> Option<String> {
    window_layout_keys(prop)?;
    let length = match prop.value() {
        PropertyValue::Length(length) | PropertyValue::Dimension(Dimension::Length(length)) => {
            length
        }
        PropertyValue::Dimension(Dimension::ViewportWidth(pct)) if pct.is_finite() => {
            return Some(viewport_share("width", *pct));
        }
        PropertyValue::Dimension(Dimension::ViewportHeight(pct)) if pct.is_finite() => {
            return Some(viewport_share("height", *pct));
        }
        PropertyValue::Dimension(Dimension::Css(text)) => return viewport_calc(text),
        _ => return None,
    };
    let gap = matches!(
        prop,
        StyleProperty::Gap(_) | StyleProperty::RowGap(_) | StyleProperty::ColumnGap(_)
    );
    match length {
        // A negative literal isn't a valid CSS gap. A valid calculation
        // that evaluates below zero is clamped at used-value time instead.
        Length::Unit(pct, _) if gap && *pct < 0.0 => None,
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
            if gap {
                format!("Math.max(0, {expr})")
            } else {
                expr
            }
        }),
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
pub(super) fn take_viewport_object(props: &mut Vec<StyleProperty>) -> Option<String> {
    // Check without allocation on the ordinary path. The group is already
    // ordered; do not let the inline object (after the static entry) give
    // an earlier write priority over a later alias for the same Native key.
    if !props.iter().any(is_viewport_sized) {
        return None;
    }
    let mut seen = std::collections::HashSet::new();
    let mut remaining = Vec::new();
    let mut pairs: Vec<String> = Vec::new();
    for prop in props.drain(..).rev() {
        if let Some(keys) = window_layout_keys(&prop) {
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
    (!pairs.is_empty()).then(|| format!("{{ {} }}", pairs.join(", ")))
}
