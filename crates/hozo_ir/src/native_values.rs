//! Validation and static length folding for CSS string values emitted to
//! React Native `StyleSheet` entries and colour props.
//!
//! Tailwind does not validate arbitrary values (`bg-[nonsense]`,
//! `blur-[#ff0000]`, `shadow-[10px]`, `origin-[var(--x)]`), and the Web
//! backend mirrors that by carrying the authored text through to CSS. React
//! Native silently drops malformed or dynamic CSS strings at runtime, so the
//! Native backend validates them at compile time and folds statically known
//! units (`rem` and physical CSS units) into `px` where RN's string parsers
//! accept only pixel values.

use super::{round, FilterFunction, GradientKind, LengthUnit};

/// CSS Color 4 named colours plus `transparent` and `currentcolor`, all of
/// which React Native's colour parser accepts.
const NAMED_COLORS: &[&str] = &[
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
    "currentcolor",
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
    "transparent",
    "turquoise",
    "violet",
    "wheat",
    "white",
    "whitesmoke",
    "yellow",
    "yellowgreen",
];

fn contains_dynamic_css(text: &str) -> bool {
    let lower = text.to_ascii_lowercase();
    lower.contains("var(")
        || lower.contains("calc(")
        || lower.contains("env(")
        || lower.contains("min(")
        || lower.contains("max(")
        || lower.contains("clamp(")
        || lower.contains("hozo-unresolved:")
}

fn has_balanced_outer_parens(text: &str) -> Option<(&str, &str)> {
    let trimmed = text.trim();
    let open = trimmed.find('(')?;
    if !trimmed.ends_with(')') {
        return None;
    }
    let mut depth = 0usize;
    for (index, ch) in trimmed.char_indices().skip(open) {
        match ch {
            '(' => depth += 1,
            ')' => {
                depth = depth.checked_sub(1)?;
                if depth == 0 && index != trimmed.len() - 1 {
                    return None;
                }
            }
            _ => {}
        }
    }
    (depth == 0).then_some((
        trimmed[..open].trim(),
        trimmed[open + 1..trimmed.len() - 1].trim(),
    ))
}

fn is_finite_number(text: &str) -> bool {
    text.parse::<f64>().is_ok_and(f64::is_finite)
}

fn is_percentage_token(text: &str) -> bool {
    text.strip_suffix('%').is_some_and(is_finite_number)
}

fn is_angle_token(text: &str) -> bool {
    let lower = text.trim().to_ascii_lowercase();
    if lower == "0" || lower == "-0" || lower == "+0" {
        return true;
    }
    for suffix in ["deg", "rad", "grad", "turn"] {
        if let Some(number) = lower.strip_suffix(suffix) {
            return is_finite_number(number);
        }
    }
    false
}

/// Whether `Color::Css(text)` is a resolved colour literal React Native can
/// parse (hex, named CSS colour, or colour function with concrete arguments).
pub fn native_color_literal_valid(text: &str) -> bool {
    let trimmed = text.trim();
    if trimmed.is_empty() || contains_dynamic_css(trimmed) {
        return false;
    }
    if let Some(hex) = trimmed.strip_prefix('#') {
        return matches!(hex.len(), 3 | 4 | 6 | 8) && hex.bytes().all(|b| b.is_ascii_hexdigit());
    }
    if let Some((name, args)) = has_balanced_outer_parens(trimmed) {
        if args.is_empty() {
            return false;
        }
        let lower_name = name.to_ascii_lowercase();
        if !matches!(
            lower_name.as_str(),
            "rgb" | "rgba" | "hsl" | "hsla" | "hwb" | "lab" | "lch" | "oklab" | "oklch"
        ) {
            return false;
        }
        let mut saw_token = false;
        for token in args.split(|c: char| c.is_whitespace() || c == ',' || c == '/') {
            if token.is_empty() {
                continue;
            }
            saw_token = true;
            if !(is_finite_number(token)
                || is_percentage_token(token)
                || is_angle_token(token)
                || token.eq_ignore_ascii_case("none"))
            {
                return false;
            }
        }
        return saw_token;
    }
    let lower = trimmed.to_ascii_lowercase();
    NAMED_COLORS.binary_search(&lower.as_str()).is_ok()
}

