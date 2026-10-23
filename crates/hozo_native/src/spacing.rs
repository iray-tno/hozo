//! Paired inline edges are direction-neutral; individual logical edges are not.
use hozo_ir::{StyleDeclaration, StyleProperty, StyleSource};
use std::borrow::Cow;

pub(crate) fn physical_pair(property: &StyleProperty) -> Option<StyleProperty> {
    Some(match property {
        StyleProperty::PaddingInlineStart(v) => StyleProperty::PaddingLeft(v.clone()),
        StyleProperty::PaddingInlineEnd(v) => StyleProperty::PaddingRight(v.clone()),
        StyleProperty::MarginInlineStart(v) => StyleProperty::MarginLeft(v.clone()),
        StyleProperty::MarginInlineEnd(v) => StyleProperty::MarginRight(v.clone()),
        _ => return None,
    })
}

pub(crate) fn declarations(styles: &[StyleDeclaration]) -> Cow<'_, [StyleDeclaration]> {
    let paired = |d: &StyleDeclaration| matches!(&d.source, StyleSource::Tailwind { utility: Some(key), .. } if key.physical_axis);
    // An individual logical edge needs direction-aware cascade resolution.
    // Keep the pre-existing representation for that unassessed mixture.
    if hozo_parser::utility_order::has_logical_barrier(styles) {
        return Cow::Borrowed(styles);
    }
    if !styles.iter().any(paired) {
        return Cow::Borrowed(styles);
    }
    // A lone axis already renders correctly. Normalize only when physical
    // horizontal sides participate, avoiding output churn for ordinary px/mx.
    if !styles.iter().any(|d| {
        matches!(
            d.property,
            StyleProperty::PaddingLeft(_)
                | StyleProperty::PaddingRight(_)
                | StyleProperty::MarginLeft(_)
                | StyleProperty::MarginRight(_)
        )
    }) {
        return Cow::Borrowed(styles);
    }
    Cow::Owned(
        styles
            .iter()
            .map(|d| {
                let mut out = d.clone();
                if paired(d) {
                    if let Some(property) = physical_pair(&d.property) {
                        out.property = property;
                    }
                }
                out
            })
            .collect(),
    )
}
