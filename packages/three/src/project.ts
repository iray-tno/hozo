import type { CanvasScene, CanvasSceneNode } from '@hozo/canvas'
import {
  BackSide,
  DoubleSide,
  Matrix4,
  type Mesh,
  type MeshBasicMaterial,
  type Object3D,
  type OrthographicCamera,
  type PerspectiveCamera,
  type Scene,
  Vector4,
} from 'three'

export type ThreeProjectionDiagnosticCode =
  | 'INVALID_VIEWPORT'
  | 'UNSUPPORTED_CAMERA'
  | 'UNSUPPORTED_GEOMETRY'
  | 'UNSUPPORTED_MATERIAL'
  | 'UNSUPPORTED_MESH'

export interface ThreeProjectionDiagnostic {
  code: ThreeProjectionDiagnosticCode
  message: string
  object?: Object3D
}

export interface ThreeProjectionOptions {
  width: number
  height: number
  onDiagnostic?: (diagnostic: ThreeProjectionDiagnostic) => void
}

export interface ThreeProjection {
  scene: CanvasScene
  /** Source object for each scene node at the same index. */
  objects: readonly Object3D[]
  diagnostics: readonly ThreeProjectionDiagnostic[]
}

interface ProjectedTriangle {
  depth: number
  object: Object3D
  order: number
  node: CanvasSceneNode
}

type SupportedCamera = PerspectiveCamera | OrthographicCamera

const clipPlanes = [
  (point: Vector4) => point.w + point.x,
  (point: Vector4) => point.w - point.x,
  (point: Vector4) => point.w + point.y,
  (point: Vector4) => point.w - point.y,
  (point: Vector4) => point.w + point.z,
  (point: Vector4) => point.w - point.z,
] as const

function clippedPolygon(triangle: readonly Vector4[]): Vector4[] {
  let polygon = triangle.map((point) => point.clone())
  for (const distance of clipPlanes) {
    if (polygon.length === 0) return polygon
    const clipped: Vector4[] = []
    let previous = polygon.at(-1) as Vector4
    let previousDistance = distance(previous)
    for (const current of polygon) {
      const currentDistance = distance(current)
      const previousInside = previousDistance >= 0
      const currentInside = currentDistance >= 0
      if (previousInside !== currentInside) {
        const denominator = previousDistance - currentDistance
        if (denominator !== 0) {
          clipped.push(previous.clone().lerp(current, previousDistance / denominator))
        }
      }
      if (currentInside) clipped.push(current.clone())
      previous = current
      previousDistance = currentDistance
    }
    polygon = clipped
  }
  return polygon
}

function printable(value: number): string {
  const rounded = Math.abs(value) < 0.0000005 ? 0 : Number(value.toFixed(6))
  return String(rounded)
}

function projectedPoint(point: Vector4, width: number, height: number) {
  if (point.w === 0) return undefined
  const x = point.x / point.w
  const y = point.y / point.w
  const z = point.z / point.w
  if (![x, y, z].every(Number.isFinite)) return undefined
  return {
    x: ((x + 1) * width) / 2,
    y: ((1 - y) * height) / 2,
    z,
  }
}

function signedArea(points: readonly { x: number; y: number }[]) {
  const [a, b, c] = points
  if (!a || !b || !c) return 0
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
}

function materialReason(material: MeshBasicMaterial): string | undefined {
  if (material.wireframe) return 'wireframe MeshBasicMaterial is not in the flat-fill subset'
  if (material.vertexColors) return 'vertex colours are not in the flat-fill subset'
  if (material.transparent || material.opacity !== 1) {
    return 'transparent materials need depth-aware compositing and are not projected'
  }
  if (
    material.map ||
    material.alphaMap ||
    material.aoMap ||
    material.envMap ||
    material.lightMap ||
    material.specularMap
  ) {
    return 'textured MeshBasicMaterial is not in the flat-fill subset'
  }
  if (material.clippingPlanes && material.clippingPlanes.length > 0) {
    return 'material clipping planes are not projected'
  }
  return undefined
}

function isSupportedCamera(object: Object3D): object is SupportedCamera {
  const candidate = object as Partial<PerspectiveCamera & OrthographicCamera>
  return candidate.isPerspectiveCamera === true || candidate.isOrthographicCamera === true
}

function diagnostic(
  diagnostics: ThreeProjectionDiagnostic[],
  options: ThreeProjectionOptions,
  value: ThreeProjectionDiagnostic,
) {
  diagnostics.push(value)
  options.onDiagnostic?.(value)
}

/**
 * Projects the deliberately portable part of a Three.js scene into Hozo's
 * retained 2D scene.
 *
 * This is not a software WebGL renderer. It accepts ordinary public Three.js
 * scene objects and preserves their world transforms, camera projection,
 * clip volume, face side and back-to-front order. Features whose correct
 * answer needs a GPU -- textures, blending, skinning and instancing among
 * them -- are omitted with a diagnostic rather than drawn approximately.
 */
