//! Text-specific lowering for the React Native backend.
//!
//! React Native models inheritance and several CSS text concepts differently
//! from the browser, so wrappers, metric folding, and prop lowering live here.

use super::*;

/// Builds the inserted `<Text>` that carries a non-Text node's string
/// content, with the text-styling declarations moved onto it.
#[allow(clippy::too_many_arguments)]
pub(super) fn wrap_in_text(
    content: &str,
    text_declarations: &[StyleDeclaration],
    base_name: &str,
    source: &str,
    node: &Node,
    // The *enclosing* node's position, not the wrapper's: these
    // declarations were written on that element, so a `first:` among them
    // asks about it. (The wrapper is trivially its parent's only child,
    // which is not the question.)
    position: SiblingPosition,
    style_entries: &mut Vec<(String, Vec<StyleProperty>)>,
    diagnostics: &mut Vec<Diagnostic>,
    runtime: &mut RuntimeNeeds,
    interaction_context: bool,
) -> String {
    // A `Text` that no `Primitive::Text` asked for: the author wrote a bare
    // string inside a View, and React Native crashes on one. Synthesized
    // here rather than by `native_component`, so it has to say so here too.
    // Found by the render tests, with `ReferenceError: Text is not defined`
    // -- which is the failure this whole reporting exists to make
    // impossible, arriving from the one path that bypasses it.
    runtime.need_native("Text");
    let mut style_array_parts = Vec::new();
    // The wrapper is a Text, so a `pressed:` style has nowhere to go on it.
    // The enclosing Pressable reports it -- `build_style_entries` runs over
    // that node's own declarations first, and a text-styling property under
    // `pressed:` lands here only after that.
    let mut pressed_parts = Vec::new();
    build_style_entries(
        text_declarations,
        &format!("{base_name}_text"),
        source,
        node,
        position,
        style_entries,
        &mut style_array_parts,
        &mut pressed_parts,
        diagnostics,
        runtime,
        interaction_context,
    );

    if interaction_context && !pressed_parts.is_empty() {
        style_array_parts.extend(pressed_parts);
        runtime.need_component("HozoText");
        return format!(
            "<HozoText style={{({{ pressed, hovered, focused }}) => [{}]}}>{content}</HozoText>",
            style_array_parts.join(", ")
        );
    }
    let style_prop = if style_array_parts.is_empty() {
        String::new()
    } else if style_array_parts.len() == 1 && !style_array_parts[0].contains("&&") {
        format!(" style={{{}}}", style_array_parts[0])
    } else {
        format!(" style={{[{}]}}", style_array_parts.join(", "))
    };
    format!("<Text{style_prop}>{content}</Text>")
}

/// Properties that style text itself. They matter separately on this
/// platform because React Native's `Text` inherits them from an enclosing
/// `Text` but not from a `View`, so they have to travel with the text
/// rather than stay on its container.
/// Whether a text style handed down from here can actually land on
/// something that renders text.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum TextReach {
    /// There is a `Text`, or a raw string that becomes one.
    Certain,
    /// No `Text` the compiler can see, but something opaque is in the way:
    /// an expression, or a component Hozo doesn't model. It may render
    /// text through code the compiler never reads.
    Opaque,
    /// Nothing that could hold text at all.
    None,
}

pub(super) fn is_text_primitive(primitive: Primitive) -> bool {
    matches!(
        primitive,
        Primitive::Text
            | Primitive::Paragraph
            | Primitive::Heading
            | Primitive::Figcaption
            | Primitive::Time
            | Primitive::Legend
            | Primitive::Term
            | Primitive::Strong
            | Primitive::Emphasis
            | Primitive::Underline
            | Primitive::Strikethrough
            | Primitive::Sub
            | Primitive::Sup
            | Primitive::Code
            | Primitive::Small
            | Primitive::Mark
            | Primitive::NoBreak
            | Primitive::Ruby
            | Primitive::Rt
    )
}

