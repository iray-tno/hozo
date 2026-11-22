//! Utilities with a value after the root, read once the simple tables decline.

use hozo_ir::{
    Align, AlignSelf, Color, Dimension, Justify, Length, Overflow, Position, StyleProperty,
    TextAlign, WhiteSpace,
};

/// The values of already-modelled properties that Hozo didn't cover.
///
/// These can't join `KEYWORD_UTILITIES`: their property already has a
/// variant, and a property reachable both ways stops deduping against
/// itself (see `StyleProperty::Keyword`). So each one extends its own
/// enum instead, through the `Css` fallthrough those enums carry for
/// exactly this -- values that are a keyword and nothing more, which the
/// Web writes verbatim and React Native has no equivalent for.
pub(super) fn parse_extended_value(token: &str) -> Option<StyleProperty> {
    fn overflow(value: &str) -> Option<Overflow> {
        Some(match value {
            "visible" => Overflow::Visible,
            "hidden" => Overflow::Hidden,
            "scroll" => Overflow::Scroll,
            "auto" => Overflow::Css("auto"),
            "clip" => Overflow::Css("clip"),
            _ => return None,
        })
    }
    if let Some(rest) = token.strip_prefix("overflow-x-") {
        return overflow(rest).map(StyleProperty::OverflowX);
    }
    if let Some(rest) = token.strip_prefix("overflow-y-") {
        return overflow(rest).map(StyleProperty::OverflowY);
    }
    if let Some(rest) = token.strip_prefix("overflow-") {
        return overflow(rest).map(StyleProperty::Overflow);
    }

    // `content-*` is align-content, `justify-*` is justify-content. Both
    // take the same extra values, and `safe` is a prefix on the alignment
    // rather than a keyword of its own.
    let alignment = |rest: &str| -> Option<&'static str> {
        Some(match rest {
            "normal" => "normal",
            "center-safe" => "safe center",
            "end-safe" => "safe flex-end",
            _ => return None,
        })
    };
    // `baseline` and `stretch` have real variants -- routing them through
    // `Css` would refuse them on Native, where RN's alignment unions do
    // have both. The refusal audit caught exactly that.
    match token {
        "fixed" => return Some(StyleProperty::Position(Position::Css("fixed"))),
        "static" => return Some(StyleProperty::Position(Position::Static)),
        "sticky" => return Some(StyleProperty::Position(Position::Css("sticky"))),
        "text-start" => return Some(StyleProperty::TextAlign(TextAlign::Css("start"))),
        "text-end" => return Some(StyleProperty::TextAlign(TextAlign::Css("end"))),
        "text-justify" => return Some(StyleProperty::TextAlign(TextAlign::Css("justify"))),
        // CSS's `last baseline` aligns the *last* line's baseline, which is
        // a different rule rather than a spelling of `baseline`.
        "items-baseline-last" => {
            return Some(StyleProperty::AlignItems(Align::Css("last baseline")))
        }
        "self-baseline-last" => {
            return Some(StyleProperty::AlignSelf(AlignSelf::Css("last baseline")))
        }
        "rotate-none" => return Some(StyleProperty::RotateNone),
        "scale-none" => return Some(StyleProperty::ScaleNone),
        // `transform` and `transform-cpu` write the composed `transform`
        // with nothing in it -- Tailwind emits the register chain, which
        // resolves to empty. `transform-gpu` prepends a null 3D
        // translation, the old trick for forcing GPU compositing.
        "transform" | "transform-cpu" => return Some(StyleProperty::TransformEmpty),
        "transform-gpu" => return Some(StyleProperty::TransformGpu),
        "transform-none" => return Some(StyleProperty::TransformNone),
        "translate-none" => return Some(StyleProperty::TranslateNone),
        // Writes the three-value form with every axis at its default, which
        // is how Tailwind switches the z component on.
        "translate-3d" => {
            return Some(StyleProperty::TranslateZ(Dimension::Length(Length::Px(
                0.0,
            ))));
        }
        "decoration-auto" => {
            return Some(StyleProperty::Keyword("text-decoration-thickness", "auto"))
        }
        "decoration-from-font" => {
            return Some(StyleProperty::Keyword(
                "text-decoration-thickness",
                "from-font",
            ))
        }
        "fill-none" => return Some(StyleProperty::Fill(Color::Keyword("none"))),
        "stroke-none" => return Some(StyleProperty::Stroke(Color::Keyword("none"))),
        "accent-auto" => return Some(StyleProperty::AccentColor(Color::Keyword("auto"))),
        "items-baseline" => return Some(StyleProperty::AlignItems(Align::Baseline)),
        "items-stretch" => return Some(StyleProperty::AlignItems(Align::Stretch)),
        "self-baseline" => return Some(StyleProperty::AlignSelf(AlignSelf::Baseline)),
        "self-stretch" => return Some(StyleProperty::AlignSelf(AlignSelf::Stretch)),
        "content-stretch" => return Some(StyleProperty::AlignContent(Justify::Stretch)),
        "content-baseline" => return Some(StyleProperty::AlignContent(Justify::Baseline)),
        "justify-stretch" => return Some(StyleProperty::JustifyContent(Justify::Stretch)),
        "justify-baseline" => return Some(StyleProperty::JustifyContent(Justify::Baseline)),
        _ => {}
    }
    if let Some(rest) = token.strip_prefix("content-") {
        return alignment(rest).map(|v| StyleProperty::AlignContent(Justify::Css(v)));
    }
    if let Some(rest) = token.strip_prefix("justify-") {
        return alignment(rest).map(|v| StyleProperty::JustifyContent(Justify::Css(v)));
    }
    if let Some(rest) = token.strip_prefix("items-") {
        return alignment(rest).map(|v| StyleProperty::AlignItems(Align::Css(v)));
    }
    if let Some(rest) = token.strip_prefix("self-") {
        return alignment(rest).map(|v| StyleProperty::AlignSelf(AlignSelf::Css(v)));
    }

    if let Some(rest) = token.strip_prefix("object-") {
        if let Some(fit) = ["contain", "cover", "fill", "none", "scale-down"]
            .into_iter()
            .find(|f| *f == rest)
        {
            return Some(StyleProperty::ObjectFit(fit));
        }
    }
    if let Some(rest) = token.strip_prefix("select-") {
        if let Some(value) = ["all", "auto", "none", "text"]
            .into_iter()
            .find(|v| *v == rest)
        {
            return Some(StyleProperty::UserSelect(value));
        }
    }
    if let Some(rest) = token.strip_prefix("whitespace-") {
        if let Some(value) = ["pre", "pre-line", "pre-wrap", "break-spaces"]
            .into_iter()
            .find(|v| *v == rest)
        {
            return Some(StyleProperty::WhiteSpace(WhiteSpace::Css(value)));
        }
    }
    match token {
        "underline" => Some(StyleProperty::TextDecorationLine("underline")),
        "overline" => Some(StyleProperty::TextDecorationLine("overline")),
        "line-through" => Some(StyleProperty::TextDecorationLine("line-through")),
        "no-underline" => Some(StyleProperty::TextDecorationLine("none")),
        _ => None,
    }
}
