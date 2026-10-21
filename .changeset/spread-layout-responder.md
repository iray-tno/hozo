---
"@hozo/primitives": patch
"@hozo/engine": patch
---

On the Web, a spread onto a compiled `View`, `Text` or `Image` keeps the props that need the element.

- **`onLayout`** is called on mount and when the layout changes, as it is uncompiled. It is not called again on a re-render.
- **The responder props** (`onStartShouldSetResponder`, `onResponderGrant`, `onResponderMove`, …) claim and release the pointer on a `View`.
- **An `Image` whose `src` fails to load falls back to `defaultSource`.**

Before this, these reached the DOM raw and did nothing. The spread's translation now adds a callback ref when the spread carries one of them. `@hozo/engine` exports `createSpreadResponder` for it: the responder without a hook.
