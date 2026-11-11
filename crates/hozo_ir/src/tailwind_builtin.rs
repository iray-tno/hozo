//! What Tailwind's own class order reads, built in, for a compile with no
//! project CSS (#1230, RFC 007).
//!
//! A captured project asks real Tailwind for every class's rule descriptor.
//! Without one -- the standalone API, WASM, tests -- there is nothing to ask,
//! and every input keeps its authored order. Tailwind's order is a
//! comparison, not a table: variant order, then the position of each declared
//! property in Tailwind's property list, then the declaration count, then the
//! class name compared numerically. What it reads per class depends only on
//! the utility's root and, per variant, on its wrapper, so that is what
//! `tailwind_builtin_data.rs` records, generated from the installed Tailwind
//! by `scripts/generate-tailwind-builtin-order.mjs`.
//!
//! This module only holds and looks up that data. Building a class's
//! descriptor from it is a separate step, checked against real Tailwind's
//! descriptors before anything relies on it.

#[rustfmt::skip]
#[path = "tailwind_builtin_data.rs"]
mod data;

/// One node of a rule body or variant wrapper, as the descriptor assessment
/// reads it: selectors, at-rules and declaration names, never values.
#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) enum N {
    /// A declaration and whether it is `!important`.
    D(&'static str, bool),
    /// A nested rule and its selector.
    R(&'static str, &'static [N]),
    /// An at-rule, its name (`@media`) and its params.
    A(&'static str, &'static str, &'static [N]),
    /// Where a variant wrapper puts the class's own nodes.
    S,
}

/// One body a utility root's classes compile to. Most roots have one; a few
/// (`text`: a size or a colour) have more, and which applies depends on the
/// value.
#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) struct Form {
    pub nodes: &'static [N],
    /// Indices into Tailwind's property list, ascending.
    pub order: &'static [u16],
    /// Declarations that carry a value; Tailwind counts only those.
    pub count: u16,
}

/// The Tailwind version the built-in order was generated from.
pub fn builtin_tailwind_version() -> &'static str {
    data::TAILWIND_VERSION
}

/// The bodies a utility root's classes compile to, or `None` for a root
/// Tailwind does not have.
pub(crate) fn root_forms(root: &str) -> Option<&'static [Form]> {
    data::ROOTS
        .binary_search_by(|(name, _)| (*name).cmp(root))
        .ok()
        .map(|index| data::ROOTS[index].1)
}

/// A named variant instance's position in Tailwind's variant order and its
/// wrapper, or `None` for one that is not enumerated (arbitrary values such
/// as `data-[state=open]`, or a variant that rewrites the class's selector).
pub(crate) fn variant(instance: &str) -> Option<(u16, &'static [N])> {
    data::VARIANTS
        .binary_search_by(|(name, _, _)| (*name).cmp(instance))
        .ok()
        .map(|index| (data::VARIANTS[index].1, data::VARIANTS[index].2))
}

/// Bounded owner precedence when a complete candidate priority is unavailable.
/// Reuse the built-in descriptor's variant positions. Compress just these
/// four positions to preserve the generated resolver's existing integer ABI.
pub fn builtin_owner_interaction_rank(condition: &crate::Condition) -> Option<u32> {
    use crate::Condition;
    static BITS: std::sync::OnceLock<Option<[u8; 4]>> = std::sync::OnceLock::new();

    fn parts(condition: &Condition, bits: &[u8; 4]) -> Option<(u16, u8)> {
        let slot = match condition {
            Condition::Hover => 0,
            Condition::Focus => 1,
            Condition::FocusVisible => 2,
            Condition::Pressed => 3,
            Condition::All(conditions) if !conditions.is_empty() => {
                return conditions
                    .iter()
                    .try_fold((0_u16, 0_u8), |(weight, mask), item| {
                        let (count, bit) = parts(item, bits)?;
                        Some((weight.checked_add(count)?, mask | bit))
                    });
            }
            _ => return None,
        };
        Some((1, bits[slot]))
    }

    let bits = BITS.get_or_init(|| {
        let mut positions = [
            (variant("hover")?.0, 0),
            (variant("focus")?.0, 1),
            (variant("focus-visible")?.0, 2),
            (variant("active")?.0, 3),
        ];
        positions.sort_unstable();
        if positions.windows(2).any(|pair| pair[0].0 == pair[1].0) {
            return None;
        }
        let mut bits = [0; 4];
        for (rank, (_, slot)) in positions.into_iter().enumerate() {
            bits[slot] = 1 << rank;
        }
        Some(bits)
    });
    let (weight, mask) = parts(condition, bits.as_ref()?)?;
    Some(u32::from(weight) * 256 + u32::from(mask))
}

