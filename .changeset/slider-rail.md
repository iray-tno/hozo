---
'@hozo/patterns': minor
'@hozo/ui': patch
---

`Slider` takes a `railClassName` and a `railStyle`: an `aria-hidden` element along the whole track, under the fill. `@hozo/ui`'s Slider draws its rail with it, where it used the track's `::before` before. React Native has no pseudo-elements, so the Native slider showed only its fill, and that fill sat at the top of the track. The rail and fill are now centred by insets, which leaves them 8px thick, where they were 4px.
