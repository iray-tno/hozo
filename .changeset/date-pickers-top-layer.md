---
"@hozo/form": patch
---

On the Web, `DatePicker`, `DateRangePicker` and `DateTimePicker` open their calendar in the top layer. The panel was fixed-positioned with no stacking of its own, so positioned content later in the page, such as a code block below the picker, painted over it.
