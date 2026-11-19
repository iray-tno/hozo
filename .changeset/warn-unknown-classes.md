---
"@hozo/engine": minor
"@hozo/compiler": minor
"@hozo/metro": minor
"@hozo/vite": patch
---

On React Native, a development build now warns once about each class it is handed at run time and cannot find in the project's class map, such as `` `bg-${color}-500` `` with a colour the build never saw. Before, such a class just did not apply, with no message. Release builds do not warn.

Some names are meant to mark an element rather than style it, such as `js-row` or a name a test selects by. List those in the new `markerClasses` option, as exact names or as prefixes ending in `*`, and they are not warned about. Tailwind's own `group` and `peer` never need listing. The build-time `CLASS_NOT_IN_RUNTIME_MAP` check skips declared markers too.
