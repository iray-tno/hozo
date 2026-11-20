---
'@hozo/compiler': patch
---

The Native runtime class map no longer gives a candidate a made-up colour when the project's theme does not define the colour it names. Discovery reads `boxSizing: 'border-box'` as the class `border-box`, a border colour `box`, and every app's map held `borderColor: 'hozo-unresolved:box'`. Such a class is now listed as unsupported, with a warning that names the missing `--color-*` if something does use it. A theme that defines the colour resolves it as before, and a static `className` keeps its loud marker.
