//! Placeholder, selection and caret colours, which are `TextInput` props
//! rather than styles.

use crate::conditions::{resolve_condition_guard, ResolvedCondition, StyleTarget};
use crate::*;

/// `placeholder-*` and `placeholder:text-*` as React Native carries them:
/// a prop on `TextInput`, not a style on anything.
///
/// Lives here rather than in `unsupported_on_native` because the answer
/// depends on the node -- on a `TextInput` it lowers, anywhere else there
/// is no placeholder for it to colour.
fn is_valid_field_colour(colour: &hozo_ir::Color) -> bool {
    colour.is_valid_native_color()
}

// This pseudo-element adapter is deliberately narrower than CSS. A
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
        hozo_ir::Color::CssAlpha(value, _) => hozo_ir::hex_rgb_channels(value).is_some(),
        _ => false,
    }
}

/// Removes one specific `Condition::PseudoElement(pseudo)` from a standalone
/// or stacked condition, returning the remaining outer condition.
fn strip_pseudo(condition: &Condition, pseudo: hozo_ir::PseudoElement) -> Option<Condition> {
    match condition {
        Condition::PseudoElement(found) if *found == pseudo => Some(Condition::Always),
        Condition::All(conditions) => {
            let mut rest = Vec::new();
            let mut stripped = false;
            let mut pending: Vec<&Condition> = conditions.iter().rev().collect();
            while let Some(atom) = pending.pop() {
                match atom {
                    Condition::All(nested) => pending.extend(nested.iter().rev()),
                    Condition::PseudoElement(found) if *found == pseudo && !stripped => {
                        stripped = true;
                    }
                    other => rest.push(other.clone()),
                }
            }
            stripped.then(|| Condition::all(rest))
        }
        _ => None,
    }
}

fn placeholder_colour_decl(declaration: &StyleDeclaration) -> Option<(&hozo_ir::Color, Condition)> {
    match &declaration.property {
        StyleProperty::PlaceholderColor(c) if is_valid_field_colour(c) => {
            Some((c, declaration.condition.clone()))
        }
        StyleProperty::TextColor(c) if absolute_placeholder_colour(c) => {
            strip_pseudo(&declaration.condition, hozo_ir::PseudoElement::Placeholder)
                .map(|rem| (c, rem))
        }
        _ => None,
    }
}

fn selection_colour_decl(declaration: &StyleDeclaration) -> Option<(&hozo_ir::Color, Condition)> {
    match &declaration.property {
        StyleProperty::BackgroundColor(c) if absolute_placeholder_colour(c) => {
            strip_pseudo(&declaration.condition, hozo_ir::PseudoElement::Selection)
                .map(|rem| (c, rem))
        }
        _ => None,
    }
}

fn caret_colour_decl(declaration: &StyleDeclaration) -> Option<(&hozo_ir::Color, Condition)> {
    match &declaration.property {
        StyleProperty::CaretColor(c) if is_valid_field_colour(c) => {
            Some((c, declaration.condition.clone()))
        }
        _ => None,
    }
}

fn condition_selects_dark(condition: &Condition) -> bool {
    match condition {
        Condition::Dark => true,
        Condition::All(list) => list.iter().any(condition_selects_dark),
        _ => false,
    }
}

struct ChannelValue {
    expr: String,
    uses_interactive: bool,
}

