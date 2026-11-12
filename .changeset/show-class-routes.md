---
"@hozo/cli": minor
"@hozo/compiler": minor
---

`hozo show` now gives two more routes a class list can take:

- **owner-callback**: on Native, the list is compiled into a callback that its pattern owner, such as a Chip or a Menu's items, applies with its own state.
- **component**: the list is handed to a component the compiler does not lower, such as `@hozo/ui`'s `Button`, which resolves it. Before, such a list was not reported at all.

Both come from new compiler evidence:

- On Native, `tailwindPlan` now includes `ownerCallbacks` when there are any.
- A compiler gains `componentClassLists(source)`, read from the same parse `compileNative` lowers.
