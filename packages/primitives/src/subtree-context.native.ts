import { createContext, useContext, useLayoutEffect, useRef } from 'react'

import {
  computeSubtreeDelta,
  type HozoSubtreeReporter,
  type HozoSubtreeState,
  IDLE_SUBTREE_STATE,
} from './subtree-store.ts'

export const HozoSubtreeContext = createContext<HozoSubtreeReporter | null>(null)

/**
 * Reports an interactive control's state transitions (`pressed`, `hovered`,
 * `focused`, `focusVisible`) upward to the nearest enclosing `HozoSubtreeBoundary`.
 * No-op when no enclosing `focus-within:` / `has-*:` scope exists.
 */
export function useReportSubtreeInteraction(state: HozoSubtreeState): void {
  const reporter = useContext(HozoSubtreeContext)
  const prevRef = useRef<HozoSubtreeState>(IDLE_SUBTREE_STATE)
  const { pressed, hovered, focused, focusVisible } = state

  useLayoutEffect(() => {
    if (!reporter) {
      prevRef.current = IDLE_SUBTREE_STATE
      return
    }
    const next: HozoSubtreeState = { pressed, hovered, focused, focusVisible }
    const delta = computeSubtreeDelta(prevRef.current, next)
    if (delta) {
      prevRef.current = next
      reporter.report(delta)
    }
  }, [reporter, pressed, hovered, focused, focusVisible])

  useLayoutEffect(() => {
    if (!reporter) return
    return () => {
      const delta = computeSubtreeDelta(prevRef.current, IDLE_SUBTREE_STATE)
      prevRef.current = IDLE_SUBTREE_STATE
      if (delta) reporter.report(delta)
    }
  }, [reporter])
}
