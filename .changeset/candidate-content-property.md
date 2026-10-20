---
"@hozo/compiler": patch
---

A `before:` or `after:` class that reaches the page only through the candidate stylesheet now draws its pseudo-element. The rule writes `content: var(--hozo-content)`, and the `@property` that gives it an initial value of `""` was emitted only beside a lowered file that used one. A class list passed to a plain element at runtime, such as a `BottomSheet`'s grabber, had no such file, so the bar was never drawn.
