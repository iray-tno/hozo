---
"@hozo/ui": patch
---

On the Web, a `Stepper`'s step numbers and an `OtpInput`'s characters are centred in their boxes, and a step's indicator keeps its size. Their class lists lacked `flex`. A React Native View has it by default, but the `<li>`, `<button>` and `<span>` the Web renders do not. A test now checks every class list in the package that arranges children for `flex` or `grid`.

`useFormSubmit` is re-exported from `@hozo/ui`. A `Button` is not a submit button, so this hook is how it submits the `Form` it is in, and it no longer needs `@hozo/form` installed beside it.
