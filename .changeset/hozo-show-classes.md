---
"@hozo/cli": minor
---

`hozo show` now reports each class list in the file. For each list it gives the route: compiled, compiled under a condition, or resolved at runtime because the compiler cannot read it. For each class it says what became of it on the Web and on Native:

- **compiled**;
- **not-generated**: the theme has no Tailwind rule for it, so the class compiles to nothing;
- **refused** or **not-wired** on Native: the compiler's reason is given;
- **passed-through**: not a Tailwind class. The Web keeps it for the project's own CSS.

The text report lists only the classes that did not compile everywhere. The JSON has every class under `classLists`.
