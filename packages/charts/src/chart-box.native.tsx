// The Native half of the chart's box: `onLayout` reports the width the
// parent gives, as ResizeObserver does on Web.

import { type ReactNode, useState } from 'react'
import { View } from 'react-native'

export interface ChartBoxProps {
  width?: number
  height: number
  children: (width: number) => ReactNode
}

export function ChartBox({ width, height, children }: ChartBoxProps) {
  const [measured, setMeasured] = useState<number | undefined>(undefined)
  const resolved = width ?? measured
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
    >
      {resolved !== undefined && resolved > 0 ? children(resolved) : null}
    </View>
  )
}
