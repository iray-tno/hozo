# 6. Hozo may ship native code, in one optional package, behind a registered provider

**Status:** decided
**Date:** 2026-10-02

## Decision

Hozo ships native code, under three constraints that are the decision rather than
an implementation note:

1. **In `@hozo/native` and nowhere else.** No package an application installs to
   compile a `className` gains a native dependency. `@hozo/core`,
   `@hozo/primitives`, `@hozo/patterns`, `@hozo/form`, `@hozo/behaviors` and
   `@hozo/engine` stay installable without a Gradle or CocoaPods build.
2. **Handed in by the application, never imported by a library.** The consuming
   module keeps a registered provider and degrades to what it does today when
   nothing has been registered. **Amended on 2026-10-02**, while building #491 —
   see below; the original wording said "resolved provider", pointing at
   `packages/engine/src/safe-area.native.ts:50`, and that shape does not
   generalise.
3. **A capability is admitted only when all four of the gate below hold.** The
   first one that does is [#491](https://github.com/iray-tno/hozo/issues/491),
   moving accessibility focus on Android, and nothing else is admitted yet.

**The pre-condition in [#353](https://github.com/iray-tno/hozo/issues/353) and
#491 — "whether before #8" — is already satisfied.** #8, running the release job
for real, closed on 2026-09-15. It is no longer a reason to wait, and leaving it
written as one would have the two issues gating on something that had already
happened.

## Amendment: a `require` is not optional under Metro

Found while building #491, which is the first code this record governed.

`safe-area.native.ts` reaches its optional package with
`try { require('react-native-safe-area-context') } catch {}`, and the first
version of #491 copied it. It cannot work here. **Metro resolves `require` at
bundle time**: a literal `require` of a package that is not installed is a build
failure, and the `catch` runs at runtime, which the bundler never reaches.

Safe areas get away with it for a reason that does not transfer. That module is
only in the module graph when the compiler emitted a safe-area class — "a project
that writes none never imports it" is its own comment — so the unresolvable
`require` is behind a conditional *graph edge*. The accessibility-focus module is
in the graph of every application that renders a `Dialog`. A `require` there would
have made `@hozo/native` mandatory and broken every existing application on
upgrade, which is the exact opposite of constraint 1.

So the mechanism is **registration**: the application calls
`setAccessibilityFocusMover(moveAccessibilityFocus)` beside its root component,
and `@hozo/native` is in that application's module graph and in nobody else's.
Two lines, and they are the installation step rather than a wart — the setter
accepts `undefined`, which is what the export is on iOS and when the module is
missing from the binary, so the call needs no condition around it.

`safe-area.native.ts` is left alone. Its arrangement is still correct *for it*,
and changing a working module to match a rule it predates would be the kind of
tidying this directory exists to prevent. What is no longer true is that it is the
shape to copy: copy it only when the module is conditionally in the graph.

## The gate

A capability may be built as native code when **all four** hold. Three of the four
are about the fallback, because that is what decides whether absence is a
degradation or a defect:

| | |
| --- | --- |
| **Unreachable from JavaScript** | not slow, not awkward — traced to an API that is not exposed |
| **Already paid for** | the absence has cost shipped behaviour more than once, not once |
| **Falls back to today's behaviour** | not to a wrong answer, and not to a throw |
| **Verifiable by machinery that exists** | not by a harness that would have to be built first |

The third is the one that does the most work, and safe areas are why it is worded
that way. `safe-area.native.ts` falls back to zeros, which is a wrong answer
rendered confidently: a screen that looks fine on the reviewer's device and puts a
button under the notch on someone else's. A capability whose fallback lies is one
whose provider is not optional in practice, whatever the package graph says.

The fourth is already met for anything accessibility-shaped and would not be for,
say, a font-registration capability: `.github/workflows/native.yml` builds release
APKs, boots an emulator, drives TalkBack and reads the tree
(`native.yml:139`, `:262`, `:329`), and
`examples/native-demo/scripts/android-talkback.sh:338` already takes
`DIALOG_ROUNDS` and counts how many dismissals returned focus. #297 built that to
answer a different question; it is the instrument this needs.

## Why #491 is first, and why it is the only one

It is the only capability that passes all four today.

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
- **Falls back to today.** With nothing registered, the default is
  `AccessibilityInfo.sendAccessibilityEvent`, which is what `main` does now and
  which works about half the time. The dialog is no worse without the package than
  it is today; it is correct with it. Nothing else on the list has a fallback this
  honest.
- **Verifiable.** Acceptance is the restore rate moving from about half to all of
  them, measured by the script that measured the rejection.

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

- `packages/behaviors/src/accessibility-focus.native.ts` — the registration, and
  the Metro reasoning behind the amendment above.
- `packages/engine/src/safe-area.native.ts:50` — the resolved-provider shape this
  record first pointed at, correct for a module that is conditionally in the
  graph and only for that.
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

- **React Native exposing the action.** If `ACTION_ACCESSIBILITY_FOCUS` becomes
  reachable from JavaScript, #491 stops passing the first test, `@hozo/native`
  loses its only capability, and the package should be removed rather than kept
  for the next thing.
- **A capability that passes all four.** Admit it, and say in its own record which
  of the four was the close one.
- **A capability that passes three.** The answer is no, and the record of that
  belongs here as an amendment, because the next person will find the same three
  and reach the same wrong conclusion.
