---
"@hozo/compiler": patch
"@hozo/engine": patch
"@hozo/core": patch
---

On Native, a `style` a caller passes through a component's `{...rest}` no longer replaces the styles compiled from its classes: the two compose, classes first and the caller's style after, as the owner itself composes them. Elements whose spreads cannot carry `style` compile as before.
