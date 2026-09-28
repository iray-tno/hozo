import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { type Camera, REVISION, type Scene } from 'three'
import { SCENE_CORPUS_SCENES } from '../src/conformance-scenes.ts'
import { projectThreeScene, type ThreeProjectionDiagnosticCode } from '../src/project.ts'

export type SceneCorpusFamily = 'classic-webgl' | 'modern-webgpu' | 'native-host' | 'portable'
export type SceneCorpusStatus = 'diagnostic' | 'failed' | 'not-run' | 'useful'

export interface SceneCorpusFixture {
  archetype: string
  create: () => Promise<{ camera: Camera; scene: Scene }>
  exercises: readonly string[]
  id: string
  portableExpectation: {
    diagnostics: readonly ThreeProjectionDiagnosticCode[]
    minimumNamedObjects: number
    minimumOutputNodes: number
    status: Exclude<SceneCorpusStatus, 'failed' | 'not-run'>
  }
  source: {
    location: string
    version: string
  }
}

export interface SceneCorpusFamilyResult {
  reason?: string
  status: SceneCorpusStatus
}

export interface SceneCorpusFixtureResult {
  archetype: string
  exercises: readonly string[]
  families: Record<SceneCorpusFamily, SceneCorpusFamilyResult>
  id: string
  portableObservation: {
    diagnosticCodes: readonly ThreeProjectionDiagnosticCode[]
    namedObjects: number
    outputNodes: number
  }
  source: SceneCorpusFixture['source']
  verified: boolean
}

export interface SceneCorpusReport {
  fixtures: readonly SceneCorpusFixtureResult[]
  generatedAgainst: string
  schemaVersion: 1
  summary: {
    diagnostic: number
    failed: number
    notRunByFamily: Record<Exclude<SceneCorpusFamily, 'portable'>, number>
    useful: number
  }
}

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const authoredSource = (location: string) => ({
  location,
  version: `corpus-v1 / Three.js r${REVISION}`,
})

const sceneDefinition = (id: string) => {
  const definition = SCENE_CORPUS_SCENES.find((entry) => entry.id === id)
  if (!definition) throw new Error(`Missing real-scene definition: ${id}`)
  return () =>
    definition.create(() =>
      readFile(path.join(packageRoot, 'fixtures', 'minimal-pbr.gltf'), 'utf8'),
    )
}

export const SCENE_CORPUS_FIXTURES: readonly SceneCorpusFixture[] = [
  {
    archetype: 'flat diagram / labelled interaction',
    create: sceneDefinition('flat-labelled-diagram'),
    exercises: ['orthographic camera', 'flat meshes', 'line segments', 'named interaction targets'],
    id: 'flat-labelled-diagram',
    portableExpectation: {
      diagnostics: [],
      minimumNamedObjects: 3,
      minimumOutputNodes: 4,
      status: 'useful',
    },
    source: authoredSource('src/conformance-scenes.ts#flatDiagram'),
  },
  {
    archetype: 'wireframe or CAD-like scene',
    create: sceneDefinition('wireframe-cad'),
    exercises: ['box geometry', 'world rotation', 'wireframe material', 'depth ordering'],
    id: 'wireframe-cad',
    portableExpectation: {
      diagnostics: [],
      minimumNamedObjects: 1,
      minimumOutputNodes: 12,
      status: 'useful',
    },
    source: authoredSource('src/conformance-scenes.ts#wireframeCad'),
  },
  {
    archetype: 'points / sprite scene',
    create: sceneDefinition('points-and-sprite'),
    exercises: ['points', 'fixed screen-space point size', 'sprite billboard', 'named targets'],
    id: 'points-and-sprite',
    portableExpectation: {
      diagnostics: [],
      minimumNamedObjects: 2,
      minimumOutputNodes: 4,
      status: 'useful',
    },
    source: authoredSource('src/conformance-scenes.ts#pointsAndSprite'),
  },
  {
    archetype: 'instancing plus morph with a portable material',
    create: sceneDefinition('instancing-and-morph'),
    exercises: [
      'instanced mesh',
      'instance transforms',
      'relative morph targets',
      'MeshBasicMaterial',
    ],
    id: 'instancing-and-morph',
    portableExpectation: {
      diagnostics: [],
      minimumNamedObjects: 1,
      minimumOutputNodes: 2,
      status: 'useful',
    },
    source: authoredSource('src/conformance-scenes.ts#instancingAndMorph'),
  },
  {
    archetype: 'ordinary glTF/PBR scene',
    create: sceneDefinition('gltf-pbr'),
    exercises: ['glTF 2.0 loader', 'asset graph', 'MeshStandardMaterial', 'PBR factors'],
    id: 'gltf-pbr',
    portableExpectation: {
      diagnostics: ['UNSUPPORTED_MATERIAL'],
      minimumNamedObjects: 0,
      minimumOutputNodes: 0,
      status: 'diagnostic',
    },
    source: {
      location: 'fixtures/minimal-pbr.gltf',
      version: `glTF 2.0 / Three.js r${REVISION}`,
    },
  },
]

