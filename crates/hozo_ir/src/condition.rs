//! The condition a declaration applies under: a variant, a breakpoint or
//! a JavaScript guard, and how each is read.

use super::*;

#[derive(Debug, Clone, PartialEq)]
pub enum Condition {
    Always,
    /// Several conditions that must all hold: `md:hover:flex`.
    ///
    /// Written order, which is also the order the atoms nest in. Tailwind
    /// nests them the same way -- `md:hover:` is a width query around a
    /// hover query and `hover:md:` is the reverse -- and while the two
    /// render identically, matching the order keeps the output the same
    /// text rather than an equivalent one.
    ///
    /// Stacked variants compiled to *nothing* before this existed:
    /// `parse_variant_prefix` took `md:` and handed `hover:bg-blue-500` to
    /// the utility parser, which doesn't know what that is. No CSS, no
    /// diagnostic, for a class people write every day. It was invisible
    /// because Tailwind's `getClassList()` enumerates utilities and not
    /// the combinations of variants in front of them, so no denominator in
    /// this repository contained one.
    All(Vec<Condition>),
    Responsive(Breakpoint),
    /// `*:` and `**:` -- the direct children, and every descendant.
    ///
    /// The mirror of `Group`/`Peer`: those move the condition onto a
    /// different element and leave the styled one where it is, and this
    /// moves the *styled* element while the condition stays. Which is why
    /// it composes with the same fold and needs no list of combinations:
    /// `hover:*:` is the children of a hovered element and `*:hover:` is
    /// the hovered children, from the order alone.
    Subtree {
        direct: bool,
    },
    /// `@sm:`, `@max-md:`, `@min-[400px]:`, and the `/name` forms of each.
    ///
    /// The same question as `Width`, asked of an ancestor rather than the
    /// window -- which is why the two are separate conditions rather than
    /// one with a flag. They resolve against different things, and on
    /// React Native they resolve through entirely different machinery: a
    /// window has one width the runtime already knows, and a container
    /// has a width only the element itself can report.
    ///
    /// The breakpoint names are Tailwind's container scale, which is not
    /// the viewport scale -- `@sm` is 24rem where `sm` is 40rem. Two
    /// scales sharing five names is a trap worth stating rather than
    /// discovering.
    Container {
        name: Option<String>,
        at_least: bool,
        value: String,
    },
    /// `min-[500px]:`, `max-md:`, `max-[40rem]:` -- a width threshold that
    /// isn't one of the five named breakpoints, or is one read from the
    /// other side.
    ///
    /// `min-<bp>:` is not here: Tailwind emits exactly what the bare
    /// breakpoint emits, so it parses to `Responsive` and the two are the
    /// same condition rather than two spellings of one.
    ///
    /// The value is carried as written rather than parsed into a number.
    /// Tailwind does not validate it either -- `max-[min-width:500px]:`
    /// compiles to `@media (width < min-width:500px)`, which is nonsense
    /// the browser drops -- and a length is a length whatever unit it is
    /// in. React Native is where it has to become a number, and that is
    /// where the failure to be one is reported.
    Width {
        at_least: bool,
        value: String,
    },
    /// Compiles straight to a real CSS pseudo-class on Web (zero runtime).
    Hover,
    Focus,
    Disabled,
    /// Tailwind's `aria-checked:`, `aria-expanded:` and the rest, holding
    /// the state name without its `aria-` prefix.
    ///
    /// On Web this is a plain attribute selector and needs nothing from
    /// the element's props: `[aria-checked="true"]` matches whatever the
    /// element actually carries, however it got there. Native has no
    /// selector engine, so there it has to be read off
    /// `accessibilityState` and become a runtime guard -- the same
    /// division `Disabled` already has.
    Aria(String),
    /// A condition about the environment the whole page is in.
    ///
    /// Grouped rather than given a variant each because they share
    /// everything that matters: none of them says anything about the
    /// element, all of them are one at-rule (or, for direction, one
    /// zero-specificity selector) on Web, and each is one subscription on
    /// Native. `Dark` predates this and is the same shape; it is left
    /// where it is because every backend already matches on it by name.
    Environment(Environment),
    /// Tailwind's `data-…:` -- an attribute selector, ready-formed.
    ///
    /// Holds the selector text (`[data-state="open"]`) rather than the
    /// name and value: the shapes Tailwind accepts include presence,
    /// equality and every other attribute operator, and re-deriving the
    /// selector from parts would be reimplementing a syntax CSS already
    /// has.
    DataAttribute(String),
    /// Tailwind's `supports-[…]:`, an `@supports` query as written.
    Supports(String),
    /// Tailwind's `has-…:` -- a condition on a *descendant*.
    ///
    /// The third relation, after `group-` (ancestor) and `peer-`
    /// (sibling), and like them it holds what the other element has to
    /// satisfy. Web only: `:has()` is a selector, and React Native has no
    /// selectors and no way for a child to hand state up.
    Has(Box<Condition>),
    /// An arbitrary selector inside `:has()`, as written: `has-[>img]:`.
    HasSelector(String),
    /// Tailwind's `not-…:` -- the inner condition, negated.
    ///
    /// Only conditions with one form. `hover:` is both a media query and
    /// a pseudo-class, so Tailwind's `not-hover:` is two rules -- the
    /// selector negated, and `@media not (hover: hover)` for a device
    /// where nothing is ever hovered. One condition producing two rules
    /// does not fit the shape the backends read, so that one is refused
    /// rather than half-answered.
    Not(Box<Condition>),
    /// Tailwind's `group-…:` -- a condition on a marked *ancestor*.
    ///
    /// Holds the inner condition rather than naming the states it can
    /// wrap, so `group-hover:`, `group-aria-checked:` and
    /// `group-first:` all come from the same rule and a variant added
    /// later is groupable the day it lands.
    ///
    /// Only conditions that produce a selector: Tailwind itself refuses
    /// `group-dark:`, because a media query around the ancestor says
    /// nothing about the descendant.
    Group(Box<Condition>),
    /// Tailwind's `peer-…:` -- the same, on a marked *preceding sibling*.
    ///
    /// Web only. A sibling relationship is a selector, and React Native
    /// has no selectors; a parent can hand state down through context and
    /// a sibling has nowhere to hand it.
    Peer(Box<Condition>),
    /// Tailwind's `enabled:`, the inverse of `Disabled`.
    ///
    /// Not `:enabled`, for the same reason `Disabled` is not `:disabled`:
    /// that pseudo-class matches form controls, and most of what Hozo
    /// emits is a `<div>`. It is the negation of the same attribute, so
    /// the two answers cannot disagree about what disabled means.
    Enabled,
    /// Tailwind's `pressed:` variant. Originally assumed this needed
    /// synthesized JS-tracked state (no CSS `:active` equivalent matches
    /// RN's touch semantics) and so should desugar into `Expr` -- wrong on
    /// both counts: Web has a perfectly good `:active` pseudo-class for
    /// this (same free-CSS treatment as Hover/Focus/Disabled), and RN's
    /// `Pressable` already tracks pressed state natively via its
    /// `style={({pressed}) => ...}` render-prop form. Neither platform
    /// needs anything synthesized; each just needs a different, still
    /// zero-extra-runtime, lowering.
    Pressed,
    /// `dark:`. Tailwind v4's default strategy is the
    /// `prefers-color-scheme` media query rather than a `.dark` class, and
    /// React Native's `useColorScheme()` reports the same OS-level
    /// preference -- so the two agree on meaning even though only Web can
    /// express it as a style condition.
    Dark,
    /// `first:`. A structural position, which only the DOM can match on
    /// its own; React Native has no selector engine. But Hozo sees the
    /// whole JSX tree, so Native resolves it at compile time -- and says
    /// so when it can't, which is whenever a `Child::Verbatim` sits
    /// before this element and may render nothing or a hundred.
    FirstChild,
    /// `last:`. The same question from the other end, resolved the same
    /// way and undecidable under the same condition.
    LastChild,
    /// `only:`, `empty:`, `odd:`, `even:`, `nth-3:`, `nth-[2n+1]:` and the
    /// `-last-` and `-of-type` spellings of those.
    ///
    /// One variant rather than eight, because every one of them is the same
    /// thing: a pseudo-class about where this element sits among its
    /// siblings, with no runtime state behind it. `FirstChild` and
    /// `LastChild` predate it and are the same idea; they stayed separate
    /// because renaming them touches every backend and buys nothing.
    Structural(Structural),
    /// `required:`, `invalid:`, `read-only:`, `placeholder-shown:` and
    /// the rest of the form-control pseudo-classes.
    ///
    /// These are the ones rule 2 in decision 003 was written about, and
    /// they are compiled rather than refused because Hozo's `TextInput`
    /// really is an `<input>`. On anything else they can never match, and
    /// that is diagnosed where the class is read rather than left to be
    /// discovered.
    FormState(FormState),
    /// `before:`, `after:`, `placeholder:`, `marker:` and the rest.
    ///
    /// A pseudo-element is not a state of the element but a box the
    /// browser makes beside it, which is why React Native has nothing
    /// resembling one: its styles are objects handed to components, and
    /// there is no component to hand these to.
    PseudoElement(PseudoElement),
    /// `focus-within:`. Grouped with `Focus` rather than with the
    /// structural pseudo-classes despite reading like one: it is a state
    /// that changes while the page is being used, and the DOM is what
    /// tracks it.
    FocusWithin,
    /// `target:`. The element whose `id` matches the document's URL
    /// fragment.
    ///
    /// The only condition here that is about the *document* rather than the
    /// element or its environment, which is also why React Native has
    /// nothing resembling it: there is no address bar to disagree with.
    Target,
    /// `open:`. An open `<details>`, `<dialog>` or popover, matched the
    /// way Tailwind matches it: `[open]`, `:popover-open` or `:open`.
    ///
    /// A state of the element the browser keeps, so Web needs nothing from
    /// its props. Compiling it is what lets `group-open:` and `peer-open:`
    /// beat a compiled base: left to Tailwind, the variant sits in a layer
    /// and an unlayered `hidden` beside it always wins (#1692).
    ///
    /// Native has no attribute to read. `Details` tracks its open state
    /// itself and hands it to nobody, so there this is refused until it does.
    Open,
    /// `checked:`, `indeterminate:` and `default:`. A checkbox, radio or
    /// option's state, matched by Tailwind's own selector.
    ///
    /// Compiled for the reason `Open` is (#1752): no primitive becomes a
    /// checkbox, but `group-checked:` and `peer-checked:` read an element
    /// that may be one, and left to Tailwind they sat in a layer where any
    /// compiled base beside them won.
    Control(ControlState),
    /// `inert:`. Tailwind's `:is([inert], [inert] *)`: the element, or an
    /// ancestor, carries the `inert` attribute.
    ///
    /// No primitive writes `inert`, but the page around Hozo's elements
    /// can, so the ancestor half can match. Compiled for the reason `Open`
    /// is (#1777): left to Tailwind it sat in a layer, where any compiled
    /// base beside it won.
    ///
    /// Native has no `inert` and reports it as not wired.
    Inert,
    /// Tailwind's `in-…:`. The `group-…:` relation without the marker:
    /// any ancestor in the inner state, as `:where(*:hover) &`.
    ///
    /// Web only, like `Peer`. Native hands state down from a `group` it
    /// can find; an unmarked ancestor is any ancestor at all, and there is
    /// nothing to hand it.
    In(Box<Condition>),
    /// `visited:`. A link the user has been to before.
    ///
    /// The one condition whose *declarations* the browser censors. History
    /// is private, and a page that could read a `:visited` style back --
    /// through `getComputedStyle`, through layout, through anything
    /// observable -- could read the user's history. So engines apply a
    /// short list of colour properties and silently drop everything else,
    /// and paint even those with the alpha channel forced opaque.
    ///
    /// Hozo emits what Tailwind emits, including for the properties that
    /// will be dropped, and says so at compile time instead: see
    /// `StyleProperty::survives_visited`.
    ///
    /// React Native has no history, no links to have been to, and nothing
    /// to censor.
    Visited,
    /// `starting:` -- `@starting-style`, the value a property has for the
    /// first frame so a transition has somewhere to start.
    ///
    /// Ambient by the only test that matters to a backend: it is an
    /// at-rule around the rule rather than a condition on the selector.
    /// It is not a *query*, though, and that difference is why
    /// `not-starting:`, `has-starting:`, `group-starting:` and
    /// `peer-starting:` are all refused -- Tailwind emits nothing for any
    /// of them. There is no state to test for the absence of and no
    /// element to test it on; `@starting-style` describes a moment in the
    /// rendering process, and the only thing that can be said about that
    /// moment is what the value is during it.
    ///
    /// React Native transitions through `Animated`/Reanimated with an
    /// explicit starting value, which is the author's to write; there is
    /// no declarative first frame for this to lower to.
    StartingStyle,
    /// `focus-visible:`. Distinct from `Focus` and not a nicety: it is the
    /// one that doesn't put a ring around a button someone clicked, which
    /// is why it exists at all.
    FocusVisible,
    /// `[&>*]:p-4`, `[&_a]:underline`, `[&:nth-child(3)]:font-bold`. The
    /// selector as written, with `&` still standing for the element.
    ///
    /// Web substitutes the generated class for `&` and emits the result.
    /// Nothing is validated: a selector Hozo doesn't understand is one
    /// the browser might, and the author asked for it by name.
    ///
    /// Native refuses all of these, and not for want of effort -- React
    /// Native has no selector engine at all. `[&>*]` asks a question about
    /// the rendered tree that only a matching engine can answer, and there
    /// isn't one on the other side.
    ArbitrarySelector(String),
    /// `[@media(print)]:hidden`, `[@supports(display:grid)]:grid`. The
    /// at-rule prelude as written, `@` included.
    ///
    /// Kept apart from `ArbitrarySelector` because the lowering differs in
    /// kind: a selector rewrites the rule's head, an at-rule wraps the
    /// whole rule in a block. Folding them together would mean deciding
    /// which one this is by looking for a leading `@` at emit time, in the
    /// one place that has the least context for it.
    ArbitraryAtRule(String),
    /// Arbitrary structurally-dynamic condition (proposal §7): a prop,
    /// local variable, or `useState` value used as a guard.
    Expr(ConditionExpr),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Breakpoint {
    Sm,
    Md,
    Lg,
    Xl,
    Xl2,
}

/// A condition's leaves are opaque source references, not parsed
/// identifiers/comparisons: the compiler never evaluates a condition, it
/// only needs to know where one guard ends and the next begins so it can
/// re-emit the expression verbatim in generated output.
#[derive(Debug, Clone, PartialEq)]
pub enum ConditionExpr {
    /// A JSX boolean shorthand such as `<Button disabled />` has no source
    /// expression span to preserve, but is still a real constant guard.
    Static(bool),
    Ref(ExprRef),
    /// A compiler-owned boolean fact, not an authored class expression.
    /// Opaque optional state is absent unless its disabled member is true.
    StateDisabled(ExprRef),
    /// An authored class predicate evaluated once in its original branch.
    /// `reference` still keys Web's guard class; the value is closure-bound.
    Captured(Box<ClassPredicateCapture>),
    /// True when a runtime class string contains a token conflicting with a
    /// compiled `tailwind-merge` conflict group (#1676).
    ClassConflict(Box<ClassConflictGuard>),
    Not(Box<ConditionExpr>),
    And(Box<ConditionExpr>, Box<ConditionExpr>),
    Or(Box<ConditionExpr>, Box<ConditionExpr>),
}

impl Condition {
    /// Selector weight in the bounded owner-interaction domain. Expression
    /// guards are emitted with :where, so they add no CSS specificity.
    /// Unknown is not zero: callers must retain its existing cascade.
    pub fn owner_interaction_specificity(&self) -> Option<u16> {
        match self {
            Self::Always | Self::Expr(_) => Some(0),
            Self::Hover | Self::Focus | Self::FocusVisible | Self::Pressed => Some(1),
            Self::All(conditions) if !conditions.is_empty() => {
                conditions.iter().try_fold(0_u16, |weight, condition| {
                    weight.checked_add(condition.owner_interaction_specificity()?)
                })
            }
            _ => None,
        }
    }

