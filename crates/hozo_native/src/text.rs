//! Text-specific lowering for the React Native backend.
//!
//! React Native models inheritance and several CSS text concepts differently
//! from the browser, so wrappers, metric folding, and prop lowering live here.

use super::*;

/// React Native's own default, from `RCTFont.mm`:
/// `const CGFloat defaultFontSize = 14`.
///
/// What a relative size scales against when nothing named one, which is
/// most text. Mirrored by `HOZO_DEFAULT_FONT_SIZE` in `@hozo/runtime`,
/// where the runtime half falls back to the same number.
///
/// Two shapes it gets wrong, both of which were wrong before it existed
/// too -- the old behaviour was to emit nothing, so the text simply did
/// not shrink:
///
/// 1. A component the compiler cannot read that renders a `Text` around
///    its children and sets a size on it. React Native inherits only
///    `Text` to `Text`, so that is the one shape a foreign component can
///    affect -- a design system's `<Body>` with a Hozo `<Small>` inside.
///    Nothing fixes it: handing the ratio to `HozoRelativeText` reads the
///    same default, because that component publishes into no context, and
///    React Native offers no way to ask what size is being inherited.
///    Using a Hozo `Text` in between is what makes it work.
///
/// 2. A project that changes the default globally -- `Text.defaultProps`,
///    or an Android theme. Everything then scales from a number that is
///    no longer the default.
///
/// If either turns out to bite, the answer is a diagnostic rather than a
/// cleverer guess: say that the base is not visible here and that 14 was
/// assumed. It is not written yet because it would fire on ordinary
/// migration code, and a warning nobody can act on is noise. Someone
/// hitting it is the evidence that would settle that.
pub(super) const DEFAULT_FONT_SIZE: f64 = 14.0;
/// How much smaller than the text around it each of these draws, in a
/// project that ships Tailwind's preflight.
///
/// Mirrored by `packages/typography/src/text-size.ts`, which the fallback
/// components use, and checked against it by `ratios.test.ts`. Two copies
/// of a number is how a compiled build and an uncompiled one come to
/// render the same source at different sizes.
///
/// These were described as the user agent's, and are not: preflight sets
/// `sub`/`sup` to 75% and `small` to 80%, while the bare user agent sets
/// all three to `smaller`. Measured in headless Chrome at bases 16, 20 and
/// 32, with and without this repository's own generated preflight:
///
/// ```text
///             bare UA    preflight
///   small     0.8333     0.80
///   sub, sup  0.8333     0.75
///   rt        0.50       0.50
///   code      1.0        1.0
/// ```
///
/// So `small` was 0.85 in both copies and 0.85 is neither number: small
/// print came out a size the browser never draws it at, whichever project
/// it was compiled for. `sub` and `sup` were right, for reset projects
/// only (#315).
///
/// `rt` and `code` are the same on both sides and stay single constants.
/// The 13px a bare `<code>` measures at is Chrome's fixed-font default
/// applying to a `medium` size, not a ratio -- give any ancestor a size in
/// pixels, which every Hozo utility does, and it inherits it whole.
pub(super) const SUB_RATIO: f64 = 0.75;
pub(super) const SUP_RATIO: f64 = 0.75;
pub(super) const SMALL_RATIO: f64 = 0.8;
/// `font-size: smaller`, which is what the user agent gives all three of
/// `small`, `sub` and `sup` when nothing has reset it.
///
/// The CSS scaling factor, not a rounded measurement: Chrome divides by
/// 1.2, and measured the same at every base tried.
pub(super) const SMALLER_RATIO: f64 = 1.0 / 1.2;
pub(super) const RUBY_TEXT_RATIO: f64 = 0.5;
pub(super) const HEADING_RATIOS: [f64; 6] = [2.0, 1.5, 1.17, 1.0, 0.83, 0.67];

