//! An element's role, written or implicit, and the props, context and
//! children that role requires or allows.

use hozo_ir::{AccessibilityRole, Child, Diagnostic, DiagnosticCode, Node, Primitive, Severity};

use super::{is_state_prop, list};
use crate::aria;

/// The ARIA role a node carries, if it is one the specification names.
pub(super) fn aria_role(node: &Node) -> Option<&str> {
    match &node.props.accessibility_role {
        Some(AccessibilityRole::Button) => Some("button"),
        Some(AccessibilityRole::Link) => Some("link"),
        Some(AccessibilityRole::Aria(name)) => Some(name.as_str()),
        Some(AccessibilityRole::NativeOnly(_)) | None => None,
    }
}

/// Whether the node supplies an ARIA property, under any of its spellings.
///
/// `None` means "cannot tell", which is this module's answer wherever the
/// source stops being readable.
pub(super) fn supplies(node: &Node, property: &str) -> Option<bool> {
    if node.props.accessibility_state.is_some() && is_state_prop(property) {
        match node.props.accessibility_state_keys.as_ref() {
            // An object literal says exactly which states it carries, so
            // the ones it does not name are genuinely absent rather than
            // unknown -- and a required state that is missing from a
            // literal is now a finding instead of a shrug.
            Some(_) if written_props(node).contains(&property) => return Some(true),
            Some(_) => {}
            // A variable or a spread could carry anything.
            None => return None,
        }
    }
    let modelled = match property {
        "aria-label" => node.props.accessibility_label.is_some(),
        "aria-description" => node.props.accessibility_hint.is_some(),
        _ => false,
    };
    if modelled {
        return Some(true);
    }
    // A `{...spread}` may carry anything, so it is the same "cannot tell".
    if node.props.passthrough.iter().any(|prop| prop.is_spread) {
        return None;
    }
    Some(
        node.props
            .passthrough
            .iter()
            .filter_map(|prop| prop.name.as_deref())
            .any(|name| name == property),
    )
}

pub(super) fn check_props(node: &Node, spec: &aria::AriaRole, diagnostics: &mut Vec<Diagnostic>) {
    let missing: Vec<&str> = spec
        .required_props
        .iter()
        .copied()
        .filter(|property| supplies(node, property) == Some(false))
        .collect();
    if missing.is_empty() {
        return;
    }
    diagnostics.push(Diagnostic {
        code: DiagnosticCode::AriaIncompletePattern,
        severity: Severity::Warning,
        message: format!(
            "`role=\"{}\"` needs {} to mean anything, and this element has {} none of them. \
             The element renders correctly either way; what changes is what a screen reader \
             announces.",
            spec.name,
            list(spec.required_props),
            if missing.len() == spec.required_props.len() {
                ""
            } else {
                "only some of "
            },
        ),
        span: node.span,
    });
}

pub(super) fn check_context(
    node: &Node,
    spec: &aria::AriaRole,
    ancestors: &[&str],
    diagnostics: &mut Vec<Diagnostic>,
) {
    if spec.required_context.is_empty() {
        return;
    }
    if spec
        .required_context
        .iter()
        .any(|role| ancestors.contains(role))
    {
        return;
    }
    // An unreadable expression anywhere above could be supplying the
    // container, so a missing one is only a finding when the whole chain
    // was visible.
    diagnostics.push(Diagnostic {
        code: DiagnosticCode::AriaIncompletePattern,
        severity: Severity::Warning,
        message: format!(
            "`role=\"{}\"` has to be inside {}, and nothing above it here is. Assistive \
             technology reads the two together; on its own this announces as ordinary content.",
            spec.name,
            list(spec.required_context),
        ),
        span: node.span,
    });
}

pub(super) fn check_owned(node: &Node, spec: &aria::AriaRole, diagnostics: &mut Vec<Diagnostic>) {
    if spec.required_owned.is_empty() {
        return;
    }
    // Anything the compiler only carries may render the missing role, so
    // its presence makes the answer unknowable rather than negative.
    if node
        .children
        .iter()
        .any(|child| matches!(child, Child::Verbatim { .. }))
    {
        return;
    }
    let owned: Vec<&str> = node
        .children
        .iter()
        .filter_map(|child| match child {
            Child::Node(child_node) => aria_role(child_node),
            _ => None,
        })
        .collect();
    if spec.required_owned.iter().any(|role| owned.contains(role)) {
        return;
    }
    diagnostics.push(Diagnostic {
        code: DiagnosticCode::AriaIncompletePattern,
        severity: Severity::Warning,
        message: format!(
            "`role=\"{}\"` has to contain {}, and none of its children carry that role. An \
             empty one of these is announced as an empty {}.",
            spec.name,
            list(spec.required_owned),
            spec.name,
        ),
        span: node.span,
    });
}

