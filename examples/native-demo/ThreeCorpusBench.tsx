import { Button, Text, View } from '@hozo/core'
import { ThreeCanvas } from '@hozo/three'
import {
  MINIMAL_PBR_GLTF_SOURCE,
  SCENE_CORPUS_SCENES,
  type SceneCorpusScene,
} from '@hozo/three/conformance-scenes'
import { useEffect, useState } from 'react'

interface ThreeCorpusBenchProps {
  onBack: () => void
}

/** Executes the version-pinned portable corpus on the real Native Skia host. */
export function ThreeCorpusBench({ onBack }: ThreeCorpusBenchProps) {
  const [index, setIndex] = useState(0)
  const [fixture, setFixture] = useState<SceneCorpusScene>()
  const [diagnostics, setDiagnostics] = useState<string[]>([])
  const [activated, setActivated] = useState('none')
  const definition = SCENE_CORPUS_SCENES[index]!

  useEffect(() => {
    let current = true
    setFixture(undefined)
    setDiagnostics([])
    setActivated('none')
    void definition
      .create(() => Promise.resolve(MINIMAL_PBR_GLTF_SOURCE))
      .then((created) => {
        if (!current) return
        console.info(`[hozo-three-corpus] loaded ${definition.id}`)
        setFixture(created)
      })
      .catch((error: unknown) => {
        if (!current) return
        const message = error instanceof Error ? error.message : String(error)
        console.error(`[hozo-three-corpus] failed ${definition.id}: ${message}`)
        setDiagnostics([`LOAD_FAILED: ${message}`])
      })
    return () => {
      current = false
    }
  }, [definition])

  const next = () => setIndex((value) => (value + 1) % SCENE_CORPUS_SCENES.length)

  return (
    <View className="gap-2 p-4" testID="three-corpus-bench">
      <Text className="text-lg font-bold">Three portable Native corpus</Text>
      <Text testID="three-corpus-scene">{`scene: ${definition.id}`}</Text>
      {fixture ? (
        <ThreeCanvas
          key={definition.id}
          width={320}
          height={240}
          scene={fixture.scene}
          camera={fixture.camera}
          accessibilityLabel={`${definition.id} Three scene`}
          testID="three-corpus-surface"
          onDiagnostic={(diagnostic) => {
            console.info(`[hozo-three-corpus] diagnostic ${definition.id} ${diagnostic.code}`)
            setDiagnostics((values) =>
              values.includes(diagnostic.code) ? values : [...values, diagnostic.code],
            )
          }}
          onObjectPress={({ object }) => {
            const label = object.name || object.uuid
            console.info(`[hozo-three-corpus] activated ${definition.id} ${label}`)
            setActivated(label)
          }}
        />
      ) : (
        <Text testID="three-corpus-loading">loading scene</Text>
      )}
      <Text testID="three-corpus-diagnostics" accessibilityLiveRegion="polite">
        {`diagnostics: ${diagnostics.join(',') || 'none'}`}
      </Text>
      <Text testID="three-corpus-activated" accessibilityLiveRegion="polite">
        {`activated: ${activated}`}
      </Text>
      <Button testID="three-corpus-next" onPress={next} disabled={!fixture}>
        Next Three scene
      </Button>
      <Button testID="three-corpus-back" onPress={onBack}>
        Back to Canvas checks
      </Button>
    </View>
  )
}
