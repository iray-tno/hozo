# A text size with its own line height

Continues #1230, compound typography, above
[relative leading and tracking](tailwind-relative-text-order.md). A parsing
fix; policy **scalar-order-v32** so no cached plan carries the old parse.

## What was wrong

`text-lg/7` fell through the text-size table and the text-colour path read
it as the colour `lg` at 7% opacity: `color: color-mix(in oklab,
var(--hozo-color-lg) 7%, transparent)`, a colour that resolves to nothing,
and no font size at all. Tailwind 4 reads it as `text-lg` with a 28px line
height; `text-lg/tight` and `text-lg/[3rem]` likewise. In the Chromium oracle
`text-lg/7` alone drew 16px text with `normal` line height where Tailwind
draws 18px over 28px.

## What changed

The base utility parser tries `text-<size>/<modifier>` as a size whose line
height is `leading-<modifier>` before the colour path. Tailwind writes that
line height as a plain `line-height`, not through `--tw-leading`, so it has
a text size's provenance (`LineHeight::FontDefault`): a later `text-sm`
replaces it and any `leading-*` beats it. A ratio modifier is sized against
this utility's own font size. `text-red-500/50` is still a colour with
opacity.

`portable-order.test.ts` had pinned `text-lg/6` as `unmapped-property`,
which was the colour misparse against a rule declaring `font-size` and
`line-height`. It now asserts the two writes map to those properties.

## Not covered

A text size's own line height is absolute in Hozo and a ratio in Tailwind;
listed in the [gaps index](tailwind-known-gaps.md).

## Verification

- **Chromium, real Tailwind as the oracle**: 10 inputs (`text-lg/7` alone
  and against `text-sm`, `leading-tight`, another slash size; `/tight`,
  `/[3rem]`, `/none`, `md:`) in both orders, 500/1000px, LTR/RTL, reading
  computed `font-size`, `line-height`, `color`. **80 of 80 agree.** Before the
  fix, `text-lg/7` alone disagreed in all 8 observations (16px, `normal`).
- `text-slash-order.test.ts`: 7 inputs give identical Web and Native output
  in both orders; `text-lg/7` is `font-size: 18px` with no colour on Web
  and `fontSize: 18`, `lineHeight: 28` on Native.
- Parser: `text-lg/7` and `text-lg/tight` expand to a font size and a
  fallback line height; `text-red-500/50` stays a colour.
