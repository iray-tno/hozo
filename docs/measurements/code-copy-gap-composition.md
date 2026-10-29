# CodeBlock's connected copy button composes authored gap axes

Continuing #1230, this change projects `copyStyle` at the actual private
Native CodeCopy Pressable, before box/text separation and class composition.
It does not change CodeBlock's body, row rendering, windowing or caches;
those remain outside this bounded change and the independently owned #1289.

## Reproduction and result

The source-backed owner matrix calls public CodeBlock through four routes:
raw public export, compiled literal class, opaque candidate lookup and spread
author. Each route uses the actual public CodeClipboardProvider. Without a
provider Native intentionally renders no copy control; counting that as a
passing owner would conceal the bug.

Before the fix, the new copy owner has **64 mismatches**: four routes, two gap
authors and eight Yoga layouts. A generic authored gap did not replace the
class axes when the contributions were flattened together. With the author
projected first, the rest matrix has **0 / 10,272 mismatches**, up from 10,176
observations by adding this owner, not by changing coverage eligibility.
The no-gap control keeps the class axes. Nested author arrays preserve their
explicit axis override, inputs stay unchanged, exactly one button is required,
and its nested Text receives no gap properties.

This is now 94 presentation/class-source cases, 90 distinct component/style
slots, 107 selected host channels across 27 components. These are bounded
matrix counts, not headline compatibility percentages.

## Verification

CPU1/Idle/serial throughout:

- `pnpm --filter @hozo/patterns typecheck` and `build`: pass.
- Patterns' `tsconfig.test.json` build and serial `.test-build/*.test.js`:
  **156 tests**, no skips.
- `node --test --test-concurrency=1 packages/tailwind-conformance/src/pattern-gap-owners.test.ts`:
  **11 tests**, no skips. Existing 10,080 interaction, 14,976 control/indicator
  and 2,400 conditional handle observations remain passing.
- Serial owner/input-slot/dynamic-slot/Alert/Native-host/cache selection:
  **72 tests**, no skips.
- `node --test --test-concurrency=1 --test-name-pattern='^Native|^published' examples/storybook-demo/scripts/code-block.test.mjs`:
  **4 tests**, no skips; real Native component sources with stand-in RN hosts.
- Lint, generated docs, package metadata, generated ABI (58 leaves, 81 names)
  and diff checks pass.

## Limits

No full local root suite, browser CodeBlock test, app/Metro build, actual OS
clipboard, Fabric/device pixels, AT delivery or performance measurement was
run. The projection remains after the clipboard connection gate and inside
the actual style callback; async copy behavior and label text styling are
unchanged. No resolver, class order, provider, ABI, Rust or eligibility change.
Copy interaction and connection/async lifetimes are a follow-up test layer.
Other CodeBlock owners, other packages, direct callbacks, tier/gate/reset/
percentage/mixed StyleX/grid boundaries remain before whole-gap eligibility
and legacy removal. No whole six-group family is closed.
