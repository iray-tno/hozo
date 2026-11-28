// The Native half of the chart's box: `onLayout` reports the width the
// parent gives, as ResizeObserver does on Web.
//
// The drawing is one `adjustable` element named with the chart's label: a
// screen reader's swipe up and down move the active datum, and its value
// is the active datum's sentence, which the reader speaks as it changes.
// Being one element hides its children, the drawing's text included. A
// finger on the chart moves the same datum and shows its tooltip. The
// table of the data stays readable beside it, out of sight unless
// `showTable` asks for it; out of sight is a 1-point clipped box rather
// than zero opacity, which iOS treats as gone.

import { useState } from 'react'
import { Text, View, type ViewStyle } from 'react-native'
import type { ChartBoxComponentProps } from './charts.tsx'

export type ChartBoxProps = ChartBoxComponentProps

const VISUALLY_HIDDEN: ViewStyle = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
}

/** Each accessibility action as the key it stands for. */
const NATIVE_KEYS: Record<string, string> = {
  increment: 'ArrowRight',
  decrement: 'ArrowLeft',
  activate: 'Enter',
  escape: 'Escape',
}

export function ChartBox({
  width,
  height,
  children,
  table,
  summary,
  showTable = false,
  interaction,
}: ChartBoxProps) {
  const [measured, setMeasured] = useState<number | undefined>(undefined)
  const resolved = width ?? measured
  return (
    <View style={{ width: width ?? '100%' }}>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={interaction.label}
        accessibilityValue={
          interaction.announcement ? { text: interaction.announcement } : undefined
        }
        accessibilityActions={[
          { name: 'increment' },
          { name: 'decrement' },
          // Into and out of a level, as Enter and Escape do on Web.
          ...(interaction.levels ? [{ name: 'activate' }, { name: 'escape' }] : []),
        ]}
        onAccessibilityAction={(event) => {
          interaction.onKey(NATIVE_KEYS[event.nativeEvent.actionName] ?? '')
        }}
        onStartShouldSetResponder={() => true}
        onResponderGrant={(event) => {
          if (resolved !== undefined)
            interaction.onPointer(
              event.nativeEvent.locationX,
              event.nativeEvent.locationY,
              resolved,
            )
        }}
        onResponderMove={(event) => {
          if (resolved !== undefined)
            interaction.onPointer(
              event.nativeEvent.locationX,
              event.nativeEvent.locationY,
              resolved,
            )
        }}
        onResponderRelease={() => interaction.onLeave()}
        onResponderTerminate={() => interaction.onLeave()}
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
      <View style={showTable ? undefined : VISUALLY_HIDDEN}>
        <Text>{summary}</Text>
        {table}
      </View>
    </View>
  )
}
