//! Applying a project's forwarding table to parsed nodes.

use hozo_ir::{
    Child, Condition, ConditionExpr, EnclosingComponent, EnclosingValue, NestedNode, Node,
    StyleDeclaration,
};

use super::ForwardingComponent;
use crate::tailwind;

/// Manifests' text forwarding, keyed by the module a caller imports from and
/// the name it imports.
#[derive(Debug, Default, Clone)]
pub struct ForwardingTable {
    entries: std::collections::HashMap<(String, String), ForwardingComponent>,
}

impl ForwardingTable {
    pub fn insert(&mut self, module: &str, component: ForwardingComponent) {
        self.entries
            .insert((module.to_string(), component.name.clone()), component);
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }
}

/// Fills in what each element's enclosing components hand down (#950).
///
/// Declarations for every property the classes set, not only text ones: the
/// backend decides what a text element inherits, as it does for the
/// declarations an ancestor in the same file hands down.
pub fn apply_text_forwarding(output: &mut crate::ParseOutput, table: &ForwardingTable) {
    if table.is_empty() {
        return;
    }
    let imports = &output.imports;
    for root in &mut output.roots {
        root.forwarded = forwarded_by(&root.enclosing, imports, table);
        apply_to_node(&mut root.node, imports, table);
    }
}

pub(super) fn apply_to_nested(
    nested: &mut [NestedNode],
    imports: &[crate::ImportBinding],
    table: &ForwardingTable,
) {
    for entry in nested {
        entry.forwarded = forwarded_by(&entry.enclosing, imports, table);
        apply_to_node(&mut entry.node, imports, table);
    }
}

pub(super) fn apply_to_node(
    node: &mut Node,
    imports: &[crate::ImportBinding],
    table: &ForwardingTable,
) {
    for prop in &mut node.props.passthrough {
        apply_to_nested(&mut prop.nested, imports, table);
    }
    for child in &mut node.children {
        match child {
            Child::Node(inner) => apply_to_node(inner, imports, table),
            Child::Verbatim { nested, .. } => apply_to_nested(nested, imports, table),
            Child::Text(_) => {}
        }
    }
}

/// Outermost first, so an inner component's classes come later and win.
pub(super) fn forwarded_by(
    enclosing: &[EnclosingComponent],
    imports: &[crate::ImportBinding],
    table: &ForwardingTable,
) -> Vec<StyleDeclaration> {
    enclosing
        .iter()
        .flat_map(|component| resolve(component, imports, table))
        .collect()
}

pub(super) fn resolve(
    component: &EnclosingComponent,
    imports: &[crate::ImportBinding],
    table: &ForwardingTable,
) -> Vec<StyleDeclaration> {
    // A spread may set the very prop the classes depend on.
    if component.spread {
        return Vec::new();
    }
    let Some(import) = imports
        .iter()
        .find(|import| import.local == component.local)
    else {
        return Vec::new();
    };
    let key = (import.source.clone(), import.imported.clone());
    let Some(entry) = table.entries.get(&key) else {
        return Vec::new();
    };
    let value_of = |name: &str| {
        component
            .props
            .iter()
            .find(|p| p.name == name)
            .map(|p| &p.value)
    };

    // Every prop the classes depend on has to be known here: a literal, or
    // absent with a default. Anything else is decided at runtime, where the
    // direct-child forwarding of #876 still applies.
    let mut when = Vec::new();
    for prop in &entry.props {
        let value = match value_of(&prop.name) {
            Some(EnclosingValue::Literal(value)) => value.clone(),
            None => match &prop.default {
                Some(default) => default.clone(),
                None => return Vec::new(),
            },
            Some(_) => return Vec::new(),
        };
        when.push(value);
    }
    let Some(variant) = entry.variants.iter().find(|v| v.when == when) else {
        return Vec::new();
    };

    // `disabled:` is driven by the prop the component hands to its host's
    // `disabled`, so the caller's own expression for that prop decides it.
    let disabled = entry.disabled_prop.as_deref().and_then(value_of);
    let mut out = Vec::new();
    for token in variant.classes.split_whitespace() {
        if tailwind::has_unstripped_variant(token) {
            continue;
        }
        let (condition, properties) = tailwind::expand_utility(token);
        let condition = match condition {
            Condition::Always | Condition::Responsive(_) => condition,
            Condition::Disabled => match disabled {
                Some(EnclosingValue::True) => Condition::Always,
                Some(EnclosingValue::Expr(expr)) => Condition::Expr(ConditionExpr::Ref(*expr)),
                // Not disabled, or not by anything this file can see.
                _ => continue,
            },
            Condition::Enabled => match disabled {
                Some(EnclosingValue::True) => continue,
                Some(EnclosingValue::Expr(expr)) => {
                    Condition::Expr(ConditionExpr::Not(Box::new(ConditionExpr::Ref(*expr))))
                }
                _ => Condition::Always,
            },
            // Pressed, hovered and focused belong to the component's own
            // pressable. A host that shares them hands them to the Text,
            // which reads them at runtime; any other is not wired to it,
            // so they are left out rather than applied unconditionally.
            Condition::Pressed | Condition::Hover | Condition::Focus | Condition::FocusVisible
                if entry.host_states =>
            {
                condition
            }
            _ => continue,
        };
        for property in properties {
            out.push(StyleDeclaration {
                source: Default::default(),
                property,
                condition: condition.clone(),
            });
        }
    }
    out
}
