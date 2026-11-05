# Storybook preparation failure state

Investigation of [#1494](https://github.com/iray-tno/hozo/issues/1494), 2026-11-05,
on Windows with one logical CPU at Normal priority.

## What the existing evidence establishes

The original run at `44c75e2f` plus the BottomSheet desktop change failed one of
204 axe cases. `primitives-button-interactions--interactive-pressables` in light
mode reached its preparation deadline after 10,129ms. The saved report contains
no readiness phase, root/font state, animation state or request observations.
It cannot identify the original cause.

[#1662](https://github.com/iray-tno/hozo/pull/1662) added the phase at failure and
a later browser/request capture. This still leaves a timing gap: the late
capture can see a rendered root, loaded resources or an already-finished
animation that was unavailable when the waiter rejected.

Before this change, fresh compiler/dependency/Storybook builds from main
`324d8727` passed all 206 story/scheme cases in 125,919ms using the production
`check-a11y.mjs` driver. This includes the originally failing story in both
schemes. The build and report are retained under
`artifacts/audit-preparation-root-cause/`. This is the current catalogue, not
the historical build, and a successful traversal does not establish a fix or
the cause of the earlier deadline.

## Failure-time receipt

The waiter now freezes a diagnostic state synchronously when it rejects.
The later capture exposes it as `diagnostics.browser.stateAtFailure` while
retaining the current browser state separately. The receipt includes:

- The rejected phase, total/phase elapsed time and requested/completed frame
  callbacks, to distinguish rendering from a withheld animation frame.
- URL, document readiness/visibility, root presence and child count, font status,
  stylesheet URLs/load state and Storybook's rendered story/render phase.
- Up to 50 animations with total/truncation counts, timing, play/pending state,
  animation/transition identity and target.

A capture error remains explicit. This receipt adds no readiness condition,
retry, animation cancellation, new axe suppression or longer deadline.

## Controlled browser regressions

```sh
node --test --test-concurrency=1 examples/storybook-demo/scripts/a11y-audit.test.mjs
```

The controlled cases exercise four distinct observations:

| Rejected condition | Later state | Evidence that must survive |
| --- | --- | --- |
| Empty root | A late render settles | Zero root children at rejection |
| Paused finite animation | It is explicitly finished after rejection | The paused animation at rejection |
| A withheld frame callback | Root and fonts are ready; no finite animations exist | One requested callback, zero completed |
| Pending font and stylesheet requests | Requests settle after rejection | Loading font and unloaded stylesheet at rejection |

Short fixture-specific deadlines make these conditions deterministic; the
production preparation deadline remains ten seconds. Existing real contrast
defects, incomplete catalogues, paused animations and render errors continue to
fail. Decorative infinite animations remain running.

These fixtures prove the diagnostic gap and its correction. They do not prove
that the historical case stalled on any particular phase. #1494 remains open
for an occurrence with a failure receipt that can support that conclusion.

## Full-run limitation

Root `pnpm test` passed 41/41 package tasks, packing for 24 packages and 148/148
publishing checks, then failed the Native development bundle's Hozo-module
budget: 514,356 bytes against 510,000. With all tracked files restored to main
`324d8727`, the build/check failed identically and the complete bundle had the
same SHA-256, `52e7dd490c29f5ad05ac495612aa8b7f1e4d72bcd8e0be40e37798610bd84390`.
This independent baseline failure is tracked in
[#1737](https://github.com/iray-tno/hozo/issues/1737); the original failed gate
and both bundle receipts are retained. Remaining integration tasks run
separately with that Native demo excluded, keeping the root failure visible.

That continuation passed 33/33 tasks in 17m14.155s (23 cached), including the
Storybook suite's 292 tests, all 206 axe cases in 128,931ms, appearance checks
for 103 stories, shared interactions, LP/Docs checks, both Next bundlers and
both Native Showcase exports. `pnpm lint` and `pnpm docs:check` passed. The
historical preparation timeout did not recur in this traversal either.
