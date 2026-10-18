---
"@hozo/compiler": patch
---

On Native, when a prop between two spreads is written in a form Hozo does not take apart (an entity in a string, an element as the value), the element now raises `UNSAFE_PROP_SPREAD_AFTER_STYLE` at that prop. Its compiled `style` could not be composed with the spreads there, so a `style` they carry replaces it; this used to happen silently.
