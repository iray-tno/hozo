---
"@hozo/compiler": patch
---

A `<Listbox>` with no `accessibilityLabel` (and no spread that might carry one) now raises `A11Y_MISSING_ACCESSIBLE_NAME`, as `OtpInput` and `ColorPicker` do: on both platforms its options were announced under no name.
