import type { CanvasScene, CanvasSceneNode } from '@hozo/canvas'
import {
  type ArrayCamera,
  ColorManagement,
  LinearSRGBColorSpace,
  type LOD,
  Matrix4,
  type Mesh,
  type Object3D,
  type PerspectiveCamera,
  type Points,
  type Scene,
  type Sprite,
  type Line as ThreeLine,
  type Vector4,
} from 'three'
import { fogReason, inheritedGroupOrder, isSupportedCamera } from './project-materials.ts'
import { projectMesh } from './project-mesh.ts'
import {
  type ProjectedPrimitive,
  type ProjectionContext,
  projectLine,
  projectPoints,
  projectSceneBackground,
  projectSprite,
  reportDiagnostic,
} from './project-objects.ts'

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
  /** Bounded opaque RGB refinement (default), or the cheaper two-stop approximation. */
  lineColorInterpolation?: 'bounded' | 'endpoints'
  onDiagnostic?: (diagnostic: ThreeProjectionDiagnostic) => void
}

export interface ThreeProjection {
  scene: CanvasScene
  /** Source object for each scene node at the same index, absent for scene decoration. */
  objects: readonly (Object3D | undefined)[]
  diagnostics: readonly ThreeProjectionDiagnostic[]
}

/**
 * Projects the deliberately portable part of a Three.js scene into Hozo's
 * retained 2D scene.
 *
 * This is not a software WebGL renderer. It accepts ordinary public Three.js
 * scene objects and preserves their world transforms, camera projection,
 * clip volume, face side and back-to-front order. Features whose correct
 * answer needs a GPU -- general texture sampling, blending and shaders among
 * them -- are omitted with a diagnostic rather than drawn approximately.
 */
function projectThreeSceneInternal(
  scene: Scene,
  camera: Object3D,
  options: ThreeProjectionOptions,
  includeSceneState: boolean,
): ThreeProjection {
  const diagnostics: ThreeProjectionDiagnostic[] = []
  if (!(options.width > 0) || !(options.height > 0)) {
    reportDiagnostic(diagnostics, options, {
      code: 'INVALID_VIEWPORT',
      message: `Three projection needs a positive viewport; received ${options.width} x ${options.height}.`,
    })
    return { scene: [], objects: [], diagnostics }
  }
  const arrayCamera =
    (camera as Object3D & { isArrayCamera?: boolean }).isArrayCamera === true
      ? (camera as ArrayCamera)
      : undefined
  if (!arrayCamera && !isSupportedCamera(camera)) {
    reportDiagnostic(diagnostics, options, {
      code: 'UNSUPPORTED_CAMERA',
      message: 'Only Three.js PerspectiveCamera and OrthographicCamera are portable.',
      object: camera,
    })
    return { scene: [], objects: [], diagnostics }
  }

  const decoration: CanvasSceneNode[] = []
  const decorationObjects: (Object3D | undefined)[] = []
  if (includeSceneState) {
    projectSceneBackground(scene, options, diagnostics, decoration, decorationObjects)
    if (scene.fog !== null) {
      const reason = fogReason(scene.fog)
      if (reason) {
        reportDiagnostic(diagnostics, options, {
          code: 'UNSUPPORTED_SCENE',
          message: reason,
          object: scene,
        })
        return { scene: decoration, objects: decorationObjects, diagnostics }
      }
    }
  }

  if (arrayCamera) {
    for (const subCamera of arrayCamera.cameras) {
      const viewport = (subCamera as PerspectiveCamera & { viewport?: Vector4 }).viewport
      if (!viewport) {
        reportDiagnostic(diagnostics, options, {
          code: 'UNSUPPORTED_CAMERA',
          message: 'Every ArrayCamera sub-camera needs a viewport.',
          object: subCamera,
        })
        continue
      }
      const projected = projectThreeSceneInternal(
        scene,
        subCamera,
        {
          width: viewport.z,
          height: viewport.w,
          lineColorInterpolation: options.lineColorInterpolation,
          onDiagnostic: options.onDiagnostic,
        },
        false,
      )
      diagnostics.push(...projected.diagnostics)
      const translateX = viewport.x
      const translateY = options.height - viewport.y - viewport.w
      for (let index = 0; index < projected.scene.length; index += 1) {
        const node = projected.scene[index]
        if (!node) continue
        decoration.push({
          kind: 'group',
          props: { transform: { translateX, translateY } },
          children: [node],
        })
        decorationObjects.push(projected.objects[index])
      }
    }
    return { scene: decoration, objects: decorationObjects, diagnostics }
  }
  if (!isSupportedCamera(camera))
    return { scene: decoration, objects: decorationObjects, diagnostics }

  scene.updateMatrixWorld(true)
  camera.updateMatrixWorld(true)
  const primitives: ProjectedPrimitive[] = []
  let order = 0
  const ctx: ProjectionContext = {
    scene,
    camera,
    options,
    viewProjection: new Matrix4().multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    ),
    boundedLineColors:
      options.lineColorInterpolation !== 'endpoints' &&
      ColorManagement.enabled &&
      ColorManagement.workingColorSpace === LinearSRGBColorSpace,
    diagnostics,
    primitives,
    nextOrder: () => order++,
  }

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
      projectSprite(ctx, object as Sprite, groupOrder)
      return
    }
    if (candidate.isLine === true) {
      projectLine(ctx, object as ThreeLine, groupOrder)
      return
    }
    if (candidate.isPoints === true) {
      projectPoints(ctx, object as Points, groupOrder)
      return
    }
    if (candidate.isMesh === true) {
      projectMesh(ctx, object as Mesh, candidate.isBatchedMesh === true, groupOrder)
    }
  })

  primitives.sort(
    (left, right) =>
      Number(left.transparent) - Number(right.transparent) ||
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

export function projectThreeScene(
  scene: Scene,
  camera: Object3D,
  options: ThreeProjectionOptions,
): ThreeProjection {
  return projectThreeSceneInternal(scene, camera, options, true)
}
