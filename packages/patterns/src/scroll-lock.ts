import { useEffect } from 'react'

/**
 * Holding the page still behind a modal overlay, on the Web.
 *
 * #142 asks for it by name under `Drawer` ("scroll lock on body"), and it is
 * the one thing a `<dialog>` gives for free that a div-based overlay does not:
 * `showModal()` puts the dialog in the top layer and the browser stops
 * scrolling the document behind it. Nothing does that for a `position: fixed`
 * panel, so a wheel or a two-finger drag over the scrim scrolls the page a
 * reader has just been told is unavailable, and closing the overlay leaves them
 * somewhere else.
 *
 * `BottomSheet` has the same gap and the same fix, so this is a module rather
 * than a line in `drawer.tsx`.
 *
 * ## Counted, because overlays nest
 *
 * A drawer can open a sheet. Two overlays each restoring what they found would
 * have the inner one hand back `overflow: hidden` and the outer one hand back
 * nothing, so the page stays locked after both have gone. The count is module
 * state and the saved value belongs to the first lock, which is the only one
 * that saw the page unlocked.
 *
 * There is no native counterpart: a React Native `Modal` is its own window, and
 * there is no document behind it to hold.
 */
let locks = 0
let saved = ''

export function useScrollLock(locked: boolean): void {
  useEffect(() => {
    if (!locked || typeof document === 'undefined') return
    const body = document.body
    if (locks === 0) saved = body.style.overflow
    locks += 1
    body.style.overflow = 'hidden'
    return () => {
      locks -= 1
      if (locks === 0) body.style.overflow = saved
    }
  }, [locked])
}
