# 6. Hozo may ship native code, in one optional package, behind a registered provider

**Status:** decided; amended three times, 2026-10-02 to 2026-10-03, while measuring the first capability
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
   evidence rather than expectation.** **One capability is admitted:** checking
   where TalkBack's focus lands after a request, and asking once more when it
   landed elsewhere — see **Amendment 3**.
   [#491](https://github.com/iray-tno/hozo/issues/491)'s first form, which
   performed the focus action itself, was admitted on expectation and withdrawn
   on measurement — see **Amendment 2**.

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

## Amendment 3: what was missing was seeing, not doing — admitted, measured

Amendment 2's reading was a guess. TalkBack's own log, recorded through
[#712](https://github.com/iray-tno/hozo/pull/712) (`native.yml`'s `talkback_log`
input raises TalkBack's log level), replaced it with an observation, and read
against TalkBack's source (google/talkback) it says:

- After a dialog closes, TalkBack **drops** a focus request until it considers the
  windows settled — `onViewTargeted return due to windows are not stable` — which
  took 246 to 467 ms on the reference emulator. `dialog.native.tsx` sends at 250 ms.
- About 250 ms after settling, it restores focus **from its own history**
  (`FocusProcessorForScreenStateChange`, `RESTORED_LAST_FOCUS`).
- So `sendAccessibilityEvent` is not a weak substitute for a missing API. It is the
  sanctioned one — `InputFocusInterpreter` names "developers manually set input focus
  onto some node" as a case TalkBack follows — and `ACTION_ACCESSIBILITY_FOCUS` is
  the service-to-app direction, which the first version called on its own receiving
  end.

What JavaScript genuinely cannot do is **tell a dropped request from an honoured
one**: React Native 0.87 passes JavaScript nothing about where accessibility focus
is. That is the capability now in `@hozo/native`, merged in
[#710](https://github.com/iray-tno/hozo/pull/710). It sends the same
`TYPE_VIEW_FOCUSED`, watches the window for the first view that takes
accessibility focus, and if that is not the opener, sends the request once more,
when the windows have settled and TalkBack honours it. It never places focus
itself. Only the first landing is acted on, so a user who moves on is never pulled
back.

Measured with treatment and control dispatched together, TalkBack log on:

| pair | treatment | control |
| --- | --- | --- |
| 1 (37043971216 / 37043976211) | 10 of 10 | 11 of 15 |
| 2 (37047604068 / 37047607769) | 20 of 20 | 9 of 20 |
| **total** | **30 of 30** | **20 of 35** |

Fisher's p ≈ 2×10⁻⁵. In 19 of the 30 rounds the first request was dropped and the
resend recovered it, a rate in line with the control's 15 losses in 35. In a round
where the first request was honoured, the opener was announced as often as in the
control. The cost is in the recovered rounds, which announce where TalkBack put
focus and then the opener.

Against the gate:

- **Unreachable** — no event or property in React Native 0.87 reports accessibility
  focus to JavaScript. `BaseViewManager` reads `view.isAccessibilityFocused()`
  internally and passes nothing up.
- **Already paid for** — #462, #484 and the 250 ms delay, as before.
- **Falls back and beats it** — unregistered or not watchable, it is the event
  `main` always sent. Registered, it beat a same-conditions control 30 to 20 of 35.
- **Verifiable** — the TalkBack harness, plus #712's log, which is what showed the
  mechanism rather than only the count.

The scope is stated, not implied. The losing history in these runs is written by
the harness's Tab walk, under which TalkBack declines the opener as `is not
visible` while the soft keyboard covers it. A hardware-keyboard user or a swipe user
leaves a different history, and nothing injected from adb reaches TalkBack's
navigation to measure them (#484). The module covers the lost request whichever
history produced it. The claim is about recovery, not about how often each
history occurs.

The lesson Amendment 2 drew still holds, sharpened: the first version was right
that something was unreachable, and wrong about what. Find the missing fact first —
here, what TalkBack does with the request — and only then decide what native code
should supply.

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
(`native.yml:143`, `:266`, `:334`), and
`examples/native-demo/scripts/android-talkback.sh:463` already takes
`DIALOG_ROUNDS` and counts how many dismissals returned focus. #297 built that to
answer a different question; it is the instrument this needs.

## Why #491's first form looked like the first, and which test it actually failed

Kept rather than deleted, because the reasoning was sound on three of the four and
the one it got wrong is the one worth recognising next time. Amendment 3 admitted a
different capability for the same defect; this section is about the first one.

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
  variable frame on top. TalkBack's log has since shown it sits on the edge of when
  the windows settle (Amendment 3). It stays in `dialog.native.tsx`: it wins most
  of the time, and `@hozo/native` covers the times it loses instead of replacing it.
- **Sending the request several times on fixed delays.** Considered as the
  JavaScript-only answer to Amendment 3's finding. It converges, but every request
  is announced, including the ones TalkBack drops, and with nothing to say when to
  stop, the common case pays for the rare one. Watching the landing is what lets
  the module stay quiet when the first request was honoured.
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
- https://github.com/iray-tno/hozo/pull/710 — `@hozo/native` as merged
  (Amendment 3). Its history holds the first form, which performed the action
  (Amendment 2).
- Runs 37043971216, 37047604068 (treatment) and 37043976211, 37047607769
  (control) — the two pairs Amendment 3 is counted from.
- https://github.com/iray-tno/hozo/pull/712 and #484's comments — TalkBack's
  log of each dismissal, and the source lines in google/talkback it was read
  against.
- `packages/patterns/src/dialog.native.tsx` — `WINDOW_RESTORE_DELAY_MS` and
  `CLOSE_RESTORE_FALLBACK_MS`, which stay. The module covers what they lose.
- `packages/form/src/form.native.tsx` — `focusInvalidOnSubmit`, accepted and
  unused, with #491 named as the reason.
- `.github/workflows/native.yml:143`, `:266`, `:334` — the Android boot, the
  TalkBack run and the iOS job.
- `examples/native-demo/scripts/android-talkback.sh:463` — `DIALOG_ROUNDS`, the
  instrument for acceptance.
- #491 — the traced JavaScript path and the twelve-round delay sweep, with run
  ids.
- #353 — the question this answers, and the cost list it is answering with.

## When to revisit

Three things would move this, and only the first reopens the decision rather than
extending it:

- **React Native starts reporting accessibility focus to JavaScript.** Amendment 3's
  capability stops being unreachable. Remove it rather than keep the package for
  the next thing; if nothing else has passed the gate by then, `@hozo/native` goes
  with it.
- **A human or a real device measures the swipe and hardware-keyboard cases.** If
  TalkBack's own history already returns focus there, the module is idle for those
  users, which is fine. If it does not, the module covers it. Either way the result
  belongs in Amendment 3.
- **A second capability that passes all four.** Admit it, and say in its own record
  which of the four was the close one.
- **A capability that passes three.** The answer is no, and the record of that
  belongs here as an amendment, because the next person will find the same three
  and reach the same wrong conclusion.
