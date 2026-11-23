//! Which Hozo primitive a JSX element's name refers to, if any.

use hozo_ir::{Primitive, SvgElement};
use oxc_ast::ast::{JSXElement, JSXElementName};

use super::scope::Scope;

/// The element's local name and the primitive it resolves to. `None` for
/// names Hozo does not model: unknown components, intrinsic tags, and
/// member expressions other than the ones read below.
pub(super) fn element_primitive<'a>(
    el: &'a JSXElement,
    scope: &Scope,
) -> Option<(&'a str, Primitive)> {
    let resolved = match &el.opening_element.name {
        JSXElementName::IdentifierReference(ident) => (
            ident.name.as_str(),
            scope.primitive_for_local(ident.name.as_str())?,
        ),
        // `<Svg.Rect>` and `<TermList.Term>`. Member expressions Hozo reads.
        JSXElementName::MemberExpression(member) => {
            let object = member.object.get_identifier()?;
            if object.name.as_str() == "Svg" {
                let element = SvgElement::from_name(member.property.name.as_str())?;
                (object.name.as_str(), Primitive::Svg(element))
            } else if object.name.as_str() == "Ruby" {
                // `<Ruby.RubyText>` as well as `<RubyText>`, the way
                // `TermList` reads both spellings. The member keeps the
                // full name rather than shortening to `Text`: the flat
                // export has to be readable on its own, and a `<Text>`
                // that meant the annotation would not be.
                let prim = match member.property.name.as_str() {
                    "RubyText" => Primitive::RubyText,
                    _ => return None,
                };
                (object.name.as_str(), prim)
            } else if object.name.as_str() == "TermList" {
                let prim = match member.property.name.as_str() {
                    "Term" => Primitive::Term,
                    "Description" => Primitive::Description,
                    _ => return None,
                };
                (object.name.as_str(), prim)
            } else if scope.animated_namespaces.contains(object.name.as_str())
                && member.property.name.as_str() == "View"
            {
                (object.name.as_str(), Primitive::AnimatedView)
            } else {
                return None;
            }
        }
        _ => return None,
    };
    Some(resolved)
}
