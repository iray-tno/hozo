//! Compiled styles and a caller's spread, composed instead of replaced (#1054).
//!
//! The renderer emits what it compiled from a class (`style`, a pattern's
//! `optionStyle`) before everything it re-emits from source, so JSX's
//! last-wins resolution let a spread's `style` replace the compiled one
//! outright. A wrapper written the ordinary way --
//!
//! ```tsx
//! function UiListbox({ className, ...rest }) {
//!   return <Listbox {...rest} className={cx(box, className)} />
//! }
//! ```
//!
//! -- lost every class the moment a caller passed `style`. The owner itself
//! composes class styles first and the caller's style after, so that is the
//! order to keep.
//!
//! The composition has to happen at run time: what a spread carries is not
//! known here. So a style attribute a spread might carry is held back, and
//! the spreads, with any props between them, go through `hozoSpreadStyles`
//! in their source order. It reads each spread once, exactly as the spread
//! itself would, and never goes back to `rest.style` -- a getter runs once.
//! An element with no spread, or whose spreads provably leave the key out
//! (`({ style, ...rest })`), is emitted as before: nothing is held back and
//! no helper is imported.

use hozo_ir::PassthroughProp;

/// Whether an attribute the renderer emits carries a style. `style`, and
/// the slot and pattern props named after it (`optionStyle`,
/// `contentContainerStyle`). A class prop handed on for the owner to
/// resolve is not one: it is not a style to compose.
fn is_style_attribute(name: &str) -> bool {
    name == "style" || name.ends_with("Style")
}

/// Style attributes held back because a spread might carry them.
pub(crate) struct HeldStyles<'a> {
    /// `spread_excludes` of each spread on the element.
    spreads: Vec<&'a [String]>,
    pub(crate) held: Vec<(String, String)>,
}

impl<'a> HeldStyles<'a> {
    pub(crate) fn new(passthrough: &'a [PassthroughProp]) -> Self {
        HeldStyles {
            spreads: passthrough
                .iter()
                .filter(|prop| prop.is_spread)
                .map(|prop| prop.spread_excludes.as_slice())
                .collect(),
            held: Vec::new(),
        }
    }

    /// Emits ` name={value}`, or holds it back when a spread could carry
    /// `name`. `attribute` is the text the renderer would have pushed.
    pub(crate) fn emit(&mut self, props_text: &mut String, attribute: &str) {
        match split_attribute(attribute) {
            Some((name, value))
                if is_style_attribute(name)
                    && self
                        .spreads
                        .iter()
                        .any(|excludes| !excludes.iter().any(|key| key == name)) =>
            {
                self.held.push((name.to_string(), value.to_string()));
            }
            _ => props_text.push_str(attribute),
        }
    }
}

/// ` name={value}` as the renderer writes it.
fn split_attribute(attribute: &str) -> Option<(&str, &str)> {
    let (name, value) = attribute.trim_start().split_once("={")?;
    let value = value.strip_suffix('}')?;
    (!name.is_empty() && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_'))
        .then_some((name, value))
}

/// `{...expr}` to `expr`.
pub(crate) fn spread_expression(raw: &str) -> Option<&str> {
    raw.trim()
        .strip_prefix('{')?
        .strip_suffix('}')?
        .trim()
        .strip_prefix("...")
        .map(str::trim)
}

/// A non-spread attribute between two spreads, as a one-entry object, so
/// it keeps its place among them. `None` for a shape this does not take
/// apart (an entity in a string, a value that is an element); the caller
/// then falls back to emitting the styles as before.
pub(crate) fn attribute_object(raw: &str) -> Option<String> {
    let raw = raw.trim();
    let Some((name, value)) = raw.split_once('=') else {
        return Some(format!("{{ {}: true }}", quote(raw)));
    };
    let value = value.trim();
    let value = if let Some(inner) = value.strip_prefix('{').and_then(|v| v.strip_suffix('}')) {
        format!("({})", inner.trim())
    } else if (value.starts_with('"') && value.ends_with('"'))
        || (value.starts_with('\'') && value.ends_with('\''))
    {
        // A JSX string is not a JS string: it has entities and no escapes.
        // The plain ones mean the same either way.
        if value.len() < 2 || value[1..value.len() - 1].contains(['&', '\\', '\n']) {
            return None;
        }
        value.to_string()
    } else {
        return None;
    };
    Some(format!("{{ {}: {value} }}", quote(name.trim())))
}

fn quote(name: &str) -> String {
    format!("\"{}\"", name.replace('"', "\\\""))
}

/// ` {...hozoSpreadStyles({ style: … }, ["style"], a, { "x": 1 }, b)}`.
/// `last` lists the keys whose held value already ends with a style the
/// author wrote after every spread: in source that one wins, so a spread's
/// copy of the key is dropped rather than composed.
pub(crate) fn helper_call(held: &[(String, String)], last: &[String], args: &[String]) -> String {
    let styles = held
        .iter()
        .map(|(name, value)| format!("{name}: {value}"))
        .collect::<Vec<_>>()
        .join(", ");
    let last = last
        .iter()
        .map(|name| quote(name))
        .collect::<Vec<_>>()
        .join(", ");
    format!(
        " {{...hozoSpreadStyles({{ {styles} }}, [{last}], {})}}",
        args.join(", ")
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_style_attributes_split() {
        assert_eq!(
            split_attribute(" style={[hozoStyles.hozo0, s]}"),
            Some(("style", "[hozoStyles.hozo0, s]"))
        );
        assert_eq!(
            split_attribute(" optionStyle={hozoStyles.hozo1}"),
            Some(("optionStyle", "hozoStyles.hozo1"))
        );
        assert_eq!(split_attribute(" style=\"x\""), None);
        assert!(!is_style_attribute("className"));
    }

    #[test]
    fn attributes_between_spreads_keep_their_meaning_or_refuse() {
        assert_eq!(
            attribute_object("disabled").as_deref(),
            Some("{ \"disabled\": true }")
        );
        assert_eq!(
            attribute_object("aria-label=\"Go\"").as_deref(),
            Some("{ \"aria-label\": \"Go\" }")
        );
        assert_eq!(
            attribute_object("onPress={() => go({ a: 1 })}").as_deref(),
            Some("{ \"onPress\": (() => go({ a: 1 })) }")
        );
        assert_eq!(attribute_object("title=\"a &amp; b\""), None);
        assert_eq!(attribute_object("icon=<X />"), None);
    }

    #[test]
    fn spread_text_is_unwrapped() {
        assert_eq!(spread_expression("{...rest}"), Some("rest"));
        assert_eq!(spread_expression("{ ...props.a }"), Some("props.a"));
        assert_eq!(spread_expression("style={s}"), None);
    }
}
