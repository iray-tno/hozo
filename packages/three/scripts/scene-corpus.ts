import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  BoxGeometry,
  BufferGeometry,
  type Camera,
  Color,
  Float32BufferAttribute,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  REVISION,
  Scene,
  Sprite,
  SpriteMaterial,
} from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

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

function perspective(): PerspectiveCamera {
  const camera = new PerspectiveCamera(90, 1, 0.1, 100)
  camera.position.z = 5
  camera.updateProjectionMatrix()
  return camera
}

function triangleGeometry(): BufferGeometry {
  return new BufferGeometry().setAttribute(
    'position',
    new Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 0, 1, 0], 3),
  )
}

async function flatDiagram(): Promise<{ camera: Camera; scene: Scene }> {
  const camera = new OrthographicCamera(-4, 4, 3, -3, 0.1, 20)
  camera.position.z = 5
  camera.updateProjectionMatrix()
  const scene = new Scene()
  scene.background = new Color('#f8fafc')
  const left = new Mesh(triangleGeometry(), new MeshBasicMaterial({ color: '#2563eb' }))
  left.name = 'Input node'
  left.position.x = -1.5
  const right = new Mesh(triangleGeometry(), new MeshBasicMaterial({ color: '#16a34a' }))
  right.name = 'Output node'
  right.position.x = 1.5
  const edge = new BufferGeometry().setAttribute(
    'position',
    new Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0], 3),
  )
  const connector = new LineSegments(edge, new LineBasicMaterial({ color: '#475569' }))
  connector.name = 'Connection'
  scene.add(left, connector, right)
  return { camera, scene }
}

async function wireframeCad(): Promise<{ camera: Camera; scene: Scene }> {
  const scene = new Scene()
  const model = new Mesh(
    new BoxGeometry(2, 2, 2),
    new MeshBasicMaterial({ color: '#0f766e', wireframe: true }),
  )
  model.name = 'Wireframe assembly'
  model.rotation.set(0.4, 0.6, 0.1)
  scene.add(model)
  return { camera: perspective(), scene }
}

async function pointsAndSprite(): Promise<{ camera: Camera; scene: Scene }> {
  const scene = new Scene()
  const geometry = new BufferGeometry().setAttribute(
    'position',
    new Float32BufferAttribute([-1.5, 0, 0, 0, 1, 0, 1.5, 0, 0], 3),
  )
  const cloud = new Points(
    geometry,
    new PointsMaterial({ color: '#7c3aed', size: 8, sizeAttenuation: false }),
  )
  cloud.name = 'Point cloud'
  const marker = new Sprite(new SpriteMaterial({ color: '#f97316' }))
  marker.name = 'Selected point'
  marker.position.set(0, -1, 0)
  scene.add(cloud, marker)
  return { camera: perspective(), scene }
}

async function instancingAndMorph(): Promise<{ camera: Camera; scene: Scene }> {
  const geometry = triangleGeometry()
  geometry.morphAttributes.position = [new Float32BufferAttribute([-1, 0, 0, 1, 0, 0, 0, 2, 0], 3)]
  const instances = new InstancedMesh(geometry, new MeshBasicMaterial({ color: '#0284c7' }), 2)
  instances.name = 'Morphed instances'
  instances.setMatrixAt(0, new Matrix4().makeTranslation(-1.25, 0, 0))
  instances.setMatrixAt(1, new Matrix4().makeTranslation(1.25, 0, 0))
  const morphTarget = new Mesh(geometry)
  if (!morphTarget.morphTargetInfluences) throw new Error('morph target did not initialise')
  morphTarget.morphTargetInfluences[0] = 0
  instances.setMorphAt(0, morphTarget)
  morphTarget.morphTargetInfluences[0] = 1
  instances.setMorphAt(1, morphTarget)
  const scene = new Scene()
  scene.add(instances)
  return { camera: perspective(), scene }
}

async function pinnedGltfPbr(): Promise<{ camera: Camera; scene: Scene }> {
  if (typeof globalThis.ProgressEvent === 'undefined') {
    Object.defineProperty(globalThis, 'ProgressEvent', {
      configurable: true,
      value: class NodeProgressEvent extends Event {
        readonly lengthComputable: boolean
        readonly loaded: number
        readonly total: number

        constructor(type: string, init: ProgressEventInit = {}) {
          super(type)
          this.lengthComputable = init.lengthComputable ?? false
          this.loaded = init.loaded ?? 0
          this.total = init.total ?? 0
        }
      },
    })
  }
  const location = path.join(packageRoot, 'fixtures', 'minimal-pbr.gltf')
  const source = await readFile(location, 'utf8')
  const gltf = await new GLTFLoader().parseAsync(source, path.dirname(location))
  const scene = new Scene()
  scene.add(gltf.scene)
  return { camera: perspective(), scene }
}

export const SCENE_CORPUS_FIXTURES: readonly SceneCorpusFixture[] = [
  {
    archetype: 'flat diagram / labelled interaction',
    create: flatDiagram,
    exercises: ['orthographic camera', 'flat meshes', 'line segments', 'named interaction targets'],
    id: 'flat-labelled-diagram',
    portableExpectation: {
      diagnostics: [],
      minimumNamedObjects: 3,
      minimumOutputNodes: 4,
      status: 'useful',
    },
    source: authoredSource('scripts/scene-corpus.ts#flatDiagram'),
  },
  {
    archetype: 'wireframe or CAD-like scene',
    create: wireframeCad,
    exercises: ['box geometry', 'world rotation', 'wireframe material', 'depth ordering'],
    id: 'wireframe-cad',
    portableExpectation: {
      diagnostics: [],
      minimumNamedObjects: 1,
      minimumOutputNodes: 12,
      status: 'useful',
    },
    source: authoredSource('scripts/scene-corpus.ts#wireframeCad'),
  },
  {
    archetype: 'points / sprite scene',
    create: pointsAndSprite,
    exercises: ['points', 'fixed screen-space point size', 'sprite billboard', 'named targets'],
    id: 'points-and-sprite',
    portableExpectation: {
      diagnostics: [],
      minimumNamedObjects: 2,
      minimumOutputNodes: 4,
      status: 'useful',
    },
    source: authoredSource('scripts/scene-corpus.ts#pointsAndSprite'),
  },
  {
    archetype: 'instancing plus morph with a portable material',
    create: instancingAndMorph,
    exercises: ['instanced mesh', 'instance transforms', 'morph targets', 'MeshBasicMaterial'],
    id: 'instancing-and-morph',
    portableExpectation: {
      diagnostics: [],
      minimumNamedObjects: 1,
      minimumOutputNodes: 2,
      status: 'useful',
    },
    source: authoredSource('scripts/scene-corpus.ts#instancingAndMorph'),
  },
  {
    archetype: 'ordinary glTF/PBR scene',
    create: pinnedGltfPbr,
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
  reason: `${family} corpus execution is not wired into CI yet`,
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
