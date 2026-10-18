# Flaky tests

A flaky test fails or passes without a code change. This page lists the known
ones so that a red check you did not cause can be recognised, and so that
anyone looking for something to fix can find one.

Each test has its own issue with the [`flaky`][label] label. The issue holds
the state: evidence, hypothesis, upstream links, and who has it (`taken: …`).
This page holds only the pointer, so it does not go stale when an
investigation moves.

[label]: https://github.com/iray-tno/hozo/issues?q=is%3Aissue+is%3Aopen+label%3Aflaky

## Known

| Test | Where | Issue |
| --- | --- | --- |
| The `ios` job, before any test runs ("Timed out waiting for AX loaded notification") | `.github/workflows` | [#530](https://github.com/iray-tno/hozo/issues/530) |
| The `voiceover` job, on the runner ("-1743", VoiceOver refusing to launch) | `.github/workflows` | [#631](https://github.com/iray-tno/hozo/issues/631) |
| The Native Dialog returning focus to its opener | device a11y checks | [#484](https://github.com/iray-tno/hozo/issues/484) |

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
