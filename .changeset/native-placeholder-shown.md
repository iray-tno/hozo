---
'@hozo/compiler': patch
---

`placeholder-shown:` now works on a React Native `TextInput`, read from the field's own `placeholder` and `value` props. The style applies while there is a non-empty placeholder and the value is empty. A `null` or `undefined` value counts as empty. `not-placeholder-shown:` and stacks such as `md:placeholder-shown:` work too. A field with no placeholder never shows one, on either platform, so the style simply never applies there. A field with no `value` is still refused, because React Native gives no way to read what was typed into an uncontrolled field: pass the text as `value` to drive the style.
