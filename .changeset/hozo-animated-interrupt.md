---
'@hozo/engine': patch
---

An interrupted `HozoAnimated` transition now starts from where its numbers had got to (opacity, and the position and size keys its spec names), rather than jumping to the previous target first. A panel closed halfway through opening shrinks from its current height.
