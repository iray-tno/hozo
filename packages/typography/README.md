# @hozo/typography

Universal typography, semantic inline formatting, and accessible CJK ruby primitives for Hozo.

```tsx
import {
  Text,
  Paragraph,
  Heading,
  Strong,
  Emphasis,
  Underline,
  Strikethrough,
  Code,
  NoBreak,
  Ruby,
  Rt,
} from '@hozo/typography'

export function ArticlePreview() {
  return (
    <Paragraph>
      <Heading level={2}>
        <Ruby accessibilityLabel="かんじ">
          漢字<Rt>かんじ</Rt>
        </Ruby>
      </Heading>
      <Strong>Bold importance</Strong> and <Emphasis>stress emphasis</Emphasis>.
      Speed limit is <NoBreak>100 km/h</NoBreak>.
    </Paragraph>
  )
}
```

## Features

- **Semantic Web HTML**: Lowers to `<strong>`, `<em>`, `<u>`, `<s>`, `<sub>`, `<sup>`, `<code>`, `<small>`, `<mark>`, `<ruby>`, `<rt>`, and `<span style="white-space: nowrap">`.
- **React Native Text Styles**: Lowers to `<Text>` with bold font weights, italic styles, underline/line-through text decorations, and monospace font families.
- **NoBreak on Native**: Automatically transforms standard space characters (`' '`) into non-breaking Unicode spaces (`\u00A0`) inside child text nodes.
- **Accessible CJK Ruby**: Provides visual furigana while allowing parent `accessibilityLabel` annotations to suppress duplicate screen-reader speech on VoiceOver and TalkBack.
