# Flaky tests

A flaky test fails or passes without a code change. This page lists the known
ones so that a red check you did not cause can be recognised, and so that
anyone looking for something to fix can find one.

Each test has its own issue with the [`flaky`][label] label. The issue holds
the state: evidence, hypothesis, upstream links, and who has it (`taken:<agent>-<n>`).
This page holds only the pointer, so it does not go stale when an
investigation moves.

[label]: https://github.com/iray-tno/hozo/issues?q=is%3Aissue+is%3Aopen+label%3Aflaky

## Known

| Test | Where | Issue |
| --- | --- | --- |
| The `ios` job, before any test runs ("Timed out waiting for AX loaded notification") | `.github/workflows` | [#530](https://github.com/iray-tno/hozo/issues/530) |
| The `voiceover` job, on the runner ("-1743", VoiceOver refusing to launch) | `.github/workflows` | [#631](https://github.com/iray-tno/hozo/issues/631) |
| The Native Dialog returning focus to its opener | device a11y checks | [#484](https://github.com/iray-tno/hozo/issues/484) |
| The `android` job, before any test runs ("Android framework readiness timed out") | `.github/workflows` | [#1525](https://github.com/iray-tno/hozo/issues/1525) |

## Not flaky: the Storybook audits on a lowered priority

The appearance and virtual-reader audits in `examples/storybook-demo` were
listed here (#1367, #1426). They failed locally, never in CI, with a story's
root still empty after its 5-second deadline, or its frame still on
`about:blank` or the previous story. Every one was in a run pinned to one CPU
**at `BelowNormal` priority** while other work shared that core.

The priority is the cause. Chrome inherits it, then raises its renderers back
to Normal and leaves the rest of itself (the network service among them)
where it was. Any Normal-priority work on the same core then stops those
processes outright, and a story waits seconds for `index.json` or a chunk
from a local server that answers in milliseconds. Measured on one core
against two Normal-priority busy processes, six seconds on and two off:

| Audit priority | Appearance: stories that missed the deadline | Virtual reader: stories not read |
| --- | --- | --- |
| `BelowNormal` | 9, 6, 8, 5 | 28, 33 |
| `Normal` | 0, 1 | 0, 0 |

Each figure is one 102-story run.

With no competing load, `BelowNormal` passes too (three of three, median 169ms
a story). The resource timings of the slow stories show the requests, not the
rendering, taking the time.

So run these audits at Normal priority when you restrict them to one CPU. A
lower priority measures what else the machine is doing. The receipts cannot
tell the two apart for you: a request still waiting has no resource-timing
entry yet, so a starved story and a broken one both show an empty root. If one
fails at a lower priority, rerun it at Normal before reporting it.

## When you meet one

- **A test you did not touch fails.** Look for it here and in the label. If it
  is listed, rerun the failed job (`gh run rerun <run> --failed`) and add the
  run's link to the issue. Each occurrence is evidence of how often it
  happens.
- **It is not listed.** Confirm it is flaky before calling it that: the same
  commit has to pass on a rerun. A failure on a branch that is behind `main` is
  usually the branch, not the test. Then open an issue titled with the cause
  if known, or else the symptom, labelled `bug` and `flaky`. Link the failing
  run and quote the assertion. Add a row here in the same PR, or in a
  follow-up.
- **Do not make it pass by retrying.** A retry wrapper or a looser bound hides
  the next real regression in the same place. Fix the race the test has, or
  say in the issue why it cannot be fixed here: `blocked-upstream` and
  `needs-device` exist for that.
- **Fixed.** The PR that fixes it closes the issue and removes its row.

This list will not reach zero. Several of these tests drive real browsers,
simulators and screen readers on shared CI runners, and some causes sit
upstream. The goal is that every known flake is written down and that none is
silent.
