//! Placeholder, selection and caret colours, which are `TextInput` props
//! rather than styles.

use crate::*;

/// `placeholder-*` and `placeholder:text-*` as React Native carries them:
/// a prop on `TextInput`, not a style on anything.
///
/// Lives here rather than in `unsupported_on_native` because the answer
/// depends on the node -- on a `TextInput` it lowers, anywhere else there
/// is no placeholder for it to colour.
fn is_valid_field_colour(colour: &hozo_ir::Color) -> bool {
    !matches!(
        colour,
        hozo_ir::Color::Css(text) if !hozo_ir::native_color_literal_valid(text)
    )
}

pub(crate) fn placeholder_colour(
    declaration: &StyleDeclaration,
) -> Option<(&hozo_ir::Color, bool)> {
    match (&declaration.property, &declaration.condition) {
        (StyleProperty::PlaceholderColor(c), Condition::Always) if is_valid_field_colour(c) => {
            Some((c, false))
        }
        (StyleProperty::PlaceholderColor(c), Condition::Dark) if is_valid_field_colour(c) => {
            Some((c, true))
        }
        (
            StyleProperty::TextColor(c),
            Condition::PseudoElement(hozo_ir::PseudoElement::Placeholder),
        ) if absolute_placeholder_colour(c) => Some((c, false)),
        (StyleProperty::TextColor(c), Condition::All(conditions))
            if absolute_placeholder_colour(c)
                && conditions.len() == 2
                && conditions.contains(&Condition::Dark)
                && conditions.contains(&Condition::PseudoElement(
                    hozo_ir::PseudoElement::Placeholder,
                )) =>
        {
            Some((c, true))
        }
        // Colour is one RN prop, not arbitrary pseudo-element typography or
        // an interaction callback. Unsupported stacks still diagnose.
        _ => None,
    }
}

// This new pseudo-element adapter is deliberately narrower than CSS. A
// current/inherited colour needs context, and arbitrary CSS colour functions
// are not automatically RN ColorValues. Do not bless those just because a
// colour-shaped prop was emitted; resolved tokens and hex need no CSS engine.
pub(super) fn absolute_placeholder_colour(colour: &hozo_ir::Color) -> bool {
    match colour {
        hozo_ir::Color::Token(token) => {
            !matches!(hozo_ir::split_color_alpha(token).0, "current" | "inherit")
        }
        hozo_ir::Color::Keyword("transparent") => true,
        hozo_ir::Color::Css(value) => value.strip_prefix('#').is_some_and(|hex| {
            matches!(hex.len(), 3 | 4 | 6 | 8) && hex.bytes().all(|byte| byte.is_ascii_hexdigit())
        }),
        _ => false,
    }
}

pub(crate) fn placeholder_props(
    node: &Node,
    theme: &Theme,
    runtime: &mut RuntimeNeeds,
) -> Option<Vec<(&'static str, String)>> {
    if node.primitive != Primitive::TextInput
        || !node.style.iter().any(|d| placeholder_colour(d).is_some())
    {
        return None;
    }
    placeholder_value(&node.style, theme, runtime)
        .map(|value| vec![("placeholderTextColor", value)])
}

/// Pattern input slots use the same property adapter, but the prop travels to
/// their real field rather than being assigned to the enclosing widget.
pub(crate) fn placeholder_value(
    declarations: &[StyleDeclaration],
    theme: &Theme,
    runtime: &mut RuntimeNeeds,
) -> Option<String> {
    scheme_colour_value(declarations, theme, runtime, placeholder_colour)
}

