---
'@hozo/patterns': patch
---

On React Native, `Accordion` and `Tabs` now draw a panel whose `content` is a string. The string sat bare in a `View`, so the panel came out empty. It is now wrapped in a `Text` that carries the panel's text classes.
