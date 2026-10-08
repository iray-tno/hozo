---
"@hozo/ui": patch
---

`Pagination`'s controls are now `inline-flex`, so their 36px minimum size also applies to the link version (`getPageHref`). Before, an `<a>` was inline, and its targets came out about 21×17px.
