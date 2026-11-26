// The Native half of the chart's box: `onLayout` reports the width the
// parent gives, as ResizeObserver does on Web.
//
// As on Web, the drawing is hidden from a screen reader (both platforms'
// props, since each reads only its own) and the table of the data is kept
// readable but out of sight unless `showTable` asks for it. Out of sight is
// a 1-point clipped box rather than zero opacity, which iOS treats as gone.

import { type ReactNode, useState } from 'react'
import { View, type ViewStyle } from 'react-native'

export interface ChartBoxProps {
  width?: number
  height: number
  children: (width: number) => ReactNode
  table: ReactNode
  showTable?: boolean
}

const VISUALLY_HIDDEN: ViewStyle = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
}

export function ChartBox({ width, height, children, table, showTable = false }: ChartBoxProps) {
  const [measured, setMeasured] = useState<number | undefined>(undefined)
  const resolved = width ?? measured
  return (
    <View style={{ width: width ?? '100%' }}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ width: '100%', height }}
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
      <View style={showTable ? undefined : VISUALLY_HIDDEN}>{table}</View>
    </View>
  )
}
