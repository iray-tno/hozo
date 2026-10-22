---
title: "Typography & Font Assets (@hozo/typography)"
description: "Semantic text formatting, accessible CJK ruby annotations, inherited relative scaling, and static font asset manifests."
sidebar:
  order: 5
---

`@hozo/typography` provides Hozo's text-level semantics, accessible CJK ruby annotations, and static font registration manifests across Web, iOS, and Android.

```tsx
import {
  Code,
  Del,
  Emphasis,
  Heading,
  Link,
  Mark,
  NoBreak,
  Paragraph,
  Ruby,
  RubyText,
  Small,
  Strong,
  Sub,
  Sup,
  Text,
  Underline,
} from '@hozo/typography'
```

All typography primitives are re-exported from `@hozo/core` and lowered at build time (see the [Primitives reference](../primitives/) for the exact Web and React Native output of each tag).

## Accessible CJK Ruby (`Ruby` & `RubyText`)

On the Web, `<Ruby>` and `<RubyText>` compile to native `<ruby>` and `<rt>` elements. On React Native, which has no ruby layout engine, Hozo renders visual furigana above the base characters while using `accessibilityLabel` on `<Ruby>` so VoiceOver and TalkBack read the word once rather than speaking the kanji and the kana reading back-to-back:

```tsx
<Ruby accessibilityLabel="かんじ">
  漢字<RubyText>かんじ</RubyText>
</Ruby>
```

## Non-breaking runs (`NoBreak`)

`<NoBreak>` compiles to `<span style={{ whiteSpace: 'nowrap' }}>` on the Web and automatically converts ASCII spaces into non-breaking Unicode spaces (`\u00A0`) on React Native so units and compound terms (`100 km/h`, `React Native`) stay together across line wraps.

## Static font manifests (`@hozo/typography/fonts`)

Font selection (`fontFamily`) and font registration are separate concerns. `@hozo/typography/fonts` lets you declare your font inventory once without side effects at module import time, and derive Web `@font-face` CSS, compiler diagnostics, Expo config plugin options, and bare React Native registration plans from that single manifest:

```ts
// src/fonts.ts
import {
  createFontAvailability,
  createFontFaceCss,
  defineFonts,
  fontFamily,
} from '@hozo/typography/fonts'

export const fonts = defineFonts({
  body: {
    family: 'Inter',
    nativeFamily: { ios: 'InterVariable', android: 'inter' },
    faces: [
      {
        sources: {
          web: [{ url: new URL('./Inter.woff2', import.meta.url).href, format: 'woff2' }],
          ios: './assets/Inter.ttf',
          android: './assets/Inter.ttf',
        },
        weight: '100 900',
      },
    ],
  },
})
```

### Connecting the manifest to your build and native projects

1. **Bundler integration (Web CSS + compile-time diagnostics):**
   ```ts
   hozo({
     fontFaceCss: createFontFaceCss(fonts),
     fontAvailability: createFontAvailability(fonts),
   })
   ```
   When `fontAvailability` is provided, the compiler checks literal managed font declarations and emits `FONT_FAMILY_NOT_REGISTERED` or `FONT_VARIANT_NOT_REGISTERED` when a component requests a weight, style, or platform that your manifest does not provide.
2. **Expo (`@hozo/typography/fonts/expo`):** pass `createExpoFontOptions(fonts)` to the official `expo-font` plugin in `app.config.ts`.
3. **Bare React Native (`@hozo/typography/fonts/native`):** call `createNativeFontPlan(fonts, 'ios' | 'android')` to inspect or assert the exact `files` and `families` descriptors your native project must link.
4. **Migration Audit (`@hozo/migration-audit`):** export `JSON.stringify(createFontAvailability(fonts))` and pass `--font-availability hozo-font-availability.json` to audit an entire repository for unregistered font variants.
