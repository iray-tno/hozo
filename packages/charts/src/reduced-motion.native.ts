// Whether the reader asked for less motion, on Native. The setting is read
// asynchronously, so it counts as yes until it arrives: nothing moves for a
// reader who turned motion off, even on the first change.

import { useEffect, useState } from 'react'
import { AccessibilityInfo } from 'react-native'

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(true)
  useEffect(() => {
    let live = true
    AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (live) setReduced(value)
    })
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced)
    return () => {
      live = false
      subscription.remove()
    }
  }, [])
  return reduced
}
