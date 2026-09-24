import type { CanvasScene, CanvasSceneNode } from '@hozo/canvas'
import {
  BackSide,
  type Color,
  DoubleSide,
  type InstancedMesh,
  LessEqualDepth,
  type LineBasicMaterial,
  type LOD,
  type Material,
  Matrix4,
  type Mesh,
  type MeshBasicMaterial,
  NormalBlending,
  type Object3D,
  type OrthographicCamera,
  type PerspectiveCamera,
  type Points,
  type PointsMaterial,
  type Scene,
  type Sprite,
  type SpriteMaterial,
  type Line as ThreeLine,
  Vector4,
} from 'three'

export type ThreeProjectionDiagnosticCode =
  | 'INVALID_VIEWPORT'
  | 'UNSUPPORTED_CAMERA'
  | 'UNSUPPORTED_GEOMETRY'
  | 'UNSUPPORTED_MATERIAL'
  | 'UNSUPPORTED_MESH'
  | 'UNSUPPORTED_OBJECT'
  | 'UNSUPPORTED_SCENE'

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
  /** Source object for each scene node at the same index, absent for scene decoration. */
  objects: readonly (Object3D | undefined)[]
  diagnostics: readonly ThreeProjectionDiagnostic[]
}

interface ProjectedPrimitive {
  depth: number
  groupOrder: number
  object: Object3D
  order: number
  renderOrder: number
  node: CanvasSceneNode
}

type SupportedCamera = PerspectiveCamera | OrthographicCamera

function isColorBackground(background: Scene['background']): background is Color {
  return background !== null && (background as Color).isColor === true
}

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

