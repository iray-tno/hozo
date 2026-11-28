//! Compiler-synthesized React Native pseudo-element lowering (`marker:`,
//! and later `first-letter:`, `before:`, `after:`).
//!
//! React Native has no CSS pseudo-element boxes, so the compiler synthesizes
//! real hidden/inline RN children (`<Text aria-hidden>` / `<View aria-hidden>`)
//! only when a pseudo-element variant is actually authored on a compatible
//! primitive, keeping non-pseudo output completely unchanged.

use hozo_ir::{ConditionExpr, PseudoElement};

use super::*;
use crate::conditions::{resolve_condition_guard, ResolvedCondition};
use crate::style::js_string;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) enum PseudoContent {
    None,
    Literal(String),
    Unsupported,
}

/// Removes one occurrence of `want` from `condition`, returning the remaining
/// condition if `condition` targets solely that pseudo-element (and no other
/// stacked pseudo-element like `before:marker:`).
pub(super) fn strip_pseudo_element(
    condition: &Condition,
    want: PseudoElement,
) -> Option<Condition> {
    match condition {
        Condition::PseudoElement(pseudo) if *pseudo == want => Some(Condition::Always),
        Condition::All(items) => {
            let pos = items
                .iter()
                .position(|c| matches!(c, Condition::PseudoElement(p) if *p == want))?;
            let rest: Vec<Condition> = items
                .iter()
                .enumerate()
                .filter(|&(index, _)| index != pos)
                .map(|(_, item)| item.clone())
                .collect();
            if rest.iter().any(|c| c.pseudo_element().is_some()) {
                return None;
            }
            Some(Condition::all(rest))
        }
        _ => None,
    }
}

/// Parses CSS `content` values that can be synthesized on React Native:
/// `none` and single/double-quoted string literals. Dynamic CSS functions
/// (`attr(...)`, `counter(...)`, `url(...)`) stay `Unsupported` so callers
/// leave them unstripped and refuse them loudly.
pub(super) fn parse_content_value(raw: &str) -> PseudoContent {
    let trimmed = raw.trim();
    if trimmed == "none" {
        return PseudoContent::None;
    }
    let mut chars = trimmed.chars();
    let Some(quote) = chars.next() else {
        return PseudoContent::Unsupported;
    };
    if quote != '\'' && quote != '"' {
        return PseudoContent::Unsupported;
    }
    let Some(inner) = trimmed
        .strip_prefix(quote)
        .and_then(|s| s.strip_suffix(quote))
    else {
        return PseudoContent::Unsupported;
    };
    let mut out = String::with_capacity(inner.len());
    let mut iter = inner.chars().peekable();
    while let Some(ch) = iter.next() {
        if ch == quote {
            // Unescaped quote in the middle (e.g. `'a' 'b'` multi-token content).
            return PseudoContent::Unsupported;
        }
        if ch != '\\' {
            out.push(ch);
            continue;
        }
        let Some(escaped) = iter.next() else {
            return PseudoContent::Unsupported;
        };
        match escaped {
            'n' => out.push('\n'),
            'r' => out.push('\r'),
            't' => out.push('\t'),
            '\\' | '\'' | '"' => out.push(escaped),
            c if c.is_ascii_hexdigit() => {
                let mut hex = String::with_capacity(6);
                hex.push(c);
                while hex.len() < 6 && iter.peek().is_some_and(|next| next.is_ascii_hexdigit()) {
                    hex.push(iter.next().expect("peeked"));
                }
                if iter.peek() == Some(&' ') {
                    iter.next();
                }
                let Some(decoded) = u32::from_str_radix(&hex, 16).ok().and_then(char::from_u32)
                else {
                    return PseudoContent::Unsupported;
                };
                out.push(decoded);
            }
            other => out.push(other),
        }
    }
    PseudoContent::Literal(out)
}

/// True when `node` contains at least one `ListItem` descendant (directly or
/// inside an expression like `items.map(...)`) that can receive a `<List>`'s
/// `marker:` styles.
pub(super) fn has_list_item_descendant(node: &Node) -> bool {
    node.children.iter().any(|child| match child {
        hozo_ir::Child::Node(child_node) => {
            child_node.primitive == Primitive::ListItem || has_list_item_descendant(child_node)
        }
        hozo_ir::Child::Verbatim { nested, .. } => nested.iter().any(|entry| {
            entry.node.primitive == Primitive::ListItem || has_list_item_descendant(&entry.node)
        }),
        hozo_ir::Child::Text(_) => false,
    })
}

