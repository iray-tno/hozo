---
'@hozo/primitives': patch
---

`Button` takes `accessibilityState` and `aria-controls`, so a menu or disclosure trigger can say whether what it opens is open and which element that is. On the Web they become `aria-expanded` and its kin and `aria-controls`, compiled or not, named or spread. On React Native `accessibilityState` reaches the Pressable and `aria-controls` is dropped. `accessibilityState.disabled` disables the button as the `disabled` prop does.