/// Parses a CSS length token that resolves statically to density-independent
/// pixels on React Native (`0`, `px`, `rem`, and physical CSS units).
pub fn resolve_native_length_px(token: &str) -> Option<f64> {
    let trimmed = token.trim();
    if trimmed.is_empty() || contains_dynamic_css(trimmed) {
        return None;
    }
    if let Ok(zero) = trimmed.parse::<f64>() {
        return (zero == 0.0).then_some(0.0);
    }
    let split = trimmed.find(|c: char| c.is_ascii_alphabetic())?;
    let (number, unit) = trimmed.split_at(split);
    let value: f64 = number.parse().ok()?;
    if !value.is_finite() {
        return None;
    }
    if unit.eq_ignore_ascii_case("px") {
        return Some(round(value));
    }
    let scale = LengthUnit::parse(unit)?.px()?;
    Some(round(value * scale))
}

fn format_px_token(token: &str, px: f64) -> String {
    let trimmed = token.trim();
    if px == 0.0 && trimmed == "0" {
        return "0".to_string();
    }
    if trimmed.ends_with("px") || trimmed.ends_with("PX") {
        return trimmed.to_string();
    }
    format!("{px}px")
}

fn split_top_level<'a>(text: &'a str, sep: char) -> Vec<&'a str> {
    let mut parts = Vec::new();
    let mut depth = 0usize;
    let mut start = 0usize;
    for (index, ch) in text.char_indices() {
        match ch {
            '(' => depth += 1,
            ')' => depth = depth.saturating_sub(1),
            c if c == sep && depth == 0 => {
                parts.push(&text[start..index]);
                start = index + ch.len_utf8();
            }
            _ => {}
        }
    }
    parts.push(&text[start..]);
    parts
}

fn split_top_level_whitespace(text: &str) -> Vec<&str> {
    let mut parts = Vec::new();
    let mut depth = 0usize;
    let mut start: Option<usize> = None;
    for (index, ch) in text.char_indices() {
        match ch {
            '(' => {
                if start.is_none() {
                    start = Some(index);
                }
                depth += 1;
            }
            ')' => {
                depth = depth.saturating_sub(1);
            }
            c if c.is_whitespace() && depth == 0 => {
                if let Some(s) = start.take() {
                    parts.push(&text[s..index]);
                }
            }
            _ => {
                if start.is_none() {
                    start = Some(index);
                }
            }
        }
    }
    if let Some(s) = start {
        parts.push(&text[s..]);
    }
    parts
}

fn resolve_shadow_layer(layer: &str, allow_inset: bool, max_lengths: usize) -> Option<String> {
    let tokens = split_top_level_whitespace(layer.trim());
    if tokens.len() < 2 {
        return None;
    }
    let mut has_inset = false;
    let mut has_color = false;
    let mut lengths = 0usize;
    let mut finished_lengths = false;
    let mut out = Vec::with_capacity(tokens.len());

    for token in tokens {
        if allow_inset && token.eq_ignore_ascii_case("inset") {
            if has_inset || (lengths > 0 && !finished_lengths) {
                if has_inset {
                    return None;
                }
                finished_lengths = true;
            }
            has_inset = true;
            out.push("inset".to_string());
        } else if let Some(px) = resolve_native_length_px(token) {
            if finished_lengths || lengths >= max_lengths {
                return None;
            }
            // The third length is blur radius, which cannot be negative.
            if lengths == 2 && px < 0.0 {
                return None;
            }
            lengths += 1;
            out.push(format_px_token(token, px));
        } else if native_color_literal_valid(token) {
            if has_color {
                return None;
            }
            if lengths > 0 {
                finished_lengths = true;
            }
            has_color = true;
            out.push(token.to_string());
        } else {
            return None;
        }
    }

    (lengths >= 2).then(|| out.join(" "))
}