const notRun = (family: Exclude<SceneCorpusFamily, 'portable'>): SceneCorpusFamilyResult => ({
  reason: `${family} result is emitted by its environment workflow and is not baked into this deterministic report`,
  status: 'not-run',
})

export async function runSceneCorpus(): Promise<SceneCorpusReport> {
  const fixtures: SceneCorpusFixtureResult[] = []
  for (const fixture of SCENE_CORPUS_FIXTURES) {
    const { camera, scene } = await fixture.create()
    const projection = projectThreeScene(scene, camera, { height: 240, width: 320 })
    const diagnosticCodes = projection.diagnostics.map((entry) => entry.code)
    const namedObjects = new Set(
      projection.objects.filter((object) => object?.name).map((object) => object?.uuid),
    ).size
    const expectation = fixture.portableExpectation
    const observedStatus: SceneCorpusStatus =
      projection.scene.length > 0 ? 'useful' : diagnosticCodes.length > 0 ? 'diagnostic' : 'failed'
    const verified =
      observedStatus === expectation.status &&
      projection.scene.length >= expectation.minimumOutputNodes &&
      namedObjects >= expectation.minimumNamedObjects &&
      JSON.stringify(diagnosticCodes) === JSON.stringify(expectation.diagnostics)
    fixtures.push({
      archetype: fixture.archetype,
      exercises: fixture.exercises,
      families: {
        'classic-webgl': notRun('classic-webgl'),
        'modern-webgpu': notRun('modern-webgpu'),
        'native-host': notRun('native-host'),
        portable: {
          reason: verified
            ? undefined
            : 'portable observation did not match the pinned expectation',
          status: verified ? observedStatus : 'failed',
        },
      },
      id: fixture.id,
      portableObservation: {
        diagnosticCodes,
        namedObjects,
        outputNodes: projection.scene.length,
      },
      source: fixture.source,
      verified,
    })
  }

  return {
    fixtures,
    generatedAgainst: `Three.js r${REVISION}`,
    schemaVersion: 1,
    summary: {
      diagnostic: fixtures.filter((entry) => entry.families.portable.status === 'diagnostic')
        .length,
      failed: fixtures.filter((entry) => !entry.verified).length,
      notRunByFamily: {
        'classic-webgl': fixtures.filter(
          (entry) => entry.families['classic-webgl'].status === 'not-run',
        ).length,
        'modern-webgpu': fixtures.filter(
          (entry) => entry.families['modern-webgpu'].status === 'not-run',
        ).length,
        'native-host': fixtures.filter(
          (entry) => entry.families['native-host'].status === 'not-run',
        ).length,
      },
      useful: fixtures.filter((entry) => entry.families.portable.status === 'useful').length,
    },
  }
}
