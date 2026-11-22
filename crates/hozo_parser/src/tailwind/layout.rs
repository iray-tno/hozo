//! Grid placement, order, columns and cursor.

use hozo_ir::{ColumnCount, GridLine, GridSpan, GridTracks, StyleProperty};

use super::dimension::parse_inline_size_suffix;

/// The grid track and placement utilities: `grid-cols-*`/`grid-rows-*`,
/// `col-start-*`/`col-end-*`/`row-start-*`/`row-end-*`, and the
/// `col-span-*`/`row-span-*` shorthands.
///
/// Prefix order matters here in a way it doesn't elsewhere: `col-span-` and
/// `col-start-` both begin with `col-`, so the shorthands are matched
/// before the bare-line form that would otherwise swallow them.
pub(super) fn parse_grid_placement(token: &str) -> Option<StyleProperty> {
    fn tracks(suffix: &str) -> Option<GridTracks> {
        Some(match suffix {
            "none" => GridTracks::None,
            "subgrid" => GridTracks::Subgrid,
            _ => GridTracks::Count(suffix.parse().ok()?),
        })
    }
    fn line(suffix: &str) -> Option<GridLine> {
        Some(match suffix {
            "auto" => GridLine::Auto,
            _ => GridLine::Line(suffix.parse().ok()?),
        })
    }
    fn span(suffix: &str) -> Option<GridSpan> {
        Some(match suffix {
            "auto" => GridSpan::Auto,
            "full" => GridSpan::Full,
            _ => GridSpan::Span(suffix.parse().ok()?),
        })
    }

    if let Some(rest) = token.strip_prefix("grid-cols-") {
        return tracks(rest).map(StyleProperty::GridTemplateColumns);
    }
    if let Some(rest) = token.strip_prefix("grid-rows-") {
        return tracks(rest).map(StyleProperty::GridTemplateRows);
    }
    if let Some(rest) = token.strip_prefix("col-span-") {
        return span(rest).map(StyleProperty::GridColumn);
    }
    if let Some(rest) = token.strip_prefix("row-span-") {
        return span(rest).map(StyleProperty::GridRow);
    }
    if let Some(rest) = token.strip_prefix("col-start-") {
        return line(rest).map(StyleProperty::GridColumnStart);
    }
    if let Some(rest) = token.strip_prefix("col-end-") {
        return line(rest).map(StyleProperty::GridColumnEnd);
    }
    if let Some(rest) = token.strip_prefix("row-start-") {
        return line(rest).map(StyleProperty::GridRowStart);
    }
    if let Some(rest) = token.strip_prefix("row-end-") {
        return line(rest).map(StyleProperty::GridRowEnd);
    }
    // `col-auto`/`row-auto` are the shorthand, not a single edge.
    match token {
        "col-auto" => Some(StyleProperty::GridColumn(GridSpan::Auto)),
        "row-auto" => Some(StyleProperty::GridRow(GridSpan::Auto)),
        _ => None,
    }
}

/// `order-<n>`, plus the two named extremes.
///
/// `order-first`/`order-last` are Tailwind's own sentinels rather than CSS
/// keywords -- `order` has none, so "first" is spelled as a number far
/// enough out that nothing outranks it. Matching the exact values matters:
/// they're what makes `order-first` beat a hand-written `order-[-999]`.
pub(super) fn parse_order(token: &str) -> Option<StyleProperty> {
    let value = match token {
        "order-first" => -9999,
        "order-last" => 9999,
        "order-none" => 0,
        _ => token.strip_prefix("order-")?.parse::<i32>().ok()?,
    };
    Some(StyleProperty::Order(value))
}

/// `columns-<n>` (a count) or `columns-<size>` (an ideal column width, from
/// the same container scale the inline sizes use).
pub(super) fn parse_columns_suffix(suffix: &str) -> Option<ColumnCount> {
    if suffix == "auto" {
        return Some(ColumnCount::Auto);
    }
    if let Ok(count) = suffix.parse::<u32>() {
        return Some(ColumnCount::Count(count));
    }
    parse_inline_size_suffix(suffix).map(ColumnCount::Width)
}

/// `cursor-*`. The value is passed straight through, so the table is only
/// deciding *which names are utilities* -- accepting anything after the
/// prefix would compile `cursor-nonsense` into CSS the browser drops.
pub(super) fn parse_cursor(token: &str) -> Option<&str> {
    const KEYWORDS: &[&str] = &[
        "alias",
        "all-scroll",
        "auto",
        "cell",
        "col-resize",
        "context-menu",
        "copy",
        "crosshair",
        "default",
        "e-resize",
        "ew-resize",
        "grab",
        "grabbing",
        "help",
        "move",
        "n-resize",
        "ne-resize",
        "nesw-resize",
        "no-drop",
        "none",
        "not-allowed",
        "ns-resize",
        "nw-resize",
        "nwse-resize",
        "pointer",
        "progress",
        "row-resize",
        "s-resize",
        "se-resize",
        "sw-resize",
        "text",
        "vertical-text",
        "w-resize",
        "wait",
        "zoom-in",
        "zoom-out",
    ];
    let keyword = token.strip_prefix("cursor-")?;
    KEYWORDS.contains(&keyword).then_some(keyword)
}
