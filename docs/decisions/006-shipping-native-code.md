# 6. Hozo may ship native code, in one optional package, behind a registered provider

**Status:** decided, amended twice on 2026-10-02 after measuring the first capability
**Date:** 2026-10-02

## Decision

Hozo ships native code, under three constraints that are the decision rather than
an implementation note:

1. **In `@hozo/native` and nowhere else.** No package an application installs to
   compile a `className` gains a native dependency. `@hozo/core`,
   `@hozo/primitives`, `@hozo/patterns`, `@hozo/form`, `@hozo/behaviors` and
   `@hozo/engine` stay installable without a Gradle or CocoaPods build.
2. **Handed in by the application, never imported by a library.** The consuming
   module keeps a registered provider and falls back to what it does today when
   nothing has been registered. Amended from "resolved provider" — see
   **Amendment 1**.
3. **A capability is admitted only when all four of the gate below hold, with
   evidence rather than expectation.** **No capability is admitted.**
   [#491](https://github.com/iray-tno/hozo/issues/491) was, and measurement
   withdrew it — see **Amendment 2**. So `@hozo/native` does not exist yet, and
   the first thing to pass the gate creates it.

**The pre-condition in [#353](https://github.com/iray-tno/hozo/issues/353) and
#491 — "whether before #8" — is already satisfied.** #8, running the release job
for real, closed on 2026-09-15. It is no longer a reason to wait, and leaving it
written as one would have the two issues gating on something that had already
happened.

## Amendment 1: a `require` is not optional under Metro

`safe-area.native.ts` reaches its optional package with
`try { require('react-native-safe-area-context') } catch {}`, and the first build
of #491 copied it. It cannot work. **Metro resolves `require` at bundle time**: a
literal `require` of a package that is not installed is a build failure, and the
`catch` runs at runtime, which the bundler never reaches.

Safe areas get away with it for a reason that does not transfer. That module is
only in the module graph when the compiler emitted a safe-area class — "a project
that writes none never imports it" is its own comment — so the unresolvable
`require` sits behind a conditional *graph edge*. An accessibility-focus module is
in the graph of every application that renders a `Dialog`. A `require` there would
have made the optional package mandatory and broken every existing application on
upgrade, which is the exact opposite of constraint 1.

So the mechanism is **registration**: the application calls a setter beside its
root component, and the optional package is in that application's module graph and
in nobody else's. The setter accepts `undefined`, which is what such an export is
on a platform it does not help and when the module is missing from the binary, so
the call needs no condition around it.

`safe-area.native.ts` is left alone. Its arrangement is still correct *for it*, and
changing a working module to match a rule it predates would be the kind of tidying
this directory exists to prevent. What is no longer true is that it is the shape to
copy: copy it only when the module is conditionally in the graph.

This amendment stands whatever happens to any particular capability.

## Amendment 2: #491 was measured, and it makes `Dialog` worse

The capability was admitted on the expectation that performing
`ACTION_ACCESSIBILITY_FOCUS` would fix what `sendAccessibilityEvent` does not. It
was built, and every part of the machinery did its job: autolinking and codegen
ran, the APK built, the JavaScript reached the module in all fifteen dismissals of
one diagnostic, and Android **accepted every action** —
`performAccessibilityAction` returned true with zero refusals.

Then the comparison, through `native.yml`'s dispatch inputs
(`dialog_rounds=5`, `dialog_boots=[1,2,3]`), same week and same runner image, with
one independent emulator boot per row because that is the sampling unit the
harness's own note names:

| arm | boots | focus returned |
| --- | --- | --- |
| **control** — no module | 4/5, 3/5, 4/5 | **11 of 15 (73%)** |
| treatment — the action | 1/5, 3/5, 5/5 | 9 of 15 |
| treatment — the action | 0/5, 1/5, 1/5 | 2 of 15 |
| treatment — the action, with a refusal fallback that never fired | 2/5, 2/5 | 4 of 10 |
| **treatment total** | 8 usable boots | **15 of 40 (37.5%)** |

**So the action is a regression, not a fix.** The reading that fits: the event is a
*hint* that TalkBack's own post-window-change restore consumes and acts on, and the
action forcibly sets accessibility focus while the window is still settling — after
which TalkBack places its cursor from a state we disturbed, and lands worse than if
nothing had been said.

Two findings that outlast the capability:

- **Today's baseline is 73%, not "about half".** #484 recorded 4/9 and 8/9. On this
  emulator image, with the 250 ms delay `dialog.native.tsx` already carries, it is
  11 of 15 — so the gate's "already paid for" test was partly resting on a number
  that no longer holds, and `dialog.native.tsx`'s empirical delay is doing more
  work than #491 credited it with.
- **A five-round run cannot settle a question this size.** Two runs of an identical
  build returned 9/15 and 2/15. Any future comparison here needs its control arm in
  the same conditions; three of these four runs lacked one, and that is why the
  regression took four runs to see rather than one.

What this does **not** change: the gate, the costs, the four capabilities it says
no to, or Amendment 1. What it changes is that the gate must be passed by
measurement, and that a capability which is *unreachable from JavaScript* can still
be the wrong thing to build — being impossible to do in JavaScript is not evidence
that doing it helps.

## The gate

A capability may be built as native code when **all four** hold. Three of the four
are about the fallback, because that is what decides whether absence is a
degradation or a defect:

| | |
| --- | --- |
| **Unreachable from JavaScript** | not slow, not awkward — traced to an API that is not exposed |
| **Already paid for** | the absence has cost shipped behaviour more than once, not once |
| **Falls back to today's behaviour, and beats it** | not to a wrong answer, not to a throw, and measured against a control arm |
| **Verifiable by machinery that exists** | not by a harness that would have to be built first |

The third is the one that does the most work, and it now has two halves because
only one of them was there the first time.

Its original half is about absence, and safe areas are why it is worded that way:
`safe-area.native.ts` falls back to zeros, which is a wrong answer rendered
confidently — a screen that looks fine on the reviewer's device and puts a button
under the notch on someone else's. A capability whose fallback lies is one whose
provider is not optional in practice, whatever the package graph says.

The half added by Amendment 2 is about presence: **the capability has to be better
than the fallback, shown by a control arm measured in the same conditions.** That
sounds too obvious to write down, and #491 passed the first half, read as obviously
true, and was a regression. An unreachable API is evidence that JavaScript cannot
do a thing. It is not evidence that doing it helps.

The fourth is already met for anything accessibility-shaped and would not be for,
say, a font-registration capability: `.github/workflows/native.yml` builds release
APKs, boots an emulator, drives TalkBack and reads the tree
(`native.yml:139`, `:262`, `:329`), and
`examples/native-demo/scripts/android-talkback.sh:338` already takes
`DIALOG_ROUNDS` and counts how many dismissals returned focus. #297 built that to
answer a different question; it is the instrument this needs.

## Why #491 looked like the first, and which test it actually failed

Kept rather than deleted, because the reasoning was sound on three of the four and
the one it got wrong is the one worth recognising next time.

It read as the only capability passing all four. **It failed the third**, and not
in the way that test was written to catch: the fallback is not merely as good as
the capability, it is *better*. "Falls back to today's behaviour" was meant to
stop a capability whose absence is a defect; it turns out to be just as important
as a check on whether the capability beats the fallback at all, which only a
control arm can say.

- **Unreachable.** #491 traces the JavaScript path through the React Native 0.87
  copy on disk, on the Fabric architecture actually running, and it ends at
  `View.sendAccessibilityEvent(TYPE_VIEW_FOCUSED)` — an event. The thing that
  moves accessibility focus is
  `AccessibilityNodeInfo.ACTION_ACCESSIBILITY_FOCUS`, and nothing under
  `Libraries/` exposes it. That is a dead end rather than a difficulty.
- **Already paid for, three times.** `packages/patterns/src/dialog.native.tsx`
  carries a 250 ms delay whose only justification is a twelve-round emulator
  sweep — failing through 175 ms, passing from 200 ms — which #491 rejects in the
  same breath as "a guess wearing a measurement's clothes".
  [#484](https://github.com/iray-tno/hozo/issues/484) is the intermittent failure
  that delay does not fix. And `Form`'s `focusInvalidOnSubmit` is inert on React
  Native for exactly this reason, which is written into
  `packages/form/src/form.native.tsx` as a platform difference because there was
  nothing else to write.
- **Falls back to today.** ~~Absent the module, the default is
  `AccessibilityInfo.sendAccessibilityEvent`, which is what `main` does now and
  which works about half the time. The dialog is no worse without the module than
  it is today; it is correct with it.~~ **Wrong, and this is the one.** Measured:
  the dialog is *better* without it — 73% against 37.5%. The sentence was true
  about absence and said nothing about presence, which is the gap Amendment 2
  closes.
- **Verifiable.** True, and the only one of the four that paid off: the instrument
  existed, so the claim was falsifiable in four CI runs rather than in a bug report
  six months later.

It is **Android only.** iOS already works — `setAccessibilityFocus` reaches
`UIAccessibility` and lands every time — so a second platform's module would be
code with no defect behind it.

## What it costs, and who pays

Unchanged from #353's own list, restated because the constraints above are what
keep each cost where it is:

| | |
| --- | --- |
| Autolinking and a rebuild | only for an app that installs `@hozo/native`. `examples/native-demo` already builds native code for `@shopify/react-native-skia`, so it pays nothing new |
| Expo Go stops working | only for that app, and only without a config plugin and a prebuild |
| A React Native ABI and codegen matrix | gained by `@hozo/native` alone. The core packages keep having no matrix, which is the point of constraint 1 |
| CI time | `native.yml` runs weekly and on pull requests that touch it or the demo, not on every pull request. Verification is affordable because it is not per-commit |

The cost that is **not** on #353's list and is the real one: a second way to do
things. Every future capability can now point at `@hozo/native` and say "there is
a place for this", and the gate above exists because that sentence is how a
JavaScript compiler becomes a native framework one defensible step at a time.
Four pieces of work have already stopped at this wall — safe areas (#338/#352),
font assets (#285), `@hozo/3d` (#327), iOS accessibility traits — and *none of
them passes the gate*. They were answered another way and stay answered that way.

## What was rejected

- **Keeping the refusal.** "`@hozo/*` is a compiler and JavaScript" was the right
  call for safe areas and is the wrong call for #491, because the two differ on
  the fallback: zeros are a wrong answer, and `sendAccessibilityEvent` is the
  current one. A rule that cannot tell those apart is a rule that has stopped
  being about anything.
- **A picker as the first capability.** It was the capability actually asked for
  (#143's `NativeSelect`), and it fails two of the four: a JavaScript answer
  exists and ships in `packages/form/src/native-select.native.tsx`, and the hole
  is one a community module already fills. `NativeSelectProvider` is the seam for
  that, and Hozo supplying the module would be Hozo competing with
  `@react-native-picker/picker` for no reason.
- **Shipping the 250 ms delay instead.** Measured over twelve rounds and rejected
  in #491: the threshold is a property of one emulator, and the mount queue adds a
  variable frame on top. It is in `dialog.native.tsx` today as the best available
  guess, and replacing it is the acceptance criterion rather than a side effect.
- **Native code inside an existing package behind a build flag.** It makes the
  rebuild conditional on configuration rather than on installation, which means
  the question "does this package need a native build" stops having one answer.

## Evidence

- `packages/engine/src/safe-area.native.ts:50` — the resolved-provider shape this
  record first required, correct for a module that is conditionally in the graph
  and only for that (Amendment 1).
- Runs 36909079977, 36913846064, 36918142628 (treatment) and 36920538771
  (control) — the four dispatches Amendment 2 is counted from, with the per-boot
  numbers in each job log.
- https://github.com/iray-tno/hozo/pull/710 — the capability as built, kept
  unmerged as the record of what was measured.
- `packages/patterns/src/dialog.native.tsx` — `WINDOW_RESTORE_DELAY_MS` and
  `CLOSE_RESTORE_FALLBACK_MS`, the two constants this is meant to delete.
- `packages/form/src/form.native.tsx` — `focusInvalidOnSubmit`, accepted and
  unused, with #491 named as the reason.
- `.github/workflows/native.yml:139`, `:262`, `:329` — the Android boot, the
  TalkBack run and the iOS job.
- `examples/native-demo/scripts/android-talkback.sh:338` — `DIALOG_ROUNDS`, the
  instrument for acceptance.
- #491 — the traced JavaScript path and the twelve-round delay sweep, with run
  ids.
- #353 — the question this answers, and the cost list it is answering with.

## When to revisit

Three things would move this, and only the first reopens the decision rather than
extending it:

- **A capability that beats its own fallback, measured against a control arm in the
  same conditions.** That creates `@hozo/native`. Until then the package does not
  exist, and this record is a gate with nothing through it.
- **A different attack on #484.** The event outperforms the action, so the open
  question is no longer which API to call. It is when, and what TalkBack does after
  a window closes. Nothing in that needs native code yet, and if something does it
  comes back through the gate with a control arm.
- **A capability that passes all four.** Admit it, and say in its own record which
  of the four was the close one.
- **A capability that passes three.** The answer is no, and the record of that
  belongs here as an amendment, because the next person will find the same three
  and reach the same wrong conclusion.
