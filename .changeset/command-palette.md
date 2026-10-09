---
"@hozo/patterns": minor
"@hozo/behaviors": minor
"@hozo/ui": minor
"@hozo/core": minor
"@hozo/compiler": minor
---

Add `CommandPalette` and `useCommandShortcut`.

**`CommandPalette`** is a searchable list of commands in a modal.
- On the Web it is a dialog holding a combobox and a grouped listbox. The arrow keys move through the matching commands while focus stays in the field (`aria-activedescendant`), Enter runs one, and Escape closes it and returns focus.
- On React Native it is a full-screen modal with a button per command.
- On both platforms, matches are ranked (starts with, then a word that starts with, then contains, then the letters in order), and the number of matches is announced as the query narrows them.
- The headless version lives in `@hozo/patterns` and the look in `@hozo/ui`.

**`useCommandShortcut`** (`@hozo/behaviors`) calls a function for ⌘K on a Mac and Ctrl+K elsewhere. It does nothing on React Native.
