import { type PointerEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createDrag1DSession, type Drag1DOptions } from './drag-1d-session.ts'

export type { Drag1DDetails, Drag1DOptions } from './drag-1d-session.ts'

export function useDrag1D(options: Drag1DOptions) {
  const live = useRef(options)
  live.current = options
  const [dragging, setDragging] = useState(false)
  const gesture = useRef<{
    id: number
    start: number
    sign: number
    axis: 'x' | 'y'
    host: HTMLElement
    last: number
    lastAt: number
    velocity: number
  } | null>(null)
  const session = useMemo(
    () =>
      createDrag1DSession(
        () => live.current,
        (callback) => requestAnimationFrame(callback),
        (id) => cancelAnimationFrame(id),
      ),
    [],
  )
  const release = useCallback(() => {
    const current = gesture.current
    gesture.current = null
    if (current?.host.hasPointerCapture(current.id)) current.host.releasePointerCapture(current.id)
  }, [])
  const cancel = useCallback(() => {
    session.cancel()
    release()
    setDragging(false)
  }, [session, release])
  useEffect(() => {
    if (options.disabled) cancel()
  }, [options.disabled, cancel])
  useEffect(
    () => () => {
      session.cancel()
      release()
    },
    [session, release],
  )
  const delta = (event: PointerEvent<HTMLElement>) => {
    const at = gesture.current!
    return ((at.axis === 'x' ? event.clientX : event.clientY) - at.start) * at.sign
  }
  const matches = (event: PointerEvent<HTMLElement>) => gesture.current?.id === event.pointerId
  const sample = (event: PointerEvent<HTMLElement>, retainVelocity = false) => {
    const at = gesture.current!
    const position = at.axis === 'x' ? event.clientX : event.clientY
    if (position !== at.last || !retainVelocity) {
      at.velocity = ((position - at.last) * at.sign) / Math.max(1, event.timeStamp - at.lastAt)
    }
    at.last = position
    at.lastAt = event.timeStamp
    return { velocity: at.velocity }
  }
  return {
    dragging,
    handlers: {
      onPointerDown(event: PointerEvent<HTMLElement>) {
        if (gesture.current || event.button !== 0 || !event.isPrimary || options.disabled) return
        const host = event.currentTarget
        const axis = options.axis
        const sign = axis === 'x' && getComputedStyle(host).direction === 'rtl' ? -1 : 1
        gesture.current = {
          id: event.pointerId,
          host,
          axis,
          sign,
          start: axis === 'x' ? event.clientX : event.clientY,
          last: axis === 'x' ? event.clientX : event.clientY,
          lastAt: event.timeStamp,
          velocity: 0,
        }
        if (!session.start()) {
          gesture.current = null
          return
        }
        host.setPointerCapture(event.pointerId)
        host.focus()
        event.preventDefault()
        setDragging(true)
      },
      onPointerMove(event: PointerEvent<HTMLElement>) {
        if (matches(event)) session.move(delta(event), sample(event))
      },
      onPointerUp(event: PointerEvent<HTMLElement>) {
        if (!matches(event)) return
        session.end(delta(event), sample(event, true))
        release()
        setDragging(false)
      },
      onPointerCancel(event: PointerEvent<HTMLElement>) {
        if (matches(event)) cancel()
      },
      onLostPointerCapture(event: PointerEvent<HTMLElement>) {
        if (matches(event)) cancel()
      },
    },
  }
}
