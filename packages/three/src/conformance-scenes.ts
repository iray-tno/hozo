import {
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
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
  Scene,
  Sprite,
  SpriteMaterial,
} from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

export interface SceneCorpusScene {
  camera: OrthographicCamera | PerspectiveCamera
  scene: Scene
}

export interface SceneCorpusSceneDefinition {
  create: (loadGltfSource: () => Promise<string>) => Promise<SceneCorpusScene>
  id: string
}

/**
 * The tiny pinned glTF asset used by every conformance host.
 *
 * Keeping the source beside the scene builders lets browser, Node and React
 * Native execute the same asset without teaching Metro how to import `.gltf`
 * files. `fixtures/minimal-pbr.gltf` remains the human-readable copy used by
 * the report and is checked against this value by the corpus test.
 */
export const MINIMAL_PBR_GLTF_SOURCE = JSON.stringify({
  asset: { generator: '@hozo/three real-scene corpus', version: '2.0' },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0, name: 'Pinned PBR triangle' }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
  materials: [
    {
      name: 'Ordinary PBR material',
      pbrMetallicRoughness: {
        baseColorFactor: [0.125, 0.45, 0.85, 1],
        metallicFactor: 0.25,
        roughnessFactor: 0.65,
      },
    },
  ],
  accessors: [
    {
      bufferView: 0,
      componentType: 5126,
      count: 3,
      max: [1, 1, 0],
      min: [-1, -1, 0],
      type: 'VEC3',
    },
  ],
  bufferViews: [{ buffer: 0, byteLength: 36 }],
  buffers: [
    {
      byteLength: 36,
      uri: 'data:application/octet-stream;base64,AACAvwAAgL8AAAAAAAAAPwAAgL8AAAAAAAAAAAAAAD8AAAAA',
    },
  ],
})

function perspective(): PerspectiveCamera {
  const camera = new PerspectiveCamera(90, 1, 0.1, 100)
  camera.position.z = 5
  camera.updateProjectionMatrix()
  return camera
}

function decodeUtf8(input: AllowSharedBufferSource | undefined): string {
  if (!input) return ''
  const bytes = ArrayBuffer.isView(input)
    ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
    : new Uint8Array(input)
  let result = ''
  for (let index = 0; index < bytes.length; ) {
    const first = bytes[index++] ?? 0
    if (first < 0x80) {
      result += String.fromCharCode(first)
      continue
    }
    const width = first < 0xe0 ? 2 : first < 0xf0 ? 3 : 4
    let codePoint = first & (0x7f >> width)
    for (let offset = 1; offset < width; offset += 1) {
      const next = bytes[index++]
      if (next === undefined || (next & 0xc0) !== 0x80) {
        result += '\uFFFD'
        codePoint = -1
        break
      }
      codePoint = (codePoint << 6) | (next & 0x3f)
    }
    if (codePoint < 0) continue
    if (codePoint <= 0xffff) result += String.fromCharCode(codePoint)
    else {
      const astral = codePoint - 0x10000
      result += String.fromCharCode(0xd800 + (astral >> 10), 0xdc00 + (astral & 0x3ff))
    }
  }
  return result
}

function installGltfHostPolyfills(): void {
  // Hermes does not expose TextDecoder. GLTFLoader uses it while parsing even
  // an embedded JSON fixture, so keep this conformance-only host shim beside
  // the fixture instead of adding a runtime dependency to @hozo/three.
  if (typeof globalThis.TextDecoder === 'undefined') {
    Object.defineProperty(globalThis, 'TextDecoder', {
      configurable: true,
      value: class ConformanceTextDecoder {
        readonly encoding = 'utf-8'

        decode(input?: AllowSharedBufferSource): string {
          return decodeUtf8(input)
        }
      },
    })
  }

  // React Native defines navigator, but unlike browsers it may omit
  // userAgent. GLTFLoader currently probes it unconditionally when choosing a
  // texture loader, including for this texture-free fixture.
  if (typeof globalThis.navigator === 'undefined') {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { userAgent: 'React Native' },
    })
  } else if (typeof globalThis.navigator.userAgent !== 'string') {
    Object.defineProperty(globalThis.navigator, 'userAgent', {
      configurable: true,
      value: 'React Native',
    })
  }

  if (typeof globalThis.ProgressEvent !== 'undefined') return
  Object.defineProperty(globalThis, 'ProgressEvent', {
    configurable: true,
    value: class ConformanceProgressEvent extends Event {
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

function triangleGeometry(): BufferGeometry {
  return new BufferGeometry().setAttribute(
    'position',
    new Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 0, 1, 0], 3),
  )
}

async function flatDiagram(): Promise<SceneCorpusScene> {
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

async function wireframeCad(): Promise<SceneCorpusScene> {
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

async function pointsAndSprite(): Promise<SceneCorpusScene> {
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

async function instancingAndMorph(): Promise<SceneCorpusScene> {
  const geometry = triangleGeometry()
  geometry.morphTargetsRelative = true
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

async function pinnedGltfPbr(loadGltfSource: () => Promise<string>): Promise<SceneCorpusScene> {
  installGltfHostPolyfills()
  const gltf = await new GLTFLoader().parseAsync(await loadGltfSource(), '')
  const scene = new Scene()
  scene.add(new AmbientLight('#ffffff', 2), gltf.scene)
  return { camera: perspective(), scene }
}

export const SCENE_CORPUS_SCENES: readonly SceneCorpusSceneDefinition[] = [
  { create: flatDiagram, id: 'flat-labelled-diagram' },
  { create: wireframeCad, id: 'wireframe-cad' },
  { create: pointsAndSprite, id: 'points-and-sprite' },
  { create: instancingAndMorph, id: 'instancing-and-morph' },
  { create: pinnedGltfPbr, id: 'gltf-pbr' },
]
