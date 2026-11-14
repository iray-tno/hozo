# `hozo add`: a copied `@hozo/ui` component and its callers

RFC 012 step 1. Before `hozo add` copies an `@hozo/ui` file into a project,
measure whether the copy compiles, and is called, the same as the package.
Baseline: `main` at `99510879` (2026-11-14), native addon rebuilt from it.

## Method

A temporary project with `@hozo/ui` installed as far as Metro reads it: its
`package.json` (with `hozo.manifest`) and the real `hozo.manifest.json`. Each
case goes through `@hozo/metro`'s `transform`, the way Metro runs it, after
`withHozo`.

- **The component**: every `.ts`/`.tsx` file of `packages/ui/src` except
  tests (43 files), compiled as `node_modules/@hozo/ui/src/<file>` and as
  `src/components/ui/<file>`, on `ios` and `android`.
- **The caller**: `src/caller.tsx` rendering each component with a
  `textForwarding` entry in the manifest (`Alert`, `Button`, `Checkbox`,
  `Stack`, `Switch`), with no props and with each prop's first value, around
  three children: `<Text>Label</Text>`, the string `Label`, and
  `<View><Text>Label</Text></View>`. Once importing from `'@hozo/ui'`, once
  from `'./components/ui/<file>'`, on `ios`, `android` and `web` (Metro's
  React Native for Web target). The import line is normalised before
  comparing.

## Result

**The component is the same.** All 86 outputs are identical at either path,
once the relative import of the project's candidate module is resolved (it
is the same file, `node_modules/.hozo/candidates.native.js`, reached from two
directories). 40 of the 86 are lowered; the other 46 are left as written
because their classes go to a pattern (`accordion.tsx`, `tabs.tsx`,
`tooltip.tsx`, …), which resolves them on device. Pinned by
`packages/metro/src/copied-component.test.ts`.

**The caller is not.** 33 cases per platform:

| Children | Same | Differ |
| --- | --- | --- |
| `<Text>Label</Text>` | 4 (`Stack`) | 7 (`Alert` ×2, `Button` ×3, `Checkbox`, `Switch`) |
| `<View><Text>Label</Text></View>` | 4 (`Stack`) | 7 (as above) |
| `Label` | 11 | 0 |

The same 14 differ on `ios`, `android` and `web`. In every one, the package
caller's nested `Text` gets the component's text classes and the copy
caller's gets none:

```tsx
// import { Button } from '@hozo/ui'
const hozoStyles = StyleSheet.create({
  hozo_r0_0: { fontWeight: '600', color: …, fontSize: 14, lineHeight: 20 },
})
<Button><Text style={hozoStyles.hozo_r0_0}>Label</Text></Button>

// import { Button } from './components/ui/button'
<Button><Text>Label</Text></Button>
```

So on a device, a label written as a `Text` inside a copied `Button` loses
the button's weight, size and colour. A string child is unaffected: the
primitive wraps it itself. `Stack` is the same both ways because its variants
carry no text classes.

## Cause

Text forwarding (RFC 010's F6) is the fact "what this component hands a
nested `Text`". Metro gets it only from a dependency's manifest
(`dependencyTextForwarding` in `@hozo/compiler/manifest`), keyed by the
package name the caller imports. A copy is project code: there is no
manifest, and the caller's import is a relative path the table has no key
for.

The DOM Web backend is not affected: `hozo_web` does not read forwarding,
because the browser inherits text styles itself, and Vite, Next and Astro
never set it. No caller output there depends on whether the component is
copied.

## Not measured here

- The pixels on a device. The difference above is in the compiled output;
  that a `Text` with no style renders without the button's text style is
  React Native's ordinary behaviour, not observed for this report.
- The candidate module's contents. Both placements are inside a scanned root
  (project `src`, and `@hozo/ui`'s sources via the package walk), so the
  classes the 46 pattern-routed files request at run time should be present
  either way; RFC 012 step 2's exit (`pnpm test` in a project after `add`)
  covers it.