    /// Whether this condition is expressed as a *selector* rather than as
    /// a query around one.
    ///
    /// Which is what decides whether `group-` and `peer-` can relate it
    /// to another element: relating means moving the condition onto a
    /// different subject, and only a selector has a subject to move. A
    /// media query wraps the rule and names nobody.
    ///
    /// Read as "is it about the element" first, which is nearly the same
    /// answer and wrong in one place: text direction is inherited, so
    /// `ltr:` is about the environment *and* is a selector -- and
    /// Tailwind does allow `group-rtl:`, an ancestor in a right-to-left
    /// subtree, while refusing `group-motion-reduce:`. Checked against it
    /// rather than reasoned about, which is how the criterion turned out
    /// to be the form and not the subject.
    /// Whether this condition is expressed as an at-rule *around* the
    /// rule, rather than as part of its selector.
    ///
    /// Not the complement of `is_elemental`, and the one place they
    /// overlap is the interesting one: `hover:` is both, because a
    /// pointer that can hover is an environment fact and being hovered is
    /// an element fact. Everything else is one or the other.
    pub fn is_ambient(&self) -> bool {
        match self {
            Condition::Dark
            | Condition::Responsive(_)
            | Condition::Width { .. }
            | Condition::Container { .. }
            | Condition::ArbitraryAtRule(_) => true,
            // An at-rule around the rule, so ambient by the test that
            // decides what a backend has to do with it -- though not a
            // query, which is what `is_queryable` is for.
            Condition::StartingStyle => true,
            // The one condition that is both.
            Condition::Hover => true,
            Condition::Environment(query) => !matches!(query, Environment::Ltr | Environment::Rtl),
            // A relation carries its inner condition's at-rules through.
            Condition::Group(inner)
            | Condition::Peer(inner)
            | Condition::In(inner)
            | Condition::Not(inner) => inner.is_ambient(),
            Condition::All(conditions) => conditions.iter().any(Condition::is_ambient),
            Condition::Supports(_) => true,
            // `has-hover:` carries the media query the hover it wraps has.
            Condition::Has(inner) => inner.is_ambient(),
            _ => false,
        }
    }

