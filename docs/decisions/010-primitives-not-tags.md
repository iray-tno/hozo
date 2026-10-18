# 10. A module React Native can load writes primitives, not HTML elements

**Status:** decided
**Date:** 2026-10-19

## What went wrong

`@hozo/ui` is shipped as source and compiled by the application's own Hozo
build. Nine of its files wrote `<div>` or `<span>`: Card, Stack, Alert, the
calendars' "today" marker, and Tree's default row. Every check that looked at
the package looked at it in a browser, where those tags render fine.

On React Native the compiler had nothing to compile. Hozo lowers its
primitives (`View`, `Text`, `Pressable`, …), not intrinsic tags.
`compileNative` on a plain `<div className="p-4">` component returns zero
compiled roots, so the tag reaches React Native as written, and React Native
has no `div` host (#983, fixed in #984).

This is the mistake that comes most naturally, to a person or an agent
writing React. `<div>` is what React components are made of, it type-checks,
and on the Web it works. Nothing fails until someone opens the app on a
device.

## Decision

**A module that React Native can load writes `@hozo/core` primitives, never
an HTML element.** Use `View` for a box, `Text` for text, and the semantic
primitives (`Section`, `List`, `Heading`, …) where the element carries
meaning. They become the right DOM element on the Web.

**The Web half of a split component writes the DOM, and should.** In
`@hozo/patterns`, `listbox.tsx` *is* the Web implementation, and its
`<div role="listbox">` is correct. `listbox.native.tsx` is what Native loads.
The rule is about what a platform can reach, not about which package a file
is in:

| Module | Native loads it? | Writes |
| --- | --- | --- |
| Source compiled by Hozo (`@hozo/ui`, application code) | yes, through the compiler | primitives |
| A shared `.tsx` with no Native counterpart, in any package | yes | primitives |
| `x.tsx` beside `x.native.tsx`, or `x.web.tsx` | no | the DOM |
| A module behind an export whose `react-native` condition points elsewhere | no | the DOM, listed with that reason |

**It is enforced, not just written down.** `scripts/native-hosts.test.mjs`
reads every package's `src` and fails on a lowercase JSX tag in any module
that is not a Web half. Web-only modules without a `.native` sibling go in
`WEB_ONLY` with the reason Native never reaches them. The test also fails
when a listed module stops writing the DOM, so no exemption outlives its
reason. It replaces `packages/ui/src/native-hosts.test.ts` from #984, which
covered only `@hozo/ui`.

## Rejected

- **Make the Native compiler lower `<div>` to `View`.** In
  `docs/decisions/002-what-hozo-abstracts.md`, an unmodelled tag is an escape
  hatch, carried as written with the tree around it still compiled. The
  role-less `div` and `span` "are `View` and `Text` already": the primitive
  exists, so the tag is not missing one. Guessing would also be wrong half
  the time. A `<span>` may be a `Text`, or a run inside one, depending on
  context the tag does not say.
- **A Biome lint rule.** Biome has no rule that tells a Web half from a
  shared module, and `.native.tsx` siblings and export conditions are
  repository facts, not syntax. A test that reads the tree can check both.
- **Check only `@hozo/ui`.** It is where this happened, but a shared `.tsx` in
  a prebuilt package breaks Native the same way, and nothing guarded those.
- **Ban lowercase JSX everywhere.** The Web halves are the DOM
  implementations; banning their tags would ban the implementation.

## Evidence

- #984's measurement: `compileNative` on a plain `<div className="p-4
  text-sm">` component returns **0** roots; after the change, each fixed file
  compiles with no `<div`/`<span` left.
- `packages/three/package.json`: `./r3f`, `./webgl` and `./webgpu` each have
  a `react-native` condition naming a `*-react-native` module. This is why
  `three/src/r3f.tsx` and `three/src/web-surface.tsx` may write the DOM.
- The guard catches a regression. Appending `<div />` to
  `packages/ui/src/card.tsx` fails it with `packages/ui/src/card.tsx writes
  <div>`. Restored afterwards.

## When to revisit

- **React Native gains a `div` host.** Then this rule becomes a style choice
  rather than a correctness one. React Native's DOM-like node APIs for
  traversal and layout do not count: they do not add host components.
- **The compiler starts lowering intrinsic tags.** That would mean overturning
  002 first. Do not do it here.
