# 3. Which Tailwind variants Hozo compiles

**Status:** rules settled, coverage in progress
**Date:** 2026-08-24

## Three rules

They were arrived at one variant at a time and are worth stating together,
because each was learned by getting something wrong first.

**1. Carry what you cannot compile, and say which kind it is.**

An unrecognised class used to be deleted from the element — a project's own
`my-card`, and Tailwind's `group` and `peer`, which carry no styles and
exist to be selected against. Everything is carried now. But carried is not
working, so a class whose variant *Tailwind* defines and Hozo does not is
reported, while a class that was never Tailwind's gets nothing. Telling
those apart is what `scripts/generate-tailwind-variants.mjs` is for.

Implementing a variant is then what removes its diagnostic, rather than
someone remembering to edit a list.

**2. Do not implement a variant whose selector cannot match what Hozo
emits.**

`open:` and `checked:` are real Tailwind and deliberately unimplemented.
They compile to `:open` and `:checked`, which match a `<details>` and a
form control; `Dialog` becomes a component and no primitive is a checkbox
input. A faithful implementation would generate CSS that can never apply,
which is exactly what `disabled:` was before decision 001. Between a
diagnostic that says "not compiled yet" and a rule that silently matches
nothing, the diagnostic is the more useful answer — and the trap is worse
here than in plain Tailwind, because Hozo's audience writes
`<Pressable accessibilityRole="checkbox">` rather than `<input>`.

**3. A concept one platform has is better implemented there and named
absent on the other than left out of both.**

`peer-…:` is a sibling selector and React Native has no selectors. `print:`
means nothing on a device. Both compile for Web and are reported on Native.
The alternative — refusing to compile them anywhere — makes Hozo worse at
Web to no one's benefit.

## What is compiled today

| | |
| --- | --- |
| Interaction | `hover` `focus` `focus-visible` `focus-within` `active`/`pressed` `disabled` `enabled` |
| Structure | `first` `last` `only` `empty` `odd` `even` `nth-*` `nth-last-*` and the `-of-type` spellings of all of these |
| Breakpoints | `sm` `md` `lg` `xl` `2xl` |
| Colour scheme | `dark` |
| ARIA state | `aria-busy` `aria-checked` `aria-disabled` `aria-expanded` `aria-hidden` `aria-pressed` `aria-readonly` `aria-required` `aria-selected` |
| Relational | `group-…` `peer-…` `has-…`, wrapping any of the above |
| Environment | `motion-safe` `motion-reduce` `portrait` `landscape` `inverted-colors` `ltr` `rtl` `contrast-more` `contrast-less` `forced-colors` `print` `noscript` |
| Compositional | `not-…` `data-…` `supports-…` |
| Document | `target` |
| Arbitrary | `[&_p]:`, `[@supports…]:` |

Native compiles all of those except `peer-…`, `has-…`, `not-…`, `data-…`,
`supports-…`, `focus-within`, `target`, the `-of-type` family,
`contrast-more`, `contrast-less`, `forced-colors`, `print` and
`noscript`, and reports each one it cannot.

The structural family is where the two platforms differ most interestingly.
React Native has no selector engine, so `:nth-child()` cannot be asked at
runtime — but a sibling position is a fact about the JSX tree, and the
compiler is reading that tree. So Native answers the question earlier
instead of never, and `odd:bg-…` — one class on Web and a manual index
check in React Native — works on both. It reports rather than guesses
wherever the tree does not say: a `{items.map(…)}` sibling may render
nothing or a hundred elements.

The `-of-type` spellings are the exception, and were nearly refused
outright. `:nth-of-type` counts only siblings sharing this element's tag,
and in a Hozo tree that tag is Hozo's choice rather than the author's.
They compile on Web anyway: the selector does match, Hozo's tag choice is
documented behaviour, and rule 2 is about selectors that *cannot* match
rather than ones whose meaning has a dependency. On Native they are named
absent, because there the tag was never chosen at all.

`crates/hozo_parser/src/tailwind_variants.rs` is generated from Tailwind
and holds all 83 names; the conformance suite compares 8586 single and
stacked combinations against Tailwind's own output.

One variant is refused rather than unbuilt. `not-hover:` is two rules in
Tailwind — the selector negated, and `@media not (hover: hover)` for a
device where nothing is ever hovered — and one condition returning two
rules does not fit the shape the backends read. Named, rather than
answered with the half that fits.

