import { configureKumimonoRenderer, createKumimonoScene } from '@hozo/example-three-kumimono'
import { Button, Text, View } from '@hozo/primitives'
import { ThreeCanvas } from '@hozo/three/r3f-native'
import { useFrame, useThree } from '@react-three/fiber/native'
import type { Meta, StoryObj } from '@storybook/react-native'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, AppState, ScrollView } from 'react-native'

function Animation({
  study,
  target,
  reducedMotion,
  active,
  onComplete,
}: {
  study: ReturnType<typeof createKumimonoScene>
  target: number
  reducedMotion: boolean
  active: boolean
  onComplete: (target: number) => void
}) {
  const progress = useRef(1)
  const completed = useRef<number | undefined>(undefined)
  const invalidate = useThree((state) => state.invalidate)
  useEffect(() => {
    if (active) {
      completed.current = undefined
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
    else if (completed.current !== target) {
      completed.current = target
      onComplete(target)
    }
  })
  return null
}

function KumimonoDemo() {
  const [study] = useState(() => createKumimonoScene())
  const [target, setTarget] = useState(1)
  const [assembly, setAssembly] = useState('assembled')
  const onComplete = useCallback((value: number) => {
    setAssembly(value === 1 ? 'assembled' : 'disassembled')
  }, [])
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
        <Animation
          study={study}
          target={target}
          reducedMotion={reducedMotion}
          active={active}
          onComplete={onComplete}
        />
      </ThreeCanvas>
      <View className="flex-row gap-3">
        <Button
          onPress={() => {
            setAssembly('moving')
            setTarget(0)
          }}
          disabled={assembly === 'disassembled'}
          className="rounded-lg bg-slate-800 px-4 py-3 text-white"
        >
          分解
        </Button>
        <Button
          onPress={() => {
            setAssembly('moving')
            setTarget(1)
          }}
          disabled={assembly === 'assembled'}
          className="rounded-lg bg-slate-800 px-4 py-3 text-white"
        >
          組み立て
        </Button>
      </View>
      <Text accessibilityLiveRegion="polite" className="text-base text-slate-700">
        Assembly: {assembly}
      </Text>
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
