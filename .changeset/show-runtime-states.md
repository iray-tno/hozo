---
"@hozo/cli": patch
"@hozo/compiler": minor
---

`hozo show` now says when a Pressable, Link or TextInput resolves a class list it cannot read with its own state on Native, as it already did for a pattern owner. It also lists an unread secondary class list such as a Menu's `itemClassName={cls}` with `--web`, under its own prop.

From the compiler:

- On Native, `tailwindPlan` includes `runtimeStates` when there are any.
- The Web now warns `DYNAMIC_CLASS_NAME_NOT_RESOLVED` for an unread secondary class list, as it does for `className`.
- On both backends, that warning points at the list's attribute rather than its element.