fn is_list_ambient_condition(condition: &Condition) -> bool {
    match condition {
        Condition::Always
        | Condition::Dark
        | Condition::Responsive(_)
        | Condition::Width { .. }
        | Condition::Container { .. }
        | Condition::Environment(_)
        | Condition::Supports(_) => true,
        Condition::Not(inner) => is_list_ambient_condition(inner),
        _ => false,
    }
}

fn non_content_refusal_check(
    declarations: &[StyleDeclaration],
    inherited: &[StyleDeclaration],
    node: &Node,
    cx: &mut NativeRenderContext<'_>,
) {
    let check: Vec<StyleDeclaration> = declarations
        .iter()
        .filter(|d| !matches!(d.property, StyleProperty::Content(_)))
        .cloned()
        .collect();
    if check.is_empty() {
        return;
    }
    let folded = fold_font_relative(&check, inherited, cx.theme);
    let _ = refusals::report_refused(
        &folded,
        refusals::Lowered {
            svg_paint: false,
            grid: false,
            grid_item: false,
            transition: false,
            truncation: false,
            text_break: false,
            ios_line_break: false,
            keyframes: false,
            self_measured: false,
            parent_measured: false,
            parent_measured_space: false,
        },
        node,
        cx.theme,
        cx.runtime,
        cx.diagnostics,
    );
}

/// Extracts `marker:` declarations from a `<List>` that has at least one
/// `ListItem` descendant, resolving any list-local conditions (`first:`,
/// `peer-*:`, `aria-*:`, `disabled:`, etc.) against the `<List>` itself while
/// keeping ambient conditions (`dark:`, `md:`, `rtl:`, `@sm:`, etc.) intact for
/// each `<ListItem>`.
pub(super) fn extract_list_marker(
    effective_own: &mut Vec<StyleDeclaration>,
    inherited: &[StyleDeclaration],
    target: &crate::conditions::StyleTarget<'_>,
    cx: &mut NativeRenderContext<'_>,
) -> Vec<StyleDeclaration> {
    let node = target.node;
    if node.primitive != Primitive::List || !has_list_item_descendant(node) {
        return Vec::new();
    }
    let list_opens_group = node.carried_classes.iter().any(|cls| cls == "group");
    let mut kept = Vec::with_capacity(effective_own.len());
    let mut forwarded = Vec::new();

    for declaration in std::mem::take(effective_own) {
        let Some(stripped) = strip_pseudo_element(&declaration.condition, PseudoElement::Marker)
        else {
            kept.push(declaration);
            continue;
        };
        if matches!(
            &declaration.property,
            StyleProperty::Content(raw) if matches!(parse_content_value(raw), PseudoContent::Unsupported)
        ) {
            kept.push(declaration);
            continue;
        }

        let mut ambient = Vec::new();
        let mut elemental = Vec::new();
        let mut pending = vec![stripped];
        while let Some(cond) = pending.pop() {
            match cond {
                Condition::Always => {}
                Condition::All(items) => pending.extend(items.into_iter().rev()),
                other
                    if is_list_ambient_condition(&other)
                        || (!list_opens_group && matches!(other, Condition::Group(_))) =>
                {
                    ambient.push(other);
                }
                other => elemental.push(other),
            }
        }

        if elemental.is_empty() {
            forwarded.push(StyleDeclaration {
                condition: Condition::all(ambient),
                ..declaration
            });
            continue;
        }

        let mut scratch = RuntimeNeeds::default();
        match resolve_condition_guard(
            &Condition::all(elemental),
            target,
            cx.source,
            &mut scratch,
            false,
        ) {
            Ok(ResolvedCondition::Always) => {
                cx.runtime.hooks.extend(scratch.hooks);
                forwarded.push(StyleDeclaration {
                    condition: Condition::all(ambient),
                    ..declaration
                });
            }
            Ok(ResolvedCondition::Never) => {
                // Statically false on this List; consume without forwarding.
            }
            Ok(ResolvedCondition::Guarded { expr, .. }) => {
                cx.runtime.hooks.extend(scratch.hooks);
                ambient.push(Condition::Expr(ConditionExpr::RawJs(expr)));
                forwarded.push(StyleDeclaration {
                    condition: Condition::all(ambient),
                    ..declaration
                });
            }
            Err(_) => {
                // Unresolvable on this List (e.g. `hover:marker:` on a plain List):
                // leave unstripped so the normal diagnostics refuse it loudly.
                kept.push(declaration);
            }
        }
    }

    *effective_own = kept;
    let ambient_text: Vec<StyleDeclaration> = inherited
        .iter()
        .chain(effective_own.iter())
        .filter(|d| is_text_property(&d.property))
        .cloned()
        .collect();
    non_content_refusal_check(&forwarded, &ambient_text, node, cx);
    forwarded
}

