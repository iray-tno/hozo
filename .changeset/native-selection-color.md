---
'@hozo/compiler': patch
---

`selection:bg-*` now works on a React Native `TextInput`. It lowers to the field's `selectionColor` prop, the highlight behind selected text, and `dark:selection:bg-*` switches it with the colour scheme. A `selectionColor` you write yourself still wins. Other utilities under `selection:`, such as `selection:text-*`, are still refused, because React Native has no prop to carry them. On iOS, `selectionColor` also tints the cursor and the selection handles; that is the platform's own behaviour.