/// Validates a `box-shadow` value for React Native and folds any statically
/// known non-px length units (`rem`, physical units) to `px`.
pub fn resolve_native_box_shadow(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() || contains_dynamic_css(trimmed) {
        return None;
    }
    if trimmed.eq_ignore_ascii_case("none") {
        return Some("none".to_string());
    }
    let layers = split_top_level(trimmed, ',');
    let mut resolved = Vec::with_capacity(layers.len());
    for layer in layers {
        resolved.push(resolve_shadow_layer(layer, true, 4)?);
    }
    (!resolved.is_empty()).then(|| resolved.join(", "))
}

/// Validates one filter function string for React Native and folds statically
/// known length units inside `blur(...)` and `drop-shadow(...)` to `px`.
pub fn resolve_native_filter(function: FilterFunction, css: &str) -> Option<String> {
    if function == FilterFunction::None {
        return Some(String::new());
    }
    let trimmed = css.trim();
    if trimmed.is_empty() {
        return Some(String::new());
    }
    if contains_dynamic_css(trimmed) {
        return None;
    }
    let (name, arg) = has_balanced_outer_parens(trimmed)?;
    if arg.is_empty() {
        return None;
    }
    let lower_name = name.to_ascii_lowercase();
    match function {
        FilterFunction::None => Some(String::new()),
        FilterFunction::Blur => {
            if lower_name != "blur" || arg.split_whitespace().count() != 1 {
                return None;
            }
            let px = resolve_native_length_px(arg)?;
            (px >= 0.0).then(|| format!("blur({px}px)"))
        }
        FilterFunction::HueRotate => {
            if lower_name != "hue-rotate" || arg.split_whitespace().count() != 1 {
                return None;
            }
            is_angle_token(arg).then(|| trimmed.to_string())
        }
        FilterFunction::Brightness
        | FilterFunction::Contrast
        | FilterFunction::Grayscale
        | FilterFunction::Invert
        | FilterFunction::Opacity
        | FilterFunction::Saturate
        | FilterFunction::Sepia => {
            let expected = match function {
                FilterFunction::Brightness => "brightness",
                FilterFunction::Contrast => "contrast",
                FilterFunction::Grayscale => "grayscale",
                FilterFunction::Invert => "invert",
                FilterFunction::Opacity => "opacity",
                FilterFunction::Saturate => "saturate",
                FilterFunction::Sepia => "sepia",
                _ => unreachable!(),
            };
            if lower_name != expected || arg.split_whitespace().count() != 1 {
                return None;
            }
            let numeric = arg.strip_suffix('%').unwrap_or(arg);
            let value = numeric.parse::<f64>().ok()?;
            (value.is_finite() && value >= 0.0).then(|| trimmed.to_string())
        }
        FilterFunction::DropShadow => {
            if lower_name != "drop-shadow" {
                return None;
            }
            let inner = resolve_shadow_layer(arg, false, 3)?;
            Some(format!("drop-shadow({inner})"))
        }
    }
}

