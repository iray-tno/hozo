// Keeping an element mounted while it animates out, on the Web
// (decision 007, slice 2).
//
// React removes an element the moment it stops being rendered, so nothing
// can animate after that. This holds on to it after `show` turns false,
// reports `state: 'closed'` for the caller to put on the element as
// `data-state`, and lets it go when the element's transition or animation
// ends. The exit itself is CSS -- a `data-[state=closed]:` class and a
// `transition-*` one -- so it costs no script beyond this.
//
// A hook rather than only a component because Hozo's overlays cannot wrap
// their panel in one: the panel sits inside a positioner, a dismiss layer
// and a focus scope, and it is the panel that leaves. `Presence` in
// `@hozo/primitives` is this hook around one child.

import { useCallback, useEffect, useRef, useState } from 'react'

export type PresenceState = 'open' | 'closed'

export interface PresenceBinding {
  /** Whether to render the element at all. */
  mounted: boolean
  /** For the element's `data-state`. */
  state: PresenceState
  /** The element whose transition is the exit. */
  ref: (node: Element | null) => void
  onTransitionEnd: (event: { target: EventTarget; currentTarget: EventTarget }) => void
  onAnimationEnd: (event: { target: EventTarget; currentTarget: EventTarget }) => void
}

/** How long past the computed end to wait for an event that never fires. */
const GRACE_MS = 100

/** The longest `duration + delay` across a comma-separated pair of lists. */
function longest(durations: string, delays: string): number {
  const ms = (value: string) => {
    const number = Number.parseFloat(value)
    if (Number.isNaN(number)) return 0
    return value.trim().endsWith('ms') ? number : number * 1000
  }
  const d = durations.split(',')
  const l = delays.split(',')
  // CSS repeats the shorter list to the length of the longer one.
  const length = Math.max(d.length, l.length)
  let out = 0
  for (let i = 0; i < length; i++) {
    out = Math.max(out, ms(d[i % d.length] ?? '0s') + ms(l[i % l.length] ?? '0s'))
  }
  return out
}

/** How long the element's exit runs, from its computed style. */
function exitDuration(element: Element): number {
  const style = getComputedStyle(element)
  return Math.max(
    longest(style.transitionDuration, style.transitionDelay),
    style.animationName === 'none' ? 0 : longest(style.animationDuration, style.animationDelay),
  )
}

export function usePresence(show: boolean): PresenceBinding {
  const [mounted, setMounted] = useState(show)
  // Set during render rather than in an effect, so an element that is shown
  // again appears in the same commit instead of one frame late.
  if (show && !mounted) setMounted(true)

  const element = useRef<Element | null>(null)
  const ending = useRef<{ at: number; timer: ReturnType<typeof setTimeout> } | null>(null)

  const finish = useCallback(() => {
    if (ending.current) clearTimeout(ending.current.timer)
    ending.current = null
    setMounted(false)
  }, [])

  useEffect(() => {
    if (show || !mounted) return
    // Read after the commit that set `data-state="closed"`, so the
    // computed style is the one the element is leaving with -- including
    // `motion-reduce:transition-none`, which makes this zero.
    const target = element.current
    const duration = target ? exitDuration(target) : 0
    if (duration === 0) {
      finish()
      return
    }
    const at = performance.now() + duration
    ending.current = { at, timer: setTimeout(finish, duration + GRACE_MS) }
    return () => {
      if (ending.current) clearTimeout(ending.current.timer)
      ending.current = null
    }
  }, [show, mounted, finish])

  // `transitionend` fires once per property, and the properties may end
  // at different times. Only the one that ends last finishes the exit.
  const onEnd = useCallback(
    (event: { target: EventTarget; currentTarget: EventTarget }) => {
      if (event.target !== event.currentTarget) return
      const pending = ending.current
      if (!pending || performance.now() < pending.at - 20) return
      finish()
    },
    [finish],
  )

  const ref = useCallback((node: Element | null) => {
    element.current = node
  }, [])

  return {
    mounted,
    state: show ? 'open' : 'closed',
    ref,
    onTransitionEnd: onEnd,
    onAnimationEnd: onEnd,
  }
}