    /// Whether this condition already asks about the colour scheme, at any
    /// depth.
    ///
    /// Two backends need the same answer twice over, which is why it lives
    /// here rather than in either of them. A rule that only applies in dark
    /// mode resolves its colours against the dark palette, and a rule that
    /// already says `dark:` must not be given a dark copy -- the copy would
    /// repeat it and win on a tie. `dark:hover:` is both of those and is not
    /// `Condition::Dark`, so an equality check answers no to a condition that
    /// mentions nothing else.
    pub fn mentions_dark(&self) -> bool {
        match self {
            Condition::Dark => true,
            Condition::All(conditions) => conditions.iter().any(Condition::mentions_dark),
            Condition::Group(inner)
            | Condition::Peer(inner)
            | Condition::In(inner)
            | Condition::Has(inner) => inner.mentions_dark(),
            _ => false,
        }
    }

    /// This condition, and dark mode as well.
    ///
    /// What a paired token's second rule is conditional on: everything the
    /// first one was, plus the colour scheme. Replacing the condition instead
    /// of extending it is the bug this exists to prevent -- a dark copy of
    /// `hover:bg-hozo-surface-hover` that dropped the `:hover` painted the
    /// hover colour on every element carrying the class, in the dark, always.
    ///
    /// Flattened rather than nested, because a chain is read as a flat list
    /// of atoms -- `pseudo_element()` and the Web's `content` insertion both
    /// walk `All` one level deep -- and `md:hover:` is already one.
    pub fn and_dark(&self) -> Condition {
        match self {
            Condition::Always => Condition::Dark,
            Condition::All(conditions) => {
                let mut chain = conditions.clone();
                chain.push(Condition::Dark);
                Condition::All(chain)
            }
            other => Condition::All(vec![other.clone(), Condition::Dark]),
        }
    }