#[allow(clippy::too_many_arguments)]
fn resolve_channel(
    declarations: &[StyleDeclaration],
    target: &StyleTarget<'_>,
    source: &str,
    theme: &Theme,
    runtime: &mut RuntimeNeeds,
    allow_interactive: bool,
    suppress_emit: bool,
    consumed: &mut [bool],
    pick: fn(&StyleDeclaration) -> Option<(&hozo_ir::Color, Condition)>,
) -> Option<ChannelValue> {
    let dark_theme = theme.dark();
    let mut base_light: Option<String> = None;
    let mut base_dark: Option<String> = None;
    let mut conditional: Vec<(String, String, bool)> = Vec::new();
    let mut scratch_runtime = RuntimeNeeds::default();

    for (index, declaration) in declarations.iter().enumerate() {
        let Some((colour, remaining)) = pick(declaration) else {
            continue;
        };
        let resolved = resolve_condition_guard(
            &remaining,
            target,
            source,
            &mut scratch_runtime,
            allow_interactive,
        );
        let Ok(outcome) = resolved else {
            continue;
        };
        consumed[index] = true;
        if suppress_emit {
            continue;
        }
        match outcome {
            ResolvedCondition::Never => {}
            ResolvedCondition::Always => {
                let value = style::placeholder_color(colour, theme);
                base_dark = dark_theme
                    .as_ref()
                    .map(|palette| style::placeholder_color(colour, palette))
                    .filter(|shaded| *shaded != value);
                base_light = Some(value);
            }
            ResolvedCondition::Guarded {
                expr,
                uses_interactive,
            } => {
                let value = if condition_selects_dark(&remaining) {
                    style::placeholder_color(colour, dark_theme.as_ref().unwrap_or(theme))
                } else {
                    let light = style::placeholder_color(colour, theme);
                    if let Some(shaded) = dark_theme
                        .as_ref()
                        .map(|palette| style::placeholder_color(colour, palette))
                        .filter(|shaded| *shaded != light)
                    {
                        scratch_runtime.hooks.push(RuntimeHook::Dark);
                        format!("(__hozoDark ? {shaded} : {light})")
                    } else {
                        light
                    }
                };
                conditional.push((expr, value, uses_interactive));
            }
        }
    }

    if suppress_emit || (base_light.is_none() && base_dark.is_none() && conditional.is_empty()) {
        return None;
    }

    runtime.hooks.extend(scratch_runtime.hooks);
    let mut acc = if let Some(dark) = base_dark {
        runtime.hooks.push(RuntimeHook::Dark);
        format!(
            "__hozoDark ? {dark} : {}",
            base_light.unwrap_or_else(|| "undefined".to_string())
        )
    } else {
        base_light.unwrap_or_else(|| "undefined".to_string())
    };
    let mut uses_interactive = false;
    for (guard, value, interactive) in conditional {
        uses_interactive |= interactive;
        acc = format!("{guard} ? {value} : {acc}");
    }
    Some(ChannelValue {
        expr: acc,
        uses_interactive,
    })
}