/// A snapshot of every given class's rule descriptor, built from the
/// generated data instead of a captured Tailwind.
///
/// Each class comes with the writes Hozo parsed for it, which choose between
/// a root's bodies when it has more than one (`text-lg` is a size,
/// `text-red-500` a colour): the body that declares a property one of the
/// writes owns. A class whose root or any variant is not in the data, that
/// is `!important`, or whose body cannot be chosen, is `NotGenerated`, which
/// keeps any input using it on the authored-order path -- the same barrier a
/// captured project gives a class Tailwind did not generate.
///
/// Ranks come from the shared comparator (`comparison.rs`) reading these
/// descriptors, exactly as for a captured project; nothing here orders.
pub fn builtin_tailwind_snapshot<'a, I>(classes: I) -> crate::TailwindOrderSnapshot
where
    I: IntoIterator<Item = (&'a str, Vec<crate::StyleProperty>)>,
{
    use crate::{OrderCandidateDescriptor, OrderCandidateStatus, OrderRuleDescriptor};
    let mut classes: Vec<_> = classes.into_iter().collect();
    classes.sort_by(|a, b| a.0.cmp(b.0));
    classes.dedup_by(|a, b| a.0 == b.0);
    let mut fingerprint = Fingerprint::default();
    let mut next_rule = 0u32;
    let candidates = classes
        .iter()
        .enumerate()
        .map(|(index, (name, writes))| {
            fingerprint.add(name);
            let id = index as u32;
            let rules: Vec<_> = describe(name, writes)
                .map(|(variant_order, form, shape)| {
                    let rule = OrderRuleDescriptor {
                        id: next_rule,
                        candidate_id: id,
                        variant_order,
                        important: false,
                        property_order: form.order.iter().map(|&i| u32::from(i)).collect(),
                        declaration_count: u32::from(form.count),
                        shape,
                    };
                    next_rule += 1;
                    rule
                })
                .into_iter()
                .collect();
            OrderCandidateDescriptor {
                id,
                candidate: (*name).to_string(),
                status: if rules.is_empty() {
                    OrderCandidateStatus::NotGenerated
                } else {
                    OrderCandidateStatus::Described
                },
                first_rule_rank: None,
                rules,
            }
        })
        .collect();
    crate::TailwindOrderSnapshot {
        schema: 1,
        policy: "tailwind-rule-signatures-v1".into(),
        tailwind_version: format!("builtin:{}", data::TAILWIND_VERSION),
        fingerprint: fingerprint.hex(),
        stylesheets: Vec::new(),
        candidates,
    }
}

/// One class's variant order, chosen body and rule shape, or `None`.
/// Emit-order projection for a built-in candidate sheet. These candidates
/// have one modeled rule each. Unlike static planning this needs neither
/// declaration nodes nor assessed selector specificity.
pub fn builtin_tailwind_emission_order<'a, I>(classes: I) -> Vec<&'a str>
where
    I: IntoIterator<Item = (&'a str, Vec<crate::StyleProperty>)>,
{
    let mut keys: Vec<_> = classes
        .into_iter()
        .filter_map(|(name, writes)| {
            let (form, variants) = form_and_variants(name, &writes)?;
            crate::tailwind_assessment::root_selector(name)?;
            Some((name, variant_order(variants, |_| {})?, form))
        })
        .collect();
    keys.sort_by(|(a_name, a_variants, a), (b_name, b_variants, b)| {
        crate::tailwind_order::compare_sort_keys(
            (a_variants, a.order, u32::from(a.count), a_name),
            (b_variants, b.order, u32::from(b.count), b_name),
        )
    });
    keys.into_iter().map(|(name, _, _)| name).collect()
}

fn describe(
    name: &str,
    writes: &[crate::StyleProperty],
) -> Option<(String, Form, crate::OrderRuleShape)> {
    use crate::OrderRuleShape;
    let (form, variants) = form_and_variants(name, writes)?;
    let mut nodes: Vec<OrderRuleShape> = form.nodes.iter().map(|n| owned(n, &[])).collect();
    let order = variant_order(variants, |wrapper| {
        nodes = wrapper.iter().map(|n| owned(n, &nodes)).collect();
    })?;
    let selector = crate::tailwind_assessment::root_selector(name)?;
    Some((order, form, OrderRuleShape::Rule { selector, nodes }))
}

fn form_and_variants<'a>(
    name: &'a str,
    writes: &[crate::StyleProperty],
) -> Option<(Form, Vec<&'a str>)> {
    let mut segments = split_top_level(name, ':')?;
    let utility = segments.pop()?;
    if utility.starts_with('!') || utility.ends_with('!') {
        return None;
    }
    let form = choose_form(root_forms(root_of(utility)?)?, writes)?;
    Some((*form, segments))
}

fn variant_order(variants: Vec<&str>, mut apply: impl FnMut(&[N])) -> Option<String> {
    let mut bits = Vec::new();
    // Tailwind applies the variant written nearest the utility first, so
    // `md:hover:p-4` is hover inside md.
    for instance in variants.into_iter().rev() {
        let (position, wrapper) = variant(instance)?;
        bits.push(position);
        apply(wrapper);
    }
    Some(decimal_bitset(&bits))
}

/// The utility's root: the whole name for a static utility, otherwise the
/// longest prefix before a `-` that Tailwind has, as Tailwind's own parse
/// keeps the parse that compiles. A `-` inside brackets never splits.
fn root_of(utility: &str) -> Option<&str> {
    let bare = utility.split('/').next().unwrap_or(utility);
    if root_forms(bare).is_some() {
        return Some(bare);
    }
    let mut depth = 0i32;
    let mut cuts = Vec::new();
    for (index, byte) in utility.bytes().enumerate() {
        match byte {
            b'[' | b'(' => depth += 1,
            b']' | b')' => depth -= 1,
            b'-' if depth == 0 && index > 0 => cuts.push(index),
            _ => {}
        }
    }
    cuts.into_iter()
        .rev()
        .map(|cut| &utility[..cut])
        .find(|prefix| root_forms(prefix).is_some())
}

fn choose_form<'f>(forms: &'f [Form], writes: &[crate::StyleProperty]) -> Option<&'f Form> {
    if let [only] = forms {
        return Some(only);
    }
    fn declares(nodes: &[N], write: &crate::StyleProperty) -> bool {
        nodes.iter().any(|node| match node {
            N::D(property, _) => crate::tailwind_assessment::covers(property, write),
            N::R(_, nested) | N::A(_, _, nested) => declares(nested, write),
            N::S => false,
        })
    }
    fn names(nodes: &[N], property: &str) -> bool {
        nodes.iter().any(|node| match node {
            N::D(name, _) => *name == property,
            N::R(_, nested) | N::A(_, _, nested) => names(nested, property),
            N::S => false,
        })
    }
    let unique = |matches: &dyn Fn(&Form) -> bool| {
        let mut found = forms.iter().filter(|form| matches(form));
        let first = found.next()?;
        found.next().is_none().then_some(first)
    };
    // A write's own property first: `shadow-red-500` is owned by either
    // shadow register, but only the colour body declares `--tw-shadow-color`.
    unique(&|form| {
        writes.iter().any(|write| {
            crate::tailwind_assessment::scalar_css_property(write)
                .is_some_and(|property| names(form.nodes, property))
        })
    })
    .or_else(|| unique(&|form| writes.iter().any(|write| declares(form.nodes, write))))
    // The body that declares every write and nothing the writes do not:
    // `transition-colors` declares all three transition properties, which
    // `transition-none`'s one-property body does not, and the reverse for
    // `transition-none` itself.
    .or_else(|| {
        unique(&|form| {
            writes.iter().all(|write| declares(form.nodes, write))
                && declared(form.nodes).iter().all(|property| {
                    writes
                        .iter()
                        .any(|write| crate::tailwind_assessment::covers(property, write))
                })
        })
    })
    // Bodies the comparison cannot tell apart: the same property order and
    // declaration count rank the same, so any of them describes the class.
    .or_else(|| {
        let mut owning = forms
            .iter()
            .filter(|form| writes.iter().all(|write| declares(form.nodes, write)));
        let first = owning.next()?;
        owning
            .all(|form| form.order == first.order && form.count == first.count)
            .then_some(first)
    })
}

