//! Whether the map writes an inline family both logically and physically,
//! which decides if the resolver needs the writing direction (#2018).

use super::*;

/// Whether the map writes some inline family both logically and physically,
/// so a class list can mix them and the resolver needs the direction to
/// rewrite the physical writes as logical ones (#2018).
/// Whether any inline family is written both logically and physically
/// across the map, and whether one class writes a family's physical sides
/// unevenly (only one, or two different values).
pub(super) fn edge_projection(
    supported: &[(&String, Vec<(String, String)>)],
    states: &[(&String, Vec<StateGroup>)],
) -> (bool, bool) {
    const FAMILIES: [(&str, &str, &str, &str); 5] = [
        ("paddingStart", "paddingEnd", "paddingLeft", "paddingRight"),
        ("marginStart", "marginEnd", "marginLeft", "marginRight"),
        ("start", "end", "left", "right"),
        (
            "borderStartWidth",
            "borderEndWidth",
            "borderLeftWidth",
            "borderRightWidth",
        ),
        (
            "borderStartColor",
            "borderEndColor",
            "borderLeftColor",
            "borderRightColor",
        ),
    ];
    let mut logical = [false; 5];
    let mut physical = [false; 5];
    let mut uneven = false;
    let mut inspect = |pairs: &[(String, String)]| {
        let value = |key: &str| pairs.iter().find(|(k, _)| k == key).map(|(_, v)| v);
        for (idx, &(s, e, l, r)) in FAMILIES.iter().enumerate() {
            logical[idx] |= value(s).is_some() || value(e).is_some();
            physical[idx] |= value(l).is_some() || value(r).is_some();
            uneven |= value(l) != value(r);
        }
    };
    for (_, pairs) in supported {
        inspect(pairs);
    }
    for (_, groups) in states {
        for group in groups {
            inspect(&group.pairs);
        }
    }
    ((0..5).any(|idx| logical[idx] && physical[idx]), uneven)
}
