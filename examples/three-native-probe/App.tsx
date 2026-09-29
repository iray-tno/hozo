import { ThreeCanvas } from '@hozo/three/r3f-native'
import { useFrame, useThree } from '@react-three/fiber/native'
import { File, Paths } from 'expo-file-system'
import type { ExpoWebGLRenderingContext } from 'expo-gl'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
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
  contextId?: number
  resumeEpoch?: number
  reason?: string
}

const recordedEvents: ProbeEvent[] = []
const eventFile = new File(Paths.document, 'hozo-three-native-events.json')
const skipLifecycleFile = new File(Paths.document, 'hozo-three-native-skip-lifecycle')

function emit(event: ProbeEvent) {
  recordedEvents.push(event)
  eventFile.write(`${JSON.stringify(recordedEvents, null, 2)}\n`)
  console.log(`[hozo-three-native] ${JSON.stringify(event)}`)
}

function percentile(samples: readonly number[], fraction: number) {
  const sorted = [...samples].sort((left, right) => left - right)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))
  return sorted[index] ?? 0
}

function ProbeScene({
  onComplete,
  resumeEpoch,
  allowWithoutResume,
}: {
  onComplete: (object: Mesh) => void
  resumeEpoch: number
  allowWithoutResume: boolean
}) {
  const meshRef = useRef<Mesh>(null)
  const frameTimes = useRef<number[]>([])
  const firstFrameEmitted = useRef(false)
  const completed = useRef(false)
  const touched = useRef(false)
  const observedResumeEpoch = useRef(0)
  const { gl } = useThree()
  const contextId = (gl.getContext() as ExpoWebGLRenderingContext).contextId

  useEffect(() => {
    emit({
      event: 'renderer_ready',
      host: 'expo-gl',
      elapsedMs: performance.now() - moduleStartedAt,
      contextId,
    })
    return () => {
      gl.dispose()
      emit({
        event: 'renderer_unmounted',
        host: 'expo-gl',
        elapsedMs: performance.now() - moduleStartedAt,
      })
    }
  }, [contextId, gl])

  useEffect(() => {
    if (allowWithoutResume) frameTimes.current = []
  }, [allowWithoutResume])

  useFrame((_, delta) => {
    const mesh = meshRef.current
    if (!mesh || completed.current) return

    mesh.rotation.x += delta * 0.4
    mesh.rotation.y += delta * 0.7

    if (resumeEpoch > observedResumeEpoch.current) {
      observedResumeEpoch.current = resumeEpoch
      frameTimes.current = []
      emit({
        event: 'frame_after_resume',
        host: 'expo-gl',
        elapsedMs: performance.now() - moduleStartedAt,
        objectId: mesh.uuid,
        contextId,
        resumeEpoch,
      })
    }

    if (frameTimes.current.length < sampleFrameCount) frameTimes.current.push(delta * 1_000)

    if (!firstFrameEmitted.current) {
      firstFrameEmitted.current = true
      emit({
        event: 'first_frame',
        host: 'expo-gl',
        elapsedMs: performance.now() - moduleStartedAt,
        objectId: mesh.uuid,
      })
    }

    if (
      frameTimes.current.length === sampleFrameCount &&
      (touched.current || Platform.OS === 'ios') &&
      (observedResumeEpoch.current > 0 || allowWithoutResume)
    ) {
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
        touched.current = true
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

function AccessibilityModes() {
  return (
    <View style={styles.modes}>
      <View
        accessibilityLabel="Labelled GPU cube"
        accessibilityRole="image"
        accessible
        focusable
        style={styles.mode}
        testID="labelled-gpu-cube"
      >
        <Text accessible={false} style={styles.modeText}>
          Labelled scene
        </Text>
      </View>
      <View style={styles.mode} testID="fallback-gpu-scene">
        <Pressable
          accessibilityLabel="Inspect fallback cube data"
          accessibilityRole="button"
          style={styles.fallbackButton}
        >
          <Text style={styles.modeText}>Inspect fallback cube data</Text>
        </Pressable>
      </View>
      <View
        aria-hidden
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.mode}
        testID="decorative-gpu-scene"
      >
        {/* Deliberately focusable: the hidden parent must suppress an otherwise
            reachable native accessibility node, not merely static text. */}
        <View
          accessibilityLabel="Decorative GPU cube sentinel"
          accessibilityRole="image"
          accessible
          focusable
        >
          <Text accessible={false} style={styles.modeText}>
            Decorative scene
          </Text>
        </View>
      </View>
    </View>
  )
}

export default function App() {
  const [mounted, setMounted] = useState(true)
  const [sampledObject, setSampledObject] = useState<Mesh | null>(null)
  const [resumeEpoch, setResumeEpoch] = useState(0)
  const [allowWithoutResume, setAllowWithoutResume] = useState(false)
  const backgrounded = useRef(false)
  const resumeCount = useRef(0)

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        if (backgrounded.current) return
        backgrounded.current = true
        emit({
          event: 'app_backgrounded',
          host: 'expo-gl',
          elapsedMs: performance.now() - moduleStartedAt,
        })
        return
      }
      if (state !== 'active' || !backgrounded.current) return
      backgrounded.current = false
      resumeCount.current += 1
      emit({
        event: 'app_resumed',
        host: 'expo-gl',
        elapsedMs: performance.now() - moduleStartedAt,
        resumeEpoch: resumeCount.current,
      })
      setResumeEpoch(resumeCount.current)
    })
    return () => subscription.remove()
  }, [])

  useEffect(() => {
    if (Platform.OS !== 'ios') return
    const interval = setInterval(() => {
      if (!skipLifecycleFile.exists) return
      clearInterval(interval)
      emit({
        event: 'lifecycle_not_run',
        host: 'expo-gl',
        reason:
          'The headless iOS Simulator accepted HOME and LOCK input without backgrounding the React Native scene.',
      })
      setAllowWithoutResume(true)
    }, 250)
    return () => clearInterval(interval)
  }, [])

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
      <View style={styles.canvas} testID="gpu-touch-surface">
        {mounted ? (
          <ThreeCanvas
            accessibilityLabel="Measured rotating GPU cube"
            camera={{ position: [0, 0, 3] }}
          >
            <ambientLight intensity={0.4} />
            <ProbeScene
              allowWithoutResume={allowWithoutResume}
              onComplete={complete}
              resumeEpoch={resumeEpoch}
            />
          </ThreeCanvas>
        ) : (
          <View style={styles.complete}>
            <Text testID="probe-complete" style={styles.result}>
              120 frames rendered, touched, and unmounted.
            </Text>
            <AccessibilityModes />
          </View>
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
  complete: { flex: 1, justifyContent: 'center', gap: 12 },
  result: { color: '#b8f7d4', fontSize: 18, textAlign: 'center' },
  modes: { gap: 8 },
  mode: { backgroundColor: '#171e35', borderRadius: 10, minHeight: 54, padding: 12 },
  modeText: { color: '#f7f8ff', fontSize: 15, textAlign: 'center' },
  fallbackButton: { flex: 1, justifyContent: 'center' },
  button: { backgroundColor: '#6750ff', borderRadius: 12, marginTop: 16, padding: 16 },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  note: { color: '#b4bad0', fontSize: 13, lineHeight: 18, marginTop: 12 },
})
