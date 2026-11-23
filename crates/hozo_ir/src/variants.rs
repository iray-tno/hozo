//! The other atoms a variant names: pseudo-elements, form and control
//! states, and the environment a media query asks about.

/// The box a browser makes beside an element.
///
/// Two of these are more than one selector, which is the whole reason
/// `condition_shapes` returns a list: Tailwind writes `marker:` as four
/// rules -- the element's own `::marker`, a descendant's, and both again
/// under `::-webkit-details-marker` for Safari -- and `selection:` as two.
/// Read from its output rather than its documentation, which says none of
/// this.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PseudoElement {
    Before,
    After,
    Placeholder,
    Selection,
    Marker,
    FirstLetter,
    FirstLine,
    /// `file:`, which is `::file-selector-button`.
    File,
    Backdrop,
    /// `details-content:`, which is `::details-content`: the part of a
    /// `<details>` that opens and closes. Only `Details` renders one.
    DetailsContent,
}

impl PseudoElement {
    /// The selector suffixes, in the order Tailwind emits them.
    ///
    /// Order matters because it is the order the rules come out in, and a
    /// later rule of equal specificity wins.
    pub fn suffixes(&self) -> Vec<&'static str> {
        match self {
            PseudoElement::Before => vec!["&::before"],
            PseudoElement::After => vec!["&::after"],
            PseudoElement::Placeholder => vec!["&::placeholder"],
            PseudoElement::FirstLetter => vec!["&::first-letter"],
            PseudoElement::FirstLine => vec!["&::first-line"],
            PseudoElement::File => vec!["&::file-selector-button"],
            PseudoElement::Backdrop => vec!["&::backdrop"],
            PseudoElement::DetailsContent => vec!["&::details-content"],
            // A descendant's and the element's own, because a selection
            // crosses element boundaries and styling only the element
            // would leave its children unstyled mid-drag.
            PseudoElement::Selection => vec!["& ::selection", "&::selection"],
            // The same pair, twice: Safari renders a `<details>` marker as
            // `::-webkit-details-marker` and does not answer to `::marker`.
            PseudoElement::Marker => vec![
                "& ::marker",
                "&::marker",
                "& ::-webkit-details-marker",
                "&::-webkit-details-marker",
            ],
        }
    }

    /// Whether this one needs `content` to exist at all.
    ///
    /// `::before` and `::after` generate nothing without it, so Tailwind
    /// writes `content: var(--tw-content)` into every rule that targets
    /// them and registers the property with an initial value of `""`.
    /// Without that, `before:bg-red-500` would style a box that is never
    /// created.
    pub fn needs_content(&self) -> bool {
        matches!(self, PseudoElement::Before | PseudoElement::After)
    }

    pub fn variant_name(&self) -> &'static str {
        match self {
            PseudoElement::Before => "before",
            PseudoElement::After => "after",
            PseudoElement::Placeholder => "placeholder",
            PseudoElement::Selection => "selection",
            PseudoElement::Marker => "marker",
            PseudoElement::FirstLetter => "first-letter",
            PseudoElement::FirstLine => "first-line",
            PseudoElement::File => "file",
            PseudoElement::Backdrop => "backdrop",
            PseudoElement::DetailsContent => "details-content",
        }
    }
}

/// A form control's state, as the DOM asks about it.
///
/// One variant per pseudo-class and no shared structure, because there is
/// none to share: these are eleven unrelated questions that happen to be
/// answerable only of a form control.
///
/// The three Tailwind ships that are not here -- `checked`, `indeterminate`
/// and `default` -- are `ControlState`. They ask about a checkbox, a radio
/// or a form's default button rather than about a field, and `TextInput`,
/// the one primitive these can match, is none of those.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FormState {
    Required,
    Optional,
    Valid,
    Invalid,
    /// `:user-valid` and `:user-invalid`, which differ from the pair above
    /// by *when*: they hold only once the field has been interacted with,
    /// so an empty required field is not red before it has been visited.
    UserValid,
    UserInvalid,
    InRange,
    OutOfRange,
    ReadOnly,
    PlaceholderShown,
    Autofill,
}

impl FormState {
    pub fn selector(&self) -> &'static str {
        match self {
            FormState::Required => ":required",
            FormState::Optional => ":optional",
            FormState::Valid => ":valid",
            FormState::Invalid => ":invalid",
            FormState::UserValid => ":user-valid",
            FormState::UserInvalid => ":user-invalid",
            FormState::InRange => ":in-range",
            FormState::OutOfRange => ":out-of-range",
            FormState::ReadOnly => ":read-only",
            FormState::PlaceholderShown => ":placeholder-shown",
            FormState::Autofill => ":autofill",
        }
    }

    /// Tailwind's name for it, which is the selector without its colon.
    pub fn variant_name(&self) -> &'static str {
        &self.selector()[1..]
    }
}

