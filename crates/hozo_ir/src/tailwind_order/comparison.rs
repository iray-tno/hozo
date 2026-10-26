//! Tailwind's rule emission comparator, shared before platform lowering.
//! Reference: tailwindcss v4.3.3 compile.ts and utils/compare.ts. No family
//! table, expanded Native property names or snapshot-local first rank here.
use super::{OrderRuleDescriptor, TailwindOrderSnapshot};
use std::cmp::Ordering;

pub(super) fn ordered_indices(snapshot: &TailwindOrderSnapshot) -> Vec<(usize, usize)> {
    let mut indices: Vec<_> = snapshot
        .candidates
        .iter()
        .enumerate()
        .flat_map(|(candidate, entry)| (0..entry.rules.len()).map(move |rule| (candidate, rule)))
        .collect();
    // Stable ordering retains upstream construction order for identical
    // signatures belonging to the same candidate. IDs are not tiebreakers.
    indices.sort_by(|&(ac, ar), &(bc, br)| {
        let a = &snapshot.candidates[ac];
        let b = &snapshot.candidates[bc];
        compare_rules(&a.rules[ar], &a.candidate, &b.rules[br], &b.candidate)
    });
    indices
}

fn compare_rules(
    a: &OrderRuleDescriptor,
    a_name: &str,
    b: &OrderRuleDescriptor,
    b_name: &str,
) -> Ordering {
    // Variant bitsets are validated canonical decimals, potentially wider
    // than u128. Compare their magnitude without parsing, allocation or loss.
    a.variant_order
        .len()
        .cmp(&b.variant_order.len())
        .then_with(|| a.variant_order.cmp(&b.variant_order))
        .then_with(|| compare_properties(&a.property_order, &b.property_order))
        .then_with(|| b.declaration_count.cmp(&a.declaration_count))
        .then_with(|| compare_names(a_name, b_name))
}

fn compare_properties(a: &[u32], b: &[u32]) -> Ordering {
    for (a, b) in a.iter().zip(b) {
        if a != b {
            return a.cmp(b);
        }
    }
    // Tailwind treats the first missing property as Infinity. A shorter
    // prefix therefore sorts AFTER its extension, unlike Vec's Ord.
    b.len().cmp(&a.len())
}

fn compare_names(a: &str, b: &str) -> Ordering {
    let (mut a, mut b) = (a, b);
    while !a.is_empty() && !b.is_empty() {
        let ac = a.chars().next().unwrap();
        let bc = b.chars().next().unwrap();
        if ac.is_ascii_digit() && bc.is_ascii_digit() {
            let al = a.bytes().take_while(u8::is_ascii_digit).count();
            let bl = b.bytes().take_while(u8::is_ascii_digit).count();
            let (an, bn) = (&a[..al], &b[..bl]);
            // Upstream uses JS Number for numeric runs, including rounding
            // and overflow, then string order for equal numeric values.
            // Exact integers here would subtly change its tiebreak behavior.
            let order = an
                .parse::<f64>()
                .unwrap()
                .partial_cmp(&bn.parse::<f64>().unwrap())
                .unwrap()
                .then_with(|| an.cmp(bn));
            if order != Ordering::Equal {
                return order;
            }
            a = &a[al..];
            b = &b[bl..];
            continue;
        }
        if ac != bc {
            // JS compares UTF-16 units, not UTF-8 bytes/scalar values. The
            // first unit distinguishes BMP vs supplementary characters;
            // scalar order then resolves equal surrogate prefixes correctly.
            let first = |c: char| c.encode_utf16(&mut [0; 2])[0];
            return first(ac).cmp(&first(bc)).then_with(|| ac.cmp(&bc));
        }
        a = &a[ac.len_utf8()..];
        b = &b[bc.len_utf8()..];
    }
    a.len().cmp(&b.len())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn property_prefixes_use_missing_infinity_not_rust_vector_order() {
        assert_eq!(compare_properties(&[42], &[42, 46]), Ordering::Greater);
        assert_eq!(compare_properties(&[], &[42]), Ordering::Greater);
        assert_eq!(compare_properties(&[42, 47], &[43]), Ordering::Less);
        assert_eq!(compare_properties(&[42], &[42]), Ordering::Equal);
    }

    #[test]
    fn names_match_js_numeric_runs_leading_zeros_rounding_overflow_and_utf16() {
        for (a, b) in [
            ("p-2", "p-10"),
            ("p-02", "p-2"),
            ("bg-red-500", "bg-red-500/70"),
            ("p-1.2", "p-1.10"),
            ("p-09007199254740993", "p-9007199254740992"),
            ("x-😀", "x-\u{e000}"),
            ("x-😀", "x-😁"),
        ] {
            assert_eq!(compare_names(a, b), Ordering::Less, "{a} < {b}");
            assert_eq!(compare_names(b, a), Ordering::Greater, "{b} > {a}");
            assert_eq!(compare_names(a, a), Ordering::Equal);
        }
        let long = format!("p-{}", "9".repeat(400));
        let longer = format!("p-{}", "9".repeat(401));
        assert_eq!(compare_names(&long, &longer), Ordering::Less);
    }

    #[test]
    fn portable_rules_match_upstream_first_rule_order_and_cache_one_index() {
        let context =
            crate::TailwindOrderContext::new(crate::portable_tailwind_snapshot()).unwrap();
        assert!(context.rule_order.get().is_none());
        let rules: Vec<_> = context.rules_in_emission_order().collect();
        assert_eq!(
            rules.len(),
            context
                .snapshot()
                .candidates
                .iter()
                .map(|entry| entry.rules.len())
                .sum::<usize>()
        );
        assert!(!rules.is_empty());
        let pointer = context.rule_order.get().unwrap().as_ptr();
        let mut seen = std::collections::HashSet::new();
        let firsts: Vec<_> = rules
            .iter()
            .filter(|(candidate, _)| seen.insert(candidate.id))
            .map(|(candidate, _)| candidate.candidate.as_str())
            .collect();
        let mut upstream: Vec<_> = context
            .snapshot()
            .candidates
            .iter()
            .filter_map(|entry| {
                entry
                    .first_rule_rank
                    .as_ref()
                    .map(|rank| (rank.parse::<u64>().unwrap(), entry.candidate.as_str()))
            })
            .collect();
        upstream.sort_by_key(|(rank, _)| *rank);
        assert_eq!(
            firsts,
            upstream.iter().map(|(_, name)| *name).collect::<Vec<_>>()
        );
        assert_eq!(context.rules_in_emission_order().count(), rules.len());
        assert_eq!(pointer, context.rule_order.get().unwrap().as_ptr());
    }
}