/// Extracts `marker:` declarations written directly on a `<ListItem>`.
pub(super) fn extract_item_marker(
    node: &Node,
    effective_own: &mut Vec<StyleDeclaration>,
) -> Vec<StyleDeclaration> {
    if node.primitive != Primitive::ListItem {
        return Vec::new();
    }
    let mut kept = Vec::with_capacity(effective_own.len());
    let mut extracted = Vec::new();
    for declaration in std::mem::take(effective_own) {
        let Some(stripped) = strip_pseudo_element(&declaration.condition, PseudoElement::Marker)
        else {
            kept.push(declaration);
            continue;
        };
        if matches!(
            &declaration.property,
            StyleProperty::Content(raw) if matches!(parse_content_value(raw), PseudoContent::Unsupported)
        ) {
            kept.push(declaration);
            continue;
        }
        extracted.push(StyleDeclaration {
            condition: stripped,
            ..declaration
        });
    }
    *effective_own = kept;
    extracted
}

pub(super) struct RenderedMarker {
    pub(super) jsx: String,
    pub(super) uses_container_size: bool,
}

fn default_marker_glyph_expr(
    list_ordered: Option<&ConditionExpr>,
    position: SiblingPosition,
    source: &str,
) -> String {
    match (list_ordered, position.ordinal) {
        (Some(ConditionExpr::Static(true)), Some(ordinal)) => js_string(&format!("{ordinal}. ")),
        (Some(ConditionExpr::Static(false)) | None, _) | (_, None) => "'\\u2022 '".to_string(),
        (Some(ordered_expr), Some(ordinal)) => format!(
            "(({}) ? {} : '\\u2022 ')",
            render_condition_expr(source, ordered_expr),
            js_string(&format!("{ordinal}. "))
        ),
    }
}

fn format_style_prop(parts: &[String]) -> String {
    if parts.is_empty() {
        String::new()
    } else if parts.len() == 1 && !parts[0].contains("&&") {
        format!(" style={{{}}}", parts[0])
    } else {
        format!(" style={{[{}]}}", parts.join(", "))
    }
}

