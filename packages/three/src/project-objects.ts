// Shared projection context, clipped line-segment emitter, scene background,
// and Sprite / Line / Points projection passes.

import type { CanvasSceneNode } from '@hozo/canvas'
import {
  Color,
  type LineBasicMaterial,
  type LineDashedMaterial,
  type Material,
  Matrix4,
  type Object3D,
  type PerspectiveCamera,
  type Plane,
  type Points,
  type PointsMaterial,
  type Scene,
  type Sprite,
  type SpriteMaterial,
  type Line as ThreeLine,
  type Vector2,
  Vector4,
} from 'three'
import { portableLineColorStops } from './line-gradient.ts'
import type { ThreeProjectionDiagnostic, ThreeProjectionOptions } from './project.ts'
import {
  clipPlanes,
  clippedMaterialPolygons,
  clippedMaterialSegments,
  clippedMaterialTexturedPolygons,
  clippedPolygon,
  clippedSegment,
  clippedTexturedPolygon,
  dashedSegments,
  localPosition,
  planeDistance,
  positionMorphState,
  printable,
  projectedPoint,
  segmentRatio,
  type TexturedVertex,
} from './project-clipping.ts'
import {
  canvasColorCss,
  canvasTextureProps,
  effectiveMaterial,
  foggedColorAtDepth,
  foggedColorAtWorld,
  hasPortableVertexAlphas,
  isColorBackground,
  isTextureBackground,
  lineMaterialReason,
  passesUniformAlphaTest,
  pointsMaterialReason,
  portablePointTexturePoint,
  portableTexturePoint,
  portableVertexAlpha,
  projectedOpacityProps,
  type SupportedCamera,
  type SupportedFog,
  spriteMaterialReason,
  textureReason,
} from './project-materials.ts'

export interface ProjectedPrimitive {
  depth: number
  groupOrder: number
  object: Object3D
  order: number
  renderOrder: number
  transparent: boolean
  node: CanvasSceneNode
}

type CanvasStroke = Extract<CanvasSceneNode, { kind: 'line' }>['props']['stroke']

export interface ProjectionContext {
  scene: Scene
  camera: SupportedCamera
  options: ThreeProjectionOptions
  viewProjection: Matrix4
  boundedLineColors: boolean
  diagnostics: ThreeProjectionDiagnostic[]
  primitives: ProjectedPrimitive[]
  nextOrder(): number
}

export function reportDiagnostic(
  diagnostics: ThreeProjectionDiagnostic[],
  options: ThreeProjectionOptions,
  value: ThreeProjectionDiagnostic,
) {
  diagnostics.push(value)
  options.onDiagnostic?.(value)
}

export interface ClippedLineSegmentParams {
  object: Object3D
  groupOrder: number
  material: Material
  planes: readonly Plane[]
  clipIntersection: boolean
  segmentFrom: Vector4
  segmentTo: Vector4
  strokeWidth: number
  solidStroke: string
  gradient?: {
    colorFrom: Vector4
    colorTo: Vector4
    fromColor: Color
    toColor: Color
    fromAlpha?: number
    toAlpha?: number
    fog: SupportedFog | null
    allowBoundedStops: boolean
  }
}

/**
 * Clips a world-space segment against material planes and the view frustum,
 * then pushes one Canvas line primitive per surviving segment. Shared by Line,
 * MeshNormalMaterial wireframes, and MeshBasicMaterial wireframes.
 */
