//! Border radius, per corner and from the theme.

use hozo_ir::{Length, Radius, StyleProperty};

/// Tailwind's `--radius-*` scale, held by name with a px fallback (its own
/// values are rem at the default 16px root). Bare `rounded` is 0.25rem,
/// which is *not* the same as `rounded-sm` in v4 -- they happen to share a
/// value here but are separate scale entries.
pub(super) fn parse_border_radius(token: &str) -> Option<Radius> {
    radius_from_suffix(
        token
            .strip_prefix("rounded")?
            .strip_prefix('-')
            .unwrap_or(""),
    )
}

/// The size half of a `rounded-*` utility, with the corner (if any) already
/// stripped. An empty suffix is bare `rounded`.
pub(super) fn radius_from_suffix(suffix: &str) -> Option<Radius> {
    // Kept as an intent rather than a number -- see `hozo_ir::Radius`.
    if suffix == "full" {
        return Some(Radius::Full);
    }
    let (name, fallback_px) = match suffix {
        "" => return Some(Radius::Length(Length::Px(4.0))),
        "none" => return Some(Radius::Length(Length::Px(0.0))),
        "xs" => ("xs", 2.0),
        "sm" => ("sm", 4.0),
        "md" => ("md", 6.0),
        "lg" => ("lg", 8.0),
        "xl" => ("xl", 12.0),
        "2xl" => ("2xl", 16.0),
        "3xl" => ("3xl", 24.0),
        "4xl" => ("4xl", 32.0),
        _ => return theme_radius_name(suffix).map(|name| Radius::Theme(name.to_string())),
    };
    Some(Radius::Scale { name, fallback_px })
}

/// A name outside Tailwind's scale that only the project's theme can define
/// (`--radius-control`), held for each backend to look up, as `animate-<name>`
/// is. The parser has no theme, so it cannot know whether the name exists.
///
/// Not a corner. `rounded-t` and the rest are corner forms with no size,
/// which Hozo does not compile; read as a token they would turn an unknown
/// class into a radius named `t`.
pub(super) fn theme_radius_name(suffix: &str) -> Option<&str> {
    let named = !suffix.is_empty()
        && suffix
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
        && suffix.as_bytes()[0].is_ascii_lowercase();
    (named && !is_radius_corner(suffix)).then_some(suffix)
}

pub(super) fn is_radius_corner(name: &str) -> bool {
    matches!(
        name,
        "t" | "r" | "b" | "l" | "s" | "e" | "tl" | "tr" | "br" | "bl" | "ss" | "se" | "es" | "ee"
    )
}

/// `rounded-<corner>-<size>`, where a corner may be a single corner, one
/// edge (two corners), or their logical equivalents.
pub(super) fn expand_border_radius(token: &str) -> Option<Vec<StyleProperty>> {
    let rest = token.strip_prefix("rounded")?.strip_prefix('-')?;
    // `rounded-lg` has no corner part; `rounded-t-lg` does. The corner is
    // never a valid size and vice versa, so trying the whole suffix as a
    // size first disambiguates without a lookahead.
    // Only a real corner splits: `rounded-hozo-control` is one theme name,
    // not a corner called `hozo`.
    let (corner, size) = match rest.split_once('-') {
        Some((corner, size)) if is_radius_corner(corner) && radius_from_suffix(size).is_some() => {
            (corner, size)
        }
        _ => return None,
    };
    let r = radius_from_suffix(size)?;

    Some(match corner {
        "t" => vec![
            StyleProperty::BorderTopLeftRadius(r.clone()),
            StyleProperty::BorderTopRightRadius(r),
        ],
        "r" => vec![
            StyleProperty::BorderTopRightRadius(r.clone()),
            StyleProperty::BorderBottomRightRadius(r),
        ],
        "b" => vec![
            StyleProperty::BorderBottomRightRadius(r.clone()),
            StyleProperty::BorderBottomLeftRadius(r),
        ],
        "l" => vec![
            StyleProperty::BorderTopLeftRadius(r.clone()),
            StyleProperty::BorderBottomLeftRadius(r),
        ],
        "s" => vec![
            StyleProperty::BorderStartStartRadius(r.clone()),
            StyleProperty::BorderEndStartRadius(r),
        ],
        "e" => vec![
            StyleProperty::BorderStartEndRadius(r.clone()),
            StyleProperty::BorderEndEndRadius(r),
        ],
        "tl" => vec![StyleProperty::BorderTopLeftRadius(r)],
        "tr" => vec![StyleProperty::BorderTopRightRadius(r)],
        "br" => vec![StyleProperty::BorderBottomRightRadius(r)],
        "bl" => vec![StyleProperty::BorderBottomLeftRadius(r)],
        "ss" => vec![StyleProperty::BorderStartStartRadius(r)],
        "se" => vec![StyleProperty::BorderStartEndRadius(r)],
        "es" => vec![StyleProperty::BorderEndStartRadius(r)],
        "ee" => vec![StyleProperty::BorderEndEndRadius(r)],
        _ => return None,
    })
}