export function projectThreeScene(
  scene: Scene,
  camera: Object3D,
  options: ThreeProjectionOptions,
): ThreeProjection {
  const diagnostics: ThreeProjectionDiagnostic[] = []
  if (!(options.width > 0) || !(options.height > 0)) {
    diagnostic(diagnostics, options, {
      code: 'INVALID_VIEWPORT',
      message: `Three projection needs a positive viewport; received ${options.width} x ${options.height}.`,
    })
    return { scene: [], objects: [], diagnostics }
  }
  if (!isSupportedCamera(camera)) {
    diagnostic(diagnostics, options, {
      code: 'UNSUPPORTED_CAMERA',
      message: 'Only Three.js PerspectiveCamera and OrthographicCamera are portable.',
      object: camera,
    })
    return { scene: [], objects: [], diagnostics }
  }

  scene.updateMatrixWorld(true)
  camera.updateMatrixWorld(true)
  const viewProjection = new Matrix4().multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse,
  )
  const triangles: ProjectedTriangle[] = []
  let order = 0

  scene.traverseVisible((object) => {
    const candidate = object as Partial<Mesh>
    if (candidate.isMesh !== true) return
    const mesh = object as Mesh
    if ((mesh as Mesh & { isInstancedMesh?: boolean }).isInstancedMesh) {
      diagnostic(diagnostics, options, {
        code: 'UNSUPPORTED_MESH',
        message: 'InstancedMesh needs per-instance transforms and is not projected yet.',
        object,
      })
      return
    }
    if ((mesh as Mesh & { isSkinnedMesh?: boolean }).isSkinnedMesh) {
      diagnostic(diagnostics, options, {
        code: 'UNSUPPORTED_MESH',
        message: 'SkinnedMesh needs evaluated bone transforms and is not projected yet.',
        object,
      })
      return
    }
    if (mesh.morphTargetInfluences?.some((influence) => influence !== 0)) {
      diagnostic(diagnostics, options, {
        code: 'UNSUPPORTED_MESH',
        message: 'Active morph targets are not projected yet.',
        object,
      })
      return
    }
    if (Array.isArray(mesh.material)) {
      diagnostic(diagnostics, options, {
        code: 'UNSUPPORTED_MATERIAL',
        message: 'Material arrays and geometry groups are not projected yet.',
        object,
      })
      return
    }
    const material = mesh.material as Partial<MeshBasicMaterial>
    if (material.isMeshBasicMaterial !== true) {
      diagnostic(diagnostics, options, {
        code: 'UNSUPPORTED_MATERIAL',
        message: 'The portable subset currently accepts MeshBasicMaterial only.',
        object,
      })
      return
    }
    // Three treats an invisible material like an invisible draw call. This is
    // intentional scene state, not an unsupported feature worth reporting.
    if (material.visible === false) return
    const reason = materialReason(material as MeshBasicMaterial)
    if (reason) {
      diagnostic(diagnostics, options, {
        code: 'UNSUPPORTED_MATERIAL',
        message: reason,
        object,
      })
      return
    }

    const position = mesh.geometry.getAttribute('position')
    if (!position || position.itemSize < 3) {
      diagnostic(diagnostics, options, {
        code: 'UNSUPPORTED_GEOMETRY',
        message: 'BufferGeometry needs a position attribute with three components.',
        object,
      })
      return
    }
    const index = mesh.geometry.getIndex()
    const available = index?.count ?? position.count
    const start = Math.max(0, Math.floor(mesh.geometry.drawRange.start))
    const requested = mesh.geometry.drawRange.count
    const end = Math.min(available, Number.isFinite(requested) ? start + requested : available)
    const matrix = new Matrix4().multiplyMatrices(viewProjection, mesh.matrixWorld)
    const vertex = (offset: number) => {
      const vertexIndex = index ? index.getX(offset) : offset
      return new Vector4(
        position.getX(vertexIndex),
        position.getY(vertexIndex),
        position.getZ(vertexIndex),
        1,
      ).applyMatrix4(matrix)
    }
    const fill = `#${(material as MeshBasicMaterial).color.getHexString()}`

    for (let offset = start; offset + 2 < end; offset += 3) {
      const polygon = clippedPolygon([vertex(offset), vertex(offset + 1), vertex(offset + 2)])
      if (polygon.length < 3) continue
      for (let fan = 1; fan + 1 < polygon.length; fan += 1) {
        const first = polygon[0]
        const second = polygon[fan]
        const third = polygon[fan + 1]
        if (!first || !second || !third) continue
        const clipTriangle = [first, second, third] as const
        const points = clipTriangle.map((point) =>
          projectedPoint(point, options.width, options.height),
        )
        if (points.some((point) => point === undefined)) continue
        const projected = points as { x: number; y: number; z: number }[]
        const area = signedArea(projected)
        if (area === 0) continue
        const side = (material as MeshBasicMaterial).side
        if (side !== DoubleSide && (side === BackSide ? area < 0 : area > 0)) continue
        const path = `M ${printable(projected[0]?.x ?? 0)} ${printable(projected[0]?.y ?? 0)} L ${printable(projected[1]?.x ?? 0)} ${printable(projected[1]?.y ?? 0)} L ${printable(projected[2]?.x ?? 0)} ${printable(projected[2]?.y ?? 0)} Z`
        triangles.push({
          depth: projected.reduce((sum, point) => sum + point.z, 0) / 3,
          object,
          order: order++,
          node: { kind: 'path', props: { path, fill } },
        })
      }
    }
  })

  triangles.sort((left, right) => right.depth - left.depth || left.order - right.order)
  return {
    scene: triangles.map((triangle) => triangle.node),
    objects: triangles.map((triangle) => triangle.object),
    diagnostics,
  }
}
