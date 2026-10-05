# Shared showcase demos

Private, source-only example package for the Web Storybook and Expo Native
showcase. The hosts own their Storybook version, decorators, platform focus
treatment, scrolling and bundler configuration. This package owns the actual
button, typography, form, preferences (checkbox/switch), tabs, confirmation
dialog and SVG filter examples, without DOM or React Native imports. The dialog has closed
and initially-open stories in both hosts; the latter also audits its initial
reading order. Its opener ref uses the host's Pressable instance rather than
an HTMLElement or React Native-specific type.

It is a workspace dependency rather than a relative import into another app:
Turbo can invalidate both hosts when a shared demo changes. Both hosts must
resolve hooks to their renderer's React (Vite deduplication / Metro singleton
resolution); the demo package's development React is not another renderer.

For device setup, see [the Native showcase](../native-showcase/README.md).

## SVG filters

`SvgFiltersDemo` is shared by Web's **Showcase / Shared Web and Native / Svg Filters**
and Native's **SVG / Shared filters / Filters**. Its toggle enables/disables the
same five scenes: grayscale, blur, drop shadow, a named-input shadow graph and
screen blend. Each mounted gallery scopes its filter IDs independently.

```sh
pnpm --filter @hozo/example-showcase test
```

This renders the actual `src/svg-filter-scene.tsx` through both the uncompiled
Web namespace and `lowerModule`, then captures both outputs in Chromium at
the same 96x96 viewport coordinates. Both on/off states must have **zero pixel
difference** across the two paths. Independent checks require a visible effect,
gray channels, blur outside the source, an offset red shadow, source-over-shadow
merge order and a magenta screen blend. Unit mutation checks reject equally
blank outputs, unchanged effects, lost offsets and reversed merge order.

Each `artifacts/svg-filters/run-*/` retains its 20 screenshots, the compiled scene
and `evidence.json` with source/compiled hashes; PR CI uploads these as
`svg-filter-web-evidence`, even after a
failed run. Missing Chrome fails CI (locally set `CHROME_PATH`). This is evidence
for these **five Chromium scenes**, not complete filter-property compatibility,
Safari/Firefox parity or Android/iOS rendering. Native currently has transform,
type and Metro bundle checks plus the interactive story; device pixel evidence
is a separate follow-up. The API coverage denominator is unchanged by this test.
