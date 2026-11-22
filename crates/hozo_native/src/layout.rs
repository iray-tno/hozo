//! Layout values React Native takes in another form: inline flex, safe-area
//! insets and viewport units.

use hozo_ir::{AlignSelf, Display, StyleDeclaration, StyleProperty};

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
/// The same treatment as `viewport_object` and for the same reason: the
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
    viewport_dimension(prop).is_some()
}

/// The RN style key a property needs and the runtime expression for its
/// value, if the value is relative to the viewport.
pub(super) fn viewport_dimension(prop: &StyleProperty) -> Option<(&'static str, String)> {
    let axis = |dim: &hozo_ir::Dimension| match dim {
        hozo_ir::Dimension::ViewportWidth(pct) => Some(viewport_share("width", *pct)),
        hozo_ir::Dimension::ViewportHeight(pct) => Some(viewport_share("height", *pct)),
        hozo_ir::Dimension::Length(hozo_ir::Length::Unit(pct, hozo_ir::LengthUnit::Vw)) => {
            Some(viewport_share("width", *pct))
        }
        hozo_ir::Dimension::Length(hozo_ir::Length::Unit(pct, hozo_ir::LengthUnit::Vh)) => {
            Some(viewport_share("height", *pct))
        }
        hozo_ir::Dimension::Css(text) | hozo_ir::Dimension::Length(hozo_ir::Length::Css(text)) => {
            viewport_calc(text)
        }
        _ => None,
    };
    let padding = match prop {
        StyleProperty::PaddingTop(length) => Some(("paddingTop", length)),
        StyleProperty::PaddingRight(length) => Some(("paddingRight", length)),
        StyleProperty::PaddingBottom(length) => Some(("paddingBottom", length)),
        StyleProperty::PaddingLeft(length) => Some(("paddingLeft", length)),
        _ => None,
    };
    if let Some((key, length)) = padding {
        return axis(&hozo_ir::Dimension::Length(length.clone())).map(|value| (key, value));
    }
    let (key, dim) = match prop {
        StyleProperty::Width(d) => ("width", d),
        StyleProperty::Height(d) => ("height", d),
        StyleProperty::MinWidth(d) => ("minWidth", d),
        StyleProperty::MinHeight(d) => ("minHeight", d),
        StyleProperty::MaxWidth(d) => ("maxWidth", d),
        StyleProperty::MaxHeight(d) => ("maxHeight", d),
        // The logical sizes map to the same two axes on this platform, so a
        // viewport value on them resolves the same way.
        StyleProperty::BlockSize(d) => ("height", d),
        StyleProperty::InlineSize(d) => ("width", d),
        StyleProperty::MinBlockSize(d) => ("minHeight", d),
        StyleProperty::MinInlineSize(d) => ("minWidth", d),
        StyleProperty::MaxBlockSize(d) => ("maxHeight", d),
        StyleProperty::MaxInlineSize(d) => ("maxWidth", d),
        _ => return None,
    };
    axis(dim).map(|value| (key, value))
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

/// A `calc()` of viewport lengths and fixed lengths, as the runtime
/// expression: `calc(100vw - 2rem)` is `__hozoViewport.width - 32` (#1312).
///
/// The same values `w-[50vw]` already reads at runtime, with addition and
/// subtraction between them, so nothing has to be measured. Anything else in
/// a `calc()` -- a percentage, which needs the parent's size, a font-relative
/// unit, multiplication, a nested function -- is `None`, and the class keeps
/// its refusal. So does a `calc()` with no viewport term, which this is not
/// for.
pub(super) fn viewport_calc(text: &str) -> Option<String> {
    let inner = text.trim().strip_prefix("calc(")?.strip_suffix(')')?;
    if inner.contains(['(', ')', '*', '/', ',']) {
        return None;
    }
    let mut parts: Vec<String> = Vec::new();
    let mut viewport = false;
    let mut sign = '+';
    for token in inner.split_whitespace() {
        if token == "+" || token == "-" {
            sign = token.chars().next()?;
            continue;
        }
        let split = token.find(|c: char| c.is_ascii_alphabetic())?;
        let (number, unit) = token.split_at(split);
        let number: f64 = number.parse().ok()?;
        let term = match unit {
            "vw" => {
                viewport = true;
                viewport_share("width", number)
            }
            "vh" => {
                viewport = true;
                viewport_share("height", number)
            }
            "px" => format!("{number}"),
            // The 16px root `LengthUnit::Rem` already assumes on Native.
            "rem" => format!("{}", number * 16.0),
            _ => return None,
        };
        parts.push(if parts.is_empty() && sign == '+' {
            term
        } else {
            format!("{sign} {term}")
        });
        sign = '+';
    }
    (viewport && !parts.is_empty()).then(|| parts.join(" "))
}

/// The inline style object for a group's viewport-relative sizes, if it has
/// any.
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
pub(super) fn viewport_object(props: &[StyleProperty]) -> Option<String> {
    let mut pairs: Vec<String> = Vec::new();
    for prop in props {
        let Some((key, value)) = viewport_dimension(prop) else {
            continue;
        };
        pairs.push(format!("{key}: {value}"));
    }
    (!pairs.is_empty()).then(|| format!("{{ {} }}", pairs.join(", ")))
}
