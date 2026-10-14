---
"@hozo/primitives": patch
"@hozo/engine": patch
"@hozo/svg": patch
"@hozo/canvas": patch
"@hozo/patterns": patch
"@hozo/form": patch
---

Uncompiled View, Text and Image forward refs to their platform hosts. Container measurement preserves the host instead of replacing it, and Web View layout defaults agree between compiled output and fallback components.

An uncompiled Svg now uses its accessibility label as its name, as the compiled path already did. Web controls, including generated Canvas controls and form/pattern actions, show the shared clickable cursor without giving disabled controls an active pointer.