/// The state of a checkbox, a radio, an option or a default button, as the
/// DOM asks about it (#1752).
///
/// Apart from `FormState` because the elements are. No primitive is a
/// checkbox, a radio or a submit button, so on one of these written
/// directly the rule can never apply. The one exception is
/// `indeterminate:` on `Progress`, a real `<progress>` that matches while
/// it has no `value`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ControlState {
    Checked,
    Indeterminate,
    Default,
}

impl ControlState {
    pub fn selector(&self) -> &'static str {
        match self {
            ControlState::Checked => ":checked",
            ControlState::Indeterminate => ":indeterminate",
            ControlState::Default => ":default",
        }
    }

    /// Tailwind's name for it, which is the selector without its colon.
    pub fn variant_name(&self) -> &'static str {
        &self.selector()[1..]
    }
}

/// The environment queries Tailwind names, as Tailwind names them.
///
/// Split by what each platform can answer rather than by what it is:
/// React Native reports reduced motion, inverted colours, orientation and
/// text direction, and has nothing for a printer, a scripting-disabled
/// page, or Windows' forced-colours mode. The ones it cannot answer are
/// still compiled for Web and reported on Native, which is the rule
/// `peer-` established -- a concept that exists on one platform is better
/// implemented there and named absent on the other than left out of both.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Environment {
    /// `@media (prefers-reduced-motion: reduce)`.
    MotionReduce,
    /// `@media (prefers-reduced-motion: no-preference)`.
    MotionSafe,
    /// `@media (orientation: portrait)`.
    Portrait,
    /// `@media (orientation: landscape)`.
    Landscape,
    /// `@media (inverted-colors: inverted)`.
    InvertedColors,
    /// A selector, not a query: `:where(:dir(ltr), [dir="ltr"], [dir="ltr"] *)`.
    Ltr,
    /// The same, right to left.
    Rtl,
    /// `@media (prefers-contrast: more)`.
    ///
    /// Compiled on both backends. React Native reports it from two
    /// settings, one per platform: iOS's Increase Contrast through
    /// `isDarkerSystemColorsEnabled`, Android's high-contrast text through
    /// `isHighTextContrastEnabled`. The iOS one is the same OS setting
    /// Safari writes `prefers-contrast: more` from, so the two backends
    /// agree there by construction; Android's is narrower -- text only --
    /// and is read as the nearest thing that platform has.
    ContrastMore,
    /// `@media (prefers-contrast: less)`. Web only, and not for want of
    /// looking: neither iOS nor Android exposes a *reduce* contrast
    /// setting, so there is nothing for React Native to report.
    ContrastLess,
    /// `@media (forced-colors: active)`. Web only.
    ForcedColors,
    /// `@media print`. Web only, and unambiguously so.
    Print,
    /// `@media (scripting: none)`. Web only.
    Noscript,
    /// `@media (pointer: fine)`, `coarse` and `none`: the primary pointing
    /// device. Web only. React Native reports no pointer, and a phone
    /// being touch-first is a guess about the device rather than an answer
    /// from it.
    PointerFine,
    PointerCoarse,
    PointerNone,
    /// `@media (any-pointer: …)`: any pointing device the system has.
    /// Web only, for the same reason.
    AnyPointerFine,
    AnyPointerCoarse,
    AnyPointerNone,
    /// `@media (prefers-reduced-transparency: reduce)`, and React Native's
    /// `isReduceTransparencyEnabled`.
    ///
    /// The four below are not Tailwind's -- they are the accessibility
    /// settings React Native reports and Tailwind has no name for, added
    /// through the extension point Tailwind ships for exactly this
    /// (`@custom-variant`), which is what makes them an extension rather
    /// than an invention. Decision 002 rejected inventing vocabulary; it
    /// did not reject using the vocabulary a project is invited to add.
    ///
    /// This first one is the only one of the four that both platforms
    /// have. The media query is real and Tailwind simply has no variant
    /// for it, so it was uncovered on Web as well.
    ReduceTransparency,
    /// React Native's `isBoldTextEnabled`. Native only: the Web has no
    /// media query for it, and the OS setting it reports is iOS's.
    BoldText,
    /// React Native's `isGrayscaleEnabled`. Native only.
    ///
    /// CSS's `monochrome` is not this. That asks how many bits per colour
    /// the *display* has -- an e-ink screen, a receipt printer -- and this
    /// is a person who has asked the system to drain the colour out of a
    /// full-colour one. Answering with `monochrome` would be right for
    /// almost nobody it fired for.
    Grayscale,
    /// React Native's `isScreenReaderEnabled`. Native only, and the only
    /// condition here the Web *refuses* rather than lacks.
    ///
    /// There is no media query for it and there deliberately never will
    /// be: whether assistive technology is running is a strong
    /// fingerprinting signal, and exposing it would let any page identify
    /// the people least able to avoid being identified. So the usual
    /// asymmetry inverts -- everywhere else Web has the richer vocabulary
    /// and Native is the platform that cannot answer.
    ///
    /// Rule 3 in decision 003 still decides it: a concept one platform has
    /// is better implemented there and named absent on the other than left
    /// out of both. The Web refusal message says *refuses* rather than
    /// *lacks*, because those are different facts and only one of them
    /// might change.
    ScreenReader,
}

