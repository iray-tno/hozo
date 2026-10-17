---
"@hozo/compiler": patch
"@hozo/ui": patch
---

A Text nested in `@hozo/ui`'s `Checkbox` or `Switch` now gets its label text styles on Native, as one in `Button` and `Alert` already did. The manifest extractor reads `@hozo/patterns`' Checkbox and Switch as hosts, and takes a `disabled` left in the rest spread as the caller's, so `disabled:` text follows the caller's own `disabled`.
