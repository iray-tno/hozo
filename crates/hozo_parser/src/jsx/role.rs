//! Accessibility roles from `role` and `accessibilityRole` values.

use hozo_ir::AccessibilityRole;
use oxc_ast::ast::{JSXAttributeValue, JSXExpression};

/// Only a statically-known `"button"`/`"link"` string literal is
/// recognized -- `accessibilityRole` drives real ARIA/native role output
/// and diagnostic suppression, so (unlike `onPress`/`disabled`, which stay
/// fully opaque) Hozo needs to actually know its value, not just its
/// span. A dynamic or unrecognized value is treated the same as absent:
/// conservative (the interactive-without-role diagnostic can still fire)
/// rather than guessing.
pub(super) fn accessibility_role_from_value(
    value: &Option<JSXAttributeValue>,
    aria: bool,
) -> Option<AccessibilityRole> {
    let literal = match value {
        Some(JSXAttributeValue::StringLiteral(lit)) => Some(lit.value.as_str()),
        Some(JSXAttributeValue::ExpressionContainer(container)) => match &container.expression {
            JSXExpression::StringLiteral(lit) => Some(lit.value.as_str()),
            _ => None,
        },
        _ => None,
    };
    role_from_literal(literal?, aria)
}

/// The ARIA roles React Native spells differently in its own vocabulary.
///
/// Only the renames. Every other React Native role name that means
/// something in ARIA *is* the ARIA name -- `checkbox`, `combobox`, `menu`,
/// `tablist` and the rest -- so membership is asked of the ARIA role list
/// rather than restated here, and a name absent from both is one this
/// platform invented.
pub(super) const RN_ROLE_RENAMES: &[(&str, &str)] = &[
    ("header", "heading"),
    ("search", "searchbox"),
    ("image", "img"),
    ("adjustable", "slider"),
];

/// Reads a role literal, in either vocabulary.
///
/// `aria` says whether the attribute was spelled `role` -- in which case
/// the value is ARIA's by definition and no rename applies. React Native's
/// `accessibilityRole` gets the renames and then the same membership test.
pub(super) fn role_from_literal(literal: &str, aria: bool) -> Option<AccessibilityRole> {
    let name = if aria {
        literal
    } else {
        RN_ROLE_RENAMES
            .iter()
            .find(|(rn, _)| *rn == literal)
            .map_or(literal, |(_, aria_name)| *aria_name)
    };
    Some(match name {
        // The two that decide an element rather than an attribute.
        "button" => AccessibilityRole::Button,
        "link" => AccessibilityRole::Link,
        _ if crate::aria::is_role(name) => AccessibilityRole::Aria(name.to_string()),
        // Not a role either vocabulary knows. Left to the backends: React
        // Native may still understand it, and the DOM will not.
        _ => AccessibilityRole::NativeOnly(literal.to_string()),
    })
}
