# Metro packed fixture deadline

Issue [#2174](https://github.com/iray-tno/hozo/issues/2174) reported three local
Windows failures at the fixture child's 15-second cutoff. The owning test
already allowed 30 seconds for the entire pack/install/consumer sequence.
The failures stopped in npm startup, before producing a tarball. This is a
fixture-lifetime correction, not a package-packing speed requirement.

## Observation on 2026-11-23

Base `860bdf15`, Windows 11, Node 25.9.0, npm 11.12.1. Each command used one
logical CPU (affinity mask 8) at Normal priority. Cargo, Rayon, Turbo and Go
concurrency were 1. No competing load was deliberately introduced.

The first observed Node 25 CLI invocation copied the real six-file fixture to
a fresh directory and ran the bundled npm CLI directly:

```sh
node <bundled-npm>/bin/npm-cli.js pack --ignore-scripts --json --offline \
  --cache ./npm-cache --loglevel=verbose --timing
```

| Observation | Time |
| --- | ---: |
| Parent wall time | 14,476 ms |
| npm's whole-command timer | 12,817 ms |
| npm's initial load timer | 383 ms |
| npm's `command:pack` handler timer | 78 ms |

The handler's 78 ms does not include all CLI setup, module loading or process
startup/exit. Most wall time was outside that handler. A single successful
command already nearly consumed the helper's 15-second limit without a
parallel test run. This does not identify why that invocation's setup was
slow, establish a cold-cache cause, or attribute the earlier failures to CPU
starvation. Subsequent runs are warmed observations, not speed improvements.
An initial attempt using the host's unrelated Node 24 runtime could not find
npm and was excluded; all numbers here use the pinned Node 25 distribution.

## Deadline and cleanup controls

The correction disables only this test's separate child cutoff. Both npm
commands use the same owning test's existing 30-second cancellation signal;
neither receives a fresh 30-second allowance. Real npm packing, offline
installation, lifecycle rejection fixtures, exact tarball files, checkout
exclusion and Native owner-delivery assertions remain in the test.

A separate mechanism control injected a 16-second sleeping preload before the
real npm CLI. This is an artificial startup delay, not a reproduction of the
original machine slowdown. All commands ran once, without retries.

| Control | Result |
| --- | --- |
| Original child cutoff, owner signal 30 s | Killed at 15,017 ms before npm ran |
| Shared owner signal, no separate child cutoff | Actual six-file npm tarball produced at 16,689 ms |
| Nonterminating child, shared signal aborted at 1 s | Rejected with `AbortError` at 1,007 ms; child closed |
| Child exits with code 7 | Failed with code 7; child closed |

The shared deadline exposed another cleanup race: a real Node test deadline
starts its after-hooks while the body is still awaiting its child. Before a
close barrier, a one-second intentional owner timeout attempted to remove a
live child's cwd and returned Windows `EPERM`, with both exit/signal codes
still null. The Metro fixture now tracks its children and waits for their
settlement/close before removing the directory, even when the runner cancels
the body. Ordinary fixture children still have their existing default cutoff.

A retained regression runs an independent, intentionally cancelled Node test
runner. It cancels only after the actual child writes to stderr, avoiding a
machine-speed threshold. The parent requires a nonzero nested result and a
receipt showing child closure, directory removal and the original stderr.
Removing the close barrier makes this regression fail on Windows; restoring
it passes. Normal child cancellation and the real packed-consumer test also
pass with the shared-deadline path. Repeating the one-second intentional owner
timeout with a tracked child still fails at the deadline, with a receipt
confirming both child closure and directory removal.

In the subsequent root `pnpm test` run, the real packed-consumer test passed
in 2,245 ms and the owner-cancellation regression in 299 ms. These are warmed
validation observations, not a claimed packing speedup or a new timing gate.

Raw probe scripts, npm timing logs and receipts are retained locally under
`artifacts/metro-pack-*`. The full repository checks and their results are
reported in the PR. No assertion is retried and the owning body's 30-second
deadline is unchanged; teardown waits for child closure after cancellation.
This does not guarantee success on an arbitrarily stalled host or change
other fixtures' timeout policies.
