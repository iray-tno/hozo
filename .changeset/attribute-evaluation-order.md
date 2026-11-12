---
"@hozo/compiler": patch
---

An element's attribute values now run once each, in the order they were written, on Web and Native. The compiled output wrote attributes grouped by kind: a `className={opaque()}` ran before an earlier `accessibilityLabel={before()}`, and `testID` before an earlier `accessibilityLabel`. Some values were also copied into several attributes, so `disabled={isDisabled()}` ran twice on Native and up to five times on a Web `Link`. Such an element now evaluates its values first, in source order, and reads them from there.
