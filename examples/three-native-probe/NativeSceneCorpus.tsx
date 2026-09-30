import {
  MINIMAL_PBR_GLTF_SOURCE,
  SCENE_CORPUS_SCENES,
  type SceneCorpusScene,
} from '@hozo/three/conformance-scenes'
import { type R3FAccessibleObjectEvent, ThreeCanvas } from '@hozo/three/r3f-native'
import { useFrame } from '@react-three/fiber/native'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Platform, Text } from 'react-native'
import { type Object3D, TextureLoader, type WebGLRenderer } from 'three'

export interface NativeSceneCorpusResult {
  activation: 'measured' | 'not-run'
  animationFrames?: number
  animationAngle?: number
  imageDecoding?: 'fixture' | 'host'
  error?: string
  id: string
  renderCalls: number
  semanticControls: number
  status: 'failed' | 'useful'
  textureCountDelta: number
}

interface NativeSceneCorpusProps {
  onComplete: () => void
  onRendererUnmounted: (id: string, final: boolean) => void
  onResult: (result: NativeSceneCorpusResult) => void
}

export function NativeSceneCorpus({
  onComplete,
  onRendererUnmounted,
  onResult,
}: NativeSceneCorpusProps) {
  const [index, setIndex] = useState(0)
  const completed = useRef(false)
  const definition = SCENE_CORPUS_SCENES[index]

  useEffect(() => {
    if (definition || completed.current) return
    completed.current = true
    onComplete()
  }, [definition, onComplete])

  if (!definition) return null
  return (
    <NativeSceneFixture
      key={definition.id}
      definition={definition}
      final={index === SCENE_CORPUS_SCENES.length - 1}
      onRendererUnmounted={onRendererUnmounted}
      onResult={(result) => {
        onResult(result)
        setIndex((current) => current + 1)
      }}
    />
  )
}

function NativeSceneFixture({
  definition,
  final,
  onRendererUnmounted,
  onResult,
}: {
  definition: (typeof SCENE_CORPUS_SCENES)[number]
  final: boolean
  onRendererUnmounted: (id: string, final: boolean) => void
  onResult: (result: NativeSceneCorpusResult) => void
}) {
  const [fixture, setFixture] = useState<SceneCorpusScene>()
  const [error, setError] = useState<unknown>()

  useEffect(() => {
    let active = true
    void definition
      .create(async () => MINIMAL_PBR_GLTF_SOURCE, { textureLoader: new TextureLoader() })
      .then((created) => {
        if (active) setFixture(created)
      })
      .catch((reason: unknown) => {
        if (active) setError(reason)
      })
    return () => {
      active = false
    }
  }, [definition])

  useEffect(() => {
    if (!error) return
    onResult({
      activation: Platform.OS === 'ios' ? 'not-run' : 'measured',
      error: error instanceof Error ? error.message : String(error),
      id: definition.id,
      renderCalls: 0,
      semanticControls: 0,
      status: 'failed',
      textureCountDelta: 0,
    })
  }, [definition.id, error, onResult])

  if (!fixture) return <Text>Loading {definition.id}</Text>
  return (
    <MeasuredSceneFixture
      final={final}
      fixture={fixture}
      id={definition.id}
      onRendererUnmounted={onRendererUnmounted}
      onResult={onResult}
    />
  )
}

function MeasuredSceneFixture({
  final,
  fixture,
  id,
  onRendererUnmounted,
  onResult,
}: {
  final: boolean
  fixture: SceneCorpusScene
  id: string
  onRendererUnmounted: (id: string, final: boolean) => void
  onResult: (result: NativeSceneCorpusResult) => void
}) {
  const activated = useRef(Platform.OS === 'ios')
  const renderCalls = useRef(0)
  const textureCountDelta = useRef(0)
  const animationFrames = useRef(0)
  const animationAngle = useRef(0)
  const initialRotation = useMemo(() => fixture.animation?.object.quaternion.clone(), [fixture])
  const settled = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const objects = useMemo(() => namedObjects(fixture.scene), [fixture.scene])

  const settle = useCallback(() => {
    if (settled.current || renderCalls.current < 1 || !activated.current) return
    if (fixture.animation && (animationFrames.current < 2 || animationAngle.current <= 0.01)) return
    settled.current = true
    onResult({
      activation: Platform.OS === 'ios' ? 'not-run' : 'measured',
      animationFrames: fixture.animation ? animationFrames.current : undefined,
      animationAngle: fixture.animation ? animationAngle.current : undefined,
      imageDecoding: fixture.textureImage?.decoding,
      id,
      renderCalls: renderCalls.current,
      semanticControls: objects.length,
      status: objects.length > 0 ? 'useful' : 'failed',
      textureCountDelta: textureCountDelta.current,
    })
  }, [fixture, id, objects.length, onResult])

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
      onRendererUnmounted(id, final)
    },
    [final, id, onRendererUnmounted],
  )

  return (
    <ThreeCanvas
      accessibilityLabel={`Native corpus ${id}`}
      accessibleObjects={objects.map((object, index) => ({
        id: `${id}-${index}`,
        label: object.name,
        object,
        onPress: ({ object: activatedObject }: R3FAccessibleObjectEvent) => {
          if (!objects.includes(activatedObject)) return
          activated.current = true
          settle()
        },
        testID: index === 0 ? `corpus-${id}` : undefined,
      }))}
      camera={fixture.camera}
      frameloop="always"
      onCreated={({ gl }) => {
        const initialTextures = (gl as WebGLRenderer).info.memory.textures
        timer.current = setTimeout(() => {
          renderCalls.current = (gl as WebGLRenderer).info.render.calls
          textureCountDelta.current = Math.max(
            0,
            (gl as WebGLRenderer).info.memory.textures - initialTextures,
          )
          settle()
        }, 300)
      }}
      scene={fixture.scene}
    >
      {fixture.animation ? (
        <AnimatedFixture
          onFrame={(delta) => {
            if (!fixture.animation || !initialRotation) return
            fixture.animation.update(delta)
            animationFrames.current += 1
            animationAngle.current = Math.max(
              animationAngle.current,
              initialRotation.angleTo(fixture.animation.object.quaternion),
            )
            settle()
          }}
        />
      ) : null}
    </ThreeCanvas>
  )
}

function AnimatedFixture({ onFrame }: { onFrame: (delta: number) => void }) {
  useFrame((_, delta) => onFrame(delta))
  return null
}

function namedObjects(scene: Object3D): Object3D[] {
  const objects: Object3D[] = []
  scene.traverse((object) => {
    if (object.name && 'raycast' in object) objects.push(object)
  })
  return objects
}
