---
"@hozo/cli": patch
---

`hozo init` edits Next.js and Metro configs as well: the exported expression is wrapped in `withHozo(…, { css })`, with the import or `require` added in the file's own style, and an Expo project with no `metro.config.js` gets one built on `expo/metro-config`. Next.js beside Tailwind's PostCSS plugin uses its `app/globals.css` and turns Hozo's preflight off. The diffs `hozo add` and `hozo init` print now show a changed line's old text before its new text, as `diff -u` does.