/// Validates a linear or radial gradient prelude (before the stops) for React
/// Native's `backgroundImage` parser.
pub fn native_gradient_prelude_valid(kind: GradientKind, prelude: &str) -> bool {
    if kind == GradientKind::Conic {
        return false;
    }
    let direction = match prelude.find(" in ") {
        Some(cut) => &prelude[..cut],
        None if prelude.starts_with("in ") => "",
        None => prelude,
    }
    .trim();
    if direction.is_empty() {
        return true;
    }
    if contains_dynamic_css(direction) {
        return false;
    }
    match kind {
        GradientKind::Conic => false,
        GradientKind::Linear => {
            if is_angle_token(direction) {
                return true;
            }
            let tokens: Vec<String> = direction
                .split_whitespace()
                .map(|t| t.to_ascii_lowercase())
                .collect();
            match tokens.as_slice() {
                [to, side] if to == "to" => {
                    matches!(side.as_str(), "top" | "bottom" | "left" | "right")
                }
                [to, a, b] if to == "to" => {
                    let is_h = |s: &str| matches!(s, "left" | "right");
                    let is_v = |s: &str| matches!(s, "top" | "bottom");
                    (is_h(a) && is_v(b)) || (is_v(a) && is_h(b))
                }
                _ => false,
            }
        }
        GradientKind::Radial => {
            let tokens: Vec<&str> = direction.split_whitespace().collect();
            let at_pos = tokens.iter().position(|t| t.eq_ignore_ascii_case("at"));
            let (before, after) = match at_pos {
                Some(idx) => (&tokens[..idx], Some(&tokens[idx + 1..])),
                None => (&tokens[..], None),
            };
            let mut saw_shape = false;
            let mut saw_extent = false;
            for token in before {
                let lower = token.to_ascii_lowercase();
                if matches!(lower.as_str(), "circle" | "ellipse") {
                    if saw_shape {
                        return false;
                    }
                    saw_shape = true;
                } else if matches!(
                    lower.as_str(),
                    "closest-side" | "closest-corner" | "farthest-side" | "farthest-corner"
                ) {
                    if saw_extent {
                        return false;
                    }
                    saw_extent = true;
                } else {
                    return false;
                }
            }
            if let Some(pos) = after {
                if pos.is_empty() || pos.len() > 4 {
                    return false;
                }
                for token in pos {
                    let lower = token.to_ascii_lowercase();
                    let ok = matches!(
                        lower.as_str(),
                        "top" | "bottom" | "left" | "right" | "center"
                    ) || is_percentage_token(token)
                        || resolve_native_length_px(token).is_some();
                    if !ok {
                        return false;
                    }
                }
            }
            true
        }
    }
}

