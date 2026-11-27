//! A condition spelled as the variant prefix an author wrote, for messages
//! and keys.

use hozo_ir::{Breakpoint, Condition};

use super::environment::environment_name;
use super::expr::expr_key;

/// `None` for `Always` (uses the node's base style name directly);
/// otherwise a name-safe suffix identifying the condition.
pub(super) fn condition_suffix(condition: &Condition) -> Option<String> {
    match condition {
        Condition::Always => None,
        // Each atom's own suffix, joined. Names the combination rather
        // than the first of it, so `md:hover:` and `md:focus:` don't share
        // a style entry.
        Condition::All(conditions) => {
            let mut non_expr = Vec::new();
            let mut exprs = Vec::new();
            for cond in conditions {
                if let Some(suffix) = condition_suffix(cond) {
                    if matches!(cond, Condition::Expr(_)) {
                        exprs.push(suffix);
                    } else {
                        non_expr.push(suffix);
                    }
                }
            }
            non_expr.extend(exprs);
            Some(non_expr.join("_"))
        }
        Condition::Hover => Some("hover".to_string()),
        Condition::Focus => Some("focus".to_string()),
        Condition::FocusVisible => Some("focusvisible".to_string()),
        Condition::LastChild => Some("last".to_string()),
        Condition::Disabled => Some("disabled".to_string()),
        Condition::Enabled => Some("enabled".to_string()),
        // Data-attribute predicates reach StyleSheet keys and need distinct JS
        // identifiers so sibling data conditions (`data-open:` and
        // `data-[state=open]:`) do not overwrite each other.
        Condition::DataAttribute(selector) => {
            if let Some(key) = crate::candidate::data_fact_key(selector) {
                return Some(
                    key.replace('_', "__")
                        .replace('-', "_")
                        .replace('=', "_eq_"),
                );
            }
            Some("data".to_string())
        }
        Condition::Supports(_) => Some("supports".to_string()),
        Condition::HasSelector(selector) => {
            let clean: String = selector
                .chars()
                .filter(|c| c.is_ascii_alphanumeric())
                .collect();
            Some(if clean.is_empty() {
                "has".to_string()
            } else {
                format!("has_{clean}")
            })
        }
        Condition::Has(inner) => Some(format!(
            "has{}",
            condition_suffix(inner).unwrap_or_default()
        )),
        Condition::Not(inner) => Some(format!(
            "not{}",
            condition_suffix(inner).unwrap_or_default()
        )),
        Condition::Environment(query) => Some(environment_name(*query).replace('-', "")),
        Condition::Group(inner) => Some(format!(
            "group{}",
            condition_suffix(inner).unwrap_or_default()
        )),
        Condition::Peer(inner) => Some(format!(
            "peer{}",
            condition_suffix(inner).unwrap_or_default()
        )),
        Condition::In(inner) => Some(format!("in{}", condition_suffix(inner).unwrap_or_default())),
        Condition::Inert => Some("inert".to_string()),
        Condition::Aria(state) => Some(format!("aria{state}")),
        Condition::Pressed => Some("pressed".to_string()),
        Condition::Dark => Some("dark".to_string()),
        Condition::FirstChild => Some("first".to_string()),
        Condition::Structural(structural) => {
            Some(structural.variant_name().replace(['-', '+', '(', ')'], ""))
        }
        Condition::FormState(state) => Some(state.variant_name().replace('-', "")),
        // Named by the threshold, since a length can hold characters a
        // style identifier cannot -- and by direction, so `min-[500px]:`
        // and `max-[500px]:` don't share an entry.
        Condition::Container {
            name,
            at_least,
            value,
        } => Some(format!(
            "cq{}{}{}",
            name.as_deref().unwrap_or(""),
            if *at_least { "min" } else { "max" },
            value
                .chars()
                .filter(|c| c.is_ascii_alphanumeric())
                .collect::<String>(),
        )),
        Condition::Width { at_least, value } => Some(format!(
            "{}{}",
            if *at_least { "min" } else { "max" },
            value
                .chars()
                .filter(|c| c.is_ascii_alphanumeric())
                .collect::<String>(),
        )),
        Condition::PseudoElement(pseudo) => Some(pseudo.variant_name().replace('-', "")),
        Condition::Subtree { direct } => Some(if *direct {
            "child".to_string()
        } else {
            "descendant".to_string()
        }),
        Condition::FocusWithin => Some("focuswithin".to_string()),
        Condition::Target => Some("target".to_string()),
        Condition::Open => Some("open".to_string()),
        Condition::Control(state) => Some(state.variant_name().to_string()),
        Condition::Visited => Some("visited".to_string()),
        Condition::StartingStyle => Some("starting".to_string()),
        // Named by position rather than by content: a selector can hold
        // any character at all, and a style identifier can't. The name
        // only has to be unique within the file and stable across a
        // compile -- these entries are refused before anything references
        // them, so the name never reaches the output.
        Condition::ArbitrarySelector(_) => Some("sel".to_string()),
        Condition::ArbitraryAtRule(_) => Some("atrule".to_string()),
        Condition::Responsive(bp) => Some(
            match bp {
                Breakpoint::Sm => "sm",
                Breakpoint::Md => "md",
                Breakpoint::Lg => "lg",
                Breakpoint::Xl => "xl",
                Breakpoint::Xl2 => "xl2",
            }
            .to_string(),
        ),
        Condition::Expr(expr) => Some(format!("cond_{}", expr_key(expr))),
    }
}

