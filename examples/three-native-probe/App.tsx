import { Canvas, useFrame, useThree } from '@react-three/fiber/native'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { Mesh } from 'three'

const moduleStartedAt = performance.now()
const sampleFrameCount = 120

type ProbeEvent = {
  event: string
  host: 'expo-gl'
  elapsedMs?: number
  frameCount?: number
  medianFrameMs?: number
  p95FrameMs?: number
  objectId?: string
  source?: 'canvas' | 'semantic-control'
}

function emit(event: ProbeEvent) {
  console.log(`[hozo-three-native] ${JSON.stringify(event)}`)
}

function percentile(samples: readonly number[], fraction: number) {
  const sorted = [...samples].sort((left, right) => left - right)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))
  return sorted[index] ?? 0
}

function ProbeScene({ onComplete }: { onComplete: (object: Mesh) => void }) {
  const meshRef = useRef<Mesh>(null)
  const frameTimes = useRef<number[]>([])
  const completed = useRef(false)
  const { gl } = useThree()

  useEffect(() => {
    emit({
      event: 'renderer_ready',
      host: 'expo-gl',
      elapsedMs: performance.now() - moduleStartedAt,
    })
    return () => {
      gl.dispose()
      emit({
        event: 'renderer_unmounted',
        host: 'expo-gl',
        elapsedMs: performance.now() - moduleStartedAt,
      })
    }
  }, [gl])

  useFrame((_, delta) => {
    const mesh = meshRef.current
    if (!mesh || completed.current) return

    mesh.rotation.x += delta * 0.4
    mesh.rotation.y += delta * 0.7
    frameTimes.current.push(delta * 1_000)

    if (frameTimes.current.length === 1) {
      emit({
        event: 'first_frame',
        host: 'expo-gl',
        elapsedMs: performance.now() - moduleStartedAt,
        objectId: mesh.uuid,
      })
    }

    if (frameTimes.current.length === sampleFrameCount) {
      completed.current = true
      emit({
        event: 'steady_sample',
        host: 'expo-gl',
        frameCount: sampleFrameCount,
        medianFrameMs: percentile(frameTimes.current, 0.5),
        p95FrameMs: percentile(frameTimes.current, 0.95),
        objectId: mesh.uuid,
      })
      onComplete(mesh)
    }
  })

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: this is an R3F object; the sibling native control exposes it to accessibility
    <mesh
      ref={meshRef}
      onClick={() => {
        if (!meshRef.current) return
        emit({
          event: 'object_activated',
          host: 'expo-gl',
          objectId: meshRef.current.uuid,
          source: 'canvas',
        })
      }}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshNormalMaterial />
    </mesh>
  )
}

export default function App() {
  const [mounted, setMounted] = useState(true)
  const [sampledObject, setSampledObject] = useState<Mesh | null>(null)

  const complete = useCallback((object: Mesh) => {
    setSampledObject(object)
    setTimeout(() => setMounted(false), 0)
  }, [])

  const activateSemanticControl = useCallback(() => {
    if (!sampledObject) return
    emit({
      event: 'object_activated',
      host: 'expo-gl',
      objectId: sampledObject.uuid,
      source: 'semantic-control',
    })
  }, [sampledObject])

  return (
    <View style={styles.screen} testID="native-gpu-probe">
      <Text accessibilityRole="header" style={styles.heading}>
        Expo GL native GPU probe
      </Text>
      <View style={styles.canvas}>
        {mounted ? (
          <Canvas camera={{ position: [0, 0, 3] }}>
            <ambientLight intensity={0.4} />
            <ProbeScene onComplete={complete} />
          </Canvas>
        ) : (
          <Text testID="probe-complete" style={styles.result}>
            120 frames rendered and the renderer was unmounted.
          </Text>
        )}
      </View>
      <Pressable
        accessibilityLabel="Activate measured cube"
        accessibilityRole="button"
        disabled={!sampledObject}
        onPress={activateSemanticControl}
        style={styles.button}
        testID="activate-measured-cube"
      >
        <Text style={styles.buttonText}>Activate measured cube</Text>
      </Pressable>
      <Text style={styles.note}>
        The probe deliberately stops after sampling so Android can inspect an idle accessibility
        tree.
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0b1020',
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 24,
  },
  heading: { color: '#f7f8ff', fontSize: 24, fontWeight: '700', marginBottom: 16 },
  canvas: { flex: 1, minHeight: 320, borderRadius: 20, overflow: 'hidden' },
  result: { color: '#b8f7d4', fontSize: 18, margin: 'auto', textAlign: 'center' },
  button: { backgroundColor: '#6750ff', borderRadius: 12, marginTop: 16, padding: 16 },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  note: { color: '#b4bad0', fontSize: 13, lineHeight: 18, marginTop: 12 },
})
