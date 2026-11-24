// Mesh projection passes for MeshNormalMaterial and MeshBasicMaterial
// (including BatchedMesh, InstancedMesh, SkinnedMesh, wireframes, vertex
// colours, fog, textures, and geometry groups).

import {
  BackSide,
  type BatchedMesh,
  Color,
  DoubleSide,
  type InstancedMesh,
  Matrix3,
  Matrix4,
  Mesh,
  type MeshBasicMaterial,
  type MeshNormalMaterial,
  type Plane,
  type SkinnedMesh,
  type Vector2,
  Vector3,
  Vector4,
} from 'three'
import {
  type ColouredVertex,
  clippedColouredPolygon,
  clippedMaterialColouredPolygons,
  clippedMaterialPolygons,
  clippedMaterialTexturedPolygons,
  clippedPolygon,
  clippedTexturedPolygon,
  localNormal,
  localPosition,
  type MorphState,
  normalMorphState,
  type PositionAttribute,
  positionMorphState,
  printable,
  projectedPoint,
  signedArea,
  skinnedNormal,
  type TexturedVertex,
} from './project-clipping.ts'
import {
  canvasTextureProps,
  canvasVertexColor,
  effectiveMaterial,
  flipPackedNormalColor,
  foggedColorAtDepth,
  hasPortableVertexAlphas,
  materialReason,
  normalMaterialReason,
  packedNormalColor,
  passesUniformAlphaTest,
  portableTextureCoordinate,
  portableVertexAlpha,
  projectedOpacityProps,
  textureAttributeName,
  textureReason,
} from './project-materials.ts'
import {
  emitClippedLineSegment,
  type ProjectionContext,
  reportDiagnostic,
} from './project-objects.ts'

interface MeshKinds {
  batchedMesh: BatchedMesh | undefined
  instancedMesh: InstancedMesh | undefined
  skinnedMesh: SkinnedMesh | undefined
  position: PositionAttribute
}

interface MaterialRange {
  end: number
  material: MeshBasicMaterial
  start: number
}

interface MeshProjectionInstance {
  color?: Color
  morph?: MorphState
  ranges: MaterialRange[]
  worldMatrix: Matrix4
}

export function projectMesh(
  ctx: ProjectionContext,
  mesh: Mesh,
  isBatchedMesh: boolean,
  groupOrder: number,
) {
  const position = mesh.geometry.getAttribute('position')
  if (!position || position.itemSize < 3) {
    reportDiagnostic(ctx.diagnostics, ctx.options, {
      code: 'UNSUPPORTED_GEOMETRY',
      message: 'BufferGeometry needs a position attribute with three components.',
      object: mesh,
    })
    return
  }
  const kinds: MeshKinds = {
    batchedMesh: isBatchedMesh ? (mesh as BatchedMesh) : undefined,
    instancedMesh: (mesh as Mesh & { isInstancedMesh?: boolean }).isInstancedMesh
      ? (mesh as InstancedMesh)
      : undefined,
    skinnedMesh: (mesh as Mesh & { isSkinnedMesh?: boolean }).isSkinnedMesh
      ? (mesh as SkinnedMesh)
      : undefined,
    position,
  }
  const directMaterial = Array.isArray(mesh.material)
    ? undefined
    : effectiveMaterial(mesh.material, ctx.scene.overrideMaterial)
  if ((directMaterial as Partial<MeshNormalMaterial> | undefined)?.isMeshNormalMaterial === true) {
    projectNormalMesh(ctx, mesh, directMaterial as MeshNormalMaterial, kinds, groupOrder)
    return
  }
  projectBasicMesh(ctx, mesh, kinds, groupOrder)
}

