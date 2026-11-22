//! Rendering a rule in one shape, with its at-rules and selector.

use hozo_ir::{Axis, BorderStyle, LineHeight, StyleProperty, Theme};

use super::box_shadow::{box_shadow_value, is_text_shadow, text_shadow_value};
use super::filter::{filter_value, is_filter};
use super::format::{divider_default_styles, indent_block};
use super::gradient::{gradient_value, is_gradient};
use super::mask::{is_mask_gradient, mask_declarations};
use super::property::property_and_value;
use super::scroll::{is_scroll_snap, is_scrollbar_color, scroll_snap_value, scrollbar_color_value};
use super::shadow::is_shadow_layer;
use super::shape::{fill_selector, Shape};
use super::spacing::{border_spacing_value, is_border_spacing, space_declarations};
use super::transform::{
    is_scale_axis, is_transform_function, is_translate, scale_value, transform_value,
    translate_value,
};
use super::values::line_clamp_declarations;

pub(super) fn render_shape(
    class_name: &str,
    (at_rule, selector): Shape,
    props: &[StyleProperty],
    theme: &Theme,
    needs_content: bool,
) -> String {
    let target = fill_selector(&selector, class_name);

    // A width's implied `solid` goes in its own rule at zero specificity, so
    // any written style that applies beats it, whatever the order or
    // condition -- as Tailwind's widths read `--tw-border-style`. A
    // pseudo-element cannot sit inside `:where()`; there it stays inline.
    let (default_styles, props): (Vec<StyleProperty>, Vec<StyleProperty>) =
        props.iter().cloned().partition(|p| {
            !target.contains("::")
                && matches!(
                    p,
                    StyleProperty::BorderTopStyle(BorderStyle::Default)
                        | StyleProperty::BorderRightStyle(BorderStyle::Default)
                        | StyleProperty::BorderBottomStyle(BorderStyle::Default)
                        | StyleProperty::BorderLeftStyle(BorderStyle::Default)
                        | StyleProperty::BorderLogicalStyle(_, BorderStyle::Default)
                        | StyleProperty::OutlineStyle(BorderStyle::Default)
                )
        });
    let props = props.as_slice();

    // Some utilities target something other than the element itself, so
    // they become their own rule with a different selector rather than a
    // declaration here. `space-*`/`divide-*` reach the children;
    // `placeholder-*` reaches the `::placeholder` pseudo-element.
    let (scoped_props, own_props): (Vec<_>, Vec<_>) = props.iter().partition(|p| {
        matches!(
            p,
            StyleProperty::SpaceX(_)
                | StyleProperty::SpaceY(_)
                | StyleProperty::SpaceReverse(_)
                | StyleProperty::DivideX(_)
                | StyleProperty::DivideY(_)
                | StyleProperty::DivideReverse(_)
                | StyleProperty::DivideColor(_)
                | StyleProperty::DivideStyle(_)
                | StyleProperty::PlaceholderColor(_)
        )
    });
    let (placeholder_props, child_props): (Vec<_>, Vec<_>) = scoped_props
        .iter()
        .partition(|p| matches!(p, StyleProperty::PlaceholderColor(_)));

    // Rings and shadows are several utilities that share one CSS property,
    // so they're composed rather than emitted one declaration each.
    let (shadow_props, rest): (Vec<&StyleProperty>, Vec<&StyleProperty>) =
        own_props.into_iter().partition(|p| is_shadow_layer(p));
    let (mask_props, rest): (Vec<&StyleProperty>, Vec<&StyleProperty>) =
        rest.into_iter().partition(|p| is_mask_gradient(p));
    let (gradient_props, rest): (Vec<&StyleProperty>, Vec<&StyleProperty>) =
        rest.into_iter().partition(|p| is_gradient(p));
    let (scrollbar_props, rest): (Vec<&StyleProperty>, Vec<&StyleProperty>) =
        rest.into_iter().partition(|p| is_scrollbar_color(p));
    let (translate_props, rest): (Vec<&StyleProperty>, Vec<&StyleProperty>) = rest
        .into_iter()
        .partition(|p| is_translate(p) || matches!(p, StyleProperty::TranslateNone));
    let (keyword_pair_props, rest): (Vec<&StyleProperty>, Vec<&StyleProperty>) = rest
        .into_iter()
        .partition(|p| matches!(p, StyleProperty::KeywordPair(..)));
    let (user_select_props, rest): (Vec<&StyleProperty>, Vec<&StyleProperty>) = rest
        .into_iter()
        .partition(|p| matches!(p, StyleProperty::UserSelect(_)));
    let (filter_props, rest): (Vec<&StyleProperty>, Vec<&StyleProperty>) =
        rest.into_iter().partition(|p| is_filter(p));
    let (scale_props, rest): (Vec<&StyleProperty>, Vec<&StyleProperty>) = rest
        .into_iter()
        .partition(|p| is_scale_axis(p) || matches!(p, StyleProperty::ScaleNone));
    let (transform_props, rest): (Vec<&StyleProperty>, Vec<&StyleProperty>) =
        rest.into_iter().partition(|p| {
            is_transform_function(p)
                || matches!(
                    p,
                    StyleProperty::TransformNone
                        | StyleProperty::TransformEmpty
                        | StyleProperty::TransformGpu
                )
        });
    let (spacing_props, rest): (Vec<&StyleProperty>, Vec<&StyleProperty>) =
        rest.into_iter().partition(|p| is_border_spacing(p));
    let (text_shadow_props, rest): (Vec<&StyleProperty>, Vec<&StyleProperty>) =
        rest.into_iter().partition(|p| is_text_shadow(p));
    let (snap_props, own_props): (Vec<&StyleProperty>, Vec<&StyleProperty>) =
        rest.into_iter().partition(|p| is_scroll_snap(p));

    let mut rules: Vec<String> = Vec::new();
    // `needs_content` on its own is a rule: the hoisted `::before` that
    // exists only to make the box, whose whole body is one declaration.
    if needs_content
        || !own_props.is_empty()
        || !shadow_props.is_empty()
        || !mask_props.is_empty()
        || !gradient_props.is_empty()
        || !scrollbar_props.is_empty()
        || !translate_props.is_empty()
        || !keyword_pair_props.is_empty()
        || !user_select_props.is_empty()
        || !filter_props.is_empty()
        || !scale_props.is_empty()
        || !transform_props.is_empty()
        || !spacing_props.is_empty()
        || !text_shadow_props.is_empty()
        || !snap_props.is_empty()
    {
        let mut body = String::new();
        // First, as Tailwind writes it -- and the order matters: a
        // `content-none` beside it sets `content` again, and the last
        // declaration is the one that wins.
        if needs_content {
            body.push_str("  content: var(--hozo-content);\n");
        }
        for prop in own_props {
            // A line clamp's four declarations go where the clamp is, so a
            // `display` or `overflow` written after it in the plan's order
            // still wins, as in Tailwind (`line-clamp-2 flex` is `flex`).
            if let StyleProperty::LineClamp(lines) = prop {
                for (name, value) in line_clamp_declarations(lines.as_ref()) {
                    body.push_str(&format!(
                        "  {name}: {value};
"
                    ));
                }
                continue;
            }
            if let StyleProperty::FirstThatWorks(candidates) = prop {
                // StyleX's first argument has the highest preference. CSS
                // chooses the last declaration it understands, so the
                // official transform writes the candidates in reverse.
                for candidate in candidates.iter().rev() {
                    let (name, value) = property_and_value(candidate, theme);
                    body.push_str(&format!("  {name}: {value};\n"));
                }
                continue;
            }
            if let StyleProperty::Content(value) = prop {
                body.push_str(&format!("  --hozo-content: {value};\n"));
                let resolved = if value == "none" {
                    "none"
                } else {
                    "var(--hozo-content)"
                };
                body.push_str(&format!("  content: {resolved};\n"));
                continue;
            }
            let (name, value) = property_and_value(prop, theme);
            if matches!(
                prop,
                StyleProperty::LineHeight(LineHeight::Length(_) | LineHeight::Ratio(_))
            ) {
                // Same register as Tailwind so an authored leading also
                // survives font-size rules in other breakpoint groups and
                // classes supplied by the caller's candidate sheet.
                body.push_str(&format!("  --tw-leading: {value};\n"));
            }
            // A theme animation the theme does not define has no declaration
            // to write; its class is carried instead.
            if name.is_empty() {
                continue;
            }
            body.push_str(&format!("  {name}: {value};\n"));
        }
        if let Some(value) = box_shadow_value(&shadow_props, theme) {
            body.push_str(&format!("  box-shadow: {value};\n"));
        }
        if let Some(value) = gradient_value(&gradient_props, theme) {
            body.push_str(&format!(
                "  background-image: {value};
"
            ));
        }
        for (name, value) in mask_declarations(&mask_props, theme) {
            body.push_str(&format!("  {name}: {value};\n"));
        }
        if let Some(value) = scrollbar_color_value(&scrollbar_props, theme) {
            body.push_str(&format!("  scrollbar-color: {value};\n"));
        }
        if let Some(value) = translate_value(&translate_props, theme) {
            body.push_str(&format!("  translate: {value};\n"));
        }
        if let Some(value) = text_shadow_value(&text_shadow_props, theme) {
            body.push_str(&format!("  text-shadow: {value};\n"));
        }
        if let Some(value) = scroll_snap_value(&snap_props) {
            body.push_str(&format!(
                "  scroll-snap-type: {value};
"
            ));
        }
        if let Some(value) = filter_value(&filter_props, false, theme) {
            body.push_str(&format!(
                "  filter: {value};
"
            ));
        }
        if let Some(value) = filter_value(&filter_props, true, theme) {
            // The unprefixed property is not enough: Safari still ships
            // backdrop-filter only behind the -webkit- prefix, and Tailwind
            // emits both.
            body.push_str(&format!(
                "  -webkit-backdrop-filter: {value};
"
            ));
            body.push_str(&format!(
                "  backdrop-filter: {value};
"
            ));
        }
        for prop in &keyword_pair_props {
            if let StyleProperty::KeywordPair(p1, v1, p2, v2) = prop {
                body.push_str(&format!(
                    "  {p1}: {v1};
"
                ));
                body.push_str(&format!(
                    "  {p2}: {v2};
"
                ));
            }
        }
        // Safari still needs the prefix for user-select, and Tailwind emits
        // both, so this is one utility writing two declarations rather than
        // a value formatting choice.
        for prop in &user_select_props {
            if let StyleProperty::UserSelect(value) = prop {
                body.push_str(&format!(
                    "  -webkit-user-select: {value};
"
                ));
                body.push_str(&format!(
                    "  user-select: {value};
"
                ));
            }
        }
        if let Some(value) = scale_value(&scale_props) {
            body.push_str(&format!("  scale: {value};\n"));
        }
        if let Some(value) = transform_value(&transform_props, theme) {
            body.push_str(&format!("  transform: {value};\n"));
        }
        if let Some(value) = border_spacing_value(&spacing_props, theme) {
            body.push_str(&format!("  border-spacing: {value};\n"));
        }
        rules.push(format!("{target} {{\n{body}}}"));
    }
    if !default_styles.is_empty() {
        let mut body = String::new();
        for prop in &default_styles {
            let (name, value) = property_and_value(prop, theme);
            body.push_str(&format!("  {name}: {value};\n"));
        }
        rules.push(format!(":where({target}) {{\n{body}}}"));
    }
    if !child_props.is_empty() {
        let mut body = String::new();
        // Which axes the sibling `-reverse` utilities flipped, read before
        // the widths are written because it decides which edge each one
        // goes on.
        let flipped = |axis: Axis| {
            child_props.iter().any(|p: &&&StyleProperty| {
                matches!(
                    ***p,
                    StyleProperty::SpaceReverse(a) | StyleProperty::DivideReverse(a) if a == axis
                )
            })
        };
        let reversed = [flipped(Axis::X), flipped(Axis::Y)];
        for prop in &child_props {
            for (name, value) in space_declarations(prop, theme, reversed) {
                body.push_str(&format!("  {name}: {value};\n"));
            }
        }
        // `:where()` keeps the specificity at zero, matching Tailwind, so
        // a child's own utilities still win over the parent's spacing.
        rules.push(format!(":where({target} > :not(:last-child)) {{\n{body}}}"));
        let defaults = divider_default_styles(&child_props);
        if !defaults.is_empty() {
            rules.push(format!(
                "@layer base {{\n  :where({target} > :not(:last-child)) {{\n{defaults}  }}\n}}"
            ));
        }
    }
    if !placeholder_props.is_empty() {
        let mut body = String::new();
        for prop in placeholder_props {
            let (name, value) = property_and_value(prop, theme);
            body.push_str(&format!("  {name}: {value};\n"));
        }
        rules.push(format!("{target}::placeholder {{\n{body}}}"));
    }

    // Nested innermost-last, so the first variant written is the outermost
    // wrapper -- `md:hover:` is a width query around a hover query, which
    // is how Tailwind writes it too.
    //
    // Each level indents what it wraps. Whitespace means nothing to a
    // browser, but this text is what a person reads -- in the REPL, in a
    // generated `.hozo.css` -- and a query around an unindented rule reads
    // as two rules one after the other.
    at_rule
        .into_iter()
        .rev()
        .fold(rules.join("\n\n"), |rule, prelude| {
            format!("{prelude} {{\n{}\n}}", indent_block(&rule))
        })
}
