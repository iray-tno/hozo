# @hozo/typography

Universal typography, semantic text formatting, relative text scaling, and accessible CJK ruby primitives for Hozo.

```tsx
import {
  Text,
  Paragraph,
  Heading,
  Strong,
  Emphasis,
  Underline,
  Strikethrough,
  Del,
  Sub,
  Sup,
  Code,
  Small,
  Mark,
  NoBreak,
  Ruby,
  RubyText,
  Link,
} from '@hozo/typography'

export function ArticlePreview() {
  return (
    <Paragraph>
      <Heading level={2}>
        <Ruby accessibilityLabel="かんじ">
          漢字<RubyText>かんじ</RubyText>
        </Ruby>
      </Heading>
      <Strong>Bold importance</Strong> and <Emphasis>stress emphasis</Emphasis>.
      Speed limit is <NoBreak>100 km/h</NoBreak>.
      Read more at <Link href="/details" external>documentation</Link>.
    </Paragraph>
  )
}
```

## Component Catalog

### 1. Structural Typography
- **`Heading`**: Document headings with `level={1 | 2 | 3 | 4 | 5 | 6}` (default `1`). Web lowers to `<h1>`–`<h6>`; Native lowers to `<Text accessibilityRole="header">`.
- **`Paragraph`**: Semantic prose paragraph. Web lowers to `<p>`; Native lowers to `<Text>`.
- **`Text`**: Foundational inline text container. Web lowers to `<span>`; Native lowers to `<Text>`.

### 2. Semantic Inline Formatting
- **`Strong`**: High importance text. Web lowers to `<strong>`; Native lowers to `<Text>` with bold font weight.
- **`Emphasis`**: Stress emphasis text. Web lowers to `<em>`; Native lowers to `<Text>` with italic font style.
- **`Underline`**: Underlined text. Web lowers to `<u>`; Native lowers to `<Text>` with underline text decoration.
- **`Strikethrough` / `Del`**: Strikethrough / deleted text. Web lowers to `<s>`; Native lowers to `<Text>` with line-through text decoration.
- **`Sub` / `Sup`**: Subscript and superscript text. Web lowers to `<sub>` and `<sup>`; Native applies relative typography scaling and vertical alignments.
- **`Code`**: Inline computer code. Web lowers to `<code>`; Native applies monospace font family.
- **`Small`**: Side-comments / small print. Web lowers to `<small>`; Native lowers with reduced relative font size ratio.
- **`Mark`**: Highlighted / marked text. Web lowers to `<mark>`; Native applies highlight background color.
- **`NoBreak`**: Inline text with nowrap protection. Web lowers with `white-space: nowrap`; Native automatically converts ASCII spaces to non-breaking Unicode spaces (`\u00A0`).

### 3. Accessible CJK Ruby
- **`Ruby` / `RubyText`**: Phonetic CJK annotations (furigana). Accessible via `RubyText` or `Ruby.RubyText`. Web lowers to standard `<ruby>` and `<rt>`. Native provides visual furigana while allowing parent `accessibilityLabel` annotations to suppress duplicate speech output on screen readers (VoiceOver & TalkBack).

### 4. Universal Links
- **`Link`**: Accessible cross-platform hyperlink. Supports `href`, `target`, `rel`, `external`, and `onPress`. Web lowers to `<a href="...">`; Native lowers to an accessible Pressable text with link role.

## Features

- **Semantic Web HTML**: Direct compiler lowering to real HTML5 typography and text-level semantics, completely free of `react-native-web`.
- **Zero Runtime Foundation**: Primitives compile away at build time, with pure React fallbacks when running uncompiled.
- **Relative Typography Scaling**: Built-in support for proportional text sizing (`text-sm`, `text-lg`, etc.) and parent-relative ratio calculations that stay synchronized between CSS and React Native styles.
## Font assets

Font selection (`fontFamily`) and font availability are separate. Define the latter once without
registering anything at module import time:

```ts
import { createFontFaceCss, defineFonts, fontFamily } from '@hozo/typography/fonts'

export const fonts = defineFonts({
  body: {
    family: 'Inter',
    nativeFamily: { ios: 'InterVariable', android: 'inter' },
    faces: [{
      sources: {
        web: [{ url: new URL('./Inter.woff2', import.meta.url).href, format: 'woff2' }],
        ios: './assets/Inter.ttf',
        android: './assets/Inter.ttf'
      },
      weight: '100 900'
    }]
  }
})

createFontFaceCss(fonts) // deterministic CSS for the Web build
fontFamily(fonts, 'body', 'ios') // "InterVariable"
```

Pass the generated CSS to Hozo's Vite, TanStack Start, Storybook, Next, or Metro integration. It is
written once into the project-wide base stylesheet and loaded before generated utilities:

```ts
hozo({ fontFaceCss: createFontFaceCss(fonts) })
```

Mark a platform as `external` when `next/font`, global CSS, Expo startup code, or native asset
linking already owns it. Such entries generate no duplicate registration and have no runtime cost.

For Expo, derive the options consumed by its official `expo-font` config plugin from the same
manifest. Hozo does not install or wrap Expo:

```ts
// app.config.ts
import { createExpoFontOptions } from '@hozo/typography/fonts/expo'
import { fonts } from './fonts'

export default {
  expo: {
    plugins: [['expo-font', createExpoFontOptions(fonts)]]
  }
}
```

iOS receives its font file list; Android receives named XML families with explicit weight/style
faces. Variable-weight and oblique Android faces are refused because Expo's Android configuration
cannot represent them without silently changing their meaning.
