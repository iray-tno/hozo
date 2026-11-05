---
"@hozo/compiler": patch
"@hozo/tailwind": patch
---

Deliver referenced Web theme declarations and their variable dependencies at the root scope. Runtime theme switches now update ordinary aliases in builds that read the theme entry without bundling it. Inline and reference-only theme modes keep Tailwind's variable-resolution behavior.
