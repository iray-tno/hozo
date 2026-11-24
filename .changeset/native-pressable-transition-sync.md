---
'@hozo/primitives': patch
---

Fix React Native `HozoPressable` transitions (`TransitionPressable`) leaving `backgroundColor`, `opacity`, and `transform` stuck at their initial mount values when a prop or theme change (such as toggling `disabled` or switching colour scheme) updates the resolved style without a pointer or focus event.
