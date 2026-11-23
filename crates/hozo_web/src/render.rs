//! `render_node` and what it writes with: the rules a root's class uses,
//! spreads, carried JSX and branch guards.

use crate::*;

/// The CSS for one class: a rule per condition, and the dark copy a paired
/// token needs. An element's `className` and a component's other class
/// lists (`ClassSlot`) are both written by this; `render` says whom a
/// `disabled:` asks.
pub(super) fn push_rules_using(
    class_name: &str,
    style: &[hozo_ir::StyleDeclaration],
    span: hozo_ir::SourceSpan,
    theme: &Theme,
    rules: &mut String,
    diagnostics: &mut Vec<Diagnostic>,
    render: fn(&str, &hozo_ir::Condition, &[hozo_ir::StyleProperty], &Theme) -> String,
) {
    let mut groups: Vec<_> = hozo_ir::group_by_condition_for_css(style)
        .into_iter()
        .map(|(condition, props)| {
            (
                condition,
                hozo_ir::dedupe_last_wins(theme.resolve_shadow_tokens(props)),
            )
        })
        .collect();
    let axes = css::register_split_axes(&mut groups, theme);
    let shadows = css::register_split_shadows(&mut groups, theme);
    let gradients = css::register_split_gradients(&mut groups, theme);
    if (axes || shadows || gradients) && !rules.contains(css::axis_register_css()) {
        rules.push_str(css::axis_register_css());
    }
    for (condition, props) in groups {
        if props.is_empty() {
            continue;
        }
        // The mirror of what the Native backend does with `print:` and
        // `forced-colors:`: a condition this platform cannot express emits
        // no rule and says so, rather than emitting one with an empty
        // query that would apply to everyone.
        if let Some(query) = css::inexpressible_on_web(&condition) {
            diagnostics.push(hozo_ir::Diagnostic {
                code: hozo_ir::DiagnosticCode::NotWiredOnWeb,
                severity: hozo_ir::Severity::Warning,
                message: query.web_gap_message(),
                span,
            });
            continue;
        }
        // A rule that applies only in dark mode resolves its colours against
        // the dark palette. That covers a `dark:` the author wrote as well as
        // a copy made below, and the two have to agree: the same class
        // meaning two colours depending on how it was produced would be worse
        // than either answer on its own.
        let shaded_theme = theme.dark();
        let palette = match (condition.mentions_dark(), &shaded_theme) {
            (true, Some(shaded)) => shaded,
            _ => theme,
        };
        let light = render(class_name, &condition, &props, palette);
        rules.push_str(&light);
        rules.push_str("\n\n");

        // A token that carries a dark value emits the same rule again under
        // `prefers-color-scheme`, so a project says "dark" once in its theme
        // rather than on every class list.
        //
        // Rendered rather than computed: the second pass is the identical
        // properties against a palette whose paired tokens hold their dark
        // values, and the comparison decides whether it was worth emitting.
        // Anything not built from a paired token renders identically and
        // costs nothing.
        //
        // Skipped when the author already wrote `dark:`, which is a rule that
        // is *only* for dark mode. Emitting a dark copy of it would be saying
        // the same thing twice, and the second one would win on a tie.
        //
        // The copy keeps the condition it came from and adds the colour scheme
        // to it. Replacing it was a real bug: the dark half of
        // `hover:bg-hozo-surface-hover` lost its `:hover` and painted the
        // hover colour on every element carrying the class, in the dark,
        // always.
        if !condition.mentions_dark() {
            if let Some(dark) = &shaded_theme {
                let shaded = render(class_name, &condition, &props, dark);
                if shaded != light {
                    rules.push_str(&render(class_name, &condition.and_dark(), &props, dark));
                    rules.push_str("\n\n");
                }
            }
        }
    }
}

/// What `render_node`'s attribute phases (`press`, `passthrough`) read
/// about the element being rendered.
#[derive(Clone, Copy)]
pub(crate) struct Element<'n> {
    pub(crate) node: &'n Node,
    pub(crate) tag: &'n str,
    pub(crate) disabled_expr: &'n Option<String>,
    pub(crate) is_hozo_component: bool,
}

