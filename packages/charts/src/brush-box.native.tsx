// The Native half of the brush's box: `onLayout` reports the width, and
// the two ends of the range are `adjustable` elements over their grips, so
// a screen reader's swipe up and down move an end a row and its value is
// the row's name. A finger anywhere on the strip takes the nearer end, or
// the whole range when inside it, and drags it, as a pointer does on Web.

import { useRef, useState } from 'react'
import { View } from 'react-native'
import { type BrushGrab, dragTo, grabAt, moveEnd } from './brush.ts'
import type { BrushBoxComponentProps } from './charts.tsx'

export type BrushBoxProps = BrushBoxComponentProps

/** Half the target each end is given, centred on its grip. */
const HALF = 12

export function BrushBox({
  width,
  height,
  label,
  count,
  range,
  valueText,
  model,
  children,
  onRange,
}: BrushBoxProps) {
  const grab = useRef<BrushGrab | undefined>(undefined)
  const [measured, setMeasured] = useState<number | undefined>(undefined)
  const resolved = width ?? measured
  const drawn = resolved !== undefined && resolved > 0 ? model(resolved) : undefined

  const end = (which: 'start' | 'end') => {
    const index = range[which]
    const x = drawn ? (which === 'start' ? drawn.x0 : drawn.x1) : 0
    return (
      <View
        key={which}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={`${label}, ${which === 'start' ? 'first shown' : 'last shown'}`}
        accessibilityValue={{ text: valueText(index) }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(event) => {
          const key = event.nativeEvent.actionName === 'increment' ? 'ArrowRight' : 'ArrowLeft'
          const next = moveEnd(key, range, which, count)
          if (next) onRange(next)
        }}
        // Touches pass to the strip, whose `locationX` is then its own, not the end's.
        pointerEvents="none"
        style={{ position: 'absolute', top: 0, left: x - HALF, width: HALF * 2, height }}
      />
    )
  }

  return (
    <View
      style={{ width: width ?? '100%', height }}
      onLayout={
        width === undefined
          ? (event) => {
              const next = Math.floor(event.nativeEvent.layout.width)
              setMeasured((previous) => (previous === next ? previous : next))
            }
          : undefined
      }
      onStartShouldSetResponder={() => true}
      onResponderGrant={(event) => {
        if (!drawn) return
        const x = event.nativeEvent.locationX
        grab.current = grabAt(drawn, range, x, HALF)
        onRange(dragTo(drawn, range, grab.current, x, count))
      }}
      onResponderMove={(event) => {
        if (drawn && grab.current)
          onRange(dragTo(drawn, range, grab.current, event.nativeEvent.locationX, count))
      }}
      onResponderRelease={() => {
        grab.current = undefined
      }}
      onResponderTerminate={() => {
        grab.current = undefined
      }}
    >
      {drawn ? children(drawn.width) : null}
      {end('start')}
      {end('end')}
    </View>
  )
}
