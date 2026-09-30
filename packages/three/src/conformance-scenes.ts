import {
  AmbientLight,
  AnimationMixer,
  BoxGeometry,
  BufferGeometry,
  Cache,
  Color,
  DataTexture,
  Float32BufferAttribute,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NearestFilter,
  OrthographicCamera,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  RGBAFormat,
  Scene,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  UnsignedByteType,
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

/**
 * A self-contained product-viewer asset with a node hierarchy, UVs, two PBR
 * materials, a punctual light, and a rotation animation. Its small embedded
 * buffer makes the same glTF loadable by the browser and Hermes probes.
 */
export const PRODUCT_VIEWER_GLTF_SOURCE = JSON.stringify({
  asset: { generator: '@hozo/three product-viewer corpus', version: '2.0' },
  extensionsUsed: ['KHR_lights_punctual'],
  extensions: {
    KHR_lights_punctual: {
      lights: [{ type: 'point', color: [1, 0.94, 0.85], intensity: 30 }],
    },
  },
  scene: 0,
  scenes: [{ nodes: [0, 2] }],
  nodes: [
    { mesh: 0, name: 'Product housing', children: [1] },
    { mesh: 1, name: 'Product display' },
    {
      name: 'Product key light',
      translation: [1, 2, 2],
      extensions: { KHR_lights_punctual: { light: 0 } },
    },
  ],
  meshes: [
    {
      primitives: [
        { attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 },
      ],
    },
    {
      primitives: [
        { attributes: { POSITION: 4, NORMAL: 5, TEXCOORD_0: 6 }, indices: 7, material: 1 },
      ],
    },
  ],
  materials: [
    {
      name: 'Brushed housing',
      pbrMetallicRoughness: {
        baseColorFactor: [0.3, 0.4, 0.55, 1],
        metallicFactor: 0.4,
        roughnessFactor: 0.55,
      },
    },
    { name: 'Display surface', pbrMetallicRoughness: { metallicFactor: 0, roughnessFactor: 0.8 } },
  ],
  animations: [
    {
      name: 'Turntable',
      samplers: [{ input: 8, output: 9, interpolation: 'LINEAR' }],
      channels: [{ sampler: 0, target: { node: 0, path: 'rotation' } }],
    },
  ],
  accessors: [
    {
      bufferView: 0,
      componentType: 5126,
      count: 8,
      min: [-0.7, -0.8, -0.15],
      max: [0.7, 0.8, 0.15],
      type: 'VEC3',
    },
    { bufferView: 1, componentType: 5126, count: 8, type: 'VEC3' },
    { bufferView: 2, componentType: 5126, count: 8, type: 'VEC2' },
    { bufferView: 3, componentType: 5123, count: 36, type: 'SCALAR' },
    {
      bufferView: 4,
      componentType: 5126,
      count: 4,
      min: [-0.55, -0.65, 0.16],
      max: [0.55, 0.65, 0.16],
      type: 'VEC3',
    },
    { bufferView: 5, componentType: 5126, count: 4, type: 'VEC3' },
    { bufferView: 6, componentType: 5126, count: 4, type: 'VEC2' },
    { bufferView: 7, componentType: 5123, count: 6, type: 'SCALAR' },
    { bufferView: 8, componentType: 5126, count: 3, min: [0], max: [1], type: 'SCALAR' },
    { bufferView: 9, componentType: 5126, count: 3, type: 'VEC4' },
  ],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: 96 },
    { buffer: 0, byteOffset: 96, byteLength: 96 },
    { buffer: 0, byteOffset: 192, byteLength: 64 },
    { buffer: 0, byteOffset: 256, byteLength: 72 },
    { buffer: 0, byteOffset: 328, byteLength: 48 },
    { buffer: 0, byteOffset: 376, byteLength: 48 },
    { buffer: 0, byteOffset: 424, byteLength: 32 },
    { buffer: 0, byteOffset: 456, byteLength: 12 },
    { buffer: 0, byteOffset: 468, byteLength: 12 },
    { buffer: 0, byteOffset: 480, byteLength: 48 },
  ],
  buffers: [
    {
      byteLength: 528,
      uri: 'data:application/octet-stream;base64,MzMzv83MTL+amRm+MzMzP83MTL+amRm+MzMzP83MTD+amRm+MzMzv83MTD+amRm+MzMzv83MTL+amRk+MzMzP83MTL+amRk+MzMzP83MTD+amRk+MzMzv83MTD+amRk+AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAgD8AAIA/AAAAAAAAgD8AAAAAAAAAAAAAgD8AAAAAAACAPwAAgD8AAAAAAACAPwAAAgABAAAAAwACAAQABQAGAAQABgAHAAAAAQAFAAAABQAEAAMABwAGAAMABgACAAEAAgAGAAEABgAFAAAABAAHAAAABwADAM3MDL9mZia/CtcjPs3MDD9mZia/CtcjPs3MDD9mZiY/CtcjPs3MDL9mZiY/CtcjPgAAAAAAAAAAAACAPwAAAAAAAAAAAACAPwAAAAAAAAAAAACAPwAAAAAAAAAAAACAPwAAAAAAAAAAAACAPwAAAAAAAIA/AACAPwAAAAAAAIA/AAABAAIAAAACAAMAAAAAAAAAAD8AAIA/AAAAAAAAAAAAAAAAAACAPwAAAAB3V30+AAAAAKUKeD8AAAAAAAAAAAAAAAAAAIA/',
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

function decodeBase64(value: string): ArrayBuffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const clean = value.replace(/\s/g, '')
  const bytes: number[] = []
  for (let index = 0; index < clean.length; index += 4) {
    const a = alphabet.indexOf(clean[index] ?? '')
    const b = alphabet.indexOf(clean[index + 1] ?? '')
    const c = alphabet.indexOf(clean[index + 2] ?? '')
    const d = alphabet.indexOf(clean[index + 3] ?? '')
    if (a < 0 || b < 0) throw new Error('Invalid embedded glTF base64 buffer')
    bytes.push((a << 2) | (b >> 4))
    if (clean[index + 2] !== '=') {
      if (c < 0) throw new Error('Invalid embedded glTF base64 buffer')
      bytes.push(((b & 0x0f) << 4) | (c >> 2))
    }
    if (clean[index + 3] !== '=') {
      if (c < 0 || d < 0) throw new Error('Invalid embedded glTF base64 buffer')
      bytes.push(((c & 0x03) << 6) | d)
    }
  }
  return Uint8Array.from(bytes).buffer
}

function cacheEmbeddedGltfBuffers(source: string): () => void {
  const document = JSON.parse(source) as { buffers?: { uri?: string }[] }
  const previousEnabled = Cache.enabled
  Cache.enabled = true
  const entries = (document.buffers ?? []).flatMap(({ uri }) => {
    if (!uri?.startsWith('data:') || !uri.includes(';base64,')) return []
    const key = `file:${uri}`
    const previous = Cache.get(key)
    Cache.add(key, decodeBase64(uri.slice(uri.indexOf(',') + 1)))
    return [{ key, previous }]
  })
  return () => {
    for (const { key, previous } of entries) {
      if (previous === undefined) Cache.remove(key)
      else Cache.add(key, previous)
    }
    Cache.enabled = previousEnabled
  }
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
  const source = await loadGltfSource()
  const gltf = await parseEmbeddedGltf(source)
  const scene = new Scene()
  scene.add(new AmbientLight('#ffffff', 2), gltf.scene)
  return { camera: perspective(), scene }
}

async function parseEmbeddedGltf(source: string) {
  installGltfHostPolyfills()
  // React Native's fetch does not load data: buffers. Seed Three's public
  // FileLoader cache with the exact embedded bytes, which also avoids adding
  // a global fetch shim merely to execute this conformance fixture.
  const restoreCache = cacheEmbeddedGltfBuffers(source)
  return new GLTFLoader().parseAsync(source, '').finally(restoreCache)
}

async function productViewer(): Promise<SceneCorpusScene> {
  const gltf = await parseEmbeddedGltf(PRODUCT_VIEWER_GLTF_SOURCE)
  const display = gltf.scene.getObjectByName('Product_display')
  if (!(display instanceof Mesh) || !(display.material instanceof MeshStandardMaterial)) {
    throw new Error('Product viewer glTF did not load its PBR display mesh')
  }
  // The model supplies the UVs and material. This small raw texture exercises
  // GPU upload on Web and Expo GL without relying on a host-specific PNG
  // decoder; image-file loading is a separate integration boundary.
  const pixels = new Uint8Array([
    27, 82, 141, 255, 27, 82, 141, 255, 245, 158, 49, 255, 245, 158, 49, 255, 27, 82, 141, 255, 27,
    82, 141, 255, 245, 158, 49, 255, 245, 158, 49, 255, 27, 82, 141, 255, 27, 82, 141, 255, 245,
    158, 49, 255, 245, 158, 49, 255, 27, 82, 141, 255, 27, 82, 141, 255, 245, 158, 49, 255, 245,
    158, 49, 255,
  ])
  const map = new DataTexture(pixels, 4, 4, RGBAFormat, UnsignedByteType)
  map.colorSpace = SRGBColorSpace
  map.magFilter = NearestFilter
  map.minFilter = NearestFilter
  map.needsUpdate = true
  display.material.map = map
  display.material.needsUpdate = true

  const turntable = gltf.animations.find((clip) => clip.name === 'Turntable')
  if (!turntable) throw new Error('Product viewer glTF did not load its animation')
  const mixer = new AnimationMixer(gltf.scene)
  mixer.clipAction(turntable).play()
  mixer.setTime(0.5)

  const scene = new Scene()
  scene.add(new AmbientLight('#ffffff', 0.6), gltf.scene)
  scene.updateMatrixWorld(true)
  return { camera: perspective(), scene }
}

export const SCENE_CORPUS_SCENES: readonly SceneCorpusSceneDefinition[] = [
  { create: flatDiagram, id: 'flat-labelled-diagram' },
  { create: wireframeCad, id: 'wireframe-cad' },
  { create: pointsAndSprite, id: 'points-and-sprite' },
  { create: instancingAndMorph, id: 'instancing-and-morph' },
  { create: productViewer, id: 'product-viewer-gltf' },
  { create: pinnedGltfPbr, id: 'gltf-pbr' },
]
