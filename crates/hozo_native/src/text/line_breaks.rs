//! Line breaking and truncation, which React Native sets through props.

use crate::*;

use super::wrap::is_text_primitive;

/// React Native expresses text truncation as props on `Text` --
/// `numberOfLines` and `ellipsizeMode` -- where CSS uses `white-space` and
/// `text-overflow`. The mapping is from the *combination* of declarations
/// to one prop pair, not property-by-property, which is why it lives here
/// rather than in `style::property_and_value`.
///
/// `None` means this node can't absorb them (nothing asked for truncation,
/// or it isn't a `Text`), and the caller refuses them instead.
/// Android's `textBreakStrategy` for `text-balance` (`balanced`) or
/// `text-pretty` (`highQuality`), on a text element and unconditionally --
/// a prop has one value, so a variant cannot switch it. The last one written
/// wins, as in CSS.
pub(crate) fn text_break_strategy(node: &Node) -> Option<&'static str> {
    if !is_text_primitive(node.primitive) {
        return None;
    }
    node.style.iter().rev().find_map(|declaration| {
        if declaration.condition != hozo_ir::Condition::Always {
            return None;
        }
        match line_breaking(&declaration.property) {
            Some((name, value)) if name == "text-wrap" => match value.as_str() {
                "balance" => Some("balanced"),
                "pretty" => Some("highQuality"),
                _ => None,
            },
            _ => None,
        }
    })
}

/// iOS's `lineBreakStrategy` for `break-keep`, which React Native exposes
/// as `lineBreakStrategyIOS`.
///
/// `word-break: keep-all` keeps CJK runs whole; iOS's nearest strategy is
/// `hangul-word`, which keeps Korean words whole and leaves Chinese and
/// Japanese breaking between characters as before. So it is lowered for the
/// half it covers and still reported for the half it does not (`render.rs`).
/// Android has no such prop; see #813.
pub(crate) fn line_break_strategy_ios(node: &Node) -> Option<&'static str> {
    if !is_text_primitive(node.primitive) {
        return None;
    }
    node.style.iter().rev().find_map(|declaration| {
        if declaration.condition != hozo_ir::Condition::Always {
            return None;
        }
        match line_breaking(&declaration.property) {
            Some((name, value)) if name == "word-break" && value == "keep-all" => {
                Some("hangul-word")
            }
            _ => None,
        }
    })
}

/// The property and value of a declaration about where text breaks into
/// lines -- `text-wrap`, `word-break`, `overflow-wrap`, `line-break` --
/// whichever of the IR's shapes carries it: a keyword (`text-balance`), a
/// pair (`break-normal`, which sets two of them to `normal`), or a
/// declaration written out (`[line-break:strict]`).
pub(crate) fn line_breaking(property: &StyleProperty) -> Option<(String, String)> {
    let breaking = |name: &str| {
        matches!(
            name,
            "text-wrap" | "word-break" | "overflow-wrap" | "line-break"
        )
    };
    match property {
        StyleProperty::Keyword(name, value) if breaking(name) => {
            Some((name.to_string(), value.to_string()))
        }
        StyleProperty::KeywordPair(first, first_value, second, second_value)
            if breaking(first) && breaking(second) =>
        {
            // Both halves: a pair is one intention, so it is "normal" only
            // when both are, and otherwise reported by its second name.
            let value = if *first_value == "normal" && *second_value == "normal" {
                "normal"
            } else {
                second_value
            };
            Some((second.to_string(), value.to_string()))
        }
        StyleProperty::WebOnly(name, value) | StyleProperty::Arbitrary(name, value)
            if breaking(name) =>
        {
            Some((name.clone(), value.clone()))
        }
        _ => None,
    }
}

pub(crate) fn truncation_props(node: &Node) -> Option<Vec<(&'static str, String)>> {
    // `numberOfLines` exists on Text alone; on a View there's nothing to
    // put it on, so truncation there really is unsupported.
    if !is_text_primitive(node.primitive) {
        return None;
    }
    // The last of each wins, as the later declaration does in CSS; the
    // declarations are already in the order the cascade gives them.
    let last = |pick: fn(&StyleProperty) -> bool| {
        node.style
            .iter()
            .rev()
            .find(|d| pick(&d.property))
            .map(|d| &d.property)
    };
    // `line-clamp-<n>` is the same mechanism with a line count: React
    // Native has one prop for both, so the two utilities meet here.
    if let Some(StyleProperty::LineClamp(lines)) =
        last(|property| matches!(property, StyleProperty::LineClamp(_)))
    {
        return match lines {
            // `line-clamp-none` means no clamping, which on this platform
            // is the absence of the prop rather than a value for it.
            None => Some(Vec::new()),
            // A clamp Hozo couldn't read as a count is refused by name in
            // `StyleProperty::native_gap`, so there is nothing to emit for
            // it here.
            Some(n) => Some(
                n.lines()
                    .map_or_else(Vec::new, |lines| vec![("numberOfLines", lines.to_string())]),
            ),
        };
    }
    if last(|property| matches!(property, StyleProperty::WhiteSpace(_)))
        != Some(&StyleProperty::WhiteSpace(WhiteSpace::NoWrap))
    {
        return None;
    }

    let mut props = vec![("numberOfLines", "1".to_string())];
    if last(|property| matches!(property, StyleProperty::TextOverflow(_)))
        != Some(&StyleProperty::TextOverflow(TextOverflow::Ellipsis))
    {
        // RN's default `ellipsizeMode` is `tail`, i.e. an ellipsis. Nothing
        // asked for one here, so clipping is the closer match to plain
        // `white-space: nowrap`.
        props.push(("ellipsizeMode", "clip".to_string()));
    }
    Some(props)
}

pub(crate) fn is_truncation_declaration(property: &StyleProperty) -> bool {
    matches!(
        property,
        StyleProperty::WhiteSpace(WhiteSpace::NoWrap)
            | StyleProperty::TextOverflow(_)
            | StyleProperty::LineClamp(_)
    )
}

/// Why a truncation-related declaration can't be honoured when it wasn't
/// absorbed into props. Kept out of `StyleProperty::unsupported_on_native`
/// because the answer depends on the node, which that method can't see.
pub(crate) fn truncation_only_reason(property: &StyleProperty) -> Option<String> {
    match property {
        StyleProperty::TextOverflow(_) => Some(
            "`text-overflow`: React Native truncates via the `numberOfLines` prop on Text, which \
             needs `white-space: nowrap` (Tailwind's `truncate`) on a Text element."
                .to_string(),
        ),
        StyleProperty::WhiteSpace(WhiteSpace::NoWrap) => Some(
            "`white-space: nowrap`: React Native suppresses wrapping with the `numberOfLines` \
             prop, which only exists on Text."
                .to_string(),
        ),
        _ => None,
    }
}
