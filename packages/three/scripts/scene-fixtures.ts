import {
  AmbientLight,
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
  Scene,
  Sprite,
  SpriteMaterial,
} from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

export interface SceneCorpusScene {
  camera: Camera
  scene: Scene
}

export interface SceneCorpusSceneDefinition {
  create: (loadGltfSource: () => Promise<string>) => Promise<SceneCorpusScene>
  id: string
}

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
