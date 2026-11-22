//! Spacing steps, margins and the spacing utilities.

use hozo_ir::{Dimension, Length, StyleProperty};

/// A spacing suffix as the step count it is, not the pixels it works out
/// to.
///
/// `p-4` is four steps; how wide a step is belongs to the project
/// (`--spacing`, 0.25rem by default) and is applied at lowering, where the
/// theme is. Multiplying here baked Tailwind's default in, so a project
/// that changed the scale got the right number of steps at the wrong
/// size -- and silently, because the output was an ordinary padding.
///
/// `p-px` is the exception and stays absolute: Tailwind means one physical
/// pixel by it, which is what a hairline border wants and is not a step of
/// anything.
pub(super) fn parse_spacing_suffix(suffix: &str) -> Option<Length> {
    if suffix == "px" {
        return Some(Length::Px(1.0));
    }
    suffix.parse::<f64>().ok().map(Length::Spacing)
}

/// Margin value: the spacing scale plus `auto`, which is what makes
/// `mx-auto` (centre a fixed-width box) work. Padding has no `auto`.
pub(super) fn parse_margin_suffix(suffix: &str) -> Option<Dimension> {
    if suffix == "auto" {
        return Some(Dimension::Auto);
    }
    parse_spacing_suffix(suffix).map(Dimension::Length)
}

/// Single-side margins (`mt-2`, `ms-auto`, ...). The multi-side forms
/// (`m-`, `mx-`, `my-`) expand to several properties and live in
/// `expand_base_utility`.
pub(super) fn parse_single_margin(token: &str) -> Option<StyleProperty> {
    let (prefix, rest) = token.split_once('-')?;
    let value = parse_margin_suffix(rest)?;
    match prefix {
        "mt" => Some(StyleProperty::MarginTop(value)),
        "mr" => Some(StyleProperty::MarginRight(value)),
        "mb" => Some(StyleProperty::MarginBottom(value)),
        "ml" => Some(StyleProperty::MarginLeft(value)),
        "ms" => Some(StyleProperty::MarginInlineStart(value)),
        "me" => Some(StyleProperty::MarginInlineEnd(value)),
        _ => None,
    }
}

/// Handles `{p,px,py,pt,pr,pb,pl,m,mx,my,mt,mr,mb,ml,gap,gap-x,gap-y}-{n}`.
/// Multi-side prefixes (`p`, `px`, `py`, `m`, `mx`, `my`) expand to more than
/// one longhand `StyleProperty` -- but `parse_utility` returns a single
/// property, so callers that need the multi-side expansion should use
/// `parse_spacing_utility_all` instead. `p-6`/`px-4` etc. therefore aren't
/// handled here; see `parse_spacing_utility_all`.
pub(super) fn parse_spacing_utility(token: &str) -> Option<StyleProperty> {
    let (prefix, rest) = token.split_once('-')?;
    let value = parse_spacing_suffix(rest)?;
    match prefix {
        "gap" => Some(StyleProperty::Gap(value)),
        "pt" => Some(StyleProperty::PaddingTop(value)),
        "pr" => Some(StyleProperty::PaddingRight(value)),
        "pb" => Some(StyleProperty::PaddingBottom(value)),
        "pl" => Some(StyleProperty::PaddingLeft(value)),
        // Direction-relative: `ps`/`pe` and `ms`/`me` are Tailwind's
        // logical counterparts to `pl`/`pr` and `ml`/`mr`.
        "ps" => Some(StyleProperty::PaddingInlineStart(value)),
        "pe" => Some(StyleProperty::PaddingInlineEnd(value)),
        // Margins accept `auto` where padding doesn't, so they take the
        // wider `Dimension` and are parsed separately below.
        "mt" | "mr" | "mb" | "ml" | "ms" | "me" => None,
        "start" => Some(StyleProperty::InsetInlineStart(Dimension::Length(value))),
        "end" => Some(StyleProperty::InsetInlineEnd(Dimension::Length(value))),
        _ => None,
    }
}
