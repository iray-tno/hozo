//! Conditions React Native cannot answer, each refused with the reason it
//! cannot: an attribute, a relation, a selector, a pseudo-element or a
//! browser question that has nothing on this platform to be true of.

use super::*;

/// The diagnostic for a condition `build_style_entries` does not route.
pub(super) fn unwired_diagnostic(condition: &Condition, node: &Node) -> Diagnostic {
    match condition {
        // Not a gap in this backend so much as a question the platform
        // cannot be asked: a link the user has been to needs links and
        // a history to have been in them, and neither is a thing React
        // Native has.
        Condition::Visited => unwired_variant(
            node,
            "`visited:` styles a link the user has already been to. React Native has no browsing history and no links to have been in one, so there is nothing here for this to be true of. On Web the same class works -- for colours; the browser discards the rest.",
            Severity::Error,
        ),
        Condition::Open => unwired_variant(
            node,
            "`open:` matches an open `<details>`, `<dialog>` or popover by its `open` attribute. React Native has no attribute to read, and `Details` keeps its open state to itself, so nothing here can tell this element is open. On Web the same class works.",
            Severity::Error,
        ),
        Condition::Control(state) => unwired_variant(
            node,
            &format!(
                "`{}:` matches a checkbox, a radio or a form's default button by the DOM's own state. React Native has none of those elements and no selector to ask with. Style from the state you already hold instead -- `aria-checked:` reads `accessibilityState`, which works on both platforms. On Web the same class works.",
                state.variant_name(),
            ),
            Severity::Error,
        ),
        Condition::Target => unwired_variant(
            node,
            "`target:` matches the element the document's URL fragment points at. React Native has no document and no URL to point with, so there is nothing for this to be true of. On Web the same class works.",
            Severity::Error,
        ),
        // Not a gap that could be closed. React Native's styles are
        // objects handed to components, and a pseudo-element is a box
        // the browser makes that has no component to hand one to.
        // `placeholder:` is the near miss: React Native carries a
        // placeholder's colour on `TextInput`'s own
        // `placeholderTextColor` prop, which is a colour and not a
        // style object, so it cannot take the rest of what
        // `placeholder:` is allowed to set.
        Condition::PseudoElement(pseudo) => unwired_variant(
            node,
            &format!(
                "`{}:` styles a pseudo-element, which React Native does not have -- its styles go to components, and there is no component here to give one to. Render the content as a real element instead. On Web the same class works.",
                pseudo.variant_name(),
            ),
            Severity::Error,
        ),
        Condition::FormState(state) => unwired_variant(
            node,
            &format!(
                "`{}:` is the DOM's constraint validation, which React Native does not have -- there is no `required`, no `pattern`, and nothing for `:invalid` to be true of. Validate in your own code and drive the style from a `className` guard. On Web the same class works.",
                state.variant_name(),
            ),
            Severity::Error,
        ),
        // A subtree marker that survived the partition above, which
        // means it is wrapped in something -- `not-*:` and the like.
        // Handing a style down is the answer to `*:`; there is no
        // answer to the negation of one, because the set it names is
        // "everything that is not a child of this", which React Native
        // has no way to enumerate.
        Condition::Subtree { .. } => unwired_variant(
            node,
            "`*:`/`**:` is handed to this element's children at build time, and this one is wrapped in a variant that cannot be. On Web the same class works from the selector.",
            Severity::Error,
        ),
        Condition::In(_) => unwired_variant(
            node,
            "`in-…:` asks whether any ancestor is in a state, through a selector. React \
             Native has no selectors, and with no `group` marker there is no ancestor to hand \
             the state down from. Put `group` on the ancestor and write `group-…:`. On Web \
             the same class works.",
            Severity::Error,
        ),
        Condition::Inert => unwired_variant(
            node,
            "`inert:` matches an element under the `inert` attribute, which React Native \
             does not have. On Web the same class works.",
            Severity::Error,
        ),
        // Refused rather than shelved. React Native has no selector
        // engine at all -- not a missing feature but a different
        // architecture, since styles there are objects handed to
        // elements rather than rules matched against a tree. `[&>*]`
        // asks which elements match a pattern, and there is nothing on
        // that side of the compiler that could ever answer it.
        //
        // An error, not a warning: the author wrote a selector, and a
        // build that quietly rendered without it would look like it
        // worked.
        Condition::ArbitrarySelector(selector) => Diagnostic {
            code: DiagnosticCode::WebOnlyPropertyOnNative,
            severity: Severity::Error,
            message: format!(
                "`[{selector}]:` is a CSS selector, and React Native has no selector engine \
                 to match it with -- styles there are objects attached to elements, not \
                 rules matched against a tree. Move the condition into JSX, or apply the \
                 style to the elements directly."
            ),
            span: node.span,
        },
        // `@media` and `@supports` both ask the browser a question
        // about itself. The nearest Native equivalents are real but
        // unrelated -- `useWindowDimensions` for width, `Platform` for
        // capability -- and neither is a translation of the at-rule
        // the author wrote.
        Condition::ArbitraryAtRule(rule) => Diagnostic {
            code: DiagnosticCode::WebOnlyPropertyOnNative,
            severity: Severity::Error,
            message: format!(
                "`[{rule}]:` is a CSS at-rule, which only a browser can evaluate. Hozo's \
                 own breakpoint variants do work on React Native -- they read \
                 `useWindowDimensions` -- so a width query is better written as `md:` than \
                 as a raw `@media`."
            ),
            span: node.span,
        },
        // Listed rather than `_`, so a new `Condition` variant fails to
        // compile here instead of reaching this at runtime.
        Condition::Always
        | Condition::All(_)
        | Condition::Group(_)
        | Condition::Peer(_)
        | Condition::StartingStyle
        | Condition::Expr(_)
        | Condition::Disabled
        | Condition::Enabled
        | Condition::Aria(_)
        | Condition::DataAttribute(_)
        | Condition::Environment(_)
        | Condition::FirstChild
        | Condition::LastChild
        | Condition::Structural(_)
        | Condition::Not(_)
        | Condition::Pressed
        | Condition::Hover
        | Condition::Focus
        | Condition::FocusVisible
        | Condition::FocusWithin
        | Condition::Has(_)
        | Condition::HasSelector(_)
        | Condition::Responsive(_)
        | Condition::Width { .. }
        | Condition::Dark
        | Condition::Container { .. }
        | Condition::Supports(_) => unreachable!("routed by build_style_entries"),
    }
}