pub(super) fn render_node(node: &Node, cx: &mut WebRenderContext<'_>) -> Rendered {
    let source = cx.source;
    let theme = cx.theme;
    // Every copy of an attribute this element's plan evaluates reads the
    // plan's value instead, for as long as the element renders (#1879).
    let _captured = hozo_ir::attribute_capture::enter(node.root_class_evaluation(), source);
    let class_name = cx.allocator.alloc();
    let mut attr_copies = cx.tag_decisions.is_some().then(Vec::new);

    // `rules` accumulates the whole tree's CSS, so "did this node write
    // one" has to be asked about the span this node adds, not about
    // whether the string is empty.
    let rules_before = cx.rules.len();

    // A root the catalog has audited lands on an element the component
    // draws and keeps its own `disabled` on, which no Hozo marker reaches --
    // so its CSS asks that element, as a secondary slot's does (#993).
    push_rules_using(
        &class_name,
        &node.style,
        node.span,
        theme,
        cx.rules,
        cx.diagnostics,
        if node.primitive.root_owner_is_audited() {
            css::render_slot_rule
        } else {
            css::render_rule
        },
    );

    let (shape, extra_attrs) = markup::element_shape(node, cx.diagnostics);
    // A shape the backend declined to decide keeps the component, named the
    // way this file names it rather than the way the primitive is called.
    // See `written_tag` and #653.
    let mut tag: &str = if shape == markup::UNDECIDED {
        written_tag(source, node.span).unwrap_or("div")
    } else {
        shape
    };
    let has_pan_handlers_spread = node
        .props
        .passthrough
        .iter()
        .any(|prop| prop.is_spread && source_text(source, prop.span).contains(".panHandlers"));
    if has_pan_handlers_spread {
        tag = match node.primitive {
            Primitive::View => "HozoView",
            Primitive::Pressable => "Pressable",
            Primitive::TouchableOpacity => "HozoTouchableOpacity",
            Primitive::TouchableWithoutFeedback => "HozoTouchableWithoutFeedback",
            _ => tag,
        };
    }
    if node.primitive == Primitive::Image {
        if let Some(src) = node.props.image_src {
            let value = source_text(source, src);
            if !value.starts_with(['\"', '\'']) {
                tag = "Image";
            }
        }
    }
    // An element Hozo made into a control itself: a `<div>` it put in the
    // tab order, rather than a `<button>` the browser already knows about.
    // Everything a control needs then has to be supplied too, and has to
    // agree -- which is what `hozoInteractive` is for.
    let synthesized_control =
        node.props.on_press.is_some() && extra_attrs.iter().any(|(key, _)| *key == "tabIndex");

    // The one expression that decides `disabled`, whichever way it was
    // spelled. This is Hozo's existing unavailable policy, also used by
    // the fallback Pressable: a false flag cannot enable a state-disabled
    // control. Props, styles and activation must not each reconstruct it.
    let disabled_expr = node
        .props
        .effective_disabled()
        .map(|fact| render_condition_expr(source, &fact));

    // A retained alias is a component too. Looking only at its spelling
    // renamed nativeID/onPress/disabled for the DOM before the fallback
    // could decide whether it was an action or a destination (#943).
    let is_hozo_component = shape == markup::UNDECIDED
        || tag.starts_with("Hozo")
        || matches!(
            tag,
            "View"
                | "Text"
                | "Paragraph"
                | "Heading"
                | "Section"
                | "Article"
                | "Nav"
                | "List"
                | "ListItem"
                | "Image"
                | "ScrollView"
                | "FlatList"
                | "HozoScrollView"
                | "HozoFlatList"
                | "HozoRefreshControl"
                | "Pressable"
                | "Strong"
                | "Emphasis"
                | "Underline"
                | "Strikethrough"
                | "Sub"
                | "Sup"
                | "Code"
                | "Preformatted"
                | "Small"
                | "Mark"
                | "NoBreak"
                | "Ruby"
                | "RubyText"
        );

    let mut attrs = class_attribute::class_attribute(node, class_name, rules_before, cx);
    for (key, value) in &extra_attrs {
        // `hozoInteractive` supplies it, together with everything else it
        // has to agree with.
        if (tag == "Pressable" || synthesized_control) && *key == "tabIndex" {
            continue;
        }
        let key = if tag == "Pressable" && *key == "role" {
            "accessibilityRole"
        } else {
            key
        };
        match value {
            markup::AttrValue::Text(text) => attrs.push_str(&format!(r#" {key}="{text}""#)),
            markup::AttrValue::Expression(expr) => attrs.push_str(&format!(" {key}={{{expr}}}")),
        }
    }

    accessibility::accessibility_attrs(node, tag, is_hozo_component, source, &mut attrs);
    if let Some(src) = node.props.image_src {
        attrs.push_str(&format!(" src={{{}}}", source_text(source, src)));
    }
    if let Some(src) = node.props.image_default_source {
        attrs.push_str(&format!(" defaultSource={{{}}}", source_text(source, src)));
    }
    if let Some(horizontal) = &node.props.scroll_horizontal {
        let horizontal = render_condition_expr(source, horizontal);
        if matches!(
            tag,
            "ScrollView" | "FlatList" | "HozoScrollView" | "HozoFlatList"
        ) {
            attrs.push_str(&format!(" horizontal={{{horizontal}}}"));
        } else {
            attrs.push_str(&format!(
                " data-hozo-horizontal={{{horizontal} ? '' : undefined}}"
            ));
        }
    }
    scroll::scroll_attrs(node, tag, source, &mut attrs);
    if node.primitive == Primitive::Image {
        if let Some(label) = node.props.accessibility_label {
            attrs.push_str(&format!(" alt={{{}}}", source_text(source, label)));
        }
    }
    if let Some(open) = &node.props.open {
        attrs.push_str(&format!(
            " open={{{}}}",
            render_condition_expr(source, open)
        ));
    }
    press::on_press_attrs(
        Element {
            node,
            tag,
            disabled_expr: &disabled_expr,
            is_hozo_component,
        },
        synthesized_control,
        &mut attrs,
        &mut attr_copies,
        cx,
    );
    disabled::link_attrs(
        Element {
            node,
            tag,
            disabled_expr: &disabled_expr,
            is_hozo_component,
        },
        source,
        &mut attrs,
        &mut attr_copies,
    );
    responder::responder_attrs(node, source, &mut attrs, &mut attr_copies);
    disabled::control_attrs(
        Element {
            node,
            tag,
            disabled_expr: &disabled_expr,
            is_hozo_component,
        },
        synthesized_control,
        source,
        &mut attrs,
    );

    // The `TextInput` props the DOM has under another name.
    //
    text_input::text_input_attrs(node, source, &mut attrs);

    navigation::navigation_attrs(node, tag, source, &mut attrs);

    // `external`, which is Hozo's own spelling and not the DOM's.
    //
    // It used to reach the anchor verbatim -- the generated file said
    // `<a href="..." external>` -- and, far worse, neither `target` nor
    // `rel` was emitted at all. The attribute itself was harmless, since
    // React drops an unknown prop whose value is `true` before it reaches
    // the document; the missing `rel` was not. The opened page kept
    // `window.opener` and could navigate the one it came from, while the
    // same source rendered through `@hozo/core` severed it. The compiled
    // and uncompiled halves of one component disagreed about a security
    // property, silently, with no diagnostic (#290).
    //
    // `externalLinkAttributes` in `@hozo/engine` is the other
    // implementation of this; `external-link.test.ts` in the conformance
    // suite compares them, because a three-line rule in two languages
    // is a rule that will be changed in one of them.
    let external_target_consumed = passthrough::external_link(node, tag, source, &mut attrs);
    // Everything Hozo doesn't model, re-emitted verbatim and last so JSX's
    // last-wins duplicate resolution keeps matching the source's own
    // ordering semantics. Known cross-platform props were consumed above;
    // an unknown RN-specific prop is still carried as written, because a
    // visible React warning is safer than silently deleting app behavior.
    passthrough::emit(
        Element {
            node,
            tag,
            disabled_expr: &disabled_expr,
            is_hozo_component,
        },
        external_target_consumed,
        &mut attrs,
        &mut attr_copies,
        cx,
    );

    // In source order, and every child emitted -- `Verbatim` covers the
    // ones the compiler doesn't model, re-emitted from source rather than
    // deleted. Order is load-bearing: `<Text>Hello {name}</Text>` and
    // `<Text>{name} Hello</Text>` differ only in it.
    let child_decisions_start = cx.tag_decisions.as_ref().map_or(0, Vec::len);
    let mut inner = Rendered::new(cx.tag_decisions.is_some());
    for child in &node.children {
        match child {
            hozo_ir::Child::Node(child_node) => {
                inner.append(render_node(child_node, cx));
            }
            hozo_ir::Child::Text(text) => inner.text.push_str(&markup::html_escape(text)),
            hozo_ir::Child::Verbatim {
                source: expr_ref,
                nested,
            } => inner.append(render_verbatim(*expr_ref, nested, cx)),
        }
    }

    // `<input>`, `<img>`, `<hr>` are void elements: HTML forbids a closing
    // tag and React throws on children. Nothing can be inside one, so there
    // is no inner to lose by self-closing.
    let void = tag == "input" || tag == "img" || tag == "hr";
    if let Some(decisions) = cx.tag_decisions {
        // The renderer computes children before choosing its final output.
        // A void element emits none of them; do not journal discarded work.
        if void {
            decisions.truncate(child_decisions_start);
        }
        decisions.push(TagDecision {
            span: node.opening_tag_span,
            replacement: Some(tag.to_string()),
        });
        if let Some(span) = node.closing_tag_span {
            decisions.push(TagDecision {
                span,
                replacement: (!void).then(|| tag.to_string()),
            });
        }
    }
    let mut copies = attr_copies.map(|incoming| {
        let mut copies = Vec::new();
        source_evidence::shift_into(&mut copies, incoming, 1 + tag.len());
        copies
    });
    if !void {
        if let (Some(copies), Some(incoming)) = (&mut copies, inner.copies) {
            source_evidence::shift_into(copies, incoming, 2 + tag.len() + attrs.len());
        }
    }
    let mut text = if void {
        format!("<{tag}{attrs} />")
    } else {
        format!("<{tag}{attrs}>{}</{tag}>", inner.text)
    };
    if let Some(evaluation) = node.root_class_evaluation() {
        // Written in source order already: no plan needed (#1879).
        if hozo_ir::attribute_capture::unplan(
            evaluation,
            source,
            &mut text,
            copies.as_mut(),
            hozo_parser::plan_reads_in_order,
        ) {
            return Rendered { text, copies };
        }
        if let Some(copies) = &mut copies {
            let offset = evaluation.wrapper_offset(source);
            for copy in copies {
                copy.emitted_start += offset;
                copy.emitted_end += offset;
            }
        }
        Rendered {
            text: evaluation.wrap_subtree(source, &text),
            copies,
        }
    } else {
        Rendered { text, copies }
    }
}

/// Re-emits a carried expression from source, with each Hozo primitive
/// inside it replaced by its lowered output.
///
/// The nested spans are subranges of `expr_ref`'s and don't overlap (each
/// is the outermost primitive on its branch), so one left-to-right pass is
/// enough. `{show && <Text className="p-4">hi</Text>}` comes out as
/// `{show && <span className="hozo-1">hi</span>}` -- the guard untouched,
/// the element fully compiled.
/// A spread's argument between `prefix` and `suffix`: `value`, its text
/// as sliced, or, when primitives are written inside it
/// (`{...withFooter(<Text className="p-2" />)}`), the argument with them
/// lowered.
pub(super) fn spread_argument(
    prop: &hozo_ir::PassthroughProp,
    value: &str,
    prefix: &str,
    suffix: &str,
    attrs: &mut String,
    copies: &mut Option<Vec<hozo_ir::SourceCopy>>,
    cx: &mut WebRenderContext<'_>,
) {
    if prop.nested.is_empty() {
        source_evidence::expression(attrs, copies, cx.source, value, prefix, suffix);
        return;
    }
    let source = cx.source;
    let raw = &source[prop.span.0.start as usize..prop.span.0.end as usize];
    let argument = raw
        .strip_prefix('{')
        .and_then(|rest| rest.strip_suffix('}'))
        .unwrap_or(raw)
        .trim_start();
    let argument = argument.strip_prefix("...").unwrap_or(argument).trim();
    let start = argument.as_ptr() as usize - source.as_ptr() as usize;
    let argument = hozo_ir::ExprRef(hozo_ir::SourceSpan {
        start: start as u32,
        end: (start + argument.len()) as u32,
    });
    attrs.push_str(prefix);
    source_evidence::append(attrs, copies, render_verbatim(argument, &prop.nested, cx));
    attrs.push_str(suffix);
}

pub(super) fn render_verbatim(
    expr_ref: hozo_ir::ExprRef,
    nested: &[hozo_ir::NestedNode],
    cx: &mut WebRenderContext<'_>,
) -> Rendered {
    let start = expr_ref.0.start as usize;
    let mut out = Rendered::new(cx.tag_decisions.is_some());
    let mut cursor = start;
    // An element inside a value the plan evaluates is lowered there; the
    // copy below writes the value's slot (#1879).
    let spans: Vec<_> = nested.iter().map(|entry| entry.span).collect();
    let planned = hozo_ir::attribute_capture::lower_captured(
        cx.source,
        start,
        expr_ref.0.end as usize,
        &spans,
        |index| render_node(&nested[index].node, cx).text,
    );
    for (entry, _) in nested.iter().zip(planned).filter(|(_, planned)| !planned) {
        let from = entry.span.start as usize;
        out.copy(cx.source, cursor, from);
        out.append(render_node(&entry.node, cx));
        cursor = entry.span.end as usize;
    }
    out.copy(cx.source, cursor, expr_ref.0.end as usize);
    out
}

pub(super) fn class_guards(style: &[hozo_ir::StyleDeclaration], source: &str) -> Vec<String> {
    let mut refs = Vec::new();
    for decl in style {
        collect_from_condition(&decl.condition, &mut refs);
    }
    refs.sort_by(|(a_ref, a_kind, _), (b_ref, b_kind, _)| {
        (a_ref.0.start, a_ref.0.end, a_kind).cmp(&(b_ref.0.start, b_ref.0.end, b_kind))
    });
    refs.dedup_by(|(a_ref, a_kind, _), (b_ref, b_kind, _)| a_ref == b_ref && a_kind == b_kind);
    refs.into_iter()
        .map(|(_, class_name, expression)| {
            format!(
                "({}) && '{}'",
                render_condition_expr(source, expression),
                class_name
            )
        })
        .collect()
}

pub(super) fn collect_from_condition<'a>(
    condition: &'a hozo_ir::Condition,
    out: &mut Vec<(hozo_ir::ExprRef, String, &'a hozo_ir::ConditionExpr)>,
) {
    match condition {
        hozo_ir::Condition::Expr(expr) => collect_from_expr(expr, out),
        hozo_ir::Condition::All(conditions) => {
            for inner in conditions {
                collect_from_condition(inner, out);
            }
        }
        _ => {}
    }
}

pub(super) fn collect_from_expr<'a>(
    expr: &'a hozo_ir::ConditionExpr,
    out: &mut Vec<(hozo_ir::ExprRef, String, &'a hozo_ir::ConditionExpr)>,
) {
    use hozo_ir::ConditionExpr;
    match expr {
        ConditionExpr::Static(_) => {}
        ConditionExpr::Ref(r) => out.push((*r, css::expr_ref_class(*r), expr)),
        ConditionExpr::StateDisabled(r) => out.push((*r, css::state_disabled_ref_class(*r), expr)),
        ConditionExpr::Captured(capture) => out.push((
            capture.reference,
            css::expr_ref_class(capture.reference),
            expr,
        )),
        ConditionExpr::ClassConflict(conflict) => {
            out.push((conflict.reference, css::conflict_ref_class(conflict), expr))
        }
        ConditionExpr::Not(inner) => collect_from_expr(inner, out),
        ConditionExpr::And(a, b) | ConditionExpr::Or(a, b) => {
            collect_from_expr(a, out);
            collect_from_expr(b, out);
        }
    }
}
