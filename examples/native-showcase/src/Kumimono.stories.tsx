import { configureKumimonoRenderer, createKumimonoScene } from '@hozo/example-three-kumimono'
import { Button, Text, View } from '@hozo/primitives'
import { ThreeCanvas } from '@hozo/three/r3f-native'
import { useFrame, useThree } from '@react-three/fiber/native'
import type { Meta, StoryObj } from '@storybook/react-native'
import { useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, AppState, ScrollView } from 'react-native'

function Animation({
  study,
  target,
  reducedMotion,
  active,
}: {
  study: ReturnType<typeof createKumimonoScene>
  target: number
  reducedMotion: boolean
  active: boolean
}) {
  const progress = useRef(1)
  const invalidate = useThree((state) => state.invalidate)
  useEffect(() => {
    if (active) {
      if (reducedMotion) progress.current = target
      study.update(progress.current)
      invalidate()
    }
  }, [target, reducedMotion, active, study, invalidate])
  useFrame((_, delta) => {
    if (reducedMotion) progress.current = target
    else {
      const distance = target - progress.current
      progress.current +=
        Math.sign(distance) * Math.min(Math.abs(distance), Math.min(delta, 0.1) / 1.5)
    }
    study.update(progress.current)
    if (progress.current !== target) invalidate()
  })
  return null
}

function KumimonoDemo() {
  const [study] = useState(() => createKumimonoScene())
  const [target, setTarget] = useState(1)
  const [active, setActive] = useState(AppState.currentState === 'active')
  const [reducedMotion, setReducedMotion] = useState(true)
  useEffect(() => {
    let mounted = true
    AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (mounted) setReducedMotion(value)
    })
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion)
    const state = AppState.addEventListener('change', (value) => setActive(value === 'active'))
    return () => {
      mounted = false
      motion.remove()
      state.remove()
      study.dispose()
    }
  }, [study])
  return (
    <View className="flex-1 gap-4">
      <Text className="text-xl font-bold text-slate-900">組物</Text>
      <ThreeCanvas
        scene={study.scene}
        camera={study.camera}
        style={{ height: 350 }}
        accessibilityLabel="組物: timber bracket assembly"
        frameloop={active ? 'demand' : 'never'}
        onCreated={({ gl }) => configureKumimonoRenderer(gl)}
      >
        <Animation study={study} target={target} reducedMotion={reducedMotion} active={active} />
      </ThreeCanvas>
      <View className="flex-row gap-3">
        <Button
          onPress={() => setTarget(0)}
          className="rounded-lg bg-slate-800 px-4 py-3 text-white"
        >
          分解
        </Button>
        <Button
          onPress={() => setTarget(1)}
          className="rounded-lg bg-slate-800 px-4 py-3 text-white"
        >
          組み立て
        </Button>
      </View>
    </View>
  )
}

const meta = {
  title: 'Three/Kumimono',
  component: KumimonoDemo,
  decorators: [
    (Story) => (
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <Story />
      </ScrollView>
    ),
  ],
} satisfies Meta<typeof KumimonoDemo>
export default meta
export const Assembly: StoryObj<typeof meta> = {}