export function emitClippedLineSegment(ctx: ProjectionContext, params: ClippedLineSegmentParams) {
  const {
    object,
    groupOrder,
    material,
    planes,
    clipIntersection,
    segmentFrom,
    segmentTo,
    strokeWidth,
    solidStroke,
    gradient,
  } = params
  const materialClippedSegments = clippedMaterialSegments(
    segmentFrom,
    segmentTo,
    planes,
    clipIntersection,
  )
  for (const materialClipped of materialClippedSegments) {
    const materialFromClip = materialClipped[0].clone().applyMatrix4(ctx.viewProjection)
    const materialToClip = materialClipped[1].clone().applyMatrix4(ctx.viewProjection)
    const clipped = clippedSegment(materialFromClip, materialToClip)
    if (!clipped) continue
    const from = projectedPoint(clipped[0], ctx.options.width, ctx.options.height)
    const to = projectedPoint(clipped[1], ctx.options.width, ctx.options.height)
    if (!from || !to || (from.x === to.x && from.y === to.y)) continue

    let projectedStroke: CanvasStroke = solidStroke
    if (gradient) {
      const clippedFromWorld = materialClipped[0]
        .clone()
        .lerp(materialClipped[1], segmentRatio(clipped[0], materialFromClip, materialToClip))
      const clippedToWorld = materialClipped[0]
        .clone()
        .lerp(materialClipped[1], segmentRatio(clipped[1], materialFromClip, materialToClip))
      const fromRatio = segmentRatio(clippedFromWorld, gradient.colorFrom, gradient.colorTo)
      const toRatio = segmentRatio(clippedToWorld, gradient.colorFrom, gradient.colorTo)
      const clippedFromColor = foggedColorAtWorld(
        gradient.fromColor.clone().lerp(gradient.toColor, fromRatio),
        gradient.fog,
        clippedFromWorld,
        ctx.camera.matrixWorldInverse,
      )
      const clippedToColor = foggedColorAtWorld(
        gradient.fromColor.clone().lerp(gradient.toColor, toRatio),
        gradient.fog,
        clippedToWorld,
        ctx.camera.matrixWorldInverse,
      )
      const clippedFromAlpha =
        gradient.fromAlpha === undefined || gradient.toAlpha === undefined
          ? undefined
          : gradient.fromAlpha + (gradient.toAlpha - gradient.fromAlpha) * fromRatio
      const clippedToAlpha =
        gradient.fromAlpha === undefined || gradient.toAlpha === undefined
          ? undefined
          : gradient.fromAlpha + (gradient.toAlpha - gradient.fromAlpha) * toRatio
      projectedStroke = {
        kind: 'linear',
        from: { x: from.x, y: from.y },
        to: { x: to.x, y: to.y },
        stops:
          gradient.allowBoundedStops &&
          ctx.boundedLineColors &&
          !material.transparent &&
          clippedFromAlpha === undefined &&
          !gradient.fog
            ? portableLineColorStops(
                clippedFromColor,
                clippedToColor,
                clipped[0].w,
                clipped[1].w,
                Math.hypot(to.x - from.x, to.y - from.y),
              )
            : [
                { offset: 0, color: canvasColorCss(clippedFromColor, clippedFromAlpha) },
                { offset: 1, color: canvasColorCss(clippedToColor, clippedToAlpha) },
              ],
      }
    }

    ctx.primitives.push({
      depth: (from.z + to.z) / 2,
      groupOrder,
      object,
      order: ctx.nextOrder(),
      renderOrder: object.renderOrder,
      transparent: material.transparent ?? false,
      node: {
        kind: 'line',
        props: {
          x1: from.x,
          y1: from.y,
          x2: to.x,
          y2: to.y,
          stroke: projectedStroke,
          strokeWidth,
          ...projectedOpacityProps(material),
        },
      },
    })
  }
}

export function projectSceneBackground(
  scene: Scene,
  options: ThreeProjectionOptions,
  diagnostics: ThreeProjectionDiagnostic[],
  decoration: CanvasSceneNode[],
  decorationObjects: (Object3D | undefined)[],
) {
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
    return
  }
  if (isTextureBackground(scene.background)) {
    const background = scene.background
    let reason = textureReason(background)
    if (!reason && !Number.isFinite(scene.backgroundIntensity)) {
      reason = 'scene backgroundIntensity must be finite'
    }
    if (background.matrixAutoUpdate) background.updateMatrix()
    const coordinates = [
      portableTexturePoint(background, 0, 1),
      portableTexturePoint(background, 1, 1),
      portableTexturePoint(background, 1, 0),
      portableTexturePoint(background, 0, 0),
    ]
    if (!reason && coordinates.some((coordinate) => coordinate === undefined)) {
      reason =
        'scene background texture coordinates must remain finite and inside 0..1 after the texture transform'
    }
    if (reason) {
      reportDiagnostic(diagnostics, options, {
        code: 'UNSUPPORTED_SCENE',
        message: reason,
        object: scene,
      })
      return
    }
    decoration.push({
      kind: 'triangle-mesh',
      props: {
        indices: [0, 1, 2, 0, 2, 3],
        texture: {
          ...canvasTextureProps(
            background,
            coordinates.map((coordinate) => ({
              x: (coordinate as Vector2).x,
              y: (coordinate as Vector2).y,
            })),
          ),
          ...(scene.backgroundIntensity === 1
            ? {}
            : { intensity: Math.max(0, scene.backgroundIntensity) }),
        },
        vertices: [
          { x: 0, y: 0 },
          { x: options.width, y: 0 },
          { x: options.width, y: options.height },
          { x: 0, y: options.height },
        ],
      },
    })
    decorationObjects.push(undefined)
    return
  }
  if (scene.background !== null) {
    reportDiagnostic(diagnostics, options, {
      code: 'UNSUPPORTED_SCENE',
      message: 'This scene background type is not projected yet.',
      object: scene,
    })
  }
}

