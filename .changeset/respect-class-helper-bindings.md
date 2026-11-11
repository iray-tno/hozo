---
'@hozo/compiler': patch
---

Resolve class helper calls through their imported bindings so parameters and local functions with the same name keep their own behavior. Apply the binding check to helper discovery and Native text forwarding.