/// Where a text style handed down from `node` could land.
///
/// Stops at a `Text`, because that is where React Native's own inheritance
/// takes over -- anything below it is the platform's problem, not the
/// compiler's.
pub(super) fn text_reach(node: &Node) -> TextReach {
    let mut reach = TextReach::None;
    for child in &node.children {
        match child {
            hozo_ir::Child::Text(_) => return TextReach::Certain,
            hozo_ir::Child::Node(child_node) => {
                if is_text_primitive(child_node.primitive) {
                    return TextReach::Certain;
                }
                match text_reach(child_node) {
                    TextReach::Certain => return TextReach::Certain,
                    TextReach::Opaque => reach = TextReach::Opaque,
                    TextReach::None => {}
                }
            }
            hozo_ir::Child::Verbatim { nested, .. } => {
                if nested.iter().any(|n| {
                    is_text_primitive(n.node.primitive)
                        || text_reach(&n.node) == TextReach::Certain
                }) {
                    return TextReach::Certain;
                }
                // `{name}` renders text and `{rows.map(..)}` may render a
                // Text through a component the compiler never reads. Either
                // way the compiler can't follow it.
                reach = TextReach::Opaque;
            }
        }
    }
    reach
}

pub(super) fn is_text_property(property: &StyleProperty) -> bool {
    matches!(
        property,
        StyleProperty::FontSize(_)
            | StyleProperty::FontWeight(_)
            | StyleProperty::LineHeight(_)
            | StyleProperty::LetterSpacing(_)
            | StyleProperty::TextColor(_)
            | StyleProperty::TextAlign(_)
            | StyleProperty::TextTransform(_)
    )
}

/// Rewrites the font-relative text metrics into absolute ones, against a
/// font size set on the same element.
///
/// CSS lets `line-height` be a bare multiplier and `letter-spacing` be a
/// length in `em`; React Native's `lineHeight` and `letterSpacing` are
/// absolute numbers. The conversion needs the font size, and the useful
/// observation is that the compiler often has it -- `text-lg leading-tight`
/// puts both on the same element, and Tailwind's own output does the same
/// multiplication.
///
/// Only a font size under the *same* condition is used, falling back to an
/// unconditional one. An inherited size is equally usable: Hozo already
/// carries text declarations through View nodes because RN itself does not.
/// Folding `leading-tight` against a `md:text-lg` would bake a size that only
/// applies above 768px into a style that always does.
pub(super) fn fold_font_relative(
    declarations: &[StyleDeclaration],
    inherited: &[StyleDeclaration],
) -> Vec<StyleDeclaration> {
    let font_size = |condition: &Condition| -> Option<f64> {
        let find = |list: &[StyleDeclaration], want: &Condition| {
            list.iter().rev().find_map(|d| match (&d.property, &d.condition) {
                (StyleProperty::FontSize(Length::Px(px)), c) if c == want => Some(*px),
                _ => None,
            })
        };
        find(declarations, condition)
            .or_else(|| find(declarations, &Condition::Always))
            .or_else(|| find(inherited, condition))
            .or_else(|| find(inherited, &Condition::Always))
    };

    declarations
        .iter()
        .map(|declaration| {
            let Some(size) = font_size(&declaration.condition) else {
                return declaration.clone();
            };
            let property = match &declaration.property {
                StyleProperty::LineHeight(hozo_ir::LineHeight::Ratio(ratio)) => {
                    StyleProperty::LineHeight(hozo_ir::LineHeight::Length(Length::Px(
                        size * ratio,
                    )))
                }
                StyleProperty::LetterSpacing(hozo_ir::LetterSpacing::Em(em)) => {
                    StyleProperty::LetterSpacing(hozo_ir::LetterSpacing::Px(Length::Px(
                        size * em.0,
                    )))
                }
                _ => return declaration.clone(),
            };
            StyleDeclaration { property, condition: declaration.condition.clone() }
        })
        .collect()
}