export function projectSprite(ctx: ProjectionContext, sprite: Sprite, groupOrder: number) {
  if (sprite.count <= 0) return
  if (sprite.material.visible === false) return
  const material = effectiveMaterial(
    sprite.material,
    ctx.scene.overrideMaterial,
  ) as Partial<SpriteMaterial>
  if (material.isSpriteMaterial !== true) {
    reportDiagnostic(ctx.diagnostics, ctx.options, {
      code: 'UNSUPPORTED_MATERIAL',
      message: 'The portable sprite subset currently accepts SpriteMaterial only.',
      object: sprite,
    })
    return
  }
  const reason = spriteMaterialReason(material as SpriteMaterial)
  if (reason) {
    reportDiagnostic(ctx.diagnostics, ctx.options, {
      code: 'UNSUPPORTED_MATERIAL',
      message: reason,
      object: sprite,
    })
    return
  }
  if (!passesUniformAlphaTest(material as SpriteMaterial)) return

  const spriteMaterial = material as SpriteMaterial
  const spriteMap = spriteMaterial.map
  if (spriteMap && spriteMaterial.fog && ctx.scene.fog) {
    reportDiagnostic(ctx.diagnostics, ctx.options, {
      code: 'UNSUPPORTED_MATERIAL',
      message: 'texture and sprite fog modulation is not projected yet',
      object: sprite,
    })
    return
  }
  if (spriteMap?.matrixAutoUpdate) spriteMap.updateMatrix()
  const modelView = new Matrix4().multiplyMatrices(
    ctx.camera.matrixWorldInverse,
    sprite.matrixWorld,
  )
  const world = sprite.matrixWorld.elements
  let scaleX = Math.hypot(world[0] ?? 0, world[1] ?? 0, world[2] ?? 0)
  let scaleY = Math.hypot(world[4] ?? 0, world[5] ?? 0, world[6] ?? 0)
  const viewX = modelView.elements[12] ?? 0
  const viewY = modelView.elements[13] ?? 0
  const viewZ = modelView.elements[14] ?? 0
  const spriteColor = foggedColorAtDepth(
    spriteMaterial.color,
    spriteMaterial.fog ? ctx.scene.fog : null,
    -viewZ,
  )
  if (
    (ctx.camera as Partial<PerspectiveCamera>).isPerspectiveCamera === true &&
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
  const spriteTexture = spriteMap
    ? [
        portableTexturePoint(spriteMap, 0, 0),
        portableTexturePoint(spriteMap, 1, 0),
        portableTexturePoint(spriteMap, 1, 1),
        portableTexturePoint(spriteMap, 0, 1),
      ]
    : undefined
  if (spriteTexture?.some((coordinate) => coordinate === undefined)) {
    reportDiagnostic(ctx.diagnostics, ctx.options, {
      code: 'UNSUPPORTED_MATERIAL',
      message:
        'sprite texture coordinates must remain finite and inside 0..1 after the texture transform',
      object: sprite,
    })
    return
  }
  const worldCorners = corners.map(([x, y]) => {
    const alignedX = (x - (sprite.center.x - 0.5)) * scaleX
    const alignedY = (y - (sprite.center.y - 0.5)) * scaleY
    return new Vector4(
      viewX + cosine * alignedX - sine * alignedY,
      viewY + sine * alignedX + cosine * alignedY,
      viewZ,
      1,
    ).applyMatrix4(ctx.camera.matrixWorld)
  })
  const materialPolygons = spriteTexture
    ? clippedMaterialTexturedPolygons(
        worldCorners.map((position, index) => ({
          position,
          texture: spriteTexture[index] as Vector2,
        })),
        (spriteMaterial.clippingPlanes ?? []) as readonly Plane[],
        spriteMaterial.clipIntersection,
      )
    : clippedMaterialPolygons(
        worldCorners,
        (spriteMaterial.clippingPlanes ?? []) as readonly Plane[],
        spriteMaterial.clipIntersection,
      )
  for (const materialPolygon of materialPolygons) {
    const polygon = spriteTexture
      ? clippedTexturedPolygon(
          (materialPolygon as TexturedVertex[]).map(({ position, texture }) => ({
            position: position.clone().applyMatrix4(ctx.viewProjection),
            texture,
          })),
        )
      : clippedPolygon(
          (materialPolygon as Vector4[]).map((point) => point.applyMatrix4(ctx.viewProjection)),
        )
    if (polygon.length < 3) continue
    const projected = polygon.map((point) =>
      projectedPoint(
        spriteTexture ? (point as TexturedVertex).position : (point as Vector4),
        ctx.options.width,
        ctx.options.height,
      ),
    )
    if (projected.some((point) => point === undefined)) continue
    const points = projected as { x: number; y: number; z: number }[]
    const [first, ...rest] = points
    if (!first) continue
    const path = spriteTexture
      ? undefined
      : `M ${printable(first.x)} ${printable(first.y)} ${rest
          .map((point) => `L ${printable(point.x)} ${printable(point.y)}`)
          .join(' ')} Z`
    const indices: number[] = []
    for (let fan = 1; fan + 1 < points.length; fan += 1) indices.push(0, fan, fan + 1)
    ctx.primitives.push({
      depth: points.reduce((sum, point) => sum + point.z, 0) / points.length,
      groupOrder,
      object: sprite,
      order: ctx.nextOrder(),
      renderOrder: sprite.renderOrder,
      transparent: spriteMaterial.transparent,
      node:
        spriteTexture && spriteMap
          ? {
              kind: 'triangle-mesh',
              props: {
                indices,
                texture: canvasTextureProps(
                  spriteMap,
                  (polygon as TexturedVertex[]).map(({ texture }) => ({
                    x: texture.x,
                    y: texture.y,
                  })),
                  spriteMaterial.color,
                ),
                vertices: points.map(({ x, y }) => ({ x, y })),
                ...projectedOpacityProps(spriteMaterial),
              },
            }
          : {
              kind: 'path',
              props: {
                path: path as string,
                fill: `#${spriteColor.getHexString()}`,
                ...projectedOpacityProps(spriteMaterial),
              },
            },
    })
  }
}

export function projectLine(ctx: ProjectionContext, line: ThreeLine, groupOrder: number) {
  if (Array.isArray(line.material)) {
    reportDiagnostic(ctx.diagnostics, ctx.options, {
      code: 'UNSUPPORTED_MATERIAL',
      message: 'Material arrays and geometry groups are not projected yet.',
      object: line,
    })
    return
  }
  if (line.material.visible === false) return
  const material = effectiveMaterial(
    line.material,
    ctx.scene.overrideMaterial,
  ) as Partial<LineBasicMaterial>
  if (material.isLineBasicMaterial !== true) {
    reportDiagnostic(ctx.diagnostics, ctx.options, {
      code: 'UNSUPPORTED_MATERIAL',
      message: 'The portable line subset currently accepts LineBasicMaterial only.',
      object: line,
    })
    return
  }
  const reason = lineMaterialReason(material as LineBasicMaterial)
  if (reason) {
    reportDiagnostic(ctx.diagnostics, ctx.options, {
      code: 'UNSUPPORTED_MATERIAL',
      message: reason,
      object: line,
    })
    return
  }
  if (
    !(material as LineDashedMaterial).isLineDashedMaterial &&
    !passesUniformAlphaTest(material as LineBasicMaterial)
  ) {
    return
  }
  const position = line.geometry.getAttribute('position')
  if (!position || position.itemSize < 3) {
    reportDiagnostic(ctx.diagnostics, ctx.options, {
      code: 'UNSUPPORTED_GEOMETRY',
      message: 'BufferGeometry needs a position attribute with three components.',
      object: line,
    })
    return
  }
  const index = line.geometry.getIndex()
  const available = index?.count ?? position.count
  const start = Math.max(0, Math.floor(line.geometry.drawRange.start))
  const requested = line.geometry.drawRange.count
  const end = Math.min(available, Number.isFinite(requested) ? start + requested : available)
  const morph = positionMorphState(line.geometry, line.morphTargetInfluences)
  const lineDistance = line.geometry.getAttribute('lineDistance')
  const dashedMaterial = (material as LineDashedMaterial).isLineDashedMaterial
    ? (material as LineDashedMaterial)
    : undefined
  const color = material.vertexColors ? line.geometry.getAttribute('color') : undefined
  if (color && color.itemSize !== 3 && color.itemSize !== 4) {
    reportDiagnostic(ctx.diagnostics, ctx.options, {
      code: 'UNSUPPORTED_GEOMETRY',
      message: 'Portable line colour attributes must be RGB or RGBA.',
      object: line,
    })
    return
  }
  if (color?.itemSize === 4 && (!material.transparent || (material.alphaTest ?? 0) > 0)) {
    reportDiagnostic(ctx.diagnostics, ctx.options, {
      code: 'UNSUPPORTED_MATERIAL',
      message: 'RGBA line colours need transparent: true and alphaTest: 0 for portable blending.',
      object: line,
    })
    return
  }
  if (color?.itemSize === 4 && !hasPortableVertexAlphas(color)) {
    reportDiagnostic(ctx.diagnostics, ctx.options, {
      code: 'UNSUPPORTED_GEOMETRY',
      message: 'RGBA line alpha values must be finite.',
      object: line,
    })
    return
  }

  const lineMaterial = material as LineBasicMaterial
  const strokeWidth = Math.max(0, lineMaterial.linewidth)
  if (strokeWidth === 0) return
  const stroke = `#${lineMaterial.color.getHexString()}`
  const fog = lineMaterial.fog ? ctx.scene.fog : null
  const planes = (lineMaterial.clippingPlanes ?? []) as readonly Plane[]
  const clipIntersection = lineMaterial.clipIntersection ?? false

  const vertex = (offset: number) => {
    const vertexIndex = index ? index.getX(offset) : offset
    return localPosition(position, vertexIndex, morph).applyMatrix4(line.matrixWorld)
  }
  const distance = (offset: number) => {
    const vertexIndex = index ? index.getX(offset) : offset
    return lineDistance?.getX(vertexIndex) ?? 0
  }

  const segments: [number, number][] = []
  const primitiveStart = ctx.primitives.length
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
    const fromVertex = vertex(fromOffset)
    const toVertex = vertex(toOffset)
    const fromIndex = index ? index.getX(fromOffset) : fromOffset
    const toIndex = index ? index.getX(toOffset) : toOffset
    const fromColor = color
      ? new Color(color.getX(fromIndex), color.getY(fromIndex), color.getZ(fromIndex)).multiply(
          lineMaterial.color,
        )
      : lineMaterial.color
    const toColor = color
      ? new Color(color.getX(toIndex), color.getY(toIndex), color.getZ(toIndex)).multiply(
          lineMaterial.color,
        )
      : lineMaterial.color
    const fromAlpha = color?.itemSize === 4 ? portableVertexAlpha(color, fromIndex) : undefined
    const toAlpha = color?.itemSize === 4 ? portableVertexAlpha(color, toIndex) : undefined
    const pieces = dashedMaterial
      ? dashedSegments(
          fromVertex,
          toVertex,
          distance(fromOffset),
          distance(toOffset),
          dashedMaterial,
        )
      : ([[fromVertex, toVertex]] as const)
    if (!pieces) {
      ctx.primitives.splice(primitiveStart)
      reportDiagnostic(ctx.diagnostics, ctx.options, {
        code: 'UNSUPPORTED_GEOMETRY',
        message: 'Dashed line expansion exceeds the portable 10,000-interval limit.',
        object: line,
      })
      return
    }
    const gradient =
      color || fog
        ? {
            colorFrom: fromVertex,
            colorTo: toVertex,
            fromColor,
            toColor,
            fromAlpha,
            toAlpha,
            fog,
            allowBoundedStops: true,
          }
        : undefined
    for (const piece of pieces) {
      emitClippedLineSegment(ctx, {
        object: line,
        groupOrder,
        material: lineMaterial,
        planes,
        clipIntersection,
        segmentFrom: piece[0],
        segmentTo: piece[1],
        strokeWidth,
        solidStroke: stroke,
        gradient,
      })
    }
  }
}