fn declared(nodes: &[N]) -> Vec<&'static str> {
    let mut out = Vec::new();
    for node in nodes {
        match node {
            N::D(property, _) if !property.starts_with("--tw-sort") => out.push(*property),
            N::R(_, nested) | N::A(_, _, nested) => out.extend(declared(nested)),
            _ => {}
        }
    }
    out
}

fn owned(node: &N, slot: &[crate::OrderRuleShape]) -> crate::OrderRuleShape {
    use crate::OrderRuleShape;
    match node {
        N::D(property, important) => OrderRuleShape::Declaration {
            property: (*property).to_string(),
            important: *important,
        },
        N::R(selector, nodes) => OrderRuleShape::Rule {
            selector: (*selector).to_string(),
            nodes: expand(nodes, slot),
        },
        N::A(name, params, nodes) => OrderRuleShape::AtRule {
            name: (*name).to_string(),
            params: (*params).to_string(),
            nodes: expand(nodes, slot),
        },
        // Only reached at a wrapper's top level, which `expand` handles.
        N::S => unreachable!("a slot is expanded by its parent"),
    }
}

fn expand(nodes: &[N], slot: &[crate::OrderRuleShape]) -> Vec<crate::OrderRuleShape> {
    nodes
        .iter()
        .flat_map(|node| match node {
            N::S => slot.to_vec(),
            other => vec![owned(other, slot)],
        })
        .collect()
}