/// Why a font-relative metric couldn't be honoured when `fold_font_relative`
/// found no font size to resolve it against.
///
/// Kept out of `StyleProperty::unsupported_on_native` because the answer
/// depends on the node, which that method can't see -- the same reason
/// `truncation_only_reason` lives here.
pub(super) fn font_relative_reason(property: &StyleProperty) -> Option<String> {
    match property {
        StyleProperty::LetterSpacing(hozo_ir::LetterSpacing::Em(_)) => Some(
            "`tracking-*` in em: React Native's letterSpacing is absolute. Hozo resolves it \
             against a text size on the same element, and this element sets none -- add a \
             `text-*` utility here, or use an absolute tracking value."
                .to_string(),
        ),
        StyleProperty::LineHeight(hozo_ir::LineHeight::Ratio(_)) => Some(
            "`leading-*` as a ratio: React Native's lineHeight is absolute. Hozo resolves it \
             against a text size on the same element, and this element sets none -- add a \
             `text-*` utility here, or use `leading-<number>`."
                .to_string(),
        ),
        _ => None,
    }
}
/// Whether a property sizes something against the viewport (`h-screen`,
/// `min-w-screen`), which React Native can express but not statically.
/// `placeholder-*` as React Native carries it: a prop on `TextInput`,
/// not a style on anything.
///
/// Lives here rather than in `unsupported_on_native` because the answer
/// depends on the node -- on a `TextInput` it lowers, anywhere else there
/// is no placeholder for it to colour.
pub(super) fn placeholder_props(node: &Node, theme: &Theme) -> Option<Vec<(&'static str, String)>> {
    let colour = node.style.iter().find_map(|d| match &d.property {
        StyleProperty::PlaceholderColor(c) => Some(c),
        _ => None,
    })?;
    (node.primitive == Primitive::TextInput)
        .then(|| vec![("placeholderTextColor", style::placeholder_color(colour, theme))])
}

pub(super) fn placeholder_only_reason(property: &StyleProperty) -> Option<String> {
    matches!(property, StyleProperty::PlaceholderColor(_)).then(|| {
        "`placeholder-*`: React Native carries this as `TextInput`'s `placeholderTextColor` prop, so it only means something on a TextInput"
            .to_string()
    })
}

/// `caret-*` as React Native carries it: `cursorColor` on TextInput.
pub(super) fn caret_props(node: &Node, theme: &Theme) -> Option<Vec<(&'static str, String)>> {
    let colour = node.style.iter().find_map(|d| match &d.property {
        StyleProperty::CaretColor(c) => Some(c),
        _ => None,
    })?;
    (node.primitive == Primitive::TextInput)
        .then(|| vec![("cursorColor", style::placeholder_color(colour, theme))])
}

pub(super) fn caret_only_reason() -> String {
    "`caret-*`: React Native carries this as `TextInput`'s `cursorColor` prop, so it only means \
     something on a TextInput"
        .to_string()
}

/// React Native expresses text truncation as props on `Text` --
/// `numberOfLines` and `ellipsizeMode` -- where CSS uses `white-space` and
/// `text-overflow`. The mapping is from the *combination* of declarations
/// to one prop pair, not property-by-property, which is why it lives here
/// rather than in `style::property_and_value`.
///
/// `None` means this node can't absorb them (nothing asked for truncation,
/// or it isn't a `Text`), and the caller refuses them instead.
pub(super) fn truncation_props(node: &Node) -> Option<Vec<(&'static str, String)>> {
    // `numberOfLines` exists on Text alone; on a View there's nothing to
    // put it on, so truncation there really is unsupported.
    if !is_text_primitive(node.primitive) {
        return None;
    }
    let has = |want: &StyleProperty| node.style.iter().any(|d| d.property == *want);
    // `line-clamp-<n>` is the same mechanism with a line count: React
    // Native has one prop for both, so the two utilities meet here.
    if let Some(lines) = node.style.iter().find_map(|d| match &d.property {
        StyleProperty::LineClamp(lines) => Some(lines),
        _ => None,
    }) {
        return match lines {
            // `line-clamp-none` means no clamping, which on this platform
            // is the absence of the prop rather than a value for it.
            None => Some(Vec::new()),
            // A clamp Hozo couldn't read as a count is refused by name in
            // `StyleProperty::native_gap`, so there is nothing to emit for
            // it here.
            Some(n) => Some(n.lines().map_or_else(Vec::new, |lines| {
                vec![("numberOfLines", lines.to_string())]
            })),
        };
    }
    if !has(&StyleProperty::WhiteSpace(WhiteSpace::NoWrap)) {
        return None;
    }

    let mut props = vec![("numberOfLines", "1".to_string())];
    if !has(&StyleProperty::TextOverflow(TextOverflow::Ellipsis)) {
        // RN's default `ellipsizeMode` is `tail`, i.e. an ellipsis. Nothing
        // asked for one here, so clipping is the closer match to plain
        // `white-space: nowrap`.
        props.push(("ellipsizeMode", "clip".to_string()));
    }
    Some(props)
}

