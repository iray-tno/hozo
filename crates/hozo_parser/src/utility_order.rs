//! Build-time ordering for the assessed builtin spacing utility domain.
mod candidates;
pub use candidates::{order_candidates, ranks};
use hozo_ir::{StyleDeclaration, StyleProperty, StyleSource, UtilityCascade};
use std::{cmp::Ordering, sync::Arc};

pub fn key(candidate: &str) -> Option<UtilityCascade> {
    let (_, base) = crate::tailwind::parse_variant_prefix(candidate);
    let base = base.strip_prefix('-').unwrap_or(base);
    let root = crate::tailwind_utility_order::SPACING_ORDER
        .iter()
        .filter(|(root, _)| {
            base.strip_prefix(root)
                .is_some_and(|rest| rest.starts_with('-'))
        })
        .max_by_key(|(root, _)| root.len())?;
    // Hozo's safe-area extension is not a builtin Tailwind spacing value.
    let value = base.strip_prefix(root.0)?.strip_prefix('-')?;
    if value == "safe" || value.starts_with("safe-") {
        return None;
    }
    Some(UtilityCascade {
        property_order: root.1,
        candidate: candidate.into(),
        physical_axis: matches!(root.0, "px" | "mx"),
    })
}

pub(crate) fn source(input: u32, candidate: &str) -> StyleSource {
    StyleSource::Tailwind {
        input,
        utility: key(candidate).map(Arc::new),
    }
}

pub fn is_spacing(property: &StyleProperty) -> bool {
    if let StyleProperty::Keyword(name, _) = property {
        return name.starts_with("padding")
            || name.starts_with("margin")
            || matches!(*name, "gap" | "row-gap" | "column-gap");
    }
    matches!(
        property,
        StyleProperty::MarginTop(_)
            | StyleProperty::MarginRight(_)
            | StyleProperty::MarginBottom(_)
            | StyleProperty::MarginLeft(_)
            | StyleProperty::PaddingTop(_)
            | StyleProperty::PaddingRight(_)
            | StyleProperty::PaddingBottom(_)
            | StyleProperty::PaddingLeft(_)
            | StyleProperty::MarginInlineStart(_)
            | StyleProperty::MarginInlineEnd(_)
            | StyleProperty::PaddingInlineStart(_)
            | StyleProperty::PaddingInlineEnd(_)
            | StyleProperty::Gap(_)
            | StyleProperty::RowGap(_)
            | StyleProperty::ColumnGap(_)
    )
}

/// Tailwind's alphanumeric tiebreak, including its representation fallback
/// for equal numeric runs. UTF-16 follows JavaScript string comparison.
/// https://github.com/tailwindlabs/tailwindcss/blob/main/packages/tailwindcss/src/utils/compare.ts
fn natural(a: &str, b: &str) -> Ordering {
    if a.is_ascii() && b.is_ascii() {
        return natural_units(a.as_bytes(), b.as_bytes());
    }
    let a: Vec<_> = a.encode_utf16().collect();
    let b: Vec<_> = b.encode_utf16().collect();
    natural_units(&a, &b)
}

fn natural_units<T: Copy + Ord + Into<u16>>(a: &[T], b: &[T]) -> Ordering {
    let digit = |n: u16| (48..=57).contains(&n);
    for i in 0..a.len().min(b.len()) {
        if digit(a[i].into()) && digit(b[i].into()) {
            let end = |text: &[T]| {
                text[i..]
                    .iter()
                    .position(|n| !digit((*n).into()))
                    .map(|n| i + n)
                    .unwrap_or(text.len())
            };
            let left = &a[i..end(a)];
            let right = &b[i..end(b)];
            let number = |text: &[T]| {
                text.iter()
                    .fold(0_f64, |n, d| n * 10.0 + f64::from((*d).into() - 48))
            };
            let order = (number(left) - number(right))
                .partial_cmp(&0.0)
                .unwrap_or(Ordering::Equal);
            if order != Ordering::Equal {
                return order;
            }
            let order = left.cmp(right);
            if order != Ordering::Equal {
                return order;
            }
        } else {
            let order = a[i].cmp(&b[i]);
            if order != Ordering::Equal {
                return order;
            }
        }
    }
    a.len().cmp(&b.len())
}

pub fn compare(a: &UtilityCascade, b: &UtilityCascade) -> Ordering {
    a.property_order
        .cmp(&b.property_order)
        .then_with(|| natural(&a.candidate, &b.candidate))
}

fn declaration_key(declaration: &StyleDeclaration) -> Option<&UtilityCascade> {
    match &declaration.source {
        StyleSource::Tailwind { utility, .. } => utility.as_deref(),
        _ => None,
    }
}

pub fn has_logical_barrier(declarations: &[StyleDeclaration]) -> bool {
    declarations.iter().any(|d| {
        matches!(
            d.property,
            StyleProperty::PaddingInlineStart(_)
                | StyleProperty::PaddingInlineEnd(_)
                | StyleProperty::MarginInlineStart(_)
                | StyleProperty::MarginInlineEnd(_)
        ) && !declaration_key(d).is_some_and(|key| key.physical_axis)
    })
}

pub(crate) fn order_region(declarations: &mut [StyleDeclaration]) {
    let mut done = Vec::new();
    for index in 0..declarations.len() {
        if declaration_key(&declarations[index]).is_none()
            || done.contains(&declarations[index].condition)
        {
            continue;
        }
        let condition = declarations[index].condition.clone();
        done.push(condition.clone());
        // Unmodeled spacing can overlap the modeled longhands (notably
        // logical/physical edges). Unknown is a barrier, not lowest priority.
        if declarations.iter().any(|d| {
            d.condition == condition && is_spacing(&d.property) && declaration_key(d).is_none()
        }) {
            continue;
        }
        let positions: Vec<_> = declarations
            .iter()
            .enumerate()
            .filter_map(|(i, d)| {
                (d.condition == condition && declaration_key(d).is_some()).then_some(i)
            })
            .collect();
        if !positions.windows(2).any(|pair| {
            compare(
                declaration_key(&declarations[pair[0]]).unwrap(),
                declaration_key(&declarations[pair[1]]).unwrap(),
            ) == Ordering::Greater
        }) {
            continue;
        }
        let mut sorted: Vec<_> = positions.iter().map(|i| declarations[*i].clone()).collect();
        sorted.sort_by(|a, b| compare(declaration_key(a).unwrap(), declaration_key(b).unwrap()));
        for (i, declaration) in positions.into_iter().zip(sorted) {
            declarations[i] = declaration;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn generated_root_order_and_numeric_ties_are_not_lexical_source_order() {
        let less = |a, b| assert_eq!(compare(&key(a).unwrap(), &key(b).unwrap()), Ordering::Less);
        less("p-8", "px-2");
        less("px-8", "pt-2");
        less("p-2", "p-10");
        less("p-01", "p-1");
        less("-m-2", "m-2");
        assert_eq!(key("ms-2"), None);
        assert_eq!(key("px-safe-offset-4"), None);
        assert_eq!(key("bg-red-500"), None);
    }
}
