---
'@hozo/compiler': patch
---

React Native diagnostics now name a variant the way it is written in the class. They used the compiler's internal style-key form, so a refusal read `group-ariachecked:`, `hashover:` or `not-focusvisible:`, and every `data-*` variant was called `data:`. They now read `group-aria-checked:`, `has-hover:`, `not-focus-visible:` and `data-[state=open]:`. Width and container thresholds are named in their bracket form, such as `min-[768px]`, because the compiler has already resolved the breakpoint name to pixels by then.