/// A condition as an author writes it in front of a class, for a message.
///
/// Not `condition_suffix`: that one has to be an identifier, so it read
/// `group-ariachecked:`, `hashover:`, `focusvisible:`, and every `data-*`
/// came out as `data:` -- a refusal naming a variant nobody wrote.
///
/// Widths and container sizes are resolved to pixels when parsed, so they
/// come back in the bracket form (`min-[768px]`, `@min-[384px]`) rather
/// than the name; that is still a class Tailwind accepts. `None` for what
/// is not a variant at all: a guard from an expression.
pub(super) fn variant_spelling(condition: &Condition) -> Option<String> {
    let inner = |inner: &Condition| variant_spelling(inner).unwrap_or_else(|| "…".to_string());
    Some(match condition {
        Condition::Always | Condition::Expr(_) => return None,
        Condition::All(conditions) => conditions
            .iter()
            .filter_map(variant_spelling)
            .collect::<Vec<_>>()
            .join(":"),
        Condition::Responsive(bp) => match bp {
            Breakpoint::Sm => "sm",
            Breakpoint::Md => "md",
            Breakpoint::Lg => "lg",
            Breakpoint::Xl => "xl",
            Breakpoint::Xl2 => "2xl",
        }
        .to_string(),
        Condition::Subtree { direct } => if *direct { "*" } else { "**" }.to_string(),
        Condition::Container {
            name,
            at_least,
            value,
        } => format!(
            "@{}-[{value}]{}",
            if *at_least { "min" } else { "max" },
            name.as_deref()
                .map(|name| format!("/{name}"))
                .unwrap_or_default()
        ),
        Condition::Width { at_least, value } => {
            format!("{}-[{value}]", if *at_least { "min" } else { "max" })
        }
        Condition::Hover => "hover".to_string(),
        Condition::Focus => "focus".to_string(),
        Condition::FocusVisible => "focus-visible".to_string(),
        Condition::Disabled => "disabled".to_string(),
        Condition::Enabled => "enabled".to_string(),
        Condition::Pressed => "pressed".to_string(),
        Condition::Dark => "dark".to_string(),
        Condition::FirstChild => "first".to_string(),
        Condition::LastChild => "last".to_string(),
        Condition::Aria(state) => format!("aria-{state}"),
        Condition::Environment(query) => environment_name(*query).to_string(),
        // Held as the selector, `[data-state="open"]`: back to
        // `data-[state=open]`, or `data-open` for a bare attribute.
        Condition::DataAttribute(selector) => {
            let attribute = selector.trim_start_matches('[').trim_end_matches(']');
            let attribute = attribute.strip_prefix("data-").unwrap_or(attribute);
            if attribute.contains('=') {
                format!("data-[{}]", attribute.replace('"', ""))
            } else {
                format!("data-{attribute}")
            }
        }
        Condition::Supports(query) => format!("supports-[{query}]"),
        Condition::Has(condition) => format!("has-{}", inner(condition)),
        Condition::HasSelector(selector) => format!("has-[{selector}]"),
        Condition::Not(condition) => format!("not-{}", inner(condition)),
        Condition::Group(condition) => format!("group-{}", inner(condition)),
        Condition::Peer(condition) => format!("peer-{}", inner(condition)),
        Condition::In(condition) => format!("in-{}", inner(condition)),
        Condition::Structural(structural) => structural.variant_name(),
        Condition::FormState(state) => state.variant_name().to_string(),
        Condition::PseudoElement(pseudo) => pseudo.variant_name().to_string(),
        Condition::Control(state) => state.variant_name().to_string(),
        Condition::FocusWithin => "focus-within".to_string(),
        Condition::Target => "target".to_string(),
        Condition::Open => "open".to_string(),
        Condition::Inert => "inert".to_string(),
        Condition::Visited => "visited".to_string(),
        Condition::StartingStyle => "starting".to_string(),
        Condition::ArbitrarySelector(selector) | Condition::ArbitraryAtRule(selector) => {
            format!("[{selector}]")
        }
    })
}