/// The role a primitive means when the author wrote none.
///
/// Only meanings known from this node. An authored but opaque/Native-only
/// role, or a spread that could change it, is not the primitive's default.
/// Context-dependent roles (header/footer, summary, table header scope) and
/// input types stay unknown rather than borrowing a nearby role's rules.
pub(super) fn implicit_role(node: &Node) -> Option<&'static str> {
    if node.props.accessibility_role.is_some()
        || node.props.has_spread()
        || node
            .props
            .passthrough
            .iter()
            .any(|p| matches!(p.name.as_deref(), Some("role" | "accessibilityRole")))
    {
        return None;
    }
    let has_href = node
        .props
        .passthrough
        .iter()
        .any(|p| p.name.as_deref() == Some("href"));
    match node.primitive {
        Primitive::View | Primitive::Text | Primitive::ScrollView => Some("generic"),
        Primitive::Pressable if has_href => Some("link"),
        Primitive::Pressable => Some("generic"),
        Primitive::Button if has_href => Some("link"),
        Primitive::Button => Some("button"),
        Primitive::Link if has_href => Some("link"),
        Primitive::Image
            if !node
                .props
                .passthrough
                .iter()
                .any(|p| p.name.as_deref() == Some("alt"))
                || literal(node, "alt").is_some_and(|alt| !alt.is_empty()) =>
        {
            Some("img")
        }
        Primitive::Paragraph => Some("paragraph"),
        Primitive::Heading => Some("heading"),
        Primitive::Section if node.props.has_accessible_name() == Some(true) => Some("region"),
        Primitive::Article => Some("article"),
        Primitive::Nav => Some("navigation"),
        Primitive::Main => Some("main"),
        Primitive::Aside => Some("complementary"),
        Primitive::Search => Some("search"),
        Primitive::Figure => Some("figure"),
        Primitive::Fieldset | Primitive::Details => Some("group"),
        Primitive::List => Some("list"),
        Primitive::ListItem => Some("listitem"),
        Primitive::Separator
            if !node.props.passthrough.iter().any(|p| {
                p.name.as_deref() == Some("decorative") && p.literal.as_deref() != Some("false")
            }) =>
        {
            Some("separator")
        }
        Primitive::Progress => Some("progressbar"),
        Primitive::Meter => Some("meter"),
        Primitive::Dialog => Some("dialog"),
        Primitive::Table => Some("table"),
        Primitive::TableHeader | Primitive::TableBody | Primitive::TableFooter => Some("rowgroup"),
        Primitive::TableRow => Some("row"),
        Primitive::TableCell => Some("cell"),
        _ => None,
    }
}

/// States and properties written by name, and the ARIA spelling of each.
///
/// `accessibilityState`'s keys are readable when it is an object literal;
/// `accessibility_state_keys` is `None` when it is not, and then nothing
/// here is claimed.
pub(super) fn written_props(node: &Node) -> Vec<&'static str> {
    let mut written = Vec::new();
    if let Some(keys) = node.props.accessibility_state_keys.as_ref() {
        for (aria_name, key) in ARIA_STATE_KEYS {
            if keys.iter().any(|written_key| written_key == key) {
                written.push(*aria_name);
            }
        }
    }
    written
}

/// `accessibilityState`'s keys and the ARIA property each becomes. The
/// same mapping the Web backend emits from; it is one to one.
pub(super) const ARIA_STATE_KEYS: &[(&str, &str)] = &[
    ("aria-disabled", "disabled"),
    ("aria-selected", "selected"),
    ("aria-checked", "checked"),
    ("aria-busy", "busy"),
    ("aria-expanded", "expanded"),
];

/// A state the role does not accept.
///
/// Only for states written out by name. An opaque `accessibilityState`
/// could carry anything, and the rest of this module's rule is that an
/// unreadable expression means "cannot tell" rather than "no".
pub(super) fn check_allowed(node: &Node, spec: &aria::AriaRole, diagnostics: &mut Vec<Diagnostic>) {
    let refused: Vec<&str> = written_props(node)
        .into_iter()
        .filter(|prop| !aria::allows_prop(spec, prop))
        .collect();
    if refused.is_empty() {
        return;
    }
    diagnostics.push(Diagnostic {
        code: DiagnosticCode::AriaPropNotAllowed,
        severity: Severity::Warning,
        message: format!(
            "`role=\"{}\"` does not take {}. Assistive technology has nothing to do with {} \
             here, so the state is carried into the output and never announced.",
            spec.name,
            list(&refused),
            if refused.len() == 1 { "it" } else { "them" },
        ),
        span: node.span,
    });
}

/// The literal value of a prop the compiler could read, if it is there.
pub(super) fn literal<'a>(node: &'a Node, name: &str) -> Option<&'a str> {
    node.props
        .passthrough
        .iter()
        .find(|prop| prop.name.as_deref() == Some(name))
        .and_then(|prop| prop.literal.as_deref())
}
