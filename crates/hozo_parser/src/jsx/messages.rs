//! Diagnostic messages for refused variants and attributes.

use hozo_ir::{Primitive, StyleProperty};

use crate::tailwind;

/// What this primitive becomes on Web, for a message that has to say why
/// a selector cannot reach it.
pub(super) fn web_tag_hint(primitive: Primitive) -> &'static str {
    match primitive {
        Primitive::Text => "span",
        Primitive::Button => "button",
        Primitive::Link => "a",
        Primitive::Image => "img",
        Primitive::TextInput => "input",
        Primitive::Separator => "hr",
        Primitive::Progress => "progress",
        Primitive::Meter => "meter",
        Primitive::Details => "details",
        Primitive::Summary => "summary",
        _ => "div",
    }
}

/// The wording, which both `className` paths share.
///
/// `tailwind::unsupported_variant_name` decides *whether* to say anything;
/// this is what gets said. Kept together because the two paths reached the
/// same conclusion in different words until the dynamic one learned to
/// report at all.
pub(super) fn unsupported_variant_message(
    variant: &str,
    token: &str,
    loses_to: Option<Conflict>,
) -> String {
    let head = format!(
        "`{variant}:` is a Tailwind variant Hozo does not compile yet, so `{token}` produces \
         no style."
    );
    let Some(Conflict {
        token: compiled,
        property,
    }) = loses_to
    else {
        return format!(
            "{head} The class is still on the element, so it will work if the project runs \
             its own Tailwind build over it."
        );
    };
    let writes = match property {
        Some(property) => format!("both set `{property}`"),
        None => "both set the same property".to_string(),
    };
    format!(
        "{head} The class is still on the element for the project's own Tailwind build, but \
         on Web it loses to `{compiled}`, which Hozo compiles here: {writes}, and Hozo's rule \
         is unlayered while Tailwind's sits in `@layer utilities`, so wherever both apply \
         `{token}` never wins. The same condition written as an arbitrary variant \
         (`[&…]:`) is compiled, and then both rules are Hozo's."
    )
}

/// The compiled token a carried one loses to on Web, and the property they
/// share, when Hozo can name it.
pub(super) struct Conflict<'a> {
    token: &'a str,
    property: Option<&'static str>,
}

/// The first of `compiled` that writes what `carried` would (#1752).
///
/// Every compiled rule beats a carried one wherever both match, whatever
/// variant the compiled one has, so the first is as good an answer as any;
/// naming one is what turns "it lost" into something the author can find.
pub(super) fn loses_to<'a>(
    carried: &str,
    compiled: impl IntoIterator<Item = (&'a str, &'a [StyleProperty])>,
) -> Option<Conflict<'a>> {
    let writes = tailwind::carried_writes(carried);
    if writes.is_empty() {
        return None;
    }
    compiled.into_iter().find_map(|(token, properties)| {
        let shared = properties
            .iter()
            .find(|property| writes.iter().any(|w| w.same_property_as(property)))?;
        Some(Conflict {
            token,
            property: shared.css_property_name(),
        })
    })
}

/// What to say about a `data-[hozo-…]:` in a class attribute.
///
/// Named per attribute rather than generically, because the honest answer
/// differs. `hozo-disabled` has an exact replacement and the message
/// should hand it over. `hozo-cond-…` has none and needs none -- its name
/// is a pair of source byte offsets, so a blank line added above the
/// element renames it, and code selecting on one is already broken in a
/// way nothing has noticed yet.
pub(super) fn private_attribute_message(attribute: &str) -> String {
    let replacement = match attribute {
        "hozo-disabled" => Some("`disabled:`, which compiles to exactly this selector"),
        "hozo-pointer-events" => Some("the `pointerEvents` prop you already wrote"),
        "hozo-horizontal" => Some("the `horizontal` prop you already wrote"),
        _ => None,
    };
    match replacement {
        Some(instead) => format!(
            "`data-{attribute}` is Hozo's own state rather than an interface, and a release is \
             free to stop emitting it. Use {instead}."
        ),
        None => format!(
            "`data-{attribute}` is Hozo's own state rather than an interface, and this one is \
             not even stable between builds -- the names in that family are made from source \
             byte offsets, so adding a line above the element changes them. There is nothing to \
             select on here."
        ),
    }
}
