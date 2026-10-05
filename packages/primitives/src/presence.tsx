// Keeps a child mounted while it animates out (decision 007, slice 2).
//
// React removes an element the moment it stops being rendered, so nothing
// can animate after that. `Presence` holds on to its child after `show`
// turns false, sets `data-state="closed"` on it, and removes it when its
// transition or animation ends. The exit itself is CSS: a
// `data-[state=closed]:` class and a `transition-*` one, so it costs no
// script beyond this. The timing lives in `usePresence`
// (`@hozo/behaviors`), which Hozo's overlays use for their panels.
//
// The Native half is `./presence.native.tsx`, written against the same
// class.

import { usePresence } from '@hozo/behaviors'
import { cloneElement, isValidElement, type ReactElement, type ReactNode, type Ref } from 'react'

export interface PresenceProps {
  /** Whether the child is shown. Turning it false starts the exit. */
  show: boolean
  /**
   * One element, which receives `data-state`. A Hozo primitive passes it
   * to the DOM; a component of your own has to forward it.
   */
  children?: ReactNode
}

function setRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === 'function') ref(value)
  else if (ref) (ref as { current: T | null }).current = value
}

export function Presence({ show, children }: PresenceProps) {
  const presence = usePresence(show)

  if (!presence.mounted) return null
  if (!isValidElement(children)) return children ?? null
  const child = children as ReactElement<Record<string, unknown>>
  const childRef = child.props.ref as Ref<Element> | undefined
  const chain =
    (name: 'onTransitionEnd' | 'onAnimationEnd') =>
    (event: { target: EventTarget; currentTarget: EventTarget }) => {
      const own = child.props[name]
      if (typeof own === 'function') own(event)
      presence[name](event)
    }
  return cloneElement(child, {
    'data-state': presence.state,
    ref: (node: Element | null) => {
      presence.ref(node)
      setRef(childRef, node)
    },
    onTransitionEnd: chain('onTransitionEnd'),
    onAnimationEnd: chain('onAnimationEnd'),
  })
}