/// Validates a `transform-origin` string for React Native and folds statically
/// known length units (`rem`, physical units) into `px`.
pub fn resolve_native_transform_origin(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() || contains_dynamic_css(trimmed) {
        return None;
    }
    let tokens: Vec<&str> = trimmed.split_whitespace().collect();
    if tokens.is_empty() || tokens.len() > 3 {
        return None;
    }
    let mut out = Vec::with_capacity(tokens.len());
    for (index, token) in tokens.iter().enumerate() {
        let lower = token.to_ascii_lowercase();
        if index < 2
            && matches!(
                lower.as_str(),
                "top" | "bottom" | "left" | "right" | "center"
            )
        {
            out.push(lower);
        } else if index < 2 && is_percentage_token(token) {
            out.push((*token).to_string());
        } else if let Some(px) = resolve_native_length_px(token) {
            out.push(format_px_token(token, px));
        } else {
            return None;
        }
    }
    Some(out.join(" "))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_native_color_literals() {
        for valid in [
            "#fff",
            "#ff0000",
            "#00ff0080",
            "red",
            "rebeccapurple",
            "transparent",
            "currentColor",
            "rgb(0 0 0)",
            "rgb(0 0 0 / 0.5)",
            "rgba(255, 0, 0, 0.5)",
            "hsl(120deg 100% 50%)",
        ] {
            assert!(
                native_color_literal_valid(valid),
                "expected valid color: {valid}"
            );
        }
        for invalid in [
            "",
            "10px",
            "2rem",
            "1.5em",
            "50%",
            "1.5",
            "auto",
            "100vh",
            "nonsense",
            "var(--x)",
            "calc(100% - 2rem)",
            "rgb(var(--x))",
            "rgb(nonsense)",
            "#12",
            "#zzzzzz",
        ] {
            assert!(
                !native_color_literal_valid(invalid),
                "expected invalid color: {invalid}"
            );
        }
    }

    #[test]
    fn resolves_native_filters_and_folds_rem() {
        assert_eq!(
            resolve_native_filter(FilterFunction::Blur, "blur(10px)"),
            Some("blur(10px)".to_string())
        );
        assert_eq!(
            resolve_native_filter(FilterFunction::Blur, "blur(2rem)"),
            Some("blur(32px)".to_string())
        );
        assert_eq!(
            resolve_native_filter(FilterFunction::Blur, "blur(1.5em)"),
            None
        );
        assert_eq!(
            resolve_native_filter(FilterFunction::Blur, "blur(#ff0000)"),
            None
        );
        assert_eq!(
            resolve_native_filter(FilterFunction::Brightness, "brightness(1.5)"),
            Some("brightness(1.5)".to_string())
        );
        assert_eq!(
            resolve_native_filter(FilterFunction::Brightness, "brightness(50%)"),
            Some("brightness(50%)".to_string())
        );
        assert_eq!(
            resolve_native_filter(FilterFunction::Brightness, "brightness(10px)"),
            None
        );
        assert_eq!(
            resolve_native_filter(FilterFunction::HueRotate, "hue-rotate(90deg)"),
            Some("hue-rotate(90deg)".to_string())
        );
        assert_eq!(
            resolve_native_filter(FilterFunction::HueRotate, "hue-rotate(10px)"),
            None
        );
        assert_eq!(
            resolve_native_filter(
                FilterFunction::DropShadow,
                "drop-shadow(0 1px 2px rgb(0 0 0 / 0.15))"
            ),
            Some("drop-shadow(0 1px 2px rgb(0 0 0 / 0.15))".to_string())
        );
        assert_eq!(
            resolve_native_filter(FilterFunction::DropShadow, "drop-shadow(10px)"),
            None
        );
    }

    #[test]
    fn resolves_native_box_shadows() {
        assert_eq!(
            resolve_native_box_shadow(
                "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)"
            ),
            Some("0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)".to_string())
        );
        assert_eq!(
            resolve_native_box_shadow("inset 0 2px 4px 0 rgb(0 0 0 / 0.05)"),
            Some("inset 0 2px 4px 0 rgb(0 0 0 / 0.05)".to_string())
        );
        assert_eq!(resolve_native_box_shadow("none"), Some("none".to_string()));
        assert_eq!(resolve_native_box_shadow("10px"), None);
        assert_eq!(resolve_native_box_shadow("inset 10px"), None);
        assert_eq!(resolve_native_box_shadow("#ff0000"), None);
        assert_eq!(resolve_native_box_shadow("var(--x)"), None);
    }

    #[test]
    fn validates_native_gradient_preludes_and_transform_origin() {
        assert!(native_gradient_prelude_valid(
            GradientKind::Linear,
            "to right in oklab"
        ));
        assert!(native_gradient_prelude_valid(GradientKind::Linear, "45deg"));
        assert!(!native_gradient_prelude_valid(GradientKind::Linear, "10px"));
        assert!(!native_gradient_prelude_valid(
            GradientKind::Linear,
            "#ff0000"
        ));
        assert!(native_gradient_prelude_valid(
            GradientKind::Radial,
            "in oklab"
        ));
        assert!(native_gradient_prelude_valid(
            GradientKind::Radial,
            "circle at top left"
        ));
        assert!(!native_gradient_prelude_valid(GradientKind::Radial, "10px"));
        assert!(!native_gradient_prelude_valid(
            GradientKind::Radial,
            "var(--x)"
        ));

        assert_eq!(
            resolve_native_transform_origin("10px"),
            Some("10px".to_string())
        );
        assert_eq!(
            resolve_native_transform_origin("2rem"),
            Some("32px".to_string())
        );
        assert_eq!(
            resolve_native_transform_origin("50%"),
            Some("50%".to_string())
        );
        assert_eq!(
            resolve_native_transform_origin("top left"),
            Some("top left".to_string())
        );
        assert_eq!(resolve_native_transform_origin("1.5em"), None);
        assert_eq!(resolve_native_transform_origin("auto"), None);
        assert_eq!(resolve_native_transform_origin("#ff0000"), None);
    }
}