/// One colour prop per scheme: the last light colour, and the last dark one
/// over it. A paired token follows the scheme the rest of the field does.
pub(super) fn scheme_colour_value(
    declarations: &[StyleDeclaration],
    theme: &Theme,
    runtime: &mut RuntimeNeeds,
    pick: fn(&StyleDeclaration) -> Option<(&hozo_ir::Color, bool)>,
) -> Option<String> {
    let dark_theme = theme.dark();
    let mut light = None;
    let mut dark = None;
    for declaration in declarations {
        let Some((colour, dark_only)) = pick(declaration) else {
            continue;
        };
        if dark_only {
            dark = Some(style::placeholder_color(
                colour,
                dark_theme.as_ref().unwrap_or(theme),
            ));
        } else {
            let value = style::placeholder_color(colour, theme);
            if let Some(palette) = &dark_theme {
                let shaded = style::placeholder_color(colour, palette);
                if shaded != value {
                    dark = Some(shaded);
                }
            }
            light = Some(value);
        }
    }
    // A paired token must follow the same scheme as the rest of the field.
    // No hook for a field with only an unpaired, unconditional colour.
    let value = if let Some(dark) = dark {
        runtime.hooks.push(RuntimeHook::Dark);
        format!(
            "__hozoDark ? {dark} : {}",
            light.unwrap_or_else(|| "undefined".to_string())
        )
    } else {
        light?
    };
    Some(value)
}

/// `selection:bg-*` as React Native carries it: `TextInput`'s
/// `selectionColor` prop, the highlight behind selected text.
///
/// Only the background, because that is all the prop is: `selection:text-*`
/// colours the selected glyphs on Web, and React Native has nothing to put
/// that on, so it keeps its diagnostic. On iOS the same prop also tints the
/// cursor and the selection handles; that is the platform's one control for
/// all three, not something Hozo adds.
pub(crate) fn selection_colour(declaration: &StyleDeclaration) -> Option<(&hozo_ir::Color, bool)> {
    let selection = Condition::PseudoElement(hozo_ir::PseudoElement::Selection);
    match (&declaration.property, &declaration.condition) {
        (StyleProperty::BackgroundColor(c), condition)
            if *condition == selection && absolute_placeholder_colour(c) =>
        {
            Some((c, false))
        }
        (StyleProperty::BackgroundColor(c), Condition::All(conditions))
            if absolute_placeholder_colour(c)
                && conditions.len() == 2
                && conditions.contains(&Condition::Dark)
                && conditions.contains(&selection) =>
        {
            Some((c, true))
        }
        _ => None,
    }
}

pub(crate) fn selection_props(
    node: &Node,
    theme: &Theme,
    runtime: &mut RuntimeNeeds,
) -> Option<Vec<(&'static str, String)>> {
    if node.primitive != Primitive::TextInput
        || !node.style.iter().any(|d| selection_colour(d).is_some())
    {
        return None;
    }
    scheme_colour_value(&node.style, theme, runtime, selection_colour)
        .map(|value| vec![("selectionColor", value)])
}

pub(crate) fn placeholder_only_reason(property: &StyleProperty) -> Option<String> {
    matches!(property, StyleProperty::PlaceholderColor(_)).then(|| {
        "`placeholder-*`: React Native carries this as `TextInput`'s `placeholderTextColor` prop, so it only means something on a TextInput"
            .to_string()
    })
}

/// `caret-*` as React Native carries it: `cursorColor` on TextInput.
/// `caret-*` and `dark:caret-*`, as `cursorColor` carries them. Any other
/// condition is not wired and is diagnosed, never applied unconditionally.
pub(crate) fn caret_colour(declaration: &StyleDeclaration) -> Option<(&hozo_ir::Color, bool)> {
    match (&declaration.property, &declaration.condition) {
        (StyleProperty::CaretColor(c), Condition::Always) if is_valid_field_colour(c) => {
            Some((c, false))
        }
        (StyleProperty::CaretColor(c), Condition::Dark) if is_valid_field_colour(c) => {
            Some((c, true))
        }
        _ => None,
    }
}

/// The last colour wins, as in CSS: the declarations are already in the
/// order the cascade gives them.
pub(crate) fn caret_props(
    node: &Node,
    theme: &Theme,
    runtime: &mut RuntimeNeeds,
) -> Option<Vec<(&'static str, String)>> {
    if node.primitive != Primitive::TextInput
        || !node.style.iter().any(|d| caret_colour(d).is_some())
    {
        return None;
    }
    scheme_colour_value(&node.style, theme, runtime, caret_colour)
        .map(|value| vec![("cursorColor", value)])
}

pub(crate) fn caret_only_reason() -> String {
    "`caret-*`: React Native carries this as `TextInput`'s `cursorColor` prop, so it only means \
     something on a TextInput"
        .to_string()
}
