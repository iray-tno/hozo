---
'@hozo/compiler': patch
---

On React Native, `first-of-type:`, `last-of-type:`, `only-of-type:`, `nth-of-type-*:` and `nth-last-of-type-*:` are now refused for the reason that actually applies: React Native has no tags to count. The message used to say the element's position among its siblings could not be seen, even where it could, so restructuring the JSX never helped. It now points to `first:`, `last:`, `only:` and `nth-*:`, which work on both platforms.
