//! Default candidate CSS order and Native cache metadata use the same key.
use super::{compare, is_spacing, key};
use hozo_ir::Condition;

/// Only the generated Native classes that really write spacing participate.
/// A null rank is an overlap/domain barrier when that class is requested.
pub fn ranks<'a>(names: impl Iterator<Item = (&'a str, bool)>) -> Vec<(&'a str, Option<usize>)> {
    let mut known = Vec::new();
    let mut unknown = Vec::new();
    for (name, assessed) in names {
        match key(name).filter(|_| assessed) {
            Some(key) => known.push((name, key)),
            None => unknown.push((name, None)),
        }
    }
    known.sort_by(|a, b| compare(&a.1, &b.1));
    unknown.extend(
        known
            .into_iter()
            .enumerate()
            .map(|(index, (name, _))| (name, Some(index))),
    );
    unknown
}

/// An explicit project order is authoritative. Used only for the no-order
/// candidate-sheet API, and only inside an identical condition domain.
pub fn order_candidates(names: &mut [String]) {
    let facts: Vec<_> = names
        .iter()
        .map(|name| {
            let groups = crate::resolve_class_name(name)
                .map(|u| u.groups)
                .unwrap_or_default();
            let condition = (groups.len() == 1).then(|| groups[0].0.clone());
            let spacing = groups.iter().any(|(_, p)| p.iter().any(is_spacing));
            (condition, spacing, key(name))
        })
        .collect();
    let mut done: Vec<Condition> = Vec::new();
    for (condition, _, ranked) in &facts {
        let Some(condition) = condition else { continue };
        if ranked.is_none() || done.contains(condition) {
            continue;
        }
        done.push(condition.clone());
        if facts
            .iter()
            .any(|(c, spacing, k)| c.as_ref() == Some(condition) && *spacing && k.is_none())
        {
            continue;
        }
        let positions: Vec<_> = facts
            .iter()
            .enumerate()
            .filter_map(|(i, (c, _, k))| {
                (c.as_ref() == Some(condition) && k.is_some()).then_some(i)
            })
            .collect();
        let mut sorted: Vec<_> = positions
            .iter()
            .map(|i| (names[*i].clone(), facts[*i].2.as_ref().unwrap()))
            .collect();
        sorted.sort_by(|a, b| compare(a.1, b.1));
        for (i, (name, _)) in positions.into_iter().zip(sorted) {
            names[i] = name;
        }
    }
}
