//! The props the parser captured from an element for each backend to
//! write in its own spelling: class slots, TextInput, heading and role.

use super::*;

#[derive(Debug, Clone, PartialEq, Default)]
pub struct PropSet {
    pub on_press: Option<ExprRef>,
    /// Gesture Responder System callbacks. Web lowers these through a
    /// lightweight fallback only when present; Native keeps RN's contract.
    pub on_start_should_set_responder: Option<ExprRef>,
    pub on_start_should_set_responder_capture: Option<ExprRef>,
    pub on_move_should_set_responder: Option<ExprRef>,
    pub on_move_should_set_responder_capture: Option<ExprRef>,
    pub on_responder_grant: Option<ExprRef>,
    pub on_responder_start: Option<ExprRef>,
    pub on_responder_move: Option<ExprRef>,
    pub on_responder_end: Option<ExprRef>,
    pub on_responder_release: Option<ExprRef>,
    pub on_responder_reject: Option<ExprRef>,
    pub on_responder_terminate: Option<ExprRef>,
    pub on_responder_termination_request: Option<ExprRef>,
    /// Cross-platform identity and interaction props whose spellings or
    /// event shapes differ between React Native and the DOM.
    pub test_id: Option<ExprRef>,
    pub native_id: Option<ExprRef>,
    /// The `nativeID`'s value, when it is a literal.
    ///
    /// Two elements in one file sharing an id is not a style question:
    /// every `aria-labelledby`, `aria-controls` and `aria-describedby`
    /// that names it resolves to the first one, so one of the two
    /// references silently points at the wrong element -- and the markup
    /// is invalid besides. The check needs the text; the span says only
    /// where it was written.
    pub native_id_literal: Option<String>,
    pub pointer_events: Option<ExprRef>,
    pub accessibility_state: Option<ExprRef>,
    /// The authored invalid attribute, also retained as a passthrough prop.
    /// It is not an RN accessibilityState key; styles must read this exact value.
    pub aria_invalid: Option<ExprRef>,
    /// The keys `accessibility_state`'s object literal writes, when it is
    /// one this can be read statically.
    ///
    /// `None` means the expression is opaque -- a variable, a spread, a
    /// computed key. The Web backend needs the difference: it turns
    /// `accessibilityState` into one ARIA attribute per key, and reading a
    /// key off an object literal that does not have it is a type error in
    /// the author's own project. `{ expanded: open }` compiled to five
    /// attributes, four of which did not type-check.
    pub accessibility_state_keys: Option<Vec<String>>,
    pub accessibility_value: Option<ExprRef>,
    /// The keys `accessibility_value`'s object literal writes, when it is
    /// one this can be read statically.
    ///
    /// Exactly what `accessibility_state_keys` is for, arrived at the same
    /// way and later: the Web backend turns this into four ARIA
    /// attributes, and reading a key off an object literal that does not
    /// have it is a type error in the author's own project. `{ min, max,
    /// now }` compiled to four attributes, the fourth of which did not
    /// type-check -- the identical defect `accessibilityState` had been
    /// fixed for, on the prop beside it.
    pub accessibility_value_keys: Option<Vec<String>>,
    pub accessibility_live_region: Option<ExprRef>,
    /// React Native's own name for the keyboard focus order.
    ///
    /// Modelled rather than carried because the two platforms spell it
    /// differently: React Native takes `focusable`, the DOM takes
    /// `tabIndex`, and passing `focusable` straight through left it doing
    /// nothing at all on Web. React Native also accepts `tabIndex: 0 | -1`
    /// and documents it against MDN, so that spelling needs no
    /// translation and stays a passthrough.
    pub focusable: Option<ConditionExpr>,
    pub on_layout: Option<ExprRef>,
    /// A Heading's 1...6 level. Static levels compile to a native HTML
    /// heading tag; dynamic expressions use the Web fallback component.
    pub heading_level: Option<HeadingLevel>,
    /// A List's unordered/ordered choice. Dynamic expressions select the
    /// lightweight Web fallback because an HTML tag cannot change inline.
    pub list_ordered: Option<ConditionExpr>,
    pub on_scroll: Option<ExprRef>,
    pub scroll_event_throttle: Option<ExprRef>,
    pub disabled: Option<ConditionExpr>,
    /// Router history intent for destination-bearing `Link` and `Button`.
    /// Web lowers this to an inert data marker for delegated navigation;
    /// Native passes it to `HozoLink` directly.
    pub navigation_replace: Option<ConditionExpr>,
    /// Speculative route warming for destination-bearing primitives.
    /// Web lowers this to an inert marker consumed on hover/focus;
    /// Native passes it to `HozoLink` for press-in intent.
    pub navigation_prefetch: Option<ConditionExpr>,
    /// Explicit override; `None` means derive the role from `Primitive`
    /// (e.g. `Button` -> `AccessibilityRole::Button`).
    pub accessibility_role: Option<AccessibilityRole>,
    /// A `TextInput`'s accessible name, from `aria-label`/
    /// `accessibilityLabel`. Modelled rather than passed through because
    /// its *absence* is the diagnosis (proposal §10.2): a field with no
    /// name is unusable with a screen reader, and `placeholder` is the
    /// classic thing people reach for instead -- it disappears on first
    /// keystroke and is not announced as a label.
    pub accessibility_label: Option<ExprRef>,
    /// Supplemental screen-reader guidance. Lowered to `aria-description`
    /// on DOM elements and `accessibilityHint` on React Native.
    pub accessibility_hint: Option<ExprRef>,
    /// The universal `Image` source expression. Its spelling changes by
    /// platform, so it cannot be an opaque passthrough prop.
    pub image_src: Option<ExprRef>,
    /// Optional placeholder/fallback source. Like `image_src`, each
    /// backend normalizes this to its platform's Image contract.
    pub image_default_source: Option<ExprRef>,
    /// A ScrollView's axis switch, retained as an expression so Web can
    /// drive a scoped selector and Native can receive its boolean prop.
    pub scroll_horizontal: Option<ConditionExpr>,
    pub refreshing: Option<ConditionExpr>,
    pub on_refresh: Option<ExprRef>,
    pub keyboard_should_persist_taps: Option<ExprRef>,
    pub shows_vertical_scroll_indicator: Option<ConditionExpr>,
    pub shows_horizontal_scroll_indicator: Option<ConditionExpr>,
    /// A `Dialog`'s `open` guard, re-emitted verbatim like `disabled`.
    pub open: Option<ConditionExpr>,
    /// Whether a `Dialog` was given an `onClose`. A modal with no way to
    /// dismiss it reads as a trap, and that is worth naming at build time
    /// rather than discovering with a screen reader.
    pub has_on_close: bool,
    /// Whether a `TextInput` was given a `placeholder`. Only whether, not
    /// what: the value is passed through untouched, and all the compiler
    /// needs to know is that a name-less field has one, which is the case
    /// worth naming.
    pub has_placeholder: bool,
    /// The `TextInput` props whose Web spelling differs from React
    /// Native's. Empty on every other primitive.
    pub text_input: TextInputProps,
    /// Props Hozo doesn't model explicitly -- re-emitted unchanged, in
    /// source order (which JSX's last-wins duplicate resolution depends on).
    pub passthrough: Vec<PassthroughProp>,
    /// Residual StyleX declarations from mixed supported/unsupported rules.
    /// Backends rebuild an inline `stylex.create` containing only these
    /// declarations, so the official transform remains authoritative for
    /// them without duplicating the declarations Hozo already lowered.
    pub stylex_residuals: Vec<StylexResidual>,
    /// A runtime component's class lists other than `className`, compiled
    /// like it. Only the props `Primitive::class_slots` names. Expressions
    /// can retain AOT declarations alongside opaque residual spans.
    pub class_slots: Vec<SlotStyle>,
}

