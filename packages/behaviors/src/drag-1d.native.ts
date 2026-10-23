import { useEffect, useMemo, useRef, useState } from 'react'
import { I18nManager, PanResponder, type PanResponderInstance } from 'react-native'
import { createDrag1DSession, type Drag1DOptions } from './drag-1d-session.ts'

export type { Drag1DOptions } from './drag-1d-session.ts'

export function useDrag1D(options: Drag1DOptions): {
  dragging: boolean
  handlers: PanResponderInstance['panHandlers']
} {
  const live = useRef(options)
  live.current = options
  const [dragging, setDragging] = useState(false)
  const session = useMemo(
    () =>
      createDrag1DSession(
        () => live.current,
        (callback) => requestAnimationFrame(callback),
        (id) => cancelAnimationFrame(id),
      ),
    [],
  )
  const responder = useMemo(() => {
    let axis: 'x' | 'y' = 'x'
    let sign = 1
    const delta = (dx: number, dy: number) => (axis === 'x' ? dx : dy) * sign
    return PanResponder.create({
      onStartShouldSetPanResponder: () => !live.current.disabled,
      onMoveShouldSetPanResponder: () => !live.current.disabled,
      onPanResponderGrant: () => {
        axis = live.current.axis
        sign = axis === 'x' && I18nManager.isRTL ? -1 : 1
        if (session.start()) setDragging(true)
      },
      onPanResponderMove: (_, state) => session.move(delta(state.dx, state.dy)),
      onPanResponderRelease: (_, state) => {
        session.end(delta(state.dx, state.dy))
        setDragging(false)
      },
      onPanResponderTerminate: () => {
        session.cancel()
        setDragging(false)
      },
      onPanResponderTerminationRequest: () => true,
    })
  }, [session])
  useEffect(() => {
    if (options.disabled) {
      session.cancel()
      setDragging(false)
    }
  }, [options.disabled, session])
  useEffect(() => () => session.cancel(), [session])
  return { dragging, handlers: responder.panHandlers }
}
