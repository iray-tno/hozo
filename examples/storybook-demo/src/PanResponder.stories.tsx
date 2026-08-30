// React Native's gesture responder, running in a browser.
//
// `PanResponder.create(callbacks)` returns `panHandlers`, an object spread
// onto the element that should own the gesture. That is React Native's own
// shape, unchanged -- an existing RN component using `PanResponder` works
// here without an edit, which is the point of the primitive existing at
// all rather than authors reaching for pointer events on one platform and
// this on the other.
//
// The gesture state is React Native's too: `dx`/`dy` from the start of the
// gesture, `vx`/`vy` as velocity, `numberActiveTouches` for a pinch. Drag
// the card below and watch them.

import type { Meta, StoryObj } from '@storybook/react-vite'
import { useMemo, useRef, useState } from 'react'
import { Heading, PanResponder, Paragraph, Text, View } from '@hozo/core'

function Draggable() {
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [state, setState] = useState({ dx: 0, dy: 0, touches: 0 })
  const [dragging, setDragging] = useState(false)
  // The offset the gesture started from. A ref rather than state because
  // the callbacks are created once and would otherwise close over the
  // first render's value forever.
  const start = useRef({ x: 0, y: 0 })

  const responder = useMemo(
    () =>
      PanResponder.create({
        // Claiming the responder on *start* rather than on move: this card
        // has nothing scrollable under it, so there is no gesture to lose
        // the race to.
        onStartShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          start.current = offsetRef.current
          setDragging(true)
        },
        onPanResponderMove: (_event, gesture) => {
          setOffset({ x: start.current.x + gesture.dx, y: start.current.y + gesture.dy })
          setState({ dx: gesture.dx, dy: gesture.dy, touches: gesture.numberActiveTouches })
        },
        onPanResponderRelease: () => setDragging(false),
        // A terminated gesture is not a released one -- the browser took
        // the pointer away -- and leaving `dragging` true would strand the
        // card mid-drag.
        onPanResponderTerminate: () => setDragging(false),
      }),
    [],
  )

  const offsetRef = useRef(offset)
  offsetRef.current = offset

  return (
    <View className="space-y-3">
      <View className="relative h-48 overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50">
        {/* A plain `div`, not a `View`. The offset is a number that
            changes every frame, and Hozo's primitives take `className`
            rather than `style` -- there is no class for "37 pixels right
            of where you were". Carrying an unmodelled element with the
            tree around it still compiled is the escape hatch working as
            designed, and a gesture demo is exactly what it is for. */}
        <div
          {...responder.panHandlers}
          className={`absolute w-fit rounded-xl px-5 py-4 select-none ${
            dragging ? 'bg-indigo-600' : 'bg-slate-900'
          }`}
          style={{ transform: `translate(${offset.x}px, ${offset.y}px)`, touchAction: 'none' }}
        >
          <Text className="text-sm font-semibold text-white">Drag me</Text>
        </div>
      </View>
      <View className="flex flex-row flex-wrap gap-4">
        {(
          [
            ['dx', Math.round(state.dx)],
            ['dy', Math.round(state.dy)],
            ['touches', state.touches],
          ] as const
        ).map(([label, value]) => (
          <Text key={label} className="font-mono text-xs text-slate-500">
            {label}: <Text className="font-semibold text-slate-900">{value}</Text>
          </Text>
        ))}
      </View>
    </View>
  )
}

function PanResponderGallery() {
  return (
    <View className="w-full max-w-2xl space-y-6 rounded-2xl bg-white p-8 shadow-sm">
      <View className="space-y-2">
        <Heading level={2} className="text-xl font-bold text-slate-900">
          PanResponder
        </Heading>
        <Paragraph className="text-sm leading-relaxed text-slate-600">
          React Native's gesture responder, in a browser, with React
          Native's own callback names and gesture state. A component written
          against it on mobile runs here unedited.
        </Paragraph>
      </View>
      <Draggable />
      <Paragraph className="text-xs text-slate-500">
        A gesture is a pointer interaction and has no keyboard equivalent, so
        anything reachable only by dragging needs a second route. This card
        is a demonstration rather than a control, and has none.
      </Paragraph>
    </View>
  )
}

const meta = {
  title: 'Core/PanResponder',
  component: PanResponderGallery,
} satisfies Meta<typeof PanResponderGallery>

export default meta

export const Default: StoryObj<typeof meta> = {}
