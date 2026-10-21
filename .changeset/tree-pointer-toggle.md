---
"@hozo/patterns": patch
"@hozo/ui": patch
---

A `Tree` branch can be opened and closed with a pointer. By default a press on a branch row now selects it and opens or closes it, on both platforms. Before this, the Web half only selected and the Native half only toggled.

`toggleOn="marker"` makes only the marker open and close, for a `+` box or for a tree whose branches are things to choose. On React Native the row then offers expand and collapse as accessibility actions. `renderRow` receives a `toggle` for a marker it draws itself. `@hozo/ui`'s `Tree`, whose marker is a chevron, keeps the row behaviour.