/// Lowered `TextInput` colour props (`placeholderTextColor`, `cursorColor`,
/// `selectionColor`), optional focus callback (`hozoFieldColors`), and which
/// declarations on `node.style` were consumed by them.
pub(crate) struct FieldColours {
    pub placeholder: Option<Vec<(&'static str, String)>>,
    pub caret: Option<Vec<(&'static str, String)>>,
    pub selection: Option<Vec<(&'static str, String)>>,
    pub interactive_callback: Option<String>,
    pub consumed: Vec<bool>,
}

pub(crate) fn resolve_field_colours(
    node: &Node,
    declarations: &[StyleDeclaration],
    target: &StyleTarget<'_>,
    source: &str,
    theme: &Theme,
    runtime: &mut RuntimeNeeds,
) -> FieldColours {
    let mut consumed = vec![false; declarations.len()];
    if node.primitive != Primitive::TextInput {
        return FieldColours {
            placeholder: None,
            caret: None,
            selection: None,
            interactive_callback: None,
            consumed,
        };
    }
    let authored: Vec<&str> = node
        .props
        .passthrough
        .iter()
        .filter_map(|prop| prop.name.as_deref())
        .collect();

    let mut placeholder = None;
    let mut caret = None;
    let mut selection = None;
    let mut interactive_fields: Vec<(&'static str, String)> = Vec::new();

    if let Some(channel) = resolve_channel(
        declarations,
        target,
        source,
        theme,
        runtime,
        true,
        authored.contains(&"placeholderTextColor"),
        &mut consumed,
        placeholder_colour_decl,
    ) {
        if channel.uses_interactive {
            interactive_fields.push(("placeholderTextColor", channel.expr));
        } else {
            placeholder = Some(vec![("placeholderTextColor", channel.expr)]);
        }
    }
    if let Some(channel) = resolve_channel(
        declarations,
        target,
        source,
        theme,
        runtime,
        true,
        authored.contains(&"cursorColor"),
        &mut consumed,
        caret_colour_decl,
    ) {
        if channel.uses_interactive {
            interactive_fields.push(("cursorColor", channel.expr));
        } else {
            caret = Some(vec![("cursorColor", channel.expr)]);
        }
    }
    if let Some(channel) = resolve_channel(
        declarations,
        target,
        source,
        theme,
        runtime,
        true,
        authored.contains(&"selectionColor"),
        &mut consumed,
        selection_colour_decl,
    ) {
        if channel.uses_interactive {
            interactive_fields.push(("selectionColor", channel.expr));
        } else {
            selection = Some(vec![("selectionColor", channel.expr)]);
        }
    }

    let interactive_callback = (!interactive_fields.is_empty()).then(|| {
        let uses_bare_ident = |expr: &str, ident: &str| {
            expr.match_indices(ident).any(|(start, _)| {
                let before = expr[..start].chars().next_back();
                let after = expr[start + ident.len()..].chars().next();
                !matches!(
                    before,
                    Some('a'..='z' | 'A'..='Z' | '0'..='9' | '_' | '$' | '.')
                ) && !matches!(after, Some('a'..='z' | 'A'..='Z' | '0'..='9' | '_' | '$'))
            })
        };
        let uses_focus_visible = interactive_fields
            .iter()
            .any(|(_, expr)| uses_bare_ident(expr, "focusVisible"));
        let uses_focused = interactive_fields
            .iter()
            .any(|(_, expr)| uses_bare_ident(expr, "focused"));
        let uses_touched = interactive_fields
            .iter()
            .any(|(_, expr)| uses_bare_ident(expr, "touched"));
        let mut params = Vec::new();
        if uses_focused {
            params.push("focused");
        }
        if uses_focus_visible {
            params.push("focusVisible");
        }
        if uses_touched {
            params.push("touched");
        }
        let entries = interactive_fields
            .into_iter()
            .map(|(key, expr)| format!("{key}: {expr}"))
            .collect::<Vec<_>>()
            .join(", ");
        format!("({{ {} }}) => ({{ {entries} }})", params.join(", "))
    });

    FieldColours {
        placeholder,
        caret,
        selection,
        interactive_callback,
        consumed,
    }
}

/// Pattern input slots (`Combobox`, `CommandPalette` `inputClassName`) use the
/// same placeholder colour adapter, without interactive callbacks.
pub(crate) fn placeholder_value_for_slot(
    declarations: &[StyleDeclaration],
    target: &StyleTarget<'_>,
    source: &str,
    theme: &Theme,
    runtime: &mut RuntimeNeeds,
) -> (Option<String>, Vec<bool>) {
    let mut consumed = vec![false; declarations.len()];
    let value = resolve_channel(
        declarations,
        target,
        source,
        theme,
        runtime,
        false,
        false,
        &mut consumed,
        placeholder_colour_decl,
    )
    .map(|channel| channel.expr);
    (value, consumed)
}

pub(crate) fn placeholder_only_reason(property: &StyleProperty) -> Option<String> {
    matches!(property, StyleProperty::PlaceholderColor(_)).then(|| {
        "`placeholder-*`: React Native carries this as `TextInput`'s `placeholderTextColor` prop, so it only means something on a TextInput"
            .to_string()
    })
}

pub(crate) fn caret_only_reason() -> String {
    "`caret-*`: React Native carries this as `TextInput`'s `cursorColor` prop, so it only means \
     something on a TextInput"
        .to_string()
}
