---
"@hozo/compiler": patch
"@hozo/semantics": patch
"@hozo/patterns": patch
---

On the Web, a `<meter>` now carries its amount as a percentage in `aria-valuetext`, as Native already did. Without it, NVDA read `<Meter value={0.6}>` as "progress bar, 0.6" and VoiceOver as "0.6". An author's own `aria-valuetext` still wins.

A `Stepper` step's description is now separated from its status by a space a reader keeps. Before, VoiceOver read "completedEmail and password".
