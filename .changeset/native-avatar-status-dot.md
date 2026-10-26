---
'@hozo/patterns': patch
'@hozo/ui': patch
---

On React Native, `Avatar` no longer clips its status dot. The avatar clipped everything inside it to its own corners, so a dot on a round avatar's edge was cut to a sliver. The picture now takes the avatar's corners itself, and the avatar does not clip. `@hozo/ui`'s Avatar rounds its picture on the Web too, which did not clip either.