pub(super) fn is_truncation_declaration(property: &StyleProperty) -> bool {
    matches!(
        property,
        StyleProperty::WhiteSpace(WhiteSpace::NoWrap) | StyleProperty::TextOverflow(_) | StyleProperty::LineClamp(_)
    )
}

/// Why a truncation-related declaration can't be honoured when it wasn't
/// absorbed into props. Kept out of `StyleProperty::unsupported_on_native`
/// because the answer depends on the node, which that method can't see.
pub(super) fn truncation_only_reason(property: &StyleProperty) -> Option<String> {
    match property {
        StyleProperty::TextOverflow(_) => Some(
            "`text-overflow`: React Native truncates via the `numberOfLines` prop on Text, which \
             needs `white-space: nowrap` (Tailwind's `truncate`) on a Text element."
                .to_string(),
        ),
        StyleProperty::WhiteSpace(WhiteSpace::NoWrap) => Some(
            "`white-space: nowrap`: React Native suppresses wrapping with the `numberOfLines` \
             prop, which only exists on Text."
                .to_string(),
        ),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use crate::lower;
    use hozo_ir::{DiagnosticCode, Theme};

    #[test]
    fn raw_text_in_a_view_is_wrapped_and_takes_its_text_styles_with_it() {
        // Two separate hazards, both invisible on Web: a raw string inside
        // a View crashes React Native, and `fontSize` left on the View
        // would do nothing there because Text doesn't inherit from View.
        let source = r#"
            import { View } from '@hozo/core'
            const el = <View className="p-4 text-xl font-bold">Hello</View>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.jsx.contains("<Text style={hozoStyles.hozo0_text}>Hello</Text>"));
        // Layout stays on the View, text styling moves to the Text.
        assert!(output.styles.contains("paddingTop: 16,"));
        assert!(output.styles.contains("hozo0_text: {"));
        assert!(output.styles.contains("fontSize: 20,"));
        assert!(output.styles.contains("fontWeight: '700',"));
        // Not left behind on the container, where RN would ignore it.
        let container = output.styles.split("hozo0_text").next().unwrap();
        assert!(!container.contains("fontSize"));
    }

    #[test]
    fn a_text_node_is_not_double_wrapped() {
        let source = r#"
            import { Text } from '@hozo/core'
            const el = <Text className="text-xl">Hello</Text>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert_eq!(output.jsx.matches("<Text").count(), 1);
        assert!(output.styles.contains("fontSize: 20,"));
    }

    #[test]
    fn truncation_lowers_to_props_rather_than_styles() {
        // RN has no white-space/text-overflow; it truncates via props.
        // `truncate` asks for an ellipsis, which is `ellipsizeMode`'s
        // default, so only `numberOfLines` is needed.
        let source = r#"
            import { Text } from '@hozo/core'
            const el = <Text className="truncate">x</Text>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(output.diagnostics.is_empty());
        assert!(output.jsx.contains("numberOfLines={1}"));
        assert!(!output.jsx.contains("ellipsizeMode"));
        // The `overflow` half of `truncate` is a real RN style and still
        // lowers as one.
        assert!(output.styles.contains("overflow: 'hidden',"));
    }

    #[test]
    fn nowrap_without_ellipsis_clips_instead() {
        let source = r#"
            import { Text } from '@hozo/core'
            const el = <Text className="whitespace-nowrap">x</Text>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(output.diagnostics.is_empty());
        assert!(output.jsx.contains("numberOfLines={1}"));
        // Nothing asked for an ellipsis, and RN's default would add one.
        assert!(output.jsx.contains(r#"ellipsizeMode="clip""#));
    }

    #[test]
    fn truncation_on_a_non_text_node_is_refused() {
        // `numberOfLines` only exists on Text, so there's nothing to
        // absorb it into here -- and silently dropping it would lose the
        // author's intent.
        let source = r#"
            import { View } from '@hozo/core'
            const el = <View className="truncate" />
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(!output.diagnostics.is_empty());
        assert_eq!(output.diagnostics[0].severity, hozo_ir::Severity::Error);
    }

    #[test]
    fn whitespace_normal_stays_a_genuine_no_op() {
        // RN's Text already wraps, so this asks for what happens anyway.
        let source = r#"
            import { Text } from '@hozo/core'
            const el = <Text className="whitespace-normal">x</Text>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(output.diagnostics.is_empty());
        assert!(!output.jsx.contains("numberOfLines"));
    }

    #[test]
    fn text_styles_reach_a_text_the_author_wrote() {
        // The long-standing divergence this fixes: CSS inherits `text-xl`
        // to the span, React Native inherits nothing from a View, so the
        // same source rendered 20px on Web and the default size on device
        // with nothing said about it.
        let source = r#"
            import { View, Text } from '@hozo/core'
            const el = <View className="text-xl text-red-500"><Text>Hi</Text></View>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(output.styles.contains("fontSize: 20,"), "{}", output.styles);
        assert!(output.styles.contains("color: '#fb2c36',"), "{}", output.styles);
        // And they leave the View, which has no `fontSize` to put them in.
        assert!(!output.jsx.contains("<View style="), "{}", output.jsx);
    }

    #[test]
    fn an_inherited_text_style_loses_to_the_child_that_sets_its_own() {
        // Only the property the child sets: `text-sm` replaces the size and
        // leaves the colour and weight alone, which is what CSS would do.
        // `dedupe_last_wins` gets this right only because the inherited
        // declarations are placed *before* the child's own.
        let source = r#"
            import { View, Text } from '@hozo/core'
            const el = (
              <View className="text-xl text-red-500 font-bold">
                <Text className="text-sm">x</Text>
              </View>
            )
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(output.styles.contains("fontSize: 14,"), "{}", output.styles);
        assert!(!output.styles.contains("fontSize: 20,"), "{}", output.styles);
        assert!(output.styles.contains("color: '#fb2c36',"), "{}", output.styles);
        assert!(output.styles.contains("fontWeight: '700',"), "{}", output.styles);
    }

    #[test]
    fn inheritance_passes_through_an_intermediate_view_and_stops_at_a_text() {
        let source = r#"
            import { View, Text } from '@hozo/core'
            const el = (
              <View className="text-xl">
                <View className="p-2"><Text>Deep</Text></View>
              </View>
            )
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(output.styles.contains("fontSize: 20,"), "{}", output.styles);

        // A Text inside a Text needs nothing from the compiler: React
        // Native inherits there, so pushing a copy down would be noise.
        let nested = r#"
            import { Text } from '@hozo/core'
            const el = <Text className="text-xl"><Text>nested</Text></Text>
            "#;
        let parsed = hozo_parser::parse_tsx(nested);
        let output = lower(&parsed.roots[0].node, nested, &Theme::default());
        assert_eq!(output.styles.matches("fontSize: 20,").count(), 1, "{}", output.styles);
    }

    #[test]
    fn text_styles_with_nowhere_to_land_are_reported_rather_than_dropped() {
        // Handing them down is only half the job. A text size that reaches
        // no text is a style that renders on Web and does nothing on
        // device, which is the divergence worth a build message -- and
        // exactly what silently happened when the push-down was added.
        for (source, expected) in [
            (
                r#"
                import { View } from '@hozo/core'
                const el = <View className="text-xl p-4" />
                "#,
                "contains no text",
            ),
            (
                r#"
                import { View } from '@hozo/core'
                const el = <View className="text-xl">{rows}</View>
                "#,
                "doesn't read",
            ),
        ] {
            let parsed = hozo_parser::parse_tsx(source);
            let output = lower(&parsed.roots[0].node, source, &Theme::default());
            let warning = output
                .diagnostics
                .iter()
                .find(|d| d.code == DiagnosticCode::NotWiredOnNative)
                .unwrap_or_else(|| panic!("expected a diagnostic for: {source}"));
            assert!(warning.message.contains(expected), "{}", warning.message);
        }
    }

    #[test]
    fn font_relative_metrics_resolve_against_a_text_size_on_the_same_element() {
        // Refused as "the font size isn't known at compile time" until the
        // refusal audit questioned it. Often it *is* known -- `text-lg`
        // right there on the element -- and Tailwind's own output does the
        // same multiplication.
        let source = r#"
            import { Text } from '@hozo/core'
            const el = <Text className="text-lg leading-tight tracking-wide">x</Text>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        // text-lg is 18px; leading-tight is 1.25; tracking-wide is 0.025em.
        assert!(output.styles.contains("lineHeight: 22.5,"), "{}", output.styles);
        assert!(output.styles.contains("letterSpacing: 0.45,"), "{}", output.styles);
    }

    #[test]
    fn font_relative_metrics_resolve_against_an_inherited_text_size() {
        let source = r#"
            import { View, Text } from '@hozo/core'
            const el = (
              <View className="text-lg">
                <Text className="leading-tight tracking-wide">x</Text>
              </View>
            )
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(output.styles.contains("lineHeight: 22.5,"), "{}", output.styles);
        assert!(output.styles.contains("letterSpacing: 0.45,"), "{}", output.styles);
    }

    #[test]
    fn conditional_inherited_font_sizes_only_resolve_the_same_condition() {
        let source = r#"
            import { View, Text } from '@hozo/core'
            const el = (
              <View className="md:text-lg">
                <Text className="md:leading-tight leading-loose">x</Text>
              </View>
            )
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.styles.contains("lineHeight: 22.5,"), "{}", output.styles);
        assert!(
            output.diagnostics.iter().any(|diagnostic| diagnostic.code
                == DiagnosticCode::NotWiredOnNative),
            "{:?}",
            output.diagnostics
        );
    }

    #[test]
    fn a_font_relative_metric_with_no_text_size_is_named_as_unwired_not_web_only() {
        // The distinction is the whole point of the two codes: the platform
        // can hold this value, so calling it Web-only would be false, and
        // the fix is one utility away.
        let source = r#"
            import { Text } from '@hozo/core'
            const el = <Text className="leading-tight">x</Text>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert_eq!(output.diagnostics.len(), 1, "{:?}", output.diagnostics);
        assert_eq!(output.diagnostics[0].code, DiagnosticCode::NotWiredOnNative);
        assert!(output.diagnostics[0].message.contains("text-*"), "{}", output.diagnostics[0].message);
        assert!(!output.styles.contains("lineHeight"), "{}", output.styles);
    }

    #[test]
    fn a_conditional_text_size_does_not_resolve_an_unconditional_ratio() {
        // Folding `leading-tight` against `md:text-lg` would bake a size
        // that only applies above 768px into a style that always applies.
        let source = r#"
            import { Text } from '@hozo/core'
            const el = <Text className="md:text-lg leading-tight">x</Text>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(
            output.diagnostics.iter().any(|d| d.code == DiagnosticCode::NotWiredOnNative
                && d.message.contains("text-*")),
            "{:?}",
            output.diagnostics
        );
        // `md:text-lg` still brings its own line height into the md entry;
        // what must not appear is the ratio folded against it.
        assert!(!output.styles.contains("lineHeight: 22.5"), "{}", output.styles);
    }

    #[test]
    fn relative_typography_lowers_font_size_from_parent_text() {
        let source = r#"
            import { Text } from '@hozo/core'
            import { Sub, Sup, Small } from '@hozo/typography'
            const el = (
              <Text className="text-base">
                H<Sub>2</Sub>O
                x<Sup>2</Sup>
                <Small>fine print</Small>
              </Text>
            )
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        // text-base is 16px:
        // Sub/Sup = 16 * 0.75 = 12px
        // Small = 16 * 0.85 = 13.6 -> round = 14px
        assert!(output.styles.contains("fontSize: 12,"), "{}", output.styles);
        assert!(output.styles.contains("fontSize: 14,"), "{}", output.styles);
    }

    #[test]
    fn relative_typography_does_not_guess_font_size_when_parent_is_unresolved() {
        let source = r#"
            import { Text } from '@hozo/core'
            import { Sub } from '@hozo/typography'
            const el = (
              <Text>
                H<Sub>2</Sub>O
              </Text>
            )
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        // Without static parent font size, compiler does not invent arbitrary approximations
        assert!(!output.styles.contains("fontSize:"), "{}", output.styles);
    }
}
