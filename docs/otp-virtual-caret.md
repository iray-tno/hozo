# OTP virtual caret

OTP/PIN still uses one real field for editing, paste and autofill. Its cells
remain inaccessible decoration. A steady virtual bar now follows a reported
collapsed selection while focused, on both Web and Native. `showCaret={false}`
opts out; disabled/readOnly and blur hide it. `readOnly` prevents editing
without declaring the field disabled.

Selections use UTF-16 offsets; cells use code points. At the end of a full
code the bar goes after the last character, including masked dots. Moving
the real insertion position moves the active cell; selecting a range hides
the bar. The bar is hidden from accessibility and cannot receive pointer hits.

The component does not force selection or guess where sanitization/autofill
put it. It hides the bar after a value change until the host reports selection
for the current value. Before Native delivers onSelectionChange, the existing
next-character highlight remains but no invented cursor is displayed. Web
reads selection on focus and onSelect; Native observes onSelectionChange.

No blink, timers, motion, global listeners or layout measurements are added.
The bar inherits cell text styling; its placement is a virtual cell cue,
not pixel-exact font-metric emulation of the operating system's caret.
Rule/host tests cover both implementations, but physical selection event
delivery, pixels and assistive technology remain device evidence.
