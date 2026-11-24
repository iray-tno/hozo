# A2UI Phase 1 Spike (`@hozo/example-a2ui-spike`)

Phase 1 spike for [#2251](https://github.com/iray-tno/hozo/issues/2251): render the same [A2UI](https://github.com/google/A2UI) v1.0 (and v0.9.1) messages on **both Web and React Native** from one `@hozo/ui` semantic catalog, and record what the renderer contract needs from Hozo components.

## Why a custom DOM-free renderer instead of published A2UI adapters

Before writing code, we unpacked and inspected the published npm packages referenced in `#2251` (`@a2ui/react@0.15.0` and `0.16.1`, `@a2ui/web_core@0.15.0` and `0.16.1`, and `a2ui-react-native-renderer@1.0.0`). Every published renderer currently fails at least one hard repository constraint:

| Property | `@a2ui/react` (`0.15.0` / `0.16.1`) | `@a2ui/web_core` (`0.15.0` / `0.16.1`) | `a2ui-react-native-renderer` (`1.0.0`) | This spike (`examples/a2ui-spike`) |
| --- | --- | --- | --- | --- |
| A2UI wire versions | `v0.9` / `1.0` | `v0.9` / `1.0` | `v0.9` / `v0.9.1` only (no `@path`, no inline `createSurface`) | `1.0` and `v0.9.1` |
| Zod dependency | `zod@^3.25.76` (21 files in `web_core` use `._def` / `zod-to-json-schema@3`) | `zod@^3.25.76` | `zod@^3.25.76` (6 files use `._def` / 1-arg `z.record`) | Workspace `zod@4.6.6` (`z.toJSONSchema` built-in) |
| `pnpm audit --audit-level=high` | Fails on unpatched Zod 3 `GHSA-mrhx-c7xc-m3w5` | Fails on `GHSA-mrhx-c7xc-m3w5` | Fails on `GHSA-mrhx-c7xc-m3w5` | **Passes** (0 high, 0 critical, zero `ignoreGhsas` exceptions) |
| Web DOM coupling | Wraps every component in `<a2ui-react-*>` Custom Elements (`HTMLElement`), uses `react-dom.createPortal`, DOM `Element` `accessibilityRef` (`0.16.1`) | `@a2ui/web_core/v1_0` re-exports `universal/index.js` pulling `lit` (22 files) + `@lit/context` | React Native only; separate catalog/presenter API (`defineA2UICatalog`, `A2UIDynamic*Schema`) | **Zero DOM globals** (`HTMLElement`/`document` absent on Native); zero custom elements; zero `lit` |
| Single catalog across Web + Native | No (Web-only) | Core only | No (separate schema/presenter contract) | **Yes** — one renderer + one `hozo-catalog.tsx` |

Keeping the renderer inside Hozo's own stack costs **1,057 lines** of TypeScript (`src/protocol.ts` 349 lines, `src/engine.ts` 611 lines, `src/renderer.ts` 97 lines) plus **239 lines** for the 5-component semantic catalog (`src/hozo-catalog-schemas.ts` 105 lines, `src/hozo-catalog.tsx` 134 lines), with zero new external runtime dependencies beyond workspace `zod@4.6.6`.

## Architecture

- **`src/protocol.ts`** — Zod 4 wire schemas for A2UI v1.0 (`@path`, `@call`, inline `createSurface.components` + `createSurface.dataModel`) and v0.9.1 (`path`, `call`, progressive `createSurface` → `updateComponents` → `updateDataModel`), plus `action` and `error` renderer-to-agent envelopes.
- **`src/engine.ts`** — DOM-free reactive `createA2uiStore` with scoped JSON Pointer resolution, template child-list expansion (`{ componentId, path }`), strict catalog validation, action context resolution, `deleteSurface`, and `exportCatalogJsonSchema` (JSON Schema 2020-12 via Zod 4's native `z.toJSONSchema`).
- **`src/renderer.ts`** — DOM-free `<A2uiSurface />` using React's `useSyncExternalStore` and `createElement(Fragment, ...)`. Enforces cycle detection and `allowedChildren` without emitting wrapper elements.
- **`src/hozo-catalog-schemas.ts`** — JSX-free strict Zod 4 schemas for `Stack`, `Card`, `Text`, `Alert`, and `Button`. `className` and `style` are omitted and rejected by `.strict()`.
- **`src/hozo-catalog.tsx`** — Single React component catalog compiled by `@hozo/vite` on Web and `transformHozoSource` on Native.

## What the A2UI renderer contract needs from Hozo components

1. **Bounded semantic props compile statically when ternaries stay inline inside `cx(...)`.**
   Assigning variant/tone class strings to local variables (`const toneClass = ...; cx(variantClass, toneClass)`) triggered `DYNAMIC_CLASS_NAME_NOT_RESOLVED` in `@hozo/vite`. Inlining ternaries directly inside `cx(...)` (the same pattern `packages/ui/src/stack.tsx` uses) compiled `A2uiText` with **zero** build-time fallback diagnostics on both Web and Native.
2. **`@hozo/ui` has no styled `Text` component yet.**
   `Button`, `Card`, `Stack`, and `Alert` all mapped cleanly from `@hozo/ui`, while `Text` required a thin `A2uiText` wrapper around `@hozo/core`'s `Text` with bounded `variant` (`heading | subheading | body | caption`) and `tone` (`body | subtle | accent | danger`) enums. A future `@hozo/a2ui` package (or `@hozo/ui` itself) needs a canonical semantic text surface so catalog authors do not duplicate typography tokens.
3. **Accessibility maps onto Hozo props without DOM refs.**
   A2UI `accessibility` (`label`, `live`, `hidden`) translates directly to `Button.accessibilityLabel`, `Alert.live`, and conditional rendering for `hidden` — no DOM `Element` ref (`accessibilityRef`) or Custom Element host is needed.
4. **Strict schema boundaries enforce the design system at parse time.**
   Because every component schema uses `.strict()` without `className`/`style`, agent payloads containing arbitrary Tailwind classes (`bg-[#ff0044]`), out-of-vocabulary tones (`neon`), or the reserved `Surface` name fail validation and emit structured A2UI `VALIDATION_FAILED` errors rather than leaking into rendered props. The same schemas emit JSON Schema 2020-12 (`additionalProperties: false`) for agent prompts.
5. **Real Native Hozo bug surfaced by live A2UI updates ([#2273](https://github.com/iray-tno/hozo/issues/2273)).**
   Running live `updateDataModel` updates across both platforms exposed a bug in `packages/primitives/src/pressable.native.tsx`: `TransitionPressable` caches initial `colorRanges` in a `useRef` and only updates them in pointer/focus callbacks (`onPressIn`/`onHoverIn`/`onFocus`). When an A2UI `updateDataModel` flips a mounted `<Button tone="accent" />` from `disabled={true}` to `disabled={false}`, its label flips immediately to `#ffffff` (`text-hozo-on-accent`), while its `backgroundColor` stays stuck at `#f1f5f9` (`bg-hozo-surface-raised`) — white text on pale slate. Web Chromium transitions cleanly to `#4f39f6`, and a freshly mounted Native surface resolves `#4f39f6` identically to Web.

## Measured verification

Run from repository root:

```sh
pnpm --filter @hozo/example-a2ui-spike test
pnpm audit --audit-level=high
node --test scripts/native-hosts.test.mjs scripts/turbo-source-inputs.test.mjs
```

Measured results:

- **`@hozo/example-a2ui-spike test`**: `vite build` succeeds (zero diagnostics from `hozo-catalog.tsx`), **9/9 tests pass**, `tsc -p . --noEmit` exits 0:
  - `scripts/check-runtime.test.mjs` (**6/6**): DOM-free engine/renderer, v1.0 vs v0.9.1 equivalence, reactive `updateDataModel` + null deletion + action dispatch, strict rejection of `className`/invalid tones/`Surface`, cycle & `allowedChildren` guards, JSON Schema 2020-12 export.
  - `scripts/check-web-a2ui.test.mjs` (**1/1**): real Vite production bundle in headless Chromium — verifies compiled Hozo DOM, zero `<a2ui-react-*>` custom elements, live `updateDataModel` unblock, click action dispatch, strict rejection, and `v0.9.1` compatibility.
  - `scripts/check-native-parity.test.mjs` (**2/2**): compiles the exact same `hozo-catalog.tsx` + `@hozo/ui` sources with `transformHozoSource` and real `@hozo/ui/src/theme.css` (`HTMLElement === undefined`, `document === undefined`), and compares resolved styles against Chromium across all 5 components (`Card`, `Stack` col/row, `Text` heading/body/caption, `Alert`, `Button` locked + fresh unlocked) plus identical dispatched `action` payloads (`approve_release`, `rollback_release`).
- **Security audit**: `pnpm audit --audit-level=high` exits 0 (0 high, 0 critical; zero changes to `pnpm-workspace.yaml`).
- **Native host guardrail**: `scripts/native-hosts.test.mjs` confirms zero HTML elements in any module React Native can load.

## Recommendation for Phase 2 (`#2251`)

If Phase 2 (`@hozo/a2ui`) is approved after the Phase 1 checkpoint:

1. **Ship Hozo's own minimal, DOM-free A2UI v1.0 (+ v0.9.1) renderer and catalog in `@hozo/a2ui`** instead of wrapping `@a2ui/react` + `a2ui-react-native-renderer`. It avoids Zod 3 (`GHSA-mrhx-c7xc-m3w5`), `lit`, `<a2ui-react-*>` Custom Elements, and maintaining two divergent catalogs.
2. **Fix [#2273](https://github.com/iray-tno/hozo/issues/2273) (`TransitionPressable` stale `colorRanges`)** before promoting live agent-driven buttons on Native, and tighten `check-native-parity.test.mjs` to assert in-place `backgroundColor` parity across `disabled` transitions.
3. **Evaluate `#2251`'s adoption stop condition** before committing a Phase 2–4 PR budget: this spike proves the technical fit is clean (~1k LOC runtime, exact Web/Native token parity), so the remaining question for `#2251` is strictly strategic priority and external A2UI adoption.
