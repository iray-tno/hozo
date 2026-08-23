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
| Interaction | `hover` `focus` `focus-visible` `active`/`pressed` `disabled` `enabled` |
| Structure | `first` `last` |
| Breakpoints | `sm` `md` `lg` `xl` `2xl` |
| Colour scheme | `dark` |
| ARIA state | `aria-busy` `aria-checked` `aria-disabled` `aria-expanded` `aria-hidden` `aria-pressed` `aria-readonly` `aria-required` `aria-selected` |
| Relational | `group-…` `peer-…`, wrapping any of the above |
| Environment | `motion-safe` `motion-reduce` `portrait` `landscape` `inverted-colors` `ltr` `rtl` `contrast-more` `contrast-less` `forced-colors` `print` `noscript` |
| Arbitrary | `[&_p]:`, `[@supports…]:` |

Native compiles all of those except `peer-…`, `contrast-more`,
`contrast-less`, `forced-colors`, `print` and `noscript`, and reports each
one it cannot.

`crates/hozo_parser/src/tailwind_variants.rs` is generated from Tailwind
and holds all 83 names; the conformance suite compares 4218 single and
stacked combinations against Tailwind's own output.

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

**② Compositional.** `not-*`, `data-*`, `has-*`, `supports-*`, `min-*`,
`max-*`. `not-*` is the same recursion `group-`/`peer-` already use.
`data-[state=open]:` is the shadcn and Radix idiom and the one with real
demand.

**③ Structural.** `odd` `even` `only` `empty` `focus-within` `target`
`nth-*`. Trivial on Web; Native follows the `first:`/`last:` precedent,
which resolves statically for known children and reports otherwise.

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
would let an author select on attributes in the same namespace. They cannot
collide — `hozo-` is prefixed — but the two would sit side by side in
generated output, and a line needs drawing before `data-*` lands: whether
`data-hozo-*` is documented surface an author may select on, or an
implementation detail that happens to be visible.

**React Native settings Tailwind has no variant for.** `isBoldTextEnabled`,
`isGrayscaleEnabled`, `isReduceTransparencyEnabled`, `isScreenReaderEnabled`.
Decision 002 rejected inventing vocabulary, but Tailwind ships
`@custom-variant` precisely so projects can extend it, which makes this an
extension rather than an invention. `screen-reader:` is the interesting one
for a project with this subtitle — and it inverts the usual asymmetry,
because the Web has no media query that answers it.
