---
"@hozo/compiler": patch
---

Web candidate stylesheets generated without a project order now use the compiler's built-in Tailwind order. Numeric utilities, breakpoints, and overlapping states no longer fall back to alphabetical precedence.
