# 7. Motion is written as classes, and Native learns `starting:`

**Status:** decided — the approach, the order of slices, and (amendment 1) the exit variant's spelling
**Date:** 2026-10-04

## What #146 asked for, and what already exists

#146 proposed a `@hozo/motion` package with its own vocabulary:
`<Motion.View initial={…} animate={…} exit={…} transition={…}>`, compiling to
CSS on the Web and to the UI thread on Native, with reduced motion built in.

Much of the underlying machinery has been built since then:

| | Web | Native |
| --- | --- | --- |
| `transition-*`, `duration-*`, `delay-*`, `ease-*` | CSS | `HozoAnimated` (`packages/primitives/src/runtime-transition.native.tsx`) and the Pressable path. Opacity and transforms run on the native driver, colours on the JS driver |
| `animate-spin` / `pulse` / `bounce` / `ping` | CSS keyframes | `useHozoAnimation` (`crates/hozo_native/src/lib.rs:1076`) |
| `motion-safe:` / `motion-reduce:` | `@media (prefers-reduced-motion…)` (`crates/hozo_web/src/css.rs:1475`) | `AccessibilityInfo.isReduceMotionEnabled` (`packages/engine/src/hooks.native.ts:296`) |
| `starting:` | `@starting-style` (`crates/hozo_web/src/css.rs:1748`) | **refused** with a diagnostic (`crates/hozo_native/src/conditions.rs:673`) |
| enter / exit on mount and unmount | `starting:` covers enter | nothing |
| `Dialog`'s own open animation | keyframes, off under reduced motion (`crates/hozo_web/src/lib.rs:122`) | `Modal`'s `animationType` |

The two big gaps are enter on Native and exit anywhere.

## Decision

### 1. No second vocabulary: motion is written in Tailwind classes

Hozo's authoring surface is React Native components with Tailwind classes, and
Tailwind v4 already has words for motion:

- `transition-*` for how a change animates
- `starting:` for the value an element enters from
- `motion-safe:` and `motion-reduce:` for reduced motion

`initial`/`animate`/`exit` props would be a second way to say the same things.
Every rule would then need deciding twice: what happens when a `transition`
class and a `transition` prop disagree? And it is a vocabulary the compiler
cannot see through when the values are not literals.

So `Motion.View` as #146 sketched it is **not built**. The work is to make the
classes that exist mean the same thing on both platforms.

### 2. First slice — enter: Native implements `starting:`

The Web half already works: `transition-opacity starting:opacity-0` makes an
element fade in on mount, with no JavaScript.

On Native, `HozoAnimated` animates from the style an element *had* to the one
it *has*. On the first render those are the same, so nothing moves. The
implementation is to start `from` at the starting style instead:

- The backend stops refusing `starting:`. It compiles those declarations into a
  `hozoStarting` style passed to `HozoAnimated` alongside `hozoTransition`.
- `HozoAnimated` initialises `from` as the flattened style with `hozoStarting`
  over it, so the effect that already runs on mount animates from the starting
  value to the style.
- It only applies when there is a transition, as on the Web: `@starting-style`
  without a transition is a value nobody sees. A `starting:` class on an element
  with no `transition-*` gets the same treatment on both platforms, which is
  nothing, plus a diagnostic.
- Same properties as transitions today: opacity, transforms and colours. A
  `starting:` on anything else (width, padding) keeps a diagnostic on Native,
  per decision 003's rule 3.

This removes a refusal rather than adding API, and the same class does the same
thing on both platforms.

### 3. Second slice — exit: a presence component

An element cannot animate out after React removes it, on either platform. Exit
needs something that keeps the child mounted while it leaves:

- A `<Presence show={open}>` component (name open) keeps its child mounted
  after `show` turns false, marks it as exiting, and unmounts it when the exit
  transition ends: `transitionend` on the Web, the `Animated` completion
  callback on Native. A timeout covers a transition that never fires.
- The exiting styles are written as a class variant, so they live with the
  rest. The spelling is `data-[state=closed]:` (amendment 1).
- Hozo's own overlays (`Popover`, `BottomSheet`, `Drawer`, the date panels)
  are its first users, and the reason to build it.

### 4. Third slice — the project's own keyframes

Tailwind v4's `--animate-*` theme variables with `@keyframes`. Web: carried
through as CSS. Native: the subset `HozoAnimated` can already interpolate
(opacity, transforms, colours), compiled to an `Animated` sequence, and a
diagnostic for the rest.

### 5. Reduced motion: honoured by Hozo's components, not rewritten in authors' classes

