import type { Meta, StoryObj } from '@storybook/react-native'
import { type ExpoWebGLRenderingContext, GLView } from 'expo-gl'
import { useCallback, useRef, useState } from 'react'
import { Pressable, Text, View } from 'react-native'

// A direct Expo control, not Hozo/Three compatibility coverage. Its blocking
// error query also drains the GL command queue; do not use it as a perf sample.
function NativeFrameProbe() {
  const context = useRef<ExpoWebGLRenderingContext | null>(null)
  const [colour, setColour] = useState('loading')
  const draw = useCallback((blue: boolean) => {
    const gl = context.current
    if (!gl) return
    gl.clearColor(blue ? 0 : 1, 0, blue ? 1 : 0, 1)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.endFrameEXP()
    const error = gl.getError()
    console.info('[Hozo GL control]', JSON.stringify({ colour: blue ? 'blue' : 'red', error }))
    setColour(blue ? 'blue' : 'red')
  }, [])
  const onContextCreate = useCallback(
    (gl: ExpoWebGLRenderingContext) => {
      context.current = gl
      draw(false)
    },
    [draw],
  )
  return (
    <View style={{ flex: 1, padding: 16, gap: 16 }} collapsable={false}>
      <View
        style={{ height: 350 }}
        accessible
        accessibilityRole="image"
        accessibilityLabel="Raw Expo GL surface"
        collapsable={false}
      >
        <GLView
          style={{ flex: 1 }}
          onContextCreate={onContextCreate}
          collapsable={false}
          accessibilityElementsHidden
        />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Draw blue"
        disabled={colour === 'loading'}
        onPress={() => draw(true)}
      >
        <Text>Draw blue</Text>
      </Pressable>
      <Text>Raw frame: {colour}</Text>
    </View>
  )
}
const meta = { title: 'Diagnostics/Expo GL', component: NativeFrameProbe } satisfies Meta<
  typeof NativeFrameProbe
>
export default meta
export const ColorFlip: StoryObj<typeof meta> = {}