impl Environment {
    /// The at-rule each query is, verbatim from Tailwind. In IR because two
    /// readers need the same text: the Web backend emits it, and ordering
    /// checks a captured Tailwind rule is the same query before ranking it.
    pub fn web_at_rule(self) -> &'static str {
        match self {
            Environment::MotionReduce => "@media (prefers-reduced-motion: reduce)",
            Environment::MotionSafe => "@media (prefers-reduced-motion: no-preference)",
            Environment::Portrait => "@media (orientation: portrait)",
            Environment::Landscape => "@media (orientation: landscape)",
            Environment::InvertedColors => "@media (inverted-colors: inverted)",
            Environment::ContrastMore => "@media (prefers-contrast: more)",
            Environment::ContrastLess => "@media (prefers-contrast: less)",
            Environment::ForcedColors => "@media (forced-colors: active)",
            Environment::Print => "@media print",
            Environment::Noscript => "@media (scripting: none)",
            Environment::PointerFine => "@media (pointer: fine)",
            Environment::PointerCoarse => "@media (pointer: coarse)",
            Environment::PointerNone => "@media (pointer: none)",
            Environment::AnyPointerFine => "@media (any-pointer: fine)",
            Environment::AnyPointerCoarse => "@media (any-pointer: coarse)",
            Environment::AnyPointerNone => "@media (any-pointer: none)",
            Environment::ReduceTransparency => "@media (prefers-reduced-transparency: reduce)",
            // Native only. The Web has no query for the first two and
            // refuses the third -- see `Environment` -- so they reach here
            // only if something bypassed the refusal, and an empty prelude
            // is the safe end of that: a rule with no condition applies to
            // everyone, which is worse than one that does not apply.
            Environment::BoldText | Environment::Grayscale | Environment::ScreenReader => "",
            // Selectors, handled by the caller.
            Environment::Ltr | Environment::Rtl => "",
        }
    }

    /// Whether the Web can express this at all.
    ///
    /// Three of the four React Native settings cannot be asked from CSS.
    /// The Native backend has refused Web-only queries since it existed;
    /// this is the same refusal pointing the other way, and the first time
    /// it has pointed that way at all.
    pub fn web_query(self) -> bool {
        !matches!(
            self,
            Environment::BoldText | Environment::Grayscale | Environment::ScreenReader
        )
    }

    /// Why the Web cannot answer this one.
    ///
    /// Two different facts, and the wording keeps them apart because only
    /// one of them might change. `bold-text` and `grayscale` are settings
    /// CSS has no query for -- an absence. `screen-reader` is a refusal:
    /// there is no query and there deliberately will not be one, because
    /// whether assistive technology is running is a strong fingerprinting
    /// signal and exposing it would identify exactly the people least able
    /// to avoid being identified.
    pub fn web_gap_message(self) -> String {
        match self {
            Environment::ScreenReader => "`screen-reader:` cannot work on the Web, and not \
                 because nobody has built it: there is no media query for whether a screen \
                 reader is running and the platform declines to add one, since it would be a \
                 strong fingerprinting signal against the people least able to avoid being \
                 identified. On React Native the same class works. If the intent is content \
                 for screen readers only, `sr-only` says that on both platforms."
                .to_string(),
            Environment::BoldText => "`bold-text:` reports an iOS setting, and CSS has no query \
                 for it, so the style is not applied on Web. On React Native the same class \
                 works. A `prefers-contrast` or a larger type scale is the nearest thing the \
                 Web can be asked."
                .to_string(),
            Environment::Grayscale => "`grayscale:` reports an iOS setting, and CSS has no query \
                 for it. `monochrome` is not it -- that asks how many bits of colour the \
                 *display* has, which is an e-ink screen rather than a person who has asked the \
                 system to drain the colour out of a full-colour one. On React Native the same \
                 class works."
                .to_string(),
            _ => String::new(),
        }
    }
}