    /// The pseudo-element this condition targets, if it targets one.
    ///
    /// Looks through the wrappers, because `hover:before:` still writes
    /// into a `::before` and still needs its `content`.
    pub fn pseudo_element(&self) -> Option<PseudoElement> {
        match self {
            Condition::PseudoElement(pseudo) => Some(*pseudo),
            Condition::All(conditions) => conditions.iter().find_map(Condition::pseudo_element),
            _ => None,
        }
    }

    /// Splits a condition at its subtree marker.
    ///
    /// Returns what qualifies the *parent*, what qualifies the *child*,
    /// and which of the two markers it was. `None` when there is no
    /// marker, which is nearly every condition.
    ///
    /// The split matters only off the Web. A selector says which element
    /// each half is about -- `:is(.x:hover > *)` and `:is(.x > *):hover`
    /// are different rules. Handing the style down to the children loses
    /// that, so a backend without selectors has to know which half it is
    /// holding.
    pub fn split_subtree(&self) -> Option<(Vec<Condition>, Vec<Condition>, bool)> {
        match self {
            Condition::Subtree { direct } => Some((Vec::new(), Vec::new(), *direct)),
            Condition::All(conditions) => {
                let at = conditions
                    .iter()
                    .position(|c| matches!(c, Condition::Subtree { .. }))?;
                let direct = matches!(conditions[at], Condition::Subtree { direct: true });
                Some((
                    conditions[..at].to_vec(),
                    conditions[at + 1..].to_vec(),
                    direct,
                ))
            }
            _ => None,
        }
    }