/// A second class list on a runtime component, and the style prop that
/// carries it where there are no classes.
///
/// `className` is a host element's, and every backend already knows what to
/// do with it. A component that draws more than one element -- a chip and
/// its remove button -- takes one class list per element on the Web; on
/// React Native, where a component is handed styles rather than classes,
/// each of those is a style prop. One table says which is which, so a
/// pattern that grows a second element adds a row rather than a code path.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ClassSlot {
    /// What the author writes: `removeClassName`.
    pub class_prop: &'static str,
    /// What React Native is handed: `removeStyle`.
    pub style_prop: &'static str,
}

impl ClassSlot {
    /// Canonical author prop names. Private owner callbacks are selected by
    /// the backend's generated contract, not by this metadata-only entry.
    pub const ROOT: Self = Self {
        class_prop: "className",
        style_prop: "style",
    };
}

/// A `ClassSlot` as written on one element.
#[derive(Debug, Clone, PartialEq)]
pub struct SlotStyle {
    pub slot: ClassSlot,
    pub style: Vec<StyleDeclaration>,
    /// Classes that produced no style, carried like `Node::carried_classes`.
    pub carried: Vec<String>,
    /// Opaque leaves from the same decomposer used by root className. They
    /// are evaluated by the author, then resolved with the actual owner.
    pub fallback: Vec<ExprRef>,
    /// Present only when authored predicates need source-ordered capture.
    /// The ROOT entry carries capture metadata only: its declarations and
    /// residuals remain on Node and must not be emitted as a second slot.
    pub evaluation: Option<Box<ClassEvaluation>>,
    pub span: SourceSpan,
}

