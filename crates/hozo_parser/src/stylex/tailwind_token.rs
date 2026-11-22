//! Maps CSS-in-JS property spelling onto the already-tested Tailwind parser.

use super::static_value::{raw_value, StaticValue};
use super::transform::{named, safe_arbitrary};
use super::values::length_value;

/// Maps CSS-in-JS property spelling onto the already-tested Tailwind parser.
/// The tokens are internal only; no generated class string reaches output.
pub(super) fn token_for(property: &str, value: &StaticValue) -> Option<String> {
    let arbitrary = |prefix: &str, value: String| {
        safe_arbitrary(value).map(|value| format!("{prefix}-[{value}]"))
    };
    let length = |prefix: &str| arbitrary(prefix, length_value(value));
    let raw = |prefix: &str| arbitrary(prefix, raw_value(value));

    match property {
        "display" => named(
            value,
            &[
                ("none", "hidden"),
                ("flex", "flex"),
                ("block", "block"),
                ("contents", "contents"),
                ("inline-flex", "inline-flex"),
                ("grid", "grid"),
            ],
        ),
        "position" => named(
            value,
            &[
                ("static", "static"),
                ("relative", "relative"),
                ("absolute", "absolute"),
                ("fixed", "fixed"),
                ("sticky", "sticky"),
            ],
        ),
        "flexDirection" => named(
            value,
            &[
                ("row", "flex-row"),
                ("row-reverse", "flex-row-reverse"),
                ("column", "flex-col"),
                ("column-reverse", "flex-col-reverse"),
            ],
        ),
        "flexWrap" => named(
            value,
            &[
                ("nowrap", "flex-nowrap"),
                ("wrap", "flex-wrap"),
                ("wrap-reverse", "flex-wrap-reverse"),
            ],
        ),
        "alignItems" => named(
            value,
            &[
                ("flex-start", "items-start"),
                ("flex-end", "items-end"),
                ("center", "items-center"),
                ("baseline", "items-baseline"),
                ("stretch", "items-stretch"),
            ],
        ),
        "alignSelf" => named(
            value,
            &[
                ("auto", "self-auto"),
                ("flex-start", "self-start"),
                ("flex-end", "self-end"),
                ("center", "self-center"),
                ("baseline", "self-baseline"),
                ("stretch", "self-stretch"),
            ],
        ),
        "alignContent" => named(
            value,
            &[
                ("flex-start", "content-start"),
                ("flex-end", "content-end"),
                ("center", "content-center"),
                ("space-between", "content-between"),
                ("space-around", "content-around"),
                ("space-evenly", "content-evenly"),
                ("stretch", "content-stretch"),
                ("baseline", "content-baseline"),
            ],
        ),
        "justifyContent" => named(
            value,
            &[
                ("flex-start", "justify-start"),
                ("flex-end", "justify-end"),
                ("center", "justify-center"),
                ("space-between", "justify-between"),
                ("space-around", "justify-around"),
                ("space-evenly", "justify-evenly"),
            ],
        ),
        "padding" => length("p"),
        "paddingTop" => length("pt"),
        "paddingRight" => length("pr"),
        "paddingBottom" => length("pb"),
        "paddingLeft" => length("pl"),
        "paddingInlineStart" => length("ps"),
        "paddingInlineEnd" => length("pe"),
        "margin" => length("m"),
        "marginTop" => length("mt"),
        "marginRight" => length("mr"),
        "marginBottom" => length("mb"),
        "marginLeft" => length("ml"),
        "marginInlineStart" => length("ms"),
        "marginInlineEnd" => length("me"),
        "gap" => length("gap"),
        "rowGap" => length("gap-y"),
        "columnGap" => length("gap-x"),
        "width" => length("w"),
        "height" => length("h"),
        "minWidth" => length("min-w"),
        "minHeight" => length("min-h"),
        "maxWidth" => length("max-w"),
        "maxHeight" => length("max-h"),
        "top" => length("top"),
        "right" => length("right"),
        "bottom" => length("bottom"),
        "left" => length("left"),
        "backgroundColor" => raw("bg"),
        "color" => raw("text"),
        "opacity" => raw("opacity"),
        "zIndex" => raw("z"),
        "flexGrow" => raw("grow"),
        "flexShrink" => raw("shrink"),
        "flexBasis" => length("basis"),
        "borderRadius" => length("rounded"),
        "borderTopLeftRadius" => length("rounded-tl"),
        "borderTopRightRadius" => length("rounded-tr"),
        "borderBottomRightRadius" => length("rounded-br"),
        "borderBottomLeftRadius" => length("rounded-bl"),
        "borderStartStartRadius" => length("rounded-ss"),
        "borderStartEndRadius" => length("rounded-se"),
        "borderEndStartRadius" => length("rounded-es"),
        "borderEndEndRadius" => length("rounded-ee"),
        "borderStyle" => named(
            value,
            &[
                ("solid", "border-solid"),
                ("dashed", "border-dashed"),
                ("dotted", "border-dotted"),
                ("double", "border-double"),
                ("hidden", "border-hidden"),
                ("none", "border-none"),
            ],
        ),
        "aspectRatio" => named(
            value,
            &[
                ("auto", "aspect-auto"),
                ("1 / 1", "aspect-square"),
                ("16 / 9", "aspect-video"),
            ],
        ),
        "backfaceVisibility" => named(
            value,
            &[
                ("hidden", "backface-hidden"),
                ("visible", "backface-visible"),
            ],
        ),
        "boxSizing" => named(
            value,
            &[("border-box", "box-border"), ("content-box", "box-content")],
        ),
        "flex" => named(
            value,
            &[
                ("auto", "flex-auto"),
                ("initial", "flex-initial"),
                ("none", "flex-none"),
                ("1", "flex-1"),
            ],
        ),
        "fontStyle" => named(value, &[("italic", "italic"), ("normal", "not-italic")]),
        "isolation" => named(value, &[("isolate", "isolate"), ("auto", "isolation-auto")]),
        "mixBlendMode" => {
            let StaticValue::String(value) = value else {
                return None;
            };
            [
                "normal",
                "multiply",
                "screen",
                "overlay",
                "darken",
                "lighten",
                "color-dodge",
                "color-burn",
                "hard-light",
                "soft-light",
                "difference",
                "exclusion",
                "hue",
                "saturation",
                "color",
                "luminosity",
                "plus-darker",
                "plus-lighter",
            ]
            .contains(&value.as_str())
            .then(|| format!("mix-blend-{value}"))
        }
        "pointerEvents" => named(
            value,
            &[
                ("auto", "pointer-events-auto"),
                ("none", "pointer-events-none"),
            ],
        ),
        "textDecorationColor" => raw("decoration"),
        "textDecorationLine" => named(
            value,
            &[
                ("underline", "underline"),
                ("overline", "overline"),
                ("line-through", "line-through"),
                ("none", "no-underline"),
            ],
        ),
        "textDecorationStyle" => named(
            value,
            &[
                ("solid", "decoration-solid"),
                ("double", "decoration-double"),
                ("dotted", "decoration-dotted"),
                ("dashed", "decoration-dashed"),
                ("wavy", "decoration-wavy"),
            ],
        ),
        "userSelect" => named(
            value,
            &[
                ("all", "select-all"),
                ("auto", "select-auto"),
                ("none", "select-none"),
                ("text", "select-text"),
            ],
        ),
        "verticalAlign" => named(
            value,
            &[
                ("baseline", "align-baseline"),
                ("bottom", "align-bottom"),
                ("middle", "align-middle"),
                ("sub", "align-sub"),
                ("super", "align-super"),
                ("text-bottom", "align-text-bottom"),
                ("text-top", "align-text-top"),
                ("top", "align-top"),
            ],
        ),
        "outlineColor" => raw("outline"),
        "outlineStyle" => named(
            value,
            &[
                ("solid", "outline-solid"),
                ("dashed", "outline-dashed"),
                ("dotted", "outline-dotted"),
                ("double", "outline-double"),
                ("none", "outline-none"),
            ],
        ),
        "fontSize" => length("text"),
        "lineHeight" => raw("leading"),
        "letterSpacing" => length("tracking"),
        "overflow" => named(
            value,
            &[
                ("visible", "overflow-visible"),
                ("hidden", "overflow-hidden"),
                ("clip", "overflow-clip"),
                ("scroll", "overflow-scroll"),
                ("auto", "overflow-auto"),
            ],
        ),
        "textAlign" => named(
            value,
            &[
                ("left", "text-left"),
                ("center", "text-center"),
                ("right", "text-right"),
                ("justify", "text-justify"),
                ("start", "text-start"),
                ("end", "text-end"),
            ],
        ),
        "textTransform" => named(
            value,
            &[
                ("uppercase", "uppercase"),
                ("lowercase", "lowercase"),
                ("capitalize", "capitalize"),
                ("none", "normal-case"),
            ],
        ),
        "objectFit" => named(
            value,
            &[
                ("contain", "object-contain"),
                ("cover", "object-cover"),
                ("fill", "object-fill"),
                ("none", "object-none"),
                ("scale-down", "object-scale-down"),
            ],
        ),
        "cursor" => named(
            value,
            &[("auto", "cursor-auto"), ("pointer", "cursor-pointer")],
        ),
        _ => None,
    }
}