export function projectPoints(ctx: ProjectionContext, points: Points, groupOrder: number) {
  if (Array.isArray(points.material)) {
    reportDiagnostic(ctx.diagnostics, ctx.options, {
      code: 'UNSUPPORTED_MATERIAL',
      message: 'Material arrays and geometry groups are not projected yet.',
      object: points,
    })
    return
  }
  if (points.material.visible === false) return
  const material = effectiveMaterial(
    points.material,
    ctx.scene.overrideMaterial,
  ) as Partial<PointsMaterial>
  if (material.isPointsMaterial !== true) {
    reportDiagnostic(ctx.diagnostics, ctx.options, {
      code: 'UNSUPPORTED_MATERIAL',
      message: 'The portable point subset currently accepts PointsMaterial only.',
      object: points,
    })
    return
  }
  const reason = pointsMaterialReason(material as PointsMaterial)
  if (reason) {
    reportDiagnostic(ctx.diagnostics, ctx.options, {
      code: 'UNSUPPORTED_MATERIAL',
      message: reason,
      object: points,
    })
    return
  }
  if (!passesUniformAlphaTest(material as PointsMaterial)) return
  const position = points.geometry.getAttribute('position')
  if (!position || position.itemSize < 3) {
    reportDiagnostic(ctx.diagnostics, ctx.options, {
      code: 'UNSUPPORTED_GEOMETRY',
      message: 'BufferGeometry needs a position attribute with three components.',
      object: points,
    })
    return
  }
  const index = points.geometry.getIndex()
  const available = index?.count ?? position.count
  const start = Math.max(0, Math.floor(points.geometry.drawRange.start))
  const requested = points.geometry.drawRange.count
  const end = Math.min(available, Number.isFinite(requested) ? start + requested : available)
  const pointMaterial = material as PointsMaterial
  const pointMap = pointMaterial.map
  if (pointMap && pointMaterial.fog && ctx.scene.fog) {
    reportDiagnostic(ctx.diagnostics, ctx.options, {
      code: 'UNSUPPORTED_MATERIAL',
      message: 'texture and point fog modulation is not projected yet',
      object: points,
    })
    return
  }
  if (pointMap && points.geometry.getAttribute('uv')) {
    reportDiagnostic(ctx.diagnostics, ctx.options, {
      code: 'UNSUPPORTED_GEOMETRY',
      message:
        'Points geometry UVs sample one texel per point; the portable backend supports point-sprite map coordinates only.',
      object: points,
    })
    return
  }
  if (pointMap?.matrixAutoUpdate) pointMap.updateMatrix()
  const pointTexture = pointMap
    ? [
        portablePointTexturePoint(pointMap, 0, 0),
        portablePointTexturePoint(pointMap, 1, 0),
        portablePointTexturePoint(pointMap, 1, 1),
        portablePointTexturePoint(pointMap, 0, 1),
      ]
    : undefined
  if (pointTexture?.some((coordinate) => coordinate === undefined)) {
    reportDiagnostic(ctx.diagnostics, ctx.options, {
      code: 'UNSUPPORTED_MATERIAL',
      message:
        'point texture coordinates must remain finite and inside 0..1 after the texture transform',
      object: points,
    })
    return
  }
  const color = pointMaterial.vertexColors ? points.geometry.getAttribute('color') : undefined
  if (color && color.itemSize !== 3 && color.itemSize !== 4) {
    reportDiagnostic(ctx.diagnostics, ctx.options, {
      code: 'UNSUPPORTED_GEOMETRY',
      message: 'Portable point colour attributes must be RGB or RGBA.',
      object: points,
    })
    return
  }
  if (color?.itemSize === 4 && (!pointMaterial.transparent || pointMaterial.alphaTest > 0)) {
    reportDiagnostic(ctx.diagnostics, ctx.options, {
      code: 'UNSUPPORTED_MATERIAL',
      message: 'RGBA point colours need transparent: true and alphaTest: 0 for portable blending.',
      object: points,
    })
    return
  }
  if (color?.itemSize === 4 && !hasPortableVertexAlphas(color)) {
    reportDiagnostic(ctx.diagnostics, ctx.options, {
      code: 'UNSUPPORTED_GEOMETRY',
      message: 'RGBA point alpha values must be finite.',
      object: points,
    })
    return
  }

  const morph = positionMorphState(points.geometry, points.morphTargetInfluences)
  const fillColor = new Color()
  const materialPlanes = (pointMaterial.clippingPlanes ?? []) as readonly Plane[]
  for (let offset = start; offset < end; offset += 1) {
    const vertexIndex = index ? index.getX(offset) : offset
    const world = localPosition(position, vertexIndex, morph).applyMatrix4(points.matrixWorld)
    const insideMaterialPlanes = pointMaterial.clipIntersection
      ? materialPlanes.length === 0 ||
        materialPlanes.some((plane) => planeDistance(plane, world) >= 0)
      : materialPlanes.every((plane) => planeDistance(plane, world) >= 0)
    if (!insideMaterialPlanes) continue

    const view = world.clone().applyMatrix4(ctx.camera.matrixWorldInverse)
    const clip = view.clone().applyMatrix4(ctx.camera.projectionMatrix)
    if (!clipPlanes.every((distance) => distance(clip) >= 0)) continue
    const projected = projectedPoint(clip, ctx.options.width, ctx.options.height)
    if (!projected) continue
    const diameter =
      (ctx.camera as Partial<PerspectiveCamera>).isPerspectiveCamera === true &&
      pointMaterial.sizeAttenuation
        ? (pointMaterial.size * ctx.options.height) / 2 / -view.z
        : pointMaterial.size
    const radius = diameter / 2
    if (!(radius > 0) || !Number.isFinite(radius)) continue
    fillColor.copy(pointMaterial.color)
    if (color) {
      fillColor.r *= color.getX(vertexIndex)
      fillColor.g *= color.getY(vertexIndex)
      fillColor.b *= color.getZ(vertexIndex)
    }
    const projectedFill = foggedColorAtDepth(
      fillColor,
      pointMaterial.fog ? ctx.scene.fog : null,
      -view.z,
    )
    const vertexAlpha = color?.itemSize === 4 ? portableVertexAlpha(color, vertexIndex) : undefined
    ctx.primitives.push({
      depth: projected.z,
      groupOrder,
      object: points,
      order: ctx.nextOrder(),
      renderOrder: points.renderOrder,
      transparent: pointMaterial.transparent,
      node:
        pointTexture && pointMap
          ? {
              kind: 'triangle-mesh',
              props: {
                indices: [0, 1, 2, 0, 2, 3],
                texture: canvasTextureProps(
                  pointMap,
                  pointTexture.map((coordinate) => ({
                    x: (coordinate as Vector2).x,
                    y: (coordinate as Vector2).y,
                  })),
                  pointMaterial.color,
                ),
                vertices: [
                  { x: projected.x - radius, y: projected.y - radius },
                  { x: projected.x + radius, y: projected.y - radius },
                  { x: projected.x + radius, y: projected.y + radius },
                  { x: projected.x - radius, y: projected.y + radius },
                ],
                ...projectedOpacityProps(pointMaterial),
              },
            }
          : {
              kind: 'circle',
              props: {
                cx: projected.x,
                cy: projected.y,
                radius,
                fill: canvasColorCss(projectedFill, vertexAlpha),
                ...projectedOpacityProps(pointMaterial),
              },
            },
    })
  }
}
