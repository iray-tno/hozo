---
"@hozo/compiler": patch
"@hozo/engine": patch
---

On React Native, a `style` passed through a spread now wins the inline edges it writes over the element's classes, as a named `style` does since the previous release. `<Button style={{ paddingRight: 24 }} />` used to keep the button's `px-*` padding on that side, because the wrapper hands `style` on with `{...rest}` and Yoga prefers the class's `paddingEnd` to `paddingRight`.