## A class whose variant is not compiled must not be read as a utility

Its own rule, because it was got wrong and the way it failed is the
reason the first rule above is worded as it is.

An unrecognised variant leaves its own text in front of the utility.
Handing the whole token to the utility parser lets that text be read as a
*value*: `placeholder-shown:bg-blue-500` matched the placeholder-colour
family with `shown:bg-blue-500` as the colour, and emitted a rule for a
pseudo-element nobody asked about, naming a custom property whose name
contains a colon.

No diagnostic fired, because a diagnostic is what happens when a class
produces nothing — and this produced something. So "carry what you cannot
compile" needs a companion: **know that you cannot compile it before the
utility parser gets a chance to disagree.** The test is a colon left at
the top level once every variant Hozo knows has been stripped, in
`tailwind::has_unstripped_variant`, and both the `className` path and the
project-wide scan ask it.

## What "relatable" means, and how it was got wrong

`group-` and `peer-` wrap whatever variant follows, by recursion rather
than by a list of combinations. Which variants can be wrapped is decided by
`Condition::is_elemental`, and that was first written as *"is this about
the element rather than the environment"*.

Nearly right. Tailwind allows `group-rtl:` and refuses
`group-motion-reduce:`, because text direction is **inherited** — an
ancestor can be in a right-to-left subtree while this element is not. So
the criterion is the form and not the subject: relating means moving a
condition onto a different subject, and only a selector has one to move. A
media query wraps the rule and names nobody.

Found by asking Tailwind rather than by reasoning, which is the pattern for
everything in this file.

## Planned, in order

**② Compositional.** Done, except `min-*` and `max-*`.

**④ Form state, in part.** Hozo's `TextInput` is a real `<input>`, so
`required:`, `invalid:`, `read-only:` and `placeholder-shown:` can match
what Hozo emits. `checked:`, `indeterminate:` and `default:` cannot, and
stay refused under rule 2.

**⑤ Pseudo-elements.** `before` `after` `placeholder` `selection`
`marker`. Web only, and `before:`/`after:` need `content` handling.

Container queries (`@min-*`, `*`, `**`) are a separate feature, not a
variant to add.

## Open

**`contrast-more:` and `contrast-less:` on Native.** Compiled for Web,
reported on Native. React Native's nearest reads are Android's
`isHighTextContrastEnabled` and iOS's `isDarkerSystemColorsEnabled`, and
neither is `prefers-contrast`: the first is about text specifically, the
second about system chrome, and both are one platform only. Answering with
either would be worse than saying nothing — but "worse than nothing" is a
judgement, not a measurement, and it is worth revisiting with a device in
hand. The question to answer there is whether a user who turns on Android's
high-contrast text expects a `contrast-more:` class to fire.

**`data-*` and Hozo's own attributes.** Hozo emits `data-hozo-disabled`,
`data-hozo-cond-*`, `data-hozo-pointer-events` and more, and `data-[…]:`
now lets an author select on attributes in the same namespace. They cannot
collide — `hozo-` is prefixed — but the two sit side by side in generated
output, and nothing yet says which of them an author may rely on.

The working answer is that `data-hozo-*` is Hozo's, not a stable
interface: `data-hozo-disabled` exists because `:disabled` cannot match a
`<div>` (decision 001), and if that stops being true the attribute should
be free to go. `group-data-[hozo-disabled]:` would work today and would
break on a release that changed its mind.

Working, not settled, because the argument against is real: an attribute
that appears in shipped HTML is observable whatever the documentation
says, and telling people not to use the thing they can see is a position
that needs a migration story behind it. What would settle it is one
concrete case of someone needing to select on Hozo's own state and having
no other way to ask.

**React Native settings Tailwind has no variant for.** `isBoldTextEnabled`,
`isGrayscaleEnabled`, `isReduceTransparencyEnabled`, `isScreenReaderEnabled`.
Decision 002 rejected inventing vocabulary, but Tailwind ships
`@custom-variant` precisely so projects can extend it, which makes this an
extension rather than an invention. `screen-reader:` is the interesting one
for a project with this subtitle — and it inverts the usual asymmetry,
because the Web has no media query that answers it.