/// React Native `TextInput` props that the DOM has under another name.
///
/// Modelled rather than passed through, which is a narrower rule than it
/// sounds: the passthrough default is right for a prop that is *only*
/// React Native's, because a visible React warning beats silently deleting
/// behaviour. It is wrong for a prop the DOM has and spells differently,
/// and every field here is one of those.
///
/// `onChangeText` is the one that mattered. Passed through, it reached
/// `<input onChangeText={…}>` -- a prop the DOM does not have, on the
/// element whose entire job is to report what was typed. The field
/// rendered and did nothing, which the fallback `TextInput` in
/// `@hozo/core` had handled correctly all along; compiling made it worse.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct TextInputProps {
    /// `onChangeText={f}`, which the DOM spells `onChange` and hands an
    /// event rather than a string.
    pub on_change_text: Option<ExprRef>,
    /// `editable={false}`, React Native's older spelling of `readOnly`.
    ///
    /// Kept as its own field rather than folded into `read_only`: React
    /// Native 0.87 has both, an author may write either, and Native has to
    /// get back the one that was written.
    pub editable: Option<ConditionExpr>,
    pub read_only: Option<ConditionExpr>,
    /// Native's boolean, which Web's enumerated `autocorrect` spells on/off.
    pub auto_correct: Option<ConditionExpr>,
    /// `multiline`, which on Web is not a prop but a different element.
    pub multiline: Option<ConditionExpr>,
    /// `numberOfLines`, which a `<textarea>` calls `rows`.
    pub number_of_lines: Option<ExprRef>,
    /// `secureTextEntry`, which on Web is `type="password"`.
    pub secure_text_entry: Option<ConditionExpr>,
    /// `keyboardType`, as written. React Native's own values, which map
    /// onto the DOM's `inputmode` for the seven that are cross-platform
    /// and have no answer for the iOS- and Android-only ones.
    pub keyboard_type: Option<String>,
    /// `inputMode`. React Native took the DOM's attribute and its values
    /// verbatim, and documents it as taking precedence over
    /// `keyboardType` -- so Web follows that precedence rather than
    /// inventing one.
    pub input_mode: Option<String>,
}

