---
"@hozo/compiler": patch
"@hozo/primitives": patch
"@hozo/core": patch
---

Lower Tailwind `first-letter:` inline typography, colour, background, decoration, and opacity utilities on React Native text primitives by splitting literal text at compile time into a nested `<Text>` span (and using `HozoFirstLetter` for dynamic children), while continuing to refuse non-inline box/layout properties.
