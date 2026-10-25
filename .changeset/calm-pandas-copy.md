---
'@hozo/patterns': patch
---

Keep CodeBlock's copy status region mounted before updating its message so NVDA can announce completion. Repeated copies update the same region with a fresh message node, and changed content or clipboard connections retire feedback.