/// The props that give an element an accessible name, in either
/// vocabulary.
///
/// `alt` is not here: it names an image and nothing else, so the image
/// check adds it rather than every check carrying it.
pub(super) const NAMING_PROPS: &[&str] = &[
    "aria-label",
    "aria-labelledby",
    "accessibilityLabelledBy",
    "title",
];

impl PropSet {
    /// One canonical disabled fact for behavior, announcement and styles.
    /// A false explicit flag cannot enable a state-disabled control. Keep
    /// literal key knowledge so partial state objects remain type-correct.
    pub fn effective_disabled(&self) -> Option<ConditionExpr> {
        let state = self
            .accessibility_state
            .filter(|_| {
                self.accessibility_state_keys
                    .as_ref()
                    .is_none_or(|keys| keys.iter().any(|key| key == "disabled"))
            })
            .map(ConditionExpr::StateDisabled);
        match (self.disabled.clone(), state) {
            (Some(flag), Some(state)) => Some(ConditionExpr::Or(Box::new(flag), Box::new(state))),
            (flag, state) => flag.or(state),
        }
    }
    /// Whether this element has an accessible name.
    ///
    /// `None` means "cannot tell": a `{...spread}` may carry any of these,
    /// and a diagnostic about a name that might be there is a diagnostic
    /// people learn to ignore.
    ///
    /// The naming props matter as much as `accessibilityLabel` and were
    /// not consulted at all. A field labelled the correct way --
    /// a `<Text nativeID="lbl">` beside a
    /// `<TextInput accessibilityLabelledBy="lbl" />`
    /// -- was told it had no accessible name and advised to add
    /// `accessibilityLabel`, which is the *worse* answer: a label and a
    /// labelledby on one element are not additive, `aria-labelledby` wins,
    /// and following the advice either does nothing or replaces a name
    /// that was already right. A wrong diagnostic costs more than a
    /// missing one, because it is the whole channel that stops being
    /// believed.
    pub fn has_accessible_name(&self) -> Option<bool> {
        if self.accessibility_label.is_some() {
            return Some(true);
        }
        if self
            .passthrough
            .iter()
            .filter_map(|prop| prop.name.as_deref())
            .any(|name| NAMING_PROPS.contains(&name))
        {
            return Some(true);
        }
        if self.passthrough.iter().any(|prop| prop.is_spread) {
            return None;
        }
        Some(false)
    }

    /// Whether anything on this element makes it a control.
    ///
    /// The modelled interaction props plus any passthrough one spelled
    /// like a handler. The second half is what catches an SVG child: SVG
    /// elements are passthrough on both platforms, so an `onClick` or an
    /// `onPress` on a `<Svg.Rect>` is a prop the compiler carries rather
    /// than one it models, and it is still a control.
    pub fn has_handler(&self) -> bool {
        if self.on_press.is_some() || self.has_responder_handlers() {
            return true;
        }
        self.passthrough
            .iter()
            .filter_map(|prop| prop.name.as_deref())
            .any(|name| {
                name.starts_with("on") && name.len() > 2 && name.as_bytes()[2].is_ascii_uppercase()
            })
    }

    /// Whether a `{...spread}` is on this element, hiding what it carries.
    ///
    /// A spread's contents are a runtime value, and this compiler reads
    /// syntax: there is no type checker to ask whether `rest` can hold an
    /// `href`, and following the value would mean leaving the file. So a
    /// spread is the compiler being told that it does not know.
    ///
    /// That matters wherever a *decision* is made from a prop. A wrapper
    /// around a primitive is written
    ///
    ///   <ButtonPrimitive {...rest} className={own} />
    ///
    /// and `rest` is where every prop the wrapper forwards has gone. A
    /// lowering that asks "is `href` written here" gets "no" and is wrong
    /// whenever the answer was "not here, but yes" (#653).
    pub fn has_spread(&self) -> bool {
        self.passthrough.iter().any(|prop| prop.is_spread)
    }

