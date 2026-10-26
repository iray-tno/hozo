---
'@hozo/ui': patch
---

On React Native, `SegmentedControl` shows its whole labels. Each segment was `flex-1`, and Yoga sized a strip with no width of its own from those zero bases, so each label showed one letter. Segments are now `flex-auto`: as wide as their label, sharing any width the strip is given beyond that. On the Web a segment now also starts from its label width instead of an equal share.
