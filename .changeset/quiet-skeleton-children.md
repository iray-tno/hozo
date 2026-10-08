---
"@hozo/compiler": patch
---

On Native, an animation inside a `Skeleton` now stops under reduced motion, as it already did on Web. Before this, only the skeleton's own animation was guarded, so a spinner placed inside a placeholder kept spinning.
