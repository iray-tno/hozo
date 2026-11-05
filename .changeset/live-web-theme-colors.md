---
"@hozo/compiler": patch
"@hozo/tailwind": patch
---

Keep Web color utilities connected to project-defined Tailwind theme variables, including opacity-modified colors. CSS selectors can change those colors at runtime. For projects that only read the theme at build time, the declared color becomes the CSS fallback.