/// What this element scales the surrounding text size by, if it does.
///
/// `None` for everything that is not relative, and for a heading whose
/// level is a runtime expression -- that is one of six ratios and the
/// compiler cannot tell which.
///
/// The theme, because three of these are one number under a reset and a
/// different one without it, and because a reset heading is not relative
/// at all: preflight gives `h1`-`h6` `font-size: inherit`, which is the
/// absence of a ratio rather than a ratio of one. Answering it here rather
/// than at each caller is what makes the runtime path agree with the
/// compiled one -- an opaque parent hands this ratio to
/// `HozoRelativeText`, and a heading scaling by 2 there while the compiled
/// one scales by nothing is the same source at two sizes (#315).
pub(super) fn size_ratio(node: &Node, theme: &Theme) -> Option<f64> {
    let reset = theme.preflight();
    match node.primitive {
        Primitive::Sub => Some(if reset { SUB_RATIO } else { SMALLER_RATIO }),
        Primitive::Sup => Some(if reset { SUP_RATIO } else { SMALLER_RATIO }),
        Primitive::Small => Some(if reset { SMALL_RATIO } else { SMALLER_RATIO }),
        Primitive::RubyText => Some(RUBY_TEXT_RATIO),
        Primitive::Heading if reset => None,
        Primitive::Heading => {
            let level = match &node.props.heading_level {
                Some(hozo_ir::HeadingLevel::Static(level)) => *level,
                Some(hozo_ir::HeadingLevel::Dynamic(_)) => return None,
                // What both `Heading` components default to.
                None => 1,
            };
            Some(HEADING_RATIOS[(level.clamp(1, 6) - 1) as usize])
        }
        _ => None,
    }
}

/// Whether this element carries a style the compiler cannot read.
///
/// A `style={{...}}` prop or a `{...spread}`. Either can name a font
/// size, and neither is a declaration Hozo resolved -- so a ratio
/// resolved against what the compiler *can* see would be scaling from a
/// number that is not the one on screen.
pub(super) fn size_is_opaque(node: &Node) -> bool {
    node.props
        .passthrough
        .iter()
        .any(|prop| prop.is_spread || prop.name.as_deref() == Some("style"))
}

