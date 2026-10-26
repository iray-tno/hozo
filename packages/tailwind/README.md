# @hozo/tailwind

Reads a project's design tokens out of its own Tailwind entry stylesheet and hands them to the Hozo compiler.

Used by every Hozo integration; a project does not normally import it directly.

## Why it runs Tailwind rather than parsing a config

Tailwind 4 defines a theme in CSS — `@theme { --color-brand: oklch(62% 0.19 258); }` — with `@import`, `@plugin` and cascade layers all in play. Working out what `bg-brand` means from the file text would mean reimplementing that resolution, and being subtly wrong about it in ways that look reasonable from both sides.

So this loads the stylesheet through Tailwind's own resolver and reads the answer. The colours come back in three forms — token name, `oklch()`, and a hex fallback — because Native has no `oklch()` and the compiler needs to pick per backend.

Spacing is carried as the project's *step*, not as pixels: `p-4` means "four spacing units", and a project that sets `--spacing` to something other than `0.25rem` moves every one of them together. Resolving to pixels at this layer would silently freeze the scale.

Radius tokens are resolved at compile time for both Web and Native. For example,
`@theme { --radius-lg: 10px; }` makes `rounded-lg` and its corner forms use 10px;
custom names such as `--radius-control` work too. Supported values are pixels,
rem lengths and references to other resolved radius tokens. Built-in scale names
retain their defaults when no project value is available. Bare `rounded`,
`rounded-none`, `rounded-full` and explicit values such as `rounded-[8px]` are
not changed by scale overrides.

The theme is read once per build. It is a project-wide fact, and re-reading it per module would run Tailwind's resolver hundreds of times for one answer.

## API

```ts
import { loadProjectTheme } from '@hozo/tailwind'

const theme = await loadProjectTheme(root, {
  css: 'src/theme.css',
  warn: (message) => console.warn(message),
})
```

Returns `undefined` when there is no entry stylesheet to read, which is the signal to fall back to Tailwind's defaults. A token that fails to resolve is reported through `warn` rather than dropped.

## Read-only analysis

`await loadStaticProjectTheme(root, css?)` returns separate CSS/theme facts and stylesheet content
hashes. It uses the same discovery and import resolver, but has no silent fallback or persistent
cache. Entry and imported CSS are parsed before Tailwind sees them; `@plugin`, `@config` and remote
imports are explicitly not assessed. Project modules are never loaded. Comments and quoted
declaration values are not executable directives. Missing, invalid and unsupported inputs remain
distinct; imported edits are re-read on the next invocation. This is the service used by migration
audit, not a replacement for the ordinary build loader above.

## Prepared ordering descriptors (build tooling)

`await prepareTailwindOrder(css, base, candidates, { file? })` prepares one
immutable, JSON-safe `snapshot` and a synchronous `lookup(candidate)`. It uses
the same read-only CSS resolver above and rejects incomplete/unsafe inputs
rather than silently producing a default context. Reuse the prepared object
across transforms; do not prepare per element or render.

The snapshot preserves every original rule's property signature, declaration
count, variant mask and nested selector/at-rule structure. Candidate/rule IDs
are scoped to its fingerprint, which includes schema/policy, Tailwind version,
entry/imported stylesheet hashes and the full observed candidate universe.
Candidate enumeration order and duplicates do not change it; imported edits
or candidate additions do. No entry-text-only persistent cache is used.

`lookup` returns `null` for an uncollected candidate: collect it and prepare a
new context before emission. A collected token for which Tailwind generated
no rule instead has `status: 'not-generated'`. Neither is assigned rank zero.
`firstRuleRank` remains only upstream's first-rule rank, not all rule metadata.
Snapshot ranks/masks must never be mixed across different fingerprints.

This is the preparation boundary of [RFC 007](../../docs/rfcs/007-canonical-tailwind-order.md),
not an enabled compiler option. It does not change existing lowering or
candidate output, assess selector specificity, add custom utility support or
ship the descriptor tree to the device. Compiler unit identity and the
shared pass-through plan remain subsequent work.

<!-- generated: package-footer -->

---

Part of [Hozo](https://iray-tno.github.io/hozo/), a universal UI framework for React Native, compiled by Rust, with native semantics on every platform, first-class accessibility, and diagnostics for humans and AI agents alike. Most applications install [`@hozo/core`](https://www.npmjs.com/package/@hozo/core) and one build integration; see [Getting started](https://iray-tno.github.io/hozo/docs/getting-started/). Source and issues: [github.com/iray-tno/hozo](https://github.com/iray-tno/hozo).

<!-- /generated: package-footer -->