/// Splits on `separator` outside brackets and parentheses.
fn split_top_level(value: &str, separator: char) -> Option<Vec<&str>> {
    let mut depth = 0i32;
    let mut start = 0;
    let mut parts = Vec::new();
    for (index, ch) in value.char_indices() {
        match ch {
            '[' | '(' => depth += 1,
            ']' | ')' => depth -= 1,
            c if c == separator && depth == 0 => {
                parts.push(&value[start..index]);
                start = index + ch.len_utf8();
            }
            _ => {}
        }
    }
    parts.push(&value[start..]);
    (depth == 0 && parts.iter().all(|part| !part.is_empty())).then_some(parts)
}

/// The bitset of variant positions as the canonical decimal the comparator
/// reads: no leading zeros, `0` when there is no variant.
fn decimal_bitset(positions: &[u16]) -> String {
    let width = positions
        .iter()
        .map(|&p| usize::from(p) / 32 + 1)
        .max()
        .unwrap_or(1);
    let mut limbs = vec![0u32; width];
    for &position in positions {
        limbs[usize::from(position) / 32] |= 1 << (position % 32);
    }
    let mut digits = Vec::new();
    while limbs.iter().any(|&limb| limb != 0) {
        let mut remainder = 0u64;
        for limb in limbs.iter_mut().rev() {
            let value = (remainder << 32) | u64::from(*limb);
            *limb = (value / 1_000_000_000) as u32;
            remainder = value % 1_000_000_000;
        }
        digits.push(remainder as u32);
    }
    match digits.split_last() {
        None => "0".into(),
        Some((top, rest)) => {
            let mut out = top.to_string();
            for chunk in rest.iter().rev() {
                out.push_str(&format!("{chunk:09}"));
            }
            out
        }
    }
}