function clippedSegment(from: Vector4, to: Vector4): readonly [Vector4, Vector4] | undefined {
  let start = from.clone()
  let end = to.clone()
  for (const distance of clipPlanes) {
    const startDistance = distance(start)
    const endDistance = distance(end)
    if (startDistance < 0 && endDistance < 0) return undefined
    if (startDistance >= 0 && endDistance >= 0) continue
    const crossing = start.clone().lerp(end, startDistance / (startDistance - endDistance))
    if (startDistance < 0) start = crossing
    else end = crossing
  }
  return [start, end]
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

function baseMaterialReason(material: Material): string | undefined {
  if (material.blending !== NormalBlending) return 'non-default blending is not projected'
  if (
    material.depthTest !== true ||
    material.depthWrite !== true ||
    material.depthFunc !== LessEqualDepth
  ) {
    return 'non-default depth material state is not projected'
  }
  if (material.stencilWrite) return 'stencil-writing materials are not projected'
  if (!material.colorWrite) return 'materials with colorWrite disabled are not projected'
  if (material.polygonOffset) return 'polygon-offset material state is not projected'
  return undefined
}

function materialReason(material: MeshBasicMaterial): string | undefined {
  const baseReason = baseMaterialReason(material)
  if (baseReason) return baseReason
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

function lineMaterialReason(material: LineBasicMaterial): string | undefined {
  const baseReason = baseMaterialReason(material)
  if (baseReason) return baseReason
  if ((material as LineBasicMaterial & { isLineDashedMaterial?: boolean }).isLineDashedMaterial) {
    return 'dashed line materials are not projected yet'
  }
  if (material.vertexColors) return 'vertex-coloured lines are not projected yet'
  if (material.transparent || material.opacity !== 1) {
    return 'transparent lines need depth-aware compositing and are not projected'
  }
  if (material.clippingPlanes && material.clippingPlanes.length > 0) {
    return 'material clipping planes are not projected'
  }
  return undefined
}

function pointsMaterialReason(material: PointsMaterial): string | undefined {
  const baseReason = baseMaterialReason(material)
  if (baseReason) return baseReason
  if (material.vertexColors) return 'vertex-coloured points are not projected yet'
  if (material.transparent || material.opacity !== 1) {
    return 'transparent points need depth-aware compositing and are not projected'
  }
  if (material.map || material.alphaMap) return 'textured points are not projected yet'
  if (material.clippingPlanes && material.clippingPlanes.length > 0) {
    return 'material clipping planes are not projected'
  }
  return undefined
}

function spriteMaterialReason(material: SpriteMaterial): string | undefined {
  const baseReason = baseMaterialReason(material)
  if (baseReason) return baseReason
  if (material.opacity !== 1) {
    return 'translucent sprites need depth-aware compositing and are not projected'
  }
  if (material.map || material.alphaMap) return 'textured sprites are not projected yet'
  if (material.clippingPlanes && material.clippingPlanes.length > 0) {
    return 'material clipping planes are not projected'
  }
  return undefined
}

function isSupportedCamera(object: Object3D): object is SupportedCamera {
  const candidate = object as Partial<PerspectiveCamera & OrthographicCamera>
  return candidate.isPerspectiveCamera === true || candidate.isOrthographicCamera === true
}

function inheritedGroupOrder(object: Object3D, camera: SupportedCamera): number {
  let ancestor = object.parent
  while (ancestor) {
    if (
      (ancestor as Object3D & { isGroup?: boolean }).isGroup === true &&
      ancestor.layers.test(camera.layers)
    ) {
      return ancestor.renderOrder
    }
    ancestor = ancestor.parent
  }
  return 0
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
  if ((camera as Object3D & { isArrayCamera?: boolean }).isArrayCamera === true) {
    diagnostic(diagnostics, options, {
      code: 'UNSUPPORTED_CAMERA',
      message: 'ArrayCamera needs per-camera viewports and is not projected yet.',
      object: camera,
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

  const decoration: CanvasSceneNode[] = []
  const decorationObjects: undefined[] = []
  if (isColorBackground(scene.background)) {
    decoration.push({
      kind: 'rect',
      props: {
        x: 0,
        y: 0,
        width: options.width,
        height: options.height,
        fill: `#${scene.background.getHexString()}`,
      },
    })
    decorationObjects.push(undefined)
  } else if (scene.background !== null) {
    diagnostic(diagnostics, options, {
      code: 'UNSUPPORTED_SCENE',
      message: 'Texture and cube-texture scene backgrounds are not projected yet.',
      object: scene,
    })
  }

  let rejectSceneGeometry = false
  if (scene.overrideMaterial !== null) {
    diagnostic(diagnostics, options, {
      code: 'UNSUPPORTED_SCENE',
      message: 'Scene.overrideMaterial is not projected; affected geometry was omitted.',
      object: scene,
    })
    rejectSceneGeometry = true
  }
  if (scene.fog !== null) {
    diagnostic(diagnostics, options, {
      code: 'UNSUPPORTED_SCENE',
      message: 'Scene fog is not projected; affected geometry was omitted.',
      object: scene,
    })
    rejectSceneGeometry = true
  }
  if (rejectSceneGeometry) {
    return { scene: decoration, objects: decorationObjects, diagnostics }
  }

  scene.updateMatrixWorld(true)
  camera.updateMatrixWorld(true)
  const viewProjection = new Matrix4().multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse,
  )
  const primitives: ProjectedPrimitive[] = []
  let order = 0

  scene.traverseVisible((object) => {
    const candidate = object as Partial<Mesh & Points & ThreeLine> & {
      isBatchedMesh?: boolean
      isLOD?: boolean
      isSprite?: boolean
    }
    if (candidate.isLOD === true) {
      const lod = object as LOD
      if (lod.layers.test(camera.layers) && lod.autoUpdate) lod.update(camera)
      return
    }
    if (!object.layers.test(camera.layers)) return
    const groupOrder = inheritedGroupOrder(object, camera)
    if (candidate.isSprite === true) {
      const sprite = object as Sprite
      if (sprite.count <= 0) return
      const material = sprite.material as Partial<SpriteMaterial>
      if (material.isSpriteMaterial !== true) {
        diagnostic(diagnostics, options, {
          code: 'UNSUPPORTED_MATERIAL',
          message: 'The portable sprite subset currently accepts SpriteMaterial only.',
          object,
        })
        return
      }
      if (material.visible === false) return
      const reason = spriteMaterialReason(material as SpriteMaterial)
      if (reason) {
        diagnostic(diagnostics, options, {
          code: 'UNSUPPORTED_MATERIAL',
          message: reason,
          object,
        })
        return
      }

      const spriteMaterial = material as SpriteMaterial
      const modelView = new Matrix4().multiplyMatrices(
        camera.matrixWorldInverse,
        sprite.matrixWorld,
      )
      const world = sprite.matrixWorld.elements
      let scaleX = Math.hypot(world[0] ?? 0, world[1] ?? 0, world[2] ?? 0)
      let scaleY = Math.hypot(world[4] ?? 0, world[5] ?? 0, world[6] ?? 0)
      const viewX = modelView.elements[12] ?? 0
      const viewY = modelView.elements[13] ?? 0
      const viewZ = modelView.elements[14] ?? 0
      if (
        (camera as Partial<PerspectiveCamera>).isPerspectiveCamera === true &&
        !spriteMaterial.sizeAttenuation
      ) {
        scaleX *= -viewZ
        scaleY *= -viewZ
      }
      const cosine = Math.cos(spriteMaterial.rotation)
      const sine = Math.sin(spriteMaterial.rotation)
      const corners = [
        [-0.5, -0.5],
        [0.5, -0.5],
        [0.5, 0.5],
        [-0.5, 0.5],
      ] as const
      const polygon = clippedPolygon(
        corners.map(([x, y]) => {
          const alignedX = (x - (sprite.center.x - 0.5)) * scaleX
          const alignedY = (y - (sprite.center.y - 0.5)) * scaleY
          return new Vector4(
            viewX + cosine * alignedX - sine * alignedY,
            viewY + sine * alignedX + cosine * alignedY,
            viewZ,
            1,
          ).applyMatrix4(camera.projectionMatrix)
        }),
      )
      if (polygon.length < 3) return
      const projected = polygon.map((point) => projectedPoint(point, options.width, options.height))
      if (projected.some((point) => point === undefined)) return
      const points = projected as { x: number; y: number; z: number }[]
      const [first, ...rest] = points
      if (!first) return
      const path = `M ${printable(first.x)} ${printable(first.y)} ${rest
        .map((point) => `L ${printable(point.x)} ${printable(point.y)}`)
        .join(' ')} Z`
      primitives.push({
        depth: points.reduce((sum, point) => sum + point.z, 0) / points.length,
        groupOrder,
        object,
        order: order++,
        renderOrder: object.renderOrder,
        node: {
          kind: 'path',
          props: { path, fill: `#${spriteMaterial.color.getHexString()}` },
        },
      })
      return
    }
    if (candidate.isLine === true) {
      const line = object as ThreeLine
      if (line.morphTargetInfluences?.some((influence) => influence !== 0)) {
        diagnostic(diagnostics, options, {
          code: 'UNSUPPORTED_GEOMETRY',
          message: 'Active line morph targets are not projected yet.',
          object,
        })
        return
      }
      if (Array.isArray(line.material)) {
        diagnostic(diagnostics, options, {
          code: 'UNSUPPORTED_MATERIAL',
          message: 'Material arrays and geometry groups are not projected yet.',
          object,
        })
        return
      }
      const material = line.material as Partial<LineBasicMaterial>
      if (material.isLineBasicMaterial !== true) {
        diagnostic(diagnostics, options, {
          code: 'UNSUPPORTED_MATERIAL',
          message: 'The portable line subset currently accepts LineBasicMaterial only.',
          object,
        })
        return
      }
      if (material.visible === false) return
      const reason = lineMaterialReason(material as LineBasicMaterial)
      if (reason) {
        diagnostic(diagnostics, options, {
          code: 'UNSUPPORTED_MATERIAL',
          message: reason,
          object,
        })
        return
      }
      const position = line.geometry.getAttribute('position')
      if (!position || position.itemSize < 3) {
        diagnostic(diagnostics, options, {
          code: 'UNSUPPORTED_GEOMETRY',
          message: 'BufferGeometry needs a position attribute with three components.',
          object,
        })
        return
      }
      const index = line.geometry.getIndex()
      const available = index?.count ?? position.count
      const start = Math.max(0, Math.floor(line.geometry.drawRange.start))
      const requested = line.geometry.drawRange.count
      const end = Math.min(available, Number.isFinite(requested) ? start + requested : available)
      const matrix = new Matrix4().multiplyMatrices(viewProjection, line.matrixWorld)
      const vertex = (offset: number) => {
        const vertexIndex = index ? index.getX(offset) : offset
        return new Vector4(
          position.getX(vertexIndex),
          position.getY(vertexIndex),
          position.getZ(vertexIndex),
          1,
        ).applyMatrix4(matrix)
      }
      const stroke = `#${(material as LineBasicMaterial).color.getHexString()}`
      const strokeWidth = Math.max(0, (material as LineBasicMaterial).linewidth)
      if (strokeWidth === 0) return
      const segments: [number, number][] = []
      if ((line as ThreeLine & { isLineSegments?: boolean }).isLineSegments) {
        for (let offset = start; offset + 1 < end; offset += 2) {
          segments.push([offset, offset + 1])
        }
      } else {
        for (let offset = start; offset + 1 < end; offset += 1) {
          segments.push([offset, offset + 1])
        }
        if ((line as ThreeLine & { isLineLoop?: boolean }).isLineLoop && end - start > 1) {
          segments.push([end - 1, start])
        }
      }
      for (const [fromOffset, toOffset] of segments) {
        const clipped = clippedSegment(vertex(fromOffset), vertex(toOffset))
        if (!clipped) continue
        const from = projectedPoint(clipped[0], options.width, options.height)
        const to = projectedPoint(clipped[1], options.width, options.height)
        if (!from || !to || (from.x === to.x && from.y === to.y)) continue
        primitives.push({
          depth: (from.z + to.z) / 2,
          groupOrder,
          object,
          order: order++,
          renderOrder: object.renderOrder,
          node: {
            kind: 'line',
            props: { x1: from.x, y1: from.y, x2: to.x, y2: to.y, stroke, strokeWidth },
          },
        })
      }
      return
    }
    if (candidate.isPoints === true) {
      const points = object as Points
      if (Array.isArray(points.material)) {
        diagnostic(diagnostics, options, {
          code: 'UNSUPPORTED_MATERIAL',
          message: 'Material arrays and geometry groups are not projected yet.',
          object,
        })
        return
      }
      const material = points.material as Partial<PointsMaterial>
      if (material.isPointsMaterial !== true) {
        diagnostic(diagnostics, options, {
          code: 'UNSUPPORTED_MATERIAL',
          message: 'The portable point subset currently accepts PointsMaterial only.',
          object,
        })
        return
      }
      if (material.visible === false) return
      const reason = pointsMaterialReason(material as PointsMaterial)
      if (reason) {
        diagnostic(diagnostics, options, {
          code: 'UNSUPPORTED_MATERIAL',
          message: reason,
          object,
        })
        return
      }
      if (points.morphTargetInfluences?.some((influence) => influence !== 0)) {
        diagnostic(diagnostics, options, {
          code: 'UNSUPPORTED_GEOMETRY',
          message: 'Active point morph targets are not projected yet.',
          object,
        })
        return
      }
      const position = points.geometry.getAttribute('position')
      if (!position || position.itemSize < 3) {
        diagnostic(diagnostics, options, {
          code: 'UNSUPPORTED_GEOMETRY',
          message: 'BufferGeometry needs a position attribute with three components.',
          object,
        })
        return
      }
      const index = points.geometry.getIndex()
      const available = index?.count ?? position.count
      const start = Math.max(0, Math.floor(points.geometry.drawRange.start))
      const requested = points.geometry.drawRange.count
      const end = Math.min(available, Number.isFinite(requested) ? start + requested : available)
      const modelView = new Matrix4().multiplyMatrices(
        camera.matrixWorldInverse,
        points.matrixWorld,
      )
      const pointMaterial = material as PointsMaterial
      const fill = `#${pointMaterial.color.getHexString()}`
      for (let offset = start; offset < end; offset += 1) {
        const vertexIndex = index ? index.getX(offset) : offset
        const view = new Vector4(
          position.getX(vertexIndex),
          position.getY(vertexIndex),
          position.getZ(vertexIndex),
          1,
        ).applyMatrix4(modelView)
        const clip = view.clone().applyMatrix4(camera.projectionMatrix)
        if (!clipPlanes.every((distance) => distance(clip) >= 0)) continue
        const projected = projectedPoint(clip, options.width, options.height)
        if (!projected) continue
        const diameter =
          (camera as Partial<PerspectiveCamera>).isPerspectiveCamera === true &&
          pointMaterial.sizeAttenuation
            ? (pointMaterial.size * options.height) / 2 / -view.z
            : pointMaterial.size
        const radius = diameter / 2
        if (!(radius > 0) || !Number.isFinite(radius)) continue
        primitives.push({
          depth: projected.z,
          groupOrder,
          object,
          order: order++,
          renderOrder: object.renderOrder,
          node: {
            kind: 'circle',
            props: { cx: projected.x, cy: projected.y, radius, fill },
          },
        })
      }
      return
    }
    if (candidate.isMesh !== true) return
    const mesh = object as Mesh
    if (candidate.isBatchedMesh === true) {
      diagnostic(diagnostics, options, {
        code: 'UNSUPPORTED_MESH',
        message:
          'BatchedMesh needs per-instance transforms and visibility and is not projected yet.',
        object,
      })
      return
    }
    const instancedMesh = (mesh as Mesh & { isInstancedMesh?: boolean }).isInstancedMesh
      ? (mesh as InstancedMesh)
      : undefined
    if (instancedMesh?.instanceColor || instancedMesh?.morphTexture) {
      diagnostic(diagnostics, options, {
        code: 'UNSUPPORTED_MESH',
        message: 'Per-instance colours and morph weights are not projected yet.',
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
    const end = Math.min(
      available,
      Number.isFinite(requested) ? Math.floor(start + requested) : available,
    )
    const ranges: { end: number; material: MeshBasicMaterial; start: number }[] = []
    const reportedMaterials = new Set<unknown>()
    const appendRange = (source: unknown, groupStart = start, groupCount = end - start) => {
      if (!source || typeof source !== 'object') return
      const material = source as Partial<MeshBasicMaterial>
      // Three does not enqueue invisible group materials at all. This is
      // intentional scene state, not an unsupported feature worth reporting.
      if (material.visible === false) return
      if (material.isMeshBasicMaterial !== true) {
        if (!reportedMaterials.has(source)) {
          reportedMaterials.add(source)
          diagnostic(diagnostics, options, {
            code: 'UNSUPPORTED_MATERIAL',
            message: 'The portable subset currently accepts MeshBasicMaterial only.',
            object,
          })
        }
        return
      }
      const reason = materialReason(material as MeshBasicMaterial)
      if (reason) {
        if (!reportedMaterials.has(source)) {
          reportedMaterials.add(source)
          diagnostic(diagnostics, options, {
            code: 'UNSUPPORTED_MATERIAL',
            message: reason,
            object,
          })
        }
        return
      }
      const groupEnd = Number.isFinite(groupCount) ? Math.floor(groupStart + groupCount) : available
      const rangeStart = Math.max(start, 0, Math.floor(groupStart))
      const rangeEnd = Math.min(end, available, groupEnd)
      if (rangeEnd <= rangeStart) return
      ranges.push({ start: rangeStart, end: rangeEnd, material: material as MeshBasicMaterial })
    }
    if (Array.isArray(mesh.material)) {
      for (const group of mesh.geometry.groups) {
        appendRange(mesh.material[group.materialIndex ?? 0], group.start, group.count)
      }
    } else {
      appendRange(mesh.material)
    }
    if (ranges.length === 0) return

    const worldMatrices: Matrix4[] = []
    if (instancedMesh) {
      const instanceMatrix = new Matrix4()
      for (let instance = 0; instance < instancedMesh.count; instance += 1) {
        instancedMesh.getMatrixAt(instance, instanceMatrix)
        worldMatrices.push(new Matrix4().multiplyMatrices(mesh.matrixWorld, instanceMatrix))
      }
    } else {
      worldMatrices.push(mesh.matrixWorld)
    }
    let wireframeIndices: number[] | undefined
    for (const worldMatrix of worldMatrices) {
      const matrix = new Matrix4().multiplyMatrices(viewProjection, worldMatrix)
      const mirrored = worldMatrix.determinant() < 0
      const vertexAt = (vertexIndex: number) =>
        new Vector4(
          position.getX(vertexIndex),
          position.getY(vertexIndex),
          position.getZ(vertexIndex),
          1,
        ).applyMatrix4(matrix)
      const vertex = (offset: number) => {
        const vertexIndex = index ? index.getX(offset) : offset
        return vertexAt(vertexIndex)
      }
      for (const range of ranges) {
        const fill = `#${range.material.color.getHexString()}`
        if (range.material.wireframe) {
          const strokeWidth = Math.max(0, range.material.wireframeLinewidth)
          if (strokeWidth === 0) continue
          if (!wireframeIndices) {
            wireframeIndices = []
            for (let offset = 0; offset + 2 < available; offset += 3) {
              const a = index ? index.getX(offset) : offset
              const b = index ? index.getX(offset + 1) : offset + 1
              const c = index ? index.getX(offset + 2) : offset + 2
              wireframeIndices.push(a, b, b, c, c, a)
            }
          }
          const wireStart = range.start * 2
          const wireEnd = Math.min(wireframeIndices.length, range.end * 2)
          for (let offset = wireStart; offset + 1 < wireEnd; offset += 2) {
            const fromIndex = wireframeIndices[offset]
            const toIndex = wireframeIndices[offset + 1]
            if (fromIndex === undefined || toIndex === undefined) continue
            const clipped = clippedSegment(vertexAt(fromIndex), vertexAt(toIndex))
            if (!clipped) continue
            const from = projectedPoint(clipped[0], options.width, options.height)
            const to = projectedPoint(clipped[1], options.width, options.height)
            if (!from || !to || (from.x === to.x && from.y === to.y)) continue
            primitives.push({
              depth: (from.z + to.z) / 2,
              groupOrder,
              object,
              order: order++,
              renderOrder: object.renderOrder,
              node: {
                kind: 'line',
                props: { x1: from.x, y1: from.y, x2: to.x, y2: to.y, stroke: fill, strokeWidth },
              },
            })
          }
          continue
        }

        for (let offset = range.start; offset + 2 < range.end; offset += 3) {
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
            const area = signedArea(projected) * (mirrored ? -1 : 1)
            if (area === 0) continue
            const side = range.material.side
            if (side !== DoubleSide && (side === BackSide ? area < 0 : area > 0)) continue
            const path = `M ${printable(projected[0]?.x ?? 0)} ${printable(projected[0]?.y ?? 0)} L ${printable(projected[1]?.x ?? 0)} ${printable(projected[1]?.y ?? 0)} L ${printable(projected[2]?.x ?? 0)} ${printable(projected[2]?.y ?? 0)} Z`
            primitives.push({
              depth: projected.reduce((sum, point) => sum + point.z, 0) / 3,
              groupOrder,
              object,
              order: order++,
              renderOrder: object.renderOrder,
              node: { kind: 'path', props: { path, fill } },
            })
          }
        }
      }
    }
  })

  primitives.sort(
    (left, right) =>
      left.groupOrder - right.groupOrder ||
      left.renderOrder - right.renderOrder ||
      right.depth - left.depth ||
      left.order - right.order,
  )
  return {
    scene: [...decoration, ...primitives.map((primitive) => primitive.node)],
    objects: [...decorationObjects, ...primitives.map((primitive) => primitive.object)],
    diagnostics,
  }
}