Hozo does not silently drop an author's `translate`/`scale` transition under
reduced motion. Tailwind does not do that on the Web, and the rule here is that
a class means the same thing on both platforms. An author's way to say it is
`motion-safe:`, which already works on both.

What Hozo does instead:

- **Its own components honour reduced motion**, as `Dialog` already does on the
  Web, including everything the presence component animates.
- **A hint** (not a warning) when a `starting:` or exit
  class moves or scales an element (translate, scale, rotate) without
  `motion-safe:`/`motion-reduce:` on the same element, pointing at
  `motion-safe:`. A fade is left alone: WCAG 2.3.3's concern is motion, and a
  fade is not motion.

## Rejected

- **A props API (`Motion.View`)**, for the reasons in 1. If a case appears that
  classes cannot express, such as an animation driven by a gesture or a scroll
  position, it is a separate decision.
- **Reanimated as a backend now.** It is a native dependency, so decision
  006's gate applies, and nothing in slices 1–3 needs it. `Animated` already
  runs opacity and transforms on the native driver.
- **A JavaScript animation runtime on the Web.** The point of the Web half is
  that enter and exit cost no script.
- **Doing exit first.** It is the bigger gap, but it needs a new component and
  a variant decision, while enter needs neither. Enter also proves the
  `hozoStarting` path that exit will reuse.

## Settled in review, and what is left open

1. **Order:** enter (`starting:` on Native), then exit (presence), then the
   project's keyframes, as above.
2. **Reduced-motion diagnostic:** a hint, as above.
3. **The exit variant's spelling:** `data-[state=closed]:`, settled before
   slice 2 started. See amendment 1.

## How slice 1 will be shown to work

- `@hozo/tailwind-conformance`: a render test that `HozoAnimated` given
  `hozoStarting` begins at the starting values and reaches the style.
  `transition-restart.test.ts` is the neighbour to follow.
- The Native backend's tests: `starting:` with a transition compiles to
  `hozoStarting` with no diagnostic. Without a transition it gets a diagnostic.
  On an unsupported property it gets a diagnostic.
- A story in the native demo that fades and slides a card in, run on the
  emulator, with the Web story beside it.

## Amendment 1 — exit is written `data-[state=closed]:` (2026-10-05)

The presence component sets `data-state` on its child: `"open"` while it is
shown, `"closed"` while it leaves. Exit styles are written against that:

```tsx
<Presence show={open}>
  <View className="transition motion-safe:starting:translate-y-4 starting:opacity-0
                   data-[state=closed]:opacity-0 motion-safe:data-[state=closed]:translate-y-4">
```

Why this spelling, of the three considered:

- **It is Tailwind's own, and a convention people already write.** Radix and
  shadcn/ui set `data-state="open" | "closed"`, and their exit animations are
  `data-[state=closed]:` classes. Nothing new to learn, nothing to register.
- **StyleX can say the same thing.** StyleX 0.19 accepts conditional keys that
  start with `[`, so `opacity: { default: 1, '[data-state="closed"]': 0 }` is
  the same attribute selector. Both frontends land on the one
  `Condition::DataAttribute`, so Web and Native each need one implementation.
- **`exit:`** (a Hozo variant through `@custom-variant`) reads best beside
  `starting:`, but StyleX has no counterpart, and Hozo would have to invent a
  key there. Rejected.
- **`data-closed:`** (Headless UI's: one closed state used as both the enter
  start and the exit end) is shorter, but overlaps with `starting:`, which
  slice 1 has just shipped. Rejected.

What each platform does with it:

- **Web:** the selector as Tailwind writes it. The presence component puts
  `data-state` on its child's element and unmounts it on `transitionend`
  (or `animationend`), with a timeout.
- **Native:** there are no selectors, so `[data-state="open"]` and
  `[data-state="closed"]` are read as the presence state, which
  `HozoAnimated` gets from the presence component's context, and the
  `Animated` completion callback ends the exit. Outside a presence component
  the state is never `closed`. Any other `data-*` condition keeps its
  diagnostic on Native, as today.
- **StyleX:** the frontend learns to read `'[data-state="…"]'` keys into the
  same condition. Whether StyleX's `'@starting-style'` key produces the right
  CSS is to be checked against StyleX's own output before the frontend reads it
  as `starting:`.
- **The reduced-motion hint** (section 5) covers `data-[state=closed]:` as it
  covers `starting:`.

## When to revisit

- React Native ships CSS transitions or `@starting-style` itself. Then
  `HozoAnimated` should defer to it.
- A real need for gesture- or scroll-driven motion, which classes cannot
  express.
