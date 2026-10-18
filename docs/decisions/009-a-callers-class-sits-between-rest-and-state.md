# 9. A caller's class beats a component's resting look and loses to its state; what the build can see, it compiles

**Status:** decided
**Date:** 2026-10-19

## Why this needs writing down

A component that writes its own classes and also accepts a caller's
`className` puts two style sources on one element. Which one wins was settled
in pieces, in #881/#882, #886 and #1054. The rules now live in the compiler
README, a browser test, a Native unit test, and the comments of three crates.
Read alone, each piece looks like an arbitrary choice. The obvious "fixes"
(emit the candidate stylesheet last; let the caller win everything) have each
been proposed once already and are wrong for reasons that depend on how CSS
and React Native work. Those reasons should not have to be rediscovered.

## Decision

### 1. Three tiers, the same order on both platforms

From weakest to strongest:

| Tier | What is in it |
| --- | --- |
| The component's resting look | its unconditional classes, a className branch the source picked (`big ? 'px-6' : 'px-1'`), a breakpoint, `dark:` |
| The caller's class | the runtime `className` handed in |
| The element's state | `hover`, `pressed`/`active`, `focus`, `focus-visible`, `disabled`/`enabled`, `aria-*`, structural and form-state variants |

A caller can recolour a button. A disabled button still looks disabled,
whatever colour it was given. This is also what Tailwind gives for
`bg-red-500 disabled:bg-gray-200` on a single element, so a component split
across two authors behaves like one element written by one.

An explicit `style` is outside the tiers and wins over all of them, as an
inline style does on the Web. A caller's `style` arriving through a spread
composes after the compiled styles rather than replacing them (#1054). A
`style` the author writes after every spread still wins over the spread's
copy, as JSX's last-wins says.

### 2. Each platform gets that order from its own mechanism, not from load order

- **Web: specificity.** The component's rules sit at (0,1,0), with a branch
  selected through a weightless `:where(…)`. The caller's copy is
  `.cls:where(.hozo-candidate-owner):not(hozo-none)`, at (0,1,1).
  `:not(hozo-none)` names an element that does not exist, so it adds one type
  selector's weight and matches everything. State rules sit at (0,2,0). The
  order holds whichever stylesheet the bundler emits first.
- **Native: position in the style array.** The resting entries come first,
  then the caller's `hozoClasses(className, state)`, then the state entries.
  React Native merges a style array last-wins. Every candidate class is a
  single utility of equal weight, so array position is the whole cascade.

### 3. What the build can see, it compiles; the runtime resolver is the fallback

There are two resolution engines: ahead-of-time compilation and the
candidate resolver at run time (`docs/rfcs/style-slot-contracts.md`).

- **A literal class compiles.** That includes its state variants: `hover:` on
  a literal has static style data and only a runtime predicate. It is not an
  opaque string.
- **An opaque string goes to the resolver.** On the Web that is the candidate
  stylesheet. On Native it is `hozoClasses`, which is handed the state its
  owner already tracks (#886) rather than refusing state classes.
- **A mixed expression uses both.** Its literal pieces compile, and only the
  residual reaches the resolver, captured once during the author's render.
- **A string is never resolved before its actual owner can supply the state.**
  For a `@hozo/patterns` slot, the owner is the pattern's element, not the
  wrapper that passed the prop.
- **On Native, the resolver refuses environment conditions:** breakpoints,
  `dark:`, `group-*` and `peer-*`. A style object cannot express them, and
  supporting them would mean subscribing to the window and the colour scheme.
  That is the runtime engine this design chose not to ship. They are named
  when used, not dropped silently (`crates/hozo_native/src/candidate.rs`).

The static path is the optimisation and the resolver is the coverage. A
component must not depend on being compiled statically to get its states,
because a prebuilt package or a wrapper that forwards `className` never is.

## Rejected

- **Emit the candidate stylesheet last.** This was proposed first in #882. A
  lazily loaded chunk appends its CSS when it loads, after the candidate
  stylesheet, and dev injects styles in import order. No plugin ordering
  holds.
- **Put every fallback rule in a cascade layer.** Unlayered static CSS would
  then beat the caller outright, reversing tier 1 and tier 2.
- **Let the caller win everything.** A disabled control would stop looking
  disabled the moment a wrapper passed a colour. That breaks the Tailwind
  equivalence above and makes state invisible exactly where an application
  restyles a component.
- **Resolve everything at run time.** Native would then need the reactive
  engine with specificity sorting that `react-native-css` ships, and the Web
  would lose compiled CSS for literals.
- **Compile everything statically.** `@hozo/patterns` ships prebuilt, and a
  forwarded `className` is a string by the time it arrives. Before #886 this
  left the patterns-built `@hozo/ui` components without their look on
  device.

## Evidence

- `packages/compiler/README.md`, "Candidate stylesheet cascade": the
  specificity values and the Native array order.
- `crates/hozo_web/src/lib.rs:458-466`: the owned copy's selector.
- `crates/hozo_native/src/native_tests/conditions.rs:1659`,
  `a_callers_class_goes_after_the_resting_look_and_before_the_state`. Its
  order is base, then `md:`, then the branch, then `hozoClasses(className, …)`,
  then `disabled`.
- `examples/storybook-demo/scripts/candidate-cascade.test.mjs:4136`, "a
  caller's className beats the component's resting look and loses to its
  state". It runs in real Chrome, with the component's CSS both before and
  after the candidate stylesheet, enabled and disabled, against the actual
  Native resolver's array.
- `crates/hozo_native/src/candidate.rs:27-37`: why environment conditions are
  refused and element states are not.
- `crates/hozo_native/src/spread_style.rs` and
  `packages/engine/src/spread-styles.ts`: a spread's `style` composed after
  the compiled one (#1054).

## When to revisit

- **CSS `@scope` or an owner-aware cascade feature is usable in every
  supported browser.** The specificity arithmetic could then become a
  declared relationship.
- **React Native gains a cascade of its own,** such as specificity in style
  arrays or a CSS engine in core. The array-order argument would then need
  re-checking.
- **Tailwind changes how variants order against base utilities.** The
  equivalence in tier 1 is with Tailwind's single-element behaviour.
- **A real component needs the caller to beat a state.** That would be a
  per-slot opt-out with its own decision, not a change of the default.