    /// One condition from a list, as the backends want it.
    pub fn all(mut conditions: Vec<Condition>) -> Condition {
        match conditions.len() {
            0 => Condition::Always,
            1 => conditions.pop().expect("length checked"),
            _ => Condition::All(conditions),
        }
    }

    /// Whether `not-` can negate this condition.
    ///
    /// Everything with a form to negate, which is everything except
    /// `Always`. It used to exclude a condition that is *both* a query and
    /// a selector -- `hover:` and nothing else -- because negating both is
    /// two rules and `condition_shape` returned one. That was a limit of
    /// the backend rather than a fact about the variant, and the backend
    /// returns a list now.
    pub fn is_negatable(&self) -> bool {
        self.is_queryable() || self.is_elemental()
    }

    /// Whether `:visited` appears anywhere in this condition.
    ///
    /// Anywhere, because the browser's restriction is on the *rule*, not
    /// on the element: a selector that mentions `:visited` at all has its
    /// declarations filtered, and that includes the ones that mention it
    /// on some other element. `group-visited:p-4` styles a descendant of a
    /// visited link and is filtered just the same, and so is
    /// `not-visited:p-4` -- if the negation were unrestricted, the two
    /// halves could be compared and the history read back out of the
    /// difference.
    /// The `data-hozo-*` attribute this condition selects on, if any.
    ///
    /// Those are Hozo's own working state rather than an interface. What
    /// settles it is not a preference: the namespace contained
    /// `data-hozo-cond-142-197` (a class, `hozo-cond-*`, since #883), whose
    /// name is a pair of byte offsets into the source file, so adding a
    /// blank line above the element renames it. A namespace holding something that cannot be depended on is not
    /// one anything should be depended on from.
    ///
    /// And nothing is lost by saying so. Every state an author could want
    /// is reachable through a variant that compiles to the *identical*
    /// selector -- `disabled:` and `data-[hozo-disabled]:` are the same
    /// `.hozo-0[data-hozo-disabled]` -- so the migration for anyone who
    /// used the attribute is one token.
    pub fn hozo_private_attribute(&self) -> Option<&str> {
        match self {
            Condition::DataAttribute(selector) => selector
                .strip_prefix("[data-")
                .and_then(|rest| rest.split(['=', ']']).next())
                .filter(|name| name.starts_with("hozo-")),
            Condition::All(conditions) => conditions
                .iter()
                .find_map(Condition::hozo_private_attribute),
            Condition::Not(inner)
            | Condition::Group(inner)
            | Condition::Peer(inner)
            | Condition::In(inner)
            | Condition::Has(inner) => inner.hozo_private_attribute(),
            _ => None,
        }
    }

