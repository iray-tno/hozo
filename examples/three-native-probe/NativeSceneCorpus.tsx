import { configureKumimonoRenderer, createKumimonoScene } from '@hozo/example-three-kumimono'
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
import { sampleSceneRenderEvidence } from './scene-render-evidence.ts'

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

type NativeFixture = SceneCorpusScene & {
  configure?: (renderer: WebGLRenderer) => void
  dispose?: () => void
}

const nativeScenes: {
  id: string
  create: (
    ...args: Parameters<(typeof SCENE_CORPUS_SCENES)[number]['create']>
  ) => Promise<NativeFixture>
}[] = [
  ...SCENE_CORPUS_SCENES,
  {
    id: 'kumimono',
    create: async () => {
      const study = createKumimonoScene()
      study.camera.fov = 50
      study.camera.updateProjectionMatrix()
      study.update(0.85)
      const pillar = study.scene.getObjectByProperty('isMesh', true)
      if (pillar) pillar.name = 'Kumimono pillar'
      let elapsed = 0
      return {
        scene: study.scene,
        camera: study.camera,
        configure: configureKumimonoRenderer,
        dispose: study.dispose,
        animation: {
          object: study.animationObject,
          update(delta) {
            elapsed += delta
            study.update(0.85 + 0.15 * Math.sin((Math.min(elapsed / 3, 1) * Math.PI) / 2) ** 2)
          },
        },
      }
    },
  },
]

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
  const definition = nativeScenes[index]

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
      final={index === nativeScenes.length - 1}
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
  definition: (typeof nativeScenes)[number]
  final: boolean
  onRendererUnmounted: (id: string, final: boolean) => void
  onResult: (result: NativeSceneCorpusResult) => void
}) {
  const [fixture, setFixture] = useState<NativeFixture>()
  const [error, setError] = useState<unknown>()

  useEffect(() => {
    let active = true
    let resource: NativeFixture | undefined
    void definition
      .create(async () => MINIMAL_PBR_GLTF_SOURCE, { textureLoader: new TextureLoader() })
      .then((created) => {
        if (active) {
          resource = created
          setFixture(created)
        } else created.dispose?.()
      })
      .catch((reason: unknown) => {
        if (active) setError(reason)
      })
    return () => {
      active = false
      resource?.dispose?.()
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
  fixture: NativeFixture
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
  const initialTextures = useRef(0)
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
          console.log(
            `[hozo-three-evidence] ${JSON.stringify({ id, activated: true, renderCalls: renderCalls.current, textureCountDelta: textureCountDelta.current, animationFrames: animationFrames.current, animationAngle: animationAngle.current })}`,
          )
          settle()
        },
        testID: index === 0 ? `corpus-${id}` : undefined,
      }))}
      camera={fixture.camera}
      frameloop="always"
      onCreated={({ gl }) => {
        fixture.configure?.(gl as WebGLRenderer)
        initialTextures.current = (gl as WebGLRenderer).info.memory.textures
      }}
      scene={fixture.scene}
    >
      <MeasuredFixtureFrames
        onFrame={(delta, gl) => {
          // R3F's ordinary frame callbacks run before this frame's draw.
          // Renderer.info therefore proves the preceding frame actually drew,
          // rather than assuming a wall-clock delay was long enough.
          const evidence = sampleSceneRenderEvidence(
            { renderCalls: renderCalls.current, textureCountDelta: textureCountDelta.current },
            gl.info,
            initialTextures.current,
          )
          if (renderCalls.current === 0 && evidence.renderCalls > 0) {
            console.log(`[hozo-three-evidence] ${JSON.stringify({ id, ...evidence })}`)
          }
          renderCalls.current = evidence.renderCalls
          textureCountDelta.current = evidence.textureCountDelta
          if (fixture.animation && initialRotation) {
            fixture.animation.update(delta)
            animationFrames.current += 1
            animationAngle.current = Math.max(
              animationAngle.current,
              initialRotation.angleTo(fixture.animation.object.quaternion),
            )
          }
          settle()
        }}
      />
    </ThreeCanvas>
  )
}

function MeasuredFixtureFrames({
  onFrame,
}: {
  onFrame: (delta: number, gl: WebGLRenderer) => void
}) {
  useFrame(({ gl }, delta) => onFrame(delta, gl as WebGLRenderer))
  return null
}

function namedObjects(scene: Object3D): Object3D[] {
  const objects: Object3D[] = []
  scene.traverse((object) => {
    if (object.name && 'raycast' in object) objects.push(object)
  })
  return objects
}
