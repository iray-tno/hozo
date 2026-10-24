---
'@hozo/behaviors': patch
'@hozo/patterns': patch
---

Share BottomSheet drag capture, frame coalescing and cancellation through useDrag1D on Web and Native. Settle from the final release position and velocity, restore the starting detent on cancellation, and discard pending movement when closing or unmounting. Keep handle taps and keyboard activation separate from the click generated after a drag.

Expose drag velocity details, an optional geometry validation callback and a Native movement threshold without changing existing delta-only callbacks.
