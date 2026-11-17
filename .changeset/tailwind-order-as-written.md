---
'@hozo/compiler': patch
---

New warning, `TAILWIND_ORDER_AS_WRITTEN`. Hozo puts a class list in Tailwind's order, except around a class it cannot rank, such as an arbitrary value or a class defined in your own CSS. There, it keeps the order the classes were written in. When that leaves two classes setting the same property under the same condition, the one written last applies, which may not be the one Tailwind would apply. The build now says so and names both classes. Previously this happened silently. To fix it, remove the class that should not apply.
