---
"@hozo/patterns": patch
"@hozo/ui": patch
---

`Menu` and `Combobox` take `defaultOpen`, on Web and Native, as `Popover` and `Tooltip` already did: the menu opens with its first enabled item active, the combobox with its list showing and nothing active.

`@hozo/ui`'s `CommandPalette` draws a focus ring on its field, inset so the panel does not clip it, and its shortcut hints are `text-hozo-text-muted`: on the active row, `text-hozo-text-subtle` was 4.26:1 in light.