    pub fn contains_visited(&self) -> bool {
        match self {
            Condition::Visited => true,
            Condition::All(conditions) => conditions.iter().any(Condition::contains_visited),
            Condition::Not(inner)
            | Condition::Group(inner)
            | Condition::Peer(inner)
            | Condition::In(inner)
            | Condition::Has(inner) => inner.contains_visited(),
            _ => false,
        }
    }

    /// Whether this is a *question* -- something that can be true or false
    /// of an element or its environment.
    ///
    /// Every ambient condition except one. `@starting-style` is the
    /// exception: it is an at-rule, so it is ambient, but it asks nothing.
    /// Negating it, or putting it inside `:has()`, would have to mean
    /// "when the element is *not* being rendered for the first frame",
    /// which is every other frame -- the unprefixed utility. Tailwind
    /// emits nothing for `not-starting:` or `has-starting:` and this is
    /// how that refusal is spelled here.
    pub fn is_queryable(&self) -> bool {
        !matches!(self, Condition::StartingStyle) && self.is_ambient()
    }

    pub fn is_elemental(&self) -> bool {
        match self {
            Condition::Always
            | Condition::StartingStyle
            | Condition::Dark
            | Condition::Responsive(_)
            | Condition::Width { .. }
            | Condition::Container { .. }
            | Condition::ArbitraryAtRule(_) => false,
            Condition::Environment(query) => {
                matches!(query, Environment::Ltr | Environment::Rtl)
            }
            // Negating a selector is a selector; negating a query is a
            // query. So this follows whatever it wraps.
            Condition::Not(inner) => inner.is_elemental(),
            Condition::Supports(_) => false,
            Condition::Has(inner) => inner.is_elemental(),
            // A pseudo-element is a box, not a condition on one, so there
            // is nothing to move onto an ancestor -- Tailwind refuses
            // `group-marker:` for the same reason.
            Condition::PseudoElement(_) => false,
            _ => true,
        }
    }
}
