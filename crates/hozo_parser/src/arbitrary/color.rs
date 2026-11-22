//! Whether a bracketed value is a color.

use super::length::parse_length;

/// Whether a `text-`/`bg-`/`border-` value should be read as a colour.
///
/// The polarity here is Tailwind's and it is not the obvious one. The
/// question asked is "is this a length?", and *everything else* is a
/// colour -- so `text-[nonsense]` compiles to `color: nonsense`, not to a
/// refusal. Written the intuitive way round ("does this look like a
/// colour?") the same class became a font size of `nonsense`, which is a
/// different wrong answer from the one Tailwind gives.
///
/// The hint wins where there is one, which is the entire reason Tailwind
/// has hints: `text-[color:var(--c)]` and `text-[length:var(--c)]` are the
/// same text and different properties, and no amount of looking at
/// `var(--c)` will say which.
pub(super) fn is_color(value: &str, hint: Option<&str>) -> bool {
    match hint {
        Some("color") => true,
        Some(_) => false,
        None => parse_length(value).is_none(),
    }
}

/// Whether a value really is a CSS `<color>`.
///
/// The opposite question to `is_color`, and both are needed. `text-[…]`
/// asks "is this a length?" and calls everything else a colour, which is
/// what Tailwind does there. A gradient or mask stop asks this one instead:
/// a stop is a *position* unless the value is genuinely a colour, so
/// `mask-t-from-[nonsense]` is a stop at `nonsense` and
/// `mask-t-from-[red]` is a red one.
///
/// Which means the keyword list has to be the real one. Recognising only
/// `#` and the colour functions would put `rebeccapurple` in the position
/// slot -- a gradient that silently stops somewhere impossible instead of
/// being purple. It is CSS Color 4's named set plus the system colours,
/// and Tailwind knows all of them, `Canvas` included.
pub(super) fn looks_like_color(value: &str, hint: Option<&str>) -> bool {
    if let Some(hint) = hint {
        return hint == "color";
    }
    if value.starts_with('#') {
        return true;
    }
    if let Some((function, _)) = value.split_once('(') {
        return COLOR_FUNCTIONS.contains(&function.to_ascii_lowercase().as_str());
    }
    let lower = value.to_ascii_lowercase();
    NAMED_COLORS.contains(&lower.as_str()) || SYSTEM_COLORS.contains(&lower.as_str())
}

pub(super) const COLOR_FUNCTIONS: &[&str] = &[
    "rgb",
    "rgba",
    "hsl",
    "hsla",
    "hwb",
    "lab",
    "lch",
    "oklab",
    "oklch",
    "color",
    "color-mix",
    "light-dark",
    "device-cmyk",
];

/// CSS Color 4's named colours, plus the two keywords that behave like
/// them. Transcribed from the specification's table rather than trimmed to
/// the ones anyone uses: the list decides a *type*, and a missing entry
/// puts a colour in a length's slot.
pub(super) const NAMED_COLORS: &[&str] = &[
    "aliceblue",
    "antiquewhite",
    "aqua",
    "aquamarine",
    "azure",
    "beige",
    "bisque",
    "black",
    "blanchedalmond",
    "blue",
    "blueviolet",
    "brown",
    "burlywood",
    "cadetblue",
    "chartreuse",
    "chocolate",
    "coral",
    "cornflowerblue",
    "cornsilk",
    "crimson",
    "cyan",
    "darkblue",
    "darkcyan",
    "darkgoldenrod",
    "darkgray",
    "darkgreen",
    "darkgrey",
    "darkkhaki",
    "darkmagenta",
    "darkolivegreen",
    "darkorange",
    "darkorchid",
    "darkred",
    "darksalmon",
    "darkseagreen",
    "darkslateblue",
    "darkslategray",
    "darkslategrey",
    "darkturquoise",
    "darkviolet",
    "deeppink",
    "deepskyblue",
    "dimgray",
    "dimgrey",
    "dodgerblue",
    "firebrick",
    "floralwhite",
    "forestgreen",
    "fuchsia",
    "gainsboro",
    "ghostwhite",
    "gold",
    "goldenrod",
    "gray",
    "green",
    "greenyellow",
    "grey",
    "honeydew",
    "hotpink",
    "indianred",
    "indigo",
    "ivory",
    "khaki",
    "lavender",
    "lavenderblush",
    "lawngreen",
    "lemonchiffon",
    "lightblue",
    "lightcoral",
    "lightcyan",
    "lightgoldenrodyellow",
    "lightgray",
    "lightgreen",
    "lightgrey",
    "lightpink",
    "lightsalmon",
    "lightseagreen",
    "lightskyblue",
    "lightslategray",
    "lightslategrey",
    "lightsteelblue",
    "lightyellow",
    "lime",
    "limegreen",
    "linen",
    "magenta",
    "maroon",
    "mediumaquamarine",
    "mediumblue",
    "mediumorchid",
    "mediumpurple",
    "mediumseagreen",
    "mediumslateblue",
    "mediumspringgreen",
    "mediumturquoise",
    "mediumvioletred",
    "midnightblue",
    "mintcream",
    "mistyrose",
    "moccasin",
    "navajowhite",
    "navy",
    "oldlace",
    "olive",
    "olivedrab",
    "orange",
    "orangered",
    "orchid",
    "palegoldenrod",
    "palegreen",
    "paleturquoise",
    "palevioletred",
    "papayawhip",
    "peachpuff",
    "peru",
    "pink",
    "plum",
    "powderblue",
    "purple",
    "rebeccapurple",
    "red",
    "rosybrown",
    "royalblue",
    "saddlebrown",
    "salmon",
    "sandybrown",
    "seagreen",
    "seashell",
    "sienna",
    "silver",
    "skyblue",
    "slateblue",
    "slategray",
    "slategrey",
    "snow",
    "springgreen",
    "steelblue",
    "tan",
    "teal",
    "thistle",
    "tomato",
    "turquoise",
    "violet",
    "wheat",
    "white",
    "whitesmoke",
    "yellow",
    "yellowgreen",
    "transparent",
    "currentcolor",
];

/// The UI colours, which look like ordinary identifiers and are not.
pub(super) const SYSTEM_COLORS: &[&str] = &[
    "accentcolor",
    "accentcolortext",
    "activetext",
    "buttonborder",
    "buttonface",
    "buttontext",
    "canvas",
    "canvastext",
    "field",
    "fieldtext",
    "graytext",
    "highlight",
    "highlighttext",
    "linktext",
    "mark",
    "marktext",
    "selecteditem",
    "selecteditemtext",
    "visitedtext",
];