/// Whether anything below this element scales against its size.
///
/// Asked of an opaque element, to decide whether it has to publish the
/// size it resolves at runtime. Most do not, and a component boundary
/// nobody reads is one nobody should pay for.
pub(super) fn has_relative_descendant(node: &Node, theme: &Theme) -> bool {
    node.children.iter().any(|child| match child {
        hozo_ir::Child::Node(child) => {
            size_ratio(child, theme).is_some() || has_relative_descendant(child, theme)
        }
        _ => false,
    })
}
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
            | Primitive::RubyText
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

    /// A project that ships a CSS reset, which is what `preflight: 'auto'`
    /// resolves to for anything using Tailwind -- so it is the theme most
    /// of these cases are about. Under it `small` is 80% and `sub`/`sup`
    /// are 75%; the bare user agent makes all three `smaller`, and
    /// `Theme::default()` is that one (#315).
    fn reset() -> Theme {
        Theme::new(std::collections::HashMap::new(), None, true)
    }

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
    fn a_relative_size_scales_against_the_nearest_one_not_the_furthest() {
        // `find` used to read the inherited declarations before the
        // parent's own size, and the inherited ones come from further up.
        // So a `Small` inside an `<Heading level={1}>` scaled against the
        // page's 16 rather than the heading's 32 and came out smaller than
        // the body text it is supposed to be smaller than.
        let source = r#"
            import { View, Heading, Small } from '@hozo/core'
            const el = (
              <View className="text-base">
                <Heading level={1}>T<Small>s</Small></Heading>
              </View>
            )
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        // 16 * 2 = 32 for the heading, and 32 * 0.85 = 27 inside it.
        assert!(output.styles.contains("fontSize: 32,"), "{}", output.styles);
        assert!(output.styles.contains("fontSize: 27,"), "{}", output.styles);
    }

    #[test]
    fn a_conditional_base_gets_a_conditional_ratio() {
        // The inherited `md:text-xl` reaches the element like any other
        // text declaration. A ratio that existed only at `Always` left it
        // standing above the breakpoint, so a `Small` under
        // `text-base md:text-xl` rendered at 20 on a tablet -- the size of
        // the body, with the shrink gone.
        // `text-2xl` rather than `text-xl` for the breakpoint, so that the
        // scaled number is not also one of the unscaled ones: 20 * 0.8 is
        // 16, which is the base size this element inherits, and an
        // assertion on it would have passed with the ratio missing
        // entirely.
        let source = r#"
            import { View, Small } from '@hozo/core'
            const el = <View className="text-base md:text-2xl">a<Small>s</Small></View>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &reset());
        // 16 * 0.8 = 12.8 -> 13 at the base.
        assert!(output.styles.contains("fontSize: 13,"), "{}", output.styles);
        // 24 * 0.8 = 19.2 -> 19 above the breakpoint, not the 24 it inherited.
        assert!(output.styles.contains("fontSize: 19,"), "{}", output.styles);
        assert!(!output.styles.contains("fontSize: 24,\n    lineHeight: 32,\n  },\n}"), "{}", output.styles);
    }

    #[test]
    fn a_size_the_compiler_cannot_read_is_resolved_at_runtime() {
        // An author's `style` is a number Hozo never sees. Scaling against
        // what it *can* see would be scaling from the wrong base, so the
        // ratio goes to a component instead: one publishes the size React
        // Native resolved, the other reads it.
        let source = r#"
            import { Text, RubyText } from '@hozo/core'
            const el = <Text style={{ fontSize: 20 }}>漢<RubyText>かん</RubyText></Text>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(output.jsx.contains("<HozoTextSize style={{ fontSize: 20 }}>"), "{}", output.jsx);
        assert!(output.jsx.contains("<HozoRelativeText hozoRelative={0.5}>"), "{}", output.jsx);
        // And no guess in a stylesheet beside it.
        assert!(!output.styles.contains("fontSize"), "{}", output.styles);
    }

    #[test]
    fn a_reset_heading_is_not_relative_at_runtime_either() {
        // The runtime half of #315, which the static half did not cover.
        // A `Heading` inside an opaque parent hands its ratio to
        // `HozoRelativeText` instead of resolving it, and that path read a
        // ratio table the reset does not use: a level-1 heading under
        // `style={{ fontSize: 20 }}` scaled by 2 and drew at 40, while the
        // browser -- where preflight gives `h1` `font-size: inherit` --
        // drew it at 20.
        //
        // Asking `size_ratio` rather than the primitive is what makes the
        // two halves agree: no ratio, no relative component, and no
        // publisher above it either, because nothing below is relative.
        let source = r#"
            import { Text, Heading } from '@hozo/core'
            const el = <Text style={{ fontSize: 20 }}>t<Heading level={1}>T</Heading></Text>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &reset());
        assert!(!output.jsx.contains("hozoRelative"), "{}", output.jsx);
        assert!(!output.jsx.contains("HozoTextSize"), "{}", output.jsx);
        // The level still reaches a screen reader.
        assert!(output.jsx.contains(r#"accessibilityRole="header""#), "{}", output.jsx);

        // Without the reset it is relative, and by the user agent's 2.
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(output.jsx.contains("hozoRelative={2}"), "{}", output.jsx);
    }

    #[test]
    fn an_opaque_element_with_nothing_relative_below_it_stays_a_text() {
        // The component boundary is only worth what it answers. Most
        // elements with an inline style have nothing scaling against them.
        let source = r#"
            import { Text } from '@hozo/core'
            const el = <Text style={{ fontSize: 20 }}>a</Text>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(!output.jsx.contains("HozoTextSize"), "{}", output.jsx);
        assert!(output.jsx.starts_with("<Text "), "{}", output.jsx);
    }

    #[test]
    fn a_size_the_compiler_can_read_stays_a_number_in_a_stylesheet() {
        // The runtime pair is for the blind case only. Everything Hozo
        // resolves is still a plain `Text` and costs nothing to render.
        let source = r#"
            import { View, Text, RubyText } from '@hozo/core'
            const el = <View className="text-xl"><Text>漢<RubyText>かん</RubyText></Text></View>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(!output.jsx.contains("Hozo"), "{}", output.jsx);
        assert!(output.styles.contains("fontSize: 10,"), "{}", output.styles);
    }

    #[test]
    fn an_authored_style_joins_the_array_rather_than_replacing_it() {
        // Two `style` attributes on one element: JSX keeps the last, so
        // every compiled class on it was dropped. Silently, and only where
        // someone reached for an inline style.
        let source = r#"
            import { Text } from '@hozo/core'
            const el = <Text className="text-xl" style={{ color: 'red' }}>a</Text>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert_eq!(
            output.jsx,
            "<Text style={[hozoStyles.hozo0, { color: 'red' }]}>a</Text>"
        );
        assert!(output.styles.contains("fontSize: 20,"), "{}", output.styles);
    }

    #[test]
    fn ruby_text_is_half_the_size_it_annotates() {
        // The UA stylesheet says `rt { font-size: 50% }` and JIS X 4051
        // says the same for 振り仮名. React Native has no relative font
        // units, so the halving has to happen here or not at all -- and
        // until now it was not at all: the annotation drew at the size of
        // the text it annotates.
        let source = r#"
            import { Text, Ruby, RubyText } from '@hozo/core'
            const el = (
              <Text className="text-xl">
                漢字<RubyText>かんじ</RubyText>
              </Text>
            )
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        // text-xl is 20px.
        assert!(output.styles.contains("fontSize: 10,"), "{}", output.styles);
    }

    #[test]
    fn ruby_text_is_read_under_both_spellings() {
        // `<Ruby.RubyText>` and `<RubyText>` are the same primitive, the
        // way `<TermList.Term>` and `<Term>` are.
        let member = r#"
            import { Text, Ruby } from '@hozo/core'
            const el = <Text className="text-xl">漢字<Ruby.RubyText>かんじ</Ruby.RubyText></Text>
            "#;
        let parsed = hozo_parser::parse_tsx(member);
        let output = lower(&parsed.roots[0].node, member, &Theme::default());
        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(output.styles.contains("fontSize: 10,"), "{}", output.styles);
    }

    #[test]
    fn a_ruby_reading_with_no_base_is_half_the_platform_default() {
        // This asserted the opposite, and called 14 an invention. It is
        // the size React Native draws at, so a reading scaled against it
        // is scaled against what will be on screen. The old behaviour
        // left the reading the same size as the word it annotates.
        let source = r#"
            import { Text, RubyText } from '@hozo/core'
            const el = <Text>漢字<RubyText>かんじ</RubyText></Text>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        // 14 * 0.5.
        assert!(output.styles.contains("fontSize: 7,"), "{}", output.styles);
    }

    #[test]
    fn a_heading_level_reaches_the_size_it_reaches_on_web() {
        // `heading_level` was read by the parser, used by the Web backend
        // and dropped here, so every level rendered identically on a
        // phone. The ratios are the UA stylesheet's: 2, 1.5, 1.17, 1,
        // 0.83, 0.67.
        let source = r#"
            import { View, Heading } from '@hozo/core'
            const el = (
              <View className="text-base">
                <Heading level={2}>Title</Heading>
              </View>
            )
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        // text-base is 16px, and h2 is 1.5em of it.
        assert!(output.styles.contains("fontSize: 24,"), "{}", output.styles);
        assert!(output.styles.contains("fontWeight: '700'"), "{}", output.styles);
    }

    #[test]
    fn a_heading_level_chosen_at_runtime_keeps_the_weight_and_skips_the_size() {
        // The weight holds for every level, so it is not a guess. The size
        // is one of six and the compiler cannot tell which.
        let source = r#"
            import { View, Heading } from '@hozo/core'
            const el = (
              <View className="text-base">
                <Heading level={depth}>Title</Heading>
              </View>
            )
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(output.styles.contains("fontWeight: '700'"), "{}", output.styles);
        // The inherited 16 reaches it -- React Native's Text does not
        // inherit from a View, so the compiler carries it -- and no ratio
        // is applied on top.
        assert!(output.styles.contains("fontSize: 16,"), "{}", output.styles);
    }

    #[test]
    fn mark_carries_the_pair_the_ua_stylesheet_sets() {
        // Both halves. A yellow ground under inherited light text is less
        // readable than no highlight, which is what this used to emit.
        let source = r#"
            import { Text, Mark } from '@hozo/core'
            const el = <Text>see <Mark>this</Mark></Text>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(output.styles.contains("backgroundColor: '#ffff00'"), "{}", output.styles);
        assert!(output.styles.contains("color: '#000000'"), "{}", output.styles);
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
        let output = lower(&parsed.roots[0].node, source, &reset());

        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        // text-base is 16px, in a project that ships the reset:
        // Sub/Sup = 16 * 0.75 = 12px
        // Small = 16 * 0.80 = 12.8 -> round = 13px
        assert!(output.styles.contains("fontSize: 12,"), "{}", output.styles);
        assert!(output.styles.contains("fontSize: 13,"), "{}", output.styles);
    }

    /// The same source in a project with no reset, where the user agent
    /// makes all three `smaller` rather than 75% and 80%.
    #[test]
    fn without_a_reset_all_three_are_the_user_agent_s_smaller() {
        let source = r#"
            import { Text } from '@hozo/core'
            import { Sub, Sup, Small } from '@hozo/typography'
            const el = (
              <Text className="text-base">
                H<Sub>2</Sub>O
                <Small>fine print</Small>
              </Text>
            )
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        // 16 / 1.2 = 13.33 -> 13, for the subscript and the small print
        // alike. Measured in headless Chrome at 16, 20 and 32.
        assert!(output.styles.contains("fontSize: 13,"), "{}", output.styles);
        assert!(!output.styles.contains("fontSize: 12,"), "{}", output.styles);
    }

    #[test]
    fn a_relative_size_with_no_base_uses_the_platform_default() {
        // This used to assert the opposite -- that nothing was emitted,
        // on the grounds that the compiler should not invent a number.
        // It is not an invention: React Native draws this at 14 whatever
        // Hozo does, so scaling against 14 is scaling against the size
        // that will be on screen. Emitting nothing meant a subscript the
        // same size as the text it subscripts, which is the one thing it
        // must not be.
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
        let output = lower(&parsed.roots[0].node, source, &reset());

        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        // 14 * 0.75, which is what `@hozo/typography` renders uncompiled.
        assert!(output.styles.contains("fontSize: 11,"), "{}", output.styles);
    }

    #[test]
    fn the_default_only_answers_where_nothing_else_does() {
        // The three things that outrank it, in order. A default that won
        // over a size somebody wrote would be worse than no default.
        let known = r#"
            import { Text, Small } from '@hozo/core'
            const el = <Text className="text-xl"><Small>x</Small></Text>
            "#;
        let parsed = hozo_parser::parse_tsx(known);
        let output = lower(&parsed.roots[0].node, known, &Theme::default());
        // 20 * 0.85, not 14 * 0.85.
        assert!(output.styles.contains("fontSize: 17,"), "{}", output.styles);

        // A size only React Native can resolve still goes to the runtime
        // pair rather than being answered with the default here.
        let opaque = r#"
            import { Text, Small } from '@hozo/core'
            const el = <Text style={{ fontSize: 24 }}>a<Small>x</Small></Text>
            "#;
        let parsed = hozo_parser::parse_tsx(opaque);
        let output = lower(&parsed.roots[0].node, opaque, &Theme::default());
        assert!(output.jsx.contains("HozoRelativeText"), "{}", output.jsx);
        assert!(!output.styles.contains("fontSize"), "{}", output.styles);
    }

    #[test]
    fn a_conditional_base_and_the_default_answer_their_own_conditions() {
        // `md:text-xl` names a size above the breakpoint and nothing below
        // it, so the ratio needs both: the default under it, the declared
        // one above. A default applied at `md` would put a ratio where
        // there is already a size to scale from.
        let source = r#"
            import { View, Small } from '@hozo/core'
            const el = <View className="md:text-xl">a<Small>x</Small></View>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        // 14 * 0.85 unconditionally, and 20 * 0.85 at md.
        assert!(output.styles.contains("fontSize: 12,"), "{}", output.styles);
        assert!(output.styles.contains("fontSize: 17,"), "{}", output.styles);
    }
}
