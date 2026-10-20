---
"@hozo/primitives": patch
---

A `Button` forwards what a wrapper needs to make it a trigger. That means `Tooltip` now opens around a `Button`, including `@hozo/ui`'s, whether it is compiled or not.

- On the Web: `ref`, `onFocus`, `onBlur`, `onKeyDown`, `onPointerEnter`, `onPointerLeave` and `aria-describedby`.
- On React Native: `ref`, `onFocus`, `onBlur`, `onHoverIn`, `onHoverOut` and `onLongPress`.

Before this, the uncompiled `Button` and the translation of a spread onto a compiled one both dropped these props. Other props it does not name are still not forwarded.