    /// Whether a spread here may carry any of `props`. A spread of an
    /// object-rest binding cannot carry what its pattern took out by name
    /// (#656), so a decision that waits only on those props can be made.
    pub fn spread_may_carry(&self, props: &[&str]) -> bool {
        self.passthrough.iter().any(|prop| {
            prop.is_spread
                && !props
                    .iter()
                    .all(|name| prop.spread_excludes.iter().any(|known| known == name))
        })
    }

    pub fn has_responder_handlers(&self) -> bool {
        self.on_start_should_set_responder.is_some()
            || self.on_start_should_set_responder_capture.is_some()
            || self.on_move_should_set_responder.is_some()
            || self.on_move_should_set_responder_capture.is_some()
            || self.on_responder_grant.is_some()
            || self.on_responder_start.is_some()
            || self.on_responder_move.is_some()
            || self.on_responder_end.is_some()
            || self.on_responder_release.is_some()
            || self.on_responder_reject.is_some()
            || self.on_responder_terminate.is_some()
            || self.on_responder_termination_request.is_some()
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum HeadingLevel {
    Static(u8),
    Dynamic(ExprRef),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AccessibilityRole {
    /// The two that decide an element, not just an attribute: a Pressable
    /// with one of these becomes a `<button>` or an `<a>` on Web.
    Button,
    Link,
    /// Any other ARIA role, as written.
    ///
    /// ARIA is the vocabulary because it is already the cross-platform
    /// one: React Native has taken `role` with ARIA values since 0.71,
    /// and the DOM has always had it. Translating React Native's older
    /// `accessibilityRole` vocabulary into ARIA would be a step *down* --
    /// its list has no `listbox`, `option`, `tree` or `tabpanel`, so a
    /// design-styled select box built out of plain elements cannot be
    /// described in it at all.
    Aria(String),
    /// A React Native role with no ARIA meaning: `drawerlayout`,
    /// `keyboardkey`, `viewgroup`, `pager` and the rest of the
    /// Android-specific container names.
    ///
    /// Kept rather than dropped at parse time so each backend can answer
    /// for itself -- React Native understands these and the DOM does not,
    /// which is a difference to report rather than to erase.
    NativeOnly(String),
}

impl TextInputProps {
    /// The DOM `inputmode` this asks for, if the DOM has one.
    ///
    /// `inputMode` wins where both are written, which is React Native's own
    /// documented precedence rather than a choice made here.
    ///
    /// `None` covers three different situations and deliberately does not
    /// distinguish them: nothing was asked for, `default` was asked for
    /// (which is the absence of a request), or one of the five values only
    /// one platform's keyboard has. `ascii-capable`, `twitter` and
    /// `visible-password` describe a keyboard layout, and the DOM has no
    /// vocabulary for that at all -- `inputmode` names the *kind of data*
    /// and lets the platform choose a keyboard.
    pub fn dom_input_mode(&self) -> Option<&'static str> {
        if let Some(mode) = self.input_mode.as_deref() {
            return match mode {
                "none" | "text" | "decimal" | "numeric" | "tel" | "search" | "email" | "url" => {
                    Some(match mode {
                        "none" => "none",
                        "text" => "text",
                        "decimal" => "decimal",
                        "numeric" => "numeric",
                        "tel" => "tel",
                        "search" => "search",
                        "email" => "email",
                        _ => "url",
                    })
                }
                _ => None,
            };
        }
        match self.keyboard_type.as_deref()? {
            "number-pad" | "numeric" => Some("numeric"),
            "decimal-pad" => Some("decimal"),
            "email-address" => Some("email"),
            "phone-pad" => Some("tel"),
            "url" => Some("url"),
            "web-search" => Some("search"),
            _ => None,
        }
    }

    /// Whether anything here was written at all.
    pub fn is_empty(&self) -> bool {
        *self == TextInputProps::default()
    }
}
