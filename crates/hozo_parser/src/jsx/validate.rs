//! Checks that refuse combinations the platforms cannot render the same way.

use hozo_ir::{
    Child, Condition, ConditionExpr, Diagnostic, DiagnosticCode, Display, Environment, Primitive,
    PropSet, Severity, SourceSpan, StyleDeclaration, StyleProperty,
};

/// `focusable` on an element that is also `disabled`.
///
/// This is someone reaching for the ARIA APG's "focusable disabled"
/// pattern, which Hozo does not offer -- Android cannot produce it. React
/// Native routes `disabled` to `View.setEnabled(false)`, and a view that
/// is not enabled cannot take input focus however `focusable` is set, so
/// the prop would work on Web and quietly do nothing there.
///
/// Reported rather than ignored, and the message says what to do instead.
/// `focusable={false}` is not reported: it agrees with what `disabled`
/// already does, so there is nothing to warn about.
/// `flex` on a box that was already one, with no direction said.
///
/// Tailwind's `flex` is `display: flex` and nothing more. The row
/// everyone associates with it is CSS's initial value for a `<div>`, and
/// a Hozo box is not a `<div>`: it lowers to a React Native `View`, whose
/// direction is column on both platforms. So the utility is redundant --
/// the box is already a flex container -- and it is usually a defect,
/// because the person who typed it was picturing a row.
///
/// Written as a `flex-row`/`flex-col` question rather than as "remove
/// this": an author who meant column has said so, and an author who meant
/// row has a one-word fix. A direction under *any* variant counts, so
/// `flex md:flex-row` is somebody who knows what they are doing.
pub(super) fn validate_flex_direction(
    primitive: Primitive,
    style: &[StyleDeclaration],
    span: SourceSpan,
    diagnostics: &mut Vec<Diagnostic>,
) {
    if !primitive.is_view_box() {
        return;
    }
    let flexed = style.iter().any(|declaration| {
        matches!(
            declaration.property,
            StyleProperty::Display(Display::Flex) | StyleProperty::Display(Display::InlineFlex)
        )
    });
    if !flexed {
        return;
    }
    if style
        .iter()
        .any(|declaration| matches!(declaration.property, StyleProperty::FlexDirection(..)))
    {
        return;
    }
    diagnostics.push(Diagnostic {
        code: DiagnosticCode::FlexDirectionUnsaid,
        severity: Severity::Warning,
        message: "`flex` here says nothing about direction, and this element is already a \
                  flex container: every Hozo box is one, laid out as a column, on the Web \
                  and on React Native alike. Tailwind's `flex` is only `display: flex` -- \
                  the row it implies in a browser comes from CSS's default for a `<div>`, \
                  which this is not. Write `flex-row` for a horizontal layout, `flex-col` \
                  to say the column was meant, or drop `flex` entirely."
            .to_string(),
        span,
    });
}

/// A hint when an element enters or leaves by moving and says nothing
/// about reduced motion (decision 007, section 5).
///
/// Hozo does not drop an author's translate under reduced motion, because
/// Tailwind does not on the Web and a class means the same thing on both
/// platforms. So the author is the one who can say it, and `motion-safe:`
/// already works on both. Any `motion-safe:` or `motion-reduce:` on the
/// element counts as having thought about it, whichever classes it is on.
///
/// Only movement: translate, rotate, scale and skew. A fade is left alone,
/// because WCAG 2.3.3 is about motion and a fade is not motion. Entering
/// is `starting:`; leaving is `data-[state=closed]:`, the frame an element
/// animates to inside `Presence` (amendment 1).
pub(super) fn validate_enter_motion(
    style: &[StyleDeclaration],
    span: SourceSpan,
    diagnostics: &mut Vec<Diagnostic>,
) {
    let enters_moving = style.iter().any(|declaration| {
        moves(&declaration.property)
            && condition_mentions(&declaration.condition, &|condition| {
                matches!(condition, Condition::StartingStyle) || leaves_to(condition)
            })
    });
    if !enters_moving {
        return;
    }
    let mentions_motion_preference = style.iter().any(|declaration| {
        condition_mentions(&declaration.condition, &|condition| {
            matches!(
                condition,
                Condition::Environment(Environment::MotionSafe | Environment::MotionReduce)
            )
        })
    });
    if mentions_motion_preference {
        return;
    }
    diagnostics.push(Diagnostic {
        code: DiagnosticCode::MotionIgnoresReducedMotion,
        severity: Severity::Info,
        message: "This element moves as it enters or leaves (`starting:` or \
                  `data-[state=closed]:` with a translate, rotate, scale or skew), and nothing \
                  on it asks about reduced motion, so it plays for everyone, as Tailwind's does \
                  on the Web. To leave the movement out for people who have asked their device \
                  for less motion, write those classes as `motion-safe:starting:...` and \
                  `motion-safe:data-[state=closed]:...`, which work on the Web and on React \
                  Native. A fade on its own (`starting:opacity-0`) is not motion and needs \
                  nothing."
            .to_string(),
        span,
    });
}

