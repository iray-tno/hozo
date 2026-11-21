---
'@hozo/compiler': patch
'@hozo/primitives': patch
---

`group-hover:`, `group-focus:`, `group-focus-visible:` and `group-pressed:` now work on a `View` inside a `Pressable`, `Button` or `Link` on React Native, as they already did on a `Text`. Before, a `group` card could restyle its label but not the box beside it, and the build refused the View with a message saying nothing above it was a Pressable. A `group-*:` the Pressable does not hand down, such as `group-aria-checked:`, is still refused, now with a message that says which state is missing instead of claiming there is no Pressable.