/// A content key in the shape the context validates (64 hex digits), so a
/// cache keyed on it changes with the class set. Not a security hash.
#[derive(Default)]
struct Fingerprint([u64; 4]);

impl Fingerprint {
    fn add(&mut self, name: &str) {
        for (lane, state) in self.0.iter_mut().enumerate() {
            let mut hash = *state ^ (0xcbf2_9ce4_8422_2325 ^ lane as u64);
            for byte in name.bytes().chain([0]) {
                hash ^= u64::from(byte);
                hash = hash
                    .wrapping_mul(0x0100_0000_01b3)
                    .rotate_left(lane as u32 + 1);
            }
            *state = hash;
        }
    }

    fn hex(&self) -> String {
        self.0.iter().map(|lane| format!("{lane:016x}")).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decimal_bitsets_are_canonical_and_wider_than_u128() {
        assert_eq!(decimal_bitset(&[]), "0");
        assert_eq!(decimal_bitset(&[0]), "1");
        assert_eq!(decimal_bitset(&[3, 1]), "10");
        assert_eq!(decimal_bitset(&[64]), "18446744073709551616");
        assert_eq!(
            decimal_bitset(&[128]),
            "340282366920938463463374607431768211456"
        );
    }

    #[test]
    fn classes_split_into_root_variants_and_slots() {
        assert_eq!(root_of("translate-x-4"), Some("translate-x"));
        assert_eq!(root_of("-translate-x-4"), Some("-translate-x"));
        assert_eq!(root_of("p-[13px]"), Some("p"));
        assert_eq!(root_of("bg-red-500/50"), Some("bg"));
        assert_eq!(root_of("flex"), Some("flex"));
        assert_eq!(root_of("[color:red]"), None);
        assert_eq!(
            split_top_level("md:data-[a:b]:p-4", ':'),
            Some(vec!["md", "data-[a:b]", "p-4"])
        );
    }

    #[test]
    fn the_data_is_sorted_so_lookups_find_every_entry() {
        assert!(data::ROOTS.windows(2).all(|pair| pair[0].0 < pair[1].0));
        assert!(data::VARIANTS.windows(2).all(|pair| pair[0].0 < pair[1].0));
        for (name, forms) in data::ROOTS {
            assert_eq!(root_forms(name), Some(*forms));
            assert!(!forms.is_empty(), "{name}");
        }
        for (name, position, wrapper) in data::VARIANTS {
            assert_eq!(variant(name), Some((*position, *wrapper)));
        }
    }

    #[test]
    fn roots_and_variants_carry_what_the_comparison_reads() {
        // `text` is a size or a colour, and the two sort differently.
        let text = root_forms("text").unwrap();
        assert_eq!(text.len(), 2);
        assert!(text
            .iter()
            .any(|form| form.nodes.contains(&N::D("font-size", false))));
        assert!(text.iter().any(|form| form.nodes == [N::D("color", false)]));
        let padding = root_forms("p").unwrap();
        assert_eq!(padding.len(), 1);
        assert_eq!(padding[0].nodes, &[N::D("padding", false)]);
        assert_eq!(padding[0].count, 1);
        // A breakpoint is an at-rule wrapper; `hover` nests its media query
        // inside the selector, as Tailwind writes it.
        let (md, md_wrapper) = variant("md").unwrap();
        assert_eq!(md_wrapper, &[N::A("@media", "(width >= 48rem)", &[N::S])]);
        let (lg, _) = variant("lg").unwrap();
        assert!(md < lg);
        let (hover, wrapper) = variant("hover").unwrap();
        assert_eq!(
            wrapper,
            &[N::R(
                "&:hover",
                &[N::A("@media", "(hover: hover)", &[N::S])]
            )]
        );
        let (focus, _) = variant("focus").unwrap();
        assert!(hover < focus);
        assert!(variant("data-[state=open]").is_none());
        assert!(root_forms("not-a-tailwind-root").is_none());
        assert_eq!(builtin_tailwind_version(), "4.3.3");
    }
}