/// `data-[state=closed]:`, the state `Presence` sets on an element that is
/// leaving.
pub(super) fn leaves_to(condition: &Condition) -> bool {
    matches!(condition, Condition::DataAttribute(selector) if selector == "[data-state=\"closed\"]")
}

pub(super) fn moves(property: &StyleProperty) -> bool {
    matches!(
        property,
        StyleProperty::Translate(..)
            | StyleProperty::TranslateX(..)
            | StyleProperty::TranslateY(..)
            | StyleProperty::TranslateZ(..)
            | StyleProperty::Rotate(..)
            | StyleProperty::RotateX(..)
            | StyleProperty::RotateY(..)
            | StyleProperty::RotateZ(..)
            | StyleProperty::Scale(..)
            | StyleProperty::ScaleX(..)
            | StyleProperty::ScaleY(..)
            | StyleProperty::ScaleZ(..)
            | StyleProperty::SkewX(..)
            | StyleProperty::SkewY(..)
            | StyleProperty::Transform(..)
    )
}

pub(super) fn condition_mentions(
    condition: &Condition,
    predicate: &impl Fn(&Condition) -> bool,
) -> bool {
    predicate(condition)
        || matches!(condition, Condition::All(conditions) if conditions.iter().any(|condition| condition_mentions(condition, predicate)))
}

pub(super) fn validate_focusable_disabled(
    props: &PropSet,
    span: SourceSpan,
    diagnostics: &mut Vec<Diagnostic>,
) {
    if matches!(
        props.disabled.as_ref(),
        None | Some(ConditionExpr::Static(false))
    ) {
        return;
    }
    // `focusable={false}` agrees with what `disabled` already does, so
    // there is nothing to say about it. Anything else is someone asking
    // for a state Hozo does not offer.
    let wants_focus = props
        .focusable
        .as_ref()
        .is_some_and(|value| !matches!(value, ConditionExpr::Static(false)));
    // A known non-negative tab index is the same request in DOM/RN's
    // other spelling. Negative/opaque values do not prove a tab stop;
    // the host's disabled guard still clamps them at runtime (#943).
    let wants_tab_stop = props.passthrough.iter().any(|prop| {
        prop.name.as_deref() == Some("tabIndex")
            && prop
                .literal
                .as_deref()
                .and_then(|value| value.parse::<i32>().ok())
                .is_some_and(|value| value >= 0)
    });
    if !wants_focus && !wants_tab_stop {
        return;
    }
    diagnostics.push(Diagnostic {
        code: DiagnosticCode::FocusableDisabledUnsupported,
        severity: Severity::Warning,
        message: "`focusable`/`tabIndex` cannot keep a disabled element in the keyboard focus order. React Native's disabled \
                  state removes keyboard focus on Android, and Hozo cannot yet separate that \
                  from the announcement. To let people reach the control and learn why it is \
                  unavailable, leave it enabled and answer in the handler instead."
            .to_string(),
        span,
    });
}

pub(super) fn validate_semantic_children(
    parent: Primitive,
    children: &[Child],
    diagnostics: &mut Vec<Diagnostic>,
) {
    for child in children {
        let Child::Node(child) = child else { continue };
        let allowed = match parent {
            Primitive::Paragraph | Primitive::Heading | Primitive::Preformatted => matches!(
                child.primitive,
                Primitive::Text
                    | Primitive::Badge
                    | Primitive::Link
                    | Primitive::Button
                    | Primitive::TextInput
                    | Primitive::Image
                    | Primitive::Time
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
            ),
            Primitive::Ruby => matches!(
                child.primitive,
                Primitive::Text
                    | Primitive::RubyText
                    | Primitive::Strong
                    | Primitive::Emphasis
                    | Primitive::Underline
                    | Primitive::Code
                    | Primitive::NoBreak
            ),
            Primitive::List => child.primitive == Primitive::ListItem,
            _ => true,
        };
        if allowed {
            continue;
        }
        let parent_name = match parent {
            Primitive::Paragraph => "Paragraph",
            Primitive::Heading => "Heading",
            Primitive::Preformatted => "Preformatted",
            Primitive::List => "List",
            _ => continue,
        };
        diagnostics.push(Diagnostic {
            code: DiagnosticCode::InvalidSemanticNesting,
            severity: Severity::Warning,
            message: format!(
                "`{parent_name}` cannot directly contain `{:?}` in semantic HTML. Move or wrap that child so the generated document structure remains valid.",
                child.primitive
            ),
            span: child.span,
        });
    }
}