/// Lowers `marker:` declarations on a `<ListItem>` into a synthesized
/// `<Text aria-hidden style={...}>` child. Returns `None` when no marker
/// applies or when `marker:content-none` suppresses it.
#[allow(clippy::too_many_arguments)]
pub(super) fn render_marker(
    ancestor_marker: &[StyleDeclaration],
    own_marker: &[StyleDeclaration],
    descend: &[StyleDeclaration],
    list_ordered: Option<&ConditionExpr>,
    base_name: &str,
    node: &Node,
    position: SiblingPosition,
    has_group_interaction_owner: bool,
    group_ancestor: Option<GroupAncestor<'_>>,
    peers: &[PeerSibling<'_>],
    cx: &mut NativeRenderContext<'_>,
) -> Option<RenderedMarker> {
    if ancestor_marker.is_empty() && own_marker.is_empty() {
        return None;
    }

    // Check own marker declarations for Web-only / unwired properties.
    // Ancestor `<List>` marker declarations were already checked on the `<List>`.
    non_content_refusal_check(own_marker, descend, node, cx);

    let combined_raw: Vec<StyleDeclaration> = ancestor_marker
        .iter()
        .chain(own_marker.iter())
        .cloned()
        .collect();
    let combined = fold_font_relative(&combined_raw, descend, cx.theme);

    let mut content_decls = Vec::new();
    let mut style_decls = Vec::new();
    for decl in combined {
        if matches!(decl.property, StyleProperty::Content(_)) {
            content_decls.push(decl);
        } else {
            style_decls.push(decl);
        }
    }

    let marker_target = crate::conditions::StyleTarget {
        owner_facts: &[],
        owner_events: &[],
        node,
        position,
        interaction_context: false,
        group_interaction_query: has_group_interaction_owner,
        group_ancestor,
        peers,
        pattern_slot: None,
        composition: Default::default(),
    };

    let mut base_content: Option<String> =
        Some(default_marker_glyph_expr(list_ordered, position, cx.source));
    let mut conditional_contents: Vec<(String, Option<String>)> = Vec::new();
    let mut has_live_explicit_content = false;

    for decl in &content_decls {
        let StyleProperty::Content(raw) = &decl.property else {
            continue;
        };
        let value = match parse_content_value(raw) {
            PseudoContent::None => None,
            PseudoContent::Literal(text) => Some(js_string(&text)),
            PseudoContent::Unsupported => continue,
        };
        match resolve_condition_guard(
            &decl.condition,
            &marker_target,
            cx.source,
            cx.runtime,
            false,
        ) {
            Ok(ResolvedCondition::Always) => {
                base_content = value;
                conditional_contents.clear();
                has_live_explicit_content = true;
            }
            Ok(ResolvedCondition::Never) => {}
            Ok(ResolvedCondition::Guarded { expr, .. }) => {
                conditional_contents.push((expr, value));
                has_live_explicit_content = true;
            }
            Err(message) => {
                cx.diagnostics
                    .push(unwired_variant(node, &message, Severity::Error));
            }
        }
    }

    if base_content.is_none() && conditional_contents.is_empty() {
        return None;
    }

    let mut marker_parts = Vec::new();
    let mut marker_pressed = Vec::new();
    if !style_decls.is_empty() {
        build_style_entries(
            &style_decls,
            &format!("{base_name}_marker"),
            &marker_target,
            &mut marker_parts,
            &mut marker_pressed,
            None,
            cx,
        );
    }
    if !marker_pressed.is_empty() {
        cx.diagnostics.push(unwired_variant(
            node,
            "`pressed:` on `marker:` needs an interactive host, and `ListItem` does not track press state.",
            Severity::Error,
        ));
    }

    let should_emit =
        !marker_parts.is_empty() || !ancestor_marker.is_empty() || has_live_explicit_content;
    if !should_emit {
        return None;
    }

    // Inherit unconditional text styles from the ListItem so a bullet matches
    // the item's font size/family unless `marker:` overrides them.
    let inherited_text: Vec<StyleDeclaration> = descend
        .iter()
        .filter(|d| d.condition == Condition::Always && is_text_property(&d.property))
        .cloned()
        .collect();
    let mut final_parts = Vec::new();
    if !inherited_text.is_empty() {
        build_style_entries(
            &inherited_text,
            &format!("{base_name}_marker_base"),
            &marker_target,
            &mut final_parts,
            &mut Vec::new(),
            None,
            cx,
        );
    }
    final_parts.extend(marker_parts);

    cx.runtime.need_native("Text");
    let style_prop = format_style_prop(&final_parts);
    let uses_container_size = style_decls
        .iter()
        .any(|d| crate::measured::uses_container_size(&d.property));

    let has_none_branch =
        base_content.is_none() || conditional_contents.iter().any(|(_, val)| val.is_none());
    let jsx = if conditional_contents.is_empty() {
        let glyph = base_content.expect("checked above");
        format!("<Text aria-hidden{style_prop}>{{{glyph}}}</Text>")
    } else if !has_none_branch {
        let mut expr = base_content.expect("checked above");
        for (cond, val) in conditional_contents {
            let text_expr = val.expect("checked above");
            expr = format!("(({cond}) ? {text_expr} : {expr})");
        }
        format!("<Text aria-hidden{style_prop}>{{{expr}}}</Text>")
    } else {
        let render_branch = |val: Option<String>| match val {
            Some(glyph) => format!("<Text aria-hidden{style_prop}>{{{glyph}}}</Text>"),
            None => "null".to_string(),
        };
        let mut expr = render_branch(base_content);
        for (cond, val) in conditional_contents {
            let branch = render_branch(val);
            expr = format!("(({cond}) ? {branch} : {expr})");
        }
        format!("{{{expr}}}")
    };

    Some(RenderedMarker {
        jsx,
        uses_container_size,
    })
}

/// Inline properties React Native's nested `<Text>` supports inside another
/// `<Text>`. Box/layout properties (`display: flex`, `padding`, `margin`,
/// `width`, `border`, etc.) do not work on inline nested text spans in Yoga
/// and stay refused loudly.
fn is_inline_first_letter_property(property: &StyleProperty) -> bool {
    matches!(
        property,
        StyleProperty::TextColor(_)
            | StyleProperty::BackgroundColor(_)
            | StyleProperty::FontFamily(_)
            | StyleProperty::FontVariant(_)
            | StyleProperty::FontSize(_)
            | StyleProperty::FontWeight(_)
            | StyleProperty::LineHeight(_)
            | StyleProperty::LeadingRegister(_)
            | StyleProperty::LetterSpacing(_)
            | StyleProperty::TextTransform(_)
            | StyleProperty::TextDecorationLine(_)
            | StyleProperty::TextDecorationColor(_)
            | StyleProperty::TextDecorationStyle(_)
            | StyleProperty::TextShadow(_)
            | StyleProperty::TextShadowColor(_)
            | StyleProperty::Opacity(_)
            | StyleProperty::Keyword("font-style", "italic" | "normal")
    )
}

/// Extracts `first-letter:` declarations on a text primitive that has children.
/// Returns the stripped declarations while leaving non-text primitives or
/// empty text elements unstripped so the normal diagnostics refuse them.
pub(super) fn extract_first_letter(
    node: &Node,
    effective_own: &mut Vec<StyleDeclaration>,
) -> Vec<StyleDeclaration> {
    if !is_text_primitive(node.primitive) || node.children.is_empty() {
        return Vec::new();
    }
    let mut kept = Vec::with_capacity(effective_own.len());
    let mut extracted = Vec::new();
    for declaration in std::mem::take(effective_own) {
        if let Some(stripped) =
            strip_pseudo_element(&declaration.condition, PseudoElement::FirstLetter)
        {
            extracted.push(StyleDeclaration {
                condition: stripped,
                ..declaration
            });
        } else {
            kept.push(declaration);
        }
    }
    *effective_own = kept;
    extracted
}

fn is_opening_punctuation(ch: char) -> bool {
    matches!(
        ch,
        '"' | '\''
            | '('
            | '['
            | '{'
            | '«'
            | '‹'
            | '“'
            | '‘'
            | '「'
            | '『'
            | '（'
            | '【'
            | '《'
            | '〈'
    )
}

fn is_combining_mark(ch: char) -> bool {
    matches!(
        ch,
        '\u{0300}'..='\u{036F}'
            | '\u{1AB0}'..='\u{1AFF}'
            | '\u{1DC0}'..='\u{1DFF}'
            | '\u{20D0}'..='\u{20FF}'
            | '\u{FE00}'..='\u{FE0F}'
            | '\u{FE20}'..='\u{FE2F}'
    )
}

/// Splits leading whitespace + CSS `::first-letter` (optional opening
/// punctuation + first character + combining marks) + trailing remainder.
pub(super) fn split_first_letter(text: &str) -> Option<(&str, &str, &str)> {
    let ws_end = text
        .char_indices()
        .find(|&(_, ch)| !ch.is_whitespace())
        .map(|(idx, _)| idx)?;
    let mut iter = text[ws_end..].char_indices().peekable();
    // Skip any leading opening punctuation before the base letter.
    let mut base_end = None;
    while let Some((rel, ch)) = iter.next() {
        let next_pos = ws_end + rel + ch.len_utf8();
        if !is_opening_punctuation(ch) {
            base_end = Some(next_pos);
            break;
        }
        // If text consists solely of opening punctuation, style it as the head.
        if iter.peek().is_none() {
            base_end = Some(next_pos);
            break;
        }
    }
    let mut end = base_end?;
    while let Some(&(rel, ch)) = iter.peek() {
        if is_combining_mark(ch) {
            end = ws_end + rel + ch.len_utf8();
            iter.next();
        } else {
            break;
        }
    }
    Some((&text[..ws_end], &text[ws_end..end], &text[end..]))
}

pub(super) struct FirstLetterStyle {
    /// JSX attribute value inside `style={...}` (plain style ref/array or
    /// interaction callback `(state) => [...]`).
    pub(super) style_expr: String,
    pub(super) uses_hozo_text: bool,
    pub(super) uses_container_size: bool,
}

/// Builds the style expression for `first-letter:` on a text host rendering RN
/// `Text`. Refuses non-inline layout/box properties loudly.
#[allow(clippy::too_many_arguments)]
pub(super) fn build_first_letter(
    declarations: &[StyleDeclaration],
    ambient_text: &[StyleDeclaration],
    base_name: &str,
    node: &Node,
    component: &str,
    position: SiblingPosition,
    interaction_context: bool,
    has_group_interaction_owner: bool,
    group_ancestor: Option<GroupAncestor<'_>>,
    peers: &[PeerSibling<'_>],
    cx: &mut NativeRenderContext<'_>,
) -> Option<FirstLetterStyle> {
    if declarations.is_empty() {
        return None;
    }
    if !renders_text(component) {
        cx.diagnostics.push(unwired_variant(
            node,
            "`first-letter:` on React Native requires a plain `Text` host and cannot split children inside this custom text component. On Web the same class works.",
            Severity::Error,
        ));
        return None;
    }

    let mut inline_decls = Vec::new();
    let mut reported_non_inline = false;
    for decl in declarations {
        if is_inline_first_letter_property(&decl.property) {
            inline_decls.push(decl.clone());
        } else if !reported_non_inline {
            reported_non_inline = true;
            cx.diagnostics.push(Diagnostic {
                code: DiagnosticCode::WebOnlyPropertyOnNative,
                severity: Severity::Error,
                message: "`first-letter:` on React Native lowers to an inline nested `<Text>`, which supports only typography, colour, background, decoration, and opacity -- box/layout properties (such as `flex`, padding, margin, width, or borders) cannot apply to an inline text span.".to_string(),
                span: node.span,
            });
        }
    }
    if inline_decls.is_empty() {
        return None;
    }

    let folded = fold_font_relative(&inline_decls, ambient_text, cx.theme);
    non_content_refusal_check(&folded, ambient_text, node, cx);

    let target_interaction = interaction_context;
    let target = crate::conditions::StyleTarget {
        owner_facts: &[],
        owner_events: &[],
        node,
        position,
        interaction_context: target_interaction,
        group_interaction_query: has_group_interaction_owner && !target_interaction,
        group_ancestor,
        peers,
        pattern_slot: None,
        composition: Default::default(),
    };
    let mut parts = Vec::new();
    let mut pressed = Vec::new();
    build_style_entries(
        &folded,
        &format!("{base_name}_first_letter"),
        &target,
        &mut parts,
        &mut pressed,
        None,
        cx,
    );

    let uses_hozo_text = target_interaction && !pressed.is_empty();
    if uses_hozo_text {
        parts.extend(pressed);
    } else if !pressed.is_empty() {
        cx.diagnostics.push(unwired_variant(
            node,
            "`pressed:` on `first-letter:` needs an enclosing `Pressable`, `Button`, or `Link` on React Native.",
            Severity::Error,
        ));
    }
    if parts.is_empty() {
        return None;
    }

    let style_expr = if uses_hozo_text {
        let needs_fv = folded
            .iter()
            .any(|d| interaction::uses_focus_visible(&d.condition));
        let state = if needs_fv {
            "{ pressed, hovered, focused, focusVisible }"
        } else {
            "{ pressed, hovered, focused }"
        };
        format!("({state}) => [{}]", parts.join(", "))
    } else if parts.len() == 1 && !parts[0].contains("&&") {
        parts.remove(0)
    } else {
        format!("[{}]", parts.join(", "))
    };

    let uses_container_size = folded
        .iter()
        .any(|d| crate::measured::uses_container_size(&d.property));

    Some(FirstLetterStyle {
        style_expr,
        uses_hozo_text,
        uses_container_size,
    })
}

impl FirstLetterStyle {
    /// Renders a statically split text child: `{ws}<Text style={...}>{head}</Text>{tail}`.
    pub(super) fn render_static_split(
        &self,
        ws: &str,
        head: &str,
        tail: &str,
        cx: &mut NativeRenderContext<'_>,
    ) -> String {
        let tag = if self.uses_hozo_text {
            cx.runtime.need_component("HozoText");
            "HozoText"
        } else {
            cx.runtime.need_native("Text");
            "Text"
        };
        format!(
            "{}<{tag} style={{{}}}>{}</{tag}>{}",
            escape_jsx_text(ws),
            self.style_expr,
            escape_jsx_text(head),
            escape_jsx_text(tail),
        )
    }
}
