---
"@hozo/patterns": minor
"@hozo/ui": minor
"@hozo/core": minor
"@hozo/compiler": minor
"@hozo/behaviors": minor
---

Add `ColorPicker`. It offers:
- preset swatches as a radio group;
- hue, saturation and lightness (and opacity, with `alpha`) as ordinary sliders rather than a two-dimensional square, which a keyboard and a screen reader can reach but not operate;
- a hex field;
- on the Web, an optional eyedropper where the browser has one.

Every colour is read named and numbered, for example "dark blue, #1e3a8a", and the names go through the i18n connection. `Slider` on the Web now also takes a track `style`.
