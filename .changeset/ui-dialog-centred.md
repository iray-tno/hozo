---
'@hozo/ui': patch
---

`Dialog` centres itself on the Web with `m-auto`. A modal `<dialog>` relies on the browser's `margin: auto`, which Tailwind's preflight and other margin resets zero, so it opened in the top-left corner.
