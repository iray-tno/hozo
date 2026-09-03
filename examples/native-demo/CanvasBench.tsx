// The Native Canvas surface, in a real bundle.
//
// `packages/canvas` has thirty tests and every one of them drives the Web
// surface: `index.native.tsx` was type-checked and never executed, and
// until #173 it was type-checked against a hand-written Skia stub that
// agreed with anything. Metro is not a device either, but running the
// real bundler over the real module establishes what no unit test here
// could -- that it resolves, that Skia resolves with it, and that the
// transform chain produces something.
//
// Deliberately uses every shape the Native adapter has a branch for. A
// bundle only proves the branches exist, and a branch nobody references
// is a branch Metro never has to resolve.

import { Canvas } from '@hozo/canvas'
import { Text, View } from '@hozo/core'
import { useState } from 'react'

const VIEW_BOX = [0, 0, 100, 60] as const

export function CanvasBench() {
  const [indicated, setIndicated] = useState<string>('none')
  const [pressed, setPressed] = useState<string>('none')

  return (
    <View className="gap-2 p-4" testID="canvas-bench">
      <Text className="text-lg font-bold">Canvas</Text>
      <Canvas
        width={200}
        height={120}
        viewBox={VIEW_BOX}
        accessibilityLabel="Four shapes and a line"
        testID="canvas-surface"
      >
        <Canvas.Group transform={{ translateX: 2 }}>
          <Canvas.Rect
            x={4}
            y={8}
            width={18}
            height={44}
            className="fill-blue-500"
            accessibilityLabel="January revenue"
            onPress={() => setPressed('rect')}
            onActiveChange={(event) => setIndicated(event ? 'rect' : 'none')}
          />
          <Canvas.RoundedRect
            x={28}
            y={8}
            width={18}
            height={44}
            radius={4}
            className="fill-emerald-500"
            accessibilityLabel="February revenue"
            onPress={() => setPressed('rounded-rect')}
          />
          <Canvas.Circle
            cx={60}
            cy={30}
            radius={12}
            className="fill-amber-500"
            accessibilityLabel="March revenue"
            onPress={() => setPressed('circle')}
          />
          <Canvas.Ellipse cx={86} cy={30} radiusX={10} radiusY={20} className="fill-rose-500" />
        </Canvas.Group>
        <Canvas.Clip x={0} y={0} width={100} height={60}>
          <Canvas.Line
            x1={4}
            y1={56}
            x2={96}
            y2={56}
            stroke="black"
            strokeWidth={2}
            lineCap="round"
            accessibilityLabel="Target line"
            onPress={() => setPressed('line')}
            onActiveChange={(event) => setIndicated(event ? 'line' : 'none')}
          />
        </Canvas.Clip>
        <Canvas.Path path="M4 4 L96 4" stroke="black" strokeWidth={1} />
        {/* An axis label, which is what text exists for. Skia resolves the
            face through `matchFont` and has no alignment of its own, so
            this is also the only shape whose Native branch measures. */}
        <Canvas.Text text="Jan" x={50} y={52} fontSize={6} textAlign="center" fill="black" />
      </Canvas>
      <Text testID="canvas-indicated">{`indicated: ${indicated}`}</Text>
      <Text testID="canvas-pressed">{`pressed: ${pressed}`}</Text>
    </View>
  )
}