function projectNormalMesh(
  ctx: ProjectionContext,
  mesh: Mesh,
  material: MeshNormalMaterial,
  { batchedMesh, instancedMesh, skinnedMesh, position }: MeshKinds,
  groupOrder: number,
) {
  const reason = normalMaterialReason(material)
  if (reason) {
    reportDiagnostic(ctx.diagnostics, ctx.options, {
      code: 'UNSUPPORTED_MATERIAL',
      message: reason,
      object: mesh,
    })
    return
  }
  if (!passesUniformAlphaTest(material)) return
  if (batchedMesh || instancedMesh?.morphTexture) {
    reportDiagnostic(ctx.diagnostics, ctx.options, {
      code: 'UNSUPPORTED_MESH',
      message:
        'Portable MeshNormalMaterial currently rejects batched meshes and instanced morph textures.',
      object: mesh,
    })
    return
  }
  const normal = mesh.geometry.getAttribute('normal')
  if (!material.flatShading && (!normal || normal.itemSize < 3 || normal.count < position.count)) {
    reportDiagnostic(ctx.diagnostics, ctx.options, {
      code: 'UNSUPPORTED_GEOMETRY',
      message: 'Smooth MeshNormalMaterial needs one three-component normal per vertex.',
      object: mesh,
    })
    return
  }
  if (skinnedMesh) {
    const skinIndex = mesh.geometry.getAttribute('skinIndex')
    const skinWeight = mesh.geometry.getAttribute('skinWeight')
    if (
      !skinnedMesh.skeleton ||
      !skinIndex ||
      skinIndex.itemSize < 4 ||
      skinIndex.count < position.count ||
      !skinWeight ||
      skinWeight.itemSize < 4 ||
      skinWeight.count < position.count
    ) {
      reportDiagnostic(ctx.diagnostics, ctx.options, {
        code: 'UNSUPPORTED_GEOMETRY',
        message:
          'Skinned MeshNormalMaterial needs a bound skeleton and four skin indices and weights per vertex.',
        object: mesh,
      })
      return
    }
  }
  const morph = positionMorphState(mesh.geometry, mesh.morphTargetInfluences)
  const normalMorph = normalMorphState(mesh.geometry, mesh.morphTargetInfluences)
  if (
    !material.flatShading &&
    normalMorph?.attributes.some(
      (attribute) => attribute.itemSize < 3 || attribute.count < position.count,
    )
  ) {
    reportDiagnostic(ctx.diagnostics, ctx.options, {
      code: 'UNSUPPORTED_GEOMETRY',
      message: 'Smooth MeshNormalMaterial morph normals must provide three components per vertex.',
      object: mesh,
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
  const materialPlanes = (material.clippingPlanes ?? []) as readonly Plane[]
  const skinNormalScratch = skinnedMesh
    ? { blended: new Matrix4(), bone: new Matrix4(), direction: new Matrix3() }
    : undefined

  for (const worldMatrix of worldMatrices) {
    const modelView = new Matrix4().multiplyMatrices(ctx.camera.matrixWorldInverse, worldMatrix)
    const normalMatrix = new Matrix3().getNormalMatrix(modelView)
    const determinantSign = worldMatrix.determinant() < 0 ? -1 : 1
    for (let offset = start; offset + 2 < end; offset += 3) {
      const vertexIndices = [
        index ? index.getX(offset) : offset,
        index ? index.getX(offset + 1) : offset + 1,
        index ? index.getX(offset + 2) : offset + 2,
      ] as const
      const worldPositions = vertexIndices.map((vertexIndex) => {
        if (skinnedMesh) {
          const local = skinnedMesh.getVertexPosition(vertexIndex, new Vector3())
          return new Vector4(local.x, local.y, local.z, 1).applyMatrix4(worldMatrix)
        }
        return localPosition(position, vertexIndex, morph).applyMatrix4(worldMatrix)
      }) as unknown as readonly [Vector4, Vector4, Vector4]

      let sourceColors: readonly [Color, Color, Color]
      if (material.flatShading) {
        const viewPositions = worldPositions.map((point) =>
          new Vector3(point.x, point.y, point.z).applyMatrix4(ctx.camera.matrixWorldInverse),
        )
        const edgeA = (viewPositions[1] as Vector3).clone().sub(viewPositions[0] as Vector3)
        const edgeB = (viewPositions[2] as Vector3).clone().sub(viewPositions[0] as Vector3)
        const faceNormal = edgeA.cross(edgeB)
        if (faceNormal.lengthSq() === 0) continue
        const color = packedNormalColor(faceNormal, material.side === BackSide)
        sourceColors = [color, color, color]
      } else {
        sourceColors = vertexIndices.map((vertexIndex) => {
          let transformed = localNormal(normal as PositionAttribute, vertexIndex, normalMorph)
          if (skinnedMesh && skinNormalScratch) {
            transformed = skinnedNormal(skinnedMesh, vertexIndex, transformed, skinNormalScratch)
          }
          transformed.applyMatrix3(normalMatrix)
          return packedNormalColor(transformed, material.side === BackSide)
        }) as unknown as readonly [Color, Color, Color]
      }

      if (material.wireframe) {
        const strokeWidth = Math.max(0, material.wireframeLinewidth)
        if (strokeWidth === 0) continue
        for (const [fromIndex, toIndex] of [
          [0, 1],
          [1, 2],
          [2, 0],
        ] as const) {
          const wireFrom = worldPositions[fromIndex]
          const wireTo = worldPositions[toIndex]
          emitClippedLineSegment(ctx, {
            object: mesh,
            groupOrder,
            material,
            planes: materialPlanes,
            clipIntersection: material.clipIntersection,
            segmentFrom: wireFrom,
            segmentTo: wireTo,
            strokeWidth,
            solidStroke: '#000000',
            gradient: {
              colorFrom: wireFrom,
              colorTo: wireTo,
              fromColor: sourceColors[fromIndex],
              toColor: sourceColors[toIndex],
              fog: null,
              allowBoundedStops: false,
            },
          })
        }
        continue
      }

      const materialPolygons = clippedMaterialColouredPolygons(
        worldPositions.map((worldPos, indexInTriangle) => ({
          color: (sourceColors[indexInTriangle] as Color).clone(),
          position: worldPos,
        })),
        materialPlanes,
        material.clipIntersection,
      )
      for (const materialPolygon of materialPolygons) {
        const polygon = clippedColouredPolygon(
          materialPolygon.map(({ color, position: worldPos }) => ({
            color,
            position: worldPos.clone().applyMatrix4(ctx.viewProjection),
          })),
        )
        if (polygon.length < 3) continue
        for (let fan = 1; fan + 1 < polygon.length; fan += 1) {
          const first = polygon[0]
          const second = polygon[fan]
          const third = polygon[fan + 1]
          if (!first || !second || !third) continue
          const clipTriangle = [first, second, third] as const
          const points = clipTriangle.map(({ position: clipPos }) =>
            projectedPoint(clipPos, ctx.options.width, ctx.options.height),
          )
          if (points.some((point) => point === undefined)) continue
          const projected = points as { x: number; y: number; z: number }[]
          const area = signedArea(projected) * determinantSign
          if (area === 0) continue
          if (material.side !== DoubleSide && (material.side === BackSide ? area < 0 : area > 0)) {
            continue
          }
          const flipDoubleSidedBackFace = material.side === DoubleSide && area > 0
          ctx.primitives.push({
            depth: projected.reduce((sum, point) => sum + point.z, 0) / 3,
            groupOrder,
            object: mesh,
            order: ctx.nextOrder(),
            renderOrder: mesh.renderOrder,
            transparent: material.transparent,
            node: {
              kind: 'triangle-mesh',
              props: {
                colors: clipTriangle.map(({ color }) =>
                  canvasVertexColor(flipDoubleSidedBackFace ? flipPackedNormalColor(color) : color),
                ),
                vertices: projected.map(({ x, y }) => ({ x, y })),
                ...projectedOpacityProps(material),
              },
            },
          })
        }
      }
    }
  }
}

function createMaterialRangeCollector(
  ctx: ProjectionContext,
  mesh: Mesh,
  position: PositionAttribute,
  vertexColor: PositionAttribute | undefined,
  available: number,
  reportedMaterials: Set<unknown>,
) {
  const reportOnce = (
    source: unknown,
    code: 'UNSUPPORTED_MATERIAL' | 'UNSUPPORTED_GEOMETRY',
    message: string,
  ) => {
    if (reportedMaterials.has(source)) return
    reportedMaterials.add(source)
    reportDiagnostic(ctx.diagnostics, ctx.options, { code, message, object: mesh })
  }

  const appendRange = (
    ranges: MaterialRange[],
    source: unknown,
    start: number,
    end: number,
    groupStart = start,
    groupCount = end - start,
  ) => {
    if (!source || typeof source !== 'object') return
    const material = source as Partial<MeshBasicMaterial>
    if (material.isMeshBasicMaterial !== true) {
      reportOnce(
        source,
        'UNSUPPORTED_MATERIAL',
        'The portable subset currently accepts MeshBasicMaterial only.',
      )
      return
    }
    const reason = materialReason(material as MeshBasicMaterial)
    if (reason) {
      reportOnce(source, 'UNSUPPORTED_MATERIAL', reason)
      return
    }
    const map = material.map
    if (map) {
      const mapReason = textureReason(map, true)
      if (mapReason) {
        reportOnce(source, 'UNSUPPORTED_MATERIAL', mapReason)
        return
      }
      if (material.fog && ctx.scene.fog) {
        reportOnce(
          source,
          'UNSUPPORTED_MATERIAL',
          'texture and fog modulation is not projected yet',
        )
        return
      }
      const textureCoordinate = mesh.geometry.getAttribute(textureAttributeName(map))
      if (textureCoordinate?.itemSize !== 2 || textureCoordinate.count < position.count) {
        reportOnce(
          source,
          'UNSUPPORTED_GEOMETRY',
          `MeshBasicMaterial.map needs one two-component ${textureAttributeName(map)} value per vertex.`,
        )
        return
      }
      if (map.matrixAutoUpdate) map.updateMatrix()
      for (let vertexIndex = 0; vertexIndex < position.count; vertexIndex += 1) {
        if (portableTextureCoordinate(map, textureCoordinate, vertexIndex)) continue
        reportOnce(
          source,
          'UNSUPPORTED_GEOMETRY',
          'texture coordinates must remain finite and inside 0..1 after the texture transform',
        )
        return
      }
    }
    if (!passesUniformAlphaTest(material as MeshBasicMaterial)) return
    if (
      material.vertexColors &&
      ((vertexColor?.itemSize !== 3 && vertexColor?.itemSize !== 4) ||
        vertexColor.count < position.count)
    ) {
      reportOnce(
        source,
        'UNSUPPORTED_GEOMETRY',
        'MeshBasicMaterial.vertexColors needs one RGB or RGBA value per vertex.',
      )
      return
    }
    if (
      material.vertexColors &&
      vertexColor?.itemSize === 4 &&
      !hasPortableVertexAlphas(vertexColor, position.count)
    ) {
      reportOnce(source, 'UNSUPPORTED_GEOMETRY', 'RGBA mesh alpha values must be finite.')
      return
    }
    if (
      material.vertexColors &&
      vertexColor?.itemSize === 4 &&
      (!material.transparent || (material.alphaTest ?? 0) > 0)
    ) {
      reportOnce(
        source,
        'UNSUPPORTED_MATERIAL',
        'RGBA mesh colours need transparent: true and alphaTest: 0 for portable blending.',
      )
      return
    }
    const groupEnd = Number.isFinite(groupCount) ? Math.floor(groupStart + groupCount) : available
    const rangeStart = Math.max(start, 0, Math.floor(groupStart))
    const rangeEnd = Math.min(end, available, groupEnd)
    if (rangeEnd <= rangeStart) return
    ranges.push({ start: rangeStart, end: rangeEnd, material: material as MeshBasicMaterial })
  }

  return (start: number, end: number): MaterialRange[] => {
    const ranges: MaterialRange[] = []
    if (Array.isArray(mesh.material)) {
      for (const group of mesh.geometry.groups) {
        const original = mesh.material[group.materialIndex ?? 0]
        if (!original || original.visible === false) continue
        appendRange(
          ranges,
          effectiveMaterial(original, ctx.scene.overrideMaterial),
          start,
          end,
          group.start,
          group.count,
        )
      }
    } else if (mesh.material.visible !== false) {
      appendRange(ranges, effectiveMaterial(mesh.material, ctx.scene.overrideMaterial), start, end)
    }
    return ranges
  }
}

function collectMeshInstances(
  ctx: ProjectionContext,
  mesh: Mesh,
  { batchedMesh, instancedMesh, skinnedMesh }: MeshKinds,
  available: number,
  drawStart: number,
  drawEnd: number,
  rangesFor: (start: number, end: number) => MaterialRange[],
): MeshProjectionInstance[] {
  const projectionInstances: MeshProjectionInstance[] = []
  if (batchedMesh) {
    if (Array.isArray(mesh.material)) {
      reportDiagnostic(ctx.diagnostics, ctx.options, {
        code: 'UNSUPPORTED_MATERIAL',
        message: 'BatchedMesh material arrays cannot be matched to source geometry groups.',
        object: mesh,
      })
      return []
    }
    const instanceMatrix = new Matrix4()
    let colorsAvailable: boolean | undefined
    let found = 0
    for (
      let instance = 0;
      instance < batchedMesh.maxInstanceCount && found < batchedMesh.instanceCount;
      instance += 1
    ) {
      let visible: boolean
      try {
        visible = batchedMesh.getVisibleAt(instance)
      } catch {
        continue
      }
      found += 1
      if (!visible) continue
      const geometryId = batchedMesh.getGeometryIdAt(instance)
      const range = batchedMesh.getGeometryRangeAt(geometryId)
      if (!range) continue
      const rangeStart = Math.max(0, Math.floor(range.start))
      const rangeEnd = Math.min(available, Math.floor(range.start + range.count))
      const ranges = rangesFor(rangeStart, rangeEnd)
      if (ranges.length === 0) continue
      batchedMesh.getMatrixAt(instance, instanceMatrix)
      let color: Color | undefined
      if (colorsAvailable !== false) {
        try {
          const instanceColor = new Color()
          batchedMesh.getColorAt(instance, instanceColor)
          colorsAvailable = true
          color = instanceColor
        } catch {
          // Three does not allocate the optional colour texture until setColorAt is used.
          colorsAvailable = false
        }
      }
      projectionInstances.push({
        color,
        ranges,
        worldMatrix: new Matrix4().multiplyMatrices(mesh.matrixWorld, instanceMatrix),
      })
    }
    return projectionInstances
  }

  if (instancedMesh) {
    const ranges = rangesFor(drawStart, drawEnd)
    if (ranges.length === 0) return []
    const instanceMatrix = new Matrix4()
    const morphTarget = instancedMesh.morphTexture ? new Mesh(mesh.geometry) : undefined
    for (let instance = 0; instance < instancedMesh.count; instance += 1) {
      instancedMesh.getMatrixAt(instance, instanceMatrix)
      let color: Color | undefined
      if (instancedMesh.instanceColor) {
        color = new Color()
        instancedMesh.getColorAt(instance, color)
      }
      let morph: MorphState | undefined
      if (morphTarget?.morphTargetInfluences) {
        instancedMesh.getMorphAt(instance, morphTarget)
        morph = positionMorphState(mesh.geometry, [...morphTarget.morphTargetInfluences])
      }
      projectionInstances.push({
        color,
        morph,
        ranges,
        worldMatrix: new Matrix4().multiplyMatrices(mesh.matrixWorld, instanceMatrix),
      })
    }
    return projectionInstances
  }

  const ranges = rangesFor(drawStart, drawEnd)
  if (ranges.length === 0) return []
  projectionInstances.push({
    morph: skinnedMesh ? undefined : positionMorphState(mesh.geometry, mesh.morphTargetInfluences),
    ranges,
    worldMatrix: mesh.matrixWorld,
  })
  return projectionInstances
}

function projectBasicMesh(
  ctx: ProjectionContext,
  mesh: Mesh,
  kinds: MeshKinds,
  groupOrder: number,
) {
  const { position, skinnedMesh } = kinds
  const vertexColor = mesh.geometry.getAttribute('color')
  const index = mesh.geometry.getIndex()
  const available = index?.count ?? position.count
  const drawStart = Math.max(0, Math.floor(mesh.geometry.drawRange.start))
  const requested = mesh.geometry.drawRange.count
  const drawEnd = Math.min(
    available,
    Number.isFinite(requested) ? Math.floor(drawStart + requested) : available,
  )
  const reportedMaterials = new Set<unknown>()
  const rangesFor = createMaterialRangeCollector(
    ctx,
    mesh,
    position,
    vertexColor,
    available,
    reportedMaterials,
  )
  const projectionInstances = collectMeshInstances(
    ctx,
    mesh,
    kinds,
    available,
    drawStart,
    drawEnd,
    rangesFor,
  )
  if (projectionInstances.length === 0) return

  let wireframeIndices: number[] | undefined
  const fillColor = new Color()
  const skinnedPosition = new Vector3()

  for (const { color, morph, ranges, worldMatrix } of projectionInstances) {
    const mirrored = worldMatrix.determinant() < 0
    const vertexAt = (vertexIndex: number) => {
      if (skinnedMesh) {
        skinnedMesh.getVertexPosition(vertexIndex, skinnedPosition)
        return new Vector4(skinnedPosition.x, skinnedPosition.y, skinnedPosition.z, 1).applyMatrix4(
          worldMatrix,
        )
      }
      return localPosition(position, vertexIndex, morph).applyMatrix4(worldMatrix)
    }
    const vertex = (offset: number) => vertexAt(index ? index.getX(offset) : offset)

    for (const range of ranges) {
      const map = range.material.map
      if (map?.matrixAutoUpdate) map.updateMatrix()
      const textureCoordinate = map
        ? mesh.geometry.getAttribute(textureAttributeName(map))
        : undefined
      if (map && color && color.getHex() !== 0xffffff) {
        if (!reportedMaterials.has(range.material)) {
          reportedMaterials.add(range.material)
          reportDiagnostic(ctx.diagnostics, ctx.options, {
            code: 'UNSUPPORTED_MATERIAL',
            message: 'texture and instance-colour modulation is not projected yet',
            object: mesh,
          })
        }
        continue
      }
      fillColor.copy(range.material.color)
      if (color) fillColor.multiply(color)
      const fill = `#${fillColor.getHexString()}`
      const rangeFog = range.material.fog ? ctx.scene.fog : null
      const planes = (range.material.clippingPlanes ?? []) as readonly Plane[]

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
          const wireFrom = vertexAt(fromIndex)
          const wireTo = vertexAt(toIndex)
          const fromColor = range.material.vertexColors
            ? new Color(
                vertexColor?.getX(fromIndex) ?? 0,
                vertexColor?.getY(fromIndex) ?? 0,
                vertexColor?.getZ(fromIndex) ?? 0,
              ).multiply(fillColor)
            : fillColor
          const toColor = range.material.vertexColors
            ? new Color(
                vertexColor?.getX(toIndex) ?? 0,
                vertexColor?.getY(toIndex) ?? 0,
                vertexColor?.getZ(toIndex) ?? 0,
              ).multiply(fillColor)
            : fillColor
          const fromAlpha =
            range.material.vertexColors && vertexColor?.itemSize === 4
              ? portableVertexAlpha(vertexColor, fromIndex)
              : undefined
          const toAlpha =
            range.material.vertexColors && vertexColor?.itemSize === 4
              ? portableVertexAlpha(vertexColor, toIndex)
              : undefined
          emitClippedLineSegment(ctx, {
            object: mesh,
            groupOrder,
            material: range.material,
            planes,
            clipIntersection: range.material.clipIntersection,
            segmentFrom: wireFrom,
            segmentTo: wireTo,
            strokeWidth,
            solidStroke: fill,
            gradient:
              range.material.vertexColors || rangeFog
                ? {
                    colorFrom: wireFrom,
                    colorTo: wireTo,
                    fromColor,
                    toColor,
                    fromAlpha,
                    toAlpha,
                    fog: rangeFog,
                    allowBoundedStops: true,
                  }
                : undefined,
          })
        }
        continue
      }

      for (let offset = range.start; offset + 2 < range.end; offset += 3) {
        const sourceVertices = [vertex(offset), vertex(offset + 1), vertex(offset + 2)]
        const coloured = (range.material.vertexColors && vertexColor) || rangeFog
        const textured = map && textureCoordinate
        const materialPolygons = textured
          ? clippedMaterialTexturedPolygons(
              sourceVertices.map((worldPos, indexInTriangle) => {
                const sourceOffset = offset + indexInTriangle
                const vertexIndex = index ? index.getX(sourceOffset) : sourceOffset
                return {
                  position: worldPos,
                  texture: portableTextureCoordinate(
                    map,
                    textureCoordinate,
                    vertexIndex,
                  ) as Vector2,
                }
              }),
              planes,
              range.material.clipIntersection,
            )
          : coloured
            ? clippedMaterialColouredPolygons(
                sourceVertices.map((worldPos, indexInTriangle) => {
                  const sourceOffset = offset + indexInTriangle
                  const vertexIndex = index ? index.getX(sourceOffset) : sourceOffset
                  const vertexFill = range.material.vertexColors
                    ? new Color()
                        .setRGB(
                          vertexColor?.getX(vertexIndex) ?? 0,
                          vertexColor?.getY(vertexIndex) ?? 0,
                          vertexColor?.getZ(vertexIndex) ?? 0,
                        )
                        .multiply(fillColor)
                    : fillColor
                  return {
                    alpha:
                      range.material.vertexColors && vertexColor?.itemSize === 4
                        ? portableVertexAlpha(vertexColor, vertexIndex)
                        : undefined,
                    color: vertexFill.clone(),
                    position: worldPos,
                  }
                }),
                planes,
                range.material.clipIntersection,
              )
            : clippedMaterialPolygons(sourceVertices, planes, range.material.clipIntersection)

        for (const materialPolygon of materialPolygons) {
          const polygon = textured
            ? clippedTexturedPolygon(
                (materialPolygon as TexturedVertex[]).map(({ position: worldPos, texture }) => ({
                  position: worldPos.clone().applyMatrix4(ctx.viewProjection),
                  texture,
                })),
              )
            : coloured
              ? clippedColouredPolygon(
                  (materialPolygon as ColouredVertex[]).map(
                    ({ alpha, color: vertexCol, position: worldPos }) => {
                      const viewDepth = -worldPos
                        .clone()
                        .applyMatrix4(ctx.camera.matrixWorldInverse).z
                      return {
                        alpha,
                        color: vertexCol,
                        position: worldPos.clone().applyMatrix4(ctx.viewProjection),
                        viewDepth,
                      }
                    },
                  ),
                )
              : clippedPolygon(
                  (materialPolygon as Vector4[]).map((point) =>
                    point.applyMatrix4(ctx.viewProjection),
                  ),
                )
          if (polygon.length < 3) continue
          for (let fan = 1; fan + 1 < polygon.length; fan += 1) {
            const first = polygon[0]
            const second = polygon[fan]
            const third = polygon[fan + 1]
            if (!first || !second || !third) continue
            const clipTriangle = [first, second, third] as const
            const points = clipTriangle.map((point) =>
              projectedPoint(
                textured || coloured
                  ? (point as TexturedVertex | ColouredVertex).position
                  : (point as Vector4),
                ctx.options.width,
                ctx.options.height,
              ),
            )
            if (points.some((point) => point === undefined)) continue
            const projected = points as { x: number; y: number; z: number }[]
            const area = signedArea(projected) * (mirrored ? -1 : 1)
            if (area === 0) continue
            const side = range.material.side
            if (side !== DoubleSide && (side === BackSide ? area < 0 : area > 0)) continue
            const path = `M ${printable(projected[0]?.x ?? 0)} ${printable(projected[0]?.y ?? 0)} L ${printable(projected[1]?.x ?? 0)} ${printable(projected[1]?.y ?? 0)} L ${printable(projected[2]?.x ?? 0)} ${printable(projected[2]?.y ?? 0)} Z`
            ctx.primitives.push({
              depth: projected.reduce((sum, point) => sum + point.z, 0) / 3,
              groupOrder,
              object: mesh,
              order: ctx.nextOrder(),
              renderOrder: mesh.renderOrder,
              transparent: range.material.transparent,
              node: textured
                ? {
                    kind: 'triangle-mesh',
                    props: {
                      texture: canvasTextureProps(
                        map,
                        clipTriangle.map((point) => {
                          const coordinate = (point as TexturedVertex).texture
                          return { x: coordinate.x, y: coordinate.y }
                        }),
                        range.material.color,
                      ),
                      vertices: projected.map(({ x, y }) => ({ x, y })),
                      ...projectedOpacityProps(range.material),
                    },
                  }
                : coloured
                  ? {
                      kind: 'triangle-mesh',
                      props: {
                        colors: clipTriangle.map((point) =>
                          canvasVertexColor(
                            foggedColorAtDepth(
                              (point as ColouredVertex).color,
                              rangeFog,
                              (point as ColouredVertex).viewDepth ?? 0,
                            ),
                            (point as ColouredVertex).alpha,
                          ),
                        ),
                        vertices: projected.map(({ x, y }) => ({ x, y })),
                        ...projectedOpacityProps(range.material),
                      },
                    }
                  : {
                      kind: 'path',
                      props: { path, fill, ...projectedOpacityProps(range.material) },
                    },
            })
          }
        }
      }
    }
  }
}
