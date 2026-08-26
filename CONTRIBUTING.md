# Contributing

Hozo compiles React Native components and Tailwind classes ahead of time, and
most of what makes that hard is invisible from a diff. This document is the set
of things a newcomer would otherwise learn by breaking them.

Changes land through pull requests. `main` is protected; nothing is pushed to it
directly.

## The shape of the repository

| | |
| --- | --- |
| `crates/` | The compiler, in Rust. `hozo_ir` is the intermediate representation everything else agrees on; `hozo_parser` reads JSX and Tailwind classes into it; `hozo_web` and `hozo_native` lower it; `hozo_napi` exposes the result to Node. |
| `packages/` | The published surface, in TypeScript. `@hozo/compiler` loads the native addon, `@hozo/core` is the component set, `@hozo/runtime` is what compiled output calls at run time, `@hozo/a11y` is the pattern layer, and the rest are build-tool integrations. |
| `packages/tailwind-conformance/` | Not a package anyone installs. It is the evidence: Hozo's output compared against Tailwind's own engine, over a denominator derived from that engine rather than written by hand. |
| `docs/proposal.md` | Where the project is going. |
| `docs/decisions/` | Questions already settled, with the evidence. Read the relevant record before reopening one. |

## Before you open a pull request

```sh
cargo test --workspace
pnpm --filter @hozo/compiler build:native   # after any change under crates/
pnpm test                                   # from the repository root
```

`pnpm test` is the same command CI runs. Two lines in its output matter, and
both have to appear:

```
 Tasks:    24 successful, 24 total
9 packages pack correctly
```

If your change moves any conformance number, also run the audit and commit the
new snapshot:

```sh
pnpm turbo run report            # writes packages/tailwind-conformance/snapshot.json
pnpm turbo run report -- --check # what CI asserts
```

## Five things that will bite you

**`pnpm turbo run test` is not `pnpm test`.** The root script is
`turbo run test && node scripts/check-packages.mjs`, and the second half is
where a broken `exports` map surfaces. Running only the Turborepo half reports
green while CI is red. This has happened.

**`packages/*/package.json` is generated.** `scripts/package-metadata.mjs`
writes it and `scripts/check-packages.mjs` verifies it. Editing one by hand
passes every local test and fails CI at the last step. Change the generator.

**A stale addon makes a passing test a lie.** The JS side loads a compiled
`.node` file. Until you rebuild it, every JS test is measuring the previous
version of your Rust change — including the ones that pass.

**You cannot rebuild the addon while the audit is running.** On Windows the
running report holds the `.node` file open and the build fails with `EBUSY`.
Let the audit finish, or don't start it.

**The snapshot fails on improvement too.** `--check` compares every headline
number and rejects any change in either direction. A count that went up is a
fact that belongs in the diff of the commit that earned it, not a silent
upgrade.

## How this project knows things

The conformance suite exists because the alternative — a hand-written list of
cases someone thought of — measures the author's imagination rather than the
compiler. Every denominator here is derived from a system outside this
repository: Tailwind's own engine enumerates the utilities and variants, React
Native's type definitions decide which refusals are supportable, `aria-query`
supplies the roles and their required attributes.

Two consequences worth internalising.

**The numbers can move without a commit.** A Tailwind release changes the
denominator. That is why the audit also runs on a schedule.

**When a measurement and the thing measured disagree, suspect the
measurement.** In this repository's history that has been the right guess far
more often than not: a conformance check that could never have failed, a
diagnostic that pointed away from the correct answer, a probe that read the
wrong element. Before fixing a compiler defect a report found, confirm the
report is asking the right question.

A count of zero deserves the same suspicion. `silent: 0` looked like a clean
result for a long time and was in fact structurally impossible to fail; when it
was repaired it found 939 real cases.

## Commits and pull requests

Commit subjects say what the commit does and, where there is room, what it cost
or found — `Refuse a length there is nothing to resolve, instead of calling it
zero`, not `fix: length handling`. Imperative mood, no prefix tags, no trailing
period. `git log` is the house style guide.

Keep unrelated repairs in their own commits. A formatting sweep mixed into a
behavioural change makes the behavioural change unreviewable.

In the pull request, say what you measured. A claim that something works is
worth as much as the command that showed it.
