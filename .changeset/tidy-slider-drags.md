---
'@hozo/patterns': patch
---

Share Slider drag capture, frame coalescing and cancellation through useDrag1D on Web and Native. Keep track presses immediate and apply the final release position before committing, including controlled sliders and ColorPicker. Cancel queued movement when disabling or unmounting, preserve onValueCancel without committing, and focus the Web thumb when pressing its track.
